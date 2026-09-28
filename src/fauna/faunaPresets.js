// Built-in fauna presets. Same convention as every cluster: `default` is the
// neutral starting point, `call_me_sensei` is the studio-managed look used
// across the reference worlds — swallow flocks over the treeline, koi in the
// lakes, monarch/morpho meadows, red dragonflies on the water margin.

import { createFaunaRecipeDocument } from './faunaSettings.js';

export const BUILT_IN_FAUNA_PRESETS = Object.freeze([
  Object.freeze({
    description: 'Neutral ambient life at library defaults.',
    id: 'default',
    label: 'Default',
    species: Object.freeze({}),
    settings: Object.freeze({}),
  }),
  Object.freeze({
    description: 'The studio look: tight swallow flocks that perch and flush, koi schools under the refraction, saturated meadow butterflies, akatombo dragonflies skimming the shore.',
    id: 'call_me_sensei',
    label: 'Call Me Sensei',
    species: Object.freeze({ birds: 48, butterflies: 70, dragonflies: 14, fish: 90 }),
    settings: Object.freeze({
      birds: Object.freeze({
        alignment: 0.85,
        altitudeMax: 30,
        cohesion: 0.7,
        neighborRadius: 12,
        palette: 'swallow',
        perchChance: 0.6,
      }),
      butterflies: Object.freeze({ flapHz: 9, palette: 'meadow', wanderRadius: 9 }),
      dragonflies: Object.freeze({ dartChance: 0.55, hoverHeight: 0.55, palette: 'pond' }),
      fish: Object.freeze({ cohesion: 1.0, neighborRadius: 4.5, palette: 'koi' }),
    }),
  }),
]);

export function findFaunaPreset(id) {
  return BUILT_IN_FAUNA_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Preset lookup used by createFauna({ preset }); unknown ids resolve to null. */
export function resolveFaunaPreset(id) {
  if (!id || typeof id !== 'string') return null;
  return findFaunaPreset(id);
}

/** Serializable recipe for a preset (see createFaunaRecipeDocument). */
export function createFaunaPresetRecipe(id, { seed = 1 } = {}) {
  const preset = findFaunaPreset(id);
  if (!preset) return null;
  return createFaunaRecipeDocument({ seed, settings: preset.settings, species: preset.species });
}
