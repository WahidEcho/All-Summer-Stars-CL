import type { Metadata, Viewport } from 'next';
import { Anton, Archivo, Inter } from 'next/font/google';
import './globals.css';

/**
 * Display face — SwanLake Football Stars headlines, player surnames, VS
 * lockups and every oversized word on the LED wall.
 *
 * Anton is a single-weight condensed grotesque with very tall x-height and
 * closed apertures, which is exactly what survives being read from 30 m away
 * on a daylight-washed beach screen. It also sits closest to the condensed
 * italic sports lettering in the competition logo.
 */
const anton = Anton({
  variable: '--font-anton',
  subsets: ['latin'],
  weight: '400',
  display: 'swap',
  preload: true,
});

/**
 * Numeral face — scores, totals, clocks, countdowns, jersey numbers.
 *
 * Archivo is variable on both `wght` and `wdth`, so a score can be pushed to
 * 800/75% (heavy, condensed, unmistakable) while a clock stays at 700/80%
 * where the colon does not blob. Archivo ships true tabular figures, so the
 * digits never reflow while a clock counts or a total rolls.
 */
const archivo = Archivo({
  variable: '--font-archivo',
  subsets: ['latin'],
  axes: ['wdth'],
  display: 'swap',
  preload: true,
});

/** UI face — labels, captions, admin surfaces, body copy. */
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
  preload: true,
});

export const metadata: Metadata = {
  title: {
    default: 'SwanLake Football Stars — Shores & Scores Challenge',
    template: '%s · SwanLake Football Stars',
  },
  description:
    'Live scores, player rankings and the final 5v5 from the SwanLake Football Stars ' +
    'Shores & Scores Challenge at SwanLake North Coast.',
  applicationName: 'SwanLake Football Stars',
  formatDetection: { telephone: false, date: false, address: false, email: false },
  openGraph: {
    title: 'SwanLake Football Stars — Shores & Scores Challenge',
    description: 'Live scores and player rankings from SwanLake North Coast.',
    type: 'website',
  },
};

export const viewport: Viewport = {
  themeColor: '#90C6CB',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      className={`${anton.variable} ${archivo.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="bg-surface text-text-primary flex min-h-full flex-col font-sans">
        {children}
      </body>
    </html>
  );
}
