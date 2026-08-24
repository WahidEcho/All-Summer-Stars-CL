import type { Metadata, Viewport } from 'next';

/**
 * The broadcast shell.
 *
 * Everything under `/tv` is output, not a page: no navigation, no scroll, no
 * spectator chrome. The shell pins itself to the viewport and clips, because
 * `BroadcastStage` inside it is a fixed 1920x1080 canvas that scales to fit —
 * a scrollbar appearing on an LED wall would shift the whole composition.
 *
 * The matte behind the canvas is ink rather than the light page field: on a
 * 16:9 wall it is never visible, and on any other aspect ratio it reads as a
 * deliberate frame instead of a mis-sized page.
 */
export const metadata: Metadata = {
  title: 'Broadcast output',
  description: 'Live broadcast output for the SwanLake Football Stars LED wall.',
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#231F20',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/** Never cached: the wall must always negotiate a fresh first frame. */
export const revalidate = 0;
export const dynamic = 'force-dynamic';

export default function TvLayout({ children }: LayoutProps<'/tv'>) {
  return (
    <div
      data-tv-shell
      className="bg-ink fixed inset-0 z-50 overflow-hidden overscroll-none select-none"
    >
      {children}
    </div>
  );
}
