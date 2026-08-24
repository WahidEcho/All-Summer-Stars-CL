import type { CSSProperties } from 'react';

import type { TeamCode, TeamRow } from '@/lib/types';

/**
 * Fallbacks that mirror `supabase/migrations/0002_seed_event.sql`. Live team
 * colours always come from the `teams` row; these only cover the case where a
 * component is handed a player with no team.
 */
export const TEAM_FALLBACK_COLOR: Record<TeamCode, string> = {
  A: '#0E6BA8',
  B: '#D3323C',
};

export const NEUTRAL_ACCENT = '#55959D';

/** Ink used for text sitting on a light tint of the accent. */
const ACCENT_INK_BASE = '#0E2A33';

function parseHex(input: string): [number, number, number] | null {
  const hex = input.trim().replace(/^#/, '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

function channel(v: number): number {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

/** Relative luminance, 0 (black) – 1 (white). */
export function luminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) return 0.25;
  const [r, g, b] = rgb.map(channel);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * White or deep ink, whichever keeps text on `color` readable. The switch
 * point (0.42) is tuned so mid saturated blues and reds still take white,
 * matching how kit colours behave on a daylight LED wall.
 */
export function readableOn(color: string): string {
  return luminance(color) > 0.42 ? '#231F20' : '#FFFFFF';
}

export interface TeamAccentVars extends CSSProperties {
  '--team-accent': string;
  '--team-accent-soft': string;
  '--team-accent-ink': string;
  '--team-accent-contrast': string;
}

/**
 * The style object every team-aware component spreads onto its root.
 *
 * Writes four custom properties so children can paint with the live team
 * colour without any of them knowing which team they belong to:
 *
 *   --team-accent           the kit colour itself
 *   --team-accent-soft      a pale wash of it, for fields and rules
 *   --team-accent-ink       a darkened version that stays readable on white
 *   --team-accent-contrast  white or ink — text that sits ON the accent
 */
export function teamAccentVars(
  color?: string | null,
  teamCode?: TeamCode | null,
): TeamAccentVars {
  const accent =
    (color && parseHex(color) ? color : null) ??
    (teamCode ? TEAM_FALLBACK_COLOR[teamCode] : null) ??
    NEUTRAL_ACCENT;

  return {
    '--team-accent': accent,
    '--team-accent-soft': `color-mix(in oklab, ${accent} 16%, white)`,
    '--team-accent-ink': `color-mix(in oklab, ${accent} 62%, ${ACCENT_INK_BASE})`,
    '--team-accent-contrast': readableOn(accent),
  };
}

/** Convenience for callers that already hold the `teams` row. */
export function teamRowAccentVars(team?: TeamRow | null): TeamAccentVars {
  return teamAccentVars(team?.color, team?.code);
}
