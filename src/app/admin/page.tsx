'use client';

/**
 * The control-center dashboard.
 *
 * One screen the operator can stand in front of and answer, without clicking:
 * is the event on air, which challenge and round are live, is this browser
 * actually talking to the server, who is holding the controls, and is anything
 * still unconfigured. Everything else on the console is one link away from here.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';
import { getRounds } from '@/lib/data/queries';
import { supabase } from '@/lib/supabase/client';
import { getControllerLeaseState } from '@/lib/actions';
import type { ControllerLeaseState } from '@/lib/actions';
import { useEventSnapshot } from '@/lib/hooks';
import type { ChallengeRow, RoundRow } from '@/lib/types';
import {
  ChallengeProgressRail,
  challengeRailItems,
  ProgressRail,
  Stat,
  StatusPill,
  TeamScoreStrip,
} from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  Callout,
  KeyValue,
  PageHeader,
  Panel,
  SectionHeading,
} from '@/components/admin';

const MECHANIC_LABEL: Record<ChallengeRow['mechanic'], string> = {
  mannequin_target: 'Mannequin target · 3 shots each',
  dribble_finish: 'Dribble & finish · 3 attempts each',
  long_range: 'Long-range shooting · 3 shots each',
  center_circle: 'Centre circle · 10 balls in 60s',
  final_match: 'Final match · 5v5, two halves',
};

const CHALLENGE_TONE: Record<
  ChallengeRow['status'],
  'live' | 'winner' | 'draw' | 'pending' | 'neutral'
> = {
  draft: 'pending',
  ready: 'neutral',
  locked: 'draw',
  live: 'live',
  completed: 'winner',
};

const CONNECTION_COPY: Record<
  'live' | 'reconnecting' | 'offline' | 'recovering',
  { label: string; tone: 'live' | 'winner' | 'draw' | 'pending'; detail: string }
> = {
  live: {
    label: 'CONNECTED',
    tone: 'winner',
    detail: 'Realtime is subscribed and the last read was confirmed by the server.',
  },
  recovering: {
    label: 'RECOVERING',
    tone: 'draw',
    detail: 'Service just came back. The board is catching up.',
  },
  reconnecting: {
    label: 'RECONNECTING',
    tone: 'draw',
    detail:
      'The realtime channel dropped. Scores on screen may be behind the server — the safety-net poll is still running.',
  },
  offline: {
    label: 'OFFLINE',
    tone: 'live',
    detail:
      'This browser has no route to the server. Nothing entered now will reach the database until it returns.',
  },
};

const SETUP_LINKS: Array<{ href: string; label: string; note: string }> = [
  { href: '/admin/setup/event', label: 'Event', note: 'Name, schedule, status, QR target' },
  { href: '/admin/setup/teams', label: 'Teams', note: 'Names, kit colours, crests' },
  { href: '/admin/setup/players', label: 'Players', note: 'Squad, cut-outs, framing' },
  { href: '/admin/setup/lineups', label: 'Lineups', note: 'Slots A1–A5 and B1–B5' },
  { href: '/admin/setup/scoring', label: 'Scoring profile', note: 'Every point value' },
  { href: '/admin/setup/sponsors', label: 'Sponsors', note: 'Ticker and logo wall' },
];

const RUN_LINKS: Array<{ href: string; label: string; note: string }> = [
  { href: '/admin/controller', label: 'Scoring controller', note: 'Enter attempts, goals and results' },
  { href: '/admin/display', label: 'Display control', note: 'Program and preview the wall' },
  { href: '/admin/ceremony', label: 'Ceremony', note: 'Podium and closing cues' },
  { href: '/admin/audit', label: 'Audit & exports', note: 'Every command, every reversal' },
];

function secondsUntil(iso: string, nowMs: number): number {
  return Math.round((Date.parse(iso) - nowMs) / 1000);
}

export default function AdminDashboardPage() {
  const { snapshot, loading, error, stale, updatedAt, connection, refresh } =
    useEventSnapshot({ pollMs: 15_000 });

  // Rounds for every challenge, so each card can state its own progress. The
  // snapshot only carries the current challenge's rounds.
  const [roundsByChallenge, setRoundsByChallenge] = useState<Record<string, RoundRow[]>>({});
  const revision = snapshot?.revision ?? null;
  const challengeIds = snapshot?.challenges.map((c) => c.id).join(',') ?? '';

  useEffect(() => {
    if (!challengeIds) return;
    let live = true;

    void (async () => {
      try {
        const db = supabase();
        const ids = challengeIds.split(',');
        const entries = await Promise.all(
          ids.map(async (id) => [id, await getRounds(db, id)] as const),
        );
        if (live) setRoundsByChallenge(Object.fromEntries(entries));
      } catch {
        // A failed read here only costs the per-challenge progress line; the
        // rest of the dashboard is unaffected.
      }
    })();

    return () => {
      live = false;
    };
  }, [challengeIds, revision]);

  // The controller lease is not part of the snapshot — it moves on its own
  // fifteen-second clock, so it gets its own poll.
  const [lease, setLease] = useState<ControllerLeaseState | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async (): Promise<void> => {
      try {
        const result = await getControllerLeaseState();
        if (live && result.ok) {
          setLease(result.data);
          setNow(Date.now());
        }
      } catch {
        // Leave the last known holder on screen rather than blanking it.
      }
      if (live) timer = setTimeout(() => void tick(), 5_000);
    };

    void tick();

    return () => {
      live = false;
      if (timer) clearTimeout(timer);
    };
  }, []);

  const leaseExpiresAt = lease?.lease?.expires_at ?? null;

  // The countdown only needs a per-second clock while somebody actually holds
  // the controls; otherwise the dashboard sits still.
  useEffect(() => {
    if (!leaseExpiresAt) return;
    const id = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [leaseExpiresAt]);

  const leaseHolder = lease?.lease ?? null;
  const leaseLive =
    leaseHolder !== null &&
    !leaseHolder.released_at &&
    Date.parse(leaseHolder.expires_at) > now;

  const checks = useMemo(() => {
    if (!snapshot) return [];

    const event = snapshot.event;
    const teams = snapshot.teams;
    const players = snapshot.players;

    const namedTeams = teams.filter((t) => t.name.trim().length > 0);
    const crested = teams.filter((t) => Boolean(t.crest_url));
    const withPhoto = players.filter((p) => Boolean(p.portrait_url || p.photo_url));
    const withTeam = players.filter((p) => Boolean(p.team_id));

    const lineupGaps = snapshot.challenges.filter((challenge) => {
      const slots = snapshot.allLineups.filter((s) => s.challenge_id === challenge.id);
      return slots.length === 0 || slots.some((s) => !s.player_id);
    });

    const activeSponsors = snapshot.sponsors.filter((s) => s.active);

    return [
      {
        id: 'event',
        href: '/admin/setup/event',
        label: 'Event card',
        ok: Boolean(event.name.trim() && event.event_date && event.start_time),
        detail:
          event.event_date && event.start_time
            ? `${event.name} — ${event.event_date}, ${event.timezone}`
            : 'Set the event date and kick-off time so countdowns work.',
      },
      {
        id: 'qr',
        href: '/admin/setup/event',
        label: 'QR target',
        ok: Boolean(event.qr_target_url && event.qr_target_url.startsWith('https://')),
        detail: event.qr_target_url
          ? event.qr_target_url
          : 'No public address set — every printed code points nowhere.',
      },
      {
        id: 'teams',
        href: '/admin/setup/teams',
        label: 'Teams',
        ok: namedTeams.length === 2 && crested.length === 2,
        detail:
          namedTeams.length === 2
            ? `${namedTeams.map((t) => t.name).join(' vs ')} · ${crested.length}/2 crests uploaded`
            : 'Both teams need a name and a kit colour.',
      },
      {
        id: 'players',
        href: '/admin/setup/players',
        label: 'Squad and cut-outs',
        ok: players.length >= 10 && withPhoto.length === players.length,
        detail: `${players.length} active · ${withPhoto.length} with a photo · ${withTeam.length} assigned to a team`,
      },
      {
        id: 'lineups',
        href: '/admin/setup/lineups',
        label: 'Lineups',
        ok: lineupGaps.length === 0 && snapshot.allLineups.length > 0,
        detail:
          lineupGaps.length === 0 && snapshot.allLineups.length > 0
            ? 'Every challenge has all ten slots filled.'
            : `${lineupGaps.length} challenge${lineupGaps.length === 1 ? '' : 's'} still have empty slots.`,
      },
      {
        id: 'scoring',
        href: '/admin/setup/scoring',
        label: 'Scoring profile',
        ok: snapshot.scoringProfile.is_locked,
        detail: snapshot.scoringProfile.is_locked
          ? `Version ${snapshot.scoringProfile.version}, locked.`
          : `Version ${snapshot.scoringProfile.version}, still editable. Lock it before the first whistle.`,
      },
      {
        id: 'sponsors',
        href: '/admin/setup/sponsors',
        label: 'Sponsors',
        ok: activeSponsors.length > 0,
        detail:
          activeSponsors.length > 0
            ? `${activeSponsors.length} active in the ticker.`
            : 'No active sponsor logos.',
      },
    ];
  }, [snapshot]);

  if (loading && !snapshot) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Control center" title="Dashboard" description="Reading the event…" />
        <Panel>
          <p className="text-text-muted text-[0.875rem]">Assembling the event snapshot.</p>
        </Panel>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Control center" title="Dashboard" />
        <Callout
          tone="danger"
          title="The event could not be read"
          actions={
            <AdminButton size="sm" onClick={() => void refresh()}>
              Try again
            </AdminButton>
          }
        >
          {error ?? 'No snapshot is available. Check the Supabase configuration.'}
        </Callout>
      </div>
    );
  }

  const { event, challenges, currentChallenge, currentRound, match, teamsByCode } = snapshot;
  const conn = CONNECTION_COPY[connection.status];
  const outstanding = checks.filter((c) => !c.ok);

  const liveHeadline = currentRound
    ? `Round ${currentRound.number}`
    : match && match.status !== 'pending'
      ? 'Final match'
      : 'Nothing live';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Control center"
        title={event.name}
        description={
          [event.subtitle, event.venue].filter(Boolean).join(' · ') || undefined
        }
        actions={
          <>
            <StatusPill
              label={event.status.toUpperCase()}
              tone={
                event.status === 'live'
                  ? 'live'
                  : event.status === 'completed' || event.status === 'locked'
                    ? 'winner'
                    : 'neutral'
              }
              pulse={event.status === 'live'}
            />
            <AdminButton size="sm" onClick={() => void refresh()}>
              Refresh
            </AdminButton>
          </>
        }
      />

      {error ? (
        <Callout tone="warning" title="The last read failed">
          {error} The board below is the last confirmed snapshot, not necessarily the current
          state.
        </Callout>
      ) : null}

      {stale && !error ? (
        <Callout tone="warning" title="This view may be behind the server">
          The realtime channel is not confirming changes. Use Refresh before trusting a score.
        </Callout>
      ) : null}

      {/* ---- On air ---- */}
      <Panel
        tone="accent"
        eyebrow="On air"
        title={
          currentChallenge
            ? `Challenge ${String(currentChallenge.number).padStart(2, '0')} — ${currentChallenge.title}`
            : 'No challenge selected'
        }
        description={currentChallenge ? MECHANIC_LABEL[currentChallenge.mechanic] : undefined}
        actions={
          <ButtonRow>
            <Link href="/admin/controller">
              <AdminButton variant="primary" size="sm">
                Open controller
              </AdminButton>
            </Link>
            <Link href="/admin/display">
              <AdminButton size="sm">Display control</AdminButton>
            </Link>
          </ButtonRow>
        }
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <Stat label="Live now" value={liveHeadline} size="sm" />
              {currentRound ? (
                <>
                  <Stat
                    label={teamsByCode.A?.short_name ?? teamsByCode.A?.name ?? 'Team A'}
                    value={currentRound.score_a}
                    size="sm"
                  />
                  <Stat
                    label={teamsByCode.B?.short_name ?? teamsByCode.B?.name ?? 'Team B'}
                    value={currentRound.score_b}
                    size="sm"
                  />
                  <StatusPill
                    label={currentRound.status.replace(/_/g, ' ').toUpperCase()}
                    tone={
                      currentRound.status === 'live'
                        ? 'live'
                        : currentRound.status === 'published' ||
                            currentRound.status === 'completed'
                          ? 'winner'
                          : 'pending'
                    }
                    size="sm"
                  />
                </>
              ) : match ? (
                <StatusPill
                  label={match.status.replace(/_/g, ' ').toUpperCase()}
                  tone={match.status === 'live' ? 'live' : 'pending'}
                  size="sm"
                />
              ) : null}
            </div>

            {currentRound ? (
              <dl className="grid gap-4 sm:grid-cols-3">
                <KeyValue
                  label="Side A"
                  value={
                    currentRound.player_a_id
                      ? snapshot.playersById[currentRound.player_a_id]?.display_name ??
                        snapshot.playersById[currentRound.player_a_id]?.full_name ??
                        'Unknown'
                      : 'Empty slot'
                  }
                />
                <KeyValue
                  label="Side B"
                  value={
                    currentRound.player_b_id
                      ? snapshot.playersById[currentRound.player_b_id]?.display_name ??
                        snapshot.playersById[currentRound.player_b_id]?.full_name ??
                        'Unknown'
                      : 'Empty slot'
                  }
                />
                <KeyValue
                  label="With the ball"
                  value={currentRound.active_side ? `Side ${currentRound.active_side}` : '—'}
                />
              </dl>
            ) : (
              <p className="text-text-secondary text-[0.8125rem] leading-body">
                No round is in flight. Open the controller to start the next one.
              </p>
            )}
          </div>

          <TeamScoreStrip
            teamA={{
              code: 'A',
              name: teamsByCode.A?.name ?? 'Team A',
              shortName: teamsByCode.A?.short_name ?? null,
              score: snapshot.teamPoints.A,
              color: teamsByCode.A?.color ?? null,
            }}
            teamB={{
              code: 'B',
              name: teamsByCode.B?.name ?? 'Team B',
              shortName: teamsByCode.B?.short_name ?? null,
              score: snapshot.teamPoints.B,
              color: teamsByCode.B?.color ?? null,
            }}
            unit="PTS"
            size="sm"
          />
        </div>
      </Panel>

      {/* ---- Challenge navigator ---- */}
      <Panel
        title="The five challenges"
        description="Where the competition stands, challenge by challenge."
      >
        <div className="space-y-5">
          <ChallengeProgressRail
            items={challengeRailItems(challenges, currentChallenge?.id ?? null)}
            label="Competition progress"
          />

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {challenges.map((challenge) => {
              const rounds = roundsByChallenge[challenge.id] ?? [];
              const done = rounds.filter(
                (r) => r.status === 'published' || r.status === 'completed',
              ).length;
              const isFinal = challenge.mechanic === 'final_match';
              const total = isFinal ? 1 : rounds.length || challenge.round_count || 5;
              const value = isFinal
                ? match && (match.status === 'completed' ? 1 : 0)
                  ? 1
                  : 0
                : done;
              const current = challenge.id === currentChallenge?.id;

              return (
                <Link
                  key={challenge.id}
                  href="/admin/controller"
                  className={cn(
                    'ring-border-subtle bg-surface-raised block rounded-md px-4 py-3.5 ring-1',
                    'transition-colors duration-[var(--dur-instant)] hover:bg-mist',
                    current && 'ring-aqua-300 ring-2',
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="u-eyebrow text-text-muted text-eyebrow">
                        Challenge {String(challenge.number).padStart(2, '0')}
                      </p>
                      <p className="text-ink truncate text-[0.9375rem] font-semibold">
                        {challenge.title}
                      </p>
                    </div>
                    <StatusPill
                      label={challenge.status.toUpperCase()}
                      tone={CHALLENGE_TONE[challenge.status]}
                      size="sm"
                    />
                  </div>

                  <p className="text-text-muted mt-1 text-[0.75rem] leading-body">
                    {MECHANIC_LABEL[challenge.mechanic]}
                  </p>

                  <ProgressRail
                    className="mt-3"
                    value={value}
                    max={Math.max(1, total)}
                    size="sm"
                    label={isFinal ? 'Match' : 'Rounds published'}
                    hint={isFinal ? (value ? 'Full time' : 'Not finished') : `${done}/${total}`}
                  />

                  {challenge.winner ? (
                    <p className="u-label text-winner mt-2 text-[0.625rem]">
                      {challenge.winner === 'draw'
                        ? 'DRAWN'
                        : `WON BY ${(teamsByCode[challenge.winner]?.name ?? `TEAM ${challenge.winner}`).toUpperCase()}`}
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* ---- Operations ---- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Connection health"
          actions={<StatusPill label={conn.label} tone={conn.tone} size="sm" />}
        >
          <div className="space-y-4">
            <p className="text-text-secondary text-[0.8125rem] leading-body">{conn.detail}</p>

            <dl className="grid gap-4 sm:grid-cols-2">
              <KeyValue
                label="Browser network"
                value={connection.online ? 'Online' : 'Offline'}
              />
              <KeyValue
                label="Snapshot read"
                value={updatedAt ? new Date(updatedAt).toLocaleTimeString() : '—'}
                mono
              />
              <KeyValue
                label="Server confirmed"
                value={
                  connection.lastConfirmedAt
                    ? new Date(connection.lastConfirmedAt).toLocaleTimeString()
                    : '—'
                }
                mono
              />
              <KeyValue
                label="Trouble since"
                value={
                  connection.troubleSince
                    ? new Date(connection.troubleSince).toLocaleTimeString()
                    : 'None'
                }
                mono
              />
            </dl>

            <ButtonRow>
              <AdminButton size="sm" onClick={() => connection.retry()}>
                Retry subscriptions
              </AdminButton>
              <AdminButton size="sm" variant="ghost" onClick={() => void refresh()}>
                Re-read now
              </AdminButton>
            </ButtonRow>
          </div>
        </Panel>

        <Panel
          title="Controller lease"
          description="Exactly one device may enter scores at a time."
          actions={
            <StatusPill
              label={leaseLive ? 'HELD' : 'FREE'}
              tone={leaseLive ? 'live' : 'pending'}
              size="sm"
            />
          }
        >
          <div className="space-y-4">
            {leaseLive && leaseHolder ? (
              <dl className="grid gap-4 sm:grid-cols-2">
                <KeyValue
                  label="Device"
                  value={leaseHolder.device_label ?? 'Unnamed device'}
                />
                <KeyValue label="Device id" value={leaseHolder.device_id} mono />
                <KeyValue
                  label="Held since"
                  value={new Date(leaseHolder.acquired_at).toLocaleTimeString()}
                  mono
                />
                <KeyValue
                  label="Expires in"
                  value={`${Math.max(0, secondsUntil(leaseHolder.expires_at, now))}s`}
                  mono
                />
              </dl>
            ) : (
              <p className="text-text-secondary text-[0.8125rem] leading-body">
                No device is holding the controls. The first tablet to open the scoring
                controller takes the lease.
              </p>
            )}

            {lease?.transferRequest ? (
              <Callout tone="warning" title="A device is asking to take over">
                {lease.transferRequest.deviceLabel ?? lease.transferRequest.deviceId} requested
                the controls
                {lease.transferRequest.reason ? ` — “${lease.transferRequest.reason}”` : ''}.
                Answer it from the scoring controller.
              </Callout>
            ) : null}

            <ButtonRow>
              <Link href="/admin/controller">
                <AdminButton size="sm" variant="primary">
                  Go to the controller
                </AdminButton>
              </Link>
            </ButtonRow>
          </div>
        </Panel>
      </div>

      {/* ---- Readiness ---- */}
      <Panel
        title="Setup readiness"
        description="Checked against the live database every time this page reads."
        actions={
          <StatusPill
            label={outstanding.length === 0 ? 'READY' : `${outstanding.length} OUTSTANDING`}
            tone={outstanding.length === 0 ? 'winner' : 'draw'}
            size="sm"
          />
        }
      >
        <ul className="divide-border-subtle divide-y">
          {checks.map((check) => (
            <li key={check.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <span
                aria-hidden
                className={cn(
                  'u-label inline-flex size-6 shrink-0 items-center justify-center rounded-pill text-[0.6875rem]',
                  check.ok ? 'bg-winner-soft text-winner' : 'bg-draw-soft text-draw',
                )}
              >
                {check.ok ? '✓' : '!'}
              </span>

              <span className="min-w-0 flex-1">
                <span className="text-ink block text-[0.875rem] font-medium">
                  {check.label}
                  <span className="u-sr-only">
                    {check.ok ? ' — ready' : ' — needs attention'}
                  </span>
                </span>
                <span className="text-text-muted block text-[0.75rem] leading-body break-words">
                  {check.detail}
                </span>
              </span>

              <Link
                href={check.href}
                className="u-label text-aqua-800 hover:text-aqua-900 shrink-0 text-eyebrow"
              >
                {check.ok ? 'Review' : 'Fix'} →
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      {/* ---- Quick links ---- */}
      <Panel title="Jump to">
        <div className="space-y-5">
          <div className="space-y-3">
            <SectionHeading hint="During the show">Run the show</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {RUN_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="ring-border-subtle hover:bg-mist block rounded-md px-4 py-3 ring-1"
                >
                  <span className="text-ink block text-[0.875rem] font-semibold">
                    {link.label}
                  </span>
                  <span className="text-text-muted block text-[0.75rem] leading-body">
                    {link.note}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeading hint="Before the whistle">Setup</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {SETUP_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="ring-border-subtle hover:bg-mist block rounded-md px-4 py-3 ring-1"
                >
                  <span className="text-ink block text-[0.875rem] font-semibold">
                    {link.label}
                  </span>
                  <span className="text-text-muted block text-[0.75rem] leading-body">
                    {link.note}
                  </span>
                </Link>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <SectionHeading hint="Opens in a new tab">Audience surfaces</SectionHeading>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { href: '/tv', label: 'TV output (program)' },
                { href: '/tv/preview', label: 'TV output (preview)' },
                { href: '/', label: 'Public dashboard' },
              ].map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  target="_blank"
                  rel="noreferrer"
                  className="ring-border-subtle hover:bg-mist flex items-center justify-between gap-2 rounded-md px-4 py-3 ring-1"
                >
                  <span className="text-ink text-[0.875rem] font-semibold">{link.label}</span>
                  <span aria-hidden className="text-text-muted text-[0.75rem]">
                    ↗
                  </span>
                </a>
              ))}
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}
