'use client';

/**
 * The bottom rail: what just happened, how to take it back, and the one
 * deliberate act that turns a working score into an official one.
 *
 * The rail is pinned to the bottom of the tablet because those three things are
 * needed at every point of every challenge, and hunting for them costs time the
 * operator does not have.
 *
 * Three behaviours here are non-negotiable:
 *
 *   • **Nothing auto-submits.** A finished clock or a full set of attempts moves
 *     the round to "awaiting official score" and stops. The result is submitted
 *     by a person, twice — arm, then confirm.
 *   • **Undo appends.** Every reversal is a new row that cancels an old one, so
 *     the ledger stays an account of what happened rather than a picture of what
 *     someone last believed.
 *   • **A conflict is a conversation.** When the server refuses a command because
 *     this tablet is behind, the operator gets the two revisions and a choice —
 *     reload and look, or send the same command again against fresh data. The
 *     device never silently overwrites the event it cannot see.
 */

import { useEffect, useMemo, useState } from 'react';
import { StatusPill } from '@/components/ui';
import { cn } from '@/lib/cn';
import {
  ConfirmControlButton,
  ControlButton,
  Modal,
  buildTimeline,
  relativeTime,
  undoTargetOf,
  useController,
  useControllerCommands,
  type TimelineEntry,
} from '@/components/controller';

const KIND_TONE: Record<TimelineEntry['kind'], string> = {
  attempt: 'border-l-aqua-500',
  goal: 'border-l-winner',
  penalty: 'border-l-draw',
  note: 'border-l-slate',
};

export interface ControllerRailProps {
  deviceLabel: string;
  onRenameDevice: (label: string) => void;
  /** The snapshot hook's last read error, if any. Distinct from a command failure. */
  error: string | null;
}

export function ControllerRail({ deviceLabel, onRenameDevice, error }: ControllerRailProps) {
  const { snapshot, config, canMutate, runner, refresh, stale } = useController();
  const commands = useControllerCommands();

  const [now, setNow] = useState(() => Date.now());
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState('Corrected after a review courtside');
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState(deviceLabel);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(id);
  }, []);

  const timeline = useMemo(
    () => buildTimeline(snapshot, config, runner.journal, 14),
    [snapshot, config, runner.journal],
  );
  const undoTarget = undoTargetOf(timeline);

  const round = snapshot.currentRound;
  const match = snapshot.match;
  const isFinalMatch = snapshot.currentChallenge?.mechanic === 'final_match';

  const roundSettled = round?.status === 'published' || round?.status === 'completed';
  const canSubmitRound = Boolean(round) && !roundSettled;
  const canPublishRound = round?.status === 'result_ready';

  const matchStatus = match?.status ?? 'pending';
  const canEndMatch =
    isFinalMatch &&
    match !== null &&
    matchStatus !== 'completed' &&
    matchStatus !== 'pending' &&
    matchStatus !== 'ready';

  const conflict = runner.conflict;
  const failure = runner.failure;

  return (
    <footer className="sticky bottom-0 z-20 border-t-2 border-slate bg-surface-raised/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-3 px-4 py-3 sm:px-6">
        {/* --- a command the server refused because we are behind --------- */}
        {conflict ? (
          <section className="flex flex-col gap-3 rounded-lg border-2 border-live bg-live-soft p-4">
            <div className="flex flex-wrap items-center gap-3">
              <StatusPill
                label="THIS DEVICE IS BEHIND THE EVENT"
                tone="live"
                variant="solid"
                size="lg"
                glyph="⚠"
              />
              <span className="u-label text-eyebrow text-text-secondary">
                {conflict.label.toUpperCase()} WAS NOT APPLIED
              </span>
            </div>
            <p className="text-body text-text-secondary">
              {conflict.message} Something else — another device, or an admin screen — changed the
              event after this tablet last read it
              {typeof conflict.details?.expected === 'number' &&
              typeof conflict.details?.current === 'number'
                ? ` (this device was on revision ${conflict.details.expected}; the event is on ${conflict.details.current})`
                : ''}
              . Nothing has been overwritten. Reload and look before deciding.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <ControlButton
                label="RELOAD THE EVENT"
                glyph="↻"
                size="md"
                tone="primary"
                onPress={() => {
                  void refresh();
                  runner.dismissFailure();
                }}
              />
              <ControlButton
                label="SEND IT AGAIN"
                hint="AGAINST THE LATEST DATA"
                glyph="→"
                size="md"
                tone="neutral"
                busy={runner.busy}
                disabled={!canMutate}
                disabledReason="This device does not hold the controls."
                onPress={() => {
                  void refresh().then(() => runner.retry());
                }}
              />
              <ControlButton
                label="DISCARD IT"
                glyph="×"
                size="md"
                tone="quiet"
                onPress={runner.dismissFailure}
              />
            </div>
          </section>
        ) : failure ? (
          <section className="flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-draw bg-draw-soft p-3">
            <div className="flex flex-col gap-1">
              <span className="u-label text-eyebrow text-text-primary">
                {failure.label.toUpperCase()} DID NOT GO THROUGH
              </span>
              <span className="text-body text-text-secondary">{failure.message}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <ControlButton
                label="RETRY"
                glyph="↻"
                size="sm"
                tone="primary"
                fullWidth={false}
                className="min-w-36"
                busy={runner.busy}
                onPress={() => void runner.retry()}
              />
              <ControlButton
                label="DISMISS"
                size="sm"
                tone="quiet"
                fullWidth={false}
                className="min-w-36"
                onPress={runner.dismissFailure}
              />
            </div>
          </section>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]">
          {/* --- what just happened -------------------------------------- */}
          <section className="flex min-w-0 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="u-label text-label text-text-secondary">RECENT ACTIONS</h2>
              <div className="flex items-center gap-2">
                {stale ? (
                  <StatusPill label="LAST GOOD DATA" tone="draw" variant="soft" size="sm" />
                ) : null}
                <button
                  type="button"
                  onClick={() => setRenameOpen(true)}
                  className="u-label text-eyebrow text-aqua-700 underline underline-offset-4"
                >
                  {deviceLabel.toUpperCase()}
                </button>
              </div>
            </div>

            <ol className="flex max-h-44 flex-col gap-1.5 overflow-y-auto pr-1">
              {timeline.length === 0 ? (
                <li className="u-label text-eyebrow text-text-muted">
                  NOTHING RECORDED IN THIS CHALLENGE YET
                </li>
              ) : (
                timeline.map((entry) => (
                  <li
                    key={entry.id}
                    className={cn(
                      'flex items-baseline justify-between gap-3 border-l-4 bg-mist px-3 py-2',
                      KIND_TONE[entry.kind],
                      entry.reversed || entry.isReversal ? 'opacity-65' : '',
                    )}
                  >
                    <span
                      className={cn(
                        'u-display min-w-0 flex-1 truncate text-[1rem] leading-none text-text-primary',
                        entry.reversed ? 'line-through' : '',
                      )}
                    >
                      {entry.headline}
                      {entry.isReversal ? ' · REVERSAL' : ''}
                    </span>
                    <span className="u-numeral u-tabular shrink-0 text-eyebrow text-text-secondary">
                      {entry.detail}
                    </span>
                    <span className="u-label shrink-0 text-[0.5625rem] text-text-muted">
                      {relativeTime(entry.at, now).toUpperCase()}
                    </span>
                  </li>
                ))
              )}
            </ol>

            {error ? (
              <p className="u-label text-eyebrow text-live">{error.toUpperCase()}</p>
            ) : null}
          </section>

          {/* --- take it back, or make it official ----------------------- */}
          <section className="flex flex-col gap-3">
            <ConfirmControlButton
              label="UNDO LAST ACTION"
              armedLabel="TAP AGAIN TO UNDO"
              hint={
                undoTarget
                  ? undoTarget.description.toUpperCase()
                  : 'NOTHING TO UNDO'
              }
              glyph="↺"
              size="lg"
              tone="negative"
              disabled={!canMutate || undoTarget === null}
              disabledReason={
                undoTarget === null
                  ? 'There is nothing left to undo in this challenge.'
                  : 'This device does not hold the controls.'
              }
              busy={runner.busy}
              onConfirm={() => {
                if (undoTarget) void commands.reverse(undoTarget);
              }}
            />

            {isFinalMatch ? (
              <ConfirmControlButton
                label="SUBMIT OFFICIAL RESULT"
                armedLabel="TAP AGAIN TO SUBMIT"
                hint="ENDS THE MATCH AND BANKS THE POINTS"
                glyph="✓"
                size="lg"
                tone="primary"
                disabled={!canMutate || !canEndMatch}
                disabledReason={
                  !canEndMatch
                    ? matchStatus === 'completed'
                      ? 'The match result is already official.'
                      : 'Kick off first — a match that has not started has no result.'
                    : 'This device does not hold the controls.'
                }
                busy={runner.busyId?.startsWith(`match:end:${match?.id ?? ''}`) ?? false}
                onConfirm={() => void commands.endMatch()}
              />
            ) : (
              <>
                <ConfirmControlButton
                  label="SUBMIT OFFICIAL RESULT"
                  armedLabel="TAP AGAIN TO SUBMIT"
                  hint={
                    round
                      ? `ROUND ${round.number} · ${round.score_a}–${round.score_b}`
                      : 'NO ROUND SELECTED'
                  }
                  glyph="✓"
                  size="lg"
                  tone="primary"
                  disabled={!canMutate || !canSubmitRound}
                  disabledReason={
                    !round
                      ? 'Pick a round before submitting a result.'
                      : roundSettled
                        ? 'This round is already official. Reopen it to change anything.'
                        : 'This device does not hold the controls.'
                  }
                  busy={runner.busyId?.startsWith(`round:submit:${round?.id ?? ''}`) ?? false}
                  onConfirm={() => void commands.submitRoundResult()}
                />

                {canPublishRound ? (
                  <ConfirmControlButton
                    label="PUBLISH TO THE LEADERBOARD"
                    armedLabel="TAP AGAIN TO PUBLISH"
                    hint="THE POINTS GO ON THE BOARD"
                    glyph="▲"
                    size="lg"
                    tone="positive"
                    disabled={!canMutate}
                    disabledReason="This device does not hold the controls."
                    busy={runner.busyId?.startsWith(`round:publish:${round?.id ?? ''}`) ?? false}
                    onConfirm={() => void commands.publishRound()}
                  />
                ) : null}

                {roundSettled ? (
                  <ControlButton
                    label="REOPEN THIS ROUND"
                    hint="REVERSES THE PUBLISHED ENTRIES"
                    glyph="↺"
                    size="md"
                    tone="quiet"
                    disabled={!canMutate}
                    disabledReason="This device does not hold the controls."
                    onPress={() => setReopenOpen(true)}
                  />
                ) : null}
              </>
            )}
          </section>
        </div>
      </div>

      {/* --- reopening is audited, so it costs a sentence ----------------- */}
      <Modal
        open={reopenOpen}
        title="REOPEN THE ROUND"
        subtitle={round ? `ROUND ${round.number} · ${round.score_a}–${round.score_b}` : undefined}
        accent="var(--color-draw)"
        onClose={() => setReopenOpen(false)}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <ControlButton label="CANCEL" tone="neutral" onPress={() => setReopenOpen(false)} />
            <ControlButton
              label="REOPEN IT"
              glyph="↺"
              tone="danger"
              busy={runner.busy}
              disabled={reopenReason.trim().length < 3}
              disabledReason="Type a reason before reopening."
              onPress={() => {
                void commands.reopenRound(reopenReason.trim()).then(() => setReopenOpen(false));
              }}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-lede text-text-secondary">
            Reopening reverses the ledger entries this round published — the players lose exactly the
            points it gave them, and nothing is deleted. The reason is recorded in the audit log.
          </p>
          <label className="flex flex-col gap-2">
            <span className="u-label text-eyebrow text-text-muted">REASON (REQUIRED)</span>
            <input
              value={reopenReason}
              onChange={(event) => setReopenReason(event.target.value)}
              maxLength={200}
              className="min-h-16 rounded-lg border-2 border-slate bg-surface-raised px-4 text-lede text-text-primary"
            />
          </label>
        </div>
      </Modal>

      {/* --- naming the tablet, so a takeover dialog can name it too ------ */}
      <Modal
        open={renameOpen}
        title="NAME THIS DEVICE"
        subtitle="SHOWN TO EVERY OTHER TABLET ON THE EVENT"
        onClose={() => setRenameOpen(false)}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <ControlButton label="CANCEL" tone="neutral" onPress={() => setRenameOpen(false)} />
            <ControlButton
              label="SAVE THE NAME"
              tone="primary"
              disabled={renameValue.trim().length < 2}
              disabledReason="Give the device a name of at least two characters."
              onPress={() => {
                onRenameDevice(renameValue.trim());
                setRenameOpen(false);
              }}
            />
          </div>
        }
      >
        <label className="flex flex-col gap-2">
          <span className="u-label text-eyebrow text-text-muted">DEVICE NAME</span>
          <input
            value={renameValue}
            onChange={(event) => setRenameValue(event.target.value)}
            maxLength={60}
            placeholder="Courtside tablet"
            className="min-h-16 rounded-lg border-2 border-slate bg-surface-raised px-4 text-lede text-text-primary"
          />
        </label>
      </Modal>
    </footer>
  );
}

export default ControllerRail;
