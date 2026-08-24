'use client';

import { cn } from '@/lib/cn';
import { TeamScoreStrip, type TeamScoreStripSize } from '@/components/ui';
import type { SideModel } from '@/components/tv/scene-model';

export interface TeamTotalsProps {
  a: SideModel;
  b: SideModel;
  /** Override the figures — the round scenes lag them behind the player totals. */
  pointsA?: number;
  pointsB?: number;
  size?: TeamScoreStripSize;
  /** `false` hides the derived `TEAM A LEADS BY 7` line. */
  caption?: false;
  className?: string;
}

/**
 * `TEAM A 94 — 87 TEAM B` with `TEAM A LEADS BY 7` beneath.
 *
 * The caption is derived inside `TeamScoreStrip` from the same two numbers it
 * prints, so the words can never disagree with the figures on the wall.
 */
export function TeamTotals({
  a,
  b,
  pointsA,
  pointsB,
  size = 'lg',
  caption,
  className,
}: TeamTotalsProps) {
  return (
    <TeamScoreStrip
      teamA={{
        code: a.code,
        name: a.name,
        shortName: a.shortName,
        score: pointsA ?? a.points,
        color: a.color,
      }}
      teamB={{
        code: b.code,
        name: b.name,
        shortName: b.shortName,
        score: pointsB ?? b.points,
        color: b.color,
      }}
      size={size}
      caption={caption}
      unit="PTS"
      className={cn('bg-white/92', className)}
    />
  );
}

export default TeamTotals;
