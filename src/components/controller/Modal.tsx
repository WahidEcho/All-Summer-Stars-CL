'use client';

/**
 * A full-bleed sheet for the decisions that deserve one: attributing a goal,
 * seizing the controls, reconciling a stale device.
 *
 * Deliberately not a small centred dialog — on a tablet under time pressure
 * the sheet takes the whole screen so the operator cannot mis-hit the thing
 * behind it.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export interface ModalProps {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  /** Buttons pinned to the bottom of the sheet. */
  footer?: ReactNode;
  children: ReactNode;
  /** Colour for the title rule — the team the sheet is about. */
  accent?: string;
  className?: string;
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  footer,
  children,
  accent,
  className,
}: ModalProps) {
  const panel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    // Move focus into the sheet so the keyboard and screen reader follow it.
    panel.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[color-mix(in_oklab,var(--color-navy)_55%,transparent)] p-0 sm:items-center sm:p-6"
      role="presentation"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === 'string' ? title : undefined}
        className={cn(
          'flex max-h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-surface',
          'shadow-hero outline-none sm:rounded-2xl',
          className,
        )}
      >
        <header
          className="flex items-start justify-between gap-4 border-b-4 bg-surface-raised px-5 py-4"
          style={{ borderColor: accent ?? 'var(--color-aqua-400)' }}
        >
          <div className="flex flex-col gap-1">
            <h2 className="u-display text-h3 text-text-primary">{title}</h2>
            {subtitle ? (
              <p className="u-label text-eyebrow text-text-muted">{subtitle}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="u-label min-h-14 min-w-14 rounded-lg border-2 border-slate bg-surface-raised px-4 text-label text-text-secondary"
          >
            CLOSE
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>

        {footer ? (
          <footer className="border-t border-border-subtle bg-surface-raised px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}

export default Modal;
