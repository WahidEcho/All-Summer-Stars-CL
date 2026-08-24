'use client';

import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { BroadcastHeader, SponsorTicker, StarField, type StarFieldVariant } from '@/components/brand';
import type { SponsorRow } from '@/lib/types';
import {
  contentHeight,
  CONTENT_PAD_Y,
  HEADER_H,
  HEADER_MARK_H,
  HEADER_QR,
  SAFE,
  STAGE_H,
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
 *
 * ## Why the three rows are pinned rather than flexed
 *
 * The canvas is a real vertical stack — `HEADER_H` / `contentHeight()` /
 * `TICKER_H`, summing to exactly 1080 — with every row given its height
 * outright and the content row clipping its own overflow.
 *
 * A flexed `flex-1` content row looks equivalent and is not. A flex item's
 * height only becomes *definite* for its own descendants once nothing inside
 * pushes back, and a real player photograph pushes back hard: an `<img>` with
 * `h-full` inside an auto-sized grid row falls back to its intrinsic aspect,
 * so a 1114×1412 portrait in a 693px-wide column asks for 878px of height and
 * an auto row grants it. That is precisely what put the live round's players
 * 1300px tall inside an 826px box on the LED wall, with their names and their
 * chins hidden behind the sponsor strip. A row with a stated height cannot be
 * argued with, and `overflow-hidden` on it means the worst any future scene can
 * do is crop itself — never paint over the sponsors.
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
  const contentH = contentHeight(header, ticker);

  return (
    <section
      data-scene-frame
      className={cn(
        'text-ink relative isolate flex w-full flex-col overflow-hidden',
        className,
      )}
      style={{ height: STAGE_H }}
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
          markHeight={HEADER_MARK_H}
          className="px-[72px]"
        />
      ) : null}

      <div
        data-scene-content
        className={cn('relative z-10 shrink-0 grow-0 overflow-hidden', contentClassName)}
        style={{
          height: contentH,
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
