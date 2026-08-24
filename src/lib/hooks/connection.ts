'use client';

/**
 * Connection health, shared by every realtime surface.
 *
 * The rule this module exists to enforce: **never blank the board.** A tablet
 * that loses Wi-Fi for four seconds behind a marquee must keep showing the last
 * confirmed score, and must not shout about it. So trouble is tracked the
 * instant it happens but only *surfaced* after a grace period, and no consumer
 * of this module ever clears its data because of a connection state.
 *
 * Every hook reports into one store rather than opening its own probe, so the
 * scoring console and the TV output agree about whether the event is live.
 */

import { useCallback, useSyncExternalStore } from 'react';

export type ConnectionStatus = 'live' | 'reconnecting' | 'offline' | 'recovering';

export interface ConnectionState {
  /** What the operator should be told, after the grace period. */
  status: ConnectionStatus;
  /** The browser's own view of the network. */
  online: boolean;
  /** True whenever `status` is anything but `live`. */
  degraded: boolean;
  /** When trouble started, in ms — null while healthy. */
  troubleSince: number | null;
  /** When data was last confirmed from the server, in ms. */
  lastConfirmedAt: number | null;
  /** Retry every registered subscription immediately. */
  retry: () => void;
}

/** How long trouble must persist before the operator is told about it. */
export const CONNECTION_GRACE_MS = 5_000;
/** How long "recovering" stays on screen after service is restored. */
export const CONNECTION_RECOVERY_MS = 1_500;

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

const troubled = new Set<string>();
const retries = new Set<() => void>();
const listeners = new Set<() => void>();

let online = true;
let troubleSince: number | null = null;
let recoveringUntil = 0;
let lastConfirmedAt: number | null = null;
let graceTimer: ReturnType<typeof setTimeout> | null = null;
let windowBound = false;

function retryAll(): void {
  for (const fn of retries) {
    try {
      fn();
    } catch {
      // A failing retry is itself a symptom; the next report will catch it.
    }
  }
}

function computeStatus(now: number): ConnectionStatus {
  if (troubleSince !== null) {
    // Inside the grace window we deliberately keep saying "live": a two-second
    // blip is not news, and a flashing warning behind the presenter is.
    if (now - troubleSince < CONNECTION_GRACE_MS) return 'live';
    return online ? 'reconnecting' : 'offline';
  }
  if (now < recoveringUntil) return 'recovering';
  return 'live';
}

let cached: ConnectionState = {
  status: 'live',
  online: true,
  degraded: false,
  troubleSince: null,
  lastConfirmedAt: null,
  retry: retryAll,
};

const SERVER_STATE: ConnectionState = {
  status: 'live',
  online: true,
  degraded: false,
  troubleSince: null,
  lastConfirmedAt: null,
  retry: () => {},
};

function emit(): void {
  const now = Date.now();
  const status = computeStatus(now);

  const next: ConnectionState = {
    status,
    online,
    degraded: status !== 'live',
    troubleSince,
    lastConfirmedAt,
    retry: retryAll,
  };

  const unchanged =
    next.status === cached.status &&
    next.online === cached.online &&
    next.troubleSince === cached.troubleSince &&
    next.lastConfirmedAt === cached.lastConfirmedAt;

  if (!unchanged) {
    cached = next;
    for (const listener of listeners) listener();
  }

  scheduleReevaluation(now);
}

/** Re-emit when the grace or recovery window elapses, so status changes on time. */
function scheduleReevaluation(now: number): void {
  if (graceTimer) {
    clearTimeout(graceTimer);
    graceTimer = null;
  }
  let waitMs: number | null = null;

  if (troubleSince !== null) {
    const remaining = CONNECTION_GRACE_MS - (now - troubleSince);
    if (remaining > 0) waitMs = remaining;
  } else if (now < recoveringUntil) {
    waitMs = recoveringUntil - now;
  }

  if (waitMs !== null) {
    graceTimer = setTimeout(() => {
      graceTimer = null;
      emit();
    }, waitMs + 20);
  }
}

/** A subscription (a realtime channel, a fetch) is in trouble. */
export function reportConnectionTrouble(source: string): void {
  const wasHealthy = troubled.size === 0;
  troubled.add(source);
  if (wasHealthy) troubleSince = Date.now();
  emit();
}

/** A subscription is healthy again. */
export function reportConnectionHealthy(source: string): void {
  if (!troubled.delete(source)) {
    // Already healthy — still refresh the derived state in case a window
    // event changed `online` underneath us.
    emit();
    return;
  }
  if (troubled.size === 0) {
    const wasDegraded = troubleSince !== null &&
      Date.now() - troubleSince >= CONNECTION_GRACE_MS;
    troubleSince = null;
    // Only advertise a recovery if the operator was told there was a problem.
    if (wasDegraded) recoveringUntil = Date.now() + CONNECTION_RECOVERY_MS;
  }
  emit();
}

/** Fresh data arrived and was applied. */
export function reportDataConfirmed(at: number = Date.now()): void {
  lastConfirmedAt = at;
  emit();
}

/** Register a refetch so the operator's "retry" button can drive every surface. */
export function registerConnectionRetry(fn: () => void): () => void {
  retries.add(fn);
  return () => {
    retries.delete(fn);
  };
}

function bindWindow(): void {
  if (windowBound || typeof window === 'undefined') return;
  windowBound = true;
  online = navigator.onLine;

  window.addEventListener('online', () => {
    online = true;
    // Coming back from an outage is exactly when a refetch is worth the cost.
    retryAll();
    emit();
  });
  window.addEventListener('offline', () => {
    online = false;
    reportConnectionTrouble('navigator');
  });
}

function subscribe(listener: () => void): () => void {
  bindWindow();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): ConnectionState {
  return cached;
}

function getServerSnapshot(): ConnectionState {
  return SERVER_STATE;
}

/**
 * Connection state for the current surface.
 *
 * `status` is safe to render directly: it stays `live` through short blips and
 * only escalates once trouble has lasted about five seconds.
 */
export function useConnectionState(): ConnectionState {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/**
 * A stable pair of reporters for one named source. Realtime hooks call these
 * from their channel status callbacks.
 */
export function useConnectionReporter(source: string): {
  healthy: () => void;
  trouble: () => void;
  confirmed: (at?: number) => void;
} {
  const healthy = useCallback(() => reportConnectionHealthy(source), [source]);
  const trouble = useCallback(() => reportConnectionTrouble(source), [source]);
  const confirmed = useCallback((at?: number) => reportDataConfirmed(at), []);
  return { healthy, trouble, confirmed };
}
