import { describe, expect, it } from 'vitest';

import { deriveLiveState } from '@/components/public/live-state';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { ChallengeRow } from '@/lib/types';

/**
 * These pin the one combination that took /live down with a 500 on the live
 * site, at the worst possible moment: the instant the competition finished and
 * the crowd went to look at the final score.
 *
 * `event_complete` reports `hasFocus: true` (there IS something worth showing)
 * together with `isMatch: false`. A consumer that reads those two and concludes
 * "render the 1v1 round view" then dereferences a round that does not exist —
 * once every challenge is done the current challenge is the final match, which
 * has no rounds at all.
 *
 * The contract is therefore: hasFocus does NOT promise a current round. Any
 * surface drawing a round must check for one. If someone later changes these
 * flags, this test should make them think about that consumer.
 */

function challenge(number: number, status: ChallengeRow['status']): ChallengeRow {
  return {
    id: `challenge-${number}`,
    event_id: 'event',
    number,
    mechanic: number === 5 ? 'final_match' : 'mannequin_target',
    title: `CHALLENGE ${number}`,
    subtitle: null,
    description: null,
    status,
    aggregation_rule: 'total_points',
    round_count: number === 5 ? 1 : 5,
    locked_at: null,
    completed_at: null,
    winner: null,
  };
}

/** A snapshot carrying only what deriveLiveState actually reads. */
function snapshotWith(challenges: ChallengeRow[]): EventSnapshot {
  return {
    // Only the paths that do NOT short-circuit on "everything finished" reach
    // `event.status`, so this has to be present for the unfinished cases.
    event: { id: 'event', status: 'draft' },
    challenges,
    currentChallenge: challenges[challenges.length - 1] ?? null,
    // The crux: the finished event's current challenge is the final match, so
    // there is no round and no pairing to draw.
    rounds: [],
    currentRound: null,
    attempts: [],
    roundTotals: null,
    match: null,
    goals: [],
    matchTotals: null,
    shootout: null,
    penaltyAttempts: [],
    penaltyTotals: null,
    shootoutState: null,
  } as unknown as EventSnapshot;
}

describe('deriveLiveState — completed competition', () => {
  const allDone = [1, 2, 3, 4, 5].map((n) => challenge(n, 'completed'));

  it('reports the competition as complete', () => {
    const state = deriveLiveState(snapshotWith(allDone));
    expect(state.status).toBe('event_complete');
    expect(state.isLive).toBe(false);
    expect(state.provisional).toBe(false);
  });

  it('claims focus without promising a round — the 500 that reached production', () => {
    const state = deriveLiveState(snapshotWith(allDone));
    expect(state.hasFocus).toBe(true);
    expect(state.isMatch).toBe(false);

    // With those two flags, a naive consumer renders the round view. Prove the
    // snapshot it would render from genuinely has nothing to render, so the
    // guard in src/app/(public)/live/page.tsx is load-bearing, not defensive
    // decoration.
    const snapshot = snapshotWith(allDone);
    expect(snapshot.currentRound).toBeNull();
    expect(snapshot.rounds).toHaveLength(0);
  });

  it('does not report completion while any challenge is unfinished', () => {
    const mixed = [
      challenge(1, 'completed'),
      challenge(2, 'live'),
      challenge(3, 'draft'),
      challenge(4, 'draft'),
      challenge(5, 'draft'),
    ];
    expect(deriveLiveState(snapshotWith(mixed)).status).not.toBe('event_complete');
  });

  it('does not report completion for an event with no challenges at all', () => {
    expect(deriveLiveState(snapshotWith([])).status).not.toBe('event_complete');
  });

  it('handles a null snapshot without throwing', () => {
    const state = deriveLiveState(null);
    expect(state.holding).toBe(true);
    expect(state.hasFocus).toBe(false);
  });
});
