/**
 * A complete, plausible event, invented in memory.
 *
 * `/tv/preview?scene=…` renders any of the nine compositions from this instead
 * of the database, so the design can be reviewed, photographed and signed off
 * weeks before a single real score exists — and so an operator can check a
 * scene at 03:00 on show day without touching live state.
 *
 * It returns a real `EventSnapshot`, not a hand-shaped fake: every figure on
 * screen is derived by the same `buildSceneModel` / scoring-engine path the
 * live wall uses, so if the sample looks right the real thing is composed
 * right. The snapshot is plain data, which is what lets a server component
 * build it and hand it across to the client renderer.
 *
 * The scenes need materially different states — a live round needs attempts
 * mid-flight, a challenge result needs five finished rounds — so the shape of
 * the competition is chosen per scene, on top of one shared cast.
 */

import { rankPlayers, teamPointsFrom } from '@/lib/scoring/engine';
import {
  computeMatchScore,
  computePenaltyScore,
  computeRoundTotals,
  computeShootoutState,
} from '@/lib/scoring/engine';
import { SITE_URL } from '@/lib/event';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { CeremonyPhase } from '@/components/tv/constants';
import { resolveCeremonyPhase } from '@/components/tv/constants';
import type {
  AttemptRow,
  ChallengeRow,
  DisplayScene,
  DisplayStateRow,
  EventRow,
  GoalRow,
  LineupSlotRow,
  MatchRow,
  PenaltyAttemptRow,
  PenaltyShootoutRow,
  PlayerRow,
  RankedPlayer,
  RoundRow,
  ScoringConfig,
  ScoringProfileRow,
  SponsorRow,
  TeamCode,
  TeamRow,
  TimerRow,
} from '@/lib/types';

const EVENT_ID = 'sample-event';
const TEAM_A_ID = 'sample-team-a';
const TEAM_B_ID = 'sample-team-b';
const MATCH_ID = 'sample-match';
const SHOOTOUT_ID = 'sample-shootout';

const EVENT_DATE = '2026-08-27';
const CREATED_AT = '2026-08-01T09:00:00.000Z';

/** `now` is captured once per build so every derived clock agrees with itself. */
function iso(offsetMs: number, now: number): string {
  return new Date(now + offsetMs).toISOString();
}

// ---------------------------------------------------------------------------
// Scoring profile — the seeded production values, so the sample scores the way
// the real event scores. Penalty points are given a value here (the seed ships
// 0) purely so the leaderboard's penalty-tiebreak chip is inspectable in QA.
// ---------------------------------------------------------------------------

const SAMPLE_SCORING: ScoringConfig = {
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
    '5': { mechanic: 'final_match', halves: 2, halfDurationMs: 1200000 },
  },
  match: {
    goalPointsMode: 'team_share',
    teamShare: { pointsPerPlayer: 10 },
    scorerOnly: { scorerPoints: 10 },
    scorerPlusTeam: { scorerPoints: 10, teammatePoints: 5 },
    ownGoal: { creditBenefitingTeam: true, scorerGetsPoints: false },
    winBonus: 0,
  },
  bonuses: { roundWinBonus: 0, roundDrawPoints: 0, challengeWinBonus: 0 },
  penalties: {
    enabledFor: 'final_match_only',
    openingAttempts: 3,
    suddenDeath: true,
    pointsPerScoredAttempt: 1,
    winnerPoints: 0,
  },
  ranking: {
    primary: 'regular_points',
    tiebreakers: ['penalty_tiebreak_points'],
    sharedRankOnTie: true,
  },
};

const SAMPLE_PROFILE: ScoringProfileRow = {
  id: 'sample-profile',
  event_id: EVENT_ID,
  version: 1,
  config: SAMPLE_SCORING,
  is_locked: true,
  locked_at: CREATED_AT,
  locked_by: null,
  created_at: CREATED_AT,
};

// ---------------------------------------------------------------------------
// Event, teams, cast
// ---------------------------------------------------------------------------

const SAMPLE_EVENT: EventRow = {
  id: EVENT_ID,
  slug: 'sample-preview',
  name: 'SwanLake Football Stars',
  subtitle: 'Shores & Scores Challenge',
  venue: 'SwanLake North Coast',
  event_date: EVENT_DATE,
  start_time: '18:00:00',
  timezone: 'Africa/Cairo',
  status: 'live',
  qr_target_url: `${SITE_URL}/`,
  holding_status: 'STARTING SOON',
  holding_headline: 'LIVE FROM SWANLAKE NORTH COAST',
  show_countdown: true,
  revision: 412,
  settings: {},
  created_at: CREATED_AT,
  updated_at: CREATED_AT,
};

const SAMPLE_TEAMS: TeamRow[] = [
  {
    id: TEAM_A_ID,
    event_id: EVENT_ID,
    code: 'A',
    name: 'Shore Kings',
    short_name: 'SHORE KINGS',
    color: '#0E6BA8',
    color_secondary: '#8FD4E8',
    crest_url: null,
    display_order: 1,
  },
  {
    id: TEAM_B_ID,
    event_id: EVENT_ID,
    code: 'B',
    name: 'Coast Riders',
    short_name: 'COAST RIDERS',
    color: '#D3323C',
    color_secondary: '#F5A3A8',
    crest_url: null,
    display_order: 2,
  },
];

interface CastMember {
  slot: string;
  full: string;
  jersey: number;
  regular: number;
  penalty: number;
}

/**
 * Ten named players with a plausible spread. Two of them are level on 35,
 * which is what puts a genuine joint rank on the leaderboard and the podium —
 * the case most likely to break a layout, so QA should always be able to see it.
 */
const CAST: Record<TeamCode, CastMember[]> = {
  A: [
    { slot: 'A1', full: 'Youssef Kamel', jersey: 7, regular: 42, penalty: 0 },
    { slot: 'A2', full: 'Omar Hegazy', jersey: 10, regular: 35, penalty: 0 },
    { slot: 'A3', full: 'Karim Fathy', jersey: 4, regular: 31, penalty: 1 },
    { slot: 'A4', full: 'Ali Mansour', jersey: 9, regular: 26, penalty: 0 },
    { slot: 'A5', full: 'Ziad Nassar', jersey: 22, regular: 19, penalty: 1 },
  ],
  B: [
    { slot: 'B1', full: 'Hassan Ragab', jersey: 11, regular: 39, penalty: 1 },
    { slot: 'B2', full: 'Mostafa Aziz', jersey: 8, regular: 35, penalty: 0 },
    { slot: 'B3', full: 'Adham Sherif', jersey: 6, regular: 28, penalty: 0 },
    { slot: 'B4', full: 'Selim Darwish', jersey: 17, regular: 22, penalty: 1 },
    { slot: 'B5', full: 'Nour Ibrahim', jersey: 3, regular: 17, penalty: 0 },
  ],
};

function playerId(slot: string): string {
  return `sample-player-${slot.toLowerCase()}`;
}

const SAMPLE_PLAYERS: PlayerRow[] = (['A', 'B'] as TeamCode[]).flatMap((code) =>
  CAST[code].map((member, index) => ({
    id: playerId(member.slot),
    event_id: EVENT_ID,
    team_id: code === 'A' ? TEAM_A_ID : TEAM_B_ID,
    full_name: member.full,
    display_name: member.full.toUpperCase(),
    slug: member.full.toLowerCase().replace(/\s+/g, '-'),
    jersey_number: member.jersey,
    // No portraits ship in the repo yet, so the sample deliberately exercises
    // the branded silhouette fallback rather than pointing at 404s.
    photo_url: null,
    portrait_url: null,
    focal_x: 0.5,
    focal_y: 0.34,
    bio: null,
    active: true,
    display_order: index + 1,
    created_at: CREATED_AT,
  })),
);

const PLAYERS_BY_ID: Record<string, PlayerRow> = Object.fromEntries(
  SAMPLE_PLAYERS.map((p) => [p.id, p]),
);

const P = (slot: string) => playerId(slot);

// ---------------------------------------------------------------------------
// Standings — ranked by the real engine, so shared ranks behave correctly.
// ---------------------------------------------------------------------------

const SAMPLE_STANDINGS: RankedPlayer[] = rankPlayers(
  (['A', 'B'] as TeamCode[]).flatMap((code) =>
    CAST[code].map((member) => ({
      player: PLAYERS_BY_ID[playerId(member.slot)],
      regularPoints: member.regular,
      penaltyPoints: member.penalty,
      teamCode: code,
      slotLabel: member.slot,
    })),
  ),
  SAMPLE_SCORING.ranking,
);

const SAMPLE_TEAM_POINTS = teamPointsFrom(SAMPLE_STANDINGS);

// ---------------------------------------------------------------------------
// Challenges and lineups
// ---------------------------------------------------------------------------

interface ChallengeSpec {
  number: number;
  mechanic: ChallengeRow['mechanic'];
  title: string;
  subtitle: string;
}

const CHALLENGE_SPECS: ChallengeSpec[] = [
  {
    number: 1,
    mechanic: 'mannequin_target',
    title: 'Mannequin Target',
    subtitle: 'Three shots. Pick your target.',
  },
  {
    number: 2,
    mechanic: 'dribble_finish',
    title: 'Dribble & Finish',
    subtitle: 'Beat the clock, then beat the keeper.',
  },
  {
    number: 3,
    mechanic: 'long_range',
    title: 'Long-Range Shootout',
    subtitle: 'The further out, the bigger the prize.',
  },
  {
    number: 4,
    mechanic: 'center_circle',
    title: 'Centre Circle',
    subtitle: 'Ten balls. Sixty seconds.',
  },
  {
    number: 5,
    mechanic: 'final_match',
    title: 'The Final Match',
    subtitle: 'Five a side. Forty minutes.',
  },
];

function challengeId(number: number): string {
  return `sample-challenge-${number}`;
}

function challengeRow(
  spec: ChallengeSpec,
  status: ChallengeRow['status'],
  winner: ChallengeRow['winner'] = null,
): ChallengeRow {
  return {
    id: challengeId(spec.number),
    event_id: EVENT_ID,
    number: spec.number,
    mechanic: spec.mechanic,
    title: spec.title,
    subtitle: spec.subtitle,
    description: null,
    status,
    aggregation_rule: 'total_points',
    round_count: spec.mechanic === 'final_match' ? 0 : 5,
    locked_at: status === 'draft' ? null : CREATED_AT,
    completed_at: status === 'completed' ? CREATED_AT : null,
    winner,
  };
}

/** Every challenge carries the same ten slots, A1–A5 then B1–B5. */
const SAMPLE_LINEUPS: LineupSlotRow[] = CHALLENGE_SPECS.flatMap((spec) =>
  (['A', 'B'] as TeamCode[]).flatMap((code) =>
    CAST[code].map((member, index) => ({
      id: `sample-slot-${spec.number}-${member.slot}`,
      challenge_id: challengeId(spec.number),
      team_id: code === 'A' ? TEAM_A_ID : TEAM_B_ID,
      team_code: code,
      slot_index: index + 1,
      slot_label: member.slot,
      player_id: playerId(member.slot),
    })),
  ),
);

// ---------------------------------------------------------------------------
// Challenge 2 — the 1v1 challenge every round scene is composed against
// ---------------------------------------------------------------------------

interface RoundSpec {
  number: number;
  scoreA: number;
  scoreB: number;
}

/** Five finished rounds: A wins on points 47–42 with one drawn round. */
const CHALLENGE_TWO_ROUNDS: RoundSpec[] = [
  { number: 1, scoreA: 11, scoreB: 8 },
  { number: 2, scoreA: 7, scoreB: 9 },
  { number: 3, scoreA: 8, scoreB: 10 },
  { number: 4, scoreA: 12, scoreB: 6 },
  { number: 5, scoreA: 9, scoreB: 9 },
];

function roundId(number: number): string {
  return `sample-round-${number}`;
}

function roundRow(
  spec: RoundSpec,
  status: RoundRow['status'],
  activeSide: TeamCode | null = null,
): RoundRow {
  const decided = status === 'published' || status === 'completed';
  return {
    id: roundId(spec.number),
    challenge_id: challengeId(2),
    number: spec.number,
    status,
    player_a_id: P(`A${spec.number}`),
    player_b_id: P(`B${spec.number}`),
    score_a: spec.scoreA,
    score_b: spec.scoreB,
    winner: decided
      ? spec.scoreA > spec.scoreB
        ? 'A'
        : spec.scoreB > spec.scoreA
          ? 'B'
          : 'draw'
      : null,
    active_side: activeSide,
    published_at: decided ? CREATED_AT : null,
    completed_at: decided ? CREATED_AT : null,
    revision: 3,
  };
}

/** Rounds 1–2 in the books, round 3 on the field, 4–5 still to come. */
function roundsInProgress(status: RoundRow['status']): RoundRow[] {
  return CHALLENGE_TWO_ROUNDS.map((spec) => {
    if (spec.number < 3) return roundRow(spec, 'published');
    if (spec.number === 3) {
      // Live round 3 is scored from its attempts, not from these figures.
      return roundRow({ ...spec, scoreA: 8, scoreB: 5 }, status, status === 'live' ? 'B' : null);
    }
    return roundRow({ ...spec, scoreA: 0, scoreB: 0 }, 'pending');
  });
}

function roundsComplete(): RoundRow[] {
  return CHALLENGE_TWO_ROUNDS.map((spec) => roundRow(spec, 'completed'));
}

function dribbleAttempt(
  side: TeamCode,
  slot: string,
  attemptNumber: number,
  timeMs: number,
  scored: boolean,
  points: number,
  now: number,
): AttemptRow {
  return {
    id: `sample-attempt-${slot}-${attemptNumber}`,
    round_id: roundId(3),
    player_id: P(slot),
    side,
    attempt_number: attemptNumber,
    payload: { kind: 'dribble_finish', timeMs, scored },
    points,
    status: 'confirmed',
    reverses_id: null,
    created_by: null,
    created_at: iso(-90_000 + attemptNumber * 20_000, now),
  };
}

/**
 * Round 3 mid-flight: A3 has taken two attempts (5 then 3), B3 one (5), and
 * B is on the ball. 8–5, one attempt each still to come.
 */
function roundThreeAttempts(now: number): AttemptRow[] {
  return [
    dribbleAttempt('A', 'A3', 1, 12_400, true, 5, now),
    dribbleAttempt('A', 'A3', 2, 16_800, true, 3, now),
    dribbleAttempt('B', 'B3', 1, 13_200, true, 5, now),
  ];
}

// ---------------------------------------------------------------------------
// The final match
// ---------------------------------------------------------------------------

const SAMPLE_GOALS: GoalRow[] = [
  {
    id: 'sample-goal-1',
    match_id: MATCH_ID,
    team_code: 'A',
    scorer_id: P('A1'),
    is_own_goal: false,
    own_goal_by_player_id: null,
    method: 'open_play',
    clock_ms: 512_000,
    half: 1,
    status: 'confirmed',
    reverses_id: null,
    created_by: null,
    created_at: CREATED_AT,
  },
  {
    id: 'sample-goal-2',
    match_id: MATCH_ID,
    team_code: 'B',
    scorer_id: P('B4'),
    is_own_goal: false,
    own_goal_by_player_id: null,
    method: 'open_play',
    clock_ms: 1_043_000,
    half: 1,
    status: 'confirmed',
    reverses_id: null,
    created_by: null,
    created_at: CREATED_AT,
  },
  {
    id: 'sample-goal-3',
    match_id: MATCH_ID,
    team_code: 'B',
    scorer_id: null,
    is_own_goal: true,
    own_goal_by_player_id: P('A5'),
    method: 'own_goal',
    clock_ms: 164_000,
    half: 2,
    status: 'confirmed',
    reverses_id: null,
    created_by: null,
    created_at: CREATED_AT,
  },
  {
    id: 'sample-goal-4',
    match_id: MATCH_ID,
    team_code: 'A',
    scorer_id: P('A4'),
    is_own_goal: false,
    own_goal_by_player_id: null,
    method: 'open_play',
    clock_ms: 322_000,
    half: 2,
    status: 'confirmed',
    reverses_id: null,
    created_by: null,
    created_at: CREATED_AT,
  },
];

function matchRow(status: MatchRow['status'], half: number): MatchRow {
  const totals = computeMatchScore(SAMPLE_GOALS);
  return {
    id: MATCH_ID,
    challenge_id: challengeId(5),
    status,
    score_a: totals.scoreA,
    score_b: totals.scoreB,
    penalty_score_a: 0,
    penalty_score_b: 0,
    goal_points_mode: 'team_share',
    current_half: half,
    winner: status === 'completed' ? totals.winner : null,
    published_at: status === 'completed' ? CREATED_AT : null,
    completed_at: status === 'completed' ? CREATED_AT : null,
    revision: 18,
  };
}

const SAMPLE_SHOOTOUT: PenaltyShootoutRow = {
  id: SHOOTOUT_ID,
  match_id: MATCH_ID,
  // Left open so `?scene=final_match&phase=penalties` has a live shootout to
  // draw, while the ordinary match view stays free of it.
  status: 'open',
  opening_attempts: 3,
  winner: null,
  completed_at: null,
  created_at: CREATED_AT,
};

const SAMPLE_PENALTIES: PenaltyAttemptRow[] = [
  ['A', 'A1', true],
  ['B', 'B1', true],
  ['A', 'A2', false],
  ['B', 'B2', true],
  ['A', 'A3', true],
].map(([team, slot, scored], index) => ({
  id: `sample-penalty-${index + 1}`,
  shootout_id: SHOOTOUT_ID,
  sequence: index + 1,
  team_code: team as TeamCode,
  player_id: P(slot as string),
  scored: scored as boolean,
  is_sudden_death: false,
  status: 'confirmed' as const,
  reverses_id: null,
  created_by: null,
  created_at: CREATED_AT,
}));

// ---------------------------------------------------------------------------
// Sponsors
// ---------------------------------------------------------------------------

const SAMPLE_SPONSORS: SponsorRow[] = [
  ['Yalla Sahel', 'partner', '/brand/yalla-sahel.svg'],
  ['Tellr', 'partner', '/brand/tellr.svg'],
  ['SwanLake North Coast', 'host', '/brand/swanlake-north-coast.svg'],
  ['Hassan Allam Properties', 'host', '/brand/hassan-allam.svg'],
  ['Sports United', 'operator', '/brand/sports-united.svg'],
  ['Powered by Move Beyond', 'technology', '/brand/move-beyond.svg'],
].map(([name, tier, logo], index) => ({
  id: `sample-sponsor-${index + 1}`,
  event_id: EVENT_ID,
  name: name as string,
  tier: tier as SponsorRow['tier'],
  logo_url: logo as string,
  logo_dark_url: null,
  website_url: null,
  ticker_order: index + 1,
  active: true,
}));

// ---------------------------------------------------------------------------
// Timers
// ---------------------------------------------------------------------------

/** The dribble stopwatch, seven seconds into B3's third run. */
function roundTimer(now: number): TimerRow {
  return {
    id: 'sample-timer-round',
    event_id: EVENT_ID,
    round_id: roundId(3),
    match_id: null,
    scope: 'attempt',
    label: 'DRIBBLE',
    segment: 1,
    mode: 'count_up',
    duration_ms: null,
    state: 'running',
    started_at: iso(-7_200, now),
    accumulated_ms: 0,
    ended_at: null,
    updated_at: iso(-7_200, now),
  };
}

/** The match clock, six minutes into the second half — 26:00 continuous. */
function matchTimer(now: number, state: TimerRow['state'], half: number): TimerRow {
  return {
    id: 'sample-timer-match',
    event_id: EVENT_ID,
    round_id: null,
    match_id: MATCH_ID,
    scope: 'match',
    label: `HALF ${half}`,
    segment: half,
    mode: 'count_up',
    duration_ms: 1_200_000,
    state,
    started_at: state === 'running' ? iso(-366_000, now) : null,
    accumulated_ms: state === 'running' ? 0 : 1_200_000,
    ended_at: state === 'ended' ? iso(-30_000, now) : null,
    updated_at: iso(-366_000, now),
  };
}

// ---------------------------------------------------------------------------
// Assembly
// ---------------------------------------------------------------------------

/** Which challenge each scene is composed against. */
function challengeSetFor(scene: DisplayScene): ChallengeRow[] {
  switch (scene) {
    case 'holding':
      return CHALLENGE_SPECS.map((spec) => challengeRow(spec, spec.number === 1 ? 'ready' : 'draft'));
    case 'lineups':
      return CHALLENGE_SPECS.map((spec) =>
        challengeRow(
          spec,
          spec.number === 1 ? 'completed' : spec.number === 2 ? 'ready' : 'draft',
          spec.number === 1 ? 'A' : null,
        ),
      );
    case 'challenge_result':
      return CHALLENGE_SPECS.map((spec) =>
        challengeRow(
          spec,
          spec.number <= 2 ? 'completed' : spec.number === 3 ? 'ready' : 'draft',
          spec.number === 1 ? 'B' : spec.number === 2 ? 'A' : null,
        ),
      );
    case 'final_match':
      return CHALLENGE_SPECS.map((spec) =>
        challengeRow(
          spec,
          spec.number <= 4 ? 'completed' : 'live',
          spec.number === 1 ? 'A' : spec.number === 2 ? 'A' : spec.number === 3 ? 'B' : spec.number === 4 ? 'A' : null,
        ),
      );
    case 'ceremony':
      return CHALLENGE_SPECS.map((spec) =>
        challengeRow(
          spec,
          'completed',
          spec.number === 3 ? 'B' : 'A',
        ),
      );
    case 'leaderboard':
      return CHALLENGE_SPECS.map((spec) =>
        challengeRow(
          spec,
          spec.number <= 2 ? 'completed' : spec.number === 3 ? 'ready' : 'draft',
          spec.number === 1 ? 'B' : spec.number === 2 ? 'A' : null,
        ),
      );
    default:
      // head_to_head, live_round, round_result — challenge 2 is on the field.
      return CHALLENGE_SPECS.map((spec) =>
        challengeRow(
          spec,
          spec.number === 1 ? 'completed' : spec.number === 2 ? 'live' : 'draft',
          spec.number === 1 ? 'B' : null,
        ),
      );
  }
}

interface SceneShape {
  currentChallengeNumber: number;
  rounds: RoundRow[];
  currentRoundNumber: number | null;
  attempts: AttemptRow[];
  matchStatus: MatchRow['status'] | null;
  matchHalf: number;
  withShootout: boolean;
  timers: TimerRow[];
}

function shapeFor(scene: DisplayScene, now: number): SceneShape {
  const none: Omit<SceneShape, 'currentChallengeNumber' | 'rounds' | 'currentRoundNumber'> = {
    attempts: [],
    matchStatus: null,
    matchHalf: 1,
    withShootout: false,
    timers: [],
  };

  switch (scene) {
    case 'holding':
      return {
        ...none,
        currentChallengeNumber: 1,
        rounds: [],
        currentRoundNumber: null,
      };

    case 'lineups':
      return {
        ...none,
        currentChallengeNumber: 2,
        rounds: CHALLENGE_TWO_ROUNDS.map((spec) =>
          roundRow({ ...spec, scoreA: 0, scoreB: 0 }, 'pending'),
        ),
        currentRoundNumber: 1,
      };

    case 'head_to_head':
      return {
        ...none,
        currentChallengeNumber: 2,
        rounds: roundsInProgress('ready'),
        currentRoundNumber: 3,
      };

    case 'live_round':
      return {
        ...none,
        currentChallengeNumber: 2,
        rounds: roundsInProgress('live'),
        currentRoundNumber: 3,
        attempts: roundThreeAttempts(now),
        timers: [roundTimer(now)],
      };

    case 'round_result':
      return {
        ...none,
        currentChallengeNumber: 2,
        rounds: CHALLENGE_TWO_ROUNDS.map((spec) =>
          spec.number <= 3
            ? roundRow(spec, 'published')
            : roundRow({ ...spec, scoreA: 0, scoreB: 0 }, 'pending'),
        ),
        currentRoundNumber: 3,
      };

    case 'challenge_result':
      return {
        ...none,
        currentChallengeNumber: 2,
        rounds: roundsComplete(),
        currentRoundNumber: 5,
      };

    case 'final_match':
      return {
        ...none,
        currentChallengeNumber: 5,
        rounds: [],
        currentRoundNumber: null,
        matchStatus: 'live',
        matchHalf: 2,
        withShootout: true,
        timers: [matchTimer(now, 'running', 2)],
      };

    case 'leaderboard':
      return {
        ...none,
        currentChallengeNumber: 2,
        rounds: roundsComplete(),
        currentRoundNumber: 5,
      };

    case 'ceremony':
      return {
        ...none,
        currentChallengeNumber: 5,
        rounds: [],
        currentRoundNumber: null,
        matchStatus: 'completed',
        matchHalf: 2,
        withShootout: false,
        timers: [matchTimer(now, 'ended', 2)],
      };

    default:
      return {
        ...none,
        currentChallengeNumber: 1,
        rounds: [],
        currentRoundNumber: null,
      };
  }
}

/**
 * A full, self-consistent `EventSnapshot` for one scene.
 *
 * Plain data throughout — no functions, no class instances — so a server
 * component can build it and pass it to the client renderer, which then derives
 * the same `SceneModel` the live wall derives.
 */
export function buildSampleSnapshot(scene: DisplayScene): EventSnapshot {
  const now = Date.now();
  const challenges = challengeSetFor(scene);
  const shape = shapeFor(scene, now);

  const currentChallenge =
    challenges.find((c) => c.number === shape.currentChallengeNumber) ?? challenges[0] ?? null;
  const currentRound =
    shape.currentRoundNumber != null
      ? shape.rounds.find((r) => r.number === shape.currentRoundNumber) ?? null
      : null;

  const match = shape.matchStatus ? matchRow(shape.matchStatus, shape.matchHalf) : null;
  const goals = match ? SAMPLE_GOALS : [];
  const shootout = shape.withShootout ? SAMPLE_SHOOTOUT : null;
  const penaltyAttempts = shootout ? SAMPLE_PENALTIES : [];

  const lineup = currentChallenge
    ? SAMPLE_LINEUPS.filter((s) => s.challenge_id === currentChallenge.id)
    : [];

  return {
    fetchedAt: now,
    revision: SAMPLE_EVENT.revision,

    event: SAMPLE_EVENT,
    teams: SAMPLE_TEAMS,
    teamsByCode: { A: SAMPLE_TEAMS[0], B: SAMPLE_TEAMS[1] },
    players: SAMPLE_PLAYERS,
    playersById: PLAYERS_BY_ID,

    challenges,
    currentChallenge,
    rounds: shape.rounds,
    currentRound,
    attempts: shape.attempts,
    roundTotals: currentRound ? computeRoundTotals(shape.attempts) : null,
    lineup,
    allLineups: SAMPLE_LINEUPS,

    match,
    goals,
    matchTotals: match ? computeMatchScore(goals) : null,
    shootout,
    penaltyAttempts,
    penaltyTotals: shootout ? computePenaltyScore(penaltyAttempts) : null,
    shootoutState: shootout
      ? computeShootoutState(penaltyAttempts, {
          openingAttempts: shootout.opening_attempts,
          suddenDeath: SAMPLE_SCORING.penalties.suddenDeath,
        })
      : null,

    standings: SAMPLE_STANDINGS,
    teamPoints: SAMPLE_TEAM_POINTS,

    scoringProfile: SAMPLE_PROFILE,
    scoring: SAMPLE_SCORING,

    displayState: sampleDisplayState(scene, now),
    sponsors: SAMPLE_SPONSORS,

    timers: shape.timers,
    activeTimer: shape.timers.find((t) => t.state === 'running') ?? shape.timers[0] ?? null,
  };
}

function sampleDisplayState(scene: DisplayScene, now: number): DisplayStateRow {
  return {
    id: 'sample-display',
    event_id: EVENT_ID,
    program_scene: scene,
    program_payload: {},
    preview_scene: null,
    preview_payload: {},
    ceremony_phase: scene === 'ceremony' ? 'champions' : null,
    revision: 1,
    updated_by: null,
    updated_at: iso(0, now),
  };
}

/**
 * The payload each sample scene is most worth inspecting with.
 *
 * These are the operator-facing keys the scene agents documented: the ceremony
 * reads `photo_hold` and `breakdown`, the leaderboard reads `buildup`, the
 * final match reads `phase`. QA overrides any of them from the query string.
 */
export function sampleSceneDefaults(scene: DisplayScene): {
  payload: Record<string, unknown>;
  ceremonyPhase: CeremonyPhase;
} {
  switch (scene) {
    case 'ceremony':
      return {
        payload: {
          breakdown: [
            { label: 'CHALLENGE 01', value: 9 },
            { label: 'CHALLENGE 02', value: 11 },
            { label: 'CHALLENGE 03', value: 8 },
            { label: 'CHALLENGE 04', value: 4 },
            { label: 'FINAL MATCH', value: 10 },
          ],
        },
        ceremonyPhase: 'champions',
      };
    case 'final_match':
      return { payload: { phase: 'match' }, ceremonyPhase: 'complete' };
    default:
      return { payload: {}, ceremonyPhase: 'complete' };
  }
}

/** Every scene the QA route can force, in running order. */
export const SAMPLE_SCENES: readonly DisplayScene[] = [
  'holding',
  'lineups',
  'head_to_head',
  'live_round',
  'round_result',
  'challenge_result',
  'final_match',
  'leaderboard',
  'ceremony',
] as const;

const SCENE_ALIASES: Record<string, DisplayScene> = {
  h2h: 'head_to_head',
  headtohead: 'head_to_head',
  'head-to-head': 'head_to_head',
  live: 'live_round',
  liveround: 'live_round',
  'live-round': 'live_round',
  round: 'round_result',
  roundresult: 'round_result',
  'round-result': 'round_result',
  challenge: 'challenge_result',
  challengeresult: 'challenge_result',
  'challenge-result': 'challenge_result',
  match: 'final_match',
  final: 'final_match',
  finalmatch: 'final_match',
  'final-match': 'final_match',
  board: 'leaderboard',
  standings: 'leaderboard',
  awards: 'ceremony',
  lineup: 'lineups',
};

/** Normalise a `?scene=` value, or null when it names nothing we render. */
export function parseSampleScene(raw: string | null | undefined): DisplayScene | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  if (SAMPLE_SCENES.includes(key as DisplayScene)) return key as DisplayScene;
  return SCENE_ALIASES[key] ?? null;
}

/** Normalise a `?phase=` value against the ceremony running order. */
export function parseSamplePhase(
  raw: string | null | undefined,
  fallback: CeremonyPhase,
): CeremonyPhase {
  return raw ? resolveCeremonyPhase(raw) : fallback;
}
