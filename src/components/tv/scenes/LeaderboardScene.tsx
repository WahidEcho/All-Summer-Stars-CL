'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';

import type { RankedPlayer } from '@/lib/types';
import { CompactPlayerCard, PodiumCard, type PodiumCardStat } from '@/components/player';
import { RankDelta, SPRING, StatusPill, useMotionScale } from '@/components/ui';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { useRevealStage } from '@/components/tv/use-reveal-stage';
import { useRankMemory } from '@/components/tv/use-score-choreography';
import { payloadBool, payloadString, type SceneProps } from '@/components/tv/scene-props';

/** How tall each podium tier stands, in canvas px. */
const TIER_HEIGHT: Record<number, number> = { 1: 486, 2: 438, 3: 402 };
const TIER_WIDTH: Record<number, number> = { 1: 556, 2: 462, 3: 462 };

/** Podium reading order — the leader in the middle, as on a real rostrum. */
const TIER_ORDER: Record<number, number[]> = {
  1: [1],
  2: [1, 2],
  3: [2, 1, 3],
};

/**
 * Ceremony build-up: ten beats, one per rank, counting 10 → 1. The first beat
 * is late enough that the scene has settled before anything appears.
 */
const BUILDUP_MARKS = [400, 1300, 2200, 3100, 4000, 5000, 6100, 7400, 8900, 10_800] as const;

const LOWER_LIMIT = 10;

interface Tier {
  rank: number;
  players: RankedPlayer[];
}

/** Group the standings into rank tiers, so joint ranks share one step. */
function tiersOf(players: ReadonlyArray<RankedPlayer>): Tier[] {
  const tiers: Tier[] = [];
  for (const player of players) {
    const last = tiers[tiers.length - 1];
    if (last && last.rank === player.rank) last.players.push(player);
    else tiers.push({ rank: player.rank, players: [player] });
  }
  return tiers;
}

/**
 * SCREEN 02c — LEADERBOARD.
 *
 * The individual prize race, told the way the room reads it: the top three
 * tiers as photo-led podium cards across the upper 55%, then ranks four to ten
 * underneath as compact rows.
 *
 * Two rules the standings themselves impose. Ranking is on *regular* points,
 * so that is the figure every card prints; the penalty tiebreak only appears
 * on a player it could actually separate. And a joint rank is a real result —
 * two players on 42 both stand on the same step, labelled, rather than one of
 * them being quietly demoted to make the layout tidier.
 */
export function LeaderboardScene({ model, payload }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  const previousRanks = useRankMemory(model.standings);

  const usesPenaltyTiebreak = snapshot.scoring.ranking.tiebreakers.includes(
    'penalty_tiebreak_points',
  );

  // Build-up mode counts the board down 10 → 1 for the ceremony. Everywhere
  // else the board is simply on screen.
  const buildup =
    payloadBool(payload, 'buildup') === true ||
    payloadString(payload, 'reveal') === 'countdown';
  const stage = useRevealStage(BUILDUP_MARKS, buildup ? 'buildup' : null);
  const revealedFrom = buildup ? LOWER_LIMIT + 1 - stage : 0;
  const isRevealed = (rank: number) => !buildup || rank >= revealedFrom;

  const tiers = useMemo(() => tiersOf(model.standings), [model.standings]);
  const podium = tiers.filter((t) => t.rank <= 3);
  const order = TIER_ORDER[podium.length] ?? podium.map((_, i) => i + 1);

  const arranged = order
    .map((position) => podium[position - 1])
    .filter((tier): tier is Tier => tier != null);

  const lower = model.standings.filter(
    (player) => player.rank > 3 && player.rank <= LOWER_LIMIT,
  );

  const penaltyStats = (player: RankedPlayer): PodiumCardStat[] | undefined => {
    if (!usesPenaltyTiebreak || player.penaltyPoints <= 0) return undefined;
    return [{ label: 'PENALTY TIEBREAK', value: `+${player.penaltyPoints}` }];
  };

  const penaltyChip = (player: RankedPlayer) =>
    usesPenaltyTiebreak && player.penaltyPoints > 0 ? (
      <StatusPill
        label={`+${player.penaltyPoints} PEN`}
        tone="accent"
        variant="soft"
        size="sm"
        glyph={false}
        pulse={false}
      />
    ) : undefined;

  return (
    <SceneFrame
      eyebrow="STANDINGS"
      title="TOP PLAYERS"
      detail={buildup ? 'COUNTING DOWN FROM #10' : 'BEST FIVE WIN PRIZES'}
      status={
        <StatusPill
          label={usesPenaltyTiebreak ? 'REGULAR PTS · PENALTY TIEBREAK' : 'REGULAR POINTS'}
          tone="neutral"
          size="md"
          glyph={false}
          pulse={false}
        />
      }
      qrUrl={model.qrUrl}
      sponsors={snapshot.sponsors}
      starField="result"
    >
      <div className="flex h-full min-h-0 flex-col gap-7">
        {/* ---------------------------------------------------- the podium */}
        <div
          className="flex shrink-0 items-end justify-center gap-9"
          style={{ height: TIER_HEIGHT[1] }}
        >
          {arranged.length === 0 ? (
            <p className="u-label text-text-muted self-center text-[24px]">
              NO POINTS SCORED YET
            </p>
          ) : null}

          {arranged.map((tier) => {
            const height = TIER_HEIGHT[tier.rank] ?? TIER_HEIGHT[3];
            const width = TIER_WIDTH[tier.rank] ?? TIER_WIDTH[3];
            const joint = tier.players.length > 1;
            const revealed = isRevealed(tier.rank);

            return (
              <motion.div
                key={`tier-${tier.rank}`}
                layout={motionOn ? 'position' : false}
                transition={SPRING.reorder}
                className="flex min-w-0 flex-col items-center gap-3"
                style={{ height, width: joint ? Math.min(width * 1.5, 700) : width }}
              >
                <div className="flex h-[34px] shrink-0 items-center gap-3">
                  {joint ? (
                    <span className="u-label text-aqua-800 bg-aqua-100 ring-aqua-300 rounded-pill px-4 py-1 text-[13px] ring-1">
                      JOINT #{tier.rank} · {tier.players.length} PLAYERS
                    </span>
                  ) : null}

                  {!joint && previousRanks.get(tier.players[0].id) != null ? (
                    <RankDelta
                      from={previousRanks.get(tier.players[0].id)}
                      to={tier.rank}
                      size="md"
                    />
                  ) : null}
                </div>

                <div className="flex min-h-0 w-full flex-1 items-stretch gap-4">
                  {tier.players.map((player) => {
                    const team = player.teamCode ? snapshot.teamsByCode[player.teamCode] : null;
                    return (
                    <div key={player.id} className="min-w-0 flex-1">
                      <PodiumCard
                        player={player}
                        place={tier.rank}
                        points={player.regularPoints}
                        stats={penaltyStats(player)}
                        teamColor={team?.color}
                        teamCode={player.teamCode}
                        teamName={
                          [player.slotLabel, team?.short_name ?? team?.name]
                            .filter(Boolean)
                            .join(' · ') || undefined
                        }
                        headline={tier.rank === 1 ? 'LEADER' : undefined}
                        size={tier.rank === 1 && !joint ? 'lg' : 'md'}
                        revealed={revealed}
                        delay={buildup ? 0 : (3 - tier.rank) * 0.12}
                      />
                    </div>
                    );
                  })}
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* ------------------------------------------------- ranks 4 to 10 */}
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex shrink-0 items-baseline justify-between">
            <span className="u-label text-aqua-800 text-[20px]">
              {lower.length > 0 ? `RANKS 4 – ${LOWER_LIMIT}` : 'CHASING PACK'}
            </span>
            <span className="u-eyebrow text-text-muted text-[12px]">
              REGULAR POINTS
            </span>
          </div>

          <ol
            className="grid min-h-0 flex-1 gap-x-5 gap-y-3"
            style={{
              gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
              gridAutoRows: 'minmax(0, 1fr)',
            }}
          >
            {lower.slice(0, 8).map((player) => {
              const revealed = isRevealed(player.rank);
              const team = player.teamCode ? snapshot.teamsByCode[player.teamCode] : null;
              return (
                <motion.li
                  key={player.id}
                  layout={motionOn ? 'position' : false}
                  transition={SPRING.reorder}
                  initial={motionOn ? { opacity: 0, y: 22 } : false}
                  animate={{
                    opacity: revealed ? 1 : 0,
                    y: revealed ? 0 : 22,
                  }}
                  // The board must never let an unrevealed row take a click or
                  // a screen reader's attention while it is still hidden.
                  aria-hidden={!revealed}
                  style={{ pointerEvents: revealed ? undefined : 'none' }}
                  className="min-h-0"
                >
                  <CompactPlayerCard
                    player={player}
                    points={player.regularPoints}
                    previousRank={previousRanks.get(player.id) ?? null}
                    teamColor={team?.color}
                    teamCode={player.teamCode}
                    teamName={team?.short_name ?? team?.name ?? undefined}
                    status={penaltyChip(player)}
                    size="md"
                    emphasis="default"
                    className="h-full"
                  />
                </motion.li>
              );
            })}

            {lower.length === 0 ? (
              <li className="u-label text-text-muted col-span-4 self-center text-center text-[20px]">
                THE REST OF THE FIELD APPEARS ONCE POINTS ARE ON THE BOARD
              </li>
            ) : null}
          </ol>
        </div>
      </div>
    </SceneFrame>
  );
}

export default LeaderboardScene;
