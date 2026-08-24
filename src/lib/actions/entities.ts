'use server';

/**
 * Roster and branding commands — the things an admin edits before the whistle:
 * the event card, the two teams, the ten players, the sponsor ticker.
 *
 * All of them are ordinary patch operations, but they still go through the same
 * command pipeline as a goal: an idempotency key, an audit row holding the
 * before and after, and a bump of the event revision so every open screen knows
 * to re-read.
 */

import { parseInput, required, runCommand, take } from '@/lib/actions/_command';
import {
  updateEventSchema,
  updatePlayerSchema,
  updateSponsorSchema,
  updateTeamSchema,
} from '@/lib/actions/schemas';
import type {
  ActionResult,
  UpdateEventInput,
  UpdatePlayerInput,
  UpdateSponsorInput,
  UpdateTeamInput,
} from '@/lib/actions/types';
import type { EventRow, PlayerRow, SponsorRow, TeamRow } from '@/lib/types';

/** Patch the event card: name, venue, status, holding-screen copy. */
export async function updateEvent(
  input: UpdateEventInput,
): Promise<ActionResult<EventRow>> {
  const parsed = parseInput(updateEventSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<EventRow>({
    type: 'event.updated',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { patch: value.patch },
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;
      const before = required(
        take<EventRow | null>(
          await db.from('events').select('*').eq('id', eventId).maybeSingle(),
        ),
        'Event not found.',
      );

      const updated = take<EventRow>(
        await db
          .from('events')
          .update({ ...value.patch, updated_at: new Date().toISOString() })
          .eq('id', eventId)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'event.updated',
        entityType: 'event',
        entityId: eventId,
        before: Object.fromEntries(
          Object.keys(value.patch).map((k) => [
            k,
            (before as unknown as Record<string, unknown>)[k],
          ]),
        ),
        after: value.patch,
      });

      return updated;
    },
  });
}

/** Patch a team: name, colours, crest. */
export async function updateTeam(input: UpdateTeamInput): Promise<ActionResult<TeamRow>> {
  const parsed = parseInput(updateTeamSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<TeamRow>({
    type: 'team.updated',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { teamId: value.teamId, patch: value.patch },
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;
      const before = required(
        take<TeamRow | null>(
          await db
            .from('teams')
            .select('*')
            .eq('id', value.teamId)
            .eq('event_id', eventId)
            .maybeSingle(),
        ),
        'Team not found.',
      );

      const updated = take<TeamRow>(
        await db
          .from('teams')
          .update(value.patch)
          .eq('id', value.teamId)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'team.updated',
        entityType: 'team',
        entityId: value.teamId,
        before: { name: before.name, color: before.color },
        after: value.patch,
      });

      return updated;
    },
  });
}

/** Patch a player: squad details, cut-out photo, focal point, active flag. */
export async function updatePlayer(
  input: UpdatePlayerInput,
): Promise<ActionResult<PlayerRow>> {
  const parsed = parseInput(updatePlayerSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<PlayerRow>({
    type: 'player.updated',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { playerId: value.playerId, patch: value.patch },
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;
      const before = required(
        take<PlayerRow | null>(
          await db
            .from('players')
            .select('*')
            .eq('id', value.playerId)
            .eq('event_id', eventId)
            .maybeSingle(),
        ),
        'Player not found.',
      );

      const updated = take<PlayerRow>(
        await db
          .from('players')
          .update(value.patch)
          .eq('id', value.playerId)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'player.updated',
        entityType: 'player',
        entityId: value.playerId,
        before: {
          full_name: before.full_name,
          display_name: before.display_name,
          team_id: before.team_id,
          photo_url: before.photo_url,
          active: before.active,
        },
        after: value.patch,
      });

      return updated;
    },
  });
}

/** Patch a sponsor: logo, tier, ticker order, visibility. */
export async function updateSponsor(
  input: UpdateSponsorInput,
): Promise<ActionResult<SponsorRow>> {
  const parsed = parseInput(updateSponsorSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<SponsorRow>({
    type: 'sponsor.updated',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { sponsorId: value.sponsorId, patch: value.patch },
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;
      const before = required(
        take<SponsorRow | null>(
          await db
            .from('sponsors')
            .select('*')
            .eq('id', value.sponsorId)
            .eq('event_id', eventId)
            .maybeSingle(),
        ),
        'Sponsor not found.',
      );

      const updated = take<SponsorRow>(
        await db
          .from('sponsors')
          .update(value.patch)
          .eq('id', value.sponsorId)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'sponsor.updated',
        entityType: 'sponsor',
        entityId: value.sponsorId,
        before: { name: before.name, tier: before.tier, active: before.active },
        after: value.patch,
      });

      return updated;
    },
  });
}
