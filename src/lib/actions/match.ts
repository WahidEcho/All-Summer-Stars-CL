'use server';

/**
 * Final match commands — challenge 5.
 *
 * The scoreboard and the individual points ledger are deliberately separate
 * concerns here. `matches.score_a/score_b` is the football score; the ledger
 * decides who personally banked points, under whichever of the three
 * goal-points modes the admin picked before kick-off. Reversing a goal undoes
 * both, and neither is ever computed from anything the client sent.
 */

import {
  computeMatchScore,
  ledgerEntriesForGoal,
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
  ledgerRowsForSource,
  ledgerRowsOfType,
  reverseLedgerRows,
  teamPlayersFor,
} from '@/lib/actions/_ledger';
import { loadMatchContext, writeMatch } from '@/lib/actions/_match';
import {
  bankedBeforeSegment,
  endTimerRow,
  ensureTimerRow,
  pauseTimerRow,
  startTimerRow,
} from '@/lib/actions/_timers';
import {
  addGoalSchema,
  halfCommandSchema,
  matchCommandSchema,
  reverseGoalSchema,
  setGoalPointsModeSchema,
} from '@/lib/actions/schemas';
import type {
  ActionResult,
  AddGoalInput,
  AddGoalResult,
  EndMatchResult,
  HalfCommandInput,
  HalfResult,
  MatchCommandInput,
  ReverseGoalInput,
  ReverseGoalResult,
  SetGoalPointsModeInput,
} from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type {
  FinalMatchConfig,
  GoalRow,
  MatchRow,
  TimerRow,
} from '@/lib/types';

/** Recompute the football score from confirmed goals only. */
async function syncMatchScore(db: Db, matchId: string) {
  const goals = takeRows<GoalRow>(
    await db.from('goals').select('*').eq('match_id', matchId),
  );
  const totals = computeMatchScore(goals);
  const match = await writeMatch(db, matchId, {
    score_a: totals.scoreA,
    score_b: totals.scoreB,
  });
  return { totals, match, goals };
}

function finalMatchConfig(config: unknown): FinalMatchConfig {
  const c = config as FinalMatchConfig;
  return {
    mechanic: 'final_match',
    halves: c?.halves ?? 2,
    halfDurationMs: c?.halfDurationMs ?? 1_200_000,
  };
}

/**
 * Record a goal and everything that follows from it: the running score, and the
 * individual ledger entries the active goal-points mode produces.
 *
 * The mode is read from the match row, not from the request, so a device with a
 * stale settings screen cannot award points under the wrong model.
 */
export async function addGoal(input: AddGoalInput): Promise<ActionResult<AddGoalResult>> {
  const parsed = parseInput(addGoalSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<AddGoalResult>({
    type: 'match.goal_added',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: {
      matchId: value.matchId,
      teamCode: value.teamCode,
      scorerId: value.scorerId,
      isOwnGoal: value.isOwnGoal ?? false,
      clockMs: value.clockMs,
      half: value.half,
    },
    async run(ctx) {
      const { db } = ctx;
      const { match, challenge, profile, eventId } = await loadMatchContext(db, value.matchId);

      assertState(
        match.status !== 'completed',
        'The match is over. Reopen it before recording another goal.',
        'locked',
      );

      const isOwnGoal = value.isOwnGoal ?? false;

      const goal = take<GoalRow>(
        await db
          .from('goals')
          .insert({
            match_id: match.id,
            team_code: value.teamCode,
            scorer_id: isOwnGoal ? null : value.scorerId,
            is_own_goal: isOwnGoal,
            own_goal_by_player_id: isOwnGoal
              ? value.ownGoalByPlayerId ?? value.scorerId ?? null
              : null,
            method: value.method ?? (isOwnGoal ? 'own_goal' : 'open_play'),
            clock_ms: value.clockMs,
            half: value.half,
            status: 'confirmed',
            created_by: ctx.actor.id,
          })
          .select('*')
          .single(),
      );

      const synced = await syncMatchScore(db, match.id);

      // An own goal only produces individual points when the profile says the
      // benefiting team should be credited for it.
      const creditsPlayers = !isOwnGoal || profile.config.match.ownGoal.creditBenefitingTeam;

      let entries: PendingLedgerEntry[] = [];
      if (creditsPlayers) {
        const scoringTeamPlayers = await teamPlayersFor(db, {
          eventId,
          teamCode: value.teamCode,
          challengeId: challenge.id,
        });

        entries = ledgerEntriesForGoal({
          mode: match.goal_points_mode,
          config: profile.config.match,
          scoringTeamPlayers,
          scorerId: isOwnGoal ? null : value.scorerId,
          isOwnGoal,
          goalId: goal.id,
        });
      }

      const written = await insertLedgerEntries(db, entries, {
        eventId,
        challengeId: challenge.id,
        matchId: match.id,
        profileVersion: profile.version,
        actorId: ctx.actor.id,
      });

      ctx.audit({
        action: 'match.goal_added',
        entityType: 'goal',
        entityId: goal.id,
        after: {
          team_code: value.teamCode,
          scorer_id: value.scorerId,
          is_own_goal: isOwnGoal,
          mode: match.goal_points_mode,
          ledger_entries: written.length,
        },
      });

      return { goal, match: synced.match, totals: synced.totals, entries: written };
    },
  });
}

/**
 * Reverse a goal. The original goal and every ledger entry it created are
 * flipped to `reversed` and mirrored — the scoreboard falls back by one and the
 * players who were credited lose exactly the points that goal gave them.
 */
export async function reverseGoal(
  input: ReverseGoalInput,
): Promise<ActionResult<ReverseGoalResult>> {
  const parsed = parseInput(reverseGoalSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<ReverseGoalResult>({
    type: 'match.goal_reversed',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { goalId: value.goalId, reason: value.reason },
    async run(ctx) {
      const { db } = ctx;
      const original = required(
        take<GoalRow | null>(
          await db.from('goals').select('*').eq('id', value.goalId).maybeSingle(),
        ),
        'Goal not found.',
      );
      assertState(original.status === 'confirmed', 'This goal is already reversed.');

      const reversed = take<GoalRow>(
        await db
          .from('goals')
          .update({ status: 'reversed' })
          .eq('id', original.id)
          .select('*')
          .single(),
      );

      const reversal = take<GoalRow>(
        await db
          .from('goals')
          .insert({
            match_id: original.match_id,
            team_code: original.team_code,
            scorer_id: original.scorer_id,
            is_own_goal: original.is_own_goal,
            own_goal_by_player_id: original.own_goal_by_player_id,
            method: original.method,
            clock_ms: original.clock_ms,
            half: original.half,
            status: 'reversed',
            reverses_id: original.id,
            created_by: ctx.actor.id,
          })
          .select('*')
          .single(),
      );

      const ledgerRows = await ledgerRowsForSource(db, original.id);
      const reversedEntryIds = await reverseLedgerRows(db, ledgerRows, {
        reason: value.reason,
        actorId: ctx.actor.id,
      });

      const synced = await syncMatchScore(db, original.match_id);

      ctx.audit({
        action: 'match.goal_reversed',
        entityType: 'goal',
        entityId: original.id,
        before: { team_code: original.team_code, status: 'confirmed' },
        after: { status: 'reversed', reversed_entries: reversedEntryIds.length },
        reason: value.reason,
      });

      return {
        reversed,
        reversal,
        match: synced.match,
        totals: synced.totals,
        reversedEntryIds,
      };
    },
  });
}

/**
 * Choose how goals convert into individual points. Locked once the match is
 * live: changing the model mid-match would make the points already awarded
 * incomparable with the ones still to come.
 */
export async function setGoalPointsMode(
  input: SetGoalPointsModeInput,
): Promise<ActionResult<MatchRow>> {
  const parsed = parseInput(setGoalPointsModeSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<MatchRow>({
    type: 'match.goal_points_mode_set',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { matchId: value.matchId, mode: value.mode },
    capability: 'admin',
    async run(ctx) {
      const { db } = ctx;
      const { match } = await loadMatchContext(db, value.matchId);

      assertState(
        match.status === 'pending' || match.status === 'ready',
        'The match has already kicked off. The goal-points model is locked for the rest of it.',
        'locked',
      );

      const updated = await writeMatch(db, match.id, { goal_points_mode: value.mode });

      ctx.audit({
        action: 'match.goal_points_mode_set',
        entityType: 'match',
        entityId: match.id,
        before: { goal_points_mode: match.goal_points_mode },
        after: { goal_points_mode: value.mode },
      });

      return updated;
    },
  });
}

/** Kick off a half: the match goes live and its clock starts from zero. */
export async function startHalf(input: HalfCommandInput): Promise<ActionResult<HalfResult>> {
  const parsed = parseInput(halfCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<HalfResult>({
    type: 'match.half_started',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { matchId: value.matchId, half: value.half },
    async run(ctx) {
      const { db } = ctx;
      const { match, challenge, profile, eventId } = await loadMatchContext(db, value.matchId);

      assertState(
        match.status !== 'completed',
        'The match is over.',
        'locked',
      );

      const config = finalMatchConfig(profile.config.challenges['5']);
      // One extra segment exists beyond the regulation halves: golden goal.
      // It opens only from the golden_goal state a level full-time result
      // produces, and it has no duration — the next goal ends it, not a clock.
      const goldenGoalSegment = config.halves + 1;
      const isGoldenGoal = value.half === goldenGoalSegment;
      assertState(
        value.half <= config.halves ||
          (isGoldenGoal && match.status === 'golden_goal'),
        isGoldenGoal
          ? 'Golden goal opens only when the match is level at full time.'
          : `This match has ${config.halves} halves.`,
        'invalid_input',
      );

      // The match clock counts up across the whole game — the second half
      // starts where the first ended, exactly as the rules describe. Golden
      // goal keeps counting from full time, open-ended.
      const timer = await ensureTimerRow(db, {
        eventId,
        scope: 'match',
        matchId: match.id,
        segment: value.half,
        mode: 'count_up',
        durationMs: isGoldenGoal ? null : config.halfDurationMs * value.half,
        label: isGoldenGoal ? 'Golden goal' : `Half ${value.half}`,
      });

      // 00:00→20:00, halftime, then 20:00→40:00. The second half is a separate
      // timer row, so it has to be seeded with the time the first half banked
      // or the board would drop back to zero after the interval. `resume`
      // protects a half that was paused mid-play from being wound back by a
      // second tap on the start button.
      const carryMs = await bankedBeforeSegment(db, match.id, value.half);
      const running = await startTimerRow(db, timer, { fromMs: carryMs, resume: true });

      if (challenge.status !== 'live') {
        await db.from('challenges').update({ status: 'live' }).eq('id', challenge.id);
      }

      // Golden goal keeps its own status while its clock runs — the surfaces
      // read `golden_goal` to say NEXT GOAL WINS rather than plain LIVE.
      const updated = await writeMatch(db, match.id, {
        status: isGoldenGoal ? 'golden_goal' : 'live',
        current_half: value.half,
      });

      ctx.audit({
        action: 'match.half_started',
        entityType: 'match',
        entityId: match.id,
        before: { status: match.status, current_half: match.current_half },
        after: { status: 'live', current_half: value.half, timer_id: running.id },
      });

      return { match: updated, timer: running };
    },
  });
}

/**
 * Blow the whistle on a half. The interval goes to `halftime`; the last half
 * leaves the match awaiting its official result.
 */
export async function endHalf(input: HalfCommandInput): Promise<ActionResult<HalfResult>> {
  const parsed = parseInput(halfCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<HalfResult>({
    type: 'match.half_ended',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { matchId: value.matchId, half: value.half },
    async run(ctx) {
      const { db } = ctx;
      const { match, profile, eventId } = await loadMatchContext(db, value.matchId);
      const config = finalMatchConfig(profile.config.challenges['5']);

      const timer = await ensureTimerRow(db, {
        eventId,
        scope: 'match',
        matchId: match.id,
        segment: value.half,
        mode: 'count_up',
        durationMs: config.halfDurationMs * value.half,
        label: `Half ${value.half}`,
      });

      const isLastHalf = value.half >= config.halves;
      const stopped: TimerRow = isLastHalf
        ? await endTimerRow(db, timer)
        : await pauseTimerRow(db, timer);

      const updated = await writeMatch(db, match.id, {
        status: isLastHalf ? 'awaiting_result' : 'halftime',
      });

      ctx.audit({
        action: 'match.half_ended',
        entityType: 'match',
        entityId: match.id,
        before: { status: match.status },
        after: { status: updated.status, half: value.half },
      });

      return { match: updated, timer: stopped };
    },
  });
}

/**
 * Settle the match. The regular result comes from the confirmed goals; the win
 * bonus, if the profile defines one, goes to every player of the winning side
 * exactly once. A draw leaves the match awaiting a shootout rather than
 * inventing a winner.
 */
export async function endMatch(
  input: MatchCommandInput,
): Promise<ActionResult<EndMatchResult>> {
  const parsed = parseInput(matchCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<EndMatchResult>({
    type: 'match.ended',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { matchId: value.matchId },
    async run(ctx) {
      const { db } = ctx;
      const { match, challenge, profile, eventId } = await loadMatchContext(db, value.matchId);

      const synced = await syncMatchScore(db, match.id);
      const totals = synced.totals;

      // Level at full time: the day format sends the match to a rest and then
      // golden goal — the match itself always finds a winner. The shootout is
      // reserved for a 1–1 DAY, never for the match. With golden goal switched
      // off in the profile, the old drawn-match shootout path still applies.
      const goldenGoal = profile.config.day?.goldenGoal ?? false;
      if (totals.winner === 'draw' && goldenGoal) {
        const updated = await writeMatch(db, match.id, {
          status: 'golden_goal',
          current_half: 3,
          revision: Number(match.revision) + 1,
        });
        ctx.audit({
          action: 'match.golden_goal',
          entityType: 'match',
          entityId: match.id,
          after: { score_a: totals.scoreA, score_b: totals.scoreB },
          reason: 'level at full time — rest, then next goal wins',
        });
        return { match: updated, totals, entries: [], requiresShootout: false };
      }

      const penaltiesEnabled = profile.config.penalties.enabledFor !== 'disabled';
      const requiresShootout = totals.winner === 'draw' && penaltiesEnabled;

      // The win bonus is written once per match, guarded by the ledger itself
      // so a replayed command cannot double it.
      const existing = await ledgerRowsOfType(db, 'match_win_bonus', { matchId: match.id });
      let entries = existing;

      const winBonus = profile.config.match.winBonus;
      if (
        existing.length === 0 &&
        winBonus !== 0 &&
        totals.winner !== 'draw'
      ) {
        const winners = await teamPlayersFor(db, {
          eventId,
          teamCode: totals.winner,
          challengeId: challenge.id,
        });
        entries = await insertLedgerEntries(
          db,
          winners.map((player) => ({
            playerId: player.id,
            teamId: player.team_id,
            entryType: 'match_win_bonus' as const,
            points: winBonus,
            sourceRef: match.id,
          })),
          {
            eventId,
            challengeId: challenge.id,
            matchId: match.id,
            profileVersion: profile.version,
            actorId: ctx.actor.id,
          },
        );
      }

      const now = new Date().toISOString();
      const updated = await writeMatch(db, match.id, {
        winner: totals.winner,
        status: requiresShootout ? 'awaiting_result' : 'completed',
        published_at: now,
        completed_at: requiresShootout ? null : now,
        revision: Number(match.revision) + 1,
      });

      ctx.audit({
        action: 'match.ended',
        entityType: 'match',
        entityId: match.id,
        after: {
          score_a: totals.scoreA,
          score_b: totals.scoreB,
          winner: totals.winner,
          requires_shootout: requiresShootout,
          win_bonus_entries: entries.length,
        },
      });

      return { match: updated, totals, entries, requiresShootout };
    },
  });
}

/**
 * Reopen a completed match so a contested goal can be corrected. The win bonus
 * it wrote is reversed; goal points stay with their goals until those goals are
 * themselves reversed.
 */
export async function reopenMatch(
  input: MatchCommandInput,
): Promise<ActionResult<MatchRow>> {
  const parsed = parseInput(matchCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<MatchRow>({
    type: 'match.reopened',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { matchId: value.matchId },
    capability: 'admin',
    async run(ctx) {
      const { db } = ctx;
      const { match } = await loadMatchContext(db, value.matchId);

      const bonus = await ledgerRowsOfType(db, 'match_win_bonus', { matchId: match.id });
      const reversedIds = await reverseLedgerRows(db, bonus, {
        reason: 'Match reopened.',
        actorId: ctx.actor.id,
      });

      const updated = await writeMatch(db, match.id, {
        status: 'awaiting_result',
        winner: null,
        published_at: null,
        completed_at: null,
        revision: Number(match.revision) + 1,
      });

      ctx.audit({
        action: 'match.reopened',
        entityType: 'match',
        entityId: match.id,
        before: { status: match.status, winner: match.winner },
        after: { status: 'awaiting_result', reversed_entries: reversedIds.length },
      });

      return updated;
    },
  });
}
