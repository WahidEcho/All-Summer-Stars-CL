import { describe, expect, it } from 'vitest';

import {
  attemptsPerPlayer,
  blankPayload,
  computeChallengeResult,
  computeMatchScore,
  computePenaltyScore,
  computeRoundTotals,
  computeShootoutState,
  describeGoalMode,
  displayMs,
  elapsedMs,
  formatClock,
  hasExpired,
  ledgerEntriesForGoal,
  ledgerEntriesForRound,
  outcomeOf,
  rankPlayers,
  scoreAttempt,
  teamPointsFrom,
  wouldChangeLeader,
  wouldCompletePlayerAttempts,
  wouldTakeTheLead,
  type PlayerPointsInput,
  type TimerSnapshot,
} from '@/lib/scoring/engine';
import type {
  AttemptRow,
  CenterCircleConfig,
  DribbleFinishConfig,
  EntryStatus,
  FinalMatchConfig,
  GoalPointsMode,
  LongRangeConfig,
  MannequinTargetConfig,
  MatchScoringConfig,
  PlayerRow,
  RankingConfig,
  ScoringConfig,
  TeamCode,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Fixtures — mirrored 1:1 from supabase/migrations/0002_seed_event.sql so the
// suite exercises the exact values the production profile row carries.
// ---------------------------------------------------------------------------

const SEED_CONFIG: ScoringConfig = {
  challenges: {
    '1': {
      mechanic: 'mannequin_target',
      attemptsPerPlayer: 3,
      targets: [
        { id: 't10', label: 'TARGET 10', points: 1 },
        { id: 't30', label: 'TARGET 30', points: 3 },
        { id: 't50', label: 'TARGET 50', points: 5 },
      ],
      missPoints: 0,
    },
    '2': {
      mechanic: 'dribble_finish',
      attemptsPerPlayer: 3,
      dribbleThresholdMs: 15000,
      dribbleBonusPoints: 2,
      goalPoints: 3,
      maxPointsPerAttempt: 5,
    },
    '3': {
      mechanic: 'long_range',
      attemptsPerPlayer: 3,
      zones: [
        { id: 'green100', label: 'GREEN 100', points: 10, color: '#3FAE49' },
        { id: 'blue50', label: 'BLUE 50', points: 5, color: '#2C7FC4' },
        { id: 'red30', label: 'RED 30', points: 3, color: '#D3323C' },
        { id: 'red20', label: 'RED 20', points: 2, color: '#E2686F' },
      ],
      missPoints: 0,
    },
    '4': {
      mechanic: 'center_circle',
      ballsPerPlayer: 10,
      timeLimitMs: 60000,
      pointsPerHit: 1,
    },
    '5': {
      mechanic: 'final_match',
      halves: 2,
      halfDurationMs: 1200000,
    },
  },
  match: {
    goalPointsMode: 'team_share',
    teamShare: { pointsPerPlayer: 10 },
    scorerOnly: { scorerPoints: 10 },
    scorerPlusTeam: { scorerPoints: 10, teammatePoints: 5 },
    ownGoal: { creditBenefitingTeam: true, scorerGetsPoints: false },
    winBonus: 0,
  },
  bonuses: {
    roundWinBonus: 0,
    roundDrawPoints: 0,
    challengeWinBonus: 0,
  },
  penalties: {
    enabledFor: 'final_match_only',
    openingAttempts: 3,
    suddenDeath: true,
    pointsPerScoredAttempt: 0,
    winnerPoints: 0,
  },
  ranking: {
    primary: 'regular_points',
    tiebreakers: ['penalty_tiebreak_points'],
    sharedRankOnTie: true,
  },
};

const mannequin = SEED_CONFIG.challenges['1'] as MannequinTargetConfig;
const dribble = SEED_CONFIG.challenges['2'] as DribbleFinishConfig;
const longRange = SEED_CONFIG.challenges['3'] as LongRangeConfig;
const centerCircle = SEED_CONFIG.challenges['4'] as CenterCircleConfig;
const finalMatch = SEED_CONFIG.challenges['5'] as FinalMatchConfig;

const TEAM_A_ID = 'team-a-uuid';
const TEAM_B_ID = 'team-b-uuid';
const EVENT_ID = 'event-uuid';

function makePlayer(overrides: Partial<PlayerRow> & { id: string }): PlayerRow {
  return {
    event_id: EVENT_ID,
    team_id: TEAM_A_ID,
    full_name: 'Player A1',
    display_name: 'PLAYER A1',
    slug: 'player-a1',
    jersey_number: 1,
    photo_url: null,
    portrait_url: null,
    focal_x: 0.5,
    focal_y: 0.5,
    bio: null,
    active: true,
    display_order: 1,
    created_at: '2026-08-27T10:00:00.000Z',
    ...overrides,
  };
}

/** The ten seeded placeholder players, A1–A5 and B1–B5. */
function seededSquad(): { teamA: PlayerRow[]; teamB: PlayerRow[] } {
  const teamA = [1, 2, 3, 4, 5].map((i) =>
    makePlayer({
      id: `player-a${i}`,
      team_id: TEAM_A_ID,
      full_name: `Player A${i}`,
      display_name: `PLAYER A${i}`,
      slug: `player-a${i}`,
      jersey_number: i,
      display_order: i,
    }),
  );
  const teamB = [1, 2, 3, 4, 5].map((i) =>
    makePlayer({
      id: `player-b${i}`,
      team_id: TEAM_B_ID,
      full_name: `Player B${i}`,
      display_name: `PLAYER B${i}`,
      slug: `player-b${i}`,
      jersey_number: i,
      display_order: i,
    }),
  );
  return { teamA, teamB };
}

function makeAttempt(overrides: Partial<AttemptRow> & { id: string; side: TeamCode }): AttemptRow {
  return {
    round_id: 'round-uuid',
    player_id: overrides.side === 'A' ? 'player-a1' : 'player-b1',
    attempt_number: 1,
    payload: { kind: 'mannequin_target', targetId: 't10' },
    points: 1,
    status: 'confirmed',
    reverses_id: null,
    created_by: null,
    created_at: '2026-08-27T18:00:00.000Z',
    ...overrides,
  };
}

function goal(team_code: TeamCode, status: EntryStatus = 'confirmed') {
  return { team_code, status };
}

function penalty(team_code: TeamCode, scored: boolean, status: EntryStatus = 'confirmed') {
  return { team_code, scored, status };
}

function shootoutKick(
  sequence: number,
  team_code: TeamCode,
  scored: boolean,
  status: EntryStatus = 'confirmed',
) {
  return { sequence, team_code, scored, status };
}

const PENALTY_CONFIG = {
  openingAttempts: SEED_CONFIG.penalties.openingAttempts,
  suddenDeath: SEED_CONFIG.penalties.suddenDeath,
};

// ===========================================================================
// scoreAttempt
// ===========================================================================

describe('scoreAttempt — challenge 1, mannequin target', () => {
  it('awards the configured points for each seeded target', () => {
    expect(scoreAttempt(mannequin, { kind: 'mannequin_target', targetId: 't10' })).toBe(1);
    expect(scoreAttempt(mannequin, { kind: 'mannequin_target', targetId: 't30' })).toBe(3);
    expect(scoreAttempt(mannequin, { kind: 'mannequin_target', targetId: 't50' })).toBe(5);
  });

  it('awards missPoints for a miss (null target)', () => {
    expect(scoreAttempt(mannequin, { kind: 'mannequin_target', targetId: null })).toBe(
      mannequin.missPoints,
    );
  });

  it('falls back to missPoints for an unknown target id', () => {
    expect(scoreAttempt(mannequin, { kind: 'mannequin_target', targetId: 'not-a-target' })).toBe(0);
  });

  it('reads point values from the profile rather than a constant', () => {
    const retuned: MannequinTargetConfig = {
      ...mannequin,
      targets: mannequin.targets.map((t) => ({ ...t, points: t.points * 2 })),
      missPoints: -1,
    };
    expect(scoreAttempt(retuned, { kind: 'mannequin_target', targetId: 't50' })).toBe(10);
    expect(scoreAttempt(retuned, { kind: 'mannequin_target', targetId: null })).toBe(-1);
  });
});

describe('scoreAttempt — challenge 3, long range', () => {
  it('awards the configured points for each seeded zone', () => {
    expect(scoreAttempt(longRange, { kind: 'long_range', zoneId: 'green100' })).toBe(10);
    expect(scoreAttempt(longRange, { kind: 'long_range', zoneId: 'blue50' })).toBe(5);
    expect(scoreAttempt(longRange, { kind: 'long_range', zoneId: 'red30' })).toBe(3);
    expect(scoreAttempt(longRange, { kind: 'long_range', zoneId: 'red20' })).toBe(2);
  });

  it('awards missPoints for a miss and for an unknown zone', () => {
    expect(scoreAttempt(longRange, { kind: 'long_range', zoneId: null })).toBe(0);
    expect(scoreAttempt(longRange, { kind: 'long_range', zoneId: 'purple' })).toBe(0);
  });
});

describe('scoreAttempt — challenge 2, dribble & finish', () => {
  it('gives the speed bonus alone for a fast dribble without a goal', () => {
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 12400, scored: false })).toBe(2);
  });

  it('gives the goal points alone for a slow dribble that finishes', () => {
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 18200, scored: true })).toBe(3);
  });

  it('scores zero for a slow dribble with no goal', () => {
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 21000, scored: false })).toBe(0);
  });

  it('clamps a fast dribble plus a goal to maxPointsPerAttempt (5, not 5+)', () => {
    const points = scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 9000, scored: true });
    expect(points).toBe(dribble.maxPointsPerAttempt);
    expect(points).toBe(5);
    expect(points).toBeLessThanOrEqual(dribble.dribbleBonusPoints + dribble.goalPoints);
  });

  it('clamps even when the profile is retuned so the raw sum exceeds the max', () => {
    const generous: DribbleFinishConfig = {
      ...dribble,
      dribbleBonusPoints: 4,
      goalPoints: 6,
      maxPointsPerAttempt: 5,
    };
    expect(scoreAttempt(generous, { kind: 'dribble_finish', timeMs: 1000, scored: true })).toBe(5);
  });

  it('treats exactly 15000ms as NOT under the threshold', () => {
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 15000, scored: false })).toBe(0);
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 15000, scored: true })).toBe(3);
  });

  it('treats 14999ms as under the threshold', () => {
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 14999, scored: false })).toBe(2);
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 14999, scored: true })).toBe(5);
  });

  it('gives no speed bonus when no time was recorded (0ms)', () => {
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 0, scored: false })).toBe(0);
    expect(scoreAttempt(dribble, { kind: 'dribble_finish', timeMs: 0, scored: true })).toBe(3);
  });
});

describe('scoreAttempt — challenge 4, centre circle', () => {
  it('awards pointsPerHit for a ball that lands in the circle', () => {
    expect(scoreAttempt(centerCircle, { kind: 'center_circle', hit: true })).toBe(1);
  });

  it('awards nothing for a missed ball', () => {
    expect(scoreAttempt(centerCircle, { kind: 'center_circle', hit: false })).toBe(0);
  });

  it('uses the configured value rather than a hardcoded 1', () => {
    const retuned: CenterCircleConfig = { ...centerCircle, pointsPerHit: 4 };
    expect(scoreAttempt(retuned, { kind: 'center_circle', hit: true })).toBe(4);
  });
});

// ===========================================================================
// attemptsPerPlayer / blankPayload
// ===========================================================================

describe('attemptsPerPlayer', () => {
  it('returns the seeded attempt counts for every mechanic', () => {
    expect(attemptsPerPlayer(mannequin)).toBe(3);
    expect(attemptsPerPlayer(dribble)).toBe(3);
    expect(attemptsPerPlayer(longRange)).toBe(3);
    expect(attemptsPerPlayer(centerCircle)).toBe(10);
    expect(attemptsPerPlayer(finalMatch)).toBe(0);
  });

  it('reads ballsPerPlayer for centre circle, not attemptsPerPlayer', () => {
    expect(attemptsPerPlayer({ ...centerCircle, ballsPerPlayer: 12 })).toBe(12);
  });
});

describe('blankPayload', () => {
  it('seeds an empty payload for every scored mechanic', () => {
    expect(blankPayload('mannequin_target')).toEqual({ kind: 'mannequin_target', targetId: null });
    expect(blankPayload('long_range')).toEqual({ kind: 'long_range', zoneId: null });
    expect(blankPayload('dribble_finish')).toEqual({
      kind: 'dribble_finish',
      timeMs: 0,
      scored: false,
    });
    expect(blankPayload('center_circle')).toEqual({ kind: 'center_circle', hit: false });
  });

  it('returns null for the final match, which has no attempts', () => {
    expect(blankPayload('final_match')).toBeNull();
  });

  it('produces payloads that score zero through scoreAttempt', () => {
    expect(scoreAttempt(mannequin, blankPayload('mannequin_target')!)).toBe(0);
    expect(scoreAttempt(longRange, blankPayload('long_range')!)).toBe(0);
    expect(scoreAttempt(dribble, blankPayload('dribble_finish')!)).toBe(0);
    expect(scoreAttempt(centerCircle, blankPayload('center_circle')!)).toBe(0);
  });
});

// ===========================================================================
// computeRoundTotals / outcomeOf
// ===========================================================================

describe('outcomeOf', () => {
  it('resolves A, B and draw', () => {
    expect(outcomeOf(5, 3)).toBe('A');
    expect(outcomeOf(3, 5)).toBe('B');
    expect(outcomeOf(4, 4)).toBe('draw');
    expect(outcomeOf(0, 0)).toBe('draw');
  });
});

describe('computeRoundTotals', () => {
  it('sums confirmed attempts per side and picks the winner', () => {
    const totals = computeRoundTotals([
      makeAttempt({ id: 'a1', side: 'A', attempt_number: 1, points: 5 }),
      makeAttempt({ id: 'a2', side: 'A', attempt_number: 2, points: 3 }),
      makeAttempt({ id: 'a3', side: 'A', attempt_number: 3, points: 0 }),
      makeAttempt({ id: 'b1', side: 'B', attempt_number: 1, points: 1 }),
      makeAttempt({ id: 'b2', side: 'B', attempt_number: 2, points: 1 }),
      makeAttempt({ id: 'b3', side: 'B', attempt_number: 3, points: 3 }),
    ]);
    expect(totals.scoreA).toBe(8);
    expect(totals.scoreB).toBe(5);
    expect(totals.winner).toBe('A');
    expect(totals.attemptsA).toHaveLength(3);
    expect(totals.attemptsB).toHaveLength(3);
  });

  it('ignores reversed attempts entirely', () => {
    const totals = computeRoundTotals([
      makeAttempt({ id: 'a1', side: 'A', attempt_number: 1, points: 5 }),
      makeAttempt({ id: 'a2', side: 'A', attempt_number: 2, points: 5, status: 'reversed' }),
      makeAttempt({ id: 'b1', side: 'B', attempt_number: 1, points: 3 }),
      makeAttempt({ id: 'b2', side: 'B', attempt_number: 2, points: 99, status: 'reversed' }),
    ]);
    expect(totals.scoreA).toBe(5);
    expect(totals.scoreB).toBe(3);
    expect(totals.attemptsA.map((a) => a.id)).toEqual(['a1']);
    expect(totals.attemptsB.map((a) => a.id)).toEqual(['b1']);
  });

  it('sorts each side by attempt_number regardless of input order', () => {
    const totals = computeRoundTotals([
      makeAttempt({ id: 'a3', side: 'A', attempt_number: 3, points: 1 }),
      makeAttempt({ id: 'b2', side: 'B', attempt_number: 2, points: 1 }),
      makeAttempt({ id: 'a1', side: 'A', attempt_number: 1, points: 1 }),
      makeAttempt({ id: 'b3', side: 'B', attempt_number: 3, points: 1 }),
      makeAttempt({ id: 'a2', side: 'A', attempt_number: 2, points: 1 }),
      makeAttempt({ id: 'b1', side: 'B', attempt_number: 1, points: 1 }),
    ]);
    expect(totals.attemptsA.map((a) => a.attempt_number)).toEqual([1, 2, 3]);
    expect(totals.attemptsB.map((a) => a.attempt_number)).toEqual([1, 2, 3]);
    expect(totals.winner).toBe('draw');
  });

  it('does not mutate the caller array order', () => {
    const rows = [
      makeAttempt({ id: 'a2', side: 'A', attempt_number: 2, points: 1 }),
      makeAttempt({ id: 'a1', side: 'A', attempt_number: 1, points: 1 }),
    ];
    computeRoundTotals(rows);
    expect(rows.map((r) => r.id)).toEqual(['a2', 'a1']);
  });

  it('returns a draw with zeroed sides for an empty round', () => {
    expect(computeRoundTotals([])).toEqual({
      scoreA: 0,
      scoreB: 0,
      winner: 'draw',
      attemptsA: [],
      attemptsB: [],
    });
  });

  it('declares B the winner when B outscores A', () => {
    const totals = computeRoundTotals([
      makeAttempt({ id: 'a1', side: 'A', attempt_number: 1, points: 2 }),
      makeAttempt({ id: 'b1', side: 'B', attempt_number: 1, points: 10 }),
    ]);
    expect(totals.winner).toBe('B');
  });
});

// ===========================================================================
// ledgerEntriesForRound
// ===========================================================================

describe('ledgerEntriesForRound', () => {
  const { teamA, teamB } = seededSquad();
  const playerA = teamA[0];
  const playerB = teamB[0];

  const totals = (scoreA: number, scoreB: number) =>
    computeRoundTotals([
      makeAttempt({ id: 'a1', side: 'A', attempt_number: 1, points: scoreA }),
      makeAttempt({ id: 'b1', side: 'B', attempt_number: 1, points: scoreB }),
    ]);

  it('credits each player the points they actually scored', () => {
    const entries = ledgerEntriesForRound({
      totals: totals(8, 5),
      playerA,
      playerB,
      bonuses: SEED_CONFIG.bonuses,
    });
    expect(entries).toEqual([
      {
        playerId: 'player-a1',
        teamId: TEAM_A_ID,
        entryType: 'attempt_points',
        points: 8,
        sourceRef: null,
      },
      {
        playerId: 'player-b1',
        teamId: TEAM_B_ID,
        entryType: 'attempt_points',
        points: 5,
        sourceRef: null,
      },
    ]);
  });

  it('gives the win bonus only to the winner', () => {
    const entries = ledgerEntriesForRound({
      totals: totals(8, 5),
      playerA,
      playerB,
      bonuses: { roundWinBonus: 2, roundDrawPoints: 1 },
    });
    const bonuses = entries.filter((e) => e.entryType === 'round_win_bonus');
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0]).toMatchObject({ playerId: 'player-a1', points: 2 });
    expect(entries.some((e) => e.entryType === 'round_draw_points')).toBe(false);
  });

  it('gives the win bonus to B when B wins', () => {
    const entries = ledgerEntriesForRound({
      totals: totals(1, 9),
      playerA,
      playerB,
      bonuses: { roundWinBonus: 2, roundDrawPoints: 1 },
    });
    const bonuses = entries.filter((e) => e.entryType === 'round_win_bonus');
    expect(bonuses).toHaveLength(1);
    expect(bonuses[0]).toMatchObject({ playerId: 'player-b1', teamId: TEAM_B_ID, points: 2 });
  });

  it('on a draw keeps both players on their OWN points — never merged', () => {
    // A drawn round can still have both players on the same total; the entries
    // must remain two separate records, one per player.
    const entries = ledgerEntriesForRound({
      totals: totals(6, 6),
      playerA,
      playerB,
      bonuses: { roundWinBonus: 3, roundDrawPoints: 1 },
    });
    const attemptEntries = entries.filter((e) => e.entryType === 'attempt_points');
    expect(attemptEntries).toHaveLength(2);
    expect(attemptEntries.map((e) => e.playerId)).toEqual(['player-a1', 'player-b1']);
    expect(attemptEntries.every((e) => e.points === 6)).toBe(true);

    const drawEntries = entries.filter((e) => e.entryType === 'round_draw_points');
    expect(drawEntries).toHaveLength(2);
    expect(drawEntries.map((e) => e.playerId).sort()).toEqual(['player-a1', 'player-b1']);
    expect(entries.some((e) => e.entryType === 'round_win_bonus')).toBe(false);
  });

  it('omits zero-point entries', () => {
    // Seed bonuses are all zero, and A scored nothing.
    const entries = ledgerEntriesForRound({
      totals: totals(0, 4),
      playerA,
      playerB,
      bonuses: SEED_CONFIG.bonuses,
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ playerId: 'player-b1', points: 4 });
  });

  it('produces no entries at all for a scoreless draw under the seeded bonuses', () => {
    expect(
      ledgerEntriesForRound({
        totals: totals(0, 0),
        playerA,
        playerB,
        bonuses: SEED_CONFIG.bonuses,
      }),
    ).toEqual([]);
  });

  it('skips a side with no player assigned', () => {
    const entries = ledgerEntriesForRound({
      totals: totals(7, 4),
      playerA: null,
      playerB,
      bonuses: { roundWinBonus: 2, roundDrawPoints: 0 },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ playerId: 'player-b1', entryType: 'attempt_points' });
  });
});

// ===========================================================================
// ledgerEntriesForGoal
// ===========================================================================

describe('ledgerEntriesForGoal', () => {
  const teamA = seededSquad().teamA;
  const matchConfig = SEED_CONFIG.match;
  const GOAL_ID = 'goal-uuid-1';

  const run = (
    mode: GoalPointsMode,
    opts: { scorerId?: string | null; isOwnGoal?: boolean; config?: MatchScoringConfig } = {},
  ) =>
    ledgerEntriesForGoal({
      mode,
      config: opts.config ?? matchConfig,
      scoringTeamPlayers: teamA,
      scorerId: opts.scorerId ?? null,
      isOwnGoal: opts.isOwnGoal ?? false,
      goalId: GOAL_ID,
    });

  describe('team_share', () => {
    it('gives every player on the scoring team the same points', () => {
      const entries = run('team_share', { scorerId: 'player-a3' });
      expect(entries).toHaveLength(5);
      expect(entries.every((e) => e.points === 10)).toBe(true);
      expect(entries.every((e) => e.entryType === 'match_goal_points')).toBe(true);
      expect(entries.every((e) => e.teamId === TEAM_A_ID)).toBe(true);
      expect(entries.every((e) => e.sourceRef === GOAL_ID)).toBe(true);
      expect(entries.map((e) => e.playerId)).toEqual([
        'player-a1',
        'player-a2',
        'player-a3',
        'player-a4',
        'player-a5',
      ]);
    });

    it('still credits the whole benefiting team on an own goal', () => {
      const entries = run('team_share', { scorerId: null, isOwnGoal: true });
      expect(entries).toHaveLength(5);
      expect(entries.every((e) => e.points === 10)).toBe(true);
    });

    it('emits nothing when the configured share is zero', () => {
      const config: MatchScoringConfig = { ...matchConfig, teamShare: { pointsPerPlayer: 0 } };
      expect(run('team_share', { config })).toEqual([]);
    });
  });

  describe('scorer_only', () => {
    it('gives points to the scorer alone', () => {
      const entries = run('scorer_only', { scorerId: 'player-a4' });
      expect(entries).toEqual([
        {
          playerId: 'player-a4',
          teamId: TEAM_A_ID,
          entryType: 'match_goal_points',
          points: 10,
          sourceRef: GOAL_ID,
        },
      ]);
    });

    it('gives nothing for an unattributed goal', () => {
      expect(run('scorer_only', { scorerId: null })).toEqual([]);
    });

    it('gives nothing on an own goal while scorerGetsPoints is false', () => {
      // The own-goal scorer is on the other side; with the seeded flag off the
      // benefiting team gets no individual points under scorer-only.
      expect(run('scorer_only', { scorerId: 'player-a2', isOwnGoal: true })).toEqual([]);
    });

    it('honours the ownGoal.scorerGetsPoints flag when the admin enables it', () => {
      const config: MatchScoringConfig = {
        ...matchConfig,
        ownGoal: { creditBenefitingTeam: true, scorerGetsPoints: true },
      };
      const entries = run('scorer_only', { scorerId: 'player-a2', isOwnGoal: true, config });
      expect(entries).toEqual([
        {
          playerId: 'player-a2',
          teamId: TEAM_A_ID,
          entryType: 'match_goal_points',
          points: 10,
          sourceRef: GOAL_ID,
        },
      ]);
    });
  });

  describe('scorer_plus_team', () => {
    it('gives the scorer the full amount and teammates the smaller one', () => {
      const entries = run('scorer_plus_team', { scorerId: 'player-a3' });
      expect(entries).toHaveLength(5);
      const scorer = entries.find((e) => e.playerId === 'player-a3');
      expect(scorer?.points).toBe(10);
      expect(
        entries.filter((e) => e.playerId !== 'player-a3').every((e) => e.points === 5),
      ).toBe(true);
    });

    it('gives everyone the teammate rate on an own goal (no scorer reward)', () => {
      const entries = run('scorer_plus_team', { scorerId: 'player-a3', isOwnGoal: true });
      expect(entries).toHaveLength(5);
      expect(entries.every((e) => e.points === 5)).toBe(true);
    });

    it('rewards the scorer on an own goal only when the flag is enabled', () => {
      const config: MatchScoringConfig = {
        ...matchConfig,
        ownGoal: { creditBenefitingTeam: true, scorerGetsPoints: true },
      };
      const entries = run('scorer_plus_team', {
        scorerId: 'player-a3',
        isOwnGoal: true,
        config,
      });
      expect(entries.find((e) => e.playerId === 'player-a3')?.points).toBe(10);
      expect(
        entries.filter((e) => e.playerId !== 'player-a3').every((e) => e.points === 5),
      ).toBe(true);
    });

    it('omits teammates when their rate is zero but still pays the scorer', () => {
      const config: MatchScoringConfig = {
        ...matchConfig,
        scorerPlusTeam: { scorerPoints: 8, teammatePoints: 0 },
      };
      const entries = run('scorer_plus_team', { scorerId: 'player-a1', config });
      expect(entries).toEqual([
        {
          playerId: 'player-a1',
          teamId: TEAM_A_ID,
          entryType: 'match_goal_points',
          points: 8,
          sourceRef: GOAL_ID,
        },
      ]);
    });
  });

  it('tags every entry with the goal id so it can be reversed', () => {
    for (const mode of ['team_share', 'scorer_only', 'scorer_plus_team'] as GoalPointsMode[]) {
      const entries = run(mode, { scorerId: 'player-a1' });
      expect(entries.length).toBeGreaterThan(0);
      expect(entries.every((e) => e.sourceRef === GOAL_ID)).toBe(true);
    }
  });
});

describe('describeGoalMode', () => {
  it('describes each mode using the live profile numbers', () => {
    expect(describeGoalMode('team_share', SEED_CONFIG.match)).toBe(
      'Every player on the scoring team gets 10 points.',
    );
    expect(describeGoalMode('scorer_only', SEED_CONFIG.match)).toBe(
      'Only the scorer gets 10 points.',
    );
    expect(describeGoalMode('scorer_plus_team', SEED_CONFIG.match)).toBe(
      'The scorer gets 10 points, each teammate 5.',
    );
  });
});

// ===========================================================================
// Match / penalty / challenge results
// ===========================================================================

describe('computeMatchScore', () => {
  it('counts confirmed goals per team', () => {
    const totals = computeMatchScore([goal('A'), goal('B'), goal('A'), goal('A')]);
    expect(totals).toEqual({ scoreA: 3, scoreB: 1, winner: 'A' });
  });

  it('excludes reversed goals', () => {
    const totals = computeMatchScore([
      goal('A'),
      goal('A', 'reversed'),
      goal('B'),
      goal('B', 'reversed'),
      goal('B'),
    ]);
    expect(totals).toEqual({ scoreA: 1, scoreB: 2, winner: 'B' });
  });

  it('reports a goalless draw', () => {
    expect(computeMatchScore([])).toEqual({ scoreA: 0, scoreB: 0, winner: 'draw' });
  });
});

describe('computePenaltyScore', () => {
  it('counts only confirmed, scored attempts', () => {
    const totals = computePenaltyScore([
      penalty('A', true),
      penalty('A', false),
      penalty('B', true),
      penalty('B', true),
      penalty('B', false),
    ]);
    expect(totals).toEqual({ scoreA: 1, scoreB: 2, winner: 'B' });
  });

  it('excludes reversed attempts even when they scored', () => {
    const totals = computePenaltyScore([
      penalty('A', true),
      penalty('A', true, 'reversed'),
      penalty('B', true),
    ]);
    expect(totals).toEqual({ scoreA: 1, scoreB: 1, winner: 'draw' });
  });

  it('never alters the regular match score', () => {
    const goals = [goal('A'), goal('B')];
    const regular = computeMatchScore(goals);
    const shootout = computePenaltyScore([
      penalty('A', true),
      penalty('A', true),
      penalty('A', true),
      penalty('B', false),
      penalty('B', false),
      penalty('B', false),
    ]);
    expect(shootout).toEqual({ scoreA: 3, scoreB: 0, winner: 'A' });
    // The regular score is untouched by the shootout.
    expect(computeMatchScore(goals)).toEqual(regular);
    expect(regular).toEqual({ scoreA: 1, scoreB: 1, winner: 'draw' });
  });
});

describe('computeChallengeResult', () => {
  // Five rounds: A wins on aggregate points, B wins more rounds.
  const rounds = [
    { score_a: 12, score_b: 1, winner: 'A' as const },
    { score_a: 1, score_b: 2, winner: 'B' as const },
    { score_a: 1, score_b: 2, winner: 'B' as const },
    { score_a: 1, score_b: 2, winner: 'B' as const },
    { score_a: 3, score_b: 3, winner: 'draw' as const },
  ];

  it('defaults to total points across the five rounds', () => {
    const result = computeChallengeResult(rounds);
    expect(result.pointsA).toBe(18);
    expect(result.pointsB).toBe(10);
    expect(result.roundWinsA).toBe(1);
    expect(result.roundWinsB).toBe(3);
    expect(result.draws).toBe(1);
    expect(result.winner).toBe('A');
  });

  it('flips the winner under the round_wins rule', () => {
    const result = computeChallengeResult(rounds, 'round_wins');
    expect(result.pointsA).toBe(18);
    expect(result.pointsB).toBe(10);
    expect(result.winner).toBe('B');
  });

  it('ignores unpublished rounds with a null winner in the win counts', () => {
    const result = computeChallengeResult(
      [
        { score_a: 5, score_b: 3, winner: 'A' },
        { score_a: 0, score_b: 0, winner: null },
      ],
      'round_wins',
    );
    expect(result.roundWinsA).toBe(1);
    expect(result.roundWinsB).toBe(0);
    expect(result.draws).toBe(0);
    expect(result.winner).toBe('A');
  });

  it('reports a draw when both rules tie', () => {
    const level = [
      { score_a: 4, score_b: 4, winner: 'draw' as const },
      { score_a: 6, score_b: 2, winner: 'A' as const },
      { score_a: 2, score_b: 6, winner: 'B' as const },
    ];
    expect(computeChallengeResult(level).winner).toBe('draw');
    expect(computeChallengeResult(level, 'round_wins').winner).toBe('draw');
  });

  it('handles a challenge with no rounds yet', () => {
    expect(computeChallengeResult([])).toEqual({
      pointsA: 0,
      pointsB: 0,
      roundWinsA: 0,
      roundWinsB: 0,
      draws: 0,
      winner: 'draw',
    });
  });
});

// ===========================================================================
// rankPlayers / teamPointsFrom
// ===========================================================================

describe('rankPlayers', () => {
  const { teamA, teamB } = seededSquad();
  const ranking: RankingConfig = SEED_CONFIG.ranking;

  const entry = (
    player: PlayerRow,
    regularPoints: number,
    penaltyPoints = 0,
  ): PlayerPointsInput => ({
    player,
    regularPoints,
    penaltyPoints,
    teamCode: player.team_id === TEAM_A_ID ? 'A' : 'B',
    slotLabel: `${player.team_id === TEAM_A_ID ? 'A' : 'B'}${player.jersey_number}`,
  });

  it('orders players by regular points, descending', () => {
    const ranked = rankPlayers(
      [entry(teamA[0], 12), entry(teamB[0], 30), entry(teamA[1], 21)],
      ranking,
    );
    expect(ranked.map((r) => r.id)).toEqual(['player-b1', 'player-a2', 'player-a1']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranked.every((r) => r.sharedRank === false)).toBe(true);
  });

  it('produces the 1, 2, 2, 4 sequence for a shared rank', () => {
    const ranked = rankPlayers(
      [
        entry(teamA[0], 30),
        entry(teamA[1], 20),
        entry(teamB[1], 20),
        entry(teamB[0], 10),
      ],
      ranking,
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 2, 4]);
    expect(ranked.map((r) => r.sharedRank)).toEqual([false, true, true, false]);
  });

  it('marks every member of a shared rank, including a three-way tie', () => {
    const ranked = rankPlayers(
      [entry(teamA[0], 9), entry(teamA[1], 9), entry(teamA[2], 9), entry(teamB[0], 1)],
      ranking,
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 1, 1, 4]);
    expect(ranked.map((r) => r.sharedRank)).toEqual([true, true, true, false]);
  });

  it('gives every player a distinct rank when sharedRankOnTie is off', () => {
    const ranked = rankPlayers(
      [entry(teamA[0], 20), entry(teamA[1], 20), entry(teamB[0], 5)],
      { ...ranking, sharedRankOnTie: false },
    );
    expect(ranked.map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(ranked.every((r) => r.sharedRank === false)).toBe(true);
  });

  it('uses penalty points only as a tiebreak, never to reorder unequal regular points', () => {
    // A1 has fewer regular points but a mountain of penalty points; A2 still leads.
    const ranked = rankPlayers([entry(teamA[0], 10, 50), entry(teamA[1], 11, 0)], ranking);
    expect(ranked.map((r) => r.id)).toEqual(['player-a2', 'player-a1']);
    expect(ranked[0].regularPoints).toBe(11);
    expect(ranked[0].totalPoints).toBe(11);
    expect(ranked[1].totalPoints).toBe(60);
  });

  it('breaks an exact tie on penalty points and un-shares the rank', () => {
    const ranked = rankPlayers([entry(teamA[0], 10, 1), entry(teamB[0], 10, 4)], ranking);
    expect(ranked.map((r) => r.id)).toEqual(['player-b1', 'player-a1']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 2]);
    expect(ranked.every((r) => r.sharedRank === false)).toBe(true);
  });

  it('ignores penalty points when the tiebreaker is not configured', () => {
    const noTiebreak: RankingConfig = { ...ranking, tiebreakers: [] };
    const ranked = rankPlayers(
      [entry(teamB[0], 10, 0), entry(teamA[0], 10, 9)],
      noTiebreak,
    );
    // Falls back to display-name order, and both still share rank 1.
    expect(ranked.map((r) => r.id)).toEqual(['player-a1', 'player-b1']);
    expect(ranked.map((r) => r.rank)).toEqual([1, 1]);
    expect(ranked.map((r) => r.sharedRank)).toEqual([true, true]);
  });

  it('sorts alphabetically by display name as the final, stable tiebreak', () => {
    const ranked = rankPlayers(
      [entry(teamB[2], 4, 0), entry(teamA[4], 4, 0), entry(teamA[0], 4, 0)],
      ranking,
    );
    expect(ranked.map((r) => r.display_name)).toEqual(['PLAYER A1', 'PLAYER A5', 'PLAYER B3']);
  });

  it('falls back to full_name when there is no display name', () => {
    const anonymous = makePlayer({ id: 'player-a9', display_name: null, full_name: 'Aaron Zed' });
    const ranked = rankPlayers([entry(teamA[0], 4), entry(anonymous, 4)], ranking);
    expect(ranked[0].id).toBe('player-a9');
  });

  it('carries team code, slot label and the full player row through', () => {
    const ranked = rankPlayers([entry(teamB[3], 7, 2)], ranking);
    expect(ranked[0]).toMatchObject({
      id: 'player-b4',
      full_name: 'Player B4',
      slug: 'player-b4',
      teamCode: 'B',
      slotLabel: 'B4',
      regularPoints: 7,
      penaltyPoints: 2,
      totalPoints: 9,
      rank: 1,
      sharedRank: false,
    });
  });

  it('does not mutate the input array', () => {
    const inputs = [entry(teamA[0], 1), entry(teamB[0], 99)];
    rankPlayers(inputs, ranking);
    expect(inputs.map((i) => i.player.id)).toEqual(['player-a1', 'player-b1']);
  });

  it('returns an empty leaderboard for no players', () => {
    expect(rankPlayers([], ranking)).toEqual([]);
  });
});

describe('teamPointsFrom', () => {
  const { teamA, teamB } = seededSquad();

  it('adds up each side from the same ranked rows', () => {
    const ranked = rankPlayers(
      [
        { player: teamA[0], regularPoints: 10, penaltyPoints: 1, teamCode: 'A', slotLabel: 'A1' },
        { player: teamA[1], regularPoints: 6, penaltyPoints: 0, teamCode: 'A', slotLabel: 'A2' },
        { player: teamB[0], regularPoints: 8, penaltyPoints: 2, teamCode: 'B', slotLabel: 'B1' },
      ],
      SEED_CONFIG.ranking,
    );
    expect(teamPointsFrom(ranked)).toEqual({ A: 17, B: 10 });
  });

  it('ignores players with no team code', () => {
    const ranked = rankPlayers(
      [{ player: teamA[0], regularPoints: 5, penaltyPoints: 0, teamCode: null, slotLabel: null }],
      SEED_CONFIG.ranking,
    );
    expect(teamPointsFrom(ranked)).toEqual({ A: 0, B: 0 });
  });
});

// ===========================================================================
// computeShootoutState
// ===========================================================================

describe('computeShootoutState', () => {
  it('starts with A and alternates sides', () => {
    expect(computeShootoutState([], PENALTY_CONFIG).nextSide).toBe('A');
    expect(
      computeShootoutState([shootoutKick(1, 'A', true)], PENALTY_CONFIG).nextSide,
    ).toBe('B');
    expect(
      computeShootoutState(
        [shootoutKick(1, 'A', true), shootoutKick(2, 'B', false)],
        PENALTY_CONFIG,
      ).nextSide,
    ).toBe('A');
  });

  it('counts confirmed kicks and conversions per side', () => {
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', false),
        shootoutKick(3, 'A', false),
        shootoutKick(4, 'B', true),
      ],
      PENALTY_CONFIG,
    );
    expect(state).toMatchObject({
      scoreA: 1,
      scoreB: 1,
      takenA: 2,
      takenB: 2,
      decided: false,
      winner: null,
      inSuddenDeath: false,
      mathematicallyDecided: false,
    });
  });

  it('excludes reversed kicks from both the taken and scored counts', () => {
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', true, 'reversed'),
        shootoutKick(3, 'B', false),
      ],
      PENALTY_CONFIG,
    );
    expect(state.takenB).toBe(1);
    expect(state.scoreB).toBe(0);
    expect(state.takenA).toBe(1);
    expect(state.scoreA).toBe(1);
  });

  it('sorts out-of-order kicks without changing the tallies', () => {
    const shuffled = computeShootoutState(
      [
        shootoutKick(4, 'B', true),
        shootoutKick(1, 'A', true),
        shootoutKick(3, 'A', true),
        shootoutKick(2, 'B', false),
      ],
      PENALTY_CONFIG,
    );
    expect(shuffled).toMatchObject({ scoreA: 2, scoreB: 1, takenA: 2, takenB: 2 });
  });

  it('is not decided while the trailing side can still catch up', () => {
    // A 1-0 up after two kicks each; B's last opening kick can still level it.
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', false),
        shootoutKick(3, 'A', false),
        shootoutKick(4, 'B', false),
      ],
      PENALTY_CONFIG,
    );
    expect(state.scoreA).toBe(1);
    expect(state.scoreB).toBe(0);
    expect(state.mathematicallyDecided).toBe(false);
    expect(state.decided).toBe(false);
    expect(state.winner).toBeNull();
  });

  it('is decided as soon as the lead exceeds the trailing side’s remaining kicks', () => {
    // A 2-0 up after two kicks each — B has one opening kick left and cannot level.
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', false),
        shootoutKick(3, 'A', true),
        shootoutKick(4, 'B', false),
      ],
      PENALTY_CONFIG,
    );
    expect(state.mathematicallyDecided).toBe(true);
    expect(state.decided).toBe(true);
    expect(state.winner).toBe('A');
  });

  it('finishes early once the lead is mathematically unassailable', () => {
    // A has taken all three and scored all three; B has missed both of theirs
    // with only one kick left.
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', false),
        shootoutKick(3, 'A', true),
        shootoutKick(4, 'B', false),
        shootoutKick(5, 'A', true),
      ],
      PENALTY_CONFIG,
    );
    expect(state.takenA).toBe(3);
    expect(state.takenB).toBe(2);
    expect(state.mathematicallyDecided).toBe(true);
    expect(state.decided).toBe(true);
    expect(state.winner).toBe('A');
    expect(state.nextSide).toBe('B');
  });

  it('finishes early for the side kicking second as well', () => {
    // B 2-0 up after two kicks each — A has one opening kick left.
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', false),
        shootoutKick(2, 'B', true),
        shootoutKick(3, 'A', false),
        shootoutKick(4, 'B', true),
      ],
      PENALTY_CONFIG,
    );
    expect(state.mathematicallyDecided).toBe(true);
    expect(state.decided).toBe(true);
    expect(state.winner).toBe('B');
    expect(state.nextSide).toBe('A');
  });

  it('decides a completed opening set on an unequal score, without the maths shortcut', () => {
    // 2-1 after three kicks each: only settled once the sets are complete.
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', true),
        shootoutKick(3, 'A', false),
        shootoutKick(4, 'B', false),
        shootoutKick(5, 'A', true),
        shootoutKick(6, 'B', false),
      ],
      PENALTY_CONFIG,
    );
    expect(state).toMatchObject({
      scoreA: 2,
      scoreB: 1,
      takenA: 3,
      takenB: 3,
      decided: true,
      winner: 'A',
      mathematicallyDecided: false,
      // Won inside the opening set: a regulation result, NOT sudden death.
      inSuddenDeath: false,
    });
  });

  it('never reports sudden death for a shootout won inside the opening set', () => {
    // The broadcast label and `penalty_shootouts.status` both key off this
    // flag, so a regulation 2-1 must never be recorded as a sudden-death win.
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', true),
        shootoutKick(3, 'A', true),
        shootoutKick(4, 'B', false),
        shootoutKick(5, 'A', false),
        shootoutKick(6, 'B', false),
      ],
      PENALTY_CONFIG,
    );
    expect(state.decided).toBe(true);
    expect(state.winner).toBe('A');
    expect(state.inSuddenDeath).toBe(false);
  });

  it('stays in sudden death for kicks taken after a level opening set', () => {
    // Level 2-2 after three each, then two full sudden-death rounds.
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', true),
        shootoutKick(3, 'A', true),
        shootoutKick(4, 'B', true),
        shootoutKick(5, 'A', false),
        shootoutKick(6, 'B', false),
        shootoutKick(7, 'A', true),
        shootoutKick(8, 'B', true),
        shootoutKick(9, 'A', true),
        shootoutKick(10, 'B', false),
      ],
      PENALTY_CONFIG,
    );
    expect(state.inSuddenDeath).toBe(true);
    expect(state.decided).toBe(true);
    expect(state.winner).toBe('A');
  });

  it('is never decided while the sides are unequal on kicks in sudden death', () => {
    // Level 1-1 after three each, then A alone takes and converts kick 7.
    // A leads 2-1 but B has not replied — the shootout is NOT over.
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', true),
        shootoutKick(3, 'A', false),
        shootoutKick(4, 'B', false),
        shootoutKick(5, 'A', false),
        shootoutKick(6, 'B', false),
        shootoutKick(7, 'A', true),
      ],
      PENALTY_CONFIG,
    );
    expect(state).toMatchObject({
      scoreA: 2,
      scoreB: 1,
      takenA: 4,
      takenB: 3,
      decided: false,
      winner: null,
      inSuddenDeath: true,
      nextSide: 'B',
    });
  });

  it('does not settle a lopsided but unfinished sudden-death round', () => {
    // 0-0 after three each, then A converts and B has still to kick — a 1-0
    // lead mid-round must not be mistaken for a mathematically safe one.
    const level = [
      shootoutKick(1, 'A', false),
      shootoutKick(2, 'B', false),
      shootoutKick(3, 'A', false),
      shootoutKick(4, 'B', false),
      shootoutKick(5, 'A', false),
      shootoutKick(6, 'B', false),
    ];
    const state = computeShootoutState([...level, shootoutKick(7, 'A', true)], PENALTY_CONFIG);
    expect(state.decided).toBe(false);
    expect(state.mathematicallyDecided).toBe(false);
    expect(state.winner).toBeNull();
  });

  it('enters sudden death when the opening attempts end level', () => {
    const level = [
      shootoutKick(1, 'A', true),
      shootoutKick(2, 'B', true),
      shootoutKick(3, 'A', false),
      shootoutKick(4, 'B', false),
      shootoutKick(5, 'A', true),
      shootoutKick(6, 'B', true),
    ];
    const state = computeShootoutState(level, PENALTY_CONFIG);
    expect(state.inSuddenDeath).toBe(true);
    expect(state.decided).toBe(false);
    expect(state.nextSide).toBe('A');

    // A scores the first sudden-death kick — still not decided, B must reply.
    const midRound = computeShootoutState([...level, shootoutKick(7, 'A', true)], PENALTY_CONFIG);
    expect(midRound.decided).toBe(false);
    expect(midRound.nextSide).toBe('B');

    // B misses and the completed sudden-death round settles it.
    const finished = computeShootoutState(
      [...level, shootoutKick(7, 'A', true), shootoutKick(8, 'B', false)],
      PENALTY_CONFIG,
    );
    expect(finished.decided).toBe(true);
    expect(finished.winner).toBe('A');
    expect(finished.takenA).toBe(4);
    expect(finished.takenB).toBe(4);
  });

  it('keeps going through several level sudden-death rounds', () => {
    const kicks = [
      shootoutKick(1, 'A', true),
      shootoutKick(2, 'B', true),
      shootoutKick(3, 'A', true),
      shootoutKick(4, 'B', true),
      shootoutKick(5, 'A', true),
      shootoutKick(6, 'B', true),
      shootoutKick(7, 'A', true),
      shootoutKick(8, 'B', true),
      shootoutKick(9, 'A', false),
      shootoutKick(10, 'B', false),
    ];
    const state = computeShootoutState(kicks, PENALTY_CONFIG);
    expect(state).toMatchObject({
      scoreA: 4,
      scoreB: 4,
      takenA: 5,
      takenB: 5,
      inSuddenDeath: true,
      decided: false,
      winner: null,
      nextSide: 'A',
    });
  });

  it('never reports sudden death when the profile disables it', () => {
    const state = computeShootoutState(
      [
        shootoutKick(1, 'A', true),
        shootoutKick(2, 'B', true),
        shootoutKick(3, 'A', false),
        shootoutKick(4, 'B', false),
        shootoutKick(5, 'A', true),
        shootoutKick(6, 'B', true),
      ],
      { openingAttempts: 3, suddenDeath: false },
    );
    expect(state.inSuddenDeath).toBe(false);
    expect(state.decided).toBe(false);
  });

  it('respects a retuned openingAttempts value', () => {
    const kicks = [
      shootoutKick(1, 'A', true),
      shootoutKick(2, 'B', false),
      shootoutKick(3, 'A', true),
      shootoutKick(4, 'B', false),
      shootoutKick(5, 'A', true),
    ];
    // With five opening kicks a 3-0 lead after two B misses is not yet safe.
    expect(
      computeShootoutState(kicks, { openingAttempts: 5, suddenDeath: true })
        .mathematicallyDecided,
    ).toBe(false);
    // With three it is.
    expect(
      computeShootoutState(kicks, { openingAttempts: 3, suddenDeath: true })
        .mathematicallyDecided,
    ).toBe(true);
  });

  it('starts blank with no kicks taken', () => {
    expect(computeShootoutState([], PENALTY_CONFIG)).toEqual({
      scoreA: 0,
      scoreB: 0,
      takenA: 0,
      takenB: 0,
      nextSide: 'A',
      inSuddenDeath: false,
      decided: false,
      winner: null,
      mathematicallyDecided: false,
    });
  });
});

// ===========================================================================
// would* predicates
// ===========================================================================

describe('wouldCompletePlayerAttempts', () => {
  it('is false until the last attempt of the set', () => {
    expect(wouldCompletePlayerAttempts(mannequin, 0)).toBe(false);
    expect(wouldCompletePlayerAttempts(mannequin, 1)).toBe(false);
  });

  it('is true on the attempt that completes the set', () => {
    expect(wouldCompletePlayerAttempts(mannequin, 2)).toBe(true);
    expect(wouldCompletePlayerAttempts(longRange, 2)).toBe(true);
    expect(wouldCompletePlayerAttempts(dribble, 2)).toBe(true);
  });

  it('uses ballsPerPlayer for the centre-circle challenge', () => {
    expect(wouldCompletePlayerAttempts(centerCircle, 8)).toBe(false);
    expect(wouldCompletePlayerAttempts(centerCircle, 9)).toBe(true);
  });

  it('stays true past the configured count', () => {
    expect(wouldCompletePlayerAttempts(mannequin, 5)).toBe(true);
  });
});

describe('wouldChangeLeader', () => {
  const { teamA, teamB } = seededSquad();
  const board = (...ids: string[]) =>
    rankPlayers(
      ids.map((id, i) => ({
        player: [...teamA, ...teamB].find((p) => p.id === id)!,
        regularPoints: 100 - i * 10,
        penaltyPoints: 0,
        teamCode: id.startsWith('player-a') ? ('A' as const) : ('B' as const),
        slotLabel: null,
      })),
      SEED_CONFIG.ranking,
    );

  it('is false when the same player still leads', () => {
    expect(wouldChangeLeader(board('player-a1', 'player-b1'), board('player-a1', 'player-b2'))).toBe(
      false,
    );
  });

  it('is true when a new player takes top spot', () => {
    expect(wouldChangeLeader(board('player-a1', 'player-b1'), board('player-b1', 'player-a1'))).toBe(
      true,
    );
  });

  it('is true when the first leader appears on an empty board', () => {
    expect(wouldChangeLeader([], board('player-a1'))).toBe(true);
  });

  it('is false for two empty boards', () => {
    expect(wouldChangeLeader([], [])).toBe(false);
  });
});

describe('wouldTakeTheLead', () => {
  it('is true when a goal breaks a deadlock', () => {
    expect(wouldTakeTheLead({ scoreA: 1, scoreB: 1, winner: 'draw' }, 'A')).toBe(true);
    expect(wouldTakeTheLead({ scoreA: 0, scoreB: 0, winner: 'draw' }, 'B')).toBe(true);
  });

  it('is false when the scoring team already leads', () => {
    expect(wouldTakeTheLead({ scoreA: 2, scoreB: 1, winner: 'A' }, 'A')).toBe(false);
  });

  it('is false when the goal only equalises', () => {
    expect(wouldTakeTheLead({ scoreA: 2, scoreB: 1, winner: 'A' }, 'B')).toBe(false);
  });

  it('is false when the goal merely narrows a two-goal gap', () => {
    expect(wouldTakeTheLead({ scoreA: 3, scoreB: 1, winner: 'A' }, 'B')).toBe(false);
  });
});

// ===========================================================================
// Timer maths
// ===========================================================================

describe('elapsedMs', () => {
  const running: TimerSnapshot = {
    state: 'running',
    mode: 'count_up',
    startedAtMs: 1_000_000,
    accumulatedMs: 5_000,
    durationMs: null,
  };

  it('adds wall-clock time since the anchor while running', () => {
    expect(elapsedMs(running, 1_000_000)).toBe(5_000);
    expect(elapsedMs(running, 1_012_500)).toBe(17_500);
  });

  it('never runs backwards if the clock skews behind the anchor', () => {
    expect(elapsedMs(running, 999_000)).toBe(5_000);
  });

  it('freezes at the accumulated total while paused', () => {
    const paused: TimerSnapshot = { ...running, state: 'paused' };
    expect(elapsedMs(paused, 1_999_999)).toBe(5_000);
  });

  it('freezes when ready or ended', () => {
    expect(elapsedMs({ ...running, state: 'ready' }, 9_999_999)).toBe(5_000);
    expect(elapsedMs({ ...running, state: 'ended' }, 9_999_999)).toBe(5_000);
  });

  it('ignores a running state with no anchor', () => {
    expect(elapsedMs({ ...running, startedAtMs: null }, 9_999_999)).toBe(5_000);
  });
});

describe('displayMs', () => {
  it('counts up for the match clock', () => {
    const matchClock: TimerSnapshot = {
      state: 'running',
      mode: 'count_up',
      startedAtMs: 0,
      accumulatedMs: 0,
      durationMs: (SEED_CONFIG.challenges['5'] as FinalMatchConfig).halfDurationMs,
    };
    expect(displayMs(matchClock, 90_000)).toBe(90_000);
  });

  it('counts down for the 60-second centre-circle timer', () => {
    const countdown: TimerSnapshot = {
      state: 'running',
      mode: 'count_down',
      startedAtMs: 0,
      accumulatedMs: 0,
      durationMs: centerCircle.timeLimitMs,
    };
    expect(displayMs(countdown, 0)).toBe(60_000);
    expect(displayMs(countdown, 15_500)).toBe(44_500);
    expect(displayMs(countdown, 60_000)).toBe(0);
  });

  it('floors a countdown at zero once time is up', () => {
    const countdown: TimerSnapshot = {
      state: 'running',
      mode: 'count_down',
      startedAtMs: 0,
      accumulatedMs: 0,
      durationMs: 60_000,
    };
    expect(displayMs(countdown, 75_000)).toBe(0);
  });

  it('counts up when a count_down timer has no duration configured', () => {
    const countdown: TimerSnapshot = {
      state: 'running',
      mode: 'count_down',
      startedAtMs: 0,
      accumulatedMs: 0,
      durationMs: null,
    };
    expect(displayMs(countdown, 4_000)).toBe(4_000);
  });

  it('runs as a stopwatch for the dribble attempt clock', () => {
    const stopwatch: TimerSnapshot = {
      state: 'running',
      mode: 'stopwatch',
      startedAtMs: 500,
      accumulatedMs: 0,
      durationMs: null,
    };
    expect(displayMs(stopwatch, 15_499)).toBe(14_999);
  });
});

describe('hasExpired', () => {
  const countdown: TimerSnapshot = {
    state: 'running',
    mode: 'count_down',
    startedAtMs: 0,
    accumulatedMs: 0,
    durationMs: 60_000,
  };

  it('is false before the duration elapses', () => {
    expect(hasExpired(countdown, 59_999)).toBe(false);
  });

  it('is true exactly at the duration and beyond', () => {
    expect(hasExpired(countdown, 60_000)).toBe(true);
    expect(hasExpired(countdown, 60_001)).toBe(true);
  });

  it('is never true for an open-ended timer', () => {
    expect(hasExpired({ ...countdown, durationMs: null }, 9_999_999)).toBe(false);
  });

  it('respects a paused timer that has not yet run out', () => {
    expect(
      hasExpired({ ...countdown, state: 'paused', accumulatedMs: 40_000 }, 9_999_999),
    ).toBe(false);
  });
});

describe('formatClock', () => {
  it('renders mm:ss by default', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(1_000)).toBe('00:01');
    expect(formatClock(65_400)).toBe('01:05');
    expect(formatClock(600_000)).toBe('10:00');
    expect(formatClock(1_200_000)).toBe('20:00');
    expect(formatClock(2_400_000)).toBe('40:00');
  });

  it('renders tenths when asked', () => {
    expect(formatClock(0, { tenths: true })).toBe('00:00.0');
    expect(formatClock(65_400, { tenths: true })).toBe('01:05.4');
    expect(formatClock(14_999, { tenths: true })).toBe('00:14.9');
    expect(formatClock(59_950, { tenths: true })).toBe('00:59.9');
  });

  it('truncates rather than rounds the tenth', () => {
    expect(formatClock(1_999, { tenths: true })).toBe('00:01.9');
  });

  it('clamps negative input to zero', () => {
    expect(formatClock(-5_000)).toBe('00:00');
    expect(formatClock(-5_000, { tenths: true })).toBe('00:00.0');
  });

  it('pads both fields to two digits', () => {
    expect(formatClock(9_000)).toBe('00:09');
    expect(formatClock(540_000)).toBe('09:00');
  });
});

// ===========================================================================
// End-to-end: a full seeded challenge round scored through the engine
// ===========================================================================

describe('integration — a full challenge 3 round under the seeded profile', () => {
  const { teamA, teamB } = seededSquad();

  it('scores, totals and turns three shots each into ledger entries', () => {
    const aPayloads = [
      { kind: 'long_range' as const, zoneId: 'green100' },
      { kind: 'long_range' as const, zoneId: null },
      { kind: 'long_range' as const, zoneId: 'red20' },
    ];
    const bPayloads = [
      { kind: 'long_range' as const, zoneId: 'blue50' },
      { kind: 'long_range' as const, zoneId: 'red30' },
      { kind: 'long_range' as const, zoneId: 'blue50' },
    ];

    const rows: AttemptRow[] = [
      ...aPayloads.map((payload, i) =>
        makeAttempt({
          id: `a${i + 1}`,
          side: 'A',
          attempt_number: i + 1,
          payload,
          points: scoreAttempt(longRange, payload),
        }),
      ),
      ...bPayloads.map((payload, i) =>
        makeAttempt({
          id: `b${i + 1}`,
          side: 'B',
          attempt_number: i + 1,
          payload,
          points: scoreAttempt(longRange, payload),
        }),
      ),
    ];

    const totals = computeRoundTotals(rows);
    expect(totals.scoreA).toBe(12); // 10 + 0 + 2
    expect(totals.scoreB).toBe(13); // 5 + 3 + 5
    expect(totals.winner).toBe('B');

    const entries = ledgerEntriesForRound({
      totals,
      playerA: teamA[2],
      playerB: teamB[2],
      bonuses: SEED_CONFIG.bonuses,
    });
    expect(entries).toEqual([
      {
        playerId: 'player-a3',
        teamId: TEAM_A_ID,
        entryType: 'attempt_points',
        points: 12,
        sourceRef: null,
      },
      {
        playerId: 'player-b3',
        teamId: TEAM_B_ID,
        entryType: 'attempt_points',
        points: 13,
        sourceRef: null,
      },
    ]);
  });
});
