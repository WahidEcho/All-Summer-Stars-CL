'use client';

/**
 * The controller's touch primitives.
 *
 * These are built for a tablet held at arm's length, outdoors, in August sun:
 * every target clears 64px on its shortest edge, labels are condensed display
 * caps, and no state is carried by colour alone — a disabled button says why,
 * a busy button says SENDING, and a selected button carries a check.
 */

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { readableOn } from '@/components/ui';

export type ControlTone =
  | 'primary'
  | 'neutral'
  | 'quiet'
  | 'positive'
  | 'negative'
  | 'danger'
  | 'team';

export type ControlSize = 'sm' | 'md' | 'lg' | 'xl';

const SIZE: Record<ControlSize, string> = {
  sm: 'min-h-16 px-4 py-3 text-[1rem] gap-1',
  md: 'min-h-20 px-5 py-4 text-[1.375rem] gap-1.5',
  lg: 'min-h-28 px-6 py-5 text-[2rem] gap-2',
  xl: 'min-h-40 px-6 py-6 text-[2.75rem] gap-2',
};

const HINT_SIZE: Record<ControlSize, string> = {
  sm: 'text-[0.6875rem]',
  md: 'text-[0.8125rem]',
  lg: 'text-[1rem]',
  xl: 'text-[1.25rem]',
};

const TONE: Record<ControlTone, string> = {
  primary:
    'bg-aqua-600 text-white border-aqua-700 shadow-card active:bg-aqua-700',
  neutral:
    'bg-surface-raised text-text-primary border-slate shadow-card active:bg-mist',
  quiet: 'bg-mist text-text-secondary border-border-subtle active:bg-haze',
  positive:
    'bg-winner text-white border-winner shadow-card active:brightness-95',
  negative:
    'bg-surface-raised text-text-primary border-slate shadow-card active:bg-haze',
  danger: 'bg-live text-white border-live shadow-card active:brightness-95',
  team: 'shadow-card border-transparent',
};

export interface ControlButtonProps {
  label: ReactNode;
  /** Second line — almost always the point value from the scoring profile. */
  hint?: ReactNode;
  /** Leading glyph, so meaning survives greyscale and bright sun. */
  glyph?: ReactNode;
  onPress: () => void;
  tone?: ControlTone;
  size?: ControlSize;
  disabled?: boolean;
  /** Why the button is unavailable. Rendered for sighted and assistive users. */
  disabledReason?: string;
  busy?: boolean;
  selected?: boolean;
  /** Paint with an explicit colour — team kits and long-range zones. */
  accent?: string;
  fullWidth?: boolean;
  className?: string;
}

export function ControlButton({
  label,
  hint,
  glyph,
  onPress,
  tone = 'neutral',
  size = 'md',
  disabled = false,
  disabledReason,
  busy = false,
  selected = false,
  accent,
  fullWidth = true,
  className,
}: ControlButtonProps) {
  const blocked = disabled || busy;
  const accentStyle =
    accent && !blocked
      ? { backgroundColor: accent, color: readableOn(accent), borderColor: accent }
      : undefined;

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={blocked}
      aria-busy={busy || undefined}
      aria-pressed={selected || undefined}
      title={disabled && disabledReason ? disabledReason : undefined}
      style={accentStyle}
      className={cn(
        'u-display relative flex touch-manipulation select-none flex-col items-center justify-center',
        'rounded-lg border-2 text-center transition-[transform,background-color,opacity]',
        'duration-[var(--dur-instant)] ease-[var(--ease-soft)]',
        'active:scale-[0.985] disabled:cursor-not-allowed',
        SIZE[size],
        accent && !blocked ? '' : TONE[tone],
        selected && !accent ? 'ring-4 ring-focus ring-offset-2 ring-offset-surface' : '',
        blocked ? 'opacity-45 shadow-none' : '',
        fullWidth ? 'w-full' : '',
        className,
      )}
    >
      {busy ? (
        <span className="flex items-center gap-2">
          <span className="u-label text-[0.75em] tracking-label">SENDING</span>
          <span aria-hidden className="flex items-end gap-1" data-motion="loop">
            <span className="h-1.5 w-1.5 animate-dot-load rounded-full bg-current" />
            <span
              className="h-1.5 w-1.5 animate-dot-load rounded-full bg-current"
              style={{ animationDelay: '150ms' }}
            />
            <span
              className="h-1.5 w-1.5 animate-dot-load rounded-full bg-current"
              style={{ animationDelay: '300ms' }}
            />
          </span>
        </span>
      ) : (
        <>
          <span className="flex items-center justify-center gap-2 leading-none">
            {glyph ? (
              <span aria-hidden className="text-[0.8em] opacity-80">
                {glyph}
              </span>
            ) : null}
            {selected ? (
              <span aria-hidden className="text-[0.7em]">
                ✓
              </span>
            ) : null}
            <span>{label}</span>
          </span>
          {hint ? (
            <span className={cn('u-label opacity-85', HINT_SIZE[size])}>{hint}</span>
          ) : null}
          {disabled && disabledReason ? (
            <span className="u-sr-only">{disabledReason}</span>
          ) : null}
        </>
      )}
    </button>
  );
}

/**
 * A destructive or irreversible control that arms on the first tap and fires
 * on the second. The armed state disarms itself after `armMs` so a stray tap
 * cannot sit there waiting to do damage.
 */
export function ConfirmControlButton({
  label,
  armedLabel = 'TAP AGAIN TO CONFIRM',
  hint,
  onConfirm,
  armMs = 4000,
  ...rest
}: Omit<ControlButtonProps, 'onPress' | 'label'> & {
  label: ReactNode;
  armedLabel?: ReactNode;
  onConfirm: () => void;
  armMs?: number;
}) {
  const [armed, setArmed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const press = useCallback(() => {
    if (armed) {
      if (timer.current) clearTimeout(timer.current);
      setArmed(false);
      onConfirm();
      return;
    }
    setArmed(true);
    timer.current = setTimeout(() => setArmed(false), armMs);
  }, [armed, armMs, onConfirm]);

  return (
    <ControlButton
      {...rest}
      label={armed ? armedLabel : label}
      hint={armed ? undefined : hint}
      glyph={armed ? '!' : rest.glyph}
      tone={armed ? 'danger' : rest.tone}
      onPress={press}
    />
  );
}

export interface SegmentedOption<T extends string> {
  id: T;
  label: ReactNode;
  hint?: ReactNode;
  accent?: string;
}

/** A big two-to-four-way choice — turn side, goal method, hit or miss. */
export function SegmentedChoice<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  disabled = false,
  columns,
  className,
}: {
  options: Array<SegmentedOption<T>>;
  value: T | null;
  onChange: (id: T) => void;
  label?: ReactNode;
  size?: ControlSize;
  disabled?: boolean;
  columns?: number;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {label ? <span className="u-label text-eyebrow text-text-muted">{label}</span> : null}
      <div
        role="group"
        aria-label={typeof label === 'string' ? label : undefined}
        className="grid gap-2"
        style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
      >
        {options.map((option) => (
          <ControlButton
            key={option.id}
            label={option.label}
            hint={option.hint}
            size={size}
            disabled={disabled}
            selected={value === option.id}
            tone={value === option.id ? 'primary' : 'neutral'}
            accent={value === option.id ? option.accent : undefined}
            onPress={() => onChange(option.id)}
          />
        ))}
      </div>
    </div>
  );
}

/** A titled block of the console. Keeps every surface visually identical. */
export function Panel({
  title,
  action,
  children,
  tone = 'raised',
  className,
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  tone?: 'raised' | 'sunken' | 'accent';
  className?: string;
}) {
  return (
    <section
      className={cn(
        'flex flex-col gap-4 rounded-xl border p-4 sm:p-5',
        tone === 'raised' ? 'border-border-subtle bg-surface-raised shadow-card' : '',
        tone === 'sunken' ? 'border-border-subtle bg-mist' : '',
        tone === 'accent' ? 'border-aqua-300 bg-aqua-50' : '',
        className,
      )}
    >
      {title || action ? (
        <header className="flex items-center justify-between gap-3">
          {title ? (
            <h2 className="u-label text-label text-text-secondary">{title}</h2>
          ) : (
            <span />
          )}
          {action}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export default ControlButton;
