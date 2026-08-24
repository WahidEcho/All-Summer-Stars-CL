'use client';

/**
 * The public masthead: the event mark, the four destinations, and the way onto
 * the TV output.
 *
 * Rendered as a real `<nav>` with a real current-page marker, so keyboard and
 * screen-reader users get the same orientation the aqua underline gives
 * everyone else. On a phone the row scrolls rather than wrapping.
 *
 * The mark links home and sits on every public page, so the competition
 * identity travels with the visitor — the deep pages (live, standings,
 * results) are where a QR scan usually lands, and they used to carry no
 * identity at all. The WATCH TV button opens the broadcast output itself:
 * anyone can put the show on a screen from their own device.
 */

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { cn } from '@/lib/cn';
import { EventMark } from '@/components/brand';
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
    <div
      className={cn(
        'flex flex-wrap items-center gap-x-4 gap-y-2 py-2',
        className,
      )}
    >
      <Link
        href="/"
        aria-label="SwanLake Football Stars — event home"
        className="shrink-0"
      >
        <EventMark variant="light" height={44} title="" priority />
      </Link>

      <nav
        aria-label="Event sections"
        className="-mx-4 min-w-0 flex-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
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

      <Link
        href="/tv"
        className="u-label bg-ink text-white hover:bg-navy focus-visible:outline-aqua-700 ml-auto flex shrink-0 items-center gap-2 rounded-pill px-4 py-2 text-[0.6875rem] whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span aria-hidden className={cn(state.isLive && 'text-live animate-live-pulse')}>
          ▶
        </span>
        WATCH LIVE TV
      </Link>
    </div>
  );
}

export default PublicNav;
