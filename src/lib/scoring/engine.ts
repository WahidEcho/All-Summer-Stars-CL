/**
 * Pure scoring engine for SwanLake Football Stars.
 *
 * Every point value in this file comes from the scoring profile, never from a
 * constant, so the admin can re-tune the competition without a code change.
 * Nothing here touches the database or React — it is deterministic and testable.
 */

import type {
  AttemptPayload,
  AttemptRow,
  ChallengeConfig,
  CenterCircleConfig,
  DribbleFinishConfig,
  GoalPointsMode,
  LedgerEntryType,
  LongRangeConfig,
  MannequinTargetConfig,
  MatchScoringConfig,
  PenaltyConfig,
  PlayerRow,
  RankedPlayer,
  RankingConfig,
  ResultOutcome,
  TeamCode,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Attempt scoring — one branch per challenge mechanic
// ---------------------------------------------------------------------------

/**
 * Points earned by a single attempt.
 *
 * Challenge 1 (mannequin target) and 3 (long range) look up the hit target;
 * challenge 2 (dribble & finish) combines a speed bonus with a goal bonus and
 * clamps to the configured per-attempt maximum; challenge 4 (centre circle)
 * awards a flat value per successful ball.
 */
export function scoreAttempt(config: ChallengeConfig, payload: AttemptPayload): number {
  switch (payload.kind) {
    case 'mannequin_target': {
      const c = config as MannequinTargetConfig;
      if (!payload.targetId) return c.missPoints;
      return c.targets.find((t) => t.id === payload.targetId)?.points ?? c.missPoints;
    }
    case 'long_range': {
      const c = config as LongRangeConfig;
      if (!payload.zoneId) return c.missPoints;
      return c.zones.find((z) => z.id === payload.zoneId)?.points ?? c.missPoints;
    }
    case 'dribble_finish': {
      const c = config as DribbleFinishConfig;
      const speedBonus = payload.timeMs > 0 && payload.timeMs < c.dribbleThresholdMs
        ? c.dribbleBonusPoints
        : 0;
      const goalBonus = payload.scored ? c.goalPoints : 0;
      return Math.min(speedBonus + goalBonus, c.maxPointsPerAttempt);
    }
    case 'center_circle': {
      const c = config as CenterCircleConfig;
      return payload.hit ? c.pointsPerHit : 0;
    }
  }
}

/** How many attempts each player gets in a challenge. */
export function attemptsPerPlayer(config: ChallengeConfig): number {
  switch (config.mechanic) {
    case 'center_circle':
      return config.ballsPerPlayer;
    case 'final_match':
      return 0;
    default:
      return config.attemptsPerPlayer;
  }
}

/** An empty payload for the next attempt of a mechanic, used to seed the UI. */
export function blankPayload(mechanic: ChallengeConfig['mechanic']): AttemptPayload | null {
  switch (mechanic) {
    case 'mannequin_target': return { kind: 'mannequin_target', targetId: null };
    case 'long_range':       return { kind: 'long_range', zoneId: null };
    case 'dribble_finish':   return { kind: 'dribble_finish', timeMs: 0, scored: false };
    case 'center_circle':    return { kind: 'center_circle', hit: false };
    case 'final_match':      return null;
  }
}

// ---------------------------------------------------------------------------
// Round results
// ---------------------------------------------------------------------------

export interface RoundTotals {
  scoreA: number;
  scoreB: number;
  winner: ResultOutcome;
  attemptsA: AttemptRow[];
  attemptsB: AttemptRow[];
}

/** Sum the confirmed attempts on each side and decide the round outcome. */
export function computeRoundTotals(attempts: AttemptRow[]): RoundTotals {
  const confirmed = attempts.filter((a) => a.status === 'confirmed');
  const attemptsA = confirmed.filter((a) => a.side === 'A').sort(byAttemptNumber);
  const attemptsB = confirmed.filter((a) => a.side === 'B').sort(byAttemptNumber);
  const scoreA = sum(attemptsA.map((a) => a.points));
  const scoreB = sum(attemptsB.map((a) => a.points));
  return { scoreA, scoreB, winner: outcomeOf(scoreA, scoreB), attemptsA, attemptsB };
}

function byAttemptNumber(a: AttemptRow, b: AttemptRow) {
  return a.attempt_number - b.attempt_number;
}

export function outcomeOf(scoreA: number, scoreB: number): ResultOutcome {
  if (scoreA > scoreB) return 'A';
  if (scoreB > scoreA) return 'B';
  return 'draw';
}

// ---------------------------------------------------------------------------
// Ledger entries produced when a round is published
// ---------------------------------------------------------------------------

export interface PendingLedgerEntry {
  playerId: string;
  teamId: string | null;
  entryType: LedgerEntryType;
  points: number;
  sourceRef: string | null;
  reason?: string;
}

export interface PublishRoundInput {
  totals: RoundTotals;
  playerA: PlayerRow | null;
  playerB: PlayerRow | null;
  bonuses: { roundWinBonus: number; roundDrawPoints: number };
}

/**
 * Ledger entries for a published 1v1 round: the attempt points each player
 * actually earned, plus any win/draw bonus the profile defines.
 *
 * A draw never merges the two players' records — each keeps the points they
 * scored, and both receive the draw bonus if one is configured.
 */
export function ledgerEntriesForRound(input: PublishRoundInput): PendingLedgerEntry[] {
  const { totals, playerA, playerB, bonuses } = input;
  const entries: PendingLedgerEntry[] = [];

  const push = (player: PlayerRow | null, points: number, entryType: LedgerEntryType, sourceRef: string | null) => {
    if (!player || points === 0) return;
    entries.push({ playerId: player.id, teamId: player.team_id, entryType, points, sourceRef });
  };

  push(playerA, totals.scoreA, 'attempt_points', null);
  push(playerB, totals.scoreB, 'attempt_points', null);

  if (totals.winner === 'draw') {
    push(playerA, bonuses.roundDrawPoints, 'round_draw_points', null);
    push(playerB, bonuses.roundDrawPoints, 'round_draw_points', null);
  } else {
    const winner = totals.winner === 'A' ? playerA : playerB;
    push(winner, bonuses.roundWinBonus, 'round_win_bonus', null);
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Final match goal points — the three selectable modes
// ---------------------------------------------------------------------------

export interface GoalPointsInput {
  mode: GoalPointsMode;
  config: MatchScoringConfig;
  /** Every player on the team credited with the goal. */
  scoringTeamPlayers: PlayerRow[];
  /** The scorer, when the goal is attributed. Null for an unattributed or own goal. */
  scorerId: string | null;
  isOwnGoal: boolean;
  goalId: string;
}

/**
 * Points awarded for one goal in the final match, under whichever of the three
 * modes the admin selected before kick-off:
 *
 *   team_share       every player on the scoring team gets the same points
 *   scorer_only      only the scorer gets points
 *   scorer_plus_team the scorer gets the full amount, teammates a smaller one
 *
 * An own goal credits the benefiting team but never rewards the player who put
 * it in, so under scorer-only an own goal produces no individual points at all
 * unless the profile explicitly enables it.
 */
export function ledgerEntriesForGoal(input: GoalPointsInput): PendingLedgerEntry[] {
  const { mode, config, scoringTeamPlayers, scorerId, isOwnGoal, goalId } = input;
  const entries: PendingLedgerEntry[] = [];

  const add = (player: PlayerRow, points: number) => {
    if (points === 0) return;
    entries.push({
      playerId: player.id,
      teamId: player.team_id,
      entryType: 'match_goal_points',
      points,
      sourceRef: goalId,
    });
  };

  // An own goal has no scorer on the benefiting team.
  const effectiveScorerId = isOwnGoal && !config.ownGoal.scorerGetsPoints ? null : scorerId;

  switch (mode) {
    case 'team_share': {
      for (const p of scoringTeamPlayers) add(p, config.teamShare.pointsPerPlayer);
      break;
    }
    case 'scorer_only': {
      const scorer = scoringTeamPlayers.find((p) => p.id === effectiveScorerId);
      if (scorer) add(scorer, config.scorerOnly.scorerPoints);
      break;
    }
    case 'scorer_plus_team': {
      for (const p of scoringTeamPlayers) {
        add(p, p.id === effectiveScorerId
          ? config.scorerPlusTeam.scorerPoints
          : config.scorerPlusTeam.teammatePoints);
      }
      break;
    }
  }

  return entries;
}

/** Human-readable description of a goal-points mode, for the settings screen. */
export function describeGoalMode(mode: GoalPointsMode, config: MatchScoringConfig): string {
  switch (mode) {
    case 'team_share':
      return `Every player on the scoring team gets ${config.teamShare.pointsPerPlayer} points.`;
    case 'scorer_only':
      return `Only the scorer gets ${config.scorerOnly.scorerPoints} points.`;
    case 'scorer_plus_team':
      return `The scorer gets ${config.scorerPlusTeam.scorerPoints} points, each teammate ${config.scorerPlusTeam.teammatePoints}.`;
  }
}

// ---------------------------------------------------------------------------
// Match and challenge results
// ---------------------------------------------------------------------------

export interface MatchTotals {
  scoreA: number;
  scoreB: number;
  winner: ResultOutcome;
}

/** Regular-time score from confirmed goals. Penalty attempts never count here. */
export function computeMatchScore(goals: Array<{ team_code: TeamCode; status: string }>): MatchTotals {
  const confirmed = goals.filter((g) => g.status === 'confirmed');
  const scoreA = confirmed.filter((g) => g.team_code === 'A').length;
  const scoreB = confirmed.filter((g) => g.team_code === 'B').length;
  return { scoreA, scoreB, winner: outcomeOf(scoreA, scoreB) };
}

/** Penalty shootout score, kept strictly separate from the regular score. */
export function computePenaltyScore(
  attempts: Array<{ team_code: TeamCode; scored: boolean; status: string }>,
): MatchTotals {
  const confirmed = attempts.filter((a) => a.status === 'confirmed' && a.scored);
  const scoreA = confirmed.filter((a) => a.team_code === 'A').length;
  const scoreB = confirmed.filter((a) => a.team_code === 'B').length;
  return { scoreA, scoreB, winner: outcomeOf(scoreA, scoreB) };
}

export interface ChallengeResult {
  pointsA: number;
  pointsB: number;
  roundWinsA: number;
  roundWinsB: number;
  draws: number;
  winner: ResultOutcome;
}

/**
 * Result of a five-round challenge. The default rule is total points across the
 * five rounds; `round_wins` is available for events that prefer counting wins.
 */
export function computeChallengeResult(
  rounds: Array<{ score_a: number; score_b: number; winner: ResultOutcome | null }>,
  aggregationRule: 'total_points' | 'round_wins' = 'total_points',
): ChallengeResult {
  const pointsA = sum(rounds.map((r) => r.score_a));
  const pointsB = sum(rounds.map((r) => r.score_b));
  const roundWinsA = rounds.filter((r) => r.winner === 'A').length;
  const roundWinsB = rounds.filter((r) => r.winner === 'B').length;
  const draws = rounds.filter((r) => r.winner === 'draw').length;

  const winner = aggregationRule === 'round_wins'
    ? outcomeOf(roundWinsA, roundWinsB)
    : outcomeOf(pointsA, pointsB);

  return { pointsA, pointsB, roundWinsA, roundWinsB, draws, winner };
}

// ---------------------------------------------------------------------------
// Individual standings
// ---------------------------------------------------------------------------

export interface PlayerPointsInput {
  player: PlayerRow;
  regularPoints: number;
  penaltyPoints: number;
  teamCode: TeamCode | null;
  slotLabel: string | null;
}

/**
 * Rank players by confirmed regular points, using penalty-tiebreak points only
 * as a draw resolver. Players who remain equal share a rank — the next rank
 * then skips accordingly (1, 2, 2, 4), so "Top 5" always means the top five
 * positions, not the first five rows.
 */
export function rankPlayers(
  inputs: PlayerPointsInput[],
  ranking: RankingConfig,
): RankedPlayer[] {
  const usePenaltyTiebreak = ranking.tiebreakers.includes('penalty_tiebreak_points');

  const sorted = [...inputs].sort((a, b) => {
    if (b.regularPoints !== a.regularPoints) return b.regularPoints - a.regularPoints;
    if (usePenaltyTiebreak && b.penaltyPoints !== a.penaltyPoints) {
      return b.penaltyPoints - a.penaltyPoints;
    }
    return displayNameOf(a.player).localeCompare(displayNameOf(b.player));
  });

  const tiesWith = (a: PlayerPointsInput, b: PlayerPointsInput) =>
    a.regularPoints === b.regularPoints &&
    (!usePenaltyTiebreak || a.penaltyPoints === b.penaltyPoints);

  const ranked: RankedPlayer[] = [];
  let currentRank = 0;

  sorted.forEach((entry, index) => {
    const previous = index > 0 ? sorted[index - 1] : null;
    // Equal players share the previous rank; otherwise the rank jumps to the
    // row's own position so the sequence reads 1, 2, 2, 4.
    if (!previous || !tiesWith(entry, previous) || !ranking.sharedRankOnTie) {
      currentRank = index + 1;
    }

    ranked.push({
      ...entry.player,
      regularPoints: entry.regularPoints,
      penaltyPoints: entry.penaltyPoints,
      totalPoints: entry.regularPoints + entry.penaltyPoints,
      rank: currentRank,
      sharedRank: false,
      teamCode: entry.teamCode,
      slotLabel: entry.slotLabel,
    });
  });

  // Mark every entry that shares its rank with another.
  const rankCounts = new Map<number, number>();
  for (const r of ranked) rankCounts.set(r.rank, (rankCounts.get(r.rank) ?? 0) + 1);
  for (const r of ranked) r.sharedRank = (rankCounts.get(r.rank) ?? 0) > 1;

  return ranked;
}

function displayNameOf(p: PlayerRow): string {
  return p.display_name ?? p.full_name;
}

/** Team totals derived from the same confirmed ledger the players use. */
export function teamPointsFrom(ranked: RankedPlayer[]): Record<TeamCode, number> {
  return {
    A: sum(ranked.filter((p) => p.teamCode === 'A').map((p) => p.totalPoints)),
    B: sum(ranked.filter((p) => p.teamCode === 'B').map((p) => p.totalPoints)),
  };
}

// ---------------------------------------------------------------------------
// The day — two competitions
// ---------------------------------------------------------------------------

/**
 * The event is decided as TWO competitions, one day point each:
 *
 *   Competition 1 — the four skills challenges, by total team points across
 *                   challenges 1–4 (goal points from the match never count).
 *   Competition 2 — the 5v5 final match. A match level at full time goes to a
 *                   rest and then golden goal, so it always produces a winner.
 *
 * 2–0 wins the day outright. 1–1 sends the day to a penalty shootout, whose
 * winner takes the day. A drawn challenges competition awards its point to
 * nobody, leaving the match winner to take the day 1–0.
 *
 * The day decides the CHAMPION TEAM. Individual points still rank the players
 * for the Top-5 prizes; the two are deliberately independent.
 */
export interface DayScore {
  /** Winner of the challenges competition, from totals over challenges 1–4. */
  challenges: ResultOutcome;
  /** Winner of the final match, or null while it is unfinished. */
  match: ResultOutcome | null;
  a: number;
  b: number;
  /** True once both competitions have concluded. */
  bothPlayed: boolean;
  /** True when the day stands level and only a shootout can settle it. */
  needsShootout: boolean;
  /** The champion team, once the day is decided. */
  winner: ResultOutcome | null;
  /** How the day was won, for display copy. */
  decidedBy: 'sweep' | 'split' | 'shootout' | null;
}

export function computeDayScore(
  challengesWinner: ResultOutcome,
  matchWinner: ResultOutcome | null,
  shootoutWinner: ResultOutcome | null,
): DayScore {
  const a = (challengesWinner === 'A' ? 1 : 0) + (matchWinner === 'A' ? 1 : 0);
  const b = (challengesWinner === 'B' ? 1 : 0) + (matchWinner === 'B' ? 1 : 0);
  const bothPlayed = matchWinner !== null && matchWinner !== 'draw';

  if (!bothPlayed) {
    return { challenges: challengesWinner, match: matchWinner, a, b, bothPlayed,
             needsShootout: false, winner: null, decidedBy: null };
  }

  if (a !== b) {
    return { challenges: challengesWinner, match: matchWinner, a, b, bothPlayed,
             needsShootout: false, winner: a > b ? 'A' : 'B',
             decidedBy: a + b === 2 ? (a === 2 || b === 2 ? 'sweep' : 'split') : 'split' };
  }

  // Level — either 1–1, or 0–0 with a drawn challenges competition impossible
  // here (a draw gives the match winner an uncontested point). Shootout time.
  if (shootoutWinner && shootoutWinner !== 'draw') {
    return { challenges: challengesWinner, match: matchWinner, a, b, bothPlayed,
             needsShootout: false, winner: shootoutWinner, decidedBy: 'shootout' };
  }
  return { challenges: challengesWinner, match: matchWinner, a, b, bothPlayed,
           needsShootout: true, winner: null, decidedBy: null };
}

/**
 * The minute a half's clock starts from.
 *
 * The match clock counts up across the whole game, and each half is its own
 * timer row, so a half has to be seeded or the board drops back to zero after
 * the interval. Seeding from the time actually banked was wrong in the one
 * direction that shows: blow the first half up early at 12:00 and the second
 * began at 12:00, so a match played to the whistle finished reading 32:00.
 * Football does not work that way — the second half starts at the half-time
 * mark whenever it is actually kicked off.
 *
 * Taking the later of the nominal mark and the banked time also means a half
 * that ran long into stoppage is never wound backwards, which is the other way
 * to get this wrong.
 */
export function halfStartMs(input: {
  half: number;
  halves: number;
  halfDurationMs: number;
  bankedMs: number;
  goldenGoal?: boolean;
}): number {
  const nominal = input.goldenGoal
    ? input.halfDurationMs * input.halves
    : input.halfDurationMs * Math.max(0, input.half - 1);
  return Math.max(nominal, input.bankedMs);
}

/**
 * Team totals across the four skills challenges alone — Competition 1's
 * scoreboard. Built from round scores so match goal points can never leak in.
 */
export function challengesCompetitionTotals(
  rounds: Array<{ score_a: number; score_b: number }>,
): MatchTotals {
  const scoreA = rounds.reduce((t, r) => t + Number(r.score_a), 0);
  const scoreB = rounds.reduce((t, r) => t + Number(r.score_b), 0);
  return { scoreA, scoreB, winner: outcomeOf(scoreA, scoreB) };
}

// ---------------------------------------------------------------------------
// Penalty shootout state
// ---------------------------------------------------------------------------

export interface ShootoutState {
  scoreA: number;
  scoreB: number;
  takenA: number;
  takenB: number;
  /** Which side takes the next kick. */
  nextSide: TeamCode;
  /** True only once the opening sets have finished LEVEL and sudden death is enabled. */
  inSuddenDeath: boolean;
  decided: boolean;
  winner: ResultOutcome | null;
  /** True once neither side can catch the other within the opening attempts. */
  mathematicallyDecided: boolean;
}

/**
 * Work out where a shootout stands. Sides alternate starting with A. If both
 * opening sets finish level the shootout moves to sudden death, where a
 * completed round with unequal scores decides it; if the opening sets finish
 * apart, that is already the result and sudden death is never reached.
 */
export function computeShootoutState(
  attempts: Array<{ team_code: TeamCode; scored: boolean; sequence: number; status: string }>,
  config: Pick<PenaltyConfig, 'openingAttempts' | 'suddenDeath'>,
): ShootoutState {
  const confirmed = [...attempts]
    .filter((a) => a.status === 'confirmed')
    .sort((a, b) => a.sequence - b.sequence);

  const takenA = confirmed.filter((a) => a.team_code === 'A').length;
  const takenB = confirmed.filter((a) => a.team_code === 'B').length;
  const scoreA = confirmed.filter((a) => a.team_code === 'A' && a.scored).length;
  const scoreB = confirmed.filter((a) => a.team_code === 'B' && a.scored).length;

  const { openingAttempts } = config;
  const openingComplete = takenA >= openingAttempts && takenB >= openingAttempts;
  const nextSide: TeamCode = takenA <= takenB ? 'A' : 'B';

  // During the opening attempts, a lead larger than the kicks the trailing side
  // has left is unassailable.
  let mathematicallyDecided = false;
  if (!openingComplete) {
    const remainingA = Math.max(0, openingAttempts - takenA);
    const remainingB = Math.max(0, openingAttempts - takenB);
    mathematicallyDecided =
      scoreA > scoreB + remainingB || scoreB > scoreA + remainingA;
  }

  // Once both opening sets are complete, the shootout is settled only by a
  // finished round: level on kicks taken, apart on kicks scored.
  const roundDecided = openingComplete && takenA === takenB && scoreA !== scoreB;

  const decided = mathematicallyDecided || roundDecided;

  // Sudden death is reached only when the opening sets finish LEVEL. A
  // shootout won inside the opening set (3-2 after three kicks each) is a
  // regulation result and must never be reported as sudden death — the flag
  // drives the on-screen label and the `penalty_shootouts.status` row.
  // `confirmed` is already in sequence order, so the first `openingAttempts`
  // entries for a side are that side's opening set.
  const openingScored = (side: TeamCode) =>
    confirmed
      .filter((a) => a.team_code === side)
      .slice(0, openingAttempts)
      .filter((a) => a.scored).length;

  const openingLevel = openingComplete && openingScored('A') === openingScored('B');

  return {
    scoreA,
    scoreB,
    takenA,
    takenB,
    nextSide,
    inSuddenDeath: openingLevel && config.suddenDeath,
    decided,
    winner: decided ? outcomeOf(scoreA, scoreB) : null,
    mathematicallyDecided,
  };
}

// ---------------------------------------------------------------------------
// `would*` predicates — let the UI warn before a state-changing action
// ---------------------------------------------------------------------------

/** Would recording this attempt complete the player's set of attempts? */
export function wouldCompletePlayerAttempts(
  config: ChallengeConfig,
  confirmedCount: number,
): boolean {
  return confirmedCount + 1 >= attemptsPerPlayer(config);
}

/** Would publishing this round change who currently leads the individual standings? */
export function wouldChangeLeader(
  before: RankedPlayer[],
  after: RankedPlayer[],
): boolean {
  return before[0]?.id !== after[0]?.id;
}

/** Would this goal decide the match if it were the last one scored? */
export function wouldTakeTheLead(
  current: MatchTotals,
  scoringTeam: TeamCode,
): boolean {
  const next = scoringTeam === 'A'
    ? { scoreA: current.scoreA + 1, scoreB: current.scoreB }
    : { scoreA: current.scoreA, scoreB: current.scoreB + 1 };
  return outcomeOf(next.scoreA, next.scoreB) === scoringTeam &&
         current.winner !== scoringTeam;
}

// ---------------------------------------------------------------------------
// Timer maths — clients render locally from a server anchor
// ---------------------------------------------------------------------------

export interface TimerSnapshot {
  state: 'ready' | 'running' | 'paused' | 'ended';
  mode: 'count_up' | 'count_down' | 'stopwatch';
  startedAtMs: number | null;
  accumulatedMs: number;
  durationMs: number | null;
}

/** Elapsed milliseconds for a timer at a given wall-clock time. */
export function elapsedMs(timer: TimerSnapshot, nowMs: number): number {
  const base = timer.accumulatedMs;
  if (timer.state !== 'running' || timer.startedAtMs === null) return base;
  return base + Math.max(0, nowMs - timer.startedAtMs);
}

/** What the timer should read: counts down for challenge 4, up for everything else. */
export function displayMs(timer: TimerSnapshot, nowMs: number): number {
  const elapsed = elapsedMs(timer, nowMs);
  if (timer.mode === 'count_down' && timer.durationMs !== null) {
    return Math.max(0, timer.durationMs - elapsed);
  }
  return elapsed;
}

export function hasExpired(timer: TimerSnapshot, nowMs: number): boolean {
  if (timer.durationMs === null) return false;
  return elapsedMs(timer, nowMs) >= timer.durationMs;
}

/** `mm:ss` for match clocks, `mm:ss.d` when tenths matter (challenges 2 and 4). */
export function formatClock(ms: number, opts: { tenths?: boolean } = {}): string {
  const safe = Math.max(0, ms);
  const totalSeconds = Math.floor(safe / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const base = `${pad(minutes)}:${pad(seconds)}`;
  if (!opts.tenths) return base;
  return `${base}.${Math.floor((safe % 1000) / 100)}`;
}

function pad(n: number): string {
  return n.toString().padStart(2, '0');
}

// ---------------------------------------------------------------------------

function sum(values: number[]): number {
  return values.reduce((total, v) => total + v, 0);
}
