'use client';

/**
 * The closing ceremony console.
 *
 * The ceremony is the one part of the night that cannot be re-run. Two ideas
 * carry the screen:
 *
 *  1. A readiness gate. The podium is only true if every challenge has an
 *     official result, any penalty tiebreak the profile requires has been
 *     settled, and nothing is still open that could move a player's total. Until
 *     that holds, the cue list is inert. It can be overridden — the show must go
 *     on — but only with a typed reason, which is written into the event record
 *     and the audit log before the first cue fires.
 *
 *  2. An ordered cue list. Previous, current and next are always on screen, so
 *     the champion cannot be revealed before the runner-up by a mis-tap.
 *
 * No scoring is editable here. If a result is wrong, it is wrong in the
 * controller, and this screen sends the operator there.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';
import { getRounds } from '@/lib/data/queries';
import { supabase } from '@/lib/supabase/client';
import { setCeremonyPhase, setDisplayScene, updateEvent } from '@/lib/actions';
import {
  newIdempotencyKey,
  useDeviceId,
  useDisplayState,
  useEventSnapshot,
} from '@/lib/hooks';
import type { RoundRow } from '@/lib/types';
import { resolveCeremonyPhase } from '@/components/tv/constants';
import { RankBadge, StatusPill } from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  CEREMONY_CUES,
  Callout,
  ConfirmDialog,
  FIRST_CUE,
  KeyValue,
  PageHeader,
  Panel,
  SectionHeading,
  cueAt,
  cueIndexOf,
  useActionRunner,
  type CeremonyCue,
} from '@/components/admin';

/** Where the override and the ceremony journal live inside `events.settings`. */
const OVERRIDE_KEY = 'ceremony_gate_override';
const JOURNAL_KEY = 'ceremony_log';
/** Journal entries kept on the event row. Older ones remain in the audit log. */
const JOURNAL_LIMIT = 50;

interface GateOverride {
  reason: string;
  at: string;
  device: string | null;
}

function readOverride(settings: Record<string, unknown> | undefined): GateOverride | null {
  const raw = settings?.[OVERRIDE_KEY];
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Partial<GateOverride>;
  if (typeof value.reason !== 'string' || value.reason.trim() === '') return null;
  return {
    reason: value.reason,
    at: typeof value.at === 'string' ? value.at : '',
    device: typeof value.device === 'string' ? value.device : null,
  };
}

interface GateCheck {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
  href: string;
  action: string;
}

type Pending =
  | { kind: 'override' }
  | { kind: 'skip'; from: CeremonyCue | null; to: CeremonyCue; skipped: CeremonyCue }
  | { kind: 'end' };

export default function CeremonyPage() {
  const deviceId = useDeviceId();
  const runner = useActionRunner();

  const { snapshot, error: snapshotError, refresh } = useEventSnapshot({ pollMs: 15_000 });
  const {
    ceremonyPhase,
    programScene,
    error: displayError,
    refresh: refreshDisplay,
  } = useDisplayState();

  const [held, setHeld] = useState(false);
  const [pending, setPending] = useState<Pending | null>(null);
  const [journalWarning, setJournalWarning] = useState<string | null>(null);

  // Every round in the show, so "nothing is still open" can be checked rather
  // than assumed. The snapshot only carries the current challenge's rounds.
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const challengeIds = snapshot?.challenges.map((c) => c.id).join(',') ?? '';

  useEffect(() => {
    if (!challengeIds) return;
    let live = true;

    void (async () => {
      try {
        const db = supabase();
        const lists = await Promise.all(
          challengeIds.split(',').map((id) => getRounds(db, id)),
        );
        if (live) setRounds(lists.flat());
      } catch {
        // The gate treats an unreadable round list as "not proven final" below,
        // which is the safe direction to fail in.
      }
    })();

    return () => {
      live = false;
    };
  }, [challengeIds, snapshot?.revision]);

  const settingsRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    settingsRef.current = snapshot?.event.settings ?? {};
  });

  const override = useMemo(
    () => readOverride(snapshot?.event.settings),
    [snapshot?.event.settings],
  );

  // --- readiness gate ------------------------------------------------------

  const checks = useMemo<GateCheck[]>(() => {
    if (!snapshot) return [];

    const { challenges, match, shootout, scoring, scoringProfile, standings } = snapshot;

    // 1 — every challenge has an official result.
    const undecided = challenges.filter(
      (challenge) => challenge.status !== 'completed' || challenge.winner === null,
    );
    const resultsOk = challenges.length === 5 && undecided.length === 0;

    // 2 — any penalty tiebreak the profile requires has been settled.
    const penaltiesDisabled = scoring.penalties.enabledFor === 'disabled';
    const matchDrawn = match !== null && match.winner === 'draw';
    const shootoutOpen = shootout !== null && shootout.status !== 'completed';
    const shootoutRequired = !penaltiesDisabled && matchDrawn;
    const penaltiesOk =
      !shootoutOpen &&
      (!shootoutRequired || (shootout !== null && shootout.winner !== null));

    // 3 — nothing left that can still move a total.
    const openRounds = rounds.filter(
      (round) => round.status !== 'published' && round.status !== 'completed',
    );
    const matchOpen = match !== null && match.status !== 'completed';
    const roundsKnown = rounds.length > 0;
    const scored = standings.some((player) => player.totalPoints !== 0);
    const standingsOk =
      roundsKnown &&
      openRounds.length === 0 &&
      !matchOpen &&
      scoringProfile.is_locked &&
      scored;

    return [
      {
        id: 'results',
        label: 'All five challenges have official results',
        ok: resultsOk,
        detail: resultsOk
          ? challenges
              .map(
                (c) =>
                  `C${c.number} ${c.winner === 'draw' ? 'drawn' : `won by ${c.winner}`}`,
              )
              .join(' · ')
          : challenges.length !== 5
            ? `${challenges.length} challenges configured — the competition expects five.`
            : `Still open: ${undecided.map((c) => `C${c.number} ${c.title}`).join(', ')}.`,
        href: '/admin/controller',
        action: 'Finish it in the controller',
      },
      {
        id: 'penalties',
        label: 'Any required penalty tiebreak is complete',
        ok: penaltiesOk,
        detail: penaltiesDisabled
          ? 'Penalties are disabled in the scoring profile — nothing to settle.'
          : shootoutOpen
            ? 'A shootout is open and undecided. Finish it before the podium.'
            : shootoutRequired
              ? shootout && shootout.winner
                ? `Shootout complete — ${shootout.winner === 'draw' ? 'drawn' : `won by ${shootout.winner}`}.`
                : 'The final match is drawn and the profile requires a shootout to break it.'
              : match
                ? 'The final match produced a winner. No tiebreak needed.'
                : 'No final match on record yet.',
        href: '/admin/controller',
        action: 'Open the controller',
      },
      {
        id: 'standings',
        label: 'The standings are final',
        ok: standingsOk,
        detail: !roundsKnown
          ? 'No rounds could be read, so the standings cannot be proven final.'
          : openRounds.length > 0
            ? `${openRounds.length} round${openRounds.length === 1 ? '' : 's'} not published yet.`
            : matchOpen
              ? `The final match is ${match?.status.replace(/_/g, ' ')}, not completed.`
              : !scoringProfile.is_locked
                ? `Scoring profile v${scoringProfile.version} is still unlocked — a point value could move under the podium.`
                : !scored
                  ? 'No player has any points. The ledger looks empty.'
                  : `Locked on profile v${scoringProfile.version}. ${standings.length} players ranked.`,
        href: '/admin/setup/scoring',
        action: 'Review the scoring profile',
      },
    ];
  }, [snapshot, rounds]);

  const blocking = checks.filter((check) => !check.ok);
  const gateOpen = checks.length > 0 && (blocking.length === 0 || override !== null);

  // --- cue position --------------------------------------------------------

  const currentIndex = cueIndexOf(ceremonyPhase);
  const current = cueAt(currentIndex);
  const previous = cueAt(currentIndex - 1);
  const next = cueAt(currentIndex + 1);
  const started = currentIndex !== -1;

  /** Cues that the TV renderer collapses onto the same phase. */
  const collisions = useMemo(() => {
    const byPhase = new Map<string, CeremonyCue[]>();
    for (const cue of CEREMONY_CUES) {
      const resolved = resolveCeremonyPhase(cue.phase);
      byPhase.set(resolved, [...(byPhase.get(resolved) ?? []), cue]);
    }
    return [...byPhase.entries()].filter(([, cues]) => cues.length > 1);
  }, []);

  // --- commands ------------------------------------------------------------

  /**
   * Append to the ceremony journal on the event row.
   *
   * This is the only place a typed reason on this screen can be preserved:
   * `setCeremonyPhase` carries no reason field, while an event patch writes
   * before/after into `audit_logs` through the same command pipeline.
   */
  const journal = useCallback(
    async (
      entry: Record<string, unknown>,
      extra: Record<string, unknown> = {},
    ): Promise<boolean> => {
      const settings = { ...settingsRef.current, ...extra };
      const existing = settings[JOURNAL_KEY];
      const log = Array.isArray(existing) ? [...(existing as unknown[])] : [];
      log.push({ ...entry, at: new Date().toISOString(), device: deviceId ?? null });
      settings[JOURNAL_KEY] = log.slice(-JOURNAL_LIMIT);

      try {
        const result = await updateEvent({
          idempotencyKey: newIdempotencyKey('ceremony-journal'),
          deviceId,
          patch: { settings },
        });
        if (!result.ok) {
          setJournalWarning(
            `The reason could not be written to the event record: ${result.error}`,
          );
          return false;
        }
        setJournalWarning(null);
        void refresh();
        return true;
      } catch {
        setJournalWarning('The reason could not be written to the event record.');
        return false;
      }
    },
    [deviceId, refresh],
  );

  /** Put a cue on the wall: the phase first, then the ceremony scene over it. */
  const goToCue = useCallback(
    async (cue: CeremonyCue, success: string): Promise<boolean> => {
      const phase = await runner.run(
        () =>
          setCeremonyPhase({
            idempotencyKey: newIdempotencyKey('ceremony-phase'),
            deviceId,
            phase: cue.phase,
          }),
        { silent: true },
      );
      if (!phase.ok) return false;

      const scene = await runner.run(
        () =>
          setDisplayScene({
            idempotencyKey: newIdempotencyKey('ceremony-scene'),
            deviceId,
            scene: 'ceremony',
            payload: { phase: cue.phase },
          }),
        { success },
      );

      void refreshDisplay();
      return scene.ok;
    },
    [deviceId, runner, refreshDisplay],
  );

  async function takeNext(): Promise<void> {
    if (!gateOpen) {
      runner.setError('The readiness gate is closed. Clear it or override it first.');
      return;
    }
    if (held) {
      runner.setError('The console is on hold. Release the hold before taking the next cue.');
      return;
    }
    const target = started ? next : FIRST_CUE;
    if (!target) {
      runner.setError('The ceremony is on its last cue.');
      return;
    }
    await goToCue(target, `${target.cue} ${target.title} is on the wall.`);
  }

  async function goBack(): Promise<void> {
    if (!previous) {
      runner.setError('This is the first cue — there is nothing behind it.');
      return;
    }
    await goToCue(previous, `Back to ${previous.cue} ${previous.title}.`);
  }

  async function toggleHold(): Promise<void> {
    if (held) {
      setHeld(false);
      runner.clear();
      return;
    }
    setHeld(true);
    if (current) {
      // Re-assert the current cue, so a hold also recovers the wall if
      // something else cut away from the ceremony.
      await goToCue(current, `Holding on ${current.cue} ${current.title}.`);
    }
  }

  async function confirmSkip(reason: string): Promise<void> {
    if (!pending || pending.kind !== 'skip') return;
    await journal({
      kind: 'cue_skipped',
      reason,
      skipped: pending.skipped.phase,
      from: pending.from?.phase ?? null,
      to: pending.to.phase,
    });
    const done = await goToCue(
      pending.to,
      `Skipped ${pending.skipped.cue} ${pending.skipped.title}.`,
    );
    if (done) setPending(null);
  }

  async function confirmOverride(reason: string): Promise<void> {
    const written = await journal(
      {
        kind: 'gate_override',
        reason,
        failing: blocking.map((check) => check.id),
      },
      {
        [OVERRIDE_KEY]: {
          reason,
          at: new Date().toISOString(),
          device: deviceId ?? null,
        } satisfies GateOverride,
      },
    );

    if (written) {
      setPending(null);
      runner.clear();
    } else {
      runner.setError(
        'The override was not recorded, so the gate stays closed. Sign in with an event-admin account and try again.',
      );
    }
  }

  async function clearOverride(): Promise<void> {
    const settings = { ...settingsRef.current };
    delete settings[OVERRIDE_KEY];
    const result = await runner.run(
      () =>
        updateEvent({
          idempotencyKey: newIdempotencyKey('ceremony-override-clear'),
          deviceId,
          patch: { settings },
        }),
      { success: 'Override withdrawn. The gate is enforced again.' },
    );
    if (result.ok) void refresh();
  }

  async function confirmEnd(reason: string): Promise<void> {
    await journal({ kind: 'ceremony_cleared', reason, from: ceremonyPhase ?? null });
    const result = await runner.run(
      () =>
        setCeremonyPhase({
          idempotencyKey: newIdempotencyKey('ceremony-clear'),
          deviceId,
          phase: null,
        }),
      { success: 'Ceremony state cleared. The wall is still on whatever scene it held.' },
    );
    if (result.ok) {
      setPending(null);
      setHeld(false);
      void refreshDisplay();
    }
  }

  // --- render --------------------------------------------------------------

  const teamPoints = snapshot?.teamPoints ?? { A: 0, B: 0 };
  const championCode = teamPoints.A === teamPoints.B ? null : teamPoints.A > teamPoints.B ? 'A' : 'B';
  const champion = championCode ? snapshot?.teamsByCode[championCode] : null;
  const topFive = (snapshot?.standings ?? []).filter((player) => player.rank <= 5);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Run the show"
        title="Ceremony"
        description="Nine cues, in order, from “competition complete” to the screen the night ends on."
        actions={
          <>
            <StatusPill
              label={gateOpen ? (override ? 'GATE OVERRIDDEN' : 'GATE CLEAR') : 'GATE CLOSED'}
              tone={gateOpen ? (override ? 'draw' : 'winner') : 'live'}
            />
            {started ? (
              <StatusPill
                label={`ON CUE ${current?.cue ?? '—'}`}
                tone="live"
                size="sm"
                pulse
              />
            ) : (
              <StatusPill label="NOT STARTED" tone="pending" size="sm" />
            )}
          </>
        }
      />

      {runner.status ? (
        <Callout tone={runner.status.tone === 'ok' ? 'success' : 'danger'}>
          {runner.status.message}
        </Callout>
      ) : null}

      {journalWarning ? (
        <Callout tone="warning" title="The written reason did not reach the event record">
          {journalWarning} The phase change itself is still in the audit log.
        </Callout>
      ) : null}

      {snapshotError || displayError ? (
        <Callout tone="warning" title="The last read failed">
          {snapshotError ?? displayError} Everything below is the last confirmed state.
        </Callout>
      ) : null}

      {/* ---- Readiness gate ---- */}
      <Panel
        tone={gateOpen ? 'default' : 'danger'}
        eyebrow="Before the first cue"
        title="Readiness gate"
        description="The podium is only true if none of these can still move."
        actions={
          override ? (
            <AdminButton size="sm" busy={runner.pending} onClick={() => void clearOverride()}>
              Withdraw override
            </AdminButton>
          ) : blocking.length > 0 ? (
            <AdminButton
              size="sm"
              variant="danger"
              onClick={() => setPending({ kind: 'override' })}
            >
              Override the gate
            </AdminButton>
          ) : null
        }
      >
        <div className="space-y-4">
          {override ? (
            <Callout tone="warning" title="This ceremony is running on an override">
              “{override.reason}”
              {override.at ? ` — recorded ${new Date(override.at).toLocaleString()}` : null}.
              The failing checks below were not satisfied when the override was taken.
            </Callout>
          ) : null}

          <ul className="divide-border-subtle divide-y">
            {checks.length === 0 ? (
              <li className="text-text-muted py-3 text-[0.8125rem]">
                Reading the event…
              </li>
            ) : null}
            {checks.map((check) => (
              <li key={check.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <span
                  aria-hidden
                  className={cn(
                    'u-label inline-flex size-6 shrink-0 items-center justify-center rounded-pill text-[0.6875rem]',
                    check.ok ? 'bg-winner-soft text-winner' : 'bg-live-soft text-live',
                  )}
                >
                  {check.ok ? '✓' : '▲'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-ink block text-[0.875rem] font-medium">
                    {check.label}
                    <span className="u-sr-only">
                      {check.ok ? ' — satisfied' : ' — blocking the ceremony'}
                    </span>
                  </span>
                  <span className="text-text-muted block text-[0.75rem] leading-body break-words">
                    {check.detail}
                  </span>
                </span>
                {check.ok ? null : (
                  <Link
                    href={check.href}
                    className="u-label text-aqua-800 hover:text-aqua-900 shrink-0 text-eyebrow"
                  >
                    {check.action} →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      {/* ---- Transport ---- */}
      <Panel
        tone="accent"
        title="Cue transport"
        description={
          held
            ? 'On hold. The current cue stays on the wall and Take is blocked until you release it.'
            : 'Take moves the show forward one cue. Back re-shows the cue before it.'
        }
        actions={
          held ? <StatusPill label="HOLDING" tone="draw" /> : null
        }
      >
        <div className="space-y-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <CueCard label="Previous" cue={previous} tone="past" />
            <CueCard
              label={started ? 'On the wall' : 'Not started'}
              cue={current}
              tone="current"
              emptyNote="The ceremony has not started. Take fires cue C1."
            />
            <CueCard label="Next" cue={started ? next : FIRST_CUE} tone="next" />
          </div>

          {!gateOpen ? (
            <Callout tone="danger" title="The cue list is locked">
              {blocking.length} check{blocking.length === 1 ? '' : 's'} still block the
              ceremony. Clear them above, or take a recorded override.
            </Callout>
          ) : null}

          <ButtonRow>
            <AdminButton
              variant="take"
              size="xl"
              busy={runner.pending}
              disabled={!gateOpen || held || (started && !next)}
              onClick={() => void takeNext()}
            >
              {started ? `TAKE ${next?.cue ?? '—'}` : 'START CEREMONY'}
            </AdminButton>

            <AdminButton
              size="lg"
              disabled={!previous || runner.pending}
              onClick={() => void goBack()}
            >
              Back{previous ? ` to ${previous.cue}` : ''}
            </AdminButton>

            <AdminButton
              size="lg"
              variant={held ? 'primary' : 'secondary'}
              disabled={runner.pending}
              onClick={() => void toggleHold()}
            >
              {held ? 'Release hold' : 'Hold'}
            </AdminButton>

            <AdminButton
              size="lg"
              variant="danger"
              disabled={!gateOpen || !next || !cueAt(currentIndex + 2)}
              onClick={() => {
                const skipped = next;
                const target = cueAt(currentIndex + 2);
                if (!skipped || !target) return;
                setPending({ kind: 'skip', from: current, to: target, skipped });
              }}
            >
              Skip {next?.cue ?? ''}
            </AdminButton>

            <AdminButton
              size="lg"
              variant="ghost"
              disabled={!started || runner.pending}
              onClick={() => setPending({ kind: 'end' })}
            >
              Clear ceremony state
            </AdminButton>
          </ButtonRow>

          {programScene !== 'ceremony' && started ? (
            <Callout tone="warning" title="The ceremony is not the scene on air">
              The phase is set to {current?.title ?? ceremonyPhase}, but the wall is showing{' '}
              {programScene.replace(/_/g, ' ')}. Take or Hold puts the ceremony back on air.
            </Callout>
          ) : null}
        </div>
      </Panel>

      {/* ---- The full running order ---- */}
      <Panel
        title="Running order"
        description="The whole sequence, so the next three cues are never a surprise."
        flush
      >
        <ol className="divide-border-subtle divide-y">
          {CEREMONY_CUES.map((cue, index) => {
            const state =
              index < currentIndex ? 'done' : index === currentIndex ? 'live' : 'upcoming';
            return (
              <li
                key={cue.phase}
                className={cn(
                  'flex flex-wrap items-start gap-4 px-5 py-3.5',
                  state === 'live' && 'bg-aqua-100',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'u-tabular font-numeral mt-0.5 inline-flex size-9 shrink-0 items-center justify-center rounded-md text-[0.8125rem]',
                    state === 'live'
                      ? 'bg-live text-white'
                      : state === 'done'
                        ? 'bg-winner-soft text-winner'
                        : 'bg-mist text-text-secondary',
                  )}
                >
                  {cue.cue}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-ink text-[0.9375rem] font-semibold">{cue.title}</span>
                    {state === 'live' ? (
                      <StatusPill label="ON THE WALL" tone="live" size="sm" />
                    ) : null}
                    {state === 'done' ? (
                      <StatusPill label="SHOWN" tone="winner" size="sm" />
                    ) : null}
                  </span>
                  <span className="text-text-muted mt-0.5 block text-[0.75rem] leading-body">
                    {cue.beat}
                  </span>
                </span>

                <span className="u-label text-text-muted shrink-0 text-[0.625rem]">
                  {cue.hold}
                </span>
              </li>
            );
          })}
        </ol>
      </Panel>

      {collisions.length > 0 ? (
        <Callout tone="warning" title="Some cues render the same screen">
          The TV renderer resolves these cues onto one phase, so taking them in order will not
          change the wall:{' '}
          {collisions
            .map(([phase, cues]) => `${cues.map((c) => c.cue).join(' + ')} → “${phase}”`)
            .join('; ')}
          . The cue list and the renderer&rsquo;s phase names need to be reconciled before the
          ceremony is rehearsed.
        </Callout>
      ) : null}

      {/* ---- What is about to be revealed ---- */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="What the room is about to see"
          description="Read-only. These are the confirmed standings the ceremony reveals."
        >
          <div className="space-y-5">
            <dl className="grid gap-4 sm:grid-cols-3">
              <KeyValue
                label="Champion team"
                value={champion ? champion.name : 'Level — no team winner'}
              />
              <KeyValue
                label={snapshot?.teamsByCode.A?.name ?? 'Team A'}
                value={teamPoints.A}
                mono
              />
              <KeyValue
                label={snapshot?.teamsByCode.B?.name ?? 'Team B'}
                value={teamPoints.B}
                mono
              />
            </dl>

            <div className="space-y-3">
              <SectionHeading hint="Revealed C3 → C7, fifth first">Top five</SectionHeading>
              <ul className="divide-border-subtle divide-y">
                {topFive.length === 0 ? (
                  <li className="text-text-muted py-3 text-[0.8125rem]">
                    No ranked players yet.
                  </li>
                ) : null}
                {topFive.map((player) => (
                  <li key={player.id} className="flex items-center gap-3 py-2.5">
                    <RankBadge
                      rank={player.rank}
                      shared={player.sharedRank}
                      tone="medal"
                      size="sm"
                    />
                    <span className="text-ink min-w-0 flex-1 truncate text-[0.875rem] font-medium">
                      {player.display_name ?? player.full_name}
                      {player.sharedRank ? (
                        <span className="text-text-muted ml-2 text-[0.75rem]">
                          shares rank {player.rank}
                        </span>
                      ) : null}
                    </span>
                    <span className="u-tabular font-numeral text-ink text-[0.9375rem]">
                      {player.totalPoints}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Panel>

        <Panel tone="danger" title="If a result is wrong">
          <div className="space-y-4">
            <p className="text-text-secondary text-[0.8125rem] leading-body">
              Nothing on this screen can change a score, and that is deliberate. A correction
              made mid-ceremony with the podium already half-revealed is how a wrong name ends
              up on the wall. Stop the sequence, fix the result where it lives, and come back.
            </p>

            <ol className="text-text-secondary list-decimal space-y-2 pl-5 text-[0.8125rem] leading-body">
              <li>Press Hold, so the wall stays on the cue it is on.</li>
              <li>
                Reopen and correct the round or the match in the{' '}
                <Link
                  href="/admin/controller"
                  className="text-aqua-800 hover:text-aqua-900 underline underline-offset-2"
                >
                  scoring controller
                </Link>
                . Every reversal takes a written reason.
              </li>
              <li>
                Check the corrected total in{' '}
                <Link
                  href="/admin/audit"
                  className="text-aqua-800 hover:text-aqua-900 underline underline-offset-2"
                >
                  Audit &amp; exports
                </Link>
                .
              </li>
              <li>Release the hold and Back up to the cue that has to be re-shown.</li>
            </ol>
          </div>
        </Panel>
      </div>

      {/* ---- Dialogs ---- */}
      <ConfirmDialog
        open={pending?.kind === 'override'}
        title="Override the readiness gate?"
        description="The ceremony will run on results the console cannot prove are final. Your reason is written into the event record and the audit log."
        confirmLabel="Record and override"
        confirmWord="OVERRIDE"
        reasonLabel="Why the ceremony must start anyway"
        reasonPlaceholder="e.g. C4 result is on the referee's sheet and will be entered after the ceremony — decided by the event director."
        busy={runner.pending}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => void confirmOverride(reason)}
      >
        <div className="space-y-2">
          <p className="u-label text-text-muted text-eyebrow">Checks being overridden</p>
          <ul className="text-live space-y-1 text-[0.8125rem]">
            {blocking.map((check) => (
              <li key={check.id}>
                ▲ {check.label} — {check.detail}
              </li>
            ))}
          </ul>
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === 'skip'}
        title={
          pending?.kind === 'skip'
            ? `Skip ${pending.skipped.cue} — ${pending.skipped.title}?`
            : 'Skip a cue?'
        }
        description="The skipped cue will not be shown. If it is a player reveal, that player never gets their moment on the wall."
        confirmLabel="Skip the cue"
        reasonLabel="Why this cue is being skipped"
        reasonPlaceholder="e.g. the third-placed player has already left the venue."
        busy={runner.pending}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => void confirmSkip(reason)}
      >
        {pending?.kind === 'skip' ? (
          <div className="ring-border-subtle space-y-1 rounded-md px-4 py-3 ring-1">
            <p className="text-text-secondary text-[0.8125rem]">
              Not shown: <strong>{pending.skipped.beat}</strong>
            </p>
            <p className="text-text-secondary text-[0.8125rem]">
              Goes to: {pending.to.cue} {pending.to.title}
            </p>
          </div>
        ) : null}
      </ConfirmDialog>

      <ConfirmDialog
        open={pending?.kind === 'end'}
        title="Clear the ceremony state?"
        description="The phase is unset, so the ceremony scene falls back to its opening slate. Use this after the night ends, not between cues."
        confirmLabel="Clear it"
        reasonLabel="Why the ceremony is being cleared"
        busy={runner.pending}
        onCancel={() => setPending(null)}
        onConfirm={(reason) => void confirmEnd(reason)}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function CueCard({
  label,
  cue,
  tone,
  emptyNote,
}: {
  label: string;
  cue: CeremonyCue | null;
  tone: 'past' | 'current' | 'next';
  emptyNote?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-md px-4 py-4 ring-1',
        tone === 'current'
          ? 'bg-surface-raised ring-live/40 shadow-card'
          : 'bg-surface-raised/60 ring-border-subtle',
      )}
    >
      <p
        className={cn(
          'u-eyebrow text-eyebrow',
          tone === 'current' ? 'text-live' : 'text-text-muted',
        )}
      >
        {label}
      </p>

      {cue ? (
        <>
          <p
            className={cn(
              'u-display text-ink mt-1 leading-tight',
              tone === 'current' ? 'text-[1.75rem]' : 'text-[1.25rem]',
            )}
          >
            <span className="u-tabular font-numeral text-text-muted mr-2 text-[0.875rem]">
              {cue.cue}
            </span>
            {cue.title}
          </p>
          <p className="text-text-secondary mt-1.5 text-[0.8125rem] leading-body">{cue.beat}</p>
          <p className="u-label text-text-muted mt-2 text-[0.625rem]">{cue.hold}</p>
        </>
      ) : (
        <p className="text-text-muted mt-1 text-[0.8125rem] leading-body">
          {emptyNote ?? '—'}
        </p>
      )}
    </div>
  );
}
