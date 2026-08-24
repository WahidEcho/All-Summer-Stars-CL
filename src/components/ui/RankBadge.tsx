'use client';

import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { SPRING, useMotionScale } from '@/components/ui/motion-tokens';

export type RankBadgeSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type RankBadgeTone = 'default' | 'team' | 'ink' | 'inverse' | 'medal';

export interface RankBadgeProps {
  /** 1-based overall rank. `null` renders a dash, never an empty box. */
  rank: number | null | undefined;
  /** True when the player shares this rank — renders `=#3`. */
  shared?: boolean;
  size?: RankBadgeSize;
  /** `medal` paints gold / silver / bronze for ranks 1–3, default elsewhere. */
  tone?: RankBadgeTone;
  /** Pop the badge when the rank changes. Default true. */
  animate?: boolean;
  className?: string;
}

const SIZE: Record<RankBadgeSize, string> = {
  xs: 'h-6 min-w-6 px-1.5 text-[0.75rem]',
  sm: 'h-8 min-w-8 px-2 text-[1rem]',
  md: 'h-11 min-w-11 px-2.5 text-[1.5rem]',
  lg: 'h-16 min-w-16 px-3 text-[2.25rem]',
  xl: 'h-24 min-w-24 px-4 text-[3.5rem]',
};

const HASH: Record<RankBadgeSize, string> = {
  xs: 'text-[0.5rem]',
  sm: 'text-[0.625rem]',
  md: 'text-[0.75rem]',
  lg: 'text-[1rem]',
  xl: 'text-[1.5rem]',
};

const TONE: Record<Exclude<RankBadgeTone, 'medal'>, string> = {
  default: 'bg-white text-ink ring-1 ring-border-subtle',
  team: 'bg-[color:var(--team-accent)] text-white',
  ink: 'bg-ink text-white',
  inverse: 'bg-white/16 text-white ring-1 ring-white/30 backdrop-blur-sm',
};

const MEDAL: Record<number, string> = {
  1: 'bg-gold-soft text-gold ring-1 ring-gold/35',
  2: 'bg-silver-soft text-silver ring-1 ring-silver/35',
  3: 'bg-bronze-soft text-bronze ring-1 ring-bronze/35',
};

/**
 * The `#2` rank chip. Sits in a card corner and never over the player's face —
 * the card layouts reserve a corner lane for it.
 */
export function RankBadge({
  rank,
  shared = false,
  size = 'md',
  tone = 'default',
  animate = true,
  className,
}: RankBadgeProps) {
  const scale = useMotionScale();
  const has = typeof rank === 'number' && Number.isFinite(rank) && rank > 0;
  const skin =
    tone === 'medal'
      ? (has ? MEDAL[rank as number] : undefined) ?? TONE.default
      : TONE[tone];

  const body = (
    <span className="flex items-baseline gap-[0.06em]">
      {shared && has ? (
        <span aria-hidden className={cn('u-label opacity-70', HASH[size])}>
          =
        </span>
      ) : null}
      <span aria-hidden className={cn('u-label opacity-60', HASH[size])}>
        #
      </span>
      <span data-numeral className="u-numeral u-tabular leading-none">
        {has ? rank : '—'}
      </span>
    </span>
  );

  return (
    <span
      data-rank-badge
      className={cn(
        'relative inline-flex items-center justify-center rounded-md',
        'shadow-[0_1px_2px_rgb(35_31_32_/_0.06)]',
        SIZE[size],
        skin,
        className,
      )}
    >
      <span className="u-sr-only">
        {has ? `${shared ? 'Joint rank' : 'Rank'} ${rank}` : 'Unranked'}
      </span>
      {animate && scale === 1 ? (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={String(rank)}
            initial={{ opacity: 0, y: '55%', scale: 0.8 }}
            animate={{ opacity: 1, y: '0%', scale: 1 }}
            exit={{ opacity: 0, y: '-55%', scale: 0.8 }}
            transition={SPRING.badge}
            className="flex items-baseline"
          >
            {body}
          </motion.span>
        </AnimatePresence>
      ) : (
        body
      )}
    </span>
  );
}

export default RankBadge;
