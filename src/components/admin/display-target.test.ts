/**
 * Tests for the display target and the challenge lifecycle vocabulary.
 *
 * These two modules decide what appears on a wall in front of an audience, and
 * they arrived without coverage: the target picker is now the only control for
 * `challengeId`/`roundId`, so a mistake in the payload translation is not a
 * cosmetic bug — it strands the show on the wrong round with no second control
 * to correct it from.
 *
 * Everything here is pure. The contract under test is the one `TvSurface` reads:
 * a payload carrying `roundId` and/or `challengeId` is a pin, and a payload
 * carrying neither means "follow the live challenge and round".
 */

import { describe, expect, it } from 'vitest';

import {
  FOLLOW_LIVE,
  TARGET_KEYS,
  describeTarget,
  isPinned,
  sameTarget,
  targetFromPayload,
  targetPayload,
  withoutTarget,
  type DisplayTarget,
} from '@/components/admin/DisplayTargetPicker';
import {
  isRoundPublished,
  outcomeName,
  pinReference,
  previewChallengeResult,
  roundProgress,
  roundStatusLabel,
  challengeStatusLabel,
  sideName,
} from '@/components/admin/challenge-lifecycle';
import { computeChallengeResult } from '@/lib/scoring/engine';
import type {
  ChallengeRow,
  ChallengeStatus,
  PlayerRow,
  RoundRow,
  RoundStatus,
  TeamCode,
  TeamRow,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function challenge(over: Partial<ChallengeRow> = {}): ChallengeRow {
  return {
    id: 'c2',
    event_id: 'e1',
    number: 2,
    mechanic: 'dribble_finish',
    title: 'DRIBBLE & FINISH',
    subtitle: null,
    description: null,
    status: 'live',
    aggregation_rule: 'total_points',
    round_count: 5,
    locked_at: null,
    completed_at: null,
    winner: null,
    ...over,
  };
}

function round(over: Partial<RoundRow> = {}): RoundRow {
  return {
    id: 'r3',
    challenge_id: 'c2',
    number: 3,
    status: 'live',
    player_a_id: 'p-a',
    player_b_id: 'p-b',
    score_a: 0,
    score_b: 0,
    winner: null,
    active_side: null,
    published_at: null,
    completed_at: null,
    revision: 0,
    ...over,
  };
}

function player(id: string, name: string): PlayerRow {
  return { id, display_name: name, full_name: name } as unknown as PlayerRow;
}

const PLAYERS: Record<string, PlayerRow> = {
  'p-a': player('p-a', 'AHMED HASSAN'),
  'p-b': player('p-b', 'HOSSAM GHALY'),
};

// The event is real: the teams are named, and nothing may print "Team A".
const TEAMS = {
  A: { id: 't-a', name: 'TELLR' } as unknown as TeamRow,
  B: { id: 't-b', name: 'Yalla Sahel' } as unknown as TeamRow,
} as Record<TeamCode, TeamRow | null>;

// ---------------------------------------------------------------------------
// Payload translation
// ---------------------------------------------------------------------------

describe('display target ↔ payload', () => {
  it('treats a payload with neither key as follow-live', () => {
    expect(targetFromPayload({}, [])).toEqual(FOLLOW_LIVE);
    expect(targetFromPayload({ headline: 'HELLO' }, [])).toEqual(FOLLOW_LIVE);
    expect(isPinned({})).toBe(false);
    expect(isPinned({ headline: 'HELLO' })).toBe(false);
  });

  it('ignores empty strings, so a cleared field is not read as a pin', () => {
    // The scene form stores every value as a string; a blank one must not
    // masquerade as a pinned id.
    expect(targetFromPayload({ challengeId: '', roundId: '' }, [])).toEqual(FOLLOW_LIVE);
    expect(isPinned({ challengeId: '' })).toBe(false);
  });

  it('reads a challenge pin', () => {
    expect(targetFromPayload({ challengeId: 'c4' }, [])).toEqual({
      kind: 'challenge',
      challengeId: 'c4',
    });
    expect(isPinned({ challengeId: 'c4' })).toBe(true);
  });

  it('resolves a bare roundId to its own challenge', () => {
    // TvSurface passes roundId straight to the snapshot, which drags the round's
    // challenge into view. The picker must agree, or the right column would open
    // on the wrong challenge.
    const rounds = [round({ id: 'r9', challenge_id: 'c5', number: 1 })];
    expect(targetFromPayload({ roundId: 'r9' }, rounds)).toEqual({
      kind: 'round',
      challengeId: 'c5',
      roundId: 'r9',
    });
  });

  it('falls back to the payload challengeId when the round is unknown', () => {
    expect(targetFromPayload({ roundId: 'r-gone', challengeId: 'c2' }, [])).toEqual({
      kind: 'round',
      challengeId: 'c2',
      roundId: 'r-gone',
    });
  });

  it('lets the round win when both keys disagree', () => {
    // A stale challengeId left beside a fresh roundId must not win: the round is
    // the more specific instruction and the snapshot resolves the challenge from
    // it.
    const rounds = [round({ id: 'r3', challenge_id: 'c2' })];
    expect(targetFromPayload({ roundId: 'r3', challengeId: 'c-stale' }, rounds)).toEqual({
      kind: 'round',
      challengeId: 'c2',
      roundId: 'r3',
    });
  });

  it('round-trips every target through a payload', () => {
    const rounds = [round({ id: 'r3', challenge_id: 'c2' })];
    const targets: DisplayTarget[] = [
      FOLLOW_LIVE,
      { kind: 'challenge', challengeId: 'c2' },
      { kind: 'round', challengeId: 'c2', roundId: 'r3' },
    ];
    for (const target of targets) {
      expect(targetFromPayload(targetPayload(target), rounds)).toEqual(target);
    }
  });

  it('emits nothing at all for follow-live', () => {
    // "No keys" is the whole signal. An explicit auto flag would be a third
    // state TvSurface does not read.
    expect(targetPayload(FOLLOW_LIVE)).toEqual({});
  });

  it('omits a blank challengeId from a round pin', () => {
    expect(targetPayload({ kind: 'round', challengeId: '', roundId: 'r3' })).toEqual({
      roundId: 'r3',
    });
  });
});

describe('withoutTarget', () => {
  it('strips both pin keys and keeps the scene’s own fields', () => {
    const payload = { headline: 'FULL TIME', challengeId: 'c2', roundId: 'r3', limit: 10 };
    expect(withoutTarget(payload)).toEqual({ headline: 'FULL TIME', limit: 10 });
  });

  it('does not mutate the payload it was given', () => {
    const payload = { challengeId: 'c2', roundId: 'r3' };
    withoutTarget(payload);
    expect(payload).toEqual({ challengeId: 'c2', roundId: 'r3' });
  });

  it('produces a payload that reads as follow-live', () => {
    expect(isPinned(withoutTarget({ challengeId: 'c2', roundId: 'r3' }))).toBe(false);
  });

  it('covers exactly the keys TvSurface reads', () => {
    expect([...TARGET_KEYS].sort()).toEqual(['challengeId', 'roundId']);
  });
});

describe('sameTarget', () => {
  it('compares like for like', () => {
    expect(sameTarget(FOLLOW_LIVE, FOLLOW_LIVE)).toBe(true);
    expect(sameTarget(FOLLOW_LIVE, { kind: 'challenge', challengeId: 'c2' })).toBe(false);
    expect(
      sameTarget({ kind: 'challenge', challengeId: 'c2' }, { kind: 'challenge', challengeId: 'c2' }),
    ).toBe(true);
    expect(
      sameTarget({ kind: 'challenge', challengeId: 'c2' }, { kind: 'challenge', challengeId: 'c3' }),
    ).toBe(false);
  });

  it('distinguishes a challenge pin from a round pin on the same challenge', () => {
    // These are different instructions: one lets the round follow live, the
    // other freezes it. The FOLLOW LIVE button's disabled state depends on it.
    expect(
      sameTarget(
        { kind: 'challenge', challengeId: 'c2' },
        { kind: 'round', challengeId: 'c2', roundId: 'r3' },
      ),
    ).toBe(false);
  });
});

describe('describeTarget', () => {
  const challenges = [challenge()];
  const rounds = [round()];

  it('names the mode when following live', () => {
    expect(describeTarget(FOLLOW_LIVE, challenges, rounds, PLAYERS)).toBe(
      'Following the live challenge and round',
    );
  });

  it('prints the challenge alone for a challenge pin', () => {
    expect(
      describeTarget({ kind: 'challenge', challengeId: 'c2' }, challenges, rounds, PLAYERS),
    ).toBe('C2 DRIBBLE & FINISH');
  });

  it('prints challenge, round and both players for a round pin', () => {
    expect(
      describeTarget(
        { kind: 'round', challengeId: 'c2', roundId: 'r3' },
        challenges,
        rounds,
        PLAYERS,
      ),
    ).toBe('C2 DRIBBLE & FINISH · R3 — AHMED HASSAN vs HOSSAM GHALY');
  });

  it('says so rather than crashing when a slot is empty', () => {
    const rs = [round({ player_b_id: null })];
    expect(
      describeTarget({ kind: 'round', challengeId: 'c2', roundId: 'r3' }, challenges, rs, PLAYERS),
    ).toContain('Empty slot');
  });

  it('degrades to a readable string when the challenge is gone', () => {
    expect(describeTarget({ kind: 'challenge', challengeId: 'nope' }, challenges, rounds, PLAYERS)).toBe(
      'Unknown challenge',
    );
  });
});

// ---------------------------------------------------------------------------
// Lifecycle vocabulary
// ---------------------------------------------------------------------------

describe('round progress', () => {
  it('counts both terminal statuses as published', () => {
    // completeChallenge moves published rounds to completed. A challenge that
    // has been closed must still read 5 / 5, not 0 / 5.
    expect(isRoundPublished(round({ status: 'published' }))).toBe(true);
    expect(isRoundPublished(round({ status: 'completed' }))).toBe(true);
    expect(isRoundPublished(round({ status: 'result_ready' }))).toBe(false);
    expect(isRoundPublished(round({ status: 'live' }))).toBe(false);
  });

  it('reports partial progress and blocks a clean close', () => {
    const rounds = [
      round({ id: '1', number: 1, status: 'published' }),
      round({ id: '2', number: 2, status: 'completed' }),
      round({ id: '3', number: 3, status: 'live' }),
    ];
    const progress = roundProgress(rounds);
    expect(progress.published).toBe(2);
    expect(progress.total).toBe(3);
    expect(progress.text).toBe('2 / 3 rounds published');
    expect(progress.complete).toBe(false);
  });

  it('allows a clean close only when every round is in', () => {
    const rounds = [
      round({ id: '1', number: 1, status: 'published' }),
      round({ id: '2', number: 2, status: 'published' }),
    ];
    expect(roundProgress(rounds).complete).toBe(true);
  });

  it('never calls an empty challenge complete', () => {
    // The final match has no rounds. If this returned true, the screen would
    // offer the ordinary END CHALLENGE, which scores 0–0 and stamps a false draw.
    const progress = roundProgress([]);
    expect(progress.complete).toBe(false);
    expect(progress.text).toBe('No rounds — scored as a match');
  });
});

describe('previewChallengeResult', () => {
  const rounds = [
    round({ id: '1', number: 1, score_a: 10, score_b: 4, winner: 'A' }),
    round({ id: '2', number: 2, score_a: 3, score_b: 9, winner: 'B' }),
    round({ id: '3', number: 3, score_a: 5, score_b: 5, winner: 'draw' }),
  ];

  it('matches the engine the server action runs, to the point', () => {
    // The whole purpose of the preview: the figure approved is the figure
    // published. Compare against the engine directly, not a restatement.
    const expected = computeChallengeResult(
      rounds.map((r) => ({ score_a: r.score_a, score_b: r.score_b, winner: r.winner })),
      'total_points',
    );
    expect(previewChallengeResult(challenge(), rounds)).toEqual(expected);
    expect(expected.pointsA).toBe(18);
    expect(expected.pointsB).toBe(18);
    expect(expected.winner).toBe('draw');
  });

  it('honours a round_wins challenge', () => {
    const c = challenge({ aggregation_rule: 'round_wins' });
    const rs = [
      round({ id: '1', number: 1, score_a: 1, score_b: 40, winner: 'A' }),
      round({ id: '2', number: 2, score_a: 1, score_b: 40, winner: 'A' }),
      round({ id: '3', number: 3, score_a: 1, score_b: 40, winner: 'B' }),
    ];
    const result = previewChallengeResult(c, rs);
    // Points favour B by a mile; round wins favour A. The rule must decide.
    expect(result.pointsB).toBeGreaterThan(result.pointsA);
    expect(result.roundWinsA).toBe(2);
    expect(result.winner).toBe('A');
  });

  it('treats an unknown aggregation_rule as total points', () => {
    const c = challenge({ aggregation_rule: 'something_else' });
    expect(previewChallengeResult(c, rounds).winner).toBe('draw');
  });

  it('coerces numeric strings, because postgres numeric arrives as text', () => {
    // score_a/score_b are `numeric` columns; supabase-js hands them back as
    // strings. Without the Number() coercion "10" + "3" would concatenate.
    const rs = [
      { ...round({ id: '1', number: 1, winner: 'A' }), score_a: '10', score_b: '4' },
      { ...round({ id: '2', number: 2, winner: 'A' }), score_a: '3', score_b: '2' },
    ] as unknown as RoundRow[];
    const result = previewChallengeResult(challenge(), rs);
    expect(result.pointsA).toBe(13);
    expect(result.pointsB).toBe(6);
    expect(result.winner).toBe('A');
  });

  it('shows the 0–0 draw that an empty round list would publish', () => {
    // This is exactly why the final match is closed a different way.
    const result = previewChallengeResult(challenge({ mechanic: 'final_match' }), []);
    expect(result).toMatchObject({ pointsA: 0, pointsB: 0, winner: 'draw' });
  });
});

describe('team naming', () => {
  it('uses the real team names', () => {
    expect(sideName(TEAMS, 'A')).toBe('TELLR');
    expect(sideName(TEAMS, 'B')).toBe('Yalla Sahel');
    expect(outcomeName(TEAMS, 'A')).toBe('TELLR');
    expect(outcomeName(TEAMS, 'B')).toBe('Yalla Sahel');
  });

  it('names a draw and an undecided result distinctly', () => {
    expect(outcomeName(TEAMS, 'draw')).toBe('Draw');
    expect(outcomeName(TEAMS, null)).toBe('Not decided');
  });
});

describe('pinReference', () => {
  it('reads as the operator says it out loud', () => {
    expect(pinReference(challenge(), round())).toBe('C2 · R3');
    expect(pinReference(challenge(), null)).toBe('C2');
    expect(pinReference(null, null)).toBe('—');
  });
});

describe('status labels', () => {
  const challengeStatuses: ChallengeStatus[] = [
    'draft',
    'ready',
    'locked',
    'live',
    'completed',
  ];
  const roundStatuses: RoundStatus[] = [
    'pending',
    'ready',
    'live',
    'awaiting_result',
    'result_ready',
    'published',
    'completed',
  ];

  it('covers every challenge status with a non-empty label', () => {
    for (const status of challengeStatuses) {
      expect(challengeStatusLabel(status).label).toBeTruthy();
    }
  });

  it('covers every round status with a non-empty label', () => {
    for (const status of roundStatuses) {
      expect(roundStatusLabel(status).label).toBeTruthy();
    }
  });

  it('never distinguishes a state by tone alone', () => {
    // Accessibility: two different states may share a tone, but they must not
    // then share a label — the words have to carry the difference.
    const seen = new Map<string, string>();
    for (const status of challengeStatuses) {
      const { label, tone } = challengeStatusLabel(status);
      const key = `${label}|${tone}`;
      // Same label AND same tone means the two statuses are indistinguishable.
      expect(seen.has(key)).toBe(false);
      seen.set(key, status);
    }
  });

  it('prints both terminal round statuses as PUBLISHED', () => {
    // published and completed are the same fact to an operator; the enum
    // difference is bookkeeping inside completeChallenge.
    expect(roundStatusLabel('published').label).toBe('PUBLISHED');
    expect(roundStatusLabel('completed').label).toBe('PUBLISHED');
  });
});
