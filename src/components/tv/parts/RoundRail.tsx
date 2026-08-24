import { cn } from '@/lib/cn';
import { ChallengeProgressRail, type ChallengeRailItem } from '@/components/ui';
import type { RoundRow } from '@/lib/types';

export interface RoundRailProps {
  rounds: ReadonlyArray<RoundRow>;
  /** The round the show is on, when no row is flagged `live`. */
  currentRoundId?: string | null;
  label?: string;
  size?: 'sm' | 'md' | 'lg';
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

const FINISHED: ReadonlyArray<RoundRow['status']> = ['published', 'completed'];
const IN_FLIGHT: ReadonlyArray<RoundRow['status']> = ['live', 'awaiting_result', 'result_ready'];

/** `A1/B1 ✓  A2/B2 ✓  A3/B3 ● LIVE  A4/B4 ○  A5/B5 ○` */
export function RoundRail({
  rounds,
  currentRoundId,
  label = 'ROUNDS',
  size = 'md',
  orientation = 'horizontal',
  className,
}: RoundRailProps) {
  const items: ChallengeRailItem[] = [...rounds]
    .sort((x, y) => x.number - y.number)
    .map((round) => {
      const status = FINISHED.includes(round.status)
        ? 'complete'
        : IN_FLIGHT.includes(round.status) || round.id === currentRoundId
          ? 'live'
          : 'upcoming';

      const note =
        status === 'complete'
          ? round.winner === 'draw'
            ? 'DRAW'
            : round.winner
              ? `${round.score_a}–${round.score_b}`
              : undefined
          : undefined;

      return {
        number: `A${round.number}/B${round.number}`,
        title: '',
        status,
        note,
      };
    });

  return (
    <ChallengeProgressRail
      items={items}
      label={label}
      size={size}
      orientation={orientation}
      className={cn(className)}
    />
  );
}

export default RoundRail;
