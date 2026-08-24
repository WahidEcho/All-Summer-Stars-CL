'use client';

/**
 * Challenge lifecycle.
 *
 * The show is five challenges, and until this screen existed there was no
 * control anywhere in the console that could say one of them had finished.
 * `completeChallenge` was reachable from nothing; the only way a challenge ever
 * reached `live` was as a side effect of starting a round, and the only way it
 * ever reached `completed` was by hand in the database. On the night that gap
 * cost the operator a challenge — challenge 1 was over, its status row still
 * said otherwise, and the wall stayed on its last round while challenge 2 was
 * being scored.
 *
 * So: one row per challenge, the three transitions that matter, and — the part
 * that makes the screen trustworthy — the computed result shown *before* ending
 * anything, from the same `computeChallengeResult` the server action runs.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

import { cn } from '@/lib/cn';
import { getRoundsForChallenges } from '@/lib/data/queries';
import { supabase } from '@/lib/supabase/client';
import { completeChallenge } from '@/lib/actions';
import { newIdempotencyKey, useDeviceId, useEventSnapshot } from '@/lib/hooks';
import type { ChallengeRow, RoundRow } from '@/lib/types';
import { StatusPill } from '@/components/ui';
import {
  AdminButton,
  ButtonRow,
  Callout,
  ChallengeResultPreview,
  ConfirmDialog,
  EmptyState,
  PageHeader,
  Panel,
  challengeStatusLabel,
  isRoundPublished,
  mechanicLabel,
  outcomeName,
  previewChallengeResult,
  roundProgress,
  roundStatusLabel,
  useActionRunner,
} from '@/components/admin';
import {
  completeMatchChallenge,
  noteEarlyChallengeEnd,
  reopenChallenge,
  startChallenge,
} from '@/app/admin/challenges/actions';

type Intent = 'end' | 'force-end' | 'reopen' | 'end-match';

interface Pending {
  intent: Intent;
  challenge: ChallengeRow;
}

export default function ChallengeLifecyclePage() {
  const deviceId = useDeviceId();
  const runner = useActionRunner();

  const { snapshot, refresh } = useEventSnapshot({ pollMs: 20_000 });
  const [rounds, setRounds] = useState<RoundRow[]>([]);
  const [roundsError, setRoundsError] = useState<string | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);

  const challenges = useMemo(() => snapshot?.challenges ?? [], [snapshot]);
  const challengeIds = challenges.map((c) => c.id).join(',');

  // The snapshot only carries the current challenge's rounds; this screen needs
  // every one of them to say how far each challenge has got.
  useEffect(() => {
    if (!challengeIds) return;
    let live = true;

    void (async () => {
      try {
        const all = await getRoundsForChallenges(supabase(), challengeIds.split(','));
        if (!live) return;
        setRounds(all);
        setRoundsError(null);
      } catch (cause) {
        if (!live) return;
        // Round progress is the whole point of the screen, so unlike the
        // display console this failure is worth saying out loud.
        setRoundsError(
          cause instanceof Error ? cause.message : 'The rounds could not be read.',
        );
      }
    })();

    return () => {
      live = false;
    };
  }, [challengeIds, snapshot?.revision]);

  const roundsFor = useCallback(
    (challengeId: string): RoundRow[] =>
      rounds
        .filter((r) => r.challenge_id === challengeId)
        .sort((a, b) => a.number - b.number),
    [rounds],
  );

  const teamsByCode = snapshot?.teamsByCode;
  const bonus = snapshot?.scoring.bonuses.challengeWinBonus;
  const matchWinner = snapshot?.match?.winner ?? null;
  const matchStatus = snapshot?.match?.status ?? null;

  // --- commands ------------------------------------------------------------

  async function start(challenge: ChallengeRow): Promise<void> {
    const result = await runner.run(
      () =>
        startChallenge({
          idempotencyKey: newIdempotencyKey('challenge-start'),
          deviceId,
          challengeId: challenge.id,
        }),
      { success: `${challenge.title} is live.` },
    );
    if (result.ok) void refresh();
  }

  /**
   * `completeChallenge` takes no reason, because ending a challenge whose
   * rounds are all published needs none. Ending one early does, so the reason
   * is written to the audit log first and the challenge is only closed if that
   * write succeeded — a forced ending can never end up in the record as an
   * ordinary one.
   */
  async function end(challenge: ChallengeRow, reason: string): Promise<void> {
    const own = roundsFor(challenge.id);
    const progress = roundProgress(own);

    if (!progress.complete) {
      const noted = await runner.run(
        () =>
          noteEarlyChallengeEnd({
            idempotencyKey: newIdempotencyKey('challenge-early-note'),
            deviceId,
            challengeId: challenge.id,
            reason,
            unpublishedRounds: progress.total - progress.published,
          }),
        { silent: true },
      );
      if (!noted.ok) return;
    }

    const result = await runner.run(
      () =>
        completeChallenge({
          idempotencyKey: newIdempotencyKey('challenge-complete'),
          deviceId,
          challengeId: challenge.id,
        }),
      { success: `${challenge.title} is closed.` },
    );
    if (result.ok) {
      setPending(null);
      void refresh();
    }
  }

  async function endMatchChallenge(challenge: ChallengeRow): Promise<void> {
    const result = await runner.run(
      () =>
        completeMatchChallenge({
          idempotencyKey: newIdempotencyKey('challenge-match-complete'),
          deviceId,
          challengeId: challenge.id,
        }),
      { success: `${challenge.title} is closed.` },
    );
    if (result.ok) {
      setPending(null);
      void refresh();
    }
  }

  async function reopen(challenge: ChallengeRow, reason: string): Promise<void> {
    const result = await runner.run(
      () =>
        reopenChallenge({
          idempotencyKey: newIdempotencyKey('challenge-reopen'),
          deviceId,
          challengeId: challenge.id,
          reason,
        }),
      { success: `${challenge.title} is open again.` },
    );
    if (result.ok) {
      setPending(null);
      void refresh();
    }
  }

  function confirm(reason: string): void {
    if (!pending) return;
    switch (pending.intent) {
      case 'end':
      case 'force-end':
        void end(pending.challenge, reason);
        return;

      case 'end-match':
        void endMatchChallenge(pending.challenge);
        return;
      case 'reopen':
        void reopen(pending.challenge, reason);
        return;
    }
  }

  // --- render --------------------------------------------------------------

  const pendingRounds = pending ? roundsFor(pending.challenge.id) : [];
  const pendingProgress = roundProgress(pendingRounds);
  const pendingResult = pending
    ? previewChallengeResult(pending.challenge, pendingRounds)
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Run the show"
        title="Challenges"
        description="Start a challenge, see what ending it would publish, and end it. The wall follows the live challenge unless you have pinned it."
        actions={
          <Link
            href="/admin/display"
            className={cn(
              'bg-surface-raised text-ink ring-border hover:bg-mist',
              'inline-flex h-10 items-center gap-2 rounded-md px-4 text-[0.8125rem] font-semibold ring-1',
            )}
          >
            Display control →
          </Link>
        }
      />

      {runner.status ? (
        <Callout tone={runner.status.tone === 'ok' ? 'success' : 'danger'}>
          {runner.status.message}
        </Callout>
      ) : null}

      {roundsError ? (
        <Callout tone="warning" title="Round progress could not be read">
          {roundsError} Every challenge below will read as having no rounds until this
          recovers — do not end one on that basis.
        </Callout>
      ) : null}

      <Callout tone="info" title="Ending a challenge does not move the wall">
        Closing a challenge publishes its result and awards the bonus. What the TV shows is a
        separate decision — set it on{' '}
        <Link
          href="/admin/display"
          className="text-aqua-800 hover:text-aqua-900 underline underline-offset-2"
        >
          Display control
        </Link>
        , where you can pin any challenge and round or send the wall back to following the
        live one.
      </Callout>

      {challenges.length === 0 ? (
        <EmptyState
          title="No challenges yet"
          description="The event has not been seeded. Run the setup migration before the show."
        />
      ) : null}

      <div className="space-y-4">
        {challenges.map((challenge) => {
          const own = roundsFor(challenge.id);
          const progress = roundProgress(own);
          const status = challengeStatusLabel(challenge.status);
          const result = previewChallengeResult(challenge, own);
          const isMatch = challenge.mechanic === 'final_match';
          const completed = challenge.status === 'completed';
          const busy = runner.pending;

          const endReady = isMatch ? matchStatus === 'completed' : progress.complete;

          return (
            <Panel
              key={challenge.id}
              tone={challenge.status === 'live' ? 'accent' : 'default'}
              eyebrow={`Challenge ${String(challenge.number).padStart(2, '0')}`}
              title={challenge.title}
              description={`${mechanicLabel(challenge.mechanic)} · ${progress.text}`}
              actions={
                <>
                  <StatusPill label={status.label} tone={status.tone} size="sm" />
                  {completed ? (
                    <StatusPill
                      label={`RESULT — ${outcomeName(teamsByCode, challenge.winner).toUpperCase()}`}
                      tone={challenge.winner === 'draw' ? 'draw' : 'winner'}
                      size="sm"
                    />
                  ) : null}
                </>
              }
            >
              <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
                <div className="min-w-0 space-y-4">
                  {isMatch ? (
                    <div className="ring-border-subtle space-y-1 rounded-md px-4 py-3 ring-1">
                      <p className="u-label text-text-muted text-eyebrow">The final match</p>
                      <p className="text-text-secondary text-[0.8125rem] leading-body">
                        Scored as one match, not as rounds. Its points and win bonus are
                        written when the match is ended on the scoring controller; closing it
                        here only records the result on the challenge.
                      </p>
                      <p className="text-text-secondary text-[0.8125rem]">
                        Match status:{' '}
                        <span className="text-ink font-semibold">
                          {matchStatus ? matchStatus.replace(/_/g, ' ') : 'not started'}
                        </span>
                        {matchWinner ? (
                          <> · winner {outcomeName(teamsByCode, matchWinner)}</>
                        ) : null}
                      </p>
                    </div>
                  ) : own.length === 0 ? (
                    <p className="text-text-muted text-[0.8125rem] leading-body">
                      No rounds are loaded for this challenge.
                    </p>
                  ) : (
                    <ul className="ring-border-subtle divide-border-subtle divide-y overflow-hidden rounded-md ring-1">
                      {own.map((round) => {
                        const roundStatus = roundStatusLabel(round.status);
                        return (
                          <li
                            key={round.id}
                            className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5"
                          >
                            <span
                              aria-hidden
                              className="u-tabular font-numeral bg-mist text-text-secondary inline-flex size-7 shrink-0 items-center justify-center rounded-md text-[0.75rem]"
                            >
                              R{round.number}
                            </span>
                            <StatusPill
                              label={roundStatus.label}
                              tone={roundStatus.tone}
                              size="sm"
                            />
                            <span className="u-tabular font-numeral text-ink text-[0.9375rem]">
                              {round.score_a} – {round.score_b}
                            </span>
                            <span className="text-text-muted text-[0.75rem]">
                              {isRoundPublished(round)
                                ? outcomeName(teamsByCode, round.winner)
                                : 'not published'}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="min-w-0 space-y-4">
                  {isMatch ? null : (
                    <ChallengeResultPreview
                      result={result}
                      teamsByCode={teamsByCode}
                      aggregationRule={challenge.aggregation_rule}
                      challengeWinBonus={bonus}
                      caveat={
                        progress.complete
                          ? null
                          : `${progress.total - progress.published} of ${progress.total} rounds are still unpublished and count as 0 – 0.`
                      }
                    />
                  )}

                  <ButtonRow>
                    <AdminButton
                      variant="primary"
                      disabled={busy || completed || challenge.status === 'live'}
                      onClick={() => void start(challenge)}
                    >
                      {challenge.status === 'live' ? 'Already live' : 'START CHALLENGE'}
                    </AdminButton>

                    {completed ? (
                      <AdminButton
                        variant="danger"
                        disabled={busy}
                        onClick={() => setPending({ intent: 'reopen', challenge })}
                      >
                        REOPEN
                      </AdminButton>
                    ) : (
                      <AdminButton
                        variant={endReady ? 'take' : 'danger'}
                        disabled={busy}
                        onClick={() =>
                          setPending({
                            intent: isMatch
                              ? 'end-match'
                              : endReady
                                ? 'end'
                                : 'force-end',
                            challenge,
                          })
                        }
                      >
                        {endReady ? 'END CHALLENGE' : 'END CHALLENGE ANYWAY'}
                      </AdminButton>
                    )}
                  </ButtonRow>

                  {!completed && !endReady ? (
                    <p
                      className={cn(
                        'text-text-muted text-[0.75rem] leading-body',
                        'border-border-subtle border-t pt-3',
                      )}
                    >
                      {isMatch
                        ? 'The match has not been ended on the scoring controller. Closing it now records whatever winner the match row currently holds.'
                        : 'Not every round is published. Ending it now is still allowed — it needs a typed reason, and the unpublished rounds score 0 – 0.'}
                    </p>
                  ) : null}
                </div>
              </div>
            </Panel>
          );
        })}
      </div>

      {/* ---- Confirmations ---- */}
      <ConfirmDialog
        open={pending !== null}
        title={
          pending?.intent === 'reopen'
            ? `Reopen ${pending.challenge.title}?`
            : `End ${pending?.challenge.title ?? 'this challenge'}?`
        }
        description={
          pending?.intent === 'reopen'
            ? 'The challenge goes back to live and its recorded winner is cleared. Rounds that were closed with it return to published, so they can be reopened individually.'
            : pending?.intent === 'end-match'
              ? 'This records the match result on the challenge row. The match points and win bonus were already written when the match was ended.'
              : pending?.intent === 'force-end'
                ? 'Not every round has been published. The result below is what will be published, counting the unpublished rounds as 0 – 0, and the challenge bonus will be awarded on it.'
                : 'This publishes the challenge result and awards the challenge bonus to the winning lineup.'
        }
        confirmLabel={
          pending?.intent === 'reopen'
            ? 'Reopen challenge'
            : pending?.intent === 'force-end'
              ? 'End it anyway'
              : 'End challenge'
        }
        confirmWord={pending?.intent === 'end' ? null : 'CONFIRM'}
        requireReason={pending?.intent === 'force-end' || pending?.intent === 'reopen'}
        reasonLabel={
          pending?.intent === 'reopen'
            ? 'Why is this being reopened?'
            : 'Why is it ending early?'
        }
        busy={runner.pending}
        error={runner.status?.tone === 'error' ? runner.status.message : null}
        onCancel={() => {
          setPending(null);
          runner.clear();
        }}
        onConfirm={confirm}
      >
        {pending && pending.intent !== 'reopen' && pending.intent !== 'end-match' && pendingResult ? (
          <ChallengeResultPreview
            result={pendingResult}
            teamsByCode={teamsByCode}
            aggregationRule={pending.challenge.aggregation_rule}
            challengeWinBonus={bonus}
            caveat={
              pendingProgress.complete
                ? null
                : `${pendingProgress.total - pendingProgress.published} of ${pendingProgress.total} rounds are unpublished and are being counted as 0 – 0.`
            }
          />
        ) : null}

        {pending?.intent === 'end-match' ? (
          <div className="ring-border-subtle space-y-1 rounded-md px-4 py-3 ring-1">
            <p className="u-label text-text-muted text-eyebrow">Recording</p>
            <p className="text-ink text-[0.9375rem] font-semibold">
              {outcomeName(teamsByCode, matchWinner)}
            </p>
            <p className="text-text-muted text-[0.75rem] leading-body">
              Taken from the match row, not recomputed. If that is not the result the room
              saw, correct the match on the scoring controller first.
            </p>
          </div>
        ) : null}

        {pending?.intent === 'reopen' ? (
          <Callout tone="warning" title="Points already awarded stay awarded">
            Any challenge win bonus written when this challenge was closed remains on the
            ledger, and ending the challenge again will not award it a second time or move it
            to a different side. To take points back, reopen the individual round on the
            scoring controller.
          </Callout>
        ) : null}
      </ConfirmDialog>
    </div>
  );
}
