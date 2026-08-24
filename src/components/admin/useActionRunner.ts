'use client';

import { useCallback, useRef, useState } from 'react';

import type { ActionFailure, ActionResult } from '@/lib/actions/types';

export interface ActionStatus {
  tone: 'ok' | 'error';
  message: string;
  /** Timestamp, so a repeated identical message still re-announces. */
  at: number;
  code?: string;
}

export interface RunOptions {
  /** Message shown when the command succeeds. */
  success?: string;
  /** Suppress the success banner (a scene cut announces itself on the wall). */
  silent?: boolean;
}

export interface ActionRunner {
  pending: boolean;
  status: ActionStatus | null;
  /** Runs a server action, records its outcome, and hands the result back. */
  run<T>(fn: () => Promise<ActionResult<T>>, opts?: RunOptions): Promise<ActionResult<T>>;
  clear: () => void;
  setError: (message: string) => void;
}

/**
 * Run a server action and keep its outcome on screen.
 *
 * Actions never throw — they return `{ok:false, error, code}` — but a network
 * failure between the browser and the server function still can, so that case
 * is folded into the same envelope. The caller therefore only ever has one
 * shape to branch on.
 */
export function useActionRunner(): ActionRunner {
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<ActionStatus | null>(null);
  const inFlight = useRef(0);

  const run = useCallback(
    async <T,>(
      fn: () => Promise<ActionResult<T>>,
      opts: RunOptions = {},
    ): Promise<ActionResult<T>> => {
      inFlight.current += 1;
      setPending(true);
      try {
        const result = await fn();
        if (result.ok) {
          setStatus(
            opts.silent
              ? null
              : { tone: 'ok', message: opts.success ?? 'Saved.', at: Date.now() },
          );
        } else {
          setStatus({
            tone: 'error',
            message: result.error,
            code: result.code,
            at: Date.now(),
          });
        }
        return result;
      } catch (cause) {
        const message =
          cause instanceof Error
            ? cause.message
            : 'The command could not reach the server.';
        setStatus({ tone: 'error', message, code: 'unknown', at: Date.now() });
        const failure: ActionFailure = { ok: false, error: message, code: 'unknown' };
        return failure;
      } finally {
        inFlight.current -= 1;
        if (inFlight.current <= 0) {
          inFlight.current = 0;
          setPending(false);
        }
      }
    },
    [],
  );

  const clear = useCallback(() => setStatus(null), []);
  const setError = useCallback(
    (message: string) =>
      setStatus({ tone: 'error', message, code: 'invalid_input', at: Date.now() }),
    [],
  );

  return { pending, status, run, clear, setError };
}
