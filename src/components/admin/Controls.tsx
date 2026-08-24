'use client';

import { useId, type ReactNode, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';

import { cn } from '@/lib/cn';

/**
 * Form controls for the console.
 *
 * Deliberately plain: the operator is filling in a team sheet on a tablet in
 * bright sun, so every control is at least 40px tall, every label is a real
 * `<label>`, and validity is never signalled by colour alone — an invalid
 * field carries a written message underneath it.
 */

const CONTROL_BASE =
  'block w-full rounded-md bg-surface-raised px-3 text-[0.9375rem] text-ink ' +
  'ring-1 ring-border placeholder:text-text-muted ' +
  'disabled:cursor-not-allowed disabled:bg-mist disabled:text-text-muted';

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Rendered to the right of the label — a unit, a counter, a small action. */
  aside?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  hint,
  error,
  aside,
  htmlFor,
  children,
  className,
}: FieldProps) {
  return (
    <div className={cn('min-w-0 space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label
          htmlFor={htmlFor}
          className="u-label text-text-secondary text-eyebrow block"
        >
          {label}
        </label>
        {aside ? <span className="text-text-muted text-[0.75rem]">{aside}</span> : null}
      </div>
      {children}
      {error ? (
        <p className="text-live flex items-start gap-1.5 text-[0.75rem] leading-body">
          <span aria-hidden>▲</span>
          <span>{error}</span>
        </p>
      ) : hint ? (
        <p className="text-text-muted text-[0.75rem] leading-body">{hint}</p>
      ) : null}
    </div>
  );
}

export interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export function TextInput({ invalid, className, ...rest }: TextInputProps) {
  return (
    <input
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, 'h-11', invalid && 'ring-live ring-2', className)}
      {...rest}
    />
  );
}

export function TextArea({
  invalid,
  className,
  rows = 3,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return (
    <textarea
      rows={rows}
      aria-invalid={invalid || undefined}
      className={cn(CONTROL_BASE, 'py-2.5 leading-body', invalid && 'ring-live ring-2', className)}
      {...rest}
    />
  );
}

export function SelectInput({
  invalid,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select
      aria-invalid={invalid || undefined}
      className={cn(
        CONTROL_BASE,
        'h-11 appearance-none pr-8',
        // A chevron drawn with a gradient-free background image keeps the
        // control looking native on iPadOS without shipping an icon font.
        "bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 8%22><path fill=%22%234a4344%22 d=%22M1 1.5 6 6.5l5-5%22/></svg>')] bg-[length:12px_8px] bg-[position:right_0.75rem_center] bg-no-repeat",
        invalid && 'ring-live ring-2',
        className,
      )}
      {...rest}
    >
      {children}
    </select>
  );
}

export interface NumberInputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: number | null;
  onValueChange: (value: number | null) => void;
  /** Rendered inside the field on the right — `PTS`, `MS`, `S`. */
  suffix?: string;
  invalid?: boolean;
}

/**
 * A numeric field that keeps the operator's keystrokes.
 *
 * The raw string is not cached: an empty box reports `null` rather than 0, so
 * "no value" and "zero points" stay different things — which matters when zero
 * is a legitimate point value.
 */
export function NumberInput({
  value,
  onValueChange,
  suffix,
  invalid,
  className,
  ...rest
}: NumberInputProps) {
  return (
    <div className="relative">
      <input
        type="number"
        inputMode="decimal"
        value={value === null || Number.isNaN(value) ? '' : String(value)}
        onChange={(event) => {
          const raw = event.target.value;
          if (raw.trim() === '') {
            onValueChange(null);
            return;
          }
          const parsed = Number(raw);
          onValueChange(Number.isFinite(parsed) ? parsed : null);
        }}
        aria-invalid={invalid || undefined}
        className={cn(
          CONTROL_BASE,
          'u-tabular font-numeral h-11',
          suffix && 'pr-14',
          invalid && 'ring-live ring-2',
          className,
        )}
        {...rest}
      />
      {suffix ? (
        <span
          aria-hidden
          className="u-label text-text-muted text-eyebrow pointer-events-none absolute inset-y-0 right-3 flex items-center"
        >
          {suffix}
        </span>
      ) : null}
    </div>
  );
}

export interface ToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
  className?: string;
}

/**
 * A switch that also says what it is doing in words — `ON` / `OFF` — because
 * a knob position alone is state carried by shape and colour.
 */
export function Toggle({
  checked,
  onCheckedChange,
  label,
  description,
  disabled,
  className,
}: ToggleProps) {
  const id = useId();

  return (
    <div className={cn('flex items-start gap-3', className)}>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'relative mt-0.5 inline-flex h-6 w-11 shrink-0 items-center rounded-pill',
          'transition-colors duration-[var(--dur-instant)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          checked ? 'bg-aqua-700' : 'bg-slate',
        )}
      >
        <span
          aria-hidden
          className={cn(
            'block size-5 rounded-pill bg-white shadow-card transition-transform duration-[var(--dur-instant)]',
            checked ? 'translate-x-[1.375rem]' : 'translate-x-0.5',
          )}
        />
      </button>

      <div className="min-w-0 space-y-0.5">
        <label htmlFor={id} className="text-ink block text-[0.875rem] font-medium">
          {label}{' '}
          <span
            className={cn(
              'u-label text-eyebrow ml-1 align-middle',
              checked ? 'text-winner' : 'text-text-muted',
            )}
          >
            {checked ? 'ON' : 'OFF'}
          </span>
        </label>
        {description ? (
          <p className="text-text-muted text-[0.75rem] leading-body">{description}</p>
        ) : null}
      </div>
    </div>
  );
}

export interface ColorInputProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/** A colour picker paired with the hex value, so it can be typed or pasted. */
export function ColorInput({
  value,
  onValueChange,
  disabled,
  className,
  'aria-label': ariaLabel,
}: ColorInputProps) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <input
        type="color"
        value={safe}
        disabled={disabled}
        aria-label={ariaLabel ?? 'Colour picker'}
        onChange={(event) => onValueChange(event.target.value)}
        className="ring-border size-11 shrink-0 cursor-pointer rounded-md bg-transparent p-1 ring-1 disabled:cursor-not-allowed"
      />
      <input
        type="text"
        value={value}
        disabled={disabled}
        spellCheck={false}
        onChange={(event) => onValueChange(event.target.value)}
        className={cn(CONTROL_BASE, 'u-tabular font-numeral h-11 uppercase')}
      />
    </div>
  );
}

export interface RangeInputProps {
  value: number;
  onValueChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function RangeInput({
  value,
  onValueChange,
  min = 0,
  max = 1,
  step = 0.01,
  disabled,
  className,
  'aria-label': ariaLabel,
}: RangeInputProps) {
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => onValueChange(Number(event.target.value))}
      className={cn(
        'accent-aqua-700 h-11 w-full cursor-pointer disabled:cursor-not-allowed',
        className,
      )}
    />
  );
}

/** A segmented control — fewer taps than a select for three or four options. */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  disabled,
  className,
  ariaLabel,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: ReactNode; hint?: string }>;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(
        'bg-mist ring-border-subtle inline-flex flex-wrap gap-1 rounded-md p-1 ring-1',
        className,
      )}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            title={option.hint}
            disabled={disabled}
            onClick={() => onValueChange(option.value)}
            className={cn(
              'u-label rounded-sm px-3 py-2 text-eyebrow transition-colors duration-[var(--dur-instant)]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              active
                ? 'bg-surface-raised text-ink shadow-card'
                : 'text-text-secondary hover:text-ink',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
