'use client';

/**
 * The one gate every mutating tap on the controller passes through.
 *
 * Three guarantees, all of which matter more courtside than anywhere else in
 * this product:
 *
 * 1. **One command at a time.** A second tap while a command is in flight is
 *    dropped, not queued — an operator hammering GOAL because the tablet felt
 *    slow must never produce two goals.
 * 2. **One idempotency key per intent.** The key is minted when the operator
 *    first commits and kept until that intent *succeeds*, so a retry after a
 *    network blip replays the same key and the server returns the original
 *    answer instead of applying a second effect.
 * 3. **A visible minimum.** Every command holds its button in the pressed
 *    state for at least `MIN_BUSY_MS`, so a command that completes in 40ms
 *    still reads as "that registered".
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { newIdempotencyKey } from '@/lib/hooks';
import type {
  ActionErrorCode,
  ActionResult,
  CommandBase,
} from '@/lib/actions/types';
import type { JournalNote } from '@/components/controller/controller-model';

/** How long a press stays visibly busy, however fast the server answers. */
const MIN_BUSY_MS = 260;

/** How many session notes the recent-event rail keeps. */
const JOURNAL_LIMIT = 30;

export interface CommandFailure {
  id: string;
  label: string;
  message: string;
  code: ActionErrorCode;
  details?: Record<string, unknown>;
  at: number;
}

export interface RunSpec<T> {
  /**
   * Stable identity of the *intent*, not the press. Two presses of the same
   * button before a success share this id and therefore share one key.
   */
  id: string;
  /** Operator-facing description, used in the error banner. */
  label: string;
  /**
   * Send the event revision this device last saw. Use it for commands that
   * settle a result — a stale device must not publish a round it cannot see
   * the whole of. Leave it off for the scoring hot path, where the
   * idempotency key already prevents duplicates and a conflict would only
   * block a correct action.
   */
  guard?: boolean;
  /** Text to append to the recent-event rail on success. */
  note?: string;
  run: (base: CommandBase) => Promise<ActionResult<T>>;
  onSuccess?: (data: T, duplicate: boolean) => void;
}

export interface CommandRunner {
  run: <T>(spec: RunSpec<T>) => Promise<ActionResult<T> | null>;
  /** True while any command is in flight. */
  busy: boolean;
  /** The intent id currently in flight, for per-button spinners. */
  busyId: string | null;
  failure: CommandFailure | null;
  /** The same failure, exposed separately when it is a stale-revision clash. */
  conflict: CommandFailure | null;
  journal: JournalNote[];
  /** True when something this device did has not landed on the server. */
  hasUnsynced: boolean;
  retry: () => Promise<void>;
  dismissFailure: () => void;
}

export interface UseCommandRunnerOptions {
  deviceId: string | null;
  /** The event revision on the snapshot currently on screen. */
  revision: number | null;
  /** Re-read the snapshot after a successful command. */
  refresh: () => Promise<void>;
  /** False when this device does not hold the controller lease. */
  enabled: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return 'The command could not be sent. Check the connection and retry.';
}

export function useCommandRunner(options: UseCommandRunnerOptions): CommandRunner {
  const { deviceId, revision, refresh, enabled } = options;

  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<CommandFailure | null>(null);
  const [journal, setJournal] = useState<JournalNote[]>([]);

  /** Synchronous lock — state alone is too slow to stop a double tap. */
  const locked = useRef(false);
  const keys = useRef(new Map<string, string>());
  const lastSpec = useRef<RunSpec<unknown> | null>(null);
  const mounted = useRef(true);
  const revisionRef = useRef<number | null>(revision);

  useEffect(() => {
    revisionRef.current = revision;
  }, [revision]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(
    async <T,>(spec: RunSpec<T>): Promise<ActionResult<T> | null> => {
      if (!enabled) return null;
      if (locked.current) return null;
      locked.current = true;
      setBusyId(spec.id);
      setFailure(null);

      const key =
        keys.current.get(spec.id) ?? newIdempotencyKey(spec.id.slice(0, 40));
      keys.current.set(spec.id, key);

      const base: CommandBase = {
        idempotencyKey: key,
        deviceId,
        expectedRevision: spec.guard ? revisionRef.current : null,
      };

      const startedAt = Date.now();
      let result: ActionResult<T>;
      try {
        result = await spec.run(base);
      } catch (cause) {
        result = { ok: false, error: describe(cause), code: 'unknown' };
      }

      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_BUSY_MS) await sleep(MIN_BUSY_MS - elapsed);

      if (result.ok) {
        keys.current.delete(spec.id);
        lastSpec.current = null;
        if (mounted.current && spec.note) {
          const note: JournalNote = {
            id: `${spec.id}-${startedAt}`,
            at: Date.now(),
            label: spec.note,
          };
          setJournal((current) => [note, ...current].slice(0, JOURNAL_LIMIT));
        }
        spec.onSuccess?.(result.data, Boolean(result.duplicate));
        await refresh();
      } else if (mounted.current) {
        // The key is deliberately kept: retrying this intent must replay it.
        lastSpec.current = spec as RunSpec<unknown>;
        setFailure({
          id: spec.id,
          label: spec.label,
          message: result.error,
          code: result.code,
          details: result.details,
          at: Date.now(),
        });
      }

      locked.current = false;
      if (mounted.current) setBusyId(null);
      return result;
    },
    [deviceId, enabled, refresh],
  );

  const retry = useCallback(async (): Promise<void> => {
    const spec = lastSpec.current;
    if (!spec) return;
    await run(spec);
  }, [run]);

  const dismissFailure = useCallback(() => {
    const spec = lastSpec.current;
    // Abandoning an intent retires its key so a later, deliberate repeat of
    // the same action is treated as a new command rather than a replay.
    if (spec) keys.current.delete(spec.id);
    lastSpec.current = null;
    setFailure(null);
  }, []);

  return {
    run,
    busy: busyId !== null,
    busyId,
    failure,
    conflict: failure?.code === 'conflict' ? failure : null,
    journal,
    hasUnsynced: busyId !== null || failure !== null,
    retry,
    dismissFailure,
  };
}
