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
import type { TeamCode } from '@/lib/types';

/** The `TIME!` flash that separates a running clock from the official review. */
const FLASH = [{ step: 'time' as const, ms: 900 }];

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
 *
 * ## Why the identity is stacked under the portrait, not laid over it
 *
 * design.md screen 03 and design_2.md both read the column top-down as
 * `PHOTO → NAME → ROUND SCORE → TOTAL → RANK`, and the real photographs make
 * that the only workable order. The supplied portraits are tight
 * head-and-shoulders studio shots — roughly 1120x1400, hair at ~4% of the
 * frame, chin at ~70-78% — so a name plate laid over the bottom of the column
 * does not land on a torso the way it would on a full-length cut-out. It lands
 * on the player's mouth. Measured on the wall's own two portraits, the plate's
 * top edge sat at 55% of the photograph while the chins were at 70% and 78%:
 * both players were being cut off exactly where the brief said they must not
 * be, and the gradient above the plate washed out whatever the plate itself
 * did not cover.
 *
 * So the portrait gets its own bounded box and the identity gets its own row
 * beneath it. Nothing overlaps, so nothing can be cropped by furniture.
 *
 * The portrait is drawn `contain` rather than `cover` for the same reason: at
 * full column width these portraits render ~870px tall against a column that
 * has ~690px to give, so `cover` must throw away either the hair or the chin no
 * matter where the focal point puts it. `contain` fits the whole head every
 * time, for any photograph the organisers upload, and the stored focal point
 * still decides what is favoured if a future photo does need cropping.
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
  const slot = player ? slotLabelOf(player) : null;

  return (
    <div
      data-live-round-side={code}
      data-active={active || undefined}
      style={teamAccentVars(team.color, code)}
      className="relative flex h-full min-h-0 min-w-0 flex-col"
    >
      {player ? (
        <>
          {/* The portrait box takes whatever height the identity row leaves.
              `min-h-0` is what lets it give that height up: without it the
              flex item floors at its content's intrinsic size and a 1120x1400
              photograph drags the column past the bottom of the canvas. */}
          <div className="relative z-10 min-h-0 flex-1 overflow-hidden">
            {/* The ghost layer belongs to the portrait box, not to the whole
                column. It anchors its surname to 6% off its parent's foot, so
                parented to the column it lands squarely behind the real name
                and the attempt rail — two sets of letterforms fighting in the
                same space. Clipped to the portrait box it does what design.md
                asks of it: sit *behind the player*. */}
            <PlayerGhost player={player} placement={side} scale={1.05} />

            <PlayerPhoto player={player} fit="contain" priority />

            <PointsBurst
              value={burst.burst}
              burstKey={burst.burstKey}
              size="xl"
              tone="team"
              direction="up"
              onComplete={burst.onBurstComplete}
              label={burst.burst != null ? `plus ${burst.burst} points` : undefined}
              className={cn('top-[14%]', side === 'left' ? 'right-[6%]' : 'left-[6%]')}
            />

            {/* Slot, rank and the on-the-ball flag, up out of the name lane. */}
            <div
              className={cn(
                'absolute top-0 z-20 flex items-center gap-4',
                side === 'left' ? 'left-0 flex-row' : 'right-0 flex-row-reverse',
              )}
            >
              {slot ? (
                <span className="u-numeral bg-[color:var(--team-accent)] rounded-md px-4 py-1 text-[40px] leading-none text-white">
                  {slot}
                </span>
              ) : null}
              <RankBadge rank={rank} size="md" tone={rank === 1 ? 'medal' : 'default'} />
              {active ? (
                <StatusPill label="ON THE BALL" tone="live" size="sm" pulse={!provisional} />
              ) : null}
            </div>

          </div>

          {/* The identity row. Its own band under the portrait — `shrink-0` so
              it always states its full height and the portrait yields, never
              the other way round. Nothing here sits on the photograph, so the
              name is read off the page background at full contrast and the
              player's face is never behind type. */}
          <div
            data-live-round-identity
            className={cn(
              'relative z-20 flex shrink-0 flex-col gap-2 pt-3',
              side === 'left' ? 'items-start text-left' : 'items-end text-right',
            )}
          >
            <PlayerNameLockup
              player={player}
              size="lg"
              align={align}
              eyebrow={slot ? `${slot} · ${team.name}` : team.name}
            />

            <div
              className={cn(
                'flex items-end gap-7',
                side === 'right' && 'flex-row-reverse',
              )}
            >
              <ScoreNumeral
                value={total ?? 0}
                label="TOTAL"
                suffix="PTS"
                size="sm"
                tone="muted"
                align={align}
              />

              {/* Attempt history — per shot for C1–C3, ten balls for C4. */}
              {rail.states.length > 0 ? (
                <div
                  className={cn(
                    'flex flex-col gap-2 pb-1',
                    side === 'left' ? 'items-start' : 'items-end',
                  )}
                >
                  <AttemptDots
                    attempts={rail.states}
                    values={rail.values}
                    total={rail.total}
                    size={rail.total > 5 ? 'sm' : 'md'}
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
          </div>

          <span
            aria-hidden
            className={cn(
              'relative z-20 mt-3 h-[10px] w-full shrink-0 rounded-pill bg-[color:var(--team-accent)]',
              !active && 'opacity-60',
            )}
          />
        </>
      ) : (
        <div className="ring-border-subtle flex h-full min-h-0 flex-col items-center justify-center gap-4 rounded-xl bg-white/70 ring-1">
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
 * fires `+N` beside the player who earned it and holds it there, readable,
 * for about two seconds; the round score is *held* at its previous value until
 * that burst lands, then rolls once — previous total to new total, never from
 * zero; the total follows, the rank badge flips, and the team strip catches up
 * last. Roughly three seconds end to end. An attempt arriving mid-sequence
 * does not queue: the interrupted figure settles to its real value and the new
 * burst takes over, so the wall is never more than one flight behind the game.
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
  const burstA = useBurstedScore(model.attemptsA, model.roundScoreA);
  const burstB = useBurstedScore(model.attemptsB, model.roundScoreB);

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
        {/* `minmax(0, 1fr)` on the row, not the implicit `auto` a
            columns-only template leaves behind: an auto row is sized by its
            content, and a real portrait's intrinsic 1114×1412 makes that
            content 878px tall in a 693px column. */}
        <div
          className="grid min-h-0"
          style={{ gridTemplateColumns: '39fr 22fr 39fr', gridTemplateRows: 'minmax(0, 1fr)' }}
        >
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
        <div
          className="grid min-h-0 items-center gap-8"
          style={{ gridTemplateColumns: '1fr 620px', gridTemplateRows: 'minmax(0, 1fr)' }}
        >
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
