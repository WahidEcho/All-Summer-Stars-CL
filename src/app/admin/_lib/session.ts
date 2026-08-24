import { redirect } from 'next/navigation';

import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { AppRole } from '@/lib/types';

/**
 * Who is driving the console.
 *
 * The proxy in `src/proxy.ts` already turns anonymous visitors away from
 * /admin, but a matcher is one edit away from silently letting a path through,
 * so every admin page resolves the operator for itself as well. Server actions
 * do the same check a third time — that one is the actual security boundary.
 */

export interface AdminSession {
  userId: string | null;
  email: string | null;
  role: AppRole;
  /** True when ALLOW_UNAUTHENTICATED_ADMIN opened the console without a user. */
  anonymous: boolean;
}

/** Roles allowed to mutate the event's configuration. */
const ADMIN_ROLES: AppRole[] = ['super_admin', 'event_admin'];

export function canAdminister(role: AppRole): boolean {
  return ADMIN_ROLES.includes(role);
}

function anonymousAdminAllowed(): boolean {
  return process.env.ALLOW_UNAUTHENTICATED_ADMIN === 'true';
}

const ANONYMOUS_SESSION: AdminSession = {
  userId: null,
  email: null,
  role: 'super_admin',
  anonymous: true,
};

/** The signed-in operator, or null when there is no usable session. */
export async function readAdminSession(): Promise<AdminSession | null> {
  let auth;
  try {
    auth = await createClient();
  } catch {
    return anonymousAdminAllowed() ? ANONYMOUS_SESSION : null;
  }

  const { data, error } = await auth.auth.getUser();
  if (error || !data?.user) {
    return anonymousAdminAllowed() ? ANONYMOUS_SESSION : null;
  }

  let role: AppRole = 'viewer';
  let email: string | null = data.user.email ?? null;

  try {
    const service = createServiceClient();
    const profile = await service
      .from('app_users')
      .select('email, role')
      .eq('id', data.user.id)
      .maybeSingle();

    const row = profile.data as { email?: string | null; role?: AppRole } | null;
    if (row?.role) role = row.role;
    if (row?.email) email = row.email;
  } catch {
    // No service key configured: fall back to the auth record alone. The page
    // still renders; every mutation will fail loudly and explain why.
  }

  return { userId: data.user.id, email, role, anonymous: false };
}

/**
 * The operator, or a redirect to the login screen.
 *
 * `nextPath` is remembered so signing in lands them back where they were
 * headed rather than on the dashboard.
 */
export async function requireStaff(nextPath: string): Promise<AdminSession> {
  const session = await readAdminSession();
  if (session) return session;
  redirect(`/admin/login?next=${encodeURIComponent(nextPath)}`);
}
