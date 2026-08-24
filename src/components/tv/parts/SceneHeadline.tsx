'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { DURATION, EASE, useMotionScale } from '@/components/ui';

export type SceneHeadlineSize = 'sm' | 'md' | 'lg' | 'xl';

export interface SceneHeadlineProps {
  eyebrow?: ReactNode;
  children: ReactNode;
  sub?: ReactNode;
  size?: SceneHeadlineSize;
  align?: 'start' | 'center' | 'end';
  /** Seconds before the line enters. */
  delay?: number;
  tone?: 'ink' | 'accent' | 'winner' | 'draw';
  className?: string;
}

const SIZE: Record<SceneHeadlineSize, { head: string; eyebrow: string; sub: string; gap: string }> = {
  sm: { head: 'text-[54px]', eyebrow: 'text-[16px]', sub: 'text-[18px]', gap: 'gap-2' },
  md: { head: 'text-[84px]', eyebrow: 'text-[20px]', sub: 'text-[22px]', gap: 'gap-3' },
  lg: { head: 'text-[124px]', eyebrow: 'text-[24px]', sub: 'text-[26px]', gap: 'gap-4' },
  xl: { head: 'text-[176px]', eyebrow: 'text-[28px]', sub: 'text-[30px]', gap: 'gap-5' },
};

const TONE = {
  ink: 'text-ink',
  accent: 'text-aqua-700',
  winner: 'text-winner',
  draw: 'text-draw',
} as const;

const ALIGN = {
  start: 'items-start text-left',
  center: 'items-center text-center',
  end: 'items-end text-right',
} as const;

/**
 * The oversized condensed line a result scene opens on — `ROUND COMPLETE`,
 * `CHALLENGE 02 COMPLETE`, `2026 CHAMPIONS`.
 *
 * It enters on opacity and a short vertical travel only, so it composites on
 * the GPU and never nudges anything beside it.
 */
export function SceneHeadline({
  eyebrow,
  children,
  sub,
  size = 'lg',
  align = 'center',
  delay = 0,
  tone = 'ink',
  className,
}: SceneHeadlineProps) {
  const motionOn = useMotionScale() === 1;
  const s = SIZE[size];

  return (
    <motion.div
      initial={motionOn ? { opacity: 0, y: 22 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.card, ease: EASE.entrance, delay }}
      className={cn('flex flex-col', s.gap, ALIGN[align], className)}
    >
      {eyebrow ? (
        <span className={cn('u-eyebrow text-aqua-700', s.eyebrow)}>{eyebrow}</span>
      ) : null}
      <h1 className={cn('u-display leading-[0.86]', s.head, TONE[tone])}>{children}</h1>
      {sub ? <p className={cn('u-label text-text-muted', s.sub)}>{sub}</p> : null}
    </motion.div>
  );
}

export default SceneHeadline;
