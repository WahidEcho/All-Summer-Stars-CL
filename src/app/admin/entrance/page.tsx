'use client';

/**
 * The player entrance console.
 *
 * Ten players come out of the gate one at a time at the top of the show, and
 * this is the screen the operator drives that from: both squads laid out as
 * they will walk, and one card per player carrying the only two things needed
 * to identify someone crossing a dark pitch — their face and their name.
 *
 * Every card arms on the first tap and fires on the second. A walk-out cannot
 * be taken back once it is on the wall, and the operator is watching the gate
 * rather than the tablet, so a single stray tap must not put the wrong player
 * up in front of the room. The arm lapses by itself after a few seconds, and
 * tapping a different card moves the arm rather than queueing a second one.
 *
 * The send goes straight to program. There is no preview leg here on purpose:
 * the cue is "that player just walked out", and a preview step would put the
 * card on the wall a beat after the moment it belongs to.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { setDisplayScene } from '@/lib/actions';
import {
  newIdempotencyKey,
  useDeviceId,
  useDisplayState,
  useEventSnapshot,
} from '@/lib/hooks';
import type { PlayerRow, TeamCode, TeamRow } from '@/lib/types';
import { displayNameOf } from '@/components/player';
import { StatusPill, teamRowAccentVars } from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  Callout,
  EmptyState,
  PageHeader,
  Panel,
  PlayerSendCard,
  useActionRunner,
} from '@/components/admin';

/**
 * How long an armed card stays armed.
 *
 * Long enough to look up from the tablet, watch the player clear the gate and
 * tap again; short enough that an arm left behind while the operator deals
 * with something else has lapsed by the time they look back.
 */
const ARM_MS = 5_000;

interface SquadPanelProps {
  code: TeamCode;
  team: TeamRow | null;
  players: PlayerRow[];
  armedId: string | null;
  liveId: string | null;
  disabled: boolean;
  onPress: (player: PlayerRow) => void;
}

function SquadPanel({
  code,
  team,
  players,
  armedId,
  liveId,
  disabled,
  onPress,
}: SquadPanelProps) {
  return (
    <Panel
      eyebrow={`TEAM ${code}`}
      title={team?.name ?? `Team ${code}`}
      description={`${players.length} ${players.length === 1 ? 'player' : 'players'} in walk-out order.`}
      actions={
        <span
          aria-hidden
          className="rounded-pill block h-3 w-12"
          style={{ background: teamRowAccentVars(team)['--team-accent'] }}
        />
      }
    >
      {players.length === 0 ? (
        <EmptyState
          title="No players on this team yet"
          description="Add the squad in Setup → Players, then come back here."
          action={
            <Link href="/admin/setup/players">
              <AdminButton variant="secondary" size="sm">
                Go to Players
              </AdminButton>
            </Link>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
          {players.map((player) => (
            <PlayerSendCard
              key={player.id}
              player={player}
              team={team}
              armed={armedId === player.id}
              onTv={liveId === player.id}
              disabled={disabled}
              onPress={() => onPress(player)}
            />
          ))}
        </div>
      )}
    </Panel>
  );
}

export default function PlayerEntrancePage() {
  const deviceId = useDeviceId();
  const runner = useActionRunner();

  const { snapshot, error: snapshotError, loading } = useEventSnapshot({ pollMs: 15_000 });
  const {
    programScene,
    programPayload,
    error: displayError,
    refresh: refreshDisplay,
  } = useDisplayState();

  const [armedId, setArmedId] = useState<string | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearDisarm = useCallback(() => {
    if (disarmTimer.current) {
      clearTimeout(disarmTimer.current);
      disarmTimer.current = null;
    }
  }, []);

  // An armed card must not survive the operator navigating away.
  useEffect(() => clearDisarm, [clearDisarm]);

  /**
   * Both squads, in the order they will walk.
   *
   * `snapshot.players` is already active-only and ordered by team then
   * `display_order`, which is the running order the lineups screen sets — so
   * this only has to split it. Every player on a team is shown rather than the
   * first five: a roster that gains a player on the day should still be
   * sendable, not silently stranded off the end of a hard-coded slice.
   */
  const squads = useMemo(() => {
    const empty: Record<TeamCode, PlayerRow[]> = { A: [], B: [] };
    if (!snapshot) return empty;
    for (const code of ['A', 'B'] as const) {
      const team = snapshot.teamsByCode[code];
      if (!team) continue;
      empty[code] = snapshot.players.filter((player) => player.team_id === team.id);
    }
    return empty;
  }, [snapshot]);

  /** Who is on the wall right now, if the wall is showing an entrance at all. */
  const liveId =
    programScene === 'player_entrance' && typeof programPayload.playerId === 'string'
      ? programPayload.playerId
      : null;

  const livePlayer = liveId ? (snapshot?.playersById[liveId] ?? null) : null;

  const send = useCallback(
    async (player: PlayerRow): Promise<void> => {
      clearDisarm();
      setArmedId(null);
      await runner.run(
        () =>
          setDisplayScene({
            idempotencyKey: newIdempotencyKey('entrance-send'),
            deviceId,
            scene: 'player_entrance',
            payload: { playerId: player.id },
          }),
        { success: `${displayNameOf(player) || 'That player'} is on the wall.` },
      );
      void refreshDisplay();
    },
    [clearDisarm, deviceId, runner, refreshDisplay],
  );

  /** First tap arms this card; second tap on the same card sends it. */
  const press = useCallback(
    (player: PlayerRow): void => {
      if (armedId === player.id) {
        void send(player);
        return;
      }
      clearDisarm();
      setArmedId(player.id);
      disarmTimer.current = setTimeout(() => setArmedId(null), ARM_MS);
    },
    [armedId, clearDisarm, send],
  );

  const showWelcome = useCallback(async (): Promise<void> => {
    clearDisarm();
    setArmedId(null);
    await runner.run(
      () =>
        setDisplayScene({
          idempotencyKey: newIdempotencyKey('entrance-welcome'),
          deviceId,
          scene: 'player_entrance',
          payload: {},
        }),
      { success: 'The welcome frame is on the wall.' },
    );
    void refreshDisplay();
  }, [clearDisarm, deviceId, runner, refreshDisplay]);

  const backToHolding = useCallback(async (): Promise<void> => {
    clearDisarm();
    setArmedId(null);
    await runner.run(
      () =>
        setDisplayScene({
          idempotencyKey: newIdempotencyKey('entrance-holding'),
          deviceId,
          scene: 'holding',
          payload: {},
        }),
      { success: 'Back to the holding screen.' },
    );
    void refreshDisplay();
  }, [clearDisarm, deviceId, runner, refreshDisplay]);

  const onWall = livePlayer
    ? `${displayNameOf(livePlayer)} is on the wall.`
    : programScene === 'player_entrance'
      ? 'The welcome frame is on the wall.'
      : 'The entrance is not on the wall — the wall is showing another scene.';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Cue 10"
        title="Player entrance"
        description="Tap a player once to arm their card, then tap again to send the walk-out reveal straight to the wall. The card holds until the next player is sent."
        actions={
          <ButtonRow>
            <AdminButton
              variant="secondary"
              onClick={() => void showWelcome()}
              busy={runner.pending}
            >
              Show welcome frame
            </AdminButton>
            <AdminButton
              variant="ghost"
              onClick={() => void backToHolding()}
              busy={runner.pending}
            >
              Back to holding
            </AdminButton>
          </ButtonRow>
        }
      />

      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <StatusPill
              label={programScene === 'player_entrance' ? 'ENTRANCE LIVE' : 'OFF AIR'}
              tone={programScene === 'player_entrance' ? 'live' : 'neutral'}
              size="md"
            />
            <span className="text-text-secondary text-[0.875rem]">{onWall}</span>
          </div>
          <Link href="/tv" target="_blank" rel="noreferrer">
            <AdminButton variant="secondary" size="sm">
              Open the wall
            </AdminButton>
          </Link>
        </div>
      </Panel>

      {runner.status ? (
        <Callout tone={runner.status.tone === 'ok' ? 'success' : 'danger'}>
          {runner.status.message}
        </Callout>
      ) : null}

      {snapshotError ? (
        <Callout tone="warning" title="The roster on screen may be behind the server">
          {snapshotError}
        </Callout>
      ) : null}

      {displayError ? (
        <Callout tone="warning" title="The wall status may be out of date">
          {displayError}
        </Callout>
      ) : null}

      {loading && !snapshot ? (
        <Panel>
          <p className="text-text-muted text-[0.875rem]">Loading the squads…</p>
        </Panel>
      ) : (
        <div className="space-y-6">
          {(['A', 'B'] as const).map((code) => (
            <SquadPanel
              key={code}
              code={code}
              team={snapshot?.teamsByCode[code] ?? null}
              players={squads[code]}
              armedId={armedId}
              liveId={liveId}
              disabled={runner.pending}
              onPress={press}
            />
          ))}
        </div>
      )}
    </div>
  );
}
