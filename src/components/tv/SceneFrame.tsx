'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { BroadcastHeader, SponsorTicker, StarField, type StarFieldVariant } from '@/components/brand';
import type { SponsorRow } from '@/lib/types';
import {
  CONTENT_PAD_Y,
  HEADER_H,
  HEADER_QR,
  SAFE,
  TICKER_H,
} from '@/components/tv/constants';

export interface SceneFrameProps {
  /** Small caps line above the header title, e.g. `CHALLENGE 02`. */
  eyebrow?: ReactNode;
  title?: ReactNode;
  detail?: ReactNode;
  /** A `<StatusPill>` beside the header's centre block. */
  status?: ReactNode;
  /** Permanent QR target. */
  qrUrl?: string | null;
  /** Sponsor rows from the snapshot. */
  sponsors?: ReadonlyArray<SponsorRow>;
  /** Background treatment. Pass `false` for a scene that paints its own. */
  starField?: StarFieldVariant | false;
  /** Drop the persistent header — only the ceremony's full-screen frames do. */
  header?: boolean;
  /** Drop the sponsor ticker. */
  ticker?: boolean;
  /** Painted above the content but below any overlay. */
  children: ReactNode;
  /** Painted above everything, edge to edge — goal takeovers, #1 reveals. */
  overlay?: ReactNode;
  className?: string;
  contentClassName?: string;
  /** Turn off the 72px horizontal safe-area inset for a full-bleed composition. */
  bleed?: boolean;
}

/**
 * The persistent broadcast furniture: header band on top (~11%), sponsor crawl
 * along the bottom (~8%), and the live content in the ~81% between them.
 *
 * The bands run edge to edge because they are furniture; their *content* is
 * inset to the 72px safe area, as is the live content region, so nothing that
 * carries meaning can be lost to an over-scanning panel.
 */
export function SceneFrame({
  eyebrow,
  title,
  detail,
  status,
  qrUrl,
  sponsors,
  starField = 'live',
  header = true,
  ticker = true,
  children,
  overlay,
  className,
  contentClassName,
  bleed = false,
}: SceneFrameProps) {
  return (
    <section
      data-scene-frame
      className={cn(
        'text-ink relative isolate flex h-full w-full flex-col overflow-hidden',
        className,
      )}
    >
      {starField ? <StarField variant={starField} className="z-0" /> : null}

      {header ? (
        <BroadcastHeader
          eyebrow={eyebrow}
          title={title}
          detail={detail}
          status={status}
          qrUrl={qrUrl ?? undefined}
          qrSize={HEADER_QR}
          height={HEADER_H}
          markWidth={300}
          className="px-[72px]"
        />
      ) : null}

      <div
        data-scene-content
        className={cn('relative z-10 min-h-0 flex-1', contentClassName)}
        style={{
          paddingLeft: bleed ? 0 : SAFE,
          paddingRight: bleed ? 0 : SAFE,
          paddingTop: header ? CONTENT_PAD_Y : SAFE,
          paddingBottom: ticker ? CONTENT_PAD_Y : SAFE,
        }}
      >
        {children}
      </div>

      {ticker ? (
        <SponsorTicker
          sponsors={sponsors}
          height={TICKER_H}
          logoHeight={50}
          gap={110}
          speed={32}
          className="relative z-10 shrink-0 bg-white/85"
        />
      ) : null}

      {overlay ? (
        <div data-scene-overlay className="absolute inset-0 z-30">
          {overlay}
        </div>
      ) : null}
    </section>
  );
}

export default SceneFrame;
