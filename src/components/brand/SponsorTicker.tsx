'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { AnimatePresence, motion } from 'motion/react';

import { useReducedMotionSafe } from '@/components/ui/motion-tokens';

import type { SponsorRow } from '@/lib/types';
import { cn } from '@/lib/cn';
import {
  BRAND_ASSETS,
  SPONSOR_PREFIX,
  SPONSOR_TICKER_ORDER,
  type BrandAssetKey,
} from '@/components/brand/brand-assets';
import { SponsorLogo, type SponsorLogoItem } from '@/components/brand/SponsorLogo';

export interface SponsorTickerProps {
  /**
   * Rows from the `sponsors` table. Inactive rows are dropped and the rest are
   * ordered by `ticker_order`. Omit to fall back to the confirmed running
   * order baked into the seed migration.
   */
  sponsors?: ReadonlyArray<SponsorRow | SponsorLogoItem>;
  /** Crawl speed in CSS px per second. Design brief: 25–35 at 1080p. */
  speed?: number;
  /** Band height in px. 86px ≈ the 8% bottom zone of a 1080p canvas. */
  height?: number;
  /** Nominal logo height. Defaults to 60% of the band. */
  logoHeight?: number;
  /** Space between marks, in px. */
  gap?: number;
  /** Hairline rule along the top of the band. Default true. */
  rule?: boolean;
  /** Pause the crawl on hover. Off by default — TV has no pointer. */
  pauseOnHover?: boolean;
  /** Seconds each mark holds in the reduced-motion crossfade. */
  crossfadeSeconds?: number;
  className?: string;
}

interface TickerEntry {
  key: string;
  item: SponsorLogoItem;
  prefix?: string;
}

interface Metrics {
  /** Width of one copy of the sponsor set, in px. */
  groupWidth: number;
  /** How many copies are tiled so the track always overhangs the band. */
  copies: number;
  /** Seconds for one copy to travel its own width. */
  duration: number;
}

/** The seeded running order, used when no rows are supplied. */
function defaultEntries(): TickerEntry[] {
  return SPONSOR_TICKER_ORDER.map((key: BrandAssetKey) => ({
    key,
    item: { name: BRAND_ASSETS[key].label, logo_url: BRAND_ASSETS[key].src },
    prefix: SPONSOR_PREFIX[key],
  }));
}

function toEntries(rows: SponsorTickerProps['sponsors']): TickerEntry[] {
  if (!rows || rows.length === 0) return defaultEntries();

  const active = rows.filter((r) => !('active' in r) || r.active !== false);
  if (active.length === 0) return defaultEntries();

  const ordered = [...active].sort((a, b) => {
    const ao = 'ticker_order' in a ? a.ticker_order : 0;
    const bo = 'ticker_order' in b ? b.ticker_order : 0;
    return ao - bo;
  });

  return ordered.map((row, index) => {
    const file = row.logo_url?.split('/').pop()?.replace(/\.svg$/i, '') as
      | BrandAssetKey
      | undefined;
    // "Powered by Move Beyond" already carries its prefix in the row name, so
    // only add one when the name is the bare brand.
    const prefix =
      file && file in SPONSOR_PREFIX && !/^powered by/i.test(row.name)
        ? SPONSOR_PREFIX[file]
        : undefined;
    return {
      key: ('id' in row && row.id) || `${row.name}-${index}`,
      item: row,
      prefix,
    };
  });
}

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The permanent bottom sponsor strip: a seamless, continuously moving crawl.
 *
 * The content is rendered twice inside one track and the track is translated
 * by exactly -50%, so the loop closes on itself and never jumps. The duration
 * is derived from the measured width of one copy and the requested speed, so
 * the crawl runs at the same physical pace whether it is on a phone or on the
 * LED wall.
 *
 * Under `prefers-reduced-motion` the crawl is replaced by a slow crossfade
 * through the same sponsors in the same order — nobody loses their placement.
 */
export function SponsorTicker({
  sponsors,
  speed = 30,
  height = 86,
  logoHeight,
  gap = 72,
  rule = true,
  pauseOnHover = false,
  crossfadeSeconds = 4,
  className,
}: SponsorTickerProps) {
  const reduced = useReducedMotionSafe();
  const entries = toEntries(sponsors);
  const nominalLogo = logoHeight ?? Math.round(height * 0.6);

  const groupRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [index, setIndex] = useState(0);

  // Measure one copy of the set and the band it runs in, then work out how
  // many copies the track needs. Two is only enough when a single copy is at
  // least as wide as the screen; six logos on a 1920px wall are not, and the
  // track would run dry and show the loop restarting.
  useIsomorphicLayoutEffect(() => {
    const groupNode = groupRef.current;
    const viewportNode = viewportRef.current;
    if (!groupNode || !viewportNode || reduced) return;

    const measure = () => {
      const groupWidth = groupNode.getBoundingClientRect().width;
      const viewportWidth = viewportNode.getBoundingClientRect().width;
      if (groupWidth <= 0) return;

      // One copy is scrolling off the left at any moment, so the remaining
      // copies must still cover the band: ceil(viewport / copy) + 1.
      const copies = Math.max(2, Math.ceil(viewportWidth / groupWidth) + 1);

      setMetrics((previous) =>
        previous &&
        Math.abs(previous.groupWidth - groupWidth) < 0.5 &&
        previous.copies === copies
          ? previous
          : {
              groupWidth,
              copies,
              // Duration tracks one copy, so the crawl keeps the same physical
              // speed no matter how many copies are tiled behind it.
              duration: Math.max(8, groupWidth / Math.max(speed, 1)),
            },
      );
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(groupNode);
    observer.observe(viewportNode);
    return () => observer.disconnect();
  }, [reduced, speed, entries.length, nominalLogo, gap]);

  // Reduced-motion crossfade.
  useEffect(() => {
    if (!reduced || entries.length < 2) return;
    const id = window.setInterval(
      () => setIndex((i) => (i + 1) % entries.length),
      Math.max(1500, crossfadeSeconds * 1000),
    );
    return () => window.clearInterval(id);
  }, [reduced, entries.length, crossfadeSeconds]);

  const band = cn(
    'relative flex w-full items-center overflow-hidden bg-white',
    rule && 'border-t border-border-subtle',
    className,
  );

  if (reduced) {
    const entry = entries[index % entries.length];
    return (
      <div
        data-sponsor-ticker="crossfade"
        className={cn(band, 'justify-center')}
        style={{ height }}
        aria-label="Event partners and sponsors"
        role="region"
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={entry.key}
            data-motion="crossfade"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6, ease: 'linear' }}
            className="flex items-center"
          >
            <SponsorLogo sponsor={entry.item} prefix={entry.prefix} height={nominalLogo} />
          </motion.div>
        </AnimatePresence>

        {/* Every sponsor stays in the accessibility tree regardless of which
            one is painted right now. */}
        <span className="u-sr-only">
          {entries.map((e) => `${e.prefix ? `${e.prefix} ` : ''}${e.item.name}`).join(', ')}
        </span>
      </div>
    );
  }

  // Only the first copy is real to assistive tech; the rest are visual tiling.
  const group = (copy: number) => (
    <div
      key={`copy-${copy}`}
      ref={copy === 0 ? groupRef : undefined}
      aria-hidden={copy === 0 ? undefined : true}
      className="flex shrink-0 items-center"
      style={{ gap, paddingRight: gap }}
    >
      {entries.map((entry) => (
        <SponsorLogo
          key={`${copy}-${entry.key}`}
          sponsor={entry.item}
          prefix={entry.prefix}
          height={nominalLogo}
        />
      ))}
    </div>
  );

  // Render two copies on the first pass so there is something to measure, then
  // settle on however many the band actually needs.
  const copies = metrics?.copies ?? 2;

  return (
    <div
      data-sponsor-ticker="crawl"
      className={band}
      style={{ height }}
      role="region"
      aria-label="Event partners and sponsors"
    >
      <div ref={viewportRef} className="u-edge-fade-x relative flex w-full overflow-hidden">
        <div
          data-motion="loop"
          className={cn(
            'flex w-max items-center will-change-transform',
            metrics != null && 'animate-ticker',
            pauseOnHover && 'hover:[animation-play-state:paused]',
          )}
          style={
            metrics != null
              ? ({
                  '--ticker-duration': `${metrics.duration.toFixed(2)}s`,
                  '--ticker-shift': `${metrics.groupWidth.toFixed(2)}px`,
                  // Set outright as well: the duration inside the `animation`
                  // shorthand resolved to its fallback rather than the measured
                  // value, which left the crawl running at a fixed 40s instead
                  // of the requested px/sec.
                  animationDuration: `${metrics.duration.toFixed(2)}s`,
                } as CSSProperties)
              : undefined
          }
        >
          {Array.from({ length: copies }, (_, copy) => group(copy))}
        </div>
      </div>
    </div>
  );
}

export default SponsorTicker;
