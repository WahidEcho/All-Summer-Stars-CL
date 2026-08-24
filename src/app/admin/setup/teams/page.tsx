'use client';

/**
 * Setup → Teams.
 *
 * Two teams, and the handful of things about them that every other surface
 * inherits: the names on the score strip, the kit colour that becomes the
 * accent on ten different components, and the crest.
 *
 * The colour is the part worth being careful about. A kit colour chosen on a
 * laptop can be unreadable once type is placed on it, so this screen shows the
 * accent doing its real jobs — as a solid plate, as a pale wash, and inside the
 * actual score strip — and states the measured contrast ratio in words.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { EVENT_SLUG } from '@/lib/event';
import { getTeams, requireEvent } from '@/lib/data/queries';
import { supabase } from '@/lib/supabase/client';
import { updateTeam } from '@/lib/actions';
import { newIdempotencyKey, useDeviceId } from '@/lib/hooks';
import type { TeamRow } from '@/lib/types';
import { luminance, readableOn, StatusPill, TeamScoreStrip, teamAccentVars } from '@/components/ui';
import {
  Callout,
  ColorInput,
  Field,
  FieldGrid,
  PageHeader,
  Panel,
  SaveBar,
  SectionHeading,
  TextInput,
  UploadField,
  useActionRunner,
} from '@/components/admin';

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------

const HEX = /^#[0-9a-fA-F]{6}$/;
const WHITE = '#FFFFFF';

/** WCAG contrast ratio between two hex colours, 1–21. */
function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

interface ContrastVerdict {
  /** The text colour a card would actually pick. */
  ink: string;
  inkLabel: string;
  ratio: number;
  /** 'body' — fine everywhere. 'large' — headlines only. 'fail' — unusable. */
  level: 'body' | 'large' | 'fail';
}

function judgeContrast(color: string): ContrastVerdict {
  const ink = readableOn(color);
  const ratio = contrastRatio(color, ink);
  return {
    ink,
    inkLabel: ink === WHITE ? 'white' : 'deep ink',
    ratio,
    level: ratio >= 4.5 ? 'body' : ratio >= 3 ? 'large' : 'fail',
  };
}

// ---------------------------------------------------------------------------
// Draft state
// ---------------------------------------------------------------------------

interface TeamDraft {
  name: string;
  shortName: string;
  color: string;
  colorSecondary: string;
  crestUrl: string | null;
}

function draftOf(row: TeamRow): TeamDraft {
  return {
    name: row.name ?? '',
    shortName: row.short_name ?? '',
    color: row.color ?? '#000000',
    colorSecondary: row.color_secondary ?? '',
    crestUrl: row.crest_url,
  };
}

function isDirty(draft: TeamDraft, base: TeamDraft): boolean {
  return (
    draft.name !== base.name ||
    draft.shortName !== base.shortName ||
    draft.color !== base.color ||
    draft.colorSecondary !== base.colorSecondary ||
    draft.crestUrl !== base.crestUrl
  );
}

// ---------------------------------------------------------------------------
// Accent preview
// ---------------------------------------------------------------------------

function AccentPreview({
  name,
  shortName,
  color,
  secondary,
  code,
}: {
  name: string;
  shortName: string;
  color: string;
  secondary: string;
  code: TeamRow['code'];
}) {
  const vars = teamAccentVars(color, code);

  return (
    <div style={vars} className="space-y-3">
      <div className="ring-border-subtle overflow-hidden rounded-md ring-1">
        {/* The accent as a solid plate — team headers, lower thirds, badges. */}
        <div
          className="flex items-baseline justify-between gap-4 px-4 py-3"
          style={{
            backgroundColor: 'var(--team-accent)',
            color: 'var(--team-accent-contrast)',
          }}
        >
          <span className="u-label truncate text-[0.8125rem]">
            {(shortName || name || `TEAM ${code}`).toUpperCase()}
          </span>
          <span className="u-numeral tabular-nums text-[1.5rem] leading-none">128</span>
        </div>

        {/* The accent as a pale wash — table rows, fields, rules. */}
        <div
          className="flex items-center justify-between gap-4 px-4 py-3"
          style={{ backgroundColor: 'var(--team-accent-soft)' }}
        >
          <span
            className="u-label truncate text-[0.6875rem]"
            style={{ color: 'var(--team-accent-ink)' }}
          >
            {(name || `TEAM ${code}`).toUpperCase()} — ROUND 3
          </span>
          <span
            aria-hidden
            className="inline-block h-1.5 w-16 rounded-pill"
            style={{ backgroundColor: 'var(--team-accent)' }}
          />
        </div>
      </div>

      {secondary && HEX.test(secondary) ? (
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="ring-border-subtle inline-block size-6 rounded-sm ring-1"
            style={{ backgroundColor: secondary }}
          />
          <span className="text-text-muted text-[0.75rem]">
            Secondary colour — used for trims and the away strip.
          </span>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Screen
// ---------------------------------------------------------------------------

export default function TeamsSetupPage() {
  const deviceId = useDeviceId();
  const runner = useActionRunner();

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, TeamDraft>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const saveKeys = useRef<Record<string, string>>({});

  useEffect(() => {
    let live = true;

    void (async () => {
      try {
        const db = supabase();
        const event = await requireEvent(db, EVENT_SLUG);
        const rows = await getTeams(db, event.id);
        if (!live) return;
        setTeams(rows);
        setDrafts(Object.fromEntries(rows.map((t) => [t.id, draftOf(t)])));
        setLoadError(null);
      } catch (cause) {
        if (!live) return;
        setLoadError(cause instanceof Error ? cause.message : 'The teams could not be loaded.');
      } finally {
        if (live) setLoading(false);
      }
    })();

    return () => {
      live = false;
    };
  }, []);

  const patch = useCallback(
    <K extends keyof TeamDraft>(teamId: string, key: K, value: TeamDraft[K]) => {
      delete saveKeys.current[teamId];
      setDrafts((current) => {
        const existing = current[teamId];
        if (!existing) return current;
        return { ...current, [teamId]: { ...existing, [key]: value } };
      });
    },
    [],
  );

  const dirtyIds = useMemo(
    () =>
      teams
        .filter((team) => {
          const draft = drafts[team.id];
          return draft ? isDirty(draft, draftOf(team)) : false;
        })
        .map((team) => team.id),
    [teams, drafts],
  );

  const blockedReason = useMemo(() => {
    for (const team of teams) {
      const draft = drafts[team.id];
      if (!draft) continue;
      if (!draft.name.trim()) return `Team ${team.code} needs a name.`;
      if (!HEX.test(draft.color)) {
        return `Team ${team.code}'s primary colour must be a six-digit hex value like #0E6BA8.`;
      }
      if (draft.colorSecondary.trim() && !HEX.test(draft.colorSecondary.trim())) {
        return `Team ${team.code}'s secondary colour must be a six-digit hex value, or empty.`;
      }
    }
    return null;
  }, [teams, drafts]);

  async function save(): Promise<void> {
    if (blockedReason || dirtyIds.length === 0) return;

    const saved: TeamRow[] = [];

    for (const teamId of dirtyIds) {
      const draft = drafts[teamId];
      if (!draft) continue;

      if (!saveKeys.current[teamId]) {
        saveKeys.current[teamId] = newIdempotencyKey('team-update');
      }

      const result = await runner.run(
        () =>
          updateTeam({
            idempotencyKey: saveKeys.current[teamId],
            deviceId,
            teamId,
            patch: {
              name: draft.name.trim(),
              short_name: draft.shortName.trim() || null,
              color: draft.color.trim().toUpperCase(),
              color_secondary: draft.colorSecondary.trim().toUpperCase() || null,
              crest_url: draft.crestUrl,
            },
          }),
        {
          success:
            dirtyIds.length > 1 ? 'Both teams saved.' : 'Team saved.',
        },
      );

      if (!result.ok) return;
      delete saveKeys.current[teamId];
      saved.push(result.data);
    }

    if (saved.length > 0) {
      setTeams((current) =>
        current.map((team) => saved.find((row) => row.id === team.id) ?? team),
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
    setDrafts(Object.fromEntries(teams.map((t) => [t.id, draftOf(t)])));
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Teams" description="Loading the two team sheets…" />
        <Panel>
          <p className="text-text-muted text-[0.875rem]">Reading teams from the database.</p>
        </Panel>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="space-y-6">
        <PageHeader eyebrow="Setup" title="Teams" />
        <Callout tone="danger" title="The teams could not be loaded">
          {loadError}
        </Callout>
      </div>
    );
  }

  const teamA = teams.find((t) => t.code === 'A') ?? null;
  const teamB = teams.find((t) => t.code === 'B') ?? null;
  const draftA = teamA ? drafts[teamA.id] : undefined;
  const draftB = teamB ? drafts[teamB.id] : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Setup"
        title="Teams"
        description="Names, kit colours and crests. Every surface in the platform inherits these — get them right once."
        actions={
          <StatusPill
            label={dirtyIds.length > 0 ? `${dirtyIds.length} UNSAVED` : 'IN SYNC'}
            tone={dirtyIds.length > 0 ? 'draw' : 'winner'}
            size="sm"
          />
        }
      />

      {teams.length === 0 ? (
        <Callout tone="danger" title="No teams found">
          This event has no team rows. Run the seed migration before configuring anything else.
        </Callout>
      ) : null}

      {teams.map((team) => {
        const draft = drafts[team.id];
        if (!draft) return null;

        const validColor = HEX.test(draft.color);
        const verdict = judgeContrast(validColor ? draft.color : '#000000');
        const dirty = isDirty(draft, draftOf(team));

        return (
          <Panel
            key={team.id}
            eyebrow={`Team ${team.code}`}
            title={draft.name || `Team ${team.code}`}
            description="Shown on the score strip, the lineup boards, the leaderboard and every player card."
            actions={
              dirty ? <StatusPill label="EDITED" tone="draw" size="sm" /> : null
            }
          >
            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="space-y-5">
                <FieldGrid>
                  <Field label="Team name" htmlFor={`name-${team.id}`}>
                    <TextInput
                      id={`name-${team.id}`}
                      value={draft.name}
                      maxLength={80}
                      invalid={!draft.name.trim()}
                      onChange={(e) => patch(team.id, 'name', e.target.value)}
                    />
                  </Field>

                  <Field
                    label="Short name"
                    htmlFor={`short-${team.id}`}
                    hint="Used where the full name will not fit — three to eight characters."
                  >
                    <TextInput
                      id={`short-${team.id}`}
                      value={draft.shortName}
                      maxLength={40}
                      onChange={(e) => patch(team.id, 'shortName', e.target.value)}
                    />
                  </Field>
                </FieldGrid>

                <FieldGrid>
                  <Field
                    label="Primary colour"
                    hint="The kit colour. Becomes the team accent everywhere."
                    error={
                      validColor
                        ? null
                        : 'Enter a six-digit hex value, e.g. #0E6BA8.'
                    }
                  >
                    <ColorInput
                      value={draft.color}
                      aria-label={`Team ${team.code} primary colour`}
                      onValueChange={(value) => patch(team.id, 'color', value)}
                    />
                  </Field>

                  <Field
                    label="Secondary colour"
                    hint="Optional. Trims and the away strip. Leave empty to skip."
                    error={
                      !draft.colorSecondary.trim() || HEX.test(draft.colorSecondary.trim())
                        ? null
                        : 'Enter a six-digit hex value, or clear the field.'
                    }
                  >
                    <ColorInput
                      value={draft.colorSecondary}
                      aria-label={`Team ${team.code} secondary colour`}
                      onValueChange={(value) => patch(team.id, 'colorSecondary', value)}
                    />
                  </Field>
                </FieldGrid>

                <UploadField
                  bucket="brand"
                  folder="crests"
                  label="Crest"
                  hint="PNG or SVG with a transparent background, square, at least 512 px. It is placed on white and on the team colour."
                  value={draft.crestUrl}
                  onUploaded={(url) => patch(team.id, 'crestUrl', url)}
                  onCleared={() => patch(team.id, 'crestUrl', null)}
                />
              </div>

              <div className="space-y-4">
                <SectionHeading hint="How the colour actually reads">Accent preview</SectionHeading>

                <AccentPreview
                  name={draft.name}
                  shortName={draft.shortName}
                  color={validColor ? draft.color : '#000000'}
                  secondary={draft.colorSecondary.trim()}
                  code={team.code}
                />

                {verdict.level === 'fail' ? (
                  <Callout tone="danger" title="Text on this colour is not readable">
                    The best available text colour ({verdict.inkLabel}) reaches only{' '}
                    {verdict.ratio.toFixed(2)}:1 against it. Anything below 3:1 fails at every
                    size. Darken or lighten the colour before the wall sees it.
                  </Callout>
                ) : verdict.level === 'large' ? (
                  <Callout tone="warning" title="Large text only">
                    {verdict.inkLabel[0].toUpperCase()}
                    {verdict.inkLabel.slice(1)} text reaches {verdict.ratio.toFixed(2)}:1 on this
                    colour. That clears the 3:1 bar for headlines and score numerals, but small
                    labels placed on it will be hard to read.
                  </Callout>
                ) : (
                  <Callout tone="success" title="Readable at any size">
                    {verdict.inkLabel[0].toUpperCase()}
                    {verdict.inkLabel.slice(1)} text reaches {verdict.ratio.toFixed(2)}:1 on this
                    colour, clearing the 4.5:1 bar for body text.
                  </Callout>
                )}
              </div>
            </div>
          </Panel>
        );
      })}

      {teamA && teamB && draftA && draftB ? (
        <Panel
          title="Side by side"
          description="The two colours in the component they share most often. If the teams read as one block here, change one of them."
        >
          <TeamScoreStrip
            teamA={{
              code: 'A',
              name: draftA.name || 'Team A',
              shortName: draftA.shortName || null,
              score: 128,
              color: HEX.test(draftA.color) ? draftA.color : null,
            }}
            teamB={{
              code: 'B',
              name: draftB.name || 'Team B',
              shortName: draftB.shortName || null,
              score: 116,
              color: HEX.test(draftB.color) ? draftB.color : null,
            }}
            unit="PTS"
            animate={false}
          />
        </Panel>
      ) : null}

      <SaveBar
        dirty={dirtyIds.length > 0}
        pending={runner.pending}
        status={runner.status}
        blockedReason={blockedReason}
        onSave={() => void save()}
        onReset={reset}
        saveLabel={dirtyIds.length > 1 ? 'Save both teams' : 'Save team'}
      />
    </div>
  );
}
