'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { ScoreNumeral } from '@/components/ui/ScoreNumeral';
import { DURATION, EASE, useMotionScale } from '@/components/ui/motion-tokens';
import { teamAccentVars } from '@/components/ui/team-accent';
import { PlayerGhost } from '@/components/player/PlayerGhost';
import { PlayerNameLockup } from '@/components/player/PlayerNameLockup';
import { PlayerPhoto } from '@/components/player/PlayerPhoto';
import {
  rankOf,
  teamCodeOf,
  totalPointsOf,
  type PlayerCardBaseProps,
} from '@/components/player/player-identity';

export type PodiumCardSize = 'sm' | 'md' | 'lg' | 'hero';

export interface PodiumCardStat {
  label: string;
  value: number | string;
}

export interface PodiumCardProps extends PlayerCardBaseProps {
  /** Finishing place, 1-based. Defaults to the player's own `rank`. */
  place?: number | null;
  /** Final total. Defaults to the player's own `totalPoints`. */
  points?: number | null;
  /** Per-challenge breakdown, shown on the #1 reveal. */
  stats?: PodiumCardStat[];
  /** Big all-caps line above the name, e.g. `TOP PLAYER`. */
  headline?: ReactNode;
  /**
   * Drives the staged ceremony reveal. `false` holds the card off-stage;
   * flip it to `true` when the phase advances.
   */
  revealed?: boolean;
  /** Plinth height as a fraction of the card, 0–1. Derived from `place` if omitted. */
  plinth?: number;
  size?: PodiumCardSize;
  /** Delay the reveal, in seconds — for staggering #5 → #1. */
  delay?: number;
}

const SIZE: Record<PodiumCardSize, { base: string; name: 'sm' | 'md' | 'lg' | 'hero'; score: 'sm' | 'md' | 'lg' | 'xl' }> = {
  sm: { base: 'text-[0.75rem]', name: 'sm', score: 'sm' },
  md: { base: 'text-[0.9rem]', name: 'md', score: 'md' },
  lg: { base: 'text-[1.05rem]', name: 'lg', score: 'lg' },
  hero: { base: 'text-[1.25rem]', name: 'hero', score: 'xl' },
};

const MEDAL: Record<number, { field: string; type: string; rule: string }> = {
  1: { field: 'bg-gold-soft', type: 'text-gold', rule: 'bg-gold' },
  2: { field: 'bg-silver-soft', type: 'text-silver', rule: 'bg-silver' },
  3: { field: 'bg-bronze-soft', type: 'text-bronze', rule: 'bg-bronze' },
};

const DEFAULT_PLINTH: Record<number, number> = { 1: 0.22, 2: 0.16, 3: 0.12 };

/**
 * The ceremony card (design.md screen 08). Ranks 1–3 take their medal
 * treatment; 4 and 5 fall back to the house aqua so the podium still reads as
 * one family.
 *
 * `revealed` drives the staged reveal — hold every card at `false`, then flip
 * them #5 → #1 as the ceremony advances.
 */
export function PodiumCard({
  player,
  teamColor,
  teamCode,
  teamName,
  place,
  points,
  stats,
  headline,
  revealed = true,
  plinth,
  size = 'md',
  delay = 0,
  className,
  style,
}: PodiumCardProps) {
  const motionOn = useMotionScale() === 1;
  const s = SIZE[size];

  const code = teamCode ?? teamCodeOf(player);
  const finish = place ?? rankOf(player);
  const total = points ?? totalPointsOf(player);
  const medal = finish != null ? MEDAL[finish] : undefined;
  const plinthHeight = plinth ?? (finish != null ? (DEFAULT_PLINTH[finish] ?? 0.08) : 0.08);

  return (
    <motion.article
      data-podium-card={finish ?? undefined}
      style={{ ...teamAccentVars(teamColor, code), ...style }}
      initial={motionOn ? { opacity: 0, y: 56, scale: 0.94 } : false}
      animate={
        revealed
          ? { opacity: 1, y: 0, scale: 1 }
          : { opacity: 0, y: 56, scale: 0.94 }
      }
      transition={{ duration: DURATION.hero, ease: EASE.entrance, delay }}
      className={cn(
        'relative isolate flex h-full w-full flex-col overflow-hidden rounded-xl',
        medal?.field ?? 'bg-aqua-50',
        'shadow-card ring-1 ring-border-subtle',
        s.base,
        className,
      )}
    >
      <PlayerGhost player={player} number={false} placement="center" scale={1.2} />

      {/* Oversized place numeral behind the player. */}
      {finish != null ? (
        <span
          aria-hidden
          className={cn(
            'u-numeral pointer-events-none absolute top-[3%] left-[4%] text-[6em] leading-none opacity-25',
            medal?.type ?? 'text-aqua-600',
          )}
        >
          {finish}
        </span>
      ) : null}

      <div className="relative z-10 min-h-0 flex-1">
        <PlayerPhoto player={player} fit="contain" />
      </div>

      <div className="relative z-20 flex flex-col items-center gap-[0.5em] px-[7%] pb-[5%] text-center">
        {headline ? (
          <span className={cn('u-display text-[1.5em] leading-none', medal?.type ?? 'text-aqua-700')}>
            {headline}
          </span>
        ) : null}

        <PlayerNameLockup
          player={player}
          size={s.name}
          align="center"
          eyebrow={teamName ?? undefined}
        />

        {total != null ? (
          <ScoreNumeral
            value={total}
            suffix="PTS"
            size={s.score}
            tone="default"
            align="center"
            labelPlacement="none"
          />
        ) : null}

        {stats && stats.length > 0 ? (
          <dl className="mt-[0.4em] grid w-full grid-cols-1 gap-y-1">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-border-subtle/70 flex items-baseline justify-between gap-3 border-b pb-1 last:border-b-0"
              >
                <dt className="u-label text-text-muted text-[0.62em]">{stat.label}</dt>
                <dd className="u-numeral u-tabular text-ink text-[0.95em]">{stat.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {/* The plinth. */}
      <span
        aria-hidden
        className={cn('relative z-20 w-full', medal?.rule ?? 'bg-aqua-400')}
        style={{ height: `${(plinthHeight * 100).toFixed(1)}%`, minHeight: '0.5em' }}
      />
    </motion.article>
  );
}

export default PodiumCard;
