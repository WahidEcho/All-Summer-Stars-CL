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
 *       → ROUND RESULT, held until the next round starts
 *   fifth result published and the challenge ended
 *       → CHALLENGE RESULT, held until the next challenge's first round starts
 *   the 5v5 under way (any of its states, golden goal and penalties included)
 *       → FINAL MATCH
 *   final match completed
 *       → LEADERBOARD, held — the ceremony stays in the operator's hands
 *
 * Steady state is a pure function of the snapshot, so the server can paint the
 * right frame on load. The timed intros exist only as reactions to a round
 * *starting while the wall is watching* — a wall plugged in mid-round joins the
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

/** States that mean a 1v1 round currently owns the show. */
const ROUND_IN_FLIGHT: ReadonlyArray<RoundRow['status']> = [
  'live',
  'awaiting_result',
  'result_ready',
];

/** The round the controller is running right now, if any. */
function liveRoundOf(snapshot: EventSnapshot): RoundRow | null {
  return snapshot.allRounds.find((r) => ROUND_IN_FLIGHT.includes(r.status)) ?? null;
}

/**
 * Where the show stands, ignoring the timed intros. Pure, so it also decides
 * the server-rendered first frame.
 */
export function steadyAutoScene(snapshot: EventSnapshot): DirectedScene {
  const match = snapshot.match;
  const finalChallenge = snapshot.challenges.find((c) => c.mechanic === 'final_match') ?? null;

  // The 5v5 owns the wall from its first whistle to its last kick — golden
  // goal and the day shootout included.
  if (match && ['live', 'halftime', 'awaiting_result', 'result_ready', 'golden_goal', 'penalties'].includes(match.status)) {
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

/**
 * The full director: steady state plus the timed intro that plays when a round
 * starts while the wall is live. Returns null while inactive so the caller
 * falls back to the operator's own scene untouched.
 */
export function useAutoDirector(
  snapshot: EventSnapshot | null,
  enabled: boolean,
): DirectedScene | null {
  const [intro, setIntro] = useState<DirectedScene | null>(null);
  const seenLiveRound = useRef<string | null>(null);
  const primed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const liveId = snapshot ? (liveRoundOf(snapshot)?.id ?? null) : null;

  useEffect(() => {
    if (!enabled || !snapshot) return;

    const live = liveRoundOf(snapshot);

    // First look at a wall that is already mid-show: adopt the state without
    // replaying an intro the room has already watched.
    if (!primed.current) {
      primed.current = true;
      seenLiveRound.current = live?.id ?? null;
      return;
    }

    if (!live) {
      seenLiveRound.current = null;
      return;
    }
    if (live.id === seenLiveRound.current) return;
    seenLiveRound.current = live.id;

    // A round just started under our watch — run its entrance.
    const steps: Array<{ directed: DirectedScene; holdMs: number }> = [];
    if (live.number === 1) {
      steps.push({
        directed: { scene: 'lineups', payload: { challengeId: live.challenge_id } },
        holdMs: LINEUPS_HOLD_MS,
      });
    }
    steps.push({
      directed: {
        scene: 'head_to_head',
        payload: { challengeId: live.challenge_id, roundId: live.id },
      },
      holdMs: HEAD_TO_HEAD_HOLD_MS,
    });

    if (timer.current) clearTimeout(timer.current);
    let index = 0;
    const advance = () => {
      const step = steps[index];
      if (!step) {
        setIntro(null);
        timer.current = null;
        return;
      }
      setIntro(step.directed);
      index += 1;
      timer.current = setTimeout(advance, step.holdMs);
    };
    advance();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the live round alone
  }, [enabled, liveId]);

  // The intro must never outlive the round it introduced — a round that is
  // published mid-intro (or the director being switched off) cuts straight to
  // the steady state.
  useEffect(() => {
    if (enabled && liveId) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    // Cutting a finished intro: one-shot, guarded by the early return above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIntro(null);
  }, [enabled, liveId]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  if (!enabled || !snapshot) return null;
  return intro ?? steadyAutoScene(snapshot);
}
