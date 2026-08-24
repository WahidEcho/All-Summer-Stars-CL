'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { LiveSideCard } from '@/components/player';
import { ChallengeRail, RoundRail } from '@/components/public/ChallengeRail';
import { EmptyNote, Panel } from '@/components/public/Panel';
import {
  anySlotLabel,
  challengeEyebrow,
  challengeHeadline,
  configForChallenge,
  playerOf,
  rankedOf,
  scoringSummary,
  teamLabel,
} from '@/components/public/format';
import {
  activeSide,
  attemptsForSide,
  deriveLiveState,
  figuresCaption,
  roundFigures,
} from '@/components/public/live-state';
import { useSnapshot } from '@/components/public/snapshot-context';
import { AttemptDots, ScoreNumeral, StatusPill, TeamScoreStrip, attemptDotStates } from '@/components/ui';
import { attemptsPerPlayer, formatClock } from '@/lib/scoring/engine';
import { useTimer } from '@/lib/hooks';
import type { TeamCode } from '@/lib/types';

/**
 * The focused live view.
 *
 * Whatever is happening right now — a 1v1 round or the 5v5 final — this page
 * shows it and nothing else: the clock, the score, the scorers and the penalty
 * state. No invented statistics, and a caption under every number saying
 * plainly whether it is a running total or the official result.
 */
export default function LivePage() {
  const snapshot = useSnapshot();
  const state = deriveLiveState(snapshot);
  const figures = roundFigures(snapshot);
  const timer = useTimer(snapshot?.activeTimer ?? null);

  const challenge = snapshot?.currentChallenge ?? null;
  const config = useMemo(
    () => (snapshot && challenge ? configForChallenge(snapshot.scoring, challenge.number) : null),
    [snapshot, challenge],
  );

  if (!snapshot) {
    return <EmptyNote>Connecting to the live event…</EmptyNote>;
  }

  if (!state.hasFocus) {
    return (
      <div className="flex flex-col gap-6 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <StatusPill tone={state.tone} size="lg" label={state.label} />
          <p className="text-text-secondary max-w-md text-sm">{state.description}</p>
          <Link
            href="/"
            className="text-navy-soft hover:text-navy text-xs tracking-[0.16em] uppercase underline underline-offset-4"
          >
            Back to the event
          </Link>
        </div>
        <ChallengeRail size="md" label="Competition progress" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 py-2">
      <header className="flex flex-col items-center gap-3 text-center">
        {challenge ? (
          <>
            <p className="text-text-muted text-xs tracking-[0.24em] uppercase">
              {challengeEyebrow(challenge)}
              {snapshot.currentRound ? ` • Round ${snapshot.currentRound.number} of 5` : null}
            </p>
            <h1 className="font-display text-text-primary text-3xl tracking-[0.06em] uppercase sm:text-4xl">
              {challengeHeadline(challenge)}
            </h1>
          </>
        ) : null}
        <StatusPill tone={state.tone} size="lg" label={state.label} pulse={state.isLive} />
      </header>

      {state.isMatch ? (
        <MatchView timerLabel={timer ? formatClock(timer.displayMs) : null} />
      ) : (
        <RoundView
          config={config}
          timerLabel={
            timer
              ? formatClock(timer.displayMs, { tenths: timer.mode !== 'count_up' })
              : null
          }
        />
      )}

      <p className="text-text-muted text-center text-xs tracking-[0.14em] uppercase">
        {figuresCaption(state, figures)}
      </p>

      <TeamScoreStrip
        teamA={{
          code: 'A',
          name: teamLabel(snapshot.teamsByCode.A, 'A'),
          score: snapshot.teamPoints.A,
          color: snapshot.teamsByCode.A?.color,
        }}
        teamB={{
          code: 'B',
          name: teamLabel(snapshot.teamsByCode.B, 'B'),
          score: snapshot.teamPoints.B,
          color: snapshot.teamsByCode.B?.color,
        }}
        unit="PTS"
      />

      <ChallengeRail size="sm" label="Competition progress" />
      <RoundRail />

      {config ? (
        <Panel eyebrow="How this scores" title={challenge?.title ?? 'Scoring'}>
          <p className="text-text-secondary text-sm">{scoringSummary(config)}</p>
        </Panel>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ 1v1 */

function RoundView({
  config,
  timerLabel,
}: {
  config: ReturnType<typeof configForChallenge>;
  timerLabel: string | null;
}) {
  const snapshot = useSnapshot();
  const figures = roundFigures(snapshot);
  const live = activeSide(snapshot);
  if (!snapshot) return null;

  const round = snapshot.currentRound;
  const playerA = playerOf(snapshot, round?.player_a_id);
  const playerB = playerOf(snapshot, round?.player_b_id);
  const total = config ? attemptsPerPlayer(config) : 3;

  // There is not always a round to draw. Once every challenge is finished the
  // current challenge is the final match, which has no rounds at all, and the
  // pairing is null. Rendering the cards regardless is what took this page down
  // with a 500 the moment the competition ended — precisely when the crowd
  // looks at it.
  if (!round || !playerA || !playerB) {
    return (
      <EmptyNote>
        No individual round is on right now. Check the results for the latest official scores.
      </EmptyNote>
    );
  }

  const side = (code: TeamCode) => {
    const attempts = attemptsForSide(snapshot, code);
    return {
      attempts,
      dots: attemptDotStates(
        attempts.map((a) => (a.points > 0 ? ('hit' as const) : ('miss' as const))),
        total,
        live === code,
      ),
      values: attempts.map((a) => a.points),
    };
  };

  const a = side('A');
  const b = side('B');

  return (
    <section className="flex flex-col gap-4">
      {timerLabel ? (
        <p className="font-numeral text-text-primary text-center text-5xl tabular-nums sm:text-6xl">
          {timerLabel}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <LiveSideCard
          player={rankedOf(snapshot, playerA.id) ?? playerA}
          side="left"
          active={live === 'A'}
          roundScore={figures.scoreA}
          attempts={a.dots}
          attemptTotal={total}
          teamColor={snapshot.teamsByCode.A?.color}
          teamName={teamLabel(snapshot.teamsByCode.A, 'A')}
          slotLabel={anySlotLabel(snapshot, playerA.id)}
        />

        <div className="flex items-center justify-center gap-3 sm:flex-col">
          <ScoreNumeral value={figures.scoreA} size="md" />
          <span className="font-display text-text-muted text-xl">—</span>
          <ScoreNumeral value={figures.scoreB} size="md" />
        </div>

        <LiveSideCard
          player={rankedOf(snapshot, playerB.id) ?? playerB}
          side="right"
          active={live === 'B'}
          roundScore={figures.scoreB}
          attempts={b.dots}
          attemptTotal={total}
          teamColor={snapshot.teamsByCode.B?.color}
          teamName={teamLabel(snapshot.teamsByCode.B, 'B')}
          slotLabel={anySlotLabel(snapshot, playerB.id)}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <AttemptDots
          attempts={a.dots}
          total={total}
          values={a.values}
          label={`${teamLabel(snapshot.teamsByCode.A, 'A')} attempts`}
          align="start"
        />
        <AttemptDots
          attempts={b.dots}
          total={total}
          values={b.values}
          label={`${teamLabel(snapshot.teamsByCode.B, 'B')} attempts`}
          align="end"
        />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ 5v5 */

function MatchView({ timerLabel }: { timerLabel: string | null }) {
  const snapshot = useSnapshot();
  if (!snapshot?.match) return null;

  const { match, goals, shootout, penaltyTotals } = snapshot;
  const confirmed = goals.filter((g) => g.status === 'confirmed');

  return (
    <section className="flex flex-col gap-5">
      <div className="flex items-center justify-center gap-6">
        <TeamBlock code="A" score={match.score_a} />
        {timerLabel ? (
          <div className="flex flex-col items-center">
            <p className="font-numeral text-text-primary text-4xl tabular-nums sm:text-5xl">
              {timerLabel}
            </p>
            <p className="text-text-muted text-[0.65rem] tracking-[0.2em] uppercase">
              Half {match.current_half}
            </p>
          </div>
        ) : (
          <span className="font-display text-text-muted text-2xl">—</span>
        )}
        <TeamBlock code="B" score={match.score_b} />
      </div>

      {shootout && penaltyTotals ? (
        <div className="border-aqua-300 bg-aqua-50 flex flex-col items-center gap-1 rounded-2xl border p-4">
          <p className="text-navy-soft text-xs tracking-[0.22em] uppercase">Penalties</p>
          <p className="font-numeral text-navy text-3xl tabular-nums">
            {penaltyTotals.scoreA} — {penaltyTotals.scoreB}
          </p>
          <p className="text-navy-soft text-[0.65rem] tracking-[0.16em] uppercase">
            The regular score stays {match.score_a} — {match.score_b}
          </p>
        </div>
      ) : null}

      <Panel eyebrow="Goals" title="Scorers">
        {confirmed.length === 0 ? (
          <EmptyNote>No goals yet.</EmptyNote>
        ) : (
          <ol className="flex flex-col gap-2">
            {confirmed
              .slice()
              .sort((x, y) => x.clock_ms - y.clock_ms)
              .map((goal) => {
                const scorer = playerOf(snapshot, goal.scorer_id);
                return (
                  <li
                    key={goal.id}
                    className="border-border-subtle flex items-center gap-3 border-b pb-2 last:border-0"
                  >
                    <span className="font-numeral text-text-muted w-14 text-sm tabular-nums">
                      {formatClock(goal.clock_ms)}
                    </span>
                    <span
                      aria-hidden
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: snapshot.teamsByCode[goal.team_code]?.color }}
                    />
                    <span className="font-display text-text-primary text-lg tracking-[0.04em] uppercase">
                      {goal.is_own_goal
                        ? 'Own goal'
                        : (scorer?.display_name ?? scorer?.full_name ?? 'Unattributed')}
                    </span>
                    <span className="text-text-muted ml-auto text-xs tracking-[0.14em] uppercase">
                      {teamLabel(snapshot.teamsByCode[goal.team_code], goal.team_code)}
                    </span>
                  </li>
                );
              })}
          </ol>
        )}
      </Panel>
    </section>
  );
}

function TeamBlock({ code, score }: { code: TeamCode; score: number }) {
  const snapshot = useSnapshot();
  const team = snapshot?.teamsByCode[code] ?? null;
  return (
    <div className="flex flex-col items-center gap-1">
      <span
        aria-hidden
        className="h-2 w-12 rounded-full"
        style={{ background: team?.color ?? undefined }}
      />
      {/* Two of these sit either side of the running clock. At the full `lg`
          step that row is wider than a phone, so the figure takes a smaller
          one below `sm` and the designed step from there up. */}
      <ScoreNumeral value={score} size="lg" valueClassName="text-[2.5rem] sm:text-score-lg" />
      <p className="font-display text-text-secondary text-sm tracking-[0.14em] uppercase">
        {teamLabel(team, code)}
      </p>
    </div>
  );
}
