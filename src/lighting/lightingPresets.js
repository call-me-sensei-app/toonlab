import { createLightingLook, createLightingRecipe } from './lightingDocuments.js';
import { createLightDescriptor } from './lightDescriptors.js';
import {
  clamp,
  cloneJson,
  deepFreeze,
  finite,
  isPlainObject,
  mergePlain,
  slug,
} from './utils.js';

const QUALITY_TYPES = Object.freeze([
  'ambient',
  'hemisphere',
  'directional',
  'point',
  'spot',
  'rectArea',
  'discArea',
  'tubeArea',
]);

const DEFAULT_TYPE_CAPS = Object.freeze({
  ambient: 2,
  directional: 2,
  discArea: 4,
  hemisphere: 2,
  point: 12,
  rectArea: 4,
  spot: 8,
  tubeArea: 4,
});

/** Creates a complete runtime budget profile from a partial object. */
export function createLightingQualityProfile(options = {}) {
  const source = isPlainObject(options) ? options : {};
  const typeCaps = isPlainObject(source.maxLightsByType) ? source.maxLightsByType : {};
  return {
    allowAreaLights: source.allowAreaLights === undefined ? true : Boolean(source.allowAreaLights),
    allowCookies: source.allowCookies === undefined ? true : Boolean(source.allowCookies),
    description: String(source.description ?? 'Custom lighting quality profile.'),
    id: slug(source.id ?? source.label, 'custom'),
    label: String(source.label ?? 'Custom'),
    maxDistance: Math.max(finite(source.maxDistance, 250), 0),
    maxLights: Math.round(clamp(finite(source.maxLights, 24), 0, 1024)),
    maxLightsByType: Object.fromEntries(QUALITY_TYPES.map((type) => [
      type,
      Math.round(clamp(finite(typeCaps[type], DEFAULT_TYPE_CAPS[type]), 0, 1024)),
    ])),
    maxShadowedLights: Math.round(clamp(finite(source.maxShadowedLights, 4), 0, 128)),
    maxShadowMapPixels: Math.round(Math.max(finite(source.maxShadowMapPixels, 8_388_608), 0)),
    shadowMapSizeScale: clamp(finite(source.shadowMapSizeScale, 1), 0.125, 4),
  };
}

const QUALITY_DEFINITIONS = {
  mobile: {
    allowAreaLights: false,
    allowCookies: false,
    description: 'Conservative local-light and shadow caps for mobile and integrated GPUs.',
    label: 'Mobile',
    maxDistance: 55,
    maxLights: 8,
    maxLightsByType: { directional: 1, discArea: 0, point: 4, rectArea: 0, spot: 2, tubeArea: 0 },
    maxShadowedLights: 1,
    maxShadowMapPixels: 1_048_576,
    shadowMapSizeScale: 0.5,
  },
  balanced: {
    description: 'Portable default for WebGL2 and WebGPU game scenes.',
    label: 'Balanced',
    maxDistance: 120,
    maxLights: 16,
    maxLightsByType: { directional: 2, discArea: 2, point: 8, rectArea: 2, spot: 4, tubeArea: 2 },
    maxShadowedLights: 3,
    maxShadowMapPixels: 6_291_456,
    shadowMapSizeScale: 1,
  },
  high: {
    description: 'Expanded WebGPU-oriented budget for desktop game scenes.',
    label: 'High',
    maxDistance: 250,
    maxLights: 40,
    maxLightsByType: { directional: 2, discArea: 6, point: 24, rectArea: 6, spot: 12, tubeArea: 6 },
    maxShadowedLights: 8,
    maxShadowMapPixels: 25_165_824,
    shadowMapSizeScale: 1,
  },
  cinematic: {
    description: 'Large offline-lookdev budget; profile the target hardware before shipping.',
    label: 'Cinematic',
    maxDistance: 500,
    maxLights: 96,
    maxLightsByType: { directional: 4, discArea: 16, point: 64, rectArea: 16, spot: 32, tubeArea: 16 },
    maxShadowedLights: 16,
    maxShadowMapPixels: 67_108_864,
    shadowMapSizeScale: 2,
  },
};

export const LIGHTING_QUALITY_PRESETS = deepFreeze(Object.fromEntries(
  Object.entries(QUALITY_DEFINITIONS).map(([id, definition]) => [
    id,
    createLightingQualityProfile({ ...definition, id }),
  ]),
));

const LUMINAIRE_DEFINITIONS = {
  warm_bulb: {
    description: 'A warm omnidirectional household bulb.',
    label: 'Warm Bulb',
    light: { color: { temperatureKelvin: 2700 }, distance: 16, intensity: { unit: 'lumens', value: 800 }, maxDistance: 24, type: 'point' },
  },
  paper_lantern: {
    description: 'A warm, soft practical lantern for streets and interiors.',
    label: 'Paper Lantern',
    light: { artistic: { role: 'practical', shadowTint: [0.4, 0.25, 0.32] }, color: { temperatureKelvin: 2200 }, distance: 13, intensity: { unit: 'lumens', value: 600 }, maxDistance: 20, type: 'point' },
  },
  torch_spot: {
    description: 'A focused warm source suitable for flame and magic emitters.',
    label: 'Torch Spot',
    light: { angle: 0.78, color: { temperatureKelvin: 1900 }, distance: 18, intensity: { unit: 'lumens', value: 1100 }, maxDistance: 28, penumbra: 0.65, type: 'spot' },
  },
  window_softbox: {
    description: 'A broad cool window emitter represented by a rectangular area light.',
    label: 'Window Softbox',
    light: { color: { temperatureKelvin: 7600 }, height: 2.8, intensity: { unit: 'nits', value: 5 }, maxDistance: 22, type: 'rectArea', width: 1.8 },
  },
  neon_tube: {
    description: 'A saturated tube source with a portable rect-area approximation.',
    label: 'Neon Tube',
    light: { color: [0.25, 0.72, 1], height: 0.08, intensity: { unit: 'nits', value: 15 }, maxDistance: 18, type: 'tubeArea', width: 2.4 },
  },
  disc_softbox: {
    description: 'A circular studio emitter with a portable rect-area approximation.',
    label: 'Disc Softbox',
    light: { color: { temperatureKelvin: 5600 }, height: 1.4, intensity: { unit: 'nits', value: 8 }, maxDistance: 25, type: 'discArea', width: 1.4 },
  },
};

export const LIGHTING_LUMINAIRE_PRESETS = deepFreeze(Object.fromEntries(
  Object.entries(LUMINAIRE_DEFINITIONS).map(([id, definition]) => [id, {
    description: definition.description,
    id,
    label: definition.label,
    light: createLightDescriptor({ ...definition.light, id, name: definition.label }),
  }]),
));

function threePointLights() {
  return [
    { artistic: { role: 'ambient' }, color: [0.45, 0.55, 0.8], id: 'studio-ambient', intensity: 0.16, name: 'Studio Ambient', type: 'ambient' },
    { angle: 0.66, artistic: { role: 'key' }, castShadow: true, color: { temperatureKelvin: 4800 }, id: 'key', intensity: { unit: 'lumens', value: 2200 }, name: 'Key', position: [3, 4.5, 4], priority: 10, shadow: { enabled: true, mapSize: 2048, priority: 10 }, target: [0, 1.4, 0], type: 'spot' },
    { angle: 0.88, artistic: { role: 'fill' }, color: { temperatureKelvin: 7200 }, id: 'fill', intensity: { unit: 'lumens', value: 900 }, name: 'Fill', position: [-3, 2.8, 2], priority: 7, target: [0, 1.2, 0], type: 'spot' },
    { angle: 0.6, artistic: { role: 'rim', rimInfluence: 1 }, color: [0.58, 0.72, 1], id: 'rim', intensity: { unit: 'lumens', value: 1500 }, name: 'Rim', position: [1.5, 3.8, -4], priority: 8, target: [0, 1.6, 0], type: 'spot' },
  ];
}

function nightMarketLights() {
  const colors = [[1, 0.3, 0.18], [1, 0.72, 0.2], [0.18, 0.65, 1], [0.9, 0.22, 0.72]];
  const lights = [
    { color: [0.08, 0.12, 0.24], id: 'night-ambient', intensity: 0.16, name: 'Night Ambient', type: 'ambient' },
    { color: [0.2, 0.34, 0.65], groundColor: [0.04, 0.025, 0.05], id: 'night-sky', intensity: 0.32, name: 'Night Sky', type: 'hemisphere' },
  ];
  for (let index = 0; index < 12; index += 1) {
    const side = index % 2 === 0 ? -1 : 1;
    lights.push({
      color: colors[index % colors.length],
      distance: 12,
      id: `market-lantern-${index + 1}`,
      intensity: { unit: 'lumens', value: 500 + (index % 3) * 120 },
      maxDistance: 38,
      name: `Market Lantern ${index + 1}`,
      position: [side * (3 + (index % 3) * 2.4), 2.6 + (index % 2) * 0.5, -9 + Math.floor(index / 2) * 3.4],
      priority: 2,
      type: 'point',
    });
  }
  return lights;
}

const RIG_DEFINITIONS = {
  outdoor_sun: {
    description: 'Balanced sky fill and one aligned shadow-casting sun.',
    label: 'Outdoor Sun',
    lights: [
      { artistic: { role: 'ambient' }, color: [0.55, 0.68, 0.92], id: 'outdoor-ambient', intensity: 0.22, name: 'Outdoor Ambient', type: 'ambient' },
      { color: [0.62, 0.76, 1], groundColor: [0.22, 0.18, 0.16], id: 'sky-fill', intensity: 0.65, name: 'Sky Fill', type: 'hemisphere' },
      { artistic: { role: 'key', shadowTint: [0.48, 0.55, 0.76] }, castShadow: true, color: { temperatureKelvin: 5600 }, id: 'sun', intensity: { unit: 'lux', value: 3.2 }, name: 'Sun', position: [-36, 64, 28], priority: 100, shadow: { enabled: true, far: 260, mapSize: 2048, priority: 100 }, target: [0, 0, 0], type: 'directional' },
    ],
    shadowPolicy: { maxShadowedLights: 1 },
  },
  three_point_character: {
    description: 'Key, fill, rim, and ambient lights for character look development.',
    label: 'Three-Point Character',
    lights: threePointLights(),
    shadowPolicy: { maxShadowedLights: 1 },
  },
  interior_warm: {
    description: 'Cool window fill balanced by warm practical lights.',
    label: 'Warm Interior',
    lights: [
      { color: [0.3, 0.34, 0.48], id: 'room-ambient', intensity: 0.18, name: 'Room Ambient', type: 'ambient' },
      { color: { temperatureKelvin: 7200 }, height: 3, id: 'window', intensity: { unit: 'nits', value: 4 }, name: 'Window', position: [-4, 2.8, 0], priority: 7, target: [0, 1.2, 0], type: 'rectArea', width: 2.2 },
      { color: { temperatureKelvin: 2400 }, distance: 14, id: 'table-lamp', intensity: { unit: 'lumens', value: 720 }, name: 'Table Lamp', position: [2.2, 1.7, 1], priority: 8, type: 'point' },
      { color: { temperatureKelvin: 2100 }, distance: 16, id: 'hearth', intensity: { unit: 'lumens', value: 1000 }, name: 'Hearth', position: [-1.5, 1, -3], priority: 8, type: 'point' },
    ],
    shadowPolicy: { maxShadowedLights: 2 },
  },
  night_market: {
    description: 'A many-practical-light stress rig for stylized night scenes.',
    label: 'Night Market',
    lights: nightMarketLights(),
    shadowPolicy: { maxShadowedLights: 2 },
  },
};

export const LIGHTING_RIG_PRESETS = deepFreeze(Object.fromEntries(
  Object.entries(RIG_DEFINITIONS).map(([id, definition]) => [id, {
    description: definition.description,
    id,
    label: definition.label,
    lights: definition.lights.map((light) => createLightDescriptor(light)),
    shadowPolicy: definition.shadowPolicy,
  }]),
));

const LOOK_DEFINITIONS = {
  // skyPreset names a sky STYLE; skyScenario picks that style's rendition of
  // the moment (see SKY_SCENARIOS in src/sky/stylizedSky.js). Hosts apply
  // both: sky.setPreset(environment.skyPreset, { scenario: environment.skyScenario }).
  daylight: { description: 'Clear vivid daylight for outdoor toon scenes.', environment: { skyPreset: 'call_me_sensei', skyScenario: 'clear_day', timeOfDay: 14, weatherPreset: 'clear' }, label: 'Daylight', post: { exposure: 1.08 }, quality: 'balanced', recipe: 'outdoor_sun' },
  golden_hour: { description: 'Low warm key light with luminous cool sky fill.', environment: { skyPreset: 'call_me_sensei', skyScenario: 'golden_hour', timeOfDay: 18.2, weatherPreset: 'clear' }, label: 'Golden Hour', post: { exposure: 1.04, saturation: 1.12 }, quality: 'high', recipe: 'outdoor_sun' },
  moonlit: { description: 'Cool low-intensity night foundation ready for practical lights.', environment: { skyPreset: 'call_me_sensei', skyScenario: 'moonlit', timeOfDay: 23, weatherPreset: 'clear' }, label: 'Moonlit', post: { exposure: 0.92 }, quality: 'balanced', recipe: 'night_market' },
  character_studio: { description: 'Neutral character look-development stage.', environment: { background: [0.07, 0.08, 0.11] }, label: 'Character Studio', post: { exposure: 1 }, quality: 'high', recipe: 'three_point_character' },
  warm_interior: { description: 'Warm practicals with cool window contrast.', environment: { timeOfDay: 16 }, label: 'Warm Interior', post: { exposure: 1.02 }, quality: 'balanced', recipe: 'interior_warm' },
};

export const LIGHTING_LOOK_PRESETS = deepFreeze(Object.fromEntries(
  Object.entries(LOOK_DEFINITIONS).map(([id, definition]) => [id, { ...definition, id }]),
));

const PRESET_REGISTRIES = Object.freeze({
  look: LIGHTING_LOOK_PRESETS,
  luminaire: LIGHTING_LUMINAIRE_PRESETS,
  quality: LIGHTING_QUALITY_PRESETS,
  rig: LIGHTING_RIG_PRESETS,
});

function definitionOrThrow(kind, id) {
  const definition = PRESET_REGISTRIES[kind]?.[id];
  if (definition) return definition;
  throw new Error(`Unknown lighting ${kind} preset "${id}".`);
}

/** Returns a new mutable descriptor for a built-in luminaire. */
export function resolveLuminairePreset(id = 'warm_bulb', overrides = {}) {
  const definition = definitionOrThrow('luminaire', id);
  return createLightDescriptor(mergePlain(definition.light, overrides));
}

/** Returns a new mutable LightingRecipe for a built-in rig. */
export function resolveLightingRigPreset(id = 'outdoor_sun', overrides = {}) {
  const definition = definitionOrThrow('rig', id);
  const base = {
    id,
    lights: definition.lights,
    metadata: { preset: id },
    name: definition.label,
    shadowPolicy: definition.shadowPolicy,
  };
  return createLightingRecipe(mergePlain(base, overrides));
}

/** Returns a new mutable quality profile for a built-in profile id or inline profile. */
export function resolveLightingQualityPreset(idOrProfile = 'balanced', overrides = {}) {
  const base = typeof idOrProfile === 'string'
    ? definitionOrThrow('quality', idOrProfile)
    : createLightingQualityProfile(idOrProfile);
  return createLightingQualityProfile(mergePlain(base, overrides));
}

/** Returns a complete look document with inline recipe and quality objects. */
export function resolveLightingLookPreset(id = 'daylight', overrides = {}) {
  const definition = definitionOrThrow('look', id);
  const base = {
    ...cloneJson(definition),
    metadata: { preset: id },
    recipe: resolveLightingRigPreset(definition.recipe),
    quality: resolveLightingQualityPreset(definition.quality),
  };
  return createLightingLook(mergePlain(base, overrides));
}

/**
 * Lists preset picker entries. With no kind all entries are returned in one
 * flat array; pass `luminaire`, `rig`, `look`, or `quality` to filter.
 */
export function getLightingPresetOptions(kind = null) {
  if (kind !== null && !PRESET_REGISTRIES[kind]) {
    throw new Error('Lighting preset kind must be luminaire, rig, look, or quality.');
  }
  const kinds = kind ? [kind] : Object.keys(PRESET_REGISTRIES);
  return kinds.flatMap((entryKind) => Object.values(PRESET_REGISTRIES[entryKind]).map((definition) => ({
    description: definition.description,
    id: definition.id,
    kind: entryKind,
    label: definition.label,
  })));
}

/** Generic resolver for UIs that keep the preset family as data. */
export function resolveLightingPreset(kind, id, overrides = {}) {
  switch (kind) {
    case 'luminaire': return resolveLuminairePreset(id, overrides);
    case 'rig': return resolveLightingRigPreset(id, overrides);
    case 'look': return resolveLightingLookPreset(id, overrides);
    case 'quality': return resolveLightingQualityPreset(id, overrides);
    default: throw new Error('Lighting preset kind must be luminaire, rig, look, or quality.');
  }
}
