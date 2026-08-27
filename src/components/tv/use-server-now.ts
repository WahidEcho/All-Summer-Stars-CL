"use client";

/**
 * The current time, read in the server's frame rather than the wall's.
 *
 * A venue display's clock is not to be trusted. It has been unplugged since the
 * dress run, nobody set it, and nothing on the machine will tell you it is
 * wrong — but every countdown on the wall is computed against a timestamp the
 * *server* wrote, so a machine two minutes out shows the room a number that is
 * two minutes wrong. At kick-off and on a two-minute break, that is the
 * difference between a right answer and a nonsense one.
 *
 * The snapshot carries `fetchedAt`, written by the server when it assembled the
 * data. Pairing that with the client instant it arrived turns the wall's clock
 * into a stopwatch rather than a calendar: only its *rate* has to be right, and
 * its absolute setting never matters. The snapshot refreshes every few seconds,
 * so the anchor never drifts far.
 */

import { useEffect, useState } from "react";

export interface UseServerNowOptions {
  /** How often the value refreshes. 250ms suits a ticking clock. */
  intervalMs?: number;
}

export function useServerNow(
  fetchedAt: number,
  options: UseServerNowOptions = {},
): number {
  const intervalMs = options.intervalMs ?? 250;

  const [anchor, setAnchor] = useState<{
    server: number;
    client: number;
  } | null>(null);
  const [now, setNow] = useState(() => fetchedAt);

  useEffect(() => {
    if (anchor?.server === fetchedAt) return;
    // One write per fresh snapshot, guarded above so it settles rather than
    // cascading. Reading the clock is only legal out here, after the render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAnchor({ server: fetchedAt, client: Date.now() });
  }, [fetchedAt, anchor]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);

  // Before the first anchor lands, the server's own reading is the best answer
  // available — and it is the one the server rendered with, so they agree.
  return anchor ? anchor.server + (now - anchor.client) : fetchedAt;
}

export default useServerNow;
