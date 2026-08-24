'use client';

import type { ReactNode } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { DURATION, EASE, useMotionScale } from '@/components/ui';
import { LoadingDots } from '@/components/tv/parts/LoadingDots';

export interface VerifyingPanelProps {
  /** The headline — `VERIFYING OFFICIAL SCORE`, `VERIFYING FULL-TIME RESULT`. */
  headline?: string;
  /** One quiet line of context under the headline. */
  detail?: ReactNode;
  /** Scrim opacity over whatever is behind. */
  scrim?: number;
  className?: string;
}

/**
 * The branded wait state.
 *
 * The moment a clock expires the room must stop reading the last figure as
 * final, so live motion is replaced by this: the score stays visible behind a
 * white scrim — provisional, not hidden — and the panel says in words that an
 * official is confirming it. Nothing here invents or previews a result.
 */
export function VerifyingPanel({
  headline = 'VERIFYING OFFICIAL SCORE',
  detail = 'THE OFFICIAL IS CONFIRMING THE RESULT',
  scrim = 0.72,
  className,
}: VerifyingPanelProps) {
  const motionOn = useMotionScale() === 1;

  return (
    <motion.div
      data-verifying-panel
      initial={motionOn ? { opacity: 0 } : false}
      animate={{ opacity: 1 }}
      transition={{ duration: DURATION.card, ease: EASE.entrance }}
      className={cn('absolute inset-0 z-20 flex items-center justify-center', className)}
      style={{
        background: `linear-gradient(180deg, rgb(255 255 255 / ${scrim}) 0%, rgb(255 255 255 / ${Math.min(
          1,
          scrim + 0.16,
        )}) 100%)`,
        backdropFilter: 'saturate(0.7)',
      }}
    >
      <motion.div
        initial={motionOn ? { opacity: 0, y: 26, scale: 0.97 } : false}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: DURATION.card, ease: EASE.entrance, delay: 0.08 }}
        className={cn(
          'bg-surface-raised shadow-raised ring-border-subtle flex flex-col items-center gap-8',
          'rounded-xl px-[110px] py-[62px] text-center ring-1',
        )}
      >
        <span className="u-eyebrow text-aqua-700 text-[20px]">OFFICIAL REVIEW</span>
        <h2 className="u-display text-ink text-[92px] leading-[0.9]">{headline}</h2>
        <LoadingDots size={24} ariaLabel={headline} />
        {detail ? (
          <p className="u-label text-text-muted max-w-[900px] text-[20px]">{detail}</p>
        ) : null}
      </motion.div>
    </motion.div>
  );
}

export default VerifyingPanel;
