/**
 * Per-mechanic reading of a player's attempts.
 *
 * Challenge 1 and 3 are worth per-shot values; challenge 2 is a stopwatch plus
 * a finish; challenge 4 is ten balls against a 60-second countdown. The live
 * round scene shows a different rail for each, and every point value comes from
 * the scoring profile rather than from a constant here.
 */

import { attemptsPerPlayer } from '@/lib/scoring/engine';
import type { AttemptDotState } from '@/components/ui';
import type {
  AttemptPayload,
  AttemptRow,
  ChallengeConfig,
  ChallengeMechanic,
  TargetOption,
} from '@/lib/types';

export interface AttemptRail {
  /** One dot per attempt, padded out to the mechanic's full allowance. */
  states: AttemptDotState[];
  /** Points under each dot. Omitted for the ten-ball rail, which is pass/fail. */
  values?: Array<number | null>;
  total: number;
  played: number;
  /** `ATTEMPT 2 / 3`, or `BALL 7 / 10`. */
  label: string;
  /** What the most recent attempt actually was — `TARGET 50`, `12.4s • SCORED`. */
  lastDetail: string | null;
}

const EMPTY_RAIL: AttemptRail = {
  states: [],
  total: 0,
  played: 0,
  label: '',
  lastDetail: null,
};

function payloadOf(attempt: AttemptRow): AttemptPayload | null {
  const raw = attempt.payload as Partial<AttemptPayload> | undefined;
  return raw && typeof raw === 'object' && 'kind' in raw ? (raw as AttemptPayload) : null;
}

function optionLabel(options: TargetOption[], id: string | null): string | null {
  if (!id) return null;
  return options.find((o) => o.id === id)?.label ?? null;
}

/** Seconds with one decimal, the way the dribble stopwatch reads. */
export function seconds(ms: number): string {
  return `${(Math.max(0, ms) / 1000).toFixed(1)}s`;
}

/**
 * Build the rail for one side of a round.
 *
 * `live` marks the next unplayed slot as the active one, which is what pulses
 * on screen while the player is on the ball.
 */
export function buildAttemptRail(
  config: ChallengeConfig | null,
  attempts: AttemptRow[],
  live: boolean,
): AttemptRail {
  if (!config || config.mechanic === 'final_match') return EMPTY_RAIL;

  const total = attemptsPerPlayer(config);
  const confirmed = attempts
    .filter((a) => a.status === 'confirmed')
    .sort((x, y) => x.attempt_number - y.attempt_number);

  const states: AttemptDotState[] = [];
  const values: Array<number | null> = [];
  let lastDetail: string | null = null;

  for (const attempt of confirmed) {
    const payload = payloadOf(attempt);
    switch (config.mechanic) {
      case 'mannequin_target': {
        const id = payload?.kind === 'mannequin_target' ? payload.targetId : null;
        states.push(attempt.points > 0 ? 'hit' : 'miss');
        values.push(attempt.points);
        lastDetail = optionLabel(config.targets, id) ?? 'MISS';
        break;
      }
      case 'long_range': {
        const id = payload?.kind === 'long_range' ? payload.zoneId : null;
        states.push(attempt.points > 0 ? 'hit' : 'miss');
        values.push(attempt.points);
        lastDetail = optionLabel(config.zones, id) ?? 'MISS';
        break;
      }
      case 'dribble_finish': {
        const scored = payload?.kind === 'dribble_finish' ? payload.scored : false;
        const timeMs = payload?.kind === 'dribble_finish' ? payload.timeMs : 0;
        states.push(attempt.points > 0 ? 'hit' : 'miss');
        values.push(attempt.points);
        lastDetail = `${seconds(timeMs)} • ${scored ? 'SCORED' : 'NO GOAL'}`;
        break;
      }
      case 'center_circle': {
        const hit = payload?.kind === 'center_circle' ? payload.hit : attempt.points > 0;
        states.push(hit ? 'hit' : 'miss');
        values.push(null);
        lastDetail = hit ? 'IN THE CIRCLE' : 'OUT';
        break;
      }
    }
  }

  const played = states.length;
  if (live && played < total) {
    states.push('active');
    values.push(null);
  }
  while (states.length < total) {
    states.push('pending');
    values.push(null);
  }

  const unit = config.mechanic === 'center_circle' ? 'BALL' : 'ATTEMPT';
  const position = Math.min(played + (live ? 1 : 0), total);

  return {
    states,
    values: config.mechanic === 'center_circle' ? undefined : values,
    total,
    played,
    label: live
      ? `${unit} ${Math.max(1, position)} / ${total}`
      : `${played} / ${total} ${unit === 'BALL' ? 'BALLS' : 'ATTEMPTS'}`,
    lastDetail,
  };
}

/** Short spectator-facing description of how a mechanic scores. */
export function mechanicRule(config: ChallengeConfig | null): string {
  if (!config) return '';
  switch (config.mechanic) {
    case 'mannequin_target':
      return config.targets
        .map((t) => `${t.label} = ${t.points}`)
        .join('   ');
    case 'long_range':
      return config.zones.map((z) => `${z.label} = ${z.points}`).join('   ');
    case 'dribble_finish':
      return `UNDER ${Math.round(config.dribbleThresholdMs / 1000)}S = ${config.dribbleBonusPoints}   GOAL = ${config.goalPoints}   MAX ${config.maxPointsPerAttempt}`;
    case 'center_circle':
      return `${config.ballsPerPlayer} BALLS   ${Math.round(config.timeLimitMs / 1000)} SECONDS   ${config.pointsPerHit} PT EACH`;
    case 'final_match':
      return `${config.halves} HALVES   ${Math.round(config.halfDurationMs / 60000)} MINUTES EACH`;
  }
}

/** Does this mechanic run a clock the audience should see? */
export function mechanicUsesClock(mechanic: ChallengeMechanic | null): boolean {
  return mechanic === 'dribble_finish' || mechanic === 'center_circle';
}

/** Tenths matter on the dribble stopwatch and the centre-circle countdown. */
export function mechanicWantsTenths(mechanic: ChallengeMechanic | null): boolean {
  return mechanicUsesClock(mechanic);
}
