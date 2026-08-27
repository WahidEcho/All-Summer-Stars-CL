'use client';

/**
 * The five rounds of the current challenge as one explicit control strip.
 *
 * One button per round, pressed by the operator — never by the system. The
 * server enforces one round at a time, and this rail says so before the tap:
 * while any round is open, every other START is disabled with the reason, so
 * the show can only ever move round by round, in order, on a press.
 *
 * The open round carries the way back out. One round at a time is the right
 * rule and a mis-tap is inevitable on a tablet at pitch side, so the round on
 * the floor offers PUT BACK for exactly as long as nothing has been recorded
 * on it — after the first attempt it is a round that was played, and the way
 * out of those is to undo the attempts or to publish.
 */

import { useController } from '@/components/controller/controller-context';
import { useControllerCommands } from '@/components/controller/useControllerCommands';
import { ControlButton, Panel } from '@/components/controller/ControlButton';
import { StatusPill, type StatusPillTone } from '@/components/ui';
import type { RoundRow } from '@/lib/types';

const STATE: Record<RoundRow['status'], { label: string; tone: StatusPillTone }> = {
  pending: { label: 'NOT PLAYED', tone: 'neutral' },
  ready: { label: 'READY', tone: 'pending' },
  live: { label: 'LIVE', tone: 'live' },
  awaiting_result: { label: 'AWAITING RESULT', tone: 'pending' },
  result_ready: { label: 'SUBMITTED', tone: 'pending' },
  published: { label: 'OFFICIAL', tone: 'winner' },
  completed: { label: 'OFFICIAL', tone: 'winner' },
};

const IN_FLIGHT: ReadonlyArray<RoundRow['status']> = [
  'live',
  'awaiting_result',
  'result_ready',
];

export interface PutBackDecision {
  /** Whether the control may be pressed. */
  allowed: boolean;
  /** Why not, when it may not be — shown on the disabled control. */
  reason: string;
}

/**
 * May this open round be put back?
 *
 * Pure, and exported, because it is the guard on the one control that exists
 * to rescue a stalled show: a mis-tapped START, with the correct round now
 * un-startable behind the one-round-at-a-time rule. Getting it wrong in either
 * direction is expensive — too strict and the show stays stalled, too loose
 * and a played round is silently thrown away — so it is pinned by tests rather
 * than left inline in the markup.
 *
 * `confirmedOnCurrent` is only meaningful for the snapshot's current round;
 * for any other round the snapshot cannot see the attempts, so this defers and
 * lets the server refuse — it counts the rail itself before it writes.
 */
export function putBackDecision(input: {
  canMutate: boolean;
  isCurrentRound: boolean;
  confirmedOnCurrent: number;
}): PutBackDecision {
  if (!input.canMutate) {
    return { allowed: false, reason: 'This device does not hold the controls.' };
  }
  if (input.isCurrentRound && input.confirmedOnCurrent > 0) {
    const n = input.confirmedOnCurrent;
    return {
      allowed: false,
      reason: `${n} attempt${n === 1 ? '' : 's'} recorded — undo them first, or submit and publish.`,
    };
  }
  return { allowed: true, reason: '' };
}

export function RoundStartRail() {
  const { snapshot, canMutate } = useController();
  const commands = useControllerCommands();

  const challenge = snapshot.currentChallenge;
  if (!challenge || challenge.mechanic === 'final_match') return null;

  const rounds = [...snapshot.rounds].sort((a, b) => a.number - b.number);
  if (rounds.length === 0) return null;

  // Attempts travel with the *current* round only, so a round can be put back
  // when the snapshot can actually prove it is empty. When it cannot, the
  // control still offers itself and the server has the final say — it refuses
  // a played round outright and says what is on it.
  const confirmedOnCurrent = snapshot.attempts.filter(
    (a) => a.status === 'confirmed',
  ).length;

  // The open round anywhere in the event — the server refuses a second one.
  const open = snapshot.allRounds.find((r) => IN_FLIGHT.includes(r.status)) ?? null;

  const blockedReason = !canMutate
    ? 'This device does not hold the controls.'
    : open
      ? `Round ${open.number} is still open — submit and publish it first.`
      : null;

  return (
    <Panel title={`ROUNDS · CHALLENGE ${String(challenge.number).padStart(2, '0')}`}>
      <div className="grid gap-3 sm:grid-cols-5">
        {rounds.map((round) => {
          const state = STATE[round.status];
          const done = round.status === 'published' || round.status === 'completed';
          const isOpen = IN_FLIGHT.includes(round.status);
          const startable = !done && !isOpen;
          const label = `R${round.number}`;

          return (
            <div
              key={round.id}
              className="border-border-subtle bg-surface-raised flex min-w-0 flex-col gap-2 rounded-lg border p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="u-display text-h3 text-ink">{label}</span>
                <StatusPill label={state.label} tone={state.tone} size="sm" pulse={isOpen} />
              </div>

              {done ? (
                <p className="u-label text-text-secondary text-[13px] tabular-nums">
                  {round.score_a} – {round.score_b}
                  {round.winner === 'draw' ? ' · DRAW' : ''}
                </p>
              ) : isOpen ? (
                <div className="flex flex-col gap-2">
                  <p className="u-label text-live text-[13px]">ON THE FLOOR NOW</p>
                  {(() => {
                    const decision = putBackDecision({
                      canMutate,
                      isCurrentRound: snapshot.currentRound?.id === round.id,
                      confirmedOnCurrent,
                    });
                    return (
                      <ControlButton
                        label="PUT BACK"
                        glyph="↩"
                        size="sm"
                        tone="quiet"
                        disabled={!decision.allowed}
                        disabledReason={decision.reason}
                        busy={false}
                        onPress={() =>
                          void commands.cancelRoundById(
                            round.id,
                            `round ${round.number} of challenge ${challenge.number}`,
                          )
                        }
                      />
                    );
                  })()}
                </div>
              ) : (
                <ControlButton
                  label={`START ${label}`}
                  glyph="▶"
                  size="sm"
                  tone="primary"
                  disabled={!startable || blockedReason !== null}
                  disabledReason={blockedReason ?? 'This round is finished.'}
                  busy={false}
                  onPress={() =>
                    void commands.startRoundById(
                      round.id,
                      `round ${round.number} of challenge ${challenge.number}`,
                    )
                  }
                />
              )}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

export default RoundStartRail;
