'use client';

/**
 * Setup → Scoring profile.
 *
 * This is where the whole competition is tuned. Every point value the engine
 * ever reads lives in one `ScoringConfig` object, and every field of it is
 * editable here — nothing is hardcoded anywhere else in the product.
 *
 * Two things make this screen safe to use under pressure:
 *
 *  - Saving never edits the live profile in place. It publishes the next
 *    version, and every ledger row keeps the version that produced it, so
 *    re-tuning at 4pm can never rewrite what a player earned at 3pm.
 *  - Nothing is abstract. Each challenge shows the sentence its settings will
 *    read as, and the final-match goal mode shows a worked example in words,
 *    straight from `describeGoalMode()` in the scoring engine.
 */

import { useCallback, useMemo, useState } from 'react';

import { lockScoringProfile, unlockScoringProfile, updateScoringProfile } from '@/lib/actions';
import { describeGoalMode, formatClock } from '@/lib/scoring/engine';
import { useEventSnapshot } from '@/lib/hooks';
import { newIdempotencyKey, useDeviceId } from '@/lib/hooks/useDeviceId';
import type {
  CenterCircleConfig,
  ChallengeConfig,
  DribbleFinishConfig,
  FinalMatchConfig,
  GoalPointsMode,
  LongRangeConfig,
  MannequinTargetConfig,
  PenaltyConfig,
  ScoringConfig,
  TargetOption,
} from '@/lib/types';
import { StatusPill } from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  Callout,
  ColorInput,
  ConfirmDialog,
  Field,
  FieldGrid,
  KeyValue,
  NumberInput,
  PageHeader,
  Panel,
  SaveBar,
  SectionHeading,
  SegmentedControl,
  TextInput,
  Toggle,
} from '@/components/admin';

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

type ChallengeKey = '1' | '2' | '3' | '4' | '5';
const CHALLENGE_KEYS: ChallengeKey[] = ['1', '2', '3', '4', '5'];

function clone(config: ScoringConfig): ScoringConfig {
  return JSON.parse(JSON.stringify(config)) as ScoringConfig;
}

function same(a: ScoringConfig, b: ScoringConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Find the challenge slot that runs a given mechanic, narrowed to its shape. */
function slotFor<M extends ChallengeConfig['mechanic']>(
  config: ScoringConfig,
  mechanic: M,
): { key: ChallengeKey; value: Extract<ChallengeConfig, { mechanic: M }> } | null {
  for (const key of CHALLENGE_KEYS) {
    const value = config.challenges[key];
    if (value && value.mechanic === mechanic) {
      return { key, value: value as Extract<ChallengeConfig, { mechanic: M }> };
    }
  }
  return null;
}

function pts(n: number): string {
  return `${n} ${Math.abs(n) === 1 ? 'pt' : 'pts'}`;
}

function seconds(ms: number): string {
  const value = ms / 1000;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}s`;
}

function newOptionId(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 7)}`;
}

/** The sentence a challenge's settings read as, in the language of the brief. */
function summarise(config: ChallengeConfig, match: ScoringConfig['match']): string {
  switch (config.mechanic) {
    case 'mannequin_target': {
      const list = config.targets.map((t) => `${t.label} = ${pts(t.points)}`).join(', ');
      return `${config.attemptsPerPlayer} shots each. ${list}. A miss scores ${pts(config.missPoints)}.`;
    }
    case 'dribble_finish':
      return (
        `${config.attemptsPerPlayer} attempts each, players alternating. ` +
        `Dribble home in under ${seconds(config.dribbleThresholdMs)} = ${pts(config.dribbleBonusPoints)}, ` +
        `scoring = ${pts(config.goalPoints)}. Capped at ${pts(config.maxPointsPerAttempt)} per attempt.`
      );
    case 'long_range': {
      const list = config.zones.map((z) => `${z.label} = ${pts(z.points)}`).join(', ');
      return `${config.attemptsPerPlayer} shots each, taking turns. ${list}. A miss scores ${pts(config.missPoints)}.`;
    }
    case 'center_circle':
      return (
        `${config.ballsPerPlayer} balls per player against a ${seconds(config.timeLimitMs)} countdown. ` +
        `Every ball that lands in the circle = ${pts(config.pointsPerHit)}.`
      );
    case 'final_match':
      return (
        `${config.halves} halves of ${formatClock(config.halfDurationMs)} on a count-up clock. ` +
        `Goals: ${describeGoalMode(match.goalPointsMode, match).toLowerCase()}`
      );
  }
}

/** Everything the profile schema would reject, in words the operator can act on. */
function problemsWith(config: ScoringConfig): string[] {
  const problems: string[] = [];
  const whole = (n: number) => Number.isInteger(n);

  for (const key of CHALLENGE_KEYS) {
    const c = config.challenges[key];
    if (!c) {
      problems.push(`Challenge ${key} has no configuration.`);
      continue;
    }
    const where = `Challenge ${key}`;

    if (c.mechanic !== 'center_circle' && c.mechanic !== 'final_match') {
      if (!whole(c.attemptsPerPlayer) || c.attemptsPerPlayer < 1 || c.attemptsPerPlayer > 10) {
        problems.push(`${where}: attempts per player must be a whole number from 1 to 10.`);
      }
    }

    if (c.mechanic === 'mannequin_target' || c.mechanic === 'long_range') {
      const options = c.mechanic === 'mannequin_target' ? c.targets : c.zones;
      const noun = c.mechanic === 'mannequin_target' ? 'target' : 'zone';
      if (options.length === 0) problems.push(`${where}: at least one ${noun} is required.`);
      if (options.some((o) => o.label.trim() === '')) {
        problems.push(`${where}: every ${noun} needs a label — it is read out on the display.`);
      }
      const ids = new Set(options.map((o) => o.id));
      if (ids.size !== options.length) {
        problems.push(`${where}: two ${noun}s share an id.`);
      }
    }

    if (c.mechanic === 'dribble_finish' && (!whole(c.dribbleThresholdMs) || c.dribbleThresholdMs < 0)) {
      problems.push(`${where}: the dribble time must not be negative.`);
    }
    if (c.mechanic === 'center_circle') {
      if (!whole(c.ballsPerPlayer) || c.ballsPerPlayer < 1 || c.ballsPerPlayer > 10) {
        problems.push(`${where}: balls per player must be a whole number from 1 to 10.`);
      }
      if (c.timeLimitMs < 1000) problems.push(`${where}: the countdown must be at least 1 second.`);
    }
    if (c.mechanic === 'final_match') {
      if (!whole(c.halves) || c.halves < 1 || c.halves > 4) {
        problems.push(`${where}: the match must have between 1 and 4 halves.`);
      }
      if (c.halfDurationMs < 60_000) {
        problems.push(`${where}: a half must be at least 1 minute long.`);
      }
    }
  }

  const p: PenaltyConfig = config.penalties;
  if (!whole(p.openingAttempts) || p.openingAttempts < 1 || p.openingAttempts > 20) {
    problems.push('Penalties: the opening set must be a whole number from 1 to 20 kicks.');
  }

  return problems;
}

// ---------------------------------------------------------------------------
// A number field that tolerates an empty box mid-keystroke
// ---------------------------------------------------------------------------

function NumField({
  label,
  hint,
  value,
  onValueChange,
  suffix,
  disabled,
  min,
  max,
  step,
  className,
}: {
  label: string;
  hint?: string;
  value: number;
  onValueChange: (value: number) => void;
  suffix?: string;
  disabled?: boolean;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  // An empty box is a keystroke, not a value: zero is a legitimate point
  // value, so "cleared while typing" is tracked separately and restored on blur
  // rather than being written into the profile as 0.
  const [cleared, setCleared] = useState(false);

  return (
    <Field label={label} hint={hint} className={className}>
      <NumberInput
        value={cleared ? null : value}
        suffix={suffix}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        onValueChange={(next) => {
          if (next === null) {
            setCleared(true);
            return;
          }
          setCleared(false);
          onValueChange(next);
        }}
        onBlur={() => setCleared(false)}
      />
    </Field>
  );
}

// ---------------------------------------------------------------------------
// Target / zone editor, shared by challenges 1 and 3
// ---------------------------------------------------------------------------

function OptionRows({
  noun,
  options,
  onChange,
  withColour = false,
  disabled = false,
}: {
  noun: string;
  options: TargetOption[];
  onChange: (next: TargetOption[]) => void;
  withColour?: boolean;
  disabled?: boolean;
}) {
  const patch = (index: number, next: Partial<TargetOption>) => {
    onChange(options.map((o, i) => (i === index ? { ...o, ...next } : o)));
  };

  return (
    <div className="space-y-4">
      {options.map((option, index) => (
        <div
          key={option.id}
          className="ring-border-subtle bg-surface grid items-start gap-4 rounded-md p-4 ring-1 sm:grid-cols-[minmax(0,1fr)_8rem]"
        >
          <Field
            label={`${noun} ${index + 1}`}
            hint={`id: ${option.id} — recorded attempts point at this id, so keep it once shots exist.`}
          >
            <TextInput
              value={option.label}
              disabled={disabled}
              onChange={(event) => patch(index, { label: event.target.value })}
            />
          </Field>

          <NumField
            label="Points"
            value={option.points}
            disabled={disabled}
            suffix="PTS"
            onValueChange={(points) => patch(index, { points })}
          />

          {withColour ? (
            <Field label="Zone colour" hint="Used on the display and the scoring controller.">
              <ColorInput
                value={option.color ?? '#90c6cb'}
                disabled={disabled}
                aria-label={`${option.label} colour`}
                onValueChange={(color) => patch(index, { color })}
              />
            </Field>
          ) : null}

          <div className="sm:col-span-2">
            <AdminButton
              size="sm"
              variant="ghost"
              disabled={disabled || options.length <= 1}
              onClick={() => onChange(options.filter((_, i) => i !== index))}
            >
              Remove {noun.toLowerCase()}
            </AdminButton>
          </div>
        </div>
      ))}

      <AdminButton
        size="sm"
        disabled={disabled}
        onClick={() =>
          onChange([
            ...options,
            {
              id: newOptionId(noun.slice(0, 1).toLowerCase()),
              label: `NEW ${noun.toUpperCase()}`,
              points: 0,
              ...(withColour ? { color: '#90c6cb' } : {}),
            },
          ])
        }
      >
        Add {noun.toLowerCase()}
      </AdminButton>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const GOAL_MODES: Array<{
  mode: GoalPointsMode;
  title: string;
  blurb: string;
}> = [
  {
    mode: 'team_share',
    title: 'Team share',
    blurb:
      'Every player on the scoring team is credited with the same points, whoever put the ball in. The final match rewards the team, not the finisher.',
  },
  {
    mode: 'scorer_only',
    title: 'Scorer only',
    blurb:
      'Only the player credited with the goal receives points. The individual leaderboard can swing hard on one strike.',
  },
  {
    mode: 'scorer_plus_team',
    title: 'Scorer plus team',
    blurb:
      'The scorer takes the full amount and every teammate takes a smaller share. The finisher is rewarded without the rest of the five going unrewarded.',
  },
];

export default function ScoringProfilePage() {
  const { snapshot, loading, error, refresh } = useEventSnapshot();
  const deviceId = useDeviceId();

  const profile = snapshot?.scoringProfile ?? null;
  const version = profile?.version ?? null;
  const isLocked = profile?.is_locked ?? false;

  /**
   * The working copy, tagged with the profile version it was seeded from.
   *
   * Holding the version alongside the draft means a newer version published
   * elsewhere simply supersedes it — the screen falls back to the server's
   * config rather than silently editing on top of numbers that no longer exist.
   */
  const [edited, setEdited] = useState<{
    version: number;
    config: ScoringConfig;
    baseline: ScoringConfig;
  } | null>(null);

  const working = useMemo(() => {
    if (!profile) return null;
    if (edited && edited.version >= profile.version) return edited;
    return { version: profile.version, config: profile.config, baseline: profile.config };
  }, [profile, edited]);

  const draft = working?.config ?? null;
  const baseline = working?.baseline ?? null;

  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<
    { tone: 'ok' | 'error'; message: string; at: number } | null
  >(null);
  const [dialog, setDialog] = useState<'lock' | 'unlock' | null>(null);
  const [dialogError, setDialogError] = useState<string | null>(null);

  const say = useCallback((tone: 'ok' | 'error', message: string) => {
    setStatus({ tone, message, at: Date.now() });
  }, []);

  const edit = useCallback(
    (mutate: (next: ScoringConfig) => void) => {
      if (!working) return;
      const next = clone(working.config);
      mutate(next);
      setEdited({ version: working.version, config: next, baseline: working.baseline });
    },
    [working],
  );

  const setChallenge = useCallback(
    (key: ChallengeKey, value: ChallengeConfig) => {
      edit((next) => {
        next.challenges[key] = value;
      });
    },
    [edit],
  );

  const problems = useMemo(() => (draft ? problemsWith(draft) : []), [draft]);
  const dirty = Boolean(draft && baseline && !same(draft, baseline));

  const teamSize = useMemo(() => {
    const teamA = snapshot?.teamsByCode.A;
    if (!snapshot || !teamA) return 5;
    const count = snapshot.players.filter((p) => p.team_id === teamA.id).length;
    return count > 0 ? count : 5;
  }, [snapshot]);

  async function save(): Promise<void> {
    if (!draft) return;
    if (problems.length > 0) {
      say('error', 'Fix the listed problems before publishing a new version.');
      return;
    }
    setPending(true);
    setStatus(null);
    try {
      const result = await updateScoringProfile({
        idempotencyKey: newIdempotencyKey('scoring'),
        deviceId,
        config: draft,
      });
      if (!result.ok) {
        say('error', result.error);
        return;
      }
      setEdited({
        version: result.data.version,
        config: clone(result.data.config),
        baseline: clone(result.data.config),
      });
      say('ok', `Published version ${result.data.version}. Earlier points keep their old version.`);
      await refresh();
    } catch (cause) {
      say('error', cause instanceof Error ? cause.message : 'The profile did not save.');
    } finally {
      setPending(false);
    }
  }

  async function runLock(): Promise<void> {
    setPending(true);
    setDialogError(null);
    try {
      const result = await lockScoringProfile({
        idempotencyKey: newIdempotencyKey('scoring-lock'),
        deviceId,
      });
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      setDialog(null);
      say('ok', `Version ${result.data.version} is locked for the live event.`);
      await refresh();
    } finally {
      setPending(false);
    }
  }

  async function runUnlock(): Promise<void> {
    setPending(true);
    setDialogError(null);
    try {
      const result = await unlockScoringProfile({
        idempotencyKey: newIdempotencyKey('scoring-unlock'),
        deviceId,
      });
      if (!result.ok) {
        setDialogError(result.error);
        return;
      }
      setDialog(null);
      say('ok', 'The profile is unlocked. Every change from here is a new version.');
      await refresh();
    } finally {
      setPending(false);
    }
  }

  // --- loading / failure states -------------------------------------------

  if (!draft || !profile) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Scoring profile" />
        {loading ? (
          <Panel>
            <p className="text-text-muted text-[0.875rem]">Reading the scoring profile…</p>
          </Panel>
        ) : (
          <Callout tone="danger" title="The scoring profile could not be read">
            {error ??
              'No profile came back for this event. Run supabase/migrations/0002_seed_event.sql.'}
          </Callout>
        )}
      </div>
    );
  }

  const c1 = slotFor(draft, 'mannequin_target');
  const c2 = slotFor(draft, 'dribble_finish');
  const c3 = slotFor(draft, 'long_range');
  const c4 = slotFor(draft, 'center_circle');
  const c5 = slotFor(draft, 'final_match');
  const match = draft.match;
  const disabled = isLocked || pending;

  const workedExample = ((): string => {
    const others = Math.max(0, teamSize - 1);
    switch (match.goalPointsMode) {
      case 'team_share':
        return `One goal → all ${teamSize} players on the scoring team receive ${pts(
          match.teamShare.pointsPerPlayer,
        )} each, ${pts(match.teamShare.pointsPerPlayer * teamSize)} across the side.`;
      case 'scorer_only':
        return `One goal → the scorer receives ${pts(
          match.scorerOnly.scorerPoints,
        )}. The other ${others} players receive nothing.`;
      case 'scorer_plus_team':
        return `One goal → the scorer receives ${pts(
          match.scorerPlusTeam.scorerPoints,
        )} and each of the other ${others} receives ${pts(
          match.scorerPlusTeam.teammatePoints,
        )}, ${pts(
          match.scorerPlusTeam.scorerPoints + others * match.scorerPlusTeam.teammatePoints,
        )} across the side.`;
    }
  })();

  return (
    <div className="space-y-6 pb-4">
      <PageHeader
        eyebrow="Setup"
        title="Scoring profile"
        description="Every point value in the competition, in one place. Saving publishes a new version — points already awarded keep the version that produced them."
        actions={
          <div className="flex items-center gap-2">
            <StatusPill label={`VERSION ${version}`} tone="neutral" size="sm" glyph={false} />
            <StatusPill
              label={isLocked ? 'LOCKED' : 'EDITABLE'}
              tone={isLocked ? 'winner' : 'draw'}
              size="sm"
            />
          </div>
        }
      />

      {error ? (
        <Callout tone="warning" title="Showing the last good read">
          {error}
        </Callout>
      ) : null}

      {isLocked ? (
        <Callout
          tone="warning"
          title="The profile is locked for the live event"
          actions={
            <AdminButton size="sm" variant="danger" onClick={() => setDialog('unlock')}>
              Unlock
            </AdminButton>
          }
        >
          Nothing on this screen can be changed while it is locked. Unlocking mid-show changes the
          maths the room is watching, so it asks for a written reason first.
        </Callout>
      ) : null}

      {/* ------------------------------------------------------------------ */}
      {/* The final match goal mode — the single most consequential setting.  */}
      {/* ------------------------------------------------------------------ */}
      <Panel
        eyebrow="Challenge 5 · the decision that shapes the leaderboard"
        title="How a goal in the final match becomes points"
        tone="accent"
        description="Three models, one active. Pick the one the commentary team will explain, then set its values — the sentence underneath is exactly what a goal will award."
      >
        <div className="space-y-4">
          {GOAL_MODES.map((option) => {
            const active = match.goalPointsMode === option.mode;
            return (
              <div
                key={option.mode}
                className={
                  active
                    ? 'ring-aqua-600 bg-aqua-50 rounded-md p-4 ring-2'
                    : 'ring-border-subtle rounded-md p-4 ring-1'
                }
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <label className="flex min-w-0 items-start gap-3">
                    <input
                      type="radio"
                      name="goal-points-mode"
                      className="accent-aqua-700 mt-1 size-4 shrink-0"
                      checked={active}
                      disabled={disabled}
                      onChange={() =>
                        edit((next) => {
                          next.match.goalPointsMode = option.mode;
                        })
                      }
                    />
                    <span className="min-w-0">
                      <span className="text-ink block text-[0.9375rem] font-semibold">
                        {option.title}
                      </span>
                      <span className="text-text-secondary block text-[0.8125rem] leading-body">
                        {option.blurb}
                      </span>
                    </span>
                  </label>
                  {active ? <StatusPill label="ACTIVE" tone="accent" size="sm" /> : null}
                </div>

                <div className="mt-4 pl-7">
                  {option.mode === 'team_share' ? (
                    <FieldGrid columns={2}>
                      <NumField
                        label="Points per player on the scoring team"
                        value={match.teamShare.pointsPerPlayer}
                        suffix="PTS"
                        disabled={disabled}
                        onValueChange={(value) =>
                          edit((next) => {
                            next.match.teamShare.pointsPerPlayer = value;
                          })
                        }
                      />
                    </FieldGrid>
                  ) : null}

                  {option.mode === 'scorer_only' ? (
                    <FieldGrid columns={2}>
                      <NumField
                        label="Points for the scorer"
                        value={match.scorerOnly.scorerPoints}
                        suffix="PTS"
                        disabled={disabled}
                        onValueChange={(value) =>
                          edit((next) => {
                            next.match.scorerOnly.scorerPoints = value;
                          })
                        }
                      />
                    </FieldGrid>
                  ) : null}

                  {option.mode === 'scorer_plus_team' ? (
                    <FieldGrid columns={2}>
                      <NumField
                        label="Points for the scorer"
                        value={match.scorerPlusTeam.scorerPoints}
                        suffix="PTS"
                        disabled={disabled}
                        onValueChange={(value) =>
                          edit((next) => {
                            next.match.scorerPlusTeam.scorerPoints = value;
                          })
                        }
                      />
                      <NumField
                        label="Points for each teammate"
                        value={match.scorerPlusTeam.teammatePoints}
                        suffix="PTS"
                        disabled={disabled}
                        onValueChange={(value) =>
                          edit((next) => {
                            next.match.scorerPlusTeam.teammatePoints = value;
                          })
                        }
                      />
                    </FieldGrid>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-surface-accent ring-aqua-300 mt-5 space-y-2 rounded-md px-4 py-4 ring-1">
          <p className="u-eyebrow text-aqua-800 text-eyebrow">What a goal will award</p>
          <p className="text-navy text-[1rem] leading-body font-semibold">
            {describeGoalMode(match.goalPointsMode, match)}
          </p>
          <p className="text-navy-soft text-[0.8125rem] leading-body">{workedExample}</p>
          <p className="text-navy-soft text-[0.8125rem] leading-body">
            {match.ownGoal.creditBenefitingTeam
              ? 'An own goal is credited to the team that benefits'
              : 'An own goal is not credited to either team'}
            {match.ownGoal.scorerGetsPoints
              ? ', and the player who put it in still receives the scorer’s points.'
              : ', and the player who put it in receives nothing.'}
          </p>
        </div>

        <div className="border-border-subtle mt-5 space-y-4 border-t pt-5">
          <SectionHeading hint="Applies to every mode above">Own goals and the win bonus</SectionHeading>
          <FieldGrid columns={2}>
            <Toggle
              label="Credit the goal to the benefiting team"
              description="The scoreline always moves; this decides whether the benefiting team's players are awarded goal points for it."
              checked={match.ownGoal.creditBenefitingTeam}
              disabled={disabled}
              onCheckedChange={(checked) =>
                edit((next) => {
                  next.match.ownGoal.creditBenefitingTeam = checked;
                })
              }
            />
            <Toggle
              label="The player who scored the own goal still gets the scorer's points"
              description="Off is the normal setting — an own goal should not reward the finisher."
              checked={match.ownGoal.scorerGetsPoints}
              disabled={disabled}
              onCheckedChange={(checked) =>
                edit((next) => {
                  next.match.ownGoal.scorerGetsPoints = checked;
                })
              }
            />
            <NumField
              label="Match win bonus"
              hint="Awarded to each player on the winning side when the final match ends."
              value={match.winBonus}
              suffix="PTS"
              disabled={disabled}
              onValueChange={(value) =>
                edit((next) => {
                  next.match.winBonus = value;
                })
              }
            />
          </FieldGrid>
        </div>
      </Panel>

      {/* ---------------------------- Challenge 1 -------------------------- */}
      {c1 ? (
        <Panel
          eyebrow={`Challenge ${c1.key}`}
          title="Mannequin target"
          description="Three shots each at the mannequins. Each target is worth what you set here."
        >
          <div className="space-y-5">
            <FieldGrid columns={2}>
              <NumField
                label="Shots per player"
                value={c1.value.attemptsPerPlayer}
                suffix="SHOTS"
                min={1}
                max={10}
                step={1}
                disabled={disabled}
                onValueChange={(value) =>
                  setChallenge(c1.key, { ...c1.value, attemptsPerPlayer: value } as MannequinTargetConfig)
                }
              />
              <NumField
                label="Points for a miss"
                hint="Usually 0. A negative value is allowed if a miss should cost."
                value={c1.value.missPoints}
                suffix="PTS"
                disabled={disabled}
                onValueChange={(value) =>
                  setChallenge(c1.key, { ...c1.value, missPoints: value } as MannequinTargetConfig)
                }
              />
            </FieldGrid>

            <SectionHeading hint="Shown on the controller in this order">Targets</SectionHeading>
            <OptionRows
              noun="Target"
              options={c1.value.targets}
              disabled={disabled}
              onChange={(targets) =>
                setChallenge(c1.key, { ...c1.value, targets } as MannequinTargetConfig)
              }
            />
          </div>
        </Panel>
      ) : null}

      {/* ---------------------------- Challenge 2 -------------------------- */}
      {c2 ? (
        <Panel
          eyebrow={`Challenge ${c2.key}`}
          title="Dribble & finish"
          description="A speed bonus and a goal bonus, added together and capped."
        >
          <FieldGrid columns={3}>
            <NumField
              label="Attempts per player"
              value={c2.value.attemptsPerPlayer}
              suffix="TRIES"
              min={1}
              max={10}
              step={1}
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c2.key, { ...c2.value, attemptsPerPlayer: value } as DribbleFinishConfig)
              }
            />
            <NumField
              label="Dribble time to beat"
              hint={`Currently ${c2.value.dribbleThresholdMs} ms. Under this time earns the bonus.`}
              value={c2.value.dribbleThresholdMs / 1000}
              suffix="SEC"
              min={0}
              step={0.1}
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c2.key, {
                  ...c2.value,
                  dribbleThresholdMs: Math.round(value * 1000),
                } as DribbleFinishConfig)
              }
            />
            <NumField
              label="Dribble bonus"
              value={c2.value.dribbleBonusPoints}
              suffix="PTS"
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c2.key, { ...c2.value, dribbleBonusPoints: value } as DribbleFinishConfig)
              }
            />
            <NumField
              label="Points for scoring"
              value={c2.value.goalPoints}
              suffix="PTS"
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c2.key, { ...c2.value, goalPoints: value } as DribbleFinishConfig)
              }
            />
            <NumField
              label="Maximum per attempt"
              hint="The two bonuses are added, then clamped to this."
              value={c2.value.maxPointsPerAttempt}
              suffix="PTS"
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c2.key, { ...c2.value, maxPointsPerAttempt: value } as DribbleFinishConfig)
              }
            />
          </FieldGrid>

          {c2.value.dribbleBonusPoints + c2.value.goalPoints > c2.value.maxPointsPerAttempt ? (
            <Callout tone="info" className="mt-4">
              A perfect attempt would earn{' '}
              {pts(c2.value.dribbleBonusPoints + c2.value.goalPoints)} but the cap holds it at{' '}
              {pts(c2.value.maxPointsPerAttempt)}. That is legal — just make sure it is what you mean.
            </Callout>
          ) : null}
        </Panel>
      ) : null}

      {/* ---------------------------- Challenge 3 -------------------------- */}
      {c3 ? (
        <Panel
          eyebrow={`Challenge ${c3.key}`}
          title="Long-range shooting"
          description="The target board, zone by zone. Colours here drive the controller and the display."
        >
          <div className="space-y-5">
            <FieldGrid columns={2}>
              <NumField
                label="Shots per player"
                value={c3.value.attemptsPerPlayer}
                suffix="SHOTS"
                min={1}
                max={10}
                step={1}
                disabled={disabled}
                onValueChange={(value) =>
                  setChallenge(c3.key, { ...c3.value, attemptsPerPlayer: value } as LongRangeConfig)
                }
              />
              <NumField
                label="Points for a miss"
                value={c3.value.missPoints}
                suffix="PTS"
                disabled={disabled}
                onValueChange={(value) =>
                  setChallenge(c3.key, { ...c3.value, missPoints: value } as LongRangeConfig)
                }
              />
            </FieldGrid>

            <SectionHeading hint="Highest value first reads best on the controller">
              Zones
            </SectionHeading>
            <OptionRows
              noun="Zone"
              options={c3.value.zones}
              withColour
              disabled={disabled}
              onChange={(zones) => setChallenge(c3.key, { ...c3.value, zones } as LongRangeConfig)}
            />
          </div>
        </Panel>
      ) : null}

      {/* ---------------------------- Challenge 4 -------------------------- */}
      {c4 ? (
        <Panel
          eyebrow={`Challenge ${c4.key}`}
          title="Centre circle accuracy"
          description="A fixed number of balls against a countdown, one point per ball that lands."
        >
          <FieldGrid columns={3}>
            <NumField
              label="Balls per player"
              value={c4.value.ballsPerPlayer}
              suffix="BALLS"
              min={1}
              max={10}
              step={1}
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c4.key, { ...c4.value, ballsPerPlayer: value } as CenterCircleConfig)
              }
            />
            <NumField
              label="Countdown per player"
              hint={`Currently ${c4.value.timeLimitMs} ms — the clock the display counts down.`}
              value={c4.value.timeLimitMs / 1000}
              suffix="SEC"
              min={1}
              step={1}
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c4.key, {
                  ...c4.value,
                  timeLimitMs: Math.round(value * 1000),
                } as CenterCircleConfig)
              }
            />
            <NumField
              label="Points per ball in the circle"
              value={c4.value.pointsPerHit}
              suffix="PTS"
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c4.key, { ...c4.value, pointsPerHit: value } as CenterCircleConfig)
              }
            />
          </FieldGrid>
        </Panel>
      ) : null}

      {/* ---------------------------- Challenge 5 -------------------------- */}
      {c5 ? (
        <Panel
          eyebrow={`Challenge ${c5.key}`}
          title="Final match — clock"
          description="The count-up clock the match is played on. Goal points are set at the top of this screen."
        >
          <FieldGrid columns={2}>
            <NumField
              label="Halves"
              value={c5.value.halves}
              suffix="HALVES"
              min={1}
              max={4}
              step={1}
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c5.key, { ...c5.value, halves: value } as FinalMatchConfig)
              }
            />
            <NumField
              label="Length of a half"
              hint={`The clock runs 00:00 → ${formatClock(c5.value.halfDurationMs)}, halftime, then on to ${formatClock(
                c5.value.halfDurationMs * c5.value.halves,
              )}.`}
              value={c5.value.halfDurationMs / 60_000}
              suffix="MIN"
              min={1}
              step={1}
              disabled={disabled}
              onValueChange={(value) =>
                setChallenge(c5.key, {
                  ...c5.value,
                  halfDurationMs: Math.round(value * 60_000),
                } as FinalMatchConfig)
              }
            />
          </FieldGrid>
        </Panel>
      ) : null}

      {/* ------------------------------ Bonuses ---------------------------- */}
      <Panel
        eyebrow="Across every challenge"
        title="Round and challenge bonuses"
        description="Paid on top of the points a player actually scored, when a round or a challenge is published."
      >
        <FieldGrid columns={3}>
          <NumField
            label="Round win bonus"
            hint="To the winner of a single 1v1 round."
            value={draft.bonuses.roundWinBonus}
            suffix="PTS"
            disabled={disabled}
            onValueChange={(value) =>
              edit((next) => {
                next.bonuses.roundWinBonus = value;
              })
            }
          />
          <NumField
            label="Round draw points"
            hint="To both players when a round finishes level."
            value={draft.bonuses.roundDrawPoints}
            suffix="PTS"
            disabled={disabled}
            onValueChange={(value) =>
              edit((next) => {
                next.bonuses.roundDrawPoints = value;
              })
            }
          />
          <NumField
            label="Challenge win bonus"
            hint="To every player on the side that wins the challenge."
            value={draft.bonuses.challengeWinBonus}
            suffix="PTS"
            disabled={disabled}
            onValueChange={(value) =>
              edit((next) => {
                next.bonuses.challengeWinBonus = value;
              })
            }
          />
        </FieldGrid>
      </Panel>

      {/* ----------------------------- Penalties --------------------------- */}
      <Panel
        eyebrow="Tie-break"
        title="Penalty shootout"
        description="Penalty points are kept apart from regular points — they break a tie, they never inflate a total."
      >
        <div className="space-y-5">
          <Field
            label="When a shootout is used"
            hint="The brief calls for the final match only; every draw is available for a shorter format."
          >
            <SegmentedControl
              ariaLabel="When a shootout is used"
              value={draft.penalties.enabledFor}
              disabled={disabled}
              onValueChange={(value) =>
                edit((next) => {
                  next.penalties.enabledFor = value;
                })
              }
              options={[
                { value: 'final_match_only', label: 'Final match only' },
                { value: 'every_draw', label: 'Every draw' },
                { value: 'disabled', label: 'Never' },
              ]}
            />
          </Field>

          <FieldGrid columns={3}>
            <NumField
              label="Kicks in the opening set"
              value={draft.penalties.openingAttempts}
              suffix="KICKS"
              min={1}
              max={20}
              step={1}
              disabled={disabled}
              onValueChange={(value) =>
                edit((next) => {
                  next.penalties.openingAttempts = value;
                })
              }
            />
            <NumField
              label="Points per scored kick"
              hint="Recorded as penalty tie-break points, not regular points."
              value={draft.penalties.pointsPerScoredAttempt}
              suffix="PTS"
              disabled={disabled}
              onValueChange={(value) =>
                edit((next) => {
                  next.penalties.pointsPerScoredAttempt = value;
                })
              }
            />
            <NumField
              label="Points for winning the shootout"
              value={draft.penalties.winnerPoints}
              suffix="PTS"
              disabled={disabled}
              onValueChange={(value) =>
                edit((next) => {
                  next.penalties.winnerPoints = value;
                })
              }
            />
          </FieldGrid>

          <Toggle
            label="Sudden death after the opening set"
            description="Only reached when the opening sets finish level. A set won 3–2 is a regulation result, never sudden death."
            checked={draft.penalties.suddenDeath}
            disabled={disabled}
            onCheckedChange={(checked) =>
              edit((next) => {
                next.penalties.suddenDeath = checked;
              })
            }
          />
        </div>
      </Panel>

      {/* ------------------------------ Ranking ---------------------------- */}
      <Panel
        eyebrow="The leaderboard"
        title="How players are ranked"
        description="One primary measure, then the tie-breakers, then the display rule for equal players."
      >
        <div className="space-y-5">
          <FieldGrid columns={2}>
            <KeyValue
              label="Primary measure"
              value="Regular points — every confirmed ledger entry except penalty tie-break points"
            />
            <KeyValue
              label="Profile version in force"
              value={`v${version}${isLocked ? ' · locked' : ''}`}
              mono
            />
          </FieldGrid>

          <Toggle
            label="Use penalty tie-break points to separate equal players"
            description="Off means two players level on regular points stay level, and the shootout decides nothing individually."
            checked={draft.ranking.tiebreakers.includes('penalty_tiebreak_points')}
            disabled={disabled}
            onCheckedChange={(checked) =>
              edit((next) => {
                next.ranking.tiebreakers = checked ? ['penalty_tiebreak_points'] : [];
              })
            }
          />

          <Toggle
            label="Players who remain level share a rank"
            description="On gives 1, 2, 2, 4 — so “top five” always means the top five positions. Off ranks them by name order instead."
            checked={draft.ranking.sharedRankOnTie}
            disabled={disabled}
            onCheckedChange={(checked) =>
              edit((next) => {
                next.ranking.sharedRankOnTie = checked;
              })
            }
          />
        </div>
      </Panel>

      {/* ------------------------------ Preview ---------------------------- */}
      <Panel
        eyebrow="Preview"
        title="How each challenge will read"
        description="The sentence your settings produce, challenge by challenge. This is what the briefing sheet and the commentary will say."
        flush
      >
        <ul className="divide-border-subtle divide-y">
          {CHALLENGE_KEYS.map((key) => {
            const config = draft.challenges[key];
            if (!config) return null;
            return (
              <li key={key} className="space-y-1.5 px-5 py-4">
                <p className="u-label text-aqua-800 text-eyebrow">Challenge {key}</p>
                <p className="text-ink text-[0.9375rem] leading-body">
                  {summarise(config, draft.match)}
                </p>
              </li>
            );
          })}
          <li className="space-y-1.5 px-5 py-4">
            <p className="u-label text-aqua-800 text-eyebrow">Bonuses and tie-breaks</p>
            <p className="text-ink text-[0.9375rem] leading-body">
              {`A round win is worth ${pts(draft.bonuses.roundWinBonus)}, a drawn round ${pts(
                draft.bonuses.roundDrawPoints,
              )} to each player, and winning a challenge ${pts(
                draft.bonuses.challengeWinBonus,
              )} to each player on that side. `}
              {draft.penalties.enabledFor === 'disabled'
                ? 'No shootout is used.'
                : `A shootout of ${draft.penalties.openingAttempts} kicks a side${
                    draft.penalties.suddenDeath ? ', then sudden death,' : ''
                  } is used ${
                    draft.penalties.enabledFor === 'every_draw'
                      ? 'for every draw'
                      : 'for the final match only'
                  }; each scored kick is ${pts(
                    draft.penalties.pointsPerScoredAttempt,
                  )} and winning it ${pts(draft.penalties.winnerPoints)} of tie-break credit.`}
            </p>
          </li>
        </ul>
      </Panel>

      {/* -------------------------- Review and lock ------------------------ */}
      <Panel
        eyebrow="Review and lock"
        title="Freeze the profile for the live event"
        tone="accent"
        description="Lock once the numbers are agreed. While locked, no version can be published — the maths the room sees cannot move under it. Unlocking is possible, and asks for a written reason."
      >
        {problems.length > 0 ? (
          <Callout
            tone="danger"
            title={`${problems.length} problem${problems.length === 1 ? '' : 's'} to fix first`}
            className="mb-4"
          >
            <ul className="list-disc space-y-1 pl-4">
              {problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </Callout>
        ) : null}

        <FieldGrid columns={3} className="mb-5">
          <KeyValue label="Current version" value={`v${version}`} mono />
          <KeyValue label="State" value={isLocked ? 'Locked' : 'Editable'} />
          <KeyValue
            label="Locked at"
            value={profile.locked_at ? new Date(profile.locked_at).toLocaleString() : '—'}
          />
        </FieldGrid>

        <ButtonRow>
          <AdminButton
            variant="primary"
            size="lg"
            disabled={isLocked || pending || dirty || problems.length > 0}
            onClick={() => {
              setDialogError(null);
              setDialog('lock');
            }}
          >
            Lock version {version}
          </AdminButton>

          {isLocked ? (
            <AdminButton
              variant="danger"
              disabled={pending}
              onClick={() => {
                setDialogError(null);
                setDialog('unlock');
              }}
            >
              Unlock the profile
            </AdminButton>
          ) : null}
        </ButtonRow>

        {dirty && !isLocked ? (
          <p className="text-draw mt-3 text-[0.8125rem]">
            <span aria-hidden>▲ </span>
            Publish your changes first — locking freezes the saved version, not the draft on screen.
          </p>
        ) : null}
      </Panel>

      <SaveBar
        dirty={dirty}
        pending={pending}
        status={status}
        onSave={() => void save()}
        onReset={() => setEdited(null)}
        saveLabel="Publish new version"
        blockedReason={
          isLocked
            ? 'The profile is locked. Unlock it before changing point values.'
            : problems.length > 0
              ? `${problems.length} problem${problems.length === 1 ? '' : 's'} to fix before publishing.`
              : null
        }
      />

      <ConfirmDialog
        open={dialog === 'lock'}
        title={`Lock scoring profile v${version}?`}
        description="Every point value on this screen is frozen for the live event. The scoring engine keeps reading this version until somebody unlocks it and publishes another."
        confirmLabel="Lock the profile"
        confirmWord="LOCK"
        requireReason={false}
        busy={pending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={() => void runLock()}
      />

      <ConfirmDialog
        open={dialog === 'unlock'}
        title="Unlock the scoring profile?"
        description="Unlocking lets a new version be published mid-event. Points already awarded keep the version that produced them, but everything scored from here uses whatever you publish next."
        confirmLabel="Unlock the profile"
        confirmWord="UNLOCK"
        requireReason
        reasonLabel="Why is the profile being unlocked?"
        reasonPlaceholder="e.g. Challenge 3 zone values agreed with the organisers at 16:40."
        busy={pending}
        error={dialogError}
        onCancel={() => setDialog(null)}
        onConfirm={() => void runUnlock()}
      />
    </div>
  );
}
