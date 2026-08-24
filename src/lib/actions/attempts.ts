'use server';

/**
 * Attempt commands for challenges 1–4.
 *
 * Points are never passed in from the client: `recordAttempt` looks up the live
 * scoring profile, feeds the payload through `scoreAttempt`, and stores what the
 * engine returns. Re-tuning the competition in settings changes the maths with
 * no code change.
 */

import { computeRoundTotals, scoreAttempt } from '@/lib/scoring/engine';
import {
  CommandError,
  assertState,
  parseInput,
  required,
  runCommand,
  take,
  takeRows,
} from '@/lib/actions/_command';
import { recordAttemptSchema, reverseAttemptSchema } from '@/lib/actions/schemas';
import type {
  ActionResult,
  RecordAttemptInput,
  RecordAttemptResult,
  ReverseAttemptInput,
  ReverseAttemptResult,
} from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type {
  AttemptRow,
  ChallengeRow,
  RoundRow,
  ScoringConfig,
  ScoringProfileRow,
} from '@/lib/types';

async function loadRoundContext(db: Db, roundId: string) {
  const round = required(
    take<RoundRow | null>(await db.from('rounds').select('*').eq('id', roundId).maybeSingle()),
    'Round not found.',
  );
  const challenge = required(
    take<ChallengeRow | null>(
      await db.from('challenges').select('*').eq('id', round.challenge_id).maybeSingle(),
    ),
    'Challenge not found.',
  );
  const profile = required(
    take<ScoringProfileRow | null>(
      await db
        .from('scoring_profiles')
        .select('*')
        .eq('event_id', challenge.event_id)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
    'No scoring profile for this event.',
  );
  return { round, challenge, profile };
}

function challengeConfigFor(profile: ScoringProfileRow, challenge: ChallengeRow) {
  const key = String(challenge.number) as keyof ScoringConfig['challenges'];
  const config = profile.config.challenges[key];
  if (!config) throw new CommandError('illegal_state', 'This challenge has no scoring config.');
  return config;
}

/** Recompute a round's running score from its confirmed attempts. */
async function syncRoundScore(db: Db, roundId: string) {
  const attempts = takeRows<AttemptRow>(
    await db.from('attempts').select('*').eq('round_id', roundId),
  );
  const totals = computeRoundTotals(attempts);
  const round = take<RoundRow>(
    await db
      .from('rounds')
      .update({ score_a: totals.scoreA, score_b: totals.scoreB })
      .eq('id', roundId)
      .select('*')
      .single(),
  );
  return { totals, round };
}

/**
 * Record one attempt. The engine decides the points; the round's running score
 * is recomputed from every confirmed attempt so a reversal can never leave a
 * stale total behind.
 */
export async function recordAttempt(
  input: RecordAttemptInput,
): Promise<ActionResult<RecordAttemptResult>> {
  const parsed = parseInput(recordAttemptSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<RecordAttemptResult>({
    type: 'attempt.recorded',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: {
      roundId: value.roundId,
      playerId: value.playerId,
      side: value.side,
      attemptNumber: value.attemptNumber,
      attemptPayload: value.payload,
    },
    async run(ctx) {
      const { db } = ctx;
      const { round, challenge, profile } = await loadRoundContext(db, value.roundId);

      assertState(
        round.status !== 'published' && round.status !== 'completed',
        'This round has been published. Reopen it before scoring again.',
        'locked',
      );

      const expectedPlayerId = value.side === 'A' ? round.player_a_id : round.player_b_id;
      assertState(
        expectedPlayerId === null || expectedPlayerId === value.playerId,
        `Player does not hold slot ${value.side} in this round.`,
        'invalid_input',
      );

      const config = challengeConfigFor(profile, challenge);
      assertState(
        config.mechanic === value.payload.kind,
        `Challenge ${challenge.number} expects a "${config.mechanic}" attempt.`,
        'invalid_input',
      );

      const points = scoreAttempt(config, value.payload);

      const existing = take<AttemptRow | null>(
        await db
          .from('attempts')
          .select('*')
          .eq('round_id', value.roundId)
          .eq('player_id', value.playerId)
          .eq('attempt_number', value.attemptNumber)
          .eq('status', 'confirmed')
          .maybeSingle(),
      );
      if (existing) {
        throw new CommandError(
          'conflict',
          `Attempt ${value.attemptNumber} already exists for this player. Reverse it first.`,
          { attemptId: existing.id },
        );
      }

      const attempt = take<AttemptRow>(
        await db
          .from('attempts')
          .insert({
            round_id: value.roundId,
            player_id: value.playerId,
            side: value.side,
            attempt_number: value.attemptNumber,
            payload: value.payload,
            points,
            status: 'confirmed',
            created_by: ctx.actor.id,
          })
          .select('*')
          .single(),
      );

      if (round.status === 'pending' || round.status === 'ready') {
        await db.from('rounds').update({ status: 'live' }).eq('id', round.id);
      }

      const synced = await syncRoundScore(db, value.roundId);

      ctx.audit({
        action: 'attempt.recorded',
        entityType: 'attempt',
        entityId: attempt.id,
        after: { points, payload: value.payload, side: value.side },
      });

      return { attempt, points, round: synced.round, totals: synced.totals };
    },
  });
}

/**
 * Reverse an attempt. The original is flipped to `reversed` and a mirrored
 * reversal row is appended — nothing is ever deleted, so the audit trail keeps
 * the full history of a contested call.
 */
export async function reverseAttempt(
  input: ReverseAttemptInput,
): Promise<ActionResult<ReverseAttemptResult>> {
  const parsed = parseInput(reverseAttemptSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ReverseAttemptResult>({
    type: 'attempt.reversed',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { attemptId: value.attemptId, reason: value.reason },
    async run(ctx) {
      const { db } = ctx;
      const original = required(
        take<AttemptRow | null>(
          await db.from('attempts').select('*').eq('id', value.attemptId).maybeSingle(),
        ),
        'Attempt not found.',
      );
      assertState(original.status === 'confirmed', 'This attempt is already reversed.');

      const { round } = await loadRoundContext(db, original.round_id);
      assertState(
        round.status !== 'published' && round.status !== 'completed',
        'Reopen the round before reversing an attempt.',
        'locked',
      );

      const reversed = take<AttemptRow>(
        await db
          .from('attempts')
          .update({ status: 'reversed' })
          .eq('id', original.id)
          .select('*')
          .single(),
      );

      const reversal = take<AttemptRow>(
        await db
          .from('attempts')
          .insert({
            round_id: original.round_id,
            player_id: original.player_id,
            side: original.side,
            attempt_number: original.attempt_number,
            payload: original.payload,
            points: -Number(original.points),
            status: 'reversed',
            reverses_id: original.id,
            created_by: ctx.actor.id,
          })
          .select('*')
          .single(),
      );

      const synced = await syncRoundScore(db, original.round_id);

      ctx.audit({
        action: 'attempt.reversed',
        entityType: 'attempt',
        entityId: original.id,
        before: { points: original.points, status: 'confirmed' },
        after: { status: 'reversed' },
        reason: value.reason,
      });

      return { reversed, reversal, round: synced.round, totals: synced.totals };
    },
  });
}
