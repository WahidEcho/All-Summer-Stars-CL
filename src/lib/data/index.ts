/**
 * Client-safe data barrel.
 *
 * Re-exports the query and snapshot layer only. The server-only helpers live in
 * `@/lib/data/server` and are deliberately not re-exported here.
 */

export * from '@/lib/data/queries';
export * from '@/lib/data/snapshot';
export { EVENT_SLUG, SITE_URL, EventNotFoundError, clearEventCache } from '@/lib/event';
export type { Db } from '@/lib/event';
