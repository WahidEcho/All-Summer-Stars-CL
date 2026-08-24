'use client';

import { useEffect, useState } from 'react';
import { useReducedMotion } from 'motion/react';

/**
 * A monotonically increasing stage counter driven by a list of millisecond
 * marks.
 *
 * Cinematic entrances in this show are cumulative — the title stays when the
 * players arrive, the players stay when the VS lands — so a stage *index* is
 * the right primitive rather than an exclusive state machine. Changing `key`
 * replays the sequence from the top, which is how a new round re-runs the
 * reveal without remounting the whole scene.
 *
 * Under `prefers-reduced-motion` every mark is considered passed immediately:
 * the composition arrives complete, which is the same information without the
 * three seconds of travel.
 */
export function useRevealStage(marks: readonly number[], key: string | null): number {
  const reduced = useReducedMotion();

  // The stage is stored *with* the key it belongs to, so a new round reads as
  // stage 0 on the very first render rather than after an effect has run. A
  // one-frame flash of the previous round's finished composition is exactly
  // what a hard cut must not show.
  const [progress, setProgress] = useState<{ key: string | null; stage: number }>({
    key,
    stage: 0,
  });

  useEffect(() => {
    if (key === null || reduced) return;

    const timers = marks.map((ms, index) =>
      window.setTimeout(() => setProgress({ key, stage: index + 1 }), ms),
    );
    return () => {
      for (const id of timers) window.clearTimeout(id);
    };
    // `marks` is a module-level constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reduced]);

  if (key === null || reduced) return marks.length;
  return progress.key === key ? progress.stage : 0;
}
