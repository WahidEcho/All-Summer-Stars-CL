'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { cn } from '@/lib/cn';
import { STAGE_H, STAGE_W } from '@/components/tv/constants';

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export interface BroadcastStageProps {
  children: ReactNode;
  /** Extra classes on the outer host that fills the viewport. */
  className?: string;
  /** Letterbox colour for viewports that are not 16:9. */
  matteClassName?: string;
}

/**
 * A fixed 1920x1080 canvas, scaled to fit whatever it is shown on.
 *
 * The children lay themselves out against absolute pixel values — `text-[96px]`
 * means 96 canvas pixels, on the LED wall and on a laptop alike — and one
 * `transform: scale()` on the wrapper does the rest. Because it is a transform
 * and not a layout change, nothing inside ever reflows, so a score that is
 * mid-roll during a resize keeps rolling.
 */
export function BroadcastStage({ children, className, matteClassName }: BroadcastStageProps) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState<number | null>(null);

  useIsomorphicLayoutEffect(() => {
    const node = host.current;
    if (!node) return;

    const measure = () => {
      const { width, height } = node.getBoundingClientRect();
      if (width <= 0 || height <= 0) return;
      setScale(Math.min(width / STAGE_W, height / STAGE_H));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  return (
    <div
      ref={host}
      data-broadcast-stage
      className={cn(
        'bg-surface relative h-full w-full overflow-hidden',
        matteClassName,
        className,
      )}
    >
      <div
        data-stage-canvas
        className="absolute top-1/2 left-1/2 origin-center"
        style={{
          width: STAGE_W,
          height: STAGE_H,
          transform: `translate(-50%, -50%) scale(${scale ?? 1})`,
          // Hidden for the single frame between hydration and the first
          // measurement, so an unscaled 1920px canvas never flashes.
          visibility: scale === null ? 'hidden' : 'visible',
        }}
      >
        {children}
      </div>
    </div>
  );
}

export default BroadcastStage;
