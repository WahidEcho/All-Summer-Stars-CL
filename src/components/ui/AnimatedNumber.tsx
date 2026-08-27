'use client';

import { useEffect, useRef, useState } from 'react';
import { animate } from 'motion/react';

import { useReducedMotionSafe } from '@/components/ui/motion-tokens';

import { cn } from '@/lib/cn';
import { DURATION, EASE, type EaseToken } from '@/components/ui/motion-tokens';

export interface AnimatedNumberProps {
  /** The target value. Whenever it changes the figure rolls to the new one. */
  value: number;
  /** Seconds. Defaults to the score-change band (320ms). */
  duration?: number;
  ease?: EaseToken;
  /** Digits after the decimal point. Rolls respect this. */
  decimals?: number;
  /** Zero-pad the integer part to this many digits (clocks, `07`). */
  padStart?: number;
  /** Full control of the rendered string. Overrides `decimals`/`padStart`. */
  format?: (value: number) => string;
  prefix?: string;
  suffix?: string;
  /** Show `+` in front of positive values (deltas). */
  signed?: boolean;
  /** Subtle scale pop when the value changes. On by default. */
  pop?: boolean;
  /** Announce the new value to screen readers. Off by default — a live score
   *  that announces every attempt is unusable. Turn on for one figure only. */
  announce?: boolean;
  /** Fires once the roll has settled, with the final value. */
  onSettled?: (value: number) => void;
  className?: string;
}

function defaultFormat(value: number, decimals: number, padStart: number, signed: boolean) {
  const rounded = decimals > 0 ? value.toFixed(decimals) : String(Math.round(value));
  const negative = rounded.startsWith('-');
  const bare = negative ? rounded.slice(1) : rounded;
  const [int, frac] = bare.split('.');
  const padded = padStart > 0 ? int.padStart(padStart, '0') : int;
  const body = frac ? `${padded}.${frac}` : padded;
  if (negative) return `-${body}`;
  return signed ? `+${body}` : body;
}

/**
 * A number that rolls between values instead of snapping.
 *
 * Always renders tabular figures (via `data-numeral`), so the element never
 * changes width mid-roll and nothing beside it jitters. Under
 * `prefers-reduced-motion` the value updates in a single frame — the
 * information still changes, only the travel is removed.
 */
export function AnimatedNumber({
  value,
  duration = DURATION.score,
  ease = 'broadcast',
  decimals = 0,
  padStart = 0,
  format,
  prefix,
  suffix,
  signed = false,
  pop = true,
  announce = false,
  onSettled,
  className,
}: AnimatedNumberProps) {
  const reduced = useReducedMotionSafe();
  const [rolling, setRolling] = useState(value);
  const previous = useRef(value);
  const rolled = useRef(value);
  const host = useRef<HTMLSpanElement>(null);
  const settled = useRef(onSettled);

  // Kept in an effect rather than assigned during render: the callback is only
  // ever read from a timer or an animation frame, never while rendering.
  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  // Under reduced motion nothing rolls, so the rendered figure is the prop
  // itself — no state to push, and therefore no extra render on every change.
  const display = reduced ? value : rolling;

  useEffect(() => {
    const from = previous.current;
    const changed = from !== value;
    previous.current = value;

    if (reduced) {
      if (changed) settled.current?.(value);
      return;
    }

    // `rolled` lags `value` only while a roll is in flight — or when the reader
    // has just turned reduced motion *off*, in which case the held figure is
    // stale and has to be caught up even though the value itself did not move.
    if (!changed && rolled.current === value) return;

    const factor = decimals > 0 ? 10 ** decimals : 1;
    const controls = animate(from, value, {
      duration,
      ease: EASE[ease],
      onUpdate: (v) => {
        const next = Math.round(v * factor) / factor;
        rolled.current = next;
        setRolling(next);
      },
      onComplete: () => {
        rolled.current = value;
        setRolling(value);
        settled.current?.(value);
      },
    });

    if (pop && changed && host.current) {
      animate(
        host.current,
        { scale: [1, 1.07, 1] },
        { duration: duration * 1.15, ease: EASE.overshoot },
      );
    }

    return () => controls.stop();
  }, [value, duration, ease, decimals, pop, reduced]);

  const text = format
    ? format(display)
    : defaultFormat(display, decimals, padStart, signed);

  return (
    <span
      ref={host}
      data-numeral
      data-animated-number
      className={cn('u-tabular inline-block will-change-transform', className)}
      aria-live={announce ? 'polite' : undefined}
      aria-atomic={announce ? true : undefined}
    >
      {prefix}
      {text}
      {suffix}
    </span>
  );
}

export default AnimatedNumber;
