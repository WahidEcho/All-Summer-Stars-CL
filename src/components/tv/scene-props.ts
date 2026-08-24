/**
 * The one prop shape every scene takes.
 *
 * A scene never fetches. It receives the derived model, the display row's
 * payload and the ceremony phase, and draws. That is what makes the sample-data
 * QA route (`/tv/preview?scene=...`) possible without a database at all.
 */

import type { DisplayScene } from '@/lib/types';
import type { SceneModel } from '@/components/tv/scene-model';
import type { CeremonyPhase } from '@/components/tv/constants';

export interface SceneProps {
  model: SceneModel;
  /** `program_payload` / `preview_payload` from the display row. */
  payload: Record<string, unknown>;
  /** Normalised `ceremony_phase`. */
  ceremonyPhase: CeremonyPhase;
  /** Which scene this is — a couple of scenes share a component shape. */
  scene: DisplayScene;
  /** True on `/tv/preview`, so a scene can soften an attention-grabbing loop. */
  preview?: boolean;
}

/** Read a string out of an untyped display payload. */
export function payloadString(
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

/** Read a boolean out of an untyped display payload. */
export function payloadBool(
  payload: Record<string, unknown>,
  key: string,
): boolean | null {
  const value = payload[key];
  return typeof value === 'boolean' ? value : null;
}
