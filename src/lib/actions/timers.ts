'use server';

/**
 * Server-anchored timer commands.
 *
 * A timer row is an anchor, not a ticking value: it stores the wall-clock
 * moment the clock started plus the milliseconds banked before that. Every
 * display derives the visible number locally with `elapsedMs`/`displayMs` from
 * the scoring engine, so ten screens stay in sync without anything pushing one
 * number sixty times a second.
 */

import {
  assertState,
  parseInput,
  required,
  runCommand,
  take,
} from '@/lib/actions/_command';
import {
  bankedMs,
  ensureTimerRow,
  startTimerRow,
  writeTimer,
} from '@/lib/actions/_timers';
import { ensureTimerSchema, timerCommandSchema } from '@/lib/actions/schemas';
import type {
  ActionResult,
  EnsureTimerInput,
  TimerCommandInput,
} from '@/lib/actions/types';
import type { Db } from '@/lib/event';
import type { TimerRow } from '@/lib/types';

async function loadTimer(db: Db, timerId: string): Promise<TimerRow> {
  return required(
    take<TimerRow | null>(await db.from('timers').select('*').eq('id', timerId).maybeSingle()),
    'Timer not found.',
  );
}

/** Find or create the timer for a scope. Safe to call before every start. */
export async function ensureTimer(
  input: EnsureTimerInput,
): Promise<ActionResult<TimerRow>> {
  const parsed = parseInput(ensureTimerSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<TimerRow>({
    type: 'timer.ensured',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: {
      scope: value.scope,
      roundId: value.roundId ?? null,
      matchId: value.matchId ?? null,
      segment: value.segment ?? 1,
      mode: value.mode,
    },
    async run(ctx) {
      const timer = await ensureTimerRow(ctx.db, {
        eventId: ctx.eventId,
        scope: value.scope,
        roundId: value.roundId ?? null,
        matchId: value.matchId ?? null,
        segment: value.segment ?? 1,
        mode: value.mode,
        durationMs: value.durationMs ?? null,
        label: value.label ?? null,
      });

      ctx.audit({
        action: 'timer.ensured',
        entityType: 'timer',
        entityId: timer.id,
        after: { scope: value.scope, mode: value.mode, segment: value.segment ?? 1 },
      });

      return timer;
    },
  });
}

/** Start a clock from zero. Restarting a finished clock clears its history. */
export async function startTimer(input: TimerCommandInput): Promise<ActionResult<TimerRow>> {
  const parsed = parseInput(timerCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<TimerRow>({
    type: 'timer.started',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { timerId: value.timerId },
    async run(ctx) {
      const timer = await loadTimer(ctx.db, value.timerId);
      // Starting an already-running clock is a no-op, not an error: the second
      // tap of an anxious operator must never restart the half.
      if (timer.state === 'running') return timer;

      const updated = await startTimerRow(ctx.db, timer);

      ctx.audit({
        action: 'timer.started',
        entityType: 'timer',
        entityId: timer.id,
        before: { state: timer.state },
        after: { state: 'running' },
      });

      return updated;
    },
  });
}

/** Freeze a running clock, banking the elapsed milliseconds. */
export async function pauseTimer(input: TimerCommandInput): Promise<ActionResult<TimerRow>> {
  const parsed = parseInput(timerCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<TimerRow>({
    type: 'timer.paused',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { timerId: value.timerId },
    async run(ctx) {
      const timer = await loadTimer(ctx.db, value.timerId);
      if (timer.state !== 'running') return timer;

      const banked = bankedMs(timer);
      const updated = await writeTimer(ctx.db, timer.id, {
        state: 'paused',
        started_at: null,
        accumulated_ms: banked,
      });

      ctx.audit({
        action: 'timer.paused',
        entityType: 'timer',
        entityId: timer.id,
        after: { accumulated_ms: banked },
      });

      return updated;
    },
  });
}

/** Resume a paused clock from exactly where it stopped. */
export async function resumeTimer(input: TimerCommandInput): Promise<ActionResult<TimerRow>> {
  const parsed = parseInput(timerCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<TimerRow>({
    type: 'timer.resumed',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { timerId: value.timerId },
    async run(ctx) {
      const timer = await loadTimer(ctx.db, value.timerId);
      if (timer.state === 'running') return timer;
      assertState(timer.state !== 'ended', 'This clock has ended. Reset it to run it again.');

      const updated = await writeTimer(ctx.db, timer.id, {
        state: 'running',
        started_at: new Date().toISOString(),
        ended_at: null,
      });

      ctx.audit({
        action: 'timer.resumed',
        entityType: 'timer',
        entityId: timer.id,
        before: { state: timer.state },
        after: { state: 'running' },
      });

      return updated;
    },
  });
}

/** Return a clock to zero and `ready`. */
export async function resetTimer(input: TimerCommandInput): Promise<ActionResult<TimerRow>> {
  const parsed = parseInput(timerCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<TimerRow>({
    type: 'timer.reset',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { timerId: value.timerId },
    async run(ctx) {
      const timer = await loadTimer(ctx.db, value.timerId);
      const updated = await writeTimer(ctx.db, timer.id, {
        state: 'ready',
        started_at: null,
        accumulated_ms: 0,
        ended_at: null,
      });

      ctx.audit({
        action: 'timer.reset',
        entityType: 'timer',
        entityId: timer.id,
        before: { state: timer.state, accumulated_ms: timer.accumulated_ms },
        after: { state: 'ready', accumulated_ms: 0 },
      });

      return updated;
    },
  });
}

/** Stop a clock for good, banking the final elapsed time. */
export async function endTimer(input: TimerCommandInput): Promise<ActionResult<TimerRow>> {
  const parsed = parseInput(timerCommandSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<TimerRow>({
    type: 'timer.ended',
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { timerId: value.timerId },
    async run(ctx) {
      const timer = await loadTimer(ctx.db, value.timerId);
      if (timer.state === 'ended') return timer;

      const now = new Date();
      const banked = bankedMs(timer, now.getTime());
      const updated = await writeTimer(ctx.db, timer.id, {
        state: 'ended',
        started_at: null,
        accumulated_ms: banked,
        ended_at: now.toISOString(),
      });

      ctx.audit({
        action: 'timer.ended',
        entityType: 'timer',
        entityId: timer.id,
        after: { accumulated_ms: banked },
      });

      return updated;
    },
  });
}
