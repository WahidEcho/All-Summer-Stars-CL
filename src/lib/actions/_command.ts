/**
 * Command plumbing shared by every server action.
 *
 * A command is: authenticate → claim the idempotency key by inserting a
 * `score_events` row → run the effect → write `audit_logs` → bump the event
 * revision → store the result back on the score event so a replay of the same
 * key returns the original answer instead of applying a second effect.
 *
 * Supabase's JS client has no multi-statement transaction, so "one logical
 * operation" is enforced by the unique idempotency key plus a rollback of the
 * claim when the effect throws. Every derived write goes through the
 * service-role client, because RLS would otherwise block the ledger.
 *
 * This module is internal — it is not a 'use server' file and must not be
 * imported from client code.
 */

import type { z } from 'zod';
import { createClient, createServiceClient } from '@/lib/supabase/server';
import type { Db } from '@/lib/event';
import { resolveEventId } from '@/lib/event';
import { formatIssues } from '@/lib/actions/schemas';
import {
  fail,
  ok,
  type ActionErrorCode,
  type ActionFailure,
  type ActionResult,
} from '@/lib/actions/types';
import type { AppRole } from '@/lib/types';

const WRITE_ROLES: AppRole[] = ['super_admin', 'event_admin', 'scorekeeper'];
const ADMIN_ROLES: AppRole[] = ['super_admin', 'event_admin'];
const DISPLAY_ROLES: AppRole[] = ['super_admin', 'event_admin', 'display_operator'];

/**
 * Local development and seeding escape hatch. Set ALLOW_UNAUTHENTICATED_ADMIN=true
 * in .env.local to run the admin surfaces before any staff user exists. It must
 * never be set in production.
 */
function anonymousWritesAllowed(): boolean {
  return process.env.ALLOW_UNAUTHENTICATED_ADMIN === 'true';
}

export interface Actor {
  id: string | null;
  email: string | null;
  role: AppRole;
}

const DEV_ACTOR: Actor = { id: null, email: null, role: 'super_admin' };

/** Resolve the signed-in staff member, or null when there is no session. */
export async function resolveActor(): Promise<Actor | null> {
  let auth;
  try {
    auth = await createClient();
  } catch {
    return anonymousWritesAllowed() ? DEV_ACTOR : null;
  }

  const { data, error } = await auth.auth.getUser();
  if (error || !data?.user) return anonymousWritesAllowed() ? DEV_ACTOR : null;

  const service = createServiceClient();
  const profile = await service
    .from('app_users')
    .select('id, email, role')
    .eq('id', data.user.id)
    .maybeSingle();

  const role = (profile.data as { role?: AppRole } | null)?.role ?? 'viewer';
  return {
    id: data.user.id,
    email: (profile.data as { email?: string | null } | null)?.email ?? data.user.email ?? null,
    role,
  };
}

export type Capability = 'write' | 'admin' | 'display';

function hasCapability(role: AppRole, capability: Capability): boolean {
  switch (capability) {
    case 'admin':
      return ADMIN_ROLES.includes(role);
    case 'display':
      return DISPLAY_ROLES.includes(role);
    case 'write':
    default:
      return WRITE_ROLES.includes(role);
  }
}

// ---------------------------------------------------------------------------

export interface AuditEntry {
  action: string;
  entityType?: string | null;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export interface CommandContext {
  /** Service-role client — bypasses RLS for derived writes. */
  db: Db;
  eventId: string;
  actor: Actor;
  deviceId: string | null;
  idempotencyKey: string;
  scoreEventId: string;
  /** Queue an audit row; written once the effect succeeds. */
  audit(entry: AuditEntry): void;
}

export interface CommandSpec<T> {
  /** Domain event type, e.g. `attempt.recorded`. */
  type: string;
  idempotencyKey: string;
  deviceId?: string | null;
  expectedRevision?: number | null;
  /** Serialisable command input, stored on the score event. */
  payload?: Record<string, unknown>;
  /** Required role capability. Defaults to `write`. */
  capability?: Capability;
  run(ctx: CommandContext): Promise<T>;
}

/** A command that deliberately fails with a typed error code. */
export class CommandError extends Error {
  constructor(
    public readonly code: ActionErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'CommandError';
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: string } | null)?.code === '23505';
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  const pg = error as { message?: string; details?: string } | null;
  return pg?.message ?? pg?.details ?? 'Unexpected database error.';
}

function toJson(value: unknown): unknown {
  return value === undefined ? null : JSON.parse(JSON.stringify(value));
}

/**
 * Wait for a concurrent run of the same idempotency key to store its result.
 * Returns undefined when the sibling command is still in flight.
 */
async function awaitStoredResult(
  db: Db,
  idempotencyKey: string,
): Promise<unknown | undefined> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data } = await db
      .from('score_events')
      .select('payload')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();

    const payload = (data as { payload?: Record<string, unknown> } | null)?.payload;
    if (payload && Object.prototype.hasOwnProperty.call(payload, 'result')) {
      return payload.result;
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return undefined;
}

/**
 * Execute a command. Returns a discriminated result and never throws.
 */
export async function runCommand<T>(spec: CommandSpec<T>): Promise<ActionResult<T>> {
  if (!spec.idempotencyKey || spec.idempotencyKey.length < 8) {
    return fail('invalid_input', 'An idempotency key of at least 8 characters is required.');
  }

  let db: Db;
  try {
    db = createServiceClient() as unknown as Db;
  } catch {
    return fail(
      'unconfigured',
      'Supabase service credentials are missing. Set SUPABASE_SERVICE_ROLE_KEY.',
    );
  }

  const actor = await resolveActor();
  if (!actor) {
    return fail('unauthorized', 'Sign in to perform this action.');
  }
  if (!hasCapability(actor.role, spec.capability ?? 'write')) {
    return fail('forbidden', `Role "${actor.role}" cannot perform this action.`);
  }

  let eventId: string;
  try {
    eventId = await resolveEventId(db);
  } catch (error) {
    return fail('not_found', describe(error));
  }

  if (spec.expectedRevision !== undefined && spec.expectedRevision !== null) {
    const { data } = await db.from('events').select('revision').eq('id', eventId).maybeSingle();
    const current = (data as { revision?: number } | null)?.revision ?? 0;
    if (current !== spec.expectedRevision) {
      return fail(
        'conflict',
        'The event moved on since this device last synced. Refresh and try again.',
        { expected: spec.expectedRevision, current },
      );
    }
  }

  const deviceId = spec.deviceId ?? null;

  // Claim the idempotency key.
  const claim = await db
    .from('score_events')
    .insert({
      event_id: eventId,
      type: spec.type,
      payload: toJson({ input: spec.payload ?? {} }),
      idempotency_key: spec.idempotencyKey,
      actor_id: actor.id,
      device_id: deviceId,
      expected_revision: spec.expectedRevision ?? null,
    })
    .select('id')
    .single();

  if (claim.error) {
    if (isUniqueViolation(claim.error)) {
      const stored = await awaitStoredResult(db, spec.idempotencyKey);
      if (stored !== undefined) return ok(stored as T, true);
      return fail(
        'duplicate',
        'A command with this key is already running. Wait for it to finish.',
      );
    }
    return fail('database_error', describe(claim.error));
  }

  const scoreEventId = (claim.data as { id: string }).id;
  const auditEntries: AuditEntry[] = [];

  const ctx: CommandContext = {
    db,
    eventId,
    actor,
    deviceId,
    idempotencyKey: spec.idempotencyKey,
    scoreEventId,
    audit(entry) {
      auditEntries.push(entry);
    },
  };

  let data: T;
  try {
    data = await spec.run(ctx);
  } catch (error) {
    // The effect did not complete; release the key so a corrected retry works.
    await db.from('score_events').delete().eq('id', scoreEventId);
    if (error instanceof CommandError) {
      return fail(error.code, error.message, error.details);
    }
    if (isUniqueViolation(error)) {
      return fail('conflict', describe(error));
    }
    return fail('database_error', describe(error));
  }

  // Audit trail — one row per queued entry, or a single default row.
  const entries = auditEntries.length > 0 ? auditEntries : [{ action: spec.type }];
  await db.from('audit_logs').insert(
    entries.map((entry) => ({
      event_id: eventId,
      actor_id: actor.id,
      actor_email: actor.email,
      device_id: deviceId,
      action: entry.action,
      entity_type: entry.entityType ?? null,
      entity_id: entry.entityId ?? null,
      before: toJson(entry.before ?? null),
      after: toJson(entry.after ?? null),
      reason: entry.reason ?? null,
    })),
  );

  const { data: revisionData } = await db.rpc('bump_event_revision', { p_event_id: eventId });
  const newRevision = typeof revisionData === 'number' ? revisionData : null;

  await db
    .from('score_events')
    .update({
      payload: toJson({ input: spec.payload ?? {}, result: data }),
      new_revision: newRevision,
    })
    .eq('id', scoreEventId);

  return ok(data);
}

// ---------------------------------------------------------------------------
// Small shared query helpers (service client, inside a command)
// ---------------------------------------------------------------------------

export function required<T>(value: T | null | undefined, message: string): T {
  if (value === null || value === undefined) {
    throw new CommandError('not_found', message);
  }
  return value;
}

export function assertState(condition: boolean, message: string, code: ActionErrorCode = 'illegal_state'): void {
  if (!condition) throw new CommandError(code, message);
}

/** Run a Supabase query and throw its error, so `runCommand` can classify it. */
export function take<T>(result: { data: unknown; error: unknown }): T {
  if (result.error) throw result.error;
  return result.data as T;
}

export function takeRows<T>(result: { data: unknown; error: unknown }): T[] {
  return (take<T[] | null>(result) ?? []) as T[];
}

/** Parse an action input, converting a zod failure into an ActionFailure. */
export function parseInput<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { ok: true; value: T } | ActionFailure {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return fail('invalid_input', formatIssues(parsed.error));
  }
  return { ok: true, value: parsed.data };
}
