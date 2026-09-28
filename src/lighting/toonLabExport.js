import { resolveLightColor } from './colorIntensity.js';
import { createLightingRecipe } from './lightingDocuments.js';
import { cloneJson, finite, isPlainObject } from './utils.js';

export const TOONLAB_LIGHTING_MANIFEST_TYPE = 'toonlab/lighting-manifest';
export const TOONLAB_LIGHTING_MANIFEST_SCHEMA_VERSION = 1;

const TOONLAB_CLASS_BY_TYPE = Object.freeze({
  ambient: 'SkyLight',
  directional: 'DirectionalLight',
  discArea: 'RectLight',
  hemisphere: 'SkyLight',
  point: 'PointLight',
  rectArea: 'RectLight',
  spot: 'SpotLight',
  tubeArea: 'RectLight',
});

const LOCAL_TYPES = new Set(['point', 'spot', 'rectArea', 'discArea', 'tubeArea']);

function normalizeIntent(value, fallback = 'prefer') {
  if (value === true) return 'prefer';
  if (value === false) return 'disabled';
  return ['disabled', 'prefer', 'require'].includes(value) ? value : fallback;
}

/** Converts Three.js Y-up meters to ToonLab Z-up centimeters. */
export function threePositionToToonLab(position, worldScale = 100) {
  const [x = 0, y = 0, z = 0] = Array.isArray(position) ? position.map(Number) : [];
  const scale = Math.max(finite(worldScale, 100), 0.001);
  return [-z * scale, x * scale, y * scale];
}

function directionFromPoints(position, target) {
  const start = threePositionToToonLab(position, 1);
  const end = threePositionToToonLab(target, 1);
  const direction = end.map((value, index) => value - start[index]);
  const length = Math.hypot(...direction) || 1;
  return direction.map((value) => value / length);
}

function intensityMapping(descriptor) {
  const nativeUnits = {
    directional: ['lux'],
    discArea: ['lumens', 'candela', 'ev'],
    point: ['lumens', 'candela', 'ev'],
    rectArea: ['lumens', 'candela', 'ev'],
    spot: ['lumens', 'candela', 'ev'],
    tubeArea: ['lumens', 'candela', 'ev'],
  }[descriptor.type] ?? ['unitless'];
  return {
    artisticMultiplier: descriptor.intensity.artisticMultiplier,
    conversionRequired: !nativeUnits.includes(descriptor.intensity.unit),
    nativeUnitOptions: nativeUnits,
    referenceDistanceMeters: descriptor.intensity.referenceDistance,
    sourceUnit: descriptor.intensity.unit,
    sourceValue: descriptor.intensity.value,
  };
}

function mapLight(descriptor, options) {
  const isLocal = LOCAL_TYPES.has(descriptor.type);
  const warnings = [];
  if (descriptor.type === 'ambient') warnings.push('AmbientLight maps approximately to a SkyLight intensity contribution.');
  if (descriptor.type === 'hemisphere') warnings.push('HemisphereLight maps approximately to SkyLight upper/lower hemisphere settings.');
  if (descriptor.type === 'discArea') warnings.push('Disc shape intent requires adapter-side RectLight/source-shape tuning.');
  if (descriptor.type === 'tubeArea') warnings.push('Tube shape intent requires adapter-side RectLight/source-width tuning.');
  if (descriptor.cookie) warnings.push('Cookie reference requires generation or assignment of a ToonLab light-function material.');
  if (descriptor.layers.some((layer) => layer > 2)) warnings.push('ToonLab exposes only three standard Lighting Channels; higher Three.js layers need adapter policy.');

  return {
    color: {
      resolvedSrgb: resolveLightColor(descriptor.color),
      temperatureKelvin: descriptor.color.temperatureKelvin,
      tint: cloneJson(descriptor.color.tint),
      useTemperature: descriptor.color.temperatureKelvin !== null,
    },
    enabled: descriptor.enabled,
    id: descriptor.id,
    intensity: intensityMapping(descriptor),
    lightFunction: descriptor.cookie ? cloneJson(descriptor.cookie) : null,
    lightLinking: {
      excludeTags: cloneJson(descriptor.linking.excludeTags),
      includeTags: cloneJson(descriptor.linking.includeTags),
      lightingChannels: [0, 1, 2].map((channel) => descriptor.layers.includes(channel)),
    },
    manyLights: {
      eligibleIntent: isLocal,
      requested: options.manyLights !== 'disabled' && isLocal,
      validation: isLocal ? 'Validate material, translucency, and platform support in ToonLab.' : 'Not a local-light Many Lights mapping.',
    },
    name: descriptor.name,
    photometricProfile: descriptor.ies ? cloneJson(descriptor.ies) : null,
    shape: {
      angleRadians: descriptor.angle,
      attenuationRadiusMeters: descriptor.distance,
      decay: descriptor.decay,
      heightMeters: descriptor.height,
      penumbra: descriptor.penumbra,
      sourceIntent: descriptor.type,
      widthMeters: descriptor.width,
    },
    shadow: {
      bias: descriptor.shadow.bias,
      castShadow: descriptor.castShadow && descriptor.shadow.enabled,
      mapSizeIntent: descriptor.shadow.mapSize,
      normalBias: descriptor.shadow.normalBias,
      priority: descriptor.shadow.priority,
    },
    toon: cloneJson(descriptor.artistic),
    toonlabType: descriptor.type,
    transform: {
      direction: directionFromPoints(descriptor.position, descriptor.target),
      locationCm: threePositionToToonLab(descriptor.position, options.worldScale),
      targetCm: threePositionToToonLab(descriptor.target, options.worldScale),
    },
    toonLabClass: TOONLAB_CLASS_BY_TYPE[descriptor.type],
    warnings,
  };
}

/**
 * Exports a data-only ToonLab handoff manifest.
 *
 * It does not generate native project files or implement renderer features.
 * A ToonLab host adapter must validate and realize the intent.
 */
export function exportLightingRecipeToToonLab(recipeOptions, exportOptions = {}) {
  const recipe = createLightingRecipe(recipeOptions);
  const source = isPlainObject(exportOptions) ? exportOptions : {};
  const options = {
    globalIllumination: normalizeIntent(source.globalIllumination, 'prefer'),
    manyLights: normalizeIntent(source.manyLights, 'prefer'),
    worldScale: Math.max(finite(source.worldScale, 100), 0.001),
  };
  const lights = recipe.lights.map((descriptor) => mapLight(descriptor, options));
  const warnings = [
    'This manifest carries authoring intent only; ToonLab must create and validate engine assets.',
    'Many Lights is a host-renderer capability, not implemented by this export.',
  ];
  if (options.manyLights !== 'disabled' && lights.every((light) => !light.manyLights.eligibleIntent)) {
    warnings.push('The recipe contains no local light types marked as Many Lights-eligible intent.');
  }

  return {
    coordinateSystem: {
      handedness: 'ToonLab left-handed',
      mapping: 'ToonLabXYZcm = [-ThreeZ, ThreeX, ThreeY] * worldScale',
      sourceUnits: 'meters',
      worldScale: options.worldScale,
    },
    platform: {
      name: 'ToonLab',
    },
    lights,
    rendererIntent: {
      globalIllumination: {
        intent: options.globalIllumination,
        scope: 'global illumination and reflections',
      },
      manyLights: {
        implementation: 'toonlab-native',
        intent: options.manyLights,
        scope: 'eligible local direct lights',
      },
    },
    schemaVersion: TOONLAB_LIGHTING_MANIFEST_SCHEMA_VERSION,
    source: {
      recipeId: recipe.id,
      recipeName: recipe.name,
      recipeSchemaVersion: recipe.schemaVersion,
      shadowPolicy: cloneJson(recipe.shadowPolicy),
    },
    type: TOONLAB_LIGHTING_MANIFEST_TYPE,
    warnings,
  };
}

/** Serializes a previously generated ToonLab lighting manifest. */
export function serializeToonLabLightingManifest(manifest, { pretty = false } = {}) {
  if (!isPlainObject(manifest) || manifest.type !== TOONLAB_LIGHTING_MANIFEST_TYPE) {
    throw new Error(`ToonLab lighting manifest type must be "${TOONLAB_LIGHTING_MANIFEST_TYPE}".`);
  }
  return JSON.stringify(manifest, null, pretty ? 2 : undefined);
}
