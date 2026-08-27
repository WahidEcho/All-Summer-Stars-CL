'use client';

import { useMemo } from 'react';
import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import {
  PlayerNameLockup,
  PlayerPhoto,
  displayNameOf,
  teamCodeOf,
  type PlayerLike,
} from '@/components/player';
import {
  DURATION,
  EASE,
  SPRING,
  StatusPill,
  teamRowAccentVars,
  useMotionScale,
} from '@/components/ui';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { StarBurst } from '@/components/tv/parts/StarBurst';
import { useRevealStage } from '@/components/tv/use-reveal-stage';
import { payloadString, type SceneProps } from '@/components/tv/scene-props';
import type { SideModel } from '@/components/tv/scene-model';
import type { TeamCode } from '@/lib/types';

/**
 * The one line every player is welcomed with.
 *
 * Deliberately fixed rather than an operator field: ten players come through
 * the gate in a couple of minutes, and a per-player message is one more thing
 * to get wrong live for no gain. `u-display` sets it in caps.
 */
const WELCOME_LINE = 'Welcome to SwanLake Football Stars';

/**
 * The walk-out marks, in milliseconds.
 *
 *   0.0 card grows in on the team · 0.9 photo · 1.7 name · 2.5 sparkle
 *
 * The first gap is the one that was measured rather than guessed. `SPRING.card`
 * takes about 600ms to finish growing the card, so a photo cued at 600ms starts
 * fading up the instant the card stops moving and the team never reads as its
 * own beat. Cueing it at 900 leaves the team band alone on a settled card for
 * about a third of a second — brief, but enough to land before the face
 * arrives, which is the whole point of revealing the team first.
 *
 * Still comfortably inside three and a half seconds end to end, because it
 * plays while a player is walking from the gate to their mark — the card has to
 * be finished before they are. The stages are cumulative, so the finished card
 * simply stays on the wall until the operator sends the next player.
 */
const MARKS = [0, 900, 1700, 2500] as const;

const STAGE = { team: 1, photo: 2, name: 3, sparkle: 4 } as const;

const CARD_W = 600;
const CARD_H = 748;

/**
 * A number derived from the whole of a string.
 *
 * The scatter was seeded from `runKey.length`, and every player id is a 36
 * character UUID — so all ten players drew the identical sixteen stars, which
 * is the one thing the per-player scatter existed to avoid. Summing the
 * characters is enough to separate them and, being a pure function of the id,
 * keeps the server and client renders in step.
 */
function seedOf(value: string): number {
  let total = 0;
  for (let i = 0; i < value.length; i += 1) {
    total = (total + value.charCodeAt(i) * (i + 1)) % 100_000;
  }
  return total;
}

/** Deterministic pseudo-random in [0,1) — server and client must agree. */
function noise(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}

/** A five-pointed star drawn from the centre of a 100x100 box. */
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

interface SparkleRingProps {
  /** Changing this re-seeds the scatter, so each player gets their own. */
  runKey: string;
  show: boolean;
}

/**
 * The sparkle that sits *around* the card.
 *
 * Stars are scattered in the margin outside the card's own box — never over
 * the photo or the name, which are the two things the audience is here to
 * read. Once they have faded in they twinkle on the shared ambient loop, and
 * `data-ambient` stops that loop dead under `prefers-reduced-motion`.
 */
function SparkleRing({ runKey, show }: SparkleRingProps) {
  const motionOn = useMotionScale() === 1;

  const stars = useMemo(() => {
    const seed = seedOf(runKey);
    return Array.from({ length: 16 }, (_, i) => {
      const n = i + seed;
      // Alternate sides, then push each star clear of the card edge so the
      // ring reads as a frame rather than as clutter on the portrait.
      const left = i % 2 === 0;
      const gutter = 40 + noise(n * 3 + 11) * 150;
      return {
        id: i,
        x: left ? -gutter : CARD_W + gutter,
        y: 40 + noise(n * 7 + 29) * (CARD_H - 80),
        size: 16 + noise(n * 5 + 53) * 30,
        delay: noise(n * 11 + 71) * 1.1,
        // Offsetting the ambient loop stops all sixteen breathing in unison.
        offset: -(noise(n * 13 + 97) * 9).toFixed(2),
        gold: noise(n * 17 + 113) > 0.62,
      };
    });
  }, [runKey]);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {stars.map((star) => (
        <motion.svg
          key={`${runKey}-${star.id}`}
          viewBox="0 0 100 100"
          data-ambient
          initial={motionOn ? { opacity: 0, scale: 0.2 } : false}
          animate={show ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.2 }}
          transition={{
            duration: DURATION.card,
            ease: EASE.overshoot,
            delay: show ? star.delay : 0,
          }}
          className={cn(
            'absolute animate-twinkle',
            star.gold ? 'text-gold' : 'text-aqua-400',
          )}
          style={{
            left: star.x,
            top: star.y,
            width: star.size,
            height: star.size,
            animationDelay: `${star.offset}s`,
          }}
        >
          <polygon points={STAR_POINTS} fill="currentColor" />
        </motion.svg>
      ))}
    </div>
  );
}

interface EntranceCardProps {
  player: PlayerLike;
  side: SideModel | null;
  stage: number;
}

/**
 * The reveal itself: a small card that grows to fill the frame and hands over
 * its information in three beats — who they play for, what they look like,
 * what they are called.
 *
 * The order is not arbitrary. The team colour is what the crowd reads from the
 * back of the room, the face is what they match to the person walking out, and
 * the name is what they shout.
 */
function EntranceCard({ player, side, stage }: EntranceCardProps) {
  const motionOn = useMotionScale() === 1;
  const at = (mark: number) => stage >= mark;

  return (
    <div className="relative" style={{ width: CARD_W, height: CARD_H }}>
      <SparkleRing runKey={player.id} show={at(STAGE.sparkle)} />

      <motion.article
        data-entrance-card
        style={teamRowAccentVars(side?.team)}
        initial={motionOn ? { opacity: 0, scale: 0.18 } : false}
        animate={
          at(STAGE.team) ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 0.18 }
        }
        transition={motionOn ? SPRING.card : { duration: 0 }}
        className="shadow-hero relative z-10 flex h-full w-full flex-col overflow-hidden rounded-[28px] bg-white ring-8 ring-[color:var(--team-accent)]"
      >
        {/* 1 — the team, carried by the band the card grows into. */}
        <header
          className="flex shrink-0 items-center justify-center gap-5 px-8"
          style={{
            height: 104,
            background: 'var(--team-accent)',
            color: 'var(--team-accent-contrast)',
          }}
        >
          {side?.team?.crest_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={side.team.crest_url}
              alt=""
              draggable={false}
              decoding="async"
              className="h-[68px] w-auto shrink-0 object-contain"
            />
          ) : null}
          <span className="u-display text-[44px] leading-none">
            {side?.name ?? 'SWANLAKE'}
          </span>
        </header>

        {/* 2 — the face. `contain` because the supplied portraits are tight
            head-and-shoulders cut-outs: `cover` at this width would have to
            discard either the hair or the jaw. */}
        <div className="relative min-h-0 flex-1 bg-[color:var(--team-accent-soft)]">
          <motion.div
            initial={motionOn ? { opacity: 0, scale: 0.86 } : false}
            animate={
              at(STAGE.photo)
                ? { opacity: 1, scale: 1 }
                : { opacity: 0, scale: 0.86 }
            }
            transition={{ duration: DURATION.hero, ease: EASE.entrance }}
            className="absolute inset-0"
          >
            <PlayerPhoto player={player} fit="contain" priority deliveryWidth={640} />
          </motion.div>
        </div>

        {/* 3 — the name. */}
        <motion.footer
          initial={motionOn ? { opacity: 0, y: 30 } : false}
          animate={at(STAGE.name) ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
          transition={{ duration: DURATION.card, ease: EASE.entrance }}
          // Taller than the other cards' name plates: two names at one size
          // need the room the small-over-large stack did not. The photo above
          // is `flex-1`, so this is the only measurement that has to change.
          className="flex shrink-0 items-center justify-center px-8"
          style={{ height: 196 }}
        >
          <PlayerNameLockup
            player={player}
            size="lg"
            align="center"
            tone="team"
            equalNames
            eyebrow={
              player.jersey_number != null ? `NO. ${player.jersey_number}` : undefined
            }
          />
        </motion.footer>
      </motion.article>
    </div>
  );
}

/**
 * SCREEN 10 — PLAYER ENTRANCE.
 *
 * The walk-out. Players come through the gate one at a time and the operator
 * sends each card as its player emerges, so this scene is driven entirely by
 * `payload.playerId` rather than by anything in the scoring model.
 *
 * Two states and nothing else: the welcome frame the sequence opens on, and
 * one player's card. The card is cumulative and never times out — it holds the
 * wall until the next player is sent, because a gate that goes quiet for
 * fifteen seconds must not leave the audience looking at an empty screen.
 */
export function PlayerEntranceScene({ model, payload }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  const playerId = payloadString(payload, 'playerId');
  const player = model.playerFor(playerId);

  // A bare `PlayerRow` carries no `teamCode`, so fall back to matching the
  // team id — `playerFor` returns an unranked row whenever standings are empty,
  // which is exactly the state the show is in during the entrance.
  const code: TeamCode | null =
    teamCodeOf(player) ??
    (player && model.a.team && player.team_id === model.a.team.id
      ? 'A'
      : player && model.b.team && player.team_id === model.b.team.id
        ? 'B'
        : null);
  const side = code ? model.side(code) : null;

  const stage = useRevealStage(MARKS, player ? player.id : null);

  return (
    <SceneFrame
      header={false}
      bleed
      starField="live"
      sponsors={snapshot.sponsors}
      overlay={
        player && stage >= STAGE.sparkle ? (
          <StarBurst runKey={player.id} count={26} duration={1.9} />
        ) : null
      }
    >
      <div
        className="grid h-full min-h-0"
        style={{ gridTemplateRows: '120px minmax(0, 1fr)' }}
      >
        {/* The welcome line is the constant: it is on screen before the first
            player walks out and stays above every card that follows. */}
        <motion.div
          key={player ? 'welcome-player' : 'welcome-idle'}
          initial={motionOn ? { opacity: 0, y: -18 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.card, ease: EASE.entrance }}
          className="flex flex-col items-center justify-center gap-2 text-center"
        >
          <span className="u-display text-ink text-[62px] leading-[0.9]">
            {WELCOME_LINE}
          </span>
          {player ? (
            <span className="u-label text-text-muted text-[20px]">
              NOW ENTERING · {displayNameOf(player)}
            </span>
          ) : null}
        </motion.div>

        <div className="relative flex min-h-0 items-center justify-center">
          {player ? (
            <EntranceCard player={player} side={side} stage={stage} />
          ) : (
            /* The frame the gate opens on, and the one it falls back to if the
               operator clears the card between players. */
            <div className="flex flex-col items-center justify-center gap-8 text-center">
              <span className="u-display text-aqua-700 text-[92px] leading-[0.88]">
                {model.venueLabel || 'LIVE FROM SWANLAKE NORTH COAST'}
              </span>
              {model.eventDateLabel ? (
                <span className="u-label text-text-muted text-[24px]">
                  {model.eventDateLabel}
                </span>
              ) : null}
              <StatusPill label="PLAYERS ARRIVING" tone="pending" size="lg" />
            </div>
          )}
        </div>
      </div>
    </SceneFrame>
  );
}

export default PlayerEntranceScene;
