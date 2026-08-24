'use client';

import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type AdminButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'take';
export type AdminButtonSize = 'sm' | 'md' | 'lg' | 'xl';

export interface AdminButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: AdminButtonVariant;
  size?: AdminButtonSize;
  /** Shows a spinner glyph and disables the control. */
  busy?: boolean;
  /** Leading glyph — text or an inline SVG. */
  icon?: ReactNode;
  fullWidth?: boolean;
}

const VARIANT: Record<AdminButtonVariant, string> = {
  // aqua-700 on white clears AA (5.2:1); aqua-400 is a background tint only.
  primary: 'bg-aqua-700 text-white hover:bg-aqua-800 disabled:hover:bg-aqua-700',
  secondary:
    'bg-surface-raised text-ink ring-1 ring-border hover:bg-mist disabled:hover:bg-surface-raised',
  ghost: 'bg-transparent text-ink-soft hover:bg-mist disabled:hover:bg-transparent',
  danger: 'bg-live text-white hover:opacity-90',
  take: 'bg-live text-white hover:opacity-90 shadow-card',
};

const SIZE: Record<AdminButtonSize, string> = {
  sm: 'h-8 gap-1.5 px-3 text-[0.75rem]',
  md: 'h-10 gap-2 px-4 text-[0.8125rem]',
  lg: 'h-12 gap-2.5 px-6 text-label',
  xl: 'h-16 gap-3 px-8 text-[1.0625rem]',
};

/**
 * The one button in the console.
 *
 * Everything destructive routes through `variant="danger"` and, in practice,
 * through `<ConfirmDialog>` as well — a mis-tap on a tablet at the pitch side
 * must never be able to reverse a published result on its own.
 */
export function AdminButton({
  variant = 'secondary',
  size = 'md',
  busy = false,
  icon,
  fullWidth = false,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}: AdminButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={cn(
        'u-label inline-flex shrink-0 items-center justify-center rounded-md',
        'transition-[background-color,opacity,box-shadow] duration-[var(--dur-instant)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        SIZE[size],
        VARIANT[variant],
        fullWidth && 'w-full',
        className,
      )}
      {...rest}
    >
      {busy ? (
        <span
          aria-hidden
          data-motion="loop"
          className="inline-block animate-live-pulse leading-none"
        >
          ●
        </span>
      ) : icon ? (
        <span aria-hidden className="inline-flex shrink-0 items-center leading-none">
          {icon}
        </span>
      ) : null}
      <span className="truncate">{children}</span>
    </button>
  );
}

/** A horizontal row of buttons that wraps politely on a tablet. */
export function ButtonRow({
  children,
  className,
  align = 'start',
}: {
  children: ReactNode;
  className?: string;
  align?: 'start' | 'end' | 'between';
}) {
  return (
    <div
      className={cn(
        'flex flex-wrap items-center gap-2',
        align === 'end' && 'justify-end',
        align === 'between' && 'justify-between',
        className,
      )}
    >
      {children}
    </div>
  );
}

export default AdminButton;
