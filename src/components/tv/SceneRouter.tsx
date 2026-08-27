'use client';

import { CeremonyScene } from '@/components/tv/scenes/CeremonyScene';
import { ChallengeResultScene } from '@/components/tv/scenes/ChallengeResultScene';
import { FinalMatchScene } from '@/components/tv/scenes/FinalMatchScene';
import { HeadToHeadScene } from '@/components/tv/scenes/HeadToHeadScene';
import { HoldingScene } from '@/components/tv/scenes/HoldingScene';
import { HydrationBreakScene } from '@/components/tv/scenes/HydrationBreakScene';
import { LeaderboardScene } from '@/components/tv/scenes/LeaderboardScene';
import { LineupsScene } from '@/components/tv/scenes/LineupsScene';
import { LiveRoundScene } from '@/components/tv/scenes/LiveRoundScene';
import { PlayerEntranceScene } from '@/components/tv/scenes/PlayerEntranceScene';
import { RoundResultScene } from '@/components/tv/scenes/RoundResultScene';
import type { SceneProps } from '@/components/tv/scene-props';

/**
 * The one place a `DisplayScene` becomes a composition.
 *
 * Nothing here fetches, derives or decides: the controller has already chosen
 * the scene, `buildSceneModel` has already derived the figures, and this simply
 * hands both to the right component. Keeping the mapping exhaustive means a
 * new scene value cannot be added to `DisplayScene` without the compiler
 * pointing at this switch.
 *
 * There is deliberately no cross-fade wrapper. Every scene owns its own
 * entrance choreography, and a scene cut on a live wall should land as a cut —
 * layering two full 1920x1080 compositions over each other would double the
 * furniture and blur the score for the duration of the blend.
 */
export function SceneRouter(props: SceneProps) {
  switch (props.scene) {
    case 'holding':
      return <HoldingScene {...props} />;
    case 'lineups':
      return <LineupsScene {...props} />;
    case 'head_to_head':
      return <HeadToHeadScene {...props} />;
    case 'live_round':
      return <LiveRoundScene {...props} />;
    case 'round_result':
      return <RoundResultScene {...props} />;
    case 'challenge_result':
      return <ChallengeResultScene {...props} />;
    case 'final_match':
      return <FinalMatchScene {...props} />;
    case 'leaderboard':
      return <LeaderboardScene {...props} />;
    case 'ceremony':
      return <CeremonyScene {...props} />;
    case 'player_entrance':
      return <PlayerEntranceScene {...props} />;
    case 'hydration_break':
      return <HydrationBreakScene {...props} />;
    // 'auto' is resolved by the director inside TvSurface and should never
    // reach the router; if it somehow does, the holding slate is the one
    // composition that is always safe to show in front of a crowd.
    case 'auto':
    default: {
      return <HoldingScene {...props} scene="holding" />;
    }
  }
}

export default SceneRouter;
