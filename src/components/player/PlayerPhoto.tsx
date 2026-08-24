'use client';

import { useState } from 'react';

import { cn } from '@/lib/cn';
import {
  PlayerCardFallback,
  type PlayerCardFallbackTone,
} from '@/components/player/PlayerCardFallback';
import {
  displayNameOf,
  focalPosition,
  portraitSrc,
  sizedPortraitSrc,
  type PlayerLike,
} from '@/components/player/player-identity';

/**
 * Delivery width, in CSS pixels, for a portrait whose caller says nothing.
 *
 * Comfortably above the largest box a portrait is painted into — the TV hero
 * column — so the CDN copy is never upscaled, while still an order of
 * magnitude smaller than the uploaded original.
 */
const DEFAULT_DELIVERY_WIDTH = 800;

export interface PlayerPhotoProps {
  player: PlayerLike;
  /**
   * `cover` fills the frame and crops to the focal point — right for ordinary
   * portraits. `contain` fits a transparent cut-out inside the frame without
   * cropping — right for the supplied PNG cut-outs.
   */
  fit?: 'cover' | 'contain';
  /**
   * Soft bottom fade so a rectangular photo dissolves into the field instead
   * of sitting inside a visible box. Default true.
   */
  fade?: boolean;
  /** Tone passed through to the fallback when there is no usable photo. */
  fallbackTone?: PlayerCardFallbackTone;
  /** Load eagerly — set on the one or two heroes actually on screen. */
  priority?: boolean;
  /**
   * Width the portrait is painted at, in CSS pixels. Used to ask the CDN for a
   * copy that size instead of the multi-megabyte original. Pass it on small
   * cards; the default already suits the largest box on the wall.
   */
  deliveryWidth?: number;
  className?: string;
  imgClassName?: string;
}

/**
 * The player's portrait, or the branded fallback.
 *
 * A photo that 404s at the venue is treated exactly like a missing one: the
 * fallback takes over and the card keeps its composition. Nothing on this
 * platform ever shows a broken image glyph on the LED wall.
 */
export function PlayerPhoto({
  player,
  fit = 'cover',
  fade = true,
  fallbackTone = 'team',
  priority = false,
  deliveryWidth = DEFAULT_DELIVERY_WIDTH,
  className,
  imgClassName,
}: PlayerPhotoProps) {
  const original = portraitSrc(player);
  const sized = sizedPortraitSrc(original, deliveryWidth);

  // Failures are recorded against the addresses that failed, so a new player in
  // the same slot gets a fresh attempt at their photo without an effect having
  // to reset anything. It has to be every failed address rather than the last
  // one, or the two candidates below would take it in turns forever.
  const [brokenSrcs, setBrokenSrcs] = useState<readonly string[]>([]);

  // Three steps down, never a broken glyph: the CDN-resized copy, then the
  // untouched original if that address fails, then the branded fallback. A
  // resizing service that is unavailable therefore costs a moment, not a face.
  const src =
    [sized, original].find(
      (candidate): candidate is string => candidate !== null && !brokenSrcs.includes(candidate),
    ) ?? null;

  if (!src) {
    return (
      <PlayerCardFallback
        player={player}
        tone={fallbackTone}
        className={cn(fade && 'u-cutout-fade', className)}
      />
    );
  }

  return (
    <div
      data-player-photo
      className={cn('relative h-full w-full overflow-hidden', fade && 'u-cutout-fade', className)}
    >
      <img
        src={src}
        alt={displayNameOf(player)}
        draggable={false}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        onError={() =>
          setBrokenSrcs((prev) => (prev.includes(src) ? prev : [...prev, src]))
        }
        className={cn(
          'h-full w-full',
          fit === 'cover' ? 'object-cover' : 'object-contain',
          imgClassName,
        )}
        style={{ objectPosition: focalPosition(player) }}
      />
    </div>
  );
}

export default PlayerPhoto;
