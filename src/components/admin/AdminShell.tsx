'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { cn } from '@/lib/cn';
import { supabase } from '@/lib/supabase/client';
import type { AppRole } from '@/lib/types';
import { StatusPill } from '@/components/ui';
import { AdminButton } from '@/components/admin/Button';

export interface AdminShellProps {
  eventName: string;
  eventStatus: string | null;
  email: string | null;
  role: AppRole | null;
  /** True when ALLOW_UNAUTHENTICATED_ADMIN is opening the console. */
  anonymous: boolean;
  children: React.ReactNode;
}

interface NavItem {
  href: string;
  label: string;
  /** Short all-caps tag on the right of the row. */
  tag?: string;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV: NavGroup[] = [
  {
    label: 'Run the show',
    items: [
      { href: '/admin', label: 'Dashboard' },
      { href: '/admin/controller', label: 'Scoring controller', tag: 'LIVE' },
      { href: '/admin/display', label: 'Display control' },
      { href: '/admin/challenges', label: 'Challenges' },
      { href: '/admin/ceremony', label: 'Ceremony' },
    ],
  },
  {
    label: 'Setup',
    items: [
      { href: '/admin/setup/event', label: 'Event' },
      { href: '/admin/setup/teams', label: 'Teams' },
      { href: '/admin/setup/players', label: 'Players' },
      { href: '/admin/setup/lineups', label: 'Lineups' },
      { href: '/admin/setup/scoring', label: 'Scoring profile' },
      { href: '/admin/setup/sponsors', label: 'Sponsors' },
    ],
  },
  {
    label: 'Record',
    items: [{ href: '/admin/audit', label: 'Audit & exports' }],
  },
];

const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: 'Super admin',
  event_admin: 'Event admin',
  scorekeeper: 'Scorekeeper',
  display_operator: 'Display operator',
  viewer: 'Viewer — read only',
};

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') return pathname === '/admin';
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The console chrome.
 *
 * Three modes, chosen from the path rather than from a prop, so the layout can
 * stay a server component and every admin route gets the right frame:
 *
 *  - `/admin/login` renders bare — no navigation before there is a session.
 *  - `/admin/controller` renders a slim bar only: the scoring console needs the
 *    full width of the tablet and its own controls own the screen.
 *  - everything else gets the sidebar.
 */
export function AdminShell({
  eventName,
  eventStatus,
  email,
  role,
  anonymous,
  children,
}: AdminShellProps) {
  const pathname = usePathname() ?? '/admin';
  const router = useRouter();
  // The drawer is remembered against the route it was opened on, so any
  // navigation — a link, the back button, a redirect — closes it by derivation
  // rather than by an effect firing a frame after the new page has painted.
  const [drawerRoute, setDrawerRoute] = useState<string | null>(null);
  const drawerOpen = drawerRoute === pathname;
  const setDrawerOpen = useCallback(
    (next: boolean | ((open: boolean) => boolean)) => {
      setDrawerRoute((route) => {
        const open = typeof next === 'function' ? next(route === pathname) : next;
        return open ? pathname : null;
      });
    },
    [pathname],
  );
  const [signingOut, setSigningOut] = useState(false);

  const bare = pathname === '/admin/login' || pathname.startsWith('/admin/login/');
  const slim = pathname === '/admin/controller' || pathname.startsWith('/admin/controller/');

  async function signOut(): Promise<void> {
    setSigningOut(true);
    try {
      await supabase().auth.signOut();
    } catch {
      // Even a failed sign-out should land the operator on the login screen.
    } finally {
      router.replace('/admin/login');
      router.refresh();
    }
  }

  if (bare) {
    return <div className="flex min-h-full flex-1 flex-col">{children}</div>;
  }

  const identity = (
    <div className="flex items-center gap-3">
      {anonymous ? (
        <StatusPill label="OPEN CONSOLE — NO SIGN-IN" tone="draw" size="sm" />
      ) : (
        <span className="text-text-muted hidden text-[0.75rem] sm:block">
          {email ?? 'Signed in'}
          {role ? ` · ${ROLE_LABEL[role]}` : null}
        </span>
      )}
      <AdminButton size="sm" variant="ghost" busy={signingOut} onClick={() => void signOut()}>
        Sign out
      </AdminButton>
    </div>
  );

  if (slim) {
    return (
      <div className="flex min-h-full flex-1 flex-col">
        <header className="border-border-subtle bg-surface-raised flex items-center justify-between gap-4 border-b px-4 py-2">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/admin"
              className="u-label text-aqua-800 text-eyebrow hover:text-aqua-900"
            >
              ← Control center
            </Link>
            <span className="text-text-muted truncate text-[0.75rem]">{eventName}</span>
          </div>
          {identity}
        </header>
        <div className="flex flex-1 flex-col">{children}</div>
      </div>
    );
  }

  const nav = (
    <nav aria-label="Admin sections" className="space-y-6">
      {NAV.map((group) => (
        <div key={group.label} className="space-y-1.5">
          <p className="u-eyebrow text-text-muted text-eyebrow px-3">{group.label}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center justify-between gap-2 rounded-md px-3 py-2.5',
                      'text-[0.875rem] transition-colors duration-[var(--dur-instant)]',
                      active
                        ? 'bg-aqua-100 text-aqua-900 font-semibold'
                        : 'text-text-secondary hover:bg-mist hover:text-ink',
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        aria-hidden
                        className={cn(
                          'inline-block size-1.5 shrink-0 rounded-pill',
                          active ? 'bg-aqua-700' : 'bg-slate',
                        )}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.tag ? (
                      <span className="u-label text-live text-[0.5625rem]">{item.tag}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      <div className="border-border-subtle space-y-1.5 border-t pt-4">
        <p className="u-eyebrow text-text-muted text-eyebrow px-3">Audience surfaces</p>
        <ul className="space-y-0.5">
          {[
            { href: '/tv', label: 'TV output (program)' },
            { href: '/tv/preview', label: 'TV output (preview)' },
            { href: '/', label: 'Public dashboard' },
          ].map((item) => (
            <li key={item.href}>
              <a
                href={item.href}
                target="_blank"
                rel="noreferrer"
                className="text-text-secondary hover:bg-mist hover:text-ink flex items-center justify-between gap-2 rounded-md px-3 py-2.5 text-[0.875rem]"
              >
                <span className="truncate">{item.label}</span>
                <span aria-hidden className="text-text-muted text-[0.75rem]">
                  ↗
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );

  return (
    <div className="bg-surface flex min-h-full flex-1 flex-col">
      <header className="border-border-subtle bg-surface-raised sticky top-0 z-30 flex items-center justify-between gap-4 border-b px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setDrawerOpen((open) => !open)}
            aria-expanded={drawerOpen}
            aria-controls="admin-drawer"
            className="ring-border text-ink hover:bg-mist inline-flex size-10 items-center justify-center rounded-md ring-1 lg:hidden"
          >
            <span aria-hidden className="text-[1rem]">
              ☰
            </span>
            <span className="u-sr-only">Toggle navigation</span>
          </button>

          <Link href="/admin" className="flex min-w-0 items-center gap-2.5">
            <span
              aria-hidden
              className="bg-aqua-400 text-navy u-label inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[0.6875rem]"
            >
              SF
            </span>
            <span className="min-w-0">
              <span className="u-label text-ink block truncate text-[0.8125rem]">
                {eventName}
              </span>
              <span className="u-eyebrow text-text-muted block text-[0.5625rem]">
                Control center
              </span>
            </span>
          </Link>

          {eventStatus ? (
            <StatusPill
              label={eventStatus.toUpperCase()}
              tone={
                eventStatus === 'live'
                  ? 'live'
                  : eventStatus === 'completed' || eventStatus === 'locked'
                    ? 'winner'
                    : 'neutral'
              }
              size="sm"
              className="hidden sm:inline-flex"
            />
          ) : null}
        </div>

        {identity}
      </header>

      <div className="flex flex-1">
        <aside
          id="admin-drawer"
          className={cn(
            'border-border-subtle bg-surface-raised w-64 shrink-0 border-r px-3 py-6',
            'lg:block',
            drawerOpen ? 'fixed inset-y-0 left-0 z-40 mt-[3.75rem] overflow-y-auto' : 'hidden',
          )}
        >
          {nav}
        </aside>

        {drawerOpen ? (
          <div
            aria-hidden
            onClick={() => setDrawerOpen(false)}
            className="bg-surface-scrim fixed inset-0 z-30 mt-[3.75rem] lg:hidden"
          />
        ) : null}

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export default AdminShell;
