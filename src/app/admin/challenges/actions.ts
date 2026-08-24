'use server';

/**
 * Challenge status commands for the lifecycle screen.
 *
 * `src/lib/actions` owns everything that moves points: `completeChallenge`
 * computes a challenge result and awards its bonus, and nothing here duplicates
 * a line of it. What was missing was the plain status write on either side of
 * that — a way to say "this challenge has started" and "that one was closed by
 * mistake, open it again" — which is why these two commands live beside the
 * screen that needs them rather than in the scoring library.
 *
 * They go through the same `runCommand` envelope as every other mutation, so
 * they claim an idempotency key, write an audit row, and bump the event
 * revision exactly like the rest of the console.
 */

import {
  assertState,
  required,
  runCommand,
  take,
  takeRows,
} from '@/lib/actions/_command';
import type { ActionResult } from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type { ChallengeRow, ResultOutcome, RoundRow } from '@/lib/types';

async function loadChallenge(db: Db, challengeId: string): Promise<ChallengeRow> {
  return required(
    take<ChallengeRow | null>(
      await db.from('challenges').select('*').eq('id', challengeId).maybeSingle(),
    ),
    'Challenge not found.',
  );
}

/**
 * Put a challenge on the air: status `live`.
 *
 * `startRound` already flips a `ready` or `locked` challenge to `live` as a side
 * effect of starting its first round, which is the happy path. This is the
 * direct control for the cases that path cannot reach — a challenge still on
 * `draft` because nobody locked its lineup, or one that has to be declared live
 * before any round is started.
 */
export async function startChallenge(input: {
  idempotencyKey: string;
  deviceId?: string | null;
  challengeId: string;
}): Promise<ActionResult<ChallengeRow>> {
  return runCommand<ChallengeRow>({
    type: 'challenge.started',
    idempotencyKey: input.idempotencyKey,
    deviceId: input.deviceId ?? null,
    payload: { challengeId: input.challengeId },
    capability: 'write',
    async run(ctx) {
      const { db } = ctx;
      const challenge = await loadChallenge(db, input.challengeId);

      assertState(
        challenge.status !== 'completed',
        'This challenge is completed. Reopen it before starting it again.',
        'illegal_state',
      );

      if (challenge.status === 'live') return challenge;

      const updated = take<ChallengeRow>(
        await db
          .from('challenges')
          .update({ status: 'live' })
          .eq('id', challenge.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'challenge.started',
        entityType: 'challenge',
        entityId: challenge.id,
        before: { status: challenge.status },
        after: { status: 'live' },
      });

      return updated;
    },
  });
}

/**
 * Put the operator's reason for an early ending into the record.
 *
 * `completeChallenge` takes no reason — it is the ordinary, expected close of a
 * challenge whose rounds are all in. Ending one early is a judgement call made
 * under time pressure, and the judgement is worth more to the record afterwards
 * than the status change is. So the screen writes this first and completes the
 * challenge second: if the reason cannot be recorded, nothing is closed.
 *
 * It deliberately changes nothing. The only thing it produces is the audit row.
 */
export async function noteEarlyChallengeEnd(input: {
  idempotencyKey: string;
  deviceId?: string | null;
  challengeId: string;
  reason: string;
  /** Rounds still unpublished at the moment the operator decided. */
  unpublishedRounds: number;
}): Promise<ActionResult<ChallengeRow>> {
  const reason = (input.reason ?? '').trim();

  return runCommand<ChallengeRow>({
    type: 'challenge.early_end_noted',
    idempotencyKey: input.idempotencyKey,
    deviceId: input.deviceId ?? null,
    payload: { challengeId: input.challengeId, reason },
    capability: 'admin',
    async run(ctx) {
      assertState(
        reason.length >= 3,
        'A reason of at least three characters is required.',
        'invalid_input',
      );
      const challenge = await loadChallenge(ctx.db, input.challengeId);

      ctx.audit({
        action: 'challenge.early_end_noted',
        entityType: 'challenge',
        entityId: challenge.id,
        before: { status: challenge.status },
        after: { unpublished_rounds: input.unpublishedRounds },
        reason,
      });

      return challenge;
    },
  });
}

/**
 * Reopen a completed challenge.
 *
 * The exact inverse of the status half of `completeChallenge`: the challenge
 * goes back to `live` with its winner and completion stamp cleared, and the
 * rounds that command moved from `published` to `completed` are moved back, so
 * a round can be reopened and republished afterwards.
 *
 * It is deliberately *not* the inverse of the scoring half. Any challenge win
 * bonus already written to the ledger stays there — reversing points is
 * `reopenRoundResult`'s job and it takes its own reason — so an operator who
 * reopens a challenge, changes a round and ends it again must expect the
 * original bonus to stand. The screen says so before the confirmation.
 */
export async function reopenChallenge(input: {
  idempotencyKey: string;
  deviceId?: string | null;
  challengeId: string;
  reason: string;
}): Promise<ActionResult<ChallengeRow>> {
  const reason = (input.reason ?? '').trim();

  return runCommand<ChallengeRow>({
    type: 'challenge.reopened',
    idempotencyKey: input.idempotencyKey,
    deviceId: input.deviceId ?? null,
    payload: { challengeId: input.challengeId, reason },
    capability: 'admin',
    async run(ctx) {
      const { db } = ctx;
      assertState(reason.length >= 3, 'A reason of at least three characters is required.', 'invalid_input');

      const challenge = await loadChallenge(db, input.challengeId);
      const before = takeRows<RoundRow>(
        await db.from('rounds').select('*').eq('challenge_id', challenge.id).order('number'),
      );

      const updated = take<ChallengeRow>(
        await db
          .from('challenges')
          .update({ status: 'live', winner: null, completed_at: null })
          .eq('id', challenge.id)
          .select('*')
          .single(),
      );

      await db
        .from('rounds')
        .update({ status: 'published', completed_at: null })
        .eq('challenge_id', challenge.id)
        .eq('status', 'completed');

      ctx.audit({
        action: 'challenge.reopened',
        entityType: 'challenge',
        entityId: challenge.id,
        before: { status: challenge.status, winner: challenge.winner },
        after: {
          status: 'live',
          winner: null,
          rounds_returned_to_published: before.filter((r) => r.status === 'completed').length,
        },
        reason,
      });

      return updated;
    },
  });
}

/**
 * Close the final match challenge.
 *
 * `completeChallenge` scores a challenge from its rounds, and the final match
 * has none — running it there would compute 0–0, record a draw, and put a false
 * winner on the challenge row. The match's own points and win bonus were
 * already written by `endMatch`, so all that is left is the status, and this
 * writes it from the match result rather than from an empty round list.
 */
export async function completeMatchChallenge(input: {
  idempotencyKey: string;
  deviceId?: string | null;
  challengeId: string;
}): Promise<ActionResult<ChallengeRow>> {
  return runCommand<ChallengeRow>({
    type: 'challenge.match_completed',
    idempotencyKey: input.idempotencyKey,
    deviceId: input.deviceId ?? null,
    payload: { challengeId: input.challengeId },
    capability: 'admin',
    async run(ctx) {
      const { db } = ctx;
      const challenge = await loadChallenge(db, input.challengeId);

      assertState(
        challenge.mechanic === 'final_match',
        'Only the final match is closed this way. Use END CHALLENGE for a rounds challenge.',
        'invalid_input',
      );

      const match = required(
        take<{ winner: ResultOutcome | null; status: string } | null>(
          await db
            .from('matches')
            .select('winner, status')
            .eq('challenge_id', challenge.id)
            .maybeSingle(),
        ),
        'This challenge has no match row.',
      );

      const updated = take<ChallengeRow>(
        await db
          .from('challenges')
          .update({
            status: 'completed',
            winner: match.winner,
            completed_at: new Date().toISOString(),
          })
          .eq('id', challenge.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'challenge.match_completed',
        entityType: 'challenge',
        entityId: challenge.id,
        before: { status: challenge.status, winner: challenge.winner },
        after: { status: 'completed', winner: match.winner, match_status: match.status },
      });

      return updated;
    },
  });
}
