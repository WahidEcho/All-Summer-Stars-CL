'use client';

/**
 * Audit & exports — the paper trail.
 *
 * Two records sit behind this screen and they answer different questions.
 * `score_events` is the append-only command stream: every intent that reached
 * the server, with its idempotency key and the revision it produced. `audit_logs`
 * is the human record: who did what, to which entity, with the before and after
 * values and — for anything reversed, reopened or adjusted — the reason they
 * typed at the time.
 *
 * Both tables are staff-readable only, by design: they carry names, reasons and
 * device ids. This page reads them with the operator's own session, so a browser
 * without a staff sign-in correctly sees nothing rather than a redacted copy.
 *
 * The exports are the point of the screen. The organisers should be able to walk
 * out of the venue with the official results and the complete points ledger as
 * two CSV files, checkable line by line against the referee's sheet.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';
import {
  getAuditLog,
  getLedger,
  getRounds,
  getScoreEvents,
  type AuditLogRow,
  type ScoreEventRow,
} from '@/lib/data/queries';
import { supabase } from '@/lib/supabase/client';
import { computeChallengeResult } from '@/lib/scoring/engine';
import { useEventSnapshot } from '@/lib/hooks';
import type {
  ChallengeRow,
  LedgerRow,
  ResultOutcome,
  RoundRow,
  TeamCode,
} from '@/lib/types';
import { StatusPill } from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  Callout,
  Field,
  PageHeader,
  Panel,
  SectionHeading,
  SelectInput,
  Toggle,
  downloadCsv,
  stampedFilename,
  toCsv,
  type CsvColumn,
} from '@/components/admin';

const ROW_LIMIT = 300;

/** Actions that changed something already published, or already on the wall. */
const CORRECTION_PATTERN = /revers|reopen|adjust|unlock|override|delete|takeover|seiz/i;

// ---------------------------------------------------------------------------
// Challenge attribution
// ---------------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Every uuid-looking string anywhere inside a record row. */
function collectIds(value: unknown, out: Set<string>, depth = 0): void {
  if (depth > 6 || value === null || value === undefined) return;
  if (typeof value === 'string') {
    if (UUID_RE.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, out, depth + 1);
    return;
  }
  if (typeof value === 'object') {
    for (const item of Object.values(value as Record<string, unknown>)) {
      collectIds(item, out, depth + 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function clock(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

function timeOnly(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleTimeString();
}

/** A single audit value, printed rather than dumped. */
function printValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value === '' ? '(empty)' : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function actorOf(row: { actor_email?: string | null; actor_id?: string | null }): string {
  return row.actor_email ?? row.actor_id ?? 'system';
}

export default function AuditPage() {
  const { snapshot, error: snapshotError, refresh } = useEventSnapshot({ pollMs: 30_000 });
  const eventId = snapshot?.event.id ?? null;
  const revision = snapshot?.revision ?? 0;

  const [audit, setAudit] = useState<AuditLogRow[]>([]);
  const [events, setEvents] = useState<ScoreEventRow[]>([]);
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [readError, setReadError] = useState<string | null>(null);
  const [readAt, setReadAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState('all');
  const [actorFilter, setActorFilter] = useState('all');
  const [challengeFilter, setChallengeFilter] = useState('all');
  const [correctionsOnly, setCorrectionsOnly] = useState(false);
  const [showCommands, setShowCommands] = useState(false);

  const challengeIds = snapshot?.challenges.map((c) => c.id).join(',') ?? '';

  useEffect(() => {
    if (!eventId || !challengeIds) return;
    let live = true;

    void (async () => {
      try {
        const db = supabase();
        const [auditRows, eventRows, ledgerRows, roundLists] = await Promise.all([
          getAuditLog(db, eventId, ROW_LIMIT),
          getScoreEvents(db, eventId, { limit: ROW_LIMIT }),
          getLedger(db, eventId),
          Promise.all(challengeIds.split(',').map((id) => getRounds(db, id))),
        ]);
        if (!live) return;
        setAudit(auditRows);
        setEvents(eventRows);
        setLedger(ledgerRows);
        setRounds(roundLists.flat());
        setReadError(null);
        setReadAt(Date.now());
      } catch (cause) {
        if (!live) return;
        setReadError(
          cause instanceof Error ? cause.message : 'The record could not be read.',
        );
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, [eventId, challengeIds, revision, reloadKey]);

  // --- lookups -------------------------------------------------------------

  const challengeById = useMemo(() => {
    const map = new Map<string, ChallengeRow>();
    for (const challenge of snapshot?.challenges ?? []) map.set(challenge.id, challenge);
    return map;
  }, [snapshot]);

  const challengeOfId = useMemo(() => {
    const map = new Map<string, string>();
    for (const challenge of snapshot?.challenges ?? []) map.set(challenge.id, challenge.id);
    for (const round of rounds) map.set(round.id, round.challenge_id);
    if (snapshot?.match) map.set(snapshot.match.id, snapshot.match.challenge_id);
    if (snapshot?.shootout && snapshot.match) {
      map.set(snapshot.shootout.id, snapshot.match.challenge_id);
    }
    for (const slot of snapshot?.allLineups ?? []) map.set(slot.id, slot.challenge_id);
    return map;
  }, [snapshot, rounds]);

  const attributeChallenge = useCallback(
    (...blobs: unknown[]): string | null => {
      const ids = new Set<string>();
      for (const blob of blobs) collectIds(blob, ids);
      for (const id of ids) {
        const challengeId = challengeOfId.get(id);
        if (challengeId) return challengeId;
      }
      return null;
    },
    [challengeOfId],
  );

  const teamName = useCallback(
    (code: TeamCode | ResultOutcome | null | undefined): string => {
      if (!code) return '—';
      if (code === 'draw') return 'Draw';
      return snapshot?.teamsByCode[code]?.name ?? `Team ${code}`;
    },
    [snapshot],
  );

  const playerName = useCallback(
    (id: string | null | undefined): string => {
      if (!id) return '—';
      const player = snapshot?.playersById[id];
      return player?.display_name ?? player?.full_name ?? id;
    },
    [snapshot],
  );

  // --- filtering -----------------------------------------------------------

  const decorated = useMemo(
    () =>
      audit.map((row) => ({
        row,
        challengeId: attributeChallenge(row.entity_id, row.before, row.after),
        correction: CORRECTION_PATTERN.test(row.action) || Boolean(row.reason),
      })),
    [audit, attributeChallenge],
  );

  const decoratedEvents = useMemo(
    () =>
      events.map((row) => ({
        row,
        challengeId: attributeChallenge(row.payload),
      })),
    [events, attributeChallenge],
  );

  const actionOptions = useMemo(
    () => [...new Set(audit.map((row) => row.action))].sort(),
    [audit],
  );
  const actorOptions = useMemo(
    () => [...new Set(audit.map((row) => actorOf(row)))].sort(),
    [audit],
  );

  const visibleAudit = useMemo(
    () =>
      decorated.filter((entry) => {
        if (actionFilter !== 'all' && entry.row.action !== actionFilter) return false;
        if (actorFilter !== 'all' && actorOf(entry.row) !== actorFilter) return false;
        if (challengeFilter !== 'all' && entry.challengeId !== challengeFilter) return false;
        if (correctionsOnly && !entry.correction) return false;
        return true;
      }),
    [decorated, actionFilter, actorFilter, challengeFilter, correctionsOnly],
  );

  const visibleEvents = useMemo(
    () =>
      decoratedEvents.filter((entry) => {
        if (actionFilter !== 'all' && entry.row.type !== actionFilter) return false;
        if (actorFilter !== 'all' && actorOf(entry.row) !== actorFilter) return false;
        if (challengeFilter !== 'all' && entry.challengeId !== challengeFilter) return false;
        return true;
      }),
    [decoratedEvents, actionFilter, actorFilter, challengeFilter],
  );

  const corrections = decorated.filter((entry) => entry.correction).length;

  // --- exports -------------------------------------------------------------

  interface ResultRow {
    level: string;
    challenge: string;
    title: string;
    round: string;
    sideA: string;
    sideB: string;
    scoreA: number | string;
    scoreB: number | string;
    winner: string;
    status: string;
    at: string;
    notes: string;
  }

  const resultRows = useMemo<ResultRow[]>(() => {
    if (!snapshot) return [];
    const out: ResultRow[] = [];

    for (const challenge of snapshot.challenges) {
      const challengeRounds = rounds
        .filter((round) => round.challenge_id === challenge.id)
        .sort((a, b) => a.number - b.number);

      if (challenge.mechanic !== 'final_match') {
        const rule =
          challenge.aggregation_rule === 'round_wins' ? 'round_wins' : 'total_points';
        const result = computeChallengeResult(challengeRounds, rule);

        out.push({
          level: 'Challenge',
          challenge: `C${challenge.number}`,
          title: challenge.title,
          round: '',
          sideA: teamName('A'),
          sideB: teamName('B'),
          scoreA: result.pointsA,
          scoreB: result.pointsB,
          winner: teamName(challenge.winner),
          status: challenge.status,
          at: challenge.completed_at ?? '',
          notes: `Aggregation ${rule}; round wins ${result.roundWinsA}–${result.roundWinsB}, ${result.draws} drawn`,
        });

        for (const round of challengeRounds) {
          out.push({
            level: 'Round',
            challenge: `C${challenge.number}`,
            title: challenge.title,
            round: String(round.number),
            sideA: playerName(round.player_a_id),
            sideB: playerName(round.player_b_id),
            scoreA: round.score_a,
            scoreB: round.score_b,
            winner: teamName(round.winner),
            status: round.status,
            at: round.published_at ?? round.completed_at ?? '',
            notes: '',
          });
        }
        continue;
      }

      const match = snapshot.match;
      out.push({
        level: 'Final match',
        challenge: `C${challenge.number}`,
        title: challenge.title,
        round: '',
        sideA: teamName('A'),
        sideB: teamName('B'),
        scoreA: match?.score_a ?? '',
        scoreB: match?.score_b ?? '',
        winner: teamName(match?.winner ?? challenge.winner),
        status: match?.status ?? challenge.status,
        at: match?.completed_at ?? challenge.completed_at ?? '',
        notes: match ? `Goal points mode ${match.goal_points_mode}` : 'No match row',
      });

      for (const goal of snapshot.goals) {
        out.push({
          level: 'Goal',
          challenge: `C${challenge.number}`,
          title: challenge.title,
          round: `H${goal.half}`,
          sideA: goal.team_code === 'A' ? playerName(goal.scorer_id) : '',
          sideB: goal.team_code === 'B' ? playerName(goal.scorer_id) : '',
          scoreA: '',
          scoreB: '',
          winner: teamName(goal.team_code),
          status: goal.status,
          at: goal.created_at,
          notes: `${goal.method}${goal.is_own_goal ? ' (own goal)' : ''} at ${Math.floor(
            goal.clock_ms / 60000,
          )}′`,
        });
      }

      if (snapshot.shootout) {
        out.push({
          level: 'Shootout',
          challenge: `C${challenge.number}`,
          title: challenge.title,
          round: '',
          sideA: teamName('A'),
          sideB: teamName('B'),
          scoreA: match?.penalty_score_a ?? '',
          scoreB: match?.penalty_score_b ?? '',
          winner: teamName(snapshot.shootout.winner),
          status: snapshot.shootout.status,
          at: snapshot.shootout.completed_at ?? '',
          notes: `${snapshot.penaltyAttempts.length} kicks taken`,
        });
      }
    }

    for (const player of snapshot.standings) {
      out.push({
        level: 'Standing',
        challenge: '',
        title: `Rank ${player.rank}${player.sharedRank ? ' (shared)' : ''}`,
        round: player.slotLabel ?? '',
        sideA: player.teamCode === 'A' ? player.display_name ?? player.full_name : '',
        sideB: player.teamCode === 'B' ? player.display_name ?? player.full_name : '',
        scoreA: player.teamCode === 'A' ? player.totalPoints : '',
        scoreB: player.teamCode === 'B' ? player.totalPoints : '',
        winner: '',
        status: 'final',
        at: '',
        notes: `regular ${player.regularPoints}, penalty ${player.penaltyPoints}`,
      });
    }

    return out;
  }, [snapshot, rounds, teamName, playerName]);

  function exportResults(): void {
    const columns: CsvColumn<ResultRow>[] = [
      { key: 'level', label: 'Level', value: (r) => r.level },
      { key: 'challenge', label: 'Challenge', value: (r) => r.challenge },
      { key: 'title', label: 'Title', value: (r) => r.title },
      { key: 'round', label: 'Round', value: (r) => r.round },
      { key: 'sideA', label: 'Side A', value: (r) => r.sideA },
      { key: 'sideB', label: 'Side B', value: (r) => r.sideB },
      { key: 'scoreA', label: 'Score A', value: (r) => r.scoreA },
      { key: 'scoreB', label: 'Score B', value: (r) => r.scoreB },
      { key: 'winner', label: 'Winner', value: (r) => r.winner },
      { key: 'status', label: 'Status', value: (r) => r.status },
      { key: 'at', label: 'Recorded at', value: (r) => r.at },
      { key: 'notes', label: 'Notes', value: (r) => r.notes },
    ];
    downloadCsv(stampedFilename('swanlake-official-results'), toCsv(resultRows, columns));
  }

  function exportLedger(): void {
    const columns: CsvColumn<LedgerRow>[] = [
      { key: 'created_at', label: 'Recorded at', value: (r) => r.created_at },
      { key: 'player', label: 'Player', value: (r) => playerName(r.player_id) },
      {
        key: 'team',
        label: 'Team',
        value: (r) => {
          const player = snapshot?.playersById[r.player_id];
          const team = snapshot?.teams.find((t) => t.id === (r.team_id ?? player?.team_id));
          return team?.name ?? '';
        },
      },
      {
        key: 'challenge',
        label: 'Challenge',
        value: (r) => {
          const challenge = r.challenge_id ? challengeById.get(r.challenge_id) : undefined;
          return challenge ? `C${challenge.number} ${challenge.title}` : '';
        },
      },
      { key: 'entry_type', label: 'Entry type', value: (r) => r.entry_type },
      { key: 'points', label: 'Points', value: (r) => r.points },
      { key: 'status', label: 'Status', value: (r) => r.status },
      { key: 'reason', label: 'Reason', value: (r) => r.reason ?? '' },
      { key: 'reverses_id', label: 'Reverses entry', value: (r) => r.reverses_id ?? '' },
      { key: 'source_ref', label: 'Source', value: (r) => r.source_ref ?? '' },
      { key: 'profile_version', label: 'Profile version', value: (r) => r.profile_version },
      { key: 'round_id', label: 'Round id', value: (r) => r.round_id ?? '' },
      { key: 'match_id', label: 'Match id', value: (r) => r.match_id ?? '' },
      { key: 'created_by', label: 'Recorded by', value: (r) => r.created_by ?? 'system' },
      { key: 'id', label: 'Ledger id', value: (r) => r.id },
    ];
    downloadCsv(stampedFilename('swanlake-points-ledger'), toCsv(ledger, columns));
  }

  function exportAudit(): void {
    const columns: CsvColumn<(typeof visibleAudit)[number]>[] = [
      { key: 'created_at', label: 'At', value: (e) => e.row.created_at },
      { key: 'action', label: 'Action', value: (e) => e.row.action },
      { key: 'actor', label: 'Actor', value: (e) => actorOf(e.row) },
      { key: 'device', label: 'Device', value: (e) => e.row.device_id ?? '' },
      { key: 'entity_type', label: 'Entity type', value: (e) => e.row.entity_type ?? '' },
      { key: 'entity_id', label: 'Entity id', value: (e) => e.row.entity_id ?? '' },
      {
        key: 'challenge',
        label: 'Challenge',
        value: (e) => {
          const challenge = e.challengeId ? challengeById.get(e.challengeId) : undefined;
          return challenge ? `C${challenge.number}` : '';
        },
      },
      { key: 'reason', label: 'Reason', value: (e) => e.row.reason ?? '' },
      {
        key: 'before',
        label: 'Before',
        value: (e) => (e.row.before ? JSON.stringify(e.row.before) : ''),
      },
      {
        key: 'after',
        label: 'After',
        value: (e) => (e.row.after ? JSON.stringify(e.row.after) : ''),
      },
    ];
    downloadCsv(
      stampedFilename('swanlake-audit-log'),
      toCsv(visibleAudit, columns),
    );
  }

  // --- render --------------------------------------------------------------

  const filtersActive =
    actionFilter !== 'all' ||
    actorFilter !== 'all' ||
    challengeFilter !== 'all' ||
    correctionsOnly;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Record"
        title="Audit & exports"
        description="Every command that reached the server, every correction and the reason given for it, and the two files the organisers leave with."
        actions={
          <>
            <StatusPill
              label={readError ? 'READ FAILED' : loading ? 'READING' : 'READ OK'}
              tone={readError ? 'live' : loading ? 'pending' : 'winner'}
              size="sm"
            />
            <AdminButton
              size="sm"
              onClick={() => {
                setReloadKey((key) => key + 1);
                void refresh();
              }}
            >
              Reload
            </AdminButton>
          </>
        }
      />

      {snapshotError ? (
        <Callout tone="warning" title="The event could not be re-read">
          {snapshotError}
        </Callout>
      ) : null}

      {readError ? (
        <Callout tone="danger" title="The record could not be read">
          {readError}
          <br />
          <span className="mt-1 block">
            `audit_logs` and `score_events` are readable only by a signed-in staff account —
            that is correct, and it is why an open console cannot see them. Sign in from{' '}
            <Link
              href="/admin/login"
              className="underline underline-offset-2"
            >
              the login screen
            </Link>{' '}
            with a scorekeeper or admin account to read the trail.
          </span>
        </Callout>
      ) : null}

      {/* ---- Exports ---- */}
      <Panel
        tone="accent"
        title="Take the record with you"
        description="Generated in this browser from the rows on screen. Nothing leaves the venue network."
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="ring-border-subtle space-y-2 rounded-md px-4 py-4 ring-1">
              <SectionHeading hint={`${resultRows.length} rows`}>
                Official results
              </SectionHeading>
              <p className="text-text-muted text-[0.75rem] leading-body">
                Every challenge with its aggregated points and winner, every round with its two
                players and score, the final match with its goals and shootout, and the final
                individual standings.
              </p>
              <AdminButton
                variant="primary"
                disabled={resultRows.length === 0}
                onClick={exportResults}
              >
                Download results CSV
              </AdminButton>
            </div>

            <div className="ring-border-subtle space-y-2 rounded-md px-4 py-4 ring-1">
              <SectionHeading hint={`${ledger.length} entries`}>Points ledger</SectionHeading>
              <p className="text-text-muted text-[0.75rem] leading-body">
                Every point ever awarded, confirmed and reversed alike, with the entry type, the
                scoring-profile version it was computed under and the reason for any reversal.
              </p>
              <AdminButton
                variant="primary"
                disabled={ledger.length === 0}
                onClick={exportLedger}
              >
                Download ledger CSV
              </AdminButton>
            </div>
          </div>

          <div className="border-border-subtle border-t pt-4">
            <ButtonRow align="between">
              <p className="text-text-muted text-[0.75rem] leading-body">
                The audit log exports exactly what the filters below are showing —{' '}
                {visibleAudit.length} row{visibleAudit.length === 1 ? '' : 's'}.
              </p>
              <AdminButton disabled={visibleAudit.length === 0} onClick={exportAudit}>
                Download audit CSV
              </AdminButton>
            </ButtonRow>
          </div>
        </div>
      </Panel>

      {/* ---- Filters ---- */}
      <Panel
        title="Filters"
        description="Applied to both the audit log and the command stream."
        actions={
          <>
            <StatusPill
              label={`${corrections} CORRECTION${corrections === 1 ? '' : 'S'}`}
              tone={corrections > 0 ? 'draw' : 'neutral'}
              size="sm"
            />
            {filtersActive ? (
              <AdminButton
                size="sm"
                variant="ghost"
                onClick={() => {
                  setActionFilter('all');
                  setActorFilter('all');
                  setChallengeFilter('all');
                  setCorrectionsOnly(false);
                }}
              >
                Clear filters
              </AdminButton>
            ) : null}
          </>
        }
      >
        <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
          <Field label="Action" htmlFor="filter-action">
            <SelectInput
              id="filter-action"
              value={actionFilter}
              onChange={(event) => setActionFilter(event.target.value)}
            >
              <option value="all">All actions</option>
              {actionOptions.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Actor" htmlFor="filter-actor">
            <SelectInput
              id="filter-actor"
              value={actorFilter}
              onChange={(event) => setActorFilter(event.target.value)}
            >
              <option value="all">Everyone</option>
              {actorOptions.map((actor) => (
                <option key={actor} value={actor}>
                  {actor}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field
            label="Challenge"
            htmlFor="filter-challenge"
            hint="Matched through the round, match or lineup the row touched."
          >
            <SelectInput
              id="filter-challenge"
              value={challengeFilter}
              onChange={(event) => setChallengeFilter(event.target.value)}
            >
              <option value="all">All challenges</option>
              {(snapshot?.challenges ?? []).map((challenge) => (
                <option key={challenge.id} value={challenge.id}>
                  C{challenge.number} — {challenge.title}
                </option>
              ))}
            </SelectInput>
          </Field>

          <div className="space-y-4 self-end">
            <Toggle
              checked={correctionsOnly}
              onCheckedChange={setCorrectionsOnly}
              label="Corrections only"
              description="Reversals, reopenings, adjustments and anything with a written reason."
            />
            <Toggle
              checked={showCommands}
              onCheckedChange={setShowCommands}
              label="Command stream"
              description="Show the raw score_events rows as well."
            />
          </div>
        </div>
      </Panel>

      {/* ---- Audit log ---- */}
      <Panel
        title="Audit log"
        description="Newest first. Corrections carry the before and after values and the reason typed at the time."
        actions={
          <span className="text-text-muted text-[0.75rem]">
            {visibleAudit.length} of {audit.length}
            {readAt ? ` · read ${timeOnly(new Date(readAt).toISOString())}` : null}
          </span>
        }
        flush
      >
        {loading && audit.length === 0 ? (
          <p className="text-text-muted px-5 py-6 text-[0.875rem]">Reading the record…</p>
        ) : visibleAudit.length === 0 ? (
          <p className="text-text-muted px-5 py-6 text-[0.875rem]">
            {audit.length === 0
              ? 'No audit rows for this event yet.'
              : 'No rows match these filters.'}
          </p>
        ) : (
          <ul className="divide-border-subtle divide-y">
            {visibleAudit.map((entry) => {
              const row = entry.row;
              const challenge = entry.challengeId
                ? challengeById.get(entry.challengeId)
                : undefined;
              const keys = [
                ...new Set([
                  ...Object.keys(row.before ?? {}),
                  ...Object.keys(row.after ?? {}),
                ]),
              ];

              return (
                <li key={row.id} className="px-5 py-3.5">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="u-tabular font-numeral text-text-muted shrink-0 text-[0.75rem]">
                      {timeOnly(row.created_at)}
                    </span>
                    <span
                      className={cn(
                        'u-label rounded-sm px-2 py-0.5 text-[0.625rem]',
                        entry.correction
                          ? 'bg-live-soft text-live'
                          : 'bg-mist text-text-secondary',
                      )}
                    >
                      {row.action}
                    </span>
                    {challenge ? (
                      <span className="u-label text-aqua-800 text-[0.625rem]">
                        C{challenge.number}
                      </span>
                    ) : null}
                    <span className="text-text-secondary text-[0.8125rem]">
                      {actorOf(row)}
                    </span>
                    {row.entity_type ? (
                      <span className="text-text-muted text-[0.75rem]">
                        {row.entity_type}
                        {row.entity_id ? ` · ${row.entity_id.slice(0, 8)}` : ''}
                      </span>
                    ) : null}
                    <span className="text-text-muted ml-auto shrink-0 text-[0.75rem]">
                      {clock(row.created_at)}
                    </span>
                  </div>

                  {row.reason ? (
                    <p className="text-ink mt-1.5 text-[0.8125rem] leading-body">
                      <span className="u-label text-text-muted mr-2 text-[0.625rem]">
                        REASON
                      </span>
                      “{row.reason}”
                    </p>
                  ) : null}

                  {keys.length > 0 ? (
                    <div className="ring-border-subtle mt-2 overflow-x-auto rounded-md ring-1">
                      <table className="w-full min-w-[24rem] border-collapse text-left">
                        <caption className="u-sr-only">
                          Values before and after {row.action}
                        </caption>
                        <thead>
                          <tr className="bg-mist">
                            <th className="u-label text-text-muted text-eyebrow px-3 py-1.5">
                              Field
                            </th>
                            <th className="u-label text-text-muted text-eyebrow px-3 py-1.5">
                              Before
                            </th>
                            <th className="u-label text-text-muted text-eyebrow px-3 py-1.5">
                              After
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {keys.map((key) => {
                            const before = (row.before ?? {})[key];
                            const after = (row.after ?? {})[key];
                            const changed =
                              JSON.stringify(before ?? null) !== JSON.stringify(after ?? null);
                            return (
                              <tr key={key} className="border-border-subtle border-t">
                                <td className="text-text-secondary px-3 py-1.5 text-[0.75rem]">
                                  {key}
                                </td>
                                <td className="text-text-secondary px-3 py-1.5 text-[0.8125rem] break-words">
                                  {printValue(before)}
                                </td>
                                <td
                                  className={cn(
                                    'px-3 py-1.5 text-[0.8125rem] break-words',
                                    changed ? 'text-ink font-semibold' : 'text-text-secondary',
                                  )}
                                >
                                  {changed ? '→ ' : ''}
                                  {printValue(after)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      {/* ---- Command stream ---- */}
      {showCommands ? (
        <Panel
          title="Command stream"
          description="score_events — the append-only intent log, with the idempotency key that made each command safe to retry."
          actions={
            <span className="text-text-muted text-[0.75rem]">
              {visibleEvents.length} of {events.length}
            </span>
          }
          flush
        >
          {visibleEvents.length === 0 ? (
            <p className="text-text-muted px-5 py-6 text-[0.875rem]">
              {events.length === 0
                ? 'No commands recorded for this event yet.'
                : 'No commands match these filters.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[48rem] border-collapse text-left">
                <thead>
                  <tr className="bg-mist">
                    {['At', 'Type', 'Actor', 'Device', 'Revision', 'Idempotency key'].map(
                      (heading) => (
                        <th
                          key={heading}
                          className="u-label text-text-muted text-eyebrow px-4 py-2"
                        >
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {visibleEvents.map((entry) => (
                    <tr key={entry.row.id} className="border-border-subtle border-t">
                      <td className="u-tabular font-numeral text-text-secondary px-4 py-2 text-[0.75rem] whitespace-nowrap">
                        {timeOnly(entry.row.created_at)}
                      </td>
                      <td className="text-ink px-4 py-2 text-[0.8125rem]">{entry.row.type}</td>
                      <td className="text-text-secondary px-4 py-2 text-[0.8125rem]">
                        {actorOf(entry.row)}
                      </td>
                      <td className="text-text-muted px-4 py-2 text-[0.75rem]">
                        {entry.row.device_id ? entry.row.device_id.slice(0, 12) : '—'}
                      </td>
                      <td className="u-tabular font-numeral text-text-secondary px-4 py-2 text-[0.8125rem]">
                        {entry.row.new_revision ?? '—'}
                      </td>
                      <td className="text-text-muted px-4 py-2 text-[0.75rem] break-all">
                        {entry.row.idempotency_key ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      <p className="text-text-muted text-[0.75rem] leading-body">
        The audit log and command stream show the most recent {ROW_LIMIT} rows each. The
        exported results and ledger CSVs are complete — they are built from the ledger and the
        result tables, not from this window.
      </p>
    </div>
  );
}
