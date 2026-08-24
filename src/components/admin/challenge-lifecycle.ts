/**
 * Operator-facing vocabulary for the challenge and round lifecycle.
 *
 * The database speaks in enum strings — `awaiting_result`, `result_ready` —
 * which are precise and unreadable across a control room at speed. This module
 * is the translation layer, plus the two derived facts every lifecycle screen
 * needs: how far through its rounds a challenge is, and whether it is safe to
 * close.
 *
 * Every label carries a glyph as well as a tone, because state on these screens
 * decides whether an operator ends a challenge in front of an audience and must
 * never be readable by colour alone.
 */

import { computeChallengeResult, type ChallengeResult } from '@/lib/scoring/engine';
import type {
  ChallengeMechanic,
  ChallengeRow,
  ChallengeStatus,
  ResultOutcome,
  RoundRow,
  RoundStatus,
  TeamCode,
  TeamRow,
} from '@/lib/types';
import type { StatusPillTone } from '@/components/ui';

export interface LifecycleLabel {
  label: string;
  tone: StatusPillTone;
}

const CHALLENGE_STATUS: Record<ChallengeStatus, LifecycleLabel> = {
  draft: { label: 'DRAFT', tone: 'neutral' },
  ready: { label: 'READY', tone: 'pending' },
  locked: { label: 'LINEUP LOCKED', tone: 'pending' },
  live: { label: 'LIVE', tone: 'live' },
  completed: { label: 'COMPLETED', tone: 'winner' },
};

export function challengeStatusLabel(status: ChallengeStatus): LifecycleLabel {
  return CHALLENGE_STATUS[status] ?? { label: String(status).toUpperCase(), tone: 'neutral' };
}

const ROUND_STATUS: Record<RoundStatus, LifecycleLabel> = {
  pending: { label: 'NOT STARTED', tone: 'neutral' },
  ready: { label: 'READY', tone: 'pending' },
  live: { label: 'LIVE', tone: 'live' },
  awaiting_result: { label: 'AWAITING RESULT', tone: 'pending' },
  result_ready: { label: 'RESULT READY', tone: 'accent' },
  published: { label: 'PUBLISHED', tone: 'winner' },
  completed: { label: 'PUBLISHED', tone: 'winner' },
};

export function roundStatusLabel(status: RoundStatus): LifecycleLabel {
  return ROUND_STATUS[status] ?? { label: String(status).toUpperCase(), tone: 'neutral' };
}

const MECHANIC: Record<ChallengeMechanic, string> = {
  mannequin_target: 'Mannequin target',
  dribble_finish: 'Dribble & finish',
  long_range: 'Long-range shooting',
  center_circle: 'Centre circle accuracy',
  final_match: 'Final 5v5 match',
};

export function mechanicLabel(mechanic: ChallengeMechanic): string {
  return MECHANIC[mechanic] ?? mechanic;
}

/** A round whose points have reached the ledger. Both terminal statuses count. */
export function isRoundPublished(round: RoundRow): boolean {
  return round.status === 'published' || round.status === 'completed';
}

export interface RoundProgress {
  published: number;
  total: number;
  /** `5 / 5 rounds published`, ready to print. */
  text: string;
  /** True when there is at least one round and all of them are published. */
  complete: boolean;
}

export function roundProgress(rounds: RoundRow[]): RoundProgress {
  const total = rounds.length;
  const published = rounds.filter(isRoundPublished).length;
  return {
    published,
    total,
    text:
      total === 0
        ? 'No rounds — scored as a match'
        : `${published} / ${total} rounds published`,
    complete: total > 0 && published === total,
  };
}

/**
 * What `completeChallenge` will compute if it is run right now.
 *
 * Deliberately the same function the server action uses, fed the same rows, so
 * the figure an operator approves in the confirmation is the figure that gets
 * published — not a second implementation that can drift from it.
 */
export function previewChallengeResult(
  challenge: ChallengeRow,
  rounds: RoundRow[],
): ChallengeResult {
  const aggregation =
    challenge.aggregation_rule === 'round_wins' ? 'round_wins' : 'total_points';
  return computeChallengeResult(
    rounds.map((r) => ({
      score_a: Number(r.score_a),
      score_b: Number(r.score_b),
      winner: r.winner,
    })),
    aggregation,
  );
}

/** The name to print for one side — never the hardcoded letter. */
export function sideName(
  teamsByCode: Record<TeamCode, TeamRow | null> | undefined,
  code: TeamCode,
): string {
  return teamsByCode?.[code]?.name ?? `Team ${code}`;
}

/** How a winner is announced, using the real team names. */
export function outcomeName(
  teamsByCode: Record<TeamCode, TeamRow | null> | undefined,
  outcome: ResultOutcome | null,
): string {
  if (outcome === null) return 'Not decided';
  if (outcome === 'draw') return 'Draw';
  return sideName(teamsByCode, outcome);
}

/** `C3 · R2` — the short reference an operator says out loud. */
export function pinReference(
  challenge: ChallengeRow | null | undefined,
  round: RoundRow | null | undefined,
): string {
  if (!challenge && !round) return '—';
  const c = challenge ? `C${challenge.number}` : 'C?';
  return round ? `${c} · R${round.number}` : c;
}
