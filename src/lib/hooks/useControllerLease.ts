'use client';

/**
 * The single-active-controller lease, from one device's point of view.
 *
 * Only one tablet drives the event at a time. This hook holds that promise
 * alive with a five-second heartbeat against a fifteen-second lease, so an
 * abandoned or dead device frees the controls on its own, and it exposes the
 * two ways a second device can get them: asking the holder, or — when the show
 * cannot wait for an answer — an audited emergency takeover.
 *
 * Every mutating surface should gate its buttons on `isController`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Db } from '@/lib/event';
import { EVENT_SLUG } from '@/lib/event';
import { getControllerLease, getEvent } from '@/lib/data/queries';
import {
  approveControllerTransfer,
  claimControllerLease,
  denyControllerTransfer,
  releaseControllerLease,
  renewControllerLease,
  requestControllerTransfer,
} from '@/lib/actions/lease';
import {
  LEASE_RENEW_MS,
  TRANSFER_REQUEST_KEY,
  type ControllerTransferRequest,
} from '@/lib/actions/types';
import type { ControllerLeaseRow } from '@/lib/types';

export type ControllerRole = 'controller' | 'observer' | 'available' | 'unknown';

export interface UseControllerLeaseOptions {
  /** Shown to other devices in the takeover dialog. */
  label?: string | null;
  /** Claim the controls as soon as they are free. Defaults to false. */
  autoClaim?: boolean;
  /** Heartbeat interval in ms. Defaults to 5 seconds against a 15-second lease. */
  renewMs?: number;
  slug?: string;
  enabled?: boolean;
}

export interface UseControllerLeaseResult {
  lease: ControllerLeaseRow | null;
  /** True when this device may mutate the event. */
  isController: boolean;
  /** True when someone else holds a live lease. */
  heldByOther: boolean;
  /** True when the controls are free for the taking. */
  available: boolean;
  role: ControllerRole;
  /** Milliseconds until the current lease lapses. 0 when there is none. */
  expiresInMs: number;
  /** A pending request from another device — only meaningful to the holder. */
  transferRequest: ControllerTransferRequest | null;
  /** True when *this* device is the one waiting for an answer. */
  awaitingApproval: boolean;
  busy: boolean;
  error: string | null;

  claim: () => Promise<boolean>;
  release: (reason?: string) => Promise<boolean>;
  requestTransfer: (reason?: string) => Promise<boolean>;
  approveTransfer: () => Promise<boolean>;
  denyTransfer: () => Promise<boolean>;
  /** Emergency seizure of a live lease. Always audited; a reason is required. */
  takeover: (reason: string) => Promise<boolean>;
  refresh: () => Promise<void>;
}

function transferRequestFrom(settings: Record<string, unknown> | undefined): ControllerTransferRequest | null {
  const raw = settings?.[TRANSFER_REQUEST_KEY];
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

function leaseIsLive(lease: ControllerLeaseRow | null, nowMs: number): boolean {
  if (!lease || lease.released_at) return false;
  return Date.parse(lease.expires_at) > nowMs;
}

export function useControllerLease(
  deviceId: string | null,
  options: UseControllerLeaseOptions = {},
): UseControllerLeaseResult {
  const {
    label = null,
    autoClaim = false,
    renewMs = LEASE_RENEW_MS,
    slug = EVENT_SLUG,
    enabled = true,
  } = options;

  const [lease, setLease] = useState<ControllerLeaseRow | null>(null);
  const [transferRequest, setTransferRequest] = useState<ControllerTransferRequest | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Re-render once a second so `expiresInMs` and the derived role stay honest
  // even when nothing on the server has changed.
  const [tick, setTick] = useState(() => Date.now());

  const active = enabled && Boolean(deviceId);
  const mounted = useRef(true);

  const refresh = useCallback(async (): Promise<void> => {
    if (!active) return;
    try {
      const db = supabase() as unknown as Db;
      const event = await getEvent(db, slug);
      if (!event) return;
      const row = await getControllerLease(db, event.id);
      if (!mounted.current) return;
      setLease(row);
      setTransferRequest(transferRequestFrom(event.settings));
    } catch (cause) {
      if (!mounted.current) return;
      // The lease is a coordination aid; a failed read must not lock the
      // operator out of a console they legitimately control.
      setError(cause instanceof Error ? cause.message : 'Could not read the controller lease.');
    }
  }, [active, slug]);

  useEffect(() => {
    mounted.current = true;
    // An async read: state lands after the await, not in the effect body.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    return () => {
      mounted.current = false;
    };
  }, [refresh]);

  // Realtime: the lease row itself, and the event row that carries requests.
  useEffect(() => {
    if (!active) return;
    const client = supabase();
    const channel: RealtimeChannel = client
      .channel(`lease:${slug}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'controller_lease' },
        () => void refresh(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'events' },
        () => void refresh(),
      );

    channel.subscribe();

    return () => {
      void client.removeChannel(channel);
    };
  }, [active, slug, refresh]);

  const isController = useMemo(
    () => Boolean(deviceId) && lease?.device_id === deviceId && leaseIsLive(lease, tick),
    [deviceId, lease, tick],
  );

  // Heartbeat. Stops the moment this device is no longer the holder.
  useEffect(() => {
    if (!active || !isController || !deviceId) return;
    const id = setInterval(async () => {
      const result = await renewControllerLease({ deviceId });
      if (!mounted.current) return;
      if (result.ok) {
        setLease(result.data);
        setError(null);
      } else {
        // Losing the lease is information, not a failure: another device has it.
        setError(result.error);
        void refresh();
      }
    }, renewMs);
    return () => clearInterval(id);
  }, [active, isController, deviceId, renewMs, refresh]);

  // Keep the derived expiry countdown moving.
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);

  const run = useCallback(
    async (operation: () => Promise<{ ok: boolean; error?: string }>): Promise<boolean> => {
      setBusy(true);
      try {
        const result = await operation();
        if (!mounted.current) return result.ok;
        setError(result.ok ? null : result.error ?? 'That did not work.');
        await refresh();
        return result.ok;
      } finally {
        if (mounted.current) setBusy(false);
      }
    },
    [refresh],
  );

  const claim = useCallback(async () => {
    if (!deviceId) return false;
    return run(() => claimControllerLease({ deviceId, deviceLabel: label }));
  }, [deviceId, label, run]);

  const takeover = useCallback(
    async (reason: string) => {
      if (!deviceId) return false;
      return run(() =>
        claimControllerLease({ deviceId, deviceLabel: label, takeover: true, reason }),
      );
    },
    [deviceId, label, run],
  );

  const release = useCallback(
    async (reason?: string) => {
      if (!deviceId) return false;
      return run(() => releaseControllerLease({ deviceId, reason: reason ?? null }));
    },
    [deviceId, run],
  );

  const requestTransfer = useCallback(
    async (reason?: string) => {
      if (!deviceId) return false;
      return run(() =>
        requestControllerTransfer({ deviceId, deviceLabel: label, reason: reason ?? null }),
      );
    },
    [deviceId, label, run],
  );

  const approveTransfer = useCallback(async () => {
    if (!deviceId) return false;
    return run(() => approveControllerTransfer({ deviceId }));
  }, [deviceId, run]);

  const denyTransfer = useCallback(async () => {
    if (!deviceId) return false;
    return run(() => denyControllerTransfer({ deviceId }));
  }, [deviceId, run]);

  // Take the controls automatically only when they are genuinely free — never
  // by prising them out of another device's hands.
  const live = leaseIsLive(lease, tick);
  useEffect(() => {
    if (!active || !autoClaim || busy) return;
    if (live) return;
    // An async command; the `live` and `busy` guards above stop it looping.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void claim();
  }, [active, autoClaim, busy, live, claim]);

  const expiresInMs = lease && !lease.released_at
    ? Math.max(0, Date.parse(lease.expires_at) - tick)
    : 0;

  const heldByOther = live && lease?.device_id !== deviceId;
  const available = !live;

  return {
    lease,
    isController,
    heldByOther,
    available,
    role: !deviceId ? 'unknown' : isController ? 'controller' : heldByOther ? 'observer' : 'available',
    expiresInMs,
    transferRequest,
    awaitingApproval: transferRequest?.deviceId === deviceId,
    busy,
    error,
    claim,
    release,
    requestTransfer,
    approveTransfer,
    denyTransfer,
    takeover,
    refresh,
  };
}
