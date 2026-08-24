'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';

import { EventMark } from '@/components/brand';
import { ScoreNumeral, StatusPill, useMotionScale } from '@/components/ui';
import { SceneFrame } from '@/components/tv/SceneFrame';
import type { SceneProps } from '@/components/tv/scene-props';

/** Milliseconds until the event's advertised start, or null when unknown. */
function useCountdown(targetMs: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (targetMs === null) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetMs]);

  if (targetMs === null) return null;
  return Math.max(0, targetMs - now);
}

function countdownLabel(ms: number): string {
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * SCREEN 01 — HOLDING / EVENT INTRO.
 *
 * What the wall shows before the first whistle and during every long break. The
 * brief is unambiguous about the register: *expensive, not hyperactive*. So the
 * only things that move are the star field behind, one light sweep on a 13s
 * cycle, and the mark itself breathing by 1.5% over sixteen seconds. Everything
 * else is still.
 */
export function HoldingScene({ model }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;
  const event = snapshot.event;

  const startMs = useMemo(() => {
    if (!event.show_countdown || !event.event_date) return null;
    const time = event.start_time ?? '00:00:00';
    const parsed = Date.parse(`${event.event_date}T${time}`);
    return Number.isNaN(parsed) ? null : parsed;
  }, [event.show_countdown, event.event_date, event.start_time]);

  const remaining = useCountdown(startMs);

  return (
    <SceneFrame
      eyebrow="SHORES & SCORES CHALLENGE"
      title="SWANLAKE FOOTBALL STARS"
      qrUrl={model.qrUrl}
      sponsors={snapshot.sponsors}
      starField="holding"
    >
      <div className="relative flex h-full w-full flex-col items-center justify-center">
        {/* The mark sits slightly above optical centre, at ~42% of the canvas. */}
        <motion.div
          className="flex w-[42%] flex-col items-center"
          style={{ marginTop: -58 }}
          initial={motionOn ? { opacity: 0, scale: 0.985 } : false}
          animate={
            motionOn
              ? { opacity: 1, scale: [1, 1.015, 1] }
              : { opacity: 1, scale: 1 }
          }
          transition={
            motionOn
              ? {
                  opacity: { duration: 1.1 },
                  scale: {
                    duration: 16,
                    times: [0, 0.5, 1],
                    repeat: Infinity,
                    ease: 'easeInOut',
                  },
                }
              : { duration: 0 }
          }
        >
          <EventMark variant="light" priority title="" />
          <span className="u-sr-only">
            SwanLake Football Stars — Shores &amp; Scores Challenge
          </span>
        </motion.div>

        <motion.div
          initial={motionOn ? { opacity: 0, y: 18 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="mt-[54px] flex flex-col items-center gap-6 text-center"
        >
          {model.eventDateLabel ? (
            <p className="u-display text-ink text-[64px] leading-none">
              {model.eventDateLabel}
            </p>
          ) : null}

          <p className="u-label text-aqua-800 text-[28px]">
            {model.venueLabel || 'LIVE FROM SWANLAKE NORTH COAST'}
          </p>

          <StatusPill
            label={(event.holding_status || 'STARTING SOON').toUpperCase()}
            tone="accent"
            variant="solid"
            size="lg"
            pulse={false}
            className="mt-2 text-[18px]"
          />
        </motion.div>

        {/* Optional countdown, bottom-left, enabled from admin. */}
        {remaining !== null ? (
          <motion.div
            initial={motionOn ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
            className="absolute bottom-0 left-0 flex flex-col items-start gap-2"
          >
            <ScoreNumeral
              value={remaining > 0 ? countdownLabel(remaining) : 'ANY MOMENT'}
              label={remaining > 0 ? 'STARTS IN' : 'KICK OFF'}
              size="md"
              variant="clock"
              tone="accent"
              align="start"
              animate={false}
            />
          </motion.div>
        ) : null}
      </div>
    </SceneFrame>
  );
}

export default HoldingScene;
