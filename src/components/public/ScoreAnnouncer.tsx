'use client';

/**
 * The spoken score.
 *
 * Everything on this site signals state with a glyph and a word as well as a
 * colour, but a leaderboard that reorders silently is still invisible to a
 * screen reader. This component watches the few things that genuinely matter —
 * the live round score, the match score and who leads — and writes a plain
 * sentence into a polite live region when one of them changes.
 *
 * It is muted from the header, and when muted it stops writing rather than
 * merely hiding: an `aria-live` region that keeps updating off screen is worse
 * than none at all.
 */

import { useEffect, useRef, useState } from 'react';

import { displayNameOf } from '@/components/player';
import { useAnnouncements } from '@/components/public/preferences';
import { useSnapshot } from '@/components/public/snapshot-context';
import {
  deriveLiveState,
  roundFigures,
} from '@/components/public/live-state';
import { teamLabel } from '@/components/public/format';

export function ScoreAnnouncer() {
  const snapshot = useSnapshot();
  const { enabled } = useAnnouncements();
  const [message, setMessage] = useState('');
  const previous = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || !snapshot) return;

    const state = deriveLiveState(snapshot);
    const teamA = teamLabel(snapshot.teamsByCode.A, 'A');
    const teamB = teamLabel(snapshot.teamsByCode.B, 'B');

    let next: string | null = null;

    if (state.isMatch && snapshot.matchTotals) {
      const { scoreA, scoreB } = snapshot.matchTotals;
      const penalties = snapshot.penaltyTotals;
      const shootout =
        state.status === 'match_penalties' && penalties
          ? `, penalties ${penalties.scoreA} to ${penalties.scoreB}`
          : '';
      next = `${state.label}. ${teamA} ${scoreA}, ${teamB} ${scoreB}${shootout}.`;
    } else if (state.hasFocus && snapshot.currentRound && snapshot.currentChallenge) {
      const figures = roundFigures(snapshot);
      const a = snapshot.currentRound.player_a_id
        ? snapshot.playersById[snapshot.currentRound.player_a_id]
        : null;
      const b = snapshot.currentRound.player_b_id
        ? snapshot.playersById[snapshot.currentRound.player_b_id]
        : null;
      const nameA = a ? displayNameOf(a) : teamA;
      const nameB = b ? displayNameOf(b) : teamB;
      const qualifier = figures.official ? 'Official result' : 'Provisional score';
      next =
        `Challenge ${snapshot.currentChallenge.number}, round ${snapshot.currentRound.number}. ` +
        `${qualifier}: ${nameA} ${figures.scoreA}, ${nameB} ${figures.scoreB}.`;
    }

    const leader = snapshot.standings[0];
    if (leader) {
      const tied = snapshot.standings.filter((p) => p.rank === 1).length > 1;
      const leaderLine = tied
        ? `Leading the individual standings: ${snapshot.standings
            .filter((p) => p.rank === 1)
            .map((p) => displayNameOf(p))
            .join(' and ')}, tied on ${leader.totalPoints} points.`
        : `Leading the individual standings: ${displayNameOf(leader)} on ${leader.totalPoints} points.`;
      next = next ? `${next} ${leaderLine}` : leaderLine;
    }

    if (!next || next === previous.current) return;
    previous.current = next;
    setMessage(next);
  }, [snapshot, enabled]);

  return (
    <p
      className="u-sr-only"
      role="status"
      aria-live={enabled ? 'polite' : 'off'}
      aria-atomic="true"
    >
      {enabled ? message : ''}
    </p>
  );
}

export default ScoreAnnouncer;
