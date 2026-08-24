'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { RankBadge } from '@/components/ui/RankBadge';
import { ScoreNumeral } from '@/components/ui/ScoreNumeral';
import { DURATION, EASE, useMotionScale } from '@/components/ui/motion-tokens';
import { teamAccentVars } from '@/components/ui/team-accent';
import { PlayerNameLockup } from '@/components/player/PlayerNameLockup';
import { PlayerPhoto } from '@/components/player/PlayerPhoto';
import {
  rankOf,
  slotLabelOf,
  teamCodeOf,
  totalPointsOf,
  type PlayerCardBaseProps,
} from '@/components/player/player-identity';

export type LineupCardStatus = 'upcoming' | 'live' | 'played' | 'idle';
export type LineupCardSize = 'sm' | 'md' | 'lg';

export interface LineupCardProps extends PlayerCardBaseProps {
  /** Lineup slot. Defaults to the player's own `slotLabel`. */
  slotLabel?: string | null;
  /** Overall total. Defaults to the player's own `totalPoints`. Hidden if null. */
  points?: number | null;
  pointsLabel?: string;
  /** Overall rank. Defaults to the player's own `rank`. Hidden if null. */
  rank?: number | null;
  sharedRank?: boolean;
  /** Where this slot is in the running order. */
  status?: LineupCardStatus;
  /** A `<StatusPill>` under the name. */
  badge?: ReactNode;
  size?: LineupCardSize;
  /** Stagger index for the grid entrance. */
  index?: number;
  animateIn?: boolean;
}

const SIZE: Record<LineupCardSize, { base: string; name: 'xs' | 'sm' | 'md'; pad: string }> = {
  sm: { base: 'text-[0.7rem]', name: 'xs', pad: 'p-2.5', },
  md: { base: 'text-[0.8125rem]', name: 'sm', pad: 'p-3' },
  lg: { base: 'text-[0.9375rem]', name: 'md', pad: 'p-4' },
};

const STATUS: Record<LineupCardStatus, string> = {
  upcoming: 'ring-1 ring-border-subtle',
  live: 'ring-2 ring-live shadow-raised',
  played: 'ring-1 ring-border-subtle opacity-[0.88]',
  idle: 'ring-1 ring-border-subtle',
};

/**
 * A squad-grid card: the portrait tile a spectator sees on the lineups screen
 * and the tile an admin taps to pick a scorer.
 *
 * Portrait-first like every other card in the family, so a player is instantly
 * recognisable whether they are in a 10-up grid or filling the LED wall.
 */
export function LineupCard({
  player,
  teamColor,
  teamCode,
  teamName,
  slotLabel,
  points,
  pointsLabel = 'PTS',
  rank,
  sharedRank,
  status = 'idle',
  badge,
  size = 'md',
  index = 0,
  animateIn = true,
  className,
  style,
}: LineupCardProps) {
  const motionOn = useMotionScale() === 1 && animateIn;
  const s = SIZE[size];

  const code = teamCode ?? teamCodeOf(player);
  const slot = slotLabel ?? slotLabelOf(player);
  const total = points ?? totalPointsOf(player);
  const place = rank ?? rankOf(player);
  const shared = sharedRank ?? ('sharedRank' in player ? player.sharedRank : false);

  return (
    <motion.article
      data-lineup-card={status}
      style={{ ...teamAccentVars(teamColor, code), ...style }}
      initial={motionOn ? { opacity: 0, y: 26 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: DURATION.card,
        ease: EASE.entrance,
        delay: Math.min(index * 0.06, 0.6),
      }}
      className={cn(
        'bg-surface-raised relative isolate flex flex-col overflow-hidden rounded-lg shadow-card',
        STATUS[status],
        s.base,
        className,
      )}
    >
      <div className="relative aspect-[3/4] w-full bg-[color-mix(in_oklab,var(--team-accent)_10%,white)]">
        <PlayerPhoto player={player} fit="cover" fade={false} />

        {slot ? (
          <span className="u-numeral bg-[color:var(--team-accent)] text-[color:var(--team-accent-contrast)] absolute top-0 left-0 rounded-br-md px-2 py-0.5 text-[1.2em] leading-tight">
            {slot}
          </span>
        ) : null}

        {player.jersey_number != null ? (
          <span
            aria-hidden
            className="u-numeral absolute right-1.5 bottom-1 text-[2.2em] leading-none text-white/70"
          >
            {player.jersey_number}
          </span>
        ) : null}

        {place != null ? (
          <RankBadge
            rank={place}
            shared={shared}
            size="xs"
            tone={place <= 3 ? 'medal' : 'default'}
            className="absolute top-1.5 right-1.5"
          />
        ) : null}
      </div>

      <div className={cn('flex flex-1 flex-col gap-1.5', s.pad)}>
        <PlayerNameLockup
          player={player}
          size={s.name}
          eyebrow={teamName ?? undefined}
          showFirstName={size !== 'sm'}
        />
        {badge}
        {total != null ? (
          <ScoreNumeral
            value={total}
            suffix={pointsLabel}
            size="xs"
            tone="team"
            align="start"
            labelPlacement="none"
            className="mt-auto"
          />
        ) : null}
      </div>

      <span aria-hidden className="h-1 w-full bg-[color:var(--team-accent)]" />
    </motion.article>
  );
}

export default LineupCard;
