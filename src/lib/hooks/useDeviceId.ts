'use client';

/**
 * Device identity and command keys.
 *
 * Every mutating action carries an idempotency key so a double tap, a flaky
 * network retry or a page refresh mid-request cannot apply the same goal twice.
 * The key is generated on the client, at the moment the operator commits to the
 * action, and reused for every retry of that same intent.
 *
 * The device id is read through `useSyncExternalStore` so it hydrates cleanly:
 * the server renders `null`, and the real id appears on the client without a
 * mismatch and without a cascading effect render.
 */

import { useCallback, useSyncExternalStore } from 'react';

const DEVICE_ID_STORAGE_KEY = 'swanlake.deviceId';
const DEVICE_LABEL_STORAGE_KEY = 'swanlake.deviceLabel';

function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * A fresh idempotency key. Generate one per *intent*, not per attempt: retrying
 * a failed request with the same key is the whole point.
 */
export function newIdempotencyKey(prefix = 'cmd'): string {
  return `${prefix}-${randomId()}`;
}

// ---------------------------------------------------------------------------
// Device id
// ---------------------------------------------------------------------------

let cachedDeviceId: string | null = null;

/**
 * The id for this browser, creating and persisting one on first use.
 * Returns null on the server.
 */
export function readDeviceId(): string | null {
  if (typeof window === 'undefined') return null;
  if (cachedDeviceId) return cachedDeviceId;

  try {
    const stored = window.localStorage.getItem(DEVICE_ID_STORAGE_KEY);
    if (stored) {
      cachedDeviceId = stored;
      return stored;
    }
    const created = `dev-${randomId()}`;
    window.localStorage.setItem(DEVICE_ID_STORAGE_KEY, created);
    cachedDeviceId = created;
    return created;
  } catch {
    // Private browsing with storage disabled: fall back to a session-scoped id
    // so the lease still works — it just will not survive a refresh.
    cachedDeviceId = `dev-${randomId()}`;
    return cachedDeviceId;
  }
}

/** The device id never changes once assigned, so nothing ever needs notifying. */
function subscribeNever(): () => void {
  return () => {};
}

function serverDeviceId(): null {
  return null;
}

/**
 * A stable id for this browser, persisted in localStorage.
 *
 * `null` on the server and during hydration — treat it as "not ready yet"
 * rather than claiming a lease with a placeholder.
 */
export function useDeviceId(): string | null {
  return useSyncExternalStore(subscribeNever, readDeviceId, serverDeviceId);
}

// ---------------------------------------------------------------------------
// Device label
// ---------------------------------------------------------------------------

const labelListeners = new Set<() => void>();
let cachedLabel: string | null = null;
let labelRead = false;

function readLabel(): string | null {
  if (typeof window === 'undefined') return null;
  if (!labelRead) {
    labelRead = true;
    try {
      cachedLabel = window.localStorage.getItem(DEVICE_LABEL_STORAGE_KEY);
    } catch {
      cachedLabel = null;
    }
  }
  return cachedLabel;
}

function subscribeLabel(listener: () => void): () => void {
  labelListeners.add(listener);
  return () => {
    labelListeners.delete(listener);
  };
}

function serverLabel(): null {
  return null;
}

/** A human-readable name for this device, shown in the takeover dialog. */
export function useDeviceLabel(): [string | null, (label: string) => void] {
  const label = useSyncExternalStore(subscribeLabel, readLabel, serverLabel);

  const setLabel = useCallback((next: string) => {
    labelRead = true;
    cachedLabel = next;
    try {
      window.localStorage.setItem(DEVICE_LABEL_STORAGE_KEY, next);
    } catch {
      // The label is a convenience, not a requirement.
    }
    for (const listener of labelListeners) listener();
  }, []);

  return [label, setLabel];
}
