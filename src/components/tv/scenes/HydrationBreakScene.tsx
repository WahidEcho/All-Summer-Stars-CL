"use client";

import { motion } from "motion/react";

import { SceneFrame } from "@/components/tv/SceneFrame";
import { EventMark } from "@/components/brand";
import { payloadString, type SceneProps } from "@/components/tv/scene-props";
import { DURATION, EASE, StatusPill, useMotionScale } from "@/components/ui";
import { useServerNow } from "@/components/tv/use-server-now";

/** What a break runs for when the payload does not say. */
const DEFAULT_BREAK_MS = 120_000;

/** `M:SS`, floor-free so the last second is shown as 0:01 rather than 0:00. */
function clock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/**
 * SCREEN 11 — HYDRATION BREAK.
 *
 * A break the operator calls between challenges, with the clock the room reads
 * to know when to be back. Manual in both directions: nothing starts it but a
 * press, and nothing ends it but the next scene — at zero the wall holds on
 * BACK NOW rather than cutting itself somewhere, because a screen that changes
 * on its own during a break is how a crowd misses the restart.
 *
 * The countdown is derived, never stored. `payload.endsAt` is an instant
 * stamped by the server when the break was called, so every press starts a
 * fresh one, three breaks in a day cost nothing, and a wall that reloads
 * halfway through rejoins the countdown already in progress instead of
 * starting it again.
 */
export function HydrationBreakScene({ model, payload }: SceneProps) {
  const motionOn = useMotionScale() === 1;
  const { snapshot } = model;

  const serverNow = useServerNow(snapshot.fetchedAt);

  const rawEnds = payloadString(payload, "endsAt");
  const endsAt = rawEnds ? Date.parse(rawEnds) : NaN;
  const rawStarted = payloadString(payload, "startedAt");
  const startedAt = rawStarted ? Date.parse(rawStarted) : NaN;

  // A payload with no usable instant still shows a full break rather than a
  // blank clock — the operator gets a screen, not a fault.
  const total =
    Number.isFinite(endsAt) && Number.isFinite(startedAt)
      ? Math.max(1_000, endsAt - startedAt)
      : DEFAULT_BREAK_MS;
  const remaining = Number.isFinite(endsAt)
    ? Math.max(0, endsAt - serverNow)
    : DEFAULT_BREAK_MS;

  const done = remaining <= 0;
  const progress = Math.min(1, Math.max(0, 1 - remaining / total));
  const headline = payloadString(payload, "headline") || "HYDRATION BREAK";

  return (
    <SceneFrame
      header={false}
      bleed
      starField="holding"
      sponsors={snapshot.sponsors}
    >
      {/* The break frame drops the standard header, so the competition would
          otherwise go unbranded for the two minutes the room spends looking at
          it — the one stretch of the show with nothing else on screen to say
          whose event this is. */}
      <div className="pointer-events-none absolute top-[40px] left-[64px] z-20 w-[320px]">
        <EventMark variant="light" title="" />
      </div>

      <motion.div
        initial={motionOn ? { opacity: 0, y: 18 } : false}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: DURATION.card, ease: EASE.entrance }}
        className="flex h-full flex-col items-center justify-center gap-10 text-center"
      >
        <span className="u-display text-ink text-[76px] leading-[0.9]">
          {headline}
        </span>

        <span
          data-break-clock
          className={cnClock(done)}
          style={{ fontVariantNumeric: "tabular-nums" }}
        >
          {done ? "BACK NOW" : clock(remaining)}
        </span>

        {/* The bar is the glanceable half: a figure has to be read, a bar does
            not, and most of the room is looking at this from the far side. The
            track carries its own visible weight — on the pale field a track
            that only appears once it has filled reads as a stray rule rather
            than as a bar with time left in it. */}
        <div
          aria-hidden
          className="h-[18px] w-[62%] overflow-hidden rounded-pill"
          // A literal tint of the fill rather than a palette token: the light
          // tones in the set land near-white on this field, which is what left
          // the track invisible and the fill looking like a stray rule.
          style={{ background: "rgba(61, 117, 126, 0.22)" }}
        >
          <div
            className="bg-aqua-700 h-full rounded-pill"
            style={{
              width: `${(progress * 100).toFixed(2)}%`,
              transition: "width 250ms linear",
            }}
          />
        </div>

        <StatusPill
          label={done ? "PLAY RESUMES NOW" : "PLAY RESUMES SHORTLY"}
          tone={done ? "live" : "pending"}
          size="lg"
          pulse={done}
        />

        <span className="u-sr-only" aria-live="polite">
          {done
            ? "The break has ended."
            : `${clock(remaining)} of the break remaining.`}
        </span>
      </motion.div>
    </SceneFrame>
  );
}

/** The clock's own type: enormous, and red once the break is over. */
function cnClock(done: boolean): string {
  return [
    "u-numeral leading-[0.82] tabular-nums",
    done ? "text-live text-[150px]" : "text-aqua-700 text-[260px]",
  ].join(" ");
}

export default HydrationBreakScene;
