# SwanLake Football Stars — Shores & Scores Challenge

Live competition platform for the SwanLake Football Stars event at SwanLake North Coast,
Thursday 27 August 2026.

Four synchronized surfaces read from one authoritative event state:

| Surface | Route | Who uses it |
|---|---|---|
| Public dashboard | `/` | Spectators, reached by scanning the QR |
| TV / LED broadcast | `/tv` | The big screen at the venue |
| Admin Control Center | `/admin` | Event admin — setup, display control, ceremony, audit |
| Active Score Controller | `/admin/controller` | Scorekeeper, courtside on a tablet |

## Competition format

Two teams of five players, competing in slots A1–A5 and B1–B5.

| # | Challenge | Format | Scoring |
|---|---|---|---|
| 1 | Mannequin Target | 5 × 1v1, 3 shots each | Target 10 = 1, Target 30 = 3, Target 50 = 5 |
| 2 | Dribble & Finish | 5 × 1v1, 3 attempts each, alternating | Dribble under 15s = 2, goal = 3, max 5 per attempt |
| 3 | Long-Range Shooting | 5 × 1v1, 3 shots each | Green 100 = 10, Blue 50 = 5, Red 30 = 3, Red 20 = 2 |
| 4 | Centre Circle Accuracy | 5 × 1v1, 10 balls in 60s each | 1 point per ball landing in the centre circle |
| 5 | Final Match | One 5v5 match, 2 × 20 minutes | Goal points by the selected mode — see below |

Rounds pair by slot: A1 v B1 through A5 v B5. Every point value above is a **default**, stored in
the `scoring_profiles` row and editable in `/admin/setup/scoring` — nothing is hardcoded.

### Final-match goal points

Before the final match starts, the admin picks one of three modes. All values are editable.

| Mode | Effect |
|---|---|
| `team_share` | Every player on the scoring team receives the same points (default 10 each) |
| `scorer_only` | Only the scorer receives points (default 10) |
| `scorer_plus_team` | The scorer receives the full amount (default 10), each teammate a smaller one (default 5) |

An own goal credits the benefiting team but does not reward the player who scored it.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in your Supabase values
npm run migrate              # applies supabase/migrations in order
npm run dev
```

### Environment variables

See `.env.example`. `SUPABASE_DB_URL` must be the **session pooler** connection string
(`aws-1-<region>.pooler.supabase.com:5432`) — the direct `db.<ref>.supabase.co` host is
IPv6-only and will not resolve on most networks.

### Creating a staff user

Create the user in Supabase Auth, then grant a role:

```sql
insert into app_users (id, email, display_name, role)
select id, email, 'Full Name', 'super_admin'
from auth.users where email = 'person@example.com'
on conflict (id) do update set role = excluded.role;
```

Roles: `super_admin`, `event_admin`, `scorekeeper`, `display_operator`, `viewer`.
Scorekeepers and above can score; display operators control the TV scenes but cannot change a score.

## Architecture

- **Event sourcing.** Every score action appends to `score_events` and `player_points_ledger`.
  Player totals are the sum of confirmed ledger entries — never a stored counter. Undo appends a
  reversal; nothing is ever deleted.
- **Pure scoring engine.** All competition rules live in `src/lib/scoring/engine.ts`, with no
  database or React dependency, covered by `src/lib/scoring/engine.test.ts`.
- **Server-anchored timers.** `timers` rows store a start timestamp and accumulated milliseconds.
  Clients render a smooth local clock and reconcile against the server, so a refresh or reconnect
  never restarts or duplicates a timer.
- **Single Active Score Controller.** One device holds a lease (15s expiry, renewed every 5s).
  Other devices are visibly read-only and can request a transfer.
- **Nothing auto-submits.** When a timer expires the round enters `awaiting_result` and the public
  screens show a verification state until the admin submits the official score.
- **Realtime.** Supabase `postgres_changes` drives the public and TV surfaces. On disconnect they
  keep the last confirmed state on screen — they never blank out or reset to zero.

```
src/
  app/            (public)/ · admin/ · admin/controller/ · tv/
  components/     brand/ · player/ · ui/ · admin/ · controller/ · public/ · tv/
  lib/
    scoring/      engine.ts + engine.test.ts   ← all competition rules
    data/         typed queries
    hooks/        realtime + timer + lease hooks
    actions/      server actions (every mutation)
    supabase/     browser and server clients
    types.ts      domain + row types, mirrors the schema
supabase/migrations/
  0001_core_schema.sql    tables, indexes, RLS, realtime, storage
  0002_seed_event.sql     the event, teams, players, challenges, sponsors
```

## Commands

```bash
npm run dev       # local dev server
npm test          # scoring engine test suite
npm run build     # production build
npm run migrate   # apply migrations to Supabase
npm run lint
```

## Deployment

Repository: `WahidEcho/All-Summer-Stars-CL` (private)
Vercel project: `swanlake-football-stars` → https://swanlake-football-stars.vercel.app

Every push to `main` deploys automatically. Functions run in `dub1` (Dublin) so they sit
beside the Supabase project in eu-west-1 — see `vercel.json`.

### One-time: environment variables

The deployment serves, but shows no data until the Supabase credentials are set. From this
directory:

```bash
vercel login && vercel link && npm run vercel:env && vercel --prod
```

`npm run vercel:env` reads `.env.local` and uploads each value to production, preview and
development, so no secret has to be pasted by hand. Alternatively add them under
Project → Settings → Environment Variables: `NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_EVENT_SLUG`,
`NEXT_PUBLIC_SITE_URL`.

Then point the QR at the production origin in `/admin/setup/event` — it must never point
at a preview URL.

For a custom domain, add a CNAME in the Zoho DNS zone pointing at Vercel.

## Rehearsals — never test against the live event

There are two events in the database:

| Slug | Purpose |
|---|---|
| `swanlake-football-stars-2026` | The real event. Only real scoring goes here. |
| `swanlake-rehearsal` | Training and testing. Same teams, same roster, same photos. |

A deployment serves whichever event `NEXT_PUBLIC_EVENT_SLUG` names, so point a preview
deployment (or a local session) at the rehearsal and production is unreachable from it:

```bash
NEXT_PUBLIC_EVENT_SLUG=swanlake-rehearsal npm run dev
```

Rebuild the rehearsal event at any time — it re-clones structure and roster from the production
event and never writes to it:

```bash
psql "$SUPABASE_DB_URL" -f supabase/migrations/0005_rehearsal_event.sql
```

This split exists because it was learned the hard way: a test run once wrote an entire fabricated
tournament onto the public site while an operator was scoring a real one on a tablet.

## Before the event

- Upload the ten player cut-outs and set each player's focal point.
- Set team names and colours.
- Review and lock the scoring profile, including the final-match goal-points mode.
- Lock the Challenge 1 lineup.
- Scan the QR from the venue floor at near, mid and far distance.
- Check the sponsor ticker order and that logos keep their original colours.
- Run a full dress rehearsal on the real LED and venue network.
