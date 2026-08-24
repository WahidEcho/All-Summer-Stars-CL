'use client';

/**
 * Two reads the event snapshot deliberately does not carry.
 *
 * `getEventSnapshot` is scoped to what a live screen needs — the *current*
 * challenge's rounds, and standings totals rather than the ledger behind them.
 * The results archive and a player profile need the wider view, so they read it
 * themselves and re-read whenever the snapshot moves, which keeps them exactly
 * as live as everything else without opening a second realtime channel.
 *
 * Both hooks follow the same rule as the snapshot hook: a failed refetch never
 * clears what is already on screen.
 */

import { useEffect, useRef, useState } from 'react';

import { getLedger } from '@/lib/data/queries';
import type { Db } from '@/lib/event';
import { supabase } from '@/lib/supabase/client';
import type { LedgerRow, RoundRow } from '@/lib/types';

function db(): Db {
  return supabase() as unknown as Db;
}

/**
 * Every round of every challenge, ordered by challenge then round number.
 *
 * `revision` is any value that changes when the event does — pass
 * `snapshot.fetchedAt`.
 */
export function useAllRounds(
  challengeIds: string[],
  revision: number | null,
  initial: RoundRow[] = [],
): RoundRow[] {
  const [rounds, setRounds] = useState<RoundRow[]>(initial);
  const key = challengeIds.join(',');
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (challengeIds.length === 0) return;
    let cancelled = false;

    void (async () => {
      try {
        const { data, error } = await db()
          .from('rounds')
          .select('*')
          .in('challenge_id', challengeIds)
          .order('number');
        if (error) throw error;
        if (cancelled || !mounted.current) return;
        setRounds((data ?? []) as RoundRow[]);
      } catch {
        // Keep the last good archive on screen.
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  return rounds;
}

/**
 * A single player's confirmed ledger, which is what a per-challenge breakdown
 * on their profile is built from.
 */
export function usePlayerLedger(
  eventId: string | null,
  playerId: string | null,
  revision: number | null,
  initial: LedgerRow[] = [],
): LedgerRow[] {
  const [ledger, setLedger] = useState<LedgerRow[]>(initial);

  useEffect(() => {
    if (!eventId || !playerId) return;
    let cancelled = false;

    void (async () => {
      try {
        const rows = await getLedger(db(), eventId, { playerId, confirmedOnly: true });
        if (cancelled) return;
        setLedger(rows);
      } catch {
        // Keep the last good breakdown on screen.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [eventId, playerId, revision]);

  return ledger;
}
