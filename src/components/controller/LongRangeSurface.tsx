'use client';

/**
 * Challenge 3 — LONG-RANGE SHOOTING.
 *
 * The first player takes all three shots, then the second. The zone buttons
 * are painted with the board's own colours (green 100, blue 50, red 30, red
 * 20) so the operator's eye can go straight from the board to the button, and
 * every one of them still carries its written label and point value for
 * anyone who cannot rely on the colour.
 */

import { Panel } from '@/components/controller/ControlButton';
import { useController } from '@/components/controller/controller-context';
import { ZoneScoringSurface } from '@/components/controller/ZoneScoringSurface';
import { configOfMechanic } from '@/components/controller/controller-model';

export function LongRangeSurface() {
  const { config } = useController();
  const longRange = configOfMechanic(config, 'long_range');

  if (!longRange) {
    return (
      <Panel tone="sunken">
        <p className="u-display text-h3 text-text-secondary">
          THIS CHALLENGE IS NOT CONFIGURED AS LONG-RANGE SHOOTING
        </p>
        <p className="text-body text-text-secondary">
          Check the scoring profile: challenge 3 must carry the `long_range` mechanic.
        </p>
      </Panel>
    );
  }

  return (
    <ZoneScoringSurface
      options={longRange.zones}
      missPoints={longRange.missPoints}
      useOptionColour
      instruction={`${longRange.attemptsPerPlayer} shots, one player at a time`}
      payloadFor={(zoneId) => ({ kind: 'long_range', zoneId })}
    />
  );
}

export default LongRangeSurface;
