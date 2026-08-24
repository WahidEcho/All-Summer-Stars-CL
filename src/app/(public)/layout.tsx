import { SponsorTicker, StarField } from '@/components/brand';
import { ConnectionBadge } from '@/components/public/ConnectionBadge';
import { PublicNav } from '@/components/public/PublicNav';
import { ScoreAnnouncer } from '@/components/public/ScoreAnnouncer';
import { SnapshotProvider } from '@/components/public/snapshot-context';
import { loadEventSnapshot } from '@/lib/data/server';
import type { EventSnapshot } from '@/lib/data/snapshot';

/**
 * The spectator shell.
 *
 * The snapshot is fetched on the server so the first paint already carries a
 * real score — someone scanning the QR from the stands sees the match, not a
 * spinner. `SnapshotProvider` then takes over on the client and keeps it live.
 *
 * Every public page is anonymous and read-only; nothing here can mutate state.
 */
export const revalidate = 0;

export default async function PublicLayout({ children }: LayoutProps<'/'>) {
  let initial: EventSnapshot | null = null;
  try {
    initial = await loadEventSnapshot();
  } catch {
    // A cold or unreachable database must still render the shell — the client
    // retries and fills it in, rather than showing an error page to a crowd.
    initial = null;
  }

  return (
    <SnapshotProvider initial={initial}>
      {/* `overflow-x-clip` rather than `hidden`: the full-bleed rails inside
          (the nav and the challenge rail both use `-mx-4` and scroll
          horizontally on their own) otherwise drag the whole page sideways on
          a phone. `clip` contains them without turning the shell into a scroll
          container, so sticky positioning inside still works. */}
      <div className="relative flex min-h-dvh flex-col overflow-x-clip">
        <StarField
          variant="live"
          intensity="subtle"
          className="pointer-events-none fixed inset-0 -z-10"
        />

        <PublicNav />

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-4 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="border-border-subtle/60 bg-surface-raised/80 fixed inset-x-0 bottom-0 z-30 border-t backdrop-blur">
          <SponsorTicker sponsors={initial?.sponsors} height={56} />
        </footer>

        <ConnectionBadge />
        <ScoreAnnouncer />
      </div>
    </SnapshotProvider>
  );
}
