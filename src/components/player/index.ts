/**
 * The player-card family.
 *
 * Every card shares one visual DNA — dominant cut-out portrait, oversized
 * name, rank badge, points, team accent, star geometry, and a branded
 * silhouette fallback when `photo_url` is null — so a player is recognisable
 * whether they are filling the LED wall or sitting in a ten-up squad grid.
 *
 * All of them accept a `PlayerRow` or a `RankedPlayer`; ranked players supply
 * their own rank and totals, and any of those can be overridden by prop.
 */

export {
  CompactPlayerCard,
  type CompactPlayerCardEmphasis,
  type CompactPlayerCardProps,
  type CompactPlayerCardSize,
} from '@/components/player/CompactPlayerCard';
export {
  HeadToHeadCard,
  HeadToHeadPair,
  type HeadToHeadCardProps,
  type HeadToHeadPairProps,
  type HeadToHeadSize,
} from '@/components/player/HeadToHeadCard';
export {
  HeroPlayerCard,
  type HeroPlayerCardProps,
  type HeroPlayerCardSize,
  type HeroPlayerCardTone,
} from '@/components/player/HeroPlayerCard';
export {
  LineupCard,
  type LineupCardProps,
  type LineupCardSize,
  type LineupCardStatus,
} from '@/components/player/LineupCard';
export {
  LiveSideCard,
  type LiveSideCardProps,
  type LiveSideCardSize,
} from '@/components/player/LiveSideCard';
export {
  PenaltyTakerCard,
  type PenaltyTakerCardProps,
  type PenaltyTakerCardSize,
  type PenaltyTakerStatus,
} from '@/components/player/PenaltyTakerCard';
export {
  PlayerCardFallback,
  type PlayerCardFallbackProps,
  type PlayerCardFallbackTone,
} from '@/components/player/PlayerCardFallback';
export { PlayerGhost, type PlayerGhostProps } from '@/components/player/PlayerGhost';
export {
  PlayerNameLockup,
  type PlayerNameLockupProps,
  type PlayerNameSize,
  type PlayerNameTone,
} from '@/components/player/PlayerNameLockup';
export { PlayerPhoto, type PlayerPhotoProps } from '@/components/player/PlayerPhoto';
export {
  PodiumCard,
  type PodiumCardProps,
  type PodiumCardSize,
  type PodiumCardStat,
} from '@/components/player/PodiumCard';
export {
  ScorerLowerThird,
  type ScorerLowerThirdKind,
  type ScorerLowerThirdProps,
  type ScorerLowerThirdSize,
} from '@/components/player/ScorerLowerThird';

export {
  displayNameOf,
  firstNameScale,
  focalPosition,
  initialsOf,
  isRanked,
  nameParts,
  introNameParts,
  portraitSrc,
  rankOf,
  sizedPortraitSrc,
  slotLabelOf,
  surnameScale,
  teamCodeOf,
  totalPointsOf,
  type NameParts,
  type PlayerCardBaseProps,
  type PlayerLike,
} from '@/components/player/player-identity';
