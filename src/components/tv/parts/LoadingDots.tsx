import { cn } from '@/lib/cn';

export interface LoadingDotsProps {
  /** Diameter of one dot, in canvas px. */
  size?: number;
  className?: string;
  /** What the wait is for, announced once to assistive tech. */
  ariaLabel?: string;
}

/**
 * The three-dot indicator that sits under `VERIFYING OFFICIAL SCORE`.
 *
 * Driven by the `dot-load` keyframes in globals.css, which the reduced-motion
 * block stops — the dots then hold at full opacity, so the panel still reads as
 * a wait state rather than disappearing.
 */
export function LoadingDots({ size = 22, className, ariaLabel }: LoadingDotsProps) {
  return (
    <span
      data-loading-dots
      role={ariaLabel ? 'status' : undefined}
      aria-label={ariaLabel}
      className={cn('inline-flex items-end', className)}
      style={{ gap: Math.round(size * 0.7) }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          data-ambient
          className="animate-dot-load bg-aqua-600 block rounded-full"
          style={{ width: size, height: size, animationDelay: `${i * 0.16}s` }}
        />
      ))}
    </span>
  );
}

export default LoadingDots;
