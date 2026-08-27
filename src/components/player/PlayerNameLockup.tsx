import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import {
  firstNameScale,
  introNameParts,
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
  /**
   * Set the name as an introduction rather than a callout.
   *
   * The default lockup is a small first name tucked over an oversized surname,
   * and it earns that everywhere the surname is the thing being *called* — a
   * result card, a leaderboard row. A walk-out is the other thing: the player
   * is being introduced by their whole name to a crowd who may not know either
   * half, so neither half should be the footnote, and the name divides the way
   * an introduction does — the given name, then the family name entire, so
   * "Esam El Hadary" reads ESAM / EL HADARY rather than stranding "El".
   *
   * It also settles a collision. The stacked form leans on `--leading-slab`
   * (0.84), a line box deliberately shorter than the glyphs it holds, which is
   * what lets an oversized surname sit tight under its first name. At walk-out
   * size those glyphs climbed into the line above and the names overlapped.
   * Both names are set here on their own full line boxes instead.
   */
  introduction?: boolean;
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
  introduction = false,
  className,
}: PlayerNameLockupProps) {
  const { first, last, full } = introduction ? introNameParts(player) : nameParts(player);
  const skin = TONE[tone];

  // One size for both, taken from whichever name is longer so the wider of the
  // two still fits the card — sizing each to its own length would set a short
  // first name larger than the surname beneath it.
  const pairScale = surnameScale(first.length > last.length ? first : last);

  return (
    <div
      data-player-name
      className={cn('flex min-w-0 flex-col', ALIGN[align], className)}
      style={{ fontSize: BASE[size] }}
    >
      {eyebrow ? (
        <span
          className={cn(
            'u-label text-[0.24em]',
            // The number needs room of its own when the names below it are set
            // at full size, or it reads as part of the first name.
            introduction ? 'mb-[0.5em]' : 'mb-[0.22em]',
            skin.small,
          )}
        >
          {eyebrow}
        </span>
      ) : null}

      {showFirstName && first ? (
        <span
          className={cn(
            'u-display tracking-[0.01em]',
            introduction ? 'leading-[1.02] [overflow-wrap:anywhere]' : 'leading-[0.95]',
            skin.small,
          )}
          style={{
            fontSize: introduction
              ? `${pairScale.toFixed(3)}em`
              : `${(0.34 * firstNameScale(first)).toFixed(3)}em`,
          }}
        >
          {first}
        </span>
      ) : null}

      <span
        className={cn(
          'u-display [overflow-wrap:anywhere]',
          introduction ? 'leading-[1.02]' : 'leading-[var(--leading-slab)]',
          skin.name,
        )}
        style={{
          fontSize: `${(introduction ? pairScale : surnameScale(last)).toFixed(3)}em`,
        }}
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
