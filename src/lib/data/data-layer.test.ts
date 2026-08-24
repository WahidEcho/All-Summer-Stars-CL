/**
 * Data-layer tests.
 *
 * Everything here is pure: snapshot assembly helpers, timer reading maths,
 * lease expiry, and the zod schemas that guard every server action. Nothing
 * touches a database — the query and command functions themselves are exercised
 * against the real Supabase project, not in unit tests.
 */

import { describe, expect, it } from 'vitest';

import { pickCurrentChallenge, pickCurrentRound } from '@/lib/data/snapshot';
import { pickActiveTimer } from '@/lib/data/queries';
import { pickTimer, readTimer } from '@/lib/hooks/useTimer';
import { bankedMs } from '@/lib/actions/_timers';
import { isLeaseLive } from '@/lib/actions/lease';
import { LEASE_RENEW_MS, LEASE_TTL_MS } from '@/lib/actions/types';
import {
  addGoalSchema,
  adjustPlayerPointsSchema,
  claimLeaseSchema,
  commandBase,
  formatIssues,
  recordAttemptSchema,
  reopenRoundSchema,
  reverseGoalSchema,
  scoringConfigSchema,
  setGoalPointsModeSchema,
  setLineupSlotSchema,
} from '@/lib/actions/schemas';
import type {
  ChallengeRow,
  ChallengeStatus,
  ControllerLeaseRow,
  RoundRow,
  RoundStatus,
  TimerMode,
  TimerRow,
  TimerState,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';
const UUID_C = '33333333-3333-4333-8333-333333333333';
const KEY = 'idem-key-0001';

function challenge(number: number, status: ChallengeStatus): ChallengeRow {
  return {
    id: `challenge-${number}`,
    event_id: 'event',
    number,
    mechanic: number === 5 ? 'final_match' : 'mannequin_target',
    title: `Challenge ${number}`,
    subtitle: null,
    description: null,
    status,
    aggregation_rule: 'total_points',
    round_count: number === 5 ? 0 : 5,
    locked_at: null,
    completed_at: null,
    winner: null,
  };
}

function round(number: number, status: RoundStatus): RoundRow {
  return {
    id: `round-${number}`,
    challenge_id: 'challenge-1',
    number,
    status,
    player_a_id: null,
    player_b_id: null,
    score_a: 0,
    score_b: 0,
    winner: null,
    active_side: null,
    published_at: null,
    completed_at: null,
    revision: 0,
  };
}

function timer(patch: Partial<TimerRow> & { id: string }): TimerRow {
  return {
    event_id: 'event',
    round_id: null,
    match_id: null,
    scope: 'match',
    label: null,
    segment: 1,
    mode: 'count_up' as TimerMode,
    duration_ms: null,
    state: 'ready' as TimerState,
    started_at: null,
    accumulated_ms: 0,
    ended_at: null,
    updated_at: '2026-08-27T18:00:00.000Z',
    ...patch,
  };
}

function lease(patch: Partial<ControllerLeaseRow> = {}): ControllerLeaseRow {
  return {
    id: 'lease-1',
    event_id: 'event',
    device_id: 'tablet-a',
    device_label: 'Pitchside tablet',
    user_id: null,
    acquired_at: '2026-08-27T18:00:00.000Z',
    renewed_at: '2026-08-27T18:00:00.000Z',
    expires_at: '2026-08-27T18:00:15.000Z',
    released_at: null,
    reason: null,
    ...patch,
  };
}

/** A minimal valid command envelope, spread into each schema fixture. */
const base = { idempotencyKey: KEY, deviceId: 'tablet-a', expectedRevision: 4 };

// ---------------------------------------------------------------------------
// Snapshot assembly helpers
// ---------------------------------------------------------------------------

describe('pickCurrentChallenge', () => {
  it('prefers a live challenge over everything else', () => {
    const challenges = [
      challenge(1, 'completed'),
      challenge(2, 'live'),
      challenge(3, 'ready'),
    ];
    expect(pickCurrentChallenge(challenges)?.number).toBe(2);
  });

  it('falls back to the first unfinished challenge', () => {
    const challenges = [
      challenge(1, 'completed'),
      challenge(2, 'completed'),
      challenge(3, 'ready'),
      challenge(4, 'draft'),
    ];
    expect(pickCurrentChallenge(challenges)?.number).toBe(3);
  });

  it('holds on the last challenge once the whole event is finished', () => {
    const challenges = [1, 2, 3, 4, 5].map((n) => challenge(n, 'completed'));
    expect(pickCurrentChallenge(challenges)?.number).toBe(5);
  });

  it('returns null for an empty event', () => {
    expect(pickCurrentChallenge([])).toBeNull();
  });

  it('takes the first live challenge when two are somehow live', () => {
    const challenges = [challenge(2, 'live'), challenge(3, 'live')];
    expect(pickCurrentChallenge(challenges)?.number).toBe(2);
  });
});

describe('pickCurrentRound', () => {
  it('prefers a live round', () => {
    const rounds = [
      round(1, 'published'),
      round(2, 'live'),
      round(3, 'pending'),
    ];
    expect(pickCurrentRound(rounds)?.number).toBe(2);
  });

  it('treats result_ready and awaiting_result as still in flight', () => {
    expect(
      pickCurrentRound([round(1, 'published'), round(2, 'result_ready')])?.number,
    ).toBe(2);
    expect(
      pickCurrentRound([round(1, 'published'), round(2, 'awaiting_result')])?.number,
    ).toBe(2);
  });

  it('moves on to the next unplayed round once one is published', () => {
    const rounds = [
      round(1, 'published'),
      round(2, 'published'),
      round(3, 'pending'),
      round(4, 'pending'),
    ];
    expect(pickCurrentRound(rounds)?.number).toBe(3);
  });

  it('an in-flight round outranks an earlier pending one', () => {
    const rounds = [round(1, 'pending'), round(2, 'live')];
    expect(pickCurrentRound(rounds)?.number).toBe(2);
  });

  it('stays on the last round when every round is done', () => {
    const rounds = [1, 2, 3, 4, 5].map((n) => round(n, 'completed'));
    expect(pickCurrentRound(rounds)?.number).toBe(5);
  });

  it('returns null for the final match, which has no rounds', () => {
    expect(pickCurrentRound([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Timer reading helpers
// ---------------------------------------------------------------------------

describe('readTimer', () => {
  const START = Date.parse('2026-08-27T19:00:00.000Z');

  it('reads zero from a clock that has not started', () => {
    const reading = readTimer(timer({ id: 't', state: 'ready' }), { nowMs: START });
    expect(reading.elapsedMs).toBe(0);
    expect(reading.running).toBe(false);
    expect(reading.clock).toBe('00:00');
  });

  it('derives the elapsed time of a running clock from its server anchor', () => {
    const reading = readTimer(
      timer({
        id: 't',
        state: 'running',
        started_at: new Date(START).toISOString(),
      }),
      { nowMs: START + 62_000 },
    );
    expect(reading.elapsedMs).toBe(62_000);
    expect(reading.clock).toBe('01:02');
    expect(reading.running).toBe(true);
  });

  it('adds banked time to the running segment — the second half carries the first', () => {
    const reading = readTimer(
      timer({
        id: 't',
        segment: 2,
        state: 'running',
        started_at: new Date(START).toISOString(),
        accumulated_ms: 1_200_000, // 20:00 played before the interval
        duration_ms: 2_400_000,
      }),
      { nowMs: START + 30_000 },
    );
    expect(reading.elapsedMs).toBe(1_230_000);
    expect(reading.clock).toBe('20:30');
  });

  it('a paused clock does not move with the wall clock', () => {
    const paused = timer({ id: 't', state: 'paused', accumulated_ms: 45_000 });
    expect(readTimer(paused, { nowMs: START }).elapsedMs).toBe(45_000);
    expect(readTimer(paused, { nowMs: START + 600_000 }).elapsedMs).toBe(45_000);
  });

  it('a refresh mid-half reads the same value as the device that started it', () => {
    const running = timer({
      id: 't',
      state: 'running',
      started_at: new Date(START).toISOString(),
    });
    // Two independent "devices" reading the same row at the same instant.
    const a = readTimer(running, { nowMs: START + 305_000 });
    const b = readTimer({ ...running }, { nowMs: START + 305_000 });
    expect(a.elapsedMs).toBe(b.elapsedMs);
    expect(a.clock).toBe('05:05');
  });

  it('counts a countdown timer down and flags expiry', () => {
    const countdown = timer({
      id: 't',
      mode: 'count_down',
      duration_ms: 60_000,
      state: 'running',
      started_at: new Date(START).toISOString(),
    });
    expect(readTimer(countdown, { nowMs: START + 15_000 }).displayMs).toBe(45_000);
    expect(readTimer(countdown, { nowMs: START + 15_000 }).expired).toBe(false);
    expect(readTimer(countdown, { nowMs: START + 60_000 }).expired).toBe(true);
    expect(readTimer(countdown, { nowMs: START + 90_000 }).displayMs).toBe(0);
  });

  it('reports progress against the configured duration', () => {
    const reading = readTimer(
      timer({
        id: 't',
        duration_ms: 60_000,
        state: 'running',
        started_at: new Date(START).toISOString(),
      }),
      { nowMs: START + 30_000 },
    );
    expect(reading.progress).toBeCloseTo(0.5, 5);
  });

  it('shows tenths on request', () => {
    const reading = readTimer(
      timer({
        id: 't',
        state: 'running',
        started_at: new Date(START).toISOString(),
      }),
      { nowMs: START + 3_400, tenths: true },
    );
    expect(reading.clock).toBe('00:03.4');
  });

  it('survives a null timer without throwing', () => {
    const reading = readTimer(null);
    expect(reading.timer).toBeNull();
    expect(reading.elapsedMs).toBe(0);
    expect(reading.state).toBe('ready');
  });
});

describe('bankedMs', () => {
  const START = Date.parse('2026-08-27T19:00:00.000Z');

  it('banks a running clock up to now', () => {
    const running = timer({
      id: 't',
      state: 'running',
      started_at: new Date(START).toISOString(),
      accumulated_ms: 10_000,
    });
    expect(bankedMs(running, START + 5_000)).toBe(15_000);
  });

  it('returns the stored total for a stopped clock', () => {
    expect(bankedMs(timer({ id: 't', state: 'paused', accumulated_ms: 7_500 }))).toBe(7_500);
    expect(bankedMs(timer({ id: 't', state: 'ended', accumulated_ms: 1_200_000 }))).toBe(1_200_000);
  });
});

describe('pickTimer / pickActiveTimer', () => {
  const running = timer({ id: 'running', state: 'running' });
  const paused = timer({ id: 'paused', state: 'paused' });
  const ready = timer({ id: 'ready', state: 'ready' });

  it('a running clock always wins', () => {
    expect(pickTimer([ready, paused, running])?.id).toBe('running');
    expect(pickActiveTimer([ready, paused, running])?.id).toBe('running');
  });

  it('falls back to a paused clock, then to whatever is there', () => {
    expect(pickTimer([ready, paused])?.id).toBe('paused');
    expect(pickTimer([ready])?.id).toBe('ready');
    expect(pickActiveTimer([ready, paused])?.id).toBe('paused');
  });

  it('filters by segment so half two does not pick up half one', () => {
    const half1 = timer({ id: 'h1', segment: 1, state: 'paused' });
    const half2 = timer({ id: 'h2', segment: 2, state: 'running' });
    expect(pickTimer([half1, half2], 1)?.id).toBe('h1');
    expect(pickTimer([half1, half2], 2)?.id).toBe('h2');
  });

  it('returns null when there is nothing to show', () => {
    expect(pickTimer([])).toBeNull();
    expect(pickActiveTimer([])).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Controller lease maths
// ---------------------------------------------------------------------------

describe('controller lease expiry', () => {
  const NOW = Date.parse('2026-08-27T18:00:10.000Z');

  it('renews well inside the lifetime, so one dropped heartbeat is survivable', () => {
    expect(LEASE_TTL_MS).toBe(15_000);
    expect(LEASE_RENEW_MS).toBe(5_000);
    expect(LEASE_TTL_MS / LEASE_RENEW_MS).toBeGreaterThanOrEqual(3);
  });

  it('a fresh, unreleased lease is live', async () => {
    await expect(isLeaseLive(lease(), NOW)).resolves.toBe(true);
  });

  it('a lapsed lease is not live — an abandoned tablet frees the controls', async () => {
    await expect(
      isLeaseLive(lease({ expires_at: '2026-08-27T18:00:09.999Z' }), NOW),
    ).resolves.toBe(false);
  });

  it('expiry is exclusive at the boundary', async () => {
    await expect(
      isLeaseLive(lease({ expires_at: new Date(NOW).toISOString() }), NOW),
    ).resolves.toBe(false);
    await expect(
      isLeaseLive(lease({ expires_at: new Date(NOW + 1).toISOString() }), NOW),
    ).resolves.toBe(true);
  });

  it('an explicitly released lease is dead even while unexpired', async () => {
    await expect(
      isLeaseLive(
        lease({
          expires_at: '2026-08-27T18:00:25.000Z',
          released_at: '2026-08-27T18:00:05.000Z',
        }),
        NOW,
      ),
    ).resolves.toBe(false);
  });

  it('no lease at all is not a live lease', async () => {
    await expect(isLeaseLive(null, NOW)).resolves.toBe(false);
  });

  it('lapses exactly one TTL after the last renewal', async () => {
    const renewedAt = NOW;
    const l = lease({ expires_at: new Date(renewedAt + LEASE_TTL_MS).toISOString() });
    await expect(isLeaseLive(l, renewedAt + LEASE_TTL_MS - 1)).resolves.toBe(true);
    await expect(isLeaseLive(l, renewedAt + LEASE_TTL_MS)).resolves.toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Action input schemas
// ---------------------------------------------------------------------------

describe('commandBase', () => {
  it('demands an idempotency key of at least eight characters', () => {
    expect(commandBase.safeParse({ idempotencyKey: 'short' }).success).toBe(false);
    expect(commandBase.safeParse({ idempotencyKey: KEY }).success).toBe(true);
  });

  it('allows the optional device id and revision to be absent', () => {
    expect(commandBase.safeParse({ idempotencyKey: KEY }).success).toBe(true);
  });

  it('rejects a negative expected revision', () => {
    expect(
      commandBase.safeParse({ idempotencyKey: KEY, expectedRevision: -1 }).success,
    ).toBe(false);
  });
});

describe('recordAttemptSchema', () => {
  it('accepts a mannequin-target hit', () => {
    const parsed = recordAttemptSchema.safeParse({
      ...base,
      roundId: UUID_A,
      playerId: UUID_B,
      side: 'A',
      attemptNumber: 1,
      payload: { kind: 'mannequin_target', targetId: 'target_50' },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a miss, expressed as a null target', () => {
    const parsed = recordAttemptSchema.safeParse({
      ...base,
      roundId: UUID_A,
      playerId: UUID_B,
      side: 'B',
      attemptNumber: 3,
      payload: { kind: 'mannequin_target', targetId: null },
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a dribble-and-finish attempt with its stopwatch reading', () => {
    const parsed = recordAttemptSchema.safeParse({
      ...base,
      roundId: UUID_A,
      playerId: UUID_B,
      side: 'A',
      attemptNumber: 2,
      payload: { kind: 'dribble_finish', timeMs: 14_200, scored: true },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects a payload whose kind is not one of the four mechanics', () => {
    const parsed = recordAttemptSchema.safeParse({
      ...base,
      roundId: UUID_A,
      playerId: UUID_B,
      side: 'A',
      attemptNumber: 1,
      payload: { kind: 'penalty', scored: true },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a dribble time the client invented as a string', () => {
    const parsed = recordAttemptSchema.safeParse({
      ...base,
      roundId: UUID_A,
      playerId: UUID_B,
      side: 'A',
      attemptNumber: 1,
      payload: { kind: 'dribble_finish', timeMs: '14200', scored: true },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects a side that is not A or B', () => {
    const parsed = recordAttemptSchema.safeParse({
      ...base,
      roundId: UUID_A,
      playerId: UUID_B,
      side: 'C',
      attemptNumber: 1,
      payload: { kind: 'center_circle', hit: true },
    });
    expect(parsed.success).toBe(false);
  });

  it('rejects attempt numbers outside 1–10', () => {
    const attempt = (attemptNumber: number) =>
      recordAttemptSchema.safeParse({
        ...base,
        roundId: UUID_A,
        playerId: UUID_B,
        side: 'A',
        attemptNumber,
        payload: { kind: 'center_circle', hit: true },
      }).success;
    expect(attempt(0)).toBe(false);
    expect(attempt(1)).toBe(true);
    expect(attempt(10)).toBe(true);
    expect(attempt(11)).toBe(false);
  });

  it('rejects a non-uuid round id', () => {
    const parsed = recordAttemptSchema.safeParse({
      ...base,
      roundId: 'round-1',
      playerId: UUID_B,
      side: 'A',
      attemptNumber: 1,
      payload: { kind: 'long_range', zoneId: 'green_100' },
    });
    expect(parsed.success).toBe(false);
  });

  it('never accepts a points value from the client', () => {
    const parsed = recordAttemptSchema.parse({
      ...base,
      roundId: UUID_A,
      playerId: UUID_B,
      side: 'A',
      attemptNumber: 1,
      payload: { kind: 'long_range', zoneId: 'green_100' },
      points: 999,
    });
    expect(parsed).not.toHaveProperty('points');
  });
});

describe('addGoalSchema', () => {
  const goal = {
    ...base,
    matchId: UUID_A,
    teamCode: 'A' as const,
    scorerId: UUID_B,
    clockMs: 754_000,
    half: 1,
  };

  it('accepts a normal goal', () => {
    expect(addGoalSchema.safeParse(goal).success).toBe(true);
  });

  it('accepts an own goal with no scorer', () => {
    expect(
      addGoalSchema.safeParse({
        ...goal,
        scorerId: null,
        isOwnGoal: true,
        ownGoalByPlayerId: UUID_C,
        method: 'own_goal',
      }).success,
    ).toBe(true);
  });

  it('rejects an unknown scoring method', () => {
    expect(addGoalSchema.safeParse({ ...goal, method: 'bicycle_kick' }).success).toBe(false);
  });

  it('rejects a negative clock', () => {
    expect(addGoalSchema.safeParse({ ...goal, clockMs: -1 }).success).toBe(false);
  });

  it('rejects a half outside 1–4', () => {
    expect(addGoalSchema.safeParse({ ...goal, half: 0 }).success).toBe(false);
    expect(addGoalSchema.safeParse({ ...goal, half: 5 }).success).toBe(false);
  });

  it('rejects a goal with no idempotency key at all', () => {
    const { idempotencyKey: _drop, ...rest } = goal;
    expect(addGoalSchema.safeParse(rest).success).toBe(false);
  });
});

describe('setGoalPointsModeSchema', () => {
  it('accepts each of the three admin-selectable modes', () => {
    for (const mode of ['team_share', 'scorer_only', 'scorer_plus_team']) {
      expect(
        setGoalPointsModeSchema.safeParse({ ...base, matchId: UUID_A, mode }).success,
      ).toBe(true);
    }
  });

  it('rejects an invented mode', () => {
    expect(
      setGoalPointsModeSchema.safeParse({ ...base, matchId: UUID_A, mode: 'scorer_double' })
        .success,
    ).toBe(false);
  });
});

describe('reason-carrying schemas', () => {
  it('reverseGoal demands a reason of real substance', () => {
    expect(reverseGoalSchema.safeParse({ ...base, goalId: UUID_A }).success).toBe(false);
    expect(
      reverseGoalSchema.safeParse({ ...base, goalId: UUID_A, reason: 'no' }).success,
    ).toBe(false);
    expect(
      reverseGoalSchema.safeParse({ ...base, goalId: UUID_A, reason: 'Offside on review.' })
        .success,
    ).toBe(true);
  });

  it('a reason of pure whitespace does not count', () => {
    expect(
      reverseGoalSchema.safeParse({ ...base, goalId: UUID_A, reason: '     ' }).success,
    ).toBe(false);
  });

  it('reopenRound demands a reason too', () => {
    expect(reopenRoundSchema.safeParse({ ...base, roundId: UUID_A }).success).toBe(false);
    expect(
      reopenRoundSchema.safeParse({ ...base, roundId: UUID_A, reason: 'Attempt 3 miskeyed.' })
        .success,
    ).toBe(true);
  });

  it('a manual adjustment demands a reason and allows a negative correction', () => {
    expect(
      adjustPlayerPointsSchema.safeParse({ ...base, playerId: UUID_A, points: 5 }).success,
    ).toBe(false);
    const parsed = adjustPlayerPointsSchema.safeParse({
      ...base,
      playerId: UUID_A,
      points: -5,
      reason: 'Double-counted target 50.',
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.points).toBe(-5);
  });
});

describe('setLineupSlotSchema', () => {
  it('accepts slots 1–5 and a null player to clear one', () => {
    expect(
      setLineupSlotSchema.safeParse({
        ...base,
        challengeId: UUID_A,
        teamCode: 'B',
        slotIndex: 5,
        playerId: null,
      }).success,
    ).toBe(true);
  });

  it('rejects a sixth slot — the teams are five a side', () => {
    expect(
      setLineupSlotSchema.safeParse({
        ...base,
        challengeId: UUID_A,
        teamCode: 'A',
        slotIndex: 6,
        playerId: UUID_B,
      }).success,
    ).toBe(false);
  });
});

describe('claimLeaseSchema', () => {
  it('accepts a plain claim and an audited takeover', () => {
    expect(claimLeaseSchema.safeParse({ deviceId: 'tablet-a' }).success).toBe(true);
    expect(
      claimLeaseSchema.safeParse({
        deviceId: 'tablet-b',
        deviceLabel: 'Backup tablet',
        takeover: true,
        reason: 'Primary tablet is dead.',
      }).success,
    ).toBe(true);
  });

  it('rejects a device id too short to be unique', () => {
    expect(claimLeaseSchema.safeParse({ deviceId: 'ab' }).success).toBe(false);
  });
});

describe('scoringConfigSchema', () => {
  const config = {
    challenges: {
      '1': {
        mechanic: 'mannequin_target',
        attemptsPerPlayer: 3,
        targets: [{ id: 'target_50', label: 'Target 50', points: 5 }],
        missPoints: 0,
      },
      '2': {
        mechanic: 'dribble_finish',
        attemptsPerPlayer: 3,
        dribbleThresholdMs: 15_000,
        dribbleBonusPoints: 2,
        goalPoints: 3,
        maxPointsPerAttempt: 5,
      },
      '3': {
        mechanic: 'long_range',
        attemptsPerPlayer: 3,
        zones: [{ id: 'green_100', label: 'Green 100', points: 10 }],
        missPoints: 0,
      },
      '4': {
        mechanic: 'center_circle',
        ballsPerPlayer: 10,
        timeLimitMs: 60_000,
        pointsPerHit: 1,
      },
      '5': { mechanic: 'final_match', halves: 2, halfDurationMs: 1_200_000 },
    },
    match: {
      goalPointsMode: 'scorer_plus_team',
      teamShare: { pointsPerPlayer: 2 },
      scorerOnly: { scorerPoints: 5 },
      scorerPlusTeam: { scorerPoints: 5, teammatePoints: 1 },
      ownGoal: { creditBenefitingTeam: true, scorerGetsPoints: false },
      winBonus: 10,
    },
    bonuses: { roundWinBonus: 3, roundDrawPoints: 1, challengeWinBonus: 5 },
    penalties: {
      enabledFor: 'final_match_only',
      openingAttempts: 5,
      suddenDeath: true,
      pointsPerScoredAttempt: 1,
      winnerPoints: 3,
    },
    ranking: {
      primary: 'regular_points',
      tiebreakers: ['penalty_tiebreak_points'],
      sharedRankOnTie: true,
    },
  };

  it('accepts a complete profile', () => {
    expect(scoringConfigSchema.safeParse(config).success).toBe(true);
  });

  it('rejects a profile missing a challenge', () => {
    const { '4': _drop, ...challenges } = config.challenges;
    expect(
      scoringConfigSchema.safeParse({ ...config, challenges }).success,
    ).toBe(false);
  });

  it('rejects a challenge whose config does not match its mechanic', () => {
    expect(
      scoringConfigSchema.safeParse({
        ...config,
        challenges: {
          ...config.challenges,
          '1': { mechanic: 'mannequin_target', attemptsPerPlayer: 3 },
        },
      }).success,
    ).toBe(false);
  });

  it('rejects a half shorter than a minute', () => {
    expect(
      scoringConfigSchema.safeParse({
        ...config,
        challenges: {
          ...config.challenges,
          '5': { mechanic: 'final_match', halves: 2, halfDurationMs: 1_000 },
        },
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown penalty policy', () => {
    expect(
      scoringConfigSchema.safeParse({
        ...config,
        penalties: { ...config.penalties, enabledFor: 'sometimes' },
      }).success,
    ).toBe(false);
  });
});

describe('formatIssues', () => {
  it('names the offending field so an operator can act on it', () => {
    const parsed = recordAttemptSchema.safeParse({
      ...base,
      roundId: 'not-a-uuid',
      playerId: UUID_B,
      side: 'A',
      attemptNumber: 1,
      payload: { kind: 'center_circle', hit: true },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const message = formatIssues(parsed.error);
      expect(message).toContain('roundId');
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it('joins several problems into one sentence', () => {
    const parsed = recordAttemptSchema.safeParse({
      idempotencyKey: 'no',
      roundId: 'nope',
      playerId: 'nope',
      side: 'Z',
      attemptNumber: 99,
      payload: { kind: 'nonsense' },
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) expect(formatIssues(parsed.error)).toContain(';');
  });
});
