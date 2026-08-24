'use client';

/**
 * `01 TARGETS ✓ · 02 DRIBBLE ● LIVE · 03 SHOOTING ○` — the permanent map of
 * where the show is, visible on every page as the brief requires.
 *
 * On a phone it scrolls horizontally rather than wrapping into three lines,
 * because the useful information is always the entry nearest the live one.
 */

import { ChallengeProgressRail, challengeRailItems } from '@/components/ui';
import { cn } from '@/lib/cn';
import { useSnapshot } from '@/components/public/snapshot-context';

export interface ChallengeRailProps {
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  className?: string;
}

export function ChallengeRail({ size = 'sm', label, className }: ChallengeRailProps) {
  const snapshot = useSnapshot();
  if (!snapshot || snapshot.challenges.length === 0) return null;

  const items = challengeRailItems(snapshot.challenges, snapshot.currentChallenge?.id ?? null);

  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <ChallengeProgressRail
        items={items}
        size={size}
        label={label}
        className="min-w-max sm:min-w-0"
      />
    </div>
  );
}

/**
 * The round-level rail inside a challenge: `A1/B1 ✓  A2/B2 ✓  A3/B3 ●`.
 * Only rendered for the 1v1 challenges — the final match has no rounds.
 */
export function RoundRail({ className }: { className?: string }) {
  const snapshot = useSnapshot();
  const challenge = snapshot?.currentChallenge ?? null;
  if (!snapshot || !challenge || snapshot.rounds.length === 0) return null;

  const items = snapshot.rounds.map((round) => {
    const a =
      snapshot.allLineups.find(
        (s) => s.challenge_id === challenge.id && s.player_id === round.player_a_id,
      )?.slot_label ?? `A${round.number}`;
    const b =
      snapshot.allLineups.find(
        (s) => s.challenge_id === challenge.id && s.player_id === round.player_b_id,
      )?.slot_label ?? `B${round.number}`;

    const status =
      round.status === 'published' || round.status === 'completed'
        ? ('complete' as const)
        : round.id === snapshot.currentRound?.id &&
            (round.status === 'live' ||
              round.status === 'awaiting_result' ||
              round.status === 'result_ready')
          ? ('live' as const)
          : ('upcoming' as const);

    const note =
      round.status === 'published' || round.status === 'completed'
        ? round.winner === 'draw'
          ? 'DRAW'
          : `${round.score_a}–${round.score_b}`
        : undefined;

    return { number: `${a}/${b}`, title: `ROUND ${round.number}`, status, note };
  });

  return (
    <div className={cn('-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}>
      <ChallengeProgressRail
        items={items}
        size="sm"
        label="ROUNDS IN THIS CHALLENGE"
        className="min-w-max sm:min-w-0"
      />
    </div>
  );
}

export default ChallengeRail;
