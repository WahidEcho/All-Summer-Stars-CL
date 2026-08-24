import { TvSurface } from '@/components/tv';
import { getDisplayState } from '@/lib/data/queries';
import { loadEventSnapshot, serverDb, serverEventId } from '@/lib/data/server';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { DisplayStateRow } from '@/lib/types';

/**
 * PROGRAM OUTPUT — what the room sees.
 *
 * The snapshot and the display row are both read on the server, so the very
 * first frame the wall paints already carries the right scene and a real score.
 * Waiting for a client fetch would mean a machine plugged in five minutes
 * before doors shows an empty canvas to the first people through them.
 *
 * Neither read is allowed to fail the route. If the database is cold or
 * unreachable at boot, the page still renders and `TvSurface` shows the standby
 * slate while its subscriptions retry — the wall comes up on its own, without
 * anyone finding a keyboard.
 */
export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default async function TvProgramPage() {
  let snapshot: EventSnapshot | null = null;
  let display: DisplayStateRow | null = null;

  try {
    snapshot = await loadEventSnapshot();
    display = snapshot.displayState;
  } catch {
    // The snapshot is the heavier read and the likelier one to fail. The scene
    // cut is a single small row, so it is still worth trying on its own — a wall
    // that comes up on the correct composition with figures filling in a moment
    // later is a far better failure than one that comes up on the wrong scene.
    try {
      const db = await serverDb();
      display = await getDisplayState(db, await serverEventId());
    } catch {
      display = null;
    }
  }

  return <TvSurface initialSnapshot={snapshot} initialDisplay={display} />;
}
