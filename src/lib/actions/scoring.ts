'use server';

/**
 * Scoring-profile commands.
 *
 * The profile is versioned rather than edited in place. Every ledger row records
 * the `profile_version` that produced it, so re-tuning the competition at 4pm
 * can never silently rewrite what a player earned at 3pm — the old numbers stay
 * explainable. Locking the profile freezes it for the live show.
 */

import {
  assertState,
  parseInput,
  required,
  runCommand,
  take,
} from '@/lib/actions/_command';
import { commandBase, updateScoringProfileSchema } from '@/lib/actions/schemas';
import type {
  ActionResult,
  CommandBase,
} from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type { ScoringConfig, ScoringProfileRow } from '@/lib/types';

async function latestProfile(db: Db, eventId: string): Promise<ScoringProfileRow> {
  return required(
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
}

/**
 * Publish a new version of the scoring profile.
 *
 * Point values are never edited in place: a new row is appended with the next
 * version number and becomes the profile every later command reads.
 */
export async function updateScoringProfile(
  input: CommandBase & { config: ScoringConfig },
): Promise<ActionResult<ScoringProfileRow>> {
  const parsed = parseInput(updateScoringProfileSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ScoringProfileRow>({
    type: 'scoring.profile_updated',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { config: value.config },
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;
      const current = await latestProfile(db, eventId);

      assertState(
        !current.is_locked,
        'The scoring profile is locked for this event. Unlock it before changing point values.',
        'locked',
      );

      const created = take<ScoringProfileRow>(
        await db
          .from('scoring_profiles')
          .insert({
            event_id: eventId,
            version: current.version + 1,
            config: value.config,
            is_locked: false,
          })
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'scoring.profile_updated',
        entityType: 'scoring_profile',
        entityId: created.id,
        before: { version: current.version, config: current.config },
        after: { version: created.version, config: created.config },
      });

      return created;
    },
  });
}

/** Freeze the current profile so nothing can change mid-show. */
export async function lockScoringProfile(
  input: CommandBase,
): Promise<ActionResult<ScoringProfileRow>> {
  const parsed = parseInput(commandBase, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ScoringProfileRow>({
    type: 'scoring.profile_locked',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;
      const current = await latestProfile(db, eventId);
      if (current.is_locked) return current;

      const updated = take<ScoringProfileRow>(
        await db
          .from('scoring_profiles')
          .update({
            is_locked: true,
            locked_at: new Date().toISOString(),
            locked_by: ctx.actor.id,
          })
          .eq('id', current.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'scoring.profile_locked',
        entityType: 'scoring_profile',
        entityId: current.id,
        after: { version: current.version, is_locked: true },
      });

      return updated;
    },
  });
}

/** Unfreeze the profile. Admin-only, and audited — this changes the maths. */
export async function unlockScoringProfile(
  input: CommandBase,
): Promise<ActionResult<ScoringProfileRow>> {
  const parsed = parseInput(commandBase, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ScoringProfileRow>({
    type: 'scoring.profile_unlocked',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;
      const current = await latestProfile(db, eventId);
      if (!current.is_locked) return current;

      const updated = take<ScoringProfileRow>(
        await db
          .from('scoring_profiles')
          .update({ is_locked: false, locked_at: null, locked_by: null })
          .eq('id', current.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'scoring.profile_unlocked',
        entityType: 'scoring_profile',
        entityId: current.id,
        after: { version: current.version, is_locked: false },
      });

      return updated;
    },
  });
}
