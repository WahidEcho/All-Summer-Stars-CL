/**
 * Typed read layer.
 *
 * Every function takes the Supabase client as its first argument so the exact
 * same code can run in a server component (request-bound client), in a server
 * action (service-role client) and inside a realtime hook (browser singleton).
 *
 * Nothing here imports `next/headers`, so this module is client-safe.
 */

import {
  rankPlayers,
  teamPointsFrom,
  type PlayerPointsInput,
} from '@/lib/scoring/engine';
import type { Db } from '@/lib/event';
import { EVENT_SLUG, EventNotFoundError, getEventBySlug, resolveEventId } from '@/lib/event';
import type {
  AttemptRow,
  ChallengeRow,
  ControllerLeaseRow,
  DisplayStateRow,
  EventRow,
  GoalRow,
  LedgerRow,
  LineupSlotRow,
  MatchRow,
  PenaltyAttemptRow,
  PenaltyShootoutRow,
  PlayerRow,
  PlayerTotalsRow,
  RankedPlayer,
  RoundRow,
  ScoringConfig,
  ScoringProfileRow,
  SponsorRow,
  TeamCode,
  TeamRow,
  TimerRow,
} from '@/lib/types';

export type { Db } from '@/lib/event';

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function unwrap<T>(result: { data: unknown; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

function rows<T>(result: { data: unknown; error: unknown }): T[] {
  return (unwrap<T[] | null>(result) ?? []) as T[];
}

// ---------------------------------------------------------------------------
// Event / teams / players
// ---------------------------------------------------------------------------

/** The active event, or null when the configured slug matches nothing. */
export async function getEvent(db: Db, slug: string = EVENT_SLUG): Promise<EventRow | null> {
  return getEventBySlug(db, slug);
}

/** The active event, throwing `EventNotFoundError` when it is missing. */
export async function requireEvent(db: Db, slug: string = EVENT_SLUG): Promise<EventRow> {
  const event = await getEventBySlug(db, slug);
  if (!event) throw new EventNotFoundError(slug);
  return event;
}

/** The active event's UUID (memoised per process). */
export async function getEventId(db: Db, slug: string = EVENT_SLUG): Promise<string> {
  return resolveEventId(db, slug);
}

/** Both teams, ordered A then B. */
export async function getTeams(db: Db, eventId: string): Promise<TeamRow[]> {
  return rows<TeamRow>(
    await db.from('teams').select('*').eq('event_id', eventId).order('display_order'),
  );
}

/** Every active player, ordered by team then squad order. */
export async function getPlayers(db: Db, eventId: string): Promise<PlayerRow[]> {
  return rows<PlayerRow>(
    await db
      .from('players')
      .select('*')
      .eq('event_id', eventId)
      .eq('active', true)
      .order('team_id')
      .order('display_order'),
  );
}

/** Every player including deactivated ones — admin roster screens only. */
export async function getAllPlayers(db: Db, eventId: string): Promise<PlayerRow[]> {
  return rows<PlayerRow>(
    await db
      .from('players')
      .select('*')
      .eq('event_id', eventId)
      .order('team_id')
      .order('display_order'),
  );
}

export async function getPlayer(db: Db, playerId: string): Promise<PlayerRow | null> {
  return unwrap<PlayerRow | null>(
    await db.from('players').select('*').eq('id', playerId).maybeSingle(),
  );
}

export async function getPlayerBySlug(
  db: Db,
  eventId: string,
  slug: string,
): Promise<PlayerRow | null> {
  return unwrap<PlayerRow | null>(
    await db
      .from('players')
      .select('*')
      .eq('event_id', eventId)
      .eq('slug', slug)
      .maybeSingle(),
  );
}

// ---------------------------------------------------------------------------
// Challenges / lineups / rounds / attempts
// ---------------------------------------------------------------------------

/** All five challenges, ordered 1 → 5. */
export async function getChallenges(db: Db, eventId: string): Promise<ChallengeRow[]> {
  return rows<ChallengeRow>(
    await db.from('challenges').select('*').eq('event_id', eventId).order('number'),
  );
}

/** One challenge by its 1–5 number. */
export async function getChallenge(
  db: Db,
  eventId: string,
  number: number,
): Promise<ChallengeRow | null> {
  return unwrap<ChallengeRow | null>(
    await db
      .from('challenges')
      .select('*')
      .eq('event_id', eventId)
      .eq('number', number)
      .maybeSingle(),
  );
}

export async function getChallengeById(
  db: Db,
  challengeId: string,
): Promise<ChallengeRow | null> {
  return unwrap<ChallengeRow | null>(
    await db.from('challenges').select('*').eq('id', challengeId).maybeSingle(),
  );
}

/** The ten lineup slots of a challenge, ordered A1…A5, B1…B5. */
export async function getLineup(db: Db, challengeId: string): Promise<LineupSlotRow[]> {
  return rows<LineupSlotRow>(
    await db
      .from('lineup_slots')
      .select('*')
      .eq('challenge_id', challengeId)
      .order('team_code')
      .order('slot_index'),
  );
}

/** Every lineup slot in the event, for cross-challenge lookups. */
export async function getAllLineups(db: Db, challengeIds: string[]): Promise<LineupSlotRow[]> {
  if (challengeIds.length === 0) return [];
  return rows<LineupSlotRow>(
    await db
      .from('lineup_slots')
      .select('*')
      .in('challenge_id', challengeIds)
      .order('team_code')
      .order('slot_index'),
  );
}

/** The five 1v1 rounds of a challenge, ordered 1 → 5. */
export async function getRounds(db: Db, challengeId: string): Promise<RoundRow[]> {
  return rows<RoundRow>(
    await db.from('rounds').select('*').eq('challenge_id', challengeId).order('number'),
  );
}

export async function getRound(db: Db, roundId: string): Promise<RoundRow | null> {
  return unwrap<RoundRow | null>(
    await db.from('rounds').select('*').eq('id', roundId).maybeSingle(),
  );
}

/** Every attempt of a round, confirmed and reversed, oldest first. */
export async function getAttempts(db: Db, roundId: string): Promise<AttemptRow[]> {
  return rows<AttemptRow>(
    await db
      .from('attempts')
      .select('*')
      .eq('round_id', roundId)
      .order('attempt_number')
      .order('created_at'),
  );
}

/** Confirmed attempts only — what the scoring engine consumes. */
export async function getConfirmedAttempts(db: Db, roundId: string): Promise<AttemptRow[]> {
  return rows<AttemptRow>(
    await db
      .from('attempts')
      .select('*')
      .eq('round_id', roundId)
      .eq('status', 'confirmed')
      .order('attempt_number'),
  );
}

/** Attempts across every round of a challenge, for the challenge recap. */
export async function getAttemptsForChallenge(
  db: Db,
  challengeId: string,
): Promise<AttemptRow[]> {
  const roundIds = (await getRounds(db, challengeId)).map((r) => r.id);
  if (roundIds.length === 0) return [];
  return rows<AttemptRow>(
    await db
      .from('attempts')
      .select('*')
      .in('round_id', roundIds)
      .order('created_at'),
  );
}

// ---------------------------------------------------------------------------
// Final match
// ---------------------------------------------------------------------------

/** The final 5v5 match of the event (challenge 5). */
export async function getMatch(db: Db, eventId: string): Promise<MatchRow | null> {
  const challenge = await getChallenge(db, eventId, 5);
  if (!challenge) return null;
  return unwrap<MatchRow | null>(
    await db.from('matches').select('*').eq('challenge_id', challenge.id).maybeSingle(),
  );
}

export async function getMatchById(db: Db, matchId: string): Promise<MatchRow | null> {
  return unwrap<MatchRow | null>(
    await db.from('matches').select('*').eq('id', matchId).maybeSingle(),
  );
}

export async function getMatchByChallenge(
  db: Db,
  challengeId: string,
): Promise<MatchRow | null> {
  return unwrap<MatchRow | null>(
    await db.from('matches').select('*').eq('challenge_id', challengeId).maybeSingle(),
  );
}

/** Every goal of a match, confirmed and reversed, in clock order. */
export async function getGoals(db: Db, matchId: string): Promise<GoalRow[]> {
  return rows<GoalRow>(
    await db
      .from('goals')
      .select('*')
      .eq('match_id', matchId)
      .order('half')
      .order('clock_ms'),
  );
}

export async function getShootout(
  db: Db,
  matchId: string,
): Promise<PenaltyShootoutRow | null> {
  return unwrap<PenaltyShootoutRow | null>(
    await db.from('penalty_shootouts').select('*').eq('match_id', matchId).maybeSingle(),
  );
}

export async function getPenaltyAttempts(
  db: Db,
  shootoutId: string,
): Promise<PenaltyAttemptRow[]> {
  return rows<PenaltyAttemptRow>(
    await db
      .from('penalty_attempts')
      .select('*')
      .eq('shootout_id', shootoutId)
      .order('sequence'),
  );
}

// ---------------------------------------------------------------------------
// Scoring profile
// ---------------------------------------------------------------------------

/** The newest scoring profile row — the single source of every point value. */
export async function getScoringProfile(
  db: Db,
  eventId: string,
): Promise<ScoringProfileRow> {
  const profile = unwrap<ScoringProfileRow | null>(
    await db
      .from('scoring_profiles')
      .select('*')
      .eq('event_id', eventId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
  );

  if (!profile) {
    throw new Error(
      'No scoring profile for this event. Run supabase/migrations/0002_seed_event.sql.',
    );
  }
  return profile;
}

/** Convenience: just the config object from the newest profile. */
export async function getScoringConfig(db: Db, eventId: string): Promise<ScoringConfig> {
  return (await getScoringProfile(db, eventId)).config;
}

// ---------------------------------------------------------------------------
// Sponsors / display / timers / lease
// ---------------------------------------------------------------------------

/** Active sponsors in confirmed ticker order. */
export async function getSponsors(db: Db, eventId: string): Promise<SponsorRow[]> {
  return rows<SponsorRow>(
    await db
      .from('sponsors')
      .select('*')
      .eq('event_id', eventId)
      .eq('active', true)
      .order('ticker_order'),
  );
}

/** Every sponsor including hidden ones — admin screens only. */
export async function getAllSponsors(db: Db, eventId: string): Promise<SponsorRow[]> {
  return rows<SponsorRow>(
    await db.from('sponsors').select('*').eq('event_id', eventId).order('ticker_order'),
  );
}

/** The broadcast program/preview state row. */
export async function getDisplayState(
  db: Db,
  eventId: string,
): Promise<DisplayStateRow | null> {
  return unwrap<DisplayStateRow | null>(
    await db.from('display_state').select('*').eq('event_id', eventId).maybeSingle(),
  );
}

export interface TimerFilter {
  eventId?: string;
  roundId?: string | null;
  matchId?: string | null;
  scope?: 'round' | 'match' | 'attempt';
  segment?: number;
}

/** Timers matching a filter, newest first. */
export async function getTimers(db: Db, filter: TimerFilter): Promise<TimerRow[]> {
  let query = db.from('timers').select('*');

  if (filter.eventId) query = query.eq('event_id', filter.eventId);
  if (filter.roundId !== undefined) {
    query = filter.roundId === null ? query.is('round_id', null) : query.eq('round_id', filter.roundId);
  }
  if (filter.matchId !== undefined) {
    query = filter.matchId === null ? query.is('match_id', null) : query.eq('match_id', filter.matchId);
  }
  if (filter.scope) query = query.eq('scope', filter.scope);
  if (filter.segment !== undefined) query = query.eq('segment', filter.segment);

  return rows<TimerRow>(await query.order('updated_at', { ascending: false }));
}

export async function getTimer(db: Db, timerId: string): Promise<TimerRow | null> {
  return unwrap<TimerRow | null>(
    await db.from('timers').select('*').eq('id', timerId).maybeSingle(),
  );
}

/**
 * The timer the audience should be looking at: a running one wins, otherwise
 * the most recently touched paused/ready timer.
 */
export function pickActiveTimer(timers: TimerRow[]): TimerRow | null {
  return (
    timers.find((t) => t.state === 'running') ??
    timers.find((t) => t.state === 'paused') ??
    timers[0] ??
    null
  );
}

/** The single-active-controller lease row for this event. */
export async function getControllerLease(
  db: Db,
  eventId: string,
): Promise<ControllerLeaseRow | null> {
  return unwrap<ControllerLeaseRow | null>(
    await db.from('controller_lease').select('*').eq('event_id', eventId).maybeSingle(),
  );
}

// ---------------------------------------------------------------------------
// Ledger and standings
// ---------------------------------------------------------------------------

/** Every ledger row for the event, newest first. */
export async function getLedger(
  db: Db,
  eventId: string,
  opts: { confirmedOnly?: boolean; playerId?: string; limit?: number } = {},
): Promise<LedgerRow[]> {
  let query = db.from('player_points_ledger').select('*').eq('event_id', eventId);
  if (opts.confirmedOnly) query = query.eq('status', 'confirmed');
  if (opts.playerId) query = query.eq('player_id', opts.playerId);
  query = query.order('created_at', { ascending: false });
  if (opts.limit) query = query.limit(opts.limit);
  return rows<LedgerRow>(await query);
}

/** The `player_totals` view — a cheap read when the full ledger is not needed. */
export async function getPlayerTotals(
  db: Db,
  eventId: string,
): Promise<PlayerTotalsRow[]> {
  return rows<PlayerTotalsRow>(
    await db.from('player_totals').select('*').eq('event_id', eventId),
  );
}

export interface StandingsOptions {
  /** Pre-fetched rows, to avoid re-querying inside `getEventSnapshot`. */
  players?: PlayerRow[];
  teams?: TeamRow[];
  ledger?: Pick<LedgerRow, 'player_id' | 'points' | 'entry_type' | 'status'>[];
  lineup?: LineupSlotRow[];
  ranking?: ScoringConfig['ranking'];
  /** Take slot labels from this challenge only. Defaults to the first match. */
  slotChallengeId?: string;
}

/**
 * Individual standings, built from the confirmed ledger and ranked by the
 * scoring profile's ranking rules. Penalty points are carried separately and
 * only ever break a tie — they never inflate the headline total ordering.
 */
export async function getStandings(
  db: Db,
  eventId: string,
  opts: StandingsOptions = {},
): Promise<RankedPlayer[]> {
  const players = opts.players ?? (await getPlayers(db, eventId));
  const teams = opts.teams ?? (await getTeams(db, eventId));
  const ranking = opts.ranking ?? (await getScoringConfig(db, eventId)).ranking;

  const ledger =
    opts.ledger ??
    rows<Pick<LedgerRow, 'player_id' | 'points' | 'entry_type' | 'status'>>(
      await db
        .from('player_points_ledger')
        .select('player_id, points, entry_type, status')
        .eq('event_id', eventId)
        .eq('status', 'confirmed'),
    );

  let lineup = opts.lineup;
  if (!lineup) {
    if (opts.slotChallengeId) {
      lineup = await getLineup(db, opts.slotChallengeId);
    } else {
      const challengeIds = (await getChallenges(db, eventId)).map((c) => c.id);
      lineup = await getAllLineups(db, challengeIds);
    }
  }

  const teamCodeById = new Map<string, TeamCode>(teams.map((t) => [t.id, t.code]));

  // A player generally holds the same slot in every challenge; take the first
  // one found so the standings can print "A3" beside the name.
  const slotByPlayer = new Map<string, string>();
  for (const slot of lineup) {
    if (slot.player_id && !slotByPlayer.has(slot.player_id)) {
      slotByPlayer.set(slot.player_id, slot.slot_label);
    }
  }

  const regular = new Map<string, number>();
  const penalty = new Map<string, number>();
  for (const entry of ledger) {
    if (entry.status !== 'confirmed') continue;
    const bucket = entry.entry_type === 'penalty_tiebreak_points' ? penalty : regular;
    bucket.set(entry.player_id, (bucket.get(entry.player_id) ?? 0) + Number(entry.points));
  }

  const inputs: PlayerPointsInput[] = players.map((player) => ({
    player,
    regularPoints: regular.get(player.id) ?? 0,
    penaltyPoints: penalty.get(player.id) ?? 0,
    teamCode: player.team_id ? teamCodeById.get(player.team_id) ?? null : null,
    slotLabel: slotByPlayer.get(player.id) ?? null,
  }));

  return rankPlayers(inputs, ranking);
}

/** Team totals derived from the same ranked players the leaderboard shows. */
export function getTeamPoints(ranked: RankedPlayer[]): Record<TeamCode, number> {
  return teamPointsFrom(ranked);
}

// ---------------------------------------------------------------------------
// Audit trail
// ---------------------------------------------------------------------------

export interface AuditLogRow {
  id: string;
  event_id: string | null;
  actor_id: string | null;
  actor_email: string | null;
  device_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

/** Recent audit entries, newest first. Staff-only by RLS. */
export async function getAuditLog(
  db: Db,
  eventId: string,
  limit = 100,
): Promise<AuditLogRow[]> {
  return rows<AuditLogRow>(
    await db
      .from('audit_logs')
      .select('*')
      .eq('event_id', eventId)
      .order('created_at', { ascending: false })
      .limit(limit),
  );
}

export interface ScoreEventRow {
  id: string;
  event_id: string;
  type: string;
  payload: Record<string, unknown>;
  idempotency_key: string | null;
  actor_id: string | null;
  device_id: string | null;
  expected_revision: number | null;
  new_revision: number | null;
  created_at: string;
}

/** The append-only command stream, newest first. Staff-only by RLS. */
export async function getScoreEvents(
  db: Db,
  eventId: string,
  opts: { limit?: number; sinceRevision?: number } = {},
): Promise<ScoreEventRow[]> {
  let query = db.from('score_events').select('*').eq('event_id', eventId);
  if (opts.sinceRevision !== undefined) query = query.gt('new_revision', opts.sinceRevision);
  return rows<ScoreEventRow>(
    await query.order('created_at', { ascending: false }).limit(opts.limit ?? 100),
  );
}
