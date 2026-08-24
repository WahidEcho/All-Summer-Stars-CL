import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * Every font-size step defined in `globals.css` under `@theme` as `--text-*`.
 *
 * `tailwind-merge` ships with the stock Tailwind scale (`text-sm`, `text-4xl`,
 * …) and classifies any *other* `text-<name>` as a text **colour**. Without
 * this list `twMerge('text-score-xl text-ink')` returns `'text-ink'` — the
 * size is silently deleted because it looks like a losing colour — which
 * collapses every oversized numeral, headline and eyebrow in the app back to
 * the inherited 16px. Teaching the merger the real scale restores both halves:
 * a size and a colour coexist, and a genuine size override still wins.
 *
 * Keep in sync with the `--text-*` tokens in `src/app/globals.css`.
 */
const FONT_SIZES = [
  'eyebrow',
  'label',
  'body',
  'lede',
  'h1',
  'h2',
  'h3',
  'display-sm',
  'display-md',
  'display-lg',
  'display-xl',
  'score-sm',
  'score-md',
  'score-lg',
  'score-xl',
  'score-2xl',
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [...FONT_SIZES] }],
    },
  },
});

/**
 * Compose conditional class names and resolve Tailwind conflicts.
 *
 * `clsx` flattens arrays/objects/falsy values, `tailwind-merge` makes sure the
 * last conflicting utility wins so callers can override component defaults:
 *
 *   cn('px-4 text-ink', condition && 'px-8')  ->  'text-ink px-8'
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export default cn;
