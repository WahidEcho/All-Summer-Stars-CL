/**
 * Where a half's clock starts.
 *
 * The fault this pins: the second half was seeded from the time actually
 * banked, so blowing the first half up early at 12:00 started the second at
 * 12:00 and a match played to the whistle finished reading 32:00 instead of
 * 40:00. Every half after an early one was mis-stamped, on the wall and on the
 * controller both, because every surface derives the clock from the same row.
 */

import { describe, expect, it } from 'vitest';

import { halfStartMs } from '@/lib/scoring/engine';

const TWENTY = 20 * 60_000;
const base = { halves: 2, halfDurationMs: TWENTY };

describe('halfStartMs', () => {
  it('starts the first half at zero', () => {
    expect(halfStartMs({ ...base, half: 1, bankedMs: 0 })).toBe(0);
  });

  it('starts the second half at the half-time mark when the first ran full', () => {
    expect(halfStartMs({ ...base, half: 2, bankedMs: TWENTY })).toBe(TWENTY);
  });

  it('still starts the second half at the mark when the first was blown up early', () => {
    // The reported fault: first half ended at 12:00.
    expect(halfStartMs({ ...base, half: 2, bankedMs: 12 * 60_000 })).toBe(TWENTY);
  });

  it('never winds a half back when the previous one ran into stoppage', () => {
    // 22:30 played. The clock must not jump backwards to 20:00.
    const banked = 22 * 60_000 + 30_000;
    expect(halfStartMs({ ...base, half: 2, bankedMs: banked })).toBe(banked);
  });

  it('opens golden goal at full time, however the halves actually ran', () => {
    // Both halves cut short: golden goal still begins at 40:00.
    expect(
      halfStartMs({ ...base, half: 3, bankedMs: 25 * 60_000, goldenGoal: true }),
    ).toBe(2 * TWENTY);
    // Full time overrun carries through instead of winding back.
    const long = 43 * 60_000;
    expect(halfStartMs({ ...base, half: 3, bankedMs: long, goldenGoal: true })).toBe(long);
  });
});
