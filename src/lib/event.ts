/**
 * Active-event resolution.
 *
 * Every deployment serves exactly one event, named by NEXT_PUBLIC_EVENT_SLUG.
 * Resolving the slug to a UUID is a database round trip, so the mapping is
 * memoised for the lifetime of the process (an event's id never changes).
 *
 * This module is safe to import from both server and client code — it only
 * imports a *type* from supabase-js, never the runtime.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { EventRow } from '@/lib/types';

/**
 * A Supabase client of any provenance: the browser singleton, the request-bound
 * server client, or the service-role client. The generated database types file
 * is empty, so the schema generic stays at its `any` default.
 */
export type Db = SupabaseClient;

/** Slug of the event this deployment serves. */
export const EVENT_SLUG: string =
  process.env.NEXT_PUBLIC_EVENT_SLUG ?? 'swanlake-football-stars-2026';

/** Public origin, used to build QR targets and absolute links. */
export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';

/** Thrown when the configured slug matches no row in `events`. */
export class EventNotFoundError extends Error {
  constructor(public readonly slug: string) {
    super(
      `No event with slug "${slug}". Run the migrations in supabase/migrations ` +
        `or correct NEXT_PUBLIC_EVENT_SLUG.`,
    );
    this.name = 'EventNotFoundError';
  }
}

const idCache = new Map<string, string>();

/** Fetch the event row for a slug, or null when it does not exist. */
export async function getEventBySlug(
  db: Db,
  slug: string = EVENT_SLUG,
): Promise<EventRow | null> {
  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  idCache.set(slug, (data as EventRow).id);
  return data as EventRow;
}

/**
 * The active event's UUID. Cached permanently per slug — an event id is stable
 * for the life of the deployment, so this costs one query per process.
 */
export async function resolveEventId(
  db: Db,
  slug: string = EVENT_SLUG,
): Promise<string> {
  const cached = idCache.get(slug);
  if (cached) return cached;

  const { data, error } = await db
    .from('events')
    .select('id')
    .eq('slug', slug)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new EventNotFoundError(slug);

  const id = (data as { id: string }).id;
  idCache.set(slug, id);
  return id;
}

/** Drop the memoised slug → id mapping (tests, or after a re-seed). */
export function clearEventCache(): void {
  idCache.clear();
}
