'use client';

/**
 * Setup → Lineups.
 *
 * The ten-slot team sheet, one challenge at a time. Slot A3 always faces slot
 * B3, so the sheet *is* the fixture list: whoever sits in A3 plays round 3.
 * That is why this screen shows the resulting pairings before anything is
 * locked — the operator is not filling in a form, they are deciding who plays
 * whom in front of a crowd.
 *
 * Two rules the UI enforces on its own:
 *
 *  1. A player already holding a slot in THIS challenge never appears in the
 *     other dropdowns of the same challenge. (The command would move them and
 *     empty their old slot; better that the choice is never offered.)
 *  2. A locked or completed challenge is read-only. Rearranging challenge 4
 *     must never rewrite the team sheet challenge 2 was played under.
 */

import { useCallback, useMemo, useState } from 'react';

import {
  lockChallengeLineup,
  setLineupSlot,
  unlockChallengeLineup,
} from '@/lib/actions';
import { useEventSnapshot } from '@/lib/hooks';
import { newIdempotencyKey, useDeviceId } from '@/lib/hooks/useDeviceId';
import type {
  ChallengeRow,
  LineupSlotRow,
  PlayerRow,
  RoundRow,
  TeamCode,
  TeamRow,
} from '@/lib/types';
import { StatusPill } from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  Callout,
  ConfirmDialog,
  EmptyState,
  Field,
  PageHeader,
  Panel,
  SaveBar,
  SectionHeading,
  SegmentedControl,
  SelectInput,
} from '@/components/admin';

// ---------------------------------------------------------------------------
// Draft model
// ---------------------------------------------------------------------------

/** `A3` / `B1` — the stable key for one slot inside one challenge. */
type SlotKey = string;
type Draft = Record<SlotKey, string | null>;

function slotKey(slot: Pick<LineupSlotRow, 'team_code' | 'slot_index'>): SlotKey {
  return `${slot.team_code}${slot.slot_index}`;
}

function draftFrom(slots: LineupSlotRow[]): Draft {
  const draft: Draft = {};
  for (const slot of slots) draft[slotKey(slot)] = slot.player_id;
  return draft;
}

function sortSlots(slots: LineupSlotRow[]): LineupSlotRow[] {
  return [...slots].sort(
    (a, b) => a.team_code.localeCompare(b.team_code) || a.slot_index - b.slot_index,
  );
}

function nameOf(player: PlayerRow | null | undefined): string {
  if (!player) return '— empty —';
  return player.display_name ?? player.full_name;
}

function labelWithNumber(player: PlayerRow): string {
  const base = player.display_name ?? player.full_name;
  return player.jersey_number === null ? base : `${player.jersey_number}. ${base}`;
}

const CHALLENGE_STATUS_TONE = {
  draft: 'pending',
  ready: 'neutral',
  locked: 'winner',
  live: 'live',
  completed: 'winner',
} as const;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LineupsPage() {
  /** Null until the operator picks a challenge; before that we follow the show. */
  const [pickedId, setPickedId] = useState<string | null>(null);

  const { snapshot, loading, error, refresh } = useEventSnapshot({
    challengeId: pickedId ?? undefined,
  });

  const deviceId = useDeviceId();

  const challenges = useMemo<ChallengeRow[]>(
    () => snapshot?.challenges ?? [],
    [snapshot],
  );

  const challenge = useMemo<ChallengeRow | null>(() => {
    if (challenges.length === 0) return null;
    return (
      challenges.find((c) => c.id === pickedId) ??
      snapshot?.currentChallenge ??
      challenges[0]
    );
  }, [challenges, pickedId, snapshot]);

  const selectedId = challenge?.id ?? null;

  const slots = useMemo<LineupSlotRow[]>(
    () =>
      challenge
        ? sortSlots((snapshot?.allLineups ?? []).filter((s) => s.challenge_id === challenge.id))
        : [],
    [snapshot, challenge],
  );

  /** What the database currently holds — the baseline every edit is diffed against. */
  const serverDraft = useMemo<Draft>(() => draftFrom(slots), [slots]);

  /**
   * Unsaved edits only, keyed by slot, scoped to one challenge. Holding the
   * *difference* rather than a full copy means an untouched slot always shows
   * what the server says, even while another device is editing the same sheet.
   */
  const [edits, setEdits] = useState<{ challengeId: string | null; map: Draft }>({
    challengeId: null,
    map: {},
  });

  const activeEdits = useMemo<Draft>(
    () => (edits.challengeId === selectedId ? edits.map : {}),
    [edits, selectedId],
  );
  const draft = useMemo<Draft>(
    () => ({ ...serverDraft, ...activeEdits }),
    [serverDraft, activeEdits],
  );
  const dirty = Object.keys(activeEdits).some(
    (key) => (activeEdits[key] ?? null) !== (serverDraft[key] ?? null),
  );

  const players = snapshot?.players ?? [];
  const playersById = useMemo(() => snapshot?.playersById ?? {}, [snapshot]);
  const rounds = useMemo<RoundRow[]>(
    () => (challenge && snapshot?.currentChallenge?.id === challenge.id ? snapshot.rounds : []),
    [snapshot, challenge],
  );

  const locked =
    challenge !== null && (challenge.status === 'locked' || challenge.status === 'completed');
  const completed = challenge?.status === 'completed';
  const isFinalMatch = challenge?.mechanic === 'final_match';

  // --- command plumbing ----------------------------------------------------

  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<
    { tone: 'ok' | 'error'; message: string; at: number } | null
  >(null);
  const [dialog, setDialog] = useState<'lock' | 'unlock' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [validation, setValidation] = useState<{
    ok: boolean;
    problems: string[];
    at: number;
  } | null>(null);

  const say = useCallback((tone: 'ok' | 'error', message: string) => {
    setStatus({ tone, message, at: Date.now() });
  }, []);

  function assign(slot: LineupSlotRow, playerId: string | null): void {
    setValidation(null);
    setEdits((prev) => ({
      challengeId: selectedId,
      map: {
        ...(prev.challengeId === selectedId ? prev.map : {}),
        [slotKey(slot)]: playerId,
      },
    }));
  }

  function discard(): void {
    setValidation(null);
    setEdits({ challengeId: selectedId, map: {} });
  }

  function copyFrom(sourceChallengeId: string): void {
    const source = sortSlots(
      (snapshot?.allLineups ?? []).filter((s) => s.challenge_id === sourceChallengeId),
    );
    const copied: Draft = {};
    for (const slot of source) {
      const key = slotKey(slot);
      if (key in serverDraft) copied[key] = slot.player_id;
    }
    setValidation(null);
    setEdits({ challengeId: selectedId, map: copied });
    say('ok', 'Copied. Nothing is saved until you press Save team sheet.');
  }

  /** Everything that would stop this sheet from being locked, in plain words. */
  function problemsWith(current: Draft): string[] {
    const problems: string[] = [];
    const seen = new Map<string, string>();

    for (const slot of slots) {
      const key = slotKey(slot);
      const playerId = current[key] ?? null;

      if (!playerId) {
        problems.push(`Slot ${slot.slot_label} is empty.`);
        continue;
      }

      const player = playersById[playerId] as PlayerRow | undefined;
      if (!player) {
        problems.push(`Slot ${slot.slot_label} holds a player who is no longer on the roster.`);
        continue;
      }
      if (!player.active) {
        problems.push(`${nameOf(player)} (${slot.slot_label}) is not an active player.`);
      }
      if (player.team_id !== slot.team_id) {
        problems.push(`${nameOf(player)} is not in team ${slot.team_code} — slot ${slot.slot_label}.`);
      }

      const already = seen.get(playerId);
      if (already) {
        problems.push(`${nameOf(player)} is in both ${already} and ${slot.slot_label}.`);
      } else {
        seen.set(playerId, slot.slot_label);
      }
    }

    return problems;
  }

  function validate(): void {
    const problems = problemsWith(draft);
    setValidation({ ok: problems.length === 0, problems, at: Date.now() });
  }

  async function save(): Promise<void> {
    if (!challenge) return;
    setPending(true);
    setStatus(null);
    try {
      let written = 0;
      for (const slot of slots) {
        const key = slotKey(slot);
        const next = draft[key] ?? null;
        if (next === (serverDraft[key] ?? null)) continue;

        const result = await setLineupSlot({
          idempotencyKey: newIdempotencyKey('lineup'),
          deviceId,
          challengeId: challenge.id,
          teamCode: slot.team_code,
          slotIndex: slot.slot_index,
          playerId: next,
        });

        if (!result.ok) {
          say('error', `${slot.slot_label}: ${result.error}`);
          await refresh();
          return;
        }
        written += 1;
      }

      // Refresh first: the edits stay on screen until the server read that
      // matches them lands, so nothing ever flickers back to the old sheet.
      await refresh();
      setEdits({ challengeId: selectedId, map: {} });
      say(
        'ok',
        written === 0
          ? 'Nothing had changed.'
          : `Saved ${written} ${written === 1 ? 'slot' : 'slots'}.`,
      );
    } catch (cause) {
      say('error', cause instanceof Error ? cause.message : 'The team sheet did not save.');
    } finally {
      setPending(false);
    }
  }

  async function runLock(): Promise<void> {
    if (!challenge) return;
    setPending(true);
    setDialogError(null);
    try {
      const result = await lockChallengeLineup({
        idempotencyKey: newIdempotencyKey('lineup-lock'),
        deviceId,
        challengeId: challenge.id,
      });
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      setDialog(null);
      say('ok', `${challenge.title} is locked. The pairings are now the record.`);
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function runUnlock(): Promise<void> {
    if (!challenge) return;
    setPending(true);
    setDialogError(null);
    try {
      const result = await unlockChallengeLineup({
        idempotencyKey: newIdempotencyKey('lineup-unlock'),
        deviceId,
        challengeId: challenge.id,
      });
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      setDialog(null);
      say('ok', `${challenge.title} is open for changes again.`);
      await refresh();
    } finally {
      setPending(false);
    }
  }

  // --- derived views -------------------------------------------------------

  const teamA: TeamRow | null = snapshot?.teamsByCode.A ?? null;
  const teamB: TeamRow | null = snapshot?.teamsByCode.B ?? null;

  const slotsByTeam = useMemo(() => {
    const group = (code: TeamCode) => slots.filter((s) => s.team_code === code);
    return { A: group('A'), B: group('B') };
  }, [slots]);

  const pairings = useMemo(() => {
    const indexes = Array.from(new Set(slots.map((s) => s.slot_index))).sort((a, b) => a - b);
    return indexes.map((index) => {
      const a = slots.find((s) => s.team_code === 'A' && s.slot_index === index) ?? null;
      const b = slots.find((s) => s.team_code === 'B' && s.slot_index === index) ?? null;
      const round = rounds.find((r) => r.number === index) ?? null;
      return {
        index,
        a: a ? (playersById[draft[slotKey(a)] ?? ''] ?? null) : null,
        b: b ? (playersById[draft[slotKey(b)] ?? ''] ?? null) : null,
        aLabel: a?.slot_label ?? `A${index}`,
        bLabel: b?.slot_label ?? `B${index}`,
        round,
      };
    });
  }, [slots, draft, playersById, rounds]);

  const otherChallenges = useMemo(
    () => challenges.filter((c) => c.id !== selectedId),
    [challenges, selectedId],
  );

  /** The challenge immediately before this one, when there is one. */
  const defaultCopySourceId = useMemo(() => {
    if (otherChallenges.length === 0) return '';
    const number = challenge?.number ?? Number.MAX_SAFE_INTEGER;
    const before = otherChallenges.filter((c) => c.number < number);
    return (before.length > 0 ? before[before.length - 1] : otherChallenges[0]).id;
  }, [otherChallenges, challenge]);

  const playedRounds = rounds.filter(
    (r) => r.status === 'published' || r.status === 'completed',
  );

  const filled = slots.filter((s) => draft[slotKey(s)]).length;
  const problems = problemsWith(draft);

  // --- render --------------------------------------------------------------

  if (loading && !snapshot) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Lineups" />
        <Panel>
          <p className="text-text-muted text-[0.875rem]">Reading the team sheets…</p>
        </Panel>
      </div>
    );
  }

  if (!snapshot) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Lineups" />
        <Callout tone="danger" title="The event could not be read">
          {error ?? 'No event data came back.'}
        </Callout>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        eyebrow="Setup"
        title="Lineups"
        description="Ten slots per challenge. Slot A3 faces slot B3, so the team sheet decides the fixtures — check the pairings below before you lock."
        actions={
          challenge ? (
            <StatusPill
              label={challenge.status.toUpperCase()}
              tone={CHALLENGE_STATUS_TONE[challenge.status]}
              size="sm"
            />
          ) : null
        }
      />

      {error ? (
        <Callout tone="warning" title="Showing the last good read">
          {error}
        </Callout>
      ) : null}

      <Panel
        eyebrow="Choose a challenge"
        title="Which team sheet are you filling in?"
        description="Each challenge has its own ten slots. A locked challenge keeps the sheet it was played under."
      >
        <SegmentedControl
          ariaLabel="Challenge"
          value={selectedId ?? ''}
          onValueChange={(value) => {
            setPickedId(value);
            setStatus(null);
            setValidation(null);
          }}
          options={challenges.map((c) => ({
            value: c.id,
            label: `C${c.number} · ${c.title}`,
            hint: c.status,
          }))}
        />
      </Panel>

      {!challenge ? (
        <Panel>
          <EmptyState
            title="No challenges yet"
            description="Run the seed migration before filling in a team sheet."
          />
        </Panel>
      ) : slots.length === 0 ? (
        <Panel title={challenge.title}>
          <EmptyState
            title="This challenge has no slots"
            description="The ten lineup slots are created with the challenge. Re-run supabase/migrations/0002_seed_event.sql."
          />
        </Panel>
      ) : (
        <>
          {locked ? (
            <Callout
              tone={completed ? 'success' : 'warning'}
              title={
                completed
                  ? 'This challenge is finished — its lineup is part of the record'
                  : 'This team sheet is locked'
              }
              actions={
                completed ? null : (
                  <AdminButton size="sm" onClick={() => setDialog('unlock')}>
                    Unlock to edit
                  </AdminButton>
                )
              }
            >
              {completed
                ? 'The pairings below are exactly what was played. Changing a later challenge never rewrites them.'
                : 'The pairings are frozen for the live challenge. Unlock only if a player has to be substituted before play starts.'}
            </Callout>
          ) : null}

          {playedRounds.length > 0 && !locked ? (
            <Callout tone="warning" title="Some rounds of this challenge are already played">
              {`Round${playedRounds.length === 1 ? '' : 's'} ${playedRounds
                .map((r) => r.number)
                .join(', ')} ${playedRounds.length === 1 ? 'has' : 'have'} been published. Those fixtures keep the players they were played with — a change here will not rewrite them.`}
            </Callout>
          ) : null}

          <Panel
            eyebrow={`Challenge ${challenge.number}`}
            title={challenge.title}
            description={challenge.description ?? undefined}
            actions={
              <span className="u-tabular font-numeral text-text-secondary text-[0.8125rem]">
                {filled}/{slots.length} slots filled
              </span>
            }
          >
            <div className="grid gap-6 lg:grid-cols-2">
              {(['A', 'B'] as const).map((code) => {
                const team = code === 'A' ? teamA : teamB;
                return (
                  <div key={code} className="space-y-4">
                    <SectionHeading hint={code === 'A' ? 'Slots A1 – A5' : 'Slots B1 – B5'}>
                      {team?.name ?? `Team ${code}`}
                    </SectionHeading>

                    <div className="space-y-4">
                      {slotsByTeam[code].map((slot) => {
                        const key = slotKey(slot);
                        const value = draft[key] ?? '';
                        const takenElsewhere = new Set(
                          Object.entries(draft)
                            .filter(([k, v]) => k !== key && v)
                            .map(([, v]) => v as string),
                        );

                        const options = players.filter(
                          (p) => p.team_id === slot.team_id && !takenElsewhere.has(p.id),
                        );
                        const chosen = value ? (playersById[value] as PlayerRow | undefined) : undefined;
                        // A player who has since been deactivated still has to
                        // be visible in the slot they occupy.
                        const withChosen =
                          chosen && !options.some((p) => p.id === chosen.id)
                            ? [chosen, ...options]
                            : options;

                        return (
                          <Field
                            key={slot.id}
                            label={`Slot ${slot.slot_label}`}
                            htmlFor={`slot-${slot.id}`}
                            hint={
                              isFinalMatch
                                ? 'Starting five for the final match.'
                                : `Plays round ${slot.slot_index}.`
                            }
                            aside={
                              chosen && chosen.jersey_number !== null
                                ? `#${chosen.jersey_number}`
                                : undefined
                            }
                          >
                            <SelectInput
                              id={`slot-${slot.id}`}
                              value={value}
                              disabled={locked || pending}
                              onChange={(event) =>
                                assign(slot, event.target.value === '' ? null : event.target.value)
                              }
                            >
                              <option value="">— empty —</option>
                              {withChosen.map((p) => (
                                <option key={p.id} value={p.id}>
                                  {labelWithNumber(p)}
                                  {p.active ? '' : ' (inactive)'}
                                </option>
                              ))}
                            </SelectInput>
                          </Field>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {!locked ? (
              <div className="border-border-subtle mt-6 space-y-4 border-t pt-5">
                <SectionHeading hint="Nothing is written until you save">
                  Copy a team sheet
                </SectionHeading>
                <CopyRow
                  challenges={otherChallenges}
                  defaultSourceId={defaultCopySourceId}
                  disabled={pending}
                  onCopy={copyFrom}
                />
              </div>
            ) : null}
          </Panel>

          <Panel
            eyebrow="Step 2"
            title="Check the sheet"
            description="Validate before locking. Every slot must hold an active player from the right team, and nobody may hold two slots in the same challenge."
            actions={
              <AdminButton onClick={validate} disabled={pending}>
                Validate team sheet
              </AdminButton>
            }
          >
            {validation ? (
              validation.ok ? (
                <Callout tone="success" title="This team sheet is ready to lock">
                  All {slots.length} slots hold an active player, and no player appears twice.
                </Callout>
              ) : (
                <Callout tone="danger" title={`${validation.problems.length} thing${
                  validation.problems.length === 1 ? '' : 's'
                } to fix`}>
                  <ul className="list-disc space-y-1 pl-4">
                    {validation.problems.map((problem) => (
                      <li key={problem}>{problem}</li>
                    ))}
                  </ul>
                </Callout>
              )
            ) : (
              <p className="text-text-secondary text-[0.8125rem] leading-body">
                {problems.length === 0
                  ? 'Nothing looks wrong from here — run the check to confirm.'
                  : `${problems.length} slot${problems.length === 1 ? '' : 's'} still need attention. Run the check to see them.`}
              </p>
            )}
          </Panel>

          <Panel
            eyebrow="Step 3"
            title={isFinalMatch ? 'The two squads' : 'The pairings this sheet produces'}
            description={
              isFinalMatch
                ? 'The final match is 5v5, so these ten players are the squads rather than five separate fixtures.'
                : 'Round by round, this is who faces whom. Locking writes exactly this into the rounds.'
            }
            flush
          >
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] border-collapse text-left">
                <thead>
                  <tr className="bg-mist">
                    <th className="u-label text-text-muted text-eyebrow px-5 py-2.5">
                      {isFinalMatch ? 'Slot' : 'Round'}
                    </th>
                    <th className="u-label text-text-muted text-eyebrow px-5 py-2.5">
                      {teamA?.name ?? 'Team A'}
                    </th>
                    <th className="u-label text-text-muted text-eyebrow px-5 py-2.5">
                      {teamB?.name ?? 'Team B'}
                    </th>
                    <th className="u-label text-text-muted text-eyebrow px-5 py-2.5 text-right">
                      State
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pairings.map((pair) => (
                    <tr key={pair.index} className="border-border-subtle border-t align-middle">
                      <td className="u-tabular font-numeral text-ink px-5 py-3 text-[0.9375rem]">
                        {isFinalMatch ? `${pair.aLabel} / ${pair.bLabel}` : pair.index}
                      </td>
                      <td className="text-ink px-5 py-3 text-[0.875rem]">
                        {pair.a ? nameOf(pair.a) : <span className="text-text-muted">— empty —</span>}
                      </td>
                      <td className="text-ink px-5 py-3 text-[0.875rem]">
                        {pair.b ? nameOf(pair.b) : <span className="text-text-muted">— empty —</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {pair.round ? (
                          <StatusPill
                            label={pair.round.status.replace(/_/g, ' ').toUpperCase()}
                            tone={
                              pair.round.status === 'published' || pair.round.status === 'completed'
                                ? 'winner'
                                : pair.round.status === 'live'
                                  ? 'live'
                                  : 'pending'
                            }
                            size="sm"
                          />
                        ) : (
                          <span className="text-text-muted text-[0.75rem]">
                            {isFinalMatch ? 'No 1v1 rounds' : 'Not created'}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>

          <Panel
            eyebrow="Step 4"
            title="Lock the team sheet"
            tone="accent"
            description="Locking freezes these ten slots — and therefore the pairings above — for the live challenge. The scoring controller reads the locked sheet; unlocking mid-challenge is possible, but a challenge that has finished can never be reopened."
          >
            <ButtonRow>
              <AdminButton
                variant="primary"
                size="lg"
                disabled={locked || pending || dirty || problems.length > 0}
                onClick={() => {
                  setDialogError(null);
                  setDialog('lock');
                }}
              >
                Lock {challenge.title}
              </AdminButton>

              {locked && !completed ? (
                <AdminButton
                  variant="danger"
                  disabled={pending}
                  onClick={() => {
                    setDialogError(null);
                    setDialog('unlock');
                  }}
                >
                  Unlock team sheet
                </AdminButton>
              ) : null}
            </ButtonRow>

            {dirty ? (
              <p className="text-draw mt-3 text-[0.8125rem]">
                <span aria-hidden>▲ </span>
                Save your changes before locking.
              </p>
            ) : problems.length > 0 && !locked ? (
              <p className="text-draw mt-3 text-[0.8125rem]">
                <span aria-hidden>▲ </span>
                {problems.length} slot{problems.length === 1 ? '' : 's'} still need attention.
              </p>
            ) : null}
          </Panel>

          <SaveBar
            dirty={dirty}
            pending={pending}
            status={status}
            onSave={() => void save()}
            onReset={discard}
            saveLabel="Save team sheet"
            blockedReason={
              locked
                ? completed
                  ? 'This challenge is finished. Its lineup is part of the record.'
                  : 'This team sheet is locked. Unlock it to make a change.'
                : null
            }
          />

          <ConfirmDialog
            open={dialog === 'lock'}
            title={`Lock the team sheet for ${challenge.title}?`}
            description={
              isFinalMatch
                ? 'The two squads above become the squads for the final match. The scoring controller will read this sheet.'
                : 'The five pairings above are written into the rounds and become the fixtures the room will see. Rearranging the sheet afterwards needs an unlock, and never touches a round that has already been played.'
            }
            confirmLabel="Lock the team sheet"
            confirmWord="LOCK"
            requireReason={false}
            busy={pending}
            error={dialogError}
            onCancel={() => setDialog(null)}
            onConfirm={() => void runLock()}
          />

          <ConfirmDialog
            open={dialog === 'unlock'}
            title={`Unlock ${challenge.title}?`}
            description="The team sheet becomes editable again. Rounds that have already been published keep the players they were played with."
            confirmLabel="Unlock"
            confirmWord="UNLOCK"
            requireReason={false}
            busy={pending}
            error={dialogError}
            onCancel={() => setDialog(null)}
            onConfirm={() => void runUnlock()}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

/** Copy another challenge's sheet into the draft — the usual starting point. */
function CopyRow({
  challenges,
  defaultSourceId,
  disabled,
  onCopy,
}: {
  challenges: ChallengeRow[];
  /** The previous challenge — what an operator copies from nine times in ten. */
  defaultSourceId: string;
  disabled: boolean;
  onCopy: (challengeId: string) => void;
}) {
  const [picked, setPicked] = useState<string>('');

  if (challenges.length === 0) return null;

  const source = challenges.some((c) => c.id === picked) ? picked : defaultSourceId;

  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field
        label="Copy from"
        htmlFor="copy-source"
        className="w-full max-w-xs"
        hint="Brings that challenge's ten players into this sheet as a starting point."
      >
        <SelectInput
          id="copy-source"
          value={source}
          disabled={disabled}
          onChange={(event) => setPicked(event.target.value)}
        >
          {challenges.map((c) => (
            <option key={c.id} value={c.id}>
              C{c.number} · {c.title}
            </option>
          ))}
        </SelectInput>
      </Field>
      <AdminButton
        disabled={disabled || !source}
        onClick={() => source && onCopy(source)}
        className="mb-6"
      >
        Copy lineup
      </AdminButton>
    </div>
  );
}
