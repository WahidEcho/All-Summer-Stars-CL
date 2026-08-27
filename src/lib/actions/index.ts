/**
 * Server-action barrel.
 *
 * This file has no 'use server' directive of its own — it only re-exports the
 * modules that do, plus the shared result types. Importing an action from here
 * behaves exactly like importing it from its own module.
 */

export * from '@/lib/actions/types';

export { recordAttempt, reverseAttempt } from '@/lib/actions/attempts';

export {
  startRound,
  submitOfficialRoundResult,
  publishRoundResult,
  reopenRoundResult,
  completeChallenge,
} from '@/lib/actions/rounds';

export {
  ensureTimer,
  startTimer,
  pauseTimer,
  resumeTimer,
  resetTimer,
  endTimer,
} from '@/lib/actions/timers';

export {
  addGoal,
  reverseGoal,
  setGoalPointsMode,
  startHalf,
  endHalf,
  endMatch,
  reopenMatch,
} from '@/lib/actions/match';

export {
  openShootout,
  recordPenaltyAttempt,
  reversePenaltyAttempt,
} from '@/lib/actions/shootout';

export {
  setLineupSlot,
  lockChallengeLineup,
  unlockChallengeLineup,
} from '@/lib/actions/lineup';

export {
  setDisplayScene,
  setPreviewScene,
  takePreviewLive,
  clearPreviewScene,
  setCeremonyPhase,
} from '@/lib/actions/display';

export {
  updateScoringProfile,
  lockScoringProfile,
  unlockScoringProfile,
} from '@/lib/actions/scoring';

export { adjustPlayerPoints, reverseAdjustment } from '@/lib/actions/adjustments';

export {
  updateEvent,
  updateTeam,
  updatePlayer,
  updateSponsor,
} from '@/lib/actions/entities';

export {
  getControllerLeaseState,
  claimControllerLease,
  renewControllerLease,
  releaseControllerLease,
  requestControllerTransfer,
  approveControllerTransfer,
  denyControllerTransfer,
  isLeaseLive,
} from '@/lib/actions/lease';

export { resetChallengeScores, resetEventScores } from '@/lib/actions/reset';
