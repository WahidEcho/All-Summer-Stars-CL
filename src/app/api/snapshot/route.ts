import { NextResponse } from 'next/server';

import { getEventSnapshot } from '@/lib/data/snapshot';
import { serverDb } from '@/lib/data/server';
import { EVENT_SLUG } from '@/lib/event';

export const dynamic = 'force-dynamic';

const SLUG_SHAPE = /^[a-z0-9-]{1,80}$/;
const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The event snapshot, assembled server-side and returned as ONE response.
 *
 * The live surfaces used to assemble this in the browser: a dozen separate
 * Supabase calls, partly sequential, every one a point of failure. On a flaky
 * venue connection one lost call threw the whole refresh away, and the wall
 * kept showing the previous round while the scene cut — a single small fetch —
 * kept landing. The screen advanced one round behind the show, permanently.
 *
 * Here the fan-out happens in the deployment's own region, milliseconds from
 * the database, and the client risks exactly one round trip. The realtime
 * channel remains what it was always meant to be — a notification that
 * something changed — while this is the read of record.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const slugParam = url.searchParams.get('event');
  const slug = slugParam && SLUG_SHAPE.test(slugParam) ? slugParam : EVENT_SLUG;
  const challengeParam = url.searchParams.get('challengeId');
  const roundParam = url.searchParams.get('roundId');

  try {
    const snapshot = await getEventSnapshot(await serverDb(), {
      slug,
      challengeId: challengeParam && UUID_SHAPE.test(challengeParam) ? challengeParam : undefined,
      roundId: roundParam && UUID_SHAPE.test(roundParam) ? roundParam : undefined,
    });
    return NextResponse.json(snapshot, {
      headers: { 'cache-control': 'no-store' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'snapshot unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
}
