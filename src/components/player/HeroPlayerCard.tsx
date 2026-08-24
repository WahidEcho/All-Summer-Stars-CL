'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { PointsBurst } from '@/components/ui/PointsBurst';
import { RankBadge } from '@/components/ui/RankBadge';
import { RankDelta } from '@/components/ui/RankDelta';
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

export type HeroPlayerCardTone = 'default' | 'winner' | 'loser' | 'draw';
export type HeroPlayerCardSize = 'md' | 'lg' | 'xl';

export interface HeroPlayerCardProps extends PlayerCardBaseProps {
  /** Big all-caps line above the name — `ROUND WINNER`, `TOP PLAYER`, `GOAL`. */
  headline?: ReactNode;
  /** Small caps line above the headline — `CHALLENGE 02`, `A3`. */
  eyebrow?: ReactNode;
  /** Points in the current round or challenge. Hidden when null. */
  roundPoints?: number | null;
  roundLabel?: string;
  /** Overall total. Defaults to the player's own `totalPoints`. */
  totalPoints?: number | null;
  totalLabel?: string;
  /** Overall rank. Defaults to the player's own `rank`. */
  rank?: number | null;
  sharedRank?: boolean;
  /** Rank before the last change — renders `↑ 3 POSITIONS` when it differs. */
  previousRank?: number | null;
  /** A `<StatusPill>`, or anything, pinned under the headline. */
  status?: ReactNode;
  tone?: HeroPlayerCardTone;
  size?: HeroPlayerCardSize;
  /** `+N` beside the player. Set to `null` when nothing is being awarded. */
  burst?: number | null;
  /** Change this to re-fire the burst for a repeated value. */
  burstKey?: string | number;
  /** Fired when the burst lands — roll `totalPoints` from here. */
  onBurstComplete?: () => void;
  /**
   * CSS aspect ratio for the card. Default `3 / 4`. Pass `null` to let the
   * card fill whatever box the layout gives it (the 1v1 screens do this).
   */
  aspect?: string | null;
  /** Load the portrait eagerly. Set on the players actually on screen. */
  photoPriority?: boolean;
  /** Oversized jersey number and surname behind the player. Default true. */
  showGhost?: boolean;
  /** Play the entrance. Default true. */
  animateIn?: boolean;
  /** Which way the card slides in from. */
  from?: 'left' | 'right' | 'bottom' | 'none';
}

/**
 * The card is one em-scaled composition: `base` sets its root font size and
 * everything inside — ghost, slot, name lockup, accent bar — is expressed in
 * `em` of that root, so a card keeps its proportions in any box the layout
 * gives it.
 *
 * The figures have to follow the same rule. `ScoreNumeral`'s own steps are
 * absolute (`--text-score-lg` is 7rem, sized for a full-screen scoreboard);
 * dropped unmodified into a 275px card they overrun the lane and push the
 * total off the bottom edge. `primary`/`secondary` restate those steps in `em`
 * so the score stays subordinate to the player, which is the hierarchy the
 * brief asks for.
 */
const SIZE: Record<
  HeroPlayerCardSize,
  {
    base: string;
    name: 'lg' | 'xl' | 'hero';
    score: 'md' | 'lg' | 'xl';
    primary: string;
    secondary: string;
    scoreLabel: string;
  }
> = {
  md: {
    base: 'text-[0.9rem]',
    name: 'lg',
    score: 'md',
    primary: 'text-[3.1em]',
    secondary: 'text-[2.05em]',
    scoreLabel: 'text-[0.78em]',
  },
  lg: {
    base: 'text-[1.05rem]',
    name: 'xl',
    score: 'lg',
    primary: 'text-[3.3em]',
    secondary: 'text-[2.15em]',
    scoreLabel: 'text-[0.78em]',
  },
  xl: {
    base: 'text-[1.2rem]',
    name: 'hero',
    score: 'xl',
    primary: 'text-[3.6em]',
    secondary: 'text-[2.3em]',
    scoreLabel: 'text-[0.8em]',
  },
};

const TONE: Record<HeroPlayerCardTone, string> = {
  default: 'ring-1 ring-border-subtle',
  winner: 'ring-2 ring-[color:var(--team-accent)] shadow-hero',
  loser: 'ring-1 ring-border-subtle opacity-[0.92]',
  draw: 'ring-1 ring-draw/40',
};

const OFFSET = { left: -64, right: 64, bottom: 0, none: 0 } as const;

/**
 * The hero card — used for VS screens, goal takeovers, round winners and the
 * ceremony. Huge photograph, very little text, everything else subordinate.
 *
 * Composition guarantees the design brief asks for:
 *  - the portrait occupies the middle band, and the rank badge and score lanes
 *    sit above and below it, so neither can ever cover the player's face;
 *  - the surname steps down through six sizes and wraps rather than clipping;
 *  - a missing photo becomes the branded silhouette, not a broken image.
 *
 * Score choreography: render `burst`, then in `onBurstComplete` update
 * `totalPoints`. The burst travels, the total rolls, the rank badge flips.
 */
export function HeroPlayerCard({
  player,
  teamColor,
  teamCode,
  teamName,
  slotLabel,
  headline,
  eyebrow,
  roundPoints = null,
  roundLabel = 'ROUND',
  totalPoints,
  totalLabel = 'TOTAL',
  rank,
  sharedRank,
  previousRank = null,
  status,
  tone = 'default',
  size = 'lg',
  burst = null,
  burstKey,
  onBurstComplete,
  aspect = '3 / 4',
  photoPriority = false,
  showGhost = true,
  animateIn = true,
  from = 'bottom',
  className,
  style,
}: HeroPlayerCardProps) {
  const motionOn = useMotionScale() === 1 && animateIn;
  const s = SIZE[size];

  const code = teamCode ?? teamCodeOf(player);
  const slot = slotLabel ?? slotLabelOf(player);
  const total = totalPoints ?? totalPointsOf(player);
  const place = rank ?? rankOf(player);
  const shared = sharedRank ?? ('sharedRank' in player ? player.sharedRank : false);

  return (
    <motion.article
      data-hero-player-card={tone}
      style={{ ...teamAccentVars(teamColor, code), aspectRatio: aspect ?? undefined, ...style }}
      initial={motionOn ? { opacity: 0, x: OFFSET[from], y: from === 'bottom' ? 40 : 0 } : false}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ duration: DURATION.card, ease: EASE.entrance }}
      className={cn(
        'relative isolate flex h-full w-full flex-col overflow-hidden rounded-xl',
        'bg-[linear-gradient(180deg,var(--color-white)_0%,var(--color-aqua-50)_58%,color-mix(in_oklab,var(--team-accent)_12%,white)_100%)]',
        'shadow-card',
        s.base,
        TONE[tone],
        className,
      )}
    >
      {showGhost ? <PlayerGhost player={player} placement="center" /> : null}

      {/* Portrait band — deliberately inset so the lanes below never cover a face. */}
      <div className="absolute inset-x-0 top-[4%] bottom-[27%] z-10">
        <PlayerPhoto player={player} fit="cover" priority={photoPriority} />
      </div>

      {/* Top lane — context on the left, rank on the right. */}
      <div className="relative z-20 flex items-start justify-between gap-3 p-[5%]">
        <div className="flex min-w-0 flex-col gap-1.5">
          {eyebrow ? (
            <span className="u-eyebrow text-aqua-700 text-[0.68em]">{eyebrow}</span>
          ) : null}
          {slot ? (
            <span className="u-numeral text-[1.5em] leading-none text-[color:var(--team-accent)]">
              {slot}
            </span>
          ) : null}
          {headline ? (
            <span className="u-display text-ink text-[1.35em] leading-none">{headline}</span>
          ) : null}
          {status ? <div>{status}</div> : null}
        </div>

        <RankBadge
          rank={place}
          shared={shared}
          size={size === 'xl' ? 'lg' : 'md'}
          tone={place === 1 ? 'medal' : 'default'}
        />
      </div>

      <div className="flex-1" />

      {/* Bottom lane — name, then the figures. */}
      <div
        className={cn(
          'relative z-20 flex flex-col gap-[0.6em] px-[5%] pb-[5%] pt-[3%]',
          'bg-[linear-gradient(180deg,transparent_0%,color-mix(in_oklab,var(--color-white)_88%,transparent)_34%,var(--color-white)_100%)]',
        )}
      >
        <PlayerNameLockup
          player={player}
          size={s.name}
          eyebrow={teamName ?? undefined}
          align="start"
        />

        <div className="flex flex-wrap items-end gap-x-[1.4em] gap-y-2">
          {roundPoints != null ? (
            <ScoreNumeral
              value={roundPoints}
              label={roundLabel}
              size={s.score}
              tone="team"
              align="start"
              valueClassName={s.primary}
              labelClassName={s.scoreLabel}
            />
          ) : null}

          {total != null ? (
            <ScoreNumeral
              value={total}
              label={totalLabel}
              suffix="PTS"
              size={roundPoints != null ? 'md' : s.score}
              tone="default"
              align="start"
              valueClassName={roundPoints != null ? s.secondary : s.primary}
              labelClassName={s.scoreLabel}
            />
          ) : null}

          {previousRank != null && place != null ? (
            <RankDelta from={previousRank} to={place} size="sm" className="mb-1" />
          ) : null}
        </div>
      </div>

      {/* Team accent underneath the whole card. */}
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 z-20 h-[0.55em] bg-[color:var(--team-accent)]"
      />

      <PointsBurst
        value={burst}
        burstKey={burstKey}
        size={size === 'xl' ? 'xl' : 'lg'}
        tone="team"
        onComplete={onBurstComplete}
        className="right-[7%] bottom-[26%]"
      />
    </motion.article>
  );
}

export default HeroPlayerCard;
