'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { HeroPlayerCard, rankOf, type PlayerLike } from '@/components/player';
import {
  DURATION,
  EASE,
  StatusPill,
  useMotionScale,
} from '@/components/ui';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { SceneHeadline } from '@/components/tv/parts/SceneHeadline';
import { StarBurst } from '@/components/tv/parts/StarBurst';
import { TeamTotals } from '@/components/tv/parts/TeamTotals';
import { useRankMemory } from '@/components/tv/use-score-choreography';
import { useRevealStage } from '@/components/tv/use-reveal-stage';
import type { SceneProps } from '@/components/tv/scene-props';
import type { SideModel } from '@/components/tv/scene-model';
import type { ResultOutcome, TeamCode } from '@/lib/types';

/**
 * design.md screen 05, in milliseconds.
 *
 *   0.5 ROUND COMPLETE · 1.2 both cards re-enter · 2.0 figures and the outcome
 *   2.6 team standings
 *
 * After the last mark the screen stops moving. It stays on air until the
 * operator advances, so anything still animating at that point would be
 * animating for the rest of the interval.
 */
const MARKS = [500, 1200, 2000, 2600] as const;

const STAGE = { headline: 1, cards: 2, outcome: 3, standings: 4 } as const;

/** The five-pointed star used for the draw's symmetric convergence. */
const STAR_POINTS = (() => {
  const points: string[] = [];
  for (let i = 0; i < 10; i += 1) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? 50 : 23.9;
    points.push(
      `${(50 + Math.cos(angle) * radius).toFixed(2)},${(50 + Math.sin(angle) * radius).toFixed(2)}`,
    );
  }
  return points.join(' ');
})();

interface ResultSideProps {
  side: 'left' | 'right';
  code: TeamCode;
  player: PlayerLike | null;
  team: SideModel;
  roundScore: number;
  previousRank: number | null;
  outcome: ResultOutcome;
  /** Cards are on screen. */
  entered: boolean;
  /** The winner may take its extra size and its label. */
  emphasised: boolean;
}

/**
 * One player's half of the result: their own round score, their own total and
 * their own rank — the losing side keeps all three, because this event pays
 * individual prizes and a player who lost a round can still have gained on the
 * field.
 */
function ResultSide({
  side,
  code,
  player,
  team,
  roundScore,
  previousRank,
  outcome,
  entered,
  emphasised,
}: ResultSideProps) {
  const motionOn = useMotionScale() === 1;
  const draw = outcome === 'draw';
  const won = !draw && outcome === code;
  const lost = !draw && outcome !== code && (outcome === 'A' || outcome === 'B');

  // The winner grows into the 10–15% band the brief specifies; the opponent
  // steps back rather than disappearing.
  const scale = !emphasised ? 1 : won ? 1.13 : lost ? 0.93 : 1;

  return (
    <div className="flex min-h-0 flex-col items-center gap-4">
      <div className="flex h-[64px] items-end">
        <motion.div
          initial={motionOn ? { opacity: 0, y: 14 } : false}
          animate={emphasised && won ? { opacity: 1, y: 0 } : { opacity: 0, y: 14 }}
          transition={{ duration: DURATION.card, ease: EASE.entrance }}
          className="flex flex-col items-center gap-2"
        >
          <span className="u-display text-winner text-[46px] leading-none">ROUND WINNER</span>
        </motion.div>
      </div>

      <motion.div
        initial={motionOn ? { opacity: 0, y: 46 } : false}
        animate={entered ? { opacity: 1, y: 0, scale } : { opacity: 0, y: 46, scale: 1 }}
        transition={{ duration: DURATION.card, ease: EASE.entrance }}
        style={{ transformOrigin: 'center center' }}
        className="flex min-h-0 flex-1 items-center justify-center"
      >
        {player ? (
          <HeroPlayerCard
            player={player}
            teamColor={team.color}
            teamCode={code}
            teamName={team.name}
            eyebrow={team.shortName}
            roundPoints={roundScore}
            roundLabel="ROUND SCORE"
            totalLabel="TOTAL POINTS"
            rank={rankOf(player)}
            previousRank={emphasised ? previousRank : null}
            tone={draw ? 'draw' : won ? 'winner' : 'loser'}
            size={won ? 'lg' : 'md'}
            aspect="3 / 4"
            from={side === 'left' ? 'left' : 'right'}
            animateIn={false}
            photoPriority
            status={
              draw && emphasised ? (
                <StatusPill label="ROUND DRAW" tone="draw" size="sm" pulse={false} />
              ) : null
            }
            /* Sized so the winner's 13% growth still clears the strip below. */
            className="h-[88%]"
          />
        ) : (
          <div className="ring-border-subtle flex h-[88%] w-full items-center justify-center rounded-xl bg-white/70 ring-1">
            <span className="u-label text-text-muted text-[18px]">NO PLAYER</span>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/**
 * SCREEN 05 — ROUND RESULT.
 *
 * The strongest of the recurring moments: the gameplay furniture goes, `ROUND
 * COMPLETE` lands, both players come back as portraits, the winner grows, and
 * the team standings settle underneath.
 *
 * A draw is not a quieter win. It gets its own headline, two equal cards and a
 * symmetric convergence of stars from either edge — nothing about the frame
 * favours a side, because nothing about the result did.
 */
export function RoundResultScene({ model }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  const round = model.round;
  const stage = useRevealStage(MARKS, round?.id ?? null);
  const at = (mark: number) => stage >= mark;

  const previousRanks = useRankMemory(model.standings);

  // A published round carries its own figures; a round the operator cut to
  // before publication still has the attempts, and they agree.
  const scoreA = model.roundScoreA || round?.score_a || 0;
  const scoreB = model.roundScoreB || round?.score_b || 0;

  const outcome: ResultOutcome =
    round?.winner ?? (scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'draw');
  const draw = outcome === 'draw';

  const winnerSide: SideModel | null = draw ? null : model.side(outcome as TeamCode);
  const winnerPlayer = draw ? null : outcome === 'A' ? model.playerA : model.playerB;

  const winnerRank = winnerPlayer ? rankOf(winnerPlayer) : null;
  const winnerPrevious = winnerPlayer ? previousRanks.get(winnerPlayer.id) ?? null : null;
  const newLeader =
    winnerRank === 1 && winnerPrevious != null && winnerPrevious > 1;

  return (
    <SceneFrame
      eyebrow={model.challengeLabel}
      title={model.challengeTitle}
      detail={model.roundLabel}
      status={
        <StatusPill
          label={draw ? 'ROUND DRAW' : `${winnerSide?.shortName ?? ''} WIN`.trim()}
          tone={draw ? 'draw' : 'winner'}
          size="md"
          pulse={false}
        />
      }
      qrUrl={model.qrUrl}
      sponsors={snapshot.sponsors}
      starField="result"
      overlay={
        newLeader && at(STAGE.outcome) && round ? (
          <StarBurst runKey={`${round.id}-leader`} count={40} duration={2.4} />
        ) : null
      }
    >
      <div
        className="grid h-full min-h-0"
        style={{ gridTemplateRows: '150px minmax(0, 1fr) 156px', rowGap: 12 }}
      >
        {/* ROUND COMPLETE. */}
        <div className="flex flex-col items-center justify-center">
          {at(STAGE.headline) ? (
            <SceneHeadline
              /* Remounts when a draw resolves, so the new word arrives rather
                 than swapping under the eye. */
              key={draw && at(STAGE.outcome) ? 'draw' : 'complete'}
              eyebrow={`${model.challengeLabel} • ${model.roundLabel}`}
              size="lg"
              align="center"
              tone={draw ? 'draw' : 'ink'}
            >
              {draw && at(STAGE.outcome) ? 'ROUND DRAW' : 'ROUND COMPLETE'}
            </SceneHeadline>
          ) : null}
        </div>

        {/* Both players, side by side, with the outcome spine between them. */}
        <div className="relative grid min-h-0" style={{ gridTemplateColumns: '1fr 320px 1fr' }}>
          <ResultSide
            side="left"
            code="A"
            player={model.playerA}
            team={model.a}
            roundScore={scoreA}
            previousRank={model.playerA ? previousRanks.get(model.playerA.id) ?? null : null}
            outcome={outcome}
            entered={at(STAGE.cards)}
            emphasised={at(STAGE.outcome)}
          />

          <div className="relative flex min-h-0 flex-col items-center justify-center gap-6">
            {/* Draw: two stars travel in from either side and meet. Winner: a
                single quiet spine, so nothing competes with the grown card. */}
            {draw ? (
              <div className="relative flex h-[180px] w-full items-center justify-center">
                {(['left', 'right'] as const).map((from) => (
                  <motion.svg
                    key={from}
                    aria-hidden
                    viewBox="0 0 100 100"
                    initial={motionOn ? { opacity: 0, x: from === 'left' ? -260 : 260 } : false}
                    animate={
                      at(STAGE.outcome)
                        ? { opacity: 0.9, x: from === 'left' ? -26 : 26 }
                        : { opacity: 0, x: from === 'left' ? -260 : 260 }
                    }
                    transition={{ duration: DURATION.hero, ease: EASE.broadcast }}
                    className="text-draw absolute h-[104px] w-[104px]"
                  >
                    <polygon points={STAR_POINTS} fill="currentColor" opacity={0.55} />
                  </motion.svg>
                ))}
              </div>
            ) : (
              <span aria-hidden className="bg-slate h-[46%] w-[3px] rounded-pill opacity-70" />
            )}

            <motion.div
              initial={motionOn ? { opacity: 0, y: 16 } : false}
              animate={at(STAGE.outcome) ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: DURATION.card, ease: EASE.entrance, delay: 0.12 }}
              className="flex flex-col items-center gap-4 text-center"
            >
              <span className="u-eyebrow text-aqua-700 text-[17px]">ROUND SCORE</span>
              <span className="u-numeral u-tabular text-ink text-[74px] leading-none">
                {scoreA} <span className="text-text-muted">—</span> {scoreB}
              </span>
              {draw ? (
                <StatusPill label="HONOURS EVEN" tone="draw" size="md" pulse={false} />
              ) : newLeader ? (
                <StatusPill label="NEW LEADER" tone="accent" size="lg" pulse={false} />
              ) : (
                <StatusPill
                  label={`${winnerSide?.shortName ?? ''} TAKE THE ROUND`.trim()}
                  tone="winner"
                  size="md"
                  pulse={false}
                />
              )}
            </motion.div>
          </div>

          <ResultSide
            side="right"
            code="B"
            player={model.playerB}
            team={model.b}
            roundScore={scoreB}
            previousRank={model.playerB ? previousRanks.get(model.playerB.id) ?? null : null}
            outcome={outcome}
            entered={at(STAGE.cards)}
            emphasised={at(STAGE.outcome)}
          />
        </div>

        {/* Team standings and the derived lead sentence. */}
        <motion.div
          initial={motionOn ? { opacity: 0, y: 22 } : false}
          animate={at(STAGE.standings) ? { opacity: 1, y: 0 } : { opacity: 0, y: 22 }}
          transition={{ duration: DURATION.card, ease: EASE.entrance }}
          className={cn('flex items-center justify-center')}
        >
          <TeamTotals a={model.a} b={model.b} size="md" className="w-full" />
        </motion.div>
      </div>
    </SceneFrame>
  );
}

export default RoundResultScene;
