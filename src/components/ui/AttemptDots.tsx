import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type AttemptDotState = 'hit' | 'miss' | 'pending' | 'active' | 'skipped';

export type AttemptDotsSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AttemptDotsProps {
  /** One entry per attempt, in order. */
  attempts: AttemptDotState[];
  /** Pad the rail out to this many slots with `pending`. Challenge 4 = 10. */
  total?: number;
  /**
   * Points scored per attempt, rendered under the dot. Use for the
   * `5 • 3 • —` attempt history on the 1v1 screens; omit for the
   * `✓ ✓ × ● ● ●` ball rail.
   */
  values?: Array<number | null | undefined>;
  size?: AttemptDotsSize;
  /** All-caps caption, e.g. `ATTEMPT 2 / 3`. */
  label?: ReactNode;
  align?: 'start' | 'center' | 'end';
  /** Accessible name for the rail. */
  ariaLabel?: string;
  className?: string;
}

const GLYPH: Record<AttemptDotState, string> = {
  hit: '✓',
  miss: '×',
  pending: '●',
  active: '●',
  skipped: '–',
};

const SPOKEN: Record<AttemptDotState, string> = {
  hit: 'scored',
  miss: 'missed',
  pending: 'not played',
  active: 'in play',
  skipped: 'skipped',
};

const SKIN: Record<AttemptDotState, string> = {
  hit: 'bg-winner-soft text-winner ring-1 ring-winner/25',
  miss: 'bg-live-soft text-live ring-1 ring-live/25',
  pending: 'bg-white text-pending/45 ring-1 ring-border-subtle',
  active: 'bg-white text-live ring-2 ring-live/60',
  skipped: 'bg-mist text-pending ring-1 ring-border-subtle',
};

const SIZE: Record<AttemptDotsSize, { dot: string; glyph: string; value: string; gap: string }> = {
  sm: { dot: 'size-5', glyph: 'text-[0.625rem]', value: 'text-[0.5625rem]', gap: 'gap-1.5' },
  md: { dot: 'size-8', glyph: 'text-[0.875rem]', value: 'text-eyebrow', gap: 'gap-2' },
  lg: { dot: 'size-12', glyph: 'text-[1.25rem]', value: 'text-label', gap: 'gap-3' },
  xl: { dot: 'size-16', glyph: 'text-[1.75rem]', value: 'text-[1rem]', gap: 'gap-4' },
};

const ALIGN = {
  start: 'items-start',
  center: 'items-center',
  end: 'items-end',
} as const;

/**
 * The attempt / ball rail: `✓ ✓ × ● ● ● ● ● ● ●`.
 *
 * Used for Challenge 4's ten balls, for the three-attempt history on
 * Challenges 1–3, and for a penalty shootout. State is carried by the glyph
 * first and the colour second, so it survives a colour-blind viewer and a
 * badly calibrated LED wall.
 */
export function AttemptDots({
  attempts,
  total,
  values,
  size = 'md',
  label,
  align = 'start',
  ariaLabel = 'Attempts',
  className,
}: AttemptDotsProps) {
  const s = SIZE[size];
  const filled: AttemptDotState[] =
    total && total > attempts.length
      ? [...attempts, ...Array<AttemptDotState>(total - attempts.length).fill('pending')]
      : attempts;

  return (
    <div className={cn('flex flex-col gap-2', ALIGN[align], className)} data-attempt-dots>
      {label ? <span className="u-label text-text-muted text-eyebrow">{label}</span> : null}

      <ol className={cn('flex flex-wrap', ALIGN[align], s.gap)} aria-label={ariaLabel}>
        {filled.map((state, index) => {
          const value = values?.[index];
          return (
            <li key={index} className="flex flex-col items-center gap-1">
              <span
                data-attempt-state={state}
                data-state-glyph
                data-motion={state === 'active' ? 'loop' : undefined}
                className={cn(
                  'flex items-center justify-center rounded-full leading-none',
                  s.dot,
                  s.glyph,
                  SKIN[state],
                  state === 'active' && 'animate-attempt-pulse',
                )}
              >
                <span aria-hidden>{GLYPH[state]}</span>
                <span className="u-sr-only">{`Attempt ${index + 1} ${SPOKEN[state]}`}</span>
              </span>

              {values ? (
                <span className={cn('u-numeral u-tabular text-text-muted', s.value)}>
                  {value == null ? '—' : value}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Turn a count of played attempts into a dot rail, marking the next slot
 * `active` while the round is live.
 */
export function attemptDotStates(
  results: Array<'hit' | 'miss'>,
  total: number,
  live = false,
): AttemptDotState[] {
  const out: AttemptDotState[] = results.slice(0, total);
  if (live && out.length < total) out.push('active');
  while (out.length < total) out.push('pending');
  return out;
}

export default AttemptDots;
