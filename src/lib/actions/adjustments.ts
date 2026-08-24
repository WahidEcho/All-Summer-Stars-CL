'use server';

/**
 * Manual point corrections.
 *
 * The escape hatch for the things a rules engine cannot know: a referee's call,
 * a mis-keyed attempt discovered an hour later, a sponsor bonus agreed on the
 * night. It is deliberately the loudest operation in the system — admin only, a
 * written reason required, and a `manual_adjustment` ledger row that never
 * pretends to be an earned point.
 */

import {
  parseInput,
  required,
  runCommand,
  take,
} from '@/lib/actions/_command';
import { insertLedgerEntries, reverseLedgerRows } from '@/lib/actions/_ledger';
import {
  adjustPlayerPointsSchema,
  commandBase,
  reason as reasonSchema,
  uuid,
} from '@/lib/actions/schemas';
import type {
  ActionResult,
  AdjustPlayerPointsInput,
  CommandBase,
} from '@/lib/actions/types';
import type { LedgerRow, PlayerRow, ScoringProfileRow } from '@/lib/types';

const reverseAdjustmentSchema = commandBase.extend({
  entryId: uuid,
  reason: reasonSchema,
});

/**
 * Add or subtract points from one player, with a reason on the record.
 * Negative values are allowed — that is the point of a correction.
 */
export async function adjustPlayerPoints(
  input: AdjustPlayerPointsInput,
): Promise<ActionResult<LedgerRow>> {
  const parsed = parseInput(adjustPlayerPointsSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<LedgerRow>({
    type: 'points.adjusted',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { playerId: value.playerId, points: value.points, reason: value.reason },
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;

      const player = required(
        take<PlayerRow | null>(
          await db.from('players').select('*').eq('id', value.playerId).maybeSingle(),
        ),
        'Player not found.',
      );

      const profile = required(
        take<ScoringProfileRow | null>(
          await db
            .from('scoring_profiles')
            .select('*')
            .eq('event_id', eventId)
            .order('version', { ascending: false })
            .limit(1)
            .maybeSingle(),
        ),
        'No scoring profile for this event.',
      );

      const written = await insertLedgerEntries(
        db,
        [
          {
            playerId: player.id,
            teamId: player.team_id,
            entryType: 'manual_adjustment',
            points: value.points,
            sourceRef: ctx.scoreEventId,
            reason: value.reason,
          },
        ],
        {
          eventId,
          profileVersion: profile.version,
          actorId: ctx.actor.id,
          reason: value.reason,
        },
      );

      const entry = required(written[0], 'The adjustment could not be written.');

      ctx.audit({
        action: 'points.adjusted',
        entityType: 'player',
        entityId: player.id,
        after: { points: value.points, ledger_entry_id: entry.id },
        reason: value.reason,
      });

      return entry;
    },
  });
}

/** Undo a manual correction, leaving both rows in the audit trail. */
export async function reverseAdjustment(
  input: CommandBase & { entryId: string; reason: string },
): Promise<ActionResult<{ reversedEntryIds: string[] }>> {
  const parsed = parseInput(reverseAdjustmentSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<{ reversedEntryIds: string[] }>({
    type: 'points.adjustment_reversed',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { entryId: value.entryId, reason: value.reason },
    capability: 'admin',
    async run(ctx) {
      const entry = required(
        take<LedgerRow | null>(
          await ctx.db
            .from('player_points_ledger')
            .select('*')
            .eq('id', value.entryId)
            .eq('status', 'confirmed')
            .maybeSingle(),
        ),
        'No confirmed ledger entry with that id.',
      );

      const reversedEntryIds = await reverseLedgerRows(ctx.db, [entry], {
        reason: value.reason,
        actorId: ctx.actor.id,
      });

      ctx.audit({
        action: 'points.adjustment_reversed',
        entityType: 'player_points_ledger',
        entityId: entry.id,
        before: { points: entry.points, entry_type: entry.entry_type },
        after: { status: 'reversed' },
        reason: value.reason,
      });

      return { reversedEntryIds };
    },
  });
}
