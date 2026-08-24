/**
 * Formatting helpers for the public spectator surface.
 *
 * Everything here is pure and deterministic so a server render and the first
 * client paint agree — no `Date.now()`, no viewer-locale drift. Anything that
 * genuinely depends on the current time (the countdown) is rendered after
 * mount instead.
 *
 * Point values are never written down here. Every figure a spectator reads
 * comes from the event's scoring profile, which is why `scoringSummary` takes
 * a `ChallengeConfig` rather than a challenge number.
 */

import type { EventSnapshot } from '@/lib/data/snapshot';
import type {
  ChallengeConfig,
  ChallengeRow,
  EventRow,
  LineupSlotRow,
  PlayerRow,
  RoundRow,
  ScoringConfig,
  TeamCode,
  TeamRow,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// Dates and clocks
// ---------------------------------------------------------------------------

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

/** `THURSDAY • 27 AUGUST 2026`, or null when the event has no date yet. */
export function eventDateLabel(event: EventRow): string | null {
  if (!event.event_date) return null;
  const at = Date.parse(`${event.event_date}T00:00:00Z`);
  if (Number.isNaN(at)) return null;
  const date = new Date(at);
  return `${WEEKDAY.format(date)} • ${DAY_MONTH_YEAR.format(date)}`.toUpperCase();
}

/** `20:00`, trimming the seconds a `time` column carries. */
export function eventTimeLabel(event: EventRow): string | null {
  if (!event.start_time) return null;
  const [h, m] = event.start_time.split(':');
  if (h === undefined || m === undefined) return null;
  return `${h.padStart(2, '0')}:${m}`;
}

/**
 * The zone's UTC offset at a given instant, in ms. Uses `Intl` rather than a
 * date library so a venue timezone in the database just works.
 */
function zoneOffsetMs(utcMs: number, timeZone: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour12: false,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).formatToParts(new Date(utcMs));

    const map: Record<string, string> = {};
    for (const part of parts) map[part.type] = part.value;

    const asUtc = Date.UTC(
      Number(map.year),
      Number(map.month) - 1,
      Number(map.day),
      Number(map.hour) % 24,
      Number(map.minute),
      Number(map.second),
    );
    return asUtc - utcMs;
  } catch {
    return 0;
  }
}

/**
 * Kick-off as a UTC timestamp, interpreting the stored date and time in the
 * event's own timezone. Null when either half is missing.
 */
export function eventStartsAtMs(event: EventRow): number | null {
  if (!event.event_date || !event.start_time) return null;
  const naive = Date.parse(`${event.event_date}T${event.start_time}Z`);
  if (Number.isNaN(naive)) return null;
  return naive - zoneOffsetMs(naive, event.timezone || 'UTC');
}

/** `12:43` / `2:04:11` for a countdown. Negative input reads `00:00`. */
export function formatCountdown(ms: number): string {
  const safe = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** `15s`, `1.5s`, `60s` — durations that came out of the scoring profile. */
export function secondsLabel(ms: number): string {
  const seconds = ms / 1000;
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`;
}

/** `20 MIN` for a half length. */
export function minutesLabel(ms: number): string {
  const minutes = ms / 60_000;
  return `${Number.isInteger(minutes) ? minutes : minutes.toFixed(1)} MIN`;
}

// ---------------------------------------------------------------------------
// Challenges
// ---------------------------------------------------------------------------

/** `01`, `05`. */
export function challengeNumber(challenge: ChallengeRow): string {
  return String(challenge.number).padStart(2, '0');
}

/** `CHALLENGE 03`. */
export function challengeEyebrow(challenge: ChallengeRow): string {
  return challenge.mechanic === 'final_match'
    ? 'FINAL MATCH'
    : `CHALLENGE ${challengeNumber(challenge)}`;
}

/** The challenge's own headline, e.g. `LONG-RANGE SHOOTING`. */
export function challengeHeadline(challenge: ChallengeRow): string {
  return (challenge.subtitle ?? challenge.title).toUpperCase();
}

/** The scoring profile entry for a challenge number, or null. */
export function configForChallenge(
  scoring: ScoringConfig,
  number: number,
): ChallengeConfig | null {
  const key = String(number) as keyof ScoringConfig['challenges'];
  return scoring.challenges[key] ?? null;
}

/**
 * A one-line, spectator-readable statement of how a challenge scores, built
 * entirely from the live scoring profile so it can never drift from the
 * numbers the scorekeepers are actually awarding.
 */
export function scoringSummary(config: ChallengeConfig | null): string | null {
  if (!config) return null;

  switch (config.mechanic) {
    case 'mannequin_target': {
      const targets = config.targets
        .map((t) => `${t.label.toUpperCase()} ${t.points} PT${t.points === 1 ? '' : 'S'}`)
        .join(' · ');
      return `${config.attemptsPerPlayer} SHOTS · ${targets}`;
    }
    case 'long_range': {
      const zones = config.zones
        .map((z) => `${z.label.toUpperCase()} ${z.points} PT${z.points === 1 ? '' : 'S'}`)
        .join(' · ');
      return `${config.attemptsPerPlayer} SHOTS · ${zones}`;
    }
    case 'dribble_finish':
      return [
        `${config.attemptsPerPlayer} ATTEMPTS`,
        `UNDER ${secondsLabel(config.dribbleThresholdMs)} +${config.dribbleBonusPoints}`,
        `GOAL +${config.goalPoints}`,
        `MAX ${config.maxPointsPerAttempt} PER ATTEMPT`,
      ].join(' · ');
    case 'center_circle':
      return [
        `${config.ballsPerPlayer} BALLS`,
        secondsLabel(config.timeLimitMs).toUpperCase(),
        `${config.pointsPerHit} PT${config.pointsPerHit === 1 ? '' : 'S'} PER BALL`,
      ].join(' · ');
    case 'final_match':
      return `${config.halves} HALVES · ${minutesLabel(config.halfDurationMs)} EACH`;
  }
}

/** How many attempts a player gets, straight from the profile. */
export function attemptsFor(config: ChallengeConfig | null): number {
  if (!config) return 0;
  if (config.mechanic === 'center_circle') return config.ballsPerPlayer;
  if (config.mechanic === 'final_match') return 0;
  return config.attemptsPerPlayer;
}

/** Half length for the final match, defaulting to the rules' 20 minutes. */
export function halfDurationMs(scoring: ScoringConfig): number {
  const config = scoring.challenges['5'];
  return config && config.mechanic === 'final_match' ? config.halfDurationMs : 1_200_000;
}

// ---------------------------------------------------------------------------
// Match clock
// ---------------------------------------------------------------------------

/**
 * The count-up match clock the rules describe: `00:00 → 20:00` in the first
 * half, `20:00 → 40:00` in the second.
 *
 * Each half owns its own timer row, and a half's clock may be banked either
 * from zero or from the end of the previous half depending on how it was
 * started. Adding the offset only when the raw value is still below it means
 * the reading is right in both cases and can never be double-counted.
 */
export function continuousMatchMs(rawMs: number, half: number, halfMs: number): number {
  const offset = halfMs * Math.max(0, half - 1);
  return rawMs >= offset ? rawMs : rawMs + offset;
}

// ---------------------------------------------------------------------------
// Teams, players and lineups
// ---------------------------------------------------------------------------

export function teamLabel(team: TeamRow | null | undefined, code: TeamCode): string {
  return (team?.name ?? `TEAM ${code}`).toUpperCase();
}

export function teamShort(team: TeamRow | null | undefined, code: TeamCode): string {
  return (team?.short_name ?? team?.name ?? `TEAM ${code}`).toUpperCase();
}

/** The slot a player holds in a given challenge, e.g. `A3`. */
export function slotLabelIn(
  lineup: LineupSlotRow[],
  challengeId: string | null | undefined,
  playerId: string | null | undefined,
): string | null {
  if (!playerId) return null;
  const scoped = challengeId
    ? lineup.filter((s) => s.challenge_id === challengeId)
    : lineup;
  return scoped.find((s) => s.player_id === playerId)?.slot_label ?? null;
}

/** The player's slot anywhere in the event — used on profile and standings. */
export function anySlotLabel(snapshot: EventSnapshot, playerId: string): string | null {
  return (
    snapshot.standings.find((p) => p.id === playerId)?.slotLabel ??
    slotLabelIn(snapshot.allLineups, null, playerId)
  );
}

/** `A3 vs B3` for a round, from that challenge's lineup. */
export function roundPairingLabel(
  snapshot: EventSnapshot,
  round: RoundRow,
  challengeId: string,
): string {
  const a = slotLabelIn(snapshot.allLineups, challengeId, round.player_a_id) ?? `A${round.number}`;
  const b = slotLabelIn(snapshot.allLineups, challengeId, round.player_b_id) ?? `B${round.number}`;
  return `${a}/${b}`;
}

export function playerOf(
  snapshot: EventSnapshot,
  id: string | null | undefined,
): PlayerRow | null {
  if (!id) return null;
  return snapshot.playersById[id] ?? null;
}

/** The ranked record for a player, which carries rank and totals. */
export function rankedOf(snapshot: EventSnapshot, id: string | null | undefined) {
  if (!id) return null;
  return snapshot.standings.find((p) => p.id === id) ?? null;
}

export function teamColorOf(
  snapshot: EventSnapshot,
  code: TeamCode | null | undefined,
): string | null {
  if (!code) return null;
  return snapshot.teamsByCode[code]?.color ?? null;
}

// ---------------------------------------------------------------------------
// Result wording
// ---------------------------------------------------------------------------

/** `TEAM A LEADS BY 7` / `SCORES LEVEL`, honest about a tie. */
export function leadSentence(
  aName: string,
  aScore: number,
  bName: string,
  bScore: number,
  unit = 'PTS',
): string {
  const diff = aScore - bScore;
  if (diff === 0) return `LEVEL ON ${unit}`;
  const leader = diff > 0 ? aName : bName;
  return `${leader} LEADS BY ${Math.abs(diff)}`;
}

/** `SHARED #3` when a rank is tied, `#3` otherwise. */
export function rankLabel(rank: number | null | undefined, shared: boolean): string {
  if (rank == null) return '—';
  return shared ? `SHARED #${rank}` : `#${rank}`;
}

/** How many players hold a given rank. */
export function sharedRankCount(
  standings: ReadonlyArray<{ rank: number }>,
  rank: number,
): number {
  return standings.filter((p) => p.rank === rank).length;
}
