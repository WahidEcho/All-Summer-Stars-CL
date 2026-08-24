'use server';

/**
 * Lineup commands.
 *
 * A challenge is five one-v-one rounds, and slot A3 always faces slot B3. The
 * slot therefore *is* the fixture: assigning a player to a slot also assigns
 * them to that round. A player can hold only one slot per challenge — the
 * database enforces it with a partial unique index, and this command clears the
 * old slot first so the admin never has to.
 */

import {
  assertState,
  parseInput,
  required,
  runCommand,
  take,
  takeRows,
} from '@/lib/actions/_command';
import { challengeCommandSchema, setLineupSlotSchema } from '@/lib/actions/schemas';
import type {
  ActionResult,
  CompleteChallengeInput,
  SetLineupSlotInput,
  SetLineupSlotResult,
} from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type { ChallengeRow, LineupSlotRow, PlayerRow, RoundRow } from '@/lib/types';

async function loadChallenge(db: Db, challengeId: string): Promise<ChallengeRow> {
  return required(
    take<ChallengeRow | null>(
      await db.from('challenges').select('*').eq('id', challengeId).maybeSingle(),
    ),
    'Challenge not found.',
  );
}

async function lineupOf(db: Db, challengeId: string): Promise<LineupSlotRow[]> {
  return takeRows<LineupSlotRow>(
    await db
      .from('lineup_slots')
      .select('*')
      .eq('challenge_id', challengeId)
      .order('team_code')
      .order('slot_index'),
  );
}

/**
 * Keep the round fixtures in step with the lineup: round N is slot A-N against
 * slot B-N, so moving a player moves them into their round as well.
 */
async function syncRoundFixture(
  db: Db,
  challengeId: string,
  teamCode: 'A' | 'B',
  slotIndex: number,
  playerId: string | null,
): Promise<void> {
  const round = take<RoundRow | null>(
    await db
      .from('rounds')
      .select('*')
      .eq('challenge_id', challengeId)
      .eq('number', slotIndex)
      .maybeSingle(),
  );
  if (!round) return;
  if (round.status === 'published' || round.status === 'completed') return;

  await db
    .from('rounds')
    .update(teamCode === 'A' ? { player_a_id: playerId } : { player_b_id: playerId })
    .eq('id', round.id);
}

/**
 * Put a player in a slot, or clear it with `playerId: null`.
 *
 * If the player already holds another slot in this challenge, that slot is
 * emptied first and reported back as `displacedSlotId` so the UI can say what
 * moved rather than silently rearranging the team sheet.
 */
export async function setLineupSlot(
  input: SetLineupSlotInput,
): Promise<ActionResult<SetLineupSlotResult>> {
  const parsed = parseInput(setLineupSlotSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<SetLineupSlotResult>({
    type: 'lineup.slot_set',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: {
      challengeId: value.challengeId,
      teamCode: value.teamCode,
      slotIndex: value.slotIndex,
      playerId: value.playerId,
    },
    async run(ctx) {
      const { db } = ctx;
      const challenge = await loadChallenge(db, value.challengeId);

      assertState(
        challenge.status !== 'locked' && challenge.status !== 'completed',
        'This lineup is locked. Unlock the challenge to change it.',
        'locked',
      );

      const slot = required(
        take<LineupSlotRow | null>(
          await db
            .from('lineup_slots')
            .select('*')
            .eq('challenge_id', value.challengeId)
            .eq('team_code', value.teamCode)
            .eq('slot_index', value.slotIndex)
            .maybeSingle(),
        ),
        `Slot ${value.teamCode}${value.slotIndex} does not exist for this challenge.`,
      );

      let displacedSlotId: string | null = null;

      if (value.playerId) {
        const player = required(
          take<PlayerRow | null>(
            await db.from('players').select('*').eq('id', value.playerId).maybeSingle(),
          ),
          'Player not found.',
        );
        assertState(
          player.event_id === challenge.event_id,
          'That player belongs to a different event.',
          'invalid_input',
        );
        assertState(player.active, 'That player is not active.', 'invalid_input');
        assertState(
          player.team_id === slot.team_id,
          `That player is not in team ${value.teamCode}.`,
          'invalid_input',
        );

        // One slot per player, per challenge.
        const held = takeRows<LineupSlotRow>(
          await db
            .from('lineup_slots')
            .select('*')
            .eq('challenge_id', value.challengeId)
            .eq('player_id', value.playerId),
        ).filter((s) => s.id !== slot.id);

        for (const other of held) {
          await db.from('lineup_slots').update({ player_id: null }).eq('id', other.id);
          await syncRoundFixture(db, value.challengeId, other.team_code, other.slot_index, null);
          displacedSlotId = other.id;
        }
      }

      const updated = take<LineupSlotRow>(
        await db
          .from('lineup_slots')
          .update({ player_id: value.playerId })
          .eq('id', slot.id)
          .select('*')
          .single(),
      );

      await syncRoundFixture(
        db,
        value.challengeId,
        value.teamCode,
        value.slotIndex,
        value.playerId,
      );

      ctx.audit({
        action: 'lineup.slot_set',
        entityType: 'lineup_slot',
        entityId: slot.id,
        before: { player_id: slot.player_id },
        after: { player_id: value.playerId, displaced_slot_id: displacedSlotId },
      });

      return { slot: updated, lineup: await lineupOf(db, value.challengeId), displacedSlotId };
    },
  });
}

/**
 * Lock a team sheet. Every slot must be filled — a locked challenge with an
 * empty slot would put an unnamed player on the TV.
 */
export async function lockChallengeLineup(
  input: CompleteChallengeInput,
): Promise<ActionResult<ChallengeRow>> {
  const parsed = parseInput(challengeCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ChallengeRow>({
    type: 'lineup.locked',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { challengeId: value.challengeId },
    capability: 'admin',
    async run(ctx) {
      const { db } = ctx;
      const challenge = await loadChallenge(db, value.challengeId);
      const lineup = await lineupOf(db, challenge.id);

      const empty = lineup.filter((s) => !s.player_id).map((s) => s.slot_label);
      assertState(
        empty.length === 0,
        `Fill every slot before locking: ${empty.join(', ')} ${
          empty.length === 1 ? 'is' : 'are'
        } still empty.`,
        'invalid_input',
      );

      const updated = take<ChallengeRow>(
        await db
          .from('challenges')
          .update({ status: 'locked', locked_at: new Date().toISOString() })
          .eq('id', challenge.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'lineup.locked',
        entityType: 'challenge',
        entityId: challenge.id,
        before: { status: challenge.status },
        after: { status: 'locked', slots: lineup.length },
      });

      return updated;
    },
  });
}

/** Reopen a locked team sheet so a late substitution can be made. */
export async function unlockChallengeLineup(
  input: CompleteChallengeInput,
): Promise<ActionResult<ChallengeRow>> {
  const parsed = parseInput(challengeCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ChallengeRow>({
    type: 'lineup.unlocked',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { challengeId: value.challengeId },
    capability: 'admin',
    async run(ctx) {
      const { db } = ctx;
      const challenge = await loadChallenge(db, value.challengeId);
      assertState(
        challenge.status !== 'completed',
        'This challenge is finished; its lineup is part of the record.',
        'locked',
      );

      const updated = take<ChallengeRow>(
        await db
          .from('challenges')
          .update({ status: 'ready', locked_at: null })
          .eq('id', challenge.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'lineup.unlocked',
        entityType: 'challenge',
        entityId: challenge.id,
        before: { status: challenge.status },
        after: { status: 'ready' },
      });

      return updated;
    },
  });
}
