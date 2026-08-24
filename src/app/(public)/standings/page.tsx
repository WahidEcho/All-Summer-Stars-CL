'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { CompactPlayerCard } from '@/components/player';
import { ChallengeRail } from '@/components/public/ChallengeRail';
import { EmptyNote, Panel } from '@/components/public/Panel';
import {
  eventDateLabel,
  rankLabel,
  sharedRankCount,
  teamLabel,
} from '@/components/public/format';
import { deriveLiveState } from '@/components/public/live-state';
import { useSnapshot } from '@/components/public/snapshot-context';
import { useRankMovement } from '@/components/public/use-rank-movement';
import { StatusPill, TeamScoreStrip } from '@/components/ui';
import type { RankedPlayer } from '@/lib/types';

/**
 * The individual leaderboard.
 *
 * Two rules govern this page, and both are about not overstating a number:
 *
 *  1. **Shared ranks are named as shared.** The ranking config allows ties, so
 *     three players on 24 points are all `#2` and the next player is `#5`.
 *     Writing a bare `#2` on three rows looks like a bug, so a tied row carries
 *     `SHARED #2` in words as well as the `=` glyph on the badge. The one
 *     exception is a field that is entirely level — ten identical pills say
 *     nothing, so the panel note states it once instead.
 *  2. **Penalty-tiebreak points are never folded into a total.** They exist
 *     only to separate two equal players, so they get their own panel and are
 *     never added to the figure on a player's row.
 *
 * Rank movement is measured against what this device was last showing rather
 * than against any stored history — `useRankMovement` is explicit about that,
 * and the note under the panel says so to the reader too.
 */

/** Stable empty array so the movement hook does not see a new list each render. */
const NO_STANDINGS: RankedPlayer[] = [];

export default function StandingsPage() {
  const snapshot = useSnapshot();
  const standings = snapshot?.standings ?? NO_STANDINGS;
  const movements = useRankMovement(standings);
  const state = deriveLiveState(snapshot);

  const tiebreakers = useMemo(
    () => standings.filter((player) => player.penaltyPoints !== 0),
    [standings],
  );

  if (!snapshot) {
    return <EmptyNote>Connecting to the live event…</EmptyNote>;
  }

  const { event, teamsByCode, teamPoints } = snapshot;
  const dateLabel = eventDateLabel(event);
  // The #1 row is only enlarged when there genuinely *is* a #1. While every
  // player is level — before a ball is kicked, or on a true tie at the top —
  // singling out whoever happens to sort first would invent a leader.
  const first = standings[0] ?? null;
  const leader = first && !first.sharedRank && first.totalPoints > 0 ? first : null;
  const chasers = leader ? standings.slice(1) : standings;
  const tiedAtTop = first?.sharedRank ? sharedRankCount(standings, first.rank) : 0;

  const teamAName = teamLabel(teamsByCode.A, 'A');
  const teamBName = teamLabel(teamsByCode.B, 'B');

  // A `SHARED #1` pill on every single row — which is what happens before a
  // ball is kicked — is noise, and it crowds the team name off a phone. When
  // the whole field is level the panel note says so once instead.
  const everyoneLevel =
    standings.length > 0 && sharedRankCount(standings, standings[0].rank) === standings.length;

  const rowProps = (player: RankedPlayer) => ({
    player,
    teamColor: player.teamCode ? teamsByCode[player.teamCode]?.color : null,
    teamName: player.teamCode
      ? teamLabel(teamsByCode[player.teamCode], player.teamCode)
      : null,
    previousRank: movements[player.id] ?? null,
    status: player.sharedRank && !everyoneLevel ? (
      <StatusPill
        tone="neutral"
        variant="soft"
        size="sm"
        glyph={false}
        label={rankLabel(player.rank, true)}
      />
    ) : null,
  });

  return (
    <div className="flex flex-col gap-6 py-2">
      {/* ---------------------------------------------------------- header */}
      <header className="flex flex-col items-center gap-3 text-center">
        <p className="u-eyebrow text-aqua-700 text-eyebrow">Individual standings</p>
        <h1 className="u-display text-ink text-[2.25rem] leading-none sm:text-[3rem]">
          Leaderboard
        </h1>
        {dateLabel ? (
          <p className="u-label text-text-muted text-[0.625rem]">{dateLabel}</p>
        ) : null}
        <StatusPill tone={state.tone} size="md" label={state.label} pulse={state.isLive} />
      </header>

      {/* ----------------------------------------------------- team totals */}
      <section aria-label="Team totals" className="flex flex-col gap-2">
        {/*
          `md` matches the strip on /live, so the team score reads identically
          wherever a spectator meets it. `shortName` is passed for the narrow
          case even though the current component ignores it.
        */}
        <TeamScoreStrip
          size="md"
          unit="PTS"
          teamA={{
            code: 'A',
            name: teamAName,
            shortName: teamsByCode.A?.short_name,
            score: teamPoints.A,
            color: teamsByCode.A?.color,
          }}
          teamB={{
            code: 'B',
            name: teamBName,
            shortName: teamsByCode.B?.short_name,
            score: teamPoints.B,
            color: teamsByCode.B?.color,
          }}
        />
        <p className="u-label text-text-muted text-center text-[0.625rem]">
          Team totals are the sum of every player&rsquo;s confirmed points
        </p>
      </section>

      {/* ----------------------------------------------------- leaderboard */}
      <Panel
        eyebrow="Every player"
        title="Full table"
        aside={
          <span className="u-label text-text-muted text-[0.625rem]">
            {standings.length} PLAYERS
          </span>
        }
        note={
          tiedAtTop > 1
            ? `Ranked on confirmed regular points. ${tiedAtTop} players are level at the top, so there is no outright leader yet.`
            : 'Ranked on confirmed regular points. Tied players share a rank, and the next rank skips accordingly.'
        }
      >
        {standings.length === 0 ? (
          <EmptyNote>
            No points yet — the leaderboard fills up as soon as the first challenge starts.
          </EmptyNote>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {leader ? (
              <li>
                <Link
                  href={`/players/${leader.slug}`}
                  className="focus-visible:outline-focus block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <CompactPlayerCard
                    {...rowProps(leader)}
                    emphasis="leader"
                    size="lg"
                    showFullName
                  />
                </Link>
              </li>
            ) : null}

            {chasers.map((player) => (
              <li key={player.id}>
                <Link
                  href={`/players/${player.slug}`}
                  className="focus-visible:outline-focus block rounded-md focus-visible:outline-2 focus-visible:outline-offset-2"
                >
                  <CompactPlayerCard {...rowProps(player)} size="md" showFullName />
                </Link>
              </li>
            ))}
          </ol>
        )}

        <p className="u-label text-text-muted mt-4 text-[0.625rem] leading-relaxed">
          Movement badges (<span aria-hidden>↑</span> up / <span aria-hidden>↓</span> down)
          compare each rank with the one this screen last showed, and clear a few seconds
          after the change.
        </p>
      </Panel>

      {/* ------------------------------------------------ penalty tiebreak */}
      <Panel
        eyebrow="Tiebreak only"
        title="Penalty-tiebreak points"
        note="Kept out of the totals above on purpose."
      >
        {tiebreakers.length === 0 ? (
          <EmptyNote>
            No penalty-tiebreak points have been awarded. They only appear if the final
            match goes to a shootout.
          </EmptyNote>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tiebreakers.map((player) => (
              <li
                key={player.id}
                className="border-border-subtle flex items-center gap-3 border-b pb-1.5 last:border-b-0 last:pb-0"
              >
                <span className="u-label text-text-muted w-16 shrink-0 text-[0.625rem]">
                  {rankLabel(player.rank, player.sharedRank)}
                </span>
                <Link
                  href={`/players/${player.slug}`}
                  className="u-display text-ink hover:text-aqua-700 min-w-0 flex-1 truncate text-[1.125rem] leading-none underline-offset-4 hover:underline"
                >
                  {player.display_name?.trim() || player.full_name}
                </Link>
                <span className="u-numeral u-tabular text-ink shrink-0 text-[1.125rem]">
                  {player.penaltyPoints}
                </span>
                <span className="u-label text-text-muted shrink-0 text-[0.5625rem]">
                  TIEBREAK
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="u-label text-text-muted mt-4 text-[0.625rem] leading-relaxed">
          Penalty-tiebreak points are shown separately and only break a tie between two
          equal totals. They are never added to a player&rsquo;s regular points, and they
          never change a team total.
        </p>
      </Panel>

      <ChallengeRail size="sm" label="Competition progress" />

      <p className="u-label text-text-muted text-center text-[0.625rem]">
        <Link
          href="/results"
          className="hover:text-ink underline underline-offset-4"
        >
          See every round result
        </Link>
      </p>
    </div>
  );
}
