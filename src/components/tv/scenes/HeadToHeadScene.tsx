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
  DURATION,
  EASE,
  RankBadge,
  ScoreNumeral,
  StatusPill,
  teamAccentVars,
  useMotionScale,
} from '@/components/ui';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { useRevealStage } from '@/components/tv/use-reveal-stage';
import { mechanicRule } from '@/components/tv/mechanics';
import type { SceneProps } from '@/components/tv/scene-props';
import type { SideModel } from '@/components/tv/scene-model';

/**
 * The entrance marks from design_2.md, in milliseconds.
 *
 *   0.0 title · 0.5 player A · 0.8 player B · 1.2 VS · 1.7 names + rankings
 *   2.2 READY · 2.7 GO · 3.5 settled
 *
 * Eight marks, three and a half seconds, and then it stops — this scene sits in
 * front of a round that is about to be played, so it must never become the
 * reason the round is late.
 */
const MARKS = [0, 500, 800, 1200, 1700, 2200, 2700, 3500] as const;

const STAGE = {
  title: 1,
  playerA: 2,
  playerB: 3,
  vs: 4,
  identity: 5,
  ready: 6,
  go: 7,
  settled: 8,
} as const;

/** A five-pointed star, drawn from the centre of a 100×100 box. */
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

interface VsSideProps {
  side: 'left' | 'right';
  player: PlayerLike | null;
  team: SideModel;
  /** The portrait has been called on. */
  entered: boolean;
  /** Name, total and rank are allowed on screen. */
  identity: boolean;
}

/**
 * One half of the reveal: an oversized portrait that arrives from its own edge,
 * with the identity lane held back until the VS has landed.
 *
 * The portrait is nudged toward the centre line so both players read as facing
 * each other across the VS rather than out of the frame.
 */
function VsSide({ side, player, team, entered, identity }: VsSideProps) {
  const motionOn = useMotionScale() === 1;
  const align = side === 'left' ? 'start' : 'end';
  const offset = side === 'left' ? -140 : 140;

  return (
    <motion.div
      data-vs-side={side}
      style={teamAccentVars(team.color, team.code)}
      initial={motionOn ? { opacity: 0, x: offset } : false}
      animate={entered ? { opacity: 1, x: 0 } : { opacity: 0, x: offset }}
      transition={{ duration: DURATION.hero, ease: EASE.entrance }}
      className="relative flex h-full min-w-0 flex-col"
    >
      {player ? (
        <>
          <PlayerGhost player={player} placement={side} scale={1.15} />

          <div
            className="relative z-10 min-h-0 flex-1"
            /* Pushed toward the spine — the pair should look inward, not out. */
            style={{ transform: `translateX(${side === 'left' ? '3.5%' : '-3.5%'})` }}
          >
            <PlayerPhoto player={player} fit="cover" priority />
          </div>

          <motion.div
            initial={motionOn ? { opacity: 0, y: 26 } : false}
            animate={identity ? { opacity: 1, y: 0 } : { opacity: 0, y: 26 }}
            transition={{ duration: DURATION.card, ease: EASE.entrance }}
            className={cn(
              'relative z-20 flex flex-col gap-3 px-[6%] pb-[2%]',
              side === 'left' ? 'items-start text-left' : 'items-end text-right',
            )}
          >
            <div className={cn('flex items-center gap-4', side === 'right' && 'flex-row-reverse')}>
              {slotLabelOf(player) ? (
                <span className="u-numeral text-[44px] leading-none text-[color:var(--team-accent)]">
                  {slotLabelOf(player)}
                </span>
              ) : null}
              <span className="u-label text-text-muted text-[18px]">{team.name}</span>
            </div>

            <PlayerNameLockup player={player} size="lg" align={align} />

            <div
              className={cn(
                'flex items-end gap-8',
                side === 'right' && 'flex-row-reverse',
              )}
            >
              <ScoreNumeral
                value={totalPointsOf(player) ?? 0}
                label="TOTAL POINTS"
                suffix="PTS"
                size="md"
                tone="team"
                align={align}
                animate={false}
              />
              <div className="flex flex-col items-center gap-2 pb-2">
                <span className="u-label text-text-muted text-[15px]">OVERALL RANK</span>
                <RankBadge
                  rank={rankOf(player)}
                  size="md"
                  tone={rankOf(player) === 1 ? 'medal' : 'default'}
                  animate={false}
                />
              </div>
            </div>
          </motion.div>

          <span
            aria-hidden
            className="relative z-20 h-[10px] w-full rounded-pill bg-[color:var(--team-accent)]"
          />
        </>
      ) : (
        <div className="ring-border-subtle flex h-full flex-col items-center justify-center gap-6 rounded-xl bg-white/70 ring-1">
          <span className="u-display text-text-muted text-[64px] leading-none">{team.name}</span>
          <span className="u-label text-text-muted text-[20px]">PLAYER TO BE CONFIRMED</span>
        </div>
      )}
    </motion.div>
  );
}

/**
 * SCREEN 03a — HEAD TO HEAD.
 *
 * The cinematic pre-round reveal: challenge and round on top, two enormous
 * players either side, and a VS that lands between them. It is deliberately the
 * only scene in the show that runs a scripted entrance, because it is the only
 * one that plays while nothing is happening on the pitch.
 *
 * Changing round replays the whole sequence; under reduced motion the finished
 * composition is simply there, which is the same information without the travel.
 */
export function HeadToHeadScene({ model }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  const round = model.round;
  const stage = useRevealStage(MARKS, round?.id ?? null);
  const at = (mark: number) => stage >= mark;

  const cue =
    stage === STAGE.ready ? 'READY' : stage === STAGE.go ? 'GO' : null;

  return (
    <SceneFrame
      eyebrow={model.challengeLabel}
      title={model.challengeTitle}
      detail={model.roundLabel}
      status={<StatusPill label="NEXT UP" tone="pending" size="md" pulse={false} />}
      qrUrl={model.qrUrl}
      sponsors={snapshot.sponsors}
      starField="live"
    >
      <div
        className="grid h-full min-h-0"
        style={{ gridTemplateRows: '156px minmax(0, 1fr)', rowGap: 8 }}
      >
        {/* Challenge + ROUND 3 OF 5. */}
        <motion.div
          initial={motionOn ? { opacity: 0, y: -20 } : false}
          animate={at(STAGE.title) ? { opacity: 1, y: 0 } : { opacity: 0, y: -20 }}
          transition={{ duration: DURATION.card, ease: EASE.entrance }}
          className="flex flex-col items-center justify-center gap-3 text-center"
        >
          <span className="u-eyebrow text-aqua-700 text-[20px]">
            {model.challengeLabel} • {model.challengeTitle}
          </span>
          <span className="u-display text-ink text-[86px] leading-[0.86]">
            {model.roundLabel || 'HEAD TO HEAD'}
          </span>
          {model.challengeConfig ? (
            <span className="u-label text-text-muted text-[16px]">
              {mechanicRule(model.challengeConfig)}
            </span>
          ) : null}
        </motion.div>

        {/* 42% / 16% / 42%, exactly as design.md screen 03 specifies. */}
        <div
          className="grid min-h-0"
          style={{ gridTemplateColumns: '42fr 16fr 42fr' }}
        >
          <VsSide
            side="left"
            player={model.playerA}
            team={model.a}
            entered={at(STAGE.playerA)}
            identity={at(STAGE.identity)}
          />

          <div className="relative flex min-h-0 flex-col items-center justify-center gap-8">
            {/* The VS lands with one short overshoot and then holds. */}
            <motion.div
              initial={motionOn ? { opacity: 0, scale: 0.35 } : false}
              animate={
                at(STAGE.vs)
                  ? { opacity: 1, scale: motionOn ? [0.35, 1.14, 1] : 1 }
                  : { opacity: 0, scale: 0.35 }
              }
              transition={{
                duration: motionOn ? 0.72 : 0,
                ease: EASE.overshoot,
                times: motionOn ? [0, 0.62, 1] : undefined,
              }}
              className="relative flex items-center justify-center"
            >
              <svg
                aria-hidden
                viewBox="0 0 100 100"
                className="text-aqua-200 absolute h-[260px] w-[260px]"
              >
                <polygon points={STAR_POINTS} fill="currentColor" opacity={0.55} />
              </svg>
              <span className="u-display text-aqua-700 relative text-[132px] leading-none">
                VS
              </span>
            </motion.div>

            {/* READY / GO — the last two beats before the operator cuts to play. */}
            <div className="flex h-[92px] items-center justify-center">
              {cue ? (
                <motion.span
                  key={cue}
                  initial={motionOn ? { opacity: 0, scale: 0.8 } : false}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: DURATION.score, ease: EASE.overshoot }}
                  className={cn(
                    'u-display leading-none',
                    cue === 'GO' ? 'text-live text-[92px]' : 'text-ink text-[72px]',
                  )}
                >
                  {cue}
                </motion.span>
              ) : at(STAGE.settled) ? (
                <StatusPill label="ROUND ABOUT TO START" tone="accent" size="md" pulse={false} />
              ) : null}
            </div>
          </div>

          <VsSide
            side="right"
            player={model.playerB}
            team={model.b}
            entered={at(STAGE.playerB)}
            identity={at(STAGE.identity)}
          />
        </div>
      </div>
    </SceneFrame>
  );
}

export default HeadToHeadScene;
