'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { AdminButton } from '@/components/admin/Button';
import type { ActionStatus } from '@/components/admin/useActionRunner';

export interface SaveBarProps {
  dirty: boolean;
  pending: boolean;
  status: ActionStatus | null;
  onSave: () => void;
  onReset?: () => void;
  saveLabel?: string;
  /** Disables saving with a written explanation — e.g. a locked profile. */
  blockedReason?: string | null;
  children?: ReactNode;
  className?: string;
}

/**
 * The sticky footer every setup screen ends in.
 *
 * It stays visible while the operator scrolls a long form, states in words
 * whether there are unsaved changes, and keeps the last save outcome on screen
 * rather than flashing a toast that a busy operator will miss.
 */
export function SaveBar({
  dirty,
  pending,
  status,
  onSave,
  onReset,
  saveLabel = 'Save changes',
  blockedReason = null,
  children,
  className,
}: SaveBarProps) {
  return (
    <div
      className={cn(
        'bg-surface-raised/95 border-border-subtle sticky bottom-0 z-20 -mx-4 mt-2 border-t',
        'flex flex-wrap items-center justify-between gap-3 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6',
        className,
      )}
    >
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
        <p
          className={cn(
            'u-label text-eyebrow',
            dirty ? 'text-draw' : 'text-text-muted',
          )}
        >
          {dirty ? '● Unsaved changes' : '○ No changes'}
        </p>

        {status ? (
          <p
            key={status.at}
            role="status"
            className={cn(
              'text-[0.8125rem]',
              status.tone === 'ok' ? 'text-winner' : 'text-live',
            )}
          >
            <span aria-hidden>{status.tone === 'ok' ? '✓ ' : '▲ '}</span>
            {status.message}
          </p>
        ) : null}

        {blockedReason ? (
          <p className="text-draw text-[0.8125rem]">
            <span aria-hidden>▲ </span>
            {blockedReason}
          </p>
        ) : null}

        {children}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {onReset ? (
          <AdminButton variant="ghost" onClick={onReset} disabled={!dirty || pending}>
            Discard
          </AdminButton>
        ) : null}
        <AdminButton
          variant="primary"
          size="lg"
          busy={pending}
          disabled={!dirty || Boolean(blockedReason)}
          onClick={onSave}
        >
          {saveLabel}
        </AdminButton>
      </div>
    </div>
  );
}

export default SaveBar;
