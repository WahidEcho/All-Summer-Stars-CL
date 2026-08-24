'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { AttemptDots, type AttemptDotState } from '@/components/ui/AttemptDots';
import { PointsBurst } from '@/components/ui/PointsBurst';
import { RankBadge } from '@/components/ui/RankBadge';
import { ScoreNumeral } from '@/components/ui/ScoreNumeral';
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

export type LiveSideCardSize = 'sm' | 'md' | 'lg';

export interface LiveSideCardProps extends PlayerCardBaseProps {
  /** Mirrors the layout so a pair of cards frames the centre of the screen. */
  side?: 'left' | 'right';
  /** Points in the round being played right now. */
  roundScore?: number | null;
  roundLabel?: string;
  /** Overall total. Defaults to the player's own `totalPoints`. */
  totalPoints?: number | null;
  /** Overall rank. Defaults to the player's own `rank`. */
  rank?: number | null;
  sharedRank?: boolean;
  /** Attempt rail under the figures. */
  attempts?: AttemptDotState[];
  attemptTotal?: number;
  /** This player has the ball — outlines the card and lifts it. */
  active?: boolean;
  /** A `<StatusPill>` in the header row. */
  status?: ReactNode;
  burst?: number | null;
  burstKey?: string | number;
  onBurstComplete?: () => void;
  size?: LiveSideCardSize;
  /** Width of the portrait tile. Default `36%`. */
  photoWidth?: string;
}

const SIZE: Record<
  LiveSideCardSize,
  { base: string; name: 'sm' | 'md' | 'lg'; score: 'sm' | 'md' | 'lg'; pad: string }
> = {
  sm: { base: 'text-[0.75rem]', name: 'sm', score: 'sm', pad: 'p-3' },
  md: { base: 'text-[0.875rem]', name: 'md', score: 'md', pad: 'p-4' },
  lg: { base: 'text-[1rem]', name: 'lg', score: 'lg', pad: 'p-5' },
};

/**
 * The boxed live card for one side of a round — the dashboard's "current live
 * battle" halves, and the panel a scorekeeper watches while entering attempts.
 *
 * More compact than `HeadToHeadCard` and safe inside a fixed-height column.
 */
export function LiveSideCard({
  player,
  teamColor,
  teamCode,
  teamName,
  slotLabel,
  side = 'left',
  roundScore = null,
  roundLabel = 'ROUND',
  totalPoints,
  rank,
  sharedRank,
  attempts,
  attemptTotal,
  active = false,
  status,
  burst = null,
  burstKey,
  onBurstComplete,
  size = 'md',
  photoWidth = '36%',
  className,
  style,
}: LiveSideCardProps) {
  const s = SIZE[size];
  const code = teamCode ?? teamCodeOf(player);
  const slot = slotLabel ?? slotLabelOf(player);
  const total = totalPoints ?? totalPointsOf(player);
  const place = rank ?? rankOf(player);
  const shared = sharedRank ?? ('sharedRank' in player ? player.sharedRank : false);
  const align = side === 'left' ? 'start' : 'end';

  return (
    <article
      data-live-side-card={side}
      data-active={active || undefined}
      style={{ ...teamAccentVars(teamColor, code), ...style }}
      className={cn(
        'bg-surface-raised relative isolate flex overflow-hidden rounded-lg',
        side === 'right' && 'flex-row-reverse',
        active
          ? 'shadow-raised ring-2 ring-[color:var(--team-accent)]'
          : 'shadow-card ring-1 ring-border-subtle',
        s.base,
        className,
      )}
    >
      {/* Portrait tile. */}
      <div
        className="relative shrink-0 self-stretch bg-[color-mix(in_oklab,var(--team-accent)_10%,white)]"
        style={{ width: photoWidth }}
      >
        <PlayerPhoto player={player} fit="cover" fade={false} />
        <span
          aria-hidden
          className={cn(
            'absolute inset-y-0 w-[0.35em] bg-[color:var(--team-accent)]',
            side === 'left' ? 'right-0' : 'left-0',
          )}
        />
        {slot ? (
          <span className="u-numeral bg-white/88 text-ink absolute top-1.5 left-1.5 rounded-xs px-1.5 text-[1.05em] leading-tight">
            {slot}
          </span>
        ) : null}
      </div>

      {/* Text column. */}
      <div
        className={cn(
          'relative flex min-w-0 flex-1 flex-col justify-between gap-[0.6em]',
          s.pad,
          side === 'right' && 'items-end text-right',
        )}
      >
        <div
          className={cn(
            'flex w-full items-start justify-between gap-2',
            side === 'right' && 'flex-row-reverse',
          )}
        >
          <PlayerNameLockup
            player={player}
            size={s.name}
            align={align}
            eyebrow={teamName ?? undefined}
            className="min-w-0"
          />
          <RankBadge
            rank={place}
            shared={shared}
            size="sm"
            tone={place === 1 ? 'medal' : 'default'}
          />
        </div>

        <div
          className={cn(
            'flex flex-wrap items-end gap-x-[1.2em] gap-y-1.5',
            side === 'right' && 'flex-row-reverse',
          )}
        >
          {roundScore != null ? (
            <ScoreNumeral
              value={roundScore}
              label={roundLabel}
              size={s.score}
              tone="team"
              align={align}
            />
          ) : null}
          {total != null ? (
            <ScoreNumeral
              value={total}
              label="TOTAL"
              suffix="PTS"
              size="sm"
              tone="muted"
              align={align}
            />
          ) : null}
        </div>

        {attempts && attempts.length > 0 ? (
          <AttemptDots attempts={attempts} total={attemptTotal} size="sm" align={align} />
        ) : null}

        {status ? <div>{status}</div> : null}

        <PointsBurst
          value={burst}
          burstKey={burstKey}
          size="md"
          tone="team"
          onComplete={onBurstComplete}
          className={cn('bottom-[38%]', side === 'left' ? 'right-[8%]' : 'left-[8%]')}
        />
      </div>
    </article>
  );
}

export default LiveSideCard;
