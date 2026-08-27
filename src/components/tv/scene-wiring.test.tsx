/**
 * The wiring a new scene has to survive.
 *
 * Adding a `DisplayScene` touches six places, and exactly two of them fail
 * *silently* rather than at the compiler:
 *
 *  - `SceneRouter`'s switch has a `default` that falls back to the holding
 *    slate, so a forgotten `case` does not break the build — it puts the wrong
 *    composition on the wall in front of an audience.
 *  - `SCENE_BY_ID` is a cast `reduce`, so a scene missing from `SCENES` is
 *    `undefined` at runtime with a type that claims otherwise, and the control
 *    room renders a cue with no form.
 *
 * Both are pinned here against the real sample snapshot rather than a hand-made
 * fixture, and the catalogue is checked against the zod enum that guards the
 * write path — the three lists have to agree or a cue is unsendable, unformed
 * or unrendered.
 */

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { SCENES, SCENE_BY_ID } from '@/components/admin/scenes';
import { displayNameOf } from '@/components/player';
import { displaySceneEnum } from '@/lib/actions/schemas';
import { SceneRouter } from '@/components/tv/SceneRouter';
import { buildSceneModel } from '@/components/tv/scene-model';
import {
  SAMPLE_SCENES,
  buildSampleSnapshot,
  parseSampleScene,
  sampleSceneDefaults,
} from '@/components/tv/sample-model';
import type { DisplayScene } from '@/lib/types';

/**
 * The welcome line as it appears in the DOM.
 *
 * `u-display` sets the caps in CSS rather than in the string, so the markup
 * carries the sentence case the component was written with — asserting the
 * uppercase the audience reads would only ever test `text-transform`.
 */
const WELCOME_LINE = 'Welcome to SwanLake Football Stars';

/** Render one scene exactly as the wall's server render would. */
function render(scene: DisplayScene, payload: Record<string, unknown> = {}): string {
  const model = buildSceneModel(buildSampleSnapshot(scene));
  return renderToStaticMarkup(
    <SceneRouter model={model} payload={payload} ceremonyPhase="complete" scene={scene} />,
  );
}

describe('scene catalogue', () => {
  it('describes every scene the write path accepts', () => {
    // `auto` is resolved inside TvSurface, but an operator can still select it,
    // so it needs a catalogue entry like everything else.
    const catalogued = SCENES.map((descriptor) => descriptor.scene).sort();
    const writable = [...displaySceneEnum.options].sort();
    expect(catalogued).toEqual(writable);
  });

  it('resolves every catalogued scene through SCENE_BY_ID', () => {
    for (const scene of displaySceneEnum.options) {
      expect(SCENE_BY_ID[scene as DisplayScene]).toBeDefined();
      expect(SCENE_BY_ID[scene as DisplayScene].title).toBeTruthy();
    }
  });

  it('gives the walk-out an optional player field', () => {
    const descriptor = SCENE_BY_ID.player_entrance;
    const field = descriptor.fields.find((f) => f.key === 'playerId');

    expect(descriptor.cue).toBe('10');
    expect(field?.kind).toBe('player');
    // Required would block the empty payload, which is the welcome frame — a
    // valid thing to put on the wall while the gate is still closed.
    expect(field?.required).toBeFalsy();
  });
});

describe('player entrance', () => {
  const { payload } = sampleSceneDefaults('player_entrance');

  it('is routed to its own composition, not the holding fallback', () => {
    const html = render('player_entrance', payload);

    expect(html).toContain('data-entrance-card');
    expect(html).toContain(WELCOME_LINE);
  });

  it('names the player the payload asks for', () => {
    const snapshot = buildSampleSnapshot('player_entrance');
    const id = payload.playerId as string;
    const player = snapshot.playersById[id];
    expect(player).toBeDefined();

    // `display_name` wins over `full_name` wherever the admin set one, which
    // is what the card renders and therefore what the wall shows.
    expect(render('player_entrance', payload)).toContain(displayNameOf(player));
  });

  it('falls back to the welcome frame when no player is named', () => {
    const html = render('player_entrance', {});

    expect(html).toContain(WELCOME_LINE);
    expect(html).toContain('PLAYERS ARRIVING');
    expect(html).not.toContain('data-entrance-card');
  });

  it('ignores a playerId that is not in the event', () => {
    const html = render('player_entrance', { playerId: 'not-a-player' });

    expect(html).toContain('PLAYERS ARRIVING');
    expect(html).not.toContain('data-entrance-card');
  });

  it('is reachable from the QA route by name and by shorthand', () => {
    expect(SAMPLE_SCENES).toContain('player_entrance');
    expect(parseSampleScene('player_entrance')).toBe('player_entrance');
    expect(parseSampleScene('entrance')).toBe('player_entrance');
    expect(parseSampleScene('walkout')).toBe('player_entrance');
  });
});
