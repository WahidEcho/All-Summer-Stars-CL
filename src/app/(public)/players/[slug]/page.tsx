import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { PlayerProfile } from '@/app/(public)/players/[slug]/player-profile';
import { getPlayerBySlug } from '@/lib/data/queries';
import { serverDb } from '@/lib/data/server';
import { resolveEventId } from '@/lib/event';
import type { PlayerRow } from '@/lib/types';

/**
 * The player profile route.
 *
 * The shell is a server component for one reason: the page needs a real
 * `<title>` — a shared link should read "Youssef Kamal · SwanLake Football
 * Stars", not the generic event name — and metadata cannot come from a client
 * component. Everything live sits in `<PlayerProfile>`, which reads the same
 * snapshot context as the rest of the site.
 *
 * A missing slug is a genuine 404. A *failed read* is not: the database being
 * briefly unreachable must not turn a real player's page into "not found", so
 * the two cases are distinguished and only the first calls `notFound()`.
 */
export const revalidate = 0;

type Lookup =
  | { state: 'found'; player: PlayerRow }
  | { state: 'missing' }
  | { state: 'unavailable' };

async function lookup(slug: string): Promise<Lookup> {
  try {
    const db = await serverDb();
    const eventId = await resolveEventId(db);
    const player = await getPlayerBySlug(db, eventId, slug);
    return player ? { state: 'found', player } : { state: 'missing' };
  } catch {
    return { state: 'unavailable' };
  }
}

function nameOf(player: PlayerRow): string {
  return player.display_name?.trim() || player.full_name;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const found = await lookup(slug);

  if (found.state !== 'found') {
    return {
      title: 'Player',
      description:
        'Player points, rank and per-challenge breakdown from the SwanLake Football ' +
        'Stars Shores & Scores Challenge.',
    };
  }

  const name = nameOf(found.player);
  const description = `${name} — points, current rank and a per-challenge breakdown from the SwanLake Football Stars Shores & Scores Challenge.`;

  return {
    title: name,
    description,
    openGraph: {
      title: `${name} · SwanLake Football Stars`,
      description,
      type: 'profile',
      images: found.player.photo_url ? [found.player.photo_url] : undefined,
    },
  };
}

export default async function PlayerPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const found = await lookup(slug);

  if (found.state === 'missing') notFound();

  return (
    <PlayerProfile
      slug={slug}
      initialPlayer={found.state === 'found' ? found.player : null}
    />
  );
}
