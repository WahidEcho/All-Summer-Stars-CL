'use client';

import { useEffect } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';

import { cn } from '@/lib/cn';
import { EASE, SCORE_SEQUENCE } from '@/components/ui/motion-tokens';

export type PointsBurstSize = 'sm' | 'md' | 'lg' | 'xl';
export type PointsBurstTone = 'accent' | 'winner' | 'live' | 'ink' | 'team';

export interface PointsBurstProps {
  /** Points awarded. `null`/`undefined` renders nothing. Negative values are
   *  drawn as a reversal (`-3`) with the `live` tone unless overridden. */
  value: number | null | undefined;
  /**
   * Changing this re-triggers the burst even when `value` is unchanged, which
   * is what you want when a player scores the same points twice in a row.
   * Pass the attempt id.
   */
  burstKey?: string | number;
  size?: PointsBurstSize;
  tone?: PointsBurstTone;
  /** Travel direction. `up` merges into a total above, `down` into one below. */
  direction?: 'up' | 'down';
  /** Travel distance in `em` of the burst's own font size. */
  travel?: number;
  /** Fired when the burst has finished travelling — roll the total here. */
  onComplete?: () => void;
  /** Word announced to screen readers, e.g. "plus five points". */
  label?: string;
  className?: string;
}

const SIZE: Record<PointsBurstSize, string> = {
  sm: 'text-[1.75rem]',
  md: 'text-[2.75rem]',
  lg: 'text-[4.5rem]',
  xl: 'text-[7rem]',
};

const TONE: Record<PointsBurstTone, string> = {
  accent: 'text-aqua-700',
  winner: 'text-winner',
  live: 'text-live',
  ink: 'text-ink',
  team: 'text-[color:var(--team-accent)]',
};

/**
 * The `+N` that appears beside a player, expands, then travels into their
 * total. Screen 03 of design.md: attempt → player → ranking → team.
 *
 * The component owns only the burst itself. Sequencing lives with the caller:
 * render the burst, and roll the total from `onComplete`.
 *
 * Position it yourself — it is `absolute` by default so it can sit over a
 * player card without affecting layout.
 */
export function PointsBurst({
  value,
  burstKey,
  size = 'lg',
  tone,
  direction = 'up',
  travel = 1.6,
  onComplete,
  label,
  className,
}: PointsBurstProps) {
  const reduced = useReducedMotion();
  const visible = value != null && Number.isFinite(value);
  const negative = visible && (value as number) < 0;
  const resolvedTone: PointsBurstTone = tone ?? (negative ? 'live' : 'accent');
  const sign = negative ? '−' : '+';
  const magnitude = visible ? Math.abs(value as number) : 0;
  const key = burstKey ?? value ?? 'none';
  const distance = (direction === 'up' ? -1 : 1) * travel;

  // Reduced motion still needs the burst to hand control back to the caller.
  useEffect(() => {
    if (!reduced || !visible || !onComplete) return;
    const id = window.setTimeout(onComplete, 900);
    return () => window.clearTimeout(id);
  }, [reduced, visible, onComplete, key]);

  return (
    <AnimatePresence mode="wait">
      {visible ? (
        <motion.span
          key={key}
          data-points-burst
          className={cn(
            'u-numeral pointer-events-none absolute z-30 select-none',
            'drop-shadow-[0_6px_18px_rgb(14_42_51_/_0.25)]',
            SIZE[size],
            TONE[resolvedTone],
            className,
          )}
          initial={reduced ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.5, y: 0 }}
          animate={
            reduced
              ? { opacity: 1, scale: 1, y: 0 }
              : {
                  opacity: [0, 1, 1, 0],
                  scale: [0.5, 1.22, 1, 0.86],
                  y: [0, 0, `${distance * 0.35}em`, `${distance}em`],
                }
          }
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={
            reduced
              ? { duration: 0 }
              : {
                  duration: SCORE_SEQUENCE.total * 0.62,
                  times: [0, 0.22, 0.5, 1],
                  ease: EASE.overshoot,
                }
          }
          onAnimationComplete={reduced ? undefined : onComplete}
        >
          <span aria-hidden>
            {sign}
            {magnitude}
          </span>
          <span className="u-sr-only">
            {label ?? `${negative ? 'minus' : 'plus'} ${magnitude} points`}
          </span>
        </motion.span>
      ) : null}
    </AnimatePresence>
  );
}

export default PointsBurst;
