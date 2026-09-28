// Neutral style presets — the un-stylized counterpart of every style slot.
//
// A before/after comparison is only honest if the "before" is a real,
// defensible baseline. Before this module, `rock` was the only domain that
// shipped a `neutral` preset, so a whole-scene "here is what ToonLab does to
// your scene" claim had nothing to compare against for toon, environment,
// manufactured surface, tree, grass, ground, water, sky or cloud.
//
// WHAT NEUTRAL MEANS HERE
//
//   Neutral is un-stylized STANDARD PBR, not "off". Source albedo, normal,
//   roughness, metalness and AO maps stay bound at full strength; real shadows,
//   real specular and real transmission stay on. What is removed is the
//   stylization layered over them: cel banding, outlines, rim and edge ink,
//   colour lifts, hue shifts, palette tints, aerial-perspective tinting,
//   graphic projection and painted wash.
//
//   A neutral preset therefore changes SHADING ONLY. It never changes geometry,
//   density, placement, tiling, motion, wind, or the masks that decide which
//   material goes where — because a comparison in which the two halves have
//   different geometry is exactly the thing this pass exists to eliminate.
//   `auditNeutralStyleShadingOnly()` asserts that property mechanically.
//
// SYMMETRY
//
//   Every entry is generated from the same table against the same slot ids as
//   `CALL_ME_SENSEI_STYLE_SLOT_IDS`, so `NEUTRAL_STYLE_BUNDLE` and
//   `CALL_ME_SENSEI_STYLE_BUNDLE` are guaranteed to name the same slots. Two
//   slots are deliberately NOT paired, and `describeNeutralStyleCoverage()`
//   reports why rather than hiding it — see `abSafe: false` below.

import { createEnvironmentSettings } from '../environment/environmentMaterialAdapter.js';
import { registerEnvironmentPreset } from '../environment/environmentPresets.js';
import {
  createUrbanPropShaderProfileDocument,
  createUrbanPropShaderProfileSettings,
} from '../environment/urbanPropMaterial.js';
import {
  createGroundShaderSettings,
  registerGroundShaderPreset,
} from '../ground-shader/groundShaderSettings.js';
import { registerPostProcessingPreset } from '../post/postProcessing.js';
import { createSkySettings, registerSkyPreset } from '../sky/stylizedSky.js';
import { createToonSettings, registerToonPreset } from '../toon/toonSettings.js';
import { createGrassSettings, registerGrassPreset } from '../vegetation/stylizedGrass.js';
import { registerVegetationShaderPreset } from '../vegetation/vegetationShaders.js';
import { registerWaterStyle } from '../water/waterSettings.js';
import { createStyleBundleDocument, CALL_ME_SENSEI_STYLE_SLOT_IDS } from './styleBundle.js';

/** The reserved id every domain uses for its un-stylized baseline. */
export const NEUTRAL_STYLE_PRESET_ID = 'neutral';

const NEUTRAL_DESCRIPTION = 'Un-stylized standard PBR baseline: source maps at full strength, real shadows and specular, and no stylization layered on top. The "before" half of a ToonLab comparison.';

// ---------------------------------------------------------------------------
// Per-domain neutral settings. Each block strips stylization and leaves the
// physical response — and, where a key controls geometry, density, tiling,
// masking or motion, it is deliberately absent so both halves stay identical.
// ---------------------------------------------------------------------------

/**
 * Character toon shading. Disables every graphic feature (face maps and face
 * normals, painted tones and the terminator band, outlines, rim, highlights,
 * the automatic lighting map) and softens the terminator into a broad
 * Lambert-like falloff with a neutral grey shadow. Cast shadows, material maps
 * and alpha stay ON — that is the PBR half of the comparison.
 */
export const NEUTRAL_TOON_SETTINGS = Object.freeze({
  face: { enabled: false },
  fur: { enabled: false },
  highlights: { enabled: false },
  light: { skyFloor: 0 },
  outline: { enabled: false },
  ramp: { enabled: false },
  rim: { enabled: false },
  shading: { lightingMap: { auto: false }, softness: 0.5 },
  shadows: { character: { enabled: true }, enabled: true },
  sticker: { enabled: false },
});

/**
 * Vegetation shader — one registration serves the `treeShader`, `grassShader`
 * and `flowerShader` scopes, which share a registry. Bands go to their
 * smoothest admissible form (`bandCount` is clamped to `[2, 6]`, so 6 with full
 * softness is the closest the schema gets to continuous), tints and rim fills
 * go to zero, and physical transmission (`thinSurface`) and weather response
 * are left exactly as authored because they are PBR, not stylization.
 */
export const NEUTRAL_VEGETATION_SHADER_SETTINGS = Object.freeze({
  bark: {
    bandCount: 6,
    bandSoftness: 1,
    emissiveStrength: 0,
    normalFlatness: 0,
    rimStrength: 0,
    roughness: 1,
    shadowFloor: 0,
    skyFillStrength: 0,
    specularStrength: 0,
    sunTintStrength: 0,
    tintStrength: 0,
    verticalShadeStrength: 0,
  },
  flower: {
    backlitStrength: 0,
    bandSoftness: 1,
    emissiveStrength: 0,
    tintStrength: 0,
    unlitPetalLift: 0,
  },
  foliage: {
    backlitStrength: 0,
    bandSoftness: 1,
    cardVariationStrength: 0,
    crestSoftness: 1,
    crownOcclusionStrength: 0,
    emissiveStrength: 0,
    gradientContrast: 1,
    gradientOffset: 0,
    hueShift: 0,
    hueVariation: 0,
    spriteLuminanceStrength: 0,
    styleColorStrength: 0,
  },
  grass: {
    backlitStrength: 0,
    bandSoftness: 1,
    colorVariationStrength: 0,
    emissiveStrength: 0,
    gustSheenStrength: 0,
    rootOcclusionStrength: 0,
    shadowFloor: 0,
    styleColorStrength: 0,
    tipDesaturation: 0,
    tipHueShift: 0,
  },
  lighting: {
    rimStrength: 0,
    shadowTintStrength: 0,
    skyFillStrength: 0,
    sunTintStrength: 0,
  },
  stem: {
    bandCount: 6,
    bandSoftness: 1,
    colorStrength: 0,
    emissiveStrength: 0,
    rimStrength: 0,
    shadowFloor: 0,
    skyFillStrength: 0,
  },
});

/**
 * Grass field. SHADING KEYS ONLY — `bladesPerClump`, `clumpRadius`,
 * `bladeHeightRange`, `bladeWidthRange`, `leanStrength`, every wind/gust key
 * and `pushRadius` are intentionally absent so the neutral and styled halves
 * grow the identical blades in the identical places with the identical motion.
 */
export const NEUTRAL_GRASS_SETTINGS = Object.freeze({
  backlitStrength: 0,
  baseColor: Object.freeze([0.118, 0.196, 0.075]),
  cloudShadowStrength: 0,
  groundAdoptStrength: 0,
  groundAdoptTint: Object.freeze([1, 1, 1]),
  shadowStrength: 0.5,
  shadowTint: Object.freeze([1, 1, 1]),
  tipColor: Object.freeze([0.196, 0.298, 0.11]),
  washLift: 0,
  washOpacity: 1,
});

/**
 * Ground shader. Projection scales, slope thresholds and shoreline widths are
 * copied from the `call_me_sensei` preset ON PURPOSE: those decide WHICH layer
 * is painted WHERE and at what tiling. Keeping them equal means the neutral
 * half paints the identical mask at the identical scale, and only the treatment
 * differs — layer tints go neutral, macro variation and edge highlight go to
 * zero, shadows lose their tint and lift, and the aerial distance tint is off.
 */
export const NEUTRAL_GROUND_SHADER_SETTINGS = Object.freeze({
  distance: { detailFade: 1, strength: 0 },
  layers: {
    brightness: 0,
    contrast: 1,
    dirtTint: [1, 1, 1],
    grassTint: [1, 1, 1],
    rockTint: [1, 1, 1],
    sandTint: [1, 1, 1],
    saturation: 1,
    textureStrength: 1,
  },
  lighting: {
    backShadowStrength: 0,
    shadowLift: 0,
    shadowTint: [1, 1, 1],
    shadowTintStrength: 0,
    skyFillStrength: 0,
    sunIntensity: 1,
  },
  macro: { amount: 0, secondaryAmount: 0, tintStrength: 0 },
  material: { emissiveStrength: 0, metalness: 0, roughness: 1 },
  // Identical to call_me_sensei — mask geometry, not look.
  projection: {
    dirtScale: 13,
    grassScale: 16,
    rockScale: 25,
    sandScale: 10,
    triplanarSharpness: 2,
    triplanarStrength: 1,
  },
  printResponse: { rimLightening: 0 },
  shoreline: { autoSandStrength: 0, bandWidth: 0.75, softness: 0.25, wetBandWidth: 0.75 },
  slope: {
    autoRockStrength: 1,
    edgeHighlight: 0,
    fade: 0.05,
    noiseScale: 1 / 80,
    noiseStrength: 0.08,
    start: 0.15,
  },
});

/**
 * Environment. Keeps every map-consuming and light-consuming feature on and
 * turns off the five graphic ones (AO overlay, the authored left-side shade,
 * sky tinting, sun boost and the untextured gradient), then flattens the
 * grading parameters to unity.
 */
export const NEUTRAL_ENVIRONMENT_PRESET = Object.freeze({
  features: Object.freeze({
    aoOverlay: false,
    leftSideShadow: false,
    skyTint: false,
    sunBoost: false,
    untexturedGradient: false,
  }),
  parameters: Object.freeze({
    aoWarmth: 0,
    cloudShadowStrength: 0,
    directLightStrength: 1,
    exposure: 1,
    lightingInfluence: 1,
    saturation: 1,
    shadowLift: 0,
    shadowTintColor: [1, 1, 1],
    skyTintStrength: 0,
    triplanarDetail: 0,
    triplanarEdgeHighlight: 0,
    untexturedGradientStrength: 0,
  }),
});

/**
 * Manufactured surface. Every `*Enabled` control that adds a graphic layer goes
 * to 0; source authority, normal detail, reflection probes, decals and graphics
 * stay at 1 so the surface still reads as the material it actually is.
 */
export const NEUTRAL_MANUFACTURED_SURFACE_SETTINGS = Object.freeze({
  celLightingEnabled: 0,
  colorLiftEnabled: 0,
  colorLiftStrength: 0,
  coolShadowsEnabled: 0,
  coolShadowStrength: 0,
  decalStrength: 1,
  edgeInkEnabled: 0,
  fresnelEnabled: 0,
  fresnelStrength: 0,
  graphicsEnabled: 1,
  highlightBandEnabled: 0,
  highlightBandStrength: 0,
  materialResponseEnabled: 0,
  materialResponseStrength: 0,
  normalDetailEnabled: 1,
  paintBandsEnabled: 0,
  paintExtractionEnabled: 1,
  paintExtractionStrength: 1,
  pastelPaletteEnabled: 0,
  pastelStrength: 0,
  planarSheenEnabled: 0,
  planarSheenStrength: 0,
  reflectionNormalEnabled: 1,
  reflectionProbeLayerEnabled: 1,
  reflectionSelectivityEnabled: 0,
  rimEnabled: 0,
  roughnessBreakupEnabled: 0,
  shadowPastelEnabled: 0,
  shadowPastelStrength: 0,
  silhouetteInkEnabled: 0,
  sourceAuthorityEnabled: 1,
  sourceAuthorityStrength: 1,
  viewReflectionEnabled: 1,
  wearEnabled: 0,
});

/**
 * Water. `colorTone: 'classic'` is the schema's own "palette untouched" tone —
 * it hands colour back to the preset instead of force-applying the `anime`
 * palette over it (see D19-005). Motion identity stays owned by the preset, so
 * both halves run the same waves.
 */
export const NEUTRAL_WATER_STYLE = Object.freeze({
  settings: Object.freeze({
    colorTone: 'classic',
    sceneShadowStrength: 1,
  }),
});

/**
 * Sky. A restrained physical-looking gradient with the signature glow and
 * saturation pulled back. Cloud coverage, scale, speed, direction and seed are
 * NOT set — cloud shape is geometry, and both halves must see the same clouds.
 */
export const NEUTRAL_SKY_SETTINGS = Object.freeze({
  // Cloud SEED is scene identity, not style: two halves drawing differently
  // shaped clouds is a scene comparison, not a shader comparison. Pinned to the
  // same seed the styled preset uses so the shapes match and only the treatment
  // differs. Coverage/scale/speed stay unpinned — they are driven by the shared
  // scenario axis, which both halves see identically.
  cloudSeed: 7,
  horizonColor: [0.71, 0.79, 0.86],
  horizonScattering: 0.5,
  sunGlowStrength: 0.6,
  zenithColor: [0.22, 0.42, 0.72],
});

/** Post. Pipeline stays enabled at zero strength — same cost, no grade. */
export const NEUTRAL_POST_SETTINGS = Object.freeze({
  features: Object.freeze({
    bloom: false,
    colorGrade: false,
    enabled: true,
    verticalGrade: false,
    vignette: false,
  }),
  parameters: Object.freeze({
    bloomStrength: 0,
    bottomDark: 0,
    contrast: 1,
    exposure: 1,
    saturation: 1,
    strength: 0,
    topLight: 0,
    vignetteStrength: 0,
    warmth: 0,
  }),
});

/** Portable manufactured-surface document, for the bundle's `{ document }` payload. */
export const NEUTRAL_MANUFACTURED_SURFACE_DOCUMENT = Object.freeze(
  createUrbanPropShaderProfileDocument(NEUTRAL_STYLE_PRESET_ID, {
    description: NEUTRAL_DESCRIPTION,
    label: 'Neutral',
    settings: NEUTRAL_MANUFACTURED_SURFACE_SETTINGS,
  }),
);

// ---------------------------------------------------------------------------
// Registration — one table, one loop, so every slot is treated identically.
// ---------------------------------------------------------------------------

const REGISTRARS = Object.freeze({
  environment: () => registerEnvironmentPreset(NEUTRAL_STYLE_PRESET_ID, {
    features: { ...NEUTRAL_ENVIRONMENT_PRESET.features },
    label: 'Neutral',
    parameters: { ...NEUTRAL_ENVIRONMENT_PRESET.parameters },
  }, { overwrite: true }),
  grass: () => registerGrassPreset(NEUTRAL_STYLE_PRESET_ID, {
    description: NEUTRAL_DESCRIPTION,
    label: 'Neutral',
    settings: { ...NEUTRAL_GRASS_SETTINGS },
  }, { overwrite: true }),
  groundShader: () => registerGroundShaderPreset(NEUTRAL_STYLE_PRESET_ID, {
    description: NEUTRAL_DESCRIPTION,
    label: 'Neutral',
    settings: NEUTRAL_GROUND_SHADER_SETTINGS,
  }, { overwrite: true }),
  post: () => registerPostProcessingPreset(NEUTRAL_STYLE_PRESET_ID, {
    description: NEUTRAL_DESCRIPTION,
    label: 'Neutral',
    settings: NEUTRAL_POST_SETTINGS,
  }, { overwrite: true }),
  sky: () => registerSkyPreset(NEUTRAL_STYLE_PRESET_ID, {
    description: NEUTRAL_DESCRIPTION,
    label: 'Neutral',
    settings: { ...NEUTRAL_SKY_SETTINGS },
  }, { overwrite: true }),
  toon: () => registerToonPreset(NEUTRAL_STYLE_PRESET_ID, {
    description: NEUTRAL_DESCRIPTION,
    label: 'Neutral',
    settings: NEUTRAL_TOON_SETTINGS,
  }, { overwrite: true }),
  vegetationShader: () => registerVegetationShaderPreset(NEUTRAL_STYLE_PRESET_ID, {
    description: NEUTRAL_DESCRIPTION,
    label: 'Neutral',
    settings: NEUTRAL_VEGETATION_SHADER_SETTINGS,
  }, { overwrite: true }),
  water: () => registerWaterStyle(NEUTRAL_STYLE_PRESET_ID, {
    description: NEUTRAL_DESCRIPTION,
    label: 'Neutral',
    ...NEUTRAL_WATER_STYLE,
  }, { overwrite: true }),
});

/**
 * Per-slot coverage. `authored` slots gained a neutral counterpart here;
 * `shipped` already had one; `inherited` resolves to schema defaults because
 * the domain has no style registry; `excluded` has no usable neutral and says
 * why. Nothing is silently missing.
 */
export const NEUTRAL_STYLE_SLOT_COVERAGE = Object.freeze({
  cloud: Object.freeze({
    abSafe: true,
    coverage: 'inherited',
    note: 'There is no cloud style registry — the slot resolves to SkyParams schema defaults for every style, neutral included (see D19-006). Schema defaults ARE the un-stylized cloud.',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  environment: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'environment',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  flowerShader: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'vegetationShader',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  grass: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'grass',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  grassShader: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'vegetationShader',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  groundShader: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'groundShader',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  lighting: Object.freeze({
    abSafe: false,
    coverage: 'excluded',
    note: 'Deliberately unpaired. A lighting style owns sun intensity, sun path and the day cycle, so a neutral lighting style changes LIGHT TRANSFORMS — which §11 requires both halves of a comparison to share. Neutral lighting would be unusable in the only construction it exists for.',
  }),
  manufacturedSurface: Object.freeze({
    abSafe: true,
    coverage: 'authored',
    note: 'Carried as an inline document: the manufactured-surface slot has no style registry, so a { style } payload resolves to defaults regardless of the id.',
    payload: Object.freeze({ document: NEUTRAL_MANUFACTURED_SURFACE_DOCUMENT }),
    registrar: null,
  }),
  post: Object.freeze({
    abSafe: false,
    coverage: 'authored',
    note: 'Registered and usable, but not part of an A/B: post runs over the composited frame, after both scissored renders, so it cannot differ per half. Both halves must share it — which §11 also requires ("stable exposure").',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
    registrar: 'post',
  }),
  rock: Object.freeze({
    abSafe: true,
    coverage: 'shipped',
    note: 'Pre-existing — registered by src/rock-shader/rockShaderSettings.js. The only domain that already had a neutral preset.',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  sky: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'sky',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  toon: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'toon',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  treeShader: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'vegetationShader',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
  water: Object.freeze({
    abSafe: true, coverage: 'authored', registrar: 'water',
    payload: Object.freeze({ style: NEUTRAL_STYLE_PRESET_ID }),
  }),
});

let registered = false;

/**
 * Registers `neutral` into every domain registry that has one. Idempotent and
 * safe to call from any entry point; returns the per-registrar result.
 */
export function registerNeutralStylePresets({ force = false } = {}) {
  if (registered && !force) return { alreadyRegistered: true, registrars: [] };
  const registrars = [];
  for (const [id, register] of Object.entries(REGISTRARS)) {
    try {
      registrars.push({ id, ok: true, result: register() });
    } catch (error) {
      registrars.push({ error: String(error?.message ?? error), id, ok: false });
    }
  }
  registered = true;
  return { alreadyRegistered: false, registrars };
}

registerNeutralStylePresets();

/**
 * The neutral counterpart of `CALL_ME_SENSEI_STYLE_BUNDLE`. Same slot ids,
 * minus the two that cannot honestly carry a neutral half — so applying this
 * bundle and then the Call Me Sensei bundle to the same scene produces a
 * symmetric A/B in which only material treatment changed.
 */
export const NEUTRAL_STYLE_BUNDLE = createStyleBundleDocument('neutral', {
  description: 'Un-stylized standard-PBR baseline for every slot that can carry one. The measured "before" half of a ToonLab style comparison.',
  label: 'Neutral',
  slots: Object.fromEntries(
    CALL_ME_SENSEI_STYLE_SLOT_IDS
      .map((slotId) => [slotId, NEUTRAL_STYLE_SLOT_COVERAGE[slotId]])
      .filter(([, entry]) => entry?.abSafe && entry.payload)
      .map(([slotId, entry]) => [slotId, entry.payload]),
  ),
});

/** The slot ids `NEUTRAL_STYLE_BUNDLE` actually carries. */
export const NEUTRAL_STYLE_SLOT_IDS = Object.freeze(Object.keys(NEUTRAL_STYLE_BUNDLE.slots));

/**
 * Reports neutral coverage per slot against the Call Me Sensei slot list, so a
 * gap is visible instead of implied.
 */
export function describeNeutralStyleCoverage() {
  return CALL_ME_SENSEI_STYLE_SLOT_IDS.map((slotId) => {
    const entry = NEUTRAL_STYLE_SLOT_COVERAGE[slotId] ?? { coverage: 'missing' };
    return {
      abSafe: entry.abSafe ?? false,
      coverage: entry.coverage,
      inBundle: Object.hasOwn(NEUTRAL_STYLE_BUNDLE.slots, slotId),
      note: entry.note ?? '',
      slot: slotId,
    };
  });
}

/**
 * Keys per domain that control geometry, density, placement, tiling, masking or
 * motion. A neutral preset that touched one of these would make the two halves
 * structurally different, which is the failure this whole pass exists to
 * prevent. Used by {@link auditNeutralStyleShadingOnly}.
 */
export const NEUTRAL_STYLE_NON_SHADING_KEYS = Object.freeze({
  grass: Object.freeze([
    'bladeHeightRange', 'bladeWidthRange', 'bladesPerClump', 'clumpRadius',
    'gustFrequency', 'gustResponse', 'gustSpeed', 'leanStrength', 'pushRadius',
    'windDirection', 'windResponse', 'windSpeed', 'windStrength',
  ]),
  groundShader: Object.freeze([
    'projection.dirtScale', 'projection.grassScale', 'projection.rockScale',
    'projection.sandScale', 'projection.triplanarSharpness', 'projection.triplanarStrength',
    'slope.autoRockStrength', 'slope.fade', 'slope.noiseScale', 'slope.noiseStrength',
    'slope.start', 'shoreline.autoSandStrength', 'shoreline.bandWidth',
    'shoreline.softness', 'shoreline.wetBandWidth',
  ]),
  sky: Object.freeze([
    'cloudCoverage', 'cloudDirection', 'cloudProjection', 'cloudScale',
    'cloudSeed', 'cloudSpeed', 'radius',
  ]),
});

function readPath(source, path) {
  return path.split('.').reduce((value, key) => (value == null ? value : value[key]), source);
}

function writePath(target, path, value) {
  const keys = path.split('.');
  const last = keys.pop();
  const parent = keys.reduce((node, key) => {
    node[key] ??= {};
    return node[key];
  }, target);
  parent[last] = value;
  return target;
}

function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((value, index) => sameValue(value, b[index]));
  }
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return a === b;
}

/**
 * Proves that `neutral` differs from `call_me_sensei` in SHADING ONLY.
 *
 * Two questions, deliberately separated, because they have different answers
 * and only one of them is a defect:
 *
 *  - **issues (must be empty).** When a host supplies the same explicit
 *    recipe to both presets — which is what a scene always does — do the
 *    geometry / mask / tiling / motion keys resolve identically? If not, the
 *    neutral preset is overriding something it has no business owning, and the
 *    two halves of a wipe would not share geometry.
 *  - **warnings (informational).** With NO host recipe, do the bare
 *    resolutions differ? Some do, and that is correct: `bladesPerClump` is a
 *    property of the field the host authored, not of the style, so `neutral`
 *    does not declare it and it falls through to the schema default rather
 *    than to the styled preset's value. Each key listed here is one the host
 *    must pass identically to both halves. The ground shader takes the other
 *    policy — it PINS its mask keys to the styled values so an un-parameterised
 *    neutral still paints the same masks — and reports no warnings as a result.
 */
export function auditNeutralStyleShadingOnly() {
  const issues = [];
  const warnings = [];
  const domains = [];

  const compare = (domain, keys, resolve, hostRecipe) => {
    const bareNeutral = resolve({ preset: NEUTRAL_STYLE_PRESET_ID });
    const bareStyled = resolve({ preset: 'call_me_sensei' });
    const hostedNeutral = resolve({ ...structuredClone(hostRecipe), preset: NEUTRAL_STYLE_PRESET_ID });
    const hostedStyled = resolve({ ...structuredClone(hostRecipe), preset: 'call_me_sensei' });

    const describe = (path, a, b) => `${domain}.${path}: ${JSON.stringify(readPath(a, path))} vs ${JSON.stringify(readPath(b, path))}`;
    const driftWithHostRecipe = keys
      .filter((path) => !sameValue(readPath(hostedNeutral, path), readPath(hostedStyled, path)))
      .map((path) => describe(path, hostedNeutral, hostedStyled));
    const driftBare = keys
      .filter((path) => !sameValue(readPath(bareNeutral, path), readPath(bareStyled, path)))
      .map((path) => describe(path, bareNeutral, bareStyled));

    issues.push(...driftWithHostRecipe);
    warnings.push(...driftBare);
    domains.push({
      checkedKeys: keys.length,
      domain,
      driftBare,
      driftWithHostRecipe,
      hostMustSupply: driftBare.length,
      ok: driftWithHostRecipe.length === 0,
    });
  };

  // A synthetic host recipe: every non-shading key set to a distinctive value,
  // so a preset that silently overrides one is caught rather than masked by a
  // coincidental match with the default.
  const recipeFrom = (keys, seed) => keys.reduce((recipe, path, index) => {
    const current = readPath(seed, path);
    if (Array.isArray(current)) {
      return writePath(recipe, path, current.map((value, position) => value + 0.011 * (index + position + 1)));
    }
    if (typeof current === 'number') {
      return writePath(recipe, path, Number.isInteger(current) ? current + 3 : current + 0.017 * (index + 1));
    }
    return recipe;
  }, {});

  compare('grass', NEUTRAL_STYLE_NON_SHADING_KEYS.grass, createGrassSettings,
    recipeFrom(NEUTRAL_STYLE_NON_SHADING_KEYS.grass, createGrassSettings({})));
  compare('groundShader', NEUTRAL_STYLE_NON_SHADING_KEYS.groundShader, createGroundShaderSettings,
    recipeFrom(NEUTRAL_STYLE_NON_SHADING_KEYS.groundShader, createGroundShaderSettings({})));
  compare('sky', NEUTRAL_STYLE_NON_SHADING_KEYS.sky, createSkySettings,
    recipeFrom(NEUTRAL_STYLE_NON_SHADING_KEYS.sky, createSkySettings({})));

  return { domains, issues, ok: issues.length === 0, warnings };
}

/**
 * Resolved neutral toon settings — handy for `applyToonShader(root, { settings })`
 * when a host wants the neutral half without going through a bundle.
 */
export const NEUTRAL_TOON_RESOLVED_SETTINGS = Object.freeze(
  createToonSettings({ preset: NEUTRAL_STYLE_PRESET_ID }),
);

/** Resolved neutral environment settings, for direct `applyEnvironmentShader` use. */
export const NEUTRAL_ENVIRONMENT_RESOLVED_SETTINGS = Object.freeze(
  createEnvironmentSettings({
    features: NEUTRAL_ENVIRONMENT_PRESET.features,
    parameters: NEUTRAL_ENVIRONMENT_PRESET.parameters,
  }),
);

/** Resolved neutral manufactured-surface settings. */
export const NEUTRAL_MANUFACTURED_SURFACE_RESOLVED_SETTINGS = Object.freeze(
  createUrbanPropShaderProfileSettings(NEUTRAL_MANUFACTURED_SURFACE_SETTINGS),
);
