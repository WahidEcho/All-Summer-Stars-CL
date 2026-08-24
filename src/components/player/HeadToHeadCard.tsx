'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { AttemptDots, type AttemptDotState } from '@/components/ui/AttemptDots';
import { PointsBurst } from '@/components/ui/PointsBurst';
import { RankBadge } from '@/components/ui/RankBadge';
import { ScoreNumeral } from '@/components/ui/ScoreNumeral';
import { teamAccentVars } from '@/components/ui/team-accent';
import { DURATION, EASE, useMotionScale } from '@/components/ui/motion-tokens';
import { PlayerGhost } from '@/components/player/PlayerGhost';
import { PlayerNameLockup } from '@/components/player/PlayerNameLockup';
import { PlayerPhoto } from '@/components/player/PlayerPhoto';
import {
  rankOf,
  slotLabelOf,
  teamCodeOf,
  totalPointsOf,
  type PlayerCardBaseProps,
} from '@/components/player/player-identity';

export type HeadToHeadSize = 'md' | 'lg' | 'xl';

export interface HeadToHeadCardProps extends PlayerCardBaseProps {
  /** Which half of the screen this player occupies. Drives the mirroring. */
  side: 'left' | 'right';
  /** Points in the round currently being played. */
  roundScore?: number | null;
  roundLabel?: string;
  /** Overall total. Defaults to the player's own `totalPoints`. */
  totalPoints?: number | null;
  /** Overall rank. Defaults to the player's own `rank`. */
  rank?: number | null;
  sharedRank?: boolean;
  /** Attempt history rail — `✓ ✓ ×` or `5 • 3 • —`. */
  attempts?: AttemptDotState[];
  /** Points per attempt, shown under the dots. */
  attemptValues?: Array<number | null | undefined>;
  /** Pad the rail out to this many attempts. */
  attemptTotal?: number;
  /** This player is taking their turn right now — lifts and outlines the card. */
  active?: boolean;
  /** A `<StatusPill>` under the name. */
  status?: ReactNode;
  burst?: number | null;
  burstKey?: string | number;
  onBurstComplete?: () => void;
  size?: HeadToHeadSize;
  animateIn?: boolean;
  photoPriority?: boolean;
  showGhost?: boolean;
}

const SIZE: Record<HeadToHeadSize, { base: string; name: 'lg' | 'xl' | 'hero'; score: 'lg' | 'xl' }> = {
  md: { base: 'text-[0.85rem]', name: 'lg', score: 'lg' },
  lg: { base: 'text-[1rem]', name: 'xl', score: 'lg' },
  xl: { base: 'text-[1.15rem]', name: 'hero', score: 'xl' },
};

/**
 * One half of the cinematic 1v1 presentation (design.md screen 03).
 *
 * Deliberately chrome-less: the portrait bleeds into the field instead of
 * sitting inside a rectangle, exactly as the photo treatment section asks.
 * Place two of these either side of a `HeadToHeadPair` centre column, or use
 * `HeadToHeadPair` below and let it do the arrangement.
 */
export function HeadToHeadCard({
  player,
  teamColor,
  teamCode,
  teamName,
  slotLabel,
  side,
  roundScore = null,
  roundLabel = 'ROUND SCORE',
  totalPoints,
  rank,
  sharedRank,
  attempts,
  attemptValues,
  attemptTotal,
  active = false,
  status,
  burst = null,
  burstKey,
  onBurstComplete,
  size = 'lg',
  animateIn = true,
  photoPriority = true,
  showGhost = true,
  className,
  style,
}: HeadToHeadCardProps) {
  const motionOn = useMotionScale() === 1 && animateIn;
  const s = SIZE[size];
  const align = side === 'left' ? 'start' : 'end';

  const code = teamCode ?? teamCodeOf(player);
  const slot = slotLabel ?? slotLabelOf(player);
  const total = totalPoints ?? totalPointsOf(player);
  const place = rank ?? rankOf(player);
  const shared = sharedRank ?? ('sharedRank' in player ? player.sharedRank : false);

  return (
    <motion.article
      data-head-to-head={side}
      data-active={active || undefined}
      style={{ ...teamAccentVars(teamColor, code), ...style }}
      initial={motionOn ? { opacity: 0, x: side === 'left' ? -90 : 90 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DURATION.card, ease: EASE.entrance, delay: side === 'left' ? 0 : 0.18 }}
      className={cn(
        'relative isolate flex h-full min-w-0 flex-col',
        s.base,
        active && 'z-10',
        className,
      )}
    >
      {showGhost ? (
        <PlayerGhost player={player} placement={side} scale={1.1} />
      ) : null}

      {/* Portrait — the dominant element, bleeding into the field. */}
      <div className="relative z-10 min-h-0 flex-1">
        <PlayerPhoto
          player={player}
          fit="cover"
          priority={photoPriority}
          className={cn(active && 'scale-[1.02] transition-transform duration-500')}
        />
        <PointsBurst
          value={burst}
          burstKey={burstKey}
          size={size === 'xl' ? 'xl' : 'lg'}
          tone="team"
          onComplete={onBurstComplete}
          className={cn('bottom-[16%]', side === 'left' ? 'right-[8%]' : 'left-[8%]')}
        />
      </div>

      {/* Identity + figures. */}
      <div
        className={cn(
          'relative z-20 flex flex-col gap-[0.55em] px-[6%] pb-[4%]',
          side === 'left' ? 'items-start text-left' : 'items-end text-right',
        )}
      >
        <div
          className={cn(
            'flex items-center gap-3',
            side === 'right' && 'flex-row-reverse',
          )}
        >
          {slot ? (
            <span className="u-numeral text-[1.8em] leading-none text-[color:var(--team-accent)]">
              {slot}
            </span>
          ) : null}
          <RankBadge
            rank={place}
            shared={shared}
            size="sm"
            tone={place === 1 ? 'medal' : 'default'}
          />
          {status}
        </div>

        <PlayerNameLockup
          player={player}
          size={s.name}
          align={align}
          eyebrow={teamName ?? undefined}
        />

        <div
          className={cn(
            'flex flex-wrap items-end gap-x-[1.4em] gap-y-2',
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
              size="md"
              tone="muted"
              align={align}
            />
          ) : null}
        </div>

        {attempts && attempts.length > 0 ? (
          <AttemptDots
            attempts={attempts}
            total={attemptTotal}
            values={attemptValues}
            size={size === 'xl' ? 'lg' : 'md'}
            align={align}
          />
        ) : null}
      </div>

      <span
        aria-hidden
        className={cn(
          'relative z-20 h-[0.5em] w-full bg-[color:var(--team-accent)]',
          !active && 'opacity-70',
        )}
      />
    </motion.article>
  );
}

export interface HeadToHeadPairProps {
  /** Left-hand player (Team A by convention). */
  a: Omit<HeadToHeadCardProps, 'side'>;
  /** Right-hand player (Team B by convention). */
  b: Omit<HeadToHeadCardProps, 'side'>;
  /** Centre column — timer, attempt state, live score. Replaces `vsLabel`. */
  center?: ReactNode;
  /** Shown in the centre column when `center` is not given. */
  vsLabel?: ReactNode;
  /** Width of the centre column. design.md screen 03 specifies ~16%. */
  centerWidth?: string;
  className?: string;
}

/**
 * The complete 1v1 arrangement: ~42% player, ~16% centre, ~42% player.
 */
export function HeadToHeadPair({
  a,
  b,
  center,
  vsLabel = 'VS',
  centerWidth = '16%',
  className,
}: HeadToHeadPairProps) {
  return (
    <div
      data-head-to-head-pair
      className={cn('flex h-full w-full items-stretch', className)}
    >
      <div className="min-w-0 flex-1">
        <HeadToHeadCard {...a} side="left" />
      </div>

      <div
        className="flex shrink-0 flex-col items-center justify-center gap-4 px-2"
        style={{ width: centerWidth }}
      >
        {center ?? (
          <span className="u-display text-aqua-600 text-display-sm leading-none">{vsLabel}</span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <HeadToHeadCard {...b} side="right" />
      </div>
    </div>
  );
}

export default HeadToHeadCard;
