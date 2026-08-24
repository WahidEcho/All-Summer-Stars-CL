'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

export type ScoreNumeralSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
export type ScoreNumeralTone =
  | 'default'
  | 'muted'
  | 'accent'
  | 'team'
  | 'live'
  | 'winner'
  | 'draw'
  | 'inverse';

export interface ScoreNumeralProps {
  /** Numbers roll when `animate` is on; strings (a clock) render as given. */
  value: number | string;
  /** All-caps label, e.g. `TOTAL` or `ROUND SCORE`. */
  label?: ReactNode;
  labelPlacement?: 'above' | 'below' | 'none';
  /** Small unit that sits on the numeral's baseline, e.g. `PTS`. */
  suffix?: ReactNode;
  size?: ScoreNumeralSize;
  tone?: ScoreNumeralTone;
  /** `clock` drops a little weight so the colon does not blob. */
  variant?: 'score' | 'clock';
  /** Roll numeric values instead of snapping. Default true. */
  animate?: boolean;
  /** Zero-pad the integer part (`07`). */
  padStart?: number;
  align?: 'start' | 'center' | 'end';
  /** Announce changes to assistive tech. Use on at most one figure per screen. */
  announce?: boolean;
  className?: string;
  valueClassName?: string;
  labelClassName?: string;
}

const SIZE: Record<ScoreNumeralSize, string> = {
  xs: 'text-[1.5rem]',
  sm: 'text-score-sm',
  md: 'text-score-md',
  lg: 'text-score-lg',
  xl: 'text-score-xl',
  '2xl': 'text-score-2xl',
};

const LABEL_SIZE: Record<ScoreNumeralSize, string> = {
  xs: 'text-[0.5625rem]',
  sm: 'text-eyebrow',
  md: 'text-eyebrow',
  lg: 'text-label',
  xl: 'text-label',
  '2xl': 'text-[1.0625rem]',
};

const TONE: Record<ScoreNumeralTone, string> = {
  default: 'text-ink',
  muted: 'text-text-muted',
  accent: 'text-aqua-700',
  team: 'text-[color:var(--team-accent)]',
  live: 'text-live',
  winner: 'text-winner',
  draw: 'text-draw',
  inverse: 'text-white',
};

const LABEL_TONE: Record<ScoreNumeralTone, string> = {
  default: 'text-text-muted',
  muted: 'text-text-muted',
  accent: 'text-aqua-700',
  team: 'text-[color:var(--team-accent-ink)]',
  live: 'text-live',
  winner: 'text-winner',
  draw: 'text-draw',
  inverse: 'text-white/75',
};

const ALIGN = {
  start: 'items-start text-left',
  center: 'items-center text-center',
  end: 'items-end text-right',
} as const;

/**
 * An enormous tabular numeral with an optional all-caps label.
 *
 * This is the single component every score, total, goal count and clock on
 * the broadcast surfaces goes through, so the figures across the whole show
 * share one width, one weight and one baseline.
 */
export function ScoreNumeral({
  value,
  label,
  labelPlacement = 'above',
  suffix,
  size = 'md',
  tone = 'default',
  variant = 'score',
  animate = true,
  padStart = 0,
  align = 'center',
  announce = false,
  className,
  valueClassName,
  labelClassName,
}: ScoreNumeralProps) {
  const numeric = typeof value === 'number' && Number.isFinite(value);

  const labelNode =
    label != null && labelPlacement !== 'none' ? (
      <span
        className={cn(
          'u-label',
          LABEL_SIZE[size],
          LABEL_TONE[tone],
          labelPlacement === 'above' ? 'mb-[0.35em]' : 'mt-[0.5em]',
          labelClassName,
        )}
      >
        {label}
      </span>
    ) : null;

  return (
    <div className={cn('flex flex-col', ALIGN[align], className)}>
      {labelPlacement === 'above' ? labelNode : null}

      <span
        className={cn(
          variant === 'clock' ? 'u-clock' : 'u-numeral',
          SIZE[size],
          TONE[tone],
          'flex items-baseline gap-[0.14em] whitespace-nowrap',
          valueClassName,
        )}
      >
        {numeric && animate ? (
          <AnimatedNumber value={value} padStart={padStart} announce={announce} />
        ) : (
          <span data-numeral className="u-tabular">
            {numeric && padStart > 0
              ? String(value).padStart(padStart, '0')
              : String(value)}
          </span>
        )}
        {suffix ? (
          <span
            className={cn(
              'u-label text-[0.22em] tracking-[var(--tracking-label)]',
              LABEL_TONE[tone],
            )}
          >
            {suffix}
          </span>
        ) : null}
      </span>

      {labelPlacement === 'below' ? labelNode : null}
    </div>
  );
}

export default ScoreNumeral;
