'use client';

/**
 * The penalty shootout — the tiebreak after a drawn final match.
 *
 * Two rules shape this surface. First, it only exists once the regular result
 * is a *confirmed* draw: a shootout opened over a match that is still being
 * played would rewrite a result nobody has settled. Second, the penalty score
 * is shown beside the regular score and never merged into it — the shootout
 * decides the trophy, but its points are a tiebreaker, not goals.
 *
 * Kicks are ordered and attributed. The sequence number is assigned by the
 * server from the confirmed attempts, so two devices tapping at once cannot
 * collide, and reversing a kick appends a reversal rather than erasing one.
 */

import { useState } from 'react';
import { AttemptDots, ScoreNumeral, StatusPill } from '@/components/ui';
import type { AttemptDotState } from '@/components/ui';
import { cn } from '@/lib/cn';
import type { PenaltyAttemptRow, PlayerRow, TeamCode } from '@/lib/types';
import {
  ConfirmControlButton,
  ControlButton,
  Panel,
} from '@/components/controller/ControlButton';
import { useController } from '@/components/controller/controller-context';
import { useControllerCommands } from '@/components/controller/useControllerCommands';
import {
  accentFor,
  eligiblePlayers,
  canOpenShootout,
  shootoutTurn,
  slotLabelForPlayer,
} from '@/components/controller/controller-model';

const SIDES: TeamCode[] = ['A', 'B'];

function nameOf(player: PlayerRow): string {
  return (player.display_name ?? player.full_name).toUpperCase();
}

export function PenaltyShootoutSurface() {
  const { snapshot, canMutate, runner } = useController();
  const commands = useControllerCommands();

  const [takerId, setTakerId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const match = snapshot.match;
  const shootout = snapshot.shootout;
  const state = snapshot.shootoutState;
  const penalties = snapshot.scoring.penalties;
  // Under the two-competition day this is a level DAY, not a drawn match.
  const canOpen = canOpenShootout(snapshot);

  // ---------------------------------------------------------------- gates --
  if (!match) return null;

  if (penalties.enabledFor === 'disabled') {
    return (
      <Panel tone="sunken" title="PENALTY SHOOTOUT">
        <p className="text-body text-text-secondary">
          Penalties are switched off in the scoring profile. A drawn final match will stand as a
          draw.
        </p>
      </Panel>
    );
  }

  if (!shootout && !canOpen) {
    const totals = snapshot.matchTotals;
    return (
      <Panel tone="sunken" title="PENALTY SHOOTOUT">
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill label="NOT AVAILABLE YET" tone="pending" variant="soft" size="md" />
          <ScoreNumeral
            value={`${totals?.scoreA ?? match.score_a}–${totals?.scoreB ?? match.score_b}`}
            label="REGULAR SCORE"
            size="xs"
          />
        </div>
        <p className="text-body text-text-secondary">
          A shootout opens only once the regular result is a confirmed draw. End the match first; if
          it finishes level, this panel will offer to open the shootout.
        </p>
      </Panel>
    );
  }

  const confirmed = snapshot.penaltyAttempts
    .filter((a) => a.status === 'confirmed')
    .sort((a, b) => a.sequence - b.sequence);
  const reversedIds = new Set(
    snapshot.penaltyAttempts
      .filter((a) => a.reverses_id)
      .map((a) => a.reverses_id as string),
  );

  const turn = shootoutTurn(state);
  const nextSide = turn.nextSide;
  const decided = turn.decided;

  const takenBy = (side: TeamCode) => confirmed.filter((a) => a.team_code === side);
  const takers: PlayerRow[] = eligiblePlayers(
    snapshot,
    nextSide,
    snapshot.currentChallenge?.id ?? null,
  );
  const alreadyTaken = new Set(
    takenBy(nextSide)
      .map((a) => a.player_id)
      .filter((id): id is string => id !== null),
  );

  const openingAttempts = shootout?.opening_attempts ?? penalties.openingAttempts;
  const sequence = confirmed.length + 1;
  const inSuddenDeath = state?.inSuddenDeath ?? false;

  const blocked = !canMutate
    ? 'This device does not hold the controls.'
    : !shootout
      ? 'Open the shootout first.'
      : decided
        ? 'The shootout is decided. Reverse a kick to reopen it.'
        : null;

  const record = (scored: boolean) => {
    if (!shootout) return;
    const taker = takerId ? snapshot.playersById[takerId] ?? null : null;
    void commands
      .recordPenalty({
        teamCode: nextSide,
        playerId: takerId,
        scored,
        note: `PENALTY ${sequence} · TEAM ${nextSide} · ${
          taker ? nameOf(taker) : 'UNATTRIBUTED'
        } · ${scored ? 'SCORED' : 'MISSED'}`,
      })
      .then(() => setTakerId(null));
  };

  const chosen: PenaltyAttemptRow | null =
    selected === null ? null : confirmed.find((a) => a.id === selected) ?? null;

  return (
    <Panel
      title="PENALTY SHOOTOUT"
      tone={shootout ? 'raised' : 'sunken'}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {inSuddenDeath ? (
            <StatusPill label="SUDDEN DEATH" tone="live" variant="solid" size="md" glyph="!" />
          ) : null}
          {decided ? (
            <StatusPill
              label={
                state?.winner && state.winner !== 'draw'
                  ? `TEAM ${state.winner} WINS THE SHOOTOUT`
                  : 'DECIDED'
              }
              tone="winner"
              variant="solid"
              size="md"
            />
          ) : (
            <StatusPill
              label={`NEXT: TEAM ${nextSide} · KICK ${sequence}`}
              tone="accent"
              variant="soft"
              size="md"
            />
          )}
        </div>
      }
    >
      {/* --- the two scores, never merged ------------------------------- */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-4 rounded-lg border-2 border-slate bg-surface-raised px-4 py-3">
          <span className="u-label text-eyebrow text-text-muted">REGULAR SCORE</span>
          <ScoreNumeral
            value={`${snapshot.matchTotals?.scoreA ?? match.score_a}–${
              snapshot.matchTotals?.scoreB ?? match.score_b
            }`}
            size="xs"
            labelPlacement="none"
            align="end"
          />
        </div>
        <div className="flex items-center justify-between gap-4 rounded-lg border-2 border-aqua-500 bg-aqua-50 px-4 py-3">
          <span className="u-label text-eyebrow text-aqua-800">PENALTIES</span>
          <ScoreNumeral
            value={`${state?.scoreA ?? match.penalty_score_a}–${
              state?.scoreB ?? match.penalty_score_b
            }`}
            size="xs"
            tone="accent"
            labelPlacement="none"
            align="end"
          />
        </div>
      </div>

      {/* --- the ordered kicks ------------------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2">
        {SIDES.map((code) => {
          const team = snapshot.teamsByCode[code];
          const taken = takenBy(code);
          const states: AttemptDotState[] = taken.map((a) => (a.scored ? 'hit' : 'miss'));
          if (!decided && code === nextSide && shootout) states.push('active');
          const scored = taken.filter((a) => a.scored).length;
          return (
            <div key={code} className="flex flex-col gap-2">
              <span className="u-display text-[1.25rem] leading-none text-text-primary">
                <span style={{ color: accentFor(team, code) }}>TEAM {code}</span> ·{' '}
                {(team?.name ?? `Team ${code}`).toUpperCase()}
              </span>
              <AttemptDots
                attempts={states}
                total={Math.max(openingAttempts, states.length)}
                size="lg"
                label={`${scored} SCORED FROM ${taken.length} · ${openingAttempts} OPENING KICKS`}
                ariaLabel={`Team ${code} penalties`}
              />
            </div>
          );
        })}
      </div>

      {!shootout ? (
        <ControlButton
          label="OPEN THE SHOOTOUT"
          glyph="▶"
          hint={`${openingAttempts} KICKS EACH${penalties.suddenDeath ? ' · THEN SUDDEN DEATH' : ''}`}
          size="xl"
          tone="primary"
          disabled={!canMutate}
          disabledReason="This device does not hold the controls."
          busy={runner.busyId === `shootout:open:${match.id}`}
          onPress={() => void commands.openShootout()}
        />
      ) : (
        <>
          {/* --- who is taking it ---------------------------------------- */}
          <div className="flex flex-col gap-2">
            <span className="u-label text-eyebrow text-text-muted">
              KICK {sequence} · TEAM {nextSide} · WHO IS TAKING IT
            </span>
            <div className="grid gap-2 sm:grid-cols-3">
              {takers.map((player) => {
                const slot = slotLabelForPlayer(
                  snapshot,
                  player.id,
                  snapshot.currentChallenge?.id ?? null,
                );
                return (
                  <ControlButton
                    key={player.id}
                    label={nameOf(player)}
                    hint={`${slot ?? (player.jersey_number ? `#${player.jersey_number}` : 'SQUAD')}${
                      alreadyTaken.has(player.id) ? ' · HAS TAKEN ONE' : ''
                    }`}
                    size="md"
                    tone={takerId === player.id ? 'primary' : 'neutral'}
                    selected={takerId === player.id}
                    disabled={blocked !== null}
                    disabledReason={blocked ?? undefined}
                    onPress={() =>
                      setTakerId((current) => (current === player.id ? null : player.id))
                    }
                  />
                );
              })}
            </div>
            {takers.length === 0 ? (
              <p className="text-body text-text-secondary">
                No players are assigned to team {nextSide}. The kick can still be recorded
                unattributed.
              </p>
            ) : null}
          </div>

          {/* --- scored or missed ---------------------------------------- */}
          <div className="grid gap-3 sm:grid-cols-2">
            <ControlButton
              label="SCORED"
              glyph="✓"
              hint={`KICK ${sequence} · TEAM ${nextSide}`}
              size="xl"
              tone="positive"
              disabled={blocked !== null}
              disabledReason={blocked ?? undefined}
              busy={runner.busyId === `penalty:${shootout.id}:${confirmed.length}`}
              onPress={() => record(true)}
            />
            <ControlButton
              label="MISSED"
              glyph="×"
              hint={`KICK ${sequence} · TEAM ${nextSide}`}
              size="xl"
              tone="negative"
              disabled={blocked !== null}
              disabledReason={blocked ?? undefined}
              busy={runner.busyId === `penalty:${shootout.id}:${confirmed.length}`}
              onPress={() => record(false)}
            />
          </div>

          {blocked ? (
            <p className="u-label text-eyebrow text-draw">{blocked.toUpperCase()}</p>
          ) : (
            <p className="u-label text-eyebrow text-text-muted">
              {takerId && snapshot.playersById[takerId]
                ? `RECORDING FOR ${nameOf(snapshot.playersById[takerId])}`
                : 'NO TAKER SELECTED — THE KICK WILL BE RECORDED UNATTRIBUTED'}
            </p>
          )}

          {/* --- the run of kicks, and reversing one ---------------------- */}
          <div className="flex flex-col gap-2">
            <span className="u-label text-eyebrow text-text-muted">EVERY KICK TAKEN</span>
            {confirmed.length === 0 ? (
              <p className="text-body text-text-secondary">No kicks taken yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {[...confirmed].reverse().map((attempt) => {
                  const player = attempt.player_id
                    ? snapshot.playersById[attempt.player_id] ?? null
                    : null;
                  const gone = reversedIds.has(attempt.id);
                  return (
                    <li key={attempt.id}>
                      <button
                        type="button"
                        onClick={() =>
                          setSelected((current) => (current === attempt.id ? null : attempt.id))
                        }
                        className={cn(
                          'flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border-2 px-4 py-3 text-left',
                          attempt.scored
                            ? 'border-winner bg-winner-soft'
                            : 'border-live bg-live-soft',
                          gone ? 'opacity-60' : '',
                          selected === attempt.id ? 'ring-4 ring-focus ring-offset-2' : '',
                        )}
                      >
                        <span className="u-display text-[1.125rem] leading-none text-text-primary">
                          {attempt.sequence}. TEAM {attempt.team_code} ·{' '}
                          {player ? nameOf(player) : 'UNATTRIBUTED'}
                          {attempt.is_sudden_death ? ' · SUDDEN DEATH' : ''}
                        </span>
                        <span
                          className={cn(
                            'u-label text-label',
                            attempt.scored ? 'text-winner' : 'text-live',
                          )}
                        >
                          {attempt.scored ? '✓ SCORED' : '× MISSED'}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex flex-col gap-2 rounded-lg border-2 border-draw bg-draw-soft p-3">
            <p className="u-label text-eyebrow text-text-primary">
              {chosen
                ? `REVERSING KICK ${chosen.sequence} · TEAM ${chosen.team_code} · ${
                    chosen.scored ? 'SCORED' : 'MISSED'
                  }`
                : 'PICK A KICK ABOVE TO REVERSE IT, OR REVERSE THE LAST ONE'}
            </p>
            <ConfirmControlButton
              label={
                chosen ? `REVERSE KICK ${chosen.sequence}` : 'REVERSE THE LAST KICK'
              }
              armedLabel="TAP AGAIN TO REVERSE"
              hint="APPENDS A REVERSAL — NOTHING IS DELETED"
              size="lg"
              tone="negative"
              glyph="↺"
              disabled={!canMutate || confirmed.length === 0}
              disabledReason={
                confirmed.length === 0
                  ? 'There is nothing to reverse yet.'
                  : 'This device does not hold the controls.'
              }
              busy={runner.busy}
              onConfirm={() => {
                const target = chosen ?? confirmed[confirmed.length - 1];
                if (!target) return;
                void commands
                  .reverse({
                    kind: 'penalty',
                    id: target.id,
                    description: `Penalty ${target.sequence} for team ${target.team_code}`,
                  })
                  .then(() => setSelected(null));
              }}
            />
          </div>
        </>
      )}
    </Panel>
  );
}

export default PenaltyShootoutSurface;
