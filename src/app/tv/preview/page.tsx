import {
  TvSurface,
  buildSampleSnapshot,
  parseSamplePhase,
  parseSampleScene,
  resolveCeremonyPhase,
  sampleSceneDefaults,
  type CeremonyPhase,
  type TvSampleOverride,
} from '@/components/tv';
import { getDisplayState, getEventId } from '@/lib/data/queries';
import { loadEventSnapshot, serverDb } from '@/lib/data/server';
import type { EventSnapshot } from '@/lib/data/snapshot';
import { EVENT_SLUG } from '@/lib/event';
import type { DisplayStateRow } from '@/lib/types';

/**
 * OPERATOR PREVIEW — the same renderer, off air.
 *
 * Two jobs in one route:
 *
 * 1. With no query string it follows `preview_scene`, so the operator can line
 *    a composition up and look at it against real live figures before cutting
 *    it to the wall. It falls back to the program scene when nothing is lined
 *    up, so the surface is never blank.
 *
 * 2. With `?scene=…` it forces any of the nine compositions from the sample
 *    event in `sample-model.ts` and subscribes to nothing at all. That is the
 *    QA route: every screen can be inspected, compared against design.md and
 *    photographed without a database, without a live event, and — critically —
 *    without a stray click anywhere near production state.
 *
 * Supported parameters:
 *   `scene`   any `DisplayScene`, plus the shorthands an operator would type
 *             (`h2h`, `live`, `match`, `board`, …)
 *   `phase`   ceremony phase — `champions`, `top5_1`, `partners`, `closing`, …
 *   `payload` a JSON object, merged over the scene's default payload, for the
 *             operator-facing keys the scenes read (`buildup`, `photo_hold`,
 *             `phase`, `breakdown`)
 *
 * `searchParams` is a Promise in Next 16, so it is awaited before anything
 * reads it.
 */
export const revalidate = 0;
export const dynamic = 'force-dynamic';

/** Read one query value, tolerating the `string[]` form. */
function one(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/** Parse `?payload=` as a JSON object. Anything else is ignored, not thrown. */
function parsePayloadParam(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // A hand-typed query string is not a reason to fail the route.
  }
  return null;
}

export default async function TvPreviewPage({ searchParams }: PageProps<'/tv/preview'>) {
  const params = await searchParams;

  const scene = parseSampleScene(one(params.scene));
  const slugParam = one(params.event);
  // Same rule as /tv: a well-formed slug selects that event, anything else
  // falls back to the deployment's own.
  const slug =
    slugParam && /^[a-z0-9-]{1,80}$/.test(slugParam) ? slugParam : EVENT_SLUG;
  const phaseParam = one(params.phase);
  const payloadParam = parsePayloadParam(one(params.payload));

  // --- QA path: forced sample scene, no subscription, no database ---------
  if (scene) {
    const defaults = sampleSceneDefaults(scene);
    const sample: TvSampleOverride = {
      scene,
      snapshot: buildSampleSnapshot(scene),
      payload: { ...defaults.payload, ...(payloadParam ?? {}) },
      ceremonyPhase: parseSamplePhase(phaseParam, defaults.ceremonyPhase),
    };

    return <TvSurface initialSnapshot={null} initialDisplay={null} preview sample={sample} />;
  }

  // --- Live path: whatever the operator is lining up ----------------------
  let snapshot: EventSnapshot | null = null;
  let display: DisplayStateRow | null = null;

  try {
    snapshot = await loadEventSnapshot({ slug });
    display = snapshot.displayState;
  } catch {
    try {
      const db = await serverDb();
      display = await getDisplayState(db, await getEventId(db, slug));
    } catch {
      display = null;
    }
  }

  // `?phase=` and `?payload=` still apply off the live data, so the operator can
  // rehearse a ceremony step against real standings before advancing it for real.
  // They are passed as overrides rather than folded into the initial row, so
  // they survive every subsequent realtime update instead of lasting one frame.
  const livePhase: CeremonyPhase | null = phaseParam ? resolveCeremonyPhase(phaseParam) : null;

  return (
    <TvSurface
      initialSnapshot={snapshot}
      initialDisplay={display}
      preview
      payloadOverride={payloadParam}
      ceremonyPhaseOverride={livePhase}
      slug={slug}
    />
  );
}
