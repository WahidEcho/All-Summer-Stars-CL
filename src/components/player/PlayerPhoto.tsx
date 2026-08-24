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
  type PlayerLike,
} from '@/components/player/player-identity';

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
  className,
  imgClassName,
}: PlayerPhotoProps) {
  const src = portraitSrc(player);
  // The failure is recorded against the address that failed, so a new player in
  // the same slot gets a fresh attempt at their photo without an effect having
  // to reset anything.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const broken = src !== null && brokenSrc === src;

  if (!src || broken) {
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
        onError={() => setBrokenSrc(src)}
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
