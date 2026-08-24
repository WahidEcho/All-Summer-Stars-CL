'use server';

/**
 * Single-active-controller lease.
 *
 * Two scorekeepers tapping the same round on two tablets is the fastest way to
 * lose an event, so exactly one device holds the controls at a time. The lease
 * is a fifteen-second promise renewed every five: if a tablet's battery dies
 * mid-challenge, the controls free themselves ten seconds later instead of
 * needing a database console.
 *
 * A second device can ask politely (`requestControllerTransfer`, answered by the
 * holder) or, when the holder is unreachable and the show cannot wait, seize the
 * controls outright — which is always audited with a reason.
 *
 * These commands deliberately skip the `score_events` idempotency ledger: a
 * renewal every five seconds for three hours would bury the real command stream
 * under two thousand rows of heartbeat. They change no score and no result.
 */

import { resolveActor } from '@/lib/actions/_command';
import { createServiceClient } from '@/lib/supabase/server';
import { resolveEventId } from '@/lib/event';
import type { Db } from '@/lib/event';
import {
  claimLeaseSchema,
  formatIssues,
  releaseLeaseSchema,
  renewLeaseSchema,
  transferDecisionSchema,
  transferRequestSchema,
} from '@/lib/actions/schemas';
import {
  fail,
  ok,
  LEASE_TTL_MS,
  TRANSFER_REQUEST_KEY,
  type ActionResult,
  type ClaimLeaseInput,
  type ControllerLeaseState,
  type ControllerTransferRequest,
  type ReleaseLeaseInput,
} from '@/lib/actions/types';
import type { ControllerLeaseRow, EventRow } from '@/lib/types';

// ---------------------------------------------------------------------------
// Plumbing
// ---------------------------------------------------------------------------

interface LeaseEnv {
  db: Db;
  eventId: string;
  actorId: string | null;
  actorEmail: string | null;
}

/** Authenticate and resolve the event, or explain why we cannot. */
async function leaseEnv(): Promise<LeaseEnv | ActionResult<never>> {
  let db: Db;
  try {
    db = createServiceClient() as unknown as Db;
  } catch {
    return fail('unconfigured', 'Supabase service credentials are missing.');
  }

  const actor = await resolveActor();
  if (!actor) return fail('unauthorized', 'Sign in to take the controls.');
  if (actor.role === 'viewer') {
    return fail('forbidden', 'Viewers cannot take the controls.');
  }

  try {
    const eventId = await resolveEventId(db);
    return { db, eventId, actorId: actor.id, actorEmail: actor.email };
  } catch (error) {
    return fail('not_found', error instanceof Error ? error.message : 'Event not found.');
  }
}

function isEnv(value: LeaseEnv | ActionResult<never>): value is LeaseEnv {
  return !('ok' in value);
}

function expiryFrom(nowMs: number): string {
  return new Date(nowMs + LEASE_TTL_MS).toISOString();
}

/** A lease only counts while it is unreleased and unexpired. */
export async function isLeaseLive(
  lease: ControllerLeaseRow | null,
  nowMs: number = Date.now(),
): Promise<boolean> {
  if (!lease) return false;
  if (lease.released_at) return false;
  return Date.parse(lease.expires_at) > nowMs;
}

async function readLease(db: Db, eventId: string): Promise<ControllerLeaseRow | null> {
  const { data, error } = await db
    .from('controller_lease')
    .select('*')
    .eq('event_id', eventId)
    .maybeSingle();
  if (error) throw error;
  return (data as ControllerLeaseRow | null) ?? null;
}

async function readEvent(db: Db, eventId: string): Promise<EventRow | null> {
  const { data } = await db.from('events').select('*').eq('id', eventId).maybeSingle();
  return (data as EventRow | null) ?? null;
}

function transferRequestOf(event: EventRow | null): ControllerTransferRequest | null {
  const raw = event?.settings?.[TRANSFER_REQUEST_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<ControllerTransferRequest>;
  if (!r.deviceId || !r.requestedAt) return null;
  return {
    deviceId: r.deviceId,
    deviceLabel: r.deviceLabel ?? null,
    requestedAt: r.requestedAt,
    reason: r.reason ?? null,
  };
}

async function writeTransferRequest(
  db: Db,
  eventId: string,
  request: ControllerTransferRequest | null,
): Promise<void> {
  const event = await readEvent(db, eventId);
  const settings = { ...(event?.settings ?? {}) } as Record<string, unknown>;
  if (request) settings[TRANSFER_REQUEST_KEY] = request;
  else delete settings[TRANSFER_REQUEST_KEY];

  await db
    .from('events')
    .update({ settings, revision: Number(event?.revision ?? 0) + 1, updated_at: new Date().toISOString() })
    .eq('id', eventId);
}

async function auditLease(
  env: LeaseEnv,
  entry: {
    action: string;
    deviceId: string;
    before?: unknown;
    after?: unknown;
    reason?: string | null;
  },
): Promise<void> {
  await env.db.from('audit_logs').insert({
    event_id: env.eventId,
    actor_id: env.actorId,
    actor_email: env.actorEmail,
    device_id: entry.deviceId,
    action: entry.action,
    entity_type: 'controller_lease',
    entity_id: null,
    before: entry.before ?? null,
    after: entry.after ?? null,
    reason: entry.reason ?? null,
  });
}

async function upsertLease(
  env: LeaseEnv,
  existing: ControllerLeaseRow | null,
  fields: {
    deviceId: string;
    deviceLabel: string | null;
    reason: string | null;
    fresh: boolean;
  },
): Promise<ControllerLeaseRow> {
  const now = Date.now();
  const patch: Record<string, unknown> = {
    device_id: fields.deviceId,
    device_label: fields.deviceLabel,
    user_id: env.actorId,
    renewed_at: new Date(now).toISOString(),
    expires_at: expiryFrom(now),
    released_at: null,
    reason: fields.reason,
  };
  if (fields.fresh) patch.acquired_at = new Date(now).toISOString();

  if (!existing) {
    const { data, error } = await env.db
      .from('controller_lease')
      .insert({ event_id: env.eventId, ...patch, acquired_at: new Date(now).toISOString() })
      .select('*')
      .single();
    if (error) throw error;
    return data as ControllerLeaseRow;
  }

  const { data, error } = await env.db
    .from('controller_lease')
    .update(patch)
    .eq('id', existing.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as ControllerLeaseRow;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : 'Unexpected database error.';
}

// ---------------------------------------------------------------------------
// Commands
// ---------------------------------------------------------------------------

/** Who holds the controls, and is anyone asking for them. */
export async function getControllerLeaseState(): Promise<ActionResult<ControllerLeaseState>> {
  const env = await leaseEnv();
  if (!isEnv(env)) return env;

  try {
    const [lease, event] = await Promise.all([
      readLease(env.db, env.eventId),
      readEvent(env.db, env.eventId),
    ]);
    return ok({
      lease,
      transferRequest: transferRequestOf(event),
      serverNow: new Date().toISOString(),
    });
  } catch (error) {
    return fail('database_error', describe(error));
  }
}

/**
 * Take the controls.
 *
 * Succeeds when nobody holds them, when the holder's lease has lapsed, when the
 * caller already holds them (a renewal), or when `takeover` is set — the
 * emergency path, which is always written to the audit log with its reason.
 */
export async function claimControllerLease(
  input: ClaimLeaseInput,
): Promise<ActionResult<ControllerLeaseRow>> {
  const parsed = claimLeaseSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', formatIssues(parsed.error));
  const value = parsed.data;

  const env = await leaseEnv();
  if (!isEnv(env)) return env;

  try {
    const existing = await readLease(env.db, env.eventId);
    const live = await isLeaseLive(existing);
    const mine = existing?.device_id === value.deviceId;

    if (existing && live && !mine && !value.takeover) {
      return fail(
        'lease_held',
        `${existing.device_label ?? 'Another device'} is controlling the event. Request a transfer, or take over if it is unreachable.`,
        {
          deviceId: existing.device_id,
          deviceLabel: existing.device_label,
          expiresAt: existing.expires_at,
        },
      );
    }

    const seized = Boolean(existing && live && !mine && value.takeover);

    const lease = await upsertLease(env, existing, {
      deviceId: value.deviceId,
      deviceLabel: value.deviceLabel ?? null,
      reason: value.reason ?? null,
      fresh: !mine,
    });

    // Claiming settles any outstanding request from this device.
    const event = await readEvent(env.db, env.eventId);
    if (transferRequestOf(event)?.deviceId === value.deviceId) {
      await writeTransferRequest(env.db, env.eventId, null);
    }

    if (!mine) {
      await auditLease(env, {
        action: seized ? 'controller.taken_over' : 'controller.claimed',
        deviceId: value.deviceId,
        before: existing
          ? { device_id: existing.device_id, device_label: existing.device_label }
          : null,
        after: { device_id: value.deviceId, device_label: value.deviceLabel ?? null },
        reason: value.reason ?? (seized ? 'Emergency takeover.' : null),
      });
    }

    return ok(lease);
  } catch (error) {
    return fail('database_error', describe(error));
  }
}

/**
 * Heartbeat. Extends the lease by another fifteen seconds; fails if another
 * device has taken the controls in the meantime, so the caller can step back.
 */
export async function renewControllerLease(
  input: { deviceId: string },
): Promise<ActionResult<ControllerLeaseRow>> {
  const parsed = renewLeaseSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', formatIssues(parsed.error));
  const value = parsed.data;

  const env = await leaseEnv();
  if (!isEnv(env)) return env;

  try {
    const existing = await readLease(env.db, env.eventId);
    if (!existing || existing.device_id !== value.deviceId || existing.released_at) {
      return fail('lease_held', 'This device no longer holds the controls.', {
        deviceId: existing?.device_id ?? null,
        deviceLabel: existing?.device_label ?? null,
      });
    }

    const now = Date.now();
    const { data, error } = await env.db
      .from('controller_lease')
      .update({
        renewed_at: new Date(now).toISOString(),
        expires_at: expiryFrom(now),
      })
      .eq('id', existing.id)
      .eq('device_id', value.deviceId)
      .select('*')
      .single();
    if (error) throw error;

    return ok(data as ControllerLeaseRow);
  } catch (error) {
    return fail('database_error', describe(error));
  }
}

/** Hand the controls back deliberately, rather than waiting for the lease to lapse. */
export async function releaseControllerLease(
  input: ReleaseLeaseInput,
): Promise<ActionResult<ControllerLeaseRow>> {
  const parsed = releaseLeaseSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', formatIssues(parsed.error));
  const value = parsed.data;

  const env = await leaseEnv();
  if (!isEnv(env)) return env;

  try {
    const existing = await readLease(env.db, env.eventId);
    if (!existing || existing.device_id !== value.deviceId) {
      return fail('not_found', 'This device does not hold the controls.');
    }

    const now = new Date().toISOString();
    const { data, error } = await env.db
      .from('controller_lease')
      .update({ released_at: now, expires_at: now, reason: value.reason ?? null })
      .eq('id', existing.id)
      .select('*')
      .single();
    if (error) throw error;

    await auditLease(env, {
      action: 'controller.released',
      deviceId: value.deviceId,
      before: { device_id: existing.device_id, device_label: existing.device_label },
      after: { released_at: now },
      reason: value.reason ?? null,
    });

    return ok(data as ControllerLeaseRow);
  } catch (error) {
    return fail('database_error', describe(error));
  }
}

/**
 * Ask the current holder to hand over. The request rides on the event row, so
 * it reaches the holding device through the same realtime channel as
 * everything else, and it survives a page refresh on either side.
 */
export async function requestControllerTransfer(
  input: { deviceId: string; deviceLabel?: string | null; reason?: string | null },
): Promise<ActionResult<ControllerTransferRequest>> {
  const parsed = transferRequestSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', formatIssues(parsed.error));
  const value = parsed.data;

  const env = await leaseEnv();
  if (!isEnv(env)) return env;

  try {
    const existing = await readLease(env.db, env.eventId);
    if (existing?.device_id === value.deviceId && (await isLeaseLive(existing))) {
      return fail('illegal_state', 'This device already holds the controls.');
    }

    const request: ControllerTransferRequest = {
      deviceId: value.deviceId,
      deviceLabel: value.deviceLabel ?? null,
      requestedAt: new Date().toISOString(),
      reason: value.reason ?? null,
    };
    await writeTransferRequest(env.db, env.eventId, request);

    await auditLease(env, {
      action: 'controller.transfer_requested',
      deviceId: value.deviceId,
      after: request,
      reason: value.reason ?? null,
    });

    return ok(request);
  } catch (error) {
    return fail('database_error', describe(error));
  }
}

/**
 * Approve the pending request: the lease moves to the requesting device and the
 * request is cleared. Only the device currently holding the controls may do it.
 */
export async function approveControllerTransfer(
  input: { deviceId: string },
): Promise<ActionResult<ControllerLeaseRow>> {
  const parsed = transferDecisionSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', formatIssues(parsed.error));
  const value = parsed.data;

  const env = await leaseEnv();
  if (!isEnv(env)) return env;

  try {
    const [existing, event] = await Promise.all([
      readLease(env.db, env.eventId),
      readEvent(env.db, env.eventId),
    ]);

    const request = transferRequestOf(event);
    if (!request) return fail('not_found', 'There is no pending transfer request.');
    if (!existing || existing.device_id !== value.deviceId) {
      return fail('forbidden', 'Only the device holding the controls can approve a transfer.');
    }

    const lease = await upsertLease(env, existing, {
      deviceId: request.deviceId,
      deviceLabel: request.deviceLabel,
      reason: request.reason,
      fresh: true,
    });
    await writeTransferRequest(env.db, env.eventId, null);

    await auditLease(env, {
      action: 'controller.transfer_approved',
      deviceId: value.deviceId,
      before: { device_id: existing.device_id, device_label: existing.device_label },
      after: { device_id: request.deviceId, device_label: request.deviceLabel },
      reason: request.reason,
    });

    return ok(lease);
  } catch (error) {
    return fail('database_error', describe(error));
  }
}

/** Decline the pending request and keep the controls. */
export async function denyControllerTransfer(
  input: { deviceId: string },
): Promise<ActionResult<{ cleared: boolean }>> {
  const parsed = transferDecisionSchema.safeParse(input);
  if (!parsed.success) return fail('invalid_input', formatIssues(parsed.error));
  const value = parsed.data;

  const env = await leaseEnv();
  if (!isEnv(env)) return env;

  try {
    const [existing, event] = await Promise.all([
      readLease(env.db, env.eventId),
      readEvent(env.db, env.eventId),
    ]);

    const request = transferRequestOf(event);
    if (!request) return ok({ cleared: false });
    if (!existing || existing.device_id !== value.deviceId) {
      return fail('forbidden', 'Only the device holding the controls can answer a transfer.');
    }

    await writeTransferRequest(env.db, env.eventId, null);
    await auditLease(env, {
      action: 'controller.transfer_denied',
      deviceId: value.deviceId,
      before: request,
    });

    return ok({ cleared: true });
  } catch (error) {
    return fail('database_error', describe(error));
  }
}
