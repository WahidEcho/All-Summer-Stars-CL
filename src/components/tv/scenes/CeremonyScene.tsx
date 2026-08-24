'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';

import { ledgerEntriesForGoal } from '@/lib/scoring/engine';
import type { RankedPlayer, SponsorRow } from '@/lib/types';
import { EventMark, EventQr, SponsorLogo } from '@/components/brand';
import {
  CompactPlayerCard,
  PlayerNameLockup,
  PlayerPhoto,
  PodiumCard,
  displayNameOf,
  type PlayerLike,
  type PodiumCardStat,
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
import { SAFE, type CeremonyPhase } from '@/components/tv/constants';
import { SceneHeadline } from '@/components/tv/parts/SceneHeadline';
import { StarBurst } from '@/components/tv/parts/StarBurst';
import { TeamTotals } from '@/components/tv/parts/TeamTotals';
import { payloadBool, type SceneProps } from '@/components/tv/scene-props';
import type { SceneModel, SideModel } from '@/components/tv/scene-model';

/**
 * Which rank the Top 5 row has counted down to, per phase. `top5_1` is absent
 * on purpose: the leader leaves the row entirely and takes the whole canvas.
 */
const REVEAL_DOWN_TO: Partial<Record<CeremonyPhase, number>> = {
  top5_5: 5,
  top5_4: 4,
  top5_3: 3,
  top5_2: 2,
};

/** Card height per rank — #3 is where the row starts reading as a podium. */
const REVEAL_HEIGHT: Record<number, number> = { 5: 520, 4: 552, 3: 616, 2: 664 };

const CARD_GAP = 28;
const ROW_WIDTH = 1920 - SAFE * 2;

const PARTNER_BANDS: ReadonlyArray<{
  title: string;
  tiers: ReadonlyArray<SponsorRow['tier']>;
  height: number;
  prefix?: string;
}> = [
  { title: 'MAIN PARTNERS', tiers: ['partner'], height: 104 },
  { title: 'OFFICIAL SPONSORS', tiers: ['host', 'sponsor'], height: 78 },
  {
    title: 'TECHNOLOGY & PRODUCTION',
    tiers: ['technology', 'operator'],
    height: 60,
    prefix: 'POWERED BY',
  },
];

/** An operator-supplied per-challenge breakdown, when the payload carries one. */
function payloadStats(payload: Record<string, unknown>): PodiumCardStat[] | null {
  const raw = payload.breakdown;
  if (!Array.isArray(raw)) return null;
  const stats = raw.flatMap<PodiumCardStat>((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const rec = entry as Record<string, unknown>;
    const label = typeof rec.label === 'string' ? rec.label : null;
    const value =
      typeof rec.value === 'number' || typeof rec.value === 'string' ? rec.value : null;
    return label && value !== null ? [{ label: label.toUpperCase(), value }] : [];
  });
  return stats.length > 0 ? stats : null;
}

/**
 * SCREEN 08 — FINAL CEREMONY / WINNERS.
 *
 * The climax of the night, and the one screen that is deliberately *not*
 * driven by data arriving: it advances only when the operator advances
 * `ceremony_phase`, so the room's attention and the wall stay in step with
 * whoever is holding the microphone.
 *
 * The celebration is a defined burst that fires and stops. A permanent
 * particle field would read as a screensaver inside ten seconds and would
 * compete with the five people standing in front of it.
 */
export function CeremonyScene({ model, payload, ceremonyPhase }: SceneProps) {
  const { snapshot } = model;

  // Under the two-competition day format the champion is the DAY winner —
  // one point for the four skills challenges, one for the 5v5, shootout on
  // 1–1 — not the side with more raw points. Points still decide the
  // individual prizes; the two are deliberately independent.
  const dayFormat = snapshot.scoring.day?.twoCompetitions === true;
  const dayWinnerRaw = dayFormat ? model.dayScore.winner : null;
  const dayWinner = dayWinnerRaw === 'A' || dayWinnerRaw === 'B' ? dayWinnerRaw : null;
  const drawn = dayWinner
    ? false
    : dayFormat
      ? model.dayScore.a === model.dayScore.b
      : model.a.points === model.b.points;
  const championSides: SideModel[] = dayWinner
    ? [model.side(dayWinner)]
    : drawn
      ? [model.a, model.b]
      : [model.a.points > model.b.points ? model.a : model.b];

  const usesPenaltyTiebreak = snapshot.scoring.ranking.tiebreakers.includes(
    'penalty_tiebreak_points',
  );

  // Points each player took out of the final match, recomputed with the same
  // engine function the ledger used. Everything else they scored is, by
  // definition, what they earned across challenges 01–04.
  const matchPointsById = useMemo(() => {
    const map = new Map<string, number>();
    const match = snapshot.match;
    if (!match) return map;

    const config = snapshot.scoring.match;
    const mode = match.goal_points_mode ?? config.goalPointsMode;

    for (const goal of model.confirmedGoals) {
      const squad = model.squad(goal.team_code);
      if (squad.length === 0) continue;
      const entries = ledgerEntriesForGoal({
        mode,
        config,
        scoringTeamPlayers: squad,
        scorerId: goal.is_own_goal ? goal.own_goal_by_player_id : goal.scorer_id,
        isOwnGoal: goal.is_own_goal,
        goalId: goal.id,
      });
      for (const entry of entries) {
        map.set(entry.playerId, (map.get(entry.playerId) ?? 0) + entry.points);
      }
    }

    if (config.winBonus > 0 && match.winner && match.winner !== 'draw') {
      for (const player of model.squad(match.winner)) {
        map.set(player.id, (map.get(player.id) ?? 0) + config.winBonus);
      }
    }

    return map;
  }, [snapshot.match, snapshot.scoring.match, model]);

  const statsFor = (player: RankedPlayer): PodiumCardStat[] => {
    const supplied = payloadStats(payload);
    if (supplied) return supplied;

    const fromMatch = Math.min(
      Math.max(0, matchPointsById.get(player.id) ?? 0),
      player.regularPoints,
    );
    const stats: PodiumCardStat[] = [
      { label: 'CHALLENGES 01–04', value: player.regularPoints - fromMatch },
      { label: 'FINAL MATCH', value: fromMatch },
    ];
    if (usesPenaltyTiebreak && player.penaltyPoints > 0) {
      stats.push({ label: 'PENALTY TIEBREAK', value: `+${player.penaltyPoints}` });
    }
    return stats;
  };

  // A held frame for stage photography — no reveals, no rolling figures, no
  // burst. The operator can force it from any phase.
  const photoHold = payloadBool(payload, 'photo_hold') === true;
  const phase: CeremonyPhase = photoHold ? 'closing' : ceremonyPhase;

  const common = {
    qrUrl: model.qrUrl,
    sponsors: snapshot.sponsors,
    starField: 'ceremony' as const,
  };

  // -------------------------------------------------------------- partners
  if (phase === 'partners') {
    return (
      <SceneFrame {...common} header={false} ticker={false}>
        <PartnerWall sponsors={snapshot.sponsors} qrUrl={model.qrUrl} />
      </SceneFrame>
    );
  }

  // --------------------------------------------------------------- closing
  if (phase === 'closing') {
    return (
      <SceneFrame {...common} header={false}>
        <ClosingFrame
          model={model}
          championSides={championSides}
          drawn={drawn}
          photoHold={photoHold}
        />
      </SceneFrame>
    );
  }

  // ------------------------------------------------------- #1 full screen
  if (phase === 'top5_1') {
    const leader = model.leader;
    return (
      <SceneFrame {...common} header={false} bleed>
        {leader ? (
          <TopPlayerFrame
            model={model}
            player={leader}
            stats={statsFor(leader)}
            qrUrl={model.qrUrl}
          />
        ) : (
          <EmptyState message="NO PLAYER HAS SCORED YET" />
        )}
      </SceneFrame>
    );
  }

  // -------------------------------------------- #1, where the points came from
  if (phase === 'top_player_stats') {
    const leader = model.leader;
    return (
      <SceneFrame
        {...common}
        eyebrow="TOP PLAYER"
        title="WHERE THE POINTS CAME FROM"
        detail={leader ? displayNameOf(leader).toUpperCase() : undefined}
        status={<StatusPill label="FINAL BREAKDOWN" tone="accent" size="md" pulse={false} />}
      >
        {leader ? (
          <TopPlayerStatsFrame model={model} player={leader} stats={statsFor(leader)} />
        ) : (
          <EmptyState message="NO PLAYER HAS SCORED YET" />
        )}
      </SceneFrame>
    );
  }

  // ------------------------------------------------------------- champions
  if (phase === 'champions') {
    return (
      <SceneFrame {...common} header={false}>
        <ChampionsFrame
          model={model}
          sides={championSides}
          drawn={drawn}
          qrUrl={model.qrUrl}
        />
      </SceneFrame>
    );
  }

  // ------------------------------------------------------- the Top 5 climb
  const downTo = REVEAL_DOWN_TO[phase];
  if (downTo != null) {
    return (
      <SceneFrame
        {...common}
        eyebrow="FINAL STANDINGS"
        title="TOP 5 PLAYERS"
        detail={`REVEALING #${downTo}`}
        status={<StatusPill label="PRIZE WINNERS" tone="accent" size="md" pulse={false} />}
      >
        <RevealRow model={model} downTo={downTo} statsFor={statsFor} />
      </SceneFrame>
    );
  }

  // ------------------------------------------------ phase A: the slate
  return (
    <SceneFrame {...common} header={false}>
      <CompleteSlate model={model} qrUrl={model.qrUrl} />
    </SceneFrame>
  );
}

// ---------------------------------------------------------------------------
// Shared furniture
// ---------------------------------------------------------------------------

function CornerQr({ url }: { url: string | null }) {
  if (!url) return null;
  return (
    <div className="absolute top-0 right-0 z-20">
      <EventQr url={url} size={112} tone="plate" labelPlacement="below" />
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center">
      <p className="u-label text-text-muted text-[26px]">{message}</p>
    </div>
  );
}

/** One champion's tile: cut-out, slot, surname, total. */
function ChampionTile({
  player,
  side,
  photoHeight,
  delay,
  animate = true,
}: {
  player: PlayerLike;
  side: SideModel;
  photoHeight: number;
  delay: number;
  animate?: boolean;
}) {
  const motionOn = useMotionScale() === 1 && animate;
  const total = 'totalPoints' in player ? player.totalPoints : null;
  const slot = 'slotLabel' in player ? player.slotLabel : null;

  return (
    <motion.li
      style={teamAccentVars(side.color, side.code)}
      initial={motionOn ? { opacity: 0, y: 40 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: DURATION.hero, ease: EASE.entrance, delay }}
      className="bg-surface-raised shadow-card ring-border-subtle flex min-w-0 flex-1 flex-col overflow-hidden rounded-lg ring-1"
    >
      <div
        className="relative shrink-0 bg-[color-mix(in_oklab,var(--team-accent)_12%,white)]"
        style={{ height: photoHeight }}
      >
        <PlayerPhoto player={player} fit="cover" priority />
      </div>

      <div className="flex flex-col items-center gap-1.5 px-4 pt-3 pb-4 text-center">
        <PlayerNameLockup
          player={player}
          size="sm"
          align="center"
          showFirstName={false}
          eyebrow={slot ?? side.shortName}
        />
        {total != null ? (
          <ScoreNumeral
            value={total}
            suffix="PTS"
            size="xs"
            tone="muted"
            align="center"
            labelPlacement="none"
            animate={animate}
          />
        ) : null}
      </div>

      <span aria-hidden className="h-1.5 w-full bg-[color:var(--team-accent)]" />
    </motion.li>
  );
}

function ChampionSquad({
  side,
  players,
  photoHeight,
  animate = true,
}: {
  side: SideModel;
  players: ReadonlyArray<PlayerLike>;
  photoHeight: number;
  animate?: boolean;
}) {
  return (
    <ul className="flex min-h-0 w-full items-stretch gap-6">
      {players.slice(0, 5).map((player, index) => (
        <ChampionTile
          key={player.id}
          player={player}
          side={side}
          photoHeight={photoHeight}
          delay={0.35 + index * 0.12}
          animate={animate}
        />
      ))}
    </ul>
  );
}

/** Team name and total over that team's five champions. */
function ChampionBlock({
  side,
  players,
  photoHeight,
  nameSize,
  scoreSize,
  animate = true,
}: {
  side: SideModel;
  players: ReadonlyArray<PlayerLike>;
  photoHeight: number;
  nameSize: number;
  scoreSize: 'md' | 'lg';
  animate?: boolean;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div
        style={teamAccentVars(side.color, side.code)}
        className="flex shrink-0 items-end justify-between gap-8"
      >
        <span
          className="u-display text-[color:var(--team-accent-ink)] leading-[0.88]"
          style={{ fontSize: nameSize }}
        >
          {side.name}
        </span>
        <ScoreNumeral
          value={side.points}
          label="TEAM TOTAL"
          suffix="PTS"
          size={scoreSize}
          tone="default"
          align="end"
          animate={animate}
        />
      </div>

      <ChampionSquad
        side={side}
        players={players}
        photoHeight={photoHeight}
        animate={animate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase A — COMPETITION COMPLETE
// ---------------------------------------------------------------------------

function CompleteSlate({ model, qrUrl }: { model: SceneModel; qrUrl: string | null }) {
  const motionOn = useMotionScale() === 1;

  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center">
      {/* The light field is darkened a step, as the brief asks, without ever
          taking body type below AA on the cream ground. */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[color-mix(in_oklab,var(--color-navy)_7%,transparent)]"
      />

      <CornerQr url={qrUrl} />

      <motion.div
        initial={motionOn ? { opacity: 0, scale: 0.985 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: DURATION.hero, ease: EASE.entrance }}
        className="relative z-10 flex w-[36%] flex-col items-center"
      >
        <EventMark variant="light" priority title="" />
        <span className="u-sr-only">
          SwanLake Football Stars — Shores &amp; Scores Challenge
        </span>
      </motion.div>

      <SceneHeadline
        eyebrow={model.eventDateLabel || 'SWANLAKE NORTH COAST'}
        size="xl"
        delay={0.5}
        className="relative z-10 mt-[52px]"
        sub={model.venueLabel || undefined}
      >
        COMPETITION COMPLETE
      </SceneHeadline>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase B — 2026 CHAMPIONS
// ---------------------------------------------------------------------------

/**
 * How the day was won, in one line — only under the two-competition format.
 * `WINS THE DAY 2–0` for a sweep; a split day names the shootout that
 * settled it.
 */
function daySub(model: SceneModel): string | undefined {
  if (model.snapshot.scoring.day?.twoCompetitions !== true) return undefined;
  const day = model.dayScore;
  if (!day.winner) return undefined;
  if (day.winner === 'draw') return undefined;
  const w = model.side(day.winner);
  const score = day.winner === 'A' ? `${day.a}–${day.b}` : `${day.b}–${day.a}`;
  if (day.decidedBy === 'shootout') {
    const p = model.snapshot.match;
    const pens = p ? `${Math.max(p.penalty_score_a, p.penalty_score_b)}–${Math.min(p.penalty_score_a, p.penalty_score_b)}` : '';
    return `${w.name.toUpperCase()} TAKE THE DAY 1–1 · ${pens} ON PENALTIES`;
  }
  return `${w.name.toUpperCase()} WIN THE DAY ${score}`;
}

function ChampionsFrame({
  model,
  sides,
  drawn,
  qrUrl,
}: {
  model: SceneModel;
  sides: SideModel[];
  drawn: boolean;
  qrUrl: string | null;
}) {
  // A shared title puts two squads on the canvas instead of one, so the whole
  // block steps down rather than overflowing the 1080 line.
  const shared = sides.length > 1;

  return (
    <div className="relative flex h-full w-full flex-col items-center gap-8 overflow-hidden">
      <CornerQr url={qrUrl} />

      {/* A defined burst: it fires once on this phase and settles. `runKey`
          never changes, so a snapshot refresh cannot restart it. */}
      <StarBurst runKey="champions" count={58} duration={2.6} />

      <SceneHeadline
        eyebrow="SWANLAKE FOOTBALL STARS"
        size={shared ? 'lg' : 'xl'}
        sub={drawn ? 'THE TEAMS FINISH LEVEL — THE TITLE IS SHARED' : daySub(model)}
        className="relative z-10 shrink-0"
      >
        2026 CHAMPIONS
      </SceneHeadline>

      <div className="relative z-10 flex min-h-0 w-full flex-1 flex-col justify-center gap-7">
        {sides.map((side) => (
          <ChampionBlock
            key={side.code}
            side={side}
            players={model.squad(side.code)}
            photoHeight={shared ? 128 : 330}
            nameSize={shared ? 54 : 92}
            scoreSize={shared ? 'md' : 'lg'}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase C — the Top 5, revealed #5 upward
// ---------------------------------------------------------------------------

function RevealRow({
  model,
  downTo,
  statsFor,
}: {
  model: SceneModel;
  downTo: number;
  statsFor: (player: RankedPlayer) => PodiumCardStat[];
}) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  // Revealed so far, highest rank number first — #5 entered first and has
  // been shifting left ever since.
  const shown = model.topFive
    .filter((player) => player.rank >= downTo && player.rank <= 5)
    .sort((x, y) => y.rank - x.rank);

  if (shown.length === 0) return <EmptyState message="NO PLAYER HAS SCORED YET" />;

  const width = Math.min(
    392,
    Math.floor((ROW_WIDTH - CARD_GAP * (shown.length - 1)) / shown.length),
  );

  return (
    <div className="flex h-full w-full items-end justify-center" style={{ gap: CARD_GAP }}>
      {shown.map((player) => {
        const height = REVEAL_HEIGHT[player.rank] ?? REVEAL_HEIGHT[5];
        const newest = player.rank === downTo;
        const team = player.teamCode ? snapshot.teamsByCode[player.teamCode] : null;

        return (
          <motion.div
            key={player.id}
            layout={motionOn ? 'position' : false}
            transition={{ duration: DURATION.hero, ease: EASE.entrance }}
            style={{ width, height }}
            className="min-w-0"
          >
            <PodiumCard
              player={player}
              place={player.rank}
              points={player.regularPoints}
              stats={player.rank <= 3 ? statsFor(player) : undefined}
              teamColor={team?.color}
              teamCode={player.teamCode}
              teamName={
                [player.slotLabel, team?.short_name ?? team?.name].filter(Boolean).join(' · ') ||
                undefined
              }
              headline={newest ? `#${player.rank}` : undefined}
              size={player.rank <= 3 ? 'lg' : 'md'}
              revealed
            />
          </motion.div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase C finale — #1 TOP PLAYER
// ---------------------------------------------------------------------------

function TopPlayerFrame({
  model,
  player,
  stats,
  qrUrl,
}: {
  model: SceneModel;
  player: RankedPlayer;
  stats: PodiumCardStat[];
  qrUrl: string | null;
}) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;
  const team = player.teamCode ? snapshot.teamsByCode[player.teamCode] : null;
  const side = player.teamCode ? model.side(player.teamCode) : null;

  // `absolute inset-0` resolves against the frame's padding box, so the
  // portrait runs to the edge of the canvas — the whole point of the biggest
  // reveal of the night.
  return (
    <div
      style={teamAccentVars(team?.color, player.teamCode)}
      className="absolute inset-0 overflow-hidden"
    >
      <div
        className="grid h-full w-full"
        style={{ gridTemplateColumns: '46% 54%', gridTemplateRows: 'minmax(0, 1fr)' }}
      >
        <motion.div
          initial={motionOn ? { opacity: 0, scale: 1.04 } : false}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: DURATION.result, ease: EASE.broadcast }}
          className="relative min-w-0 bg-[color-mix(in_oklab,var(--team-accent)_10%,white)]"
        >
          <PlayerPhoto player={player} fit="cover" priority />
        </motion.div>

        <div
          className="relative flex min-w-0 flex-col justify-center gap-7"
          style={{ paddingRight: SAFE, paddingLeft: 56, paddingTop: SAFE, paddingBottom: SAFE }}
        >
          <CornerQr url={qrUrl} />

          <motion.div
            initial={motionOn ? { opacity: 0, y: 26 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.hero, ease: EASE.entrance, delay: 0.25 }}
            className="flex items-center gap-6"
          >
            <RankBadge rank={1} shared={player.sharedRank} size="xl" tone="medal" />
            <span className="u-display text-gold text-[92px] leading-[0.86]">TOP PLAYER</span>
          </motion.div>

          <motion.div
            initial={motionOn ? { opacity: 0, y: 26 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.hero, ease: EASE.entrance, delay: 0.45 }}
          >
            <PlayerNameLockup
              player={player}
              size="hero"
              align="start"
              eyebrow={
                [player.slotLabel, side?.name ?? team?.name].filter(Boolean).join(' · ') ||
                undefined
              }
            />
          </motion.div>

          <motion.div
            initial={motionOn ? { opacity: 0, y: 26 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.hero, ease: EASE.entrance, delay: 0.65 }}
            className="flex items-end gap-12"
          >
            <ScoreNumeral
              value={player.regularPoints}
              label="TOTAL POINTS"
              suffix="PTS"
              size="xl"
              tone="default"
              align="start"
            />
          </motion.div>

          <motion.dl
            initial={motionOn ? { opacity: 0, y: 26 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.hero, ease: EASE.entrance, delay: 0.85 }}
            className="ring-border-subtle grid max-w-[720px] grid-cols-1 gap-y-2 rounded-lg bg-white/85 px-8 py-5 ring-1"
          >
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="border-border-subtle/70 flex items-baseline justify-between gap-8 border-b pb-2 last:border-b-0 last:pb-0"
              >
                <dt className="u-label text-text-muted text-[17px]">{stat.label}</dt>
                <dd className="u-numeral u-tabular text-ink text-[34px] leading-none">
                  {stat.value}
                </dd>
              </div>
            ))}
          </motion.dl>
        </div>
      </div>

      {/* Over the composition, once, then gone. */}
      <StarBurst runKey="top-player" count={40} duration={2.4} className="z-20" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase C2 — where the winner's points came from
// ---------------------------------------------------------------------------

/** A stat's numeric weight, for the bar. Strings like `+3` still measure. */
function statMagnitude(value: PodiumCardStat['value']): number {
  if (typeof value === 'number') return Math.abs(value);
  const parsed = Number.parseFloat(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? Math.abs(parsed) : 0;
}

/**
 * Cue C8 — the breakdown, as its own beat.
 *
 * C7 puts the winner on the wall; this is the answer to the question the room
 * asks straight afterwards. Every line is a real ledger figure and the bars are
 * drawn from those same figures, so the picture cannot disagree with the list.
 */
function TopPlayerStatsFrame({
  model,
  player,
  stats,
}: {
  model: SceneModel;
  player: RankedPlayer;
  stats: PodiumCardStat[];
}) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;
  const team = player.teamCode ? snapshot.teamsByCode[player.teamCode] : null;
  const side = player.teamCode ? model.side(player.teamCode) : null;
  const peak = Math.max(1, ...stats.map((stat) => statMagnitude(stat.value)));

  return (
    <div
      className="grid h-full w-full gap-14"
      style={{
        ...teamAccentVars(team?.color, player.teamCode),
        gridTemplateColumns: '34% 1fr',
        gridTemplateRows: 'minmax(0, 1fr)',
      }}
    >
      <motion.div
        initial={motionOn ? { opacity: 0, x: -40 } : false}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: DURATION.hero, ease: EASE.entrance }}
        className="ring-border-subtle relative min-w-0 overflow-hidden rounded-lg bg-[color-mix(in_oklab,var(--team-accent)_10%,white)] ring-1"
      >
        <PlayerPhoto player={player} fit="cover" priority />
        <div className="absolute inset-x-0 bottom-0 flex items-center gap-4 bg-gradient-to-t from-white/95 to-transparent px-7 pb-6 pt-16">
          <RankBadge rank={1} shared={player.sharedRank} size="lg" tone="medal" />
          <PlayerNameLockup
            player={player}
            size="lg"
            align="start"
            eyebrow={
              [player.slotLabel, side?.name ?? team?.name].filter(Boolean).join(' · ') || undefined
            }
          />
        </div>
      </motion.div>

      <div className="flex min-w-0 flex-col justify-center gap-9">
          <motion.div
            initial={motionOn ? { opacity: 0, y: 24 } : false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DURATION.hero, ease: EASE.entrance, delay: 0.2 }}
          >
            <ScoreNumeral
              value={player.regularPoints}
              label="TOTAL POINTS"
              suffix="PTS"
              size="lg"
              tone="default"
              align="start"
            />
          </motion.div>

          <dl className="flex flex-col gap-6">
            {stats.map((stat, index) => (
              <motion.div
                key={stat.label}
                initial={motionOn ? { opacity: 0, y: 20 } : false}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: DURATION.result,
                  ease: EASE.entrance,
                  delay: 0.4 + index * 0.18,
                }}
                className="flex flex-col gap-2"
              >
                <div className="flex items-baseline justify-between gap-8">
                  <dt className="u-label text-text-secondary text-[22px]">{stat.label}</dt>
                  <dd className="u-numeral u-tabular text-ink text-[56px] leading-none">
                    {stat.value}
                  </dd>
                </div>
                <motion.div
                  aria-hidden
                  className="bg-[color:var(--team-accent)] h-3 rounded-pill"
                  initial={motionOn ? { scaleX: 0 } : false}
                  animate={{ scaleX: statMagnitude(stat.value) / peak }}
                  style={{ transformOrigin: 'left center' }}
                  transition={{
                    duration: DURATION.result,
                    ease: EASE.broadcast,
                    delay: 0.5 + index * 0.18,
                  }}
                />
              </motion.div>
            ))}
          </dl>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase D — the partner wall
// ---------------------------------------------------------------------------

function PartnerWall({
  sponsors,
  qrUrl,
}: {
  sponsors: ReadonlyArray<SponsorRow>;
  qrUrl: string | null;
}) {
  const motionOn = useMotionScale() === 1;
  const active = [...sponsors]
    .filter((s) => s.active !== false)
    .sort((x, y) => x.ticker_order - y.ticker_order);

  const bands = PARTNER_BANDS.map((band) => ({
    ...band,
    rows: active.filter((s) => band.tiers.includes(s.tier)),
  })).filter((band) => band.rows.length > 0);

  return (
    <div className="relative flex h-full w-full flex-col items-center gap-10">
      <CornerQr url={qrUrl} />

      <SceneHeadline eyebrow="SHORES & SCORES CHALLENGE" size="lg" className="shrink-0">
        THANK YOU
      </SceneHeadline>

      {bands.length === 0 ? (
        <div className="flex flex-1 items-center">
          <EventMark variant="light" width={520} title="" />
        </div>
      ) : (
        <div className="flex min-h-0 w-full flex-1 flex-col justify-center gap-12">
          {bands.map((band, index) => (
            <motion.section
              key={band.title}
              initial={motionOn ? { opacity: 0, y: 24 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: DURATION.card,
                ease: EASE.entrance,
                delay: 0.2 + index * 0.18,
              }}
              className="flex flex-col items-center gap-6"
            >
              <span className="u-eyebrow text-aqua-800 text-[19px]">{band.title}</span>
              <div className="flex flex-wrap items-center justify-center gap-x-[92px] gap-y-8">
                {band.rows.map((sponsor) => (
                  <SponsorLogo
                    key={sponsor.id}
                    sponsor={sponsor}
                    height={band.height}
                    prefix={band.prefix}
                  />
                ))}
              </div>
            </motion.section>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Phase E — the closing frame / photo hold
// ---------------------------------------------------------------------------

function ClosingFrame({
  model,
  championSides,
  drawn,
  photoHold,
}: {
  model: SceneModel;
  championSides: SideModel[];
  drawn: boolean;
  photoHold: boolean;
}) {
  const { snapshot } = model;
  const shared = championSides.length > 1;

  return (
    <div className="flex h-full w-full flex-col gap-7 overflow-hidden">
      <header className="flex shrink-0 items-center justify-between gap-10">
        <EventMark variant="light" width={320} priority title="" />
        <div className="flex flex-col items-center gap-2">
          <span className="u-display text-ink text-[62px] leading-none">
            {drawn ? 'CHAMPIONS SHARED' : '2026 CHAMPIONS'}
          </span>
          <span className="u-label text-aqua-800 text-[19px]">
            {model.venueLabel || 'SWANLAKE NORTH COAST'}
          </span>
        </div>
        {model.qrUrl ? (
          <EventQr url={model.qrUrl} size={124} tone="plate" labelPlacement="below" />
        ) : (
          <span className="w-[124px]" />
        )}
      </header>

      <div
        className="grid min-h-0 flex-1 gap-8"
        style={{ gridTemplateColumns: 'minmax(0,1fr) 560px', gridTemplateRows: 'minmax(0, 1fr)' }}
      >
        <div className="flex min-h-0 flex-col gap-6">
          {championSides.map((champion) => (
            <ChampionBlock
              key={champion.code}
              side={champion}
              players={model.squad(champion.code)}
              photoHeight={shared ? 118 : 232}
              nameSize={shared ? 48 : 64}
              scoreSize="md"
              animate={!photoHold}
            />
          ))}

          <TeamTotals a={model.a} b={model.b} size="md" className="mt-auto shrink-0" />
        </div>

        <div className="flex min-h-0 flex-col gap-3">
          <span className="u-label text-aqua-800 shrink-0 text-[20px]">TOP 5 PLAYERS</span>
          <ol className="flex min-h-0 flex-1 flex-col gap-3">
            {model.topFive.map((player, index) => {
              const team = player.teamCode ? snapshot.teamsByCode[player.teamCode] : null;
              return (
                <li key={player.id} className="min-h-0 flex-1">
                  <CompactPlayerCard
                    player={player}
                    points={player.regularPoints}
                    teamColor={team?.color}
                    teamCode={player.teamCode}
                    teamName={team?.short_name ?? team?.name ?? undefined}
                    emphasis={index === 0 ? 'leader' : 'default'}
                    size="md"
                    reorder={false}
                    className="h-full"
                  />
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </div>
  );
}

export default CeremonyScene;
