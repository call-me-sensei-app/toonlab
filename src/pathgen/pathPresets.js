// Built-in path network presets. Same convention as every cluster:
// `default` is the neutral starting point, `call_me_sensei` is the
// studio-managed look used across the reference worlds.

import { createPathRecipeDocument } from './pathSettings.js';

export const BUILT_IN_PATH_PRESETS = Object.freeze([
  Object.freeze({
    description: 'Neutral dirt trail network with plank bridges.',
    id: 'default',
    label: 'Default',
    recipe: Object.freeze(createPathRecipeDocument({
      auto: { count: 4, styles: ['dirt'] },
      seed: 1,
    })),
  }),
  Object.freeze({
    description: 'The studio look: wandering dirt trails, a stone spine road, arched bridges with rails, stairs on the climbs.',
    id: 'call_me_sensei',
    label: 'Call Me Sensei',
    recipe: Object.freeze(createPathRecipeDocument({
      auto: { count: 5, styles: ['dirt', 'dirt', 'stone'] },
      seed: 7,
      settings: {
        bridge: { arc: 0.11, railStyle: 'posts' },
        ribbon: { edgeFade: 1.8, width: 2.8, widthWobble: 0.28 },
        routing: { reuseBonus: 0.5, slopeCost: 30 },
      },
    })),
  }),
]);

export function findPathPreset(id) {
  return BUILT_IN_PATH_PRESETS.find((preset) => preset.id === id) ?? null;
}
