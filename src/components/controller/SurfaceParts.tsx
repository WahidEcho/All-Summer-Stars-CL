'use client';

/**
 * Pieces every 1v1 scoring surface shares: whose turn it is, the attempt
 * slots, the two running totals, and the gate that stops an operator scoring
 * into a round that is not open.
 */

import { useState, type ReactNode } from 'react';
import { AttemptDots, ScoreNumeral, StatusPill } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { AttemptDotState } from '@/components/ui';
import type { ChallengeConfig, TeamCode } from '@/lib/types';
import { ControlButton, ConfirmControlButton, Panel } from '@/components/controller/ControlButton';
import { useController } from '@/components/controller/controller-context';
import { useControllerCommands } from '@/components/controller/useControllerCommands';
import {
  accentFor,
  attemptAt,
  describeAttempt,
  type SideState,
} from '@/components/controller/controller-model';

const SIDES: TeamCode[] = ['A', 'B'];

export function playerNameOf(side: SideState): string {
  const player = side.player;
  if (!player) return 'NO PLAYER IN THIS SLOT';
  return (player.display_name ?? player.full_name).toUpperCase();
}

/** The A / B switch. Always available — a running order rarely survives a beach. */
export function TurnSwitch({
  sides,
  active,
  onChange,
  disabled = false,
  suggestion,
}: {
  sides: Record<TeamCode, SideState>;
  active: TeamCode;
  onChange: (side: TeamCode) => void;
  disabled?: boolean;
  suggestion: TeamCode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-label text-eyebrow text-text-muted">WHOSE TURN</span>
        {suggestion !== active ? (
          <button
            type="button"
            onClick={() => onChange(suggestion)}
            className="u-label text-eyebrow text-aqua-700 underline underline-offset-4"
          >
            SUGGESTED: {sides[suggestion].slotLabel}
          </button>
        ) : (
          <span className="u-label text-eyebrow text-text-muted">FOLLOWING THE RUNNING ORDER</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        {SIDES.map((code) => {
          const side = sides[code];
          const accent = accentFor(side.team, code);
          const selected = active === code;
          return (
            <ControlButton
              key={code}
              size="md"
              disabled={disabled}
              selected={selected}
              accent={selected ? accent : undefined}
              tone="neutral"
              onPress={() => onChange(code)}
              label={`${side.slotLabel} · ${playerNameOf(side)}`}
              hint={
                side.limit > 0
                  ? `${side.attempts.length}/${side.limit} TAKEN · ${side.points} PTS`
                  : `${side.points} PTS`
              }
            />
          );
        })}
      </div>
    </div>
  );
}

/**
 * One player's attempt slots. A filled slot can be selected and reversed —
 * nothing is deleted, a reversal row is appended and the total re-derives.
 */
export function AttemptSlotGrid({
  side,
  config,
  activeAttemptNumber,
  canMutate,
  busy,
}: {
  side: SideState;
  config: ChallengeConfig | null;
  activeAttemptNumber: number | null;
  canMutate: boolean;
  busy: boolean;
}) {
  const commands = useControllerCommands();
  const [selected, setSelected] = useState<number | null>(null);
  const accent = accentFor(side.team, side.side);
  const slots = Array.from({ length: side.limit }, (_, index) => index + 1);
  const chosen = selected === null ? null : attemptAt(side, selected);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <span className="u-display text-[1.25rem] leading-none text-text-primary">
          <span style={{ color: accent }}>{side.slotLabel}</span> · {playerNameOf(side)}
        </span>
        <ScoreNumeral
          value={side.points}
          suffix="PTS"
          size="xs"
          labelPlacement="none"
          align="end"
        />
      </div>

      <ul className="grid gap-2" style={{ gridTemplateColumns: `repeat(${Math.max(1, side.limit)}, minmax(0, 1fr))` }}>
        {slots.map((number) => {
          const attempt = attemptAt(side, number);
          const description = attempt ? describeAttempt(config, attempt) : null;
          const isActive = activeAttemptNumber === number;
          return (
            <li key={number}>
              <button
                type="button"
                disabled={!attempt}
                onClick={() => setSelected((current) => (current === number ? null : number))}
                className={cn(
                  'flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 px-2 py-2 text-center',
                  attempt
                    ? 'border-slate bg-surface-raised'
                    : isActive
                      ? 'border-dashed border-aqua-600 bg-aqua-50'
                      : 'border-dashed border-border-subtle bg-mist',
                  selected === number ? 'ring-4 ring-focus ring-offset-2' : '',
                )}
              >
                <span className="u-label text-eyebrow text-text-muted">
                  {isActive && !attempt ? 'NEXT' : `#${number}`}
                </span>
                <span className="u-numeral text-[1.75rem] leading-none text-text-primary">
                  {description ? description.points : '—'}
                </span>
                <span className="u-label text-[0.625rem] leading-tight text-text-secondary">
                  {description ? description.label : 'NOT PLAYED'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {chosen ? (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-draw bg-draw-soft p-3">
          <p className="u-label text-eyebrow text-text-primary">
            ATTEMPT {chosen.attempt_number} · {describeAttempt(config, chosen).label} ·{' '}
            {describeAttempt(config, chosen).points} PTS
          </p>
          <ConfirmControlButton
            label="REVERSE THIS ATTEMPT"
            armedLabel="TAP AGAIN TO REVERSE"
            size="sm"
            tone="negative"
            glyph="↺"
            disabled={!canMutate}
            disabledReason="This device does not hold the controls."
            busy={busy}
            onConfirm={() => {
              void commands
                .reverse({
                  kind: 'attempt',
                  id: chosen.id,
                  description: `${side.slotLabel} attempt ${chosen.attempt_number}`,
                })
                .then(() => setSelected(null));
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Both players, their attempts and their running totals, side by side. */
export function SideBySide({
  sides,
  config,
  activeSide,
  activeAttemptNumber,
  canMutate,
  busy,
}: {
  sides: Record<TeamCode, SideState>;
  config: ChallengeConfig | null;
  activeSide: TeamCode;
  activeAttemptNumber: number | null;
  canMutate: boolean;
  busy: boolean;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {SIDES.map((code) => (
        <Panel
          key={code}
          tone={code === activeSide ? 'accent' : 'raised'}
          className={code === activeSide ? 'border-aqua-500' : ''}
        >
          <AttemptSlotGrid
            side={sides[code]}
            config={config}
            activeAttemptNumber={code === activeSide ? activeAttemptNumber : null}
            canMutate={canMutate}
            busy={busy}
          />
        </Panel>
      ))}
    </div>
  );
}

/** A compact ball/attempt rail, used where the slot grid would be too heavy. */
export function SideDots({
  side,
  config,
  live,
}: {
  side: SideState;
  config: ChallengeConfig | null;
  live: boolean;
}) {
  const states: AttemptDotState[] = Array.from({ length: side.limit }, (_, index) => {
    const attempt = attemptAt(side, index + 1);
    if (attempt) return Number(attempt.points) > 0 ? 'hit' : 'miss';
    if (live && index + 1 === side.nextAttemptNumber) return 'active';
    return 'pending';
  });

  const values = Array.from({ length: side.limit }, (_, index) => {
    const attempt = attemptAt(side, index + 1);
    return attempt ? describeAttempt(config, attempt).points : null;
  });

  return (
    <AttemptDots
      attempts={states}
      values={values}
      size="md"
      label={`${side.slotLabel} · ${side.points} PTS`}
      ariaLabel={`${side.slotLabel} attempts`}
    />
  );
}

/**
 * Nothing may be scored into a round that is not open. This gate turns that
 * rule into one obvious button rather than a silent failure.
 */
export function RoundGate({ children }: { children: ReactNode }) {
  const { snapshot, canMutate, runner } = useController();
  const commands = useControllerCommands();
  const round = snapshot.currentRound;

  if (!round) {
    return (
      <Panel tone="sunken">
        <p className="u-display text-h3 text-text-secondary">NO ROUND SELECTED</p>
        <p className="text-body text-text-secondary">
          Pick a round in the bar above. If this challenge has no rounds yet, create them from the
          event setup screen first.
        </p>
      </Panel>
    );
  }

  if (round.status === 'published' || round.status === 'completed') {
    return (
      <Panel tone="sunken">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill label="ROUND PUBLISHED" tone="winner" variant="solid" size="lg" />
          <ScoreNumeral value={round.score_a} label="A" size="sm" />
          <ScoreNumeral value={round.score_b} label="B" size="sm" />
        </div>
        <p className="text-body text-text-secondary">
          These points are on the leaderboard. Reopen the round from the rail below if a call has to
          be corrected — reopening reverses the published entries, it never deletes them.
        </p>
        {children}
      </Panel>
    );
  }

  if (round.status === 'pending' || round.status === 'ready') {
    return (
      <div className="flex flex-col gap-4">
        <Panel tone="accent">
          <p className="u-display text-h3 text-text-primary">ROUND {round.number} IS NOT LIVE</p>
          <p className="text-body text-text-secondary">
            Starting the round puts it on the clock and moves the challenge to live. You can also
            simply record the first attempt — that starts the round too.
          </p>
          <ControlButton
            label="START ROUND"
            glyph="▶"
            tone="primary"
            size="lg"
            disabled={!canMutate}
            disabledReason="This device does not hold the controls."
            busy={runner.busyId === `round:start:${round.id}`}
            onPress={() => void commands.startRound()}
          />
        </Panel>
        {children}
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * The state a timed challenge lands in when its clock runs out. Nothing is
 * submitted here — the operator finishes attribution and commits deliberately
 * from the rail below.
 */
export function AwaitingOfficialScore({
  headline,
  detail,
}: {
  headline: string;
  detail: string;
}) {
  return (
    <Panel tone="accent" className="border-draw bg-draw-soft">
      <div className="flex flex-wrap items-center gap-3">
        <StatusPill label="AWAITING OFFICIAL SCORE" tone="draw" variant="solid" size="lg" glyph="⏱" />
      </div>
      <p className="u-display text-h3 text-text-primary">{headline}</p>
      <p className="text-body text-text-secondary">{detail}</p>
    </Panel>
  );
}
