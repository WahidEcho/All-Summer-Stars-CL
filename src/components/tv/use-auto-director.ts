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
 * Where the show stands, ignoring the timed steps. Pure, so it also decides
 * the server-rendered first frame.
 */
export function steadyAutoScene(snapshot: EventSnapshot): DirectedScene {
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
  const queue = useRef<Step[]>([]);
  const watched = useRef<RoundRow | null>(null);
  const primed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const live = snapshot ? liveRoundOf(snapshot) : null;
  const liveId = live?.id ?? null;

  // The publish detector needs the watched round's CURRENT status, not the
  // stale row captured when it went live.
  const watchedNow =
    snapshot && watched.current
      ? (snapshot.allRounds.find((r) => r.id === watched.current?.id) ?? null)
      : null;
  const watchedPublished =
    watchedNow != null &&
    (watchedNow.status === 'published' || watchedNow.status === 'completed');

  useEffect(() => {
    if (!enabled || !snapshot) return;

    // First look at a wall that is already mid-show: adopt the state without
    // replaying anything the room has already watched.
    if (!primed.current) {
      primed.current = true;
      watched.current = live;
      return;
    }

    const pending: Step[] = [];

    // The round we were showing has just been published: its result gets the
    // floor before anything else — including a next round that started the
    // same second.
    if (watchedPublished && watchedNow) {
      pending.push({
        directed: {
          scene: 'round_result',
          payload: { challengeId: watchedNow.challenge_id, roundId: watchedNow.id },
        },
        holdMs: RESULT_HOLD_MS,
      });
      watched.current = null;
    }

    // A round started under our watch — its entrance queues behind any hold.
    if (live && live.id !== watched.current?.id) {
      watched.current = live;
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
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPlaying(null);
        return;
      }
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPlaying(step.directed);
      timer.current = setTimeout(advance, step.holdMs);
    };
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the transitions alone
  }, [enabled, liveId, watchedPublished]);

  // Switching the director off abandons the queue outright.
  useEffect(() => {
    if (enabled) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    queue.current = [];
    primed.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPlaying(null);
  }, [enabled]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!enabled || !snapshot) return null;
  return playing ?? steadyAutoScene(snapshot);
}
