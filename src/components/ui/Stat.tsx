'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';

export type StatSize = 'xs' | 'sm' | 'md' | 'lg';
export type StatTone = 'default' | 'muted' | 'accent' | 'team' | 'winner' | 'live' | 'inverse';

export interface StatProps {
  /** All-caps caption, e.g. `TOTAL POINTS`. */
  label: ReactNode;
  /** Numbers roll; anything else renders as given. */
  value: ReactNode;
  /** Optional second line under the value, e.g. `3 ROUND WINS`. */
  sub?: ReactNode;
  /** Unit riding the value's baseline, e.g. `PTS`. */
  suffix?: ReactNode;
  size?: StatSize;
  tone?: StatTone;
  align?: 'start' | 'center' | 'end';
  /** Roll numeric values. Default true. */
  animate?: boolean;
  className?: string;
  valueClassName?: string;
}

const VALUE_SIZE: Record<StatSize, string> = {
  xs: 'text-[1.125rem]',
  sm: 'text-[1.75rem]',
  md: 'text-h3',
  lg: 'text-h2',
};

const LABEL_SIZE: Record<StatSize, string> = {
  xs: 'text-[0.5625rem]',
  sm: 'text-eyebrow',
  md: 'text-eyebrow',
  lg: 'text-label',
};

const VALUE_TONE: Record<StatTone, string> = {
  default: 'text-ink',
  muted: 'text-text-muted',
  accent: 'text-aqua-700',
  team: 'text-[color:var(--team-accent)]',
  winner: 'text-winner',
  live: 'text-live',
  inverse: 'text-white',
};

const LABEL_TONE: Record<StatTone, string> = {
  default: 'text-text-muted',
  muted: 'text-text-muted',
  accent: 'text-aqua-700',
  team: 'text-[color:var(--team-accent-ink)]',
  winner: 'text-winner',
  live: 'text-live',
  inverse: 'text-white/70',
};

const ALIGN = {
  start: 'items-start text-left',
  center: 'items-center text-center',
  end: 'items-end text-right',
} as const;

/**
 * A labelled figure — the `ROUND SCORE 8` / `TOTAL 31 PTS` / `RANK #2` unit
 * that repeats across every broadcast card.
 */
export function Stat({
  label,
  value,
  sub,
  suffix,
  size = 'md',
  tone = 'default',
  align = 'start',
  animate = true,
  className,
  valueClassName,
}: StatProps) {
  const numeric = typeof value === 'number' && Number.isFinite(value);

  return (
    <div className={cn('flex flex-col gap-[0.3em]', ALIGN[align], className)}>
      <span className={cn('u-label', LABEL_SIZE[size], LABEL_TONE[tone])}>{label}</span>
      <span
        className={cn(
          'u-numeral flex items-baseline gap-[0.18em] whitespace-nowrap',
          VALUE_SIZE[size],
          VALUE_TONE[tone],
          valueClassName,
        )}
      >
        {numeric && animate ? <AnimatedNumber value={value} /> : value}
        {suffix ? (
          <span className={cn('u-label text-[0.3em]', LABEL_TONE[tone])}>{suffix}</span>
        ) : null}
      </span>
      {sub ? (
        <span className={cn('u-label opacity-80', LABEL_SIZE[size], LABEL_TONE[tone])}>
          {sub}
        </span>
      ) : null}
    </div>
  );
}

export default Stat;
