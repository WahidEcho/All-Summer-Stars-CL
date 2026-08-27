'use server';

/**
 * Score resets — the controls that put an event back to unplayed.
 *
 * These are the only commands in the system that delete rather than reverse.
 * Everywhere else a correction appends a compensating entry, because the
 * competition's history is the product. A reset is a different act entirely:
 * it says the play never counted — a rehearsal, a demo, a test run before
 * doors — and leaving reversal trails from a rehearsal inside the real event's
 * ledger would be worse than removing them.
 *
 * What they never touch: teams, players, photos, lineups, sponsors, the
 * scoring profile, the QR target, or any other configuration. Setup survives a
 * reset intact, which is the whole point — the event stays ready to run again.
 *
 * Both require admin capability and a typed reason, and both write an audit row
 * recording exactly what was removed. The audit row survives the reset it
 * describes, so an event that was cleared can always say so.
 */

import { runCommand, required, take, takeRows } from '@/lib/actions/_command';
import type { ActionResult, ResetCounts } from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type { ChallengeRow, RoundRow } from '@/lib/types';

const EMPTY: ResetCounts = {
  attempts: 0,
  goals: 0,
  penaltyAttempts: 0,
  ledgerEntries: 0,
  rounds: 0,
  matches: 0,
  challenges: 0,
};

async function countOf(db: Db, table: string, column: string, value: string): Promise<number> {
  const { count } = (await db
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value)) as unknown as { count: number | null };
  return count ?? 0;
}

/** Every round row of a challenge, so its rows can be cleared by id. */
async function roundsOf(db: Db, challengeId: string): Promise<RoundRow[]> {
  return takeRows<RoundRow>(
    await db.from('rounds').select('*').eq('challenge_id', challengeId),
  );
}

async function loadChallenge(db: Db, challengeId: string): Promise<ChallengeRow> {
  return required(
    take<ChallengeRow | null>(
      await db.from('challenges').select('*').eq('id', challengeId).maybeSingle(),
    ),
    'Challenge not found.',
  );
}

/** Put a set of rounds back to unplayed. */
async function clearRounds(db: Db, roundIds: string[]): Promise<void> {
  if (roundIds.length === 0) return;
  await db.from('attempts').delete().in('round_id', roundIds);
  await db.from('player_points_ledger').delete().in('round_id', roundIds);
  await db.from('timers').delete().in('round_id', roundIds);
  await db
    .from('rounds')
    .update({
      status: 'pending',
      score_a: 0,
      score_b: 0,
      winner: null,
      active_side: null,
      published_at: null,
      completed_at: null,
      revision: 0,
    })
    .in('id', roundIds);
}

/**
 * Clear one challenge's scores.
 *
 * The five rounds go back to unplayed, their attempts and points are removed,
 * and the challenge returns to `draft` with no winner. Every other challenge —
 * and the final match — is untouched, so a single challenge can be re-run after
 * a false start without disturbing a day already in progress.
 *
 * For the final match this clears the goals, the shootout and the match state
 * instead, since challenge 5 has a match rather than rounds.
 */
export async function resetChallengeScores(input: {
  idempotencyKey: string;
  deviceId?: string | null;
  challengeId: string;
  reason: string;
}): Promise<ActionResult<ResetCounts>> {
  return runCommand<ResetCounts>({
    type: 'challenge.scores_reset',
    idempotencyKey: input.idempotencyKey,
    deviceId: input.deviceId ?? null,
    payload: { challengeId: input.challengeId, reason: input.reason },
    capability: 'admin',
    async run(ctx) {
      const { db } = ctx;
      const challenge = await loadChallenge(db, input.challengeId);
      const counts: ResetCounts = { ...EMPTY, challenges: 1 };

      if (challenge.mechanic === 'final_match') {
        const match = take<{ id: string } | null>(
          await db.from('matches').select('id').eq('challenge_id', challenge.id).maybeSingle(),
        );
        if (match) {
          counts.goals = await countOf(db, 'goals', 'match_id', match.id);
          counts.ledgerEntries = await countOf(db, 'player_points_ledger', 'match_id', match.id);

          const shootout = take<{ id: string } | null>(
            await db.from('penalty_shootouts').select('id').eq('match_id', match.id).maybeSingle(),
          );
          if (shootout) {
            counts.penaltyAttempts = await countOf(
              db,
              'penalty_attempts',
              'shootout_id',
              shootout.id,
            );
            await db.from('penalty_attempts').delete().eq('shootout_id', shootout.id);
            await db.from('penalty_shootouts').delete().eq('id', shootout.id);
          }

          await db.from('goals').delete().eq('match_id', match.id);
          await db.from('player_points_ledger').delete().eq('match_id', match.id);
          await db.from('timers').delete().eq('match_id', match.id);
          await db
            .from('matches')
            .update({
              status: 'pending',
              score_a: 0,
              score_b: 0,
              penalty_score_a: 0,
              penalty_score_b: 0,
              current_half: 1,
              winner: null,
              published_at: null,
              completed_at: null,
              revision: 0,
            })
            .eq('id', match.id);
          counts.matches = 1;
        }
      } else {
        const rounds = await roundsOf(db, challenge.id);
        counts.rounds = rounds.length;
        for (const round of rounds) {
          counts.attempts += await countOf(db, 'attempts', 'round_id', round.id);
          counts.ledgerEntries += await countOf(
            db,
            'player_points_ledger',
            'round_id',
            round.id,
          );
        }
        await clearRounds(db, rounds.map((r) => r.id));
      }

      // Any challenge-level bonus written against this challenge goes too.
      await db
        .from('player_points_ledger')
        .delete()
        .eq('challenge_id', challenge.id);

      const updated = take<ChallengeRow>(
        await db
          .from('challenges')
          .update({ status: 'draft', winner: null, completed_at: null })
          .eq('id', challenge.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'challenge.scores_reset',
        entityType: 'challenge',
        entityId: challenge.id,
        before: { status: challenge.status, winner: challenge.winner },
        after: { status: updated.status, removed: counts },
        reason: input.reason,
      });

      return counts;
    },
  });
}

/**
 * Clear the whole event's scores — every challenge, the final match, the
 * shootout, and every point in the ledger.
 *
 * The display drops back to the holding screen and the event to `draft`, so the
 * wall shows the pre-show slate rather than a stale result the moment the reset
 * lands. Setup is untouched.
 */
export async function resetEventScores(input: {
  idempotencyKey: string;
  deviceId?: string | null;
  reason: string;
}): Promise<ActionResult<ResetCounts>> {
  return runCommand<ResetCounts>({
    type: 'event.scores_reset',
    idempotencyKey: input.idempotencyKey,
    deviceId: input.deviceId ?? null,
    payload: { reason: input.reason },
    capability: 'admin',
    async run(ctx) {
      const { db, eventId } = ctx;
      const counts: ResetCounts = { ...EMPTY };

      const challenges = takeRows<ChallengeRow>(
        await db.from('challenges').select('*').eq('event_id', eventId),
      );
      counts.challenges = challenges.length;

      counts.ledgerEntries = await countOf(db, 'player_points_ledger', 'event_id', eventId);

      const rounds = takeRows<RoundRow>(
        await db
          .from('rounds')
          .select('id, challenge_id, challenges!inner(event_id)')
          .eq('challenges.event_id', eventId),
      );
      counts.rounds = rounds.length;
      for (const round of rounds) {
        counts.attempts += await countOf(db, 'attempts', 'round_id', round.id);
      }

      const matches = takeRows<{ id: string }>(
        await db
          .from('matches')
          .select('id, challenges!inner(event_id)')
          .eq('challenges.event_id', eventId),
      );
      for (const match of matches) {
        counts.goals += await countOf(db, 'goals', 'match_id', match.id);
        const shootout = take<{ id: string } | null>(
          await db.from('penalty_shootouts').select('id').eq('match_id', match.id).maybeSingle(),
        );
        if (shootout) {
          counts.penaltyAttempts += await countOf(
            db,
            'penalty_attempts',
            'shootout_id',
            shootout.id,
          );
          await db.from('penalty_attempts').delete().eq('shootout_id', shootout.id);
          await db.from('penalty_shootouts').delete().eq('match_id', match.id);
        }
        await db.from('goals').delete().eq('match_id', match.id);
        await db.from('timers').delete().eq('match_id', match.id);
        await db
          .from('matches')
          .update({
            status: 'pending',
            score_a: 0,
            score_b: 0,
            penalty_score_a: 0,
            penalty_score_b: 0,
            current_half: 1,
            winner: null,
            published_at: null,
            completed_at: null,
            revision: 0,
          })
          .eq('id', match.id);
      }
      counts.matches = matches.length;

      await db.from('player_points_ledger').delete().eq('event_id', eventId);
      await clearRounds(db, rounds.map((r) => r.id));

      await db
        .from('challenges')
        .update({ status: 'draft', winner: null, completed_at: null })
        .eq('event_id', eventId);

      // Put the wall back on the pre-show slate rather than a stale result.
      await db
        .from('display_state')
        .update({
          program_scene: 'holding',
          program_payload: {},
          preview_scene: null,
          preview_payload: {},
          ceremony_phase: null,
        })
        .eq('event_id', eventId);

      await db.from('events').update({ status: 'draft' }).eq('id', eventId);

      ctx.audit({
        action: 'event.scores_reset',
        entityType: 'event',
        entityId: eventId,
        after: { removed: counts },
        reason: input.reason,
      });

      return counts;
    },
  });
}
