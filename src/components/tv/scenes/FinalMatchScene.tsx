'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { pickTimer, useTimer, type TimerReading } from '@/lib/hooks';
import { formatClock, ledgerEntriesForGoal } from '@/lib/scoring/engine';
import type {
  FinalMatchConfig,
  GoalPointsMode,
  GoalRow,
  MatchScoringConfig,
  PenaltyAttemptRow,
  TeamCode,
} from '@/lib/types';
import {
  CompactPlayerCard,
  PlayerNameLockup,
  PlayerPhoto,
  totalPointsOf,
  type PlayerLike,
} from '@/components/player';
import {
  DURATION,
  EASE,
  ScoreNumeral,
  StatusPill,
  teamAccentVars,
  useMotionScale,
  type StatusPillTone,
} from '@/components/ui';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { TICKER_H } from '@/components/tv/constants';
import { BigClock } from '@/components/tv/parts/BigClock';
import { SceneHeadline } from '@/components/tv/parts/SceneHeadline';
import { TeamTotals } from '@/components/tv/parts/TeamTotals';
import { TopFivePanel } from '@/components/tv/parts/TopFivePanel';
import { VerifyingPanel } from '@/components/tv/parts/VerifyingPanel';
import { useRankMemory, useTimedSequence } from '@/components/tv/use-score-choreography';
import { payloadString, type SceneProps } from '@/components/tv/scene-props';
import type { SceneModel, SideModel } from '@/components/tv/scene-model';

// ---------------------------------------------------------------------------
// The goal takeover — design.md screen 07, "Goal sequence".
//
//   GOAL!  →  scorer fills the screen  →  scoreboard  →  what the active
//   goal-points mode awards  →  the leaderboard, if it moved  →  back to match
//
// Every step is a fixed beat rather than a wait on data, and a second goal
// restarts the sequence from the top instead of queueing behind the first.
// ---------------------------------------------------------------------------

type GoalStep = 'shout' | 'scorer' | 'scoreboard' | 'points' | 'ranks';

const GOAL_STEPS: ReadonlyArray<{ step: GoalStep; ms: number }> = [
  { step: 'shout', ms: 950 },
  { step: 'scorer', ms: 2400 },
  { step: 'scoreboard', ms: 1500 },
  { step: 'points', ms: 2800 },
  { step: 'ranks', ms: 2000 },
];

/** How long the scorer keeps their highlight on the side strips. */
const HIGHLIGHT_STEPS: ReadonlyArray<{ step: 'on'; ms: number }> = [{ step: 'on', ms: 13_000 }];

/** A goal older than this was history before we arrived; never replay it. */
const GOAL_FRESH_MS = 30_000;

const DEFAULT_HALF_MS = 20 * 60_000;

/**
 * The id of a goal that deserves the full takeover.
 *
 * Two things must never trigger the sequence: the scene being cut to
 * mid-match (the last goal is already old news), and a reconnect that
 * re-delivers the same rows. So the first goal we ever see is recorded
 * silently, and anything that arrives afterwards has to be recent.
 */
function useFreshGoalKey(goal: GoalRow | null): string | null {
  const [key, setKey] = useState<string | null>(null);
  const seen = useRef<string | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    const id = goal?.id ?? null;
    if (mounted.current && seen.current === id) return;

    const first = !mounted.current;
    mounted.current = true;
    seen.current = id;

    if (id === null || first || !goal) {
      setKey(null);
      return;
    }
    const age = Date.now() - Date.parse(goal.created_at);
    setKey(Number.isFinite(age) && age >= 0 && age < GOAL_FRESH_MS ? id : null);
  }, [goal]);

  return key;
}

/** `27:14` for a goal, whichever way the operator recorded the half. */
function goalClockMs(goal: GoalRow, halfMs: number): number {
  const half = goal.half > 1 ? goal.half : 1;
  return goal.clock_ms + (half > 1 && goal.clock_ms < halfMs ? halfMs * (half - 1) : 0);
}

interface Award {
  player: PlayerLike;
  points: number;
  isScorer: boolean;
}

/** Headline for the points panel, phrased for the mode that is actually active. */
function awardHeadline(
  mode: GoalPointsMode,
  config: MatchScoringConfig,
  side: SideModel,
  awards: Award[],
): string {
  if (awards.length === 0) return 'NO INDIVIDUAL POINTS FROM THIS GOAL';
  switch (mode) {
    case 'team_share':
      return `+${config.teamShare.pointsPerPlayer} PTS TO EVERY ${side.name} PLAYER`;
    case 'scorer_only':
      return `+${config.scorerOnly.scorerPoints} PTS TO THE SCORER`;
    case 'scorer_plus_team':
      return `+${config.scorerPlusTeam.scorerPoints} SCORER · +${config.scorerPlusTeam.teammatePoints} EACH TEAMMATE`;
  }
}

const MODE_LABEL: Record<GoalPointsMode, string> = {
  team_share: 'TEAM SHARE',
  scorer_only: 'SCORER ONLY',
  scorer_plus_team: 'SCORER + TEAM',
};

/**
 * SCREEN 07 — FINAL 5v5 MATCH.
 *
 * While the ball is in play this is a football broadcast, not a game show:
 * crest, name and squad either side, one massive regular score in the middle,
 * the count-up clock above it and the scorers underneath. The show-business
 * lives entirely in the goal takeover, which arrives, says exactly what the
 * active goal-points mode awarded, and gets out of the way.
 */
export function FinalMatchScene({ model, payload }: SceneProps) {
  const { snapshot } = model;
  const match = snapshot.match;
  const matchConfig = snapshot.scoring.match;

  const finalConfig = useMemo<FinalMatchConfig | null>(() => {
    const found = Object.values(snapshot.scoring.challenges).find(
      (c) => c.mechanic === 'final_match',
    );
    return (found as FinalMatchConfig | undefined) ?? null;
  }, [snapshot.scoring.challenges]);

  const halfMs = finalConfig?.halfDurationMs ?? DEFAULT_HALF_MS;
  const halves = finalConfig?.halves ?? 2;
  const fullTimeMs = halfMs * halves;

  // --- the clock ----------------------------------------------------------
  const matchId = match?.id ?? null;
  const matchTimers = useMemo(
    () => (matchId ? snapshot.timers.filter((t) => t.match_id === matchId) : []),
    [snapshot.timers, matchId],
  );
  const half = match?.current_half ?? 1;
  const timerRow = useMemo(
    () => pickTimer(matchTimers, half) ?? pickTimer(matchTimers),
    [matchTimers, half],
  );
  const reading = useTimer(timerRow);

  // The two halves read 00:00 → 20:00 → 40:00 as one continuous count-up,
  // whether the operator runs one clock for the match or one per half.
  const segment = timerRow?.segment ?? half;
  const continuousMs =
    reading.displayMs + (segment > 1 && reading.displayMs < halfMs ? halfMs * (segment - 1) : 0);

  const clockReading: TimerReading = {
    ...reading,
    mode: 'count_up',
    elapsedMs: continuousMs,
    displayMs: continuousMs,
    durationMs: fullTimeMs,
    clock: formatClock(continuousMs),
    expired: false,
  };

  // --- goals --------------------------------------------------------------
  const goals = useMemo(
    () =>
      [...model.confirmedGoals].sort(
        (x, y) =>
          goalClockMs(x, halfMs) - goalClockMs(y, halfMs) ||
          x.created_at.localeCompare(y.created_at),
      ),
    [model.confirmedGoals, halfMs],
  );

  const scoreA = snapshot.matchTotals?.scoreA ?? goals.filter((g) => g.team_code === 'A').length;
  const scoreB = snapshot.matchTotals?.scoreB ?? goals.filter((g) => g.team_code === 'B').length;

  const latestArrival = useMemo(() => {
    let best: GoalRow | null = null;
    for (const goal of model.confirmedGoals) {
      if (!best || goal.created_at > best.created_at) best = goal;
    }
    return best;
  }, [model.confirmedGoals]);

  // --- phase --------------------------------------------------------------
  const forced = payloadString(payload, 'phase');
  const shootout = snapshot.shootout;
  const inPenalties =
    forced === 'penalties' ||
    match?.status === 'penalties' ||
    (shootout != null && shootout.status !== 'completed');
  const atHalftime = forced === 'halftime' || match?.status === 'halftime';
  // Level at full time: five minutes' rest, then the next goal wins. The
  // banner covers both — before the third segment's clock starts it reads as
  // the rest, once it runs it reads as sudden death.
  const inGoldenGoal =
    forced === 'golden_goal' || (match?.status === 'golden_goal' && !inPenalties);
  const fullTimeReached = fullTimeMs > 0 && continuousMs >= fullTimeMs;
  const verifying =
    !atHalftime &&
    !inPenalties &&
    !inGoldenGoal &&
    (forced === 'fulltime' ||
      match?.status === 'awaiting_result' ||
      match?.status === 'result_ready' ||
      (fullTimeReached && match?.status !== 'completed'));

  // --- the takeover -------------------------------------------------------
  const takeoverKey = useFreshGoalKey(latestArrival);
  const goalStep = useTimedSequence(GOAL_STEPS, takeoverKey, {
    enabled: !atHalftime && !verifying,
  });
  const highlightStep = useTimedSequence(HIGHLIGHT_STEPS, takeoverKey);

  const previousRanks = useRankMemory(model.standings);

  const scorerOf = (goal: GoalRow | null): PlayerLike | null =>
    goal ? model.playerFor(goal.is_own_goal ? goal.own_goal_by_player_id : goal.scorer_id) : null;

  const highlightId = highlightStep ? (scorerOf(latestArrival)?.id ?? null) : null;

  // What the active mode awarded for the goal being celebrated. Derived with
  // the same engine function the ledger used, so the panel can never claim a
  // number the database did not write.
  const goalMode: GoalPointsMode = match?.goal_points_mode ?? matchConfig.goalPointsMode;
  const awards = useMemo<Award[]>(() => {
    if (!latestArrival) return [];
    const squad = model.squad(latestArrival.team_code);
    if (squad.length === 0) return [];
    const scorerId = latestArrival.is_own_goal
      ? latestArrival.own_goal_by_player_id
      : latestArrival.scorer_id;

    const entries = ledgerEntriesForGoal({
      mode: goalMode,
      config: matchConfig,
      scoringTeamPlayers: squad,
      scorerId,
      isOwnGoal: latestArrival.is_own_goal,
      goalId: latestArrival.id,
    });

    return entries.flatMap((entry) => {
      const player = squad.find((p) => p.id === entry.playerId);
      if (!player) return [];
      return [{ player, points: entry.points, isScorer: player.id === scorerId }];
    });
  }, [latestArrival, goalMode, matchConfig, model]);

  // --- header furniture ---------------------------------------------------
  const halfLabel = inGoldenGoal
    ? 'GOLDEN GOAL'
    : atHalftime
      ? 'HALF TIME'
      : fullTimeReached
        ? 'FULL TIME'
        : segment > 1
          ? 'SECOND HALF'
          : 'FIRST HALF';

  const status: { label: string; tone: StatusPillTone; pulse: boolean } = inPenalties
    ? { label: 'PENALTIES', tone: 'accent', pulse: true }
    : inGoldenGoal
      ? reading.running
        ? { label: 'GOLDEN GOAL — NEXT GOAL WINS', tone: 'live', pulse: true }
        : { label: 'GOLDEN GOAL — REST', tone: 'pending', pulse: false }
    : atHalftime
      ? { label: 'HALF TIME', tone: 'draw', pulse: false }
      : verifying
        ? { label: 'VERIFYING', tone: 'pending', pulse: true }
        : reading.running
          ? { label: 'LIVE', tone: 'live', pulse: true }
          : { label: reading.state === 'paused' ? 'CLOCK STOPPED' : 'READY', tone: 'pending', pulse: false };

  // The day at a glance: competition 1 is already decided by the time the
  // final kicks off, so the wall keeps the stake visible — what this match is
  // worth in day points, and whether a shootout looms.
  const dayFormat = snapshot.scoring.day?.twoCompetitions === true;
  const dayDetail = dayFormat
    ? (() => {
        const skills = model.challengesTotals;
        if (skills.winner === 'draw') return `THE DAY — CHALLENGES LEVEL · THIS MATCH DECIDES IT`;
        const holder = model.side(skills.winner);
        const day = model.dayScore;
        if (day.winner && day.winner !== 'draw') {
          const champ = model.side(day.winner);
          return `THE DAY — ${champ.shortName} WIN ${day.winner === 'A' ? `${day.a}–${day.b}` : `${day.b}–${day.a}`}`;
        }
        if (day.needsShootout) return `THE DAY — 1–1 · PENALTIES DECIDE IT`;
        return `THE DAY — ${holder.shortName} LEAD 1–0 · WIN HERE AND ${holder.shortName} TAKE IT, LOSE AND IT IS PENALTIES`;
      })()
    : null;

  const overlay: ReactNode =
    goalStep && latestArrival ? (
      <div className="absolute inset-x-0 top-0" style={{ bottom: TICKER_H }}>
        <GoalTakeover
          step={goalStep}
          goal={latestArrival}
          scorer={scorerOf(latestArrival)}
          model={model}
          awards={awards}
          mode={goalMode}
          config={matchConfig}
          clock={formatClock(goalClockMs(latestArrival, halfMs))}
          scoreA={scoreA}
          scoreB={scoreB}
          previousRanks={previousRanks}
        />
      </div>
    ) : verifying ? (
      <div className="absolute inset-x-0 top-0" style={{ bottom: TICKER_H }}>
        <VerifyingPanel
          headline="VERIFYING FULL-TIME RESULT"
          detail="THE OFFICIAL IS CONFIRMING THE FINAL SCORE BEFORE POINTS ARE PUBLISHED"
        />
      </div>
    ) : null;

  return (
    <SceneFrame
      eyebrow={model.challengeLabel}
      title="FINAL MATCH"
      detail={dayDetail ?? `${model.a.shortName} V ${model.b.shortName}`}
      status={<StatusPill label={status.label} tone={status.tone} size="md" pulse={status.pulse} />}
      qrUrl={model.qrUrl}
      sponsors={snapshot.sponsors}
      starField="live"
      overlay={overlay}
    >
      {atHalftime ? (
        <HalftimePanel
          model={model}
          goals={goals}
          halfMs={halfMs}
          scoreA={scoreA}
          scoreB={scoreB}
          previousRanks={previousRanks}
        />
      ) : (
        <div
          className="grid h-full min-h-0 gap-8"
          style={{
            gridTemplateColumns: '320px minmax(0,1fr) 320px',
            gridTemplateRows: 'minmax(0, 1fr)',
          }}
        >
          <SquadStrip
            side={model.a}
            players={model.squad('A')}
            highlightId={highlightId}
            align="start"
          />

          <div className="flex min-h-0 flex-col items-center gap-6">
            <BigClock
              reading={clockReading}
              label={halfLabel}
              size="md"
              showState={!reading.running}
              className="w-[440px]"
            />

            <ScoreRow a={model.a} b={model.b} scoreA={scoreA} scoreB={scoreB} />

            {inPenalties ? (
              <PenaltyRow
                a={model.a}
                b={model.b}
                attempts={snapshot.penaltyAttempts}
                openingAttempts={
                  shootout?.opening_attempts ?? snapshot.scoring.penalties.openingAttempts
                }
                scoreA={snapshot.penaltyTotals?.scoreA ?? 0}
                scoreB={snapshot.penaltyTotals?.scoreB ?? 0}
                nextSide={snapshot.shootoutState?.nextSide ?? 'A'}
                suddenDeath={snapshot.shootoutState?.inSuddenDeath ?? false}
                decided={snapshot.shootoutState?.decided ?? false}
              />
            ) : null}

            <ScorerTimeline
              model={model}
              goals={goals}
              halfMs={halfMs}
              latestId={latestArrival?.id ?? null}
              className="mt-auto"
            />
          </div>

          <SquadStrip
            side={model.b}
            players={model.squad('B')}
            highlightId={highlightId}
            align="end"
          />
        </div>
      )}
    </SceneFrame>
  );
}

// ---------------------------------------------------------------------------
// Match-mode furniture
// ---------------------------------------------------------------------------

function TeamCrest({ side, size }: { side: SideModel; size: number }) {
  if (side.team?.crest_url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={side.team.crest_url}
        alt=""
        draggable={false}
        decoding="async"
        className="shrink-0 object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className="u-numeral flex shrink-0 items-center justify-center rounded-md bg-[color:var(--team-accent)] text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.52) }}
    >
      {side.code}
    </span>
  );
}

function TeamPlate({
  side,
  align,
  leading,
  crest = 92,
  nameSize = 46,
}: {
  side: SideModel;
  align: 'start' | 'end';
  leading: boolean;
  crest?: number;
  nameSize?: number;
}) {
  return (
    <div
      style={teamAccentVars(side.color, side.code)}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-5',
        align === 'end' ? 'flex-row-reverse text-right' : 'text-left',
      )}
    >
      <TeamCrest side={side} size={crest} />
      <div className={cn('flex min-w-0 flex-col gap-1.5', align === 'end' && 'items-end')}>
        <span
          className={cn(
            'u-display leading-[0.9]',
            leading ? 'text-[color:var(--team-accent-ink)]' : 'text-ink-soft',
          )}
          style={{ fontSize: nameSize }}
        >
          {side.name}
        </span>
        <span className="u-label text-text-muted text-[14px]">
          {side.points} COMPETITION PTS
        </span>
      </div>
    </div>
  );
}

function ScoreRow({
  a,
  b,
  scoreA,
  scoreB,
  compact = false,
}: {
  a: SideModel;
  b: SideModel;
  scoreA: number;
  scoreB: number;
  compact?: boolean;
}) {
  return (
    <div className="flex w-full shrink-0 items-center justify-center gap-8">
      <TeamPlate
        side={a}
        align="end"
        leading={scoreA >= scoreB}
        crest={compact ? 66 : 92}
        nameSize={compact ? 34 : 46}
      />

      <div className="flex shrink-0 items-center gap-6">
        <ScoreNumeral value={scoreA} size={compact ? 'lg' : 'xl'} tone="default" align="center" />
        <span aria-hidden className="u-numeral text-text-muted text-[72px] leading-none">
          —
        </span>
        <ScoreNumeral value={scoreB} size={compact ? 'lg' : 'xl'} tone="default" align="center" />
      </div>

      <TeamPlate
        side={b}
        align="start"
        leading={scoreB >= scoreA}
        crest={compact ? 66 : 92}
        nameSize={compact ? 34 : 46}
      />
    </div>
  );
}

function SquadStrip({
  side,
  players,
  highlightId,
  align,
}: {
  side: SideModel;
  players: ReadonlyArray<PlayerLike>;
  highlightId: string | null;
  align: 'start' | 'end';
}) {
  const motionOn = useMotionScale() === 1;

  return (
    <div className="flex min-h-0 flex-col gap-3" style={teamAccentVars(side.color, side.code)}>
      <div
        className={cn(
          'flex shrink-0 items-baseline gap-3',
          align === 'end' && 'flex-row-reverse',
        )}
      >
        <span className="u-label text-[color:var(--team-accent-ink)] text-[17px]">
          {side.shortName}
        </span>
        <span className="u-eyebrow text-text-muted text-[11px]">TOTAL PTS</span>
      </div>

      <ol className="flex min-h-0 flex-1 flex-col gap-3">
        {players.slice(0, 5).map((player) => {
          const on = highlightId === player.id;
          return (
            <motion.li
              key={player.id}
              className={cn(
                'min-h-0 flex-1 rounded-md',
                on && 'shadow-glow-aqua ring-2 ring-[color:var(--team-accent)]',
              )}
              animate={motionOn ? { scale: on ? 1.015 : 1 } : { scale: 1 }}
              transition={{ duration: DURATION.card, ease: EASE.entrance }}
            >
              <CompactPlayerCard
                player={player}
                points={'regularPoints' in player ? player.regularPoints : undefined}
                teamColor={side.color}
                teamCode={side.code}
                teamName={side.shortName}
                size="md"
                reorder={false}
                status={
                  on ? <StatusPill label="SCORER" tone="team" size="sm" pulse={false} /> : undefined
                }
                className="h-full"
              />
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

function GoalList({
  model,
  goals,
  halfMs,
  side,
  align,
  latestId,
}: {
  model: SceneModel;
  goals: ReadonlyArray<GoalRow>;
  halfMs: number;
  side: TeamCode;
  align: 'start' | 'end';
  latestId: string | null;
}) {
  const rows = goals.filter((g) => g.team_code === side);

  return (
    <ul className={cn('flex min-w-0 flex-col gap-2', align === 'end' ? 'items-end' : 'items-start')}>
      {rows.length === 0 ? (
        <li className="u-label text-text-muted text-[15px]">NO GOALS YET</li>
      ) : null}

      {rows.map((goal) => {
        const player = model.playerFor(
          goal.is_own_goal ? goal.own_goal_by_player_id : goal.scorer_id,
        );
        const name = player ? player.display_name || player.full_name : 'UNATTRIBUTED';
        const minute = `${Math.floor(goalClockMs(goal, halfMs) / 60_000)}'`;

        return (
          <li
            key={goal.id}
            className={cn(
              'flex min-w-0 items-baseline gap-3',
              align === 'end' && 'flex-row-reverse',
            )}
          >
            <span className="u-numeral u-tabular text-aqua-700 shrink-0 text-[24px] leading-none">
              {minute}
            </span>
            <span className="u-display text-ink truncate text-[30px] leading-none">{name}</span>
            {goal.is_own_goal ? (
              <span className="u-label text-draw shrink-0 text-[12px]">OWN GOAL</span>
            ) : null}
            {goal.id === latestId ? (
              <span className="u-eyebrow text-aqua-700 shrink-0 text-[11px]">LATEST</span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function ScorerTimeline({
  model,
  goals,
  halfMs,
  latestId,
  className,
}: {
  model: SceneModel;
  goals: ReadonlyArray<GoalRow>;
  halfMs: number;
  latestId: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'ring-border-subtle grid w-full shrink-0 items-start gap-8 rounded-lg bg-white/88 px-9 py-6 ring-1',
        className,
      )}
      style={{ gridTemplateColumns: '1fr auto 1fr' }}
    >
      <GoalList
        model={model}
        goals={goals}
        halfMs={halfMs}
        side="A"
        align="start"
        latestId={latestId}
      />

      <div className="flex h-full flex-col items-center gap-3">
        <span className="u-eyebrow text-text-muted text-[12px]">SCORERS</span>
        <span aria-hidden className="bg-border-subtle w-px flex-1" />
      </div>

      <GoalList
        model={model}
        goals={goals}
        halfMs={halfMs}
        side="B"
        align="end"
        latestId={latestId}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Penalties — a completely separate row. The regular numeral never moves.
// ---------------------------------------------------------------------------

type PenaltyDotState = 'scored' | 'missed' | 'pending';

function PenaltyDot({ state, index }: { state: PenaltyDotState; index: number }) {
  return (
    <span
      data-penalty-dot={state}
      data-state-glyph
      className={cn(
        'relative flex size-9 items-center justify-center rounded-full',
        state === 'scored' && 'bg-[color:var(--team-accent)] text-white',
        state === 'missed' && 'ring-border text-text-muted bg-white opacity-55 ring-1',
        state === 'pending' && 'ring-border-subtle text-pending/40 bg-white/60 ring-1',
      )}
    >
      <span aria-hidden className="u-numeral text-[15px] leading-none">
        {state === 'scored' ? '●' : state === 'missed' ? '×' : '○'}
      </span>
      {state === 'missed' ? (
        <span
          aria-hidden
          className="absolute h-px w-[64%] rotate-45 bg-current opacity-80"
        />
      ) : null}
      <span className="u-sr-only">{`Penalty ${index + 1} ${state}`}</span>
    </span>
  );
}

function PenaltyLine({
  side,
  states,
  score,
  next,
}: {
  side: SideModel;
  states: PenaltyDotState[];
  score: number;
  next: boolean;
}) {
  return (
    <div
      style={teamAccentVars(side.color, side.code)}
      className="flex items-center gap-5"
    >
      <span className="u-label text-[color:var(--team-accent-ink)] w-[132px] shrink-0 truncate text-[16px]">
        {side.shortName}
      </span>
      <ol className="flex flex-1 items-center gap-2.5">
        {states.map((state, index) => (
          <li key={index}>
            <PenaltyDot state={state} index={index} />
          </li>
        ))}
      </ol>
      {next ? (
        <span className="u-eyebrow text-aqua-700 shrink-0 text-[11px]">NEXT</span>
      ) : null}
      <ScoreNumeral
        value={score}
        size="sm"
        tone="default"
        align="end"
        labelPlacement="none"
        className="w-[74px] shrink-0"
      />
    </div>
  );
}

function penaltyStates(
  attempts: ReadonlyArray<PenaltyAttemptRow>,
  side: TeamCode,
  opening: number,
): PenaltyDotState[] {
  const taken = attempts
    .filter((a) => a.status === 'confirmed' && a.team_code === side)
    .sort((x, y) => x.sequence - y.sequence)
    .map<PenaltyDotState>((a) => (a.scored ? 'scored' : 'missed'));

  while (taken.length < opening) taken.push('pending');
  return taken;
}

function PenaltyRow({
  a,
  b,
  attempts,
  openingAttempts,
  scoreA,
  scoreB,
  nextSide,
  suddenDeath,
  decided,
}: {
  a: SideModel;
  b: SideModel;
  attempts: ReadonlyArray<PenaltyAttemptRow>;
  openingAttempts: number;
  scoreA: number;
  scoreB: number;
  nextSide: TeamCode;
  suddenDeath: boolean;
  decided: boolean;
}) {
  const opening = Math.max(1, openingAttempts);

  return (
    <section
      data-penalty-row
      className="ring-aqua-400 flex w-full shrink-0 items-center gap-9 rounded-lg bg-white/94 px-9 py-5 ring-2"
    >
      <div className="flex shrink-0 flex-col gap-1">
        <span className="u-display text-aqua-800 text-[42px] leading-none">PENALTIES</span>
        <span className="u-label text-text-muted text-[12px]">
          SEPARATE FROM THE MATCH SCORE
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <PenaltyLine
          side={a}
          states={penaltyStates(attempts, 'A', opening)}
          score={scoreA}
          next={!decided && nextSide === 'A'}
        />
        <PenaltyLine
          side={b}
          states={penaltyStates(attempts, 'B', opening)}
          score={scoreB}
          next={!decided && nextSide === 'B'}
        />
      </div>

      <StatusPill
        label={decided ? 'DECIDED' : suddenDeath ? 'SUDDEN DEATH' : 'IN PROGRESS'}
        tone={decided ? 'winner' : suddenDeath ? 'draw' : 'accent'}
        size="md"
        pulse={false}
        className="shrink-0"
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Half time
// ---------------------------------------------------------------------------

function HalftimePanel({
  model,
  goals,
  halfMs,
  scoreA,
  scoreB,
  previousRanks,
}: {
  model: SceneModel;
  goals: ReadonlyArray<GoalRow>;
  halfMs: number;
  scoreA: number;
  scoreB: number;
  previousRanks: Map<string, number>;
}) {
  return (
    <div
      className="grid h-full min-h-0 gap-10"
      style={{ gridTemplateColumns: 'minmax(0,1fr) 540px', gridTemplateRows: 'minmax(0, 1fr)' }}
    >
      <div className="flex min-h-0 flex-col gap-7">
        <SceneHeadline eyebrow={`${model.challengeLabel} · FINAL MATCH`} size="lg" align="start">
          HALF TIME
        </SceneHeadline>

        <ScoreRow a={model.a} b={model.b} scoreA={scoreA} scoreB={scoreB} compact />

        <ScorerTimeline model={model} goals={goals} halfMs={halfMs} latestId={null} />

        <TeamTotals a={model.a} b={model.b} size="lg" className="mt-auto" />
      </div>

      <TopFivePanel
        players={model.topFive}
        teams={model.snapshot.teamsByCode}
        previousRanks={previousRanks}
        size="md"
        delay={0.2}
        className="min-h-0"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The goal takeover
// ---------------------------------------------------------------------------

function Frame({ children, className }: { children: ReactNode; className?: string }) {
  const motionOn = useMotionScale() === 1;
  return (
    <motion.div
      initial={motionOn ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.26, ease: EASE.soft }}
      className={cn('absolute inset-0 flex flex-col items-center justify-center', className)}
    >
      {children}
    </motion.div>
  );
}

function ImpactCard({
  player,
  points,
  isScorer,
  side,
  delay,
}: {
  player: PlayerLike;
  points: number;
  isScorer: boolean;
  side: SideModel;
  delay: number;
}) {
  const motionOn = useMotionScale() === 1;
  const total = totalPointsOf(player) ?? 0;

  // The figure starts at what the player had *before* this goal and rolls up
  // to the real total once the card has landed. The held value is always the
  // previous real number — nothing here invents a score.
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    if (!motionOn) return;
    const id = window.setTimeout(() => setSettled(true), 620 + delay * 1000);
    return () => window.clearTimeout(id);
  }, [motionOn, delay]);

  const shown = !motionOn || settled ? total : Math.max(0, total - points);

  return (
    <motion.article
      style={teamAccentVars(side.color, side.code)}
      initial={motionOn ? { opacity: 0, y: 34, scale: 0.96 } : false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: DURATION.card, ease: EASE.entrance, delay }}
      className={cn(
        'bg-surface-raised shadow-card relative flex w-[214px] flex-col overflow-hidden rounded-lg',
        isScorer ? 'ring-2 ring-[color:var(--team-accent)]' : 'ring-border-subtle ring-1',
      )}
    >
      <div className="relative h-[188px] bg-[color-mix(in_oklab,var(--team-accent)_12%,white)]">
        <PlayerPhoto player={player} fit="cover" priority />
        {isScorer ? (
          <span className="u-label absolute top-3 left-3 rounded-pill bg-[color:var(--team-accent)] px-3 py-1 text-[11px] text-white">
            SCORER
          </span>
        ) : null}
      </div>

      <div className="flex flex-col items-center gap-2 px-4 pt-3 pb-4 text-center">
        <PlayerNameLockup player={player} size="sm" align="center" showFirstName={false} />
        <span className="u-numeral text-[color:var(--team-accent)] text-[52px] leading-none">
          +{points}
        </span>
        <ScoreNumeral
          value={shown}
          suffix="PTS"
          size="sm"
          tone="muted"
          align="center"
          labelPlacement="none"
        />
      </div>

      <span aria-hidden className="h-2 w-full bg-[color:var(--team-accent)]" />
    </motion.article>
  );
}

function GoalTakeover({
  step,
  goal,
  scorer,
  model,
  awards,
  mode,
  config,
  clock,
  scoreA,
  scoreB,
  previousRanks,
}: {
  step: GoalStep;
  goal: GoalRow;
  scorer: PlayerLike | null;
  model: SceneModel;
  awards: Award[];
  mode: GoalPointsMode;
  config: MatchScoringConfig;
  clock: string;
  scoreA: number;
  scoreB: number;
  previousRanks: Map<string, number>;
}) {
  const motionOn = useMotionScale() === 1;
  const side = model.side(goal.team_code);
  const word = goal.is_own_goal ? 'OWN GOAL' : 'GOAL!';
  const headline = awardHeadline(mode, config, side, awards);

  return (
    <div
      data-goal-takeover={step}
      style={teamAccentVars(side.color, side.code)}
      className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,var(--color-white)_0%,var(--color-aqua-50)_62%,color-mix(in_oklab,var(--team-accent)_14%,white)_100%)]"
    >
      <AnimatePresence initial={false}>
        {step === 'shout' ? (
          <Frame key="shout" className="gap-8">
            <motion.span
              initial={motionOn ? { opacity: 0, scale: 0.84 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4, ease: EASE.overshoot }}
              className="u-display text-[color:var(--team-accent-ink)] leading-[0.82]"
              style={{ fontSize: goal.is_own_goal ? 210 : 290 }}
            >
              {word}
            </motion.span>
            <span className="u-label text-aqua-800 text-[30px]">{side.name}</span>
          </Frame>
        ) : null}

        {step === 'scorer' ? (
          <Frame key="scorer" className="flex-row items-stretch justify-start">
            <div className="relative w-[46%] shrink-0 overflow-hidden">
              {scorer ? (
                <PlayerPhoto player={scorer} fit="cover" priority />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <TeamCrest side={side} size={280} />
                </div>
              )}
            </div>

            <div className="flex min-w-0 flex-1 flex-col justify-center gap-8 pr-[110px] pl-12">
              <span
                className={cn(
                  'u-display text-[112px] leading-[0.86]',
                  goal.is_own_goal ? 'text-draw' : 'text-[color:var(--team-accent-ink)]',
                )}
              >
                {goal.is_own_goal ? 'OWN GOAL' : 'GOAL'}
              </span>

              {scorer ? (
                <PlayerNameLockup
                  player={scorer}
                  size="hero"
                  align="start"
                  eyebrow={goal.is_own_goal ? 'PUT INTO HIS OWN NET BY' : side.name}
                />
              ) : (
                <span className="u-display text-ink text-[96px] leading-[0.9]">{side.name}</span>
              )}

              <div className="flex items-end gap-14">
                <ScoreNumeral
                  value={clock}
                  label="MATCH CLOCK"
                  variant="clock"
                  size="lg"
                  tone="default"
                  align="start"
                  animate={false}
                />
                <div className="flex flex-col gap-2">
                  <span className="u-label text-text-muted text-[15px]">GOAL CREDITED TO</span>
                  <span className="u-display text-[color:var(--team-accent-ink)] text-[54px] leading-none">
                    {side.name}
                  </span>
                </div>
              </div>
            </div>
          </Frame>
        ) : null}

        {step === 'scoreboard' ? (
          <Frame key="scoreboard" className="gap-10 px-[110px]">
            <span className="u-eyebrow text-aqua-700 text-[22px]">FINAL MATCH · {clock}</span>
            <ScoreRow a={model.a} b={model.b} scoreA={scoreA} scoreB={scoreB} />
            {scorer ? (
              <span className="u-label text-text-muted text-[22px]">
                {goal.is_own_goal ? 'OWN GOAL · ' : 'SCORED BY '}
                {(scorer.display_name || scorer.full_name).toUpperCase()}
              </span>
            ) : null}
          </Frame>
        ) : null}

        {step === 'points' ? (
          <Frame key="points" className="gap-10 px-[80px]">
            <SceneHeadline
              eyebrow={`${side.name} · ${MODE_LABEL[mode]}`}
              size={headline.length > 34 ? 'sm' : 'md'}
            >
              {headline}
            </SceneHeadline>

            {awards.length > 0 ? (
              <div className="flex items-stretch justify-center gap-5">
                {awards.map((award, index) => (
                  <ImpactCard
                    key={award.player.id}
                    player={award.player}
                    points={award.points}
                    isScorer={award.isScorer}
                    side={side}
                    delay={index * 0.07}
                  />
                ))}
              </div>
            ) : (
              <p className="u-label text-text-muted max-w-[1100px] text-center text-[22px]">
                {goal.is_own_goal
                  ? `THE GOAL COUNTS FOR ${side.name}. UNDER ${MODE_LABEL[mode]} AN OWN GOAL AWARDS NO INDIVIDUAL POINTS.`
                  : `NO INDIVIDUAL POINTS ARE AWARDED UNDER ${MODE_LABEL[mode]}.`}
              </p>
            )}
          </Frame>
        ) : null}

        {step === 'ranks' ? (
          <Frame key="ranks" className="gap-8 px-[300px]">
            <SceneHeadline eyebrow="AFTER THE GOAL" size="md">
              LEADERBOARD
            </SceneHeadline>
            <TopFivePanel
              players={model.topFive}
              teams={model.snapshot.teamsByCode}
              previousRanks={previousRanks}
              title=""
              size="lg"
              className="w-full"
            />
          </Frame>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export default FinalMatchScene;
