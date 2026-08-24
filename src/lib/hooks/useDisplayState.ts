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

  const fetchRow = useCallback(async (): Promise<void> => {
    if (!enabled) return;
    try {
      const db = supabase() as unknown as Db;
      const eventId = await getEventId(db, slug);
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
        // Apply the pushed row straight away — a scene cut cannot wait for a
        // round trip — then let the next read reconcile anything odd.
        if (raw && raw.id) {
          const next = raw as DisplayStateRow;
          setRow((current) =>
            current && Number(next.revision) < Number(current.revision) ? current : next,
          );
          setLoading(false);
          reportDataConfirmed();
        } else {
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
