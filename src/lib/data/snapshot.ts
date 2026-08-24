/**
 * The event snapshot — everything a live surface needs in one round trip.
 *
 * Public pages, the TV display and the admin console all render from the same
 * shape, so a realtime notification only ever has to say "something changed"
 * and the client re-reads one consistent object.
 */

import {
  computeMatchScore,
  computePenaltyScore,
  computeRoundTotals,
  computeShootoutState,
  type MatchTotals,
  type RoundTotals,
  type ShootoutState,
} from '@/lib/scoring/engine';
import type { Db } from '@/lib/event';
import { EVENT_SLUG } from '@/lib/event';
import {
  getAllLineups,
  getAttempts,
  getChallenges,
  getDisplayState,
  getGoals,
  getLedger,
  getMatchByChallenge,
  getPenaltyAttempts,
  getPlayers,
  getRounds,
  getScoringProfile,
  getShootout,
  getSponsors,
  getStandings,
  getTeamPoints,
  getTeams,
  getTimers,
  pickActiveTimer,
  requireEvent,
} from '@/lib/data/queries';
import type {
  AttemptRow,
  ChallengeRow,
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

export interface EventSnapshot {
  /** Wall-clock time the snapshot was assembled, in ms. */
  fetchedAt: number;
  /** The event's optimistic-concurrency revision at read time. */
  revision: number;

  event: EventRow;
  teams: TeamRow[];
  teamsByCode: Record<TeamCode, TeamRow | null>;
  players: PlayerRow[];
  playersById: Record<string, PlayerRow>;

  challenges: ChallengeRow[];
  /** The challenge the show is on right now. */
  currentChallenge: ChallengeRow | null;
  /** Rounds of `currentChallenge` (empty for the final match). */
  rounds: RoundRow[];
  /** The round the show is on right now. */
  currentRound: RoundRow | null;
  /** Attempts of `currentRound`, confirmed and reversed. */
  attempts: AttemptRow[];
  /** Live totals for `currentRound`, derived from confirmed attempts. */
  roundTotals: RoundTotals | null;
  /** Lineup slots of `currentChallenge`. */
  lineup: LineupSlotRow[];
  /** Lineup slots of every challenge, for slot labels and squad views. */
  allLineups: LineupSlotRow[];

  match: MatchRow | null;
  goals: GoalRow[];
  matchTotals: MatchTotals | null;
  shootout: PenaltyShootoutRow | null;
  penaltyAttempts: PenaltyAttemptRow[];
  penaltyTotals: MatchTotals | null;
  shootoutState: ShootoutState | null;

  standings: RankedPlayer[];
  teamPoints: Record<TeamCode, number>;

  scoringProfile: ScoringProfileRow;
  scoring: ScoringConfig;

  displayState: DisplayStateRow | null;
  sponsors: SponsorRow[];

  /** Timers relevant to the current round and match. */
  timers: TimerRow[];
  /** The one timer a display should render, if any. */
  activeTimer: TimerRow | null;
}

export interface SnapshotOptions {
  slug?: string;
  /** Force a specific challenge instead of inferring the live one. */
  challengeId?: string;
  /** Force a specific round instead of inferring the live one. */
  roundId?: string;
}

/** The challenge the event is on: live first, then the first unfinished one. */
export function pickCurrentChallenge(challenges: ChallengeRow[]): ChallengeRow | null {
  return (
    challenges.find((c) => c.status === 'live') ??
    challenges.find((c) => c.status !== 'completed') ??
    challenges[challenges.length - 1] ??
    null
  );
}

/** The round the event is on: live first, then the first unpublished one. */
export function pickCurrentRound(rounds: RoundRow[]): RoundRow | null {
  const inFlight: RoundRow['status'][] = ['live', 'awaiting_result', 'result_ready'];
  return (
    rounds.find((r) => inFlight.includes(r.status)) ??
    rounds.find((r) => r.status === 'pending' || r.status === 'ready') ??
    rounds[rounds.length - 1] ??
    null
  );
}

/**
 * Assemble the full snapshot. Independent reads are issued in parallel; the
 * challenge/round dependent reads follow once the current challenge is known.
 */
export async function getEventSnapshot(
  db: Db,
  opts: SnapshotOptions = {},
): Promise<EventSnapshot> {
  const event = await requireEvent(db, opts.slug ?? EVENT_SLUG);
  const eventId = event.id;

  const [teams, players, challenges, profile, displayState, sponsors, ledger] =
    await Promise.all([
      getTeams(db, eventId),
      getPlayers(db, eventId),
      getChallenges(db, eventId),
      getScoringProfile(db, eventId),
      getDisplayState(db, eventId),
      getSponsors(db, eventId),
      getLedger(db, eventId, { confirmedOnly: true }),
    ]);

  const currentChallenge = opts.challengeId
    ? challenges.find((c) => c.id === opts.challengeId) ?? null
    : pickCurrentChallenge(challenges);

  const finalChallenge = challenges.find((c) => c.mechanic === 'final_match') ?? null;

  const [allLineups, rounds, match] = await Promise.all([
    getAllLineups(db, challenges.map((c) => c.id)),
    currentChallenge && currentChallenge.mechanic !== 'final_match'
      ? getRounds(db, currentChallenge.id)
      : Promise.resolve<RoundRow[]>([]),
    finalChallenge ? getMatchByChallenge(db, finalChallenge.id) : Promise.resolve(null),
  ]);

  const currentRound = opts.roundId
    ? rounds.find((r) => r.id === opts.roundId) ?? null
    : pickCurrentRound(rounds);

  const [attempts, goals, shootout, standings] = await Promise.all([
    currentRound ? getAttempts(db, currentRound.id) : Promise.resolve<AttemptRow[]>([]),
    match ? getGoals(db, match.id) : Promise.resolve<GoalRow[]>([]),
    match ? getShootout(db, match.id) : Promise.resolve(null),
    getStandings(db, eventId, {
      players,
      teams,
      ledger,
      lineup: allLineups,
      ranking: profile.config.ranking,
    }),
  ]);

  const penaltyAttempts = shootout ? await getPenaltyAttempts(db, shootout.id) : [];

  const timers = await getTimers(db, { eventId });
  const relevantTimers = timers.filter(
    (t) =>
      (currentRound && t.round_id === currentRound.id) ||
      (match && t.match_id === match.id),
  );

  const teamsByCode: Record<TeamCode, TeamRow | null> = {
    A: teams.find((t) => t.code === 'A') ?? null,
    B: teams.find((t) => t.code === 'B') ?? null,
  };

  const playersById: Record<string, PlayerRow> = {};
  for (const p of players) playersById[p.id] = p;

  const lineup = currentChallenge
    ? allLineups.filter((s) => s.challenge_id === currentChallenge.id)
    : [];

  return {
    fetchedAt: Date.now(),
    revision: event.revision,

    event,
    teams,
    teamsByCode,
    players,
    playersById,

    challenges,
    currentChallenge,
    rounds,
    currentRound,
    attempts,
    roundTotals: currentRound ? computeRoundTotals(attempts) : null,
    lineup,
    allLineups,

    match,
    goals,
    matchTotals: match ? computeMatchScore(goals) : null,
    shootout,
    penaltyAttempts,
    penaltyTotals: shootout ? computePenaltyScore(penaltyAttempts) : null,
    shootoutState: shootout
      ? computeShootoutState(penaltyAttempts, {
          openingAttempts: shootout.opening_attempts,
          suddenDeath: profile.config.penalties.suddenDeath,
        })
      : null,

    standings,
    teamPoints: getTeamPoints(standings),

    scoringProfile: profile,
    scoring: profile.config,

    displayState,
    sponsors,

    timers: relevantTimers.length > 0 ? relevantTimers : timers,
    activeTimer: pickActiveTimer(relevantTimers.length > 0 ? relevantTimers : timers),
  };
}

/** Tables whose changes invalidate a snapshot — the realtime subscription list. */
export const SNAPSHOT_TABLES = [
  'events',
  'teams',
  'players',
  'challenges',
  'lineup_slots',
  'rounds',
  'attempts',
  'matches',
  'goals',
  'penalty_shootouts',
  'penalty_attempts',
  'timers',
  'player_points_ledger',
  'display_state',
  'sponsors',
] as const;

export type SnapshotTable = (typeof SNAPSHOT_TABLES)[number];
