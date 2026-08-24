import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

/**
 * Admin chrome: panels, page headers, quiet data rows.
 *
 * These are plain server components — no hooks — so a server page can lay a
 * screen out before any client island hydrates.
 */

export interface PanelProps {
  title?: ReactNode;
  /** Small all-caps line above the title. */
  eyebrow?: ReactNode;
  description?: ReactNode;
  /** Buttons or pills pinned to the right of the header. */
  actions?: ReactNode;
  /** Removes the body padding — for tables that run edge to edge. */
  flush?: boolean;
  tone?: 'default' | 'accent' | 'danger';
  children?: ReactNode;
  className?: string;
  bodyClassName?: string;
  id?: string;
}

const PANEL_TONE = {
  default: 'ring-border-subtle',
  accent: 'ring-aqua-300',
  danger: 'ring-live/30',
} as const;

export function Panel({
  title,
  eyebrow,
  description,
  actions,
  flush = false,
  tone = 'default',
  children,
  className,
  bodyClassName,
  id,
}: PanelProps) {
  const hasHeader = Boolean(title || eyebrow || description || actions);

  return (
    <section
      id={id}
      className={cn(
        'bg-surface-raised rounded-lg shadow-card ring-1',
        PANEL_TONE[tone],
        className,
      )}
    >
      {hasHeader ? (
        <header
          className={cn(
            'flex flex-wrap items-start justify-between gap-4 px-5 py-4',
            children ? 'border-border-subtle border-b' : null,
          )}
        >
          <div className="min-w-0 space-y-1">
            {eyebrow ? (
              <p className="u-eyebrow text-text-muted text-eyebrow">{eyebrow}</p>
            ) : null}
            {title ? (
              <h2 className="text-ink text-[1.0625rem] font-semibold tracking-[-0.01em]">
                {title}
              </h2>
            ) : null}
            {description ? (
              <p className="text-text-secondary max-w-prose text-[0.8125rem] leading-body">
                {description}
              </p>
            ) : null}
          </div>
          {actions ? (
            <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
          ) : null}
        </header>
      ) : null}

      {children ? (
        <div className={cn(flush ? '' : 'px-5 py-5', bodyClassName)}>{children}</div>
      ) : null}
    </section>
  );
}

export interface PageHeaderProps {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('flex flex-wrap items-end justify-between gap-4', className)}>
      <div className="min-w-0 space-y-2">
        {eyebrow ? (
          <p className="u-eyebrow text-aqua-700 text-eyebrow">{eyebrow}</p>
        ) : null}
        <h1 className="u-display text-ink text-[2rem] leading-tight">{title}</h1>
        {description ? (
          <p className="text-text-secondary max-w-2xl text-[0.875rem] leading-body">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </header>
  );
}

/** A labelled value, used all over the dashboard and the audit detail rows. */
export function KeyValue({
  label,
  value,
  mono = false,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  /** Tabular figures — ids, revisions, clocks. */
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0 space-y-1', className)}>
      <dt className="u-label text-text-muted text-eyebrow">{label}</dt>
      <dd
        className={cn(
          'text-ink truncate text-[0.9375rem]',
          mono && 'u-tabular font-numeral',
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function SectionHeading({
  children,
  hint,
  className,
}: {
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-3', className)}>
      <h3 className="u-label text-ink text-label">{children}</h3>
      {hint ? <p className="text-text-muted text-[0.75rem]">{hint}</p> : null}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'border-border-subtle flex flex-col items-center gap-2 rounded-md border border-dashed px-6 py-10 text-center',
        className,
      )}
    >
      <p className="u-label text-ink text-label">{title}</p>
      {description ? (
        <p className="text-text-muted max-w-md text-[0.8125rem] leading-body">
          {description}
        </p>
      ) : null}
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/** A two-column responsive grid for form fields. */
export function FieldGrid({
  children,
  columns = 2,
  className,
}: {
  children: ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'grid gap-x-5 gap-y-4',
        columns === 1 && 'grid-cols-1',
        columns === 2 && 'grid-cols-1 sm:grid-cols-2',
        columns === 3 && 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  );
}
