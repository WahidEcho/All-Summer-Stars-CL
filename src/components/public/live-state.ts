/**
 * What the event is doing right now, expressed once so every public surface
 * agrees.
 *
 * The rule this module exists to enforce: **a provisional score is never
 * presented as an official one.** While a round is live the figures on screen
 * are derived from confirmed attempts and are labelled as running totals; once
 * a scorekeeper submits a result the round is `awaiting_result`/`result_ready`
 * and the figures are labelled as pending; only a published round is called an
 * official result. The same distinction is drawn for the final match.
 *
 * Pure functions over the snapshot — no hooks, no fetching.
 */

import type { StatusPillTone } from '@/components/ui';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { ResultOutcome, TeamCode } from '@/lib/types';

export type LiveStatus =
  | 'idle'
  | 'round_upcoming'
  | 'round_live'
  | 'round_awaiting'
  | 'round_official'
  | 'match_upcoming'
  | 'match_live'
  | 'match_halftime'
  | 'match_awaiting'
  | 'match_penalties'
  | 'match_official'
  | 'event_complete';

export interface LiveState {
  status: LiveStatus;
  /** Short all-caps pill label. */
  label: string;
  tone: StatusPillTone;
  /** A full sentence — used for the caption and for screen readers. */
  description: string;
  /** True while the numbers on screen are a running or unconfirmed total. */
  provisional: boolean;
  /** True when a scorekeeper has reversed an entry inside what is on screen. */
  corrected: boolean;
  /** True when the ball is actually in play. */
  isLive: boolean;
  /**
   * True when there is a current contest worth showing at all.
   *
   * It does not promise a round to draw: a 1v1 challenge can be `live` before
   * its rounds are seeded, and a seeded round can still be waiting on its
   * pairing. A surface rendering a head-to-head must check `currentRound` and
   * both players itself.
   */
  hasFocus: boolean;
  /** True when the show has not started — the holding screen. */
  holding: boolean;
  /** True when the current focus is the 5v5 rather than a 1v1 round. */
  isMatch: boolean;
}

const IDLE: LiveState = {
  status: 'idle',
  label: 'STARTING SOON',
  tone: 'draw',
  description: 'The competition has not started yet.',
  provisional: false,
  corrected: false,
  isLive: false,
  hasFocus: false,
  holding: true,
  isMatch: false,
};

/** Work out where the show is, from the snapshot alone. */
export function deriveLiveState(snapshot: EventSnapshot | null): LiveState {
  if (!snapshot) return IDLE;

  const { challenges, currentChallenge, currentRound, match } = snapshot;

  const everythingDone =
    challenges.length > 0 && challenges.every((c) => c.status === 'completed');

  if (everythingDone) {
    // No focus, deliberately. Once every challenge is finished there is no
    // contest left to point a camera at, and the snapshot has nothing to draw
    // one from: `pickCurrentChallenge` has fallen through to the last challenge
    // — the final match — which owns no rounds, so `currentRound` is null and
    // the pairing is null with it.
    //
    // Claiming focus here is what put a 500 on the public page at the exact
    // moment the crowd went to look at the final score, and even with the
    // round view guarded it left the closing screen headlined `FIVE A SIDE.
    // FORTY MINUTES.` over a caption reading `NOT STARTED`. Standing the
    // competition down onto the summary card is both the honest reading of
    // this state and the one its own copy already describes.
    return {
      status: 'event_complete',
      label: 'COMPETITION COMPLETE',
      tone: 'winner',
      description: 'Every challenge is finished. Final standings are official.',
      provisional: false,
      corrected: false,
      isLive: false,
      hasFocus: false,
      holding: false,
      isMatch: false,
    };
  }

  const started =
    snapshot.event.status === 'live' ||
    challenges.some((c) => c.status === 'live' || c.status === 'completed');

  if (!started || !currentChallenge) return IDLE;

  const isMatch = currentChallenge.mechanic === 'final_match';

  if (isMatch) {
    const corrected =
      snapshot.goals.some((g) => g.status === 'reversed') ||
      snapshot.penaltyAttempts.some((p) => p.status === 'reversed');

    const base = { corrected, hasFocus: true, holding: false, isMatch: true } as const;

    switch (match?.status) {
      case 'live':
        return {
          ...base,
          status: 'match_live',
          label: 'LIVE',
          tone: 'live',
          description: 'The final match is in play.',
          provisional: true,
          isLive: true,
        };
      case 'halftime':
        return {
          ...base,
          status: 'match_halftime',
          label: 'HALF TIME',
          tone: 'draw',
          description: 'Half time in the final match. The score so far is not final.',
          provisional: true,
          isLive: false,
        };
      case 'penalties':
        return {
          ...base,
          status: 'match_penalties',
          label: 'ON PENALTIES',
          tone: 'live',
          description: 'The final match is being decided on penalties.',
          provisional: true,
          isLive: true,
        };
      case 'awaiting_result':
      case 'result_ready':
        return {
          ...base,
          status: 'match_awaiting',
          label: 'AWAITING OFFICIAL RESULT',
          tone: 'draw',
          description:
            'Full time has been called. The result is being verified and is not official yet.',
          provisional: true,
          isLive: false,
        };
      case 'completed':
        // A narrow window by nature: this holds the screen only between the
        // match row finishing and an operator closing challenge 5, after which
        // `everythingDone` short-circuits above and the state becomes
        // `event_complete`. That is the right headline once the whole event is
        // over — but the score it was showing is not superseded by it, so the
        // closing screen carries the same official result forward rather than
        // dropping it. See the `event_complete` branch and /live's summary card.
        return {
          ...base,
          status: 'match_official',
          label: 'FULL TIME',
          tone: 'winner',
          description: 'Full time. This is the official final-match result.',
          provisional: false,
          isLive: false,
        };
      default:
        return {
          ...base,
          status: 'match_upcoming',
          label: 'FINAL MATCH NEXT',
          tone: 'pending',
          description: 'The final 5v5 match is next.',
          provisional: false,
          isLive: false,
        };
    }
  }

  const corrected = snapshot.attempts.some((a) => a.status === 'reversed');
  const base = { corrected, hasFocus: true, holding: false, isMatch: false } as const;

  switch (currentRound?.status) {
    case 'live':
      return {
        ...base,
        status: 'round_live',
        label: 'LIVE',
        tone: 'live',
        description: 'This round is being played. Scores are running totals.',
        provisional: true,
        isLive: true,
      };
    case 'awaiting_result':
      return {
        ...base,
        status: 'round_awaiting',
        label: 'AWAITING OFFICIAL SCORE',
        tone: 'draw',
        description:
          'The round is over and the result is being verified. Nothing here is official yet.',
        provisional: true,
        isLive: false,
      };
    case 'result_ready':
      return {
        ...base,
        status: 'round_awaiting',
        label: 'PENDING CONFIRMATION',
        tone: 'draw',
        description:
          'A result has been entered but not published. It is not official yet.',
        provisional: true,
        isLive: false,
      };
    case 'published':
    case 'completed':
      return {
        ...base,
        status: 'round_official',
        label: 'OFFICIAL RESULT',
        tone: 'winner',
        description: 'This round result is official and counted in the standings.',
        provisional: false,
        isLive: false,
      };
    default:
      return {
        ...base,
        status: 'round_upcoming',
        label: 'UP NEXT',
        tone: 'pending',
        description: 'This round has not started yet.',
        provisional: false,
        isLive: false,
      };
  }
}

// ---------------------------------------------------------------------------
// The figures that go with that state
// ---------------------------------------------------------------------------

export interface RoundFigures {
  scoreA: number;
  scoreB: number;
  /** True only when the round has been published. */
  official: boolean;
  /** Where the numbers came from, so the caption can say so honestly. */
  source: 'attempts' | 'submitted' | 'published' | 'none';
  winner: ResultOutcome | null;
}

/**
 * The two numbers to show for the current round, and what they actually are.
 *
 * Live rounds read from confirmed attempts; a submitted-but-unpublished round
 * reads the scorekeeper's entered figures; a published round reads the same
 * figures, now official.
 */
export function roundFigures(snapshot: EventSnapshot | null): RoundFigures {
  const round = snapshot?.currentRound ?? null;
  if (!snapshot || !round) {
    return { scoreA: 0, scoreB: 0, official: false, source: 'none', winner: null };
  }

  if (round.status === 'live' || round.status === 'ready' || round.status === 'pending') {
    const totals = snapshot.roundTotals;
    return {
      scoreA: totals?.scoreA ?? 0,
      scoreB: totals?.scoreB ?? 0,
      official: false,
      source: totals ? 'attempts' : 'none',
      winner: null,
    };
  }

  const published = round.status === 'published' || round.status === 'completed';
  return {
    scoreA: round.score_a,
    scoreB: round.score_b,
    official: published,
    source: published ? 'published' : 'submitted',
    winner: round.winner,
  };
}

/** Confirmed attempts for one side of the current round, in order. */
export function attemptsForSide(snapshot: EventSnapshot | null, side: TeamCode) {
  if (!snapshot) return [];
  return snapshot.attempts
    .filter((a) => a.side === side && a.status === 'confirmed')
    .sort((a, b) => a.attempt_number - b.attempt_number);
}

/** True when this round is the one the scorekeeper is entering into now. */
export function activeSide(snapshot: EventSnapshot | null): TeamCode | null {
  return snapshot?.currentRound?.active_side ?? null;
}

/**
 * A short caption stating what the numbers mean — the honesty line that sits
 * under every score on the public site.
 */
export function figuresCaption(state: LiveState, figures: RoundFigures): string {
  // Checked ahead of both vocabularies below, because `event_complete` belongs
  // to neither: it carries `isMatch: false`, so it would fall into the round
  // wording and — having no round figures to describe — come out as
  // `NOT STARTED` under the closing screen's final score.
  if (state.status === 'event_complete') return 'OFFICIAL FINAL SCORE';

  if (state.isMatch) {
    switch (state.status) {
      case 'match_live':
        return 'LIVE SCORE';
      case 'match_halftime':
        return 'SCORE AT HALF TIME';
      case 'match_awaiting':
        return 'PROVISIONAL — RESULT BEING VERIFIED';
      case 'match_penalties':
        return 'LEVEL AFTER FULL TIME — PENALTIES IN PROGRESS';
      case 'match_official':
        return 'OFFICIAL FINAL SCORE';
      default:
        return 'NOT STARTED';
    }
  }

  switch (figures.source) {
    case 'attempts':
      return 'RUNNING TOTAL FROM CONFIRMED ATTEMPTS';
    case 'submitted':
      return 'PROVISIONAL — NOT PUBLISHED YET';
    case 'published':
      return 'OFFICIAL ROUND SCORE';
    default:
      return 'NOT STARTED';
  }
}
