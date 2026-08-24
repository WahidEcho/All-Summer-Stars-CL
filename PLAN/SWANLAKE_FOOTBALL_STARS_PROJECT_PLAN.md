# SwanLake Football Stars / Shores & Scores Challenge

## Live Competition Platform — Comprehensive Product, Design, Architecture, and Delivery Plan

**Document status:** Planning baseline; no application code has been started  
**Version:** 1.0  
**Prepared:** 23 August 2026  
**Primary display target:** 1920 × 1080, 16:9 TV/LED canvas  
**Event date shown in the approved design direction:** Thursday, 27 August 2026 — confirm before production  
**Venue shown in the approved design direction:** SwanLake North Coast  

---

## 1. Purpose of this document

This document is the single implementation plan for the SwanLake Football Stars / Shores & Scores Challenge live competition platform. It consolidates the competition format, scoring and penalty behavior, administrator workflow, public dashboard, TV/LED broadcast experience, realtime and offline behavior, multi-device control, visual system, player-card system, sponsor treatment, ceremony flow, technical architecture, data model, testing, deployment, implementation phases, and the remaining decisions or assets required before development.

The product must feel like a **premium live sports show first and a management system second**. Operational reliability is mandatory, but the public-facing design—especially player photography, cards, introductions, score reveals, leaderboards, and ceremony moments—is the signature of the product.

This is a planning artifact only. It intentionally does not include application implementation.

### Requirement labels

- **Confirmed** — explicitly confirmed in the referenced conversation.
- **Recommended** — a concrete implementation decision proposed to make the confirmed requirements reliable and buildable.
- **Open** — a value, policy, asset, or business decision still required.

Where the earlier conversation did not specify a numeric scoring value or operational policy, this plan does not invent one. The engine is designed to support it, and the missing value is listed in the final input checklist.

---

## 2. Product definition

### 2.1 Event identity

- **Primary event name:** SwanLake Football Stars.
- **Challenge subtitle:** Shores & Scores Challenge.
- **Host/location identity:** SwanLake North Coast.
- **Sports operator name:** Sports United. Do not use “UMS.”
- **Brand direction:** premium football broadcast × game-show energy × North Coast summer.
- **Visual mood:** bright, fresh, celebratory, cinematic, clean, and photo-led—not dark esports and not a generic admin dashboard.

### 2.2 Product surfaces

The platform consists of four synchronized surfaces:

1. **Admin Control Center** — event setup, player assignment, competition progression, scoring, timing, publishing, corrections, display control, and audit history.
2. **Active Score Controller** — the focused, touch-friendly match controller used courtside or pitch-side. Only one device may actively mutate a live match at a time.
3. **Public Dashboard** — mobile-first live scores, challenge progress, individual standings, player profiles/cards, results, and schedule/history.
4. **TV/LED Broadcast Mode** — a remotely controlled 16:9 show surface containing the eight exact compositions defined below.

All four surfaces read from the same authoritative event state. The TV/LED and public dashboard never calculate unofficial results independently.

### 2.3 Primary audiences

| Audience | Need | Surface |
|---|---|---|
| Scorekeeper | Enter goals, scorers, penalties, and official results quickly and safely | Active Score Controller |
| Event admin | Configure the event, resolve errors, manage devices, publish states, and run the ceremony | Admin Control Center |
| Display operator | Preview and take broadcast scenes live without altering the score | TV/LED Display Control |
| Spectator on site | Understand who is playing, the time, score, scorer, penalty state, and current standings | TV/LED + QR |
| Remote/mobile spectator | Follow live progress, individual points, player cards, and results | Public Dashboard |
| Production/brand team | Deliver a premium visual show with correct sponsor hierarchy | TV/LED + ceremony |

---

## 3. Confirmed competition format

### 3.1 Teams and players

- Two teams: **Team A** and **Team B**.
- Five players per team; ten players total.
- Competition slots are **A1–A5** and **B1–B5**.
- A player can occupy only one slot in a given lineup.
- The admin fills ten lineup positions. Once a player is selected in one position, that player must disappear from the remaining dropdown choices until removed or replaced.
- The admin may decide or change the arrangement immediately before a challenge, subject to the live-lock rules below.
- Player identities, names, photos, team assignment, and points records persist throughout the event even when slot positions change.

### 3.2 Five-challenge structure

The event contains exactly five challenges:

| Challenge | Format | Rounds | Pairing |
|---|---:|---:|---|
| Challenge 1 | 1v1 | 5 | A1 vs B1, A2 vs B2, A3 vs B3, A4 vs B4, A5 vs B5 |
| Challenge 2 | 1v1 | 5 | A1 vs B1, A2 vs B2, A3 vs B3, A4 vs B4, A5 vs B5 |
| Challenge 3 | 1v1 | 5 | A1 vs B1, A2 vs B2, A3 vs B3, A4 vs B4, A5 vs B5 |
| Challenge 4 | 1v1 | 5 | A1 vs B1, A2 vs B2, A3 vs B3, A4 vs B4, A5 vs B5 |
| Challenge 5 | Full team match, 5v5 | 1 | Team A vs Team B |

The pairing rule always follows the assigned slots. If the admin changes a player from A2 to A4 before a challenge is locked, the player competes against B4 in that challenge.

### 3.3 Lineup lifecycle

Recommended state model:

1. **Draft** — admin can add, remove, or reorder any player.
2. **Ready** — all ten unique positions are filled and the challenge passes validation.
3. **Locked** — lineup snapshot is frozen for the live challenge.
4. **Live** — only an authorized emergency override can change the lineup.
5. **Completed** — the exact historical lineup is retained; later rearrangements do not rewrite prior results.

Every challenge stores its own lineup snapshot so that Challenge 2 may be arranged differently from Challenge 1 without changing historical pairings.

### 3.4 Draw behavior and individual records

- A round, challenge, or match may be described as a **draw** when its regular result is equal.
- A draw never merges or discards player records. Each participant retains their own point and scoring ledger.
- Competition points, goal records, adjustments, and penalty-tiebreak points must be stored as separate ledger entries, not as a single editable total.

---

## 4. Scoring engine

### 4.1 Scoring principles

The scoring engine must be deterministic, auditable, reversible, and versioned. The user interface may show a simple score, but internally every change is a recorded domain event.

Core principles:

- All score and point counters initialize at **0**.
- A goal is attributed to a scorer when the competition format requires scorer tracking.
- A correction never silently overwrites history; it creates a compensating event and an audit record.
- A scoring profile is frozen when the event goes live. Changes after that point require a privileged override and recomputation preview.
- The public score and leaderboard are derived from confirmed events only.
- Duplicate taps, reconnect retries, or repeated network requests must not create duplicate goals.

### 4.2 Separate scoring domains

The platform must keep these values separate:

1. **Regular score** — goals scored during the active round or match.
2. **Individual regular points** — competition points awarded to a player by the approved scoring profile.
3. **Team/challenge result** — derived result of the five 1v1 rounds or the final 5v5 match.
4. **Penalty-tiebreak score** — attempts/goals used only to break a drawn result.
5. **Penalty-tiebreak points** — separate individual points, if the final approved rules award them.
6. **Manual adjustment** — admin correction with required reason, actor, time, and before/after values.

No penalty-tiebreak attempt may silently increase the regular match score.

### 4.3 Penalty logic

Two penalty concepts must be modeled differently:

#### Penalty awarded during normal play

- Recorded as a normal goal when scored.
- Increases the regular team/match score.
- Credited to the scorer as a normal goal with `goal_method = penalty_in_play`.
- Appears in the regular goal timeline.
- Does not enter the separate tiebreak counter.

#### Penalty shootout or tiebreak after a draw

- Available only when the applicable regular result is a draw.
- Stored as penalty attempts with taker, team, order, outcome, and timestamp.
- Displayed as a separate penalty score, for example `3–2 on penalties`.
- Does not change the displayed regular score.
- Separate penalty points may be awarded only according to the approved scoring profile.
- If penalty points are used to resolve an individual points draw, they are applied only after regular points are equal.

The number of opening penalty attempts, sudden-death behavior, eligible takers, and whether the tiebreak applies to every drawn challenge or only the final match remain open inputs.

### 4.4 Player points ledger

Each point-changing entry contains:

- player ID;
- team ID at the time of the event;
- challenge and round/match ID;
- entry type: goal points, win bonus, draw points, challenge bonus, final-match points, penalty-tiebreak points, or manual adjustment;
- signed point value;
- originating score event;
- scoring profile version;
- created-by user/device;
- created and confirmed timestamps;
- optional correction reason and reversal link.

The displayed total is the sum of confirmed ledger entries. It is never stored as the only source of truth.

### 4.5 Scoring profile

The engine must support, but not assume, the following configurable values:

| Setting | Default before approval | Required before live? |
|---|---:|---:|
| Points per regular goal | 0 | Yes |
| 1v1 round win bonus | 0 | Confirm |
| 1v1 draw points | 0 | Confirm |
| Challenge win bonus | 0 | Confirm |
| Final-match goal points | 0 | Confirm |
| Final-match win bonus | 0 | Confirm |
| Penalty-tiebreak point value | 0 | Confirm |
| Manual adjustment | 0 | Only when used |

All numeric inputs should default to `0`, as requested, but the event cannot be marked “scoring ready” until the admin has explicitly reviewed and locked the profile. This prevents an untouched default from accidentally producing a zero-point competition.

### 4.6 Ranking and ties

Confirmed baseline:

1. Rank by confirmed regular player points.
2. If regular points are equal and approved penalty-tiebreak points exist, use those points only as the draw resolver.
3. If still equal, display a shared rank or “Draw” unless another tie-break rule is approved.

Goals, head-to-head, fastest score, or admin choice must not be introduced as hidden tie-breakers. If the organizers want any of them, they must be added to the locked scoring profile and shown in the rules.

### 4.7 Challenge aggregation — open rule

The platform can derive the winner of a five-round challenge using either:

- number of 1v1 round wins;
- total regular goals across all five rounds; or
- total awarded competition points.

The approved method is still required. The data model preserves all three values so the rule can be configured without losing information, but only one method may be active for an event.

### 4.8 Score event types

Minimum domain commands/events:

- round/match started;
- timer paused, resumed, corrected, or ended;
- regular goal added;
- scorer assigned or corrected;
- regular goal reversed;
- official result submitted;
- result published;
- result reopened;
- penalty tiebreak opened;
- penalty attempt scored/missed/reversed;
- challenge completed;
- manual points adjustment added/reversed;
- competition/final result locked.

Each action carries an idempotency key and expected state revision.

---

## 5. Timers and match-state behavior

### 5.1 1v1 rounds

- The referenced requirement establishes a **60-second completion point** for a 1v1 round.
- Recommended display: a clear `00:00 → 01:00` count-up so the public and scorekeeper see the same elapsed time.
- At 60 seconds, the system changes the round to **Awaiting Official Score**.
- The TV/LED and public live panel show a branded loading state until the admin submits the official final score.
- The system must not guess, freeze, or auto-submit the score when time expires.
- The scorekeeper may finish pending attribution/corrections while the public screen remains in the awaiting state.
- The official result appears only after submission and server confirmation.

If the organizers want a countdown instead of a count-up, that can be changed in settings without changing the underlying timer model.

### 5.2 Final 5v5 match

- The final match clock counts upward.
- First half: **00:00 to 20:00**.
- Halftime state at 20:00.
- Second half resumes at **20:00** and counts to **40:00**.
- The public clock never resets to 00:00 at the start of the second half.
- The admin can start, pause, resume, correct, end half, start second half, and end match.
- No extra-time period is assumed. A draw proceeds to the approved penalty-tiebreak flow when required.

### 5.3 Authoritative timer model

The timer must be based on server timestamps, not a browser interval as the source of truth. Store:

- segment number;
- state: ready, running, paused, ended;
- segment start server time;
- elapsed milliseconds accumulated before the latest start;
- scheduled segment duration;
- last correction reason;
- state revision.

Clients render a smooth local clock between synchronizations, then reconcile against the authoritative time. Reconnection must not restart or duplicate a timer.

### 5.4 Timer/display transitions

| Trigger | Admin state | Public/TV state |
|---|---|---|
| Round ready | Ready | Match-up / ready screen |
| Admin starts | Live | Live score screen |
| 60 seconds reached | Awaiting official score | Branded loading/verification state |
| Admin submits score | Result ready | Hold until publish or auto-publish setting |
| Result published | Published | Result animation, then next scheduled scene |
| Final half reaches 20:00 | Halftime | Halftime score composition |
| Match reaches 40:00 | Awaiting official score | Full-time verification state |
| Draw confirmed | Tiebreak ready | Penalty tiebreak screen/state |
| Final locked | Completed | Final result / ceremony-ready state |

---

## 6. System architecture

### 6.1 Recommended implementation baseline

The following is a recommended baseline and must first be reconciled with the existing Git repository, which was referenced but is not included in the current project mirror:

- **Web/PWA:** TypeScript + React using the repository’s supported stable framework version.
- **Rendering:** server-rendered public pages with client-side realtime state for live surfaces.
- **Design system:** shared tokens and components for admin, public, and TV modes; motion layer separated from scoring logic.
- **Database:** PostgreSQL.
- **Authentication:** role-based email/SSO admin authentication; public surfaces anonymous/read-only.
- **Realtime:** database-backed realtime changes or a managed websocket channel with snapshot recovery.
- **Asset storage:** object storage/CDN for player cutouts, normalized SVGs, sponsor marks, QR, and optional audio/video.
- **Hosting:** preview/staging/production web deployments with a managed database in the closest reliable region to the event.
- **Observability:** structured logs, client error reporting, realtime health metrics, and an event-day operations dashboard.

A Supabase + Vercel implementation is a suitable option if it matches the existing repository, but this plan is intentionally provider-neutral until the repo and deployment accounts are supplied.

### 6.2 Logical components

1. **Domain engine** — competition state machine, score validation, points calculation, ranking, and penalty rules.
2. **Command API** — accepts authenticated, idempotent admin commands with expected revisions.
3. **Transactional store** — stores domain entities, append-only events, snapshots, and audit entries.
4. **Realtime gateway** — broadcasts committed state revisions and display commands.
5. **Admin application** — configuration and operational controls.
6. **Public application** — read-only event dashboard.
7. **TV renderer** — deterministic scene renderer for 16:9 outputs.
8. **Asset pipeline** — sanitizes, normalizes, versions, and serves brand/player assets.
9. **Monitoring layer** — connection state, controller lease, display heartbeats, last confirmed revision, and error alerts.

### 6.3 Authoritative command flow

```text
Scorekeeper action
  → verify user role and Active Score Controller lease
  → validate expected competition state + revision
  → commit domain event, audit entry, and derived snapshot in one transaction
  → return confirmed revision
  → broadcast revision to admin, public, and TV clients
  → clients reconcile from the confirmed snapshot
```

The realtime message is a notification, not the database of record. A client that misses messages requests a fresh snapshot plus events after its last confirmed revision.

### 6.4 Suggested repository topology

Adapt rather than replace the existing repository structure:

```text
apps/
  web/                 Admin, public, controller, and TV routes
packages/
  domain/              Competition state, scoring, ranking, timer rules
  ui/                  Shared visual components and accessibility primitives
  broadcast/           Player cards, scene compositions, motion cues
  config/              Typed settings and validation
database/
  migrations/          Versioned schema and row-level access rules
tests/
  unit/
  integration/
  e2e/
  visual/
docs/
  operations/
  rehearsal/
  brand/
```

### 6.5 Route map

Recommended routes:

- `/event/[eventSlug]` — public overview and current live state.
- `/event/[eventSlug]/live` — focused public live view.
- `/event/[eventSlug]/standings` — player ranking and points.
- `/event/[eventSlug]/players/[playerSlug]` — player profile/card.
- `/tv/[eventSlug]` — controlled TV/LED program output.
- `/tv/[eventSlug]/preview` — operator preview output.
- `/admin/events/[eventId]` — admin overview.
- `/admin/events/[eventId]/setup` — teams, players, challenges, sponsors, settings.
- `/admin/events/[eventId]/controller` — Active Score Controller.
- `/admin/events/[eventId]/display` — TV preview/program scene control.
- `/admin/events/[eventId]/ceremony` — ceremony cue sequence.
- `/admin/events/[eventId]/audit` — corrections, device activity, and score history.

---

## 7. Data model

### 7.1 Core entities

| Entity | Essential fields and constraints |
|---|---|
| `events` | ID, name, subtitle, slug, venue, timezone, start time, status, active scoring-profile version, public URL, QR target, current revision |
| `teams` | ID, event ID, display name, short code, color tokens, crest, display order; exactly two active teams for this format |
| `players` | ID, display name, public slug, photo/cutout assets, fallback initials, bio fields, active flag |
| `event_players` | Event, player, default team, jersey/slot metadata; unique player per event |
| `challenges` | Event, number 1–5, format, title, state, aggregation rule, scheduled order, locked lineup snapshot |
| `rounds` | Challenge, round number, format, status, official regular score, result, timer ID, revision |
| `lineup_slots` | Challenge, team, slot A1–A5/B1–B5, player; unique slot and unique player per challenge |
| `round_participants` | Round, team, player, slot, side; stores historical pairing |
| `matches` | Final 5v5 match, teams, status, regular score, penalty score, winner, official/locked timestamps |
| `goals` | Round/match, team, scorer, method, match clock, status, originating event, reversed-by link |
| `penalty_shootouts` | Parent result, state, opening-attempt rule, current order, winner, completed timestamp |
| `penalty_attempts` | Shootout, sequence, team, player/taker, scored/missed, sudden-death flag, status |
| `scoring_profiles` | Versioned numeric rules, ranking rule, challenge aggregation rule, locked timestamp |
| `player_points_ledger` | Player, source, type, signed value, profile version, confirmed/reversed state |
| `timers` | Parent, segment, state, server anchor, accumulated elapsed, duration, correction audit |
| `score_events` | Append-only domain event, payload, idempotency key, actor/device, expected/new revision |
| `published_snapshots` | Event revision, public-safe denormalized state, published timestamp |
| `display_scenes` | Scene ID, composition type, status, payload revision, preview/program timestamps |
| `display_commands` | Cue, transition, target displays, operator, schedule, acknowledgement state |
| `sponsor_assets` | Sponsor name, role, original-color SVG, light/dark variants, URL, safe-space metadata, ticker order |
| `ceremony_cues` | Ordered cue, scene type, payload, transition, duration/hold mode, completion state |
| `device_sessions` | Device label, user, last seen, capabilities, connection state, revoked timestamp |
| `controller_leases` | Event/match, active device, acquired/renewed/expiry timestamps, release/transfer reason |
| `audit_logs` | Actor, device, action, entity, before/after summary, reason, time, IP/session metadata |

### 7.2 Key integrity rules

- One player cannot occupy two slots in the same challenge.
- Challenges 1–4 must each contain exactly five rounds and ten unique participants when locked.
- Challenge 5 must contain both full five-player team lineups and exactly one match.
- Only one non-expired controller lease may exist per active round/match.
- Only one confirmed, non-reversed score event may use a given idempotency key.
- A penalty shootout cannot open unless the parent regular result is confirmed as a draw.
- A completed historical lineup cannot be mutated; corrections create a new revision and audit trail.
- A public snapshot cannot contain draft or unconfirmed score data.
- Points ledger entries must balance through explicit reversal entries, never deletion.

### 7.3 Event state machine

```text
DRAFT → READY → LIVE → AWAITING_OFFICIAL_SCORE → RESULT_READY
      → PUBLISHED → COMPLETED → LOCKED → ARCHIVED
```

Allowed exception paths:

- `RESULT_READY → LIVE` for an authorized correction before publication.
- `PUBLISHED → RESULT_READY` through “Reopen result,” with a required reason and visible correction state.
- `LOCKED → COMPLETED` only for a super-admin emergency override; the system must preserve the prior locked snapshot.

---

## 8. Active Score Controller and multi-device behavior

### 8.1 Controller objective

The controller must let a scorekeeper operate confidently from a tablet or phone with the minimum possible taps. It contains only live operational controls: clock, goals, scorer attribution, penalties, undo/correction, and official submission. Setup-heavy actions stay in the broader Admin Control Center.

### 8.2 Single active controller lease

- Multiple authenticated devices may view the same live match.
- Exactly one device is the **Active Score Controller** and may submit score commands.
- Other devices are visibly read-only and show the active device label and last heartbeat.
- A user may request control; the current controller or an authorized admin can approve transfer.
- The controller can explicitly release control.
- A disconnected controller retains its lease briefly to survive a short network drop.
- Recommended lease: 15-second expiry, renewed every 5 seconds; allow takeover after three missed renewals. Final values should be validated during rehearsal.
- Emergency takeover requires a confirmation step and creates an audit entry.

### 8.3 Conflict prevention

Every mutation includes:

- active lease token;
- device session ID;
- unique client action ID;
- expected event revision;
- local timestamp for diagnostics;
- server timestamp assigned on commit.

If the expected revision is stale, the command is rejected with the new confirmed state. The controller must show a clear reconciliation panel rather than silently overwriting another action.

### 8.4 Controller layout

Recommended tablet layout:

- Top bar: connection, controller ownership, challenge/round, timer, settings lock.
- Center: large Team A and Team B score panels.
- Primary actions: `+ Goal A`, `+ Goal B`, pause/resume clock.
- On goal tap: scorer sheet showing only eligible players; confirmation remains one additional tap.
- Penalty mode: ordered attempt buttons, scorer/taker selector, score/miss, reverse last attempt.
- Bottom rail: recent event timeline, undo last action, submit official score.
- Dangerous actions—reset, reopen, manual correction—live behind a press-and-hold or confirmation dialog and require a reason.

### 8.5 Undo and correction

- Immediate “undo last action” is permitted while the result is not locked.
- Undo creates a reversal event.
- Older corrections open a timeline item, show the impact preview, and require a reason.
- Public/TV displays receive a neutral score-correction animation, not a goal celebration.
- Corrections after publication must be visibly labelled in admin history and may briefly show `Official correction` on public surfaces.

---

## 9. Realtime, offline, and reconnection behavior

### 9.1 Connection states

Every live client exposes one of four states:

- **Live** — websocket connected and revision current.
- **Reconnecting** — last confirmed state remains visible; mutations are restricted according to controller rules.
- **Offline** — cached data is shown with a clear stale timestamp.
- **Recovering** — a fresh snapshot is loading and queued local commands are being reconciled.

### 9.2 Public and TV clients

- Keep the last confirmed score on screen during a connection interruption.
- Never reset to zero or a blank composition because a websocket drops.
- Show a discreet connection indicator only after a threshold, recommended 5 seconds.
- Continue rendering the clock locally from the last authoritative anchor, but visually mark it as reconnecting if the outage exceeds the threshold.
- On reconnect, fetch the current snapshot, compare revisions, apply missed events, and correct clock drift smoothly.
- If the official state changed materially, use a short neutral refresh transition.

### 9.3 Active controller offline behavior

- A scorekeeper may continue using a short, encrypted local action queue only while the device still holds a valid local lease and the outage is brief.
- Queued actions are visibly marked `Pending sync`; public/TV screens do not see them until server confirmation.
- Each action keeps its idempotency key.
- On reconnect, replay in original order against the last confirmed revision.
- If the lease expired or another controller took over, do not replay automatically. Present the queued actions for admin reconciliation.
- Official result submission and competition lock require an online server acknowledgement.

### 9.4 Recovery protocol

1. Client reconnects and sends last confirmed revision.
2. Server returns current controller lease and either missed events or a full snapshot.
3. Client replaces speculative state with confirmed state.
4. Pending actions are replayed only if lease and revisions are valid.
5. Conflicts open a guided reconciliation view.
6. Client acknowledges the recovered revision; monitoring records recovery time.

### 9.5 Display operator commands

Display commands also carry revisions and acknowledgements. If a TV client reconnects, it loads the current **program** scene, not the last scene it happened to render. Preview and program outputs remain distinct.

---

## 10. Admin Control Center

### 10.1 Roles

| Role | Capabilities |
|---|---|
| Super admin | All events, scoring profiles, unlocks, user/device management, final overrides |
| Event admin | Full setup and event operations for assigned events |
| Scorekeeper | Active Score Controller and allowed corrections |
| Display operator | Preview/program scene control and ceremony cues; no score mutation |
| Viewer/auditor | Read-only admin state and audit log |

Use least-privilege database policies. Public users receive only published, public-safe records.

### 10.2 Setup modules

- Event identity, date, time, venue, timezone, URLs, status.
- Team names, colors, crests, and short labels.
- Player database and event roster.
- Ten-slot lineup builder with duplicate-eliminating dropdowns.
- Per-challenge lineup copy/rearrange/validate/lock.
- Scoring profile with review and freeze step.
- Timer defaults and transition behavior.
- Sponsor asset library, hierarchy, original-color enforcement, ticker order, and links.
- QR destination and downloadable test QR.
- TV safe-area and display registration.
- Ceremony cue builder.
- Users, roles, device labels, and controller access.

### 10.3 Competition operations

- Challenge navigator showing all five challenges and completion state.
- Round navigator showing the five 1v1 pairings.
- “Next ready round” shortcut without auto-start.
- Score and scorer entry.
- Timer control.
- Awaiting-official-score queue.
- Result submission, preview, publish, reopen, and lock.
- Penalty tiebreak controller available only on a confirmed draw.
- Automatic player standings preview before publication.
- Public/TV preview side-by-side with current program state.
- Full audit timeline and export.

### 10.4 Safety controls

- Validation prevents going live with duplicate/missing players.
- Score buttons debounce visually and use idempotent commands.
- Reset and unlock actions require explicit confirmation and reason.
- Published-result corrections show a before/after impact preview.
- Final ceremony cannot start until all required results are confirmed, or an authorized admin explicitly overrides the readiness check.
- The browser warns before closing a tab that contains unsynced controller actions.

---

## 11. Public dashboard

### 11.1 Public information architecture

The mobile-first public dashboard contains:

1. Event hero and current live status.
2. Live challenge/round card.
3. Current clock, regular score, scorers, and penalty state when applicable.
4. Challenge progress rail, 1–5.
5. Team rosters and the active pairing.
6. Individual player standings and point totals.
7. Player-card detail views.
8. Completed results and upcoming pairings.
9. Sponsor strip and event/partner links.

No sign-in is required to watch public data.

### 11.2 Public live-state rules

- Clearly distinguish `Live`, `Awaiting official score`, `Official result`, `Correction`, `Halftime`, `Full time`, and `On penalties`.
- During live gameplay, do not introduce additional sports statistics beyond the confirmed scope: **clock, goals, scorers, and penalties**.
- Player points and ranking may appear in the standings context, not as distracting overlays inside the core live score.
- Draft scorer selections or pending offline actions never appear publicly.
- The latest official result stays available after the show transitions to the next round.

### 11.3 Responsive behavior

- Mobile: stacked player cards, sticky compact live score, horizontal challenge progress.
- Tablet: split live score and player matchup.
- Desktop: live state left, standings/results right, with large photography.
- TV links should route to the public dashboard, never to an admin page.

### 11.4 Accessibility

- Minimum WCAG AA contrast for essential text and controls.
- Scores and timer must not rely on color alone.
- Semantic live-region announcements for score changes on the public web view, with a user setting to mute them.
- Keyboard operability for public navigation and all admin controls.
- Reduced-motion mode and static alternatives.
- Descriptive alternative text for player photos and meaningful logos; decorative geometry remains hidden from assistive technology.

---

## 12. Visual design direction

### 12.1 Creative principle

The visual identity should communicate:

> Premium football broadcast × game-show reveal energy × North Coast summer light.

The competition mark and players are the visual heroes. Interface chrome should recede. The experience should be light, elegant, spacious, and unmistakably event-specific.

### 12.2 Palette

Working tokens observed in the supplied SVG set:

| Token | Working value | Usage |
|---|---:|---|
| SwanLake/event aqua | `#90C6CB` | Primary event fields, gradients, cards, highlight geometry |
| Yalla Sahel turquoise | `#02BBC1` | Yalla logo only and limited partner accents |
| Broadcast ink | `#231F20` | Essential text, dark score panels, monochrome SwanLake variant |
| Sports United red | `#C62029` | Sports United logo only and rare approved operator accent |
| White | `#FFFFFF` | Main light surface and reverse logos |
| Warm off-white | To be sampled from normalized event master | Event wordmark, highlights, ceremony ribbons |
| Readability navy | Final token pending brand approval | Score text on aqua and supporting type |

These are implementation starting points, not a substitute for an approved brand guide. Original sponsor colors must be retained. Sponsor marks must not be recolored to fit the event palette.

### 12.3 Background language

- Pale aqua-to-white animated gradients.
- Oversized star-line geometry derived from the event identity.
- Subtle football-pitch line references.
- Low-opacity directional chevrons and broadcast framing.
- Slow light sweeps for holding states.
- Restrained particles for goals and wins.
- Generous negative space around player cutouts and score typography.
- No heavy neon, black esports grids, lens-flare overload, or constant high-energy motion.

### 12.4 Typography

Use a two-family system:

- **Display/sports face:** condensed, heavy, angular, excellent numeral widths; used for player names, scores, challenge numbers, and results.
- **Interface face:** highly readable contemporary sans-serif; used for timers, labels, admin controls, and body text.

Requirements:

- tabular numerals for clocks and scores;
- no font synthesis;
- preloaded critical font files;
- Arabic support if bilingual public copy is required;
- optical size/weight chosen for 1080p and LED viewing distance;
- uppercase tracking tuned per composition rather than globally.

### 12.5 Composition grid

Master TV canvas: 1920 × 1080.

- Outer safe area: 72 px minimum on every edge; increase to the LED vendor’s required overscan.
- Header zone: approximately 11% of height.
- Main content zone: approximately 81% of height before ticker overlap.
- Sponsor ticker: approximately 8% of height.
- Event mark: top-left, consistent bounding box.
- Competition context: centered in header.
- Permanent QR: top-right, isolated inside a high-contrast quiet zone.
- Sponsor ticker: bottom, continuous and visually distinct from live content.

All scene-specific content must fit inside the safe main content area and may not collide with the QR or ticker.

---

## 13. Supplied SVG asset audit

### 13.1 Audit summary

Thirteen supplied files were inspected. They contain no scripts, JavaScript URLs, external HTTP image references, `foreignObject` elements, or live text dependencies. That is a good security and portability baseline.

However, the `.svg` extension does not mean every file is a clean vector master. Only two inspected files are fully path-based without embedded raster `<image>` elements. Several others are hybrid files, and two are effectively raster artwork wrapped in an SVG container. Multiple files use oversized page/artboard dimensions or full-screen compositions with baked backgrounds and large empty areas. These should be normalized before production use.

### 13.2 File-by-file findings

| File | Observed content | Technical finding | Recommended use/action |
|---|---|---|---|
| `swanlake footbal stars 21.svg` | Aqua event background; warm-white/outlined SwanLake Football Stars — Shores & Scores identity | 1920×1080 wrapper with embedded raster layers; visible right-side crop is part of the composition | Treat as a background/reference composition, not the only logo master. Request/export a tight transparent primary mark and separate star background |
| `swanlake footbal stars 22.svg` | White/light version with black competition identity | 1920×1080 wrapper with embedded raster layers | Use as light-background visual reference; extract a tight transparent black lockup |
| `swanlake footbal stars 23.svg` | Dark/charcoal version with warm-white identity | 1920×1080 wrapper with embedded raster layers and baked background | Use as optional dark/ceremony reference only; the overall product remains light |
| `SLN New Logo1.svg` | White SwanLake North Coast wordmark on aqua | Hybrid SVG with embedded raster layers and baked aqua field | Suitable reference for aqua surfaces; request a transparent white wordmark master |
| `SLN New Logo2.svg` | Black SwanLake North Coast horizontal wordmark | Clean path-based vector; no embedded raster image | Preferred default SwanLake mark on white/off-white surfaces; tighten/verify viewBox |
| `SLN New Logo3.svg` | White SwanLake North Coast wordmark on charcoal | Hybrid with baked dark field | Use only on approved dark surfaces; request transparent white master instead of using the baked panel |
| `SU logo1.svg` | Sports United bilingual light-background lockup, red/charcoal | Hybrid vector/raster and large 16:9 artboard; current preview crops the lockup | Use original red/charcoal identity after exporting a tight transparent light-surface lockup |
| `SU logo2.svg` | Sports United bilingual dark-background lockup, red/white | Hybrid vector/raster and large 16:9 artboard | Use on dark ceremony surfaces only after tight transparent export |
| `Move Beyond Black.svg` | Black MB monogram + Move Beyond wordmark | Portrait A-series artboard with large empty space; hybrid/embedded media present | Export a tight transparent black production mark; use on light surfaces |
| `Move Beyond light blue logo.svg` | Aqua/light-blue MB monogram + wordmark | Predominantly embedded raster media in an SVG wrapper; portrait artboard | Request/re-export a true vector transparent aqua mark before production |
| `New HAP Logo - Vertica.pdf.svg` | Hassan Allam Properties vertical navy lockup | Portrait A-series artboard; includes embedded raster media | Request a tight transparent vector lockup and, ideally, horizontal version for the ticker |
| `Tellr 2.svg` | White TELLR wordmark on turquoise motion background | Raster-only artwork wrapped in SVG; very large embedded image; visible crop and baked background | A transparent true-vector Tellr wordmark is required for reliable ticker use |
| `Yalla Sahel.svg` | Turquoise Yalla Sahel wordmark | Clean path-based vector; no embedded raster image, but large 16:9 artboard and visible edge crop | Preserve original turquoise; export/tighten transparent lockup and verify intended full wordmark bounds |

### 13.3 Asset normalization requirements

Before the visual implementation phase, create a production asset manifest and normalize each approved logo:

- true vector paths where available;
- transparent background unless the baked panel is an explicitly approved composition;
- tight `viewBox` around visible artwork;
- preserved aspect ratio;
- no clipping of marks or wordmarks;
- separate light-surface and dark-surface variants;
- original brand colors;
- no font references; outlined text or approved web font strategy;
- sanitized markup and deterministic IDs;
- accessible name metadata outside the SVG when used decoratively;
- clear-space and minimum-size metadata;
- file-size budget appropriate for live TV loading;
- checksum/version in the asset manifest.

The three event files should be separated into reusable layers:

1. transparent primary event lockup;
2. black monochrome lockup;
3. reverse/warm-white lockup;
4. star-line background pattern;
5. optional charcoal ceremony background;
6. independent broadcast texture/chevron layer.

### 13.4 Naming cleanup

Use stable production names rather than numbered working filenames, for example:

```text
event-primary-reverse.svg
event-primary-black.svg
event-pattern-aqua.svg
swanlake-north-coast-black.svg
swanlake-north-coast-white.svg
sports-united-light.svg
sports-united-dark.svg
hassan-allam-properties-navy.svg
yalla-sahel-original.svg
tellr-original.svg
move-beyond-black.svg
move-beyond-aqua.svg
```

Do not delete or overwrite the supplied originals; keep them in a read-only source folder and commit normalized derivatives separately with provenance.

---

## 14. Sponsor hierarchy, ticker, and logo behavior

### 14.1 Hierarchy

Recommended hierarchy based on the confirmed conversation and supplied assets:

1. **Competition identity:** SwanLake Football Stars — Shores & Scores Challenge.
2. **Host/location/property:** SwanLake North Coast and Hassan Allam Properties.
3. **Sports operator:** Sports United.
4. **Partners:** Yalla Sahel and Tellr.
5. **Production/technology credit:** Powered by Move Beyond.

The contractual/legal hierarchy and exact labels must be approved before launch. The visual system should not imply a sponsor tier that conflicts with agreements.

### 14.2 Confirmed ticker order

Continuous loop:

```text
Yalla Sahel → Tellr → SwanLake North Coast → Hassan Allam Properties
→ Sports United → Powered by Move Beyond → repeat
```

### 14.3 Ticker behavior

- Smooth continuous horizontal movement; no abrupt card carousel.
- Logos remain in original colors.
- Each logo sits in a neutral white/off-white pill or cell only when needed to protect contrast.
- Equal optical height, not equal raw width.
- Clear-space rules must be respected.
- Consistent separators, recommended small event stars or subtle rules.
- Speed target: approximately 25–35 px/sec at 1080p; finalize after LED rehearsal.
- Pause only during a deliberate full-screen sponsor thank-you scene, not on every score reveal.
- Seamless duplicate content prevents a visible jump at loop restart.
- Reduced-motion mode replaces the crawl with slow crossfades while preserving equal sponsor exposure.

### 14.4 Sponsor exposure logging

Recommended for production accountability:

- record when the ticker is on program;
- record full-screen sponsor thank-you cue start/end;
- export a simple exposure report after the event;
- do not use telemetry to change live hierarchy automatically.

---

## 15. Permanent QR system

### 15.1 Purpose

The QR sends spectators to the public event dashboard and live scores. It must never point to a temporary preview URL or admin route.

### 15.2 TV treatment

- Permanent position: top-right in the global TV header.
- Short label: `SCAN FOR LIVE SCORES`.
- High-contrast quiet zone; never placed directly over moving geometry.
- Minimum practical rendered size for venue testing: 120–150 px at 1080p, adjusted for viewing distance and LED pixel pitch.
- Remains visible during holding, live, result, leaderboard, and ceremony scenes unless a full-screen sponsor contract explicitly requires otherwise.
- No animated QR modules. Only the surrounding label/panel may animate.

### 15.3 QR generation and validation

- Generate from the final production HTTPS URL.
- Use a high error-correction level if the logo treatment or physical environment warrants it.
- Keep a plain unbranded fallback QR.
- Test from iOS and Android at near, mid, and far venue distances.
- Test under camera glare, low brightness, motion, and off-axis angles.
- Record target URL and checksum in event settings.
- Provide an admin “Open target” validation button.

---

## 16. TV/LED broadcast mode — global rules

### 16.1 Preview and program

The display operator uses a broadcast-style model:

- **Preview** — prepares the next composition and validates its content.
- **Program** — the scene currently visible to spectators.
- `Take live` performs the approved transition.
- Scoring changes update scene data, but the display operator controls major scene changes.
- Emergency `Go to holding` is always available.

### 16.2 Persistent zones

- Top-left: competition logo.
- Top-center: challenge/round/match context.
- Top-right: permanent QR.
- Bottom: sponsor ticker.
- Main zone: scene-specific composition.

### 16.3 TV content limitation during live play

The live score compositions show only the confirmed live information:

- clock;
- goals/regular score;
- scorer names;
- penalty score/attempts when applicable.

No possession, shots, fouls, cards, heatmaps, or unrequested statistics are added.

### 16.4 Display registration and health

Each LED/TV device registers a label and reports:

- screen resolution and viewport;
- current scene and revision;
- last heartbeat;
- realtime connection status;
- asset loading failures;
- fullscreen/wake-lock status where supported.

The admin sees all displays and can target a cue to one, a group, or all.

---

## 17. Eight exact TV/LED screen compositions

All measurements are proportions of the safe main content area and should be refined against the final LED specifications. Each screen retains the global header, QR, and sponsor ticker unless explicitly noted.

### Screen 01 — Holding / Event Intro

**Use:** before the event, between long breaks, after an emergency hold, and at close.

**Composition:**

- Event mark occupies approximately 40–45% of canvas width, slightly above center.
- Background: pale animated star geometry, subtle pitch lines, aqua-to-white gradient, slow light sweep.
- Beneath mark: `THURSDAY • 27 AUGUST 2026` and `LIVE FROM SWANLAKE NORTH COAST`—both configurable.
- Status pill: `STARTING SOON`, `SHORT BREAK`, `RESUMING SOON`, or `THANK YOU`.
- Optional event-start countdown in the lower-left of the main zone.
- QR remains visible.

**Motion:** 12–20 second ambient loop; logo breath no more than 1–2% scale; no rapid particles.

**Entry/exit:** operator-selected; emergency entry is a short 250 ms dissolve; normal exit uses event sting/reveal.

### Screen 02 — Team Lineups / Challenge Setup

**Use:** introduce both five-player lineups and the locked challenge arrangement.

**Composition:**

- Split Team A and Team B fields, each approximately 44% width, with a narrow central challenge spine.
- Five vertical or staggered player-card lanes per team.
- Center spine shows `CHALLENGE 1`, format `5 × 1v1`, and status `LINEUPS LOCKED`.
- Pairing connectors align A1↔B1 through A5↔B5.
- Team colors appear as accents only; event aqua remains dominant.
- Player cutouts should occupy more area than data labels.

**Motion:** team fields enter from opposite sides; players reveal sequentially A1/B1 through A5/B5; 100–140 ms stagger.

**Entry/exit:** shown after lineup lock and before the first matchup; exits to Screen 03 on operator cue.

### Screen 03 — Head-to-Head Player Reveal

**Use:** introduce the next 1v1 round.

**Composition:**

- Left hero card: Team A player cutout, name, slot, current individual points.
- Right hero card: Team B equivalent.
- Large `VS` or event star collision at center.
- Top context: challenge and round, for example `CHALLENGE 2 • ROUND 3 OF 5`.
- Bottom mini-line: previous result or `NEXT UP`, but not unrelated statistics.
- Photos face inward when source photography permits.

**Motion:** masked player rise, name wipe, subtle center star impact, then settle. Avoid a long intro that delays play.

**Entry/exit:** prepared when the round is ready; exits to Screen 04 when the scorekeeper starts the timer.

### Screen 04 — Live 1v1 Round

**Use:** the active 60-second 1v1 round and its verification state.

**Composition:**

- Timer centered at top of main zone, large and tabular.
- Left/right player faces or cropped half-body photography.
- Regular score occupies the visual center with very large numerals.
- Latest scorer appears in a small animated lower-third near the scoring side.
- A five-round progress rail shows completed/current/upcoming rounds.
- No extra statistics.

**Goal motion:** scoring side receives a 1.2–1.8 second aqua/star burst, scorer card slide, numeral roll, and optional audio sting. The other side remains stable to protect score readability.

**At 60 seconds:** replace interactive-looking live motion with a branded `VERIFYING OFFICIAL SCORE` loader. Keep the last score visible but visually provisional until submission.

**Exit:** official submission triggers Screen 05.

### Screen 05 — Round / Challenge Result

**Use:** reveal an official 1v1 result and, after round five, the challenge summary.

**Composition for a round:**

- Winner card takes 58–62% width; other player remains visible at reduced scale.
- Official score centered between cards.
- Points awarded appear beneath each player, separately.
- Draw state uses balanced equal cards and the word `DRAW`; each player’s own points remain visible.

**Composition after round five:**

- Five result tiles across or in a 3+2 grid.
- Challenge result headline based on the approved aggregation rule.
- Compact updated individual standings preview.

**Motion:** score lock stamp, winner light sweep, restrained particles; draw uses symmetric star-line convergence, not a winner animation.

**Exit:** operator chooses next Head-to-Head reveal, Leaderboard, or Holding screen.

### Screen 06 — Final Challenge 5v5 Live Match

**Use:** Challenge 5, the full team match, including halftime, full-time verification, and penalties.

**Composition:**

- Team A and Team B names/crests left and right.
- Massive central regular score.
- Clock above score, counting 00:00→20:00 and 20:00→40:00.
- Scorer timeline below score, showing only recent/essential goal events with player names.
- Compact five-player strips at far left/right; scorer briefly highlights.
- Challenge label: `FINAL CHALLENGE • 5v5`.

**Halftime:** replace live status with `HALFTIME`, keep official score, slowly bring forward both team strips.

**At 40:00:** show `VERIFYING FULL-TIME RESULT` until official submission.

**Penalty mode:** retain the regular score and add a clearly separate penalty row with attempt dots and `PENALTIES`. Do not roll penalty goals into the regular numeral.

**Motion:** goal burst uses scorer photo; penalty attempts use focused dot/result motion; misses use a neutral strike/fade rather than a negative red flash that overwhelms branding.

### Screen 07 — Individual Leaderboard / Player Rankings

**Use:** between challenges, after results, and during ceremony buildup.

**Composition:**

- Top three receive large photo-led podium cards across the upper 55–60%.
- Ranks 4–10 appear as compact cards/list below or in a side rail.
- Every entry shows rank, player photo/initials, name, team/slot, regular points, and separate penalty-tiebreak points only when relevant.
- Recent rank movement uses a subtle arrow/delta.
- If a shared rank exists, cards align at the same tier and are labelled `DRAW` or shared rank.

**Motion:** rows/cards reorder with spring-like continuity; never teleport. Score values roll; photos remain stable. During ceremony, ranks may reveal 10→1.

**Exit:** operator-selected; public dashboard continues showing the full static list.

### Screen 08 — Final Result / Ceremony Program

**Use:** final winner reveal, podium sequence, partner thank-you, and closing loop.

**Composition states within one screen family:**

1. `FINAL RESULT LOCKED` holding slate.
2. Runner-up team/player presentation.
3. Champion/winner hero with full-width player/team photography.
4. Optional individual award hero cards if those awards are enabled.
5. Sponsor/partner thank-you wall.
6. Closing event mark + QR.

**Winner hero:** dominant event aqua/warm-white identity, oversized champion typography, winner/team cutouts, final score, and optional regular/penalty notation.

**Motion:** event sting, star expansion, warm-white confetti/ribbons, photo parallax, and a stable final pose suitable for photography. Confetti runs for a defined burst and stops; it is not an endless GPU effect.

**Exit:** partner thank-you, closing holding loop, or operator-controlled black/neutral output.

---

## 18. Player-card design system

### 18.1 Design objective

Player cards are the most important reusable component. They are not database tiles. They are broadcast hero assets that make each participant feel like a star.

### 18.2 Card anatomy

Every card is built from consistent layers:

1. **Photo layer** — transparent cutout or masked portrait; dominant visual element.
2. **Identity layer** — player name in oversized display type.
3. **Competition layer** — team, slot, current rank, and context.
4. **Performance layer** — points and, where relevant, regular goals or separate penalty points.
5. **Brand layer** — event star geometry and team accent.
6. **State layer** — live, winner, draw, scorer, penalty taker, inactive, or correction.

### 18.3 Card variants

| Variant | Primary use | Required content |
|---|---|---|
| Hero portrait | Holding features, winner, ceremony | Large cutout, name, team, rank/award, points |
| Head-to-head | Screen 03 | Cutout, name, slot, team, points |
| Live side card | Screens 04/06 | Face/cutout, name, score side, latest scorer state |
| Leaderboard podium | Top three | Rank, photo, name, team, regular points, conditional penalty points |
| Leaderboard compact | Ranks 4–10/mobile | Thumbnail, rank, name, team, points |
| Lineup card | Screen 02/admin preview | Photo, name, slot, team |
| Scorer lower-third | Goal celebration | Photo, name, goal label, clock |
| Penalty taker card | Tiebreak | Photo, name, attempt state |
| Ceremony award card | Optional awards | Hero photo, award, supporting statistic |
| Fallback card | Missing image | Branded silhouette/initials, never a broken-image icon |

### 18.4 Photography specification

Preferred player deliverables:

- transparent PNG/WebP cutout, minimum 2000 px tall;
- original high-resolution portrait retained separately;
- consistent lighting and camera height;
- enough shoulder/body area for multiple crops;
- neutral pose plus optional celebration pose;
- player faces not cropped by source image;
- signed usage permission and event retention policy.

Image focal points should be stored so automatic responsive crops protect faces. Do not rely on CSS `object-position: center` for every player.

### 18.5 Card layout rules

- Name remains readable at the farthest intended LED viewing distance.
- Card backgrounds may use team colors at 10–20% visual weight; the event palette remains dominant.
- Rank and score never overlap a face.
- Card aspect ratios: 4:5 hero, 1:1 compact, flexible 16:9 live side treatment.
- Long names use a controlled two-line lockup or stepped font size, never clipping.
- Cards for paired players mirror spatially but do not mirror text.
- The same player’s card identity remains recognizable across all variants.

### 18.6 Player-card motion states

- **Reveal:** mask rise + subtle photo parallax + name wipe, 700–1000 ms.
- **Scorer:** fast 150 ms accent in, 1200–1800 ms celebration, settle.
- **Rank change:** layout spring with fixed photo focal point, 500–800 ms.
- **Winner:** warm light sweep + star outline + restrained particle burst.
- **Draw:** equal-scale convergence; no false winner emphasis.
- **Correction:** neutral crossfade/number update with `Official correction`; no celebration.

---

## 19. Motion and animation system

### 19.1 Motion principles

- Motion explains state change, hierarchy, or cause.
- Animations are interruptible; live data should never wait behind a decorative animation.
- Essential scores and clocks remain readable throughout transitions.
- Use transforms and opacity for performance.
- Avoid simultaneous motion in every screen region.
- Preserve a calm resting state after every reveal.

### 19.2 Motion tokens

Working durations:

| Token | Duration | Use |
|---|---:|---|
| Instant feedback | 100–160 ms | Button response, active state |
| Score change | 250–400 ms | Numeral roll, score correction |
| Card entrance | 500–800 ms | Lineup and leaderboard |
| Hero reveal | 800–1200 ms | Head-to-head/player winner |
| Goal celebration | 1200–1800 ms | Scorer flash and star burst |
| Result reveal | 1800–2800 ms | Round/challenge official result |
| Ambient loop | 12–20 sec | Holding background |

Final easing values should be tuned visually, with spring motion limited to card movement and not used for the clock or score truth.

### 19.3 Animation cues

- Challenge intro sting.
- Player-vs-player reveal.
- Timer start and end.
- Goal and scorer reveal.
- Penalty score/miss.
- Official result lock.
- Rank change.
- Champion reveal.
- Sponsor thank-you transition.
- Reconnecting/loading state.

### 19.4 Reduced motion

When reduced motion is enabled:

- replace parallax and large translations with short opacity transitions;
- disable background particles and continuous light sweeps;
- replace ticker crawl with controlled partner crossfades if required;
- preserve state clarity and timing cues.

### 19.5 Audio

Audio is optional and disabled by default until supplied and approved. If enabled:

- goal sting, match start, result lock, and champion sting are separate cues;
- display operator can mute globally;
- browser autoplay constraints are handled during setup;
- score truth never depends on audio completion.

---

## 20. Ceremony sequence

### 20.1 Readiness gate

Ceremony mode becomes ready only when:

- all five challenges have official results;
- any required penalty tiebreak is complete;
- scoring profile calculation succeeds;
- individual standings are reviewed;
- final result is locked;
- winner/runner-up assets are available;
- ceremony display and optional audio have passed health checks.

An authorized admin may override readiness with a written reason, but the screen must make unresolved data visible in preview and must not publish placeholders accidentally.

### 20.2 Recommended run of show

1. **Ceremony holding** — event mark, `CEREMONY STARTING`, QR and ticker.
2. **Event recap** — challenge 1–5 result tiles; short motion recap, no invented statistics.
3. **Individual standings reveal** — ranks 10 through 4, then top three podium cards.
4. **Optional awards** — top scorer, MVP, penalty hero, or other awards only if explicitly enabled and rule-backed.
5. **Runner-up reveal** — balanced recognition, final score context.
6. **Champion reveal** — full hero treatment, confetti burst, final score and penalty notation if applicable.
7. **Photo hold** — stable, animation-light frame for stage photography.
8. **Partner thank-you** — sponsor wall in approved hierarchy and original colors.
9. **Closing** — event mark, public results QR, `THANK YOU`, ambient loop.

### 20.3 Ceremony controller

- Cue list with previous/current/next.
- Preview/program panes.
- `Take`, `Back`, `Hold`, `Replay sting`, `Skip`, and emergency holding.
- Manual hold by default; optional timed advance per cue.
- Readiness and asset warnings before take-live.
- Cue completion audit.
- No scoring edits inside the ceremony controller; reopen score in the proper admin flow.

---

## 21. Settings and defaults

### 21.1 Competition defaults

| Setting | Default |
|---|---|
| Teams | 2 |
| Players per team | 5 |
| Slots | A1–A5, B1–B5 |
| Challenges | 5 |
| Challenges 1–4 | 5 × 1v1 rounds each |
| Challenge 5 | 1 × 5v5 match |
| Initial regular score | 0–0 |
| Initial points values | 0 until reviewed/locked |
| Initial penalty score | 0–0 |
| 1v1 round threshold | 60 seconds; confirm display direction |
| Final match | 40 minutes, count up |
| First half | 00:00–20:00 |
| Second half | 20:00–40:00 |
| Extra time | Off |
| Penalty tiebreak | Available only on draw; detailed format open |

### 21.2 Display defaults

| Setting | Default |
|---|---|
| TV canvas | 1920×1080, 16:9 |
| Global QR | On |
| Sponsor ticker | On |
| Original sponsor colors | Enforced |
| Ticker behavior | Continuous |
| Holding status | Starting soon |
| Goal animation | On |
| Ambient background motion | On |
| Audio | Off until approved |
| Reduced motion | Follow device/operator override |
| Awaiting-score screen after timer | On |
| Result auto-publish | Off by default; manual official submit/publish |

### 21.3 Operational defaults

| Setting | Default |
|---|---|
| Active score controllers | 1 per active round/match |
| Other admin devices | Read-only live view |
| Controller lease target | 15 seconds, 5-second renewal; rehearse |
| Offline public behavior | Last confirmed snapshot |
| Offline controller queue | Short bounded queue, pending until confirmation |
| Official submission | Requires online acknowledgement |
| Corrections | Audit reason required after publication |
| Public unpublished data | Never exposed |

---

## 22. Security, privacy, and resilience

### 22.1 Security controls

- Role-based authorization on every command.
- Row-level/data-level access restrictions per event.
- Short-lived authenticated sessions and revocable device sessions.
- Controller lease verified on the server, not only hidden in UI.
- Rate limiting and replay protection for mutation commands.
- Idempotency keys for every score action.
- SVG sanitization and content-security policy.
- No secrets in the repository or public client bundle.
- Database backups and point-in-time recovery if supported by the chosen provider.
- Immutable audit record for privileged actions.

### 22.2 Player privacy

Open policy decisions are required for player names, images, bios, and retention. Minimum recommended controls:

- documented consent for public display and photography;
- public/private field classification;
- ability to replace a photo with initials/silhouette;
- no personal contact details in public data;
- asset retention and deletion policy after the event;
- restricted original-photo access.

### 22.3 Event-day resilience

- Local cached public/TV bundle and assets.
- Preloaded player/sponsor media before doors open.
- Secondary internet path/hotspot tested.
- At least two registered scorekeeper devices.
- One spare display device/cable path.
- Printable/manual score sheet for disaster recovery.
- Export/import procedure to reconcile manual records if the platform is unavailable.
- Event holding scene available even when live data is disconnected.

---

## 23. Performance and quality targets

Recommended targets to validate with the venue and anticipated audience:

- Live confirmed score visible on connected public/TV clients within 500 ms at p95 after server commit.
- Timer drift less than 250 ms after synchronization and corrected smoothly.
- TV scene steady at 60 fps on the event device; no essential transition below 30 fps.
- Initial TV asset preload completes before program mode becomes available.
- Public mobile core content usable within 2.5 seconds on a representative 4G connection.
- No layout shift in score, timer, player name, or sponsor zones after fonts/assets load.
- Reconnection returns to the current authoritative revision without duplicate events.
- Controller tap acknowledgement appears within 100 ms locally and server confirmation state is distinct.
- All essential operations remain usable at 1024×768 tablet size and modern phone portrait sizes.

Final concurrency/load targets require the expected spectator count.

---

## 24. Deployment and repository strategy

### 24.1 Existing repository first

The existing Git repository is the intended starting point, but its URL, branch, stack, and current state must be supplied or synced before development. The first implementation action is an architecture/repository audit—not a rewrite.

Audit checklist:

- framework/runtime versions;
- current database and migration approach;
- authentication and roles;
- existing scoring or timer code;
- existing QR implementation;
- existing realtime/offline behavior;
- media/asset folders and licensing;
- current deployment configuration;
- automated tests and CI;
- environment-variable inventory;
- security and dependency status.

### 24.2 Branching and review

Recommended:

- protected `main` for production;
- `develop` or staging integration branch only if the team’s existing workflow needs it;
- short feature branches;
- pull requests with product, score-rule, and visual acceptance checks;
- no direct event-day feature work on production;
- tag the rehearsed release, for example `event-2026-08-27`;
- keep an immediately deployable rollback release.

### 24.3 Environments

| Environment | Purpose | Data |
|---|---|---|
| Local | Development and unit tests | Synthetic fixtures only |
| Preview | Per-change review and visual QA | Seeded demo event |
| Staging | Full rehearsal, device tests, scoring dry run | Production-like event clone with test identities |
| Production | Live event | Approved roster and brand assets |

Production and staging must use different credentials, databases, realtime channels, storage buckets, and QR destinations.

### 24.4 Database migrations

- Version-controlled, forward-only normal path.
- Backward-compatible during live-release windows.
- Tested against a production-like snapshot.
- Seed script creates the fixed five-challenge structure for rehearsal.
- Rollback plan documented for every high-risk migration.
- No destructive migration during the event freeze window.

### 24.5 Release gates

No production release unless:

- scoring engine tests pass;
- five-challenge end-to-end rehearsal passes;
- multi-device lease and takeover tests pass;
- offline/reconnect tests pass;
- 1920×1080 visual regression is approved;
- all ten player photos and 13 logo assets pass production validation;
- QR scans from venue distance;
- display and controller health checks pass;
- backup/rollback runbook is current;
- event admin signs off on scoring profile and penalty format.

### 24.6 Event-day freeze

Recommended:

- feature freeze 48 hours before the event;
- content/roster freeze 12–24 hours before, with emergency correction path;
- full dress rehearsal on the real LED/controller network;
- production deployment tagged and rollback verified;
- only critical fixes after freeze, with two-person review.

---

## 25. Testing and QA plan

### 25.1 Unit tests — domain and scoring

- Challenge factory always creates 4×5 1v1 rounds + 1×5v5 match.
- Slot uniqueness and player uniqueness.
- Pairing A1↔B1 through A5↔B5 after rearrangement.
- Regular goal additions/reversals.
- In-play penalty counts as a regular goal.
- Tiebreak penalty never changes regular score.
- Draw preserves separate player points.
- Ranking uses only approved tie-break rules.
- Ledger reversals recompute totals correctly.
- Duplicate idempotency key has no second effect.
- Stale revision cannot mutate state.
- Timer segments calculate 0–20 and 20–40 correctly.
- 60-second transition enters awaiting-official-score without auto-submit.
- Historical lineup snapshot remains unchanged after later lineup edits.

### 25.2 Property/invariant tests

- Confirmed score never becomes negative.
- Every displayed point total equals the sum of confirmed ledger entries.
- A reversed goal contributes zero to the official score.
- Only one active controller lease exists.
- Public snapshot revision never exceeds authoritative event revision.
- A completed result has exactly one official current version.
- Penalty attempts exist only under an eligible draw state.

### 25.3 Integration tests

- Score command transaction writes event, audit entry, ledger impact, snapshot, and broadcast revision atomically.
- Controller lease claim, renew, transfer, expiry, and emergency takeover.
- Realtime clients recover from missed revisions.
- Offline queue replays idempotently.
- Expired-controller pending actions require reconciliation.
- Asset upload sanitization and CDN availability.
- QR target validation.
- Role policies block unauthorized score/display commands.

### 25.4 End-to-end competition scenarios

1. Create event and ten players.
2. Fill A1–A5/B1–B5 and verify dropdown exclusions.
3. Build/lock Challenge 1.
4. Run five 60-second rounds, including a goal correction and draw.
5. Publish result and verify individual points.
6. Rearrange lineup for Challenge 2 without changing Challenge 1 history.
7. Complete Challenges 2–4.
8. Run 5v5 final through 20:00 halftime and 40:00 full time.
9. Test an in-play penalty goal.
10. Finish drawn; execute penalty tiebreak; verify separate regular/penalty displays.
11. Lock standings and run full ceremony.
12. Export audit/result report.

### 25.5 Multi-device chaos scenarios

- Two controllers tap goal simultaneously.
- Active controller loses Wi-Fi for 5, 15, and 60 seconds.
- Read-only device requests takeover.
- Display reconnects after missing multiple scene cues.
- Server confirms a command after client timeout/retry.
- Browser refresh during running timer.
- Duplicate websocket messages.
- Out-of-order event delivery.
- Device clock is incorrect by several minutes.
- TV device sleeps/wakes or exits fullscreen.

### 25.6 Visual QA

Capture and approve every TV composition at:

- 1920×1080;
- 1366×768;
- venue’s exact LED processor resolution;
- overscan/safe-area simulation;
- representative high/low brightness.

Test content extremes:

- longest and shortest player names;
- missing photo fallback;
- double-digit score if the format allows it;
- tied ranks;
- long sponsor marks;
- regular + penalty notation;
- offline/reconnecting messages;
- reduced motion.

### 25.7 Browser/device matrix

- Event controller device(s) and OS versions.
- Display computer/browser used at venue.
- Current stable Chrome, Safari, and Edge for public/admin surfaces.
- iOS Safari and Android Chrome for QR/public dashboard.
- Touch targets with wet/bright outdoor conditions in mind.

### 25.8 Accessibility QA

- Automated accessibility scan.
- Keyboard-only admin flow.
- Screen-reader public score and standings check.
- Color-blind simulation for team/score differentiation.
- Reduced-motion and zoom/text-scale tests.
- Essential state readable without animation or audio.

### 25.9 Rehearsal sign-off

Run a timed dress rehearsal with real operators, all ten player records, final logos, the actual LED path, and the venue network. Record:

- scorekeeper errors/tap count;
- controller latency;
- display latency and frame drops;
- QR scan distance;
- sponsor legibility;
- player-name/photo legibility;
- scene transition timing;
- recovery time after simulated disconnect.

---

## 26. Implementation phases

### Phase 0 — Requirement and asset lock

**Work:** confirm open scoring/penalty rules, audit existing repo, normalize brand assets, collect roster/photos, confirm LED/network/deployment details.  
**Exit:** signed rules matrix, production asset manifest, repository architecture decision, accepted screen compositions.

### Phase 1 — Domain foundation and data model

**Work:** schema, migrations, roles, event/challenge factory, score event model, points ledger, state machines, test fixtures.  
**Exit:** automated tests prove the five-challenge format and scoring invariants.

### Phase 2 — Admin setup and lineup workflow

**Work:** event/team/player setup, ten-slot selector, duplicate exclusion, per-challenge snapshots, scoring profile/settings lock.  
**Exit:** admin can configure a valid event without database/manual code access.

### Phase 3 — Live scoring, timers, and controller lease

**Work:** Active Score Controller, goal/scorer flows, timer behavior, official submission, corrections, audit log, single-controller lease.  
**Exit:** two-device scoring rehearsal passes without duplicate/conflicting actions.

### Phase 4 — Realtime public dashboard

**Work:** published snapshots, live public routes, standings, player profiles/cards, QR destination, offline cached read state.  
**Exit:** spectators can follow a full synthetic event on mobile and desktop.

### Phase 5 — Broadcast design system and eight TV screens

**Work:** visual tokens, player-card variants, all eight compositions, preview/program control, sponsor ticker, QR, motion and reduced motion.  
**Exit:** visual regression and 1080p operator review approved.

### Phase 6 — Final match, penalties, ceremony

**Work:** 2×20 final clock, draw/tiebreak flow, penalty attempts, final standings lock, ceremony controller/cues.  
**Exit:** complete end-to-end competition + ceremony rehearsal passes.

### Phase 7 — Offline recovery, hardening, and observability

**Work:** bounded offline queue, conflict reconciliation, display recovery, monitoring, backups, security review, load/performance tuning.  
**Exit:** chaos tests and operational runbook approved.

### Phase 8 — Production rehearsal and launch

**Work:** production data/assets, venue device setup, QR scan test, full dress rehearsal, release freeze, rollback verification, operator training.  
**Exit:** formal go-live sign-off.

### Phase 9 — Post-event closeout

**Work:** export official results/audit, sponsor exposure report, incident review, asset/privacy retention, archive event, backlog improvements.  
**Exit:** event archived safely and reusable platform improvements documented.

---

## 27. Deliverables by workstream

### Product/rules

- Approved rules and scoring profile.
- Challenge/round state diagrams.
- Admin and scorekeeper journey maps.
- Event-day operations runbook.

### Design

- Production brand/asset manifest.
- Visual tokens and typography specification.
- Player photography guide.
- Player-card component library.
- Eight TV/LED compositions at 1920×1080.
- Public responsive designs.
- Motion storyboard and reduced-motion variants.
- Sponsor ticker and ceremony storyboard.

### Engineering

- Database migrations and access policies.
- Domain/scoring package with automated tests.
- Admin, controller, public, and TV surfaces.
- Realtime/reconnection/offline behavior.
- Deployment pipelines and environment configuration.
- Monitoring and backup/recovery setup.

### QA/operations

- Test plan and results.
- Device/browser matrix.
- Rehearsal report.
- Go-live/rollback checklist.
- Official result and audit export.

---

## 28. Open inputs still needed

### 28.1 Competition and scoring

- Exact points per regular goal.
- Whether 1v1 win/draw/challenge bonuses exist and their values.
- How the five 1v1 rounds determine the challenge winner: round wins, total goals, or total points.
- Whether final-match goals/ win award different points.
- Exact individual ranking tie-break sequence after regular points.
- Which draws require a penalty tiebreak: each round, each challenge, final match only, or another scope.
- Penalty format: opening attempts per side, turn order, sudden death, eligible takers.
- Whether separate penalty points are awarded per scored attempt, only to the winner, or another rule.
- Confirm 1v1 timer displays count-up 00:00→01:00 rather than countdown.
- Whether the scorekeeper may stop a 1v1 round early.
- Any mercy/max-score rule.

### 28.2 Event content

- Final official event name/capitalization and subtitle.
- Confirm event date, start time, venue copy, and timezone.
- Team A and Team B public names, colors, and crests.
- Ten player names, preferred display names, photos/cutouts, and consent.
- Player bios or whether profiles should remain name/photo/points only.
- Challenge names and descriptions beyond Challenge 1–5.
- Public language: English only or bilingual English/Arabic.

### 28.3 Brand and sponsors

- Contractually approved sponsor hierarchy and exact labels: host, partner, operator, powered by.
- Approval of the proposed ticker order.
- Sponsor destination URLs.
- True-vector transparent masters for the assets identified in the audit, especially Tellr and Move Beyond light blue.
- Transparent event lockups separated from the three full-screen background compositions.
- Minimum clear-space/brand guide for each sponsor.
- Final palette and typography licenses/files.

### 28.4 TV/LED and show production

- Exact LED pixel resolution, aspect ratio, processor, overscan, safe area, brightness, and refresh rate.
- Number of displays and whether they show one program feed or targeted scenes.
- Display computer/browser and available GPU.
- Network topology and backup internet.
- Audio capability and approved stings.
- Whether a start countdown is required on the holding screen.
- Ceremony award list, presenter order, and stage timing.
- Required sponsor exposure/thank-you duration.

### 28.5 QR/public URL

- Final production domain and event slug.
- Whether the QR needs campaign tracking parameters.
- Whether results remain public after the event and for how long.

### 28.6 Repository and deployment

- Git repository URL and default branch.
- Current stack and setup instructions.
- Hosting/database provider and account/region.
- Staging and production domains.
- Existing QR/realtime/auth code referred to in the earlier conversation.
- Environment owners and secret-management process.
- Expected concurrent public audience.
- Monitoring/error-reporting accounts.

### 28.7 Operations and permissions

- Named admin, scorekeeper, and display-operator users.
- Who may approve controller takeover and reopen a published result.
- Offline tolerance and manual fallback owner.
- Official result approver.
- Player data retention and deletion policy.

---

## 29. Definition of done

The platform is ready for the event only when all of the following are true:

- The fixed five-challenge structure is implemented exactly.
- Ten unique player slots can be filled and rearranged per challenge without duplicates.
- Every historical challenge retains its actual lineup.
- Regular goals, in-play penalties, and penalty-tiebreak attempts behave as specified and remain separate where required.
- Individual player points are auditable and ties behave according to the locked profile.
- 1v1 timer completion shows the awaiting-official-score loading state until admin submission.
- Final clock counts 0–20 and 20–40 correctly.
- One and only one Active Score Controller can mutate a live match.
- Public/TV clients recover from disconnect without resetting or duplicating state.
- The public dashboard and QR work on representative iOS/Android devices.
- All eight TV scenes are approved at the venue’s actual resolution.
- Player cards, photos, long names, missing-photo fallbacks, and tied ranks pass visual QA.
- Sponsor logos use original approved colors and the ticker is seamless.
- Ceremony runs from locked official data.
- Security, scoring, multi-device, offline, E2E, visual, and accessibility tests pass.
- Production has a rehearsed rollback and manual scoring fallback.
- Event admin, scorekeeper, display operator, brand owner, and technical owner sign off.

---

## 30. Recommended immediate next actions — before coding

1. Provide/sync the existing Git repository for a read-only architecture audit.
2. Approve the open scoring and penalty rules.
3. Approve the eight screen compositions and sponsor hierarchy in this document.
4. Deliver the ten-player roster and photography.
5. Re-export the flagged logo files as tight transparent vector masters while preserving supplied originals.
6. Confirm the production URL/QR target and LED specifications.
7. Turn the approved plan into a prioritized implementation backlog and acceptance-test matrix.

No application implementation should begin until actions 1–3 are complete; visual production can begin in parallel once brand assets and player photography are available.

---

## Appendix A — Core operator checklist

### Before doors open

- Production release/tag verified.
- Controller and backup controller charged and registered.
- Display devices online, fullscreen, awake, and on current program revision.
- All assets preloaded; no missing photos/logos.
- QR scanned from venue floor.
- Sponsor ticker order and colors checked.
- Scoring profile and penalty rules locked.
- Challenge 1 lineup validated and locked.
- Manual fallback score sheet printed.
- Backup internet and rollback procedure ready.

### Before each challenge

- Confirm challenge number and format.
- Review ten unique slots and pairings.
- Lock lineup snapshot.
- Confirm Active Score Controller.
- Preview next TV scene.
- Confirm timer mode.
- Take lineup/head-to-head scene live.

### After each round/match

- Verify score and scorer attribution.
- Resolve pending/offline actions.
- Submit official result.
- Review points impact.
- Publish result.
- Cue result/leaderboard/next matchup.

### Before ceremony

- All five challenge results official.
- Penalty tiebreak complete where required.
- Standings reviewed.
- Final result locked.
- Ceremony cues and optional awards verified.
- Champion/runner-up photos loaded.
- Sponsor thank-you wall approved.

---

## Appendix B — Requirement traceability summary

| Confirmed requirement | Plan location |
|---|---|
| Use Sports United; remove UMS | Sections 2, 14 |
| Keep sponsor/logo original colors | Sections 12–14 |
| Challenges 1–4 contain five A-slot vs B-slot 1v1 rounds | Sections 3, 4, 25 |
| Challenge 5 is one full 5v5 match | Sections 3, 5, 17 |
| Numeric defaults start at 0 | Sections 4, 21 |
| Draw is allowed; players keep separate records | Sections 3, 4, 17 |
| In-play penalty counts as a normal goal | Section 4 |
| Separate penalty points/tiebreak data used only for draw resolution | Section 4 |
| Admin fills ten slots; selected names disappear from other dropdowns | Sections 3, 10, 25 |
| Final match clock counts 0–20, then 20–40 | Sections 5, 17, 21 |
| After the 60-second point, show loading until admin submits official score | Sections 5, 17, 21 |
| Live display scope is clock, goals, scorers, penalties | Sections 11, 16 |
| Multi-device Active Score Controller | Sections 8–9 |
| Public dashboard, QR, sponsor ticker, ceremony, and eight TV scenes | Sections 11, 14–20 |
| Design/player cards are the product priority | Sections 1, 12, 18–19 |

---

## Appendix C — Planning evidence boundary

This plan was built from the bounded referenced-conversation preview and the thirteen supplied SVG assets. The current local project mirror did not contain the application Git repository or synced source attachments. Therefore:

- confirmed statements visible in the referenced conversation are treated as requirements;
- architectural choices are marked as recommendations until the existing repository is audited;
- missing numeric/business decisions are listed as open instead of being guessed;
- the SVG findings are based on direct structural and visual inspection of all thirteen supplied files.

