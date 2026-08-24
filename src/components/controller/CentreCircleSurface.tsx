'use client';

/**
 * Challenge 4 — CENTRE CIRCLE.
 *
 * Ten balls, sixty seconds, one point a ball. Two decisions only: the clock,
 * and whether the ball that just left the boot finished inside the circle.
 *
 * The countdown is a real timer row rather than a local one, because this is
 * the clock the crowd and the wall display are watching — everyone has to see
 * the same sixty seconds. Each player gets their own segment, so switching
 * sides never inherits the other player's remaining time.
 *
 * When it hits zero the surface locks and says AWAITING OFFICIAL SCORE. It does
 * not submit, it does not fill in the balls that were never struck, and it does
 * not guess. Balls left unplayed stay unplayed, and the operator commits the
 * result deliberately from the rail below.
 */

import { useState } from 'react';
import { AttemptDots, ScoreNumeral, StatusPill } from '@/components/ui';
import type { AttemptDotState } from '@/components/ui';
import { useTimer } from '@/lib/hooks';
import { cn } from '@/lib/cn';
import type { CenterCircleConfig, TeamCode, TimerRow } from '@/lib/types';
import {
  ConfirmControlButton,
  ControlButton,
  Panel,
} from '@/components/controller/ControlButton';
import { useController } from '@/components/controller/controller-context';
import { useControllerCommands } from '@/components/controller/useControllerCommands';
import {
  AwaitingOfficialScore,
  RoundGate,
  TurnSwitch,
  playerNameOf,
} from '@/components/controller/SurfaceParts';
import {
  accentFor,
  attemptAt,
  configOfMechanic,
  suggestedSide,
  turnRuleFor,
  type SideState,
} from '@/components/controller/controller-model';

/** One timer segment per side, so A's sixty seconds are not B's. */
const SEGMENT: Record<TeamCode, number> = { A: 1, B: 2 };

export function CentreCircleSurface() {
  const { config } = useController();
  const centre = configOfMechanic(config, 'center_circle');

  if (!centre) {
    return (
      <Panel tone="sunken">
        <p className="u-display text-h3 text-text-secondary">
          THIS CHALLENGE IS NOT CONFIGURED AS THE CENTRE CIRCLE
        </p>
        <p className="text-body text-text-secondary">
          Check the scoring profile: challenge 4 must carry the `center_circle` mechanic.
        </p>
      </Panel>
    );
  }

  return <CentreCircleConsole config={centre} />;
}

function CentreCircleConsole({ config }: { config: CenterCircleConfig }) {
  const { snapshot, sides, canMutate, runner } = useController();
  const commands = useControllerCommands();

  const round = snapshot.currentRound;
  const suggestion = suggestedSide(sides, turnRuleFor('center_circle'));

  const [override, setOverride] = useState<{ roundId: string; side: TeamCode } | null>(null);
  const activeSide: TeamCode =
    override && round && override.roundId === round.id ? override.side : suggestion;

  const side: SideState = sides[activeSide];
  const attemptNumber = side.nextAttemptNumber;
  const segment = SEGMENT[activeSide];

  const timer: TimerRow | null =
    snapshot.timers.find(
      (t) => t.round_id === (round?.id ?? '') && t.segment === segment && t.scope === 'round',
    ) ?? null;

  const reading = useTimer(timer, { tenths: true });
  const expired = reading.expired && reading.durationMs !== null;
  const seconds = (config.timeLimitMs / 1000).toFixed(0);

  const blocked = !canMutate
    ? 'This device does not hold the controls.'
    : !side.player
      ? `No player is assigned to slot ${side.slotLabel}.`
      : expired
        ? `${side.slotLabel} is out of time — the score is awaiting confirmation.`
        : attemptNumber === 0
          ? `${side.slotLabel} has played all ${side.limit} balls.`
          : null;

  const busyId = side.player
    ? `attempt:${round?.id ?? ''}:${side.player.id}:${attemptNumber}`
    : '';

  const clockBusy =
    runner.busyId === `timer:ensure:${round?.id ?? ''}:${segment}` ||
    (timer !== null &&
      (runner.busyId === `timer:start:${timer.id}` ||
        runner.busyId === `timer:pause:${timer.id}` ||
        runner.busyId === `timer:resume:${timer.id}` ||
        runner.busyId === `timer:reset:${timer.id}`));

  const startClock = async () => {
    let id = timer?.id ?? null;
    if (!id) {
      id = await commands.ensureRoundTimer({
        segment,
        mode: 'count_down',
        durationMs: config.timeLimitMs,
        label: `${side.slotLabel} · ${seconds}s`,
      });
    }
    if (id) await commands.startTimer(id);
  };

  const record = (hit: boolean) => {
    if (!side.player || attemptNumber === 0) return;
    void commands.recordAttempt({
      side: activeSide,
      playerId: side.player.id,
      attemptNumber,
      payload: { kind: 'center_circle', hit },
      note: `${side.slotLabel} · BALL ${attemptNumber} · ${
        hit ? `IN THE CIRCLE · +${config.pointsPerHit} PTS` : 'MISSED · 0 PTS'
      }`,
    });
  };

  return (
    <RoundGate>
      <div className="flex flex-col gap-4">
        {expired ? (
          <AwaitingOfficialScore
            headline={`${side.slotLabel} · ${playerNameOf(side)} · ${side.points} PTS FROM ${side.attempts.length} BALLS`}
            detail={`The ${seconds} seconds are gone. ${
              side.remaining > 0
                ? `${side.remaining} of the ${side.limit} balls were never played and stay unplayed.`
                : 'All ten balls were played.'
            } Nothing has been submitted: check the count, correct any ball below, then submit the official result from the rail at the bottom of the screen.`}
          />
        ) : null}

        <Panel
          title={`BALL ${attemptNumber === 0 ? side.limit : attemptNumber} OF ${side.limit}`}
          action={
            <span className="u-label text-eyebrow text-text-muted">
              {config.ballsPerPlayer} BALLS · {seconds}s · {config.pointsPerHit} PT PER BALL IN
            </span>
          }
        >
          <TurnSwitch
            sides={sides}
            active={activeSide}
            suggestion={suggestion}
            onChange={(next) => setOverride(round ? { roundId: round.id, side: next } : null)}
            disabled={runner.busy || reading.running}
          />

          {/* --- the countdown -------------------------------------------- */}
          <div className="flex flex-col gap-4 rounded-lg border-2 border-slate bg-mist p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <ScoreNumeral
                value={reading.clock}
                label={`${side.slotLabel} COUNTDOWN`}
                size="lg"
                variant="clock"
                tone={expired ? 'live' : reading.running ? 'winner' : 'default'}
                animate={false}
              />
              <div className="flex flex-col items-end gap-2">
                <StatusPill
                  label={
                    expired
                      ? 'TIME UP'
                      : reading.running
                        ? 'RUNNING'
                        : reading.state === 'paused'
                          ? 'PAUSED'
                          : 'READY'
                  }
                  tone={
                    expired ? 'live' : reading.running ? 'live' : reading.state === 'paused' ? 'draw' : 'pending'
                  }
                  variant={reading.running || expired ? 'solid' : 'soft'}
                  size="md"
                  pulse={reading.running}
                />
                <span className="u-numeral u-tabular text-eyebrow text-text-muted">
                  {side.attempts.length} OF {side.limit} BALLS PLAYED
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {reading.running ? (
                <ControlButton
                  label="PAUSE"
                  glyph="❙❙"
                  size="lg"
                  tone="danger"
                  disabled={!canMutate || !timer}
                  disabledReason="This device does not hold the controls."
                  busy={clockBusy}
                  onPress={() => timer && void commands.pauseTimer(timer.id)}
                  className="sm:col-span-2"
                />
              ) : reading.state === 'paused' ? (
                <ControlButton
                  label="RESUME"
                  glyph="▶"
                  size="lg"
                  tone="primary"
                  disabled={!canMutate || !timer || expired}
                  disabledReason={
                    expired ? 'The countdown has finished.' : 'This device does not hold the controls.'
                  }
                  busy={clockBusy}
                  onPress={() => timer && void commands.resumeTimer(timer.id)}
                  className="sm:col-span-2"
                />
              ) : (
                <ControlButton
                  label={`START ${seconds}s`}
                  glyph="▶"
                  size="lg"
                  tone="primary"
                  disabled={!canMutate || expired}
                  disabledReason={
                    expired
                      ? 'The countdown has finished. Reset it to run this player again.'
                      : 'This device does not hold the controls.'
                  }
                  busy={clockBusy}
                  onPress={() => void startClock()}
                  className="sm:col-span-2"
                />
              )}

              <ConfirmControlButton
                label="RESET CLOCK"
                armedLabel="TAP AGAIN TO RESET"
                glyph="↺"
                size="lg"
                tone="quiet"
                disabled={!canMutate || !timer}
                disabledReason="This device does not hold the controls."
                busy={clockBusy}
                onConfirm={() => timer && void commands.resetTimer(timer.id)}
              />
            </div>
          </div>

          {/* --- the two taps that matter --------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <ControlButton
              label="BALL IN"
              glyph="✓"
              hint={`+${config.pointsPerHit} PTS`}
              size="xl"
              tone="positive"
              disabled={blocked !== null}
              disabledReason={blocked ?? undefined}
              busy={runner.busyId === busyId}
              onPress={() => record(true)}
            />
            <ControlButton
              label="MISSED"
              glyph="×"
              hint="0 PTS"
              size="xl"
              tone="negative"
              disabled={blocked !== null}
              disabledReason={blocked ?? undefined}
              busy={runner.busyId === busyId}
              onPress={() => record(false)}
            />
          </div>

          {blocked ? (
            <p className="u-label text-eyebrow text-draw">{blocked.toUpperCase()}</p>
          ) : (
            <p className="u-label text-eyebrow text-text-muted">
              RECORDING FOR {side.slotLabel} · {playerNameOf(side)} · BALL {attemptNumber}
              {reading.state === 'ready' ? ' · THE CLOCK HAS NOT BEEN STARTED YET' : ''}
            </p>
          )}
        </Panel>

        <div className="grid gap-4 lg:grid-cols-2">
          <BallBoard
            side={sides[activeSide]}
            live={!expired}
            activeAttemptNumber={attemptNumber === 0 ? null : attemptNumber}
            canMutate={canMutate}
            busy={runner.busy}
            highlighted
          />
          <BallBoard
            side={sides[activeSide === 'A' ? 'B' : 'A']}
            live={false}
            activeAttemptNumber={null}
            canMutate={canMutate}
            busy={runner.busy}
            highlighted={false}
          />
        </div>
      </div>
    </RoundGate>
  );
}

/**
 * One player's ten balls: the rail for reading at a glance, the grid for
 * correcting a call. Correcting appends a reversal — the ball is never erased,
 * and its slot reopens for a fresh record.
 */
function BallBoard({
  side,
  live,
  activeAttemptNumber,
  canMutate,
  busy,
  highlighted,
}: {
  side: SideState;
  live: boolean;
  activeAttemptNumber: number | null;
  canMutate: boolean;
  busy: boolean;
  highlighted: boolean;
}) {
  const commands = useControllerCommands();
  const [selected, setSelected] = useState<number | null>(null);
  const accent = accentFor(side.team, side.side);

  const balls = Array.from({ length: side.limit }, (_, index) => index + 1);
  const states: AttemptDotState[] = balls.map((number) => {
    const attempt = attemptAt(side, number);
    if (attempt) return Number(attempt.points) > 0 ? 'hit' : 'miss';
    if (live && number === activeAttemptNumber) return 'active';
    return 'pending';
  });

  const chosen = selected === null ? null : attemptAt(side, selected);
  const hits = side.attempts.filter((a) => Number(a.points) > 0).length;

  return (
    <Panel
      tone={highlighted ? 'accent' : 'raised'}
      className={highlighted ? 'border-aqua-500' : ''}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <span className="u-display text-[1.25rem] leading-none text-text-primary">
          <span style={{ color: accent }}>{side.slotLabel}</span> · {playerNameOf(side)}
        </span>
        <ScoreNumeral value={side.points} suffix="PTS" size="xs" labelPlacement="none" align="end" />
      </div>

      <AttemptDots
        attempts={states}
        total={side.limit}
        size="lg"
        label={`${hits} IN · ${side.attempts.length - hits} MISSED · ${side.remaining} NOT PLAYED`}
        ariaLabel={`${side.slotLabel} balls`}
      />

      <ul className="grid grid-cols-5 gap-2">
        {balls.map((number) => {
          const attempt = attemptAt(side, number);
          const hit = attempt ? Number(attempt.points) > 0 : null;
          const isNext = live && activeAttemptNumber === number;
          return (
            <li key={number}>
              <button
                type="button"
                disabled={!attempt}
                onClick={() => setSelected((current) => (current === number ? null : number))}
                className={cn(
                  'flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border-2 px-1 py-2',
                  attempt === null
                    ? isNext
                      ? 'border-dashed border-aqua-600 bg-aqua-50'
                      : 'border-dashed border-border-subtle bg-mist'
                    : hit
                      ? 'border-winner bg-winner-soft'
                      : 'border-live bg-live-soft',
                  selected === number ? 'ring-4 ring-focus ring-offset-2' : '',
                )}
              >
                <span className="u-label text-[0.625rem] text-text-muted">
                  {isNext && !attempt ? 'NEXT' : `#${number}`}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'u-display text-[1.5rem] leading-none',
                    attempt === null ? 'text-text-muted' : hit ? 'text-winner' : 'text-live',
                  )}
                >
                  {attempt === null ? '·' : hit ? '✓' : '×'}
                </span>
                <span className="u-sr-only">
                  {`Ball ${number} ${
                    attempt === null ? 'not played' : hit ? 'in the circle' : 'missed'
                  }`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {chosen ? (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-draw bg-draw-soft p-3">
          <p className="u-label text-eyebrow text-text-primary">
            BALL {chosen.attempt_number} ·{' '}
            {Number(chosen.points) > 0 ? 'IN THE CIRCLE' : 'MISSED'} · {chosen.points} PTS
          </p>
          <ConfirmControlButton
            label="REVERSE THIS BALL"
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
                  description: `${side.slotLabel} ball ${chosen.attempt_number}`,
                })
                .then(() => setSelected(null));
            }}
          />
        </div>
      ) : null}
    </Panel>
  );
}

export default CentreCircleSurface;
