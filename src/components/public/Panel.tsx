import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface PanelProps {
  /** Small caps line above the panel title. */
  eyebrow?: ReactNode;
  /** Condensed display heading. */
  title?: ReactNode;
  /** Pinned to the right of the heading row — a pill, a link, a figure. */
  aside?: ReactNode;
  /** Sentence under the heading. */
  note?: ReactNode;
  children: ReactNode;
  /** Drop the raised card treatment and sit directly on the page field. */
  bare?: boolean;
  /** Remove the inner padding — for panels whose child manages its own edges. */
  flush?: boolean;
  className?: string;
  bodyClassName?: string;
  /** Accessible label when the panel has no visible title. */
  ariaLabel?: string;
}

/**
 * The one container the public pages are built from: a warm white card on the
 * cream field, with a condensed heading and an optional honesty note under it.
 *
 * Kept deliberately quiet — the design language puts the weight on
 * photography and numerals, so the chrome around them is a hairline and a
 * shadow, never a heavy border.
 */
export function Panel({
  eyebrow,
  title,
  aside,
  note,
  children,
  bare = false,
  flush = false,
  className,
  bodyClassName,
  ariaLabel,
}: PanelProps) {
  const hasHeading = Boolean(eyebrow || title || aside || note);

  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        'relative isolate flex min-w-0 flex-col overflow-hidden rounded-lg',
        bare ? 'bg-transparent' : 'bg-surface-raised shadow-card ring-1 ring-border-subtle',
        className,
      )}
    >
      {hasHeading ? (
        <header
          className={cn(
            'flex flex-wrap items-end justify-between gap-x-4 gap-y-2',
            flush || bare ? 'px-0 pb-3' : 'px-4 pt-4 pb-3 sm:px-5 sm:pt-5',
          )}
        >
          <div className="flex min-w-0 flex-col gap-1">
            {eyebrow ? (
              <span className="u-eyebrow text-aqua-700 text-eyebrow">{eyebrow}</span>
            ) : null}
            {title ? (
              <h2 className="u-display text-ink text-[1.5rem] leading-none sm:text-[1.75rem]">
                {title}
              </h2>
            ) : null}
            {note ? (
              <p className="u-label text-text-muted text-[0.625rem]">{note}</p>
            ) : null}
          </div>
          {aside ? <div className="flex shrink-0 items-center gap-2">{aside}</div> : null}
        </header>
      ) : null}

      <div
        className={cn(
          'min-w-0 flex-1',
          flush || bare ? '' : hasHeading ? 'px-4 pb-4 sm:px-5 sm:pb-5' : 'p-4 sm:p-5',
          bodyClassName,
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** A quiet line for "nothing here yet" states. Never an error, never a blank. */
export function EmptyNote({ children }: { children: ReactNode }) {
  return (
    <p className="u-label text-text-muted bg-surface-sunken rounded-md px-4 py-5 text-center text-[0.6875rem]">
      {children}
    </p>
  );
}

export default Panel;
