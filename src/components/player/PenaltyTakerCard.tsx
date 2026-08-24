'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { AttemptDots, type AttemptDotState } from '@/components/ui/AttemptDots';
import { ScoreNumeral } from '@/components/ui/ScoreNumeral';
import { StatusPill } from '@/components/ui/StatusPill';
import { DURATION, EASE, useMotionScale } from '@/components/ui/motion-tokens';
import { teamAccentVars } from '@/components/ui/team-accent';
import { PlayerGhost } from '@/components/player/PlayerGhost';
import { PlayerNameLockup } from '@/components/player/PlayerNameLockup';
import { PlayerPhoto } from '@/components/player/PlayerPhoto';
import {
  slotLabelOf,
  teamCodeOf,
  type PlayerCardBaseProps,
} from '@/components/player/player-identity';

export type PenaltyTakerStatus = 'waiting' | 'stepping_up' | 'scored' | 'missed';
export type PenaltyTakerCardSize = 'sm' | 'md' | 'lg';

export interface PenaltyTakerCardProps extends PlayerCardBaseProps {
  /** 1-based kick number within the shootout. */
  sequence?: number | null;
  status?: PenaltyTakerStatus;
  /** The team's shootout rail so far. */
  attempts?: AttemptDotState[];
  /** Pad the rail out to the opening-attempt count. */
  attemptTotal?: number;
  /** True once the shootout has gone past the opening attempts. */
  suddenDeath?: boolean;
  /** Points this kick is worth, from the penalty config. */
  points?: number | null;
  size?: PenaltyTakerCardSize;
  animateIn?: boolean;
}

const SIZE: Record<PenaltyTakerCardSize, { base: string; name: 'sm' | 'md' | 'lg'; photo: string }> = {
  sm: { base: 'text-[0.75rem]', name: 'sm', photo: 'aspect-[4/3]' },
  md: { base: 'text-[0.875rem]', name: 'md', photo: 'aspect-[3/4]' },
  lg: { base: 'text-[1rem]', name: 'lg', photo: 'aspect-[3/4]' },
};

const STATUS_PILL: Record<
  PenaltyTakerStatus,
  { label: string; tone: 'live' | 'winner' | 'pending' | 'neutral' }
> = {
  waiting: { label: 'NEXT UP', tone: 'pending' },
  stepping_up: { label: 'STEPPING UP', tone: 'live' },
  scored: { label: 'SCORED', tone: 'winner' },
  missed: { label: 'MISSED', tone: 'live' },
};

const FRAME: Record<PenaltyTakerStatus, string> = {
  waiting: 'ring-1 ring-border-subtle',
  stepping_up: 'ring-2 ring-live shadow-raised',
  scored: 'ring-2 ring-winner',
  missed: 'ring-2 ring-live opacity-[0.94]',
};

/**
 * The shootout card: who is on the spot, which kick this is, and how their
 * team's rail looks so far.
 *
 * The outcome is stated in words (`SCORED` / `MISSED`) as well as by colour
 * and by the rail glyphs, so a tiebreak is never ambiguous on a washed-out
 * daylight screen.
 */
export function PenaltyTakerCard({
  player,
  teamColor,
  teamCode,
  teamName,
  slotLabel,
  sequence,
  status = 'waiting',
  attempts,
  attemptTotal,
  suddenDeath = false,
  points = null,
  size = 'md',
  animateIn = true,
  className,
  style,
}: PenaltyTakerCardProps) {
  const motionOn = useMotionScale() === 1 && animateIn;
  const s = SIZE[size];
  const code = teamCode ?? teamCodeOf(player);
  const slot = slotLabel ?? slotLabelOf(player);
  const pill = STATUS_PILL[status];

  return (
    <motion.article
      data-penalty-taker={status}
      style={{ ...teamAccentVars(teamColor, code), ...style }}
      initial={motionOn ? { opacity: 0, scale: 0.96 } : false}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: DURATION.card, ease: EASE.entrance }}
      className={cn(
        'bg-surface-raised shadow-card relative isolate flex flex-col overflow-hidden rounded-lg',
        FRAME[status],
        s.base,
        className,
      )}
    >
      <div className={cn('relative w-full bg-[color-mix(in_oklab,var(--team-accent)_10%,white)]', s.photo)}>
        <PlayerGhost player={player} surname={false} placement="right" />
        <PlayerPhoto player={player} fit="cover" fade={false} />

        <div className="absolute top-2 left-2 flex flex-col gap-1.5">
          {slot ? (
            <span className="u-numeral bg-[color:var(--team-accent)] text-[color:var(--team-accent-contrast)] rounded-xs px-1.5 text-[1.1em] leading-tight">
              {slot}
            </span>
          ) : null}
          {sequence != null ? (
            <span className="u-label bg-white/90 text-ink rounded-xs px-1.5 py-0.5 text-[0.625rem]">
              KICK {sequence}
            </span>
          ) : null}
        </div>

        <div className="absolute top-2 right-2 flex flex-col items-end gap-1.5">
          <StatusPill label={pill.label} tone={pill.tone} size="sm" variant="solid" />
          {suddenDeath ? (
            <StatusPill label="SUDDEN DEATH" tone="draw" size="sm" variant="solid" />
          ) : null}
        </div>
      </div>

      <div className="flex flex-1 flex-col gap-[0.6em] p-[1em]">
        <PlayerNameLockup player={player} size={s.name} eyebrow={teamName ?? undefined} />

        {attempts && attempts.length > 0 ? (
          <AttemptDots
            attempts={attempts}
            total={attemptTotal}
            size={size === 'lg' ? 'md' : 'sm'}
            label="SHOOTOUT"
            ariaLabel="Shootout attempts"
          />
        ) : null}

        {points != null ? (
          <ScoreNumeral
            value={points}
            label="WORTH"
            suffix="PTS"
            size="sm"
            tone="team"
            align="start"
          />
        ) : null}
      </div>

      <span aria-hidden className="h-1 w-full bg-[color:var(--team-accent)]" />
    </motion.article>
  );
}

export default PenaltyTakerCard;
