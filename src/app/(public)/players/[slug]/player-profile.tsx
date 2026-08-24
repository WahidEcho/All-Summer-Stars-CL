'use client';

import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useMemo } from 'react';

import { HeroPlayerCard, displayNameOf } from '@/components/player';
import { EmptyNote, Panel } from '@/components/public/Panel';
import {
  anySlotLabel,
  challengeEyebrow,
  challengeHeadline,
  rankLabel,
  teamLabel,
} from '@/components/public/format';
import { useSnapshot } from '@/components/public/snapshot-context';
import { usePlayerLedger } from '@/components/public/use-live-queries';
import { useRankMovement } from '@/components/public/use-rank-movement';
import { Stat, StatusPill } from '@/components/ui';
import { formatClock } from '@/lib/scoring/engine';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type {
  LedgerEntryType,
  LedgerRow,
  PlayerRow,
  RankedPlayer,
} from '@/lib/types';

/**
 * A player's own page.
 *
 * The standings row on this page is the same ranked record the leaderboard
 * uses, so the two can never disagree. The per-challenge breakdown underneath
 * is built from that player's confirmed ledger — the actual rows the scoring
 * engine wrote when each round was published — rather than from any figure
 * re-derived here.
 *
 * Penalty-tiebreak points are pulled out of the breakdown and given their own
 * line, because they are not part of a player's total: they exist only to
 * separate two players who finished level.
 */

const NO_STANDINGS: RankedPlayer[] = [];

/** Plain-English name for each kind of ledger row. */
const ENTRY_LABEL: Record<LedgerEntryType, string> = {
  attempt_points: 'Points scored',
  round_win_bonus: 'Round win bonus',
  round_draw_points: 'Round draw points',
  challenge_win_bonus: 'Challenge win bonus',
  match_goal_points: 'Goal points',
  match_win_bonus: 'Match win bonus',
  penalty_tiebreak_points: 'Penalty tiebreak',
  manual_adjustment: 'Adjustment',
};

export interface PlayerProfileProps {
  slug: string;
  /** Server-read row, so the page has a name even before the snapshot lands. */
  initialPlayer: PlayerRow | null;
}

export function PlayerProfile({ slug, initialPlayer }: PlayerProfileProps) {
  const snapshot = useSnapshot();
  const movements = useRankMovement(snapshot?.standings ?? NO_STANDINGS);

  const ranked = snapshot?.standings.find((p) => p.slug === slug) ?? null;
  const row = snapshot?.players.find((p) => p.slug === slug) ?? initialPlayer;
  const player = ranked ?? row;

  const ledger = usePlayerLedger(
    snapshot?.event.id ?? null,
    player?.id ?? null,
    snapshot?.fetchedAt ?? null,
  );

  const breakdown = useMemo(
    () => buildBreakdown(snapshot, ledger),
    [snapshot, ledger],
  );

  // The snapshot is the authority on who exists. Until it lands we may still
  // have the server-read row; only a loaded snapshot with no match is a 404.
  if (!player) {
    if (!snapshot) {
      return <EmptyNote>Connecting to the live event…</EmptyNote>;
    }
    notFound();
  }

  const name = displayNameOf(player);
  const teamCode = ranked?.teamCode ?? null;
  const team = teamCode ? snapshot?.teamsByCode[teamCode] : null;
  const teamName = teamCode ? teamLabel(team, teamCode) : null;
  const slot =
    ranked?.slotLabel ?? (snapshot ? anySlotLabel(snapshot, player.id) : null);

  const goals = snapshot ? goalsFor(snapshot, player.id) : [];
  const ownGoals = snapshot ? ownGoalsFor(snapshot, player.id) : [];

  const penaltyPoints = ranked?.penaltyPoints ?? 0;
  const totalPoints = ranked?.totalPoints ?? null;

  return (
    <div className="flex flex-col gap-6 py-2">
      <p className="u-label text-text-muted text-[0.625rem]">
        <Link href="/standings" className="hover:text-ink underline underline-offset-4">
          ← Back to the leaderboard
        </Link>
      </p>

      <div className="grid gap-6 md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)] md:items-start">
        {/* ------------------------------------------------------- hero */}
        <div className="mx-auto w-full max-w-[19rem] md:mx-0">
          <HeroPlayerCard
            player={player}
            teamColor={team?.color}
            teamCode={teamCode}
            teamName={teamName}
            slotLabel={slot}
            eyebrow="Player profile"
            totalPoints={totalPoints}
            totalLabel="TOTAL"
            rank={ranked?.rank ?? null}
            sharedRank={ranked?.sharedRank ?? false}
            previousRank={movements[player.id] ?? null}
            size="md"
            photoPriority
            status={
              ranked?.sharedRank ? (
                <StatusPill
                  tone="neutral"
                  variant="soft"
                  size="sm"
                  glyph={false}
                  label={rankLabel(ranked.rank, true)}
                />
              ) : null
            }
          />
        </div>

        {/* ------------------------------------------------------ facts */}
        <div className="flex flex-col gap-6">
          <Panel eyebrow="At a glance" title={name}>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <Stat
                label="Total points"
                value={totalPoints ?? '—'}
                suffix={totalPoints != null ? 'PTS' : undefined}
                size="md"
              />
              <Stat
                label="Current rank"
                value={rankLabel(ranked?.rank, ranked?.sharedRank ?? false)}
                sub={
                  ranked?.sharedRank ? 'Tied — shown as shared' : undefined
                }
                size="md"
                animate={false}
              />
              <Stat label="Team" value={teamName ?? '—'} size="sm" animate={false} />
              <Stat label="Slot" value={slot ?? '—'} size="sm" animate={false} />
            </div>

            {player.bio ? (
              <p className="text-text-secondary mt-4 text-sm leading-relaxed">
                {player.bio}
              </p>
            ) : null}
          </Panel>

          {/* -------------------------------------------- points ledger */}
          <Panel
            eyebrow="Where the points came from"
            title="Points by challenge"
            note="Confirmed entries only. Reversed entries are removed, not crossed out."
          >
            {breakdown.groups.length === 0 ? (
              <EmptyNote>
                No confirmed points yet. This fills in as each round is published.
              </EmptyNote>
            ) : (
              <ul className="flex flex-col gap-2.5">
                {breakdown.groups.map((group) => (
                  <li
                    key={group.key}
                    className="ring-border-subtle rounded-md px-3 py-2.5 ring-1"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <span className="u-eyebrow text-aqua-700 text-[0.5625rem]">
                          {group.eyebrow}
                        </span>
                        <span className="u-display text-ink text-[1.125rem] leading-none">
                          {group.title}
                        </span>
                      </div>
                      <span className="u-numeral u-tabular text-ink shrink-0 text-[1.375rem]">
                        {group.points > 0 ? `+${group.points}` : group.points}
                      </span>
                    </div>

                    <dl className="mt-2 flex flex-col gap-0.5">
                      {group.lines.map((line) => (
                        <div
                          key={line.type}
                          className="flex items-baseline justify-between gap-3"
                        >
                          <dt className="u-label text-text-muted text-[0.5625rem]">
                            {ENTRY_LABEL[line.type]}
                            {line.count > 1 ? ` ×${line.count}` : ''}
                          </dt>
                          <dd className="u-numeral u-tabular text-ink-soft text-[0.8125rem]">
                            {line.points > 0 ? `+${line.points}` : line.points}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </li>
                ))}
              </ul>
            )}

            <div className="border-border-subtle mt-4 flex items-baseline justify-between gap-3 border-t pt-3">
              <span className="u-label text-text-muted text-[0.625rem]">
                Regular points from the ledger
              </span>
              <span className="u-numeral u-tabular text-ink text-[1.25rem]">
                {breakdown.regular}
              </span>
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-3">
              <span className="u-label text-text-muted text-[0.625rem]">
                Penalty-tiebreak points
              </span>
              <span className="u-numeral u-tabular text-ink-soft text-[1.125rem]">
                {ranked ? penaltyPoints : breakdown.penalty}
              </span>
            </div>

            <p className="u-label text-text-muted mt-3 text-[0.625rem] leading-relaxed">
              Penalty-tiebreak points are listed on their own and only break a tie with
              another player on the same total. They are never added to the total above.
            </p>
          </Panel>

          {/* ------------------------------------------- final-match goals */}
          <Panel
            eyebrow="Final match"
            title="Goals"
            aside={
              <span className="u-numeral u-tabular text-ink text-[1.5rem]">
                {goals.length}
              </span>
            }
          >
            {goals.length === 0 && ownGoals.length === 0 ? (
              <EmptyNote>
                {snapshot?.match &&
                snapshot.match.status !== 'pending' &&
                snapshot.match.status !== 'ready'
                  ? 'No goals in the final match.'
                  : 'The final 5v5 has not been played yet.'}
              </EmptyNote>
            ) : (
              <ol className="flex flex-col gap-1.5">
                {goals.map((goal) => (
                  <li
                    key={goal.id}
                    className="border-border-subtle flex items-center gap-3 border-b pb-1.5 last:border-b-0 last:pb-0"
                  >
                    <span className="u-numeral u-tabular text-text-muted w-14 shrink-0 text-[0.8125rem]">
                      {formatClock(goal.clock_ms)}
                    </span>
                    <span className="u-display text-ink min-w-0 flex-1 truncate text-[1.0625rem] leading-none">
                      Goal · half {goal.half}
                    </span>
                    <span className="u-label text-text-muted shrink-0 text-[0.5625rem]">
                      {teamLabel(
                        snapshot?.teamsByCode[goal.team_code],
                        goal.team_code,
                      )}
                    </span>
                  </li>
                ))}

                {ownGoals.map((goal) => (
                  <li
                    key={goal.id}
                    className="border-border-subtle flex items-center gap-3 border-b pb-1.5 last:border-b-0 last:pb-0"
                  >
                    <span className="u-numeral u-tabular text-text-muted w-14 shrink-0 text-[0.8125rem]">
                      {formatClock(goal.clock_ms)}
                    </span>
                    <span className="u-display text-ink-soft min-w-0 flex-1 truncate text-[1.0625rem] leading-none">
                      Own goal · half {goal.half}
                    </span>
                    <span className="u-label text-text-muted shrink-0 text-[0.5625rem]">
                      CREDITED TO{' '}
                      {teamLabel(
                        snapshot?.teamsByCode[goal.team_code],
                        goal.team_code,
                      )}
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>

      <p className="u-label text-text-muted text-center text-[0.625rem]">
        <Link href="/results" className="hover:text-ink underline underline-offset-4">
          Every round result
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------- breakdown */

interface BreakdownLine {
  type: LedgerEntryType;
  points: number;
  count: number;
}

interface BreakdownGroup {
  key: string;
  eyebrow: string;
  title: string;
  points: number;
  lines: BreakdownLine[];
  /** Sort key — challenge number, or a large number for loose entries. */
  order: number;
}

interface Breakdown {
  groups: BreakdownGroup[];
  regular: number;
  penalty: number;
}

/**
 * Fold a player's confirmed ledger into one group per challenge.
 *
 * Penalty-tiebreak rows are removed from the groups entirely rather than being
 * shown and then subtracted — the point of the separation is that they were
 * never part of the total in the first place.
 */
function buildBreakdown(
  snapshot: EventSnapshot | null,
  ledger: LedgerRow[],
): Breakdown {
  const groups = new Map<string, BreakdownGroup>();
  let regular = 0;
  let penalty = 0;

  for (const entry of ledger) {
    if (entry.status !== 'confirmed') continue;

    if (entry.entry_type === 'penalty_tiebreak_points') {
      penalty += entry.points;
      continue;
    }

    regular += entry.points;

    const challenge = entry.challenge_id
      ? (snapshot?.challenges.find((c) => c.id === entry.challenge_id) ?? null)
      : null;

    const key = challenge?.id ?? entry.challenge_id ?? 'other';
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        eyebrow: challenge ? challengeEyebrow(challenge) : 'Elsewhere',
        title: challenge ? challengeHeadline(challenge) : 'Other points',
        points: 0,
        lines: [],
        order: challenge ? challenge.number : 99,
      };
      groups.set(key, group);
    }

    group.points += entry.points;
    const line = group.lines.find((l) => l.type === entry.entry_type);
    if (line) {
      line.points += entry.points;
      line.count += 1;
    } else {
      group.lines.push({ type: entry.entry_type, points: entry.points, count: 1 });
    }
  }

  return {
    groups: [...groups.values()].sort((a, b) => a.order - b.order),
    regular,
    penalty,
  };
}

function goalsFor(snapshot: EventSnapshot, playerId: string) {
  return snapshot.goals
    .filter(
      (goal) =>
        goal.status === 'confirmed' && !goal.is_own_goal && goal.scorer_id === playerId,
    )
    .sort((a, b) => a.clock_ms - b.clock_ms);
}

function ownGoalsFor(snapshot: EventSnapshot, playerId: string) {
  return snapshot.goals
    .filter(
      (goal) =>
        goal.status === 'confirmed' &&
        goal.is_own_goal &&
        goal.own_goal_by_player_id === playerId,
    )
    .sort((a, b) => a.clock_ms - b.clock_ms);
}

export default PlayerProfile;
