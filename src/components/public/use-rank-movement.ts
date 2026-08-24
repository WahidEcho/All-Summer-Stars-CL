'use client';

/**
 * Rank movement, observed rather than invented.
 *
 * The snapshot carries only the current standings, so "moved up two places"
 * has to be measured against what this device was showing a moment ago. That
 * is the honest claim to make — it is exactly what the spectator just saw
 * change — and it is why the badge expires: a movement from ten minutes ago is
 * not news, and leaving `↑ 3 POSITIONS` frozen on a card would misrepresent a
 * settled leaderboard as a moving one.
 */

import { useEffect, useRef, useState } from 'react';

import type { RankedPlayer } from '@/lib/types';

/** How long a movement badge stays on screen after the change. */
const MOVEMENT_TTL_MS = 14_000;

interface Movement {
  from: number;
  at: number;
}

export type RankMovements = Readonly<Record<string, number>>;

/**
 * A map of `playerId -> previous rank` for players whose rank changed
 * recently. Feed the values straight into `previousRank` on the cards.
 */
export function useRankMovement(standings: RankedPlayer[]): RankMovements {
  const known = useRef(new Map<string, number>());
  const moved = useRef(new Map<string, Movement>());
  const [movements, setMovements] = useState<RankMovements>({});

  useEffect(() => {
    if (standings.length === 0) return;

    const now = Date.now();
    let changed = false;

    for (const player of standings) {
      const previous = known.current.get(player.id);
      known.current.set(player.id, player.rank);

      if (previous === undefined || previous === player.rank) continue;
      // Keep the *original* starting rank while a run of changes is in flight,
      // so a player climbing 6 -> 4 -> 2 reads as "up 4", not two separate hops.
      const existing = moved.current.get(player.id);
      moved.current.set(player.id, {
        from: existing && now - existing.at < MOVEMENT_TTL_MS ? existing.from : previous,
        at: now,
      });
      changed = true;
    }

    // Drop anything that has aged out.
    for (const [id, movement] of moved.current) {
      if (now - movement.at >= MOVEMENT_TTL_MS) {
        moved.current.delete(id);
        changed = true;
      }
    }

    if (!changed) return;

    const next: Record<string, number> = {};
    for (const [id, movement] of moved.current) next[id] = movement.from;
    // This hook exists precisely to compare the standings against what this
    // device last *rendered*, so the comparison cannot be made anywhere but in
    // an effect, and the result cannot be derived from the current props. It
    // runs only when a rank actually moved — a handful of times per event, not
    // per snapshot — so the extra render pass is bounded and deliberate.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMovements(next);
  }, [standings]);

  // Expire badges even when no further snapshot arrives.
  useEffect(() => {
    if (Object.keys(movements).length === 0) return;
    const id = window.setTimeout(() => {
      const now = Date.now();
      const next: Record<string, number> = {};
      for (const [playerId, movement] of moved.current) {
        if (now - movement.at < MOVEMENT_TTL_MS) next[playerId] = movement.from;
        else moved.current.delete(playerId);
      }
      setMovements(next);
    }, MOVEMENT_TTL_MS + 250);
    return () => window.clearTimeout(id);
  }, [movements]);

  return movements;
}
