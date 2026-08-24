import { describe, expect, it } from 'vitest';

import { challengesCompetitionTotals, computeDayScore } from '@/lib/scoring/engine';

/**
 * The day as two competitions — the format the organiser confirmed on
 * 24 Aug 2026. One day point for the four skills challenges, one for the 5v5;
 * golden goal means the match always has a winner; a 1–1 day goes to the
 * shootout, whose winner takes the day.
 */
describe('computeDayScore', () => {
  it('sweep: the same team takes both competitions 2–0', () => {
    const day = computeDayScore('A', 'A', null);
    expect(day).toMatchObject({ a: 2, b: 0, winner: 'A', decidedBy: 'sweep', needsShootout: false });
  });

  it('split: 1–1 needs the shootout and names no winner yet', () => {
    const day = computeDayScore('A', 'B', null);
    expect(day).toMatchObject({ a: 1, b: 1, winner: null, needsShootout: true, decidedBy: null });
  });

  it('split settled: the shootout winner takes the day', () => {
    const day = computeDayScore('A', 'B', 'B');
    expect(day).toMatchObject({ a: 1, b: 1, winner: 'B', decidedBy: 'shootout', needsShootout: false });
  });

  it('a drawn challenges competition leaves the match winner to take the day 1–0', () => {
    const day = computeDayScore('draw', 'B', null);
    expect(day).toMatchObject({ a: 0, b: 1, winner: 'B', needsShootout: false });
  });

  it('undecided while the match has no winner', () => {
    expect(computeDayScore('A', null, null)).toMatchObject({
      a: 1, b: 0, winner: null, bothPlayed: false, needsShootout: false,
    });
    // A 'draw' match result cannot stand under golden goal; treat it as unfinished.
    expect(computeDayScore('A', 'draw', null)).toMatchObject({ winner: null, bothPlayed: false });
  });

  it('a shootout winner is ignored while the day is not level', () => {
    // Guards against a stale shootout row from an earlier format overriding a sweep.
    const day = computeDayScore('B', 'B', 'A');
    expect(day).toMatchObject({ winner: 'B', decidedBy: 'sweep' });
  });
});

describe('challengesCompetitionTotals', () => {
  it('sums round scores and names the competition winner', () => {
    const totals = challengesCompetitionTotals([
      { score_a: 8, score_b: 7 },
      { score_a: 4, score_b: 9 },
      { score_a: 7, score_b: 7 },
    ]);
    expect(totals).toEqual({ scoreA: 19, scoreB: 23, winner: 'B' });
  });

  it('tolerates numeric strings from the database driver', () => {
    const totals = challengesCompetitionTotals([
      { score_a: '10' as unknown as number, score_b: '12' as unknown as number },
    ]);
    expect(totals).toEqual({ scoreA: 10, scoreB: 12, winner: 'B' });
  });

  it('an empty set is a level competition', () => {
    expect(challengesCompetitionTotals([]).winner).toBe('draw');
  });
});
