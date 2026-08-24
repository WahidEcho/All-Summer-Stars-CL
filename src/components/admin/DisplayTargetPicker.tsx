'use client';

/**
 * Manual override for what slice of the event the wall is looking at.
 *
 * `TvSurface` reads two optional keys out of whichever payload is driving it —
 * `challengeId` and `roundId` — and feeds them straight to `useEventSnapshot`,
 * which pins the snapshot to that challenge and that round. When both keys are
 * absent the snapshot falls back to auto-detection: the live challenge, the
 * first unfinished round.
 *
 * That fallback is correct nine times out of ten and catastrophic the tenth,
 * which is the failure this component exists for. On the night, challenge 1 was
 * finished but its status row was never advanced, so auto-detection kept the
 * wall on challenge 1 round 5 while challenge 2 was already being scored, and
 * there was no control anywhere in the console that could move it. Here the
 * operator names the challenge and the round outright, and the pin wins.
 *
 * The two keys are therefore the whole contract of this file. Nothing else in
 * the payload means anything to the pin, and clearing both is what "follow
 * live" means — not a third key saying so.
 */

import { useMemo } from 'react';

import { cn } from '@/lib/cn';
import type { ChallengeRow, PlayerRow, RoundRow, TeamCode, TeamRow } from '@/lib/types';
import { StatusPill } from '@/components/ui';
import {
  challengeStatusLabel,
  isRoundPublished,
  mechanicLabel,
  outcomeName,
  roundProgress,
  roundStatusLabel,
} from '@/components/admin/challenge-lifecycle';

// ---------------------------------------------------------------------------
// The target, and its translation to and from a display payload
// ---------------------------------------------------------------------------

export type DisplayTarget =
  | { kind: 'auto' }
  | { kind: 'challenge'; challengeId: string }
  | { kind: 'round'; challengeId: string; roundId: string };

/** The only two payload keys the TV wall reads as a pin. */
export const TARGET_KEYS = ['challengeId', 'roundId'] as const;

export const FOLLOW_LIVE: DisplayTarget = { kind: 'auto' };

function readId(payload: Record<string, unknown>, key: string): string | undefined {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/**
 * Recover a target from a payload that is already on air.
 *
 * A `roundId` with no `challengeId` is still a valid pin — the snapshot pulls
 * the round's own challenge into view — so the round is resolved against the
 * full round list rather than trusted to carry its parent.
 */
export function targetFromPayload(
  payload: Record<string, unknown>,
  rounds: RoundRow[],
): DisplayTarget {
  const roundId = readId(payload, 'roundId');
  if (roundId) {
    const round = rounds.find((r) => r.id === roundId);
    return {
      kind: 'round',
      challengeId: round?.challenge_id ?? readId(payload, 'challengeId') ?? '',
      roundId,
    };
  }
  const challengeId = readId(payload, 'challengeId');
  if (challengeId) return { kind: 'challenge', challengeId };
  return FOLLOW_LIVE;
}

/** The keys this target contributes to a payload. Empty means "follow live". */
export function targetPayload(target: DisplayTarget): Record<string, string> {
  if (target.kind === 'round') {
    const out: Record<string, string> = { roundId: target.roundId };
    if (target.challengeId) out.challengeId = target.challengeId;
    return out;
  }
  if (target.kind === 'challenge') return { challengeId: target.challengeId };
  return {};
}

/** A copy of `payload` with any pin removed — what "follow live" writes. */
export function withoutTarget(payload: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = { ...payload };
  for (const key of TARGET_KEYS) delete next[key];
  return next;
}

/** True when a payload pins the wall to something. */
export function isPinned(payload: Record<string, unknown>): boolean {
  return TARGET_KEYS.some((key) => readId(payload, key) !== undefined);
}

export function sameTarget(a: DisplayTarget, b: DisplayTarget): boolean {
  if (a.kind === 'round' && b.kind === 'round') return a.roundId === b.roundId;
  if (a.kind === 'challenge' && b.kind === 'challenge')
    return a.challengeId === b.challengeId;
  return a.kind === 'auto' && b.kind === 'auto';
}

/** One line an operator can read at a glance: `C2 · R3 — Ali vs Omar`. */
export function describeTarget(
  target: DisplayTarget,
  challenges: ChallengeRow[],
  rounds: RoundRow[],
  playersById: Record<string, PlayerRow>,
): string {
  if (target.kind === 'auto') return 'Following the live challenge and round';

  const round =
    target.kind === 'round' ? (rounds.find((r) => r.id === target.roundId) ?? null) : null;
  const challengeId = round?.challenge_id ?? target.challengeId;
  const challenge = challenges.find((c) => c.id === challengeId) ?? null;

  const head = challenge ? `C${challenge.number} ${challenge.title}` : 'Unknown challenge';
  if (!round) return head;

  const name = (id: string | null) => {
    if (!id) return 'Empty slot';
    const player = playersById[id];
    return player?.display_name ?? player?.full_name ?? 'Unknown player';
  };
  return `${head} · R${round.number} — ${name(round.player_a_id)} vs ${name(round.player_b_id)}`;
}

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

export interface DisplayTargetPickerProps {
  challenges: ChallengeRow[];
  /** Every round in the show, not just the current challenge's. */
  rounds: RoundRow[];
  playersById: Record<string, PlayerRow>;
  teamsByCode?: Record<TeamCode, TeamRow | null>;
  value: DisplayTarget;
  onChange: (next: DisplayTarget) => void;
  /** What the wall is pinned to right now, so the list can flag it `ON AIR`. */
  programTarget?: DisplayTarget;
  /** What auto-detection is currently resolving to, printed on the auto row. */
  autoDescription?: string;
  disabled?: boolean;
}

export function DisplayTargetPicker({
  challenges,
  rounds,
  playersById,
  teamsByCode,
  value,
  onChange,
  programTarget = FOLLOW_LIVE,
  autoDescription,
  disabled = false,
}: DisplayTargetPickerProps) {
  const roundsByChallenge = useMemo(() => {
    const map = new Map<string, RoundRow[]>();
    for (const round of rounds) {
      const list = map.get(round.challenge_id);
      if (list) list.push(round);
      else map.set(round.challenge_id, [round]);
    }
    for (const list of map.values()) list.sort((a, b) => a.number - b.number);
    return map;
  }, [rounds]);

  // The challenge whose rounds are listed: the selected one, or the one that
  // owns the selected round.
  const openChallengeId =
    value.kind === 'auto'
      ? null
      : value.kind === 'round'
        ? (rounds.find((r) => r.id === value.roundId)?.challenge_id ?? value.challengeId)
        : value.challengeId;

  const openChallenge = challenges.find((c) => c.id === openChallengeId) ?? null;
  const openRounds = openChallengeId ? (roundsByChallenge.get(openChallengeId) ?? []) : [];

  const playerName = (id: string | null): string => {
    if (!id) return 'Empty slot';
    const player = playersById[id];
    return player?.display_name ?? player?.full_name ?? 'Unknown player';
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ---- Challenges ---- */}
      <div className="min-w-0 space-y-2">
        <p className="u-label text-text-muted text-eyebrow">1 · What is on the wall</p>

        <ul className="ring-border-subtle divide-border-subtle divide-y overflow-hidden rounded-md ring-1">
          <li>
            <button
              type="button"
              disabled={disabled}
              aria-pressed={value.kind === 'auto'}
              onClick={() => onChange(FOLLOW_LIVE)}
              className={cn(
                'flex w-full items-start gap-3 px-4 py-3 text-left',
                'transition-colors duration-[var(--dur-instant)] disabled:opacity-60',
                value.kind === 'auto' ? 'bg-aqua-100' : 'hover:bg-mist',
              )}
            >
              <span aria-hidden className="text-aqua-800 mt-0.5 text-[0.9375rem]">
                ↺
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-ink text-[0.875rem] font-semibold">
                    Follow live automatically
                  </span>
                  {programTarget.kind === 'auto' ? (
                    <StatusPill label="ON AIR" tone="live" size="sm" />
                  ) : null}
                </span>
                <span className="text-text-muted mt-0.5 block text-[0.75rem] leading-body">
                  {autoDescription
                    ? `No pin. Right now that resolves to ${autoDescription}.`
                    : 'No pin — the wall follows the live challenge and round on its own.'}
                </span>
              </span>
            </button>
          </li>

          {challenges.map((challenge) => {
            const own = roundsByChallenge.get(challenge.id) ?? [];
            const progress = roundProgress(own);
            const status = challengeStatusLabel(challenge.status);
            const selected = openChallengeId === challenge.id;
            const onAir =
              (programTarget.kind === 'challenge' &&
                programTarget.challengeId === challenge.id) ||
              (programTarget.kind === 'round' &&
                (rounds.find((r) => r.id === programTarget.roundId)?.challenge_id ??
                  programTarget.challengeId) === challenge.id);

            return (
              <li key={challenge.id}>
                <button
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => onChange({ kind: 'challenge', challengeId: challenge.id })}
                  className={cn(
                    'flex w-full items-start gap-3 px-4 py-3 text-left',
                    'transition-colors duration-[var(--dur-instant)] disabled:opacity-60',
                    selected ? 'bg-aqua-100' : 'hover:bg-mist',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'u-tabular font-numeral mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[0.75rem]',
                      selected ? 'bg-aqua-700 text-white' : 'bg-mist text-text-secondary',
                    )}
                  >
                    C{challenge.number}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-ink text-[0.875rem] font-semibold">
                        {challenge.title}
                      </span>
                      <StatusPill label={status.label} tone={status.tone} size="sm" />
                      {onAir ? <StatusPill label="ON AIR" tone="live" size="sm" /> : null}
                    </span>
                    <span className="text-text-muted mt-0.5 block text-[0.75rem] leading-body">
                      {mechanicLabel(challenge.mechanic)} · {progress.text}
                      {challenge.winner
                        ? ` · won by ${outcomeName(teamsByCode, challenge.winner)}`
                        : null}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* ---- Rounds ---- */}
      <div className="min-w-0 space-y-2">
        <p className="u-label text-text-muted text-eyebrow">2 · Which round</p>

        {!openChallenge ? (
          <div className="border-border-subtle text-text-muted rounded-md border border-dashed px-4 py-8 text-center text-[0.8125rem] leading-body">
            The wall is following the live round on its own. Pick a challenge on the left to
            pin it to a specific one instead.
          </div>
        ) : openRounds.length === 0 ? (
          <div className="ring-border-subtle space-y-2 rounded-md px-4 py-4 ring-1">
            <p className="text-ink text-[0.875rem] font-semibold">
              {openChallenge.title} has no rounds
            </p>
            <p className="text-text-muted text-[0.75rem] leading-body">
              {mechanicLabel(openChallenge.mechanic)} is scored as a single match, so pinning
              the challenge is all the wall needs — the match scenes read the score from it.
            </p>
            <StatusPill
              label={
                value.kind === 'challenge' && value.challengeId === openChallenge.id
                  ? 'CHALLENGE PINNED'
                  : 'CHALLENGE SELECTED'
              }
              tone="accent"
              size="sm"
            />
          </div>
        ) : (
          <ul className="ring-border-subtle divide-border-subtle divide-y overflow-hidden rounded-md ring-1">
            <li>
              <button
                type="button"
                disabled={disabled}
                aria-pressed={value.kind === 'challenge'}
                onClick={() =>
                  onChange({ kind: 'challenge', challengeId: openChallenge.id })
                }
                className={cn(
                  'flex w-full items-center gap-3 px-4 py-2.5 text-left',
                  'transition-colors duration-[var(--dur-instant)] disabled:opacity-60',
                  value.kind === 'challenge' ? 'bg-aqua-100' : 'hover:bg-mist',
                )}
              >
                <span aria-hidden className="text-text-muted text-[0.875rem]">
                  ∗
                </span>
                <span className="min-w-0">
                  <span className="text-ink block text-[0.8125rem] font-semibold">
                    Whole challenge — let the round follow live
                  </span>
                  <span className="text-text-muted block text-[0.75rem] leading-body">
                    Pins the challenge only. Right for lineups and the challenge result.
                  </span>
                </span>
              </button>
            </li>

            {openRounds.map((round) => {
              const status = roundStatusLabel(round.status);
              const selected = value.kind === 'round' && value.roundId === round.id;
              const onAir =
                programTarget.kind === 'round' && programTarget.roundId === round.id;

              return (
                <li key={round.id}>
                  <button
                    type="button"
                    disabled={disabled}
                    aria-pressed={selected}
                    onClick={() =>
                      onChange({
                        kind: 'round',
                        challengeId: round.challenge_id,
                        roundId: round.id,
                      })
                    }
                    className={cn(
                      'flex w-full items-start gap-3 px-4 py-3 text-left',
                      'transition-colors duration-[var(--dur-instant)] disabled:opacity-60',
                      selected ? 'bg-aqua-100' : 'hover:bg-mist',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'u-tabular font-numeral mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[0.75rem]',
                        selected ? 'bg-aqua-700 text-white' : 'bg-mist text-text-secondary',
                      )}
                    >
                      R{round.number}
                    </span>

                    <span className="min-w-0 flex-1">
                      <span className="text-ink block truncate text-[0.875rem] font-semibold">
                        {playerName(round.player_a_id)} vs {playerName(round.player_b_id)}
                      </span>
                      <span className="mt-1 flex flex-wrap items-center gap-2">
                        <StatusPill label={status.label} tone={status.tone} size="sm" />
                        {onAir ? <StatusPill label="ON AIR" tone="live" size="sm" /> : null}
                        <span className="u-tabular font-numeral text-text-secondary text-[0.8125rem]">
                          {round.score_a} – {round.score_b}
                        </span>
                        {isRoundPublished(round) ? (
                          <span className="text-text-muted text-[0.75rem]">
                            {outcomeName(teamsByCode, round.winner)}
                          </span>
                        ) : null}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default DisplayTargetPicker;
