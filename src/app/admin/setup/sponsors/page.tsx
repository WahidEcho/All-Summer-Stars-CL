'use client';

/**
 * Setup → Sponsors.
 *
 * The ticker is the one place on the broadcast where somebody else's brand is
 * on our canvas, so the rules are strict and stated on screen: every logo keeps
 * its ORIGINAL colours, and no mark is ever larger than the players.
 *
 * The running order is edited here with up/down controls rather than a number
 * box — an operator reordering six sponsors under time pressure should not have
 * to think in `ticker_order` integers — and the real `SponsorTicker` is
 * rendered live underneath, from the unsaved draft, so what they are about to
 * publish is what they are looking at.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';

import { updateSponsor } from '@/lib/actions';
import { getAllSponsors, getEventId } from '@/lib/data/queries';
import type { Db } from '@/lib/event';
import { newIdempotencyKey, useDeviceId } from '@/lib/hooks/useDeviceId';
import { supabase } from '@/lib/supabase/client';
import type { SponsorRow } from '@/lib/types';
import { SponsorTicker } from '@/components/brand';
import { StatusPill } from '@/components/ui';
import {
  AdminButton,
  Callout,
  EmptyState,
  Field,
  FieldGrid,
  PageHeader,
  Panel,
  SaveBar,
  SelectInput,
  TextInput,
  Toggle,
  UploadField,
} from '@/components/admin';

type Tier = SponsorRow['tier'];

const TIERS: Array<{ value: Tier; label: string; blurb: string }> = [
  { value: 'host', label: 'Host', blurb: 'The venue and its owner — the event happens on their ground.' },
  { value: 'partner', label: 'Partner', blurb: 'Commercial partners of the competition.' },
  { value: 'operator', label: 'Operator', blurb: 'The company running the sport on the day.' },
  { value: 'sponsor', label: 'Sponsor', blurb: 'Supporting brands.' },
  { value: 'technology', label: 'Technology', blurb: 'The platform behind the scoring and the screens.' },
];

const TIER_LABEL: Record<Tier, string> = {
  host: 'HOST',
  partner: 'PARTNER',
  operator: 'OPERATOR',
  sponsor: 'SPONSOR',
  technology: 'TECHNOLOGY',
};

/** Only the fields this screen may change — the shape the diff is taken on. */
interface Editable {
  name: string;
  tier: Tier;
  logo_url: string | null;
  website_url: string | null;
  ticker_order: number;
  active: boolean;
}

function editableOf(row: SponsorRow): Editable {
  return {
    name: row.name,
    tier: row.tier,
    logo_url: row.logo_url,
    website_url: row.website_url,
    ticker_order: row.ticker_order,
    active: row.active,
  };
}

function orderOf(rows: SponsorRow[]): SponsorRow[] {
  return [...rows].sort(
    (a, b) => a.ticker_order - b.ticker_order || a.name.localeCompare(b.name),
  );
}

/** Renumber the running order 1…n after a move, so the list has no gaps. */
function renumber(rows: SponsorRow[]): SponsorRow[] {
  return rows.map((row, index) => ({ ...row, ticker_order: index + 1 }));
}

function keyOf(rows: SponsorRow[]): string {
  return JSON.stringify(rows.map(editableOf));
}

export default function SponsorsPage() {
  const deviceId = useDeviceId();

  const [baseline, setBaseline] = useState<SponsorRow[] | null>(null);
  const [draft, setDraft] = useState<SponsorRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<
    { tone: 'ok' | 'error'; message: string; at: number } | null
  >(null);

  const say = useCallback((tone: 'ok' | 'error', message: string) => {
    setStatus({ tone, message, at: Date.now() });
  }, []);

  /**
   * Read the list. Hidden sponsors have to come back too — this screen is
   * where they get switched on again.
   */
  const fetchRows = useCallback(async (): Promise<SponsorRow[]> => {
    const db = supabase() as unknown as Db;
    const eventId = await getEventId(db);
    return orderOf(await getAllSponsors(db, eventId));
  }, []);

  /** Read, then seed both the draft and the baseline it is diffed against. */
  const reload = useCallback(async (): Promise<boolean> => {
    try {
      const rows = await fetchRows();
      setBaseline(rows);
      setDraft(rows);
      setLoadError(null);
      return true;
    } catch (cause) {
      setLoadError(
        cause instanceof Error ? cause.message : 'The sponsor list could not be read.',
      );
      return false;
    } finally {
      setLoading(false);
    }
  }, [fetchRows]);

  // The first read, scheduled off the commit rather than run inside it, so the
  // paint is never blocked and a screen that unmounts immediately never fires
  // the request at all.
  useEffect(() => {
    const timer = setTimeout(() => void reload(), 0);
    return () => clearTimeout(timer);
  }, [reload]);

  const dirty = useMemo(
    () => baseline !== null && keyOf(baseline) !== keyOf(draft),
    [baseline, draft],
  );

  function patch(id: string, next: Partial<Editable>): void {
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, ...next } : row)));
  }

  function move(id: string, direction: -1 | 1): void {
    setDraft((rows) => {
      const index = rows.findIndex((row) => row.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= rows.length) return rows;
      const next = [...rows];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return renumber(next);
    });
  }

  async function save(): Promise<void> {
    if (!baseline) return;
    setPending(true);
    setStatus(null);
    try {
      let written = 0;

      for (const row of draft) {
        const before = baseline.find((b) => b.id === row.id);
        if (!before) continue;

        const now = editableOf(row);
        const then = editableOf(before);
        const changes: Partial<Editable> = {};
        for (const field of Object.keys(now) as Array<keyof Editable>) {
          if (now[field] !== then[field]) {
            // Narrowed field-by-field assignment keeps the patch typed.
            Object.assign(changes, { [field]: now[field] });
          }
        }
        if (Object.keys(changes).length === 0) continue;

        if (typeof changes.name === 'string' && changes.name.trim() === '') {
          say('error', 'A sponsor cannot have an empty name.');
          return;
        }

        const result = await updateSponsor({
          idempotencyKey: newIdempotencyKey('sponsor'),
          deviceId,
          sponsorId: row.id,
          patch: changes,
        });

        if (!result.ok) {
          say('error', `${row.name}: ${result.error}`);
          return;
        }
        written += 1;
      }

      await reload();
      say(
        'ok',
        written === 0
          ? 'Nothing had changed.'
          : `Saved ${written} ${written === 1 ? 'sponsor' : 'sponsors'}.`,
      );
    } catch (cause) {
      say('error', cause instanceof Error ? cause.message : 'The sponsor list did not save.');
    } finally {
      setPending(false);
    }
  }

  const activeCount = draft.filter((row) => row.active).length;

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        eyebrow="Setup"
        title="Sponsors"
        description="The permanent bottom strip on every broadcast surface. Set who appears, in what order, and check the crawl before it goes on the wall."
        actions={
          <StatusPill
            label={`${activeCount} OF ${draft.length} SHOWING`}
            tone={activeCount === 0 ? 'draw' : 'neutral'}
            size="sm"
            glyph={false}
          />
        }
      />

      <Callout tone="info" title="Sponsor logos keep their original colours">
        Never recolour, tint or monochrome a mark — the ticker composites white artboards away
        without touching a single brand colour. Marks are also never larger than the players: the
        strip sits under the action, not next to it.
      </Callout>

      {loadError ? (
        <Callout
          tone="danger"
          title="The sponsor list could not be read"
          actions={
            <AdminButton size="sm" onClick={() => void reload()}>
              Try again
            </AdminButton>
          }
        >
          {loadError}
        </Callout>
      ) : null}

      <Panel
        eyebrow="Live preview"
        title="The real ticker, from the list below"
        description="This is the same component the TV output and the public dashboard render, running on your unsaved draft. Hidden sponsors do not appear."
        flush
      >
        <div className="bg-surface-sunken px-4 py-6">
          <div className="ring-border-subtle overflow-hidden rounded-md ring-1">
            <SponsorTicker sponsors={draft} height={78} pauseOnHover />
          </div>
        </div>
        {activeCount === 0 ? (
          <div className="px-5 pb-5">
            <Callout tone="warning" title="No sponsor is showing">
              With nothing active the ticker falls back to the built-in running order rather than
              leaving an empty band on the broadcast. Switch at least one sponsor on.
            </Callout>
          </div>
        ) : null}
      </Panel>

      {loading && baseline === null ? (
        <Panel>
          <p className="text-text-muted text-[0.875rem]">Reading the sponsor list…</p>
        </Panel>
      ) : draft.length === 0 ? (
        <Panel>
          <EmptyState
            title="No sponsors on this event"
            description="Sponsor rows are created with the event seed. Run supabase/migrations/0002_seed_event.sql, then reload this screen."
          />
        </Panel>
      ) : (
        <div className="space-y-4">
          {draft.map((row, index) => (
            <Panel
              key={row.id}
              eyebrow={`Position ${index + 1} · ${TIER_LABEL[row.tier]}`}
              title={row.name || 'Untitled sponsor'}
              tone={row.active ? 'default' : 'danger'}
              actions={
                <div className="flex items-center gap-2">
                  {row.active ? null : <StatusPill label="HIDDEN" tone="pending" size="sm" />}
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    disabled={pending || index === 0}
                    onClick={() => move(row.id, -1)}
                    aria-label={`Move ${row.name} earlier in the ticker`}
                  >
                    ↑ Earlier
                  </AdminButton>
                  <AdminButton
                    size="sm"
                    variant="ghost"
                    disabled={pending || index === draft.length - 1}
                    onClick={() => move(row.id, 1)}
                    aria-label={`Move ${row.name} later in the ticker`}
                  >
                    ↓ Later
                  </AdminButton>
                </div>
              }
            >
              <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
                <UploadField
                  bucket="brand"
                  folder="sponsors"
                  label="Logo"
                  hint="SVG or PNG, in the brand's own colours. A white artboard is fine — the ticker removes it without altering the colours."
                  value={row.logo_url}
                  disabled={pending}
                  onUploaded={(url) => patch(row.id, { logo_url: url })}
                  onCleared={() => patch(row.id, { logo_url: null })}
                />

                <div className="space-y-4">
                  <FieldGrid columns={2}>
                    <Field label="Name" htmlFor={`name-${row.id}`} hint="As it should be read out.">
                      <TextInput
                        id={`name-${row.id}`}
                        value={row.name}
                        disabled={pending}
                        invalid={row.name.trim() === ''}
                        onChange={(event) => patch(row.id, { name: event.target.value })}
                      />
                    </Field>

                    <Field
                      label="Tier"
                      htmlFor={`tier-${row.id}`}
                      hint={TIERS.find((t) => t.value === row.tier)?.blurb}
                    >
                      <SelectInput
                        id={`tier-${row.id}`}
                        value={row.tier}
                        disabled={pending}
                        onChange={(event) =>
                          patch(row.id, { tier: event.target.value as Tier })
                        }
                      >
                        {TIERS.map((tier) => (
                          <option key={tier.value} value={tier.value}>
                            {tier.label}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>

                    <Field
                      label="Website"
                      htmlFor={`site-${row.id}`}
                      hint="Used on the public dashboard. Leave empty for none."
                      className="sm:col-span-2"
                    >
                      <TextInput
                        id={`site-${row.id}`}
                        type="url"
                        inputMode="url"
                        spellCheck={false}
                        placeholder="https://"
                        value={row.website_url ?? ''}
                        disabled={pending}
                        onChange={(event) =>
                          patch(row.id, {
                            website_url:
                              event.target.value.trim() === '' ? null : event.target.value,
                          })
                        }
                      />
                    </Field>
                  </FieldGrid>

                  <Toggle
                    label="Show in the ticker"
                    description="Switching a sponsor off removes them from every surface immediately. Nothing is deleted."
                    checked={row.active}
                    disabled={pending}
                    onCheckedChange={(checked) => patch(row.id, { active: checked })}
                  />

                  <p className="text-text-muted text-[0.75rem] leading-body">
                    Running order {row.ticker_order} — set by the Earlier / Later controls above.
                  </p>
                </div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <Panel
        eyebrow="Note"
        title="Adding or removing a sponsor"
        description="This screen edits the sponsors the event was created with. A brand joining the bill is a change to the event record itself — add the row in the database, then set its logo, tier and position here. To take a brand off the broadcast, switch it off rather than deleting it, so the record of who was on the bill survives."
      />

      <SaveBar
        dirty={dirty}
        pending={pending}
        status={status}
        onSave={() => void save()}
        onReset={() => baseline && setDraft(baseline)}
        saveLabel="Save sponsors"
      />
    </div>
  );
}
