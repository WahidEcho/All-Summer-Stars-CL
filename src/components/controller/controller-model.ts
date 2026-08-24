/**
 * Pure read-model helpers for the Active Score Controller.
 *
 * Nothing here touches React, Supabase or a server action. It turns an
 * `EventSnapshot` into the handful of questions the courtside operator's
 * screen actually asks: whose turn is it, which attempt number comes next,
 * what did the last twelve actions do, and which one can be undone.
 *
 * Every point value comes from the scoring profile carried on the snapshot —
 * there is not a single hardcoded score in this file.
 */

import {
  attemptsPerPlayer,
  scoreAttempt,
  type ShootoutState,
} from '@/lib/scoring/engine';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type {
  AttemptPayload,
  AttemptRow,
  ChallengeConfig,
  ChallengeMechanic,
  ChallengeRow,
  DribbleFinishConfig,
  GoalRow,
  LineupSlotRow,
  PenaltyAttemptRow,
  PlayerRow,
  RoundRow,
  ScoringConfig,
  TeamCode,
  TeamRow,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Challenge configuration
// ---------------------------------------------------------------------------

/** The scoring config for a challenge, keyed by its number in the profile. */
export function configForChallenge(
  scoring: ScoringConfig,
  challenge: ChallengeRow | null,
): ChallengeConfig | null {
  if (!challenge) return null;
  const key = String(challenge.number) as keyof ScoringConfig['challenges'];
  return scoring.challenges[key] ?? null;
}

/** Narrow a config to the mechanic a surface expects, or null. */
export function configOfMechanic<M extends ChallengeMechanic>(
  config: ChallengeConfig | null,
  mechanic: M,
): Extract<ChallengeConfig, { mechanic: M }> | null {
  if (!config || config.mechanic !== mechanic) return null;
  return config as Extract<ChallengeConfig, { mechanic: M }>;
}

// ---------------------------------------------------------------------------
// Sides of the current round
// ---------------------------------------------------------------------------

export interface SideState {
  side: TeamCode;
  team: TeamRow | null;
  /** `A3` — the slot this round is playing. */
  slotLabel: string;
  player: PlayerRow | null;
  /** Confirmed attempts only, in attempt-number order. */
  attempts: AttemptRow[];
  /** Every attempt row including reversals, newest last. */
  history: AttemptRow[];
  /** Confirmed points this round. */
  points: number;
  /** How many attempts the player has left to take. */
  remaining: number;
  /** The attempt number a new record should carry. 0 when the set is full. */
  nextAttemptNumber: number;
  /** Highest confirmed attempt number — the frontier of play. */
  frontier: number;
  complete: boolean;
  /** How many attempts this mechanic gives each player. */
  limit: number;
}

const FALLBACK_ACCENT: Record<TeamCode, string> = { A: '#0E6BA8', B: '#D3323C' };

/** The kit colour to paint a side with, falling back to the token default. */
export function accentFor(team: TeamRow | null, side: TeamCode): string {
  const color = team?.color?.trim();
  return color && color.length > 0 ? color : FALLBACK_ACCENT[side];
}

function attemptNumbersOf(attempts: AttemptRow[]): Set<number> {
  return new Set(attempts.map((a) => a.attempt_number));
}

/**
 * The next free attempt number for a player: the lowest slot in `1..limit`
 * that has no confirmed attempt. Reversing attempt 2 of 3 therefore reopens
 * slot 2 rather than pushing the operator to a fourth attempt.
 */
export function nextFreeAttemptNumber(attempts: AttemptRow[], limit: number): number {
  const taken = attemptNumbersOf(attempts);
  for (let n = 1; n <= limit; n += 1) {
    if (!taken.has(n)) return n;
  }
  return 0;
}

function slotLabelFor(side: TeamCode, round: RoundRow | null): string {
  return `${side}${round?.number ?? ''}`;
}

/** Build the two-sided view of the current round. */
export function sideStatesFor(
  snapshot: EventSnapshot,
  config: ChallengeConfig | null,
): Record<TeamCode, SideState> {
  const round = snapshot.currentRound;
  const limit = config ? attemptsPerPlayer(config) : 0;

  const build = (side: TeamCode): SideState => {
    const playerId = side === 'A' ? round?.player_a_id : round?.player_b_id;
    const history = snapshot.attempts
      .filter((a) => a.side === side)
      .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
    const attempts = history
      .filter((a) => a.status === 'confirmed')
      .sort((a, b) => a.attempt_number - b.attempt_number);

    const points = attempts.reduce((total, a) => total + Number(a.points), 0);
    const frontier = attempts.reduce((max, a) => Math.max(max, a.attempt_number), 0);

    return {
      side,
      team: snapshot.teamsByCode[side],
      slotLabel: slotLabelFor(side, round),
      player: playerId ? snapshot.playersById[playerId] ?? null : null,
      attempts,
      history,
      points,
      remaining: Math.max(0, limit - attempts.length),
      nextAttemptNumber: nextFreeAttemptNumber(attempts, limit),
      frontier,
      complete: limit > 0 && attempts.length >= limit,
      limit,
    };
  };

  return { A: build('A'), B: build('B') };
}

/** Attempt occupying a given slot number, or null when the slot is open. */
export function attemptAt(side: SideState, attemptNumber: number): AttemptRow | null {
  return side.attempts.find((a) => a.attempt_number === attemptNumber) ?? null;
}

export type TurnRule = 'sequential' | 'alternate';

/** Which mechanic alternates turn by turn, and which lets a player finish. */
export function turnRuleFor(mechanic: ChallengeMechanic): TurnRule {
  return mechanic === 'dribble_finish' ? 'alternate' : 'sequential';
}

/**
 * The side the operator most likely needs next. Always a suggestion — every
 * surface also exposes an explicit A/B switch, because the running order on a
 * beach rarely survives contact with the players.
 */
export function suggestedSide(
  sides: Record<TeamCode, SideState>,
  rule: TurnRule,
): TeamCode {
  const { A, B } = sides;
  if (rule === 'alternate') {
    if (!A.complete && A.attempts.length <= B.attempts.length) return 'A';
    if (!B.complete) return 'B';
    return A.complete ? 'A' : 'A';
  }
  if (!A.complete) return 'A';
  if (!B.complete) return 'B';
  return 'A';
}

// ---------------------------------------------------------------------------
// Describing an attempt
// ---------------------------------------------------------------------------

export interface AttemptDescription {
  /** Short all-caps headline, e.g. `TARGET 50` or `12.4s · GOAL`. */
  label: string;
  points: number;
}

/** Human-readable summary of a stored attempt, using the live profile labels. */
export function describeAttempt(
  config: ChallengeConfig | null,
  attempt: AttemptRow,
): AttemptDescription {
  const payload = attempt.payload as AttemptPayload | Record<string, never>;
  const points = Number(attempt.points);

  if (!config || !('kind' in payload)) return { label: 'ATTEMPT', points };

  switch (payload.kind) {
    case 'mannequin_target': {
      if (config.mechanic !== 'mannequin_target') return { label: 'ATTEMPT', points };
      const target = config.targets.find((t) => t.id === payload.targetId);
      return { label: target?.label ?? 'MISS', points };
    }
    case 'long_range': {
      if (config.mechanic !== 'long_range') return { label: 'ATTEMPT', points };
      const zone = config.zones.find((z) => z.id === payload.zoneId);
      return { label: zone?.label ?? 'MISS', points };
    }
    case 'dribble_finish': {
      const seconds = (payload.timeMs / 1000).toFixed(1);
      return { label: `${seconds}s · ${payload.scored ? 'GOAL' : 'NO GOAL'}`, points };
    }
    case 'center_circle':
      return { label: payload.hit ? 'BALL IN' : 'BALL MISSED', points };
  }
}

export interface BreakdownLine {
  label: string;
  points: number;
}

export interface AttemptBreakdown {
  lines: BreakdownLine[];
  total: number;
  /** True when the per-attempt cap trimmed the raw sum. */
  capped: boolean;
}

/**
 * The dribble-and-finish sum, shown to the operator *before* it is committed:
 * "UNDER 15.0s +2, GOAL +3 = 5 PTS". Every number is read from the profile.
 */
export function dribbleBreakdown(
  config: DribbleFinishConfig,
  timeMs: number,
  scored: boolean,
): AttemptBreakdown {
  const threshold = (config.dribbleThresholdMs / 1000).toFixed(1);
  const underThreshold = timeMs > 0 && timeMs < config.dribbleThresholdMs;

  const lines: BreakdownLine[] = [
    {
      label: underThreshold
        ? `UNDER ${threshold}s`
        : timeMs > 0
          ? `OVER ${threshold}s`
          : 'NO TIME RECORDED',
      points: underThreshold ? config.dribbleBonusPoints : 0,
    },
    {
      label: scored ? 'PAST THE KEEPER' : 'NO GOAL',
      points: scored ? config.goalPoints : 0,
    },
  ];

  const raw = lines.reduce((sum, line) => sum + line.points, 0);
  const total = scoreAttempt(config, { kind: 'dribble_finish', timeMs, scored });

  return { lines, total, capped: raw > total };
}

/** Points a payload would earn, without recording anything. */
export function previewPoints(
  config: ChallengeConfig | null,
  payload: AttemptPayload,
): number | null {
  if (!config) return null;
  if (config.mechanic !== payload.kind) return null;
  return scoreAttempt(config, payload);
}

// ---------------------------------------------------------------------------
// Match helpers
// ---------------------------------------------------------------------------

export const GOAL_METHODS = [
  { id: 'open_play', label: 'OPEN PLAY' },
  { id: 'penalty_in_play', label: 'PENALTY' },
  { id: 'free_kick', label: 'FREE KICK' },
  { id: 'header', label: 'HEADER' },
] as const;

export type GoalMethodId = (typeof GOAL_METHODS)[number]['id'];

/** Players eligible for a team, preferring the final match's locked lineup. */
export function eligiblePlayers(
  snapshot: EventSnapshot,
  side: TeamCode,
  challengeId: string | null,
): PlayerRow[] {
  const slots: LineupSlotRow[] = challengeId
    ? snapshot.allLineups
        .filter((s) => s.challenge_id === challengeId && s.team_code === side)
        .sort((a, b) => a.slot_index - b.slot_index)
    : [];

  const fromLineup = slots
    .map((s) => (s.player_id ? snapshot.playersById[s.player_id] ?? null : null))
    .filter((p): p is PlayerRow => p !== null);

  if (fromLineup.length > 0) return fromLineup;

  const team = snapshot.teamsByCode[side];
  if (!team) return [];
  return snapshot.players
    .filter((p) => p.team_id === team.id && p.active)
    .sort((a, b) => a.display_order - b.display_order);
}

/** The slot label (`B2`) a player holds in a challenge, when they hold one. */
export function slotLabelForPlayer(
  snapshot: EventSnapshot,
  playerId: string,
  challengeId: string | null,
): string | null {
  const slot = snapshot.allLineups.find(
    (s) =>
      s.player_id === playerId && (challengeId === null || s.challenge_id === challengeId),
  );
  return slot ? `${slot.team_code}${slot.slot_index}` : null;
}

/** True once the regular result is a settled, confirmed draw. */
export function isConfirmedDraw(snapshot: EventSnapshot): boolean {
  const match = snapshot.match;
  const totals = snapshot.matchTotals;
  if (!match || !totals) return false;
  if (totals.winner !== 'draw') return false;
  return (
    match.status === 'awaiting_result' ||
    match.status === 'result_ready' ||
    match.status === 'penalties' ||
    match.status === 'completed'
  );
}

/** Which side takes the next penalty, and whether the shootout is settled. */
export function shootoutTurn(state: ShootoutState | null): {
  nextSide: TeamCode;
  decided: boolean;
} {
  return {
    nextSide: state?.nextSide ?? 'A',
    decided: Boolean(state?.decided),
  };
}

// ---------------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------------

export type TimelineKind = 'attempt' | 'goal' | 'penalty' | 'note';

export interface UndoTarget {
  kind: 'attempt' | 'goal' | 'penalty';
  id: string;
  /** What the operator is about to reverse, in words. */
  description: string;
}

export interface TimelineEntry {
  id: string;
  at: number;
  kind: TimelineKind;
  /** `A3 · TARGET 50` */
  headline: string;
  /** `+5 PTS` */
  detail: string;
  /** True when this row has already been reversed. */
  reversed: boolean;
  /** True when this row *is* a reversal of something else. */
  isReversal: boolean;
  undo: UndoTarget | null;
}

export interface JournalNote {
  id: string;
  at: number;
  label: string;
}

function nameFor(snapshot: EventSnapshot, playerId: string | null): string {
  if (!playerId) return 'UNATTRIBUTED';
  const player = snapshot.playersById[playerId];
  if (!player) return 'UNKNOWN';
  return (player.display_name ?? player.full_name).toUpperCase();
}

function reversedIds(rows: Array<{ reverses_id: string | null }>): Set<string> {
  const out = new Set<string>();
  for (const row of rows) if (row.reverses_id) out.add(row.reverses_id);
  return out;
}

function attemptEntries(
  snapshot: EventSnapshot,
  config: ChallengeConfig | null,
): TimelineEntry[] {
  const rows: AttemptRow[] = snapshot.attempts;
  const reversedSet = reversedIds(rows);

  return rows.map((row) => {
    const description = describeAttempt(config, row);
    const isReversal = row.reverses_id !== null;
    const slot = row.side;
    return {
      id: `attempt:${row.id}`,
      at: Date.parse(row.created_at),
      kind: 'attempt' as const,
      headline: `${slot} · ${nameFor(snapshot, row.player_id)} · ${description.label}`,
      detail: `${isReversal ? '' : '+'}${description.points} PTS · ATTEMPT ${row.attempt_number}`,
      reversed: row.status === 'reversed' && !isReversal,
      isReversal,
      undo:
        row.status === 'confirmed' && !isReversal && !reversedSet.has(row.id)
          ? {
              kind: 'attempt' as const,
              id: row.id,
              description: `${slot} attempt ${row.attempt_number} — ${description.label}`,
            }
          : null,
    };
  });
}

function goalEntries(snapshot: EventSnapshot): TimelineEntry[] {
  const rows: GoalRow[] = snapshot.goals;
  const reversedSet = reversedIds(rows);

  return rows.map((row) => {
    const isReversal = row.reverses_id !== null;
    const who = row.is_own_goal
      ? `OWN GOAL · ${nameFor(snapshot, row.own_goal_by_player_id)}`
      : nameFor(snapshot, row.scorer_id);
    const clock = formatShortClock(Number(row.clock_ms));
    return {
      id: `goal:${row.id}`,
      at: Date.parse(row.created_at),
      kind: 'goal' as const,
      headline: `GOAL TEAM ${row.team_code} · ${who}`,
      detail: `${clock} · HALF ${row.half} · ${row.method.replace(/_/g, ' ').toUpperCase()}`,
      reversed: row.status === 'reversed' && !isReversal,
      isReversal,
      undo:
        row.status === 'confirmed' && !isReversal && !reversedSet.has(row.id)
          ? { kind: 'goal' as const, id: row.id, description: `Team ${row.team_code} goal at ${clock}` }
          : null,
    };
  });
}

function penaltyEntries(snapshot: EventSnapshot): TimelineEntry[] {
  const rows: PenaltyAttemptRow[] = snapshot.penaltyAttempts;
  const reversedSet = reversedIds(rows);

  return rows.map((row) => {
    const isReversal = row.reverses_id !== null;
    return {
      id: `penalty:${row.id}`,
      at: Date.parse(row.created_at),
      kind: 'penalty' as const,
      headline: `PENALTY ${row.sequence} · TEAM ${row.team_code} · ${nameFor(snapshot, row.player_id)}`,
      detail: row.scored ? 'SCORED' : 'MISSED',
      reversed: row.status === 'reversed' && !isReversal,
      isReversal,
      undo:
        row.status === 'confirmed' && !isReversal && !reversedSet.has(row.id)
          ? {
              kind: 'penalty' as const,
              id: row.id,
              description: `Penalty ${row.sequence} for team ${row.team_code}`,
            }
          : null,
    };
  });
}

/** `12:04` for a match clock in the timeline. */
export function formatShortClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

/**
 * The recent-event rail. Reads straight from the snapshot so it survives a
 * reload and shows what *other* devices did, then merges in this session's
 * lifecycle commands (starting a round, publishing a result) which leave no
 * scoring row of their own.
 */
export function buildTimeline(
  snapshot: EventSnapshot,
  config: ChallengeConfig | null,
  notes: JournalNote[],
  limit = 14,
): TimelineEntry[] {
  const noteEntries: TimelineEntry[] = notes.map((note) => ({
    id: `note:${note.id}`,
    at: note.at,
    kind: 'note',
    headline: note.label,
    detail: '',
    reversed: false,
    isReversal: false,
    undo: null,
  }));

  return [
    ...attemptEntries(snapshot, config),
    ...goalEntries(snapshot),
    ...penaltyEntries(snapshot),
    ...noteEntries,
  ]
    .filter((entry) => Number.isFinite(entry.at))
    .sort((a, b) => b.at - a.at)
    .slice(0, limit);
}

/** The most recent action that can still be reversed. */
export function undoTargetOf(entries: TimelineEntry[]): UndoTarget | null {
  return entries.find((entry) => entry.undo !== null)?.undo ?? null;
}

/** `just now`, `12s ago`, `4m ago` — for the lease heartbeat and the rail. */
export function relativeTime(fromMs: number, nowMs: number): string {
  const delta = Math.max(0, nowMs - fromMs);
  if (delta < 2_000) return 'just now';
  if (delta < 60_000) return `${Math.round(delta / 1000)}s ago`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m ago`;
  return `${Math.round(delta / 3_600_000)}h ago`;
}
