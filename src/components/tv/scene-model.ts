/**
 * The view model every TV scene reads from.
 *
 * `getEventSnapshot` returns the raw read model; this turns it into the handful
 * of things a broadcast composition actually asks for — who is on screen, which
 * challenge and round we are in, what each side's figures are, what the teams
 * are called and coloured. Pure, so the program output, the operator preview
 * and the sample-data QA route all derive the same shape.
 */

import type { EventSnapshot } from '@/lib/data/snapshot';
import { SITE_URL } from '@/lib/event';
import { computeChallengeResult, type ChallengeResult } from '@/lib/scoring/engine';
import type {
  AttemptRow,
  ChallengeConfig,
  ChallengeMechanic,
  ChallengeRow,
  GoalRow,
  LineupSlotRow,
  PlayerRow,
  RankedPlayer,
  RoundRow,
  TeamCode,
  TeamRow,
} from '@/lib/types';
import type { PlayerLike } from '@/components/player';

export interface SideModel {
  code: TeamCode;
  team: TeamRow | null;
  name: string;
  shortName: string;
  color: string | null;
  points: number;
}

export interface SceneModel {
  snapshot: EventSnapshot;

  /** Absolute URL the permanent QR points at. */
  qrUrl: string;
  eventDateLabel: string;
  venueLabel: string;

  a: SideModel;
  b: SideModel;
  side: (code: TeamCode) => SideModel;

  standings: RankedPlayer[];
  rankedById: Map<string, RankedPlayer>;
  topFive: RankedPlayer[];
  topTen: RankedPlayer[];
  leader: RankedPlayer | null;
  /** Squad of a team, in lineup order, as ranked players where possible. */
  squad: (code: TeamCode) => RankedPlayer[];

  challenge: ChallengeRow | null;
  challengeNumber: number | null;
  /** `CHALLENGE 02` — always two digits, as the design specifies. */
  challengeLabel: string;
  challengeTitle: string;
  mechanic: ChallengeMechanic | null;
  challengeConfig: ChallengeConfig | null;

  rounds: RoundRow[];
  roundCount: number;
  round: RoundRow | null;
  roundNumber: number;
  /** `ROUND 3 OF 5`. */
  roundLabel: string;

  playerA: PlayerLike | null;
  playerB: PlayerLike | null;
  attemptsA: AttemptRow[];
  attemptsB: AttemptRow[];
  roundScoreA: number;
  roundScoreB: number;

  lineupFor: (code: TeamCode) => Array<{ slot: LineupSlotRow; player: PlayerLike | null }>;
  playerFor: (id: string | null | undefined) => PlayerLike | null;

  /** Result of the current challenge's five rounds, so far. */
  challengeResult: ChallengeResult;
  /** Best single-round performance in the current challenge. */
  bestOfChallenge: (code?: TeamCode) => { player: PlayerLike; points: number } | null;

  goals: GoalRow[];
  confirmedGoals: GoalRow[];
}

const DIGITS = ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09'];

function two(n: number): string {
  return n >= 0 && n < 10 ? DIGITS[n] : String(n);
}

function challengeConfigFor(
  snapshot: EventSnapshot,
  challenge: ChallengeRow | null,
): ChallengeConfig | null {
  if (!challenge) return null;
  const key = String(challenge.number) as '1' | '2' | '3' | '4' | '5';
  return snapshot.scoring.challenges[key] ?? null;
}

function formatEventDate(iso: string | null): string {
  if (!iso) return '';
  const parsed = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return '';
  const weekday = parsed.toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
  const day = parsed.getUTCDate();
  const month = parsed.toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' });
  return `${weekday} • ${day} ${month} ${parsed.getUTCFullYear()}`.toUpperCase();
}

export function buildSceneModel(snapshot: EventSnapshot): SceneModel {
  const { event, teamsByCode, standings, teamPoints } = snapshot;

  const rankedById = new Map<string, RankedPlayer>(standings.map((p) => [p.id, p]));

  const playerFor = (id: string | null | undefined): PlayerLike | null => {
    if (!id) return null;
    return rankedById.get(id) ?? snapshot.playersById[id] ?? null;
  };

  const makeSide = (code: TeamCode): SideModel => {
    const team = teamsByCode[code] ?? null;
    const name = (team?.name ?? `TEAM ${code}`).toUpperCase();
    return {
      code,
      team,
      name,
      shortName: (team?.short_name ?? name).toUpperCase(),
      color: team?.color ?? null,
      points: teamPoints[code] ?? 0,
    };
  };

  const a = makeSide('A');
  const b = makeSide('B');

  const challenge = snapshot.currentChallenge;
  const challengeNumber = challenge?.number ?? null;
  const round = snapshot.currentRound;
  const rounds = snapshot.rounds;
  const roundCount = challenge?.round_count ?? rounds.length ?? 0;

  const attemptsA = snapshot.roundTotals?.attemptsA ?? [];
  const attemptsB = snapshot.roundTotals?.attemptsB ?? [];

  const squadCache = new Map<TeamCode, RankedPlayer[]>();
  const squad = (code: TeamCode): RankedPlayer[] => {
    const cached = squadCache.get(code);
    if (cached) return cached;
    const team = teamsByCode[code];
    const list = standings
      .filter((p) => (p.teamCode ? p.teamCode === code : team != null && p.team_id === team.id))
      .sort((x, y) => {
        const xs = x.slotLabel ?? '';
        const ys = y.slotLabel ?? '';
        if (xs && ys && xs !== ys) return xs.localeCompare(ys);
        return x.display_order - y.display_order;
      });
    squadCache.set(code, list);
    return list;
  };

  const lineupFor = (code: TeamCode) =>
    snapshot.lineup
      .filter((slot) => slot.team_code === code)
      .sort((x, y) => x.slot_index - y.slot_index)
      .map((slot) => ({ slot, player: playerFor(slot.player_id) }));

  const challengeResult = computeChallengeResult(
    rounds.map((r) => ({ score_a: r.score_a, score_b: r.score_b, winner: r.winner })),
    challenge?.aggregation_rule === 'round_wins' ? 'round_wins' : 'total_points',
  );

  const bestOfChallenge = (code?: TeamCode) => {
    let best: { player: PlayerLike; points: number } | null = null;
    for (const r of rounds) {
      const candidates: Array<[TeamCode, string | null, number]> = [
        ['A', r.player_a_id, r.score_a],
        ['B', r.player_b_id, r.score_b],
      ];
      for (const [side, playerId, points] of candidates) {
        if (code && side !== code) continue;
        const player = playerFor(playerId);
        if (!player) continue;
        if (!best || points > best.points) best = { player, points };
      }
    }
    return best;
  };

  const confirmedGoals = snapshot.goals.filter((g) => g.status === 'confirmed');

  return {
    snapshot,

    qrUrl: event.qr_target_url || `${SITE_URL}/`,
    eventDateLabel: formatEventDate(event.event_date),
    venueLabel: (event.holding_headline || `LIVE FROM ${event.venue ?? ''}`).toUpperCase().trim(),

    a,
    b,
    side: (code) => (code === 'A' ? a : b),

    standings,
    rankedById,
    topFive: standings.slice(0, 5),
    topTen: standings.slice(0, 10),
    leader: standings[0] ?? null,
    squad,

    challenge,
    challengeNumber,
    challengeLabel: challengeNumber != null ? `CHALLENGE ${two(challengeNumber)}` : 'CHALLENGE',
    challengeTitle: (challenge?.title ?? 'SHORES & SCORES').toUpperCase(),
    mechanic: challenge?.mechanic ?? null,
    challengeConfig: challengeConfigFor(snapshot, challenge),

    rounds,
    roundCount,
    round,
    roundNumber: round?.number ?? 0,
    roundLabel: round ? `ROUND ${round.number} OF ${roundCount || rounds.length}` : '',

    playerA: playerFor(round?.player_a_id),
    playerB: playerFor(round?.player_b_id),
    attemptsA,
    attemptsB,
    roundScoreA: snapshot.roundTotals?.scoreA ?? round?.score_a ?? 0,
    roundScoreB: snapshot.roundTotals?.scoreB ?? round?.score_b ?? 0,

    lineupFor,
    playerFor,

    challengeResult,
    bestOfChallenge,

    goals: snapshot.goals,
    confirmedGoals,
  };
}

/** Team-A-first ordering of a player's row, used by several strips. */
export function orderedPlayers(players: PlayerRow[], lineup: LineupSlotRow[]): PlayerRow[] {
  const order = new Map<string, number>();
  lineup.forEach((slot) => {
    if (slot.player_id && !order.has(slot.player_id)) {
      order.set(slot.player_id, (slot.team_code === 'A' ? 0 : 100) + slot.slot_index);
    }
  });
  return [...players].sort(
    (x, y) => (order.get(x.id) ?? 999) - (order.get(y.id) ?? 999),
  );
}
