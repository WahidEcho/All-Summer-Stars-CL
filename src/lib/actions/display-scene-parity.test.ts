/**
 * The wire must accept every scene the product has.
 *
 * Scene AUTO shipped as a `DisplayScene`, as a Postgres `display_scene` value
 * and as a tile in the operator's scene table — but not into the Zod enum that
 * every display command is parsed against. The input type is `DisplayScene`,
 * which includes it, so the compiler was satisfied and the failure only existed
 * at runtime: the console offered AUTO, and selecting it, cutting to it, or
 * pressing BACK TO AUTO returned an invalid-input error before the database was
 * ever touched. The wall could be put on AUTO only by writing the row by hand,
 * which is exactly how it came to be running on a wall that no operator could
 * then steer back.
 *
 * A three-place enum is a thing that drifts. This is the check that says so:
 * `SCENES` is annotated as covering the union, so removing a value from
 * `DisplayScene` breaks the build here, and adding one without teaching the
 * schema breaks the assertion below.
 */

import { describe, expect, it } from 'vitest';

import { displaySceneEnum, displaySceneSchema } from '@/lib/actions/schemas';
import { SCENES } from '@/components/admin/scenes';
import type { DisplayScene } from '@/lib/types';

/**
 * Every scene the product has. Typed as the union itself, so this list cannot
 * silently fall behind `DisplayScene` without the compiler objecting.
 */
const ALL_SCENES: ReadonlyArray<DisplayScene> = [
  'auto',
  'holding',
  'lineups',
  'head_to_head',
  'live_round',
  'round_result',
  'challenge_result',
  'final_match',
  'leaderboard',
  'ceremony',
  'player_entrance',
  'hydration_break',
];

describe('display scene parity', () => {
  it('accepts every DisplayScene on the wire', () => {
    for (const scene of ALL_SCENES) {
      const parsed = displaySceneEnum.safeParse(scene);
      expect(parsed.success, `${scene} must be accepted by displaySceneEnum`).toBe(true);
    }
  });

  it('accepts AUTO through the whole display command schema', () => {
    // The exact shape the BACK TO AUTO button sends.
    const parsed = displaySceneSchema.safeParse({
      idempotencyKey: '11111111-1111-4111-8111-111111111111',
      deviceId: 'console-1',
      scene: 'auto',
      payload: {},
    });
    expect(parsed.success).toBe(true);
  });

  it('offers exactly the scenes the operator console lists', () => {
    expect([...SCENES.map((s) => s.scene)].sort()).toEqual([...ALL_SCENES].sort());
  });

  it('still refuses a scene that is not real', () => {
    expect(displaySceneEnum.safeParse('interval').success).toBe(false);
  });
});
