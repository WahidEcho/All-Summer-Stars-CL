Great. I’d treat this as the **TV/LED broadcast design specification** first. Once these 8 screens are locked, the web implementation becomes much easier because every component already has a defined visual role.

The master canvas should be **1920 × 1080 / 16:9**, scaling responsively to other 16:9 screens. The visual language remains **light baby blue + white/off-white**, oversized football typography, soft navy for readable text, original sponsor colors, subtle star/pitch geometry, and strong use of player photography.

## Global screen structure

Every public/TV state should preserve enough visual consistency that spectators always understand they are inside the same event.

**Top zone — ~11% of screen height**

Left:
Competition logo.

Center:
Current competition/challenge context.

Right:
Permanent QR with very short text such as:

**SCAN FOR LIVE SCORES**

The QR should never dominate the design, but it should always be visible.

**Bottom zone — ~8%**

Continuous sponsor ticker:

**Yalla Sahel → Tellr → SwanLake North Coast → Hassan Allam → Sports United → Powered by Move Beyond → repeat**

Smooth horizontal movement. No abrupt carousel switching.

That leaves roughly **81% of the screen** for the actual live content.

---

# SCREEN 01 — HOLDING / EVENT INTRO

This is what appears before the competition begins, between long breaks, or whenever the admin selects `HOLDING SCREEN`.

### Composition

The competition logo should occupy roughly **40–45% of the screen width** and sit slightly above center.

Behind it:

* pale animated star pattern
* very subtle moving football pitch geometry
* slow baby-blue gradient movement
* occasional very soft light sweep

Under the logo:

**THURSDAY • 27 AUGUST 2026**

Then:

**LIVE FROM SWANLAKE NORTH COAST**

A small status pill:

`STARTING SOON`

### Bottom-right

Permanent QR.

### Optional bottom-left

Countdown until event starts:

**STARTS IN 12:43**

This can be enabled/disabled from admin.

### Animation

Very restrained.

The Holding Screen should look expensive, not hyperactive.

Every ~12–15 seconds:

* event logo gently scales 100% → 103% → 100%
* star outline moves
* subtle light sweep passes behind logo

Sponsor ticker remains constantly moving.

---

# SCREEN 02 — MAIN LIVE DASHBOARD

This is the **most important page in the entire platform**.

It needs to answer immediately:

**What is happening?
Who is playing?
What is the score?
Which team is leading?
Who are the best players?**

### Layout

Think approximately:

```text
┌──────────────────────────────────────────────────────────────┐
│ EVENT LOGO       CHALLENGE 02 • ROUND 3/5                QR │
├────────────────────────────────────────────┬─────────────────┤
│                                            │                 │
│             CURRENT LIVE BATTLE            │   TOP 5         │
│                                            │   PLAYERS       │
│    PLAYER A3          VS       PLAYER B3   │                 │
│                                            │   #1 ...        │
│      PHOTO                       PHOTO      │   #2 ...        │
│                                            │   #3 ...        │
│       7 PTS                      5 PTS      │   #4 ...        │
│                                            │   #5 ...        │
├────────────────────────────────────────────┴─────────────────┤
│ TEAM A   78 PTS                TEAM B   71 PTS              │
├──────────────────────────────────────────────────────────────┤
│                    MOVING SPONSOR FOOTER                     │
└──────────────────────────────────────────────────────────────┘
```

### Main live battle

Approximately **70% width**.

Both player photos should be large, ideally cut-outs.

Player A occupies left half.

Player B occupies right half.

Middle:

large **VS**, or when actively scoring, the challenge score itself.

### Player information

Under each photo:

**PLAYER NAME**

Then:

`CURRENT ROUND 7 PTS`

Smaller:

`TOTAL 33 PTS • RANK #2`

If ranking changes:

`#4 → #2`

briefly animate.

### Right leaderboard panel

Approximately **25–28% width**.

Top title:

**TOP 5 PLAYERS**

Each row includes:

* rank
* thumbnail/photo
* player name
* team
* total points

#1 gets a visibly larger row.

### Team-score strip

Large and unmistakable:

**TEAM A 78 — 71 TEAM B**

Below:

`TEAM A LEADS BY 7`

This updates throughout every attempt.

---

# SCREEN 03 — 1v1 LIVE CHALLENGE

When someone selects the individual round itself, we move from dashboard mode into a more cinematic **player-vs-player presentation**.

This should use almost the whole screen for the two players.

### Top center

**CHALLENGE 01**

**MANNEQUIN TARGET**

Smaller:

`ROUND 3 OF 5`

### Players

Left ~42%:

A3 photo occupying most of the height.

Right ~42%:

B3 photo.

Center ~16%:

VS / timer / attempt state.

### Player cards

Instead of rectangular UI boxes, think sports broadcast graphics.

Example:

```text
A3
PLAYER NAME

ROUND SCORE
8

TOTAL
31 PTS

RANK
#2
```

### Current attempt

Bottom-center but above sponsor ticker:

**ATTEMPT 2 / 3**

Then graphical attempt history:

Player A:

`5 • 3 • —`

Player B:

`3 • — • —`

The current attempt pulses subtly.

### Score event animation

When admin enters `5`:

A large:

**+5**

appears near the player.

Then flies into:

**ROUND SCORE**

Then updates:

**TOTAL SCORE**

Then potentially updates:

**RANK**

Then updates:

**TEAM TOTAL**

This sequence should take roughly **1–1.5 seconds**, not longer.

Fast and satisfying.

---

# SCREEN 04 — READY / TIMER / ATTEMPT SCREEN

This handles Challenge 2 and Challenge 4, and can also be reused whenever an individual player needs a timed attempt.

This is where the Kahoot-style anticipation rhythm is most useful.

### Initial state

Large player photo on one side.

Challenge illustration/icon on the other.

Center:

**PLAYER A2**

Then:

**GET READY**

### Challenge 2 countdown

5-second sequence.

Instead of displaying every second conventionally:

**READY**

then:

**STEADY**

then:

**3**

**2**

**1**

**GO!**

Then timer begins.

Actual time displays enormous:

**00:07.48**

Admin controls:

Start / Pause / Resume / Reset.

Public does **not** see controls.

### Challenge 4

Use the 10-second pre-start sequence.

Then:

**60.0**

counts downward.

Also show 10 ball indicators:

```text
● ● ● ● ● ● ● ● ● ●
```

Successful:

`✓`

Miss:

`×`

Unplayed:

`●`

Example:

`✓ ✓ × ✓ ✓ × ● ● ● ●`

### At 00:00

Full-screen flash:

**TIME!**

Then immediately:

**RESULT BEING VERIFIED**

Player remains visible in faded background.

Animated three-dot loader.

No provisional score is exposed.

Once admin confirms:

transition into the result screen.

This is important because it makes the admin-controlled result feel intentional rather than delayed.

---

# SCREEN 05 — ROUND RESULT

This happens after every A1/B1, A2/B2, etc.

It remains on-screen until the admin manually advances.

### Opening

0–0.5 sec:

Gameplay UI fades.

0.5–1.2 sec:

Large:

**ROUND COMPLETE**

1.2–2 sec:

Both players re-enter as portrait cards.

### Winner version

Winner card grows approximately 10–15% larger.

Headline:

**ROUND WINNER**

Then:

**PLAYER A3**

### Data presentation

Winner:

**ROUND SCORE — 10**

**TOTAL POINTS — 37**

**CURRENT RANK — #2**

Opponent:

**ROUND SCORE — 7**

**TOTAL POINTS — 31**

**CURRENT RANK — #4**

### Tie

Instead:

**ROUND DRAW**

Both cards remain equal size.

Their independent scores still show.

### Bottom half

Current team standings:

**TEAM A — 94**

**TEAM B — 87**

Then:

**TEAM A LEADS BY 7**

### Ranking movement

If A3 moved from #5 to #2:

brief:

**↑ 3 POSITIONS**

If he became first:

**NEW LEADER**

with stronger visual/audio cue.

The screen then stops moving and stays visually alive only through subtle background animation until admin starts the next round.

---

# SCREEN 06 — CHALLENGE COMPLETE

After all five 1v1 rounds within a challenge finish, this gives us a **chapter-ending moment**.

Example:

**CHALLENGE 02 COMPLETE**

**DRIBBLE & FINISH**

### Main visual

Two large team panels.

Team A:

* total points earned during this challenge
* number of 1v1 wins
* best performer

Team B:

same.

Example:

```text
TEAM A                       TEAM B

  31                           27
CHALLENGE PTS               CHALLENGE PTS

3 ROUND WINS                2 ROUND WINS
```

### Center

**CHALLENGE WINNER**

TEAM A

If challenge is tied:

**CHALLENGE DRAW**

Remember: this does not add a bonus by default.

### Lower section

**TOP PERFORMANCE**

Large player card:

**PLAYER A4**

`10 PTS THIS CHALLENGE`

Then:

**CURRENT OVERALL LEADER**

**PLAYER B2 — 58 PTS**

### Mini Top 5

Animate into the screen after the challenge result.

This creates another opportunity to remind everyone that the individual leaderboard matters.

---

# SCREEN 07 — FINAL 5v5 MATCH

This should look more like an actual football broadcast.

Less game-show UI while the ball is in play.

### Header

Small competition logo.

Center:

**FINAL MATCH**

Right:

QR.

### Main scoreboard

Top-center:

```text
TEAM A        2 — 1        TEAM B
```

Below:

**27:14**

Because we're using continuous count-up:

First half:

`00:00 → 20:00`

Second:

`20:00 → 40:00`

### Main central visual

Can alternate between two modes.

#### Match mode

Big score.

Team names/colors.

Current match clock.

Latest scorer.

#### Player-impact mode

After a goal:

full screen temporarily switches to scorer animation.

### Goal sequence

Admin enters:

`TEAM A → PLAYER A3 → GOAL`

Immediately:

**GOAL!**

Player A3 cut-out fills the screen.

Then:

**PLAYER A3**

**27:14**

Then scoreboard:

**TEAM A 2 — 1 TEAM B**

Then:

**+10 PTS TO EVERY TEAM A PLAYER**

Five Team A player cards appear simultaneously:

```text
A1 +10
A2 +10
A3 +10
A4 +10
A5 +10
```

Their totals roll upward.

If leaderboard positions change, they move afterward.

Then return to match view.

### Own goal

Example:

**OWN GOAL**

**PLAYER B3**

Then:

**TEAM A 2 — 1 TEAM B**

Goal points still follow Team A.

### Half-time

At 20:00:

**HALF TIME**

Display:

* score
* scorers
* Team A overall competition points
* Team B overall competition points
* Top 5 players

Then admin starts second half.

---

# SCREEN 08 — FINAL CEREMONY / WINNERS

This needs to be the visual climax.

The entire event has been building toward this screen.

We should not show everything simultaneously.

Use a sequence.

### Phase A — competition complete

Darken the light background slightly.

Competition logo.

Then:

**COMPETITION COMPLETE**

Pause.

### Phase B — winning team

Large:

**2026 CHAMPIONS**

Then reveal winning team.

All five player photos appear together.

Team total:

**247 PTS**

Then:

**SWANLAKE FOOTBALL STARS CHAMPIONS**

Confetti / star-particle effect.

Music sting.

### Phase C — Top 5 players

Do not show all five immediately.

Reveal progressively.

**#5**

Player photo + name + points.

Then shift aside.

**#4**

Then #3.

#3 can begin the podium visual.

Then #2.

Pause.

Then:

**#1**

Large transition.

Full-screen player photo.

Strongest audio cue.

Text:

**TOP PLAYER**

**PLAYER NAME**

**73 PTS**

Then stats:

`CHALLENGE 1 — 11`

`CHALLENGE 2 — 12`

`CHALLENGE 3 — 20`

`CHALLENGE 4 — 7`

`FINAL MATCH — 23`

Then final composition shows all five.

### Final screen

Competition logo top.

Winning team center-left.

Top 5 center/right.

Sponsor strip below.

QR still visible.

This can remain as the event closing screen.

---

## The player-card system

Because you correctly said design is the thing we need to flex with, I would actually create **three card families**, all based on the same player identity.

**Hero Card**

Used in VS screens, goals, winners.

Huge photograph.

Very little text.

**Leaderboard Card**

Used in Top 5 / Top 10.

Horizontal.

Photo + rank + name + total.

**Mini Impact Card**

Used when all five players receive +10 after a goal.

Small but animated.

All three use the same visual DNA so the player feels recognizable everywhere.

---

## Photo treatment

The most premium approach will be:

**cut-out player photography rather than square passport photos.**

Imagine the player torso overlapping the card boundary.

Their photo can fade softly into the baby-blue background instead of looking trapped inside a rectangle.

Behind each player:

* oversized jersey number
* subtle team color
* faint star graphic
* surname in very large transparent typography

Example:

```text
        07

   [PLAYER CUTOUT]

     MOHAMED
      SALAH

       37
      PTS
```

This is the area where the design can go from **“good website”** to **“professional event broadcast.”**

---

## One design decision I recommend locking now

On LED/TV, **never make sponsor branding larger than the current players**.

The visual hierarchy should always be:

**Player / Action → Score → Event Identity → Team standings → Sponsors**

The sponsors stay constantly visible through the header/ticker, but the actual show remains about the football stars.

When you finish modifying the logos, send them over. After that, the next design pass should focus entirely on the **player-card visual system and one complete 1920×1080 master screen**, because once we nail that master style, the remaining seven screens can inherit it consistently.
