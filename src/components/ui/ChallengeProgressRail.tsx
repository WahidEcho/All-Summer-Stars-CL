import type { ChallengeRow } from '@/lib/types';
import { cn } from '@/lib/cn';

export type ChallengeRailStatus = 'complete' | 'live' | 'upcoming' | 'locked';

export interface ChallengeRailItem {
  /** `1` renders as `01`. Strings render verbatim (`A3/B3`). */
  number: number | string;
  /** Short all-caps title — `TARGETS`, `DRIBBLE`, `FINAL MATCH`. */
  title: string;
  status: ChallengeRailStatus;
  /** Optional trailing note, e.g. the winner of a finished challenge. */
  note?: string;
}

export type ChallengeProgressRailSize = 'sm' | 'md' | 'lg';

export interface ChallengeProgressRailProps {
  items: ChallengeRailItem[];
  orientation?: 'horizontal' | 'vertical';
  size?: ChallengeProgressRailSize;
  /** Caption above the rail, e.g. `COMPETITION PROGRESS`. */
  label?: string;
  className?: string;
}

const GLYPH: Record<ChallengeRailStatus, string> = {
  complete: '✓',
  live: '●',
  upcoming: '○',
  locked: '○',
};

const SPOKEN: Record<ChallengeRailStatus, string> = {
  complete: 'complete',
  live: 'live now',
  upcoming: 'not started',
  locked: 'locked',
};

const SKIN: Record<ChallengeRailStatus, string> = {
  complete: 'text-winner',
  live: 'text-live',
  upcoming: 'text-pending',
  locked: 'text-pending',
};

const SIZE: Record<ChallengeProgressRailSize, { row: string; num: string; title: string }> = {
  sm: { row: 'gap-2 text-[0.5625rem]', num: 'text-[0.8125rem]', title: 'text-[0.5625rem]' },
  md: { row: 'gap-2.5 text-eyebrow', num: 'text-[1.0625rem]', title: 'text-eyebrow' },
  lg: { row: 'gap-3.5 text-label', num: 'text-[1.5rem]', title: 'text-label' },
};

function pad(value: number | string): string {
  return typeof value === 'number' ? String(value).padStart(2, '0') : value;
}

/**
 * `01 TARGETS ✓ · 02 DRIBBLE ● LIVE · 03 SHOOTING ○` — the permanent
 * spectator-facing map of where the show is (design_2.md, "Challenge
 * progression"). Also drives the round-level rail inside a challenge.
 */
export function ChallengeProgressRail({
  items,
  orientation = 'horizontal',
  size = 'md',
  label,
  className,
}: ChallengeProgressRailProps) {
  const s = SIZE[size];

  return (
    <div
      data-challenge-rail
      className={cn('flex flex-col gap-2', className)}
      role="group"
      aria-label={label ?? 'Competition progress'}
    >
      {label ? <span className="u-eyebrow text-text-muted text-eyebrow">{label}</span> : null}

      <ol
        className={cn(
          'flex',
          orientation === 'horizontal'
            ? 'flex-row flex-wrap items-center gap-x-6 gap-y-2'
            : 'flex-col items-stretch gap-2',
        )}
      >
        {items.map((item, index) => {
          const live = item.status === 'live';
          return (
            <li
              key={`${item.number}-${index}`}
              data-rail-status={item.status}
              className={cn(
                'flex min-w-0 items-center',
                s.row,
                live ? 'text-ink' : item.status === 'complete' ? 'text-ink' : 'text-text-muted',
                orientation === 'vertical' && 'justify-between',
              )}
            >
              <span
                className={cn(
                  'u-numeral shrink-0 tabular-nums',
                  s.num,
                  live ? 'text-live' : item.status === 'complete' ? 'text-ink' : 'text-text-muted',
                )}
              >
                {pad(item.number)}
              </span>

              <span className={cn('u-label truncate', s.title)}>{item.title}</span>

              <span
                aria-hidden
                data-state-glyph
                data-motion={live ? 'loop' : undefined}
                className={cn(
                  'shrink-0 leading-none',
                  SKIN[item.status],
                  live && 'animate-live-pulse',
                  item.status === 'upcoming' && 'opacity-60',
                )}
              >
                {GLYPH[item.status]}
              </span>

              {live ? <span className={cn('u-label text-live', s.title)}>LIVE</span> : null}

              {item.note ? (
                <span className={cn('u-label text-text-muted truncate', s.title)}>
                  {item.note}
                </span>
              ) : null}

              <span className="u-sr-only">{`${item.title}, ${SPOKEN[item.status]}`}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/**
 * Build rail items straight from the `challenges` table.
 *
 * `currentChallengeId` marks the live entry when no row is flagged `live`,
 * which is what the snapshot's `currentChallenge` gives you.
 */
export function challengeRailItems(
  challenges: ChallengeRow[],
  currentChallengeId?: string | null,
): ChallengeRailItem[] {
  return [...challenges]
    .sort((a, b) => a.number - b.number)
    .map((c) => {
      const status: ChallengeRailStatus =
        c.status === 'completed'
          ? 'complete'
          : c.status === 'live' || c.id === currentChallengeId
            ? 'live'
            : c.status === 'locked'
              ? 'locked'
              : 'upcoming';

      const note =
        c.status === 'completed' && c.winner
          ? c.winner === 'draw'
            ? 'DRAW'
            : `TEAM ${c.winner}`
          : undefined;

      return {
        number: c.number,
        title: (c.subtitle ?? c.title).toUpperCase(),
        status,
        note,
      };
    });
}

export default ChallengeProgressRail;
