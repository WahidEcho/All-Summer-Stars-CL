'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { displayNameOf } from '@/components/player';
import { ChallengeRail } from '@/components/public/ChallengeRail';
import { EmptyNote, Panel } from '@/components/public/Panel';
import {
  anySlotLabel,
  challengeEyebrow,
  challengeHeadline,
  configForChallenge,
  playerOf,
  roundPairingLabel,
  scoringSummary,
  teamLabel,
} from '@/components/public/format';
import { useSnapshot } from '@/components/public/snapshot-context';
import { useAllRounds } from '@/components/public/use-live-queries';
import { ScoreNumeral, StatusPill } from '@/components/ui';
import type { StatusPillTone } from '@/components/ui';
import {
  computeChallengeResult,
  describeGoalMode,
  formatClock,
} from '@/lib/scoring/engine';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type {
  BonusConfig,
  ChallengeRow,
  PlayerRow,
  RoundRow,
  TeamCode,
} from '@/lib/types';

/**
 * The results archive — every round that has actually finished, and every
 * pairing still to come, grouped by challenge.
 *
 * The snapshot only carries the *current* challenge's rounds, so this page
 * reads all of them itself through `useAllRounds` and re-reads whenever the
 * snapshot moves. That keeps the archive exactly as live as the score on the
 * live page without opening a second realtime channel.
 *
 * A round counts as a result only once it is `published` or `completed`.
 * Anything earlier is shown under its real state — live, or being verified —
 * and its figures are never called a result.
 */
export default function ResultsPage() {
  const snapshot = useSnapshot();
  const challengeIds = snapshot?.challenges.map((c) => c.id) ?? [];
  const rounds = useAllRounds(challengeIds, snapshot?.fetchedAt ?? null);

  if (!snapshot) {
    return <EmptyNote>Connecting to the live event…</EmptyNote>;
  }

  const { challenges } = snapshot;
  const played = rounds.filter(isOfficial).length;

  return (
    <div className="flex flex-col gap-6 py-2">
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="u-eyebrow text-aqua-700 text-eyebrow">The archive</p>
        <h1 className="u-display text-ink text-[2.25rem] leading-none sm:text-[3rem]">
          Results
        </h1>
        <p className="u-label text-text-muted text-[0.625rem]">
          {played} {played === 1 ? 'ROUND' : 'ROUNDS'} OFFICIAL
        </p>
      </header>

      <ChallengeRail size="sm" label="Competition progress" />

      {challenges.length === 0 ? (
        <EmptyNote>The competition schedule has not been published yet.</EmptyNote>
      ) : (
        challenges.map((challenge) => (
          <ChallengePanel
            key={challenge.id}
            snapshot={snapshot}
            challenge={challenge}
            rounds={rounds.filter((r) => r.challenge_id === challenge.id)}
          />
        ))
      )}

      <p className="u-label text-text-muted text-center text-[0.625rem]">
        <Link href="/standings" className="hover:text-ink underline underline-offset-4">
          See the individual leaderboard
        </Link>
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ state */

function isOfficial(round: RoundRow): boolean {
  return round.status === 'published' || round.status === 'completed';
}

function roundTone(round: RoundRow): { tone: StatusPillTone; label: string } {
  switch (round.status) {
    case 'published':
    case 'completed':
      return { tone: 'winner', label: 'OFFICIAL' };
    case 'live':
      return { tone: 'live', label: 'LIVE' };
    case 'awaiting_result':
      return { tone: 'draw', label: 'AWAITING RESULT' };
    case 'result_ready':
      return { tone: 'draw', label: 'PENDING CONFIRMATION' };
    default:
      return { tone: 'pending', label: 'UP NEXT' };
  }
}

/**
 * `isCurrent` is the challenge the event is sitting on, which is not the same
 * as one whose status is `live` — the show can be parked on a challenge that
 * has not been started yet. Calling that one "up next" rather than "live"
 * keeps this panel consistent with the progress rail without ever claiming a
 * challenge is being played when it isn't.
 */
function challengePill(
  challenge: ChallengeRow,
  isCurrent: boolean,
): { tone: StatusPillTone; label: string } {
  if (challenge.status === 'completed') return { tone: 'winner', label: 'COMPLETE' };
  if (challenge.status === 'live') return { tone: 'live', label: 'LIVE' };
  if (isCurrent) return { tone: 'pending', label: 'UP NEXT' };
  if (challenge.status === 'locked' || challenge.status === 'ready') {
    return { tone: 'pending', label: 'READY' };
  }
  return { tone: 'pending', label: 'NOT STARTED' };
}

/**
 * What a player actually banked for a published round: the points they scored
 * plus whatever win or draw bonus the event's scoring profile defines. Both
 * figures come from the profile — nothing here is a constant.
 */
function pointsEarned(round: RoundRow, side: TeamCode, bonuses: BonusConfig): number {
  const scored = side === 'A' ? round.score_a : round.score_b;
  if (round.winner === 'draw') return scored + bonuses.roundDrawPoints;
  if (round.winner === side) return scored + bonuses.roundWinBonus;
  return scored;
}

function nameOf(player: PlayerRow | null): string {
  return player ? displayNameOf(player) : 'TBC';
}

/* ------------------------------------------------------------- challenges */

function ChallengePanel({
  snapshot,
  challenge,
  rounds,
}: {
  snapshot: EventSnapshot;
  challenge: ChallengeRow;
  rounds: RoundRow[];
}) {
  const config = configForChallenge(snapshot.scoring, challenge.number);
  const pill = challengePill(challenge, snapshot.currentChallenge?.id === challenge.id);

  return (
    <Panel
      eyebrow={challengeEyebrow(challenge)}
      title={challengeHeadline(challenge)}
      aside={<StatusPill tone={pill.tone} size="sm" label={pill.label} pulse={pill.tone === 'live'} />}
      note={scoringSummary(config)}
    >
      {challenge.mechanic === 'final_match' ? (
        <FinalMatchResult snapshot={snapshot} />
      ) : (
        <RoundResults snapshot={snapshot} challenge={challenge} rounds={rounds} />
      )}
    </Panel>
  );
}

function RoundResults({
  snapshot,
  challenge,
  rounds,
}: {
  snapshot: EventSnapshot;
  challenge: ChallengeRow;
  rounds: RoundRow[];
}) {
  if (rounds.length === 0) {
    return <EmptyNote>The five pairings for this challenge are not drawn yet.</EmptyNote>;
  }

  const ordered = [...rounds].sort((a, b) => a.number - b.number);
  const finished = ordered.filter(isOfficial);
  const upcoming = ordered.filter((r) => !isOfficial(r));
  const bonuses = snapshot.scoring.bonuses;

  const aggregation =
    challenge.aggregation_rule === 'round_wins' ? 'round_wins' : 'total_points';
  const result = computeChallengeResult(
    finished.map((r) => ({ score_a: r.score_a, score_b: r.score_b, winner: r.winner })),
    aggregation,
  );

  const teamAName = teamLabel(snapshot.teamsByCode.A, 'A');
  const teamBName = teamLabel(snapshot.teamsByCode.B, 'B');

  return (
    <div className="flex flex-col gap-4">
      {finished.length > 0 ? (
        <ol className="flex flex-col gap-2.5">
          {finished.map((round) => (
            <li key={round.id}>
              <RoundCard
                snapshot={snapshot}
                challenge={challenge}
                round={round}
                bonuses={bonuses}
              />
            </li>
          ))}
        </ol>
      ) : (
        <EmptyNote>No round in this challenge has an official result yet.</EmptyNote>
      )}

      {finished.length > 0 ? (
        <div className="bg-surface-sunken flex flex-col gap-1 rounded-md px-4 py-3">
          <p className="u-label text-text-muted text-[0.5625rem]">
            {finished.length === challenge.round_count
              ? 'CHALLENGE TOTAL'
              : `AFTER ${finished.length} OF ${challenge.round_count} ROUNDS`}
          </p>
          <p className="u-numeral u-tabular text-ink text-[1.25rem]">
            {teamAName} {result.pointsA} — {result.pointsB} {teamBName}
          </p>
          <p className="u-label text-text-muted text-[0.5625rem]">
            ROUND WINS {result.roundWinsA}–{result.roundWinsB}
            {result.draws > 0 ? ` · ${result.draws} DRAWN` : ''}
            {aggregation === 'round_wins' ? ' · DECIDED ON ROUND WINS' : ''}
          </p>
          {challenge.status === 'completed' ? (
            <p className="u-label text-winner text-[0.5625rem]">
              {challenge.winner === 'draw' || result.winner === 'draw'
                ? 'CHALLENGE DRAWN'
                : `${(challenge.winner ?? result.winner) === 'A' ? teamAName : teamBName} WINS THIS CHALLENGE`}
              {bonuses.challengeWinBonus !== 0 &&
              (challenge.winner ?? result.winner) !== 'draw'
                ? ` · EACH PLAYER +${bonuses.challengeWinBonus} CHALLENGE BONUS`
                : ''}
            </p>
          ) : null}
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="u-label text-text-muted text-[0.5625rem]">
            {finished.length > 0 ? 'STILL TO COME' : 'PAIRINGS'}
          </p>
          <ul className="flex flex-col gap-1.5">
            {upcoming.map((round) => {
              const tone = roundTone(round);
              const playerA = playerOf(snapshot, round.player_a_id);
              const playerB = playerOf(snapshot, round.player_b_id);
              return (
                <li
                  key={round.id}
                  className="ring-border-subtle flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md px-3 py-2 ring-1"
                >
                  <span className="u-numeral u-tabular text-aqua-700 text-[0.875rem]">
                    {roundPairingLabel(snapshot, round, challenge.id)}
                  </span>
                  <span className="u-display text-ink min-w-0 flex-1 truncate text-[1rem] leading-none">
                    {nameOf(playerA)} <span className="text-text-muted">vs</span>{' '}
                    {nameOf(playerB)}
                  </span>
                  <StatusPill
                    tone={tone.tone}
                    size="sm"
                    label={tone.label}
                    pulse={tone.tone === 'live'}
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {finished.length > 0 ? (
        <p className="u-label text-text-muted text-[0.625rem] leading-relaxed">
          {`Points earned = the points a player scored in the round plus the bonus this event's scoring profile defines (win +${bonuses.roundWinBonus}, draw +${bonuses.roundDrawPoints} to both players).`}
        </p>
      ) : null}
    </div>
  );
}

function RoundCard({
  snapshot,
  challenge,
  round,
  bonuses,
}: {
  snapshot: EventSnapshot;
  challenge: ChallengeRow;
  round: RoundRow;
  bonuses: BonusConfig;
}) {
  const playerA = playerOf(snapshot, round.player_a_id);
  const playerB = playerOf(snapshot, round.player_b_id);
  const draw = round.winner === 'draw';
  const winnerPlayer = round.winner === 'A' ? playerA : round.winner === 'B' ? playerB : null;

  const earnedA = pointsEarned(round, 'A', bonuses);
  const earnedB = pointsEarned(round, 'B', bonuses);

  return (
    <article className="ring-border-subtle bg-surface-raised flex flex-col gap-3 rounded-md p-3 ring-1 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="u-label text-text-muted text-[0.5625rem]">
          ROUND {round.number} · {roundPairingLabel(snapshot, round, challenge.id)}
        </p>
        <StatusPill
          tone={draw ? 'draw' : 'winner'}
          size="sm"
          label={draw ? 'DRAW' : `${nameOf(winnerPlayer)} WINS`}
        />
      </div>

      {/*
        Two stacked rows rather than a left/score/right triptych: on a 375px
        phone the triptych squeezes both names into ~110px and truncates them,
        and a result nobody can read the names of is not a result.
      */}
      <div className="flex flex-col gap-2">
        <RoundSide
          snapshot={snapshot}
          player={playerA}
          side="A"
          score={round.score_a}
          earned={earnedA}
          won={round.winner === 'A'}
        />
        <RoundSide
          snapshot={snapshot}
          player={playerB}
          side="B"
          score={round.score_b}
          earned={earnedB}
          won={round.winner === 'B'}
        />
      </div>
    </article>
  );
}

function RoundSide({
  snapshot,
  player,
  side,
  score,
  earned,
  won,
}: {
  snapshot: EventSnapshot;
  player: PlayerRow | null;
  side: TeamCode;
  /** Points scored in the round itself. */
  score: number;
  /** Points banked — the round score plus any win or draw bonus. */
  earned: number;
  won: boolean;
}) {
  const team = snapshot.teamsByCode[side];
  const slot = player ? anySlotLabel(snapshot, player.id) : null;

  const identity = (
    <>
      <span
        className={`u-display truncate text-[1.25rem] leading-none sm:text-[1.5rem] ${
          won ? 'text-ink' : 'text-ink-soft'
        }`}
      >
        {nameOf(player)}
      </span>
      <span className="u-label text-text-muted flex items-center gap-1.5 text-[0.5625rem]">
        {slot ? <span>{slot}</span> : null}
        <span className="truncate">{teamLabel(team, side)}</span>
        {/* A glyph as well as the tint — the winning row never reads by colour alone. */}
        {won ? <span className="text-winner">✓ WON</span> : null}
      </span>
    </>
  );

  const identityClasses = 'flex min-w-0 flex-1 flex-col gap-1 items-start';

  return (
    <div
      className={`flex items-center gap-3 rounded-md px-2 py-1.5 ${
        won ? 'bg-winner-soft' : 'bg-surface-sunken'
      }`}
    >
      <span
        aria-hidden
        className="h-8 w-1 shrink-0 rounded-pill"
        style={{ background: team?.color ?? undefined }}
      />

      {player ? (
        <Link
          href={`/players/${player.slug}`}
          className={`${identityClasses} focus-visible:outline-focus rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-offset-2`}
        >
          {identity}
        </Link>
      ) : (
        <div className={identityClasses}>{identity}</div>
      )}

      <span className="flex shrink-0 flex-col items-end gap-0.5">
        <span className="u-numeral u-tabular text-ink text-[1.75rem] leading-none">
          {score}
        </span>
        <span className="u-label text-text-muted text-[0.5625rem]">SCORED</span>
      </span>

      <span className="border-border-subtle flex w-[4.5rem] shrink-0 flex-col items-end gap-0.5 border-l pl-3">
        <span className="u-numeral u-tabular text-ink text-[1.375rem] leading-none">
          {earned}
        </span>
        <span className="u-label text-text-muted text-[0.5625rem]">EARNED</span>
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ final match */

function FinalMatchResult({ snapshot }: { snapshot: EventSnapshot }) {
  const { match, goals, shootout, penaltyTotals, scoring } = snapshot;

  if (!match) {
    return <EmptyNote>The final 5v5 has not been set up yet.</EmptyNote>;
  }

  const teamAName = teamLabel(snapshot.teamsByCode.A, 'A');
  const teamBName = teamLabel(snapshot.teamsByCode.B, 'B');
  const confirmed = goals
    .filter((goal) => goal.status === 'confirmed')
    .sort((x, y) => x.clock_ms - y.clock_ms);

  const official = match.status === 'completed';
  const caption: string = official
    ? 'OFFICIAL FINAL SCORE'
    : match.status === 'live'
      ? 'LIVE SCORE — NOT FINAL'
      : match.status === 'halftime'
        ? 'SCORE AT HALF TIME'
        : match.status === 'penalties'
          ? 'LEVEL AFTER FULL TIME — PENALTIES IN PROGRESS'
          : match.status === 'awaiting_result' || match.status === 'result_ready'
            ? 'PROVISIONAL — RESULT BEING VERIFIED'
            : 'NOT STARTED';

  let outcome: ReactNode = null;
  if (official) {
    outcome =
      match.winner === 'draw' ? (
        <StatusPill tone="draw" size="sm" label="MATCH DRAWN" />
      ) : match.winner ? (
        <StatusPill
          tone="winner"
          size="sm"
          label={`${match.winner === 'A' ? teamAName : teamBName} WINS`}
        />
      ) : null;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-surface-sunken flex flex-col items-center gap-2 rounded-md px-4 py-4">
        {/* Both names and both figures on one line is wider than a phone at
            the full `md` step, so the figures step down below `sm`. */}
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-4">
          <span className="u-display text-ink-soft text-[0.875rem]">{teamAName}</span>
          <ScoreNumeral
            value={match.score_a}
            size="md"
            labelPlacement="none"
            animate={false}
            valueClassName="text-[2.25rem] sm:text-score-md"
          />
          <span aria-hidden className="u-display text-text-muted text-[1.25rem]">
            —
          </span>
          <ScoreNumeral
            value={match.score_b}
            size="md"
            labelPlacement="none"
            animate={false}
            valueClassName="text-[2.25rem] sm:text-score-md"
          />
          <span className="u-display text-ink-soft text-[0.875rem]">{teamBName}</span>
        </div>
        <p className="u-label text-text-muted text-center text-[0.5625rem]">{caption}</p>
        {outcome}
      </div>

      {shootout && penaltyTotals ? (
        <div className="border-aqua-300 bg-aqua-50 flex flex-col items-center gap-1 rounded-md border px-4 py-3">
          <p className="u-eyebrow text-navy-soft text-[0.5625rem]">Penalty shootout</p>
          <p className="u-numeral u-tabular text-navy text-[1.5rem]">
            {penaltyTotals.scoreA} — {penaltyTotals.scoreB}
          </p>
          <p className="u-label text-navy-soft text-center text-[0.5625rem]">
            {shootout.winner === 'draw' || !shootout.winner
              ? 'SHOOTOUT IN PROGRESS'
              : `${shootout.winner === 'A' ? teamAName : teamBName} WINS THE SHOOTOUT`}
            {' · '}THE REGULAR SCORE STAYS {match.score_a} — {match.score_b}
          </p>
          <p className="u-label text-navy-soft mt-1 text-center text-[0.625rem] leading-relaxed">
            Shootout points are recorded as penalty-tiebreak points. They break a tie
            between equal players and are never added to a regular total.
          </p>
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <p className="u-label text-text-muted text-[0.5625rem]">
          SCORERS ({confirmed.length})
        </p>
        {confirmed.length === 0 ? (
          <EmptyNote>No goals recorded.</EmptyNote>
        ) : (
          <ol className="flex flex-col gap-1.5">
            {confirmed.map((goal) => {
              const scorer = playerOf(snapshot, goal.scorer_id);
              const ownGoalBy = playerOf(snapshot, goal.own_goal_by_player_id);
              return (
                <li
                  key={goal.id}
                  className="border-border-subtle flex items-center gap-3 border-b pb-1.5 last:border-b-0 last:pb-0"
                >
                  <span className="u-numeral u-tabular text-text-muted w-14 shrink-0 text-[0.8125rem]">
                    {formatClock(goal.clock_ms)}
                  </span>
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: snapshot.teamsByCode[goal.team_code]?.color }}
                  />
                  <span className="u-display text-ink min-w-0 flex-1 truncate text-[1.0625rem] leading-none">
                    {goal.is_own_goal
                      ? `OWN GOAL${ownGoalBy ? ` — ${displayNameOf(ownGoalBy)}` : ''}`
                      : scorer
                        ? displayNameOf(scorer)
                        : 'UNATTRIBUTED'}
                  </span>
                  {scorer && !goal.is_own_goal ? (
                    <Link
                      href={`/players/${scorer.slug}`}
                      className="u-label text-text-muted hover:text-ink shrink-0 text-[0.5625rem] underline-offset-4 hover:underline"
                    >
                      PROFILE
                    </Link>
                  ) : null}
                  <span className="u-label text-text-muted shrink-0 text-[0.5625rem]">
                    {teamLabel(snapshot.teamsByCode[goal.team_code], goal.team_code)}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      <p className="u-label text-text-muted text-[0.625rem] leading-relaxed">
        {describeGoalMode(match.goal_points_mode, scoring.match)}
        {scoring.match.winBonus !== 0
          ? ` Every player on the winning team also receives ${scoring.match.winBonus} points.`
          : ''}
      </p>
    </div>
  );
}
