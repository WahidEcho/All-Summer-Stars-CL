'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser Supabase client. Public surfaces read with the anon key; admin
 * surfaces use the same client once the user has a session.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

let browserClient: ReturnType<typeof createBrowserClient> | null = null;

/** Shared singleton so every hook subscribes over one realtime socket. */
export function supabase() {
  if (!browserClient) browserClient = createClient();
  return browserClient;
}
