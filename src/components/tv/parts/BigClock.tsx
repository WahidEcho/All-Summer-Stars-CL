'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { ProgressRail, ScoreNumeral, StatusPill, type ScoreNumeralSize } from '@/components/ui';
import type { TimerReading } from '@/lib/hooks';

export interface BigClockProps {
  reading: TimerReading;
  label?: ReactNode;
  size?: ScoreNumeralSize;
  /** Draw the drain rail under a count-down. Default true when a duration exists. */
  rail?: boolean;
  /** Show `PAUSED` / `TIME` in words as well as by the frozen figure. */
  showState?: boolean;
  align?: 'start' | 'center' | 'end';
  className?: string;
}

/**
 * The clock, in the one form the whole show uses.
 *
 * A stopped clock is a real state, not an absence: when a timer is paused or
 * expired the figure stays on screen at full size and a word says so, because a
 * frozen number with no explanation is the fastest way to make a room think the
 * display has crashed.
 */
export function BigClock({
  reading,
  label,
  size = 'lg',
  rail,
  showState = true,
  align = 'center',
  className,
}: BigClockProps) {
  const counting = reading.mode === 'count_down';
  const showRail = rail ?? (reading.durationMs != null && reading.durationMs > 0);
  const remaining = reading.durationMs != null ? reading.durationMs - reading.elapsedMs : 0;
  const urgent = counting && reading.durationMs != null && remaining <= 10_000 && !reading.expired;

  return (
    <div
      data-big-clock
      className={cn(
        'flex flex-col',
        align === 'center' && 'items-center',
        align === 'end' && 'items-end',
        className,
      )}
    >
      <ScoreNumeral
        value={reading.clock}
        label={label}
        labelPlacement={label ? 'above' : 'none'}
        size={size}
        variant="clock"
        tone={reading.expired ? 'muted' : urgent ? 'live' : 'default'}
        align={align}
        animate={false}
      />

      {showRail && reading.durationMs ? (
        <ProgressRail
          value={counting ? Math.max(0, reading.durationMs - reading.elapsedMs) : reading.elapsedMs}
          max={reading.durationMs}
          tone={urgent ? 'live' : 'accent'}
          size="md"
          direction={counting ? 'deplete' : 'fill'}
          transitionMs={120}
          className="mt-4 w-full"
        />
      ) : null}

      {showState && reading.state !== 'running' ? (
        <StatusPill
          label={
            reading.expired
              ? 'TIME'
              : reading.state === 'paused'
                ? 'PAUSED'
                : reading.state === 'ended'
                  ? 'STOPPED'
                  : 'READY'
          }
          tone={reading.expired ? 'live' : reading.state === 'paused' ? 'draw' : 'pending'}
          size="md"
          pulse={false}
          className="mt-4"
        />
      ) : null}
    </div>
  );
}

export default BigClock;
