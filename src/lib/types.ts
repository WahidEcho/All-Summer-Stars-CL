// Domain types for the SwanLake Football Stars platform.
// These mirror supabase/migrations/0001_core_schema.sql exactly.

export type TeamCode = 'A' | 'B';
export type ResultOutcome = 'A' | 'B' | 'draw';
export type EntryStatus = 'confirmed' | 'reversed';

export type ChallengeMechanic =
  | 'mannequin_target'
  | 'dribble_finish'
  | 'long_range'
  | 'center_circle'
  | 'final_match';

export type EventStatus = 'draft' | 'ready' | 'live' | 'completed' | 'locked' | 'archived';
export type ChallengeStatus = 'draft' | 'ready' | 'locked' | 'live' | 'completed';
export type RoundStatus =
  | 'pending' | 'ready' | 'live' | 'awaiting_result' | 'result_ready' | 'published' | 'completed';
export type MatchStatus =
  | 'pending' | 'ready' | 'live' | 'halftime' | 'awaiting_result' | 'result_ready'
  // Level at full time: a five-minute rest, then next goal wins the match.
  | 'golden_goal'
  | 'penalties' | 'completed';

export type TimerMode = 'count_up' | 'count_down' | 'stopwatch';
export type TimerState = 'ready' | 'running' | 'paused' | 'ended';
export type GoalPointsMode = 'team_share' | 'scorer_only' | 'scorer_plus_team';
export type AppRole = 'super_admin' | 'event_admin' | 'scorekeeper' | 'display_operator' | 'viewer';

export type LedgerEntryType =
  | 'attempt_points'
  | 'round_win_bonus'
  | 'round_draw_points'
  | 'challenge_win_bonus'
  | 'match_goal_points'
  | 'match_win_bonus'
  | 'penalty_tiebreak_points'
  | 'manual_adjustment';

export type DisplayScene =
  // The wall follows the scoring controller by itself; see use-auto-director.
  | 'auto'
  | 'holding'
  | 'lineups'
  | 'head_to_head'
  | 'live_round'
  | 'round_result'
  | 'challenge_result'
  | 'final_match'
  | 'leaderboard'
  | 'ceremony';

// --------------------------------------------------------------------
// Scoring profile — the single source of truth for every point value.
// --------------------------------------------------------------------

export interface TargetOption {
  id: string;
  label: string;
  points: number;
  color?: string;
}

export interface MannequinTargetConfig {
  mechanic: 'mannequin_target';
  attemptsPerPlayer: number;
  targets: TargetOption[];
  missPoints: number;
}

export interface DribbleFinishConfig {
  mechanic: 'dribble_finish';
  attemptsPerPlayer: number;
  dribbleThresholdMs: number;
  dribbleBonusPoints: number;
  goalPoints: number;
  maxPointsPerAttempt: number;
}

export interface LongRangeConfig {
  mechanic: 'long_range';
  attemptsPerPlayer: number;
  zones: TargetOption[];
  missPoints: number;
}

export interface CenterCircleConfig {
  mechanic: 'center_circle';
  ballsPerPlayer: number;
  timeLimitMs: number;
  pointsPerHit: number;
}

export interface FinalMatchConfig {
  mechanic: 'final_match';
  halves: number;
  halfDurationMs: number;
}

export type ChallengeConfig =
  | MannequinTargetConfig
  | DribbleFinishConfig
  | LongRangeConfig
  | CenterCircleConfig
  | FinalMatchConfig;

export interface MatchScoringConfig {
  /** Which of the three goal-point models is active for the final match. */
  goalPointsMode: GoalPointsMode;
  /** Mode A — every player on the scoring team receives the same points. */
  teamShare: { pointsPerPlayer: number };
  /** Mode B — only the scorer receives points. */
  scorerOnly: { scorerPoints: number };
  /** Mode C — the scorer receives the full amount, teammates a smaller one. */
  scorerPlusTeam: { scorerPoints: number; teammatePoints: number };
  ownGoal: { creditBenefitingTeam: boolean; scorerGetsPoints: boolean };
  winBonus: number;
}

export interface BonusConfig {
  roundWinBonus: number;
  roundDrawPoints: number;
  challengeWinBonus: number;
}

export interface PenaltyConfig {
  enabledFor: 'final_match_only' | 'every_draw' | 'disabled';
  openingAttempts: number;
  suddenDeath: boolean;
  pointsPerScoredAttempt: number;
  winnerPoints: number;
}

export interface RankingConfig {
  primary: 'regular_points';
  tiebreakers: Array<'penalty_tiebreak_points'>;
  sharedRankOnTie: boolean;
}

/**
 * The day as two competitions: the four skills challenges are one, the 5v5
 * final the other, one day point each. Level at full time the match goes to a
 * rest and golden goal; a 1–1 day goes to the shootout. The day winner is the
 * champion team, independent of the individual points race.
 */
export interface DayFormatConfig {
  twoCompetitions: boolean;
  goldenGoal: boolean;
  goldenGoalRestMinutes: number;
  shootoutDecidesDay: boolean;
}

export interface ScoringConfig {
  challenges: Record<'1' | '2' | '3' | '4' | '5', ChallengeConfig>;
  match: MatchScoringConfig;
  bonuses: BonusConfig;
  penalties: PenaltyConfig;
  ranking: RankingConfig;
  /** Absent on profiles saved before the two-competition format existed. */
  day?: DayFormatConfig;
}

// --------------------------------------------------------------------
// Attempt payloads — one shape per mechanic.
// --------------------------------------------------------------------

export type AttemptPayload =
  | { kind: 'mannequin_target'; targetId: string | null }
  | { kind: 'dribble_finish'; timeMs: number; scored: boolean }
  | { kind: 'long_range'; zoneId: string | null }
  | { kind: 'center_circle'; hit: boolean };

// --------------------------------------------------------------------
// Row types
// --------------------------------------------------------------------

export interface EventRow {
  id: string;
  slug: string;
  name: string;
  subtitle: string | null;
  venue: string | null;
  event_date: string | null;
  start_time: string | null;
  timezone: string;
  status: EventStatus;
  qr_target_url: string | null;
  holding_status: string;
  holding_headline: string | null;
  show_countdown: boolean;
  revision: number;
  settings: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface TeamRow {
  id: string;
  event_id: string;
  code: TeamCode;
  name: string;
  short_name: string | null;
  color: string;
  color_secondary: string | null;
  crest_url: string | null;
  display_order: number;
}

export interface PlayerRow {
  id: string;
  event_id: string;
  team_id: string | null;
  full_name: string;
  display_name: string | null;
  slug: string;
  jersey_number: number | null;
  photo_url: string | null;
  portrait_url: string | null;
  focal_x: number;
  focal_y: number;
  bio: string | null;
  active: boolean;
  display_order: number;
  created_at: string;
}

export interface ChallengeRow {
  id: string;
  event_id: string;
  number: number;
  mechanic: ChallengeMechanic;
  title: string;
  subtitle: string | null;
  description: string | null;
  status: ChallengeStatus;
  aggregation_rule: string;
  round_count: number;
  locked_at: string | null;
  completed_at: string | null;
  winner: ResultOutcome | null;
}

export interface LineupSlotRow {
  id: string;
  challenge_id: string;
  team_id: string;
  team_code: TeamCode;
  slot_index: number;
  slot_label: string;
  player_id: string | null;
}

export interface RoundRow {
  id: string;
  challenge_id: string;
  number: number;
  status: RoundStatus;
  player_a_id: string | null;
  player_b_id: string | null;
  score_a: number;
  score_b: number;
  winner: ResultOutcome | null;
  active_side: TeamCode | null;
  published_at: string | null;
  completed_at: string | null;
  revision: number;
}

export interface AttemptRow {
  id: string;
  round_id: string;
  player_id: string;
  side: TeamCode;
  attempt_number: number;
  payload: AttemptPayload | Record<string, never>;
  points: number;
  status: EntryStatus;
  reverses_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface MatchRow {
  id: string;
  challenge_id: string;
  status: MatchStatus;
  score_a: number;
  score_b: number;
  penalty_score_a: number;
  penalty_score_b: number;
  goal_points_mode: GoalPointsMode;
  current_half: number;
  winner: ResultOutcome | null;
  published_at: string | null;
  completed_at: string | null;
  revision: number;
}

export interface GoalRow {
  id: string;
  match_id: string;
  team_code: TeamCode;
  scorer_id: string | null;
  is_own_goal: boolean;
  own_goal_by_player_id: string | null;
  method: string;
  clock_ms: number;
  half: number;
  status: EntryStatus;
  reverses_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PenaltyShootoutRow {
  id: string;
  match_id: string;
  status: 'open' | 'sudden_death' | 'completed';
  opening_attempts: number;
  winner: ResultOutcome | null;
  completed_at: string | null;
  created_at: string;
}

export interface PenaltyAttemptRow {
  id: string;
  shootout_id: string;
  sequence: number;
  team_code: TeamCode;
  player_id: string | null;
  scored: boolean;
  is_sudden_death: boolean;
  status: EntryStatus;
  reverses_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TimerRow {
  id: string;
  event_id: string;
  round_id: string | null;
  match_id: string | null;
  scope: 'round' | 'match' | 'attempt';
  label: string | null;
  segment: number;
  mode: TimerMode;
  duration_ms: number | null;
  state: TimerState;
  started_at: string | null;
  accumulated_ms: number;
  ended_at: string | null;
  updated_at: string;
}

export interface LedgerRow {
  id: string;
  event_id: string;
  player_id: string;
  team_id: string | null;
  challenge_id: string | null;
  round_id: string | null;
  match_id: string | null;
  entry_type: LedgerEntryType;
  points: number;
  source_ref: string | null;
  profile_version: number;
  status: EntryStatus;
  reverses_id: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ScoringProfileRow {
  id: string;
  event_id: string;
  version: number;
  config: ScoringConfig;
  is_locked: boolean;
  locked_at: string | null;
  locked_by: string | null;
  created_at: string;
}

export interface DisplayStateRow {
  id: string;
  event_id: string;
  program_scene: DisplayScene;
  program_payload: Record<string, unknown>;
  preview_scene: DisplayScene | null;
  preview_payload: Record<string, unknown>;
  ceremony_phase: string | null;
  revision: number;
  updated_by: string | null;
  updated_at: string;
}

export interface SponsorRow {
  id: string;
  event_id: string;
  name: string;
  tier: 'host' | 'partner' | 'operator' | 'sponsor' | 'technology';
  logo_url: string | null;
  logo_dark_url: string | null;
  website_url: string | null;
  ticker_order: number;
  active: boolean;
}

export interface ControllerLeaseRow {
  id: string;
  event_id: string;
  device_id: string;
  device_label: string | null;
  user_id: string | null;
  acquired_at: string;
  renewed_at: string;
  expires_at: string;
  released_at: string | null;
  reason: string | null;
}

export interface AppUserRow {
  id: string;
  email: string | null;
  display_name: string | null;
  role: AppRole;
  created_at: string;
}

export interface PlayerTotalsRow {
  player_id: string;
  event_id: string;
  team_id: string | null;
  display_name: string | null;
  full_name: string;
  slug: string;
  photo_url: string | null;
  regular_points: number;
  penalty_points: number;
  total_points: number;
}

/** A player enriched with standings information, used across every surface. */
export interface RankedPlayer extends PlayerRow {
  regularPoints: number;
  penaltyPoints: number;
  totalPoints: number;
  rank: number;
  /** true when this player shares their rank with at least one other. */
  sharedRank: boolean;
  teamCode: TeamCode | null;
  slotLabel: string | null;
}
