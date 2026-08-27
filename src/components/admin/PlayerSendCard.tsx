'use client';

/**
 * One player's send card on the entrance console.
 *
 * The whole two-step confirm lives here: the card arms on the first tap and
 * fires on the second, and the armed state is drawn as a red wash over the
 * player it belongs to rather than as a separate confirm control, so the thing
 * the operator is about to put on the wall is the thing under their thumb.
 *
 * Colour never carries that state on its own — a console operated on a sunlit
 * tablet cannot rely on a tint — so the wash comes with a glyph and the
 * instruction that replaces the player's name.
 *
 * Presentation only. Arming, disarming and sending are the page's business;
 * this is handed `armed` and calls `onPress`.
 */

import { cn } from '@/lib/cn';
import { PlayerPhoto, displayNameOf } from '@/components/player';
import { StatusPill, teamRowAccentVars } from '@/components/ui';
import type { PlayerRow, TeamRow } from '@/lib/types';

export interface PlayerSendCardProps {
  player: PlayerRow;
  team: TeamRow | null;
  armed: boolean;
  /** This player's card is the one currently on the wall. */
  onTv: boolean;
  disabled: boolean;
  onPress: () => void;
}

export function PlayerSendCard({
  player,
  team,
  armed,
  onTv,
  disabled,
  onPress,
}: PlayerSendCardProps) {
  const name = displayNameOf(player) || 'Unnamed player';

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-pressed={armed}
      aria-label={armed ? `Confirm sending ${name} to the TV` : `Send ${name} to the TV`}
      style={teamRowAccentVars(team)}
      className={cn(
        'group focus-visible:ring-focus relative flex flex-col overflow-hidden rounded-lg text-left ring-1 transition focus-visible:ring-4 focus-visible:outline-none',
        armed
          ? 'ring-live shadow-raised ring-4'
          : 'ring-border-subtle hover:ring-aqua-400 hover:shadow-card',
        disabled && 'cursor-not-allowed opacity-60',
      )}
    >
      <div className="relative aspect-[3/4] w-full bg-[color:var(--team-accent-soft)]">
        <PlayerPhoto player={player} fit="cover" fade={false} deliveryWidth={240} />

        {onTv ? (
          <span className="absolute top-2 left-2 z-10">
            <StatusPill label="ON TV" tone="live" size="sm" pulse />
          </span>
        ) : null}
      </div>

      <span
        className="flex items-center justify-between gap-2 px-3 py-2"
        style={{
          background: 'var(--team-accent)',
          color: 'var(--team-accent-contrast)',
        }}
      >
        <span className="u-label truncate text-[0.8125rem]">{name}</span>
        {player.jersey_number != null ? (
          <span className="u-tabular font-numeral shrink-0 text-[0.9375rem]">
            {player.jersey_number}
          </span>
        ) : null}
      </span>

      {/*
        The armed wash. Colour alone never carries state in this console, so the
        red is paired with a glyph and the instruction that replaces it — an
        operator on a sunlit tablet reads the words, not the tint.
      */}
      {armed ? (
        <span
          aria-hidden
          className="bg-live/20 absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 px-3 text-center"
        >
          <span className="bg-live flex h-11 w-11 items-center justify-center rounded-full text-[1.5rem] leading-none font-bold text-white">
            !
          </span>
          <span className="bg-live u-label rounded-md px-2 py-1 text-[0.6875rem] leading-tight text-white">
            TAP AGAIN TO SEND
          </span>
        </span>
      ) : null}
    </button>
  );
}

export default PlayerSendCard;
