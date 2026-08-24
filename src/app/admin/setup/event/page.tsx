'use client';

/**
 * Setup → Event.
 *
 * The event card itself: what the show is called, when and where it happens,
 * what the holding screen says before the whistle, and — the one setting that
 * cannot be fixed after the doors open — where the QR code points.
 *
 * Times are entered the way an operator thinks about them ("18:00, Cairo") and
 * stored the way the database needs them (an absolute instant). The conversion
 * runs through `Intl`, both directions, and the resolved UTC instant is printed
 * back on screen so nobody has to trust it blindly.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toDataURL as qrToDataUrl } from 'qrcode';

import { EVENT_SLUG, SITE_URL } from '@/lib/event';
import { requireEvent } from '@/lib/data/queries';
import { supabase } from '@/lib/supabase/client';
import { updateEvent } from '@/lib/actions';
import { newIdempotencyKey, useDeviceId } from '@/lib/hooks';
import type { EventRow, EventStatus } from '@/lib/types';
import { EventQr } from '@/components/brand';
import { StatusPill } from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  Callout,
  Field,
  FieldGrid,
  KeyValue,
  PageHeader,
  Panel,
  SaveBar,
  SectionHeading,
  SegmentedControl,
  TextInput,
  Toggle,
  useActionRunner,
} from '@/components/admin';

// ---------------------------------------------------------------------------
// Time zone arithmetic
// ---------------------------------------------------------------------------

/** Offset of `timeZone` from UTC, in minutes, at a given instant. */
function offsetMinutesAt(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');

  // Some engines report midnight as hour 24 under hour12:false.
  const hour = read('hour') % 24;
  const asUtc = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    hour,
    read('minute'),
    read('second'),
  );

  return (asUtc - instant.getTime()) / 60_000;
}

/** True when the runtime recognises the zone. */
function isValidZone(timeZone: string): boolean {
  if (!timeZone.trim()) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

/**
 * `2026-08-27` + `18:00` in `Africa/Cairo` → the matching UTC instant.
 *
 * The offset is applied twice: the first pass uses the offset at the naive
 * instant, the second corrects it in case that guess landed on the far side of
 * a daylight-saving boundary.
 */
function zonedToIso(date: string, time: string, timeZone: string): string | null {
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  if (![y, m, d, hh, mm].every((n) => Number.isFinite(n))) return null;

  const naive = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  const firstPass = new Date(naive - offsetMinutesAt(new Date(naive), timeZone) * 60_000);
  const settled = new Date(naive - offsetMinutesAt(firstPass, timeZone) * 60_000);

  return Number.isFinite(settled.getTime()) ? settled.toISOString() : null;
}

/** The inverse: an absolute instant read back as wall-clock date and time. */
function isoToZoned(iso: string, timeZone: string): { date: string; time: string } | null {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return null;

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).formatToParts(instant);

    const read = (type: Intl.DateTimeFormatPartTypes): string =>
      parts.find((p) => p.type === type)?.value ?? '';

    const hour = String(Number(read('hour')) % 24).padStart(2, '0');
    return {
      date: `${read('year')}-${read('month')}-${read('day')}`,
      time: `${hour}:${read('minute')}`,
    };
  } catch {
    return null;
  }
}

/** `Wed 27 Aug 2026, 18:00 GMT+3` — the human read-back under the fields. */
function describeInstant(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone,
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const COMMON_ZONES = [
  'Africa/Cairo',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Athens',
  'Asia/Dubai',
  'Asia/Riyadh',
  'Asia/Istanbul',
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
];

// ---------------------------------------------------------------------------
// QR target validation
// ---------------------------------------------------------------------------

interface QrCheck {
  /** True when the string is a usable absolute http(s) URL. */
  usable: boolean;
  /** Normalised URL, or null. */
  href: string | null;
  /** Hard failures — these block saving. */
  problems: string[];
  /** Things that will still save but will embarrass you on the day. */
  warnings: string[];
}

const PREVIEW_HOST_PATTERNS: Array<{ test: RegExp; why: string }> = [
  {
    test: /(^|\.)ngrok(-free)?\.(io|app|dev)$/i,
    why: 'an ngrok tunnel, which dies with the terminal that opened it',
  },
  {
    test: /(^|\.)trycloudflare\.com$/i,
    why: 'a temporary Cloudflare tunnel',
  },
  {
    test: /(^|\.)loca\.lt$/i,
    why: 'a localtunnel address',
  },
  {
    test: /-git-[^.]+\.vercel\.app$/i,
    why: 'a Vercel branch preview, which changes on every push',
  },
  {
    test: /^[a-z0-9-]*-[a-z0-9]{8,}-[a-z0-9-]+\.vercel\.app$/i,
    why: 'a Vercel deployment preview, which is unique to one build',
  },
];

function checkQrTarget(raw: string): QrCheck {
  const value = raw.trim();
  if (!value) {
    return {
      usable: false,
      href: null,
      problems: [],
      warnings: [
        'No QR target set. The holding screen and every printed code have nothing to point at.',
      ],
    };
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return {
      usable: false,
      href: null,
      problems: [
        'That is not a complete web address. Include the scheme, e.g. https://scores.example.com.',
      ],
      warnings: [],
    };
  }

  const problems: string[] = [];
  const warnings: string[] = [];
  const host = url.hostname.toLowerCase();
  const local =
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host.endsWith('.local');

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    problems.push(`"${url.protocol}" is not a web address. Use https://.`);
  }

  if (local) {
    problems.push(
      'This points at a machine on the venue network. Phones in the crowd cannot reach it — use the public production address.',
    );
  } else if (url.protocol === 'http:') {
    warnings.push(
      'This is plain http. Some phone cameras refuse to open it. Use https:// for the production address.',
    );
  }

  for (const pattern of PREVIEW_HOST_PATTERNS) {
    if (pattern.test.test(host)) {
      warnings.push(
        `"${host}" looks like ${pattern.why}. A printed QR code lasts longer than a preview link — point it at the production domain.`,
      );
      break;
    }
  }

  if (url.search || url.hash) {
    warnings.push(
      'The address carries a query string or fragment. Keep the printed code as short and plain as possible.',
    );
  }

  return {
    usable: problems.length === 0,
    href: url.toString(),
    problems,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

interface EventDraft {
  name: string;
  subtitle: string;
  venue: string;
  eventDate: string;
  startLocal: string;
  timezone: string;
  status: EventStatus;
  qrTargetUrl: string;
  holdingStatus: string;
  holdingHeadline: string;
  showCountdown: boolean;
}

function draftOf(row: EventRow): EventDraft {
  const zoned = row.start_time ? isoToZoned(row.start_time, row.timezone) : null;

  return {
    name: row.name ?? '',
    subtitle: row.subtitle ?? '',
    venue: row.venue ?? '',
    eventDate: row.event_date ?? zoned?.date ?? '',
    startLocal: zoned?.time ?? '',
    timezone: row.timezone || 'Africa/Cairo',
    status: row.status,
    qrTargetUrl: row.qr_target_url ?? '',
    holdingStatus: row.holding_status ?? 'STARTING SOON',
    holdingHeadline: row.holding_headline ?? '',
    showCountdown: row.show_countdown,
  };
}

const STATUS_OPTIONS: Array<{ value: EventStatus; label: string; hint: string }> = [
  { value: 'draft', label: 'DRAFT', hint: 'Setup in progress. Public screens show the holding card.' },
  { value: 'ready', label: 'READY', hint: 'Everything configured, waiting for the whistle.' },
  { value: 'live', label: 'LIVE', hint: 'The show is on air.' },
  { value: 'completed', label: 'DONE', hint: 'Competition finished, results final.' },
  { value: 'locked', label: 'LOCKED', hint: 'No further scoring accepted.' },
  { value: 'archived', label: 'ARCHIVED', hint: 'Kept for the record only.' },
];

const STATUS_TONE: Record<EventStatus, 'live' | 'winner' | 'draw' | 'pending' | 'neutral'> = {
  draft: 'pending',
  ready: 'neutral',
  live: 'live',
  completed: 'winner',
  locked: 'winner',
  archived: 'pending',
};

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function EventSetupPage() {
  const deviceId = useDeviceId();
  const runner = useActionRunner();

  const [row, setRow] = useState<EventRow | null>(null);
  const [draft, setDraft] = useState<EventDraft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // One key per distinct set of changes: a retry after a dropped connection
  // replays the same intent rather than applying it twice.
  const saveKey = useRef<string | null>(null);

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const event = await requireEvent(supabase(), EVENT_SLUG);
        if (!live) return;
        setRow(event);
        setDraft(draftOf(event));
        setLoadError(null);
      } catch (cause) {
        if (!live) return;
        setLoadError(
          cause instanceof Error ? cause.message : 'The event could not be loaded.',
        );
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  const patch = useCallback(
    <K extends keyof EventDraft>(key: K, value: EventDraft[K]) => {
      saveKey.current = null;
      setDraft((current) => (current ? { ...current, [key]: value } : current));
    },
    [],
  );

  const baseline = useMemo(() => (row ? draftOf(row) : null), [row]);

  const dirty = useMemo(() => {
    if (!draft || !baseline) return false;
    return (Object.keys(draft) as Array<keyof EventDraft>).some(
      (key) => draft[key] !== baseline[key],
    );
  }, [draft, baseline]);

  const zoneValid = draft ? isValidZone(draft.timezone) : true;

  const resolvedStart = useMemo(() => {
    if (!draft || !zoneValid) return null;
    if (!draft.eventDate || !draft.startLocal) return null;
    return zonedToIso(draft.eventDate, draft.startLocal, draft.timezone);
  }, [draft, zoneValid]);

  const qr = useMemo(() => checkQrTarget(draft?.qrTargetUrl ?? ''), [draft?.qrTargetUrl]);

  // The rendered PNG is kept together with the address it was made from, so a
  // half-typed URL can never hand the operator a stale code to download.
  const [qrPng, setQrPng] = useState<{ href: string; data: string } | null>(null);

  useEffect(() => {
    if (!qr.usable || !qr.href) return;

    const href = qr.href;
    let live = true;

    void qrToDataUrl(href, {
      type: 'image/png',
      width: 1024,
      margin: 2,
      errorCorrectionLevel: 'Q',
      color: { dark: '#231F20', light: '#FFFFFF' },
    })
      .then((data) => {
        if (live) setQrPng({ href, data });
      })
      .catch(() => {
        // Nothing to download; the button stays disabled.
      });

    return () => {
      live = false;
    };
  }, [qr.usable, qr.href]);

  const qrPngData = qr.href && qrPng?.href === qr.href ? qrPng.data : null;

  const blockedReason = useMemo(() => {
    if (!draft) return null;
    if (!draft.name.trim()) return 'The event needs a name.';
    if (!zoneValid) return 'That time zone is not one this browser recognises.';
    if (draft.startLocal && !draft.eventDate) return 'A start time needs a date beside it.';
    if (qr.problems.length > 0) return 'The QR target is not a usable public address.';
    return null;
  }, [draft, zoneValid, qr.problems.length]);

  async function save(): Promise<void> {
    if (!draft || !row || blockedReason) return;

    const startIso =
      draft.eventDate && draft.startLocal
        ? zonedToIso(draft.eventDate, draft.startLocal, draft.timezone)
        : null;

    if (!saveKey.current) saveKey.current = newIdempotencyKey('event-update');

    const result = await runner.run(
      () =>
        updateEvent({
          idempotencyKey: saveKey.current as string,
          deviceId,
          patch: {
            name: draft.name.trim(),
            subtitle: draft.subtitle.trim() || null,
            venue: draft.venue.trim() || null,
            event_date: draft.eventDate || null,
            start_time: startIso,
            timezone: draft.timezone.trim(),
            status: draft.status,
            qr_target_url: draft.qrTargetUrl.trim() || null,
            holding_status: draft.holdingStatus.trim() || 'STARTING SOON',
            holding_headline: draft.holdingHeadline.trim() || null,
            show_countdown: draft.showCountdown,
          },
        }),
      { success: 'Event card saved.' },
    );

    if (result.ok) {
      saveKey.current = null;
      setRow(result.data);
      setDraft(draftOf(result.data));
    }
  }

  function reset(): void {
    if (!row) return;
    saveKey.current = null;
    runner.clear();
    setDraft(draftOf(row));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Event" description="Loading the event card…" />
        <Panel>
          <p className="text-text-muted text-[0.875rem]">Reading the event from the database.</p>
        </Panel>
      </div>
    );
  }

  if (loadError || !draft || !row) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Event" />
        <Callout tone="danger" title="The event could not be loaded">
          {loadError ?? 'No event row matched the configured slug.'}
        </Callout>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup"
        title="Event"
        description="Identity, schedule, on-air status and the QR code the whole crowd scans."
        actions={
          <StatusPill label={draft.status.toUpperCase()} tone={STATUS_TONE[draft.status]} />
        }
      />

      <Panel
        title="Identity"
        description="The name carried by the TV wall, the public dashboard and every printed sign."
      >
        <FieldGrid>
          <Field label="Event name" htmlFor="event-name" className="sm:col-span-2">
            <TextInput
              id="event-name"
              value={draft.name}
              invalid={!draft.name.trim()}
              maxLength={120}
              onChange={(e) => patch('name', e.target.value)}
            />
          </Field>

          <Field
            label="Subtitle"
            htmlFor="event-subtitle"
            hint="The line under the name — “Shores & Scores Challenge”."
          >
            <TextInput
              id="event-subtitle"
              value={draft.subtitle}
              maxLength={160}
              onChange={(e) => patch('subtitle', e.target.value)}
            />
          </Field>

          <Field label="Venue" htmlFor="event-venue">
            <TextInput
              id="event-venue"
              value={draft.venue}
              maxLength={160}
              onChange={(e) => patch('venue', e.target.value)}
            />
          </Field>
        </FieldGrid>
      </Panel>

      <Panel
        title="Date and kick-off"
        description="Enter the time as it will be read off a watch at the venue. It is stored as an absolute instant."
      >
        <FieldGrid columns={3}>
          <Field label="Event date" htmlFor="event-date">
            <TextInput
              id="event-date"
              type="date"
              value={draft.eventDate}
              onChange={(e) => patch('eventDate', e.target.value)}
            />
          </Field>

          <Field
            label="Start time"
            htmlFor="event-start"
            hint="Local wall-clock time at the venue."
            error={
              draft.startLocal && !draft.eventDate
                ? 'Set the date as well — a time on its own cannot be stored.'
                : null
            }
          >
            <TextInput
              id="event-start"
              type="time"
              value={draft.startLocal}
              onChange={(e) => patch('startLocal', e.target.value)}
            />
          </Field>

          <Field
            label="Time zone"
            htmlFor="event-tz"
            error={zoneValid ? null : 'This browser does not recognise that zone name.'}
            hint={zoneValid ? 'IANA zone name.' : undefined}
          >
            <TextInput
              id="event-tz"
              list="event-tz-options"
              value={draft.timezone}
              invalid={!zoneValid}
              spellCheck={false}
              maxLength={64}
              onChange={(e) => patch('timezone', e.target.value)}
            />
            <datalist id="event-tz-options">
              {Array.from(new Set([draft.timezone, ...COMMON_ZONES]))
                .filter(Boolean)
                .map((zone) => (
                  <option key={zone} value={zone} />
                ))}
            </datalist>
          </Field>
        </FieldGrid>

        <div className="border-border-subtle mt-5 border-t pt-4">
          {resolvedStart ? (
            <dl className="grid gap-4 sm:grid-cols-2">
              <KeyValue
                label="Reads as"
                value={describeInstant(resolvedStart, draft.timezone)}
              />
              <KeyValue label="Stored as (UTC)" value={resolvedStart} mono />
            </dl>
          ) : (
            <p className="text-text-muted text-[0.8125rem] leading-body">
              No kick-off instant yet. Countdowns and “starting soon” copy need both a date
              and a time.
            </p>
          )}
        </div>
      </Panel>

      <Panel
        title="On-air status and holding screen"
        description="What the wall shows before the first whistle, and how far along the event officially is."
      >
        <div className="space-y-5">
          <Field
            label="Event status"
            hint={STATUS_OPTIONS.find((o) => o.value === draft.status)?.hint}
          >
            <SegmentedControl<EventStatus>
              value={draft.status}
              onValueChange={(value) => patch('status', value)}
              options={STATUS_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
                hint: o.hint,
              }))}
              ariaLabel="Event status"
            />
          </Field>

          <FieldGrid>
            <Field
              label="Holding status"
              htmlFor="holding-status"
              hint="Short all-caps line on the holding card."
            >
              <TextInput
                id="holding-status"
                value={draft.holdingStatus}
                maxLength={80}
                onChange={(e) => patch('holdingStatus', e.target.value)}
              />
            </Field>

            <Field
              label="Holding headline"
              htmlFor="holding-headline"
              hint="The larger line under it. Leave empty to fall back to the event name."
            >
              <TextInput
                id="holding-headline"
                value={draft.holdingHeadline}
                maxLength={160}
                onChange={(e) => patch('holdingHeadline', e.target.value)}
              />
            </Field>
          </FieldGrid>

          <Toggle
            checked={draft.showCountdown}
            onCheckedChange={(value) => patch('showCountdown', value)}
            label="Countdown to kick-off"
            description={
              resolvedStart
                ? `Counts down to ${describeInstant(resolvedStart, draft.timezone)}.`
                : 'Needs a date and a start time before it can count down to anything.'
            }
            disabled={!resolvedStart && !draft.showCountdown}
          />
        </div>
      </Panel>

      <Panel
        tone="accent"
        title="QR target"
        description="Every printed code, every holding screen and every lower third sends the crowd here."
      >
        <div className="space-y-5">
          <Callout tone="warning" title="This must be the production address">
            A QR code printed on a banner cannot be edited at the venue. Point it at the live
            public domain — never at a preview deployment, a branch URL, a tunnel, or a laptop
            on the venue Wi-Fi.
          </Callout>

          <Field
            label="QR target URL"
            htmlFor="qr-url"
            hint="The public dashboard, normally the site root."
            error={qr.problems[0] ?? null}
            aside={
              <button
                type="button"
                className="text-aqua-800 hover:text-aqua-900 underline underline-offset-2"
                onClick={() => patch('qrTargetUrl', SITE_URL)}
              >
                Use {SITE_URL}
              </button>
            }
          >
            <TextInput
              id="qr-url"
              value={draft.qrTargetUrl}
              inputMode="url"
              spellCheck={false}
              maxLength={500}
              invalid={qr.problems.length > 0}
              placeholder="https://scores.example.com"
              onChange={(e) => patch('qrTargetUrl', e.target.value)}
            />
          </Field>

          {qr.problems.slice(1).map((problem) => (
            <Callout key={problem} tone="danger">
              {problem}
            </Callout>
          ))}

          {qr.warnings.map((warning) => (
            <Callout key={warning} tone="warning">
              {warning}
            </Callout>
          ))}

          <div className="border-border-subtle flex flex-wrap items-start gap-6 border-t pt-5">
            <div className="space-y-3">
              <SectionHeading hint="Scan it with a phone before you print anything">
                Test code
              </SectionHeading>

              {qr.usable && qr.href ? (
                <EventQr
                  url={qr.href}
                  size={132}
                  label="SCAN FOR LIVE SCORES"
                  showUrl
                  tone="plate"
                />
              ) : (
                <p className="text-text-muted max-w-xs text-[0.8125rem] leading-body">
                  A code appears here as soon as the address above is a usable public URL.
                </p>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-3">
              <ButtonRow>
                <AdminButton
                  variant="primary"
                  disabled={!qr.usable || !qr.href}
                  onClick={() => {
                    if (!qr.usable || !qr.href) {
                      runner.setError('Fix the QR target before opening it.');
                      return;
                    }
                    window.open(qr.href, '_blank', 'noopener,noreferrer');
                  }}
                >
                  Open target
                </AdminButton>

                {qrPngData ? (
                  <a
                    href={qrPngData}
                    download={`${EVENT_SLUG}-qr-test.png`}
                    className="u-label bg-surface-raised text-ink ring-border hover:bg-mist inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md px-4 text-[0.8125rem] ring-1"
                  >
                    Download test QR (PNG)
                  </a>
                ) : (
                  <AdminButton disabled>Download test QR (PNG)</AdminButton>
                )}
              </ButtonRow>

              <p className="text-text-muted max-w-md text-[0.75rem] leading-body">
                “Open target” checks the address and opens it in a new tab, so you can confirm
                the page it lands on is the one the crowd should see. The download is a
                1024&nbsp;px print-safe PNG of exactly the same code.
              </p>
            </div>
          </div>
        </div>
      </Panel>

      <Panel title="Record" description="Read-only. Useful when comparing against the audit log.">
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KeyValue label="Slug" value={row.slug} mono />
          <KeyValue label="Revision" value={row.revision} mono />
          <KeyValue label="Event id" value={row.id} mono />
          <KeyValue
            label="Last updated"
            value={new Date(row.updated_at).toLocaleString()}
          />
        </dl>
      </Panel>

      <SaveBar
        dirty={dirty}
        pending={runner.pending}
        status={runner.status}
        blockedReason={blockedReason}
        onSave={() => void save()}
        onReset={reset}
        saveLabel="Save event card"
      />
    </div>
  );
}
