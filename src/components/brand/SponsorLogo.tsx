import { cn } from '@/lib/cn';
import { brandCropStyle, resolveBrandAsset } from '@/components/brand/brand-assets';

/** The shape the ticker needs. `SponsorRow` satisfies it. */
export interface SponsorLogoItem {
  id?: string;
  name: string;
  logo_url?: string | null;
  website_url?: string | null;
}

export interface SponsorLogoProps {
  sponsor: SponsorLogoItem;
  /** Nominal logo height in px, before optical correction. */
  height?: number;
  /**
   * Apply the manifest's per-logo optical scale so every mark reads at the
   * same visual size rather than the same literal height. Default true.
   */
  optical?: boolean;
  /** Corner radius applied to plated assets (Tellr's teal block). */
  radius?: 'none' | 'sm' | 'md';
  /** Small caps line before the mark, e.g. `POWERED BY`. */
  prefix?: string | null;
  className?: string;
}

const RADIUS = { none: 'rounded-none', sm: 'rounded-sm', md: 'rounded-md' } as const;

/**
 * One sponsor mark, always in its original colours.
 *
 * Marks with an opaque white artboard are composited with
 * `mix-blend-mode: multiply`, which removes the white without altering a
 * single brand colour — Yalla Sahel stays #02BBC1, Sports United stays
 * #C62029. Marks that ship their own coloured plate (Tellr) keep it.
 *
 * Requires a light parent background, which the whole design language
 * guarantees.
 */
export function SponsorLogo({
  sponsor,
  height = 52,
  optical = true,
  radius = 'sm',
  prefix,
  className,
}: SponsorLogoProps) {
  const asset = resolveBrandAsset(sponsor.logo_url);

  const body = asset ? (
    <span
      className={cn('relative block overflow-hidden', asset.plate && RADIUS[radius])}
      style={{
        height: Math.round(height * (optical ? asset.opticalScale : 1)),
        aspectRatio: String(asset.aspect),
      }}
    >
      <img
        src={asset.src}
        alt=""
        draggable={false}
        loading="lazy"
        decoding="async"
        style={brandCropStyle(asset)}
      />
    </span>
  ) : sponsor.logo_url ? (
    // Unknown asset — no measured crop, so fall back to a plain contain fit.
    <img
      src={sponsor.logo_url}
      alt=""
      draggable={false}
      loading="lazy"
      decoding="async"
      className="w-auto object-contain"
      style={{ height: Math.round(height * 0.78) }}
    />
  ) : (
    // No logo at all — the name set in the house label style, never a broken
    // image icon.
    <span
      className="u-label text-ink-soft whitespace-nowrap"
      style={{ fontSize: Math.round(height * 0.3) }}
    >
      {sponsor.name}
    </span>
  );

  return (
    <span
      data-sponsor-logo={sponsor.name}
      role="img"
      aria-label={prefix ? `${prefix} ${sponsor.name}` : sponsor.name}
      className={cn('inline-flex shrink-0 items-center gap-3', className)}
    >
      {prefix ? (
        <span
          className="u-eyebrow text-text-muted whitespace-nowrap"
          style={{ fontSize: Math.max(9, Math.round(height * 0.2)) }}
          aria-hidden
        >
          {prefix}
        </span>
      ) : null}
      {body}
    </span>
  );
}

export default SponsorLogo;
