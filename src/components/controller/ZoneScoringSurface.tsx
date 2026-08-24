'use client';

/**
 * The shared engine behind challenge 1 (mannequin target) and challenge 3
 * (long-range shooting): pick the zone the ball hit, or MISS.
 *
 * Every button, its label and its point value come from the scoring profile —
 * retune the competition in settings and these buttons change with it.
 */

import { useState } from 'react';
import { cn } from '@/lib/cn';
import type { AttemptPayload, TargetOption, TeamCode } from '@/lib/types';
import { ControlButton, Panel } from '@/components/controller/ControlButton';
import { useController } from '@/components/controller/controller-context';
import { useControllerCommands } from '@/components/controller/useControllerCommands';
import {
  RoundGate,
  SideBySide,
  TurnSwitch,
  playerNameOf,
} from '@/components/controller/SurfaceParts';
import {
  suggestedSide,
  turnRuleFor,
  type SideState,
} from '@/components/controller/controller-model';

export interface ZoneScoringSurfaceProps {
  /** Targets or zones, in profile order. */
  options: TargetOption[];
  missPoints: number;
  /** Build the attempt payload for a chosen option, or null for a miss. */
  payloadFor: (optionId: string | null) => AttemptPayload;
  /** Paint the buttons with each option's own colour (challenge 3). */
  useOptionColour: boolean;
  instruction: string;
}

export function ZoneScoringSurface({
  options,
  missPoints,
  payloadFor,
  useOptionColour,
  instruction,
}: ZoneScoringSurfaceProps) {
  const { snapshot, sides, config, canMutate, runner } = useController();
  const commands = useControllerCommands();

  const round = snapshot.currentRound;
  const mechanic = config?.mechanic ?? 'mannequin_target';
  const suggestion = suggestedSide(sides, turnRuleFor(mechanic));

  const [override, setOverride] = useState<{ roundId: string; side: TeamCode } | null>(null);
  const activeSide: TeamCode =
    override && round && override.roundId === round.id ? override.side : suggestion;

  const side: SideState = sides[activeSide];
  const attemptNumber = side.nextAttemptNumber;

  const blocked =
    !canMutate
      ? 'This device does not hold the controls.'
      : !side.player
        ? `No player is assigned to slot ${side.slotLabel}.`
        : attemptNumber === 0
          ? `${side.slotLabel} has taken all ${side.limit} attempts.`
          : null;

  const record = (optionId: string | null, label: string, points: number) => {
    if (!side.player || attemptNumber === 0) return;
    void commands.recordAttempt({
      side: activeSide,
      playerId: side.player.id,
      attemptNumber,
      payload: payloadFor(optionId),
      note: `${side.slotLabel} · ${label} · ${points >= 0 ? '+' : ''}${points} PTS`,
    });
  };

  const columns = options.length + 1 <= 4 ? 2 : 3;
  const busyId = side.player
    ? `attempt:${round?.id ?? ''}:${side.player.id}:${attemptNumber}`
    : '';

  return (
    <RoundGate>
      <div className="flex flex-col gap-4">
        <Panel
          title={`ATTEMPT ${attemptNumber === 0 ? side.limit : attemptNumber} OF ${side.limit}`}
          action={
            <span className="u-label text-eyebrow text-text-muted">{instruction.toUpperCase()}</span>
          }
        >
          <TurnSwitch
            sides={sides}
            active={activeSide}
            suggestion={suggestion}
            onChange={(next) =>
              setOverride(round ? { roundId: round.id, side: next } : null)
            }
            disabled={runner.busy}
          />

          <div
            className={cn('grid gap-3')}
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
          >
            {options.map((option) => (
              <ControlButton
                key={option.id}
                size="xl"
                label={option.label}
                hint={`${option.points >= 0 ? '+' : ''}${option.points} PTS`}
                accent={useOptionColour ? option.color : undefined}
                tone="primary"
                disabled={blocked !== null}
                disabledReason={blocked ?? undefined}
                busy={runner.busyId === busyId}
                onPress={() => record(option.id, option.label, option.points)}
              />
            ))}
            <ControlButton
              size="xl"
              label="MISS"
              glyph="×"
              hint={`${missPoints} PTS`}
              tone="negative"
              disabled={blocked !== null}
              disabledReason={blocked ?? undefined}
              busy={runner.busyId === busyId}
              onPress={() => record(null, 'MISS', missPoints)}
            />
          </div>

          {blocked ? (
            <p className="u-label text-eyebrow text-draw">{blocked.toUpperCase()}</p>
          ) : (
            <p className="u-label text-eyebrow text-text-muted">
              RECORDING FOR {side.slotLabel} · {playerNameOf(side)} · ATTEMPT {attemptNumber}
            </p>
          )}
        </Panel>

        <SideBySide
          sides={sides}
          config={config}
          activeSide={activeSide}
          activeAttemptNumber={attemptNumber === 0 ? null : attemptNumber}
          canMutate={canMutate}
          busy={runner.busy}
        />
      </div>
    </RoundGate>
  );
}

export default ZoneScoringSurface;
