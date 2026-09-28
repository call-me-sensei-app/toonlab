import { cloneSerializable, deepMerge, stableStringify } from '../core/generation.js';
import { parsePresetDocument } from '../core/presetDocuments.js';

export const SOUNDSCAPE_PRESET_TYPE = 'toonlab/soundscape-preset';
export const SOUNDSCAPE_PRESET_VERSION = 1;

export const SOUNDSCAPE_QUALITY_BUDGETS = Object.freeze({
  mobile: Object.freeze({ maxLayers: 4, maxNodes: 32, maxVoices: 10 }),
  balanced: Object.freeze({ maxLayers: 8, maxNodes: 64, maxVoices: 24 }),
  cinematic: Object.freeze({ maxLayers: 16, maxNodes: 128, maxVoices: 48 }),
});

const DEFAULT_SETTINGS = Object.freeze({
  adaptive: Object.freeze({
    mappings: Object.freeze({
      intensity: Object.freeze([
        Object.freeze({ from: 0.62, mode: 'multiply', path: 'layers.air.gain', to: 1.18 }),
        Object.freeze({ from: 0.35, mode: 'multiply', path: 'layers.wildlife.gain', to: 1.3 }),
      ]),
      tension: Object.freeze([
        Object.freeze({ from: 0.72, mode: 'multiply', path: 'layers.drone.gain', to: 1.22 }),
      ]),
    }),
    smoothing: 0.35,
    values: Object.freeze({ intensity: 0.45, tension: 0.15, weather: 0.25 }),
  }),
  // The source preset carries the largest supported envelope. The resolver
  // applies mobile/balanced/cinematic caps, so raising quality can actually
  // make additional graph budget available without mutating the recipe.
  budget: Object.freeze({ maxLayers: 16, maxNodes: 128, maxVoices: 48 }),
  buses: Object.freeze({
    ambience: Object.freeze({ gain: 0.78, mute: false }),
    detail: Object.freeze({ gain: 0.62, mute: false }),
    music: Object.freeze({ gain: 0.4, mute: false }),
  }),
  layers: Object.freeze({
    air: Object.freeze({
      bus: 'ambience',
      enabled: true,
      gain: 0.26,
      pan: -0.08,
      params: Object.freeze({ color: 'brown', highpass: 72, lowpass: 2800, movement: 0.18 }),
      type: 'noise',
      voiceLimit: 1,
    }),
    drone: Object.freeze({
      bus: 'music',
      enabled: true,
      gain: 0.08,
      pan: 0.04,
      params: Object.freeze({ detune: 4, frequency: 82.41, movement: 0.05, waveform: 'sine' }),
      type: 'oscillator',
      voiceLimit: 1,
    }),
    rustle: Object.freeze({
      bus: 'detail',
      enabled: true,
      gain: 0.11,
      pan: 0.2,
      params: Object.freeze({ color: 'pink', highpass: 900, lowpass: 6200, movement: 0.5 }),
      type: 'noise',
      voiceLimit: 1,
    }),
    wildlife: Object.freeze({
      bus: 'detail',
      enabled: true,
      gain: 0.12,
      pan: -0.16,
      params: Object.freeze({ density: 0.22, duration: 0.18, frequency: 1550, pitchSpread: 0.38, waveform: 'sine' }),
      type: 'procedural-events',
      voiceLimit: 4,
    }),
  }),
  master: Object.freeze({ gain: 0.72, limiter: true, transitionSeconds: 1.8 }),
  snapshots: Object.freeze({
    calm: Object.freeze({
      buses: Object.freeze({ detail: Object.freeze({ gain: 0.42 }), music: Object.freeze({ gain: 0.28 }) }),
      layers: Object.freeze({ drone: Object.freeze({ gain: 0.055 }), wildlife: Object.freeze({ gain: 0.08 }) }),
    }),
    dramatic: Object.freeze({
      buses: Object.freeze({ detail: Object.freeze({ gain: 0.76 }), music: Object.freeze({ gain: 0.62 }) }),
      layers: Object.freeze({ drone: Object.freeze({ gain: 0.16 }), wildlife: Object.freeze({ gain: 0.18 }) }),
    }),
  }),
  transport: Object.freeze({ bpm: 88 }),
});

const BASE_PRESETS = new Map();

function clamp(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(Math.max(number, min), max) : fallback;
}

function integer(value, min, max, fallback) {
  return Math.round(clamp(value, min, max, fallback));
}

function plain(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function normalizeId(value) {
  return String(value ?? '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');
}

function sanitizeBus(input = {}) {
  const source = plain(input);
  return {
    ...cloneSerializable(source),
    gain: clamp(source.gain, 0, 2, 1),
    mute: Boolean(source.mute),
  };
}

function sanitizeLayer(input = {}, id = 'layer') {
  const source = plain(input);
  return {
    ...cloneSerializable(source),
    bus: String(source.bus || 'ambience'),
    enabled: source.enabled !== false,
    gain: clamp(source.gain, 0, 2, 0.25),
    id,
    pan: clamp(source.pan, -1, 1, 0),
    params: cloneSerializable(plain(source.params)),
    playbackRate: clamp(source.playbackRate, 0.05, 8, 1),
    type: String(source.type || 'noise'),
    voiceLimit: integer(source.voiceLimit, 1, 128, 1),
  };
}

function sanitizeAdaptive(input = {}) {
  const source = plain(input);
  const values = Object.fromEntries(Object.entries(plain(source.values)).map(([id, value]) => (
    [id, clamp(value, 0, 1, 0)]
  )));
  const mappings = {};
  for (const [parameter, entries] of Object.entries(plain(source.mappings))) {
    if (!Array.isArray(entries)) continue;
    mappings[parameter] = entries
      .filter((entry) => plain(entry).path)
      .map((entry) => ({
        curve: clamp(entry.curve, 0.05, 8, 1),
        from: clamp(entry.from, -16, 16, 0),
        mode: ['add', 'multiply', 'replace'].includes(entry.mode) ? entry.mode : 'replace',
        path: String(entry.path),
        to: clamp(entry.to, -16, 16, 1),
      }));
  }
  return {
    ...cloneSerializable(source),
    mappings,
    smoothing: clamp(source.smoothing, 0, 10, 0.35),
    values,
  };
}

export function applySoundscapeQualityBudget(settings, quality = 'balanced', override = {}) {
  const tier = SOUNDSCAPE_QUALITY_BUDGETS[quality] ?? SOUNDSCAPE_QUALITY_BUDGETS.balanced;
  const requested = plain(settings?.budget);
  const explicit = plain(override);
  const maxLayers = Math.min(integer(requested.maxLayers, 1, 1024, tier.maxLayers), tier.maxLayers, integer(explicit.maxLayers, 1, 1024, tier.maxLayers));
  const maxNodes = Math.min(integer(requested.maxNodes, 2, 8192, tier.maxNodes), tier.maxNodes, integer(explicit.maxNodes, 2, 8192, tier.maxNodes));
  const maxVoices = Math.min(integer(requested.maxVoices, 1, 2048, tier.maxVoices), tier.maxVoices, integer(explicit.maxVoices, 1, 2048, tier.maxVoices));
  const layers = {};
  let accepted = 0;
  for (const [id, layer] of Object.entries(plain(settings?.layers))) {
    if (accepted >= maxLayers) break;
    layers[id] = { ...layer, voiceLimit: Math.min(layer.voiceLimit, maxVoices) };
    accepted += 1;
  }
  return {
    ...settings,
    budget: { maxLayers, maxNodes, maxVoices },
    layers,
    quality: SOUNDSCAPE_QUALITY_BUDGETS[quality] ? quality : 'balanced',
  };
}

export function sanitizeSoundscapeSettings(input = {}, { budget, quality } = {}) {
  const source = input?.settings ? plain(input.settings) : plain(input);
  const buses = Object.fromEntries(Object.entries(plain(source.buses)).map(([id, value]) => [id, sanitizeBus(value)]));
  const layers = Object.fromEntries(Object.entries(plain(source.layers)).map(([id, value]) => [id, sanitizeLayer(value, id)]));
  const settings = {
    ...cloneSerializable(source),
    adaptive: sanitizeAdaptive(source.adaptive),
    budget: {
      maxLayers: integer(source.budget?.maxLayers, 1, 1024, 8),
      maxNodes: integer(source.budget?.maxNodes, 2, 8192, 64),
      maxVoices: integer(source.budget?.maxVoices, 1, 2048, 24),
    },
    buses,
    layers,
    master: {
      ...cloneSerializable(plain(source.master)),
      gain: clamp(source.master?.gain, 0, 2, 0.72),
      limiter: source.master?.limiter !== false,
      transitionSeconds: clamp(source.master?.transitionSeconds, 0, 60, 1.8),
    },
    snapshots: cloneSerializable(plain(source.snapshots)),
    transport: {
      ...cloneSerializable(plain(source.transport)),
      bpm: clamp(source.transport?.bpm, 20, 400, 88),
    },
  };
  return quality || budget ? applySoundscapeQualityBudget(settings, quality ?? 'balanced', budget) : settings;
}

export function registerSoundscapeBasePreset(id, settings, { overwrite = false } = {}) {
  const key = normalizeId(id);
  if (!key) throw new Error('Soundscape base preset id is required.');
  if (!overwrite && BASE_PRESETS.has(key)) throw new Error(`Soundscape base preset "${key}" already exists.`);
  BASE_PRESETS.set(key, sanitizeSoundscapeSettings(deepMerge(DEFAULT_SETTINGS, settings)));
  return key;
}

export function getSoundscapeBasePresetOptions() {
  return [...BASE_PRESETS.keys()];
}

export function createSoundscapeSettings(input = {}, options = {}) {
  const source = typeof input === 'string' ? { preset: input } : plain(input);
  const presetId = source.preset ?? source.basePreset ?? 'living-landscape';
  const base = BASE_PRESETS.get(presetId) ?? BASE_PRESETS.get('living-landscape') ?? DEFAULT_SETTINGS;
  const override = source.settings ? source.settings : source;
  const merged = deepMerge(base, override);
  delete merged.preset;
  delete merged.basePreset;
  return sanitizeSoundscapeSettings(merged, options);
}

export function validateSoundscapePresetDocument(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Soundscape preset must be a JSON object.'], ok: false, value: null, warnings: [] };
  }
  if (input.type !== SOUNDSCAPE_PRESET_TYPE) errors.push(`Soundscape preset type must be "${SOUNDSCAPE_PRESET_TYPE}".`);
  const version = Number(input.version ?? 1);
  if (!Number.isInteger(version) || version < 1 || version > SOUNDSCAPE_PRESET_VERSION) errors.push(`Unsupported soundscape preset version ${input.version}.`);
  const id = normalizeId(input.id);
  if (!id) errors.push('Soundscape preset id is required.');
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length ? null : {
      description: String(input.description ?? ''),
      id,
      label: String(input.label || id),
      settings: sanitizeSoundscapeSettings(input.settings),
      type: SOUNDSCAPE_PRESET_TYPE,
      version: SOUNDSCAPE_PRESET_VERSION,
    },
    warnings: [],
  };
}

export function createSoundscapePresetDocument(id, definition = {}) {
  const result = validateSoundscapePresetDocument({
    description: definition.description ?? '',
    id,
    label: definition.label ?? id,
    settings: definition.settings ?? definition,
    type: SOUNDSCAPE_PRESET_TYPE,
    version: SOUNDSCAPE_PRESET_VERSION,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function parseSoundscapePresetDocument(input) {
  return parsePresetDocument(input, validateSoundscapePresetDocument, { invalidJsonLabel: 'soundscape preset' });
}

export function serializeSoundscapePresetDocument(idOrDocument, definition = {}, { pretty = true } = {}) {
  const document = idOrDocument && typeof idOrDocument === 'object'
    ? createSoundscapePresetDocument(idOrDocument.id, idOrDocument)
    : createSoundscapePresetDocument(idOrDocument, definition);
  return stableStringify(document, pretty ? 2 : 0);
}

registerSoundscapeBasePreset('living-landscape', DEFAULT_SETTINGS);
registerSoundscapeBasePreset('minimal-focus', deepMerge(DEFAULT_SETTINGS, {
  adaptive: { values: { intensity: 0.25, tension: 0.05, weather: 0 } },
  buses: { detail: { gain: 0.24 }, music: { gain: 0.2 } },
  layers: {
    air: { gain: 0.16 },
    drone: { gain: 0.035 },
    rustle: { enabled: false },
    wildlife: { gain: 0.035, params: { density: 0.08 } },
  },
  master: { gain: 0.58 },
}));
