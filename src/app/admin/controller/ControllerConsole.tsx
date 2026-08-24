'use client';

/**
 * The Active Score Controller shell.
 *
 * One tablet, one lease, one command in flight. This component owns the three
 * things every surface below it depends on and none of them own themselves:
 * the live snapshot, whether this device is allowed to touch the event, and the
 * runner that turns a tap into exactly one server command.
 *
 * Two rules are enforced here rather than in any individual surface, because
 * they must hold everywhere:
 *
 *   • **Read-only is visible, not silent.** Without the lease every mutating
 *     control is disabled and says why, and the bar names the device that does
 *     hold the controls along with the age of its last heartbeat.
 *   • **Nothing leaves without the operator.** A command that has not landed
 *     blocks the page from being closed, and a stale-revision refusal opens a
 *     reconciliation panel instead of quietly winning or quietly losing.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { EventSnapshot } from '@/lib/data/snapshot';
import type { ChallengeRow, TeamCode, TimerRow } from '@/lib/types';
import {
  pickTimer,
  useControllerLease,
  useDeviceId,
  useDeviceLabel,
  useEventSnapshot,
} from '@/lib/hooks';
import { StatusPill } from '@/components/ui';
import {
  CentreCircleSurface,
  ControllerProvider,
  ControllerTopBar,
  DribbleFinishSurface,
  FinalMatchSurface,
  LongRangeSurface,
  MannequinTargetSurface,
  Panel,
  PenaltyShootoutSurface,
  configForChallenge,
  sideStatesFor,
  useCommandRunner,
  type ControllerContextValue,
  type SideState,
} from '@/components/controller';
import { ControllerRail } from '@/app/admin/controller/ControllerRail';

const DEFAULT_DEVICE_LABEL = 'Courtside tablet';

/**
 * The clock the header should be showing, and whether it needs tenths.
 *
 * Derived from the snapshot alone so the header never has to reach down into a
 * surface: the final match follows the half on the pitch, a timed challenge
 * follows whichever of its per-player clocks is actually moving.
 */
function headerTimer(snapshot: EventSnapshot): { timer: TimerRow | null; tenths: boolean } {
  const mechanic = snapshot.currentChallenge?.mechanic ?? null;

  if (mechanic === 'final_match') {
    const match = snapshot.match;
    if (!match) return { timer: null, tenths: false };
    const rows = snapshot.timers.filter((t) => t.match_id === match.id);
    const half = Math.max(1, Number(match.current_half ?? 1));
    return { timer: pickTimer(rows, half) ?? pickTimer(rows), tenths: false };
  }

  const round = snapshot.currentRound;
  const rows = round ? snapshot.timers.filter((t) => t.round_id === round.id) : [];
  return {
    timer: pickTimer(rows),
    tenths: mechanic === 'center_circle' || mechanic === 'dribble_finish',
  };
}

function Surface({ snapshot }: { snapshot: EventSnapshot }) {
  switch (snapshot.currentChallenge?.mechanic) {
    case 'mannequin_target':
      return <MannequinTargetSurface />;
    case 'dribble_finish':
      return <DribbleFinishSurface />;
    case 'long_range':
      return <LongRangeSurface />;
    case 'center_circle':
      return <CentreCircleSurface />;
    case 'final_match':
      return (
        <div className="flex flex-col gap-4">
          <FinalMatchSurface />
          <PenaltyShootoutSurface />
        </div>
      );
    default:
      return (
        <Panel tone="sunken">
          <p className="u-display text-h3 text-text-secondary">NO CHALLENGE SELECTED</p>
          <p className="text-body text-text-secondary">
            Pick a challenge from the bar above. Each one opens the scoring surface built for its
            mechanic.
          </p>
        </Panel>
      );
  }
}

export interface ControllerConsoleProps {
  /** Server-rendered snapshot, or null when the database could not be read. */
  initialSnapshot: EventSnapshot | null;
}

export function ControllerConsole({ initialSnapshot }: ControllerConsoleProps) {
  const deviceId = useDeviceId();
  const [storedLabel, setStoredLabel] = useDeviceLabel();
  const deviceLabel = storedLabel?.trim() || DEFAULT_DEVICE_LABEL;

  // Pinning a challenge or a round overrides the snapshot's automatic pick —
  // the running order on a beach rarely survives contact with the players.
  const [challengeId, setChallengeId] = useState<string | undefined>(undefined);
  const [roundId, setRoundId] = useState<string | undefined>(undefined);

  const { snapshot, loading, error, stale, connection, refresh } = useEventSnapshot({
    initial: initialSnapshot,
    challengeId,
    roundId,
    pollMs: 15_000,
  });

  const lease = useControllerLease(deviceId, { label: deviceLabel });

  const runner = useCommandRunner({
    deviceId,
    revision: snapshot?.revision ?? null,
    refresh,
    enabled: lease.isController,
  });

  const config = useMemo(
    () => (snapshot ? configForChallenge(snapshot.scoring, snapshot.currentChallenge) : null),
    [snapshot],
  );

  const sides: Record<TeamCode, SideState> | null = useMemo(
    () => (snapshot ? sideStatesFor(snapshot, config) : null),
    [snapshot, config],
  );

  const selectChallenge = useCallback((challenge: ChallengeRow) => {
    setChallengeId(challenge.id);
    // A pinned round belongs to the challenge it came from; changing challenge
    // has to let the snapshot pick the live round of the new one.
    setRoundId(undefined);
  }, []);

  // A command that has not landed must not be able to leave with the tab.
  useEffect(() => {
    if (!runner.hasUnsynced) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [runner.hasUnsynced]);

  if (!snapshot || !sides) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
        <StatusPill
          label={loading ? 'READING THE EVENT' : 'THE SCOREBOARD IS UNREACHABLE'}
          tone={loading ? 'pending' : 'live'}
          variant="solid"
          size="lg"
          pulse={loading}
        />
        <p className="u-display text-h3 text-text-secondary">
          {loading ? 'ACTIVE SCORE CONTROLLER' : 'NOTHING CAN BE SCORED FROM HERE YET'}
        </p>
        {error ? <p className="text-body text-text-secondary">{error}</p> : null}
        {!loading ? (
          <button
            type="button"
            onClick={() => void refresh()}
            className="u-display min-h-16 rounded-lg border-2 border-aqua-700 bg-aqua-600 px-8 text-[1.375rem] text-white"
          >
            TRY AGAIN
          </button>
        ) : null}
      </div>
    );
  }

  const value: ControllerContextValue = {
    snapshot,
    config,
    sides,
    refresh,
    stale,
    connection,
    deviceId,
    lease,
    canMutate: lease.isController,
    runner,
  };

  const header = headerTimer(snapshot);

  return (
    <ControllerProvider value={value}>
      <div className="flex min-h-dvh flex-col bg-surface">
        <ControllerTopBar
          timer={header.timer}
          tenths={header.tenths}
          challengeId={challengeId ?? snapshot.currentChallenge?.id ?? null}
          onSelectChallenge={selectChallenge}
          roundId={roundId ?? snapshot.currentRound?.id ?? null}
          onSelectRound={setRoundId}
          deviceLabel={deviceLabel}
        />

        {/* Read-only is stated once, loudly, above everything it affects. */}
        {!lease.isController ? (
          <div className="border-b-2 border-live bg-live-soft px-4 py-3 sm:px-6">
            <div className="mx-auto flex max-w-[100rem] flex-wrap items-center gap-3">
              <StatusPill
                label="READ ONLY — THIS DEVICE CANNOT SCORE"
                tone="live"
                variant="solid"
                size="md"
                glyph="⦸"
              />
              <span className="u-label text-eyebrow text-text-secondary">
                {lease.heldByOther
                  ? 'ANOTHER DEVICE HOLDS THE CONTROLS. TAKE THEM FROM THE BAR ABOVE.'
                  : 'THE CONTROLS ARE FREE — TAP TAKE CONTROL IN THE BAR ABOVE TO START SCORING.'}
              </span>
            </div>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[100rem] flex-1 px-4 py-4 sm:px-6 sm:py-6">
          <Surface snapshot={snapshot} />
        </main>

        <ControllerRail
          deviceLabel={deviceLabel}
          onRenameDevice={setStoredLabel}
          error={error}
        />
      </div>
    </ControllerProvider>
  );
}

export default ControllerConsole;
