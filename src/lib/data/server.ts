/**
 * Server-only conveniences.
 *
 * Import this from server components and route handlers. It pulls in
 * `next/headers`, so it must never be imported from a client component —
 * client code uses `@/lib/data/queries` with the browser singleton instead.
 */

import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { Db } from '@/lib/event';
import { resolveEventId } from '@/lib/event';
import { getEventSnapshot, type EventSnapshot, type SnapshotOptions } from '@/lib/data/snapshot';

/** The request-bound Supabase client, typed as the shared `Db` alias. */
export async function serverDb(): Promise<Db> {
  return (await createClient()) as unknown as Db;
}

/** The service-role client. Server-side trusted work only. */
export function serviceDb(): Db {
  return createServiceClient() as unknown as Db;
}

/** The active event id, resolved with the request-bound client. */
export async function serverEventId(): Promise<string> {
  return resolveEventId(await serverDb());
}

/** One-call snapshot for a server component. */
export async function loadEventSnapshot(
  opts: SnapshotOptions = {},
): Promise<EventSnapshot> {
  return getEventSnapshot(await serverDb(), opts);
}
