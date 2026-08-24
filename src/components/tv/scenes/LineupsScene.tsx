'use client';

import { motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { CompactPlayerCard } from '@/components/player';
import { DURATION, EASE, StatusPill, teamAccentVars, useMotionScale } from '@/components/ui';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { mechanicRule } from '@/components/tv/mechanics';
import type { SceneProps } from '@/components/tv/scene-props';
import type { PlayerLike } from '@/components/player';
import type { LineupSlotRow, TeamCode } from '@/lib/types';

/** Sequential reveal, inside the 100–140ms band the brief specifies. */
const STAGGER = 0.12;

interface SlotEntry {
  slot: LineupSlotRow;
  player: PlayerLike | null;
}

function EmptySlot({ label, side }: { label: string; side: TeamCode }) {
  return (
    <div
      className={cn(
        'bg-surface-raised ring-border-subtle flex h-full items-center gap-4 rounded-md px-5 ring-1',
        side === 'B' && 'flex-row-reverse',
      )}
    >
      <span className="u-numeral text-text-muted text-[34px] leading-none">{label}</span>
      <span className="u-label text-text-muted text-[16px]">SLOT OPEN</span>
    </div>
  );
}

/**
 * SCREEN 02a — LINEUPS.
 *
 * Both teamsheets either side of a central spine, paired row by row so the room
 * can see at a glance that A3 will face B3. The reveal runs top to bottom rather
 * than all at once, which is what makes ten names land as an announcement
 * instead of a table.
 */
export function LineupsScene({ model }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  const left: SlotEntry[] = model.lineupFor('A');
  const right: SlotEntry[] = model.lineupFor('B');
  const rows = Math.max(left.length, right.length, 5);

  const locked = model.challenge?.locked_at != null || model.challenge?.status === 'locked';

  const column = (entries: SlotEntry[], side: TeamCode, className: string) => (
    <div
      className={cn('grid min-h-0 gap-4', className)}
      style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
    >
      {Array.from({ length: rows }, (_, index) => {
        const entry = entries[index];
        const team = model.side(side);
        return (
          <motion.div
            key={entry?.slot.id ?? `${side}-${index}`}
            initial={motionOn ? { opacity: 0, x: side === 'A' ? -56 : 56 } : false}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: DURATION.card,
              ease: EASE.entrance,
              delay: index * STAGGER + (side === 'B' ? STAGGER / 2 : 0),
            }}
            className="min-h-0"
          >
            {entry?.player ? (
              <CompactPlayerCard
                player={entry.player}
                teamColor={team.color}
                teamCode={side}
                teamName={team.shortName}
                slotLabel={entry.slot.slot_label}
                size="lg"
                reorder={false}
                className="h-full"
              />
            ) : (
              <EmptySlot label={entry?.slot.slot_label ?? `${side}${index + 1}`} side={side} />
            )}
          </motion.div>
        );
      })}
    </div>
  );

  return (
    <SceneFrame
      eyebrow={model.challengeLabel}
      title={model.challengeTitle}
      detail={`${rows} × 1V1`}
      status={
        <StatusPill
          label={locked ? 'LINEUPS LOCKED' : 'LINEUPS'}
          tone={locked ? 'winner' : 'pending'}
          size="md"
          pulse={false}
        />
      }
      qrUrl={model.qrUrl}
      sponsors={snapshot.sponsors}
      starField="live"
    >
      <div
        className="grid h-full min-h-0 gap-x-8"
        style={{ gridTemplateColumns: '1fr 340px 1fr', gridTemplateRows: '150px minmax(0,1fr)' }}
      >
        {/* Every child is placed explicitly. The scoring-rule line below shares
            cell (2, 2) with the pairing spine, and a single explicitly placed
            item is enough to push every auto-placed sibling out of step — which
            silently dropped team B's sheet into an implicit third row. */}
        <TeamCaption
          side="A"
          name={model.side('A').name}
          color={model.side('A').color}
          points={model.side('A').points}
          className="col-start-1 row-start-1"
        />

        {/* The spine's head — challenge identity. */}
        <motion.div
          initial={motionOn ? { opacity: 0, y: -18 } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: DURATION.card, ease: EASE.entrance }}
          className="col-start-2 row-start-1 flex flex-col items-center justify-center gap-3 text-center"
        >
          <span className="u-eyebrow text-aqua-700 text-[18px]">{model.challengeLabel}</span>
          <span className="u-display text-ink text-[44px] leading-[0.9]">
            {model.challengeTitle}
          </span>
          <span className="u-label text-aqua-800 text-[20px]">{rows} × 1V1</span>
          <StatusPill
            label={locked ? 'LINEUPS LOCKED' : 'AWAITING LOCK'}
            tone={locked ? 'winner' : 'pending'}
            size="sm"
            pulse={false}
          />
        </motion.div>

        <TeamCaption
          side="B"
          name={model.side('B').name}
          color={model.side('B').color}
          points={model.side('B').points}
          align="end"
          className="col-start-3 row-start-1"
        />

        {/* The two teamsheets and the pairing connectors between them. */}
        {column(left, 'A', 'col-start-1 row-start-2')}

        <div
          className="col-start-2 row-start-2 grid min-h-0 gap-4"
          style={{ gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: rows }, (_, index) => (
            <motion.div
              key={`link-${index}`}
              initial={motionOn ? { opacity: 0, scaleX: 0.4 } : false}
              animate={{ opacity: 1, scaleX: 1 }}
              transition={{
                duration: DURATION.card,
                ease: EASE.entrance,
                delay: index * STAGGER + 0.16,
              }}
              className="flex min-h-0 items-center gap-3"
            >
              <span aria-hidden className="bg-aqua-300 h-[3px] flex-1 rounded-pill" />
              <span className="u-numeral text-aqua-700 bg-aqua-100 ring-aqua-300 rounded-pill px-4 py-1 text-[22px] leading-none ring-1">
                {String(index + 1).padStart(2, '0')}
              </span>
              <span aria-hidden className="bg-aqua-300 h-[3px] flex-1 rounded-pill" />
            </motion.div>
          ))}
        </div>

        {column(right, 'B', 'col-start-3 row-start-2')}

        {/* Scoring rule for the challenge, quietly, under the spine. */}
        {model.challengeConfig ? (
          <p className="u-label text-text-muted col-start-2 row-start-2 self-end pb-1 text-center text-[13px]">
            {mechanicRule(model.challengeConfig)}
          </p>
        ) : null}
      </div>
    </SceneFrame>
  );
}

function TeamCaption({
  side,
  name,
  color,
  points,
  align = 'start',
  className,
}: {
  side: TeamCode;
  name: string;
  color: string | null;
  points: number;
  align?: 'start' | 'end';
  className?: string;
}) {
  return (
    <div
      style={teamAccentVars(color, side)}
      className={cn(
        'relative flex flex-col justify-center gap-2 overflow-hidden rounded-lg px-8',
        'bg-[color-mix(in_oklab,var(--team-accent)_10%,white)]',
        align === 'end' ? 'items-end text-right' : 'items-start text-left',
        className,
      )}
    >
      <span className="u-display text-[color:var(--team-accent-ink)] text-[58px] leading-none">
        {name}
      </span>
      <span className="u-label text-text-muted text-[16px]">
        {points} PTS SO FAR
      </span>
      <span
        aria-hidden
        className={cn(
          'absolute inset-y-0 w-[10px] bg-[color:var(--team-accent)]',
          align === 'end' ? 'right-0' : 'left-0',
        )}
      />
    </div>
  );
}

export default LineupsScene;
