'use client';

/**
 * The broadcast scene, live.
 *
 * The TV output subscribes to this alone: it is a single small row, so a scene
 * cut reaches the wall in one message instead of waiting on a full snapshot
 * re-read. The heavier data the scene needs comes from `useEventSnapshot` in
 * parallel.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
} from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Db } from '@/lib/event';
import { EVENT_SLUG } from '@/lib/event';
import { getDisplayState, getEventId } from '@/lib/data/queries';
import {
  registerConnectionRetry,
  reportConnectionHealthy,
  reportConnectionTrouble,
  reportDataConfirmed,
} from '@/lib/hooks/connection';
import type { DisplayScene, DisplayStateRow } from '@/lib/types';

export interface UseDisplayStateOptions {
  /** Server-rendered row, shown immediately. */
  initial?: DisplayStateRow | null;
  slug?: string;
  enabled?: boolean;
}

export interface UseDisplayStateResult {
  displayState: DisplayStateRow | null;
  /** What the room can see. */
  programScene: DisplayScene;
  programPayload: Record<string, unknown>;
  /** What the operator is lining up, if anything. */
  previewScene: DisplayScene | null;
  previewPayload: Record<string, unknown>;
  ceremonyPhase: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useDisplayState(
  options: UseDisplayStateOptions = {},
): UseDisplayStateResult {
  const { initial = null, slug = EVENT_SLUG, enabled = true } = options;

  const [row, setRow] = useState<DisplayStateRow | null>(initial);
  const [loading, setLoading] = useState(initial === null);
  const [error, setError] = useState<string | null>(null);

  /** Channel name, and the key this surface reports connection health under. */
  const source = `display:${slug}`;
  const mounted = useRef(true);
  /**
   * The resolved event id, for filtering pushed rows. The subscription hears
   * every display_state change in the database — the production wall and a
   * rehearsal wall share the table — and applying a foreign event's row put a
   * rehearsal scene, pinned to rounds production does not have, onto the real
   * wall. A push is only applied once it is known to belong to this event.
   */
  const eventIdRef = useRef<string | null>(null);

  const fetchRow = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    try {
      const db = supabase() as unknown as Db;
      const eventId = await getEventId(db, slug);
      eventIdRef.current = eventId;
      const next = await getDisplayState(db, eventId);
      if (!mounted.current) return;
      setRow(next);
      setError(null);
      setLoading(false);
      reportDataConfirmed();
      reportConnectionHealthy(source);
    } catch (cause) {
      if (!mounted.current) return;
      // The scene on the wall stays put; only the error surfaces.
      setError(cause instanceof Error ? cause.message : 'Could not read the display state.');
      setLoading(false);
      reportConnectionTrouble(source);
    }
  }, [enabled, slug, source]);

  useEffect(() => {
    mounted.current = true;
    // An async read: state lands after the await, not in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchRow();
    return () => {
      mounted.current = false;
    };
  }, [fetchRow]);

  useEffect(() => {
    if (!enabled) return;
    const client = supabase();
    const channel: RealtimeChannel = client.channel(source);

    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'display_state' },
      (payload: RealtimePostgresChangesPayload<DisplayStateRow>) => {
        const raw = payload.new as Partial<DisplayStateRow> | undefined;
        const own = eventIdRef.current;
        // Another event's cut is not our business — not even worth a refetch.
        if (raw?.event_id && own && raw.event_id !== own) return;
        // Apply an own-event push straight away — a scene cut cannot wait for
        // a round trip — then let the next read reconcile anything odd.
        if (raw && raw.id && raw.event_id && raw.event_id === own) {
          const next = raw as DisplayStateRow;
          setRow((current) =>
            current && Number(next.revision) < Number(current.revision) ? current : next,
          );
          setLoading(false);
          reportDataConfirmed();
        } else {
          // Truncated payload, or our event id is not resolved yet: read
          // through instead of guessing.
          void fetchRow();
        }
      },
    );

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        reportConnectionHealthy(source);
        void fetchRow();
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
      reportConnectionHealthy(source);
    };
  }, [enabled, source, fetchRow]);

  useEffect(() => registerConnectionRetry(() => void fetchRow()), [fetchRow]);

  // Safety-net poll. The scene cut is the one message the wall must never
  // miss, and a websocket can die without an error event. Four seconds matches
  // the snapshot's own poll: an operator who cuts and sees nothing for fifteen
  // seconds concludes the console is broken and starts mashing, so the ceiling
  // on cut latency has to sit inside their patience. It is one tiny row.
  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => void fetchRow(), 4_000);
    return () => window.clearInterval(id);
  }, [enabled, fetchRow]);

  return {
    displayState: row,
    programScene: row?.program_scene ?? 'holding',
    programPayload: row?.program_payload ?? {},
    previewScene: row?.preview_scene ?? null,
    previewPayload: row?.preview_payload ?? {},
    ceremonyPhase: row?.ceremony_phase ?? null,
    loading,
    error,
    refresh: fetchRow,
  };
}
