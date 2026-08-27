/**
 * The rescue control's guard.
 *
 * One round at a time is the right rule, and it is also what turns a mis-tap on
 * a tablet at pitch side into a stalled show: the wrong round is open, and the
 * correct one cannot start behind it. PUT BACK is the only exit that does not
 * either invent an official result or destroy a challenge's real ones, so its
 * guard is pinned here in both directions — it must open for the mis-tap, and
 * it must stay shut over a round that was genuinely played.
 */

import { describe, expect, it } from 'vitest';

import { putBackDecision } from '@/components/controller/RoundStartRail';

describe('putBackDecision', () => {
  it('opens the exit for a mis-tapped round with nothing recorded', () => {
    expect(
      putBackDecision({ canMutate: true, isCurrentRound: true, confirmedOnCurrent: 0 }),
    ).toEqual({ allowed: true, reason: '' });
  });

  it('refuses a round that has been played, and says what is on it', () => {
    const one = putBackDecision({
      canMutate: true,
      isCurrentRound: true,
      confirmedOnCurrent: 1,
    });
    expect(one.allowed).toBe(false);
    expect(one.reason).toContain('1 attempt recorded');

    const many = putBackDecision({
      canMutate: true,
      isCurrentRound: true,
      confirmedOnCurrent: 4,
    });
    expect(many.allowed).toBe(false);
    expect(many.reason).toContain('4 attempts recorded');
  });

  it('defers to the server for a round the snapshot cannot see attempts for', () => {
    // Attempts travel with the current round only. A stale open round from
    // another challenge is not provably empty here — the control offers itself
    // and the command refuses if anything is on it.
    expect(
      putBackDecision({ canMutate: false, isCurrentRound: false, confirmedOnCurrent: 9 }).allowed,
    ).toBe(false);
    expect(
      putBackDecision({ canMutate: true, isCurrentRound: false, confirmedOnCurrent: 9 }),
    ).toEqual({ allowed: true, reason: '' });
  });

  it('never offers the exit to a device without the controls', () => {
    const d = putBackDecision({
      canMutate: false,
      isCurrentRound: true,
      confirmedOnCurrent: 0,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('does not hold the controls');
  });
});
