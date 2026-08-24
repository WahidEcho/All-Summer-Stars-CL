'use client';

/**
 * Everything a scoring surface needs, in one context: the live snapshot, the
 * lease this device holds (or does not), and the command runner.
 *
 * Surfaces never call a server action directly — they hand an intent to
 * `runner.run`, which owns the idempotency key, the debounce and the retry.
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { ConnectionState, UseControllerLeaseResult } from '@/lib/hooks';
import type { ChallengeConfig, TeamCode } from '@/lib/types';
import type { CommandRunner } from '@/components/controller/useCommandRunner';
import type { SideState } from '@/components/controller/controller-model';

export interface ControllerContextValue {
  snapshot: EventSnapshot;
  /** Config of the challenge on screen, straight from the scoring profile. */
  config: ChallengeConfig | null;
  /** The two players of the current round, with their attempts and totals. */
  sides: Record<TeamCode, SideState>;
  refresh: () => Promise<void>;
  stale: boolean;
  connection: ConnectionState;
  deviceId: string | null;
  lease: UseControllerLeaseResult;
  /** True only when this device holds the lease. Gates every mutating control. */
  canMutate: boolean;
  runner: CommandRunner;
}

const ControllerContext = createContext<ControllerContextValue | null>(null);

export function ControllerProvider({
  value,
  children,
}: {
  value: ControllerContextValue;
  children: ReactNode;
}) {
  return <ControllerContext.Provider value={value}>{children}</ControllerContext.Provider>;
}

export function useController(): ControllerContextValue {
  const value = useContext(ControllerContext);
  if (!value) {
    throw new Error('useController must be used inside a ControllerProvider.');
  }
  return value;
}
