// First-party Call Me Sensei grass. Geometry is generated deterministically
// from ToonLab's own tapered-blade recipe; no retained reference mesh,
// texture, or other redistributed binary is required.

import {
  GRASS_CLUMP_GEOMETRY_RECIPE,
  RetainedGrassClumpField,
  StylizedGrassClumpField,
  createGrassClumpGeometry,
  createGrassClumpMaterial,
} from './grassClump.js';
import { createGrassShaderProfileSettings } from './vegetationShaders.js';
import { resolveVegetationQualityOptions } from '../styles/sceneQualityProfiles.js';

export const CALL_ME_SENSEI_GRASS_PROVENANCE = Object.freeze({
  authority: GRASS_CLUMP_GEOMETRY_RECIPE.authority,
  geometryRecipe: GRASS_CLUMP_GEOMETRY_RECIPE.id,
  geometryRecipeVersion: GRASS_CLUMP_GEOMETRY_RECIPE.version,
  license: GRASS_CLUMP_GEOMETRY_RECIPE.license,
  mediaDependencies: GRASS_CLUMP_GEOMETRY_RECIPE.mediaDependencies,
  origin: 'independently authored ToonLab procedural recipe',
  referenceGeometryUsed: false,
});

export const CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS = Object.freeze({
  primary: Object.freeze({
    bladeCount: 40,
    dimensionsMeters: Object.freeze({ depth: 1.68, height: 0.82, width: 1.68 }),
    id: 'primary',
    name: 'Call Me Sensei Grass Clump 1',
    preset: 'call_me_sensei_clump',
    seed: 1337,
    settings: Object.freeze({}),
  }),
  secondary: Object.freeze({
    bladeCount: 56,
    dimensionsMeters: Object.freeze({ depth: 2.04, height: 0.96, width: 2.04 }),
    id: 'secondary',
    name: 'Call Me Sensei Grass Clump 2',
    preset: 'call_me_sensei_clump',
    seed: 7331,
    settings: Object.freeze({
      bladeHeightRange: Object.freeze([0.46, 0.96]),
      bladeWidthRange: Object.freeze([0.04, 0.072]),
      bladesPerClump: 56,
      clumpRadius: 0.82,
    }),
  }),
});

export const DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP = 'primary';

// Kept as an empty compatibility binding. The first-party material is fully
// procedural and deliberately has no packaged texture dependencies.
export const CALL_ME_SENSEI_GRASS_MATERIAL_TEXTURE_URLS = Object.freeze({});

function resolveVariant(value = DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP) {
  const id = String(value || DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP).toLowerCase();
  const aliases = {
    '1': 'primary',
    '2': 'secondary',
    a: 'primary',
    b: 'secondary',
    clump1: 'primary',
    clump2: 'secondary',
    grass1: 'primary',
    grass2: 'secondary',
  };
  const resolved = CALL_ME_SENSEI_GRASS_CLUMP_VARIANTS[aliases[id] ?? id];
  if (!resolved) {
    throw new RangeError(
      `Unknown Call Me Sensei grass clump "${value}". Use "primary" or "secondary".`,
    );
  }
  return resolved;
}

/**
 * Builds the selected first-party clump's three deterministic geometry LODs.
 * The async signature is retained for compatibility with the former loader.
 */
export async function loadCallMeSenseiGrassClump({
  seed,
  variant = DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP,
  ...settings
} = {}) {
  const descriptor = resolveVariant(variant);
  const resolvedSeed = Number.isFinite(Number(seed)) ? Number(seed) : descriptor.seed;
  const geometryLods = [0, 1, 2].map((lod) => createGrassClumpGeometry({
    lod,
    seed: resolvedSeed,
    settings: { ...descriptor.settings, ...settings },
  }));
  return { descriptor, geometryLods };
}

/** Creates ToonLab's own grass material with no image dependencies. */
export async function createCallMeSenseiGrassMaterial({
  groundField = true,
  vegetationShader = null,
  ...settings
} = {}) {
  const resolvedVegetationShader = vegetationShader
    ?? createGrassShaderProfileSettings({ preset: 'call_me_sensei' });
  return createGrassClumpMaterial(settings, resolvedVegetationShader, { groundField });
}

/**
 * Default first-party grass constructor. It generates geometry and material
 * from code, then returns the normal paintable three-LOD field.
 */
export async function createCallMeSenseiGrassField({
  material = null,
  ownsMaterials = false,
  placements = [],
  preset,
  quality = 'balanced',
  seed,
  variant = DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP,
  vegetationShader = null,
  ...options
} = {}) {
  const descriptor = resolveVariant(variant);
  const resolvedSeed = Number.isFinite(Number(seed)) ? Number(seed) : descriptor.seed;
  const resolvedPreset = preset ?? descriptor.preset;
  const resolvedVegetationShader = vegetationShader
    ?? createGrassShaderProfileSettings({ preset: 'call_me_sensei' });
  const qualityOptions = quality === null ? {} : resolveVegetationQualityOptions(quality);
  const settings = {
    ...qualityOptions,
    ...descriptor.settings,
    ...options,
    preset: resolvedPreset,
  };

  if (material) {
    const { geometryLods } = await loadCallMeSenseiGrassClump({
      ...settings,
      seed: resolvedSeed,
      variant: descriptor.id,
    });
    const field = new RetainedGrassClumpField({
      ...qualityOptions,
      ...options,
      geometryLods,
      materials: material,
      ownsMaterials,
      placements,
    });
    geometryLods.forEach((geometry) => geometry.dispose());
    field.name = `${descriptor.name} Field`;
    field.userData.callMeSenseiGrass = {
      default: descriptor.id === DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP,
      firstParty: true,
      geometryRecipe: CALL_ME_SENSEI_GRASS_PROVENANCE.geometryRecipe,
      geometryRecipeVersion: CALL_ME_SENSEI_GRASS_PROVENANCE.geometryRecipeVersion,
      preset: resolvedPreset,
      procedural: true,
      provenance: CALL_ME_SENSEI_GRASS_PROVENANCE,
      variant: descriptor.id,
    };
    return field;
  }

  const field = new StylizedGrassClumpField({
    ...settings,
    placements,
    seed: resolvedSeed,
    vegetationShader: resolvedVegetationShader,
  });
  field.name = `${descriptor.name} Field`;
  field.userData.callMeSenseiGrass = {
    default: descriptor.id === DEFAULT_CALL_ME_SENSEI_GRASS_CLUMP,
    firstParty: true,
    geometryRecipe: CALL_ME_SENSEI_GRASS_PROVENANCE.geometryRecipe,
    geometryRecipeVersion: CALL_ME_SENSEI_GRASS_PROVENANCE.geometryRecipeVersion,
    preset: resolvedPreset,
    procedural: true,
    provenance: CALL_ME_SENSEI_GRASS_PROVENANCE,
    variant: descriptor.id,
  };
  return field;
}
