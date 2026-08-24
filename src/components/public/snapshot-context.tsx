'use client';

/**
 * One live subscription for the whole public site.
 *
 * Every public page reads the same `EventSnapshot`, so opening one realtime
 * channel in the shell and handing it down through context means a spectator
 * moving between the live view and the standings never opens a second socket
 * and never sees the two disagree.
 *
 * The server render seeds `initial`, so the first paint already carries the
 * real scores; the hook then keeps them fresh and — critically — never clears
 * them when the connection drops.
 */

import { createContext, useContext, type ReactNode } from 'react';

import { useEventSnapshot, type UseEventSnapshotResult } from '@/lib/hooks';
import type { EventSnapshot } from '@/lib/data/snapshot';

const LiveEventContext = createContext<UseEventSnapshotResult | null>(null);

export interface SnapshotProviderProps {
  /** Server-rendered snapshot. Null when the event could not be read. */
  initial: EventSnapshot | null;
  children: ReactNode;
}

export function SnapshotProvider({ initial, children }: SnapshotProviderProps) {
  const live = useEventSnapshot({ initial });
  return <LiveEventContext.Provider value={live}>{children}</LiveEventContext.Provider>;
}

/** The full live result: snapshot, loading, error, staleness, connection. */
export function useLiveEvent(): UseEventSnapshotResult {
  const value = useContext(LiveEventContext);
  if (!value) {
    throw new Error('useLiveEvent must be used inside <SnapshotProvider>.');
  }
  return value;
}

/** Just the snapshot. Null only before the very first read succeeds. */
export function useSnapshot(): EventSnapshot | null {
  return useLiveEvent().snapshot;
}
