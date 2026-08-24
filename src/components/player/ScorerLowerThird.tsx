'use client';

import type { ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { ScoreNumeral } from '@/components/ui/ScoreNumeral';
import { DURATION, EASE, useMotionScale } from '@/components/ui/motion-tokens';
import { teamAccentVars } from '@/components/ui/team-accent';
import { PlayerNameLockup } from '@/components/player/PlayerNameLockup';
import { PlayerPhoto } from '@/components/player/PlayerPhoto';
import {
  slotLabelOf,
  teamCodeOf,
  type PlayerCardBaseProps,
} from '@/components/player/player-identity';

export type ScorerLowerThirdKind = 'goal' | 'own_goal' | 'assist' | 'penalty' | 'custom';
export type ScorerLowerThirdSize = 'md' | 'lg' | 'xl';

export interface ScorerLowerThirdProps extends PlayerCardBaseProps {
  /** What happened. Drives the default label and tone. */
  kind?: ScorerLowerThirdKind;
  /** Overrides the label derived from `kind`. */
  label?: ReactNode;
  /** Match clock at the moment of the event, pre-formatted (`27:14`). */
  clock?: string | null;
  /** Points awarded by this event, e.g. `+10`. Hidden when null. */
  points?: number | null;
  pointsCaption?: string;
  /** Current scoreline to carry alongside, e.g. `TEAM A 2 — 1 TEAM B`. */
  scoreline?: ReactNode;
  /** Slide in from this edge. */
  from?: 'left' | 'right';
  size?: ScorerLowerThirdSize;
  /** Mount/unmount driver. `false` plays the exit. Default true. */
  visible?: boolean;
}

const LABEL: Record<ScorerLowerThirdKind, string> = {
  goal: 'GOAL',
  own_goal: 'OWN GOAL',
  assist: 'ASSIST',
  penalty: 'PENALTY',
  custom: '',
};

const SIZE: Record<ScorerLowerThirdSize, { base: string; name: 'md' | 'lg' | 'xl'; photo: string }> = {
  md: { base: 'text-[0.875rem]', name: 'md', photo: 'w-[96px]' },
  lg: { base: 'text-[1rem]', name: 'lg', photo: 'w-[128px]' },
  xl: { base: 'text-[1.15rem]', name: 'xl', photo: 'w-[168px]' },
};

/**
 * The broadcast lower third for a goal (design.md screen 07).
 *
 * A goal is the loudest moment in the final match, so this is a single wide
 * bar rather than a card: cut-out on the accent block, the event word, the
 * name, the clock, and the points that just landed on the scoring side.
 *
 * `kind="own_goal"` swaps the wording but keeps the *benefiting* team's colour
 * — pass the team that was credited, not the player's own team, when the
 * scoring profile credits the opposition.
 */
export function ScorerLowerThird({
  player,
  teamColor,
  teamCode,
  teamName,
  slotLabel,
  kind = 'goal',
  label,
  clock,
  points = null,
  pointsCaption = 'POINTS',
  scoreline,
  from = 'left',
  size = 'lg',
  visible = true,
  className,
  style,
}: ScorerLowerThirdProps) {
  const motionOn = useMotionScale() === 1;
  const s = SIZE[size];
  const code = teamCode ?? teamCodeOf(player);
  const slot = slotLabel ?? slotLabelOf(player);
  const word = label ?? LABEL[kind];

  return (
    <AnimatePresence>
      {visible ? (
        <motion.aside
          data-scorer-lower-third={kind}
          style={{ ...teamAccentVars(teamColor, code), ...style }}
          initial={motionOn ? { opacity: 0, x: from === 'left' ? -80 : 80 } : false}
          animate={{ opacity: 1, x: 0 }}
          exit={motionOn ? { opacity: 0, x: from === 'left' ? -60 : 60 } : { opacity: 0 }}
          transition={{ duration: DURATION.card, ease: EASE.entrance }}
          className={cn(
            'bg-surface-raised shadow-raised relative isolate flex items-stretch overflow-hidden rounded-lg',
            'ring-1 ring-border-subtle',
            s.base,
            className,
          )}
        >
          {/* Accent block with the cut-out. */}
          <div
            className={cn(
              'relative shrink-0 self-stretch bg-[color:var(--team-accent)]',
              s.photo,
            )}
          >
            <PlayerPhoto player={player} fit="cover" fade={false} priority />
          </div>

          <div className="flex min-w-0 flex-1 items-center gap-[1.4em] px-[1.4em] py-[0.9em]">
            <div className="flex min-w-0 flex-col gap-[0.35em]">
              {word ? (
                <span
                  className={cn(
                    'u-display text-[1.9em] leading-none',
                    kind === 'own_goal' ? 'text-draw' : 'text-[color:var(--team-accent-ink)]',
                  )}
                >
                  {word}
                </span>
              ) : null}

              <PlayerNameLockup
                player={player}
                size={s.name}
                eyebrow={[slot, teamName].filter(Boolean).join(' · ') || undefined}
              />
            </div>

            <div className="ml-auto flex shrink-0 items-end gap-[1.4em]">
              {clock ? (
                <ScoreNumeral
                  value={clock}
                  label="CLOCK"
                  variant="clock"
                  size="sm"
                  tone="muted"
                  align="end"
                  animate={false}
                />
              ) : null}

              {points != null ? (
                <ScoreNumeral
                  value={points}
                  label={pointsCaption}
                  size="md"
                  tone="team"
                  align="end"
                />
              ) : null}
            </div>
          </div>

          {scoreline ? (
            <div className="bg-mist flex shrink-0 items-center px-[1.4em]">{scoreline}</div>
          ) : null}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

export default ScorerLowerThird;
