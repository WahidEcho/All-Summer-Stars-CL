import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type StatusPillTone =
  | 'live'
  | 'winner'
  | 'draw'
  | 'pending'
  | 'neutral'
  | 'accent'
  | 'team'
  | 'ink';

export type StatusPillVariant = 'solid' | 'soft' | 'outline';
export type StatusPillSize = 'sm' | 'md' | 'lg';

export interface StatusPillProps {
  /** The word itself — `LIVE`, `ROUND WINNER`, `STARTING SOON`. */
  label: ReactNode;
  tone?: StatusPillTone;
  variant?: StatusPillVariant;
  size?: StatusPillSize;
  /**
   * Leading glyph. Every tone has a default so state is never carried by
   * colour alone. Pass `false` only when the label already contains a symbol.
   */
  glyph?: ReactNode | false;
  /** Pulse the glyph. Ignored under `prefers-reduced-motion`. */
  pulse?: boolean;
  className?: string;
}

/** Colour-independent glyphs. Required for WCAG 1.4.1. */
const GLYPH: Record<StatusPillTone, string> = {
  live: '●', // ●
  winner: '✓', // ✓
  draw: '=', // =
  pending: '○', // ○
  neutral: '•', // •
  accent: '★', // ★
  team: '▰', // ▰
  ink: '•',
};

const SOLID: Record<StatusPillTone, string> = {
  live: 'bg-live text-white',
  winner: 'bg-winner text-white',
  draw: 'bg-draw text-white',
  pending: 'bg-pending text-white',
  neutral: 'bg-haze text-ink',
  accent: 'bg-aqua-400 text-navy',
  team: 'bg-[color:var(--team-accent)] text-white',
  ink: 'bg-ink text-white',
};

const SOFT: Record<StatusPillTone, string> = {
  live: 'bg-live-soft text-live',
  winner: 'bg-winner-soft text-winner',
  draw: 'bg-draw-soft text-draw',
  pending: 'bg-pending-soft text-pending',
  neutral: 'bg-mist text-ink-soft',
  accent: 'bg-aqua-100 text-aqua-800',
  team: 'bg-[color-mix(in_oklab,var(--team-accent)_14%,transparent)] text-[color:var(--team-accent-ink)]',
  ink: 'bg-haze text-ink',
};

const OUTLINE: Record<StatusPillTone, string> = {
  live: 'text-live ring-1 ring-live/40',
  winner: 'text-winner ring-1 ring-winner/40',
  draw: 'text-draw ring-1 ring-draw/40',
  pending: 'text-pending ring-1 ring-pending/35',
  neutral: 'text-ink-soft ring-1 ring-border',
  accent: 'text-aqua-800 ring-1 ring-aqua-400',
  team: 'text-[color:var(--team-accent-ink)] ring-1 ring-[color:var(--team-accent)]',
  ink: 'text-ink ring-1 ring-border-ink',
};

const SIZE: Record<StatusPillSize, string> = {
  sm: 'h-6 gap-1.5 px-2.5 text-[0.625rem]',
  md: 'h-8 gap-2 px-3.5 text-eyebrow',
  lg: 'h-11 gap-2.5 px-5 text-label',
};

const GLYPH_SIZE: Record<StatusPillSize, string> = {
  sm: 'text-[0.5rem]',
  md: 'text-[0.5625rem]',
  lg: 'text-[0.6875rem]',
};

/**
 * The small state marker used everywhere: `LIVE`, `STARTING SOON`,
 * `ROUND DRAW`, `AWAITING RESULT`.
 *
 * Server component — no hooks — so it can be rendered from any surface. The
 * pulse is CSS-driven and is switched off by the reduced-motion block in
 * `globals.css`.
 */
export function StatusPill({
  label,
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  glyph,
  pulse = tone === 'live',
  className,
}: StatusPillProps) {
  const skin =
    variant === 'solid' ? SOLID[tone] : variant === 'outline' ? OUTLINE[tone] : SOFT[tone];
  const mark = glyph === false ? null : (glyph ?? GLYPH[tone]);

  return (
    <span
      data-status-pill={tone}
      className={cn(
        'u-label inline-flex shrink-0 items-center rounded-pill',
        'whitespace-nowrap',
        SIZE[size],
        skin,
        className,
      )}
    >
      {mark ? (
        <span
          aria-hidden
          data-state-glyph
          data-motion={pulse ? 'loop' : undefined}
          className={cn(
            'inline-block leading-none',
            GLYPH_SIZE[size],
            pulse && 'animate-live-pulse',
          )}
        >
          {mark}
        </span>
      ) : null}
      <span>{label}</span>
    </span>
  );
}

/** Alias — the design docs call this a "pill". */
export const Pill = StatusPill;

export default StatusPill;
