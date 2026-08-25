'use client';

/**
 * Every mutation the controller can perform, expressed as an intent.
 *
 * Surfaces call these; they never touch a server action directly. Two things
 * are decided here and nowhere else:
 *
 * • **The intent id.** It encodes what is being changed and how much of the
 *   world had already changed when the operator committed — `goal:<match>:<n>`
 *   rather than a timestamp — so retrying a failed press replays one key while
 *   a genuinely new press mints a fresh one.
 * • **Which commands are revision-guarded.** Results that settle points carry
 *   `expectedRevision`; the scoring hot path does not, because there a stale
 *   revision would block a correct action that the idempotency key already
 *   protects.
 */

import { useMemo } from 'react';
import {
  addGoal,
  endHalf,
  endMatch,
  ensureTimer,
  openShootout,
  pauseTimer,
  publishRoundResult,
  recordAttempt,
  recordPenaltyAttempt,
  reopenRoundResult,
  resetTimer,
  resumeTimer,
  reverseAttempt,
  reverseGoal,
  reversePenaltyAttempt,
  startHalf,
  startRound,
  startTimer,
  submitOfficialRoundResult,
} from '@/lib/actions';
import type { AttemptPayload, TeamCode } from '@/lib/types';
import { useController } from '@/components/controller/controller-context';
import type { UndoTarget } from '@/components/controller/controller-model';

/** Reversals are audited, so every one of them carries a sentence. */
const UNDO_REASON = 'Reversed on the courtside controller';

export interface RecordAttemptIntent {
  side: TeamCode;
  playerId: string;
  attemptNumber: number;
  payload: AttemptPayload;
  /** What the rail should say once it lands, e.g. `A3 TARGET 50`. */
  note: string;
}

export interface ControllerCommands {
  /** Resolves true only when the attempt actually landed on the server. */
  recordAttempt: (intent: RecordAttemptIntent) => Promise<boolean>;
  reverse: (target: UndoTarget) => Promise<void>;

  startRound: () => Promise<void>;
  /** Start a specific round — the per-round rail's explicit control. */
  startRoundById: (roundId: string, label: string) => Promise<void>;
  submitRoundResult: () => Promise<void>;
  publishRound: () => Promise<void>;
  reopenRound: (reason: string) => Promise<void>;

  ensureRoundTimer: (spec: {
    segment: number;
    mode: 'count_up' | 'count_down' | 'stopwatch';
    durationMs: number | null;
    label: string;
  }) => Promise<string | null>;
  startTimer: (timerId: string) => Promise<void>;
  pauseTimer: (timerId: string) => Promise<void>;
  resumeTimer: (timerId: string) => Promise<void>;
  resetTimer: (timerId: string) => Promise<void>;

  startHalf: (half: number) => Promise<void>;
  endHalf: (half: number) => Promise<void>;
  endMatch: () => Promise<void>;
  addGoal: (goal: {
    teamCode: TeamCode;
    scorerId: string | null;
    isOwnGoal: boolean;
    ownGoalByPlayerId: string | null;
    method: string;
    clockMs: number;
    half: number;
    note: string;
  }) => Promise<void>;

  openShootout: () => Promise<void>;
  recordPenalty: (kick: {
    teamCode: TeamCode;
    playerId: string | null;
    scored: boolean;
    note: string;
  }) => Promise<void>;
}

export function useControllerCommands(): ControllerCommands {
  const { snapshot, runner } = useController();

  const roundId = snapshot.currentRound?.id ?? null;
  const matchId = snapshot.match?.id ?? null;
  const shootoutId = snapshot.shootout?.id ?? null;
  const eventRevision = snapshot.revision;

  return useMemo<ControllerCommands>(() => {
    const confirmedGoals = snapshot.goals.filter((g) => g.status === 'confirmed').length;
    const confirmedPenalties = snapshot.penaltyAttempts.filter(
      (p) => p.status === 'confirmed',
    ).length;

    const commands: ControllerCommands = {
      async recordAttempt(intent) {
        if (!roundId) return false;
        const result = await runner.run({
          id: `attempt:${roundId}:${intent.playerId}:${intent.attemptNumber}`,
          label: `Record ${intent.note}`,
          note: intent.note,
          run: (base) =>
            recordAttempt({
              ...base,
              roundId,
              playerId: intent.playerId,
              side: intent.side,
              attemptNumber: intent.attemptNumber,
              payload: intent.payload,
            }),
        });
        // The scoring surfaces advance to the next attempt only on a confirmed
        // write, so a rejected command leaves the operator on the same slot.
        return result?.ok === true;
      },

      async reverse(target) {
        const label = `Reverse ${target.description}`;
        if (target.kind === 'attempt') {
          await runner.run({
            id: `reverse:attempt:${target.id}`,
            label,
            note: `REVERSED · ${target.description.toUpperCase()}`,
            run: (base) => reverseAttempt({ ...base, attemptId: target.id, reason: UNDO_REASON }),
          });
          return;
        }
        if (target.kind === 'goal') {
          await runner.run({
            id: `reverse:goal:${target.id}`,
            label,
            note: `REVERSED · ${target.description.toUpperCase()}`,
            run: (base) => reverseGoal({ ...base, goalId: target.id, reason: UNDO_REASON }),
          });
          return;
        }
        await runner.run({
          id: `reverse:penalty:${target.id}`,
          label,
          note: `REVERSED · ${target.description.toUpperCase()}`,
          run: (base) =>
            reversePenaltyAttempt({ ...base, attemptId: target.id, reason: UNDO_REASON }),
        });
      },

      async startRound() {
        if (!roundId) return;
        await runner.run({
          id: `round:start:${roundId}`,
          label: 'Start the round',
          note: 'ROUND STARTED',
          run: (base) => startRound({ ...base, roundId }),
        });
      },

      async startRoundById(targetRoundId, label) {
        await runner.run({
          id: `round:start:${targetRoundId}`,
          label: `Start ${label}`,
          note: `${label.toUpperCase()} STARTED`,
          run: (base) => startRound({ ...base, roundId: targetRoundId }),
        });
      },

      async submitRoundResult() {
        if (!roundId) return;
        await runner.run({
          id: `round:submit:${roundId}:${eventRevision}`,
          label: 'Submit the official round result',
          note: 'OFFICIAL RESULT SUBMITTED',
          guard: true,
          run: (base) => submitOfficialRoundResult({ ...base, roundId }),
        });
      },

      async publishRound() {
        if (!roundId) return;
        await runner.run({
          id: `round:publish:${roundId}:${eventRevision}`,
          label: 'Publish the round result',
          note: 'ROUND RESULT PUBLISHED',
          guard: true,
          run: (base) => publishRoundResult({ ...base, roundId }),
        });
      },

      async reopenRound(reason) {
        if (!roundId) return;
        await runner.run({
          id: `round:reopen:${roundId}:${eventRevision}`,
          label: 'Reopen the round',
          note: 'ROUND REOPENED',
          guard: true,
          run: (base) => reopenRoundResult({ ...base, roundId, reason }),
        });
      },

      async ensureRoundTimer(spec) {
        if (!roundId) return null;
        const result = await runner.run({
          id: `timer:ensure:${roundId}:${spec.segment}`,
          label: 'Prepare the clock',
          run: (base) =>
            ensureTimer({
              ...base,
              scope: 'round',
              roundId,
              segment: spec.segment,
              mode: spec.mode,
              durationMs: spec.durationMs,
              label: spec.label,
            }),
        });
        return result && result.ok ? result.data.id : null;
      },

      async startTimer(timerId) {
        await runner.run({
          id: `timer:start:${timerId}`,
          label: 'Start the clock',
          note: 'CLOCK STARTED',
          run: (base) => startTimer({ ...base, timerId }),
        });
      },

      async pauseTimer(timerId) {
        await runner.run({
          id: `timer:pause:${timerId}`,
          label: 'Pause the clock',
          note: 'CLOCK PAUSED',
          run: (base) => pauseTimer({ ...base, timerId }),
        });
      },

      async resumeTimer(timerId) {
        await runner.run({
          id: `timer:resume:${timerId}`,
          label: 'Resume the clock',
          note: 'CLOCK RESUMED',
          run: (base) => resumeTimer({ ...base, timerId }),
        });
      },

      async resetTimer(timerId) {
        await runner.run({
          id: `timer:reset:${timerId}`,
          label: 'Reset the clock',
          note: 'CLOCK RESET',
          run: (base) => resetTimer({ ...base, timerId }),
        });
      },

      async startHalf(half) {
        if (!matchId) return;
        await runner.run({
          id: `match:start-half:${matchId}:${half}`,
          label: `Start half ${half}`,
          note: `HALF ${half} STARTED`,
          run: (base) => startHalf({ ...base, matchId, half }),
        });
      },

      async endHalf(half) {
        if (!matchId) return;
        await runner.run({
          id: `match:end-half:${matchId}:${half}`,
          label: `End half ${half}`,
          note: `HALF ${half} ENDED`,
          run: (base) => endHalf({ ...base, matchId, half }),
        });
      },

      async endMatch() {
        if (!matchId) return;
        await runner.run({
          id: `match:end:${matchId}:${eventRevision}`,
          label: 'End the match',
          note: 'MATCH ENDED · OFFICIAL RESULT SUBMITTED',
          guard: true,
          run: (base) => endMatch({ ...base, matchId }),
        });
      },

      async addGoal(goal) {
        if (!matchId) return;
        await runner.run({
          id: `goal:${matchId}:${confirmedGoals}:${goal.teamCode}`,
          label: `Add a goal for team ${goal.teamCode}`,
          note: goal.note,
          run: (base) =>
            addGoal({
              ...base,
              matchId,
              teamCode: goal.teamCode,
              scorerId: goal.scorerId,
              isOwnGoal: goal.isOwnGoal,
              ownGoalByPlayerId: goal.ownGoalByPlayerId,
              method: goal.method,
              clockMs: goal.clockMs,
              half: goal.half,
            }),
        });
      },

      async openShootout() {
        if (!matchId) return;
        await runner.run({
          id: `shootout:open:${matchId}`,
          label: 'Open the penalty shootout',
          note: 'PENALTY SHOOTOUT OPENED',
          guard: true,
          run: (base) => openShootout({ ...base, matchId }),
        });
      },

      async recordPenalty(kick) {
        if (!shootoutId) return;
        await runner.run({
          id: `penalty:${shootoutId}:${confirmedPenalties}`,
          label: `Record penalty ${confirmedPenalties + 1}`,
          note: kick.note,
          run: (base) =>
            recordPenaltyAttempt({
              ...base,
              shootoutId,
              teamCode: kick.teamCode,
              playerId: kick.playerId,
              scored: kick.scored,
            }),
        });
      },

    };

    return commands;
  }, [
    runner,
    roundId,
    matchId,
    shootoutId,
    eventRevision,
    snapshot.goals,
    snapshot.penaltyAttempts,
  ]);
}
