import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type ProgressRailTone = 'accent' | 'team' | 'live' | 'winner' | 'ink';
export type ProgressRailSize = 'xs' | 'sm' | 'md' | 'lg';

export interface ProgressRailProps {
  /** Current value. Clamped to `0..max`. */
  value: number;
  max?: number;
  /** All-caps caption above the rail. */
  label?: ReactNode;
  /** Text on the right of the caption row, e.g. `42.6s`. */
  hint?: ReactNode;
  tone?: ProgressRailTone;
  size?: ProgressRailSize;
  /**
   * `fill` grows left to right (a challenge completing). `deplete` shrinks
   * right to left (a 60-second countdown draining).
   */
  direction?: 'fill' | 'deplete';
  /** Tick marks at these fractions of the rail (0–1), e.g. halftime at 0.5. */
  ticks?: number[];
  /** Milliseconds for the width transition. Defaults to the score band. */
  transitionMs?: number;
  className?: string;
}

const TRACK: Record<ProgressRailSize, string> = {
  xs: 'h-1',
  sm: 'h-1.5',
  md: 'h-2.5',
  lg: 'h-4',
};

const FILL: Record<ProgressRailTone, string> = {
  accent: 'bg-aqua-500',
  team: 'bg-[color:var(--team-accent)]',
  live: 'bg-live',
  winner: 'bg-winner',
  ink: 'bg-ink',
};

/**
 * A plain linear rail — challenge completion, a countdown draining, a
 * shootout's progress. The clock itself is always a numeral; this is the
 * peripheral-vision companion to it.
 */
export function ProgressRail({
  value,
  max = 100,
  label,
  hint,
  tone = 'accent',
  size = 'md',
  direction = 'fill',
  ticks,
  transitionMs,
  className,
}: ProgressRailProps) {
  const safeMax = max > 0 ? max : 1;
  const clamped = Math.min(Math.max(value, 0), safeMax);
  const pct = (clamped / safeMax) * 100;

  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)} data-progress-rail>
      {label || hint ? (
        <div className="flex items-baseline justify-between gap-3">
          {label ? <span className="u-label text-text-muted text-eyebrow">{label}</span> : null}
          {hint ? (
            <span className="u-numeral u-tabular text-text-secondary text-eyebrow">{hint}</span>
          ) : null}
        </div>
      ) : null}

      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={safeMax}
        aria-valuenow={clamped}
        className={cn(
          'bg-haze relative w-full overflow-hidden rounded-pill',
          'ring-1 ring-border-subtle ring-inset',
          TRACK[size],
        )}
      >
        <div
          className={cn(
            'absolute inset-y-0 rounded-pill',
            direction === 'deplete' ? 'right-0' : 'left-0',
            FILL[tone],
          )}
          style={{
            width: `${pct}%`,
            transitionProperty: 'width',
            transitionDuration: `${transitionMs ?? 320}ms`,
            transitionTimingFunction: 'var(--ease-broadcast)',
          }}
        />

        {ticks?.map((t) => (
          <span
            key={t}
            aria-hidden
            className="bg-white/70 absolute inset-y-0 w-px"
            style={{ left: `${Math.min(Math.max(t, 0), 1) * 100}%` }}
          />
        ))}
      </div>
    </div>
  );
}

export default ProgressRail;
