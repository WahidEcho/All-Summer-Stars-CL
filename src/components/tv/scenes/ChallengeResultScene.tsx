'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import {
  CompactPlayerCard,
  PlayerNameLockup,
  PlayerPhoto,
  rankOf,
  teamCodeOf,
  type PlayerLike,
} from '@/components/player';
import {
  DURATION,
  EASE,
  ScoreNumeral,
  StatusPill,
  teamAccentVars,
  useMotionScale,
} from '@/components/ui';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { SceneHeadline } from '@/components/tv/parts/SceneHeadline';
import { TopFivePanel } from '@/components/tv/parts/TopFivePanel';
import { useRankMemory } from '@/components/tv/use-score-choreography';
import { mechanicRule } from '@/components/tv/mechanics';
import type { SceneProps } from '@/components/tv/scene-props';
import type { SideModel } from '@/components/tv/scene-model';
import type { TeamCode } from '@/lib/types';

/**
 * The chapter ending is read from the top down, so it is revealed that way:
 * headline, the two team panels, the verdict between them, the two player
 * cards underneath, and finally the individual leaderboard — which is the note
 * the brief wants the room left on.
 */
const DELAY = {
  headline: 0,
  panels: 0.45,
  verdict: 0.95,
  players: 1.3,
  topFive: 1.7,
} as const;

interface TeamPanelProps {
  code: TeamCode;
  team: SideModel;
  points: number;
  roundWins: number;
  best: { player: PlayerLike; points: number } | null;
  /** The challenge belongs to this side. */
  won: boolean;
  align: 'start' | 'end';
  delay: number;
}

/** `TEAM A / 31 CHALLENGE PTS / 3 ROUND WINS / BEST PERFORMER`. */
function TeamPanel({
  code,
  team,
  points,
  roundWins,
  best,
  won,
  align,
  delay,
}: TeamPanelProps) {
  const motionOn = useMotionScale() === 1;

  return (
    <motion.section
      data-challenge-team={code}
      style={teamAccentVars(team.color, code)}
      initial={motionOn ? { opacity: 0, x: align === 'start' ? -48 : 48 } : false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: DURATION.card, ease: EASE.entrance, delay }}
      className={cn(
        'relative flex min-h-0 flex-col justify-between gap-4 overflow-hidden rounded-xl px-9 py-6',
        'bg-[color-mix(in_oklab,var(--team-accent)_9%,white)]',
        won ? 'ring-2 ring-[color:var(--team-accent)] shadow-hero' : 'ring-border-subtle ring-1',
        align === 'end' ? 'items-end text-right' : 'items-start text-left',
      )}
    >
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 w-[12px] bg-[color:var(--team-accent)]',
          align === 'end' ? 'right-0' : 'left-0',
        )}
      />

      <div className={cn('flex flex-col gap-2', align === 'end' ? 'items-end' : 'items-start')}>
        <span className="u-display text-[color:var(--team-accent-ink)] text-[54px] leading-none">
          {team.name}
        </span>
        {won ? (
          <StatusPill label="CHALLENGE WINNER" tone="team" size="sm" pulse={false} />
        ) : null}
      </div>

      <div className={cn('flex items-end gap-8', align === 'end' && 'flex-row-reverse')}>
        <ScoreNumeral
          value={points}
          label="CHALLENGE PTS"
          size="xl"
          tone="team"
          align={align}
        />
        <ScoreNumeral
          value={roundWins}
          label="ROUND WINS"
          size="md"
          tone="muted"
          align={align}
        />
      </div>

      <div className={cn('flex w-full flex-col gap-2', align === 'end' ? 'items-end' : 'items-start')}>
        <span className="u-eyebrow text-aqua-700 text-[15px]">BEST PERFORMER</span>
        {best ? (
          <CompactPlayerCard
            player={best.player}
            teamColor={team.color}
            teamCode={code}
            teamName={team.shortName}
            points={best.points}
            pointsLabel="THIS CHALLENGE"
            size="md"
            reorder={false}
            className="w-full"
          />
        ) : (
          <span className="u-label text-text-muted text-[16px]">NO ROUNDS PLAYED</span>
        )}
      </div>
    </motion.section>
  );
}

interface FeatureCardProps {
  caption: string;
  player: PlayerLike;
  team: SideModel;
  value: number;
  valueLabel: string;
  tone: 'accent' | 'gold';
  delay: number;
}

/** The two wide cards along the bottom — top performance and overall leader. */
function FeatureCard({
  caption,
  player,
  team,
  value,
  valueLabel,
  tone,
  delay,
}: FeatureCardProps) {
  const motionOn = useMotionScale() === 1;

  return (
    <motion.article
      style={teamAccentVars(team.color, team.code)}
      initial={motionOn ? { opacity: 0, y: 30 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.card, ease: EASE.entrance, delay }}
      className={cn(
        'bg-surface-raised relative flex min-h-0 items-stretch gap-6 overflow-hidden rounded-xl pr-8',
        tone === 'gold' ? 'ring-gold/35 ring-2' : 'ring-border-subtle ring-1',
      )}
    >
      <div className="relative w-[172px] shrink-0 overflow-hidden bg-[color-mix(in_oklab,var(--team-accent)_12%,white)]">
        <PlayerPhoto player={player} fit="cover" fade={false} priority />
        <span
          aria-hidden
          className="absolute inset-y-0 right-0 w-[8px] bg-[color:var(--team-accent)]"
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-3 py-6">
        <span
          className={cn(
            'u-eyebrow text-[16px]',
            tone === 'gold' ? 'text-gold' : 'text-aqua-700',
          )}
        >
          {caption}
        </span>
        <PlayerNameLockup player={player} size="md" align="start" eyebrow={team.shortName} />
      </div>

      <div className="flex shrink-0 flex-col justify-center">
        <ScoreNumeral
          value={value}
          label={valueLabel}
          suffix="PTS"
          size="lg"
          tone={tone === 'gold' ? 'accent' : 'team'}
          align="end"
        />
      </div>
    </motion.article>
  );
}

/**
 * SCREEN 06 — CHALLENGE COMPLETE.
 *
 * Five 1v1 rounds add up to a chapter, and this is the chapter's last page:
 * what each team scored, who took the challenge, the single best performance
 * of it, who leads the event overall, and then — arriving last, deliberately —
 * the individual top five, because that is where the prizes are.
 *
 * Nothing here is computed on screen: the challenge figures come from the
 * scoring engine via `model.challengeResult`, so the panel, the verdict and the
 * standings can never disagree.
 */
export function ChallengeResultScene({ model }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  const result = model.challengeResult;
  const draw = result.winner === 'draw';
  const winnerSide: SideModel | null =
    result.winner === 'draw' ? null : model.side(result.winner);

  const previousRanks = useRankMemory(model.standings);

  const bestOverall = model.bestOfChallenge();
  const leader = model.leader;

  const bestTeam = bestOverall ? model.side(teamCodeOf(bestOverall.player) ?? 'A') : null;
  const leaderTeam = leader ? model.side(leader.teamCode ?? 'A') : null;

  return (
    <SceneFrame
      eyebrow={model.challengeLabel}
      title={model.challengeTitle}
      detail={`${model.rounds.length} ROUNDS`}
      status={
        <StatusPill
          label={draw ? 'CHALLENGE DRAW' : `${winnerSide?.shortName ?? ''} WIN`.trim()}
          tone={draw ? 'draw' : 'winner'}
          size="md"
          pulse={false}
        />
      }
      qrUrl={model.qrUrl}
      sponsors={snapshot.sponsors}
      starField="result"
    >
      <div
        className="grid h-full min-h-0 gap-10"
        style={{ gridTemplateColumns: 'minmax(0,1fr) 500px', gridTemplateRows: 'minmax(0, 1fr)' }}
      >
        {/* The headline row is `auto`, not a fixed height. This is the only
            headline in the family carrying *both* an eyebrow and a sub-line, so
            its stack is the tallest of them, and a grid row shorter than its
            item does not clip that item — it lets it paint over the next row,
            which on the wall left `DRIBBLE & FINISH` half-buried under the team
            panels. Sized by content that cannot happen.
            The row it borrows from is the feature row, not the panels:
            design.md calls the two team panels the main visual of this screen,
            and they need ~426px to show a best-performer card whole. */}
        <div
          className="grid min-h-0"
          style={{ gridTemplateRows: 'auto minmax(0, 1fr) 210px', rowGap: 20 }}
        >
          {/* CHALLENGE 02 COMPLETE — DRIBBLE & FINISH. */}
          <SceneHeadline
            eyebrow={model.challengeConfig ? mechanicRule(model.challengeConfig) : 'CHAPTER COMPLETE'}
            sub={model.challengeTitle}
            /* `md`, not `lg`: at 124px `CHALLENGE 02 COMPLETE` already fills
               the whole 1236px column, so a longer challenge label would wrap
               to a second line and push the panels down. */
            size="md"
            align="start"
            delay={DELAY.headline}
          >
            {`${model.challengeLabel} COMPLETE`}
          </SceneHeadline>

          {/* Two team panels with the verdict between them. */}
          <div
            className="grid min-h-0 gap-6"
            style={{ gridTemplateColumns: '1fr 280px 1fr', gridTemplateRows: 'minmax(0, 1fr)' }}
          >
            <TeamPanel
              code="A"
              team={model.a}
              points={result.pointsA}
              roundWins={result.roundWinsA}
              best={model.bestOfChallenge('A')}
              won={result.winner === 'A'}
              align="start"
              delay={DELAY.panels}
            />

            <motion.div
              initial={motionOn ? { opacity: 0, scale: 0.86 } : false}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: DURATION.card, ease: EASE.overshoot, delay: DELAY.verdict }}
              className="flex min-h-0 flex-col items-center justify-center gap-5 text-center"
            >
              <span className="u-eyebrow text-aqua-700 text-[17px]">
                {draw ? 'RESULT' : 'CHALLENGE WINNER'}
              </span>
              <span
                className={cn(
                  'u-display leading-[0.88]',
                  draw ? 'text-draw text-[54px]' : 'text-ink text-[62px]',
                )}
              >
                {draw ? 'CHALLENGE DRAW' : winnerSide?.name}
              </span>
              <StatusPill
                label={
                  draw
                    ? `${result.draws} DRAWN`
                    : `${Math.abs(result.pointsA - result.pointsB)} PTS CLEAR`
                }
                tone={draw ? 'draw' : 'winner'}
                size="md"
                pulse={false}
              />
              <span className="u-label text-text-muted text-[14px]">NO BONUS APPLIED</span>
            </motion.div>

            <TeamPanel
              code="B"
              team={model.b}
              points={result.pointsB}
              roundWins={result.roundWinsB}
              best={model.bestOfChallenge('B')}
              won={result.winner === 'B'}
              align="end"
              delay={DELAY.panels + 0.12}
            />
          </div>

          {/* Top performance of the challenge, and who leads the event. */}
          <div
            className="grid min-h-0 gap-6"
            style={{ gridTemplateColumns: '1fr 1fr', gridTemplateRows: 'minmax(0, 1fr)' }}
          >
            {bestOverall && bestTeam ? (
              <FeatureCard
                caption="TOP PERFORMANCE"
                player={bestOverall.player}
                team={bestTeam}
                value={bestOverall.points}
                valueLabel="THIS CHALLENGE"
                tone="accent"
                delay={DELAY.players}
              />
            ) : (
              <div className="ring-border-subtle flex items-center justify-center rounded-xl bg-white/70 ring-1">
                <span className="u-label text-text-muted text-[16px]">NO ROUNDS PLAYED YET</span>
              </div>
            )}

            {leader && leaderTeam ? (
              <FeatureCard
                caption="CURRENT OVERALL LEADER"
                player={leader}
                team={leaderTeam}
                value={leader.totalPoints}
                valueLabel={`RANK #${rankOf(leader) ?? 1}`}
                tone="gold"
                delay={DELAY.players + 0.12}
              />
            ) : (
              <div className="ring-border-subtle flex items-center justify-center rounded-xl bg-white/70 ring-1">
                <span className="u-label text-text-muted text-[16px]">STANDINGS PENDING</span>
              </div>
            )}
          </div>
        </div>

        {/* The individual race, arriving after the team result has been read. */}
        <div className="ring-border-subtle flex min-h-0 flex-col rounded-xl bg-white/88 p-7 ring-1">
          <TopFivePanel
            players={model.topFive}
            teams={snapshot.teamsByCode}
            previousRanks={previousRanks}
            size="lg"
            delay={DELAY.topFive}
            className="min-h-0 flex-1"
          />
        </div>
      </div>
    </SceneFrame>
  );
}

export default ChallengeResultScene;
