'use client';

/**
 * Who is driving the event, and how control changes hands.
 *
 * Three paths, in increasing order of violence:
 *   • the controls are free            → TAKE CONTROL
 *   • another device holds them        → REQUEST CONTROL (it must approve)
 *   • the show cannot wait for an answer → EMERGENCY TAKEOVER, audited, behind
 *     a typed reason and a confirm
 */

import { useEffect, useState } from 'react';
import { StatusPill } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { UseControllerLeaseResult } from '@/lib/hooks';
import { ControlButton } from '@/components/controller/ControlButton';
import { Modal } from '@/components/controller/Modal';
import { relativeTime } from '@/components/controller/controller-model';

export interface LeaseControlsProps {
  lease: UseControllerLeaseResult;
  deviceLabel: string;
  className?: string;
}

export function LeaseControls({ lease, deviceLabel, className }: LeaseControlsProps) {
  const [takeoverOpen, setTakeoverOpen] = useState(false);
  const [reason, setReason] = useState('Emergency takeover courtside');
  const [now, setNow] = useState(() => Date.now());

  // The heartbeat age has to keep moving even when nothing else changes.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const holder = lease.lease;
  const holderLabel = holder?.device_label?.trim() || holder?.device_id?.slice(0, 12) || 'UNKNOWN DEVICE';
  const heartbeat = holder?.renewed_at ? relativeTime(Date.parse(holder.renewed_at), now) : null;
  const incoming =
    lease.transferRequest && lease.transferRequest.deviceId !== holder?.device_id
      ? lease.transferRequest
      : null;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        {lease.isController ? (
          <StatusPill label="YOU HAVE CONTROL" tone="winner" variant="solid" size="md" />
        ) : lease.heldByOther ? (
          <StatusPill label="READ ONLY" tone="live" variant="solid" size="md" glyph="⦸" />
        ) : (
          <StatusPill label="CONTROLS FREE" tone="draw" variant="solid" size="md" glyph="○" />
        )}

        {lease.isController ? (
          <span className="u-numeral u-tabular text-eyebrow text-text-muted">
            LEASE {Math.ceil(lease.expiresInMs / 1000)}s
          </span>
        ) : null}
      </div>

      {lease.heldByOther ? (
        <p className="u-label text-eyebrow text-text-secondary">
          ACTIVE DEVICE: {holderLabel.toUpperCase()}
          {heartbeat ? ` · LAST HEARTBEAT ${heartbeat.toUpperCase()}` : ''}
        </p>
      ) : null}

      {/* The holder answers a polite request from another tablet. */}
      {lease.isController && incoming ? (
        <div className="flex flex-col gap-2 rounded-lg border-2 border-draw bg-draw-soft p-3">
          <p className="u-label text-eyebrow text-text-primary">
            {(incoming.deviceLabel ?? incoming.deviceId).toUpperCase()} IS ASKING FOR CONTROL
            {incoming.reason ? ` · ${incoming.reason.toUpperCase()}` : ''}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <ControlButton
              label="HAND OVER"
              size="sm"
              tone="primary"
              busy={lease.busy}
              onPress={() => void lease.approveTransfer()}
            />
            <ControlButton
              label="KEEP CONTROL"
              size="sm"
              tone="neutral"
              busy={lease.busy}
              onPress={() => void lease.denyTransfer()}
            />
          </div>
        </div>
      ) : null}

      {lease.awaitingApproval && !lease.isController ? (
        <p className="u-label text-eyebrow text-draw">WAITING FOR THE ACTIVE DEVICE TO ANSWER</p>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {lease.isController ? (
          <ControlButton
            label="RELEASE CONTROL"
            size="sm"
            tone="quiet"
            fullWidth={false}
            busy={lease.busy}
            className="min-w-44"
            onPress={() => void lease.release('Released by the operator')}
          />
        ) : lease.heldByOther ? (
          <>
            <ControlButton
              label="REQUEST CONTROL"
              size="sm"
              tone="primary"
              fullWidth={false}
              busy={lease.busy}
              className="min-w-44"
              onPress={() => void lease.requestTransfer(`${deviceLabel} needs the controls`)}
            />
            <ControlButton
              label="EMERGENCY TAKEOVER"
              size="sm"
              tone="danger"
              glyph="!"
              fullWidth={false}
              className="min-w-44"
              onPress={() => setTakeoverOpen(true)}
            />
          </>
        ) : (
          <ControlButton
            label="TAKE CONTROL"
            size="sm"
            tone="primary"
            fullWidth={false}
            busy={lease.busy}
            className="min-w-44"
            onPress={() => void lease.claim()}
          />
        )}
      </div>

      {lease.error ? (
        <p className="u-label text-eyebrow text-live">{lease.error.toUpperCase()}</p>
      ) : null}

      <Modal
        open={takeoverOpen}
        title="EMERGENCY TAKEOVER"
        subtitle={`SEIZE THE CONTROLS FROM ${holderLabel.toUpperCase()}`}
        accent="var(--color-live)"
        onClose={() => setTakeoverOpen(false)}
        footer={
          <div className="grid grid-cols-2 gap-3">
            <ControlButton label="CANCEL" tone="neutral" onPress={() => setTakeoverOpen(false)} />
            <ControlButton
              label="TAKE THE CONTROLS"
              tone="danger"
              glyph="!"
              busy={lease.busy}
              disabled={reason.trim().length < 3}
              disabledReason="Type a reason before taking over."
              onPress={() => {
                void lease.takeover(reason.trim()).then((done) => {
                  if (done) setTakeoverOpen(false);
                });
              }}
            />
          </div>
        }
      >
        <div className="flex flex-col gap-4">
          <p className="text-lede text-text-secondary">
            {holderLabel} is still holding a live lease
            {heartbeat ? ` (last heartbeat ${heartbeat})` : ''}. Taking over now will stop that
            device from scoring. The takeover is recorded in the audit log with your reason.
          </p>
          <label className="flex flex-col gap-2">
            <span className="u-label text-eyebrow text-text-muted">REASON (REQUIRED)</span>
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={200}
              className="min-h-16 rounded-lg border-2 border-slate bg-surface-raised px-4 text-lede text-text-primary"
            />
          </label>
        </div>
      </Modal>
    </div>
  );
}

export default LeaseControls;
