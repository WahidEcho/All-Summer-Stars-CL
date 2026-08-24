'use client';

import type { ReactNode } from 'react';

import type { TeamCode } from '@/lib/types';
import { cn } from '@/lib/cn';
import { AnimatedNumber } from '@/components/ui/AnimatedNumber';
import { teamAccentVars } from '@/components/ui/team-accent';

export interface TeamScoreStripTeam {
  code?: TeamCode | null;
  /** Full name — `TEAM A`, or whatever the admin renamed it to. */
  name: string;
  /** Optional short name used at the smaller sizes. */
  shortName?: string | null;
  score: number;
  /** Kit colour from the `teams` row. */
  color?: string | null;
}

export type TeamScoreStripSize = 'sm' | 'md' | 'lg' | 'xl';

export interface TeamScoreStripProps {
  teamA: TeamScoreStripTeam;
  teamB: TeamScoreStripTeam;
  size?: TeamScoreStripSize;
  /**
   * Override the derived `TEAM A LEADS BY 7` line. `false` hides it.
   * Leave undefined for the derived copy.
   */
  caption?: ReactNode | false;
  /** Unit next to each figure. `PTS` on the standings strip, empty in a match. */
  unit?: string;
  /** Roll the figures when they change. Default true. */
  animate?: boolean;
  /** Tint the whole strip with a raised surface. Default true. */
  raised?: boolean;
  className?: string;
}

/**
 * The strip is a single line — name, figure, dash, figure, name — so on a phone
 * the two figures and the two names are competing for 340px. Below `sm` the
 * padding, the gaps and the figures all step down; from `sm` up every size is
 * the designed one. The LED wall always composes at 1920, so it never sees the
 * narrow step.
 */
const SIZE: Record<
  TeamScoreStripSize,
  { name: string; score: string; caption: string; pad: string; gap: string }
> = {
  sm: {
    name: 'text-eyebrow',
    score: 'text-[1.5rem] sm:text-[2rem]',
    caption: 'text-[0.5625rem]',
    pad: 'px-3 py-2 sm:px-4 sm:py-2.5',
    gap: 'gap-2 sm:gap-3',
  },
  md: {
    name: 'text-label',
    score: 'text-[1.75rem] sm:text-score-sm',
    caption: 'text-eyebrow',
    pad: 'px-3 py-3 sm:px-6 sm:py-3.5',
    gap: 'gap-2 sm:gap-5',
  },
  lg: {
    name: 'text-[1.125rem]',
    score: 'text-[2.25rem] sm:text-score-md',
    caption: 'text-label',
    pad: 'px-4 py-4 sm:px-8 sm:py-5',
    gap: 'gap-3 sm:gap-7',
  },
  xl: {
    name: 'text-[1.125rem] sm:text-[1.5rem]',
    score: 'text-[2.75rem] sm:text-score-lg',
    caption: 'text-[1.125rem]',
    pad: 'px-4 py-5 sm:px-10 sm:py-6',
    gap: 'gap-3 sm:gap-10',
  },
};

function derivedCaption(a: TeamScoreStripTeam, b: TeamScoreStripTeam): string {
  const diff = a.score - b.score;
  if (diff === 0) return 'SCORES LEVEL';
  const leader = diff > 0 ? a : b;
  return `${leader.name.toUpperCase()} LEADS BY ${Math.abs(diff)}`;
}

function Side({
  team,
  size,
  unit,
  animate,
  align,
  leading,
}: {
  team: TeamScoreStripTeam;
  size: TeamScoreStripSize;
  unit?: string;
  animate: boolean;
  align: 'start' | 'end';
  leading: boolean;
}) {
  const s = SIZE[size];
  // The strip is a single line, so on a phone the full name is the first thing
  // to be clipped ("TEAM A" -> "TEA…"). Where the team carries a short name it
  // takes the narrow viewport and the full one returns from `sm:` up.
  const short = team.shortName?.trim() || team.name;
  return (
    <div
      style={teamAccentVars(team.color, team.code)}
      className={cn(
        'flex min-w-0 flex-1 items-center gap-2 sm:gap-4',
        align === 'end' ? 'flex-row-reverse text-right' : 'text-left',
      )}
    >
      <span
        aria-hidden
        className="h-[1.6em] w-1.5 shrink-0 rounded-pill bg-[color:var(--team-accent)]"
      />
      <span
        className={cn(
          'u-label min-w-0 truncate',
          s.name,
          leading ? 'text-ink' : 'text-text-secondary',
        )}
      >
        {short === team.name ? (
          team.name
        ) : (
          <>
            <span className="sm:hidden">{short}</span>
            <span className="hidden sm:inline">{team.name}</span>
          </>
        )}
      </span>
      <span
        className={cn(
          'u-numeral ml-auto flex items-baseline gap-[0.14em] whitespace-nowrap',
          align === 'end' && 'ml-0 mr-auto',
          s.score,
          leading ? 'text-ink' : 'text-ink-soft',
        )}
      >
        {animate ? (
          <AnimatedNumber value={team.score} />
        ) : (
          <span data-numeral className="u-tabular">
            {team.score}
          </span>
        )}
        {unit ? <span className={cn('u-label text-text-muted text-[0.24em]')}>{unit}</span> : null}
      </span>
    </div>
  );
}

/**
 * `TEAM A  78 — 71  TEAM B` with `TEAM A LEADS BY 7` underneath.
 *
 * Screen 02 of design.md calls this "large and unmistakable"; it updates on
 * every attempt, so both figures roll rather than snap and the caption is
 * derived from the numbers so it can never disagree with them.
 */
export function TeamScoreStrip({
  teamA,
  teamB,
  size = 'md',
  caption,
  unit = 'PTS',
  animate = true,
  raised = true,
  className,
}: TeamScoreStripProps) {
  const s = SIZE[size];
  const diff = teamA.score - teamB.score;
  const captionText = caption === undefined ? derivedCaption(teamA, teamB) : caption;

  return (
    <div
      data-team-score-strip
      className={cn(
        'flex w-full flex-col items-center gap-1.5 rounded-lg',
        raised && 'bg-surface-raised shadow-card ring-1 ring-border-subtle',
        s.pad,
        className,
      )}
    >
      <div className={cn('flex w-full items-center', s.gap)}>
        <Side team={teamA} size={size} unit={unit} animate={animate} align="start" leading={diff >= 0} />

        <span aria-hidden className={cn('u-numeral text-text-muted shrink-0', s.score)}>
          —
        </span>

        <Side team={teamB} size={size} unit={unit} animate={animate} align="end" leading={diff <= 0} />
      </div>

      {captionText !== false ? (
        <span className={cn('u-label text-text-muted', s.caption)}>{captionText}</span>
      ) : null}
    </div>
  );
}

export default TeamScoreStrip;
