import type { CSSProperties } from 'react';

import type { PlayerRow, RankedPlayer, TeamCode } from '@/lib/types';

/** Anything the card family accepts: a raw row, or a row plus standings. */
export type PlayerLike = PlayerRow | RankedPlayer;

/** True when the player carries standings data (rank, totals). */
export function isRanked(player: PlayerLike): player is RankedPlayer {
  return 'totalPoints' in player && typeof (player as RankedPlayer).totalPoints === 'number';
}

/** `display_name` if the admin set one, otherwise the full name. */
export function displayNameOf(player: PlayerLike): string {
  const name = player.display_name?.trim() || player.full_name?.trim() || '';
  return name;
}

export interface NameParts {
  /** Everything before the last word. May be empty. */
  first: string;
  /** The last word — the one set at hero size. */
  last: string;
  full: string;
}

/**
 * Split a name into the small line and the oversized surname line.
 *
 * Single-word names ("Ronaldinho", "PLAYER A3") put everything on the big
 * line rather than inventing a first name.
 */
export function nameParts(player: PlayerLike): NameParts {
  const full = displayNameOf(player);
  const words = full.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return { first: '', last: words[0] ?? '', full };
  return { first: words.slice(0, -1).join(' '), last: words[words.length - 1], full };
}

/** Up to two initials, for the photo-less fallback. Never empty. */
export function initialsOf(player: PlayerLike): string {
  const full = displayNameOf(player);
  const words = full.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) {
    // "PLAYER A3" style placeholders collapse to something readable.
    const w = words[0];
    return (w.length > 1 ? w.slice(0, 2) : w).toUpperCase();
  }
  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

/** Total points, or `null` when the caller passed a bare `PlayerRow`. */
export function totalPointsOf(player: PlayerLike): number | null {
  return isRanked(player) ? player.totalPoints : null;
}

/** Overall rank, or `null` for a bare `PlayerRow`. */
export function rankOf(player: PlayerLike): number | null {
  return isRanked(player) ? player.rank : null;
}

/** Team code, or `null` for a bare `PlayerRow`. */
export function teamCodeOf(player: PlayerLike): TeamCode | null {
  return isRanked(player) ? player.teamCode : null;
}

/** Slot label (`A3`), or `null` for a bare `PlayerRow`. */
export function slotLabelOf(player: PlayerLike): string | null {
  return isRanked(player) ? player.slotLabel : null;
}

/**
 * Font-size multiplier for the surname line, in `em` of the card's own base
 * size. Long names step down rather than being clipped or squashed — the
 * lockup is allowed to take a second line at any of these steps.
 */
export function surnameScale(surname: string): number {
  const n = surname.length;
  if (n <= 5) return 1;
  if (n <= 7) return 0.88;
  if (n <= 9) return 0.76;
  if (n <= 12) return 0.64;
  if (n <= 16) return 0.52;
  return 0.44;
}

/** Same idea for the small first-name line. */
export function firstNameScale(first: string): number {
  const n = first.length;
  if (n <= 8) return 1;
  if (n <= 12) return 0.85;
  if (n <= 18) return 0.72;
  return 0.62;
}

/**
 * Focal point for a portrait, as a CSS `object-position`. Defaults to the
 * upper third, which is where a football portrait's face usually sits.
 */
export function focalPosition(player: PlayerLike): string {
  const x = Number.isFinite(player.focal_x) ? player.focal_x : 0.5;
  const y = Number.isFinite(player.focal_y) ? player.focal_y : 0.32;
  return `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`;
}

/** The best available portrait, preferring a dedicated cut-out. */
export function portraitSrc(player: PlayerLike): string | null {
  return player.portrait_url || player.photo_url || null;
}

/** Shared props every card in the family accepts. */
export interface PlayerCardBaseProps {
  player: PlayerLike;
  /** Kit colour from the `teams` row. Falls back to the seeded team colour. */
  teamColor?: string | null;
  /** Overrides `player.teamCode` when the caller knows better. */
  teamCode?: TeamCode | null;
  /** Team name for the small caps line, e.g. `TEAM A`. */
  teamName?: string | null;
  /** Lineup slot, e.g. `A3`. Overrides `player.slotLabel`. */
  slotLabel?: string | null;
  className?: string;
  style?: CSSProperties;
}
