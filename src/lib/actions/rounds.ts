'use server';

/**
 * Round and challenge lifecycle commands.
 *
 * A round travels pending → live → result_ready → published. Points only reach
 * a player's total at `publishRoundResult`, and publishing twice is a no-op:
 * the command looks for ledger rows it already wrote for that round before it
 * writes any more.
 */

import {
  computeChallengeResult,
  computeRoundTotals,
  ledgerEntriesForRound,
  type PendingLedgerEntry,
} from '@/lib/scoring/engine';
import {
  assertState,
  parseInput,
  required,
  runCommand,
  take,
  takeRows,
} from '@/lib/actions/_command';
import {
  insertLedgerEntries,
  ledgerRowsForRound,
  ledgerRowsOfType,
  reverseLedgerRows,
  teamPlayersFor,
} from '@/lib/actions/_ledger';
import {
  challengeCommandSchema,
  reopenRoundSchema,
  roundCommandSchema,
} from '@/lib/actions/schemas';
import type {
  ActionResult,
  CompleteChallengeInput,
  CompleteChallengeResult,
  PublishRoundResult,
  ReopenRoundInput,
  ReopenRoundResult,
  RoundCommandInput,
  SubmitRoundResult,
} from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type {
  AttemptRow,
  ChallengeRow,
  PlayerRow,
  RoundRow,
  ScoringProfileRow,
} from '@/lib/types';

async function loadProfile(db: Db, eventId: string): Promise<ScoringProfileRow> {
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

async function loadRound(db: Db, roundId: string): Promise<RoundRow> {
  return required(
    take<RoundRow | null>(await db.from('rounds').select('*').eq('id', roundId).maybeSingle()),
    'Round not found.',
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

async function loadPlayer(db: Db, playerId: string | null): Promise<PlayerRow | null> {
  if (!playerId) return null;
  return take<PlayerRow | null>(
    await db.from('players').select('*').eq('id', playerId).maybeSingle(),
  );
}

/** Put a round on the clock: status `live`, team A on the ball. */
export async function startRound(input: RoundCommandInput): Promise<ActionResult<RoundRow>> {
  const parsed = parseInput(roundCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<RoundRow>({
    type: 'round.started',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { roundId: value.roundId },
    async run(ctx) {
      const { db } = ctx;
      const round = await loadRound(db, value.roundId);
      assertState(
        round.status !== 'published' && round.status !== 'completed',
        'This round is already finished.',
        'locked',
      );

      const challenge = await loadChallenge(db, round.challenge_id);

      // One round at a time — a hard rule, learned the hard way. During a dress
      // run, rounds started and abandoned across two devices left five rounds
      // simultaneously "in flight", and the wall (which follows whatever is
      // live) could never settle on a result: every publish snapped it straight
      // to a stale live round, which read as the show starting the next round
      // by itself. The show is strictly sequential; the server now says so.
      const inFlight = takeRows<{ id: string; number: number; challenge_id: string }>(
        await db
          .from('rounds')
          .select('id, number, challenge_id, challenges!inner(event_id, number)')
          .eq('challenges.event_id', challenge.event_id)
          .in('status', ['live', 'awaiting_result', 'result_ready'])
          .neq('id', round.id),
      );
      if (inFlight.length > 0) {
        const blocking = inFlight[0] as unknown as {
          number: number;
          challenges: { number: number };
        };
        assertState(
          false,
          `Round ${blocking.number} of challenge ${blocking.challenges.number} is still open — submit and publish it before starting another round.`,
          'illegal_state',
        );
      }

      if (challenge.status === 'ready' || challenge.status === 'locked') {
        await db.from('challenges').update({ status: 'live' }).eq('id', challenge.id);
      }

      const updated = take<RoundRow>(
        await db
          .from('rounds')
          .update({ status: 'live', active_side: round.active_side ?? 'A' })
          .eq('id', round.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'round.started',
        entityType: 'round',
        entityId: round.id,
        before: { status: round.status },
        after: { status: updated.status },
      });

      return updated;
    },
  });
}

/**
 * Freeze the official result of a round. Totals come from `computeRoundTotals`
 * over the confirmed attempts, never from anything the client sent.
 */
export async function submitOfficialRoundResult(
  input: RoundCommandInput,
): Promise<ActionResult<SubmitRoundResult>> {
  const parsed = parseInput(roundCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<SubmitRoundResult>({
    type: 'round.result_submitted',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { roundId: value.roundId },
    async run(ctx) {
      const { db } = ctx;
      const round = await loadRound(db, value.roundId);
      assertState(
        round.status !== 'published' && round.status !== 'completed',
        'This round is already published.',
        'locked',
      );

      const attempts = takeRows<AttemptRow>(
        await db.from('attempts').select('*').eq('round_id', round.id),
      );
      const totals = computeRoundTotals(attempts);

      const updated = take<RoundRow>(
        await db
          .from('rounds')
          .update({
            score_a: totals.scoreA,
            score_b: totals.scoreB,
            winner: totals.winner,
            status: 'result_ready',
          })
          .eq('id', round.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'round.result_submitted',
        entityType: 'round',
        entityId: round.id,
        before: { score_a: round.score_a, score_b: round.score_b, status: round.status },
        after: { score_a: totals.scoreA, score_b: totals.scoreB, winner: totals.winner },
      });

      return { round: updated, totals };
    },
  });
}

/**
 * Publish a round: write its ledger entries and flip it to `published`.
 *
 * Idempotent by construction — if confirmed ledger rows already exist for the
 * round, the command returns them instead of writing a second set, so a double
 * tap or a replayed key can never double the points.
 */
export async function publishRoundResult(
  input: RoundCommandInput,
): Promise<ActionResult<PublishRoundResult>> {
  const parsed = parseInput(roundCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<PublishRoundResult>({
    type: 'round.published',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { roundId: value.roundId },
    async run(ctx) {
      const { db } = ctx;
      const round = await loadRound(db, value.roundId);
      const challenge = await loadChallenge(db, round.challenge_id);
      const profile = await loadProfile(db, challenge.event_id);

      const already = await ledgerRowsForRound(db, round.id);
      if (already.length > 0) {
        const current =
          round.status === 'published' || round.status === 'completed'
            ? round
            : take<RoundRow>(
                await db
                  .from('rounds')
                  .update({ status: 'published', published_at: new Date().toISOString() })
                  .eq('id', round.id)
                  .select('*')
                  .single(),
              );
        return { round: current, entries: already, alreadyPublished: true };
      }

      const attempts = takeRows<AttemptRow>(
        await db.from('attempts').select('*').eq('round_id', round.id),
      );
      const totals = computeRoundTotals(attempts);

      const [playerA, playerB] = await Promise.all([
        loadPlayer(db, round.player_a_id),
        loadPlayer(db, round.player_b_id),
      ]);

      const pending: PendingLedgerEntry[] = ledgerEntriesForRound({
        totals,
        playerA,
        playerB,
        bonuses: {
          roundWinBonus: profile.config.bonuses.roundWinBonus,
          roundDrawPoints: profile.config.bonuses.roundDrawPoints,
        },
      });

      const entries = await insertLedgerEntries(db, pending, {
        eventId: challenge.event_id,
        challengeId: challenge.id,
        roundId: round.id,
        profileVersion: profile.version,
        actorId: ctx.actor.id,
      });

      const updated = take<RoundRow>(
        await db
          .from('rounds')
          .update({
            score_a: totals.scoreA,
            score_b: totals.scoreB,
            winner: totals.winner,
            status: 'published',
            published_at: new Date().toISOString(),
            revision: Number(round.revision) + 1,
          })
          .eq('id', round.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'round.published',
        entityType: 'round',
        entityId: round.id,
        after: {
          score_a: totals.scoreA,
          score_b: totals.scoreB,
          winner: totals.winner,
          ledger_entries: entries.length,
        },
      });

      return { round: updated, entries, alreadyPublished: false };
    },
  });
}

/**
 * Reopen a published round, reversing exactly the ledger entries the publish
 * wrote. Player totals return to what they were before the publish.
 */
export async function reopenRoundResult(
  input: ReopenRoundInput,
): Promise<ActionResult<ReopenRoundResult>> {
  const parsed = parseInput(reopenRoundSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ReopenRoundResult>({
    type: 'round.reopened',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { roundId: value.roundId, reason: value.reason },
    capability: 'admin',
    async run(ctx) {
      const { db } = ctx;
      const round = await loadRound(db, value.roundId);

      const entries = await ledgerRowsForRound(db, round.id);
      const reversedEntryIds = await reverseLedgerRows(db, entries, {
        reason: value.reason,
        actorId: ctx.actor.id,
      });

      const updated = take<RoundRow>(
        await db
          .from('rounds')
          .update({
            status: 'result_ready',
            published_at: null,
            completed_at: null,
            revision: Number(round.revision) + 1,
          })
          .eq('id', round.id)
          .select('*')
          .single(),
      );

      ctx.audit({
        action: 'round.reopened',
        entityType: 'round',
        entityId: round.id,
        before: { status: round.status, ledger_entries: entries.length },
        after: { status: 'result_ready', reversed_entries: reversedEntryIds.length },
        reason: value.reason,
      });

      return { round: updated, reversedEntryIds };
    },
  });
}

/**
 * Close a challenge: compute its result from the five published rounds and, if
 * the profile defines a challenge win bonus, award it to the winning side's
 * lineup. Re-running the command never awards the bonus twice.
 */
export async function completeChallenge(
  input: CompleteChallengeInput,
): Promise<ActionResult<CompleteChallengeResult>> {
  const parsed = parseInput(challengeCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<CompleteChallengeResult>({
    type: 'challenge.completed',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { challengeId: value.challengeId },
    async run(ctx) {
      const { db } = ctx;
      const challenge = await loadChallenge(db, value.challengeId);
      const profile = await loadProfile(db, challenge.event_id);

      const rounds = takeRows<RoundRow>(
        await db
          .from('rounds')
          .select('*')
          .eq('challenge_id', challenge.id)
          .order('number'),
      );

      const aggregation =
        challenge.aggregation_rule === 'round_wins' ? 'round_wins' : 'total_points';
      const result = computeChallengeResult(
        rounds.map((r) => ({
          score_a: Number(r.score_a),
          score_b: Number(r.score_b),
          winner: r.winner,
        })),
        aggregation,
      );

      const bonus = profile.config.bonuses.challengeWinBonus;
      const existingBonus = await ledgerRowsOfType(db, 'challenge_win_bonus', {
        challengeId: challenge.id,
      });

      let bonusEntries = existingBonus;
      if (existingBonus.length === 0 && bonus !== 0 && result.winner !== 'draw') {
        const winners = await teamPlayersFor(db, {
          eventId: challenge.event_id,
          teamCode: result.winner,
          challengeId: challenge.id,
        });
        bonusEntries = await insertLedgerEntries(
          db,
          winners.map((player) => ({
            playerId: player.id,
            teamId: player.team_id,
            entryType: 'challenge_win_bonus' as const,
            points: bonus,
            sourceRef: challenge.id,
          })),
          {
            eventId: challenge.event_id,
            challengeId: challenge.id,
            profileVersion: profile.version,
            actorId: ctx.actor.id,
          },
        );
      }

      const updated = take<ChallengeRow>(
        await db
          .from('challenges')
          .update({
            status: 'completed',
            winner: result.winner,
            completed_at: new Date().toISOString(),
          })
          .eq('id', challenge.id)
          .select('*')
          .single(),
      );

      await db
        .from('rounds')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('challenge_id', challenge.id)
        .eq('status', 'published');

      ctx.audit({
        action: 'challenge.completed',
        entityType: 'challenge',
        entityId: challenge.id,
        before: { status: challenge.status },
        after: { status: 'completed', winner: result.winner, result },
      });

      return { challenge: updated, result, bonusEntries };
    },
  });
}
