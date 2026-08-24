'use client';

/**
 * Challenge 2 — DRIBBLE & FINISH.
 *
 * Players alternate. One attempt is three decisions and nothing else: how long
 * the run took, whether the ball went in, and a deliberate commit.
 *
 * The stopwatch is local to this tablet on purpose. A clock started and stopped
 * through a server round trip inherits the network's latency at both ends, and
 * this challenge pays a bonus on a threshold measured in tenths — so the timing
 * that decides points is taken here, on the device holding the button, and only
 * the *result* travels. The operator can also simply type the time, because the
 * only thing worse than a mistimed run is a mistimed run nobody can correct.
 *
 * Nothing is written until the operator has seen the arithmetic. CONFIRM opens
 * the breakdown — "UNDER 15.0s +2, PAST THE KEEPER +3 = 5 PTS" — and the award
 * happens on a second, separate tap.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ScoreNumeral, StatusPill } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { DribbleFinishConfig, TeamCode } from '@/lib/types';
import {
  ControlButton,
  Panel,
  SegmentedChoice,
} from '@/components/controller/ControlButton';
import { Modal } from '@/components/controller/Modal';
import { useController } from '@/components/controller/controller-context';
import { useControllerCommands } from '@/components/controller/useControllerCommands';
import {
  RoundGate,
  SideBySide,
  TurnSwitch,
  playerNameOf,
} from '@/components/controller/SurfaceParts';
import {
  configOfMechanic,
  dribbleBreakdown,
  suggestedSide,
  turnRuleFor,
  type SideState,
} from '@/components/controller/controller-model';

/** How often the running stopwatch re-renders. Tenths need no more than this. */
const TICK_MS = 50;

interface Stopwatch {
  elapsedMs: number;
  running: boolean;
  /** True once the clock has been started at least once since the last reset. */
  touched: boolean;
  start: () => void;
  stop: () => void;
  reset: () => void;
  setTo: (ms: number) => void;
}

function useStopwatch(): Stopwatch {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [touched, setTouched] = useState(false);

  const startedAt = useRef<number | null>(null);
  const banked = useRef(0);
  const frame = useRef<number | null>(null);
  const published = useRef(0);

  useEffect(() => {
    if (!running) return;
    let cancelled = false;

    const loop = () => {
      if (cancelled) return;
      const at = startedAt.current;
      const now = Date.now();
      if (at !== null && now - published.current >= TICK_MS) {
        published.current = now;
        setElapsedMs(banked.current + (now - at));
      }
      frame.current = requestAnimationFrame(loop);
    };

    published.current = 0;
    frame.current = requestAnimationFrame(loop);

    return () => {
      cancelled = true;
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      frame.current = null;
    };
  }, [running]);

  const start = useCallback(() => {
    if (startedAt.current !== null) return;
    startedAt.current = Date.now();
    setTouched(true);
    setRunning(true);
  }, []);

  const stop = useCallback(() => {
    const at = startedAt.current;
    if (at !== null) {
      banked.current += Date.now() - at;
      startedAt.current = null;
      setElapsedMs(banked.current);
    }
    setRunning(false);
  }, []);

  const reset = useCallback(() => {
    startedAt.current = null;
    banked.current = 0;
    published.current = 0;
    setRunning(false);
    setTouched(false);
    setElapsedMs(0);
  }, []);

  const setTo = useCallback((ms: number) => {
    startedAt.current = null;
    banked.current = Math.max(0, Math.round(ms));
    setRunning(false);
    setTouched(true);
    setElapsedMs(Math.max(0, Math.round(ms)));
  }, []);

  return { elapsedMs, running, touched, start, stop, reset, setTo };
}

/** `12.4` — the only clock format this challenge ever needs. */
function seconds(ms: number): string {
  return (ms / 1000).toFixed(1);
}

type Outcome = 'goal' | 'no_goal';

export function DribbleFinishSurface() {
  const { config } = useController();
  const dribble = configOfMechanic(config, 'dribble_finish');

  if (!dribble) {
    return (
      <Panel tone="sunken">
        <p className="u-display text-h3 text-text-secondary">
          THIS CHALLENGE IS NOT CONFIGURED AS DRIBBLE &amp; FINISH
        </p>
        <p className="text-body text-text-secondary">
          Check the scoring profile: challenge 2 must carry the `dribble_finish` mechanic.
        </p>
      </Panel>
    );
  }

  return <DribbleFinishConsole config={dribble} />;
}

function DribbleFinishConsole({ config }: { config: DribbleFinishConfig }) {
  const { snapshot, sides, config: challengeConfig, canMutate, runner } = useController();
  const commands = useControllerCommands();

  const round = snapshot.currentRound;
  const suggestion = suggestedSide(sides, turnRuleFor('dribble_finish'));

  const [override, setOverride] = useState<{ roundId: string; side: TeamCode } | null>(null);
  const activeSide: TeamCode =
    override && round && override.roundId === round.id ? override.side : suggestion;

  const side: SideState = sides[activeSide];
  const attemptNumber = side.nextAttemptNumber;

  const watch = useStopwatch();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [typed, setTyped] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  /** A manual time wins over the stopwatch, and says so on screen. */
  const typedMs = (() => {
    if (typed === null) return null;
    const value = Number.parseFloat(typed.replace(',', '.'));
    if (!Number.isFinite(value) || value < 0) return null;
    return Math.round(value * 1000);
  })();
  const manual = typedMs !== null;
  const timeMs = typedMs ?? watch.elapsedMs;

  /** Clear the whole attempt back to a clean slate. */
  const clearAttempt = useCallback(() => {
    watch.reset();
    setOutcome(null);
    setTyped(null);
  }, [watch]);

  // Moving to another player — or to another round — must never carry one
  // player's stopwatch reading onto the next attempt.
  const attemptKey = `${round?.id ?? ''}:${activeSide}:${attemptNumber}`;
  const lastKey = useRef(attemptKey);
  useEffect(() => {
    if (lastKey.current === attemptKey) return;
    lastKey.current = attemptKey;
    clearAttempt();
    setReviewOpen(false);
  }, [attemptKey, clearAttempt]);

  const blocked = !canMutate
    ? 'This device does not hold the controls.'
    : !side.player
      ? `No player is assigned to slot ${side.slotLabel}.`
      : attemptNumber === 0
        ? `${side.slotLabel} has taken all ${side.limit} attempts.`
        : null;

  const timeReady = watch.touched || manual;
  const ready = blocked === null && timeReady && outcome !== null && !watch.running;
  const scored = outcome === 'goal';
  const breakdown = dribbleBreakdown(config, timeMs, scored);
  const threshold = seconds(config.dribbleThresholdMs);
  const underThreshold = timeMs > 0 && timeMs < config.dribbleThresholdMs;

  const busyId = side.player
    ? `attempt:${round?.id ?? ''}:${side.player.id}:${attemptNumber}`
    : '';

  const award = () => {
    if (!side.player || attemptNumber === 0) return;
    void commands
      .recordAttempt({
        side: activeSide,
        playerId: side.player.id,
        attemptNumber,
        payload: { kind: 'dribble_finish', timeMs, scored },
        note: `${side.slotLabel} · ${seconds(timeMs)}s · ${
          scored ? 'GOAL' : 'NO GOAL'
        } · +${breakdown.total} PTS`,
      })
      .then((landed) => {
        setReviewOpen(false);
        // Only a confirmed write clears the attempt — a rejected command leaves
        // the operator looking at exactly what they were about to award.
        if (landed) clearAttempt();
      });
  };

  return (
    <RoundGate>
      <div className="flex flex-col gap-4">
        <Panel
          title={`ATTEMPT ${attemptNumber === 0 ? side.limit : attemptNumber} OF ${side.limit}`}
          action={
            <span className="u-label text-eyebrow text-text-muted">
              {config.attemptsPerPlayer} ATTEMPTS EACH · ALTERNATING
            </span>
          }
        >
          <TurnSwitch
            sides={sides}
            active={activeSide}
            suggestion={suggestion}
            onChange={(next) => setOverride(round ? { roundId: round.id, side: next } : null)}
            disabled={runner.busy || watch.running}
          />

          {/* --- the clock ------------------------------------------------ */}
          <div className="flex flex-col gap-4 rounded-lg border-2 border-slate bg-mist p-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-baseline gap-3">
                <ScoreNumeral
                  value={seconds(timeMs)}
                  suffix="s"
                  label="RUN TIME"
                  size="lg"
                  variant="clock"
                  tone={watch.running ? 'live' : underThreshold ? 'winner' : 'default'}
                  animate={false}
                />
              </div>
              <div className="flex flex-col items-end gap-2">
                <StatusPill
                  label={watch.running ? 'TIMING' : manual ? 'TIME TYPED IN' : 'STOPPED'}
                  tone={watch.running ? 'live' : manual ? 'draw' : 'neutral'}
                  variant={watch.running ? 'solid' : 'soft'}
                  size="md"
                  pulse={watch.running}
                />
                <span className="u-label text-eyebrow text-text-muted">
                  UNDER {threshold}s = +{config.dribbleBonusPoints} PTS
                </span>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {watch.running ? (
                <ControlButton
                  label="STOP"
                  glyph="■"
                  size="xl"
                  tone="danger"
                  disabled={blocked !== null}
                  disabledReason={blocked ?? undefined}
                  onPress={() => watch.stop()}
                  className="sm:col-span-2"
                />
              ) : (
                <ControlButton
                  label={watch.touched || manual ? 'RESTART' : 'START'}
                  glyph="▶"
                  size="xl"
                  tone="primary"
                  disabled={blocked !== null}
                  disabledReason={blocked ?? undefined}
                  onPress={() => {
                    setTyped(null);
                    watch.reset();
                    watch.start();
                  }}
                  className="sm:col-span-2"
                />
              )}
              <ControlButton
                label="RESET CLOCK"
                glyph="↺"
                size="xl"
                tone="quiet"
                disabled={blocked !== null || (!watch.touched && !manual)}
                disabledReason={
                  blocked ?? 'The clock is already at zero.'
                }
                onPress={() => {
                  setTyped(null);
                  watch.reset();
                }}
              />
            </div>

            <label className="flex flex-wrap items-center gap-3">
              <span className="u-label text-eyebrow text-text-muted">
                OR TYPE THE TIME (SECONDS)
              </span>
              <input
                value={typed ?? ''}
                onChange={(event) => {
                  const next = event.target.value;
                  setTyped(next === '' ? null : next);
                }}
                inputMode="decimal"
                placeholder={seconds(watch.elapsedMs)}
                aria-label="Run time in seconds"
                disabled={blocked !== null || watch.running}
                className={cn(
                  'u-numeral u-tabular min-h-16 w-40 rounded-lg border-2 px-4 text-[1.75rem]',
                  'text-text-primary disabled:opacity-45',
                  manual ? 'border-draw bg-draw-soft' : 'border-slate bg-surface-raised',
                )}
              />
              {manual ? (
                <button
                  type="button"
                  onClick={() => setTyped(null)}
                  className="u-label min-h-14 rounded-lg border-2 border-slate bg-surface-raised px-4 text-eyebrow text-text-secondary"
                >
                  USE THE STOPWATCH INSTEAD
                </button>
              ) : null}
              {typed !== null && typedMs === null ? (
                <span className="u-label text-eyebrow text-live">
                  THAT IS NOT A TIME — TRY 12.4
                </span>
              ) : null}
            </label>
          </div>

          {/* --- did it go in? -------------------------------------------- */}
          <SegmentedChoice<Outcome>
            label="GOAL SCORED?"
            size="xl"
            columns={2}
            disabled={blocked !== null}
            value={outcome}
            onChange={setOutcome}
            options={[
              {
                id: 'goal',
                label: 'GOAL',
                hint: `+${config.goalPoints} PTS`,
                accent: 'var(--color-winner)',
              },
              { id: 'no_goal', label: 'NO GOAL', hint: '0 PTS' },
            ]}
          />

          <ControlButton
            label="CONFIRM ATTEMPT"
            glyph="→"
            size="xl"
            tone="primary"
            disabled={!ready}
            disabledReason={
              blocked ??
              (watch.running
                ? 'Stop the clock first.'
                : !timeReady
                  ? 'Time the run, or type the time in.'
                  : 'Say whether the ball went in.')
            }
            busy={runner.busyId === busyId}
            onPress={() => setReviewOpen(true)}
          />

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
          config={challengeConfig}
          activeSide={activeSide}
          activeAttemptNumber={attemptNumber === 0 ? null : attemptNumber}
          canMutate={canMutate}
          busy={runner.busy}
        />
      </div>

      {/* The arithmetic, before anything is written. */}
      <Modal
        open={reviewOpen}
        title={`AWARD ${breakdown.total} PTS`}
        subtitle={`${side.slotLabel} · ${playerNameOf(side)} · ATTEMPT ${attemptNumber}`}
        onClose={() => setReviewOpen(false)}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <ControlButton
              label="GO BACK"
              tone="neutral"
              size="lg"
              onPress={() => setReviewOpen(false)}
            />
            <ControlButton
              label={`AWARD ${breakdown.total} PTS`}
              glyph="✓"
              tone="positive"
              size="lg"
              disabled={!ready}
              disabledReason={blocked ?? 'Finish the attempt first.'}
              busy={runner.busyId === busyId}
              onPress={award}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <ul className="flex flex-col gap-2">
            {breakdown.lines.map((line) => (
              <li
                key={line.label}
                className="flex items-center justify-between gap-4 rounded-lg border-2 border-border-subtle bg-surface-raised px-4 py-3"
              >
                <span className="u-display text-[1.5rem] leading-none text-text-primary">
                  {line.label}
                </span>
                <span
                  className={cn(
                    'u-numeral u-tabular text-[1.75rem] leading-none',
                    line.points > 0 ? 'text-winner' : 'text-text-muted',
                  )}
                >
                  {line.points > 0 ? '+' : ''}
                  {line.points}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-4 rounded-lg border-2 border-aqua-500 bg-aqua-50 px-4 py-3">
            <span className="u-display text-h3 leading-none text-text-primary">
              {seconds(timeMs)}s · {scored ? 'GOAL' : 'NO GOAL'}
            </span>
            <ScoreNumeral
              value={breakdown.total}
              suffix="PTS"
              size="sm"
              labelPlacement="none"
              align="end"
              animate={false}
            />
          </div>

          {breakdown.capped ? (
            <p className="u-label text-eyebrow text-draw">
              CAPPED AT {config.maxPointsPerAttempt} PTS PER ATTEMPT BY THE SCORING PROFILE
            </p>
          ) : null}

          {manual ? (
            <p className="u-label text-eyebrow text-draw">
              THIS TIME WAS TYPED IN, NOT TIMED ON THIS DEVICE
            </p>
          ) : null}
        </div>
      </Modal>
    </RoundGate>
  );
}

export default DribbleFinishSurface;
