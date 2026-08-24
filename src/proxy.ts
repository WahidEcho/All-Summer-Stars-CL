/**
 * Session refresh and the /admin gate.
 *
 * In Next.js 16 the `middleware` file convention was renamed to `proxy` — same
 * hook, same lifecycle, Node runtime by default. This file is the Next 16
 * spelling of what older projects call `middleware.ts`.
 *
 * Two jobs:
 *
 * 1. Refresh the Supabase auth cookie on every request. Server Components
 *    cannot write cookies, so without this pass a token that expires mid-event
 *    would sign the scorekeeper out between one round and the next.
 * 2. Send anonymous visitors away from /admin, before any admin page renders.
 *
 * This gate is a convenience, not the security boundary. Server Functions are
 * POSTed to the route that uses them and a matcher change can silently drop
 * coverage, so every action re-checks the actor and its role for itself in
 * `src/lib/actions/_command.ts`. Public surfaces — the audience site and the TV
 * output — are deliberately untouched: they must render for anyone, instantly.
 */

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Admin paths that must stay reachable without a session. */
const PUBLIC_ADMIN_PATHS = ['/admin/login', '/admin/auth'];

/**
 * Local development escape hatch, matching the one in `_command.ts`: with
 * ALLOW_UNAUTHENTICATED_ADMIN=true the console opens before any staff user
 * exists. It must never be set in production.
 */
function anonymousAdminAllowed(): boolean {
  return process.env.ALLOW_UNAUTHENTICATED_ADMIN === 'true';
}

export async function proxy(request: NextRequest): Promise<NextResponse> {
  // The response is rebuilt whenever Supabase rotates a cookie, so the refreshed
  // token travels back to the browser on this same request.
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Without credentials there is no session to refresh and no way to check one;
  // failing open here keeps the public site up while the env is being fixed.
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value);
        }
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options);
        }
      },
    },
  });

  // getUser() — not getSession() — because only this validates the token with
  // the auth server and triggers the refresh.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isAdminPath = pathname === '/admin' || pathname.startsWith('/admin/');
  const isPublicAdminPath = PUBLIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );

  if (isAdminPath && !isPublicAdminPath && !user && !anonymousAdminAllowed()) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/admin/login';
    loginUrl.search = '';
    // Remember where they were headed so login can put them back there.
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // A signed-in operator landing on the login screen belongs in the console.
  if (user && pathname === '/admin/login') {
    const target = request.nextUrl.clone();
    const requested = request.nextUrl.searchParams.get('next');
    target.pathname = requested && requested.startsWith('/admin') ? requested : '/admin';
    target.search = '';
    return NextResponse.redirect(target);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Every path except Next's own assets, the favicon and image files. The
     * public pages still pass through so their session cookie stays fresh —
     * a spectator who signs in on their phone keeps that session alive.
     */
    '/((?!_next/static|_next/image|favicon.ico|brand/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|woff2?)$).*)',
  ],
};
