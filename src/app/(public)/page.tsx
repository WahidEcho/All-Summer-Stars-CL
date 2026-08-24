'use client';

import Link from 'next/link';
import { EventMark } from '@/components/brand';
import { CompactPlayerCard } from '@/components/player';
import { ChallengeRail } from '@/components/public/ChallengeRail';
import { EmptyNote, Panel } from '@/components/public/Panel';
import {
  challengeEyebrow,
  challengeHeadline,
  configForChallenge,
  eventDateLabel,
  eventTimeLabel,
  leadSentence,
  scoringSummary,
  teamLabel,
} from '@/components/public/format';
import { deriveLiveState } from '@/components/public/live-state';
import { useSnapshot } from '@/components/public/snapshot-context';
import { StatusPill } from '@/components/ui';

/**
 * The page the QR points at.
 *
 * Before kick-off it is a holding screen: the event mark, when and where, and
 * what the five challenges are. Once the show starts the live contest takes the
 * top of the page and everything else moves below it.
 */
export default function PublicHome() {
  const snapshot = useSnapshot();
  const state = deriveLiveState(snapshot);

  if (!snapshot) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
        <EventMark variant="light" width="min(80vw, 34rem)" priority />
        <p className="text-text-muted text-sm">Loading live scores…</p>
      </div>
    );
  }

  const { event, challenges, teams, standings, teamPoints } = snapshot;
  const dateLabel = eventDateLabel(event);
  const timeLabel = eventTimeLabel(event);
  const topFive = standings.slice(0, 5);

  return (
    <div className="flex flex-col gap-8 py-4">
      {/* ------------------------------------------------------------ hero */}
      <header className="flex flex-col items-center gap-5 text-center">
        <EventMark variant="light" width="min(86vw, 40rem)" priority />

        <div className="flex flex-col items-center gap-2">
          {dateLabel ? (
            <p className="font-display text-text-primary text-lg tracking-[0.2em] uppercase sm:text-xl">
              {dateLabel}
            </p>
          ) : null}
          {event.holding_headline ? (
            <p className="text-text-secondary text-sm tracking-[0.18em] uppercase">
              {event.holding_headline}
            </p>
          ) : event.venue ? (
            <p className="text-text-secondary text-sm tracking-[0.18em] uppercase">
              Live from {event.venue}
            </p>
          ) : null}
          {timeLabel && state.holding ? (
            <p className="text-text-muted text-xs tracking-[0.16em] uppercase">
              Kick-off {timeLabel}
            </p>
          ) : null}
        </div>

        <StatusPill tone={state.tone} size="lg" label={state.label} pulse={state.isLive} />

        {state.hasFocus ? (
          <Link
            href="/live"
            className="bg-aqua-400 text-text-on-aqua hover:bg-aqua-500 focus-visible:outline-aqua-700 font-display rounded-full px-8 py-3 text-lg tracking-[0.14em] uppercase transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Watch live
          </Link>
        ) : null}
      </header>

      <ChallengeRail size="md" label="Competition progress" />

      {/* ------------------------------------------------------- standings */}
      <Panel
        eyebrow="Individual standings"
        title="Top 5 players"
        aside={
          <Link
            href="/standings"
            className="text-navy-soft hover:text-navy text-xs tracking-[0.16em] uppercase underline underline-offset-4"
          >
            Full table
          </Link>
        }
        note={leadSentence(
          teamLabel(snapshot.teamsByCode.A, 'A'),
          teamPoints.A,
          teamLabel(snapshot.teamsByCode.B, 'B'),
          teamPoints.B,
        )}
      >
        {topFive.length === 0 ? (
          <EmptyNote>
            No points yet — the leaderboard fills up as soon as the first challenge starts.
          </EmptyNote>
        ) : (
          <ol className="flex flex-col gap-2">
            {topFive.map((player, index) => (
              <li key={player.id}>
                <Link href={`/players/${player.slug}`} className="block">
                  <CompactPlayerCard
                    player={player}
                    emphasis={index === 0 ? 'leader' : 'default'}
                    teamColor={snapshot.teamsByCode[player.teamCode ?? 'A']?.color}
                  />
                </Link>
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {/* ------------------------------------------------------ challenges */}
      <Panel eyebrow="The format" title="Five challenges">
        <ul className="flex flex-col gap-3">
          {challenges.map((challenge) => {
            const summary = scoringSummary(
              configForChallenge(snapshot.scoring, challenge.number),
            );
            const isCurrent = snapshot.currentChallenge?.id === challenge.id;
            return (
              <li
                key={challenge.id}
                className={
                  isCurrent
                    ? 'border-aqua-400 bg-aqua-50 rounded-2xl border-2 p-4'
                    : 'border-border-subtle bg-surface-raised rounded-2xl border p-4'
                }
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-text-muted text-xs tracking-[0.2em] uppercase">
                    {challengeEyebrow(challenge)}
                  </p>
                  {challenge.status === 'completed' ? (
                    <StatusPill tone="winner" size="sm" label="Complete" />
                  ) : isCurrent ? (
                    <StatusPill tone="live" size="sm" label="Live" pulse />
                  ) : null}
                </div>
                <p className="font-display text-text-primary mt-1 text-2xl tracking-[0.06em] uppercase">
                  {challengeHeadline(challenge)}
                </p>
                {summary ? (
                  <p className="text-text-secondary mt-1 text-sm">{summary}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      {/* ----------------------------------------------------------- teams */}
      <Panel eyebrow="The squads" title="Team A vs Team B">
        <div className="grid gap-4 sm:grid-cols-2">
          {teams.map((team) => {
            const squad = snapshot.players.filter((p) => p.team_id === team.id);
            return (
              <div key={team.id} className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-hidden
                    className="h-3 w-3 rounded-full"
                    style={{ background: team.color }}
                  />
                  <p className="font-display text-text-primary text-xl tracking-[0.1em] uppercase">
                    {teamLabel(team, team.code)}
                  </p>
                  <span className="text-text-muted ml-auto text-sm tabular-nums">
                    {teamPoints[team.code]} pts
                  </span>
                </div>
                <ul className="flex flex-col gap-1.5">
                  {squad.map((player) => (
                    <li key={player.id}>
                      <Link href={`/players/${player.slug}`} className="block">
                        <CompactPlayerCard
                          player={player}
                          size="sm"
                          teamColor={team.color}
                          teamName={teamLabel(team, team.code)}
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}
