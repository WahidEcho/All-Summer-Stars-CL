'use client';

/**
 * A smoothly ticking clock derived from a server anchor.
 *
 * The database never stores a ticking number. It stores *when* the clock
 * started and how much time was banked before that, and every screen derives
 * the visible value locally with `elapsedMs`/`displayMs` from the scoring
 * engine. That is why the wall display, the presenter's tablet and a phone in
 * the crowd all show the same 12:04 without anyone pushing sixty updates a
 * second down a socket.
 *
 * Two details matter for a live event:
 *
 * 1. The loop is `requestAnimationFrame`, so a backgrounded tab stops burning
 *    battery and catches up correctly when it returns.
 * 2. The client's own clock is not trusted. Whenever a timer row *changes while
 *    we are watching*, the difference between our clock and the row's
 *    `updated_at` is a direct measurement of the skew, and it is applied to
 *    every subsequent frame.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  displayMs as displayMsOf,
  elapsedMs as elapsedMsOf,
  formatClock,
  hasExpired,
  type TimerSnapshot,
} from '@/lib/scoring/engine';
import type { TimerMode, TimerRow, TimerState } from '@/lib/types';

export interface UseTimerOptions {
  /** Show tenths — the right call for challenges 2 and 4, wrong for a half. */
  tenths?: boolean;
  /**
   * Override the measured clock skew, in ms (`serverNow - clientNow`). Leave
   * unset to use the value this hook measures for itself.
   */
  skewMs?: number;
  /** How often the rendered value refreshes. Defaults to 100ms (50ms with tenths). */
  updateIntervalMs?: number;
  /** Fired once, when a count-down timer reaches zero. */
  onExpire?: () => void;
}

export interface TimerReading {
  timer: TimerRow | null;
  state: TimerState;
  mode: TimerMode;
  /** Time the clock has run. */
  elapsedMs: number;
  /** What to show: counts down for challenge 4, up for everything else. */
  displayMs: number;
  durationMs: number | null;
  running: boolean;
  expired: boolean;
  /** 0–1 against the configured duration; 0 when the timer is open-ended. */
  progress: number;
  /** `mm:ss`, or `mm:ss.d` when `tenths` is set. */
  clock: string;
  /** The clock-skew correction currently being applied, in ms. */
  skewMs: number;
}

function snapshotOf(timer: TimerRow | null | undefined): TimerSnapshot {
  if (!timer) {
    return {
      state: 'ready',
      mode: 'count_up',
      startedAtMs: null,
      accumulatedMs: 0,
      durationMs: null,
    };
  }
  return {
    state: timer.state,
    mode: timer.mode,
    startedAtMs: timer.started_at ? Date.parse(timer.started_at) : null,
    accumulatedMs: Number(timer.accumulated_ms),
    durationMs: timer.duration_ms === null ? null : Number(timer.duration_ms),
  };
}

function readingFrom(
  timer: TimerRow | null,
  snapshot: TimerSnapshot,
  nowMs: number,
  tenths: boolean,
  skewMs: number,
): TimerReading {
  const elapsed = elapsedMsOf(snapshot, nowMs);
  const display = displayMsOf(snapshot, nowMs);
  const duration = snapshot.durationMs;

  return {
    timer,
    state: snapshot.state,
    mode: snapshot.mode,
    elapsedMs: elapsed,
    displayMs: display,
    durationMs: duration,
    running: snapshot.state === 'running',
    expired: hasExpired(snapshot, nowMs),
    progress: duration && duration > 0 ? Math.min(1, elapsed / duration) : 0,
    clock: formatClock(display, { tenths }),
    skewMs,
  };
}

export function useTimer(
  timer: TimerRow | null | undefined,
  options: UseTimerOptions = {},
): TimerReading {
  const { tenths = false, skewMs: skewOverride, onExpire } = options;
  const step = options.updateIntervalMs ?? (tenths ? 50 : 100);

  const row = timer ?? null;
  const snapshot = useMemo(
    () => snapshotOf(row),
    // The row is a fresh object on every realtime push, so depend on the
    // fields that actually change the maths rather than on identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [row?.id, row?.state, row?.mode, row?.started_at, row?.accumulated_ms, row?.duration_ms],
  );

  // --- clock skew ---------------------------------------------------------
  const rowUpdatedAt = row?.updated_at ?? null;
  const [measuredSkew, setMeasuredSkew] = useState(0);
  const seenUpdatedAt = useRef<string | null>(null);

  useEffect(() => {
    const previous = seenUpdatedAt.current;
    seenUpdatedAt.current = rowUpdatedAt;
    if (previous === null || rowUpdatedAt === null || previous === rowUpdatedAt) return;

    // The first row we see may be minutes old — a page opened mid-half — so it
    // says nothing about skew. A row that *changes* while we are watching
    // arrived over realtime moments ago, so the gap between its `updated_at`
    // and this device's clock is a direct measurement of how wrong that clock
    // is. Measuring it requires reading the wall clock at the moment the change
    // lands, which is exactly what an effect is for.
    const written = Date.parse(rowUpdatedAt);
    if (Number.isNaN(written)) return;
    const skew = Math.round(written - Date.now());
    // An external measurement taken as the change arrives; there is no
    // render-time value to derive it from.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMeasuredSkew(skew);
  }, [rowUpdatedAt]);

  const skewMs = skewOverride ?? measuredSkew;

  // --- the tick ------------------------------------------------------------
  // `nowMs` is the raw client clock; the skew correction is applied at read
  // time, so a change in skew never has to restart the animation loop.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const frame = useRef<number | null>(null);
  const lastPublished = useRef(0);

  useEffect(() => {
    // A stopped clock is a pure function of its row — `elapsedMs` ignores the
    // wall clock entirely unless the timer is running — so there is nothing to
    // animate and nothing to re-render.
    if (snapshot.state !== 'running') return;

    let cancelled = false;
    const loop = () => {
      if (cancelled) return;
      const now = Date.now();
      // Throttle the state write, not the frame: the loop stays smooth while
      // React re-renders ten times a second instead of sixty.
      if (now - lastPublished.current >= step) {
        lastPublished.current = now;
        setNowMs(now);
      }
      frame.current = requestAnimationFrame(loop);
    };

    lastPublished.current = 0;
    frame.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [snapshot, step]);

  const reading = readingFrom(row, snapshot, nowMs + skewMs, tenths, skewMs);

  // --- expiry --------------------------------------------------------------
  // Keyed on the timer's anchor, so restarting a clock arms the callback again
  // but a re-render while already expired does not fire it twice.
  const expiryKey = row
    ? `${row.id}:${row.started_at ?? ''}:${row.accumulated_ms}:${row.duration_ms ?? ''}`
    : null;
  const firedKey = useRef<string | null>(null);
  const expireCallback = useRef(onExpire);

  useEffect(() => {
    expireCallback.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    if (!reading.expired || snapshot.durationMs === null) return;
    if (firedKey.current === expiryKey) return;
    firedKey.current = expiryKey;
    expireCallback.current?.();
  }, [reading.expired, snapshot.durationMs, expiryKey]);

  return reading;
}

/**
 * Read a timer once, without subscribing to a frame loop. Useful for a recap
 * screen or a printed result, where the clock is history rather than news.
 */
export function readTimer(
  timer: TimerRow | null | undefined,
  opts: { tenths?: boolean; nowMs?: number } = {},
): TimerReading {
  const snapshot = snapshotOf(timer);
  return readingFrom(
    timer ?? null,
    snapshot,
    opts.nowMs ?? Date.now(),
    opts.tenths ?? false,
    0,
  );
}

/**
 * Pick the timer a display should be showing: a running clock always wins,
 * then the most recently touched paused one.
 */
export function pickTimer(timers: TimerRow[], segment?: number): TimerRow | null {
  const pool = segment === undefined ? timers : timers.filter((t) => t.segment === segment);
  return (
    pool.find((t) => t.state === 'running') ??
    pool.find((t) => t.state === 'paused') ??
    pool[pool.length - 1] ??
    null
  );
}
