'use client';

/**
 * The score-change choreography from design.md screen 03.
 *
 *   +5 appears beside the player  →  flies into the round score  →  the total
 *   rolls  →  the rank updates  →  the team total catches up
 *
 * The components own the drawing; these hooks own the timing. Nothing here ever
 * invents a number: a held figure is always the *previous* real value, and the
 * moment the burst lands the real one takes over. If the burst is interrupted —
 * a second attempt lands, the operator cuts to another scene — the real value
 * is what remains on screen.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'motion/react';

import { SCORE_SEQUENCE } from '@/components/ui';
import type { AttemptRow } from '@/lib/types';

export interface BurstedScore {
  /** What to render right now — the previous value while a burst is in flight. */
  displayed: number;
  /** Points to draw as `+N`, or null when nothing is travelling. */
  burst: number | null;
  /** Re-fires the burst when the same value is scored twice. */
  burstKey: string | undefined;
  /** Hand to the burst's `onComplete`. */
  onBurstComplete: () => void;
  /** True from the moment an attempt lands until the figure has caught up. */
  active: boolean;
}

/**
 * Hold a live round score at its previous value while a `+N` travels into it.
 *
 * `latest` is the most recent confirmed attempt on that side; a change in its
 * id is what starts the sequence, so scoring 3 twice in a row bursts twice.
 */
export function useBurstedScore(
  latest: AttemptRow | null,
  score: number,
): BurstedScore {
  const reduced = useReducedMotion();
  // The flight carries the attempt it belongs to. Anything that changes the
  // attempt therefore *ends* the flight by derivation — a reversal, a cut to
  // another round, a zero-point attempt — so no held figure can outlive the
  // number it was holding for.
  const [flight, setFlight] = useState<{
    forId: string;
    value: number;
    held: number;
  } | null>(null);

  const seenId = useRef<string | null>(latest?.id ?? null);
  const previousScore = useRef(score);
  const latestId = latest?.id ?? null;
  const latestPoints = latest?.points ?? 0;

  useEffect(() => {
    if (latestId === seenId.current) {
      // No new attempt — a reversal or a fresh snapshot. Track the value so the
      // next burst holds the right figure, and never strand a held number.
      previousScore.current = score;
      return;
    }

    const priorScore = previousScore.current;
    seenId.current = latestId;
    previousScore.current = score;

    // Nothing to celebrate: the derived flight below has already lapsed.
    if (latestId === null || latestPoints === 0 || reduced) return;

    setFlight({ forId: latestId, value: latestPoints, held: priorScore });
  }, [latestId, latestPoints, score, reduced]);

  const live = flight && flight.forId === latestId ? flight : null;

  const onBurstComplete = useCallback(() => {
    setFlight(null);
  }, []);

  // A burst that never reports back (an unmounted card, a dropped frame) must
  // not freeze the score. This is the safety net, not the normal path.
  useEffect(() => {
    if (!live) return;
    const id = window.setTimeout(onBurstComplete, SCORE_SEQUENCE.total * 1000 + 400);
    return () => window.clearTimeout(id);
  }, [live, onBurstComplete]);

  return {
    displayed: live ? live.held : score,
    burst: live ? live.value : null,
    burstKey: live?.forId,
    onBurstComplete,
    active: live !== null,
  };
}

/**
 * A number that catches up a beat late — the team total settling after the
 * player's own figures, which is the last step of the sequence.
 */
export function useLaggedNumber(value: number, delaySeconds: number): number {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);

  useEffect(() => {
    if (reduced) return;
    // `value` is a dependency, so the pending timer is always the one carrying
    // the freshest figure — a second change inside the delay replaces it.
    const id = window.setTimeout(() => setShown(value), delaySeconds * 1000);
    return () => window.clearTimeout(id);
  }, [value, delaySeconds, reduced]);

  // Reduced motion removes the stagger, not the information.
  return reduced ? value : shown;
}

/**
 * Remember where every player sat before the standings last moved.
 *
 * `RankDelta` needs a "from" and the database only stores "now", so the display
 * keeps the previous ordering itself. A screen opened mid-event has no history
 * and reports no movement, which is the honest answer.
 */
export function useRankMemory(
  standings: ReadonlyArray<{ id: string; rank: number }>,
): Map<string, number> {
  const previous = useRef<Map<string, number>>(new Map());
  const current = useRef<Map<string, number>>(new Map());
  const [snapshot, setSnapshot] = useState<Map<string, number>>(new Map());

  const signature = standings.map((p) => `${p.id}:${p.rank}`).join('|');

  useEffect(() => {
    const next = new Map(standings.map((p) => [p.id, p.rank] as const));
    if (current.current.size > 0) {
      let moved = false;
      for (const [id, rank] of next) {
        if (current.current.get(id) !== rank) {
          moved = true;
          break;
        }
      }
      if (moved) previous.current = current.current;
    }
    current.current = next;
    setSnapshot(new Map(previous.current));
    // `signature` collapses the array into one primitive, so this runs when the
    // standings actually change rather than on every fresh snapshot object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return snapshot;
}

/**
 * Advance through a fixed list of timed steps, once, from the moment `key`
 * changes. Used for the goal takeover and the pre-round entrance, both of which
 * must be interruptible — a new key restarts the sequence from the top.
 */
export function useTimedSequence<T extends string>(
  steps: ReadonlyArray<{ step: T; ms: number }>,
  key: string | null,
  options: { enabled?: boolean } = {},
): T | null {
  const enabled = options.enabled ?? true;
  const reduced = useReducedMotion();
  const running = enabled && key !== null && steps.length > 0;

  // Like `useRevealStage`, the progress carries the run it belongs to, so a new
  // key reads as "back to the opening step" on the very first render rather
  // than one frame later.
  const [progress, setProgress] = useState<{ key: string | null; step: T | null }>({
    key: null,
    step: null,
  });

  useEffect(() => {
    if (!running) return;

    const timers: number[] = [];

    if (reduced) {
      // No staging under reduced motion: hold the most informative step, then end.
      const total = steps.reduce((sum, s) => sum + s.ms, 0);
      timers.push(
        window.setTimeout(() => setProgress({ key, step: null }), Math.min(total, 2600)),
      );
    } else {
      let elapsed = 0;
      steps.forEach((entry, index) => {
        elapsed += entry.ms;
        const next = steps[index + 1];
        timers.push(
          window.setTimeout(
            () => setProgress({ key, step: next ? next.step : null }),
            elapsed,
          ),
        );
      });
    }

    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, running, reduced]);

  if (!running) return null;
  if (progress.key !== key) {
    return reduced
      ? (steps[Math.max(0, steps.length - 2)]?.step ?? steps[0].step)
      : steps[0].step;
  }
  return progress.step;
}
