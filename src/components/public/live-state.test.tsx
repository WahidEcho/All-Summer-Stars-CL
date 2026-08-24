/**
 * The live view, from the state machine down to the rendered page.
 *
 * These exist because /live returned a 500 on the public site at the worst
 * possible moment: the instant every challenge reached `completed` and the
 * crowd went to look at the final score. `deriveLiveState` reported
 * `event_complete` with `hasFocus: true` and `isMatch: false`; the page read
 * those two, rendered the 1v1 round view, and dereferenced a round that does
 * not exist — a finished event's current challenge is the final match, which
 * owns no rounds at all. `isRanked()`'s `in` operator threw on the null player
 * and took the whole route down, during SSR as well as in the browser.
 *
 * So the state machine is pinned *and* the page is actually rendered. A test
 * that only asserted the flags would have watched the bug sail past: every flag
 * was individually defensible, and it was the page's reading of them together
 * that crashed. `renderToStaticMarkup` is the same path the server render
 * takes, so a throw here is the 500 reproduced.
 *
 * The fixtures come from `buildSampleSnapshot`, the self-consistent sample the
 * TV wall previews from, rather than hand-shaped objects — a fake that drifts
 * from the real snapshot shape would stop testing anything.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { deriveLiveState, figuresCaption, roundFigures } from '@/components/public/live-state';
import { buildSampleSnapshot } from '@/components/tv/sample-model';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { ChallengeRow, RoundRow } from '@/lib/types';

/**
 * The snapshot the page under test reads. Set it, then render — the page pulls
 * from context, and this stands in for the provider the public shell mounts.
 */
let current: EventSnapshot | null = null;

vi.mock('@/components/public/snapshot-context', () => ({
  useSnapshot: () => current,
  useLiveEvent: () => ({
    snapshot: current,
    loading: false,
    error: null,
    stale: false,
    connected: true,
    refresh: () => {},
  }),
}));

/** Render /live against `snapshot`, exactly as the server would. */
async function renderLive(snapshot: EventSnapshot | null): Promise<string> {
  current = snapshot;
  const { default: LivePage } = await import('@/app/(public)/live/page');
  return renderToStaticMarkup(<LivePage />);
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Every challenge `completed` — the real end-of-event shape. */
function finishedEvent(): EventSnapshot {
  return buildSampleSnapshot('ceremony');
}

/** A 1v1 challenge on the field, mid-round, with a full pairing. */
function liveRound(): EventSnapshot {
  return buildSampleSnapshot('live_round');
}

/** Rewrite one challenge's status, keeping `currentChallenge` the same row. */
function withChallengeStatus(
  snapshot: EventSnapshot,
  number: number,
  status: ChallengeRow['status'],
): EventSnapshot {
  const challenges = snapshot.challenges.map((c) => (c.number === number ? { ...c, status } : c));
  return {
    ...snapshot,
    challenges,
    currentChallenge:
      challenges.find((c) => c.id === snapshot.currentChallenge?.id) ?? snapshot.currentChallenge,
  };
}

/**
 * Full time, but the challenge row is not closed out yet.
 *
 * The only window `match_official` ever holds the screen — the seconds or
 * minutes between an official confirming the match result and an operator
 * marking challenge 5 completed.
 */
function fullTimeBeforeCloseout(): EventSnapshot {
  return withChallengeStatus(finishedEvent(), 5, 'live');
}

/**
 * A challenge set live before its rounds were seeded.
 *
 * The other way to reach a focused page with nothing to draw, and one an
 * operator can produce by hand on show day.
 */
function liveChallengeWithoutRounds(): EventSnapshot {
  return { ...liveRound(), rounds: [], currentRound: null, attempts: [], roundTotals: null };
}

/**
 * Nothing has kicked off yet.
 *
 * The sample `holding` scene is not this: its event row already says `live`, so
 * the state machine correctly reads challenge 1 as up next. Standing both the
 * event and its challenges down is what actually produces the holding screen.
 */
function notStarted(): EventSnapshot {
  const snapshot = buildSampleSnapshot('holding');
  return {
    ...snapshot,
    event: { ...snapshot.event, status: 'ready' },
    challenges: snapshot.challenges.map((c) => ({ ...c, status: 'draft' as const })),
  };
}

/** A seeded round still waiting on its pairing. */
function roundWithoutPairing(): EventSnapshot {
  const snapshot = liveRound();
  const round = snapshot.currentRound as RoundRow;
  const unpaired: RoundRow = { ...round, player_a_id: null, player_b_id: null };
  return {
    ...snapshot,
    currentRound: unpaired,
    rounds: snapshot.rounds.map((r) => (r.id === unpaired.id ? unpaired : r)),
  };
}

// ---------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------

describe('deriveLiveState — a finished competition', () => {
  it('reports the competition complete, and reports it as official', () => {
    const state = deriveLiveState(finishedEvent());
    expect(state.status).toBe('event_complete');
    expect(state.isLive).toBe(false);
    expect(state.provisional).toBe(false);
    expect(state.holding).toBe(false);
  });

  it('stands the focus down — there is no contest left to show', () => {
    // The crash was this flag. `hasFocus` sends the page into the contest
    // views, and a finished event has no round and no pairing to feed them.
    expect(deriveLiveState(finishedEvent()).hasFocus).toBe(false);
  });

  it('does not report completion while any challenge is unfinished', () => {
    const snapshot = liveRound();
    expect(snapshot.challenges.some((c) => c.status !== 'completed')).toBe(true);
    expect(deriveLiveState(snapshot).status).not.toBe('event_complete');
  });

  it('does not report completion for an event with no challenges at all', () => {
    const empty: EventSnapshot = {
      ...finishedEvent(),
      challenges: [] as ChallengeRow[],
      currentChallenge: null,
    };
    expect(deriveLiveState(empty).status).not.toBe('event_complete');
  });

  it('holds for a snapshot that has not arrived yet', () => {
    const state = deriveLiveState(null);
    expect(state.holding).toBe(true);
    expect(state.hasFocus).toBe(false);
  });

  it('never calls a finished competition NOT STARTED', () => {
    // `event_complete` carries `isMatch: false` and has no round figures, so it
    // fell into the round vocabulary and came out as the one caption a closing
    // screen must never wear.
    const state = deriveLiveState(finishedEvent());
    const caption = figuresCaption(state, roundFigures(finishedEvent()));

    expect(caption).not.toBe('NOT STARTED');
    expect(caption).toBe('OFFICIAL FINAL SCORE');
  });
});

describe('deriveLiveState — full time, before the challenge is closed out', () => {
  it('reports the official final-match result', () => {
    const state = deriveLiveState(fullTimeBeforeCloseout());
    expect(state.status).toBe('match_official');
    expect(state.label).toBe('FULL TIME');
    expect(state.provisional).toBe(false);
    expect(state.isMatch).toBe(true);
  });

  it('gives way to the competition-complete headline once it is closed out', () => {
    // The handover this whole pair of states exists to make: the same score,
    // re-headlined, never withdrawn.
    expect(deriveLiveState(finishedEvent()).status).toBe('event_complete');
  });
});

// ---------------------------------------------------------------------------
// The page — the 500 itself
// ---------------------------------------------------------------------------

describe('/live renders without a contest to draw', () => {
  it('renders the closing summary when every challenge is completed', async () => {
    const snapshot = finishedEvent();
    // The conditions that produced the 500, asserted so this stays the case
    // under test even if the sample event is reshaped later.
    expect(snapshot.challenges.every((c) => c.status === 'completed')).toBe(true);
    expect(snapshot.currentChallenge?.mechanic).toBe('final_match');
    expect(snapshot.currentRound).toBeNull();

    const html = await renderLive(snapshot);

    expect(html).toContain('COMPETITION COMPLETE');
    expect(html).toContain('Final standings');
    // `NOT STARTED` is what the round caption says when there are no figures.
    // On the closing screen it read as the competition never having happened.
    expect(html).not.toContain('NOT STARTED');
  });

  it('carries the official final-match result onto the closing screen', async () => {
    // The result used to leave the screen the instant challenge 5 was closed
    // out, because `match_official` is the only state that showed it and
    // `event_complete` supersedes it immediately.
    const snapshot = finishedEvent();
    expect(snapshot.match?.status).toBe('completed');

    const html = await renderLive(snapshot);

    expect(html).toContain('OFFICIAL FINAL SCORE');
    // The scorers panel MatchView draws — the substance, not just a heading.
    expect(html).toContain('Scorers');
  });

  it('does not present an unfinished match as the final score', async () => {
    // Challenges closed out over a match still in play. The score on the table
    // is a running one, and a closing screen must not call it official.
    const snapshot = finishedEvent();
    const inPlay: EventSnapshot = {
      ...snapshot,
      match: { ...snapshot.match!, status: 'live' },
    };

    const html = await renderLive(inPlay);

    expect(html).toContain('COMPETITION COMPLETE');
    expect(html).not.toContain('OFFICIAL FINAL SCORE');
  });

  it('shows full time while the challenge row is still open', async () => {
    // The narrow window before closeout still renders its own headline.
    const html = await renderLive(fullTimeBeforeCloseout());
    expect(html).toContain('FULL TIME');
    expect(html).toContain('Scorers');
  });

  it('renders a challenge that is live before its rounds are seeded', async () => {
    const html = await renderLive(liveChallengeWithoutRounds());
    expect(html).toContain('No individual round is on right now');
  });

  it('renders a seeded round that has no pairing yet', async () => {
    const html = await renderLive(roundWithoutPairing());
    expect(html).toContain('No individual round is on right now');
  });

  it('still draws the head-to-head when there is a real pairing', async () => {
    // The guards must not have turned the working case into an empty note.
    const snapshot = liveRound();
    expect(snapshot.currentRound?.player_a_id).toBeTruthy();

    const html = await renderLive(snapshot);
    expect(html).toContain('data-live-side-card');
    expect(html).not.toContain('No individual round is on right now');
  });

  it('still sends a pre-kickoff visitor back to the holding page', async () => {
    // The same no-focus card serves both ends of the show, so the closing
    // links must not have displaced the one that belongs before kick-off.
    const html = await renderLive(notStarted());

    expect(html).toContain('STARTING SOON');
    expect(html).toContain('Back to the event');
    expect(html).not.toContain('Final standings');
  });

  it('renders before the first snapshot arrives', async () => {
    const html = await renderLive(null);
    expect(html).toContain('Connecting to the live event');
  });
});
