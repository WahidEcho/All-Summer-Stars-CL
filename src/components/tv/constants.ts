/**
 * The broadcast canvas.
 *
 * Every TV scene is composed at exactly 1920x1080 and scaled to the viewport
 * with a single CSS transform, so the composition is pixel-identical on the LED
 * wall, on a 4K confidence monitor and in a laptop browser. Nothing inside a
 * scene ever measures the viewport.
 */

/** Master canvas width, in CSS px. */
export const STAGE_W = 1920;
/** Master canvas height, in CSS px. */
export const STAGE_H = 1080;

/** Safe area honoured on every edge of the canvas. */
export const SAFE = 72;

/** Persistent broadcast header band — ~11% of the canvas. */
export const HEADER_H = 120;
/** Persistent sponsor ticker band — ~8% of the canvas. */
export const TICKER_H = 86;
/** What is left for live content — ~81%. */
export const CONTENT_H = STAGE_H - HEADER_H - TICKER_H;

/** Vertical breathing room inside the content region. */
export const CONTENT_PAD_Y = 24;

/** Nominal QR edge length in the header. */
export const HEADER_QR = 78;

/**
 * Height of the competition mark inside the header band.
 *
 * The lockup is roughly 2:1, so a mark asked for by *width* is half that tall —
 * a 300px-wide mark stands 150px in a 120px band, which is how the wall ended
 * up showing a lockup clipped along its top edge and overlapping the first row
 * of the scene. Sizing by height instead keeps 16px of clear space above and
 * below, and the width (~176px) still clears the 150px floor design.md sets.
 */
export const HEADER_MARK_H = 88;

/**
 * The exact height of the live-content row for a given furniture combination.
 *
 * The 1080px canvas is a three-row stack — header, content, ticker — and the
 * content row is bounded to this, never to "whatever is left after the flex
 * settles". A scene whose intrinsic content is taller is clipped rather than
 * allowed to paint under the sponsor strip, which on the LED wall means a
 * player's chin disappearing behind a sponsor logo.
 */
export function contentHeight(header: boolean, ticker: boolean): number {
  return STAGE_H - (header ? HEADER_H : 0) - (ticker ? TICKER_H : 0);
}

/**
 * The ceremony runs as a sequence of operator-advanced phases. `ceremony_phase`
 * is a free-text column, so unknown values fall back to the opening slate
 * rather than rendering nothing on the wall.
 */
export const CEREMONY_PHASES = [
  'complete',
  'champions',
  'top5_5',
  'top5_4',
  'top5_3',
  'top5_2',
  'top5_1',
  'top_player_stats',
  'partners',
  'closing',
] as const;

export type CeremonyPhase = (typeof CEREMONY_PHASES)[number];

/** Tolerate the shorthand an operator is likely to type. */
const CEREMONY_ALIASES: Record<string, CeremonyPhase> = {
  '': 'complete',
  a: 'complete',
  b: 'champions',
  c: 'top5_5',
  slate: 'complete',
  'competition_complete': 'complete',
  'competition-complete': 'complete',
  champion: 'champions',
  champions_team: 'champions',
  'champions-team': 'champions',
  winners: 'champions',
  team: 'champions',
  top5: 'top5_5',
  'top-5': 'top5_5',
  '5': 'top5_5',
  '4': 'top5_4',
  '3': 'top5_3',
  '2': 'top5_2',
  '1': 'top5_1',
  top: 'top5_1',
  'top_player': 'top5_1',
  'top-player': 'top5_1',
  'top-player-stats': 'top_player_stats',
  stats: 'top_player_stats',
  breakdown: 'top_player_stats',
  sponsors: 'partners',
  thanks: 'partners',
  end: 'closing',
  close: 'closing',
};

/** Normalise whatever the admin wrote into a phase this renderer knows. */
export function resolveCeremonyPhase(raw: string | null | undefined): CeremonyPhase {
  if (!raw) return 'complete';
  const key = raw.trim().toLowerCase();
  if ((CEREMONY_PHASES as readonly string[]).includes(key)) return key as CeremonyPhase;
  return CEREMONY_ALIASES[key] ?? 'complete';
}

/** Index of a phase in the running order — used to decide what has been revealed. */
export function ceremonyStep(phase: CeremonyPhase): number {
  return CEREMONY_PHASES.indexOf(phase);
}
