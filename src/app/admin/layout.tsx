import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { EVENT_SLUG } from '@/lib/event';
import { getEvent } from '@/lib/data/queries';
import { serviceDb } from '@/lib/data/server';
import { AdminShell } from '@/components/admin';
import { readAdminSession } from '@/app/admin/_lib/session';

export const metadata: Metadata = {
  title: 'Control center',
  robots: { index: false, follow: false },
};

/**
 * Every admin surface is read at the moment it is opened. Nothing here may be
 * cached: a cached team sheet or a cached scene would be a lie told to the
 * person running the event.
 */
export const dynamic = 'force-dynamic';

/**
 * The frame around the whole console — including `/admin/controller`, which is
 * owned by the scoring surface. `AdminShell` picks its own mode from the path,
 * so the controller gets a slim bar and the full width of the tablet without
 * this layout needing to know anything about it.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const session = await readAdminSession();

  let eventName = 'SwanLake Football Stars';
  let eventStatus: string | null = null;

  try {
    const event = await getEvent(serviceDb(), EVENT_SLUG);
    if (event) {
      eventName = event.name;
      eventStatus = event.status;
    }
  } catch {
    // An unconfigured or unreachable database must not blank the console —
    // the login screen and the setup pages are exactly where that gets fixed.
  }

  return (
    <AdminShell
      eventName={eventName}
      eventStatus={eventStatus}
      email={session?.email ?? null}
      role={session?.role ?? null}
      anonymous={session?.anonymous ?? false}
    >
      {children}
    </AdminShell>
  );
}
