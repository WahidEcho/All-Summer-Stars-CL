'use client';

/**
 * The TV control room.
 *
 * Built on the vision-mixer model the rest of the display layer already uses:
 * PREVIEW is what the operator is lining up, PROGRAM is what the room can see,
 * and nothing crosses between them except through TAKE LIVE. Both outputs are
 * embedded live at 1920x1080 and transform-scaled down, so what the console
 * shows is the actual wall — not a drawing of it.
 *
 * Two rules shape the layout. The scene on air must be readable from across the
 * room without clicking anything, and the way back to the safe scene must never
 * be more than one tap away — which is why the transmission bar is sticky and
 * GO TO HOLDING is never disabled, not even while another command is in flight.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';
import { getRounds } from '@/lib/data/queries';
import { supabase } from '@/lib/supabase/client';
import {
  clearPreviewScene,
  setDisplayScene,
  setPreviewScene,
  takePreviewLive,
} from '@/lib/actions';
import {
  newIdempotencyKey,
  useDeviceId,
  useDisplayState,
  useEventSnapshot,
} from '@/lib/hooks';
import type { DisplayScene, RoundRow } from '@/lib/types';
import { STAGE_H, STAGE_W, resolveCeremonyPhase } from '@/components/tv/constants';
import { StatusPill } from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  CEREMONY_CUES,
  Callout,
  ConfirmDialog,
  Field,
  NumberInput,
  PageHeader,
  Panel,
  SCENES,
  SCENE_BY_ID,
  SectionHeading,
  SelectInput,
  TextInput,
  Toggle,
  missingSceneFields,
  sceneTitle,
  useActionRunner,
  type ScenePayloadField,
} from '@/components/admin';

// ---------------------------------------------------------------------------
// Payload drafts
// ---------------------------------------------------------------------------

/**
 * Every field is edited as a string and converted on submit. Keeping one type
 * in the draft means an empty number box stays empty instead of collapsing to
 * zero, which matters when zero is a legal value for a field.
 */
type Draft = Record<string, string>;

interface PayloadSources {
  programScene: DisplayScene;
  programPayload: Record<string, unknown>;
  previewScene: DisplayScene | null;
  previewPayload: Record<string, unknown>;
}

function seedFrom(scene: DisplayScene, sources: PayloadSources): Draft {
  const descriptor = SCENE_BY_ID[scene];
  const source =
    sources.previewScene === scene
      ? sources.previewPayload
      : sources.programScene === scene
        ? sources.programPayload
        : {};

  const draft: Draft = {};
  for (const field of descriptor.fields) {
    const raw = source[field.key];
    draft[field.key] =
      raw === undefined || raw === null
        ? field.defaultValue === undefined
          ? ''
          : String(field.defaultValue)
        : String(raw);
  }
  return draft;
}

function buildPayload(scene: DisplayScene, draft: Draft): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const field of SCENE_BY_ID[scene].fields) {
    const raw = (draft[field.key] ?? '').trim();
    if (raw === '') continue;

    if (field.kind === 'number') {
      const parsed = Number(raw);
      if (Number.isFinite(parsed)) payload[field.key] = parsed;
      continue;
    }
    if (field.kind === 'boolean') {
      payload[field.key] = raw === 'true';
      continue;
    }
    payload[field.key] = raw;
  }

  return payload;
}

// ---------------------------------------------------------------------------
// Scaled output monitor
// ---------------------------------------------------------------------------

interface MonitorProps {
  label: string;
  tone: 'program' | 'preview';
  src: string;
  /** What the operator should read under the picture. */
  sceneLabel: string;
  detail: string[];
  /** Bumping this remounts the iframe — a hard reload of that output. */
  reloadKey: number;
  enabled: boolean;
}

/**
 * One output, live, scaled to fit.
 *
 * The iframe is laid out at the full broadcast canvas and scaled with a single
 * transform. The embedded stage therefore believes it has a 1920x1080 viewport
 * and composes exactly as it will on the wall — no responsive fallback inside
 * the scene is ever exercised here, so the monitor cannot flatter the output.
 */
function Monitor({
  label,
  tone,
  src,
  sceneLabel,
  detail,
  reloadKey,
  enabled,
}: MonitorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const measure = () => setWidth(host.clientWidth);
    measure();

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }

    const observer = new ResizeObserver(() => measure());
    observer.observe(host);
    return () => observer.disconnect();
  }, []);

  const scale = width > 0 ? width / STAGE_W : 0;
  const onAir = tone === 'program';

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <StatusPill
          label={onAir ? 'PROGRAM — ON AIR' : 'PREVIEW'}
          tone={onAir ? 'live' : 'neutral'}
          size="sm"
          pulse={onAir}
        />
        <a
          href={src}
          target="_blank"
          rel="noreferrer"
          className="u-label text-aqua-800 hover:text-aqua-900 text-eyebrow"
        >
          Open {label} ↗
        </a>
      </div>

      <div
        ref={hostRef}
        className={cn(
          'bg-ink relative w-full overflow-hidden rounded-md ring-1',
          onAir ? 'ring-live/50' : 'ring-border',
        )}
        style={{ aspectRatio: `${STAGE_W} / ${STAGE_H}` }}
      >
        {enabled && scale > 0 ? (
          <iframe
            key={`${src}-${reloadKey}`}
            src={src}
            title={`${label} output`}
            width={STAGE_W}
            height={STAGE_H}
            className="absolute top-0 left-0 border-0"
            style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}
          />
        ) : (
          <p className="text-text-inverse absolute inset-0 flex items-center justify-center px-6 text-center text-[0.8125rem]">
            {enabled
              ? 'Sizing the monitor…'
              : 'Monitors are standing by. Turn them on to see the live output.'}
          </p>
        )}
      </div>

      <div className="space-y-0.5">
        <p className="text-ink text-[0.9375rem] font-semibold">{sceneLabel}</p>
        {detail.length > 0 ? (
          <p className="text-text-muted text-[0.75rem] leading-body break-words">
            {detail.join(' · ')}
          </p>
        ) : (
          <p className="text-text-muted text-[0.75rem]">No payload.</p>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function DisplayControlPage() {
  const deviceId = useDeviceId();
  const runner = useActionRunner();

  const { snapshot } = useEventSnapshot({ pollMs: 30_000 });
  const {
    programScene,
    programPayload,
    previewScene,
    previewPayload,
    displayState,
    loading: displayLoading,
    error: displayError,
    refresh: refreshDisplay,
  } = useDisplayState();

  const [selected, setSelected] = useState<DisplayScene>('holding');
  const [draft, setDraft] = useState<Draft>(() => seedFrom('holding', {
    programScene: 'holding',
    programPayload: {},
    previewScene: null,
    previewPayload: {},
  }));
  const [monitorsOn, setMonitorsOn] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [confirmCut, setConfirmCut] = useState(false);

  // The live payloads, read by event handlers without making every callback
  // depend on objects that are re-created on each render.
  const sourcesRef = useRef<PayloadSources>({
    programScene: 'holding',
    programPayload: {},
    previewScene: null,
    previewPayload: {},
  });

  useEffect(() => {
    sourcesRef.current = { programScene, programPayload, previewScene, previewPayload };
  });

  // Open the console on whatever the wall is already doing, once, then leave
  // the operator's selection alone.
  const initialised = useRef(false);
  useEffect(() => {
    if (initialised.current || displayLoading) return;
    initialised.current = true;
    const scene = previewScene ?? programScene;
    setSelected(scene);
    setDraft(seedFrom(scene, sourcesRef.current));
  }, [displayLoading, previewScene, programScene]);

  // Rounds for every challenge: the snapshot only carries the current one, and
  // the operator has to be able to line up any round in the show.
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const challengeIds = snapshot?.challenges.map((c) => c.id).join(',') ?? '';

  useEffect(() => {
    if (!challengeIds) return;
    let live = true;

    void (async () => {
      try {
        const db = supabase();
        const ids = challengeIds.split(',');
        const lists = await Promise.all(ids.map((id) => getRounds(db, id)));
        if (live) setRounds(lists.flat());
      } catch {
        // Without this the round picker is empty; every other control still
        // works, so the failure is not worth blanking the screen for.
      }
    })();

    return () => {
      live = false;
    };
  }, [challengeIds, snapshot?.revision]);

  const playerName = useCallback(
    (id: string | null | undefined): string => {
      if (!id) return 'Empty slot';
      const player = snapshot?.playersById[id];
      return player?.display_name ?? player?.full_name ?? 'Unknown player';
    },
    [snapshot],
  );

  const challengeOptions = useMemo(
    () =>
      (snapshot?.challenges ?? []).map((challenge) => ({
        value: challenge.id,
        label: `C${challenge.number} — ${challenge.title}`,
      })),
    [snapshot],
  );

  const roundOptions = useMemo(() => {
    const numberByChallenge = new Map(
      (snapshot?.challenges ?? []).map((c) => [c.id, c.number]),
    );
    return [...rounds]
      .sort((a, b) => {
        const ca = numberByChallenge.get(a.challenge_id) ?? 99;
        const cb = numberByChallenge.get(b.challenge_id) ?? 99;
        return ca === cb ? a.number - b.number : ca - cb;
      })
      .map((round) => ({
        value: round.id,
        label: `C${numberByChallenge.get(round.challenge_id) ?? '?'} R${round.number} — ${playerName(
          round.player_a_id,
        )} vs ${playerName(round.player_b_id)}`,
      }));
  }, [rounds, snapshot, playerName]);

  const playerOptions = useMemo(
    () =>
      (snapshot?.players ?? []).map((player) => ({
        value: player.id,
        label: `${player.display_name ?? player.full_name}`,
      })),
    [snapshot],
  );

  /** One field's value, written the way an operator reads it. */
  const describeValue = useCallback(
    (field: ScenePayloadField, raw: unknown): string => {
      const value = String(raw);
      switch (field.kind) {
        case 'challenge':
          return challengeOptions.find((o) => o.value === value)?.label ?? value;
        case 'round':
          return roundOptions.find((o) => o.value === value)?.label ?? value;
        case 'player':
          return playerOptions.find((o) => o.value === value)?.label ?? value;
        case 'ceremonyPhase': {
          const cue = CEREMONY_CUES.find((c) => c.phase === value);
          return cue ? `${cue.cue} ${cue.title}` : value;
        }
        default:
          return value;
      }
    },
    [challengeOptions, roundOptions, playerOptions],
  );

  const describePayload = useCallback(
    (scene: DisplayScene | null, payload: Record<string, unknown>): string[] => {
      if (!scene) return [];
      return SCENE_BY_ID[scene].fields
        .filter((field) => {
          const value = payload[field.key];
          return value !== undefined && value !== null && value !== '';
        })
        .map((field) => `${field.label}: ${describeValue(field, payload[field.key])}`);
    },
    [describeValue],
  );

  const draftPayload = useMemo(() => buildPayload(selected, draft), [selected, draft]);
  const draftMissing = useMemo(
    () => missingSceneFields(selected, draftPayload),
    [selected, draftPayload],
  );
  const previewMissing = useMemo(
    () => (previewScene ? missingSceneFields(previewScene, previewPayload) : []),
    [previewScene, previewPayload],
  );

  function selectScene(scene: DisplayScene): void {
    setSelected(scene);
    setDraft(seedFrom(scene, sourcesRef.current));
    runner.clear();
  }

  function patch(key: string, value: string): void {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  // --- commands ------------------------------------------------------------

  async function loadPreview(): Promise<void> {
    if (draftMissing.length > 0) {
      runner.setError(`${sceneTitle(selected)} still needs: ${draftMissing.join(', ')}.`);
      return;
    }
    const result = await runner.run(
      () =>
        setPreviewScene({
          idempotencyKey: newIdempotencyKey('preview-set'),
          deviceId,
          scene: selected,
          payload: draftPayload,
        }),
      { success: `${sceneTitle(selected)} is in preview.` },
    );
    if (result.ok) void refreshDisplay();
  }

  async function take(): Promise<void> {
    if (!previewScene) {
      runner.setError('Nothing is loaded in preview.');
      return;
    }
    if (previewMissing.length > 0) {
      runner.setError(
        `Preview is incomplete — ${previewMissing.join(', ')}. Fix it before taking it to air.`,
      );
      return;
    }
    const result = await runner.run(
      () => takePreviewLive({ idempotencyKey: newIdempotencyKey('display-take'), deviceId }),
      { success: `${sceneTitle(previewScene)} is on air.` },
    );
    if (result.ok) void refreshDisplay();
  }

  async function dropPreview(): Promise<void> {
    const result = await runner.run(
      () =>
        clearPreviewScene({
          idempotencyKey: newIdempotencyKey('preview-clear'),
          deviceId,
        }),
      { success: 'Preview cleared.' },
    );
    if (result.ok) void refreshDisplay();
  }

  async function cutToAir(): Promise<void> {
    const result = await runner.run(
      () =>
        setDisplayScene({
          idempotencyKey: newIdempotencyKey('program-cut'),
          deviceId,
          scene: selected,
          payload: draftPayload,
        }),
      { success: `${sceneTitle(selected)} cut straight to air.` },
    );
    if (result.ok) {
      setConfirmCut(false);
      void refreshDisplay();
    }
  }

  async function goToHolding(): Promise<void> {
    const result = await runner.run(
      () =>
        setDisplayScene({
          idempotencyKey: newIdempotencyKey('program-holding'),
          deviceId,
          scene: 'holding',
          payload: {},
        }),
      { success: 'Holding screen is on air.' },
    );
    if (result.ok) void refreshDisplay();
  }

  // --- render --------------------------------------------------------------

  const descriptor = SCENE_BY_ID[selected];
  const programDetail = describePayload(programScene, programPayload);
  const previewDetail = describePayload(previewScene, previewPayload);
  const eventLive = snapshot?.event.status === 'live';

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Run the show"
        title="Display control"
        description="Preview on the left, program on the right. Nothing reaches the wall until you take it there."
        actions={
          <Toggle
            checked={monitorsOn}
            onCheckedChange={setMonitorsOn}
            label="Live monitors"
            description="Turn off on a weak connection."
          />
        }
      />

      {/* ---- Transmission bar: always visible, always usable ---- */}
      <div
        className={cn(
          'bg-surface-raised shadow-card ring-border-subtle sticky top-[3.75rem] z-20',
          'flex flex-wrap items-center justify-between gap-4 rounded-lg px-5 py-4 ring-1',
        )}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
          <div className="min-w-0">
            <p className="u-eyebrow text-live text-eyebrow flex items-center gap-2">
              <span aria-hidden className="animate-live-pulse" data-motion="loop">
                ●
              </span>
              On the wall now
            </p>
            <p className="u-display text-ink truncate text-[1.5rem] leading-tight">
              {sceneTitle(programScene)}
            </p>
            <p className="text-text-muted text-[0.75rem] leading-body break-words">
              {programDetail.length > 0 ? programDetail.join(' · ') : 'No payload'}
            </p>
          </div>

          <div className="min-w-0">
            <p className="u-eyebrow text-text-muted text-eyebrow">Lined up in preview</p>
            <p className="text-ink truncate text-[1.0625rem] font-semibold">
              {previewScene ? sceneTitle(previewScene) : 'Nothing'}
            </p>
            <p className="text-text-muted text-[0.75rem] leading-body break-words">
              {previewScene
                ? previewDetail.length > 0
                  ? previewDetail.join(' · ')
                  : 'No payload'
                : 'Load a scene below.'}
            </p>
          </div>
        </div>

        <ButtonRow align="end">
          <AdminButton
            variant="take"
            size="xl"
            busy={runner.pending}
            disabled={!previewScene || previewMissing.length > 0}
            onClick={() => void take()}
          >
            TAKE LIVE
          </AdminButton>
          <AdminButton
            variant="danger"
            size="lg"
            title="Cuts the safe holding screen to air immediately."
            onClick={() => void goToHolding()}
          >
            GO TO HOLDING
          </AdminButton>
        </ButtonRow>
      </div>

      {runner.status ? (
        <Callout tone={runner.status.tone === 'ok' ? 'success' : 'danger'}>
          {runner.status.message}
        </Callout>
      ) : null}

      {displayError ? (
        <Callout tone="warning" title="The display row could not be read">
          {displayError} What is printed above is the last state this console confirmed.
        </Callout>
      ) : null}

      {previewScene && previewMissing.length > 0 ? (
        <Callout tone="warning" title="Preview is not ready to go to air">
          {sceneTitle(previewScene)} is missing {previewMissing.join(', ')}. Re-load it below
          with the missing value filled in.
        </Callout>
      ) : null}

      {/* ---- Multiviewer ---- */}
      <Panel
        title="Multiviewer"
        description="Both outputs, live, at the real broadcast canvas of 1920 × 1080."
        actions={
          <AdminButton size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            Reload both
          </AdminButton>
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <Monitor
            label="preview"
            tone="preview"
            src="/tv/preview"
            reloadKey={reloadKey}
            enabled={monitorsOn}
            sceneLabel={previewScene ? sceneTitle(previewScene) : 'Nothing in preview'}
            detail={previewDetail}
          />
          <Monitor
            label="program"
            tone="program"
            src="/tv"
            reloadKey={reloadKey}
            enabled={monitorsOn}
            sceneLabel={sceneTitle(programScene)}
            detail={programDetail}
          />
        </div>
      </Panel>

      {/* ---- Scene picker and payload ---- */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
        <Panel
          title="Scenes"
          description="Nine scenes. Pick one, fill in what it needs, then load it into preview."
          flush
        >
          <ul className="divide-border-subtle divide-y">
            {SCENES.map((scene) => {
              const active = scene.scene === selected;
              const onAir = scene.scene === programScene;
              const inPreview = scene.scene === previewScene;

              return (
                <li key={scene.scene}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => selectScene(scene.scene)}
                    className={cn(
                      'flex w-full items-start gap-4 px-5 py-3.5 text-left',
                      'transition-colors duration-[var(--dur-instant)]',
                      active ? 'bg-aqua-100' : 'hover:bg-mist',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'u-tabular font-numeral mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-md text-[0.8125rem]',
                        onAir
                          ? 'bg-live text-white'
                          : active
                            ? 'bg-aqua-700 text-white'
                            : 'bg-mist text-text-secondary',
                      )}
                    >
                      {scene.cue}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-ink text-[0.9375rem] font-semibold">
                          {scene.title}
                        </span>
                        {onAir ? (
                          <StatusPill label="ON AIR" tone="live" size="sm" />
                        ) : null}
                        {inPreview ? (
                          <StatusPill label="IN PREVIEW" tone="neutral" size="sm" />
                        ) : null}
                        {active && !onAir && !inPreview ? (
                          <StatusPill label="SELECTED" tone="accent" size="sm" />
                        ) : null}
                      </span>
                      <span className="text-text-muted mt-0.5 block text-[0.75rem] leading-body">
                        {scene.purpose}
                      </span>
                      {scene.fields.length > 0 ? (
                        <span className="u-label text-text-muted mt-1.5 block text-[0.625rem]">
                          Needs:{' '}
                          {scene.fields
                            .map((f) => (f.required ? `${f.label}*` : f.label))
                            .join(' · ')}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Panel>

        <div className="space-y-6">
          <Panel
            tone="accent"
            eyebrow={`Cue ${descriptor.cue}`}
            title={descriptor.title}
            description={descriptor.purpose}
          >
            <div className="space-y-5">
              {descriptor.fields.length === 0 ? (
                <p className="text-text-secondary text-[0.8125rem] leading-body">
                  This scene takes no payload. Load it and take it.
                </p>
              ) : (
                descriptor.fields.map((field) => {
                  const id = `scene-field-${selected}-${field.key}`;
                  const value = draft[field.key] ?? '';
                  const missing =
                    Boolean(field.required) && value.trim() === '';

                  const hint = field.hint ?? undefined;
                  const error = missing ? 'This scene will not go to air without it.' : null;

                  if (field.kind === 'boolean') {
                    return (
                      <Toggle
                        key={field.key}
                        checked={value === 'true'}
                        onCheckedChange={(checked) =>
                          patch(field.key, checked ? 'true' : 'false')
                        }
                        label={field.label}
                        description={hint}
                      />
                    );
                  }

                  if (field.kind === 'number') {
                    return (
                      <Field key={field.key} label={field.label} htmlFor={id} hint={hint} error={error}>
                        <NumberInput
                          id={id}
                          value={value === '' ? null : Number(value)}
                          min={field.min}
                          max={field.max}
                          invalid={missing}
                          onValueChange={(next) =>
                            patch(field.key, next === null ? '' : String(next))
                          }
                        />
                      </Field>
                    );
                  }

                  if (field.kind === 'text') {
                    return (
                      <Field key={field.key} label={field.label} htmlFor={id} hint={hint} error={error}>
                        <TextInput
                          id={id}
                          value={value}
                          maxLength={160}
                          invalid={missing}
                          onChange={(event) => patch(field.key, event.target.value)}
                        />
                      </Field>
                    );
                  }

                  const options =
                    field.kind === 'challenge'
                      ? challengeOptions
                      : field.kind === 'round'
                        ? roundOptions
                        : field.kind === 'player'
                          ? playerOptions
                          : CEREMONY_CUES.map((cue) => ({
                              value: cue.phase,
                              label: `${cue.cue} — ${cue.title}`,
                            }));

                  return (
                    <Field
                      key={field.key}
                      label={field.label}
                      htmlFor={id}
                      hint={
                        field.kind === 'ceremonyPhase' && value
                          ? `TV renders phase “${resolveCeremonyPhase(value)}”. Drive the sequence from the Ceremony screen.`
                          : hint
                      }
                      error={error}
                    >
                      <SelectInput
                        id={id}
                        value={value}
                        invalid={missing}
                        onChange={(event) => patch(field.key, event.target.value)}
                      >
                        <option value="">
                          {field.required ? 'Choose one…' : 'None'}
                        </option>
                        {options.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                  );
                })
              )}

              {draftMissing.length > 0 ? (
                <Callout tone="warning" title="Not ready for preview">
                  Missing: {draftMissing.join(', ')}.
                </Callout>
              ) : null}

              <ButtonRow>
                <AdminButton
                  variant="primary"
                  busy={runner.pending}
                  disabled={draftMissing.length > 0}
                  onClick={() => void loadPreview()}
                >
                  Load into preview
                </AdminButton>
                <AdminButton
                  disabled={!previewScene || runner.pending}
                  onClick={() => void dropPreview()}
                >
                  Clear preview
                </AdminButton>
              </ButtonRow>

              <div className="border-border-subtle space-y-3 border-t pt-4">
                <SectionHeading hint="Skips preview entirely">Cut straight to air</SectionHeading>
                <p className="text-text-muted text-[0.75rem] leading-body">
                  The room sees this the instant you confirm it, with no chance to check it
                  first. Use TAKE LIVE unless something has gone wrong.
                </p>
                <AdminButton
                  variant="danger"
                  disabled={draftMissing.length > 0 || runner.pending}
                  onClick={() => setConfirmCut(true)}
                >
                  Cut {descriptor.title} to air
                </AdminButton>
              </div>
            </div>
          </Panel>

          <Panel title="Display state" description="Read straight from the display row.">
            <dl className="grid gap-4 sm:grid-cols-2">
              <div className="min-w-0 space-y-1">
                <dt className="u-label text-text-muted text-eyebrow">Program</dt>
                <dd className="text-ink text-[0.9375rem]">{sceneTitle(programScene)}</dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="u-label text-text-muted text-eyebrow">Preview</dt>
                <dd className="text-ink text-[0.9375rem]">
                  {previewScene ? sceneTitle(previewScene) : '—'}
                </dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="u-label text-text-muted text-eyebrow">Ceremony phase</dt>
                <dd className="text-ink text-[0.9375rem]">
                  {displayState?.ceremony_phase ?? 'Not started'}
                </dd>
              </div>
              <div className="min-w-0 space-y-1">
                <dt className="u-label text-text-muted text-eyebrow">Revision</dt>
                <dd className="u-tabular font-numeral text-ink text-[0.9375rem]">
                  {displayState?.revision ?? '—'}
                </dd>
              </div>
            </dl>

            <p className="text-text-muted mt-4 text-[0.75rem] leading-body">
              The closing sequence is driven from{' '}
              <Link href="/admin/ceremony" className="text-aqua-800 hover:text-aqua-900 underline underline-offset-2">
                Ceremony
              </Link>
              , which keeps the cues in order. Cutting ceremony phases from here can reveal the
              champion before the runner-up.
            </p>
          </Panel>
        </div>
      </div>

      <ConfirmDialog
        open={confirmCut}
        title={`Cut ${descriptor.title} straight to air?`}
        description={
          eventLive
            ? 'The event is LIVE. This replaces what the room is watching immediately, without a preview check.'
            : 'This replaces the program output immediately, without a preview check.'
        }
        confirmLabel="Cut to air"
        confirmWord="CUT"
        requireReason={false}
        busy={runner.pending}
        onCancel={() => setConfirmCut(false)}
        onConfirm={() => void cutToAir()}
      >
        <div className="ring-border-subtle rounded-md px-4 py-3 ring-1">
          <p className="u-label text-text-muted text-eyebrow">Going on air</p>
          <p className="text-ink text-[0.9375rem] font-semibold">{descriptor.title}</p>
          <p className="text-text-muted text-[0.75rem] leading-body">
            {describePayload(selected, draftPayload).join(' · ') || 'No payload'}
          </p>
          <p className="text-text-muted mt-2 text-[0.75rem] leading-body">
            Recorded in the audit log as <code>display.program_set</code>, against your name and
            this device, with the scene that was on air before it.
          </p>
        </div>
      </ConfirmDialog>
    </div>
  );
}
