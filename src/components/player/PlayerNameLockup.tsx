import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import {
  firstNameScale,
  nameParts,
  surnameScale,
  type PlayerLike,
} from '@/components/player/player-identity';

export type PlayerNameSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | 'hero';
export type PlayerNameTone = 'ink' | 'inverse' | 'team' | 'muted';

export interface PlayerNameLockupProps {
  player: PlayerLike;
  size?: PlayerNameSize;
  align?: 'start' | 'center' | 'end';
  /** Small caps line above the name — slot label, team, `ROUND WINNER`. */
  eyebrow?: ReactNode;
  /** Small caps line under the name. */
  sub?: ReactNode;
  tone?: PlayerNameTone;
  /** Render the first name on its own smaller line. Default true. */
  showFirstName?: boolean;
  className?: string;
}

/** Base size the whole lockup scales from. */
const BASE: Record<PlayerNameSize, string> = {
  xs: '1.125rem',
  sm: '1.625rem',
  md: '2.5rem',
  lg: '3.75rem',
  xl: '5.75rem',
  hero: '9rem',
};

const TONE: Record<PlayerNameTone, { name: string; small: string }> = {
  ink: { name: 'text-ink', small: 'text-text-muted' },
  inverse: { name: 'text-white', small: 'text-white/70' },
  team: { name: 'text-[color:var(--team-accent-ink)]', small: 'text-[color:var(--team-accent)]' },
  muted: { name: 'text-ink-soft', small: 'text-text-muted' },
};

const ALIGN = {
  start: 'items-start text-left',
  center: 'items-center text-center',
  end: 'items-end text-right',
} as const;

/**
 * The name lockup: small first name over an oversized surname.
 *
 * Long names step down through six size stops and are allowed to wrap onto a
 * second line — they are never truncated, never clipped and never squashed
 * horizontally, because a spectator who cannot read a player's name is the one
 * failure this whole design exists to prevent.
 */
export function PlayerNameLockup({
  player,
  size = 'md',
  align = 'start',
  eyebrow,
  sub,
  tone = 'ink',
  showFirstName = true,
  className,
}: PlayerNameLockupProps) {
  const { first, last, full } = nameParts(player);
  const skin = TONE[tone];

  return (
    <div
      data-player-name
      className={cn('flex min-w-0 flex-col', ALIGN[align], className)}
      style={{ fontSize: BASE[size] }}
    >
      {eyebrow ? (
        <span className={cn('u-label mb-[0.22em] text-[0.24em]', skin.small)}>{eyebrow}</span>
      ) : null}

      {showFirstName && first ? (
        <span
          className={cn('u-display leading-[0.95] tracking-[0.01em]', skin.small)}
          style={{ fontSize: `${(0.34 * firstNameScale(first)).toFixed(3)}em` }}
        >
          {first}
        </span>
      ) : null}

      <span
        className={cn(
          'u-display leading-[var(--leading-slab)] [overflow-wrap:anywhere]',
          skin.name,
        )}
        style={{ fontSize: `${surnameScale(last).toFixed(3)}em` }}
      >
        {last}
      </span>

      {sub ? (
        <span className={cn('u-label mt-[0.3em] text-[0.22em]', skin.small)}>{sub}</span>
      ) : null}

      {/* One clean string for assistive tech, regardless of how it is split. */}
      <span className="u-sr-only">{full}</span>
    </div>
  );
}

export default PlayerNameLockup;
