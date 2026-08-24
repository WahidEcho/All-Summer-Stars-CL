import { NextResponse } from 'next/server';
import { serverDb } from '@/lib/data/server';
import { getEvent } from '@/lib/data/queries';
import { EVENT_SLUG } from '@/lib/event';

export const dynamic = 'force-dynamic';

/**
 * Event-day health check.
 *
 * Answers one question fast: can this deployment actually reach the event data?
 * A misconfigured environment otherwise shows up only as a public page stuck on
 * "Connecting to the live event", which tells an operator nothing at 8pm with a
 * crowd waiting.
 *
 * It reports which variables are present and whether the database answered. It
 * never returns a key — only whether one is configured, and the project host,
 * which is public anyway.
 */
export async function GET() {
  const env = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? null,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    SUPABASE_SERVICE_ROLE_KEY: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY),
    NEXT_PUBLIC_EVENT_SLUG: process.env.NEXT_PUBLIC_EVENT_SLUG ?? null,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL ?? null,
  };

  const missing = [
    !env.NEXT_PUBLIC_SUPABASE_URL && 'NEXT_PUBLIC_SUPABASE_URL',
    !env.NEXT_PUBLIC_SUPABASE_ANON_KEY && 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    !env.SUPABASE_SERVICE_ROLE_KEY && 'SUPABASE_SERVICE_ROLE_KEY',
  ].filter(Boolean) as string[];

  let database: { ok: boolean; eventFound?: boolean; error?: string } = { ok: false };

  if (missing.length === 0) {
    try {
      const event = await getEvent(await serverDb(), EVENT_SLUG);
      database = { ok: true, eventFound: Boolean(event) };
    } catch (error) {
      database = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  } else {
    database = { ok: false, error: 'skipped — environment incomplete' };
  }

  const healthy = missing.length === 0 && database.ok && database.eventFound === true;

  return NextResponse.json(
    {
      healthy,
      missingEnv: missing,
      // NEXT_PUBLIC_* values are inlined at build time, so a variable added in
      // the dashboard after the last build reads as absent until a redeploy.
      hint: missing.length
        ? 'Set the missing variables, then REDEPLOY — NEXT_PUBLIC_* values are baked in at build time.'
        : undefined,
      env: {
        supabaseUrl: env.NEXT_PUBLIC_SUPABASE_URL,
        anonKeyConfigured: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
        serviceRoleConfigured: env.SUPABASE_SERVICE_ROLE_KEY,
        eventSlug: env.NEXT_PUBLIC_EVENT_SLUG,
        siteUrl: env.NEXT_PUBLIC_SITE_URL,
      },
      database,
    },
    { status: healthy ? 200 : 503 },
  );
}
