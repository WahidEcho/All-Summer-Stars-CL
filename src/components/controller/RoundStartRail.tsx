'use client';

/**
 * The five rounds of the current challenge as one explicit control strip.
 *
 * One button per round, pressed by the operator — never by the system. The
 * server enforces one round at a time, and this rail says so before the tap:
 * while any round is open, every other START is disabled with the reason, so
 * the show can only ever move round by round, in order, on a press.
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

export function RoundStartRail() {
  const { snapshot, canMutate } = useController();
  const commands = useControllerCommands();

  const challenge = snapshot.currentChallenge;
  if (!challenge || challenge.mechanic === 'final_match') return null;

  const rounds = [...snapshot.rounds].sort((a, b) => a.number - b.number);
  if (rounds.length === 0) return null;

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
                <p className="u-label text-live text-[13px]">ON THE FLOOR NOW</p>
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
