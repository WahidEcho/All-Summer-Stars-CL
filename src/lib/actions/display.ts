"use server";

/**
 * Broadcast control commands.
 *
 * The display works the way a vision mixer does: `preview` is what the operator
 * is lining up, `program` is what the room can see. Nothing reaches the wall
 * until `takePreviewLive` cuts it there, so a half-built leaderboard never
 * flashes up behind the presenter.
 */

import {
  assertState,
  parseInput,
  runCommand,
  take,
} from "@/lib/actions/_command";
import {
  ceremonyPhaseSchema,
  commandBase,
  displaySceneSchema,
  startBreakSchema,
} from "@/lib/actions/schemas";
import type {
  ActionResult,
  CommandBase,
  DisplaySceneInput,
  StartBreakInput,
} from "@/lib/actions/types";
import type { Db } from "@/lib/event";
import type { DisplayStateRow } from "@/lib/types";

/** The display row for an event, created on first use. */
async function ensureDisplayState(
  db: Db,
  eventId: string,
): Promise<DisplayStateRow> {
  const existing = take<DisplayStateRow | null>(
    await db
      .from("display_state")
      .select("*")
      .eq("event_id", eventId)
      .maybeSingle(),
  );
  if (existing) return existing;

  return take<DisplayStateRow>(
    await db
      .from("display_state")
      .insert({ event_id: eventId, program_scene: "holding" })
      .select("*")
      .single(),
  );
}

async function writeDisplayState(
  db: Db,
  row: DisplayStateRow,
  patch: Record<string, unknown>,
  actorId: string | null,
): Promise<DisplayStateRow> {
  return take<DisplayStateRow>(
    await db
      .from("display_state")
      .update({
        ...patch,
        revision: Number(row.revision) + 1,
        updated_by: actorId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .single(),
  );
}

/** Two minutes: long enough to drink and get back, short enough to hold a room. */
const DEFAULT_BREAK_MS = 120_000;

/** Cut a scene straight to the wall. */
export async function setDisplayScene(
  input: DisplaySceneInput,
): Promise<ActionResult<DisplayStateRow>> {
  const parsed = parseInput(displaySceneSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<DisplayStateRow>({
    type: "display.program_set",
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { scene: value.scene, scenePayload: value.payload ?? {} },
    capability: "display",
    async run(ctx) {
      const row = await ensureDisplayState(ctx.db, ctx.eventId);
      const updated = await writeDisplayState(
        ctx.db,
        row,
        { program_scene: value.scene, program_payload: value.payload ?? {} },
        ctx.actor.id,
      );

      ctx.audit({
        action: "display.program_set",
        entityType: "display_state",
        entityId: row.id,
        before: { program_scene: row.program_scene },
        after: { program_scene: value.scene },
      });

      return updated;
    },
  });
}

/**
 * Call a break, and put its clock on the wall.
 *
 * The instant the break ends is stamped here, on the server, and the wall
 * derives its countdown from it — so the clock does not depend on the venue
 * machine's own idea of the time, a wall that reloads halfway through rejoins
 * the same countdown instead of restarting it, and calling a second or third
 * break is simply pressing the button again: a fresh instant replaces the old
 * one and the count starts over. There is nothing to reset between breaks.
 *
 * Nothing ends it but the operator. At zero the wall holds on BACK NOW rather
 * than cutting itself somewhere, because a screen that moves on its own during
 * a break is how a room misses the restart.
 */
export async function startBreak(
  input: StartBreakInput,
): Promise<ActionResult<DisplayStateRow>> {
  const parsed = parseInput(startBreakSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<DisplayStateRow>({
    type: "display.break_started",
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    payload: { durationMs: value.durationMs ?? DEFAULT_BREAK_MS },
    capability: "display",
    async run(ctx) {
      const row = await ensureDisplayState(ctx.db, ctx.eventId);
      const durationMs = value.durationMs ?? DEFAULT_BREAK_MS;
      const startedAt = new Date();
      const endsAt = new Date(startedAt.getTime() + durationMs);

      const updated = await writeDisplayState(
        ctx.db,
        row,
        {
          program_scene: "hydration_break",
          program_payload: {
            startedAt: startedAt.toISOString(),
            endsAt: endsAt.toISOString(),
            ...(value.headline ? { headline: value.headline } : {}),
          },
        },
        ctx.actor.id,
      );

      ctx.audit({
        action: "display.break_started",
        entityType: "display_state",
        entityId: row.id,
        before: { program_scene: row.program_scene },
        after: { program_scene: "hydration_break", durationMs },
      });

      return updated;
    },
  });
}

/** Line a scene up in preview without touching what is on air. */
export async function setPreviewScene(
  input: DisplaySceneInput,
): Promise<ActionResult<DisplayStateRow>> {
  const parsed = parseInput(displaySceneSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<DisplayStateRow>({
    type: "display.preview_set",
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { scene: value.scene, scenePayload: value.payload ?? {} },
    capability: "display",
    async run(ctx) {
      const row = await ensureDisplayState(ctx.db, ctx.eventId);
      const updated = await writeDisplayState(
        ctx.db,
        row,
        { preview_scene: value.scene, preview_payload: value.payload ?? {} },
        ctx.actor.id,
      );

      ctx.audit({
        action: "display.preview_set",
        entityType: "display_state",
        entityId: row.id,
        before: { preview_scene: row.preview_scene },
        after: { preview_scene: value.scene },
      });

      return updated;
    },
  });
}

/** Take the previewed scene to air and clear preview behind it. */
export async function takePreviewLive(
  input: CommandBase,
): Promise<ActionResult<DisplayStateRow>> {
  const parsed = parseInput(commandBase, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<DisplayStateRow>({
    type: "display.take",
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    capability: "display",
    async run(ctx) {
      const row = await ensureDisplayState(ctx.db, ctx.eventId);
      assertState(row.preview_scene !== null, "Nothing is loaded in preview.");

      const updated = await writeDisplayState(
        ctx.db,
        row,
        {
          program_scene: row.preview_scene,
          program_payload: row.preview_payload ?? {},
          preview_scene: null,
          preview_payload: {},
        },
        ctx.actor.id,
      );

      ctx.audit({
        action: "display.take",
        entityType: "display_state",
        entityId: row.id,
        before: {
          program_scene: row.program_scene,
          preview_scene: row.preview_scene,
        },
        after: { program_scene: row.preview_scene },
      });

      return updated;
    },
  });
}

/** Drop whatever is sitting in preview. */
export async function clearPreviewScene(
  input: CommandBase,
): Promise<ActionResult<DisplayStateRow>> {
  const parsed = parseInput(commandBase, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<DisplayStateRow>({
    type: "display.preview_cleared",
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    capability: "display",
    async run(ctx) {
      const row = await ensureDisplayState(ctx.db, ctx.eventId);
      const updated = await writeDisplayState(
        ctx.db,
        row,
        { preview_scene: null, preview_payload: {} },
        ctx.actor.id,
      );

      ctx.audit({
        action: "display.preview_cleared",
        entityType: "display_state",
        entityId: row.id,
        before: { preview_scene: row.preview_scene },
      });

      return updated;
    },
  });
}

/** Step the closing ceremony — third place, runner-up, champion, and so on. */
export async function setCeremonyPhase(
  input: CommandBase & { phase: string | null },
): Promise<ActionResult<DisplayStateRow>> {
  const parsed = parseInput(ceremonyPhaseSchema, input);
  if (!parsed.ok) return parsed;
  const value = parsed.value;

  return runCommand<DisplayStateRow>({
    type: "display.ceremony_phase_set",
    idempotencyKey: value.idempotencyKey,
    deviceId: value.deviceId,
    expectedRevision: value.expectedRevision,
    payload: { phase: value.phase },
    capability: "display",
    async run(ctx) {
      const row = await ensureDisplayState(ctx.db, ctx.eventId);
      const updated = await writeDisplayState(
        ctx.db,
        row,
        { ceremony_phase: value.phase },
        ctx.actor.id,
      );

      ctx.audit({
        action: "display.ceremony_phase_set",
        entityType: "display_state",
        entityId: row.id,
        before: { ceremony_phase: row.ceremony_phase },
        after: { ceremony_phase: value.phase },
      });

      return updated;
    },
  });
}
