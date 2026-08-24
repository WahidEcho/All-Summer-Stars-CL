import type { Metadata } from 'next';

import { EventMark, StarField } from '@/components/brand';
import { LoginForm } from '@/components/admin';

export const metadata: Metadata = {
  title: 'Sign in',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

/**
 * The gate.
 *
 * A signed-in operator never sees this page — the proxy sends them straight on
 * to whatever they asked for — so it only ever renders for someone who has to
 * type a password, and it stays deliberately quiet: one card, event identity,
 * nothing to read.
 */
export default async function AdminLoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.next;
  const requested = Array.isArray(raw) ? raw[0] : raw;
  // Only ever bounce back into this app's own admin tree.
  const next = requested && requested.startsWith('/admin') ? requested : '/admin';

  return (
    <div className="relative flex min-h-full flex-1 items-center justify-center overflow-hidden px-4 py-16">
      <StarField variant="live" intensity="subtle" className="absolute inset-0" />

      <div className="relative w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <EventMark variant="primary" className="w-44" />
          <div className="space-y-1">
            <h1 className="u-display text-ink text-[1.75rem]">Control center</h1>
            <p className="text-text-secondary text-[0.875rem]">
              Staff sign-in for the Shores &amp; Scores Challenge.
            </p>
          </div>
        </div>

        <div className="bg-surface-raised ring-border-subtle rounded-lg px-6 py-7 shadow-card ring-1">
          <LoginForm next={next} />
        </div>

        <p className="text-text-muted text-center text-[0.75rem] leading-body">
          Accounts are created by the event administrator. If you cannot get in, ask them
          to check your role in <span className="u-tabular">app_users</span>.
        </p>
      </div>
    </div>
  );
}
