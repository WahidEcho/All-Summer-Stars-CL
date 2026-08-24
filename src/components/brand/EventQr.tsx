'use client';

import { useEffect, useState } from 'react';
import { toString as qrToString } from 'qrcode';

import { cn } from '@/lib/cn';

export type EventQrTone = 'plate' | 'bare' | 'ink';
export type EventQrLabelPlacement = 'below' | 'above' | 'right' | 'none';

export interface EventQrProps {
  /** Absolute URL the code points at — normally the event's public dashboard. */
  url: string;
  /** Short call to action. Keep it to three or four words on TV. */
  label?: string;
  /** Edge length of the code itself, in px. The quiet zone is added around it. */
  size?: number;
  /** `plate` puts the code on a white card; `bare` assumes a white parent. */
  tone?: EventQrTone;
  labelPlacement?: EventQrLabelPlacement;
  /** Print the URL under the label. Useful on print collateral, not on TV. */
  showUrl?: boolean;
  /** Higher levels survive a dirtier LED panel at the cost of density. */
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  className?: string;
}

/**
 * The permanent `SCAN FOR LIVE SCORES` code.
 *
 * Rendered as a vector QR so it stays razor sharp at any size on the LED wall,
 * inside a high-contrast white quiet zone (pure #FFFFFF behind pure #231F20).
 * The modules are never animated, never tinted and never given a logo overlay
 * — a code that fails to scan is worse than no code at all.
 */
export function EventQr({
  url,
  label = 'SCAN FOR LIVE SCORES',
  size = 148,
  tone = 'plate',
  labelPlacement = 'below',
  showUrl = false,
  errorCorrection = 'Q',
  className,
}: EventQrProps) {
  // The rendered code is stored together with the address it encodes, so a new
  // URL shows the placeholder again by derivation. A QR that still displays the
  // previous address for a frame is worse than one that is briefly absent.
  const [rendered, setRendered] = useState<{ key: string; markup: string | null } | null>(
    null,
  );
  const key = `${errorCorrection}|${url}`;

  useEffect(() => {
    let live = true;

    qrToString(url, {
      type: 'svg',
      errorCorrectionLevel: errorCorrection,
      // Two modules here plus the plate's own padding gives the four-module
      // quiet zone the spec asks for.
      margin: 2,
      color: { dark: '#231F20', light: '#FFFFFF' },
    })
      .then((markup) => {
        if (live) setRendered({ key, markup });
      })
      .catch(() => {
        if (live) setRendered({ key, markup: null });
      });

    return () => {
      live = false;
    };
  }, [url, errorCorrection, key]);

  const current = rendered && rendered.key === key ? rendered : null;
  const svg = current?.markup ?? null;
  const failed = current !== null && current.markup === null;

  const quiet = Math.round(size * 0.08);

  const code = (
    <span
      className={cn(
        'relative block shrink-0 overflow-hidden bg-white',
        tone === 'plate' && 'rounded-md shadow-card ring-1 ring-border-subtle',
        tone === 'ink' && 'rounded-md ring-1 ring-ink/15',
      )}
      style={{ width: size + quiet * 2, height: size + quiet * 2, padding: quiet }}
    >
      {svg ? (
        <img
          src={`data:image/svg+xml;utf8,${encodeURIComponent(svg)}`}
          alt=""
          width={size}
          height={size}
          draggable={false}
          className="block h-full w-full"
        />
      ) : (
        // Same footprint while the code generates, so nothing shifts.
        <span
          aria-hidden
          className={cn(
            'block h-full w-full rounded-xs',
            failed ? 'bg-live-soft' : 'bg-mist',
          )}
        />
      )}
    </span>
  );

  const caption =
    labelPlacement === 'none' ? null : (
      <span className="flex flex-col gap-0.5">
        <span
          className="u-label text-ink whitespace-nowrap"
          style={{ fontSize: Math.max(10, Math.round(size * 0.098)) }}
        >
          {label}
        </span>
        {showUrl ? (
          <span
            className="text-text-muted font-sans break-all"
            style={{ fontSize: Math.max(9, Math.round(size * 0.078)) }}
          >
            {url.replace(/^https?:\/\//, '')}
          </span>
        ) : null}
      </span>
    );

  return (
    <div
      data-event-qr
      className={cn(
        'flex',
        labelPlacement === 'right'
          ? 'flex-row items-center gap-3'
          : 'flex-col items-center gap-2',
        labelPlacement === 'above' && 'flex-col-reverse',
        className,
      )}
    >
      <a
        href={url}
        className="block rounded-md"
        aria-label={`${label}: ${url}`}
        target="_blank"
        rel="noreferrer"
      >
        {code}
      </a>
      {caption}
    </div>
  );
}

export default EventQr;
