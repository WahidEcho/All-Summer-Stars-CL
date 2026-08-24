import { TvSurface } from '@/components/tv';
import { getDisplayState, getEventId } from '@/lib/data/queries';
import { loadEventSnapshot, serverDb } from '@/lib/data/server';
import type { EventSnapshot } from '@/lib/data/snapshot';
import { EVENT_SLUG } from '@/lib/event';
import type { DisplayStateRow } from '@/lib/types';

/**
 * PROGRAM OUTPUT — what the room sees.
 *
 * The snapshot and the display row are both read on the server, so the very
 * first frame the wall paints already carries the right scene and a real score.
 * Waiting for a client fetch would mean a machine plugged in five minutes
 * before doors shows an empty canvas to the first people through them.
 *
 * `?event=<slug>` points the wall at a different event on the same deployment —
 * built for the rehearsal event, so a dry run can be watched on the production
 * URL without production data being touched. No parameter means the
 * deployment's own event, which is the only behaviour a venue machine ever
 * sees.
 *
 * Neither read is allowed to fail the route. If the database is cold or
 * unreachable at boot, the page still renders and `TvSurface` shows the standby
 * slate while its subscriptions retry — the wall comes up on its own, without
 * anyone finding a keyboard.
 */
export const revalidate = 0;
export const dynamic = 'force-dynamic';

/** Slugs are lowercase kebab; anything else falls back to the default event. */
function eventSlugFrom(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw && /^[a-z0-9-]{1,80}$/.test(raw) ? raw : EVENT_SLUG;
}

export default async function TvProgramPage({ searchParams }: PageProps<'/tv'>) {
  const params = await searchParams;
  const slug = eventSlugFrom(params.event);

  let snapshot: EventSnapshot | null = null;
  let display: DisplayStateRow | null = null;

  try {
    // Read the cut first so a pinned challenge/round shapes the very first
    // frame too. Loading the snapshot first and the pin second would paint one
    // frame of the auto-detected round before correcting itself.
    const db = await serverDb();
    display = await getDisplayState(db, await getEventId(db, slug));
    const payload = (display?.program_payload ?? {}) as Record<string, unknown>;
    const challengeId = typeof payload.challengeId === 'string' ? payload.challengeId : undefined;
    const roundId = typeof payload.roundId === 'string' ? payload.roundId : undefined;
    snapshot = await loadEventSnapshot({ slug, challengeId, roundId });
    display = snapshot.displayState ?? display;
  } catch {
    // The snapshot is the heavier read and the likelier one to fail. The scene
    // cut is a single small row, so it is still worth trying on its own — a wall
    // that comes up on the correct composition with figures filling in a moment
    // later is a far better failure than one that comes up on the wrong scene.
    try {
      const db = await serverDb();
      display = await getDisplayState(db, await getEventId(db, slug));
    } catch {
      display = null;
    }
  }

  return <TvSurface initialSnapshot={snapshot} initialDisplay={display} slug={slug} />;
}
