Yes — I got you. From this point, **the product should feel like a premium live sports show first and a management system second**.

The admin can stay clean and functional. The **public dashboard, LED screen, player cards, score reveals and animations are where we should spend the visual effort**.

The *SwanLake Football Stars – Shores & Scores Challenge* logo already gives us a very strong starting point: pale baby blue, white/cream, oversized condensed sports typography and star-line geometry.  SwanLake North Coast also works naturally inside that lighter visual language. 

## The visual direction I recommend

Think:

**Premium football broadcast × game-show energy × North Coast summer aesthetic**

Not dark esports. Not a normal admin dashboard.

Main palette:

* Baby blue
* White
* Soft off-white
* Very light grey-blue
* Dark navy only for readability
* Original sponsor colors
* Team colors used as accents when necessary

Backgrounds should feel alive but elegant:

* very subtle animated star geometry
* blurred light streaks
* soft football pitch lines
* moving gradients
* occasional particles during goals/wins
* lots of clean negative space

The event logo should remain the hero identity. 

---

# Player cards are the most important component

I would make the player card a reusable **hero component**, not a small database card.

### Standard player card

```text
┌─────────────────────────────────┐
│                         RANK #2 │
│                                 │
│        PLAYER CUTOUT            │
│        LARGE PHOTO              │
│                                 │
│   A1                            │
│   PLAYER NAME                   │
│   TEAM A                        │
│                                 │
│   24 PTS                        │
└─────────────────────────────────┘
```

But visually it should have:

* large cut-out player photo
* name in large sports typography
* current ranking badge
* total points
* team indicator
* subtle animated border
* team accent underneath
* animated number changes
* small upward/downward ranking indicator

When a player's score changes:

**`+5`** should appear beside him, animate upward, and then merge into his total.

Example:

**18 PTS → +5 → 23 PTS**

Then:

**RANK #4 → #2**

The card physically shifts upward in the leaderboard.

That visual movement will make the system feel much more expensive.

---

# 1v1 battle presentation

For every one of the five rounds inside each challenge:

```text
                 CHALLENGE 01
              ROUND 3 OF 5

      ┌─────────────┐     ┌─────────────┐
      │             │     │             │
      │   PLAYER    │ VS  │   PLAYER    │
      │     A3      │     │     B3      │
      │             │     │             │
      └─────────────┘     └─────────────┘

          12 PTS              9 PTS

     Overall Rank #3      Overall Rank #6
```

The photos should be **huge**.

I don't want the viewer looking for the names.

The hierarchy should be:

**PLAYER PHOTO → NAME → CURRENT ROUND SCORE → TOTAL SCORE → RANK**

Everything else is secondary.

---

# Before every round

I'd use a roughly 3-second cinematic entrance.

### Sequence

**0.0 sec**

Challenge title appears.

**0.5 sec**

Player A slides in from left.

**0.8 sec**

Player B slides in from right.

**1.2 sec**

Large animated:

**VS**

**1.7 sec**

Names + rankings appear.

**2.2 sec**

`READY`

**2.7 sec**

`GO`

Then scoring UI begins.

For Challenges 2 and 4, this flows into the longer Ready/Steady/Go timers we already defined.

---

# Score animations

Every score should feel physical.

If A2 hits the 50 target:

```text
TARGET 50

+5
```

The `+5` expands briefly.

Then it flies toward A2's total:

```text
12 → 17 PTS
```

Then, if necessary:

```text
RANK #5
     ↓
RANK #3
```

The team score should simultaneously update.

That gives the audience a clear connection:

**Attempt → Player → Ranking → Team**

---

# Round ending screen

This should probably be one of our strongest visual moments.

Admin presses:

**END ROUND**

The live gameplay screen fades slightly.

Then:

```text
ROUND COMPLETE
```

Winner card expands.

Example:

```text
            ROUND WINNER

            PLAYER A3

              18 PTS

          +5 THIS ROUND

          OVERALL: 31 PTS
             RANK #2
```

Then the opponent appears smaller:

```text
PLAYER B3
14 PTS
OVERALL 26
RANK #4
```

Then underneath:

```text
TEAM A                    TEAM B

  78                        71
              PTS
```

And:

**TEAM A LEADS BY 7**

This screen remains there indefinitely until admin advances.

Exactly as you requested.

---

# Challenge ending screen

Because every challenge contains **five 1v1 rounds**, once A5 vs B5 finishes, we should have another higher-level result.

Example:

```text
CHALLENGE 01 COMPLETE

MANNEQUIN TARGET

TEAM A                 TEAM B

  34                      29

TOP PERFORMANCE
PLAYER A2 — 10 PTS

CURRENT OVERALL LEADER

PLAYER B1
42 PTS
```

Then show a mini Top 5.

This makes each challenge feel like a chapter in the show rather than just five score entries.

---

# Main public dashboard

This should be the page people open from the QR.

I would structure the desktop/TV layout roughly like this:

```text
┌──────────────────────────────────────────────────────────────┐
│ EVENT LOGO       YALLA SAHEL        TELLR                  QR│
├──────────────────────────────────────────────────────────────┤
│                                                              │
│                         LIVE NOW                             │
│                                                              │
│        PLAYER A3                 PLAYER B3                   │
│        [ PHOTO ]        VS       [ PHOTO ]                   │
│                                                              │
│           7                       5                           │
│                                                              │
├─────────────────────┬────────────────────────────────────────┤
│ TEAM SCORE          │ TOP 5 PLAYERS                          │
│                     │                                        │
│ TEAM A  78          │ 1. A4   39 PTS                         │
│ TEAM B  71          │ 2. B2   35 PTS                         │
│                     │ 3. A1   31 PTS                         │
│ LEADER: TEAM A      │ 4. B5   27 PTS                         │
│                     │ 5. A3   26 PTS                         │
├─────────────────────┴────────────────────────────────────────┤
│ SWANLAKE • HASSAN ALLAM • SPORTS UNITED • MOVE BEYOND →     │
└──────────────────────────────────────────────────────────────┘
```

But visually much more cinematic than this wireframe.

---

# Sponsor pyramid

Your hierarchy is now:

### Main Identity

**SwanLake Football Stars – Shores & Scores Challenge**

### Main Partners

**Yalla Sahel + TELLR**

### Official Sponsors

**SwanLake North Coast + Hassan Allam + Sports United**

### Technology / Production

**Powered by Move Beyond**

Hassan Allam's supplied identity is strong and clean enough for the light layout.  Sports United should remain in its original red/black/white treatment as requested. 

On the actual scoring screen we should **not constantly show the entire pyramid at huge size**.

Instead:

Top:
**Competition logo + Yalla Sahel + Tellr**

Bottom moving ticker:
**SwanLake → Hassan Allam → Sports United → Move Beyond → repeat**

That protects screen space for players.

---

# Goal animation

This is another place to flex.

Admin:

**ADD GOAL → Team A → Player A3**

TV immediately goes:

```text
GOOOOOAL
```

Quick background movement.

Player A3's photo fills most of the screen.

```text
PLAYER A3
GOAL
23:41
```

Then:

```text
TEAM A  2 — 1  TEAM B
```

Then:

```text
ALL TEAM A PLAYERS
+10 PTS
```

We briefly show five small player cards receiving +10 simultaneously.

Then transition back to the match screen.

That will look very strong on the giant LED.

---

# Own goal treatment

If admin chooses Own Goal:

```text
OWN GOAL
PLAYER B2

TEAM A +1 GOAL
```

Points follow the Team A normal goal configuration.

---

# Ranking presentation

Since **Best 5 Players receive prizes**, the Top 5 should always feel important.

I'd make #1 visually larger.

```text
           #1
       PLAYER A4
        47 PTS

#2 Player B1     42
#3 Player A2     39
#4 Player B5     35
#5 Player A1     31
```

When someone enters the Top 5:

**NEW TOP 5**

brief animated badge.

When someone becomes #1:

**NEW LEADER**

stronger animation + audio cue.

---

# Challenge progression

A permanent thin progress indicator can show:

```text
01 TARGETS      ✓
02 DRIBBLE      ● LIVE
03 SHOOTING     ○
04 ACCURACY     ○
05 FINAL MATCH  ○
```

Inside Challenge 2:

```text
A1/B1 ✓   A2/B2 ✓   A3/B3 ●   A4/B4 ○   A5/B5 ○
```

That makes the event immediately understandable to spectators.

---

# Loading state after Challenge 4

Your idea here is good.

When 60 seconds finish:

```text
TIME!
```

Then screen changes to:

```text
RESULT BEING VERIFIED

● ● ●
```

Player remains visible in background.

Admin sees:

**CONFIRM FINAL RESULT**

Only after admin confirms do we show:

```text
8 / 10
8 PTS
```

Then perform the winner/rank/team reveal.

---

# Final winners sequence

This needs to be built almost like a ceremony.

### Part 1 — Winning team

Screen fades.

Competition logo.

Then:

**2026 CHAMPIONS**

Team name.

All five player photos.

Team total.

Celebration animation.

### Part 2 — Best 5 players

Reveal:

**#5**

then #4.

then #3.

then #2.

Pause.

Then dramatic reveal:

**#1 TOP PLAYER**

Large full-screen player photo.

Name.

Total points.

Team.

Stats from the four challenges + final match.

This should be the strongest screen of the night.

---

## What I need from you to make the design genuinely high-end

The most important thing now is **player assets**.

Please eventually give me:

1. **10 player names**
2. **10 player photos**
3. **Team A name**
4. **Team B name**
5. **Team A color**
6. **Team B color**

### Player photo recommendation

Best:

**transparent PNG cut-outs**, at least around **1500 px tall**.

Ideal photography:

* waist/chest upwards
* facing camera
* consistent lighting
* no heavy background
* arms crossed / football-player pose is perfect

If you only have normal portrait photos, that's okay. We can use them and later cut/background-treat them.

But **player photography will probably determine 50% of how premium this ends up looking**.

---

## Logos I would still prefer

For actual web implementation, please send transparent:

* **TELLR**
* **Yalla Sahel**
* **Move Beyond**
* **Sports United**
* **SwanLake**
* **Hassan Allam**
* Competition logo

**SVG is ideal. Transparent PNG is second-best.**

You already supplied good PDFs for several of them, so you do **not** need to recreate everything.    

For Tellr and Move Beyond specifically, the versions you just showed are raster graphics with backgrounds. For maximum flexibility on baby-blue/white screens, a **transparent original** would be much better.

---

The next thing I recommend we do **before coding** is go one step further on the design and define **8 exact screen compositions**:

**Holding Screen → Main Dashboard → 1v1 Live → Attempt Result → Round Winner → Challenge Winner → Final Match → Final Ceremony.**

We can define exactly where every photo, name, logo, number, QR and animation sits so that when development starts, there is almost zero design improvisation.
