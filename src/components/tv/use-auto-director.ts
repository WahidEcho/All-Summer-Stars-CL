'use client';

/**
 * The auto-director — scene AUTO, "follow the show".
 *
 * With this on program, the wall runs itself off the scoring controller and
 * the operator never touches the display console during play:
 *
 *   controller starts round 1 of a challenge
 *       → LINEUPS for 20 seconds → HEAD-TO-HEAD for 10 → LIVE ROUND
 *   controller starts any other round
 *       → HEAD-TO-HEAD for 10 seconds → LIVE ROUND
 *   round runs until the controller submits and publishes
 *       → ROUND RESULT, held until the next round starts — and for at least
 *         twelve seconds even if the next round starts immediately, so a
 *         result can never be flashed past the room
 *   fifth result published and the challenge ended
 *       → CHALLENGE RESULT, held until the next challenge's first round starts
 *         — and for at least twenty seconds even if it starts immediately
 *   the 5v5 under way (any of its states, golden goal and penalties included)
 *       → FINAL MATCH
 *   final match completed
 *       → LEADERBOARD, held — the ceremony stays in the operator's hands
 *
 * Steady state is a pure function of the snapshot, so the server can paint the
 * right frame on load. The timed steps exist only as reactions to transitions
 * seen *while the wall is watching* — a wall plugged in mid-round joins the
 * live round directly instead of replaying an intro the room has already seen.
 */

import { useEffect, useRef, useState } from 'react';

import type { EventSnapshot } from '@/lib/data/snapshot';
import type { DisplayScene, RoundRow } from '@/lib/types';

export interface DirectedScene {
  scene: DisplayScene;
  payload: Record<string, unknown>;
}

const LINEUPS_HOLD_MS = 20_000;
const HEAD_TO_HEAD_HOLD_MS = 10_000;
/** The floor under every published result, whatever the controller does next. */
const RESULT_HOLD_MS = 12_000;
/** The floor under a completed challenge's result card — the bigger moment. */
const CHALLENGE_HOLD_MS = 20_000;

/** States that mean a 1v1 round currently owns the show. */
const ROUND_IN_FLIGHT: ReadonlyArray<RoundRow['status']> = [
  'live',
  'awaiting_result',
  'result_ready',
];

/**
 * The round the controller is running right now.
 *
 * When more than one round is somehow in flight — a dress run once left five,
 * started and abandoned across two devices — the show is wherever the operator
 * went LAST, so the highest (challenge, round) wins. The server now refuses to
 * open a second round, so this is a belt for data predating that brace.
 */
function liveRoundOf(snapshot: EventSnapshot): RoundRow | null {
  const numberOf = new Map(snapshot.challenges.map((c) => [c.id, c.number]));
  let best: RoundRow | null = null;
  let bestKey = -1;
  for (const round of snapshot.allRounds) {
    if (!ROUND_IN_FLIGHT.includes(round.status)) continue;
    const key = (numberOf.get(round.challenge_id) ?? 0) * 100 + round.number;
    if (key > bestKey) {
      best = round;
      bestKey = key;
    }
  }
  return best;
}

/**
 * The round published within the hold window, if any.
 *
 * Derived from `published_at` rather than from anything the client remembers.
 * An in-memory "which round was I watching" is exactly what a refetch race,
 * a remount or a reconnect loses — and losing it is what let a result be
 * skipped. A timestamp in the data cannot be lost.
 */
function heldResult(snapshot: EventSnapshot, nowMs: number): RoundRow | null {
  let best: RoundRow | null = null;
  let bestAt = 0;
  for (const round of snapshot.allRounds) {
    if (!round.published_at) continue;
    const at = Date.parse(round.published_at);
    if (Number.isNaN(at) || at > bestAt) {
      if (!Number.isNaN(at)) {
        best = round;
        bestAt = at;
      }
    }
  }
  if (!best) return null;
  return nowMs - bestAt < RESULT_HOLD_MS ? best : null;
}

/**
 * The challenge completed within its hold window, if any. Same construction as
 * `heldResult`: `completed_at` is stamped by the complete-challenge command, so
 * the window is carried by the data and survives anything the client does.
 */
function heldChallenge(snapshot: EventSnapshot, nowMs: number) {
  let best: (typeof snapshot.challenges)[number] | null = null;
  let bestAt = 0;
  for (const challenge of snapshot.challenges) {
    if (challenge.mechanic === 'final_match' || !challenge.completed_at) continue;
    const at = Date.parse(challenge.completed_at);
    if (Number.isNaN(at) || at <= bestAt) continue;
    best = challenge;
    bestAt = at;
  }
  if (!best) return null;
  return nowMs - bestAt < CHALLENGE_HOLD_MS ? best : null;
}

/**
 * The scene a hold window demands right now, or null when no window is open.
 *
 * A just-published round outranks a just-completed challenge — the room sees
 * the round it watched, then the challenge card — and both outrank a round
 * that has already gone live underneath them.
 */
function heldScene(snapshot: EventSnapshot, nowMs: number): DirectedScene | null {
  const round = heldResult(snapshot, nowMs);
  if (round) {
    return {
      scene: 'round_result',
      payload: { challengeId: round.challenge_id, roundId: round.id },
    };
  }
  const challenge = heldChallenge(snapshot, nowMs);
  if (challenge) {
    return { scene: 'challenge_result', payload: { challengeId: challenge.id } };
  }
  return null;
}

/**
 * Where the show stands, ignoring the timed steps. Pure, so it also decides
 * the server-rendered first frame.
 */
export function steadyAutoScene(snapshot: EventSnapshot, nowMs = Date.now()): DirectedScene {
  const match = snapshot.match;
  const finalChallenge = snapshot.challenges.find((c) => c.mechanic === 'final_match') ?? null;

  // The 5v5 owns the wall from its first whistle to its last kick — golden
  // goal and the day shootout included.
  if (
    match &&
    ['live', 'halftime', 'awaiting_result', 'result_ready', 'golden_goal', 'penalties'].includes(
      match.status,
    )
  ) {
    return { scene: 'final_match', payload: {} };
  }
  if (match && match.status === 'completed') {
    return { scene: 'leaderboard', payload: {} };
  }

  // An open hold window outranks a round that has just gone live: the room
  // sees the result of what it watched — round, then challenge — before the
  // next pairing.
  const held = heldScene(snapshot, nowMs);
  if (held) return held;

  const live = liveRoundOf(snapshot);
  if (live) {
    return {
      scene: 'live_round',
      payload: { challengeId: live.challenge_id, roundId: live.id },
    };
  }

  // Nothing in flight: hold the most recent official result.
  const published = snapshot.allRounds
    .filter((r) => r.status === 'published' || r.status === 'completed')
    .map((r) => ({
      round: r,
      challenge: snapshot.challenges.find((c) => c.id === r.challenge_id) ?? null,
    }))
    .filter((x) => x.challenge !== null)
    .sort(
      (x, y) =>
        (y.challenge?.number ?? 0) - (x.challenge?.number ?? 0) ||
        y.round.number - x.round.number,
    );

  const latest = published[0];
  if (latest && latest.challenge) {
    const siblings = snapshot.allRounds.filter(
      (r) => r.challenge_id === latest.challenge?.id,
    );
    const challengeDone =
      siblings.length > 0 &&
      siblings.every((r) => r.status === 'published' || r.status === 'completed');
    if (challengeDone) {
      return { scene: 'challenge_result', payload: { challengeId: latest.challenge.id } };
    }
    return {
      scene: 'round_result',
      payload: { challengeId: latest.challenge.id, roundId: latest.round.id },
    };
  }

  // Before the first whistle of the day: if the operator has started challenge
  // 1 but not its first round, the lineups are the natural holding frame.
  const startedChallenge = snapshot.challenges.find(
    (c) => c.status === 'live' && c.mechanic !== 'final_match',
  );
  if (startedChallenge && finalChallenge?.status !== 'completed') {
    return { scene: 'lineups', payload: { challengeId: startedChallenge.id } };
  }

  return { scene: 'holding', payload: {} };
}

interface Step {
  directed: DirectedScene;
  holdMs: number;
}

/**
 * The full director: steady state plus the timed steps that play when a
 * transition happens under our watch. Returns null while inactive so the
 * caller falls back to the operator's own scene untouched.
 */
export function useAutoDirector(
  snapshot: EventSnapshot | null,
  enabled: boolean,
): DirectedScene | null {
  const [playing, setPlaying] = useState<DirectedScene | null>(null);
  // The result hold is a wall-clock window, so the surface needs a heartbeat to
  // notice it expiring. Reading the clock during render would be impure.
  const [nowMs, setNowMs] = useState(() => Date.now());
  const queue = useRef<Step[]>([]);
  const watchedId = useRef<string | null>(null);
  const primed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || !snapshot) return;

    const live = liveRoundOf(snapshot);

    // First look at a wall that is already mid-show: adopt the state without
    // replaying anything the room has already watched.
    if (!primed.current) {
      primed.current = true;
      watchedId.current = live?.id ?? null;
      return;
    }

    // While a hold window is open, no intro may start — the render below
    // prefers the hold over anything this queue plays. The effect peeks one
    // second ahead so the entrance is queued and already on `playing` at the
    // exact tick the hold lifts, instead of a frame of live round leaking
    // through between the two.
    if (heldScene(snapshot, nowMs + 1_000)) return;

    const pending: Step[] = [];

    // A round started under our watch — play its entrance.
    if (live && live.id !== watchedId.current) {
      watchedId.current = live.id;
      if (live.number === 1) {
        pending.push({
          directed: { scene: 'lineups', payload: { challengeId: live.challenge_id } },
          holdMs: LINEUPS_HOLD_MS,
        });
      }
      pending.push({
        directed: {
          scene: 'head_to_head',
          payload: { challengeId: live.challenge_id, roundId: live.id },
        },
        holdMs: HEAD_TO_HEAD_HOLD_MS,
      });
    }

    if (pending.length === 0) return;

    const alreadyPlaying = timer.current !== null;
    queue.current.push(...pending);
    if (alreadyPlaying) return;

    const advance = () => {
      const step = queue.current.shift();
      if (!step) {
        timer.current = null;
        setPlaying(null);
        return;
      }
      setPlaying(step.directed);
      timer.current = setTimeout(advance, step.holdMs);
    };
    advance();
    // `nowMs` is a deliberate dependency: hold windows close by clock, not by
    // data, so the queue must get a look at each tick, not just each snapshot.
  }, [enabled, snapshot, nowMs]);

  // Switching the director off abandons the queue outright.
  useEffect(() => {
    if (enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = [];
    primed.current = false;
    // Abandoning a queue on shutdown is a single terminal write, not a cascade.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(null);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    const id = setInterval(() => setNowMs(Date.now()), 1_000);
    return () => clearInterval(id);
  }, [enabled]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!enabled || !snapshot) return null;
  // The holds are checked here too, not just in the steady state: an intro
  // that was already playing when a result landed must yield to it.
  return heldScene(snapshot, nowMs) ?? playing ?? steadyAutoScene(snapshot, nowMs);
}
