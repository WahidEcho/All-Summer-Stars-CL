'use client';

/**
 * The live event, in one object, kept fresh.
 *
 * Realtime here is a *notification*, not a data channel: a change on any table
 * simply tells the client "something moved", and the client re-reads the whole
 * snapshot. That costs one query but removes an entire category of bug — the
 * screen can never end up holding a goal without the ledger entries that goal
 * produced, because it never assembles state from a stream of fragments.
 *
 * The last confirmed snapshot is never cleared. A failed refetch sets `error`
 * and leaves the board exactly as it was.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Db } from '@/lib/event';
import { EVENT_SLUG } from '@/lib/event';
import {
  getEventSnapshot,
  SNAPSHOT_TABLES,
  type EventSnapshot,
} from '@/lib/data/snapshot';
import {
  registerConnectionRetry,
  reportConnectionHealthy,
  reportConnectionTrouble,
  reportDataConfirmed,
  useConnectionState,
  type ConnectionState,
} from '@/lib/hooks/connection';

/** Coalesce a burst of table changes into one refetch. */
const REFETCH_DEBOUNCE_MS = 120;

export interface UseEventSnapshotOptions {
  /** Server-rendered snapshot, shown immediately while the first fetch runs. */
  initial?: EventSnapshot | null;
  slug?: string;
  /** Pin a challenge instead of following the live one. */
  challengeId?: string;
  /** Pin a round instead of following the live one. */
  roundId?: string;
  /** Safety-net poll in ms. 0 disables it. Defaults to 30 seconds. */
  pollMs?: number;
  /** Set false to stand the subscription down (e.g. a hidden panel). */
  enabled?: boolean;
}

export interface UseEventSnapshotResult {
  /** The last confirmed snapshot. Never cleared by an error. */
  snapshot: EventSnapshot | null;
  /** True only until the first snapshot lands. */
  loading: boolean;
  /** The most recent failure, or null. The snapshot stays valid regardless. */
  error: string | null;
  /** True when what is on screen may be behind the server. */
  stale: boolean;
  /** When the snapshot on screen was fetched, in ms. */
  updatedAt: number | null;
  connection: ConnectionState;
  refresh: () => Promise<void>;
}

const FAILED_RETRY_MS = 2_500;
const API_TIMEOUT_MS = 12_000;

/**
 * Read the snapshot through /api/snapshot — one round trip, assembled in the
 * deployment's own region. Falls back to assembling it in the browser when the
 * route itself is unreachable, so the surface still works against a dev server
 * that predates the route, or when only the API layer is having a bad minute.
 */
async function fetchSnapshotViaApi(opts: {
  slug: string;
  challengeId?: string;
  roundId?: string;
}): Promise<EventSnapshot> {
  const params = new URLSearchParams({ event: opts.slug });
  if (opts.challengeId) params.set('challengeId', opts.challengeId);
  if (opts.roundId) params.set('roundId', opts.roundId);

  try {
    const controller = new AbortController();
    const cutoff = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
    const response = await fetch(`/api/snapshot?${params.toString()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    clearTimeout(cutoff);
    if (!response.ok) throw new Error(`snapshot API ${response.status}`);
    return (await response.json()) as EventSnapshot;
  } catch {
    const db = supabase() as unknown as Db;
    return getEventSnapshot(db, {
      slug: opts.slug,
      challengeId: opts.challengeId,
      roundId: opts.roundId,
    });
  }
}

export function useEventSnapshot(
  options: UseEventSnapshotOptions = {},
): UseEventSnapshotResult {
  const {
    initial = null,
    slug = EVENT_SLUG,
    challengeId,
    roundId,
    pollMs = 30_000,
    enabled = true,
  } = options;

  const [snapshot, setSnapshot] = useState<EventSnapshot | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState<string | null>(null);

  const connection = useConnectionState();
  /** Channel name, and the key this surface reports connection health under. */
  const source = `snapshot:${slug}`;

  const inFlight = useRef(false);
  const queued = useRef(false);
  const mounted = useRef(true);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchSnapshot = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    if (inFlight.current) {
      // A change landed while a read was already open; the loop below picks it
      // up rather than opening a second overlapping read.
      queued.current = true;
      return;
    }
    inFlight.current = true;

    try {
      do {
        queued.current = false;
        try {
          // One request, assembled server-side beside the database. Building
          // the snapshot in the browser meant a dozen Supabase calls per
          // refresh, and on a flaky venue connection one lost call threw the
          // whole refresh away — the wall then advanced scenes with data a
          // round behind. The old client-side assembly remains the fallback
          // so a hiccup in the API route cannot blind the surface either.
          const next = await fetchSnapshotViaApi({ slug, challengeId, roundId });
          if (!mounted.current) return;
          setSnapshot(next);
          setError(null);
          setLoading(false);
          reportDataConfirmed(next.fetchedAt);
          reportConnectionHealthy(source);
        } catch (cause) {
          if (!mounted.current) return;
          // Deliberately not clearing `snapshot`: a stale score beats no score.
          setError(
            cause instanceof Error ? cause.message : 'Could not reach the scoreboard.',
          );
          setLoading(false);
          reportConnectionTrouble(source);
          // A failed refresh retries on its own, quickly — waiting for the
          // 30-second poll is how a wall ends up a full round behind the show.
          if (retry.current) clearTimeout(retry.current);
          retry.current = setTimeout(() => {
            retry.current = null;
            void fetchSnapshot();
          }, FAILED_RETRY_MS);
        }
      } while (queued.current && mounted.current);
    } finally {
      inFlight.current = false;
    }
  }, [enabled, slug, challengeId, roundId, source]);

  const scheduleRefetch = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      debounce.current = null;
      void fetchSnapshot();
    }, REFETCH_DEBOUNCE_MS);
  }, [fetchSnapshot]);

  // First read, and re-read whenever the pinned challenge/round changes.
  useEffect(() => {
    mounted.current = true;
    void fetchSnapshot();
    return () => {
      mounted.current = false;
      if (debounce.current) clearTimeout(debounce.current);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [fetchSnapshot]);

  // One channel, every table that can invalidate the snapshot.
  useEffect(() => {
    if (!enabled) return;
    const client = supabase();
    let builder: RealtimeChannel = client.channel(source, {
      config: { broadcast: { self: false } },
    });

    for (const table of SNAPSHOT_TABLES) {
      builder = builder.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        scheduleRefetch,
      );
    }

    const channel = builder;
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        reportConnectionHealthy(source);
        // Anything that changed while the socket was down is picked up here.
        void fetchSnapshot();
      } else if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        reportConnectionTrouble(source);
      }
    });

    return () => {
      void client.removeChannel(channel);
      // Standing a channel down is not trouble — clear its report so an
      // unmounted panel cannot leave the whole app looking degraded.
      reportConnectionHealthy(source);
    };
  }, [enabled, source, scheduleRefetch, fetchSnapshot]);

  // Safety net: realtime can drop a message; a slow poll cannot.
  useEffect(() => {
    if (!enabled || pollMs <= 0) return;
    const id = setInterval(() => void fetchSnapshot(), pollMs);
    return () => clearInterval(id);
  }, [enabled, pollMs, fetchSnapshot]);

  // A tab that was backgrounded during a challenge comes back correct.
  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return;
    const onVisible = () => {
      if (document.visibilityState === 'visible') void fetchSnapshot();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, fetchSnapshot]);

  // Let a manual retry anywhere in the app refresh this surface too.
  useEffect(() => registerConnectionRetry(() => void fetchSnapshot()), [fetchSnapshot]);

  return {
    snapshot,
    loading,
    error,
    stale: snapshot !== null && (error !== null || connection.degraded),
    updatedAt: snapshot?.fetchedAt ?? null,
    connection,
    refresh: fetchSnapshot,
  };
}
