'use client';

/**
 * The score-change choreography from design.md screen 03.
 *
 *   +5 appears beside the player  →  holds, readable  →  flies into the round
 *   score  →  the score rolls  →  the total follows  →  the rank updates  →
 *   the team total catches up
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
  /** Hand to the burst's `onComplete`. Ignores anything but the live burst. */
  onBurstComplete: (completedKey?: string | number) => void;
  /** True from the moment an attempt lands until the figure has caught up. */
  active: boolean;
}

/** A `+N` in mid-air: which attempt it belongs to, and what it is holding back. */
interface Flight {
  forId: string;
  value: number;
  held: number;
}

/**
 * Everything the burst choreography remembers, in one record, so any render can
 * tell at a glance whether the stored state has caught up with the props — the
 * same shape `useRevealStage` keeps its stage in.
 */
interface BurstLedger {
  /** The round the rail belongs to; null while the rail is empty. */
  roundId: string | null;
  /** The newest attempt id this ledger has reacted to. */
  seenId: string | null;
  /**
   * Every attempt id that has already had its moment. A reversal flips a row
   * out of the confirmed rail, which can put an *older* attempt back at the
   * end — being in here is what keeps it silent the second time round.
   */
  seen: ReadonlySet<string>;
  /** The score as of the last caught-up commit — what a new flight holds. */
  prior: number;
  flight: Flight | null;
}

/**
 * Hold a live round score at its previous value while a `+N` travels into it.
 *
 * `attempts` is the side's confirmed rail; a genuinely new id at its end is
 * what starts the sequence, so scoring 3 twice in a row bursts twice, while a
 * fresh snapshot re-delivering the same rows — the 4-second poll arriving
 * seconds after the realtime insert, with new object identities but the same
 * ids — changes nothing on screen at all.
 *
 * The ledger is adjusted *during render*, the moment the props stop matching
 * it, so the very first frame that carries a new attempt already shows the
 * held score with the `+N` beside it. An earlier shape did this in an effect,
 * which runs after paint — so the new score reached the numeral one painted
 * frame before the hold did: the roll started, was yanked back down to the
 * held figure, and ran again when the burst landed. One attempt, two visible
 * animations, each apparently from zero. Adjusting pre-paint means the numeral
 * moves exactly once, when the burst lands.
 */
export function useBurstedScore(
  attempts: ReadonlyArray<AttemptRow>,
  score: number,
): BurstedScore {
  const reduced = useReducedMotion();

  const latest = attempts.length > 0 ? attempts[attempts.length - 1] : null;
  const latestId = latest?.id ?? null;
  const latestRoundId = latest?.round_id ?? null;
  const latestPoints = latest?.points ?? 0;

  // Seeded with everything already on the rail, so a wall cut to this scene
  // mid-round celebrates nothing it did not watch happen.
  const [ledger, setLedger] = useState<BurstLedger>(() => ({
    roundId: latestRoundId,
    seenId: latestId,
    seen: new Set(attempts.map((a) => a.id)),
    prior: score,
    flight: null,
  }));

  if (ledger.seenId !== latestId) {
    // The rail's newest id moved. Each branch below re-establishes
    // `seenId === latestId`, so this settles in one pre-paint pass.
    if (latestId === null) {
      // The rail emptied: a new round opening, or every attempt reversed.
      // Forget the old round so its ids cannot silence the one that follows.
      setLedger({ roundId: null, seenId: null, seen: new Set(), prior: score, flight: null });
    } else if (ledger.roundId !== null && latestRoundId !== ledger.roundId) {
      // Cut into a round already underway. Absorb its whole rail silently —
      // those attempts happened before this surface was watching.
      setLedger({
        roundId: latestRoundId,
        seenId: latestId,
        seen: new Set(attempts.map((a) => a.id)),
        prior: score,
        flight: null,
      });
    } else {
      // An id at the end of the watched rail. Brand new: fire the flight,
      // holding the score the previous commit showed. Already seen — a
      // reversal has re-exposed an older attempt — or worth nothing: no
      // flight, and the figure simply rolls to its corrected value.
      const fresh = !ledger.seen.has(latestId) && latestPoints !== 0 && !reduced;
      const seen = new Set(ledger.seen);
      seen.add(latestId);
      setLedger({
        roundId: latestRoundId,
        seenId: latestId,
        seen,
        prior: score,
        flight: fresh
          ? { forId: latestId, value: latestPoints, held: ledger.prior }
          : null,
      });
    }
  } else if (ledger.prior !== score) {
    // Same attempt, moved value — a fresh poll after a correction. Track it so
    // the next burst holds the right figure, and never strand a held number.
    setLedger({ ...ledger, prior: score });
  }

  // The `forId` guard means anything that changes the attempt *ends* the
  // flight by derivation — a reversal, a cut to another round, a zero-point
  // attempt — so no held figure can outlive the number it was holding for.
  const live =
    ledger.flight && ledger.flight.forId === latestId ? ledger.flight : null;

  // The identity check is the whole point. A burst reports completion when it
  // finishes travelling *and* when it is replaced — `AnimatePresence` runs the
  // outgoing one's exit after the new flight is already installed — so an
  // unguarded callback let the previous `+N` cancel the next one. Two attempts
  // inside the two-second window then showed one burst and a snapping score,
  // which is the fault this choreography exists to prevent.
  const onBurstComplete = useCallback((completedKey?: string | number) => {
    setLedger((current) => {
      if (!current.flight) return current;
      if (completedKey !== undefined && current.flight.forId !== completedKey) {
        return current;
      }
      return { ...current, flight: null };
    });
  }, []);

  // A burst that never reports back (an unmounted card, a dropped frame) must
  // not freeze the score. This is the safety net, not the normal path.
  useEffect(() => {
    if (!live) return;
    const forId = live.forId;
    const id = window.setTimeout(
      () => onBurstComplete(forId),
      SCORE_SEQUENCE.total * 1000 + 400,
    );
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
