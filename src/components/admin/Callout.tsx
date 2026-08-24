import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export type CalloutTone = 'info' | 'success' | 'warning' | 'danger';

const TONE: Record<CalloutTone, { skin: string; glyph: string; word: string }> = {
  info: { skin: 'bg-aqua-100 text-aqua-900 ring-aqua-300', glyph: 'i', word: 'Note' },
  success: {
    skin: 'bg-winner-soft text-winner ring-winner/30',
    glyph: '✓',
    word: 'Done',
  },
  warning: { skin: 'bg-draw-soft text-draw ring-draw/30', glyph: '!', word: 'Careful' },
  danger: { skin: 'bg-live-soft text-live ring-live/30', glyph: '▲', word: 'Problem' },
};

export interface CalloutProps {
  tone?: CalloutTone;
  title?: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

/**
 * The console's one message box.
 *
 * Every tone carries a glyph and a spoken word as well as its colour, so an
 * operator with a colour-vision difference reading a sunlit tablet still knows
 * whether something saved or failed.
 */
export function Callout({
  tone = 'info',
  title,
  children,
  actions,
  className,
}: CalloutProps) {
  const t = TONE[tone];

  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={cn(
        'flex flex-wrap items-start gap-3 rounded-md px-4 py-3 ring-1',
        t.skin,
        className,
      )}
    >
      <span
        aria-hidden
        data-state-glyph
        className="u-label mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-pill bg-white/70 text-[0.6875rem]"
      >
        {t.glyph}
      </span>
      <div className="min-w-0 flex-1 space-y-1">
        <span className="u-sr-only">{t.word}: </span>
        {title ? <p className="text-[0.875rem] font-semibold">{title}</p> : null}
        {children ? (
          <div className="text-[0.8125rem] leading-body break-words">{children}</div>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export default Callout;
