// Buildings as PropAssets: a building is "just" a big prop with a
// multi-circle footprint — which is exactly why the placement pipeline,
// villages, and the catalog need no building-specific code paths.

import { createBuildingSettings } from './buildingSettings.js';
import { createBuildingFromRecipe, buildingRecipeFromSettings, BUILDING_RECIPE_SCHEMA } from './buildingRecipe.js';

const LOD_DISTANCE = { cottage: 140, farmhouse: 160, shed: 90, shrine: 180, watchtower: 220 };

/**
 * `buildingAsset(recipeOrSettings)` → the 02 PropAsset contract.
 * `build(seed)` re-rolls the seed only (window rhythm, chimney position);
 * the recipe's proportions stay fixed — villages instance cousins, not
 * clones.
 */
export function buildingAsset(recipeOrSettings = {}) {
  const settings = recipeOrSettings?.schema === BUILDING_RECIPE_SCHEMA
    ? createBuildingSettings({ ...recipeOrSettings.options, type: recipeOrSettings.type })
    : createBuildingSettings(recipeOrSettings ?? {});
  return {
    build(seed = settings.seed) {
      const buildSettings = { ...settings, seed };
      const hi = createBuildingFromRecipe(buildSettings, { detail: 'hi' });
      const lo = createBuildingFromRecipe(buildSettings, { detail: 'lo' });
      return {
        anchor: 0, // grammar origin is ground contact; the skirt is buried below
        door: hi.plan.door,
        footprint: { circles: hi.plan.footprintCircles },
        lod: {
          distance: LOD_DISTANCE[settings.type] ?? 150,
          far: lo.object3D,
        },
        object3D: hi.object3D,
        plan: hi.plan,
        stats: hi.stats,
      };
    },
    linear: false,
    recipe: buildingRecipeFromSettings(settings),
    settings,
    type: settings.type,
    variant: settings.type,
  };
}
