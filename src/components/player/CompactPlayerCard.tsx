'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { PointsBurst } from '@/components/ui/PointsBurst';
import { RankBadge } from '@/components/ui/RankBadge';
import { RankDelta } from '@/components/ui/RankDelta';
import { ScoreNumeral } from '@/components/ui/ScoreNumeral';
import { SPRING, useMotionScale } from '@/components/ui/motion-tokens';
import { teamAccentVars } from '@/components/ui/team-accent';
import { PlayerPhoto } from '@/components/player/PlayerPhoto';
import {
  displayNameOf,
  nameParts,
  rankOf,
  slotLabelOf,
  teamCodeOf,
  totalPointsOf,
  type PlayerCardBaseProps,
} from '@/components/player/player-identity';

export type CompactPlayerCardSize = 'sm' | 'md' | 'lg';
export type CompactPlayerCardEmphasis = 'leader' | 'default' | 'muted';

export interface CompactPlayerCardProps extends PlayerCardBaseProps {
  /** Overall rank. Defaults to the player's own `rank`. */
  rank?: number | null;
  sharedRank?: boolean;
  /** Figure on the right. Defaults to the player's own `totalPoints`. */
  points?: number | null;
  /** Caption under the figure. */
  pointsLabel?: string;
  /** Renders `↑ 2 POSITIONS` / `NEW LEADER` when it differs from `rank`. */
  previousRank?: number | null;
  /** `leader` makes the #1 row visibly larger, as the design brief requires. */
  emphasis?: CompactPlayerCardEmphasis;
  size?: CompactPlayerCardSize;
  /** A `<StatusPill>` beside the name. */
  status?: ReactNode;
  burst?: number | null;
  burstKey?: string | number;
  onBurstComplete?: () => void;
  /** Animate position changes when the leaderboard reorders. Default true. */
  reorder?: boolean;
  /** Render the full name rather than the surname alone. */
  showFullName?: boolean;
}

/**
 * `figure` steps the total down on a phone.
 *
 * The row is one line — badge, photo, name, total — so the total and the name
 * compete for the same width. At the full broadcast size a three-digit total
 * eats a 340px row whole and the name truncates to nothing, which inverts the
 * brief's hierarchy (player first, score second). Below `sm` the figure drops
 * to a size that still reads across a beach but leaves the name its room; from
 * `sm` up it is the designed step again. The breakpoint is safe for the LED
 * wall, which always composes at 1920.
 */
const SIZE: Record<
  CompactPlayerCardSize,
  { row: string; photo: string; name: string; score: 'xs' | 'sm' | 'md'; figure: string }
> = {
  sm: {
    row: 'gap-2.5 p-2',
    photo: 'size-9',
    name: 'text-[1rem]',
    score: 'xs',
    figure: 'text-[1.25rem] sm:text-[1.5rem]',
  },
  md: {
    row: 'gap-3.5 p-2.5',
    photo: 'size-12',
    name: 'text-[1.375rem]',
    score: 'sm',
    figure: 'text-[1.75rem] sm:text-score-sm',
  },
  lg: {
    row: 'gap-4 p-3.5',
    photo: 'size-16',
    name: 'text-[1.75rem]',
    score: 'md',
    figure: 'text-[2.25rem] sm:text-score-md',
  },
};

/**
 * The horizontal leaderboard row — Top 5 panels, squad lists, challenge
 * standings. Photo, rank, name, team, total.
 *
 * `emphasis="leader"` is how the brief's "#1 gets a visibly larger row" is
 * expressed; pass it for the first entry only.
 */
export function CompactPlayerCard({
  player,
  teamColor,
  teamCode,
  teamName,
  slotLabel,
  rank,
  sharedRank,
  points,
  pointsLabel = 'PTS',
  previousRank = null,
  emphasis = 'default',
  size = 'md',
  status,
  burst = null,
  burstKey,
  onBurstComplete,
  reorder = true,
  showFullName = false,
  className,
  style,
}: CompactPlayerCardProps) {
  const motionOn = useMotionScale() === 1;
  const s = SIZE[emphasis === 'leader' && size !== 'lg' ? 'lg' : size];

  const code = teamCode ?? teamCodeOf(player);
  const slot = slotLabel ?? slotLabelOf(player);
  const place = rank ?? rankOf(player);
  const total = points ?? totalPointsOf(player);
  const shared = sharedRank ?? ('sharedRank' in player ? player.sharedRank : false);
  const { last } = nameParts(player);

  return (
    <motion.div
      data-compact-player-card={emphasis}
      layout={reorder && motionOn ? 'position' : false}
      transition={SPRING.reorder}
      style={{ ...teamAccentVars(teamColor, code), ...style }}
      className={cn(
        'relative isolate flex items-center rounded-md',
        s.row,
        emphasis === 'leader'
          ? 'bg-surface-raised shadow-card ring-1 ring-[color:var(--team-accent)]'
          : emphasis === 'muted'
            ? 'bg-transparent'
            : 'bg-surface-raised ring-1 ring-border-subtle',
        className,
      )}
    >
      {/* Team accent spine. */}
      <span
        aria-hidden
        className="absolute inset-y-1.5 left-0 w-1 rounded-pill bg-[color:var(--team-accent)]"
      />

      <RankBadge
        rank={place}
        shared={shared}
        size={size === 'lg' || emphasis === 'leader' ? 'md' : 'sm'}
        tone={place != null && place <= 3 ? 'medal' : 'default'}
        className="ml-2 shrink-0"
      />

      <span
        className={cn(
          'shrink-0 overflow-hidden rounded-sm bg-[color-mix(in_oklab,var(--team-accent)_12%,white)]',
          s.photo,
        )}
      >
        <PlayerPhoto player={player} fit="cover" fade={false} />
      </span>

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={cn('u-display text-ink truncate leading-none', s.name)}>
          {showFullName ? displayNameOf(player) : last}
        </span>
        <span className="flex items-center gap-2">
          {slot ? (
            <span className="u-label text-[color:var(--team-accent-ink)] text-[0.625rem]">
              {slot}
            </span>
          ) : null}
          {teamName ? (
            <span className="u-label text-text-muted truncate text-[0.625rem]">{teamName}</span>
          ) : null}
          {status}
        </span>
      </span>

      {previousRank != null && place != null ? (
        <RankDelta from={previousRank} to={place} size="sm" className="shrink-0" />
      ) : null}

      {total != null ? (
        <ScoreNumeral
          value={total}
          suffix={pointsLabel}
          size={s.score}
          tone="default"
          align="end"
          labelPlacement="none"
          className="shrink-0 pr-1"
          valueClassName={s.figure}
        />
      ) : null}

      <PointsBurst
        value={burst}
        burstKey={burstKey}
        size="sm"
        tone="team"
        onComplete={onBurstComplete}
        className="right-[6%] bottom-[42%]"
      />
    </motion.div>
  );
}

export default CompactPlayerCard;
