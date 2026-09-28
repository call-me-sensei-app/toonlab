// Built-in building presets — one per type plus studio flavors; each is a
// catalog entry source (id, tags, recipe) like the prop presets.

import { buildingRecipeFromSettings } from './buildingRecipe.js';

const preset = (id, label, tags, settings, description = '') => Object.freeze({
  description,
  id,
  label,
  recipe: Object.freeze(buildingRecipeFromSettings(settings)),
  tags: Object.freeze(tags),
});

export const BUILT_IN_BUILDING_PRESETS = Object.freeze([
  preset('building/cottage/default', 'Cottage', ['building', 'cottage', 'village', 'wave-1'], {
    seed: 12, type: 'cottage',
  }, 'Timber-framed cottage with a chimney — the village workhorse.'),
  preset('building/shed/default', 'Shed', ['building', 'shed', 'village', 'wave-1'], {
    seed: 5, type: 'shed',
  }, 'Single-slope outbuilding.'),
  preset('building/farmhouse/default', 'Farmhouse', ['building', 'farmhouse', 'village', 'wave-2'], {
    seed: 21, type: 'farmhouse',
  }, 'L-plan two-floor farmhouse.'),
  preset('building/watchtower/default', 'Watchtower', ['building', 'tower', 'wave-2'], {
    seed: 33, type: 'watchtower',
  }, 'Four floors stepping inward under a capped hip roof.'),
  preset('building/shrine/default', 'Hillside shrine', ['building', 'shrine', 'wave-3'], {
    seed: 47, type: 'shrine',
  }, 'Open-fronted hall on a stone veranda, curved deep-overhang roof.'),
  preset('building/cottage/call-me-sensei', 'Sensei cottage', ['building', 'cottage', 'village', 'call-me-sensei'], {
    massing: { wallLean: 0.02 },
    palette: {
      beam: [0.28, 0.19, 0.12],
      door: [0.55, 0.28, 0.12],
      roof: [0.5, 0.32, 0.42],
      wall: [0.88, 0.8, 0.64],
    },
    roof: { overhang: 0.7, pitch: 1, ridgeDecor: 0.3 },
    seed: 7,
    type: 'cottage',
  }, 'The studio cottage: oversized plum roof, honeyed plaster, strong lean.'),
]);

export function findBuildingPreset(id) {
  return BUILT_IN_BUILDING_PRESETS.find((entry) => entry.id === id) ?? null;
}
