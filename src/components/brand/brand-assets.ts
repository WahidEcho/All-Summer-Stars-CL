import type { CSSProperties } from 'react';

/**
 * Brand asset manifest.
 *
 * Every SVG in `public/brand` was exported onto an oversized artboard with the
 * artwork floating somewhere inside it — several are 1440x810 with a logo
 * sitting in the middle of a mostly empty field, and three carry a full-bleed
 * background. Rendering them with `object-fit: contain` therefore produces a
 * logo that looks tiny and mis-aligned.
 *
 * `crop` is the measured tight bounding box of the artwork inside its own
 * artboard, expressed as fractions `[x, y, width, height]`. `aspect` is that
 * box's width / height. Together they let a component draw only the artwork,
 * at the right proportions, with no distortion and no wasted space.
 *
 * The numbers were measured by rasterising each file and finding the extent of
 * the non-background pixels; re-measure if an asset is ever replaced.
 */
export interface BrandAsset {
  /** Path under `public/`. */
  src: string;
  /** Tight content box inside the artboard: `[x, y, width, height]`, 0–1. */
  crop: readonly [number, number, number, number];
  /** Aspect ratio (width / height) of the cropped box. */
  aspect: number;
  /**
   * Optical-height multiplier used by the sponsor ticker. Logos are matched by
   * perceived size rather than by literal height — a stacked lockup needs more
   * height than a single-line wordmark to read as the same size.
   */
  opticalScale: number;
  /**
   * `multiply` neutralises an opaque white artboard against a light field
   * without touching the logo's own colours. `none` is for artwork that is
   * already transparent, or that ships its own coloured plate.
   */
  blend: 'multiply' | 'none';
  /** True when the asset is a coloured tile (Tellr's teal block) rather than
   *  free-standing artwork. Plates get a corner radius instead of a blend. */
  plate?: boolean;
  /** Human name, used as the default alt text. */
  label: string;
}

export const BRAND_ASSETS = {
  /* ------------------------------------------------------- event identity */
  'event-primary': {
    src: '/brand/event-primary.svg',
    crop: [0.1952, 0.2436, 0.6498, 0.5774],
    aspect: 2.0007,
    opticalScale: 1,
    blend: 'none',
    plate: true,
    label: 'SwanLake Football Stars — Shores & Scores Challenge',
  },
  'event-light': {
    src: '/brand/event-light.svg',
    crop: [0.1952, 0.2436, 0.6498, 0.5774],
    aspect: 2.0007,
    opticalScale: 1,
    blend: 'multiply',
    label: 'SwanLake Football Stars — Shores & Scores Challenge',
  },
  'event-dark': {
    src: '/brand/event-dark.svg',
    crop: [0.155, 0.205, 0.735, 0.655],
    aspect: 1.9948,
    opticalScale: 1,
    blend: 'none',
    plate: true,
    label: 'SwanLake Football Stars — Shores & Scores Challenge',
  },

  /* -------------------------------------------------------------- sponsors */
  'yalla-sahel': {
    src: '/brand/yalla-sahel.svg',
    crop: [0.1891, 0.3063, 0.6219, 0.3882],
    aspect: 2.848,
    opticalScale: 0.82,
    blend: 'multiply',
    label: 'Yalla Sahel',
  },
  tellr: {
    src: '/brand/tellr.svg',
    crop: [0, 0, 1, 1],
    aspect: 3.0189,
    opticalScale: 0.68,
    blend: 'none',
    plate: true,
    label: 'Tellr',
  },
  'swanlake-north-coast': {
    src: '/brand/swanlake-north-coast.svg',
    crop: [0.1022, 0.4037, 0.7956, 0.1927],
    aspect: 12.73,
    opticalScale: 0.36,
    blend: 'none',
    label: 'SwanLake North Coast',
  },
  'swanlake-north-coast-white': {
    src: '/brand/swanlake-north-coast-white.svg',
    crop: [0.1022, 0.4037, 0.7956, 0.1927],
    aspect: 12.73,
    opticalScale: 0.36,
    blend: 'none',
    label: 'SwanLake North Coast',
  },
  'hassan-allam': {
    src: '/brand/hassan-allam.svg',
    crop: [0.0293, 0.3066, 0.9386, 0.3821],
    aspect: 1.7378,
    opticalScale: 1,
    blend: 'multiply',
    label: 'Hassan Allam Properties',
  },
  'sports-united': {
    src: '/brand/sports-united.svg',
    crop: [0.2719, 0.1299, 0.4562, 0.7403],
    aspect: 1.0957,
    opticalScale: 1.15,
    blend: 'multiply',
    label: 'Sports United',
  },
  'sports-united-dark': {
    src: '/brand/sports-united-dark.svg',
    crop: [0.2719, 0.1299, 0.4562, 0.7403],
    aspect: 1.0957,
    opticalScale: 1.15,
    blend: 'none',
    plate: true,
    label: 'Sports United',
  },
  'move-beyond': {
    src: '/brand/move-beyond.svg',
    crop: [0.0556, 0.3292, 0.8889, 0.2667],
    aspect: 2.3545,
    opticalScale: 0.86,
    blend: 'multiply',
    label: 'Move Beyond',
  },
  'move-beyond-aqua': {
    src: '/brand/move-beyond-aqua.svg',
    crop: [0.0341, 0.3229, 0.9318, 0.2774],
    aspect: 2.373,
    opticalScale: 0.86,
    blend: 'none',
    label: 'Move Beyond',
  },
} as const satisfies Record<string, BrandAsset>;

export type BrandAssetKey = keyof typeof BRAND_ASSETS;

/** Ticker order confirmed in `0002_seed_event.sql`. */
export const SPONSOR_TICKER_ORDER: readonly BrandAssetKey[] = [
  'yalla-sahel',
  'tellr',
  'swanlake-north-coast',
  'hassan-allam',
  'sports-united',
  'move-beyond',
] as const;

/** Sponsors whose name should be prefixed in the ticker. */
export const SPONSOR_PREFIX: Partial<Record<BrandAssetKey, string>> = {
  'move-beyond': 'POWERED BY',
};

const BY_SRC = new Map<string, BrandAssetKey>(
  (Object.keys(BRAND_ASSETS) as BrandAssetKey[]).map((k) => [BRAND_ASSETS[k].src, k]),
);

/**
 * Resolve a `sponsors.logo_url` (or any `/brand/...` path) to its manifest
 * entry. Returns `null` for an unknown or externally hosted logo, which the
 * caller should render with plain `object-fit: contain`.
 */
export function resolveBrandAsset(logoUrl?: string | null): BrandAsset | null {
  if (!logoUrl) return null;
  const key = BY_SRC.get(logoUrl);
  if (key) return BRAND_ASSETS[key];

  // Tolerate an absolute URL or a missing leading slash.
  const file = logoUrl.split('/').pop();
  if (!file) return null;
  const guess = file.replace(/\.svg$/i, '') as BrandAssetKey;
  return guess in BRAND_ASSETS ? BRAND_ASSETS[guess] : null;
}

/**
 * Styles for the `<img>` inside a crop window.
 *
 * The window is sized by the caller and given `aspect-ratio: asset.aspect`;
 * the image is then blown up by `1 / crop.width` and offset so the cropped
 * region exactly fills it. Because the window's aspect matches the crop's,
 * nothing is ever squashed.
 */
export function brandCropStyle(asset: BrandAsset): CSSProperties {
  const [x, y, w, h] = asset.crop;
  return {
    position: 'absolute',
    width: `${(1 / w) * 100}%`,
    height: `${(1 / h) * 100}%`,
    left: `${(-x / w) * 100}%`,
    top: `${(-y / h) * 100}%`,
    maxWidth: 'none',
    objectFit: 'fill',
    mixBlendMode: asset.blend === 'multiply' ? 'multiply' : undefined,
  };
}
