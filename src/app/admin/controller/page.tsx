import type { Metadata } from 'next';

import type { EventSnapshot } from '@/lib/data/snapshot';
import { loadEventSnapshot } from '@/lib/data/server';
import { ControllerConsole } from '@/app/admin/controller/ControllerConsole';

export const metadata: Metadata = {
  title: 'Active score controller',
  robots: { index: false, follow: false },
};

/**
 * Never cached, never prerendered. A cached scoring console would be a lie told
 * to the one person who cannot afford to be told one.
 */
export const dynamic = 'force-dynamic';

/**
 * The courtside scoring tool.
 *
 * The server renders the first snapshot so the tablet opens on a real event
 * rather than a spinner — on a beach, on borrowed wifi, the difference is
 * measured in whole seconds. Everything after that is the client's: a realtime
 * subscription keeps the snapshot fresh, the controller lease decides whether
 * this device may touch it, and every mutation goes through one command runner.
 *
 * If the database cannot be reached at render time the console still mounts and
 * retries from the client, because the failure is usually the wifi rather than
 * the event.
 */
export default async function ControllerPage() {
  let snapshot: EventSnapshot | null = null;
  try {
    snapshot = await loadEventSnapshot();
  } catch {
    // The console renders its own unreachable state and retries from there.
    snapshot = null;
  }

  return <ControllerConsole initialSnapshot={snapshot} />;
}
