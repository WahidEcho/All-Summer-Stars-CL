/**
 * The TV layer — the 1920x1080 broadcast output.
 *
 * A scene never fetches and never measures the viewport. `TvSurface` holds the
 * two subscriptions, `buildSceneModel` derives the figures, `SceneRouter` picks
 * the composition, `BroadcastStage` scales the canvas, and `SceneFrame` carries
 * the persistent header, QR and sponsor crawl. Everything below that line is
 * pure presentation driven by `SceneProps`.
 */

export { BroadcastStage, type BroadcastStageProps } from '@/components/tv/BroadcastStage';
export { SceneFrame, type SceneFrameProps } from '@/components/tv/SceneFrame';
export { SceneRouter } from '@/components/tv/SceneRouter';
export {
  TvSurface,
  type TvSampleOverride,
  type TvSurfaceProps,
} from '@/components/tv/TvSurface';

export {
  CEREMONY_PHASES,
  CONTENT_H,
  CONTENT_PAD_Y,
  HEADER_H,
  HEADER_QR,
  SAFE,
  STAGE_H,
  STAGE_W,
  TICKER_H,
  ceremonyStep,
  resolveCeremonyPhase,
  type CeremonyPhase,
} from '@/components/tv/constants';

export {
  buildSceneModel,
  orderedPlayers,
  type SceneModel,
  type SideModel,
} from '@/components/tv/scene-model';

export {
  payloadBool,
  payloadString,
  type SceneProps,
} from '@/components/tv/scene-props';

export {
  buildAttemptRail,
  mechanicRule,
  mechanicUsesClock,
  mechanicWantsTenths,
  seconds,
  type AttemptRail,
} from '@/components/tv/mechanics';

export {
  SAMPLE_SCENES,
  buildSampleSnapshot,
  parseSamplePhase,
  parseSampleScene,
  sampleSceneDefaults,
} from '@/components/tv/sample-model';

// --- Scenes ---------------------------------------------------------------

export { CeremonyScene } from '@/components/tv/scenes/CeremonyScene';
export { ChallengeResultScene } from '@/components/tv/scenes/ChallengeResultScene';
export { FinalMatchScene } from '@/components/tv/scenes/FinalMatchScene';
export { HeadToHeadScene } from '@/components/tv/scenes/HeadToHeadScene';
export { HoldingScene } from '@/components/tv/scenes/HoldingScene';
export { LeaderboardScene } from '@/components/tv/scenes/LeaderboardScene';
export { LineupsScene } from '@/components/tv/scenes/LineupsScene';
export { LiveRoundScene } from '@/components/tv/scenes/LiveRoundScene';
export { RoundResultScene } from '@/components/tv/scenes/RoundResultScene';

// --- Reusable scene parts -------------------------------------------------

export { BigClock, type BigClockProps } from '@/components/tv/parts/BigClock';
export { LoadingDots, type LoadingDotsProps } from '@/components/tv/parts/LoadingDots';
export { RoundRail, type RoundRailProps } from '@/components/tv/parts/RoundRail';
export {
  SceneHeadline,
  type SceneHeadlineProps,
  type SceneHeadlineSize,
} from '@/components/tv/parts/SceneHeadline';
export { StarBurst, type StarBurstProps } from '@/components/tv/parts/StarBurst';
export { TeamTotals, type TeamTotalsProps } from '@/components/tv/parts/TeamTotals';
export { TopFivePanel, type TopFivePanelProps } from '@/components/tv/parts/TopFivePanel';
export { VerifyingPanel, type VerifyingPanelProps } from '@/components/tv/parts/VerifyingPanel';
