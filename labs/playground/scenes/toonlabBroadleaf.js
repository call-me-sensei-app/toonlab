import {
  createLegacyTree,
  getLegacyTreePreset,
} from '../../../src/vegetation/legacyTreePresets.js';

// The walkable sample uses only the stable, published pre-species tree set.
// These aliases preserve the scene's existing authored placements while the
// recipe recorded on each instance names the actual public package preset.
const WALKABLE_TREE_PRESETS = Object.freeze({
  example_branching: 'wide-crown',
  species_ash: 'straight',
  species_aspen: 'see-through',
  species_oak_large: 'gnarled',
  species_oak_small: 'curved',
});

const BROADLEAF_LEAF_SHAPES = Object.freeze(['teardrop', 'round', 'maple', 'gingko']);

// Each tree chooses one authored canopy color from this restrained outdoor
// palette. A tree remains chromatically coherent; variation happens between
// trees, not randomly between the leaf cards inside one crown.
export const WALKABLE_CALL_ME_SENSEI_TREE_COLORS = Object.freeze({
  amber: '#c99548',
  deep: '#468f5b',
  meadow: '#5fae57',
  olive: '#91ad50',
  spring: '#75b957',
});
export const WALKABLE_CALL_ME_SENSEI_CANOPY_COLOR =
  WALKABLE_CALL_ME_SENSEI_TREE_COLORS.meadow;

export function createBroadleafTreeRecipe({
  canopyColor = null,
  leafShape = 'teardrop',
  presetId = 'example_branching',
  seedOffset = 0,
  sizeScale = 1,
  styleTarget = {},
  windSpeedScale = 1,
  windStrengthScale = 1,
} = {}) {
  const stablePresetId = WALKABLE_TREE_PRESETS[presetId] ?? WALKABLE_TREE_PRESETS.example_branching;
  const preset = getLegacyTreePreset(stablePresetId);
  const base = structuredClone(preset.options);
  const resolvedCanopyColor = canopyColor ?? WALKABLE_CALL_ME_SENSEI_CANOPY_COLOR;
  const options = {
    ...base,
    canopyColor: resolvedCanopyColor,
    // Pin all three authored palette anchors to the same per-tree color.
    // Lighting and cast shadows may still change brightness, but the crown
    // does not manufacture different green/yellow/cyan leaf populations.
    canopyPalette: {
      crown: resolvedCanopyColor,
      lit: resolvedCanopyColor,
      shadow: resolvedCanopyColor,
    },
    foliage: {
      ...(base.foliage ?? {}),
      windSpeed: (base.foliage?.windSpeed ?? 1) * windSpeedScale,
      windStrength: (base.foliage?.windStrength ?? 0.05) * windStrengthScale,
    },
    leafShape: {
      preset: BROADLEAF_LEAF_SHAPES.includes(leafShape) ? leafShape : 'teardrop',
    },
    seed: (base.seed ?? 1) + seedOffset,
    size: (base.size ?? 1) * sizeScale,
    styleTarget,
    vegetationShader: {
      ...(base.vegetationShader ?? {}),
      settings: {
        ...(base.vegetationShader?.settings ?? {}),
        foliage: {
          ...(base.vegetationShader?.settings?.foliage ?? {}),
          cardVariationStrength: 0,
          hueVariation: 0,
          spriteLuminanceStrength: 0,
        },
      },
    },
  };
  return {
    ...structuredClone(preset),
    metadata: {
      ...structuredClone(preset.metadata),
      walkablePlacementPreset: presetId,
    },
    options,
  };
}

export function createBroadleafTreeInstance(options = {}) {
  const recipe = createBroadleafTreeRecipe(options);
  const tree = createLegacyTree(recipe.id, recipe.options);
  tree.traverse((object) => {
    if (!object.isMesh) return;
    // Public vegetation materials already own their ToonLab shading, shadow,
    // and depth contracts; the host environment adapter must not wrap them.
    object.userData.environmentShaderExclude = true;
  });
  tree.userData.walkableTreeRecipe = recipe;
  tree.userData.walkableCanopy = {
    color: recipe.options.canopyColor,
    mode: 'solid-per-tree',
  };
  tree.userData.waterTreeWind = {
    speedScale: options.windSpeedScale ?? 1,
    strengthScale: options.windStrengthScale ?? 1,
  };
  const uniforms = tree.canopyMesh?.material?.uniforms;
  if (uniforms?.uTime) uniforms.uTime.value = ((recipe.options.seed ?? 1) * 0.137) % 100;
  return { recipe, tree };
}

export function applyBroadleafEnvironment(tree, environment, { cloudShadow, windDirection = [1, 0.3] } = {}) {
  const wind = environment.wind ?? { speed: 1, strength: 0.16 };
  const windScale = tree.userData.waterTreeWind ?? { speedScale: 1, strengthScale: 1 };
  tree.setSun({
    direction: environment.water.sunDirection,
    color: environment.water.sunColor,
    sky: environment.sky.horizonColor,
  });
  tree.setWind({
    direction: windDirection,
    speed: wind.speed * windScale.speedScale,
    strength: (wind.strength ?? 0.16) * 0.45 * windScale.strengthScale,
  });
  if (cloudShadow) tree.setCloudShadow(cloudShadow);
}
