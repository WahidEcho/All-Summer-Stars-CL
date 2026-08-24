/**
 * Timer helpers shared by the timer commands and the match commands.
 *
 * Internal module: no 'use server' directive, never imported from client code.
 */

import { elapsedMs } from '@/lib/scoring/engine';
import { take, takeRows } from '@/lib/actions/_command';
import type { Db } from '@/lib/event';
import type { TimerRow } from '@/lib/types';

export interface TimerSpec {
  eventId: string;
  scope: 'round' | 'match' | 'attempt';
  roundId?: string | null;
  matchId?: string | null;
  segment?: number;
  mode: 'count_up' | 'count_down' | 'stopwatch';
  durationMs?: number | null;
  label?: string | null;
}

function snapshotOf(timer: TimerRow) {
  return {
    state: timer.state,
    mode: timer.mode,
    startedAtMs: timer.started_at ? Date.parse(timer.started_at) : null,
    accumulatedMs: Number(timer.accumulated_ms),
    durationMs: timer.duration_ms === null ? null : Number(timer.duration_ms),
  };
}

/** Milliseconds banked on the timer right now, including any running segment. */
export function bankedMs(timer: TimerRow, nowMs: number = Date.now()): number {
  return elapsedMs(snapshotOf(timer), nowMs);
}

/** Apply a patch and stamp `updated_at` — the table has no trigger for it. */
export async function writeTimer(
  db: Db,
  timerId: string,
  patch: Record<string, unknown>,
): Promise<TimerRow> {
  return take<TimerRow>(
    await db
      .from('timers')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', timerId)
      .select('*')
      .single(),
  );
}

/**
 * Find the timer for a scope, or create it. Timers have no natural unique key,
 * so the match is on scope + owner + segment; calling this repeatedly never
 * leaves two clocks attached to one round or one half.
 */
export async function ensureTimerRow(db: Db, spec: TimerSpec): Promise<TimerRow> {
  const segment = spec.segment ?? 1;

  let query = db
    .from('timers')
    .select('*')
    .eq('event_id', spec.eventId)
    .eq('scope', spec.scope)
    .eq('segment', segment);

  query = spec.roundId ? query.eq('round_id', spec.roundId) : query.is('round_id', null);
  query = spec.matchId ? query.eq('match_id', spec.matchId) : query.is('match_id', null);

  const existing = takeRows<TimerRow>(await query.order('updated_at', { ascending: false }));

  if (existing.length > 0) {
    const current = existing[0];
    const shapeChanged =
      current.mode !== spec.mode ||
      Number(current.duration_ms ?? -1) !== Number(spec.durationMs ?? -1);

    // Only re-shape a clock that has not run yet, so re-tuning the profile
    // mid-event can never move a half that is already on the board.
    if (shapeChanged && current.state === 'ready') {
      return writeTimer(db, current.id, {
        mode: spec.mode,
        duration_ms: spec.durationMs ?? null,
        label: spec.label ?? current.label,
      });
    }
    return current;
  }

  return take<TimerRow>(
    await db
      .from('timers')
      .insert({
        event_id: spec.eventId,
        round_id: spec.roundId ?? null,
        match_id: spec.matchId ?? null,
        scope: spec.scope,
        label: spec.label ?? null,
        segment,
        mode: spec.mode,
        duration_ms: spec.durationMs ?? null,
        state: 'ready',
        accumulated_ms: 0,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single(),
  );
}

export interface StartTimerOptions {
  /**
   * Milliseconds the clock should already read when it starts. The match clock
   * counts up across the whole game, so the second half is started at the time
   * the first half finished on rather than back at zero.
   */
  fromMs?: number;
  /**
   * Treat a paused clock as a resume instead of a restart, keeping the time it
   * had already banked. Without this, a second tap on "start half" after a
   * stoppage would wipe the minutes already played.
   */
  resume?: boolean;
}

/**
 * Start a clock. A clock already running is left alone.
 *
 * By default the clock starts from zero, which is what every per-round and
 * per-attempt timer wants. `fromMs` seeds it with time carried in from an
 * earlier segment, and `resume` protects a paused clock's banked time.
 */
export async function startTimerRow(
  db: Db,
  timer: TimerRow,
  opts: StartTimerOptions = {},
): Promise<TimerRow> {
  if (timer.state === 'running') return timer;

  const banked = Number(timer.accumulated_ms) || 0;
  const accumulated =
    opts.resume && timer.state === 'paused' && banked > 0 ? banked : opts.fromMs ?? 0;

  return writeTimer(db, timer.id, {
    state: 'running',
    started_at: new Date().toISOString(),
    accumulated_ms: accumulated,
    ended_at: null,
  });
}

/**
 * Time already played in the halves before `half`, so a count-up match clock
 * can carry it forward. Reads every timer attached to the match and banks the
 * segments that come earlier in the game.
 */
export async function bankedBeforeSegment(
  db: Db,
  matchId: string,
  segment: number,
  nowMs: number = Date.now(),
): Promise<number> {
  if (segment <= 1) return 0;
  const timers = await matchTimers(db, matchId);
  return timers
    .filter((t) => t.segment < segment)
    .reduce((total, t) => total + bankedMs(t, nowMs), 0);
}

/** Stop a clock for good, banking the final elapsed time. */
export async function endTimerRow(db: Db, timer: TimerRow): Promise<TimerRow> {
  if (timer.state === 'ended') return timer;
  const now = new Date();
  return writeTimer(db, timer.id, {
    state: 'ended',
    started_at: null,
    accumulated_ms: bankedMs(timer, now.getTime()),
    ended_at: now.toISOString(),
  });
}

/** Freeze a running clock without ending it. */
export async function pauseTimerRow(db: Db, timer: TimerRow): Promise<TimerRow> {
  if (timer.state !== 'running') return timer;
  return writeTimer(db, timer.id, {
    state: 'paused',
    started_at: null,
    accumulated_ms: bankedMs(timer),
  });
}

/** Every timer attached to a match, newest first. */
export async function matchTimers(db: Db, matchId: string): Promise<TimerRow[]> {
  return takeRows<TimerRow>(
    await db
      .from('timers')
      .select('*')
      .eq('match_id', matchId)
      .order('segment', { ascending: true }),
  );
}
