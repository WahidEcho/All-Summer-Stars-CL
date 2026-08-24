'use client';

/**
 * The four public destinations.
 *
 * Rendered as a real `<nav>` with a real current-page marker, so keyboard and
 * screen-reader users get the same orientation the aqua underline gives
 * everyone else. On a phone the row scrolls rather than wrapping.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { useSnapshot } from '@/components/public/snapshot-context';
import { deriveLiveState } from '@/components/public/live-state';

interface NavItem {
  href: string;
  label: string;
}

const ITEMS: NavItem[] = [
  { href: '/', label: 'EVENT' },
  { href: '/live', label: 'LIVE' },
  { href: '/standings', label: 'STANDINGS' },
  { href: '/results', label: 'RESULTS' },
];

export function PublicNav({ className }: { className?: string }) {
  const pathname = usePathname();
  const snapshot = useSnapshot();
  const state = deriveLiveState(snapshot);

  return (
    <nav
      aria-label="Event sections"
      className={cn('-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0', className)}
    >
      <ul className="flex min-w-max items-stretch gap-1 sm:min-w-0">
        {ITEMS.map((item) => {
          const active =
            item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const showLiveDot = item.href === '/live' && state.isLive;

          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'u-label relative flex items-center gap-1.5 rounded-sm px-3 py-2.5 text-[0.6875rem] whitespace-nowrap transition-colors',
                  active
                    ? 'text-ink'
                    : 'text-text-muted hover:text-ink hover:bg-aqua-50',
                )}
              >
                {showLiveDot ? (
                  <span
                    aria-hidden
                    data-state-glyph
                    data-motion="loop"
                    className="text-live animate-live-pulse text-[0.5rem] leading-none"
                  >
                    ●
                  </span>
                ) : null}
                {item.label}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-x-2 -bottom-px h-[3px] rounded-pill transition-opacity',
                    active ? 'bg-aqua-500 opacity-100' : 'opacity-0',
                  )}
                />
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default PublicNav;
