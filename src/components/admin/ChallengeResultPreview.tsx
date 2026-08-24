/**
 * What ending a challenge is about to publish.
 *
 * Shown twice — once open on the row, once inside the confirmation — because
 * the whole point of the control is that the operator sees the result before
 * the room does. It renders from `previewChallengeResult`, which is the same
 * `computeChallengeResult` the server action runs, so the numbers here are the
 * numbers that land.
 */

import { cn } from '@/lib/cn';
import type { ChallengeResult } from '@/lib/scoring/engine';
import type { TeamCode, TeamRow } from '@/lib/types';
import { StatusPill } from '@/components/ui';
import { outcomeName, sideName } from '@/components/admin/challenge-lifecycle';

export interface ChallengeResultPreviewProps {
  result: ChallengeResult;
  teamsByCode?: Record<TeamCode, TeamRow | null>;
  /** `total_points` (the default) or `round_wins`, so the rule is never guessed. */
  aggregationRule?: string;
  /** Points the winning side's lineup will receive, when the profile awards one. */
  challengeWinBonus?: number;
  /** Something that makes these figures provisional — an unpublished round. */
  caveat?: string | null;
  className?: string;
}

export function ChallengeResultPreview({
  result,
  teamsByCode,
  aggregationRule = 'total_points',
  challengeWinBonus,
  caveat = null,
  className,
}: ChallengeResultPreviewProps) {
  const byWins = aggregationRule === 'round_wins';
  const nameA = sideName(teamsByCode, 'A');
  const nameB = sideName(teamsByCode, 'B');
  const winner = outcomeName(teamsByCode, result.winner);

  const columns: Array<{ code: TeamCode; name: string; points: number; wins: number }> = [
    { code: 'A', name: nameA, points: result.pointsA, wins: result.roundWinsA },
    { code: 'B', name: nameB, points: result.pointsB, wins: result.roundWinsB },
  ];

  return (
    <div
      className={cn(
        'ring-border-subtle bg-surface-raised space-y-4 rounded-md px-4 py-4 ring-1',
        className,
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="u-label text-text-muted text-eyebrow">
          Result if you end it now
        </p>
        <StatusPill
          label={result.winner === 'draw' ? 'DRAW' : `WINNER — ${winner.toUpperCase()}`}
          tone={result.winner === 'draw' ? 'draw' : 'winner'}
          size="sm"
        />
      </div>

      <dl className="grid gap-3 sm:grid-cols-2">
        {columns.map((column) => {
          const won = result.winner === column.code;
          return (
            <div
              key={column.code}
              className={cn(
                'min-w-0 rounded-md px-3 py-2.5 ring-1',
                won ? 'ring-winner/40 bg-mist' : 'ring-border-subtle',
              )}
            >
              <dt className="text-text-secondary flex items-center gap-1.5 truncate text-[0.8125rem] font-semibold">
                {won ? (
                  <span aria-hidden className="text-winner">
                    ✓
                  </span>
                ) : null}
                <span className="truncate">{column.name}</span>
              </dt>
              <dd className="mt-1 flex items-baseline gap-3">
                <span className="u-tabular font-numeral text-ink text-[1.5rem] leading-none">
                  {column.points}
                </span>
                <span className="text-text-muted text-[0.75rem]">
                  points · {column.wins} round {column.wins === 1 ? 'win' : 'wins'}
                </span>
              </dd>
            </div>
          );
        })}
      </dl>

      <p className="text-text-muted text-[0.75rem] leading-body">
        Decided on {byWins ? 'round wins' : 'total points across the rounds'}
        {result.draws > 0
          ? ` · ${result.draws} drawn ${result.draws === 1 ? 'round' : 'rounds'}`
          : null}
        {typeof challengeWinBonus === 'number' && challengeWinBonus !== 0
          ? result.winner === 'draw'
            ? ` · no challenge bonus is awarded on a draw`
            : ` · ${challengeWinBonus} bonus points to every ${winner} player in this lineup`
          : null}
        .
      </p>

      {caveat ? (
        <p className="text-live text-[0.75rem] leading-body">
          <span aria-hidden>⚠ </span>
          {caveat}
        </p>
      ) : null}
    </div>
  );
}

export default ChallengeResultPreview;
