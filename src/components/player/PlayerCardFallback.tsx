import { cn } from '@/lib/cn';
import {
  initialsOf,
  type PlayerLike,
} from '@/components/player/player-identity';

export type PlayerCardFallbackTone = 'accent' | 'team' | 'mist';

export interface PlayerCardFallbackProps {
  /** When given, the initials and jersey number are read from the player. */
  player?: PlayerLike;
  /** Explicit initials. Overrides the player's. */
  initials?: string;
  /** Explicit jersey number. Overrides the player's. */
  jerseyNumber?: number | null;
  /** Show the initials lockup over the silhouette. Default true. */
  showInitials?: boolean;
  tone?: PlayerCardFallbackTone;
  className?: string;
}

const FIELD: Record<PlayerCardFallbackTone, string> = {
  accent:
    'bg-[linear-gradient(180deg,var(--color-aqua-100)_0%,var(--color-aqua-200)_100%)]',
  team: 'bg-[linear-gradient(180deg,color-mix(in_oklab,var(--team-accent)_10%,white)_0%,color-mix(in_oklab,var(--team-accent)_26%,white)_100%)]',
  mist: 'bg-[linear-gradient(180deg,var(--color-mist)_0%,var(--color-haze)_100%)]',
};

const SILHOUETTE: Record<PlayerCardFallbackTone, string> = {
  accent: 'var(--color-aqua-500)',
  team: 'var(--team-accent)',
  mist: 'var(--color-slate)',
};

/**
 * What a player card shows when `photo_url` is null.
 *
 * A branded silhouette with the player's initials and jersey number — never a
 * broken image icon, and never an empty box. It uses the same star geometry
 * and the same team accent as a real card, so a squad grid with three missing
 * photos still looks deliberate.
 */
export function PlayerCardFallback({
  player,
  initials,
  jerseyNumber,
  showInitials = true,
  tone = 'accent',
  className,
}: PlayerCardFallbackProps) {
  const marks = initials ?? (player ? initialsOf(player) : '?');
  const number = jerseyNumber ?? player?.jersey_number ?? null;

  return (
    <div
      data-player-fallback
      className={cn('relative h-full w-full overflow-hidden', FIELD[tone], className)}
      role="img"
      aria-label={player ? `${player.full_name}, no photo available` : 'No photo available'}
    >
      {/* Star geometry, matching the key art. */}
      <svg
        viewBox="0 0 200 260"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 h-full w-full"
        aria-hidden
      >
        <g fill="none" stroke={SILHOUETTE[tone]} strokeWidth={1.4} opacity={0.22}>
          <polygon points="100,10 122,78 194,78 136,120 158,190 100,148 42,190 64,120 6,78 78,78" />
          <polygon points="100,-30 134,74 244,74 155,138 189,244 100,180 11,244 45,138 -44,74 66,74" />
        </g>

        {/* Head and shoulders. */}
        <g fill={SILHOUETTE[tone]} opacity={0.38}>
          <circle cx="100" cy="104" r="44" />
          <path d="M 18 262 C 18 198 60 166 100 166 C 140 166 182 198 182 262 Z" />
        </g>
      </svg>

      {number != null ? (
        <span
          aria-hidden
          className="u-numeral absolute top-[6%] right-[7%] text-[3.5em] leading-none text-white/55"
        >
          {number}
        </span>
      ) : null}

      {showInitials ? (
        <span
          aria-hidden
          className="u-display absolute inset-x-0 bottom-[9%] text-center text-[3.2em] leading-none text-white drop-shadow-[0_2px_10px_rgb(14_42_51_/_0.35)]"
        >
          {marks}
        </span>
      ) : null}
    </div>
  );
}

export default PlayerCardFallback;
