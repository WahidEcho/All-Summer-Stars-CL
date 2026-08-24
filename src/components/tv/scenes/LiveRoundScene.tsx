'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import {
  PlayerGhost,
  PlayerNameLockup,
  PlayerPhoto,
  rankOf,
  slotLabelOf,
  totalPointsOf,
  type PlayerLike,
} from '@/components/player';
import {
  AttemptDots,
  PointsBurst,
  RankBadge,
  ScoreNumeral,
  SCORE_SEQUENCE,
  StatusPill,
  DURATION,
  EASE,
  teamAccentVars,
  useMotionScale,
} from '@/components/ui';
import { useTimer } from '@/lib/hooks';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { BigClock } from '@/components/tv/parts/BigClock';
import { RoundRail } from '@/components/tv/parts/RoundRail';
import { TeamTotals } from '@/components/tv/parts/TeamTotals';
import { VerifyingPanel } from '@/components/tv/parts/VerifyingPanel';
import {
  buildAttemptRail,
  mechanicRule,
  mechanicUsesClock,
  mechanicWantsTenths,
  type AttemptRail,
} from '@/components/tv/mechanics';
import {
  useBurstedScore,
  useLaggedNumber,
  useTimedSequence,
  type BurstedScore,
} from '@/components/tv/use-score-choreography';
import type { SceneProps } from '@/components/tv/scene-props';
import type { SideModel } from '@/components/tv/scene-model';
import type { AttemptRow, TeamCode } from '@/lib/types';

/** The `TIME!` flash that separates a running clock from the official review. */
const FLASH = [{ step: 'time' as const, ms: 900 }];

/** The last confirmed attempt on a side — what a burst is fired from. */
function latestOf(attempts: ReadonlyArray<AttemptRow>): AttemptRow | null {
  return attempts.length > 0 ? attempts[attempts.length - 1] : null;
}

/** Figures for a slot that may be empty, so the hooks below always get a number. */
function totalFor(player: PlayerLike | null): number {
  return player ? totalPointsOf(player) ?? 0 : 0;
}

function rankFor(player: PlayerLike | null): number {
  return player ? rankOf(player) ?? 0 : 0;
}

interface LiveSideProps {
  side: 'left' | 'right';
  code: TeamCode;
  player: PlayerLike | null;
  team: SideModel;
  rail: AttemptRail;
  burst: BurstedScore;
  /** Total and rank, already lagged behind the round score. */
  total: number | null;
  rank: number | null;
  active: boolean;
  /** The clock has stopped and an official is confirming the figures. */
  provisional: boolean;
}

/**
 * One player on the live round screen: portrait, identity, their own attempt
 * history, and the `+N` that leaves them on its way to the round score.
 */
function LiveSide({
  side,
  code,
  player,
  team,
  rail,
  burst,
  total,
  rank,
  active,
  provisional,
}: LiveSideProps) {
  const align = side === 'left' ? 'start' : 'end';

  return (
    <div
      data-live-round-side={code}
      data-active={active || undefined}
      style={teamAccentVars(team.color, code)}
      className="relative flex h-full min-w-0 flex-col"
    >
      {player ? (
        <>
          <PlayerGhost player={player} placement={side} scale={1.05} />

          <div className="relative z-10 min-h-0 flex-1">
            <PlayerPhoto player={player} fit="cover" priority />
            <PointsBurst
              value={burst.burst}
              burstKey={burst.burstKey}
              size="xl"
              tone="team"
              direction="up"
              onComplete={burst.onBurstComplete}
              label={burst.burst != null ? `plus ${burst.burst} points` : undefined}
              className={cn('bottom-[18%]', side === 'left' ? 'right-[6%]' : 'left-[6%]')}
            />
          </div>

          <div
            className={cn(
              'relative z-20 flex flex-col gap-3 px-[5%] pb-[2%]',
              side === 'left' ? 'items-start text-left' : 'items-end text-right',
            )}
          >
            <div className={cn('flex items-center gap-4', side === 'right' && 'flex-row-reverse')}>
              {slotLabelOf(player) ? (
                <span className="u-numeral text-[44px] leading-none text-[color:var(--team-accent)]">
                  {slotLabelOf(player)}
                </span>
              ) : null}
              <RankBadge
                rank={rank}
                size="md"
                tone={rank === 1 ? 'medal' : 'default'}
              />
              {active ? (
                <StatusPill label="ON THE BALL" tone="live" size="sm" pulse={!provisional} />
              ) : null}
            </div>

            <PlayerNameLockup
              player={player}
              size="lg"
              align={align}
              eyebrow={team.name}
            />

            <ScoreNumeral
              value={total ?? 0}
              label="TOTAL"
              suffix="PTS"
              size="md"
              tone="muted"
              align={align}
            />

            {/* Attempt history — per shot for C1–C3, ten balls for C4. */}
            {rail.states.length > 0 ? (
              <div
                className={cn(
                  'flex flex-col gap-2',
                  side === 'left' ? 'items-start' : 'items-end',
                )}
              >
                <AttemptDots
                  attempts={rail.states}
                  values={rail.values}
                  total={rail.total}
                  size={rail.total > 5 ? 'md' : 'lg'}
                  align={align}
                  label={rail.label}
                  ariaLabel={`${team.name} attempts`}
                />
                {rail.lastDetail ? (
                  <span className="u-label text-aqua-800 text-[16px]">{rail.lastDetail}</span>
                ) : null}
              </div>
            ) : null}
          </div>

          <span
            aria-hidden
            className={cn(
              'relative z-20 h-[10px] w-full rounded-pill bg-[color:var(--team-accent)]',
              !active && 'opacity-60',
            )}
          />
        </>
      ) : (
        <div className="ring-border-subtle flex h-full flex-col items-center justify-center gap-4 rounded-xl bg-white/70 ring-1">
          <span className="u-display text-text-muted text-[52px] leading-none">{team.name}</span>
          <span className="u-label text-text-muted text-[18px]">NO PLAYER ON THIS SLOT</span>
        </div>
      )}
    </div>
  );
}

/**
 * SCREEN 03/04 — THE LIVE ROUND.
 *
 * The active 1v1: the clock on top, both players large, the round score
 * enormous between them, and each player's attempt rail under their own name.
 *
 * Score choreography is the whole point of this screen. A confirmed attempt
 * fires `+N` beside the player who earned it; the round score is *held* at its
 * previous value until that burst lands, then rolls; the total follows, the
 * rank badge flips, and the team strip catches up last. Roughly 1.3 seconds
 * end to end, which is the band design.md asks for — never longer, because the
 * next attempt may already be in the air.
 *
 * When the clock expires the room must stop reading the last figure as final:
 * live motion is replaced by `TIME!` and then the verifying panel, with the
 * score still visible behind it but plainly provisional.
 */
export function LiveRoundScene({ model }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  const round = model.round;
  const config = model.challengeConfig;
  const mechanic = model.mechanic;

  const isLive = round?.status === 'live';
  const activeSide = round?.active_side ?? null;
  const activeA = isLive && (activeSide === 'A' || activeSide === null);
  const activeB = isLive && (activeSide === 'B' || activeSide === null);

  const reading = useTimer(snapshot.activeTimer, {
    tenths: mechanicWantsTenths(mechanic),
  });
  const hasClock = mechanicUsesClock(mechanic) && snapshot.activeTimer != null;

  // The official review begins when the clock runs out or the scorekeeper hands
  // the round over for confirmation.
  const verifying =
    (hasClock && reading.expired) ||
    round?.status === 'awaiting_result' ||
    round?.status === 'result_ready';

  const flash = useTimedSequence(FLASH, verifying && round ? `${round.id}-time` : null);

  // --- score choreography ---------------------------------------------------
  const burstA = useBurstedScore(latestOf(model.attemptsA), model.roundScoreA);
  const burstB = useBurstedScore(latestOf(model.attemptsB), model.roundScoreB);

  const totalA = useLaggedNumber(totalFor(model.playerA), SCORE_SEQUENCE.totalRoll);
  const totalB = useLaggedNumber(totalFor(model.playerB), SCORE_SEQUENCE.totalRoll);
  const rankA = useLaggedNumber(rankFor(model.playerA), SCORE_SEQUENCE.rankUpdate);
  const rankB = useLaggedNumber(rankFor(model.playerB), SCORE_SEQUENCE.rankUpdate);
  const teamA = useLaggedNumber(model.a.points, SCORE_SEQUENCE.teamUpdate);
  const teamB = useLaggedNumber(model.b.points, SCORE_SEQUENCE.teamUpdate);

  const railA = buildAttemptRail(config, model.attemptsA, activeA && !verifying);
  const railB = buildAttemptRail(config, model.attemptsB, activeB && !verifying);

  const attemptLabel = activeB && !activeA ? railB.label : railA.label;

  return (
    <SceneFrame
      eyebrow={model.challengeLabel}
      title={model.challengeTitle}
      detail={model.roundLabel}
      status={
        <StatusPill
          label={verifying ? 'VERIFYING' : isLive ? 'LIVE' : 'READY'}
          tone={verifying ? 'draw' : isLive ? 'live' : 'pending'}
          size="md"
          pulse={isLive && !verifying}
        />
      }
      qrUrl={model.qrUrl}
      sponsors={snapshot.sponsors}
      starField="live"
      overlay={
        flash === 'time' ? (
          <motion.div
            initial={motionOn ? { opacity: 0 } : false}
            animate={{ opacity: 1 }}
            transition={{ duration: DURATION.instant, ease: EASE.entrance }}
            className="flex h-full w-full items-center justify-center bg-white/88"
          >
            <motion.span
              initial={motionOn ? { scale: 0.7 } : false}
              animate={{ scale: 1 }}
              transition={{ duration: DURATION.score, ease: EASE.overshoot }}
              className="u-display text-live text-[240px] leading-none"
            >
              TIME!
            </motion.span>
          </motion.div>
        ) : verifying ? (
          <VerifyingPanel
            headline="VERIFYING OFFICIAL SCORE"
            detail="THE OFFICIAL IS CONFIRMING THE RESULT — NOTHING ON SCREEN IS FINAL YET"
          />
        ) : null
      }
    >
      <div
        className="grid h-full min-h-0"
        style={{ gridTemplateRows: 'minmax(0, 1fr) 118px', rowGap: 16 }}
      >
        <div className="grid min-h-0" style={{ gridTemplateColumns: '39fr 22fr 39fr' }}>
          <LiveSide
            side="left"
            code="A"
            player={model.playerA}
            team={model.a}
            rail={railA}
            burst={burstA}
            total={model.playerA ? totalA : null}
            rank={model.playerA && rankA > 0 ? rankA : null}
            active={activeA && !verifying}
            provisional={Boolean(verifying)}
          />

          {/* The spine: the clock, then the round score, enormous. */}
          <div className="flex min-h-0 flex-col items-center justify-between gap-4 px-4 py-1">
            <div className="flex w-full flex-col items-center gap-3">
              {hasClock ? (
                <BigClock
                  reading={reading}
                  label={
                    mechanic === 'center_circle' ? 'TIME REMAINING' : 'ATTEMPT TIME'
                  }
                  size="lg"
                  align="center"
                  className="w-full"
                />
              ) : (
                <div className="flex flex-col items-center gap-3 text-center">
                  <span className="u-label text-aqua-800 text-[22px]">
                    {attemptLabel || 'ROUND IN PLAY'}
                  </span>
                  {config ? (
                    <span className="u-label text-text-muted max-w-[380px] text-[15px] leading-relaxed">
                      {mechanicRule(config)}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            <div
              data-round-score
              className={cn(
                'flex w-full flex-col items-center gap-4',
                verifying && 'opacity-90',
              )}
            >
              <span className="u-eyebrow text-aqua-700 text-[18px]">ROUND SCORE</span>

              <div style={teamAccentVars(model.a.color, 'A')} className="flex flex-col items-center">
                <ScoreNumeral
                  value={burstA.displayed}
                  label={model.a.shortName}
                  labelPlacement="below"
                  size="xl"
                  tone="team"
                  align="center"
                  announce={false}
                />
              </div>

              <span aria-hidden className="bg-slate h-[4px] w-[62%] rounded-pill" />

              <div style={teamAccentVars(model.b.color, 'B')} className="flex flex-col items-center">
                <ScoreNumeral
                  value={burstB.displayed}
                  label={model.b.shortName}
                  labelPlacement="below"
                  size="xl"
                  tone="team"
                  align="center"
                  announce={false}
                />
              </div>
            </div>

            <div className="flex h-[42px] items-center">
              {verifying ? (
                <StatusPill label="PROVISIONAL" tone="draw" size="md" pulse={false} />
              ) : railA.lastDetail || railB.lastDetail ? (
                <span className="u-label text-text-muted text-[15px]">
                  {attemptLabel}
                </span>
              ) : null}
            </div>
          </div>

          <LiveSide
            side="right"
            code="B"
            player={model.playerB}
            team={model.b}
            rail={railB}
            burst={burstB}
            total={model.playerB ? totalB : null}
            rank={model.playerB && rankB > 0 ? rankB : null}
            active={activeB && !verifying}
            provisional={Boolean(verifying)}
          />
        </div>

        {/* The five rounds of this challenge, and the running team totals. */}
        <div className="grid min-h-0 items-center gap-8" style={{ gridTemplateColumns: '1fr 620px' }}>
          <RoundRail
            rounds={model.rounds}
            currentRoundId={round?.id ?? null}
            label={`${model.challengeLabel} ROUNDS`}
            size="md"
          />
          <TeamTotals
            a={model.a}
            b={model.b}
            pointsA={teamA}
            pointsB={teamB}
            size="sm"
          />
        </div>
      </div>
    </SceneFrame>
  );
}

export default LiveRoundScene;
