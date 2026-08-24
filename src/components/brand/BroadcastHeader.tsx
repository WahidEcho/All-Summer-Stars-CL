import type { CSSProperties, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { EventMark, type EventMarkVariant } from '@/components/brand/EventMark';
import { EventQr } from '@/components/brand/EventQr';
import { SponsorLogo, type SponsorLogoItem } from '@/components/brand/SponsorLogo';

export interface BroadcastHeaderProps {
  /** Small caps line above the title, e.g. `CHALLENGE 02`. */
  eyebrow?: ReactNode;
  /** The context itself, e.g. `DRIBBLE & FINISH`. */
  title?: ReactNode;
  /** Line under the title, e.g. `ROUND 3 OF 5`. */
  detail?: ReactNode;
  /** Replaces the eyebrow/title/detail stack entirely. */
  center?: ReactNode;
  /** A `<StatusPill>` (or anything) pinned beside the centre block. */
  status?: ReactNode;
  /** QR target. Omit to hide the right zone. */
  qrUrl?: string | null;
  qrLabel?: string;
  qrSize?: number;
  /**
   * Top-tier partner marks that sit beside the competition mark
   * (design_2.md: competition logo + Yalla Sahel + Tellr).
   */
  partners?: ReadonlyArray<SponsorLogoItem>;
  partnerHeight?: number;
  markVariant?: EventMarkVariant;
  /** Width of the competition mark. Default `clamp(150px, 15%, 340px)`. */
  markWidth?: string | number;
  /**
   * Band height. Defaults to 11.111% — the ~11% top zone of a 16:9 stage.
   * Pass a px value when the header is not inside a fixed-aspect canvas.
   */
  height?: string | number;
  /** Hairline rule along the bottom. Default true. */
  rule?: boolean;
  className?: string;
  style?: CSSProperties;
}

/**
 * The persistent broadcast header: competition mark left, current context
 * centre, permanent QR right.
 *
 * Occupies the top ~11% of a 1080p canvas, as specified in design.md. The
 * centre block is absolutely centred so the context stays optically centred
 * no matter how wide the mark or the QR grows.
 */
export function BroadcastHeader({
  eyebrow,
  title,
  detail,
  center,
  status,
  qrUrl,
  qrLabel = 'SCAN FOR LIVE SCORES',
  qrSize = 84,
  partners,
  partnerHeight = 34,
  markVariant = 'light',
  markWidth = 'clamp(150px, 15%, 340px)',
  height = '11.111%',
  rule = true,
  className,
  style,
}: BroadcastHeaderProps) {
  return (
    <header
      data-broadcast-header
      className={cn(
        'relative z-20 flex w-full shrink-0 items-center justify-between gap-6',
        'px-[2.2%]',
        rule && 'border-b border-border-subtle/80',
        className,
      )}
      style={{ height, ...style }}
    >
      {/* Left — event identity, then the top-tier partners. */}
      <div className="flex min-w-0 shrink-0 items-center gap-6">
        <EventMark variant={markVariant} width={markWidth} priority title="" />
        <span className="u-sr-only">SwanLake Football Stars — Shores &amp; Scores Challenge</span>

        {partners && partners.length > 0 ? (
          <>
            <span aria-hidden className="bg-border-subtle h-[46%] w-px shrink-0" />
            <div className="flex items-center gap-5">
              {partners.map((p, i) => (
                <SponsorLogo key={p.id ?? `${p.name}-${i}`} sponsor={p} height={partnerHeight} />
              ))}
            </div>
          </>
        ) : null}
      </div>

      {/* Centre — the current context, optically centred in the band. */}
      <div className="pointer-events-none absolute left-1/2 flex max-w-[46%] -translate-x-1/2 flex-col items-center gap-1 text-center">
        {center ?? (
          <>
            {eyebrow ? (
              <span className="u-eyebrow text-aqua-700 text-eyebrow">{eyebrow}</span>
            ) : null}
            {title ? (
              <span className="u-display text-ink text-h3 leading-none">{title}</span>
            ) : null}
            {detail ? (
              <span className="u-label text-text-muted text-eyebrow">{detail}</span>
            ) : null}
          </>
        )}
        {status ? <div className="pointer-events-auto mt-1">{status}</div> : null}
      </div>

      {/* Right — permanent QR. */}
      {qrUrl ? (
        <div className="flex shrink-0 items-center justify-end">
          <EventQr
            url={qrUrl}
            label={qrLabel}
            size={qrSize}
            tone="plate"
            labelPlacement="right"
          />
        </div>
      ) : (
        <span aria-hidden className="shrink-0" style={{ width: qrSize }} />
      )}
    </header>
  );
}

export default BroadcastHeader;
