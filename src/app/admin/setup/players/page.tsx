'use client';

/**
 * Setup → Players.
 *
 * Ten squad rows, and the one job that decides whether the broadcast looks
 * professional: the cut-out.
 *
 * A portrait is never judged in the abstract here. The editor renders the real
 * `HeroPlayerCard` and the real `LiveSideCard` beside the fields, fed by the
 * unsaved draft, so the operator sees the crop the wall will see. The focal
 * point is set either with two sliders or by clicking the face directly on the
 * source image — `focal_x` / `focal_y` drive `object-position` on every card in
 * the platform, so a face that sits high in the frame stays in shot.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { EVENT_SLUG } from '@/lib/event';
import { getAllPlayers, getTeams, requireEvent } from '@/lib/data/queries';
import { supabase } from '@/lib/supabase/client';
import { updatePlayer } from '@/lib/actions';
import { newIdempotencyKey, useDeviceId } from '@/lib/hooks';
import type { PlayerRow, TeamRow } from '@/lib/types';
import { StatusPill } from '@/components/ui';
import { HeroPlayerCard, LiveSideCard, portraitSrc } from '@/components/player';
import {
  Callout,
  Field,
  FieldGrid,
  NumberInput,
  PageHeader,
  Panel,
  RangeInput,
  SaveBar,
  SectionHeading,
  SelectInput,
  TextInput,
  Toggle,
  UploadField,
  useActionRunner,
} from '@/components/admin';

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

interface PlayerDraft {
  fullName: string;
  displayName: string;
  jersey: number | null;
  teamId: string | null;
  active: boolean;
  displayOrder: number | null;
  photoUrl: string | null;
  portraitUrl: string | null;
  focalX: number;
  focalY: number;
}

function draftOf(row: PlayerRow): PlayerDraft {
  return {
    fullName: row.full_name ?? '',
    displayName: row.display_name ?? '',
    jersey: row.jersey_number,
    teamId: row.team_id,
    active: row.active,
    displayOrder: row.display_order,
    photoUrl: row.photo_url,
    portraitUrl: row.portrait_url,
    focalX: Number.isFinite(row.focal_x) ? row.focal_x : 0.5,
    focalY: Number.isFinite(row.focal_y) ? row.focal_y : 0.35,
  };
}

function isDirty(draft: PlayerDraft, base: PlayerDraft): boolean {
  return (
    draft.fullName !== base.fullName ||
    draft.displayName !== base.displayName ||
    draft.jersey !== base.jersey ||
    draft.teamId !== base.teamId ||
    draft.active !== base.active ||
    draft.displayOrder !== base.displayOrder ||
    draft.photoUrl !== base.photoUrl ||
    draft.portraitUrl !== base.portraitUrl ||
    Math.abs(draft.focalX - base.focalX) > 0.0001 ||
    Math.abs(draft.focalY - base.focalY) > 0.0001
  );
}

/** The row as it would look if the draft were saved — what the cards render. */
function previewRow(row: PlayerRow, draft: PlayerDraft): PlayerRow {
  return {
    ...row,
    full_name: draft.fullName.trim() || row.full_name,
    display_name: draft.displayName.trim() || null,
    jersey_number: draft.jersey,
    team_id: draft.teamId,
    active: draft.active,
    display_order: draft.displayOrder ?? 0,
    photo_url: draft.photoUrl,
    portrait_url: draft.portraitUrl,
    focal_x: draft.focalX,
    focal_y: draft.focalY,
  };
}

// ---------------------------------------------------------------------------
// Focal-point picker
// ---------------------------------------------------------------------------

function FocalPicker({
  src,
  x,
  y,
  onPick,
}: {
  src: string | null;
  x: number;
  y: number;
  onPick: (x: number, y: number) => void;
}) {
  if (!src) {
    return (
      <div className="border-border-subtle bg-mist flex h-40 items-center justify-center rounded-md border border-dashed px-4 text-center">
        <p className="text-text-muted text-[0.75rem] leading-body">
          Upload a cut-out to place the focal point.
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      aria-label="Set the focal point by clicking the player's face"
      onClick={(event) => {
        const box = event.currentTarget.getBoundingClientRect();
        const image = event.currentTarget.querySelector('img');
        // Clicks are measured against the drawn image, not the padded box, so
        // a letterboxed portrait still maps to the right point in the source.
        const target = image ? image.getBoundingClientRect() : box;
        const nx = (event.clientX - target.left) / target.width;
        const ny = (event.clientY - target.top) / target.height;
        onPick(
          Math.min(1, Math.max(0, Number(nx.toFixed(3)))),
          Math.min(1, Math.max(0, Number(ny.toFixed(3)))),
        );
      }}
      className="ring-border-subtle bg-mist relative block h-40 w-full cursor-crosshair overflow-hidden rounded-md ring-1"
    >
      {/* A runtime Supabase URL on an unknown host — next/image would need
          per-deployment configuration for it. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-full w-full object-contain" draggable={false} />
      <span
        aria-hidden
        className="pointer-events-none absolute size-5 -translate-x-1/2 -translate-y-1/2 rounded-pill border-2 border-white shadow-card"
        style={{
          left: `${x * 100}%`,
          top: `${y * 100}%`,
          backgroundColor: 'color-mix(in oklab, var(--color-live) 70%, transparent)',
        }}
      />
      <span className="u-label bg-surface-raised/90 text-text-secondary absolute bottom-1 left-1 rounded-xs px-1.5 py-0.5 text-[0.5625rem]">
        CLICK THE FACE
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function PlayersSetupPage() {
  const deviceId = useDeviceId();
  const runner = useActionRunner();

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, PlayerDraft>>({});
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const saveKeys = useRef<Record<string, string>>({});

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const db = supabase();
        const event = await requireEvent(db, EVENT_SLUG);
        const [teamRows, playerRows] = await Promise.all([
          getTeams(db, event.id),
          getAllPlayers(db, event.id),
        ]);
        if (!live) return;
        setTeams(teamRows);
        setPlayers(playerRows);
        setDrafts(Object.fromEntries(playerRows.map((p) => [p.id, draftOf(p)])));
        setSelectedId((current) => current ?? playerRows[0]?.id ?? null);
        setLoadError(null);
      } catch (cause) {
        if (!live) return;
        setLoadError(
          cause instanceof Error ? cause.message : 'The squad could not be loaded.',
        );
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  const patch = useCallback(
    <K extends keyof PlayerDraft>(playerId: string, key: K, value: PlayerDraft[K]) => {
      delete saveKeys.current[playerId];
      setDrafts((current) => {
        const existing = current[playerId];
        if (!existing) return current;
        return { ...current, [playerId]: { ...existing, [key]: value } };
      });
    },
    [],
  );

  const dirtyIds = useMemo(
    () =>
      players
        .filter((player) => {
          const draft = drafts[player.id];
          return draft ? isDirty(draft, draftOf(player)) : false;
        })
        .map((player) => player.id),
    [players, drafts],
  );

  const selected = players.find((p) => p.id === selectedId) ?? null;
  const draft = selected ? drafts[selected.id] : undefined;
  const team = draft?.teamId ? teams.find((t) => t.id === draft.teamId) ?? null : null;

  const blockedReason = useMemo(() => {
    for (const player of players) {
      const d = drafts[player.id];
      if (!d) continue;
      if (!d.fullName.trim()) return `${player.full_name || 'A player'} needs a full name.`;
      if (d.jersey !== null && (!Number.isInteger(d.jersey) || d.jersey < 0 || d.jersey > 99)) {
        return `${d.fullName || player.full_name}'s jersey number must be a whole number from 0 to 99.`;
      }
    }
    return null;
  }, [players, drafts]);

  /** Another player on the same team already wearing this number. */
  const jerseyClash = useMemo(() => {
    if (!selected || !draft || draft.jersey === null) return null;
    const clash = players.find((p) => {
      if (p.id === selected.id) return false;
      const other = drafts[p.id];
      if (!other) return false;
      return (
        other.active &&
        other.teamId === draft.teamId &&
        other.jersey === draft.jersey
      );
    });
    return clash ? drafts[clash.id]?.fullName || clash.full_name : null;
  }, [selected, draft, players, drafts]);

  async function save(): Promise<void> {
    if (blockedReason || dirtyIds.length === 0) return;

    const saved: PlayerRow[] = [];

    for (const playerId of dirtyIds) {
      const d = drafts[playerId];
      if (!d) continue;

      if (!saveKeys.current[playerId]) {
        saveKeys.current[playerId] = newIdempotencyKey('player-update');
      }

      const result = await runner.run(
        () =>
          updatePlayer({
            idempotencyKey: saveKeys.current[playerId],
            deviceId,
            playerId,
            patch: {
              full_name: d.fullName.trim(),
              display_name: d.displayName.trim() || null,
              jersey_number: d.jersey,
              team_id: d.teamId,
              active: d.active,
              display_order: d.displayOrder ?? 0,
              photo_url: d.photoUrl,
              portrait_url: d.portraitUrl,
              focal_x: Number(d.focalX.toFixed(3)),
              focal_y: Number(d.focalY.toFixed(3)),
            },
          }),
        {
          success:
            dirtyIds.length > 1 ? `${dirtyIds.length} players saved.` : 'Player saved.',
        },
      );

      if (!result.ok) return;
      delete saveKeys.current[playerId];
      saved.push(result.data);
    }

    if (saved.length > 0) {
      setPlayers((current) =>
        current.map((player) => saved.find((row) => row.id === player.id) ?? player),
      );
      setDrafts((current) => {
        const next = { ...current };
        for (const row of saved) next[row.id] = draftOf(row);
        return next;
      });
    }
  }

  function reset(): void {
    saveKeys.current = {};
    runner.clear();
    setDrafts(Object.fromEntries(players.map((p) => [p.id, draftOf(p)])));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Players" description="Loading the squad…" />
        <Panel>
          <p className="text-text-muted text-[0.875rem]">Reading players from the database.</p>
        </Panel>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Players" />
        <Callout tone="danger" title="The squad could not be loaded">
          {loadError}
        </Callout>
      </div>
    );
  }

  const missingCutouts = players.filter((p) => {
    const d = drafts[p.id];
    return d ? d.active && !d.portraitUrl && !d.photoUrl : false;
  }).length;

  const grouped: Array<{ label: string; team: TeamRow | null; rows: PlayerRow[] }> = [
    ...teams.map((t) => ({
      label: t.name,
      team: t,
      rows: players.filter((p) => (drafts[p.id]?.teamId ?? p.team_id) === t.id),
    })),
    {
      label: 'No team',
      team: null,
      rows: players.filter((p) => !(drafts[p.id]?.teamId ?? p.team_id)),
    },
  ].filter((group) => group.rows.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup"
        title="Players"
        description="The ten squad members, their cut-outs and how those cut-outs sit inside a card."
        actions={
          <StatusPill
            label={dirtyIds.length > 0 ? `${dirtyIds.length} UNSAVED` : 'IN SYNC'}
            tone={dirtyIds.length > 0 ? 'draw' : 'winner'}
            size="sm"
          />
        }
      />

      {missingCutouts > 0 ? (
        <Callout tone="warning" title={`${missingCutouts} active player${missingCutouts === 1 ? '' : 's'} without a photo`}>
          Those cards fall back to the branded silhouette. It is a deliberate, presentable
          fallback — but the player photography is the hero of this design, so fill the gaps
          before the doors open.
        </Callout>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[18rem_minmax(0,1fr)]">
        {/* ---- Roster ---- */}
        <Panel title="Squad" flush bodyClassName="py-2">
          <div className="space-y-3">
            {grouped.map((group) => (
              <div key={group.label} className="space-y-0.5">
                <p className="u-eyebrow text-text-muted text-eyebrow px-4 pt-2">
                  {group.label}
                </p>
                <ul>
                  {group.rows.map((player) => {
                    const d = drafts[player.id];
                    const active = player.id === selectedId;
                    const edited = dirtyIds.includes(player.id);
                    const hasPhoto = Boolean(d?.portraitUrl || d?.photoUrl);

                    return (
                      <li key={player.id}>
                        <button
                          type="button"
                          onClick={() => setSelectedId(player.id)}
                          aria-current={active ? 'true' : undefined}
                          className={cn(
                            'flex w-full items-center gap-3 px-4 py-2.5 text-left',
                            'transition-colors duration-[var(--dur-instant)]',
                            active ? 'bg-aqua-100' : 'hover:bg-mist',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'u-numeral ring-border-subtle inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-[0.8125rem] tabular-nums ring-1',
                              active ? 'bg-surface-raised text-ink' : 'bg-mist text-text-secondary',
                            )}
                          >
                            {d?.jersey ?? '—'}
                          </span>

                          <span className="min-w-0 flex-1">
                            <span
                              className={cn(
                                'block truncate text-[0.875rem]',
                                active ? 'text-ink font-semibold' : 'text-text-secondary',
                              )}
                            >
                              {d?.displayName?.trim() || d?.fullName?.trim() || player.full_name}
                            </span>
                            <span className="text-text-muted block text-[0.6875rem]">
                              {d?.active === false ? 'Inactive · ' : ''}
                              {hasPhoto ? 'Photo set' : 'No photo'}
                            </span>
                          </span>

                          {edited ? (
                            <span className="u-label text-draw shrink-0 text-[0.5625rem]">
                              ● EDITED
                            </span>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Panel>

        {/* ---- Editor ---- */}
        {selected && draft ? (
          <div className="min-w-0 space-y-6">
            <Panel
              eyebrow={team ? team.name : 'No team'}
              title={draft.displayName.trim() || draft.fullName.trim() || selected.full_name}
              description="Squad details. The display name is what every card shows; the full name is what the record keeps."
              actions={
                draft.active ? null : <StatusPill label="INACTIVE" tone="pending" size="sm" />
              }
            >
              <div className="space-y-5">
                <FieldGrid>
                  <Field label="Full name" htmlFor="p-full">
                    <TextInput
                      id="p-full"
                      value={draft.fullName}
                      maxLength={120}
                      invalid={!draft.fullName.trim()}
                      onChange={(e) => patch(selected.id, 'fullName', e.target.value)}
                    />
                  </Field>

                  <Field
                    label="Display name"
                    htmlFor="p-display"
                    hint="Leave empty to use the full name. The last word is set at hero size."
                  >
                    <TextInput
                      id="p-display"
                      value={draft.displayName}
                      maxLength={120}
                      onChange={(e) => patch(selected.id, 'displayName', e.target.value)}
                    />
                  </Field>
                </FieldGrid>

                <FieldGrid columns={3}>
                  <Field
                    label="Jersey number"
                    htmlFor="p-jersey"
                    hint={jerseyClash ? undefined : '0–99. Shown behind the player as a ghost numeral.'}
                    error={
                      jerseyClash
                        ? `${jerseyClash} is already wearing this number on the same team.`
                        : null
                    }
                  >
                    <NumberInput
                      id="p-jersey"
                      min={0}
                      max={99}
                      step={1}
                      value={draft.jersey}
                      invalid={Boolean(jerseyClash)}
                      onValueChange={(value) =>
                        patch(
                          selected.id,
                          'jersey',
                          value === null ? null : Math.round(value),
                        )
                      }
                    />
                  </Field>

                  <Field label="Team" htmlFor="p-team">
                    <SelectInput
                      id="p-team"
                      value={draft.teamId ?? ''}
                      onChange={(e) =>
                        patch(selected.id, 'teamId', e.target.value || null)
                      }
                    >
                      <option value="">No team</option>
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} (Team {t.code})
                        </option>
                      ))}
                    </SelectInput>
                  </Field>

                  <Field
                    label="Squad order"
                    htmlFor="p-order"
                    hint="Sorts the roster and the lineup pickers."
                  >
                    <NumberInput
                      id="p-order"
                      min={0}
                      max={99}
                      step={1}
                      value={draft.displayOrder}
                      onValueChange={(value) =>
                        patch(
                          selected.id,
                          'displayOrder',
                          value === null ? null : Math.round(value),
                        )
                      }
                    />
                  </Field>
                </FieldGrid>

                <Toggle
                  checked={draft.active}
                  onCheckedChange={(value) => patch(selected.id, 'active', value)}
                  label="Active in this event"
                  description="An inactive player disappears from lineups, standings and every public screen. Their recorded points are never deleted."
                />
              </div>
            </Panel>

            <Panel
              tone="accent"
              title="Cut-out and framing"
              description="The single biggest lever on how this event looks on screen."
            >
              <div className="space-y-5">
                <Callout tone="info" title="What makes a good cut-out">
                  <ul className="list-disc space-y-1 pl-4">
                    <li>
                      <strong>Transparent PNG.</strong> No background, no white box, no drop
                      shadow baked in — the card supplies its own field and fade.
                    </li>
                    <li>
                      <strong>At least 2000&nbsp;px tall.</strong> These fill an LED wall;
                      anything smaller softens the moment it is blown up.
                    </li>
                    <li>
                      <strong>Waist-up, facing camera.</strong> Head and shoulders dominant,
                      arms inside the frame, eyes toward the lens.
                    </li>
                    <li>
                      <strong>Even light, clean edges.</strong> Check the hair and the boots at
                      full size before uploading — ragged masking shows.
                    </li>
                  </ul>
                </Callout>

                <FieldGrid>
                  <UploadField
                    bucket="players"
                    folder="cutouts"
                    label="Cut-out portrait (used on every card)"
                    hint="Transparent PNG, 2000 px tall or more, waist-up."
                    accept="image/png,image/webp,image/avif"
                    value={draft.portraitUrl}
                    onUploaded={(url) => patch(selected.id, 'portraitUrl', url)}
                    onCleared={() => patch(selected.id, 'portraitUrl', null)}
                  />

                  <UploadField
                    bucket="players"
                    folder="photos"
                    label="Original photo (fallback)"
                    hint="Optional. Used only when there is no cut-out — a straight photo still beats a silhouette."
                    value={draft.photoUrl}
                    onUploaded={(url) => patch(selected.id, 'photoUrl', url)}
                    onCleared={() => patch(selected.id, 'photoUrl', null)}
                  />
                </FieldGrid>

                <div className="border-border-subtle grid gap-6 border-t pt-5 lg:grid-cols-2">
                  <div className="space-y-4">
                    <SectionHeading hint="Keeps the face in shot when a card crops">
                      Focal point
                    </SectionHeading>

                    <FocalPicker
                      src={portraitSrc(previewRow(selected, draft))}
                      x={draft.focalX}
                      y={draft.focalY}
                      onPick={(x, y) => {
                        patch(selected.id, 'focalX', x);
                        patch(selected.id, 'focalY', y);
                      }}
                    />

                    <Field
                      label="Horizontal"
                      aside={<span className="u-tabular font-numeral">{draft.focalX.toFixed(2)}</span>}
                      hint="0.00 is the left edge of the source image, 1.00 the right."
                    >
                      <RangeInput
                        value={draft.focalX}
                        min={0}
                        max={1}
                        step={0.01}
                        aria-label="Focal point, horizontal"
                        onValueChange={(value) => patch(selected.id, 'focalX', value)}
                      />
                    </Field>

                    <Field
                      label="Vertical"
                      aside={<span className="u-tabular font-numeral">{draft.focalY.toFixed(2)}</span>}
                      hint="Around 0.30 suits most football portraits — the face sits high in the frame."
                    >
                      <RangeInput
                        value={draft.focalY}
                        min={0}
                        max={1}
                        step={0.01}
                        aria-label="Focal point, vertical"
                        onValueChange={(value) => patch(selected.id, 'focalY', value)}
                      />
                    </Field>
                  </div>

                  <div className="space-y-4">
                    <SectionHeading hint="The real components, fed by this draft">
                      Live card preview
                    </SectionHeading>

                    <div className="mx-auto w-full max-w-[16rem]">
                      <HeroPlayerCard
                        player={previewRow(selected, draft)}
                        teamColor={team?.color ?? null}
                        teamCode={team?.code ?? null}
                        teamName={team?.name ?? null}
                        eyebrow="CHALLENGE 02"
                        headline="ON THE SPOT"
                        roundPoints={8}
                        totalPoints={128}
                        rank={2}
                        size="md"
                        animateIn={false}
                      />
                    </div>

                    <LiveSideCard
                      player={previewRow(selected, draft)}
                      teamColor={team?.color ?? null}
                      teamCode={team?.code ?? null}
                      teamName={team?.name ?? null}
                      roundScore={8}
                      totalPoints={128}
                      rank={2}
                      size="sm"
                    />

                    <p className="text-text-muted text-[0.75rem] leading-body">
                      Scores and rank shown here are sample values so the layout is honest —
                      they are not this player&apos;s real standing.
                    </p>
                  </div>
                </div>
              </div>
            </Panel>
          </div>
        ) : (
          <Panel>
            <p className="text-text-muted text-[0.875rem]">
              Select a player from the squad list to edit them.
            </p>
          </Panel>
        )}
      </div>

      <SaveBar
        dirty={dirtyIds.length > 0}
        pending={runner.pending}
        status={runner.status}
        blockedReason={blockedReason}
        onSave={() => void save()}
        onReset={reset}
        saveLabel={dirtyIds.length > 1 ? `Save ${dirtyIds.length} players` : 'Save player'}
      />
    </div>
  );
}
