import { cn } from '@/lib/cn';

export type RankDeltaSize = 'sm' | 'md' | 'lg';

export interface RankDeltaProps {
  /** Rank before the change. `null` means "was unranked". */
  from: number | null | undefined;
  /** Rank now. */
  to: number | null | undefined;
  size?: RankDeltaSize;
  /** Render nothing when the rank did not move. Default true. */
  hideWhenStill?: boolean;
  /** Copy shown when the player has just taken #1. */
  leaderLabel?: string;
  /** Copy shown when the player has just entered the prize places. */
  topFiveLabel?: string;
  className?: string;
}

const SIZE: Record<RankDeltaSize, string> = {
  sm: 'h-6 gap-1.5 px-2 text-[0.5625rem]',
  md: 'h-8 gap-2 px-3 text-eyebrow',
  lg: 'h-10 gap-2.5 px-4 text-label',
};

/**
 * `↑ 3 POSITIONS` / `NEW LEADER` / `NEW TOP 5`.
 *
 * Direction is carried by an arrow glyph and by the word "up"/"down" in the
 * accessible label, never by the colour alone.
 */
export function RankDelta({
  from,
  to,
  size = 'md',
  hideWhenStill = true,
  leaderLabel = 'NEW LEADER',
  topFiveLabel = 'NEW TOP 5',
  className,
}: RankDeltaProps) {
  const hasTo = typeof to === 'number' && to > 0;
  if (!hasTo) return null;

  const hasFrom = typeof from === 'number' && from > 0;
  const moved = hasFrom ? (from as number) - (to as number) : 0;

  if (hasFrom && moved === 0 && hideWhenStill) return null;

  const becameLeader = to === 1 && (!hasFrom || (from as number) > 1);
  const enteredTopFive = !becameLeader && to <= 5 && hasFrom && (from as number) > 5;

  let glyph = '→';
  let text = 'HOLDING POSITION';
  let spoken = `Holding rank ${to}`;
  let skin = 'bg-mist text-ink-soft';

  if (becameLeader) {
    glyph = '★';
    text = leaderLabel;
    spoken = 'New leader, rank 1';
    skin = 'bg-gold-soft text-gold ring-1 ring-gold/35';
  } else if (enteredTopFive) {
    glyph = '↑';
    text = topFiveLabel;
    spoken = `Entered the top five at rank ${to}`;
    skin = 'bg-winner-soft text-winner';
  } else if (moved > 0) {
    glyph = '↑';
    text = `${moved} ${moved === 1 ? 'POSITION' : 'POSITIONS'}`;
    spoken = `Up ${moved} ${moved === 1 ? 'position' : 'positions'} to rank ${to}`;
    skin = 'bg-winner-soft text-winner';
  } else if (moved < 0) {
    glyph = '↓';
    text = `${Math.abs(moved)} ${Math.abs(moved) === 1 ? 'POSITION' : 'POSITIONS'}`;
    spoken = `Down ${Math.abs(moved)} to rank ${to}`;
    skin = 'bg-live-soft text-live';
  } else if (!hasFrom) {
    glyph = '•';
    text = `RANK #${to}`;
    spoken = `Rank ${to}`;
    skin = 'bg-mist text-ink-soft';
  }

  return (
    <span
      data-rank-delta
      className={cn(
        'u-label inline-flex items-center rounded-pill whitespace-nowrap',
        SIZE[size],
        skin,
        className,
      )}
    >
      <span aria-hidden data-state-glyph className="leading-none">
        {glyph}
      </span>
      <span aria-hidden>{text}</span>
      <span className="u-sr-only">{spoken}</span>
    </span>
  );
}

export default RankDelta;
