'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { cn } from '@/lib/cn';
import { AdminButton } from '@/components/admin/Button';
import { Callout } from '@/components/admin/Callout';
import { Field, TextArea, TextInput } from '@/components/admin/Controls';

export interface ImpactRow {
  label: string;
  before: ReactNode;
  after: ReactNode;
  /** `up` / `down` also print an arrow, so the change is not colour-only. */
  direction?: 'up' | 'down' | 'flat';
}

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** What is about to happen, in one or two sentences. */
  description?: ReactNode;
  /** Before/after preview — required when correcting a published result. */
  impact?: ImpactRow[];
  /** Extra content between the description and the reason field. */
  children?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** When set, the operator must type this word exactly to enable Confirm. */
  confirmWord?: string | null;
  /** A written reason is mandatory by default — it lands in the audit log. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

/** The audit trail requires a reason of at least three characters. */
const MIN_REASON = 3;
const MAX_REASON = 500;

/**
 * The gate in front of every irreversible action.
 *
 * Reversing a published result, unlocking the scoring profile mid-show or
 * seizing the controls from another device all pass through here, and all of
 * them leave a typed reason in `audit_logs`. When the action changes points
 * that the room has already seen, `impact` shows the standings before and
 * after so the decision is made with the consequence in view.
 */
export function ConfirmDialog({ open, ...props }: ConfirmDialogProps) {
  // The body only exists while the dialog is open, so the reason and the
  // confirm word are cleared by unmounting rather than by an effect racing the
  // next render. A dialog can never inherit what was typed into the last one.
  return <AnimatePresence>{open ? <ConfirmDialogBody {...props} /> : null}</AnimatePresence>;
}

function ConfirmDialogBody({
  title,
  description,
  impact,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmWord = null,
  requireReason = true,
  reasonLabel = 'Reason for the record',
  reasonPlaceholder = 'What happened, and who decided it.',
  busy = false,
  error = null,
  onCancel,
  onConfirm,
}: Omit<ConfirmDialogProps, 'open'>) {
  const [reason, setReason] = useState('');
  const [word, setWord] = useState('');
  const reasonId = useId();
  const wordId = useId();
  const titleId = useId();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);

  const reasonOk = !requireReason || reason.trim().length >= MIN_REASON;
  const wordOk = !confirmWord || word.trim().toUpperCase() === confirmWord.toUpperCase();
  const canConfirm = reasonOk && wordOk && !busy;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.14 }}
    >
      <div
        aria-hidden
        onClick={() => (busy ? undefined : onCancel())}
        className="bg-surface-scrim absolute inset-0"
      />

      <motion.div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        initial={{ y: 24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 12, opacity: 0 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          'bg-surface-raised relative flex max-h-[92vh] w-full max-w-xl flex-col',
          'rounded-t-lg shadow-raised ring-1 ring-border-subtle sm:rounded-lg',
        )}
      >
        <header className="border-border-subtle space-y-2 border-b px-6 py-5">
          <p className="u-eyebrow text-live text-eyebrow">Confirm before continuing</p>
          <h2 id={titleId} className="text-ink text-[1.25rem] font-semibold">
            {title}
          </h2>
          {description ? (
            <div className="text-text-secondary text-[0.875rem] leading-body">
              {description}
            </div>
          ) : null}
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {impact && impact.length > 0 ? (
            <div className="space-y-2">
              <p className="u-label text-text-muted text-eyebrow">
                Impact on the standings
              </p>
              <div className="ring-border-subtle overflow-x-auto rounded-md ring-1">
                <table className="w-full min-w-[22rem] border-collapse text-left">
                  <thead>
                    <tr className="bg-mist">
                      <th className="u-label text-text-muted text-eyebrow px-3 py-2">
                        Player
                      </th>
                      <th className="u-label text-text-muted text-eyebrow px-3 py-2 text-right">
                        Now
                      </th>
                      <th className="u-label text-text-muted text-eyebrow px-3 py-2 text-right">
                        After
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {impact.map((row) => (
                      <tr
                        key={row.label}
                        className="border-border-subtle border-t align-middle"
                      >
                        <td className="text-ink px-3 py-2 text-[0.8125rem]">
                          {row.label}
                        </td>
                        <td className="u-tabular font-numeral text-text-secondary px-3 py-2 text-right text-[0.9375rem]">
                          {row.before}
                        </td>
                        <td
                          className={cn(
                            'u-tabular font-numeral px-3 py-2 text-right text-[0.9375rem]',
                            row.direction === 'down' && 'text-live',
                            row.direction === 'up' && 'text-winner',
                            (!row.direction || row.direction === 'flat') && 'text-ink',
                          )}
                        >
                          {row.direction === 'down' ? '↓ ' : null}
                          {row.direction === 'up' ? '↑ ' : null}
                          {row.after}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {children}

          {requireReason ? (
            <Field
              label={reasonLabel}
              htmlFor={reasonId}
              hint={`At least ${MIN_REASON} characters. This is written to the audit log with your name.`}
              aside={`${reason.trim().length}/${MAX_REASON}`}
            >
              <TextArea
                id={reasonId}
                autoFocus
                value={reason}
                maxLength={MAX_REASON}
                placeholder={reasonPlaceholder}
                onChange={(event) => setReason(event.target.value)}
                invalid={reason.length > 0 && !reasonOk}
              />
            </Field>
          ) : null}

          {confirmWord ? (
            <Field
              label={`Type ${confirmWord} to confirm`}
              htmlFor={wordId}
              hint="This action cannot be undone from the console."
            >
              <TextInput
                id={wordId}
                value={word}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                placeholder={confirmWord}
                onChange={(event) => setWord(event.target.value)}
                invalid={word.length > 0 && !wordOk}
              />
            </Field>
          ) : null}

          {error ? <Callout tone="danger">{error}</Callout> : null}
        </div>

        <footer className="border-border-subtle flex flex-wrap items-center justify-end gap-2 border-t px-6 py-4">
          <AdminButton variant="ghost" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </AdminButton>
          <AdminButton
            variant="danger"
            busy={busy}
            disabled={!canConfirm}
            onClick={() => onConfirm(reason.trim())}
          >
            {confirmLabel}
          </AdminButton>
        </footer>
      </motion.div>
    </motion.div>
  );
}

export default ConfirmDialog;
