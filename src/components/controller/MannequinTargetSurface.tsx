'use client';

/**
 * Challenge 1 — MANNEQUIN TARGET.
 *
 * Three shots each from the same spot. Four enormous buttons: one per target
 * in the profile, plus MISS. Both players' attempts and running totals sit
 * side by side underneath, so the operator can see the whole round at a
 * glance without scrolling.
 */

import { Panel } from '@/components/controller/ControlButton';
import { useController } from '@/components/controller/controller-context';
import { ZoneScoringSurface } from '@/components/controller/ZoneScoringSurface';
import { configOfMechanic } from '@/components/controller/controller-model';

export function MannequinTargetSurface() {
  const { config } = useController();
  const mannequin = configOfMechanic(config, 'mannequin_target');

  if (!mannequin) {
    return (
      <Panel tone="sunken">
        <p className="u-display text-h3 text-text-secondary">
          THIS CHALLENGE IS NOT CONFIGURED AS A MANNEQUIN TARGET
        </p>
        <p className="text-body text-text-secondary">
          Check the scoring profile: challenge 1 must carry the `mannequin_target` mechanic.
        </p>
      </Panel>
    );
  }

  return (
    <ZoneScoringSurface
      options={mannequin.targets}
      missPoints={mannequin.missPoints}
      useOptionColour={false}
      instruction={`${mannequin.attemptsPerPlayer} shots each`}
      payloadFor={(targetId) => ({ kind: 'mannequin_target', targetId })}
    />
  );
}

export default MannequinTargetSurface;
