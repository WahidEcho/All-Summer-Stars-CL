/**
 * Active Score Controller component barrel.
 *
 * The courtside console: a tablet held at arm's length, outdoors, in August
 * sun, driven by one person who is also watching the football. Everything here
 * is built for that — oversized targets, one command in flight at a time, and
 * no state carried by colour alone.
 *
 * Point values are never hardcoded in any of it. Every button label and every
 * number on this surface comes from the event's scoring profile.
 */

export {
  ControlButton,
  ConfirmControlButton,
  Panel,
  SegmentedChoice,
  type ControlButtonProps,
  type ControlSize,
  type ControlTone,
  type SegmentedOption,
} from '@/components/controller/ControlButton';

export { Modal, type ModalProps } from '@/components/controller/Modal';

export {
  ControllerTopBar,
  type ControllerTopBarProps,
} from '@/components/controller/ControllerTopBar';

export { LeaseControls, type LeaseControlsProps } from '@/components/controller/LeaseControls';

export {
  ControllerProvider,
  useController,
  type ControllerContextValue,
} from '@/components/controller/controller-context';

export {
  useCommandRunner,
  type CommandFailure,
  type CommandRunner,
  type RunSpec,
  type UseCommandRunnerOptions,
} from '@/components/controller/useCommandRunner';

export {
  useControllerCommands,
  type ControllerCommands,
  type RecordAttemptIntent,
} from '@/components/controller/useControllerCommands';

export {
  AttemptSlotGrid,
  AwaitingOfficialScore,
  RoundGate,
  SideBySide,
  SideDots,
  TurnSwitch,
  playerNameOf,
} from '@/components/controller/SurfaceParts';

// --- the five mechanics --------------------------------------------------

export { MannequinTargetSurface } from '@/components/controller/MannequinTargetSurface';
export { DribbleFinishSurface } from '@/components/controller/DribbleFinishSurface';
export { LongRangeSurface } from '@/components/controller/LongRangeSurface';
export { CentreCircleSurface } from '@/components/controller/CentreCircleSurface';
export { FinalMatchSurface } from '@/components/controller/FinalMatchSurface';
export { PenaltyShootoutSurface } from '@/components/controller/PenaltyShootoutSurface';
export {
  ZoneScoringSurface,
  type ZoneScoringSurfaceProps,
} from '@/components/controller/ZoneScoringSurface';

// --- the pure read model -------------------------------------------------

export {
  GOAL_METHODS,
  accentFor,
  attemptAt,
  buildTimeline,
  configForChallenge,
  configOfMechanic,
  describeAttempt,
  dribbleBreakdown,
  eligiblePlayers,
  formatShortClock,
  isConfirmedDraw,
  nextFreeAttemptNumber,
  previewPoints,
  relativeTime,
  shootoutTurn,
  sideStatesFor,
  slotLabelForPlayer,
  suggestedSide,
  turnRuleFor,
  undoTargetOf,
  type AttemptBreakdown,
  type AttemptDescription,
  type BreakdownLine,
  type GoalMethodId,
  type JournalNote,
  type SideState,
  type TimelineEntry,
  type TimelineKind,
  type TurnRule,
  type UndoTarget,
} from '@/components/controller/controller-model';
export { RoundStartRail } from '@/components/controller/RoundStartRail';
