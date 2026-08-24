'use server';

/**
 * Penalty shootout commands.
 *
 * The shootout exists only to separate two sides that finished level, so its
 * points never join the headline total: they are written as
 * `penalty_tiebreak_points`, which the ranking config uses purely as a
 * tiebreaker. A shootout can therefore decide the trophy without distorting the
 * individual leaderboard.
 */

import {
  computeMatchScore,
  computePenaltyScore,
  computeShootoutState,
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
  ledgerRowsOfType,
  reverseLedgerRows,
  teamPlayersFor,
} from '@/lib/actions/_ledger';
import { loadMatchContext, loadShootout, writeMatch } from '@/lib/actions/_match';
import {
  matchCommandSchema,
  recordPenaltyAttemptSchema,
  reversePenaltyAttemptSchema,
} from '@/lib/actions/schemas';
import type {
  ActionResult,
  MatchCommandInput,
  OpenShootoutResult,
  RecordPenaltyAttemptInput,
  RecordPenaltyAttemptResult,
  ReversePenaltyAttemptInput,
  ReversePenaltyAttemptResult,
} from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type {
  ChallengeRow,
  GoalRow,
  LedgerRow,
  PenaltyAttemptRow,
  PenaltyShootoutRow,
  PlayerRow,
  ScoringProfileRow,
} from '@/lib/types';

async function attemptsOf(db: Db, shootoutId: string): Promise<PenaltyAttemptRow[]> {
  return takeRows<PenaltyAttemptRow>(
    await db
      .from('penalty_attempts')
      .select('*')
      .eq('shootout_id', shootoutId)
      .order('sequence'),
  );
}

/** Push the shootout score onto the match row so every display agrees. */
async function syncPenaltyScore(db: Db, matchId: string, attempts: PenaltyAttemptRow[]) {
  const totals = computePenaltyScore(attempts);
  const match = await writeMatch(db, matchId, {
    penalty_score_a: totals.scoreA,
    penalty_score_b: totals.scoreB,
  });
  return { totals, match };
}

/**
 * Write the tiebreak points once a shootout is settled: a configurable amount
 * per successful kick, plus a winner's share for the side that came through.
 * Guarded by the ledger so replaying the deciding kick cannot pay twice.
 */
async function settleShootoutLedger(
  db: Db,
  opts: {
    shootout: PenaltyShootoutRow;
    matchId: string;
    challenge: ChallengeRow;
    profile: ScoringProfileRow;
    eventId: string;
    attempts: PenaltyAttemptRow[];
    winner: 'A' | 'B';
    actorId: string | null;
  },
): Promise<LedgerRow[]> {
  const existing = await ledgerRowsOfType(db, 'penalty_tiebreak_points', {
    matchId: opts.matchId,
  });
  if (existing.length > 0) return existing;

  const { pointsPerScoredAttempt, winnerPoints } = opts.profile.config.penalties;
  const entries: Array<{
    playerId: string;
    teamId: string | null;
    entryType: 'penalty_tiebreak_points';
    points: number;
    sourceRef: string;
  }> = [];

  if (pointsPerScoredAttempt !== 0) {
    const scorers = opts.attempts.filter(
      (a) => a.status === 'confirmed' && a.scored && a.player_id,
    );
    const ids = [...new Set(scorers.map((a) => a.player_id as string))];

    // Carry the team on every row, so `team_totals` stays derivable from the
    // ledger alone rather than needing a join back through the shootout.
    const teamByPlayer = new Map<string, string | null>();
    if (ids.length > 0) {
      const players = takeRows<PlayerRow>(
        await db.from('players').select('id, team_id').in('id', ids),
      );
      for (const p of players) teamByPlayer.set(p.id, p.team_id);
    }

    for (const attempt of scorers) {
      const playerId = attempt.player_id as string;
      entries.push({
        playerId,
        teamId: teamByPlayer.get(playerId) ?? null,
        entryType: 'penalty_tiebreak_points',
        points: pointsPerScoredAttempt,
        sourceRef: attempt.id,
      });
    }
  }

  if (winnerPoints !== 0) {
    const winners = await teamPlayersFor(db, {
      eventId: opts.eventId,
      teamCode: opts.winner,
      challengeId: opts.challenge.id,
    });
    for (const player of winners) {
      entries.push({
        playerId: player.id,
        teamId: player.team_id,
        entryType: 'penalty_tiebreak_points',
        points: winnerPoints,
        sourceRef: opts.shootout.id,
      });
    }
  }

  return insertLedgerEntries(db, entries, {
    eventId: opts.eventId,
    challengeId: opts.challenge.id,
    matchId: opts.matchId,
    profileVersion: opts.profile.version,
    actorId: opts.actorId,
  });
}

/**
 * Open a shootout. Permitted only when the regular result really is level —
 * a shootout after a decided match would rewrite a result that already stands.
 */
export async function openShootout(
  input: MatchCommandInput,
): Promise<ActionResult<OpenShootoutResult>> {
  const parsed = parseInput(matchCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<OpenShootoutResult>({
    type: 'shootout.opened',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { matchId: value.matchId },
    async run(ctx) {
      const { db } = ctx;
      const { match, profile } = await loadMatchContext(db, value.matchId);

      const goals = takeRows<GoalRow>(
        await db.from('goals').select('*').eq('match_id', match.id),
      );
      const totals = computeMatchScore(goals);

      assertState(
        totals.winner === 'draw',
        `The match is not level (${totals.scoreA}–${totals.scoreB}). A shootout cannot be opened.`,
      );
      assertState(
        profile.config.penalties.enabledFor !== 'disabled',
        'Penalties are disabled in the scoring profile.',
      );

      const existing = take<PenaltyShootoutRow | null>(
        await db
          .from('penalty_shootouts')
          .select('*')
          .eq('match_id', match.id)
          .maybeSingle(),
      );

      const shootout =
        existing ??
        take<PenaltyShootoutRow>(
          await db
            .from('penalty_shootouts')
            .insert({
              match_id: match.id,
              status: 'open',
              opening_attempts: profile.config.penalties.openingAttempts,
            })
            .select('*')
            .single(),
        );

      const updated = await writeMatch(db, match.id, { status: 'penalties' });

      ctx.audit({
        action: 'shootout.opened',
        entityType: 'penalty_shootout',
        entityId: shootout.id,
        after: {
          opening_attempts: shootout.opening_attempts,
          score_a: totals.scoreA,
          score_b: totals.scoreB,
        },
      });

      return { shootout, match: updated };
    },
  });
}

/**
 * Record one kick. The sequence number is assigned server-side from the
 * confirmed attempts, so two devices tapping at once cannot collide, and the
 * shootout is settled the moment the maths says it is decided.
 */
export async function recordPenaltyAttempt(
  input: RecordPenaltyAttemptInput,
): Promise<ActionResult<RecordPenaltyAttemptResult>> {
  const parsed = parseInput(recordPenaltyAttemptSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<RecordPenaltyAttemptResult>({
    type: 'shootout.attempt_recorded',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: {
      shootoutId: value.shootoutId,
      teamCode: value.teamCode,
      playerId: value.playerId,
      scored: value.scored,
    },
    async run(ctx) {
      const { db } = ctx;
      const shootout = await loadShootout(db, value.shootoutId);
      assertState(shootout.status !== 'completed', 'This shootout is already decided.', 'locked');

      const { match, challenge, profile, eventId } = await loadMatchContext(
        db,
        shootout.match_id,
      );

      const before = await attemptsOf(db, shootout.id);
      const confirmedBefore = before.filter((a) => a.status === 'confirmed');
      const nextSequence =
        value.sequence ??
        confirmedBefore.reduce((max, a) => Math.max(max, a.sequence), 0) + 1;

      const stateBefore = computeShootoutState(confirmedBefore, {
        openingAttempts: shootout.opening_attempts,
        suddenDeath: profile.config.penalties.suddenDeath,
      });

      const attempt = take<PenaltyAttemptRow>(
        await db
          .from('penalty_attempts')
          .insert({
            shootout_id: shootout.id,
            sequence: nextSequence,
            team_code: value.teamCode,
            player_id: value.playerId,
            scored: value.scored,
            is_sudden_death: value.isSuddenDeath ?? stateBefore.inSuddenDeath,
            status: 'confirmed',
            created_by: ctx.actor.id,
          })
          .select('*')
          .single(),
      );

      const after = await attemptsOf(db, shootout.id);
      const state = computeShootoutState(after, {
        openingAttempts: shootout.opening_attempts,
        suddenDeath: profile.config.penalties.suddenDeath,
      });

      const synced = await syncPenaltyScore(db, match.id, after);

      let currentShootout = shootout;
      let entries: LedgerRow[] = [];

      if (state.decided && state.winner && state.winner !== 'draw') {
        entries = await settleShootoutLedger(db, {
          shootout,
          matchId: match.id,
          challenge,
          profile,
          eventId,
          attempts: after,
          winner: state.winner,
          actorId: ctx.actor.id,
        });

        currentShootout = take<PenaltyShootoutRow>(
          await db
            .from('penalty_shootouts')
            .update({
              status: 'completed',
              winner: state.winner,
              completed_at: new Date().toISOString(),
            })
            .eq('id', shootout.id)
            .select('*')
            .single(),
        );

        await writeMatch(db, match.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
      } else if (state.inSuddenDeath && shootout.status === 'open') {
        currentShootout = take<PenaltyShootoutRow>(
          await db
            .from('penalty_shootouts')
            .update({ status: 'sudden_death' })
            .eq('id', shootout.id)
            .select('*')
            .single(),
        );
      }

      ctx.audit({
        action: 'shootout.attempt_recorded',
        entityType: 'penalty_attempt',
        entityId: attempt.id,
        after: {
          sequence: nextSequence,
          team_code: value.teamCode,
          scored: value.scored,
          decided: state.decided,
        },
      });

      return {
        attempt,
        shootout: currentShootout,
        match: synced.match,
        totals: synced.totals,
        decided: state.decided,
        entries,
      };
    },
  });
}

/**
 * Reverse a kick. If the shootout had already been settled, the tiebreak points
 * it wrote are reversed too and the shootout reopens — a wrongly-called kick
 * must never leave a trophy sitting in the wrong hands.
 */
export async function reversePenaltyAttempt(
  input: ReversePenaltyAttemptInput,
): Promise<ActionResult<ReversePenaltyAttemptResult>> {
  const parsed = parseInput(reversePenaltyAttemptSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ReversePenaltyAttemptResult>({
    type: 'shootout.attempt_reversed',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { attemptId: value.attemptId, reason: value.reason },
    async run(ctx) {
      const { db } = ctx;
      const original = required(
        take<PenaltyAttemptRow | null>(
          await db.from('penalty_attempts').select('*').eq('id', value.attemptId).maybeSingle(),
        ),
        'Penalty attempt not found.',
      );
      assertState(original.status === 'confirmed', 'This attempt is already reversed.');

      const shootout = await loadShootout(db, original.shootout_id);
      const { match, profile } = await loadMatchContext(db, shootout.match_id);

      const reversed = take<PenaltyAttemptRow>(
        await db
          .from('penalty_attempts')
          .update({ status: 'reversed' })
          .eq('id', original.id)
          .select('*')
          .single(),
      );

      const reversal = take<PenaltyAttemptRow>(
        await db
          .from('penalty_attempts')
          .insert({
            shootout_id: original.shootout_id,
            sequence: original.sequence,
            team_code: original.team_code,
            player_id: original.player_id,
            scored: original.scored,
            is_sudden_death: original.is_sudden_death,
            status: 'reversed',
            created_by: ctx.actor.id,
          })
          .select('*')
          .single(),
      );

      // Undo the settlement, if there was one.
      const settled = await ledgerRowsOfType(db, 'penalty_tiebreak_points', {
        matchId: match.id,
      });
      const reversedEntryIds = await reverseLedgerRows(db, settled, {
        reason: value.reason,
        actorId: ctx.actor.id,
      });

      const after = await attemptsOf(db, shootout.id);
      const state = computeShootoutState(after, {
        openingAttempts: shootout.opening_attempts,
        suddenDeath: profile.config.penalties.suddenDeath,
      });
      const synced = await syncPenaltyScore(db, match.id, after);

      const reopened = take<PenaltyShootoutRow>(
        await db
          .from('penalty_shootouts')
          .update({
            status: state.inSuddenDeath ? 'sudden_death' : 'open',
            winner: null,
            completed_at: null,
          })
          .eq('id', shootout.id)
          .select('*')
          .single(),
      );

      const restoredMatch =
        match.status === 'completed'
          ? await writeMatch(db, match.id, { status: 'penalties', completed_at: null })
          : synced.match;

      ctx.audit({
        action: 'shootout.attempt_reversed',
        entityType: 'penalty_attempt',
        entityId: original.id,
        before: { sequence: original.sequence, scored: original.scored },
        after: { status: 'reversed', reversed_entries: reversedEntryIds.length },
        reason: value.reason,
      });

      return {
        reversed,
        reversal,
        shootout: reopened,
        match: restoredMatch,
        totals: synced.totals,
        reversedEntryIds,
      };
    },
  });
}
