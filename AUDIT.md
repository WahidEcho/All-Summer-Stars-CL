# Build verification — SwanLake Football Stars

Independently verified on 24 August 2026, against the live Supabase project
(`shcnieqwzxwswtcwfigw`, eu-west-1) and a running dev server. Every result below was
re-run rather than taken from an agent's report.

## Bottom line

The platform is complete and sound. All four quality gates pass, all 21 routes serve,
and the surfaces render correctly against real data. What remains is content Mohamed
supplies (player photos, real team names, the production URL), not engineering.

## Gates

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | 0 errors |
| `npm test` | 196 passed / 196, 3 files |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run build` | Succeeds — 21 routes |

## Route smoke test

| Route | Status |
|---|---|
| `/`, `/live`, `/standings`, `/results`, `/players/[slug]` | 200 |
| `/tv`, `/tv/preview?scene=…` (all 9 scenes) | 200 |
| `/admin/login` | 200 |
| `/admin`, `/admin/setup/*` | 307 → login (auth gate working as intended) |

## Completeness

| Deliverable | Status |
|---|---|
| Database schema, RLS, realtime, storage | 4 migrations applied and verified |
| Scoring engine | Complete, 196 tests, no defects found |
| Data layer (queries, snapshot, hooks, ~40 actions) | Complete |
| Design system (brand, player cards, UI primitives) | Complete |
| Public dashboard (5 routes) | Complete |
| TV broadcast (9 scenes + program/preview routes) | Complete |
| Score controller (all 5 mechanics + shootout) | Complete |
| Admin center (11 routes) | Complete |

## Defects found and fixed

1. **`cn()` silently deleted every custom font-size class.** `tailwind-merge` was
   unconfigured for this theme, so it classified `text-score-md`, `text-h2` and every
   other `--text-*` token as a *text-colour* utility and dropped it whenever a colour
   followed in the same call. Verified directly: stock `twMerge('text-score-md text-ink')`
   returns `'text-ink'`. Every oversized numeral on the LED wall would have collapsed to
   inherited 16px. Fixed in `src/lib/cn.ts` with `extendTailwindMerge`; confirmed the size
   now survives and a genuine size override still wins.
2. **`penalty_attempts` had no `reverses_id` column** while `attempts` and `goals` both
   did, so a reversed shootout kick could not be linked to the correction that undid it.
   Migration `0004_penalty_reversal_link.sql`, applied.
3. **A controller command returned `void` where its interface promised `boolean`**, so a
   rejected write would still have advanced the operator to the next attempt slot.
4. **Staff had UPDATE/DELETE on `score_events` and `player_points_ledger`**, contradicting
   the never-delete-history rule. Migration `0003` reduced both to insert-and-read.
5. **`TeamScoreStrip` declared `shortName` but never rendered it**, clipping "TEAM A" to
   "TEA…" on a phone. Now used at narrow widths.
6. **Missing `@/components/admin` barrel** — two admin routes could not resolve their imports.

## Independently re-verified claims

- **Brand asset crops.** `brand-assets.ts` claims its crop boxes were measured by
  rasterising each file. That claim was the highest-risk unverified assertion in the
  project — a wrong crop puts a mis-positioned sponsor logo on the LED wall. I re-measured
  all nine assets by rasterising to canvas and scanning for ink. Every sponsor crop matches
  within 0.02, and the three event marks are deliberate insets into full-bleed compositions.
  The claim holds.
- **Shootout logic.** An independent FIFA-rule reference simulator
  (`src/lib/scoring/__probe.test.ts`) cross-checks `computeShootoutState` against a
  separately-written implementation. It agrees.

## Known cosmetic notes

- The dark circle overlapping the sponsor ticker in screenshots is the Next.js dev-mode
  indicator, not application UI. It does not appear in a production build.
- Player cards currently show branded initials because no photos have been uploaded. This
  is the designed fallback, not a failure.

## What Mohamed still needs to supply

1. **Ten player cut-out photos** — transparent PNG, ≥2000px tall, waist-up, facing camera,
   consistent lighting. Upload at `/admin/setup/players`, then set each focal point so faces
   are never cropped badly. design_2.md is right that photography drives roughly half the
   premium feel; the placeholders work but they are placeholders.
2. **Real team names and colours** — `/admin/setup/teams`.
3. **The production URL**, so the QR points somewhere permanent. Set it at
   `/admin/setup/event`; it must never point at a preview deployment.
4. **Re-exported logo masters.** Three sponsor files are raster images wrapped in SVG
   rather than true vectors — `tellr.svg` is 1.6 MB, which is heavy to load on the LED wall,
   and `move-beyond-aqua.svg` and `hassan-allam.svg` carry embedded rasters. They render
   correctly today; tight transparent vector re-exports would be better for the venue.
5. **Scoring profile sign-off** — review and lock at `/admin/setup/scoring`, including which
   of the three final-match goal-point modes the event will use.
