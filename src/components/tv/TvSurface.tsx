'use client';

import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { EventMark } from '@/components/brand';
import { useDisplayState, useEventSnapshot } from '@/lib/hooks';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { DisplayScene, DisplayStateRow } from '@/lib/types';
import { BroadcastStage } from '@/components/tv/BroadcastStage';
import { SceneFrame } from '@/components/tv/SceneFrame';
import { SceneRouter } from '@/components/tv/SceneRouter';
import { LoadingDots } from '@/components/tv/parts/LoadingDots';
import { buildSceneModel } from '@/components/tv/scene-model';
import { resolveCeremonyPhase, type CeremonyPhase } from '@/components/tv/constants';

/** A forced, database-free rendering — the `?scene=` QA route. */
export interface TvSampleOverride {
  scene: DisplayScene;
  snapshot: EventSnapshot;
  payload: Record<string, unknown>;
  ceremonyPhase: CeremonyPhase;
}

export interface TvSurfaceProps {
  /** Server-rendered snapshot, so the wall paints a real score on first frame. */
  initialSnapshot: EventSnapshot | null;
  /** Server-rendered display row, so the first frame is already the right scene. */
  initialDisplay: DisplayStateRow | null;
  /**
   * Operator preview. Follows `preview_scene` when the controller has one
   * lined up, keeps the mouse pointer, and tells scenes to soften any
   * attention-grabbing loop.
   */
  preview?: boolean;
  /** When set, nothing subscribes and this is rendered instead. */
  sample?: TvSampleOverride | null;
  /**
   * Preview-only: merged over the live payload on every frame, so an operator
   * can rehearse a payload-driven state (`buildup`, `photo_hold`) against real
   * figures without writing it to the display row.
   */
  payloadOverride?: Record<string, unknown> | null;
  /** Preview-only: hold a ceremony phase without advancing the real one. */
  ceremonyPhaseOverride?: CeremonyPhase | null;
}

const NEVER_CHANGES = () => () => {};

/**
 * True only once the client has taken over.
 *
 * `useSyncExternalStore` is the sanctioned way to ask this: it returns the
 * server value during SSR and the client value from the first client render
 * onwards, with no effect and no state write to schedule.
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

/**
 * Keep the panel awake.
 *
 * A wall that sleeps twenty minutes into a challenge is a failure the crowd
 * sees, and the sentinel is dropped by the browser whenever the tab is hidden,
 * so it has to be re-requested on every return to visibility. Denial is not an
 * error worth surfacing — venue displays are usually on mains and configured
 * never to sleep anyway.
 */
function useScreenWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined') return;

    interface WakeLockSentinelLike {
      released: boolean;
      release: () => Promise<void>;
    }
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
    };
    const wakeLock = nav.wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (cancelled || (sentinel && !sentinel.released)) return;
      try {
        const next = await wakeLock.request('screen');
        if (cancelled) {
          void next.release();
          return;
        }
        sentinel = next;
      } catch {
        // Not permitted here. The scene keeps rendering regardless.
      }
    };

    void acquire();

    const onVisible = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      if (sentinel && !sentinel.released) void sentinel.release();
    };
  }, [enabled]);
}

/**
 * The broadcast output.
 *
 * Two subscriptions run side by side and deliberately do not depend on each
 * other: `useDisplayState` carries the scene cut (one small row, so a cut
 * reaches the wall in a single message) and `useEventSnapshot` carries the
 * figures. Neither hook ever clears what it is holding when a read fails, so a
 * dropped socket, a Wi-Fi blip or a database hiccup leaves the last confirmed
 * frame exactly where it was — the score stays on the wall, the clock keeps
 * ticking from its server anchor, and the crowd sees nothing. A blank LED wall
 * in front of a live audience is the only unrecoverable failure here, so no
 * code path in this component can produce one once a first frame has landed.
 *
 * The composition itself is `BroadcastStage` → the scene, and the scene wraps
 * itself in `SceneFrame`, which is what carries the persistent furniture:
 * competition mark left, context centre, permanent QR right, sponsor crawl
 * along the bottom. That furniture therefore holds its exact geometry through
 * every cut, and the one scene entitled to drop it — the ceremony's full-bleed
 * frames — can do so without this route knowing anything about it.
 *
 * ## Why the scene mounts on the client
 *
 * The data is fetched on the server — that is the part that matters, and it is
 * why the first client render already has a real score instead of waiting on a
 * round trip. The *scene* is nonetheless mounted only after hydration, and that
 * is deliberate.
 *
 * `useTimer` derives the visible clock from `Date.now()` during render, which
 * is exactly right: the database stores an anchor, never a ticking number. But
 * it means a running clock renders `26:04` on the server and `26:04.3` a few
 * hundred milliseconds later when the client hydrates. React treats that as a
 * hydration mismatch and recovers by throwing away the server tree and
 * re-rendering the entire root — a full repaint of the wall, at the one moment
 * a clock is running, which is to say during the show.
 *
 * Rendering the composition client-side removes the comparison altogether. The
 * server still paints immediately: the standby slate below is real branded
 * output, not a blank page, and it is replaced by the live scene as soon as the
 * bundle is parsed — with no network wait, because the snapshot travelled with
 * the document.
 */
export function TvSurface({
  initialSnapshot,
  initialDisplay,
  preview = false,
  sample = null,
  payloadOverride = null,
  ceremonyPhaseOverride = null,
}: TvSurfaceProps) {
  const live = sample === null;
  const hydrated = useHydrated();

  const { snapshot } = useEventSnapshot({ initial: initialSnapshot, enabled: live });
  const { programScene, programPayload, previewScene, previewPayload, ceremonyPhase } =
    useDisplayState({ initial: initialDisplay, enabled: live });

  useScreenWakeLock(true);

  // Hide the pointer on the program output only. The operator preview is a
  // surface someone actually clicks around in.
  useEffect(() => {
    if (preview || typeof document === 'undefined') return;
    const root = document.documentElement;
    const previous = root.style.cursor;
    root.style.cursor = 'none';
    return () => {
      root.style.cursor = previous;
    };
  }, [preview]);

  const activeSnapshot = sample ? sample.snapshot : snapshot;

  const model = useMemo(
    () => (activeSnapshot ? buildSceneModel(activeSnapshot) : null),
    [activeSnapshot],
  );

  // On preview, follow what the operator is lining up; fall back to what the
  // room can already see so the surface is never empty between line-ups.
  const scene: DisplayScene = sample
    ? sample.scene
    : preview
      ? (previewScene ?? programScene)
      : programScene;

  const livePayload = preview && previewScene ? previewPayload : programPayload;
  const payload: Record<string, unknown> = useMemo(
    () =>
      sample
        ? sample.payload
        : payloadOverride
          ? { ...livePayload, ...payloadOverride }
          : livePayload,
    [sample, livePayload, payloadOverride],
  );

  const phase: CeremonyPhase = sample
    ? sample.ceremonyPhase
    : (ceremonyPhaseOverride ?? resolveCeremonyPhase(ceremonyPhase));

  return (
    <BroadcastStage
      className={preview ? undefined : 'cursor-none'}
      matteClassName="bg-ink"
    >
      {hydrated && model ? (
        <SceneRouter
          model={model}
          payload={payload}
          ceremonyPhase={phase}
          scene={scene}
          preview={preview}
        />
      ) : (
        <StandbySlate />
      )}
    </BroadcastStage>
  );
}

/**
 * The boot frame: the server-rendered paint, and the frame held while a first
 * snapshot is still on its way.
 *
 * It is not an error state and says nothing alarming — a cold start and an
 * unreachable database look identical to the room, and both resolve themselves
 * the moment a read succeeds. Once a scene has been mounted this can never
 * come back, because neither hook clears what it holds.
 */
function StandbySlate() {
  return (
    <SceneFrame starField="holding" header={false} ticker={false}>
      <div
        data-tv-standby
        className="flex h-full w-full flex-col items-center justify-center gap-12"
      >
        <div className="w-[38%]">
          <EventMark variant="light" priority title="" />
          <span className="u-sr-only">
            SwanLake Football Stars — Shores &amp; Scores Challenge
          </span>
        </div>
        <LoadingDots size={20} ariaLabel="Connecting to the event" />
      </div>
    </SceneFrame>
  );
}

export default TvSurface;
