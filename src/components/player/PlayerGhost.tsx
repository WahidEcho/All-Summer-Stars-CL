import { cn } from '@/lib/cn';
import { nameParts, surnameScale, type PlayerLike } from '@/components/player/player-identity';

export interface PlayerGhostProps {
  player: PlayerLike;
  /** Oversized jersey number behind the player. Default true. */
  number?: boolean;
  /** Oversized transparent surname behind the player. Default true. */
  surname?: boolean;
  /** `outline` strokes the type; `fill` washes it in the team accent. */
  variant?: 'outline' | 'fill';
  /** Where the surname sits. */
  placement?: 'left' | 'center' | 'right';
  /** Scales the whole ghost layer. 1 = the tuned default. */
  scale?: number;
  className?: string;
}

/**
 * The layer *behind* the player: an oversized jersey number and the surname in
 * very large transparent type, exactly as specified in design.md's photo
 * treatment.
 *
 * Purely decorative and never in the accessibility tree — the real name is
 * always set by `PlayerNameLockup` in front.
 *
 * Drop this as the first child of a `relative` card, before the photo.
 */
export function PlayerGhost({
  player,
  number = true,
  surname = true,
  variant = 'outline',
  placement = 'center',
  scale = 1,
  className,
}: PlayerGhostProps) {
  const { last } = nameParts(player);
  const jersey = player.jersey_number;
  const ghostClass = variant === 'outline' ? 'u-ghost' : 'u-ghost-fill';

  return (
    <div
      aria-hidden
      data-player-ghost
      className={cn(
        'pointer-events-none absolute inset-0 select-none overflow-hidden',
        className,
      )}
    >
      {number && jersey != null ? (
        <span
          className={cn(ghostClass, 'absolute top-[2%] leading-none')}
          style={{
            fontSize: `${(11 * scale).toFixed(2)}em`,
            left: placement === 'right' ? undefined : '-1.5%',
            right: placement === 'right' ? '-1.5%' : undefined,
          }}
        >
          {jersey}
        </span>
      ) : null}

      {surname && last ? (
        <span
          className={cn(
            ghostClass,
            'absolute inset-x-0 bottom-[6%] block whitespace-nowrap',
            placement === 'left' && 'text-left',
            placement === 'center' && 'text-center',
            placement === 'right' && 'text-right',
          )}
          style={{ fontSize: `${(5.6 * surnameScale(last) * scale).toFixed(3)}em` }}
        >
          {last}
        </span>
      ) : null}
    </div>
  );
}

export default PlayerGhost;
