'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { EASE, useMotionScale } from '@/components/ui';
import { STAGE_H, STAGE_W } from '@/components/tv/constants';

export interface StarBurstProps {
  /** Changing this replays the burst. Keep it stable to leave it finished. */
  runKey?: string | number;
  /** Number of particles. */
  count?: number;
  /** Seconds the whole burst lasts. */
  duration?: number;
  className?: string;
}

/** Deterministic pseudo-random in [0,1) — server and client must agree. */
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

const PALETTE = [
  'var(--color-aqua-400)',
  'var(--color-aqua-500)',
  'var(--color-aqua-600)',
  'var(--color-gold)',
  'var(--color-white)',
] as const;

function star(cx: number, cy: number, r: number): string {
  const inner = r * 0.478;
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : inner;
    points.push(
      `${(cx + Math.cos(angle) * radius).toFixed(1)},${(cy + Math.sin(angle) * radius).toFixed(1)}`,
    );
  }
  return points.join(' ');
}

/**
 * The champions celebration: a **defined burst** of stars and confetti that
 * plays once and stops.
 *
 * Deliberately not a loop. A perpetual particle field on an LED wall reads as a
 * screensaver within ten seconds and steals attention from the winners standing
 * in front of it, so this fires, settles and leaves the frame calm.
 */
export function StarBurst({
  runKey = 'burst',
  count = 54,
  duration = 2.6,
  className,
}: StarBurstProps) {
  const motionOn = useMotionScale() === 1;

  const particles = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const angle = noise(i + 1) * Math.PI * 2;
        const distance = 320 + noise(i + 41) * 780;
        const size = 12 + noise(i + 83) * 30;
        return {
          id: i,
          x: Math.cos(angle) * distance * 1.35,
          y: Math.sin(angle) * distance - 120,
          size,
          spin: (noise(i + 127) - 0.5) * 720,
          delay: noise(i + 211) * 0.5,
          color: PALETTE[i % PALETTE.length],
          square: noise(i + 307) > 0.62,
        };
      }),
    [count],
  );

  if (!motionOn) return null;

  return (
    <div
      aria-hidden
      data-star-burst
      className={cn('pointer-events-none absolute inset-0 overflow-hidden', className)}
    >
      <svg
        viewBox={`0 0 ${STAGE_W} ${STAGE_H}`}
        className="absolute inset-0 h-full w-full"
        preserveAspectRatio="xMidYMid slice"
      >
        {particles.map((p) => (
          <motion.g
            key={`${runKey}-${p.id}`}
            initial={{ opacity: 0, x: 0, y: 0, scale: 0.2, rotate: 0 }}
            animate={{
              opacity: [0, 1, 1, 0],
              x: p.x,
              y: [0, p.y * 0.72, p.y + 220],
              scale: [0.2, 1, 0.85],
              rotate: p.spin,
            }}
            transition={{
              duration,
              delay: p.delay,
              ease: EASE.broadcast,
              times: [0, 0.22, 0.68, 1],
            }}
            style={{ transformOrigin: `${STAGE_W / 2}px ${STAGE_H * 0.46}px` }}
          >
            {p.square ? (
              <rect
                x={STAGE_W / 2 - p.size / 2}
                y={STAGE_H * 0.46 - p.size / 2}
                width={p.size}
                height={p.size * 0.62}
                rx={2}
                fill={p.color}
                opacity={0.9}
              />
            ) : (
              <polygon
                points={star(STAGE_W / 2, STAGE_H * 0.46, p.size * 0.7)}
                fill={p.color}
                opacity={0.9}
              />
            )}
          </motion.g>
        ))}
      </svg>
    </div>
  );
}

export default StarBurst;
