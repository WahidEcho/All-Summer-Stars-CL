/**
 * UI primitives for the SwanLake Football Stars broadcast surfaces.
 *
 * Everything here is presentation only — no data fetching, no Supabase, no
 * scoring logic. Point values always arrive as props from the scoring engine.
 */

export { AnimatedNumber, type AnimatedNumberProps } from '@/components/ui/AnimatedNumber';
export {
  AttemptDots,
  attemptDotStates,
  type AttemptDotState,
  type AttemptDotsProps,
  type AttemptDotsSize,
} from '@/components/ui/AttemptDots';
export {
  ChallengeProgressRail,
  challengeRailItems,
  type ChallengeProgressRailProps,
  type ChallengeProgressRailSize,
  type ChallengeRailItem,
  type ChallengeRailStatus,
} from '@/components/ui/ChallengeProgressRail';
export {
  PointsBurst,
  type PointsBurstProps,
  type PointsBurstSize,
  type PointsBurstTone,
} from '@/components/ui/PointsBurst';
export {
  ProgressRail,
  type ProgressRailProps,
  type ProgressRailSize,
  type ProgressRailTone,
} from '@/components/ui/ProgressRail';
export { RankBadge, type RankBadgeProps, type RankBadgeSize, type RankBadgeTone } from '@/components/ui/RankBadge';
export { RankDelta, type RankDeltaProps, type RankDeltaSize } from '@/components/ui/RankDelta';
export {
  ScoreNumeral,
  type ScoreNumeralProps,
  type ScoreNumeralSize,
  type ScoreNumeralTone,
} from '@/components/ui/ScoreNumeral';
export { Stat, type StatProps, type StatSize, type StatTone } from '@/components/ui/Stat';
export {
  Pill,
  StatusPill,
  type StatusPillProps,
  type StatusPillSize,
  type StatusPillTone,
  type StatusPillVariant,
} from '@/components/ui/StatusPill';
export {
  TeamScoreStrip,
  type TeamScoreStripProps,
  type TeamScoreStripSize,
  type TeamScoreStripTeam,
} from '@/components/ui/TeamScoreStrip';

export {
  NEUTRAL_ACCENT,
  TEAM_FALLBACK_COLOR,
  luminance,
  readableOn,
  teamAccentVars,
  teamRowAccentVars,
  type TeamAccentVars,
} from '@/components/ui/team-accent';

export {
  DURATION,
  DURATION_MS,
  EASE,
  SCORE_SEQUENCE,
  SPRING,
  staggerFor,
  transitionToken,
  useDuration,
  useMotionScale,
  useTransitionToken,
  type DurationToken,
  type EaseToken,
} from '@/components/ui/motion-tokens';
