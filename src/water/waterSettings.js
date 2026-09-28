import * as THREE from 'three';
import {
  createSettingsPresetDocument,
  parsePresetDocument,
  serializePresetDocument,
  validateSettingsPresetDocument,
} from '../core/presetDocuments.js';
import { isProtectedSystemStyleId } from '../core/systemStylePolicy.js';

// Public settings for the stylized water system. Mirrors the toon/environment
// settings conventions: normalized flat settings objects, named presets, and a
// field schema that HUDs or editors can generate controls from.

export const WATER_PRESET_NAMES = Object.freeze([
  'mirror',
  'calm',
  'lake',
  'river',
  'coast',
  'ocean',
  'storm',
]);

/**
 * Canonical body-of-water presets used by focused scenario pickers. They are
 * a subset of WATER_PRESET_NAMES; the style axis is always separate and
 * applies across every preset, including mirror/calm/storm.
 */
export const WATER_SCENARIOS = Object.freeze([
  Object.freeze({ description: 'Balanced still-water body: light swell, anime-blue palette.', id: 'lake', label: 'Lake' }),
  Object.freeze({ description: 'Fast aligned current with chop, foam lines, and strong caustics.', id: 'river', label: 'River' }),
  Object.freeze({ description: 'Onshore swell with rolling surf and contact foam.', id: 'coast', label: 'Coast' }),
  Object.freeze({ description: 'Big open-water swell in sets, whitecaps, curling breakers.', id: 'ocean', label: 'Ocean' }),
]);

/** The body preset used by legacy style-as-preset calls with no scenario. */
export const DEFAULT_WATER_SCENARIO = 'lake';

const WATER_SCENARIO_IDS = new Set(WATER_SCENARIOS.map((scenario) => scenario.id));

/** Lists the canonical scenarios as `{ id, label, description }` (for HUDs). */
export function getWaterScenarioOptions() {
  return WATER_SCENARIOS.map(({ description, id, label }) => ({ description, id, label }));
}

export const WATER_QUALITY_LEVELS = Object.freeze(['low', 'medium', 'high']);

// Named body-color palettes, independent of the wave presets: pick a mode
// (lake/ocean/...) for motion and a tone for color. A non-'classic' tone
// forces its palette over preset, environment, and per-key color overrides,
// so switching tones always takes effect; 'classic' returns full control to
// the preset/explicit colors.
export const WATER_COLOR_TONES = Object.freeze({
  // Preset/default palette untouched.
  classic: Object.freeze({}),
  // Production anime open-world water: luminous at shore, saturated through
  // the mid band, and deep enough to keep lakes from reading as milky paint.
  // Reflections remain legible but do not bleach the body color.
  anime: Object.freeze({
    // Swim-depth reference water is a saturated green-leaning turquoise, not
    // pale azure; the beach reference gets its blue from grazing-angle sky
    // reflection, not from the body color.
    shallowColor: [0.28, 0.82, 0.79],
    midColor: [0.07, 0.5, 0.66],
    deepColor: [0.018, 0.22, 0.4],
    depthFadeDistance: 1.8,
    deepFadeDistance: 4.2,
    fresnelColor: [0.54, 0.84, 0.96],
    // Low sky-tint floor: looking straight down while swimming, the reference shows
    // nearly pure body color — sky/cloud reflections belong to grazing angles.
    fresnelBias: 0.07,
    reflectionStrength: 0.46,
    reflectionSoftness: 0.36,
    // Subtle: the long clarity distances above widen the caustic depth window
    // considerably, and the reference dappling is a soft near-shore accent, not a
    // surface web.
    causticsStrength: 0.3,
    // Glassier surface: the reference water carries long smooth undulations,
    // not constant high-frequency wobble.
    detailNormalStrength: 0.38,
  }),
  // Anime-style lake teal: green pulled above blue in the mid band, long
  // glassy falloff before the deeps.
  teal: Object.freeze({
    shallowColor: [0.36, 0.87, 0.78],
    midColor: [0.1, 0.63, 0.62],
    deepColor: [0.03, 0.35, 0.44],
    depthFadeDistance: 1.4,
    deepFadeDistance: 3.0,
    fresnelColor: [0.62, 0.92, 0.9],
  }),
  // Caribbean shelf: vivid turquoise shallows over white sand, emerald mid,
  // deep water still saturated instead of navy.
  caribbean: Object.freeze({
    shallowColor: [0.38, 0.96, 0.85],
    midColor: [0.04, 0.73, 0.71],
    deepColor: [0.01, 0.4, 0.52],
    depthFadeDistance: 1.9,
    deepFadeDistance: 4.2,
    fresnelColor: [0.6, 0.95, 0.95],
  }),
  // Emerald lagoon: green-dominant all the way down.
  lagoon: Object.freeze({
    shallowColor: [0.47, 0.93, 0.71],
    midColor: [0.13, 0.68, 0.5],
    deepColor: [0.03, 0.35, 0.32],
    depthFadeDistance: 1.5,
    deepFadeDistance: 3.2,
    fresnelColor: [0.66, 0.93, 0.85],
  }),
  // Open-ocean indigo: short falloff into a saturated deep blue.
  deepOcean: Object.freeze({
    shallowColor: [0.3, 0.74, 0.86],
    midColor: [0.08, 0.4, 0.7],
    deepColor: [0.015, 0.15, 0.4],
    depthFadeDistance: 0.9,
    deepFadeDistance: 2.0,
    fresnelColor: [0.6, 0.82, 1.0],
  }),
});

export const WATER_COLOR_TONE_NAMES = Object.freeze(Object.keys(WATER_COLOR_TONES));

export function resolveWaterColorToneName(requested) {
  const name = String(requested ?? '').trim();
  return WATER_COLOR_TONE_NAMES.includes(name) ? name : 'classic';
}

export const WATER_DEBUG_MODES = Object.freeze({
  off: 0,
  depth: 1,
  foam: 2,
  normal: 3,
  ripple: 4,
  reflection: 5,
  caustics: 6,
  specular: 7,
  fresnel: 8,
  crest: 9,
  shoreState: 10,
});

// The number of Gerstner components evaluated by the shader and the CPU
// mirror. Fixed so buoyancy queries always match the rendered surface.
export const WATER_GERSTNER_WAVE_COUNT = 8;

export const DEFAULT_WATER_SETTINGS = Object.freeze({
  preset: 'lake',
  colorTone: 'classic',

  // Authored baseline: 0 = glassy mirror, 1 = storm swell. Scales wave
  // amplitude, steepness, and phase speed before the per-wave spectrum is
  // built. Scene weather may transiently override it on WaterSurface.
  waveIntensity: 0.25,
  waterLevel: 0.36,

  // Gerstner wave spectrum.
  waveAmplitude: 0.3,
  waveLength: 7.5,
  waveSteepness: 0.75,
  waveSpeed: 1.0,
  waveDirection: [1.0, 0.35],
  waveDirectionSpread: 0.65,
  // Water column depth (m) at which waves reach full amplitude. Shallower
  // water shrinks the swell so crests never poke through a shore or island.
  // Only active when the surface is given a bed height sampler.
  shoalingDepth: 1.4,
  // Fraction of wave height that survives into the shallows as rolling surf.
  // Waves only die completely in the last few swash centimeters at the
  // waterline; 0 restores the old flatten-to-nothing behavior.
  shorelineWaves: 0.35,
  // Swash run-up: how far incoming waves push a thin foamy film up the beach
  // face above the rest waterline. Scales with total wave energy, so storms
  // reach visibly further up the sand. 0 pins the waterline in place.
  shorelineRunup: 0.6,
  // Maximum horizontal run-up in meters. Individual wave-group events reach
  // 80–100% of this bound, begin at the preceding rundown endpoint, and end
  // at their own varied endpoint. 0 = automatic (energy-scaled run-up).
  runupDistance: 0,

  // Master switch for the breaker system: false removes the mesh and skips
  // all rebuild work entirely (handy for A/B perf comparisons).
  breakerEnabled: true,
  // Dedicated plunging-breaker geometry along the break line (needs a bed
  // height sampler). 0 disables the system entirely; above 0 curl shells
  // spawn where the swell reaches its collapse depth and barrel with each
  // arriving wave. Purely visual — height queries stay on the heightfield.
  breakerAmount: 0,
  // How far the lip curls over: 0 spills down the face, 1 wraps a tunnel.
  breakerCurl: 0.8,
  // Shell height multiplier over the physical breaking height (0.72 x depth).
  breakerScale: 1.0,
  // Along-crest peel rate; higher makes the barrel travel faster down the
  // line (0 breaks the whole line at once wherever the swell hits square).
  breakerPeel: 1.0,

  // Wave sets: real swell arrives in groups — the big waves come minutes
  // apart with lulls between, they don't repeat every period. The primary
  // swell is split into a beat pair whose interference modulates its
  // amplitude with this period (seconds between set peaks at a fixed point).
  waveSetPeriod: 60,
  // Modulation depth: 0 = constant swell every period, 1 = the swell dies
  // completely between sets.
  waveSetStrength: 0.5,

  // Procedural detail ripple normals.
  detailNormalStrength: 0.32,
  detailScale: 1.15,
  flowDirection: [0.72, -0.18],
  flowSpeed: 0.3,

  // Water body color and refraction. The palette is deliberately high-key
  // saturated cyan (anime style): deep water reads as milky blue, not navy.
  shallowColor: [0.42, 0.85, 0.88],
  midColor: [0.2, 0.62, 0.8],
  deepColor: [0.1, 0.38, 0.6],
  depthFadeDistance: 1.0,
  deepFadeDistance: 2.2,
  opacity: 0.8,
  refractionStrength: 0.35,
  // Physical anchor for the stylized underside. 1.333 produces the familiar
  // water-to-air Snell window and total-internal-reflection cutoff.
  indexOfRefraction: 1.333,
  underwaterTransmission: 1.0,
  underwaterTintStrength: 0.35,
  causticsStrength: 0.55,
  causticsScale: 0.8,
  causticsSpeed: 0.6,

  // Foam.
  foamColor: [0.94, 1.0, 0.99],
  foamAmount: 1.0,
  // Independent gain for the foam carried by the beach swash. Keeping this
  // separate prevents stronger run-up foam from turning offshore contact
  // bands and whitecaps into solid paint.
  swashFoamAmount: 1.15,
  // Stateful beach foam remains aerated for a few seconds, then converts to
  // thinner residue instead of disappearing when the procedural cycle resets.
  swashFoamLifetime: 4.0,
  swashFoamResidueLifetime: 10.0,
  // Wet sand remembers inundation much longer than the visible surface film.
  // The short sheen is intentionally derived separately by the shore-state
  // simulation, so a beach can stay dark without looking permanently glazed.
  wetSandDryTime: 120.0,
  wetSandDarkening: 0.58,
  wetSandSheen: 0.78,
  foamContactDistance: 0.4,
  foamLineSpacing: 0.55,
  foamNoiseScale: 0.6,
  whitecapAmount: 0.05,
  rippleFoamStrength: 0.8,

  // Authored lighting/reflection fallback. A scene rig may transiently replace
  // the sun and sky fields on WaterSurface without editing this water asset.
  sunDirection: [0.35, 0.8, 0.45],
  sunColor: [1.0, 0.96, 0.86],
  specularStrength: 0.8,
  specularShininess: 150,
  specularStretch: 0.35,
  sparkleStrength: 0.5,
  sparkleScale: 1.5,
  sparkleSpeed: 1.0,
  sunGlowStrength: 0.85,
  // How strongly scene shadows (rocks, trees, the character) darken the
  // surface and mute its sun glints/caustics.
  sceneShadowStrength: 0.6,
  fresnelStrength: 0.9,
  fresnelPower: 4.5,
  // Sky-tint floor: keeps the surface carrying reflected sky color even at
  // steep viewing angles, which is what makes anime water read "blue".
  fresnelBias: 0.16,
  fresnelColor: [0.68, 0.9, 1.0],
  skyZenithColor: [0.5, 0.74, 0.98],
  skyHorizonColor: [0.86, 0.95, 1.0],
  reflectionStrength: 0.62,
  reflectionDistortion: 0.04,
  // Blends the sharp planar reflection toward the soft procedural sky for the
  // milky painterly reflections of stylized water (0 = mirror, 1 = fully soft).
  reflectionSoftness: 0.55,

  // Interactive ripple simulation.
  rippleStrength: 1.0,
  rippleDamping: 0.985,
  ripplePropagation: 11.0,
  rippleHeightScale: 1.0,
  rippleFoamDecay: 0.94,
  rippleFoamGain: 2.4,

  // Splash particles (droplets, spray crown, expanding foam rings).
  splashStrength: 1.0,
  splashScale: 1.0,
  splashDropletCount: 26,
  splashRingCount: 2,
  splashColor: [0.97, 1.0, 1.0],
  splashShadeColor: [0.62, 0.86, 0.95],

  quality: 'high',
});

const WATER_PRESETS = Object.freeze({
  mirror: Object.freeze({
    waveIntensity: 0.03,
    waveAmplitude: 0.12,
    waveSteepness: 0.4,
    detailNormalStrength: 0.1,
    flowSpeed: 0.12,
    whitecapAmount: 0,
    foamAmount: 0.7,
    sparkleStrength: 0.35,
    reflectionStrength: 0.85,
    reflectionDistortion: 0.015,
    reflectionSoftness: 0.3,
  }),
  calm: Object.freeze({
    waveIntensity: 0.12,
    waveAmplitude: 0.2,
    waveSteepness: 0.55,
    detailNormalStrength: 0.18,
    flowSpeed: 0.2,
    whitecapAmount: 0,
    reflectionStrength: 0.7,
    reflectionDistortion: 0.03,
    reflectionSoftness: 0.6,
    sparkleStrength: 0.45,
  }),
  lake: Object.freeze({}),
  river: Object.freeze({
    waveIntensity: 0.3,
    waveLength: 4.2,
    waveDirection: [1.0, -0.15],
    waveDirectionSpread: 0.12,
    waveSpeed: 1.25,
    flowDirection: [1.0, -0.15],
    flowSpeed: 1.15,
    detailScale: 1.6,
    foamAmount: 1.25,
    foamLineSpacing: 0.4,
    causticsStrength: 0.7,
    sparkleStrength: 0.4,
    whitecapAmount: 0.08,
  }),
  coast: Object.freeze({
    waveIntensity: 0.6,
    waveAmplitude: 0.65,
    waveLength: 18.0,
    // Onshore swell: surf only exists when waves travel toward the shallows.
    waveDirection: [0.15, -1.0],
    waveDirectionSpread: 0.5,
    flowDirection: [0.15, -1.0],
    flowSpeed: 0.45,
    whitecapAmount: 0.22,
    foamContactDistance: 0.6,
    foamAmount: 1.3,
    swashFoamAmount: 1.35,
    rippleFoamStrength: 0.9,
    breakerAmount: 0.55,
    waveSetPeriod: 50,
    waveSetStrength: 0.6,
  }),
  ocean: Object.freeze({
    waveIntensity: 0.7,
    waveAmplitude: 0.55,
    waveLength: 13.0,
    waveSteepness: 0.95,
    // Onshore swell with moderate spread so sets march at the beach and the
    // break line actually breaks (surf needs shoreward wave travel).
    waveDirection: [0.3, -1.0],
    waveDirectionSpread: 0.55,
    flowDirection: [0.3, -1.0],
    waterLevel: 0.42,
    shallowColor: [0.26, 0.7, 0.84],
    midColor: [0.14, 0.5, 0.72],
    deepColor: [0.06, 0.3, 0.52],
    depthFadeDistance: 1.3,
    deepFadeDistance: 3.0,
    reflectionSoftness: 0.35,
    whitecapAmount: 0.4,
    foamAmount: 1.2,
    swashFoamAmount: 1.25,
    specularStretch: 0.5,
    sparkleStrength: 0.65,
    reflectionStrength: 0.6,
    flowSpeed: 0.5,
    splashStrength: 1.2,
    breakerAmount: 0.85,
    breakerCurl: 0.85,
    waveSetPeriod: 75,
    waveSetStrength: 0.7,
  }),
  storm: Object.freeze({
    waveIntensity: 1.0,
    waveAmplitude: 0.5,
    waveLength: 15.0,
    waveSteepness: 1.05,
    waveSpeed: 1.25,
    waveDirection: [0.45, -1.0],
    waveDirectionSpread: 0.8,
    waterLevel: 0.42,
    detailNormalStrength: 0.55,
    flowSpeed: 0.55,
    shallowColor: [0.2, 0.66, 0.78],
    midColor: [0.1, 0.4, 0.56],
    deepColor: [0.05, 0.22, 0.36],
    depthFadeDistance: 1.4,
    deepFadeDistance: 3.2,
    fresnelBias: 0.1,
    reflectionSoftness: 0.3,
    causticsStrength: 0.08,
    foamAmount: 1.25,
    swashFoamAmount: 1.45,
    whitecapAmount: 0.55,
    rippleFoamStrength: 1.0,
    sunColor: [0.9, 0.88, 0.85],
    sparkleStrength: 0.3,
    specularStrength: 0.6,
    fresnelStrength: 1.0,
    skyZenithColor: [0.34, 0.46, 0.62],
    skyHorizonColor: [0.62, 0.7, 0.78],
    reflectionStrength: 0.42,
    reflectionDistortion: 0.08,
    sunGlowStrength: 0.4,
    splashStrength: 1.45,
    splashShadeColor: [0.55, 0.74, 0.82],
    // Storm surf closes out: tall messy walls, less clean tunnel. The monster
    // sets arrive minutes apart.
    breakerAmount: 1.0,
    breakerCurl: 0.6,
    breakerPeel: 1.6,
    waveSetPeriod: 150,
    waveSetStrength: 0.85,
  }),
});

const WATER_PRESET_ALIASES = Object.freeze({
  '': 'lake',
  default: 'lake',
  pond: 'calm',
  sea: 'ocean',
  stormy: 'storm',
});

// Label + one-line description for each built-in preset, surfaced through
// getWaterPresetOptions() so HUDs can build preset pickers.
const BUILT_IN_WATER_PRESET_METADATA = Object.freeze({
  mirror: Object.freeze({ label: 'Mirror', description: 'Glassy still water: near-perfect reflections and almost no swell.' }),
  calm: Object.freeze({ label: 'Calm', description: 'Gentle pond ripples with soft reflections and no whitecaps.' }),
  lake: Object.freeze({ label: 'Lake', description: 'Default balanced lake water: light swell and the anime-blue palette.' }),
  river: Object.freeze({ label: 'River', description: 'Fast aligned current with fine chop, streaming foam lines, and strong caustics.' }),
  coast: Object.freeze({ label: 'Coast', description: 'Onshore swell with rolling surf, wide contact foam, and moderate breakers.' }),
  ocean: Object.freeze({ label: 'Ocean', description: 'Big open-water swell arriving in sets, with whitecaps and curling breakers.' }),
  storm: Object.freeze({ label: 'Storm', description: 'Maximum swell under a grey sky: close-out surf, heavy foam, and spray.' }),
});

// Runtime preset registry: seeded with the built-ins and extended by
// registerWaterPreset(). createWaterSettings resolves preset names through
// this map, so user-registered presets behave exactly like built-ins.
const waterPresetRegistry = new Map(
  WATER_PRESET_NAMES.map((name) => [name, {
    description: BUILT_IN_WATER_PRESET_METADATA[name].description,
    label: BUILT_IN_WATER_PRESET_METADATA[name].label,
    settings: WATER_PRESETS[name],
  }]),
);

// IP-wide rendition styles. A style is never returned by
// getWaterPresetOptions(); it composes over any entry in waterPresetRegistry.
const waterStyleRegistry = new Map();

function normalizeWaterPresetId(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .toLowerCase();
}

// Old public keys accepted for compatibility with existing URLs and presets.
const LEGACY_KEY_ALIASES = Object.freeze({
  impulseStrength: 'rippleStrength',
  intersectionFoamDistance: 'foamContactDistance',
  normalStrength: 'detailNormalStrength',
  simulationDamping: 'rippleDamping',
  simulationSpeed: 'ripplePropagation',
  vertexWaveAmount: 'rippleHeightScale',
});

export function resolveWaterPresetName(name) {
  const requested = String(name ?? '').toLowerCase();
  if (waterPresetRegistry.has(requested)) return requested;
  const normalized = normalizeWaterPresetId(requested);
  if (waterPresetRegistry.has(normalized)) return normalized;
  return WATER_PRESET_ALIASES[requested] ?? 'lake';
}

export function resolveWaterStyleName(name) {
  const requested = normalizeWaterPresetId(name || 'default');
  return waterStyleRegistry.has(requested) ? requested : 'default';
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampedNumber(value, fallback, min, max) {
  return Math.min(max, Math.max(min, finiteNumber(value, fallback)));
}

function colorArray(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  if (typeof value === 'number' || typeof value === 'string') {
    try {
      const color = new THREE.Color(value);
      return [color.r, color.g, color.b];
    } catch {
      return fallback.slice();
    }
  }
  if (value && typeof value === 'object') {
    const next = [value.r, value.g, value.b].map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  return fallback.slice();
}

function vector2Array(value, fallback) {
  if (value?.isVector2) return [value.x, value.y];
  if (Array.isArray(value) && value.length >= 2) {
    const next = value.slice(0, 2).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  if (value && typeof value === 'object') {
    const next = [value.x, value.y].map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  return fallback.slice();
}

function vector3Array(value, fallback) {
  if (value?.isVector3) return [value.x, value.y, value.z];
  if (Array.isArray(value) && value.length >= 3) {
    const next = value.slice(0, 3).map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  if (value && typeof value === 'object') {
    const next = [value.x, value.y, value.z].map(Number);
    return next.every(Number.isFinite) ? next : fallback.slice();
  }
  return fallback.slice();
}

function normalizeLegacyKeys(source) {
  const normalized = { ...source };
  for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_KEY_ALIASES)) {
    if (normalized[legacyKey] !== undefined && normalized[canonicalKey] === undefined) {
      normalized[canonicalKey] = normalized[legacyKey];
    }
  }
  // The old shader exposed waveStrength around 0.045..0.085; map it onto the
  // 0..1 intensity dial so historical URLs keep a comparable feel.
  if (normalized.waveStrength !== undefined && normalized.waveIntensity === undefined) {
    const legacyStrength = Number(normalized.waveStrength);
    if (Number.isFinite(legacyStrength)) {
      normalized.waveIntensity = Math.min(1, Math.max(0, legacyStrength * 8));
    }
  }
  return normalized;
}

export function createWaterSettings(options = {}) {
  const rawSource = options && typeof options === 'object' ? options : {};
  const source = normalizeLegacyKeys(rawSource);
  const requestedPreset = source.preset ?? source.mode;
  // Compatibility for the short-lived and historical style-as-preset API:
  // { preset: 'call_me_sensei', scenario: 'river' } becomes the explicit
  // { preset: 'river', style: 'call_me_sensei' } contract.
  const legacyStyle = waterStyleRegistry.has(normalizeWaterPresetId(requestedPreset))
    ? normalizeWaterPresetId(requestedPreset)
    : null;
  const preset = resolveWaterPresetName(
    legacyStyle && WATER_SCENARIO_IDS.has(source.scenario)
      ? source.scenario
      : (legacyStyle ? DEFAULT_WATER_SCENARIO : requestedPreset),
  );
  const style = resolveWaterStyleName(source.style ?? legacyStyle);
  const presetEntry = waterPresetRegistry.get(preset);
  const styleEntry = waterStyleRegistry.get(style);
  const presetSettings = {
    ...(presetEntry?.settings ?? WATER_PRESETS[preset] ?? {}),
    ...(styleEntry?.settings ?? {}),
    ...(styleEntry?.presets?.[preset] ?? styleEntry?.scenarios?.[preset] ?? {}),
  };
  const base = { ...DEFAULT_WATER_SETTINGS, ...presetSettings };
  const colorTone = resolveWaterColorToneName(source.colorTone ?? base.colorTone);
  // A chosen tone forces its palette (see WATER_COLOR_TONES).
  const tone = WATER_COLOR_TONES[colorTone];
  // ...but only the *palette*. The tone's non-colour scalars (clarity
  // distances, caustic/reflection/detail gains) are its recommended defaults,
  // not a lock: an explicit caller value wins over them. Before this, passing
  // `detailNormalStrength` or `reflectionStrength` alongside `colorTone:
  // 'anime'` was silently inert, which is exactly what §6.4 of the launch spec
  // asks for and could not get (D19-005). Callers that pass nothing are
  // resolved from the authored style recipe, then the tone recommendation.
  const styleRecipe = styleEntry?.presets?.[preset] ?? styleEntry?.scenarios?.[preset] ?? {};
  const toneScalar = (key) => source[key] ?? styleRecipe[key] ?? tone[key];

  const quality = WATER_QUALITY_LEVELS.includes(String(source.quality).toLowerCase())
    ? String(source.quality).toLowerCase()
    : base.quality;

  return {
    preset,
    style,
    mode: preset,
    colorTone,
    quality,

    waveIntensity: clampedNumber(source.waveIntensity, base.waveIntensity, 0, 1),
    waterLevel: finiteNumber(source.waterLevel, base.waterLevel),

    // Up to 5 m amplitude = 10 m crest-to-trough wave height at full intensity.
    waveAmplitude: clampedNumber(source.waveAmplitude, base.waveAmplitude, 0, 5),
    waveLength: clampedNumber(source.waveLength, base.waveLength, 0.5, 200),
    waveSteepness: clampedNumber(source.waveSteepness, base.waveSteepness, 0, 1.4),
    waveSpeed: clampedNumber(source.waveSpeed, base.waveSpeed, 0, 8),
    waveDirection: vector2Array(source.waveDirection, base.waveDirection),
    waveDirectionSpread: clampedNumber(source.waveDirectionSpread, base.waveDirectionSpread, 0, 1),
    shoalingDepth: clampedNumber(source.shoalingDepth, base.shoalingDepth, 0.05, 12),
    shorelineWaves: clampedNumber(source.shorelineWaves, base.shorelineWaves, 0, 1),
    shorelineRunup: clampedNumber(source.shorelineRunup, base.shorelineRunup, 0, 3),
    runupDistance: clampedNumber(source.runupDistance, base.runupDistance, 0, 15),
    breakerEnabled: typeof source.breakerEnabled === 'boolean'
      ? source.breakerEnabled
      : base.breakerEnabled !== false,
    breakerAmount: clampedNumber(source.breakerAmount, base.breakerAmount, 0, 1),
    breakerCurl: clampedNumber(source.breakerCurl, base.breakerCurl, 0, 1),
    breakerScale: clampedNumber(source.breakerScale, base.breakerScale, 0.25, 3),
    breakerPeel: clampedNumber(source.breakerPeel, base.breakerPeel, 0, 4),
    waveSetPeriod: clampedNumber(source.waveSetPeriod, base.waveSetPeriod, 8, 600),
    waveSetStrength: clampedNumber(source.waveSetStrength, base.waveSetStrength, 0, 1),

    detailNormalStrength: clampedNumber(toneScalar('detailNormalStrength'), base.detailNormalStrength, 0, 2),
    detailScale: clampedNumber(source.detailScale, base.detailScale, 0.05, 12),
    flowDirection: vector2Array(source.flowDirection, base.flowDirection),
    flowSpeed: clampedNumber(source.flowSpeed, base.flowSpeed, 0, 8),

    shallowColor: colorArray(tone.shallowColor ?? source.shallowColor, base.shallowColor),
    midColor: colorArray(tone.midColor ?? source.midColor, base.midColor),
    deepColor: colorArray(tone.deepColor ?? source.deepColor, base.deepColor),
    depthFadeDistance: clampedNumber(toneScalar('depthFadeDistance'), base.depthFadeDistance, 0.01, 60),
    deepFadeDistance: clampedNumber(toneScalar('deepFadeDistance'), base.deepFadeDistance, 0.01, 120),
    opacity: clampedNumber(source.opacity, base.opacity, 0, 1),
    refractionStrength: clampedNumber(source.refractionStrength, base.refractionStrength, 0, 3),
    indexOfRefraction: clampedNumber(
      source.indexOfRefraction, base.indexOfRefraction, 1.0001, 1.8,
    ),
    underwaterTransmission: clampedNumber(
      source.underwaterTransmission, base.underwaterTransmission, 0, 1,
    ),
    underwaterTintStrength: clampedNumber(
      source.underwaterTintStrength, base.underwaterTintStrength, 0, 1,
    ),
    causticsStrength: clampedNumber(toneScalar('causticsStrength'), base.causticsStrength, 0, 4),
    causticsScale: clampedNumber(source.causticsScale, base.causticsScale, 0.02, 12),
    causticsSpeed: clampedNumber(source.causticsSpeed, base.causticsSpeed, 0, 8),

    foamColor: colorArray(source.foamColor, base.foamColor),
    foamAmount: clampedNumber(source.foamAmount, base.foamAmount, 0, 2),
    swashFoamAmount: clampedNumber(source.swashFoamAmount, base.swashFoamAmount, 0, 2),
    swashFoamLifetime: clampedNumber(
      source.swashFoamLifetime, base.swashFoamLifetime, 0.25, 30,
    ),
    swashFoamResidueLifetime: clampedNumber(
      source.swashFoamResidueLifetime, base.swashFoamResidueLifetime, 0.5, 60,
    ),
    wetSandDryTime: clampedNumber(source.wetSandDryTime, base.wetSandDryTime, 2, 600),
    wetSandDarkening: clampedNumber(
      source.wetSandDarkening, base.wetSandDarkening, 0, 1,
    ),
    wetSandSheen: clampedNumber(source.wetSandSheen, base.wetSandSheen, 0, 1),
    foamContactDistance: clampedNumber(source.foamContactDistance, base.foamContactDistance, 0.01, 8),
    foamLineSpacing: clampedNumber(source.foamLineSpacing, base.foamLineSpacing, 0.05, 8),
    foamNoiseScale: clampedNumber(source.foamNoiseScale, base.foamNoiseScale, 0.02, 12),
    whitecapAmount: clampedNumber(source.whitecapAmount, base.whitecapAmount, 0, 1),
    rippleFoamStrength: clampedNumber(source.rippleFoamStrength, base.rippleFoamStrength, 0, 4),

    sunDirection: vector3Array(source.sunDirection, base.sunDirection),
    sunColor: colorArray(source.sunColor, base.sunColor),
    specularStrength: clampedNumber(source.specularStrength, base.specularStrength, 0, 4),
    specularShininess: clampedNumber(source.specularShininess, base.specularShininess, 2, 4000),
    specularStretch: clampedNumber(source.specularStretch, base.specularStretch, 0, 0.95),
    sparkleStrength: clampedNumber(source.sparkleStrength, base.sparkleStrength, 0, 4),
    sparkleScale: clampedNumber(source.sparkleScale, base.sparkleScale, 0.05, 24),
    sparkleSpeed: clampedNumber(source.sparkleSpeed, base.sparkleSpeed, 0, 8),
    sunGlowStrength: clampedNumber(source.sunGlowStrength, base.sunGlowStrength, 0, 4),
    sceneShadowStrength: clampedNumber(source.sceneShadowStrength, base.sceneShadowStrength, 0, 1),
    fresnelStrength: clampedNumber(source.fresnelStrength, base.fresnelStrength, 0, 2),
    fresnelPower: clampedNumber(source.fresnelPower, base.fresnelPower, 0.5, 16),
    fresnelBias: clampedNumber(toneScalar('fresnelBias'), base.fresnelBias, 0, 0.6),
    fresnelColor: colorArray(tone.fresnelColor ?? source.fresnelColor, base.fresnelColor),
    skyZenithColor: colorArray(source.skyZenithColor, base.skyZenithColor),
    skyHorizonColor: colorArray(source.skyHorizonColor, base.skyHorizonColor),
    reflectionStrength: clampedNumber(toneScalar('reflectionStrength'), base.reflectionStrength, 0, 1.5),
    reflectionDistortion: clampedNumber(source.reflectionDistortion, base.reflectionDistortion, 0, 0.5),
    reflectionSoftness: clampedNumber(toneScalar('reflectionSoftness'), base.reflectionSoftness, 0, 1),

    rippleStrength: clampedNumber(source.rippleStrength, base.rippleStrength, 0, 8),
    rippleDamping: clampedNumber(source.rippleDamping, base.rippleDamping, 0.8, 0.9995),
    ripplePropagation: clampedNumber(source.ripplePropagation, base.ripplePropagation, 0.5, 80),
    rippleHeightScale: clampedNumber(source.rippleHeightScale, base.rippleHeightScale, 0, 6),
    rippleFoamDecay: clampedNumber(source.rippleFoamDecay, base.rippleFoamDecay, 0.5, 0.999),
    rippleFoamGain: clampedNumber(source.rippleFoamGain, base.rippleFoamGain, 0, 20),

    splashStrength: clampedNumber(source.splashStrength, base.splashStrength, 0, 4),
    splashScale: clampedNumber(source.splashScale, base.splashScale, 0.1, 6),
    splashDropletCount: Math.round(clampedNumber(source.splashDropletCount, base.splashDropletCount, 0, 160)),
    splashRingCount: Math.round(clampedNumber(source.splashRingCount, base.splashRingCount, 0, 5)),
    splashColor: colorArray(source.splashColor, base.splashColor),
    splashShadeColor: colorArray(source.splashShadeColor, base.splashShadeColor),
  };
}

function waterSettingValueEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => waterSettingValueEqual(value, right[index]));
  }
  if (left && right && typeof left === 'object' && typeof right === 'object') {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length
      && leftKeys.every((key) => Object.hasOwn(right, key)
        && waterSettingValueEqual(left[key], right[key]));
  }
  return false;
}

/**
 * Rebase authored Water settings onto another IP-wide style while retaining
 * only the user's actual overrides. This prevents a complete serialized
 * preset from masking every field supplied by the newly selected style.
 */
export function rebaseWaterSettingsStyle(settings = {}, style = 'default') {
  const current = createWaterSettings(settings);
  const oldBase = createWaterSettings({ preset: current.preset, style: current.style });
  const overrides = Object.fromEntries(
    Object.entries(current)
      .filter(([key, value]) => !['mode', 'preset', 'style'].includes(key)
        && !waterSettingValueEqual(value, oldBase[key])),
  );
  return createWaterSettings({
    preset: current.preset,
    style: resolveWaterStyleName(style),
    ...overrides,
  });
}

// --- Gerstner wave spectrum -------------------------------------------------

// Deterministic per-wave pseudo random values so the CPU mirror, the shader
// uniforms, and reloads always agree.
function waveRandom(index, salt) {
  const value = Math.sin(index * 127.1 + salt * 311.7) * 43758.5453;
  return value - Math.floor(value);
}

// Builds the Gerstner spectrum evaluated by both the shader and
// sampleGerstnerHeight. Keep in sync with chunks/water-waves.glsl.
export function buildGerstnerWaves(settings) {
  const resolved = settings?.waveDirection ? settings : createWaterSettings(settings);
  const mainAngle = Math.atan2(resolved.waveDirection[1], resolved.waveDirection[0]);
  const intensity = Math.pow(resolved.waveIntensity, 1.35);
  const baseAmplitude = resolved.waveAmplitude * intensity;
  const spread = resolved.waveDirectionSpread * Math.PI * 0.85;

  const waves = [];
  for (let i = 0; i < WATER_GERSTNER_WAVE_COUNT; i += 1) {
    const wavelength = Math.max(resolved.waveLength * Math.pow(0.68, i), 0.05);
    let waveNumber = (2 * Math.PI) / wavelength;
    const amplitude = baseAmplitude * Math.pow(wavelength / resolved.waveLength, 0.85);
    // Deep-water waves are slope-limited: they break beyond ka ~ 0.44, so a
    // big amplitude forces a proportionally longer wavelength — exactly like
    // real swell (a 10 m sea is hundreds of meters long, not 13). Without
    // this cap a big Height dial turns the surface into jagged spikes.
    if (amplitude * waveNumber > 0.4) {
      waveNumber = 0.4 / amplitude;
    }
    // The primary swell travels exactly along waveDirection; spread only
    // scatters the secondary components. Keeps the dominant crest lines
    // long and parallel (what breakers phase-lock to), like real swell.
    const angle = i === 0 ? mainAngle : mainAngle + (waveRandom(i, 1.0) * 2 - 1) * spread;
    const omega = Math.sqrt(9.81 * waveNumber) * resolved.waveSpeed;
    waves.push({
      dirX: Math.cos(angle),
      dirZ: Math.sin(angle),
      omega,
      waveNumber,
      amplitude,
      phase: waveRandom(i, 7.0) * Math.PI * 2,
      steepness: resolved.waveSteepness * (0.35 + 0.65 * resolved.waveIntensity),
      crestWeight: Math.sqrt(wavelength / resolved.waveLength),
    });
  }

  // Wave sets: real swell arrives in groups — the big waves come minutes
  // apart, not every period. Splitting the primary component into a beat
  // pair (slots 0 and 1: same direction, slightly different frequency) makes
  // their interference modulate the swell amplitude with period
  // waveSetPeriod. The pair is dispersion-consistent, so set envelopes march
  // in from open water at group velocity instead of pulsing in place.
  // Everything downstream — heightfield, CPU buoyancy mirror, breakers —
  // inherits the grouping because it lives inside the same wave stack.
  const setStrength = resolved.waveSetStrength;
  if (setStrength > 0.001 && waves.length >= 2) {
    const primary = waves[0];
    // Detune in intrinsic frequency, then apply the common time scale.
    // The old fixed omega offset kept the beat moving at speed=0 and made
    // k explode as speed approached zero. A group requires nearby frequencies.
    const intrinsicOmega = Math.sqrt(9.81 * primary.waveNumber);
    const speedScale = resolved.waveSpeed;
    const detuning = Math.min(
      (2 * Math.PI) / (Math.max(resolved.waveSetPeriod, 1) * Math.max(speedScale, 1e-3)),
      intrinsicOmega * 0.25,
    );
    const beatIntrinsicOmega = intrinsicOmega + detuning;
    const beatOmega = beatIntrinsicOmega * speedScale;
    const beat = {
      ...primary,
      amplitude: primary.amplitude * setStrength * 0.5,
      omega: beatOmega,
      waveNumber: beatIntrinsicOmega ** 2 / 9.81,
      phase: primary.phase + 2.39,
    };
    primary.amplitude *= 1 - setStrength * 0.5;
    waves.pop(); // drop the smallest tail component to keep the count fixed
    waves.splice(1, 0, beat);
  }
  // Budget the FINAL spectrum, including its beat partner. Per-component
  // ka limits alone allow eight individually legal waves to form spike-like
  // sums. Stretch the spectrum together, preserving height and relative
  // wavelengths, with a conservative aggregate slope budget (not a breaking
  // law). Recompute frequencies through gravity-wave dispersion.
  const slopeSum = waves.reduce((sum, wave) => sum + wave.waveNumber * wave.amplitude, 0);
  const stretch = Math.max(1, slopeSum / 0.8);
  for (const wave of waves) {
    wave.waveNumber /= stretch;
    wave.omega = Math.sqrt(9.81 * wave.waveNumber) * resolved.waveSpeed;
  }
  const steepnessSum = waves.reduce(
    (sum, wave) => sum + wave.steepness * wave.waveNumber * wave.amplitude, 0);
  const chopScale = Math.min(1, 0.85 / Math.max(steepnessSum, 1e-8));
  for (const wave of waves) wave.steepness *= chopScale;
  return waves;
}

// CPU mirror of the shader's vertical Gerstner displacement. Horizontal
// choppiness is intentionally ignored, which keeps queries cheap and is
// accurate enough for buoyancy and interaction tests. chopWeight mirrors the
// shader's shallow-water spectrum filter: slots 0/1 (the dominant swell and
// its set beat partner) always pass at full strength, shorter cross chop
// fades toward the surf zone. The optional nearshore sample mirrors the
// vertex shader's depth-blended q(x,z) phase coordinate for slot 0 and, when
// the slot mask permits it, its authored same-direction beat partner in slot 1.
export function sampleGerstnerHeight(
  waves,
  x,
  z,
  time,
  chopWeight = 1,
  nearshore = null,
) {
  const nearshoreBlend = THREE.MathUtils.clamp(Number(nearshore?.blend) || 0, 0, 1);
  const nearshoreSlotMask = Number.isFinite(Number(nearshore?.slotMask))
    ? THREE.MathUtils.clamp(Number(nearshore.slotMask), 0, 2)
    : 2;
  let height = 0;
  for (let i = 0; i < waves.length; i += 1) {
    const wave = waves[i];
    const baseCoordinate = wave.dirX * x + wave.dirZ * z;
    const slotWeight = i === 0
      ? Math.min(nearshoreSlotMask, 1)
      : i === 1
        ? Math.max(nearshoreSlotMask - 1, 0)
        : 0;
    const slotBlend = nearshoreBlend * slotWeight;
    const phaseCoordinate = slotBlend > 0
      ? THREE.MathUtils.lerp(baseCoordinate, nearshore.phaseCoordinate, slotBlend)
      : baseCoordinate;
    const theta = wave.waveNumber * phaseCoordinate -
      wave.omega * time + wave.phase;
    height += wave.amplitude * (i < 2 ? 1 : chopWeight) * Math.sin(theta);
  }
  return height;
}

// CPU mirror of createWaterWavesChunk().gerstnerSwellHeight: only the two
// long components that survive into the surf zone. Swash samples this at a
// projected shoreline point to keep its edge connected across the beach.
export function sampleGerstnerSwellHeight(waves, x, z, time, nearshore = null) {
  const nearshoreBlend = THREE.MathUtils.clamp(Number(nearshore?.blend) || 0, 0, 1);
  const nearshoreSlotMask = Number.isFinite(Number(nearshore?.slotMask))
    ? THREE.MathUtils.clamp(Number(nearshore.slotMask), 0, 2)
    : 2;
  let height = 0;
  for (let i = 0; i < Math.min(2, waves.length); i += 1) {
    const wave = waves[i];
    const baseCoordinate = wave.dirX * x + wave.dirZ * z;
    const slotWeight = i === 0
      ? Math.min(nearshoreSlotMask, 1)
      : Math.max(nearshoreSlotMask - 1, 0);
    const slotBlend = nearshoreBlend * slotWeight;
    const phaseCoordinate = slotBlend > 0
      ? THREE.MathUtils.lerp(baseCoordinate, nearshore.phaseCoordinate, slotBlend)
      : baseCoordinate;
    const theta = wave.waveNumber * phaseCoordinate -
      wave.omega * time + wave.phase;
    height += wave.amplitude * Math.sin(theta);
  }
  return height;
}

// 0..1 cycle of the primary crest at the rest shoreline. Zero is crest
// arrival; the shader uses the same cycle for the connected swash event.
export function samplePrimarySwellSequence(waves, time) {
  const primary = waves?.[0];
  if (!primary) return { cycle: 0, index: 0 };
  const raw = (primary.omega * time - primary.phase + Math.PI * 0.5) / (Math.PI * 2);
  const index = Math.floor(raw);
  return { cycle: raw - index, index };
}

export function samplePrimarySwellCycle(waves, time) {
  return samplePrimarySwellSequence(waves, time).cycle;
}

// One physical swash event: fast uprush, slower gravity-driven backwash.
// Unlike a signed sine, this never drains the sea below the rest shoreline.
export function shapeSwashProgress(cycle, uprushFraction = 0.34) {
  const phase = ((Number(cycle) || 0) % 1 + 1) % 1;
  const riseEnd = THREE.MathUtils.clamp(uprushFraction, 0.1, 0.8);
  if (phase <= riseEnd) {
    return Math.sin((phase / riseEnd) * Math.PI * 0.5);
  }
  const drain = (phase - riseEnd) / (1 - riseEnd);
  return Math.sin((1 - drain) * Math.PI * 0.5);
}

function swashHash(value) {
  let x = ((value * 0.1031) % 1 + 1) % 1;
  x *= x + 33.33;
  x *= x + x;
  return ((x % 1) + 1) % 1;
}

// Low-frequency shoreline shape for one swash event. This is CPU-authored so
// the visible water, persistent foam pass, and gameplay queries all receive
// the same bounded tongue pattern without adding procedural noise to the
// private-memory-heavy visible fragment shader.
export function sampleSwashEventShape(cycleIndex) {
  const index = Math.floor(Number(cycleIndex) || 0);
  return {
    phase: swashHash(index + 113.17) * Math.PI * 2,
    frequency: THREE.MathUtils.lerp(0.085, 0.16, swashHash(index + 197.31)),
    amplitude: THREE.MathUtils.lerp(0.55, 1.05, swashHash(index + 251.73)),
  };
}

// Per-event forcing for an irregular swash train. A four-wave interpolated
// group term supplies the observed low-frequency envelope; the individual
// term keeps neighbouring bores from sharing one reach. Backwash strength is
// correlated with the event energy but retains its own variability.
function sampleSwashForcing(cycleIndex) {
  const groupPosition = cycleIndex / 4;
  const groupIndex = Math.floor(groupPosition);
  const groupT = groupPosition - groupIndex;
  const groupEase = groupT * groupT * (3 - 2 * groupT);
  const group = THREE.MathUtils.lerp(
    swashHash(groupIndex + 19.19),
    swashHash(groupIndex + 20.19),
    groupEase,
  );
  const individual = swashHash(cycleIndex + 7.73);
  const baseRunupScale = 0.82 + group * 0.1 + individual * 0.08;
  const normalizedRunup = THREE.MathUtils.clamp((baseRunupScale - 0.8) / 0.2, 0, 1);
  const backwashStrength = THREE.MathUtils.clamp(
    normalizedRunup * 0.62 + swashHash(cycleIndex + 71.37) * 0.38,
    0,
    1,
  );
  return { backwashStrength, baseRunupScale };
}

// Bounded stylized event statistics, informed by random-wave run-up and
// swash-interaction measurements: ordinary peaks cover 80–100% of the user
// reach, wave groups correlate several events, and a deep preceding rundown
// can lend a small amount of momentum to the next bore. The carry is capped
// at 2% of the authored reach (20 cm for the 10 m calibration beach), so it
// never overwhelms the event's own forcing. `rundownOffset` is metres relative
// to the still-water shoreline (negative = farther seaward).
export function sampleSwashCycleVariation(cycleIndex) {
  const index = Math.floor(Number(cycleIndex) || 0);
  const current = sampleSwashForcing(index);
  const previous = sampleSwashForcing(index - 1);
  const backwashCarry = Math.max(previous.backwashStrength - 0.5, 0) * 0.04;
  return {
    backwashStrength: current.backwashStrength,
    backwashCarry,
    baseRunupScale: current.baseRunupScale,
    rundownOffset: THREE.MathUtils.lerp(0.35, -0.9, current.backwashStrength),
    runupScale: THREE.MathUtils.clamp(current.baseRunupScale + backwashCarry, 0.8, 1),
  };
}

// Numerical extinction near zero forcing. This does not turn the authored
// run-up animation into a hydrodynamic solver; it prevents a dry/flat spectrum
// from driving a full-distance swash event. Fade over the last 5 cm of summed
// amplitude so the limit is continuous instead of an on/off snap.
function swashActivity(waves) {
  const amplitude = (waves ?? []).reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0);
  return THREE.MathUtils.smoothstep(amplitude, 0, 0.05);
}

// Continuous centerline position of the swash edge in metres along the beach.
// Event N begins exactly at event N-1's rundown endpoint, rises to its own
// varying inland maximum, then drains to a new endpoint without a reset jump.
export function sampleSwashDistance(waves, time, runupDistance, uprushFraction = 0.34) {
  const sequence = samplePrimarySwellSequence(waves, time);
  const current = sampleSwashCycleVariation(sequence.index);
  const previous = sampleSwashCycleVariation(sequence.index - 1);
  const progress = shapeSwashProgress(sequence.cycle, uprushFraction);
  const peak = Math.max(Number(runupDistance) || 0, 0) * current.runupScale;
  return swashActivity(waves) * (sequence.cycle <= uprushFraction
    ? THREE.MathUtils.lerp(previous.rundownOffset, peak, progress)
    : THREE.MathUtils.lerp(current.rundownOffset, peak, progress));
}

// One CPU-authored frame shared by the visible swash and the persistent
// shore-state pass. Keeping event identity, incidence, and derivatives here
// prevents a foam/wetness texture from becoming a second animation with a
// slightly different phase or direction.
export function sampleSwashFrameState(
  waves,
  time,
  runupDistance = 0,
  uprushFraction = 0.34,
) {
  const sequence = samplePrimarySwellSequence(waves, time);
  const current = sampleSwashCycleVariation(sequence.index);
  const previous = sampleSwashCycleVariation(sequence.index - 1);
  const edgeShape = sampleSwashEventShape(sequence.index);
  const progress = shapeSwashProgress(sequence.cycle, uprushFraction);
  const derivativeStep = 0.02;
  const beforeSequence = samplePrimarySwellSequence(waves, time - derivativeStep);
  const afterSequence = samplePrimarySwellSequence(waves, time + derivativeStep);
  const progressSpeed = (
    shapeSwashProgress(afterSequence.cycle, uprushFraction) -
    shapeSwashProgress(beforeSequence.cycle, uprushFraction)
  ) / (derivativeStep * 2);
  const activity = swashActivity(waves);
  const maximumDistance = Math.max(Number(runupDistance) || 0, 0);
  const edgeDistance = maximumDistance > 0
    ? sampleSwashDistance(waves, time, maximumDistance, uprushFraction)
    : 0;
  const edgeDistanceSpeed = maximumDistance > 0
    ? (
      sampleSwashDistance(waves, time + derivativeStep, maximumDistance, uprushFraction) -
      sampleSwashDistance(waves, time - derivativeStep, maximumDistance, uprushFraction)
    ) / (derivativeStep * 2)
    : 0;
  return {
    cycle: sequence.cycle,
    cycleSpeed: Math.max(Number(waves?.[0]?.omega) || 0, 0) / (Math.PI * 2),
    edgeDistance,
    edgeDistanceSpeed,
    eventIndex: sequence.index,
    isUprush: sequence.cycle < uprushFraction,
    primaryDirectionX: waves?.[0]?.dirX ?? 0,
    primaryDirectionZ: waves?.[0]?.dirZ ?? -1,
    progress,
    progressSpeed,
    activity,
    runupScale: current.runupScale * activity,
    startOffset: previous.rundownOffset * activity,
    endOffset: current.rundownOffset * activity,
    edgeShape,
  };
}

// Connected oblique lip: the large term follows the incoming crest angle and
// small traveling scallops prevent a ruler-straight shoreline. A residual
// envelope at nominal rest/full reach represents the alongshore arrival lag;
// the centerline remains the 0..runupDistance calibration reference.
export function sampleSwashEdgeOffset(
  x,
  time,
  progress,
  waveDirectionX = 0,
  cycle = 0,
  edgeShape = null,
) {
  const p = THREE.MathUtils.clamp(Number(progress) || 0, 0, 1);
  const envelope = THREE.MathUtils.lerp(0.18, 1, Math.sin(Math.PI * p));
  // A literal infinite oblique line grows without bound across a wide water
  // tile. The old implementation then hard-clamped that line to the event's
  // run-up maximum, pinning tens of metres of shore to one ruler-straight
  // endpoint before releasing it a mesh column at a time. Soft-sign retains
  // the incidence angle around the camera while approaching a finite offset
  // smoothly, so it never creates a saturated plateau.
  const incidenceSlope = THREE.MathUtils.clamp(
    Number(waveDirectionX) * 0.52,
    -0.2,
    0.2,
  );
  const rawTilt = -x * incidenceSlope;
  const maximumTilt = 2.0;
  const tilt = rawTilt / (1 + Math.abs(rawTilt) / maximumTilt);
  const scallop = (
    Math.sin(x * 0.32 - time * 0.35) - Math.sin(-time * 0.35) +
    (Math.sin(x * 0.91 + time * 0.18) - Math.sin(time * 0.18)) * 0.35
  ) * 0.4;
  const shape = edgeShape ?? { phase: 0, frequency: 0.1, amplitude: 0 };
  const phase = Number(shape.phase) || 0;
  const frequency = THREE.MathUtils.clamp(Number(shape.frequency) || 0.1, 0.02, 0.5);
  const amplitude = THREE.MathUtils.clamp(Number(shape.amplitude) || 0, 0, 2.5);
  const secondaryPhase = phase * -0.71;
  const macroBase = (
    Math.sin(x * frequency + phase) - Math.sin(phase) +
    (Math.sin(x * frequency * 2.35 + secondaryPhase) - Math.sin(secondaryPhase)) * 0.42
  ) * amplitude;
  const macroWave = Math.sin(THREE.MathUtils.clamp(Number(cycle) || 0, 0, 1) * Math.PI);
  const macroEnvelope = macroWave * macroWave;
  return (tilt + scallop) * envelope + macroBase * macroEnvelope;
}

// --- Field schema -----------------------------------------------------------

export const WATER_SETTING_GROUPS = Object.freeze([
  Object.freeze({ id: 'waves', label: 'Waves', description: 'Gerstner swell and detail ripple shaping.' }),
  Object.freeze({ id: 'surface', label: 'Surface', description: 'Water body color, refraction, and caustics.' }),
  Object.freeze({ id: 'foam', label: 'Foam', description: 'Shoreline foam, whitecaps, and wake foam.' }),
  Object.freeze({ id: 'lighting', label: 'Lighting', description: 'Authored fallback sun/sky plus water-specific glint, fresnel, and reflection response.' }),
  Object.freeze({ id: 'ripples', label: 'Ripples', description: 'Interactive ripple simulation response.' }),
  Object.freeze({ id: 'splashes', label: 'Splashes', description: 'Procedural splash droplets, spray, and rings.' }),
  Object.freeze({ id: 'quality', label: 'Quality', description: 'Shader quality tier gating caustics, sparkles, and noise octaves.' }),
]);

const FIELD_METADATA = {
  waveIntensity: { group: 'waves', label: 'Wave Intensity', min: 0, max: 1, step: 0.01, description: 'Authored baseline from glassy mirror (0) to storm swell (1); scene weather can transiently modulate it without changing the preset.' },
  waterLevel: { group: 'waves', label: 'Water Level', min: 0, max: 4, step: 0.01, description: 'World-space rest height of the surface; waves and run-up displace around it.' },
  waveAmplitude: { group: 'waves', label: 'Wave Amplitude', min: 0, max: 5, step: 0.01, description: 'Primary amplitude in meters at full intensity, before splitting into a wave set. The combined surface includes smaller waves; its wavelengths lengthen to keep slopes bounded.' },
  shoalingDepth: { group: 'waves', label: 'Shoaling Depth', min: 0.05, max: 12, step: 0.05, description: 'Column depth in meters at which waves reach full height; shallower water shrinks them (needs a bed height sampler).' },
  shorelineWaves: { group: 'waves', label: 'Shoreline Waves', min: 0, max: 1, step: 0.01, description: 'Fraction of wave height that keeps rolling through the shallows as surf before dying at the waterline.' },
  shorelineRunup: { group: 'waves', label: 'Shoreline Run-up', min: 0, max: 3, step: 0.05, description: 'How far incoming waves wash a thin foam film up the beach; reach scales with wave energy.' },
  runupDistance: { group: 'waves', label: 'Max Run-up Distance', min: 0, max: 15, step: 0.5, description: 'Maximum horizontal reach in meters. Wave groups vary each event from 80–100%, and each backwash hands its endpoint into the next uprush. 0 lets wave energy decide.' },
  breakerEnabled: { group: 'waves', label: 'Breakers On', type: 'boolean', description: 'Master switch for the breaker system; off removes the mesh and skips all breaker work (for perf A/B).' },
  breakerAmount: { group: 'waves', label: 'Surf Breakers', min: 0, max: 1, step: 0.01, description: 'Dedicated curling breaker shells along the break line; 0 disables the system (needs a bed height sampler).' },
  breakerCurl: { group: 'waves', label: 'Breaker Curl', min: 0, max: 1, step: 0.01, description: 'Lip pitch: 0 spills down the face, 1 curls a full surfable tunnel.' },
  breakerScale: { group: 'waves', label: 'Breaker Height', min: 0.25, max: 3, step: 0.05, description: 'Shell height multiplier over the physical breaking height (0.72x column depth).' },
  breakerPeel: { group: 'waves', label: 'Breaker Peel', min: 0, max: 4, step: 0.05, description: 'How fast the barrel section travels sideways along the crest line.' },
  waveLength: { group: 'waves', label: 'Wave Length', min: 1, max: 120, step: 0.1, description: 'Longest wavelength in meters; smaller waves are derived from it. Big swells need long wavelengths to stay stable.' },
  waveSteepness: { group: 'waves', label: 'Wave Steepness', min: 0, max: 1.4, step: 0.01, description: 'Gerstner chop; higher values pinch crests sharper.' },
  waveSpeed: { group: 'waves', label: 'Wave Speed', min: 0, max: 4, step: 0.01, description: 'Phase speed multiplier over the deep-water dispersion.' },
  waveDirection: { group: 'waves', label: 'Wave Direction', type: 'vector2', description: 'Main travel direction of the swell in the XZ plane.' },
  waveDirectionSpread: { group: 'waves', label: 'Direction Spread', min: 0, max: 1, step: 0.01, description: '0 keeps all waves aligned (river); 1 spreads them omnidirectionally (open sea). The primary swell always follows Wave Direction exactly.' },
  waveSetPeriod: { group: 'waves', label: 'Set Period (s)', min: 8, max: 600, step: 1, description: 'Requested minimum interval between wave-set peaks. Stability limits and slow motion can lengthen it.' },
  waveSetStrength: { group: 'waves', label: 'Set Strength', min: 0, max: 1, step: 0.01, description: 'Depth of the set/lull cycle: 0 = constant swell, 1 = the swell dies completely between sets.' },
  detailNormalStrength: { group: 'waves', label: 'Detail Normals', min: 0, max: 2, step: 0.01, description: 'Strength of the procedural micro-ripple normal detail.' },
  detailScale: { group: 'waves', label: 'Detail Scale', min: 0.05, max: 8, step: 0.05, description: 'Spatial frequency of the micro-ripple detail.' },
  flowDirection: { group: 'waves', label: 'Flow Direction', type: 'vector2', description: 'Scroll direction for detail ripples, foam noise, and sparkles.' },
  flowSpeed: { group: 'waves', label: 'Flow Speed', min: 0, max: 4, step: 0.01, description: 'Scroll speed for surface detail; high values read as a river current.' },

  colorTone: {
    group: 'surface',
    label: 'Color Tone',
    type: 'select',
    options: WATER_COLOR_TONE_NAMES,
    optionLabels: Object.freeze({
      caribbean: 'Caribbean',
      classic: 'Classic',
      deepOcean: 'Deep Ocean',
      anime: 'Anime',
      lagoon: 'Lagoon',
      teal: 'Teal',
    }),
    description: 'Named body-color palette forced over the preset colors; classic returns control to the preset.',
  },
  shallowColor: { group: 'surface', label: 'Shallow Color', type: 'color', description: 'Water tint right at the shoreline.' },
  midColor: { group: 'surface', label: 'Mid Color', type: 'color', description: 'Water tint at moderate depth.' },
  deepColor: { group: 'surface', label: 'Deep Color', type: 'color', description: 'Water tint where the bottom is no longer visible.' },
  depthFadeDistance: { group: 'surface', label: 'Depth Fade', min: 0.05, max: 12, step: 0.05, description: 'Water column depth where the shallow tint gives way to mid.' },
  deepFadeDistance: { group: 'surface', label: 'Deep Fade', min: 0.05, max: 24, step: 0.05, description: 'Additional depth where mid fades to the deep tint.' },
  opacity: { group: 'surface', label: 'Opacity', min: 0, max: 1, step: 0.01, description: 'Base transparency when no scene color grab pass is bound.' },
  refractionStrength: { group: 'surface', label: 'Refraction', min: 0, max: 2, step: 0.01, description: 'Screen-space distortion of the underwater scene.' },
  indexOfRefraction: { group: 'surface', label: 'Water IOR', min: 1.0001, max: 1.8, step: 0.001, description: 'Index of refraction used by the underwater Snell window and total internal reflection.' },
  underwaterTransmission: { group: 'surface', label: 'Underwater View', min: 0, max: 1, step: 0.01, description: 'Visibility of the real above-water scene through the surface from below.' },
  underwaterTintStrength: { group: 'surface', label: 'Underwater Tint', min: 0, max: 1, step: 0.01, description: 'Stylized water-color tint applied to the view through the surface.' },
  causticsStrength: { group: 'surface', label: 'Caustics', min: 0, max: 3, step: 0.01, description: 'Brightness of focused sunlight on the submerged bed. The dynamics path derives focusing from the water normals.' },
  causticsScale: { group: 'surface', label: 'Caustics Scale', min: 0.05, max: 8, step: 0.05, description: 'Spatial frequency of the caustic web.' },
  causticsSpeed: { group: 'surface', label: 'Caustics Speed', min: 0, max: 4, step: 0.01, description: 'Animation speed of the caustic web.' },

  foamColor: { group: 'foam', label: 'Foam Color', type: 'color', description: 'Color of all foam: shoreline, whitecaps, wakes, and splashes.' },
  foamAmount: { group: 'foam', label: 'Foam Amount', min: 0, max: 2, step: 0.01, description: 'Offshore contact foam, whitecap, and wake gain.' },
  swashFoamAmount: { group: 'foam', label: 'Swash Foam', min: 0, max: 2, step: 0.01, description: 'Independent gain for torn foam carried up and back down the beach.' },
  swashFoamLifetime: { group: 'foam', label: 'Swash Foam Life (s)', min: 0.25, max: 30, step: 0.25, description: 'Seconds fresh aerated swash foam remains before thinning into residue.' },
  swashFoamResidueLifetime: { group: 'foam', label: 'Foam Residue Life (s)', min: 0.5, max: 60, step: 0.5, description: 'Seconds fragmented beach foam persists and drifts after the active front passes.' },
  wetSandDryTime: { group: 'foam', label: 'Wet Sand Drying (s)', min: 2, max: 600, step: 1, description: 'Seconds saturated sand takes to return to its dry color after the water retreats.' },
  wetSandDarkening: { group: 'foam', label: 'Wet Sand Darkening', min: 0, max: 1, step: 0.01, description: 'How strongly remembered moisture darkens exposed sand.' },
  wetSandSheen: { group: 'foam', label: 'Wet Sand Sheen', min: 0, max: 1, step: 0.01, description: 'Strength of the short-lived glossy water film left on freshly exposed sand.' },
  foamContactDistance: { group: 'foam', label: 'Contact Distance', min: 0.02, max: 4, step: 0.01, description: 'Depth difference covered by the solid contact foam band.' },
  foamLineSpacing: { group: 'foam', label: 'Line Spacing', min: 0.05, max: 4, step: 0.01, description: 'Spacing of the animated lapping foam lines off the shore.' },
  foamNoiseScale: { group: 'foam', label: 'Foam Noise Scale', min: 0.05, max: 8, step: 0.05, description: 'Breakup noise frequency for foam edges.' },
  whitecapAmount: { group: 'foam', label: 'Whitecaps', min: 0, max: 1, step: 0.01, description: 'Coverage of breaking crests on open water.' },
  rippleFoamStrength: { group: 'foam', label: 'Wake Foam', min: 0, max: 3, step: 0.01, description: 'Foam intensity left behind by interactive ripples and wakes.' },

  sunDirection: { group: 'lighting', label: 'Sun Direction', type: 'vector3', description: 'Authored fallback direction toward the sun when no live scene-light override is connected.' },
  sunColor: { group: 'lighting', label: 'Sun Color', type: 'color', description: 'Authored fallback sun tint for glints, sparkles, and caustics; a live scene rig may replace it transiently.' },
  specularStrength: { group: 'lighting', label: 'Specular', min: 0, max: 3, step: 0.01, description: 'Toon sun-glint intensity.' },
  specularShininess: { group: 'lighting', label: 'Shininess', min: 4, max: 2000, step: 1, description: 'Glint tightness; higher is smaller and sharper.' },
  specularStretch: { group: 'lighting', label: 'Glint Stretch', min: 0, max: 0.95, step: 0.01, description: 'Elongates glints along the sun azimuth into a sparkling sun path.' },
  sparkleStrength: { group: 'lighting', label: 'Sparkles', min: 0, max: 3, step: 0.01, description: 'Twinkling star-glint intensity.' },
  sparkleScale: { group: 'lighting', label: 'Sparkle Scale', min: 0.1, max: 16, step: 0.1, description: 'Density of the sparkle field.' },
  sparkleSpeed: { group: 'lighting', label: 'Sparkle Speed', min: 0, max: 6, step: 0.05, description: 'How quickly sparkles twinkle in and out.' },
  sunGlowStrength: { group: 'lighting', label: 'Sun Glow', min: 0, max: 3, step: 0.01, description: 'Sun disk glow in the procedural sky reflection.' },
  sceneShadowStrength: { group: 'lighting', label: 'Scene Shadows', min: 0, max: 1, step: 0.01, description: 'How strongly cast shadows from rocks, trees, and the character darken the surface.' },
  fresnelStrength: { group: 'lighting', label: 'Fresnel', min: 0, max: 2, step: 0.01, description: 'Grazing-angle reflectivity boost.' },
  fresnelPower: { group: 'lighting', label: 'Fresnel Power', min: 0.5, max: 12, step: 0.1, description: 'Falloff of the fresnel band toward the horizon.' },
  fresnelBias: { group: 'lighting', label: 'Fresnel Bias', min: 0, max: 0.6, step: 0.01, description: 'Sky-tint floor at steep angles; higher reads more anime-blue.' },
  fresnelColor: { group: 'lighting', label: 'Fresnel Color', type: 'color', description: 'Additive rim tint at grazing angles.' },
  skyZenithColor: { group: 'lighting', label: 'Sky Zenith', type: 'color', description: 'Authored fallback procedural sky-reflection color overhead when no live scene sky is connected.' },
  skyHorizonColor: { group: 'lighting', label: 'Sky Horizon', type: 'color', description: 'Authored fallback procedural sky-reflection color at the horizon when no live scene sky is connected.' },
  reflectionStrength: { group: 'lighting', label: 'Reflection', min: 0, max: 1.5, step: 0.01, description: 'Planar/sky reflection mix, weighted by fresnel.' },
  reflectionDistortion: { group: 'lighting', label: 'Reflection Ripple', min: 0, max: 0.3, step: 0.005, description: 'How much waves shatter the reflection.' },
  reflectionSoftness: { group: 'lighting', label: 'Reflection Softness', min: 0, max: 1, step: 0.01, description: 'Blends sharp planar reflections toward the soft procedural sky (milky anime look).' },

  rippleStrength: { group: 'ripples', label: 'Ripple Strength', min: 0, max: 6, step: 0.05, description: 'Global multiplier for splash and wake impulses.' },
  rippleDamping: { group: 'ripples', label: 'Ripple Damping', min: 0.9, max: 0.999, step: 0.001, description: 'Energy retained per frame; higher rings travel farther.' },
  ripplePropagation: { group: 'ripples', label: 'Ripple Speed', min: 1, max: 40, step: 0.5, description: 'Travel speed of interactive rings across the surface.' },
  rippleHeightScale: { group: 'ripples', label: 'Ripple Height', min: 0, max: 4, step: 0.05, description: 'Vertical displacement of the interactive ripples.' },
  rippleFoamDecay: { group: 'ripples', label: 'Wake Foam Decay', min: 0.5, max: 0.999, step: 0.001, description: 'How long wake foam lingers.' },
  rippleFoamGain: { group: 'ripples', label: 'Wake Foam Gain', min: 0, max: 12, step: 0.1, description: 'How quickly motion generates wake foam.' },

  splashStrength: { group: 'splashes', label: 'Splash Strength', min: 0, max: 3, step: 0.05, description: 'Global multiplier for splash particle counts and energy.' },
  splashScale: { group: 'splashes', label: 'Splash Scale', min: 0.1, max: 4, step: 0.05, description: 'Physical size multiplier for droplets, spray, and rings.' },
  splashDropletCount: { group: 'splashes', label: 'Droplet Count', min: 0, max: 120, step: 1, description: 'Droplets emitted by a strength-1 splash.' },
  splashRingCount: { group: 'splashes', label: 'Ring Count', min: 0, max: 4, step: 1, description: 'Expanding foam rings emitted per splash.' },
  splashColor: { group: 'splashes', label: 'Splash Color', type: 'color', description: 'Bright tone of droplets and spray.' },
  splashShadeColor: { group: 'splashes', label: 'Splash Shade', type: 'color', description: 'Shadow tone of the two-tone splash shading.' },

  quality: {
    group: 'quality',
    label: 'Quality Tier',
    type: 'select',
    options: WATER_QUALITY_LEVELS,
    optionLabels: Object.freeze({ high: 'High', low: 'Low', medium: 'Medium' }),
    description: 'Named quality tier: low drops caustics and sparkles, high adds chromatic caustics and extra detail octaves.',
  },
};

function inferFieldType(key, value) {
  const metadata = FIELD_METADATA[key];
  if (metadata?.type) return metadata.type;
  if (Array.isArray(value)) return value.length === 2 ? 'vector2' : 'color';
  return 'number';
}

export const WATER_SETTING_FIELD_SCHEMA = Object.freeze(
  Object.fromEntries(
    Object.entries(FIELD_METADATA).map(([key, metadata]) => {
      const defaultValue = DEFAULT_WATER_SETTINGS[key];
      const type = inferFieldType(key, defaultValue);
      return [key, Object.freeze({
        key,
        id: `${metadata.group}.${key}`,
        group: metadata.group,
        label: metadata.label,
        type,
        min: metadata.min,
        max: metadata.max,
        step: metadata.step,
        range: type === 'number'
          ? Object.freeze({ min: metadata.min ?? 0, max: metadata.max ?? 1, step: metadata.step ?? 0.01 })
          : null,
        options: metadata.options ? Object.freeze([...metadata.options]) : null,
        optionLabels: metadata.optionLabels ?? null,
        description: metadata.description,
        defaultValue,
        serializable: true,
      })];
    }),
  ),
);

/**
 * WATER_SETTING_FIELD_SCHEMA regrouped by setting-group id so it plugs
 * straight into the schema-driven debug panel, which looks fields up per
 * group (mirrors the nested shape of TOON_SETTING_FIELD_SCHEMA):
 *
 *   createSettingsPanel({
 *     groups: WATER_SETTING_GROUPS,
 *     fieldSchema: WATER_SETTING_FIELD_SCHEMA_BY_GROUP,
 *     ...
 *   });
 *
 * Water settings are flat (no per-group nesting), so hosts read values with
 * `settings[field.key]` rather than `settings[field.group][field.key]`.
 */
export const WATER_SETTING_FIELD_SCHEMA_BY_GROUP = Object.freeze(
  Object.fromEntries(
    WATER_SETTING_GROUPS.map((group) => [
      group.id,
      Object.freeze(
        Object.fromEntries(
          Object.entries(WATER_SETTING_FIELD_SCHEMA).filter(([, field]) => field.group === group.id),
        ),
      ),
    ]),
  ),
);

// --- Preset documents & registration -----------------------------------------
//
// Mirrors the toon preset document conventions: a preset document is a plain
// JSON object { type, version, id, label, description, settings } that can be
// saved to disk, shared, and re-registered on another machine.

/** Document `type` discriminator for serialized water presets. */
export const WATER_PRESET_DOCUMENT_TYPE = 'toonlab/water-preset';

/** Current water preset document schema version. v2 adds per-scenario variants. */
export const WATER_PRESET_SCHEMA_VERSION = 2;

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function booleanFromValue(value, fallback) {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'on', 'yes'].includes(normalized)) return true;
    if (['0', 'false', 'off', 'no'].includes(normalized)) return false;
  }
  if (Number.isFinite(value)) return value !== 0;
  return fallback;
}

function coerceWaterFieldValue(value, field) {
  const fallback = field.defaultValue;
  switch (field.type) {
    case 'boolean':
      return booleanFromValue(value, fallback);
    case 'number':
      return finiteNumber(value, fallback);
    case 'select': {
      const normalized = String(value ?? '').trim();
      return field.options?.includes(normalized) ? normalized : fallback;
    }
    case 'color':
      return colorArray(value, fallback);
    case 'vector2':
      return vector2Array(value, fallback);
    case 'vector3':
      return vector3Array(value, fallback);
    default:
      return String(value ?? fallback);
  }
}

// Picks the known (schema-covered) setting keys out of a flat definition
// object, resolving legacy key aliases first.
function collectTopLevelWaterSettings(source) {
  const normalized = normalizeLegacyKeys(cleanObject(source));
  return Object.fromEntries(
    Object.entries(normalized).filter(([key]) => WATER_SETTING_FIELD_SCHEMA[key]),
  );
}

function collectUnknownWaterSettingKeys(settings = {}) {
  const warnings = [];
  for (const key of Object.keys(cleanObject(settings))) {
    if (WATER_SETTING_FIELD_SCHEMA[key] || LEGACY_KEY_ALIASES[key] || key === 'waveStrength') continue;
    // The preset/mode selection is carried by the document id, not settings.
    if (key === 'preset' || key === 'mode') continue;
    warnings.push(`Unknown water setting "${key}" was ignored.`);
  }
  return warnings;
}

/**
 * Coerces a flat water settings object down to the serializable schema:
 * numbers stay finite numbers, booleans/selects are validated, and colors and
 * direction vectors are normalized to plain [r, g, b] / [x, y] / [x, y, z]
 * arrays (THREE.Color / Vector inputs included). Unknown and runtime-only
 * keys are dropped; legacy key aliases (e.g. `normalStrength`) are resolved
 * to their canonical names first.
 *
 * Note: presets cannot change the Gerstner wave count —
 * WATER_GERSTNER_WAVE_COUNT is baked into the shader and the CPU mirror.
 *
 * @param {object} [settings] Flat settings overrides keyed like DEFAULT_WATER_SETTINGS.
 * @returns {object} Sanitized JSON-safe settings object.
 */
export function sanitizeWaterPresetSettings(settings = {}) {
  const source = normalizeLegacyKeys(cleanObject(settings));
  const sanitized = {};
  for (const [key, value] of Object.entries(source)) {
    const field = WATER_SETTING_FIELD_SCHEMA[key];
    if (!field?.serializable || value === undefined) continue;
    sanitized[key] = coerceWaterFieldValue(value, field);
  }
  return sanitized;
}

function migrateWaterPresetDocument(input) {
  const source = cleanObject(input);
  const version = Number.isFinite(source.version) ? Math.round(source.version) : 0;
  const settings = cleanObject(source.settings);
  if (version > WATER_PRESET_SCHEMA_VERSION) return { ...source, version };
  return {
    description: source.description ?? '',
    id: source.id ?? source.name ?? source.preset ?? '',
    label: source.label ?? source.title ?? source.name ?? source.id ?? '',
    // v1 documents carry a single flat look and no scenarios; they stay
    // valid as a style whose scenario renditions inherit the canonical body
    // recipes at resolve time.
    ...(source.scenarios === undefined ? {} : { scenarios: source.scenarios }),
    settings: Object.keys(settings).length > 0 ? settings : collectTopLevelWaterSettings(source),
    type: source.type ?? WATER_PRESET_DOCUMENT_TYPE,
    version: WATER_PRESET_SCHEMA_VERSION,
  };
}

// Sanitizes a `scenarios` map: unknown scenario ids are dropped with a
// warning; each variant stays a PARTIAL — only the keys the style overrides
// for that body, each coerced to the serializable schema.
function sanitizeWaterPresetScenarios(input) {
  const warnings = [];
  if (input === undefined) return { scenarios: undefined, warnings };
  const scenarios = {};
  for (const [scenarioId, partial] of Object.entries(cleanObject(input))) {
    if (!WATER_SCENARIO_IDS.has(scenarioId)) {
      warnings.push(`Unknown water scenario "${scenarioId}" was ignored.`);
      continue;
    }
    warnings.push(...collectUnknownWaterSettingKeys(cleanObject(partial))
      .map((warning) => `Scenario "${scenarioId}": ${warning}`));
    scenarios[scenarioId] = sanitizeWaterPresetSettings(cleanObject(partial));
  }
  return {
    scenarios: Object.keys(scenarios).length > 0 ? scenarios : undefined,
    warnings,
  };
}

/**
 * Validates (and migrates) a water preset document. Never throws.
 *
 * @param {object} input Parsed preset document (or a loose legacy shape).
 * @returns {{ok: boolean, errors: string[], warnings: string[], value: object|null}}
 *   `value` is the normalized document (sanitized settings, canonical type
 *   and version) when `ok` is true, otherwise null.
 */
export function validateWaterPresetDocument(input) {
  const result = validateSettingsPresetDocument(input, {
    collectWarnings: collectUnknownWaterSettingKeys,
    documentType: WATER_PRESET_DOCUMENT_TYPE,
    migrateDocument: migrateWaterPresetDocument,
    normalizeId: normalizeWaterPresetId,
    sanitizeSettings: sanitizeWaterPresetSettings,
    schemaVersion: WATER_PRESET_SCHEMA_VERSION,
  });
  if (!result.ok) return result;
  // The shared settings-document helper only knows `settings`; scenario
  // variants ride alongside it and are sanitized here.
  const migrated = migrateWaterPresetDocument(cleanObject(input));
  const { scenarios, warnings } = sanitizeWaterPresetScenarios(migrated.scenarios);
  result.warnings.push(...warnings);
  if (scenarios !== undefined) result.value = { ...result.value, scenarios };
  return result;
}

/**
 * Parses a JSON string (or already-parsed object) into a validated water
 * preset document. Never throws; JSON errors are reported in `errors`.
 *
 * @param {string|object} input Preset JSON text or object.
 * @returns {{ok: boolean, errors: string[], warnings: string[], value: object|null}}
 */
export function parseWaterPresetDocument(input) {
  return parsePresetDocument(input, validateWaterPresetDocument);
}

/**
 * Builds a normalized water preset document from a preset id and definition.
 * The definition may carry a nested `settings` object or flat setting keys
 * (e.g. `{ waveIntensity: 0.5 }`); either way the result is validated and
 * sanitized. Throws when the document is invalid (e.g. missing id).
 *
 * @param {string} id Preset id (normalized to snake_case lowercase).
 * @param {object} [definition] `{ label?, description?, settings? }` or flat settings.
 * @returns {object} `{ type, version, id, label, description, settings }`.
 */
export function createWaterPresetDocument(id, definition = {}) {
  const source = cleanObject(definition);
  const document = {
    description: source.description ?? '',
    id: id ?? source.id ?? source.name ?? source.preset,
    label: source.label ?? source.title ?? source.name ?? id,
    ...(source.scenarios === undefined ? {} : { scenarios: source.scenarios }),
    settings: source.settings ?? collectTopLevelWaterSettings(source),
    type: WATER_PRESET_DOCUMENT_TYPE,
    version: WATER_PRESET_SCHEMA_VERSION,
  };
  const result = validateWaterPresetDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

/**
 * Serializes a water preset to a JSON string. Accepts either
 * `serializeWaterPreset(id, definition)` or a single document-like object.
 *
 * @param {string|object} idOrDocument Preset id, or a document-like object.
 * @param {object} [definition] Preset definition when the first argument is an id.
 * @param {{pretty?: boolean}} [options] `pretty` (default true) pretty-prints the JSON.
 * @returns {string} Preset document JSON.
 */
export function serializeWaterPreset(idOrDocument, definition = {}, { pretty = true } = {}) {
  return serializePresetDocument(idOrDocument, definition, {
    argumentCount: arguments.length,
    createDocument: createWaterPresetDocument,
    pretty,
  });
}

/**
 * Registers a named water preset so it resolves in createWaterSettings /
 * createWaterMaterial exactly like the built-ins:
 *
 *   registerWaterPreset('bioluminescent_bay', {
 *     label: 'Bioluminescent Bay',
 *     waveIntensity: 0.1,
 *     deepColor: [0.01, 0.09, 0.2],
 *   });
 *   const settings = createWaterSettings({ preset: 'bioluminescent_bay' });
 *
 * Settings are sanitized to serializable values (see
 * sanitizeWaterPresetSettings). Presets cannot change the Gerstner wave
 * count — WATER_GERSTNER_WAVE_COUNT is baked into the shader.
 *
 * @param {string} name Preset id (normalized to snake_case lowercase).
 * @param {object} [preset] `{ label?, description?, settings? }` or flat settings.
 * @param {{overwrite?: boolean}} [options] Set `overwrite: true` to replace an
 *   existing preset (including built-ins); otherwise re-registering throws.
 * @returns {{id: string, label: string, description: string}} Registered preset metadata.
 */
export function registerWaterPreset(name, preset = {}, { overwrite = false } = {}) {
  const document = createWaterPresetDocument(name, preset);
  const presetId = document.id;
  if (!overwrite && waterPresetRegistry.has(presetId)) {
    throw new Error(`Water preset "${presetId}" already exists.`);
  }

  waterPresetRegistry.set(presetId, {
    description: document.description,
    label: document.label,
    scenarios: Object.freeze(Object.fromEntries(
      Object.entries(document.scenarios ?? {})
        .map(([scenarioId, partial]) => [scenarioId, Object.freeze({ ...partial })]),
    )),
    settings: Object.freeze({ ...document.settings }),
  });
  return { description: document.description, id: presetId, label: document.label };
}

/** Registers an IP-wide water rendition that composes over every preset. */
export function registerWaterStyle(name, definition = {}, { overwrite = false } = {}) {
  const id = normalizeWaterPresetId(name);
  if (!id) throw new Error('Water style name is required.');
  if (overwrite && isProtectedSystemStyleId(id) && waterStyleRegistry.has(id)) {
    throw new Error(`System style "${id}" is read-only.`);
  }
  if (!overwrite && waterStyleRegistry.has(id)) {
    throw new Error(`Water style "${id}" already exists.`);
  }
  const source = cleanObject(definition);
  const variants = cleanObject(source.presets ?? source.scenarios);
  waterStyleRegistry.set(id, Object.freeze({
    description: String(source.description ?? ''),
    label: String(source.label ?? id),
    presets: Object.freeze(Object.fromEntries(
      Object.entries(variants)
        .filter(([presetId]) => waterPresetRegistry.has(presetId))
        .map(([presetId, partial]) => [presetId, Object.freeze({ ...sanitizeWaterPresetSettings(partial) })]),
    )),
    settings: Object.freeze({ ...sanitizeWaterPresetSettings(source.settings ?? {}) }),
  }));
  return { description: String(source.description ?? ''), id, label: String(source.label ?? id) };
}

/**
 * Registers a preset from serialized JSON (string or parsed document), as
 * produced by serializeWaterPreset. Overwrites by default so re-importing a
 * saved preset always takes effect. Throws when the document is invalid.
 *
 * @param {string|object} input Preset document JSON or object.
 * @param {{overwrite?: boolean}} [options]
 * @returns {{id: string, label: string, description: string}} Registered preset metadata.
 */
export function registerSerializedWaterPreset(input, options = {}) {
  const result = parseWaterPresetDocument(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return registerWaterPreset(result.value.id, result.value, { overwrite: options.overwrite ?? true });
}

/**
 * Lists every registered water preset (built-ins first, then user-registered)
 * as `{ id, label, description }` entries — ready for a preset picker.
 *
 * @returns {Array<{id: string, label: string, description: string}>}
 */
export function getWaterPresetOptions() {
  return Array.from(waterPresetRegistry.entries()).map(([id, preset]) => ({
    description: preset.description ?? '',
    id,
    label: preset.label ?? id,
  }));
}

/**
 * Lists water STYLES only — IP identities that resolve over every water
 * preset — as `{ id, label, description, presets }`, where `presets` reports
 * whether each preset has a dedicated variant or inherits the style base.
 */
export function getWaterStyleOptions() {
  return Array.from(waterStyleRegistry.entries())
    .map(([id, style]) => ({
      description: style.description ?? '',
      id,
      label: style.label ?? id,
      presets: Object.fromEntries(WATER_PRESET_NAMES.map((presetId) => [
        presetId,
        style.presets?.[presetId] ? 'authored' : 'inherited',
      ])),
    }));
}

// Built-in STYLES. The preset remains the water recipe; style is the
// orthogonal IP rendition layered on top.

registerWaterStyle('default', {
  label: 'Default',
  description: 'Water presets exactly as authored, with no IP-wide rendition layer.',
});

// Studio-managed signature style, curated by Call Me Sensei and updated
// over releases: the anime body-color tone in every scenario, with authored
// per-body refinements. Community styles register alongside it via
// registerWaterStyle.
registerWaterStyle('call_me_sensei', {
  label: 'Call Me Sensei',
  description: 'Studio-managed signature water style applied across every water preset.',
  // Shared rendition only; motion identity stays owned by each preset.
  settings: {
    colorTone: 'anime',
    // Signature outdoor water must visibly ground characters and props even
    // under a bright sky reflection; the shared shadow pass supplies the mask.
    sceneShadowStrength: 1,
  },
  // Refinements stay off the tone-owned keys (palette, caustics, reflection,
  // detail normals — see WATER_COLOR_TONES.anime, which force-applies those).
  presets: {
    lake: { flowSpeed: 0.4, sparkleStrength: 0.55, waveIntensity: 0.32 },
    river: { flowSpeed: 1.15, foamLineSpacing: 0.38, sparkleStrength: 0.45, waveIntensity: 0.3 },
    coast: { flowSpeed: 0.45, swashFoamAmount: 1.4, causticsStrength: 1.25, sparkleStrength: 0, waveIntensity: 0.6 },
    ocean: { flowSpeed: 0.5, sparkleStrength: 0.7, waveIntensity: 0.7, whitecapAmount: 0.45 },
  },
});
