/**
 * Loaders shared by the final-match and shootout commands.
 *
 * Internal module: no 'use server' directive, never imported from client code.
 */

import { required, take } from '@/lib/actions/_command';
import type { Db } from '@/lib/event';
import type {
  ChallengeRow,
  MatchRow,
  PenaltyShootoutRow,
  ScoringProfileRow,
} from '@/lib/types';

export interface MatchContext {
  match: MatchRow;
  challenge: ChallengeRow;
  profile: ScoringProfileRow;
  eventId: string;
}

export async function loadProfileFor(db: Db, eventId: string): Promise<ScoringProfileRow> {
  return required(
    take<ScoringProfileRow | null>(
      await db
        .from('scoring_profiles')
        .select('*')
        .eq('event_id', eventId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ),
    'No scoring profile for this event.',
  );
}

/** The match, its challenge and the live scoring profile in one read. */
export async function loadMatchContext(db: Db, matchId: string): Promise<MatchContext> {
  const match = required(
    take<MatchRow | null>(await db.from('matches').select('*').eq('id', matchId).maybeSingle()),
    'Match not found.',
  );
  const challenge = required(
    take<ChallengeRow | null>(
      await db.from('challenges').select('*').eq('id', match.challenge_id).maybeSingle(),
    ),
    'Challenge not found.',
  );
  const profile = await loadProfileFor(db, challenge.event_id);
  return { match, challenge, profile, eventId: challenge.event_id };
}

export async function loadShootout(
  db: Db,
  shootoutId: string,
): Promise<PenaltyShootoutRow> {
  return required(
    take<PenaltyShootoutRow | null>(
      await db.from('penalty_shootouts').select('*').eq('id', shootoutId).maybeSingle(),
    ),
    'Shootout not found.',
  );
}

/** Apply a patch to a match row and return the fresh row. */
export async function writeMatch(
  db: Db,
  matchId: string,
  patch: Record<string, unknown>,
): Promise<MatchRow> {
  return take<MatchRow>(
    await db.from('matches').update(patch).eq('id', matchId).select('*').single(),
  );
}
