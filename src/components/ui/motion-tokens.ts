'use client';

/**
 * Motion tokens.
 *
 * These mirror the `--dur-*` and `--ease-*` custom properties in
 * `src/app/globals.css` one-for-one. CSS-driven motion reads the custom
 * properties; motion/react transitions read the constants here. Keep the two
 * in sync — the CSS file is the specification, this file is its JS binding.
 *
 * Durations are expressed in SECONDS because that is what motion/react wants.
 * `DURATION_MS` carries the same values in milliseconds for `setTimeout`,
 * sequencing and the Web Animations API.
 */

import { createContext, useContext, useSyncExternalStore } from 'react';
import { useReducedMotion } from 'motion/react';
import type { Easing, Transition } from 'motion/react';

/** Duration band, in seconds. Each band is `min <= base <= max`. */
export const DURATION = {
  /** 100–160ms — hover, press, toggle, focus. State feedback. */
  instantMin: 0.1,
  instant: 0.14,
  instantMax: 0.16,

  /** 250–400ms — a score, total or clock changing value. */
  scoreMin: 0.25,
  score: 0.32,
  scoreMax: 0.4,

  /** 500–800ms — a card entering, a leaderboard row moving. */
  cardMin: 0.5,
  card: 0.64,
  cardMax: 0.8,

  /** 800–1200ms — a hero player revealing, a screen changing. */
  heroMin: 0.8,
  hero: 1.0,
  heroMax: 1.2,

  /** 1200–1800ms — the goal celebration takeover. */
  goalMin: 1.2,
  goal: 1.5,
  goalMax: 1.8,

  /** 1800–2800ms — a round / challenge / ceremony result reveal. */
  resultMin: 1.8,
  result: 2.3,
  resultMax: 2.8,
} as const;

export type DurationToken = keyof typeof DURATION;

/** The same bands in milliseconds, for timers and sequencing. */
export const DURATION_MS = Object.fromEntries(
  Object.entries(DURATION).map(([k, v]) => [k, Math.round(v * 1000)]),
) as Record<DurationToken, number>;

/** Cubic-bezier curves, matching the `--ease-*` tokens. */
export const EASE = {
  /** Decisive settle — the house curve for anything a score depends on. */
  broadcast: [0.16, 1, 0.3, 1],
  entrance: [0.22, 1, 0.36, 1],
  exit: [0.55, 0, 1, 0.45],
  soft: [0.4, 0, 0.2, 1],
  /** Slight overshoot — points bursts, rank badges, goal stings only. */
  overshoot: [0.34, 1.4, 0.64, 1],
} as const satisfies Record<string, Easing>;

export type EaseToken = keyof typeof EASE;

/** Springs used where a tween would feel dead — badges, bursts, podium pops. */
export const SPRING = {
  badge: { type: 'spring', stiffness: 520, damping: 30, mass: 0.7 },
  card: { type: 'spring', stiffness: 260, damping: 30, mass: 1 },
  burst: { type: 'spring', stiffness: 340, damping: 22, mass: 0.8 },
  /** Leaderboard reordering — soft enough to read, quick enough to keep up. */
  reorder: { type: 'spring', stiffness: 300, damping: 34, mass: 1 },
} as const satisfies Record<string, Transition>;

/**
 * Sequencing offsets for the score-change choreography (design.md screen 03).
 *
 * The sequence used to land inside the design brief's 1–1.5 second band, which
 * put the `+N` on screen for barely half a second — gone before a head could
 * turn from the pitch to the wall. The organisers asked for the award itself to
 * be readable, so the `+N` now owns a full two seconds: pop in, hold, then
 * travel into the round score, which rolls only once the burst has landed. The
 * totals, rank and team strip follow the roll as before.
 */
export const SCORE_SEQUENCE = {
  /** `+N` appears beside the player. */
  burstIn: 0,
  /** `+N` stops holding and starts its travel into the round score. */
  burstTravel: 1.44,
  /** How long the `+N` is on screen end to end — the readable hold plus the
   *  travel. The round score rolls the moment this window closes. */
  burstShow: 2.0,
  /** The total rolls to its new value, after the round score has settled. */
  totalRoll: 2.3,
  /** The rank badge updates. */
  rankUpdate: 2.6,
  /** The team strip catches up. */
  teamUpdate: 2.75,
  /** Whole sequence, seconds. The burst's safety net keys off this. */
  total: 3.0,
} as const;

const NEVER_CHANGES = () => () => {};

/**
 * True inside a surface that animates regardless of the machine's setting.
 *
 * The broadcast wall is not a page anybody browses. It is the show, driven by a
 * venue PC nobody chose the accessibility settings on, and its choreography is
 * the product: a reveal that does not reveal is a fault, not an accommodation.
 * Surfaces real people open on their own devices — the public site, the
 * consoles — keep honouring the preference, which is why this is a context
 * rather than a build flag.
 */
export const AlwaysAnimateContext = createContext(false);

/**
 * Does this surface reduce motion?
 *
 * Wraps the raw preference for two reasons. The wall overrides it outright, per
 * the context above. And the raw hook is not safe to branch on while rendering
 * on the server: `useReducedMotion()` returns undefined there but reads the
 * media query synchronously on the very first client render, so a tree that
 * branches on it can render one shape on the server and a different one during
 * hydration. React answers an element-count mismatch by discarding the tree and
 * re-rendering the root — a full repaint of the wall, at load, in front of the
 * room. Reporting "not reduced" until after hydration makes the two agree, and
 * the preference still lands a frame later for anyone who set it.
 */
export function useReducedMotionSafe(): boolean {
  const alwaysAnimate = useContext(AlwaysAnimateContext);
  const preference = useReducedMotion();
  const hydrated = useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
  if (alwaysAnimate) return false;
  return hydrated ? preference === true : false;
}

/**
 * `1` normally, `0` when the viewer asked for reduced motion.
 *
 * Multiply any *decorative* duration or travel distance by this. Note that
 * `useReducedMotion()` returns `null` during the server render and the first
 * client paint, which we treat as "not reduced" so the first frame matches
 * the markup the server produced.
 */
export function useMotionScale(): 0 | 1 {
  return useReducedMotionSafe() ? 0 : 1;
}

/**
 * A duration in seconds, collapsed to a single frame under reduced motion.
 * State still changes instantly — only the travel is removed.
 */
export function useDuration(seconds: number): number {
  return useReducedMotionSafe() ? 0.001 : seconds;
}

/**
 * The house transition. `token` picks the band, `ease` picks the curve.
 *
 *   <motion.div transition={useTransitionToken('card')} />
 */
export function useTransitionToken(
  token: DurationToken = 'card',
  ease: EaseToken = 'broadcast',
): Transition {
  return { duration: useDuration(DURATION[token]), ease: EASE[ease] };
}

/** Non-hook variant, for transitions built outside a component body. */
export function transitionToken(
  token: DurationToken = 'card',
  ease: EaseToken = 'broadcast',
): Transition {
  return { duration: DURATION[token], ease: EASE[ease] };
}

/**
 * Stagger step for a group entrance, scaled so a 10-card grid still lands
 * inside its band instead of trailing off screen.
 */
export function staggerFor(count: number, band: number = DURATION.card): number {
  if (count <= 1) return 0;
  return Math.min(0.08, (band * 0.6) / count);
}
