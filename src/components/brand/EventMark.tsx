import type { CSSProperties } from 'react';

import { cn } from '@/lib/cn';
import { BRAND_ASSETS, brandCropStyle, type BrandAsset } from '@/components/brand/brand-assets';

export type EventMarkVariant = 'primary' | 'light' | 'dark';

export interface EventMarkProps {
  /**
   * `light`  — ink logo, background multiplied away. The workhorse: use this
   *            on cream, white, mist and pale-aqua fields.
   * `primary`— cream logo on the brand aqua plate. The hero treatment for the
   *            holding screen and the ceremony title card.
   * `dark`   — cream logo on the ink star plate, for use over a scrim.
   */
  variant?: EventMarkVariant;
  /**
   * Explicit width. Omit and the mark fills its container; the height always
   * follows the 2:1 lockup so it can never distort.
   */
  width?: number | string;
  /** Corner radius for the plated variants. Ignored by `light`. */
  radius?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  /**
   * Accessible name. Pass `''` when the event name is already in the DOM
   * beside the mark, which makes it decorative.
   */
  title?: string;
  /** Load eagerly — set on the first mark of a TV surface. */
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
}

const RADIUS = {
  none: 'rounded-none',
  sm: 'rounded-sm',
  md: 'rounded-md',
  lg: 'rounded-lg',
  xl: 'rounded-xl',
} as const;

// Typed as BrandAsset rather than inferred: `plate` is optional on the
// interface but absent from the entries that do not set it, so an inferred
// union would not admit reading `.plate` at all.
const ASSET: Record<EventMarkVariant, BrandAsset> = {
  primary: BRAND_ASSETS['event-primary'],
  light: BRAND_ASSETS['event-light'],
  dark: BRAND_ASSETS['event-dark'],
};

/**
 * The SwanLake Football Stars — Shores & Scores Challenge competition mark.
 *
 * The supplied SVGs are 16:9 key-art tiles with the logo floating inside a
 * large field of star geometry. This component crops each tile to the measured
 * logo bounding box so the mark reads at its true size, and neutralises the
 * `light` tile's white background with `mix-blend-mode: multiply` so it can
 * sit on cream without a visible rectangle.
 *
 * `light` therefore requires a light parent background — which is the whole
 * design language, so that is not a real constraint.
 */
export function EventMark({
  variant = 'light',
  width,
  radius = 'md',
  title = 'SwanLake Football Stars — Shores & Scores Challenge',
  priority = false,
  className,
  style,
}: EventMarkProps) {
  const asset = ASSET[variant];
  const decorative = title === '';

  return (
    <span
      data-event-mark={variant}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      className={cn(
        'relative block overflow-hidden',
        width === undefined && 'w-full',
        asset.plate ? RADIUS[radius] : 'rounded-none',
        className,
      )}
      style={{ aspectRatio: String(asset.aspect), width, ...style }}
    >
      <img
        src={asset.src}
        alt=""
        draggable={false}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        style={brandCropStyle(asset)}
      />
    </span>
  );
}

export default EventMark;
