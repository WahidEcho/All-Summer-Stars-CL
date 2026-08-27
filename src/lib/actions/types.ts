/**
 * Shared result and input shapes for every server action.
 *
 * This file has no 'use server' directive on purpose: a server-actions module
 * may only export async functions, so types and constants live here.
 */

import type {
  AttemptPayload,
  AttemptRow,
  ChallengeRow,
  ControllerLeaseRow,
  DisplayScene,
  DisplayStateRow,
  EventRow,
  GoalPointsMode,
  GoalRow,
  LedgerRow,
  LineupSlotRow,
  MatchRow,
  PenaltyAttemptRow,
  PenaltyShootoutRow,
  PlayerRow,
  RoundRow,
  ScoringProfileRow,
  SponsorRow,
  TeamCode,
  TeamRow,
  TimerRow,
} from '@/lib/types';
import type { ChallengeResult, MatchTotals, RoundTotals } from '@/lib/scoring/engine';

// ---------------------------------------------------------------------------
// Result envelope
// ---------------------------------------------------------------------------

export type ActionErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'not_found'
  | 'invalid_input'
  | 'conflict'
  | 'locked'
  | 'illegal_state'
  | 'duplicate'
  | 'lease_held'
  | 'database_error'
  | 'unconfigured'
  | 'unknown';

export interface ActionSuccess<T> {
  ok: true;
  data: T;
  /**
   * True when this exact idempotency key had already been applied — the stored
   * result is returned and no new effect was produced.
   */
  duplicate?: boolean;
}

export interface ActionFailure {
  ok: false;
  error: string;
  code: ActionErrorCode;
  details?: Record<string, unknown>;
}

export type ActionResult<T> = ActionSuccess<T> | ActionFailure;

export function ok<T>(data: T, duplicate = false): ActionSuccess<T> {
  return duplicate ? { ok: true, data, duplicate: true } : { ok: true, data };
}

export function fail(
  code: ActionErrorCode,
  error: string,
  details?: Record<string, unknown>,
): ActionFailure {
  return details ? { ok: false, error, code, details } : { ok: false, error, code };
}

/** Narrowing helper for call sites. */
export function isOk<T>(result: ActionResult<T>): result is ActionSuccess<T> {
  return result.ok;
}

// ---------------------------------------------------------------------------
// Common input fragments
// ---------------------------------------------------------------------------

/** Every mutating action carries an idempotency key and an optional device id. */
export interface CommandBase {
  /** Client-generated, globally unique. Replaying it must not double-apply. */
  idempotencyKey: string;
  /** The scoring device, so audit rows and the lease can be correlated. */
  deviceId?: string | null;
  /** Optimistic concurrency: the event revision the client last saw. */
  expectedRevision?: number | null;
}

// ---------------------------------------------------------------------------
// Action payload shapes
// ---------------------------------------------------------------------------

export interface RecordAttemptInput extends CommandBase {
  roundId: string;
  playerId: string;
  side: TeamCode;
  attemptNumber: number;
  payload: AttemptPayload;
}

export interface RecordAttemptResult {
  attempt: AttemptRow;
  points: number;
  round: RoundRow;
  totals: RoundTotals;
}

export interface ReverseAttemptInput extends CommandBase {
  attemptId: string;
  reason: string;
}

export interface ReverseAttemptResult {
  reversed: AttemptRow;
  reversal: AttemptRow;
  round: RoundRow;
  totals: RoundTotals;
}

export interface RoundCommandInput extends CommandBase {
  roundId: string;
}

export interface SubmitRoundResult {
  round: RoundRow;
  totals: RoundTotals;
}

export interface PublishRoundResult {
  round: RoundRow;
  entries: LedgerRow[];
  alreadyPublished: boolean;
}

export interface ReopenRoundInput extends CommandBase {
  roundId: string;
  reason: string;
}

export interface ReopenRoundResult {
  round: RoundRow;
  reversedEntryIds: string[];
}

export interface CompleteChallengeInput extends CommandBase {
  challengeId: string;
}

export interface CompleteChallengeResult {
  challenge: ChallengeRow;
  result: ChallengeResult;
  bonusEntries: LedgerRow[];
}

export interface EnsureTimerInput extends CommandBase {
  scope: 'round' | 'match' | 'attempt';
  roundId?: string | null;
  matchId?: string | null;
  segment?: number;
  mode: 'count_up' | 'count_down' | 'stopwatch';
  durationMs?: number | null;
  label?: string | null;
}

export interface TimerCommandInput extends CommandBase {
  timerId: string;
}

export interface AddGoalInput extends CommandBase {
  matchId: string;
  teamCode: TeamCode;
  scorerId: string | null;
  isOwnGoal?: boolean;
  ownGoalByPlayerId?: string | null;
  method?: string;
  clockMs: number;
  half: number;
}

export interface AddGoalResult {
  goal: GoalRow;
  match: MatchRow;
  totals: MatchTotals;
  entries: LedgerRow[];
}

export interface ReverseGoalInput extends CommandBase {
  goalId: string;
  reason: string;
}

export interface ReverseGoalResult {
  reversed: GoalRow;
  reversal: GoalRow;
  match: MatchRow;
  totals: MatchTotals;
  reversedEntryIds: string[];
}

export interface SetGoalPointsModeInput extends CommandBase {
  matchId: string;
  mode: GoalPointsMode;
}

export interface HalfCommandInput extends CommandBase {
  matchId: string;
  half: number;
}

export interface MatchCommandInput extends CommandBase {
  matchId: string;
}

export interface EndMatchResult {
  match: MatchRow;
  totals: MatchTotals;
  entries: LedgerRow[];
  requiresShootout: boolean;
}

export interface OpenShootoutResult {
  shootout: PenaltyShootoutRow;
  match: MatchRow;
}

export interface RecordPenaltyAttemptInput extends CommandBase {
  shootoutId: string;
  teamCode: TeamCode;
  playerId: string | null;
  scored: boolean;
  sequence?: number;
  isSuddenDeath?: boolean;
}

export interface RecordPenaltyAttemptResult {
  attempt: PenaltyAttemptRow;
  shootout: PenaltyShootoutRow;
  match: MatchRow;
  totals: MatchTotals;
  decided: boolean;
  entries: LedgerRow[];
}

export interface ReversePenaltyAttemptInput extends CommandBase {
  attemptId: string;
  reason: string;
}

export interface ReversePenaltyAttemptResult {
  reversed: PenaltyAttemptRow;
  reversal: PenaltyAttemptRow;
  shootout: PenaltyShootoutRow;
  match: MatchRow;
  totals: MatchTotals;
  reversedEntryIds: string[];
}

/** A half of the final match, with the clock that governs it. */
export interface HalfResult {
  match: MatchRow;
  timer: TimerRow;
}

export interface SetLineupSlotInput extends CommandBase {
  challengeId: string;
  teamCode: TeamCode;
  slotIndex: number;
  playerId: string | null;
}

export interface SetLineupSlotResult {
  slot: LineupSlotRow;
  lineup: LineupSlotRow[];
  /** Slot the player was moved out of, when they already held one. */
  displacedSlotId: string | null;
}

export interface DisplaySceneInput extends CommandBase {
  scene: DisplayScene;
  payload?: Record<string, unknown>;
}

export interface AdjustPlayerPointsInput extends CommandBase {
  playerId: string;
  points: number;
  reason: string;
}

export interface UpdateEventInput extends CommandBase {
  patch: Partial<
    Pick<
      EventRow,
      | 'name'
      | 'subtitle'
      | 'venue'
      | 'event_date'
      | 'start_time'
      | 'timezone'
      | 'status'
      | 'qr_target_url'
      | 'holding_status'
      | 'holding_headline'
      | 'show_countdown'
      | 'settings'
    >
  >;
}

export interface UpdateTeamInput extends CommandBase {
  teamId: string;
  patch: Partial<
    Pick<
      TeamRow,
      'name' | 'short_name' | 'color' | 'color_secondary' | 'crest_url' | 'display_order'
    >
  >;
}

export interface UpdatePlayerInput extends CommandBase {
  playerId: string;
  patch: Partial<
    Pick<
      PlayerRow,
      | 'team_id'
      | 'full_name'
      | 'display_name'
      | 'jersey_number'
      | 'photo_url'
      | 'portrait_url'
      | 'focal_x'
      | 'focal_y'
      | 'bio'
      | 'active'
      | 'display_order'
    >
  >;
}

export interface UpdateSponsorInput extends CommandBase {
  sponsorId: string;
  patch: Partial<
    Pick<
      SponsorRow,
      'name' | 'tier' | 'logo_url' | 'logo_dark_url' | 'website_url' | 'ticker_order' | 'active'
    >
  >;
}

export interface ClaimLeaseInput {
  deviceId: string;
  deviceLabel?: string | null;
  /** Emergency takeover — seizes a lease that has not yet expired. */
  takeover?: boolean;
  reason?: string | null;
}

export interface ReleaseLeaseInput {
  deviceId: string;
  reason?: string | null;
}

export type LeaseResult = ActionResult<ControllerLeaseRow>;

/**
 * A polite request from a second device to take the controls. It lives in
 * `events.settings` so it rides the same realtime channel as everything else
 * and disappears the moment it is answered.
 */
export interface ControllerTransferRequest {
  deviceId: string;
  deviceLabel: string | null;
  requestedAt: string;
  reason: string | null;
}

/** Where the lease stands, from one device's point of view. */
export interface ControllerLeaseState {
  lease: ControllerLeaseRow | null;
  transferRequest: ControllerTransferRequest | null;
  /** Server time when this state was read, so clients can correct for skew. */
  serverNow: string;
}

/** Key under which the pending transfer request lives in `events.settings`. */
export const TRANSFER_REQUEST_KEY = 'controller_transfer_request';

/** Lease lifetime and renewal cadence, shared by the action and the hook. */
export const LEASE_TTL_MS = 15_000;
export const LEASE_RENEW_MS = 5_000;

export type DisplayStateResult = ActionResult<DisplayStateRow>;
export type ScoringProfileResult = ActionResult<ScoringProfileRow>;
export type TimerResult = ActionResult<TimerRow>;

/** What a score reset removed. Reported back so the UI can state it plainly. */
export interface ResetCounts {
  attempts: number;
  goals: number;
  penaltyAttempts: number;
  ledgerEntries: number;
  rounds: number;
  matches: number;
  challenges: number;
}
