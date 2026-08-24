import { describe, expect, it } from 'vitest';
import { computeShootoutState } from '@/lib/scoring/engine';

type Kick = { sequence: number; team_code: 'A' | 'B'; scored: boolean; status: string };

/**
 * Reference simulator: the FIFA rule, written independently.
 * Returns, for a full outcome script, the index at which the shootout ends
 * (i.e. how many kicks are actually taken) and the winner.
 */
function reference(script: boolean[], N: number) {
  let sA = 0, sB = 0, tA = 0, tB = 0;
  for (let i = 0; i < script.length; i++) {
    const side: 'A' | 'B' = i % 2 === 0 ? 'A' : 'B';
    if (side === 'A') { tA++; if (script[i]) sA++; } else { tB++; if (script[i]) sB++; }

    const openingOver = tA >= N && tB >= N;
    if (!openingOver) {
      const rA = Math.max(0, N - tA), rB = Math.max(0, N - tB);
      if (sA > sB + rB) return { end: i + 1, winner: 'A' as const };
      if (sB > sA + rA) return { end: i + 1, winner: 'B' as const };
    } else if (tA === tB && sA !== sB) {
      return { end: i + 1, winner: sA > sB ? ('A' as const) : ('B' as const) };
    }
  }
  return { end: null, winner: null };
}

function kicksFrom(script: boolean[]): Kick[] {
  return script.map((scored, i) => ({
    sequence: i + 1,
    team_code: (i % 2 === 0 ? 'A' : 'B') as 'A' | 'B',
    scored,
    status: 'confirmed',
  }));
}

describe('PROBE: exhaustive shootout decision correctness', () => {
  for (const N of [3, 5]) {
    it(`never declares a false result for openingAttempts=${N}`, () => {
      const MAX = N === 3 ? 12 : 14;
      const falsePositives: string[] = [];
      const falseNegatives: string[] = [];
      const wrongWinner: string[] = [];

      for (let len = 0; len <= MAX; len++) {
        for (let mask = 0; mask < 1 << len; mask++) {
          const script = Array.from({ length: len }, (_, i) => Boolean(mask & (1 << i)));
          const ref = reference(script, N);
          // Only consider prefixes the shootout would actually have reached.
          if (ref.end !== null && ref.end < len) continue;

          const state = computeShootoutState(kicksFrom(script), {
            openingAttempts: N,
            suddenDeath: true,
          });
          const shouldBeDecided = ref.end === len && ref.end !== null;

          const label = script.map((s) => (s ? '1' : '0')).join('') || '(none)';
          if (state.decided && !shouldBeDecided) falsePositives.push(label);
          if (!state.decided && shouldBeDecided) falseNegatives.push(label);
          if (shouldBeDecided && state.winner !== ref.winner) wrongWinner.push(label);
        }
      }

      expect({ falsePositives: falsePositives.slice(0, 5), falseNegatives: falseNegatives.slice(0, 5), wrongWinner: wrongWinner.slice(0, 5) })
        .toEqual({ falsePositives: [], falseNegatives: [], wrongWinner: [] });
    });
  }

  it('PROBE: third clause of `decided` is provably redundant', () => {
    // Re-derive both sub-expressions across the same exhaustive space.
    let differs = 0;
    for (const N of [1, 2, 3, 5]) {
      for (let len = 0; len <= 10; len++) {
        for (let mask = 0; mask < 1 << len; mask++) {
          const script = Array.from({ length: len }, (_, i) => Boolean(mask & (1 << i)));
          const s = computeShootoutState(kicksFrom(script), { openingAttempts: N, suddenDeath: true });
          const openingComplete = s.takenA >= N && s.takenB >= N;
          const clause = openingComplete && s.takenA === s.takenB && s.scoreA !== s.scoreB;
          const withoutThird = s.mathematicallyDecided || clause;
          if (withoutThird !== s.decided) differs++;
        }
      }
    }
    expect(differs).toBe(0);
  });

  it('PROBE: inSuddenDeath when a shootout ends inside the opening set', () => {
    // 2-1 after three kicks each with openingAttempts=3: decided in regulation,
    // sudden death never happened.
    const s = computeShootoutState(
      kicksFrom([true, true, false, false, true, false]),
      { openingAttempts: 3, suddenDeath: true },
    );
    expect({ decided: s.decided, winner: s.winner, inSuddenDeath: s.inSuddenDeath })
      .toEqual({ decided: true, winner: 'A', inSuddenDeath: false });
  });
});
