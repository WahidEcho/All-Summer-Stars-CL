import type { DisplayScene } from '@/lib/types';

/**
 * The nine broadcast scenes, and what each one needs to know.
 *
 * The display actions accept an opaque `payload`, which is right for the wire
 * but useless to an operator. This table is the operator-facing half: it says
 * which scene needs a round, which needs a challenge, and what each control
 * does, so the control room can build the right form for whatever is selected.
 */

export type ScenePayloadKind =
  | 'round'
  | 'challenge'
  | 'player'
  | 'ceremonyPhase'
  | 'number'
  | 'text'
  | 'boolean';

export interface ScenePayloadField {
  key: string;
  label: string;
  kind: ScenePayloadKind;
  hint?: string;
  /** The scene will not go to air without it. */
  required?: boolean;
  defaultValue?: string | number | boolean;
  min?: number;
  max?: number;
}

export interface SceneDescriptor {
  scene: DisplayScene;
  /** Two-digit cue number, the way an operator calls it. */
  cue: string;
  title: string;
  purpose: string;
  fields: ScenePayloadField[];
}

export const SCENES: SceneDescriptor[] = [
  {
    scene: 'holding',
    cue: '01',
    title: 'Holding screen',
    purpose:
      'Event identity, countdown and the QR code. The safe scene — always available, never wrong.',
    fields: [
      {
        key: 'headline',
        label: 'Headline override',
        kind: 'text',
        hint: 'Leave empty to use the headline from Setup → Event.',
      },
    ],
  },
  {
    scene: 'lineups',
    cue: '02',
    title: 'Lineups',
    purpose: 'The ten-slot team sheet for a challenge, A1–A5 against B1–B5.',
    fields: [
      { key: 'challengeId', label: 'Challenge', kind: 'challenge', required: true },
    ],
  },
  {
    scene: 'head_to_head',
    cue: '03',
    title: 'Head to head',
    purpose: 'The VS card for the next pairing. Play it just before the round starts.',
    fields: [{ key: 'roundId', label: 'Round', kind: 'round', required: true }],
  },
  {
    scene: 'live_round',
    cue: '04',
    title: 'Live round',
    purpose: 'Attempts, dots and the running score while the round is being played.',
    fields: [{ key: 'roundId', label: 'Round', kind: 'round', required: true }],
  },
  {
    scene: 'round_result',
    cue: '05',
    title: 'Round result',
    purpose: 'The official winner of one round, after the scorekeeper has published it.',
    fields: [{ key: 'roundId', label: 'Round', kind: 'round', required: true }],
  },
  {
    scene: 'challenge_result',
    cue: '06',
    title: 'Challenge result',
    purpose: 'The five rounds added up, and the challenge winner.',
    fields: [
      { key: 'challengeId', label: 'Challenge', kind: 'challenge', required: true },
    ],
  },
  {
    scene: 'final_match',
    cue: '07',
    title: 'Final match',
    purpose: 'The 5v5: clock, score, goals and — if it comes to it — the shootout.',
    fields: [
      {
        key: 'focus',
        label: 'Focus',
        kind: 'text',
        hint: 'scoreboard (default), scorer, or shootout.',
        defaultValue: 'scoreboard',
      },
    ],
  },
  {
    scene: 'leaderboard',
    cue: '08',
    title: 'Leaderboard',
    purpose: 'Individual standings. The scene to rest on between challenges.',
    fields: [
      {
        key: 'limit',
        label: 'Players shown',
        kind: 'number',
        defaultValue: 10,
        min: 3,
        max: 10,
      },
      {
        key: 'highlightPlayerId',
        label: 'Highlight player',
        kind: 'player',
        hint: 'Optional — pushes one row forward for a mention.',
      },
    ],
  },
  {
    scene: 'ceremony',
    cue: '09',
    title: 'Ceremony',
    purpose:
      'The closing sequence. Drive it from the Ceremony screen rather than cutting phases here.',
    fields: [
      { key: 'phase', label: 'Ceremony phase', kind: 'ceremonyPhase', required: true },
    ],
  },
];

export const SCENE_BY_ID: Record<DisplayScene, SceneDescriptor> = SCENES.reduce(
  (acc, descriptor) => {
    acc[descriptor.scene] = descriptor;
    return acc;
  },
  {} as Record<DisplayScene, SceneDescriptor>,
);

/** Human name for a scene id, for log rows and status lines. */
export function sceneTitle(scene: DisplayScene | null | undefined): string {
  if (!scene) return 'Nothing';
  return SCENE_BY_ID[scene]?.title ?? scene;
}

/**
 * Which required fields a payload is still missing.
 *
 * Returned as labels rather than keys: the answer is shown to an operator, not
 * parsed by anything.
 */
export function missingSceneFields(
  scene: DisplayScene,
  payload: Record<string, unknown>,
): string[] {
  const descriptor = SCENE_BY_ID[scene];
  if (!descriptor) return [];
  return descriptor.fields
    .filter((field) => {
      if (!field.required) return false;
      const value = payload[field.key];
      return value === undefined || value === null || value === '';
    })
    .map((field) => field.label);
}
