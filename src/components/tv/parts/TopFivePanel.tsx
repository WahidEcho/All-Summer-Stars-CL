'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { CompactPlayerCard } from '@/components/player';
import { DURATION, EASE, staggerFor, useMotionScale } from '@/components/ui';
import type { RankedPlayer, TeamCode, TeamRow } from '@/lib/types';

export interface TopFivePanelProps {
  players: ReadonlyArray<RankedPlayer>;
  teams: Record<TeamCode, TeamRow | null>;
  /** Panel caption. */
  title?: string;
  /** Rank a player held before the last change — drives `↑ 2 POSITIONS`. */
  previousRanks?: Map<string, number>;
  size?: 'sm' | 'md' | 'lg';
  /** Delay the whole group's entrance, in seconds. */
  delay?: number;
  /** Give the #1 row the larger treatment the brief asks for. Default true. */
  emphasiseLeader?: boolean;
  className?: string;
}

const GAP = { sm: 'gap-2', md: 'gap-3', lg: 'gap-4' } as const;
const TITLE = { sm: 'text-[16px]', md: 'text-[20px]', lg: 'text-[26px]' } as const;

/**
 * `TOP 5 PLAYERS` — the panel that keeps the individual prize race in front of
 * the room on every scene that has space for it.
 *
 * Rows carry `layout` from `CompactPlayerCard`, so when the standings reorder
 * the cards travel to their new position instead of teleporting.
 */
export function TopFivePanel({
  players,
  teams,
  title = 'TOP 5 PLAYERS',
  previousRanks,
  size = 'md',
  delay = 0,
  emphasiseLeader = true,
  className,
}: TopFivePanelProps) {
  const motionOn = useMotionScale() === 1;
  const step = staggerFor(Math.max(players.length, 1));

  return (
    <div data-top-five className={cn('flex min-h-0 flex-col', GAP[size], className)}>
      {title ? (
        <div className="flex items-baseline justify-between gap-4">
          <span className={cn('u-label text-aqua-800', TITLE[size])}>{title}</span>
          <span className="u-eyebrow text-text-muted text-[13px]">TOTAL PTS</span>
        </div>
      ) : null}

      <ol className={cn('flex min-h-0 flex-1 flex-col', GAP[size])}>
        {players.map((player, index) => {
          const team = player.teamCode ? teams[player.teamCode] : null;
          return (
            <motion.li
              key={player.id}
              layout={motionOn ? 'position' : false}
              initial={motionOn ? { opacity: 0, x: 34 } : false}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: DURATION.card,
                ease: EASE.entrance,
                delay: delay + index * step,
              }}
              className="min-h-0"
            >
              <CompactPlayerCard
                player={player}
                teamColor={team?.color}
                teamCode={player.teamCode}
                teamName={team?.short_name ?? team?.name ?? undefined}
                previousRank={previousRanks?.get(player.id) ?? null}
                emphasis={emphasiseLeader && index === 0 ? 'leader' : 'default'}
                size={size === 'lg' ? 'lg' : size === 'sm' ? 'sm' : 'md'}
              />
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}

export default TopFivePanel;
