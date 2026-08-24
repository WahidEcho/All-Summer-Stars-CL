/**
 * Tests for portrait delivery-size rewriting.
 *
 * `sizedPortraitSrc` sits in front of every photograph the platform shows. A
 * rewrite that produces a wrong address does not fail loudly — it shows the
 * branded fallback, so a whole wall of faces could quietly turn into initials.
 * These tests pin the two halves of the contract: this project's own public
 * storage objects are rewritten, and absolutely nothing else is touched.
 */

import { describe, expect, it } from 'vitest';

import { portraitSrc, sizedPortraitSrc } from '@/components/player/player-identity';
import type { PlayerRow } from '@/lib/types';

const BASE = 'https://shcnieqwzxwswtcwfigw.supabase.co';
const OBJECT = `${BASE}/storage/v1/object/public/players/cutouts/abc-123.png`;
const RENDERED = `${BASE}/storage/v1/render/image/public/players/cutouts/abc-123.png`;

describe('sizedPortraitSrc', () => {
  it('routes a public storage object through the render endpoint', () => {
    expect(sizedPortraitSrc(OBJECT, 800)).toBe(`${RENDERED}?width=800&resize=contain&quality=80`);
  });

  it('keeps the bucket and the full object path intact', () => {
    // The object path is everything after `/public/` — bucket included. Dropping
    // or duplicating a segment here is the easy mistake, and it 404s silently.
    const url = sizedPortraitSrc(OBJECT, 800) ?? '';
    expect(url).toContain('/render/image/public/players/cutouts/abc-123.png');
    expect(url).not.toContain('/object/public/');
    expect(url.split('/players/cutouts/').length - 1).toBe(1);
  });

  it('preserves a nested object path', () => {
    const nested = `${BASE}/storage/v1/object/public/players/a/b/c/photo.png`;
    expect(sizedPortraitSrc(nested, 400)).toBe(
      `${BASE}/storage/v1/render/image/public/players/a/b/c/photo.png?width=400&resize=contain&quality=80`,
    );
  });

  it('rounds a fractional width, because the CDN wants an integer', () => {
    expect(sizedPortraitSrc(OBJECT, 373.6)).toBe(`${RENDERED}?width=374&resize=contain&quality=80`);
  });

  it('honours the width it is given', () => {
    expect(sizedPortraitSrc(OBJECT, 200)).toContain('width=200');
    expect(sizedPortraitSrc(OBJECT, 1600)).toContain('width=1600');
  });

  it('always asks for resize=contain, or the portrait comes back squashed', () => {
    // Verified against the live endpoint: a 1122x1402 portrait requested at
    // width=800 with the default `cover` returns 800x1402 — it keeps the
    // original height and squeezes the face by nearly a third. `contain`
    // returns 800x1000 and preserves the aspect ratio. This is not a
    // preference; dropping the parameter distorts every face on the wall.
    for (const width of [200, 374, 800, 1600]) {
      expect(sizedPortraitSrc(OBJECT, width)).toContain('resize=contain');
    }
  });

  // -------------------------------------------------------------------------
  // Everything it must leave alone
  // -------------------------------------------------------------------------

  it('passes through null', () => {
    expect(sizedPortraitSrc(null, 800)).toBeNull();
  });

  it('passes through when no width is asked for', () => {
    expect(sizedPortraitSrc(OBJECT, undefined)).toBe(OBJECT);
    expect(sizedPortraitSrc(OBJECT, 0)).toBe(OBJECT);
  });

  it('ignores a nonsense width rather than emitting a broken address', () => {
    expect(sizedPortraitSrc(OBJECT, -100)).toBe(OBJECT);
    expect(sizedPortraitSrc(OBJECT, Number.NaN)).toBe(OBJECT);
    expect(sizedPortraitSrc(OBJECT, Number.POSITIVE_INFINITY)).toBe(OBJECT);
  });

  it('leaves a portrait hosted somewhere else completely alone', () => {
    const external = 'https://images.example.com/players/hassan.jpg';
    expect(sizedPortraitSrc(external, 800)).toBe(external);
  });

  it('leaves a data URI alone', () => {
    const data = 'data:image/png;base64,iVBORw0KGgo=';
    expect(sizedPortraitSrc(data, 800)).toBe(data);
  });

  it('leaves a relative path alone', () => {
    expect(sizedPortraitSrc('/brand/placeholder.png', 800)).toBe('/brand/placeholder.png');
  });

  it('leaves a signed or already-parameterised URL alone', () => {
    // A signed URL's token is part of its query. Appending to it would both
    // break the signature and double the `?`.
    const signed = `${BASE}/storage/v1/object/public/players/x.png?token=abc`;
    expect(sizedPortraitSrc(signed, 800)).toBe(signed);
  });

  it('leaves a non-public (authenticated) storage path alone', () => {
    const authed = `${BASE}/storage/v1/object/authenticated/players/x.png`;
    expect(sizedPortraitSrc(authed, 800)).toBe(authed);
  });

  it('never produces two query strings', () => {
    for (const url of [OBJECT, `${BASE}/storage/v1/object/public/players/x.png?t=1`]) {
      const out = sizedPortraitSrc(url, 500) ?? '';
      expect(out.split('?').length - 1).toBeLessThanOrEqual(1);
    }
  });

  it('is idempotent — a rewritten URL is not rewritten again', () => {
    // It carries a query, so the guard above catches it. Worth pinning: a
    // double rewrite would bury `/render/image/` inside the path.
    const once = sizedPortraitSrc(OBJECT, 800);
    expect(sizedPortraitSrc(once, 800)).toBe(once);
  });
});

describe('portraitSrc still chooses the source', () => {
  const player = (over: Partial<PlayerRow>) => over as PlayerRow;

  it('prefers the cut-out over the plain photo', () => {
    expect(portraitSrc(player({ portrait_url: 'cut.png', photo_url: 'photo.png' }))).toBe(
      'cut.png',
    );
  });

  it('falls back to the photo, then to null', () => {
    expect(portraitSrc(player({ portrait_url: null, photo_url: 'photo.png' }))).toBe('photo.png');
    expect(portraitSrc(player({ portrait_url: null, photo_url: null }))).toBeNull();
    expect(portraitSrc(player({ portrait_url: '', photo_url: '' }))).toBeNull();
  });
});
