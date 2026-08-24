'use client';

/**
 * Client hook barrel. Every hook here builds on the one shared Supabase
 * browser singleton, so a screen with five of them still holds one socket.
 */

export {
  useConnectionState,
  useConnectionReporter,
  reportConnectionHealthy,
  reportConnectionTrouble,
  reportDataConfirmed,
  registerConnectionRetry,
  CONNECTION_GRACE_MS,
  CONNECTION_RECOVERY_MS,
  type ConnectionState,
  type ConnectionStatus,
} from '@/lib/hooks/connection';

export {
  useEventSnapshot,
  type UseEventSnapshotOptions,
  type UseEventSnapshotResult,
} from '@/lib/hooks/useEventSnapshot';

export {
  useDisplayState,
  type UseDisplayStateOptions,
  type UseDisplayStateResult,
} from '@/lib/hooks/useDisplayState';

export {
  useTimer,
  readTimer,
  pickTimer,
  type UseTimerOptions,
  type TimerReading,
} from '@/lib/hooks/useTimer';

export {
  useControllerLease,
  type ControllerRole,
  type UseControllerLeaseOptions,
  type UseControllerLeaseResult,
} from '@/lib/hooks/useControllerLease';

export {
  useDeviceId,
  useDeviceLabel,
  readDeviceId,
  newIdempotencyKey,
} from '@/lib/hooks/useDeviceId';
