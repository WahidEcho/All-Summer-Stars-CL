'use client';

/**
 * The discreet "you may be looking at an old score" marker.
 *
 * `useConnectionState` already holds trouble for five seconds before admitting
 * to it, so this component simply renders what the store says. It never blanks
 * the board, never resets a figure and never shouts: a spectator behind a
 * marquee with four seconds of bad Wi-Fi sees nothing at all.
 */

import { useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { StatusPill } from '@/components/ui';
import { DURATION, EASE, useMotionScale } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useLiveEvent } from '@/components/public/snapshot-context';

const COPY: Record<string, { label: string; spoken: string }> = {
  reconnecting: { label: 'RECONNECTING', spoken: 'Reconnecting. Showing the last confirmed scores.' },
  offline: { label: 'OFFLINE', spoken: 'You are offline. Showing the last confirmed scores.' },
  recovering: { label: 'UP TO DATE', spoken: 'Reconnected. Scores are live again.' },
};

/** A once-a-second clock, as an external store, so render stays pure. */
function subscribeToSeconds(onChange: () => void): () => void {
  const id = window.setInterval(onChange, 1000);
  return () => window.clearInterval(id);
}

function secondsNow(): number {
  return Math.round(Date.now() / 1000);
}

export function ConnectionBadge({ className }: { className?: string }) {
  const { connection, stale, refresh } = useLiveEvent();
  const motionOn = useMotionScale() === 1;

  const status = connection.status;
  const copy = COPY[status];
  const show = Boolean(copy) && (status !== 'recovering' || stale === false);

  return (
    <AnimatePresence initial={false}>
      {show && copy ? (
        <motion.div
          key={status}
          initial={motionOn ? { opacity: 0, y: -6 } : false}
          animate={{ opacity: 1, y: 0 }}
          exit={motionOn ? { opacity: 0, y: -6 } : { opacity: 0 }}
          transition={{ duration: DURATION.instantMax, ease: EASE.soft }}
          className={cn('flex items-center', className)}
        >
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-pill"
            aria-label={`${copy.spoken} Tap to retry now.`}
          >
            <StatusPill
              label={copy.label}
              tone={status === 'recovering' ? 'winner' : 'draw'}
              variant="soft"
              size="sm"
              pulse={status !== 'recovering'}
            />
          </button>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

/**
 * The longer version, for the top of a page body: says plainly that the score
 * on screen is the last confirmed one.
 */
export function StaleNotice({ className }: { className?: string }) {
  const { stale, connection, updatedAt, refresh } = useLiveEvent();
  // The age has to keep counting while nothing else changes, and reading the
  // clock during render would both be impure and disagree with the server's
  // HTML. The subscription ticks once a second; the server snapshot is `null`,
  // so the first paint simply carries no age.
  const nowSeconds = useSyncExternalStore(subscribeToSeconds, secondsNow, () => null);

  if (!stale) return null;

  const seconds =
    updatedAt !== null && nowSeconds !== null
      ? Math.max(0, nowSeconds - Math.round(updatedAt / 1000))
      : null;

  return (
    <div
      role="status"
      className={cn(
        'bg-draw-soft text-draw ring-draw/25 flex flex-wrap items-center justify-between gap-3 rounded-md px-4 py-3 ring-1',
        className,
      )}
    >
      <p className="u-label text-[0.6875rem]">
        <span aria-hidden data-state-glyph className="mr-2">
          ●
        </span>
        {connection.online ? 'RECONNECTING' : 'YOU ARE OFFLINE'} — SHOWING THE LAST CONFIRMED
        SCORES
        {seconds !== null && seconds > 5 ? ` (${seconds}s AGO)` : ''}
      </p>
      <button
        type="button"
        onClick={() => void refresh()}
        className="u-label ring-draw/40 hover:bg-draw/10 rounded-pill px-3 py-1.5 text-[0.625rem] ring-1"
      >
        RETRY NOW
      </button>
    </div>
  );
}

export default ConnectionBadge;
