/**
 * The auto-director's steady state, walked through the show's worst seconds.
 *
 * Every scenario here is one the room has actually produced: a result
 * published and the next round started inside the same second, a challenge
 * completed with the operator's thumb already on the next START, a wall whose
 * clock does not quite agree with the server's. The steady state is a pure
 * function of (snapshot, clock), which is what makes the worst seconds
 * testable at all — no timers, no waiting, just the timeline replayed.
 */

import { describe, expect, it } from 'vitest';

import { buildSampleSnapshot } from '@/components/tv/sample-model';
import {
  anchoredNow,
  directedScene,
  steadyAutoScene,
} from '@/components/tv/use-auto-director';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { ChallengeRow, RoundRow } from '@/lib/types';

/** An arbitrary, fixed show night. All offsets in the tests are from here. */
const T = Date.parse('2026-08-29T18:00:00.000Z');

const at = (offsetMs: number) => new Date(T + offsetMs).toISOString();

interface RoundSpec {
  challenge: ChallengeRow;
  number: number;
  status: RoundRow['status'];
  publishedAtMs?: number;
}

/**
 * A snapshot reshaped to an exact competition state. Everything not named —
 * players, lineups, sponsors, scoring — is the sample event's, because the
 * steady state must not depend on any of it.
 */
function snapshotWith(
  rounds: RoundSpec[],
  options: { completedAtMs?: Map<string, number> } = {},
): EventSnapshot {
  const base = buildSampleSnapshot('live_round');
  const template = base.allRounds[0];

  const allRounds: RoundRow[] = rounds.map((spec, index) => ({
    ...template,
    id: `round-${spec.challenge.number}-${spec.number}`,
    challenge_id: spec.challenge.id,
    number: spec.number,
    status: spec.status,
    published_at:
      spec.publishedAtMs === undefined ? null : at(spec.publishedAtMs),
    completed_at: null,
    revision: index,
  }));

  const challenges = base.challenges.map((challenge) => {
    const completedAt = options.completedAtMs?.get(challenge.id);
    return completedAt === undefined
      ? { ...challenge, completed_at: null }
      : { ...challenge, status: 'completed' as const, completed_at: at(completedAt) };
  });

  return { ...base, match: null, allRounds, rounds: allRounds, challenges };
}

function challengeNumber(snapshot: EventSnapshot, n: number): ChallengeRow {
  const found = snapshot.challenges.find(
    (c) => c.number === n && c.mechanic !== 'final_match',
  );
  if (!found) throw new Error(`sample snapshot has no 1v1 challenge #${n}`);
  return found;
}

const sample = buildSampleSnapshot('live_round');
const c1 = challengeNumber(sample, 1);
const c2 = challengeNumber(sample, 2);

describe('steadyAutoScene: the result hold', () => {
  it('holds a just-published result over a round that went live the same second', () => {
    const snapshot = snapshotWith([
      { challenge: c1, number: 1, status: 'published', publishedAtMs: 0 },
      { challenge: c1, number: 2, status: 'live' },
    ]);

    expect(steadyAutoScene(snapshot, T + 1_000)).toEqual({
      scene: 'round_result',
      payload: { challengeId: c1.id, roundId: 'round-1-1' },
    });
    // Still holding just before the floor.
    expect(steadyAutoScene(snapshot, T + 11_900).scene).toBe('round_result');
    // The instant the floor passes, the live round owns the wall.
    expect(steadyAutoScene(snapshot, T + 12_100)).toEqual({
      scene: 'live_round',
      payload: { challengeId: c1.id, roundId: 'round-1-2' },
    });
  });

  it('survives a wall clock slightly behind the server', () => {
    // published_at one second in the wall's future — NTP drift, not time travel.
    const snapshot = snapshotWith([
      { challenge: c1, number: 1, status: 'published', publishedAtMs: 1_000 },
      { challenge: c1, number: 2, status: 'live' },
    ]);
    expect(steadyAutoScene(snapshot, T).scene).toBe('round_result');
  });

  it('drops the hold the moment a reopen clears published_at', () => {
    const snapshot = snapshotWith([
      { challenge: c1, number: 1, status: 'result_ready' },
    ]);
    expect(steadyAutoScene(snapshot, T + 1_000).scene).toBe('live_round');
  });
});

describe('steadyAutoScene: the challenge hold', () => {
  it('plays round result, then challenge result, then the next live round', () => {
    // R5 published at T, the challenge completed two seconds later, and the
    // next challenge's first round started immediately after that — the
    // operator at full speed. The room still sees every card.
    const snapshot = snapshotWith(
      [
        { challenge: c1, number: 1, status: 'completed', publishedAtMs: -300_000 },
        { challenge: c1, number: 2, status: 'completed', publishedAtMs: -240_000 },
        { challenge: c1, number: 3, status: 'completed', publishedAtMs: -180_000 },
        { challenge: c1, number: 4, status: 'completed', publishedAtMs: -120_000 },
        { challenge: c1, number: 5, status: 'completed', publishedAtMs: 0 },
        { challenge: c2, number: 1, status: 'live' },
      ],
      { completedAtMs: new Map([[c1.id, 2_000]]) },
    );

    // The round the room just watched, first.
    expect(steadyAutoScene(snapshot, T + 5_000).scene).toBe('round_result');
    // Its floor passes at T+12s; the challenge card takes over…
    expect(steadyAutoScene(snapshot, T + 13_000)).toEqual({
      scene: 'challenge_result',
      payload: { challengeId: c1.id },
    });
    // …holds through its own floor (completed_at + 20s)…
    expect(steadyAutoScene(snapshot, T + 21_500).scene).toBe('challenge_result');
    // …and only then hands the wall to the next round.
    expect(steadyAutoScene(snapshot, T + 22_500)).toEqual({
      scene: 'live_round',
      payload: { challengeId: c2.id, roundId: 'round-2-1' },
    });
  });

  it('shows the completed challenge indefinitely when nothing else starts', () => {
    const snapshot = snapshotWith(
      [
        { challenge: c1, number: 1, status: 'completed', publishedAtMs: -300_000 },
        { challenge: c1, number: 2, status: 'completed', publishedAtMs: -240_000 },
        { challenge: c1, number: 3, status: 'completed', publishedAtMs: -180_000 },
        { challenge: c1, number: 4, status: 'completed', publishedAtMs: -120_000 },
        { challenge: c1, number: 5, status: 'completed', publishedAtMs: -60_000 },
      ],
      { completedAtMs: new Map([[c1.id, -30_000]]) },
    );
    // Both holds long expired; the steady state still rests on the card.
    expect(steadyAutoScene(snapshot, T).scene).toBe('challenge_result');
  });
});

describe('steadyAutoScene: precedence', () => {
  it('gives the 5v5 the wall over any open hold window', () => {
    const held = snapshotWith([
      { challenge: c1, number: 5, status: 'published', publishedAtMs: 0 },
    ]);
    const snapshot: EventSnapshot = {
      ...held,
      match: { ...buildSampleSnapshot('final_match').match!, status: 'live' },
    };
    expect(steadyAutoScene(snapshot, T + 1_000).scene).toBe('final_match');
  });

  it('rests on lineups once a challenge is open, and holding before that', () => {
    const opened = snapshotWith([{ challenge: c1, number: 1, status: 'pending' }]);
    // The sample event has challenge 1 live: its team sheet is the frame.
    expect(steadyAutoScene(opened, T).scene).toBe('lineups');

    const untouched: EventSnapshot = {
      ...opened,
      challenges: opened.challenges.map((c) => ({ ...c, status: 'draft' as const })),
    };
    expect(steadyAutoScene(untouched, T).scene).toBe('holding');
  });
});

describe('directedScene: the decision the wall actually runs', () => {
  // These cover the hook's own return rather than the steady state alone.
  // The precedence tests above passed while the wall did the opposite, because
  // they exercised the pure function and the wall ran the hook.

  const matchSnapshot = (status: string) => {
    const held = snapshotWith([
      { challenge: c1, number: 5, status: 'published', publishedAtMs: 0 },
    ]);
    return {
      ...held,
      match: { ...buildSampleSnapshot('final_match').match!, status },
    } as EventSnapshot;
  };

  it('gives the live 5v5 the wall even with a result hold wide open', () => {
    // Ending a challenge mid-final stamps a fresh hold. The match still wins.
    expect(directedScene(matchSnapshot('live'), T + 1_000, null).scene).toBe(
      'final_match',
    );
  });

  it('keeps the ceremony leaderboard even when an old round is republished', () => {
    // A correction during the ceremony must not cut a 1v1 card over the podium.
    expect(directedScene(matchSnapshot('completed'), T + 1_000, null).scene).toBe(
      'leaderboard',
    );
  });

  it('lets a hold outrank an entrance that was already playing', () => {
    const snapshot = snapshotWith([
      { challenge: c1, number: 1, status: 'published', publishedAtMs: 0 },
      { challenge: c1, number: 2, status: 'live' },
    ]);
    const entrance = {
      scene: 'head_to_head' as const,
      payload: { challengeId: c1.id, roundId: 'round-1-2' },
    };
    expect(directedScene(snapshot, T + 2_000, entrance).scene).toBe('round_result');
    // ...and hands the entrance back the moment the floor passes.
    expect(directedScene(snapshot, T + 13_000, entrance)).toEqual(entrance);
  });
});

describe('anchoredNow: the wall clock is never trusted', () => {
  it('reads in the server frame when the wall is badly behind', () => {
    // Venue display 90s slow. Raw, every hold would stay open for 102 seconds,
    // parking a result card straight over the next round being played.
    const serverAt = T;
    const wallAt = T - 90_000;
    const anchor = { fetchedAt: serverAt, clientAt: wallAt };

    // Five seconds later by the wall's own reckoning.
    expect(anchoredNow(anchor, wallAt + 5_000)).toBe(serverAt + 5_000);

    const snapshot = snapshotWith([
      { challenge: c1, number: 1, status: 'published', publishedAtMs: 0 },
      { challenge: c1, number: 2, status: 'live' },
    ]);
    // Held early...
    expect(directedScene(snapshot, anchoredNow(anchor, wallAt + 3_000), null).scene)
      .toBe('round_result');
    // ...and released on time, in real seconds, despite the skew.
    expect(directedScene(snapshot, anchoredNow(anchor, wallAt + 13_000), null).scene)
      .toBe('live_round');
  });

  it('reads in the server frame when the wall is ahead', () => {
    // The other direction is the one that skips results outright.
    const anchor = { fetchedAt: T, clientAt: T + 45_000 };
    const snapshot = snapshotWith([
      { challenge: c1, number: 1, status: 'published', publishedAtMs: 0 },
      { challenge: c1, number: 2, status: 'live' },
    ]);
    expect(directedScene(snapshot, anchoredNow(anchor, T + 45_000 + 2_000), null).scene)
      .toBe('round_result');
  });

  it('falls back to the raw clock before a snapshot has landed', () => {
    expect(anchoredNow(null, 1234)).toBe(1234);
  });
});
