/**
 * Zod schemas for every server-action input.
 *
 * Server actions are a public HTTP surface, so nothing is trusted: each action
 * parses its input here before touching the database.
 */

import { z } from 'zod';

export const uuid = z.string().uuid();
export const teamCode = z.enum(['A', 'B']);
export const idempotencyKey = z.string().min(8).max(128);
export const reason = z.string().trim().min(3).max(500);

export const commandBase = z.object({
  idempotencyKey,
  deviceId: z.string().max(128).nullish(),
  expectedRevision: z.number().int().nonnegative().nullish(),
});

export const attemptPayloadSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('mannequin_target'), targetId: z.string().min(1).nullable() }),
  z.object({
    kind: z.literal('dribble_finish'),
    timeMs: z.number().int().min(0).max(600_000),
    scored: z.boolean(),
  }),
  z.object({ kind: z.literal('long_range'), zoneId: z.string().min(1).nullable() }),
  z.object({ kind: z.literal('center_circle'), hit: z.boolean() }),
]);

export const recordAttemptSchema = commandBase.extend({
  roundId: uuid,
  playerId: uuid,
  side: teamCode,
  attemptNumber: z.number().int().min(1).max(10),
  payload: attemptPayloadSchema,
});

export const reverseAttemptSchema = commandBase.extend({
  attemptId: uuid,
  reason,
});

export const roundCommandSchema = commandBase.extend({ roundId: uuid });

export const reopenRoundSchema = commandBase.extend({ roundId: uuid, reason });

export const challengeCommandSchema = commandBase.extend({ challengeId: uuid });

export const ensureTimerSchema = commandBase.extend({
  scope: z.enum(['round', 'match', 'attempt']),
  roundId: uuid.nullish(),
  matchId: uuid.nullish(),
  segment: z.number().int().min(1).max(10).optional(),
  mode: z.enum(['count_up', 'count_down', 'stopwatch']),
  durationMs: z.number().int().min(0).max(24 * 60 * 60 * 1000).nullish(),
  label: z.string().max(80).nullish(),
});

export const timerCommandSchema = commandBase.extend({ timerId: uuid });

export const addGoalSchema = commandBase.extend({
  matchId: uuid,
  teamCode,
  scorerId: uuid.nullable(),
  isOwnGoal: z.boolean().optional(),
  ownGoalByPlayerId: uuid.nullish(),
  method: z
    .enum(['open_play', 'penalty_in_play', 'free_kick', 'header', 'own_goal'])
    .optional(),
  clockMs: z.number().int().min(0).max(6 * 60 * 60 * 1000),
  half: z.number().int().min(1).max(4),
});

export const reverseGoalSchema = commandBase.extend({ goalId: uuid, reason });

export const setGoalPointsModeSchema = commandBase.extend({
  matchId: uuid,
  mode: z.enum(['team_share', 'scorer_only', 'scorer_plus_team']),
});

export const halfCommandSchema = commandBase.extend({
  matchId: uuid,
  half: z.number().int().min(1).max(4),
});

export const matchCommandSchema = commandBase.extend({ matchId: uuid });

export const recordPenaltyAttemptSchema = commandBase.extend({
  shootoutId: uuid,
  teamCode,
  playerId: uuid.nullable(),
  scored: z.boolean(),
  sequence: z.number().int().min(1).max(100).optional(),
  isSuddenDeath: z.boolean().optional(),
});

export const reversePenaltyAttemptSchema = commandBase.extend({
  attemptId: uuid,
  reason,
});

export const setLineupSlotSchema = commandBase.extend({
  challengeId: uuid,
  teamCode,
  slotIndex: z.number().int().min(1).max(5),
  playerId: uuid.nullable(),
});

export const displaySceneEnum = z.enum([
  // Keep in step with `DisplayScene` in src/lib/types.ts and the Postgres
  // `display_scene` enum. A value missing here is rejected before it ever
  // reaches the database. AUTO was added to both of those and missed here,
  // which made every route to it — the console tile, a cut, and the one-press
  // BACK TO AUTO — fail input validation, with the type checker none the wiser
  // because the input is typed `DisplayScene`. The wall could only ever be put
  // on AUTO by writing the row by hand. `display-scene-parity.test.ts` now
  // fails if these three lists drift apart again.
  'auto',
  'holding',
  'lineups',
  'head_to_head',
  'live_round',
  'round_result',
  'challenge_result',
  'final_match',
  'leaderboard',
  'ceremony',
  'player_entrance',
  'hydration_break',
]);

export const displaySceneSchema = commandBase.extend({
  scene: displaySceneEnum,
  payload: z.record(z.string(), z.unknown()).optional(),
});

export const startBreakSchema = commandBase.extend({
  /** How long the break runs. Defaults to two minutes at the call site. */
  durationMs: z.number().int().min(15_000).max(1_800_000).optional(),
  headline: z.string().max(60).optional(),
});

export const ceremonyPhaseSchema = commandBase.extend({
  phase: z.string().max(60).nullable(),
});

export const adjustPlayerPointsSchema = commandBase.extend({
  playerId: uuid,
  points: z.number().min(-1000).max(1000),
  reason,
});

// --- scoring profile -------------------------------------------------------

const targetOption = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  points: z.number(),
  color: z.string().optional(),
});

const mannequinTargetConfig = z.object({
  mechanic: z.literal('mannequin_target'),
  attemptsPerPlayer: z.number().int().min(1).max(10),
  targets: z.array(targetOption).min(1),
  missPoints: z.number(),
});

const dribbleFinishConfig = z.object({
  mechanic: z.literal('dribble_finish'),
  attemptsPerPlayer: z.number().int().min(1).max(10),
  dribbleThresholdMs: z.number().int().min(0),
  dribbleBonusPoints: z.number(),
  goalPoints: z.number(),
  maxPointsPerAttempt: z.number(),
});

const longRangeConfig = z.object({
  mechanic: z.literal('long_range'),
  attemptsPerPlayer: z.number().int().min(1).max(10),
  zones: z.array(targetOption).min(1),
  missPoints: z.number(),
});

const centerCircleConfig = z.object({
  mechanic: z.literal('center_circle'),
  ballsPerPlayer: z.number().int().min(1).max(10),
  timeLimitMs: z.number().int().min(1000),
  pointsPerHit: z.number(),
});

const finalMatchConfig = z.object({
  mechanic: z.literal('final_match'),
  halves: z.number().int().min(1).max(4),
  halfDurationMs: z.number().int().min(60_000),
});

const challengeConfig = z.discriminatedUnion('mechanic', [
  mannequinTargetConfig,
  dribbleFinishConfig,
  longRangeConfig,
  centerCircleConfig,
  finalMatchConfig,
]);

export const scoringConfigSchema = z.object({
  challenges: z.object({
    '1': challengeConfig,
    '2': challengeConfig,
    '3': challengeConfig,
    '4': challengeConfig,
    '5': challengeConfig,
  }),
  match: z.object({
    goalPointsMode: z.enum(['team_share', 'scorer_only', 'scorer_plus_team']),
    teamShare: z.object({ pointsPerPlayer: z.number() }),
    scorerOnly: z.object({ scorerPoints: z.number() }),
    scorerPlusTeam: z.object({ scorerPoints: z.number(), teammatePoints: z.number() }),
    ownGoal: z.object({
      creditBenefitingTeam: z.boolean(),
      scorerGetsPoints: z.boolean(),
    }),
    winBonus: z.number(),
  }),
  bonuses: z.object({
    roundWinBonus: z.number(),
    roundDrawPoints: z.number(),
    challengeWinBonus: z.number(),
  }),
  penalties: z.object({
    enabledFor: z.enum(['final_match_only', 'every_draw', 'disabled']),
    openingAttempts: z.number().int().min(1).max(20),
    suddenDeath: z.boolean(),
    pointsPerScoredAttempt: z.number(),
    winnerPoints: z.number(),
  }),
  /**
   * The two-competition day.
   *
   * Absent from this schema until now, and zod strips what it does not
   * declare — so the first Publish on the scoring console silently deleted the
   * whole block from the new profile version. That switches off golden goal
   * and drops `openShootout` back to its pre-format branch, where a shootout
   * needs a DRAWN match rather than a level day: the deciding shootout of the
   * format becomes unreachable, and nothing anywhere reports a problem.
   * Optional, because profiles written before the format existed have no block
   * and must keep loading.
   */
  day: z
    .object({
      twoCompetitions: z.boolean(),
      goldenGoal: z.boolean(),
      goldenGoalRestMinutes: z.number().int().min(0).max(60),
      shootoutDecidesDay: z.boolean(),
    })
    .optional(),
  ranking: z.object({
    primary: z.literal('regular_points'),
    tiebreakers: z.array(z.literal('penalty_tiebreak_points')),
    sharedRankOnTie: z.boolean(),
  }),
});

export const updateScoringProfileSchema = commandBase.extend({
  config: scoringConfigSchema,
});

// --- entities --------------------------------------------------------------

export const updateEventSchema = commandBase.extend({
  patch: z
    .object({
      name: z.string().min(1).max(120),
      subtitle: z.string().max(160).nullable(),
      venue: z.string().max(160).nullable(),
      event_date: z.string().max(32).nullable(),
      start_time: z.string().max(64).nullable(),
      timezone: z.string().max(64),
      status: z.enum(['draft', 'ready', 'live', 'completed', 'locked', 'archived']),
      qr_target_url: z.string().max(500).nullable(),
      holding_status: z.string().max(80),
      holding_headline: z.string().max(160).nullable(),
      show_countdown: z.boolean(),
      settings: z.record(z.string(), z.unknown()),
    })
    .partial(),
});

export const updateTeamSchema = commandBase.extend({
  teamId: uuid,
  patch: z
    .object({
      name: z.string().min(1).max(80),
      short_name: z.string().max(40).nullable(),
      color: z.string().max(32),
      color_secondary: z.string().max(32).nullable(),
      crest_url: z.string().max(500).nullable(),
      display_order: z.number().int().min(0).max(99),
    })
    .partial(),
});

export const updatePlayerSchema = commandBase.extend({
  playerId: uuid,
  patch: z
    .object({
      team_id: uuid.nullable(),
      full_name: z.string().min(1).max(120),
      display_name: z.string().max(120).nullable(),
      jersey_number: z.number().int().min(0).max(99).nullable(),
      photo_url: z.string().max(500).nullable(),
      portrait_url: z.string().max(500).nullable(),
      focal_x: z.number().min(0).max(1),
      focal_y: z.number().min(0).max(1),
      bio: z.string().max(1000).nullable(),
      active: z.boolean(),
      display_order: z.number().int().min(0).max(99),
    })
    .partial(),
});

export const updateSponsorSchema = commandBase.extend({
  sponsorId: uuid,
  patch: z
    .object({
      name: z.string().min(1).max(120),
      tier: z.enum(['host', 'partner', 'operator', 'sponsor', 'technology']),
      logo_url: z.string().max(500).nullable(),
      logo_dark_url: z.string().max(500).nullable(),
      website_url: z.string().max(500).nullable(),
      ticker_order: z.number().int().min(0).max(99),
      active: z.boolean(),
    })
    .partial(),
});

// --- controller lease ------------------------------------------------------

export const claimLeaseSchema = z.object({
  deviceId: z.string().min(4).max(128),
  deviceLabel: z.string().max(80).nullish(),
  takeover: z.boolean().optional(),
  reason: z.string().max(200).nullish(),
});

export const releaseLeaseSchema = z.object({
  deviceId: z.string().min(4).max(128),
  reason: z.string().max(200).nullish(),
});

export const renewLeaseSchema = z.object({
  deviceId: z.string().min(4).max(128),
});

export const transferRequestSchema = z.object({
  deviceId: z.string().min(4).max(128),
  deviceLabel: z.string().max(80).nullish(),
  reason: z.string().max(200).nullish(),
});

export const transferDecisionSchema = z.object({
  /** The device currently holding the lease — only it may answer a request. */
  deviceId: z.string().min(4).max(128),
});

/** Flatten a zod failure into a single readable sentence. */
export function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join('; ');
}
