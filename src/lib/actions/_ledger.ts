/**
 * Ledger writes shared by the round, challenge and match commands.
 *
 * The ledger is append-only. Nothing is ever deleted: a correction marks the
 * original row `reversed` and appends a mirror row (also `reversed`, carrying
 * the negated points and a `reverses_id`) purely so the audit trail reads as a
 * running story. Only `confirmed` rows count towards a total.
 */

import type { PendingLedgerEntry } from '@/lib/scoring/engine';
import type { Db } from '@/lib/event';
import type { LedgerEntryType, LedgerRow, PlayerRow, TeamCode } from '@/lib/types';
import { take, takeRows } from '@/lib/actions/_command';

export interface LedgerScope {
  eventId: string;
  challengeId?: string | null;
  roundId?: string | null;
  matchId?: string | null;
  profileVersion: number;
  actorId: string | null;
  reason?: string | null;
}

/** Insert a batch of pending entries as confirmed ledger rows. */
export async function insertLedgerEntries(
  db: Db,
  entries: PendingLedgerEntry[],
  scope: LedgerScope,
): Promise<LedgerRow[]> {
  if (entries.length === 0) return [];

  return takeRows<LedgerRow>(
    await db
      .from('player_points_ledger')
      .insert(
        entries.map((entry) => ({
          event_id: scope.eventId,
          player_id: entry.playerId,
          team_id: entry.teamId,
          challenge_id: scope.challengeId ?? null,
          round_id: scope.roundId ?? null,
          match_id: scope.matchId ?? null,
          entry_type: entry.entryType,
          points: entry.points,
          source_ref: entry.sourceRef,
          profile_version: scope.profileVersion,
          status: 'confirmed',
          reason: entry.reason ?? scope.reason ?? null,
          created_by: scope.actorId,
        })),
      )
      .select('*'),
  );
}

/** Confirmed ledger rows written for a round. */
export async function ledgerRowsForRound(db: Db, roundId: string): Promise<LedgerRow[]> {
  return takeRows<LedgerRow>(
    await db
      .from('player_points_ledger')
      .select('*')
      .eq('round_id', roundId)
      .eq('status', 'confirmed'),
  );
}

/** Confirmed ledger rows written for one source (a goal id, an attempt id). */
export async function ledgerRowsForSource(db: Db, sourceRef: string): Promise<LedgerRow[]> {
  return takeRows<LedgerRow>(
    await db
      .from('player_points_ledger')
      .select('*')
      .eq('source_ref', sourceRef)
      .eq('status', 'confirmed'),
  );
}

/** Confirmed ledger rows of one type for a match or challenge. */
export async function ledgerRowsOfType(
  db: Db,
  entryType: LedgerEntryType,
  filter: { matchId?: string; challengeId?: string; roundId?: string },
): Promise<LedgerRow[]> {
  let query = db
    .from('player_points_ledger')
    .select('*')
    .eq('entry_type', entryType)
    .eq('status', 'confirmed');

  if (filter.matchId) query = query.eq('match_id', filter.matchId);
  if (filter.challengeId) query = query.eq('challenge_id', filter.challengeId);
  if (filter.roundId) query = query.eq('round_id', filter.roundId);

  return takeRows<LedgerRow>(await query);
}

/**
 * Reverse a set of confirmed ledger rows: flip them to `reversed` and append a
 * mirrored, already-reversed row that records the correction.
 * Returns the ids of the rows that were reversed.
 */
export async function reverseLedgerRows(
  db: Db,
  entries: LedgerRow[],
  opts: { reason: string; actorId: string | null },
): Promise<string[]> {
  if (entries.length === 0) return [];
  const ids = entries.map((e) => e.id);

  take(
    await db
      .from('player_points_ledger')
      .update({ status: 'reversed', reason: opts.reason })
      .in('id', ids)
      .select('id'),
  );

  await db.from('player_points_ledger').insert(
    entries.map((entry) => ({
      event_id: entry.event_id,
      player_id: entry.player_id,
      team_id: entry.team_id,
      challenge_id: entry.challenge_id,
      round_id: entry.round_id,
      match_id: entry.match_id,
      entry_type: entry.entry_type,
      points: -Number(entry.points),
      source_ref: entry.source_ref,
      profile_version: entry.profile_version,
      status: 'reversed',
      reverses_id: entry.id,
      reason: opts.reason,
      created_by: opts.actorId,
    })),
  );

  return ids;
}

/** Players on a team, preferring the locked lineup for that challenge. */
export async function teamPlayersFor(
  db: Db,
  opts: { eventId: string; teamCode: TeamCode; challengeId?: string | null },
): Promise<PlayerRow[]> {
  if (opts.challengeId) {
    const slots = takeRows<{ player_id: string | null }>(
      await db
        .from('lineup_slots')
        .select('player_id')
        .eq('challenge_id', opts.challengeId)
        .eq('team_code', opts.teamCode),
    );
    const ids = slots.map((s) => s.player_id).filter((id): id is string => Boolean(id));
    if (ids.length > 0) {
      return takeRows<PlayerRow>(
        await db.from('players').select('*').in('id', ids).order('display_order'),
      );
    }
  }

  const team = take<{ id: string } | null>(
    await db
      .from('teams')
      .select('id')
      .eq('event_id', opts.eventId)
      .eq('code', opts.teamCode)
      .maybeSingle(),
  );
  if (!team) return [];

  return takeRows<PlayerRow>(
    await db
      .from('players')
      .select('*')
      .eq('team_id', team.id)
      .eq('active', true)
      .order('display_order'),
  );
}
