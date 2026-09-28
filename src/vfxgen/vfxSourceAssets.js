// Portable visual-source assets for VFX layers.
//
// An Effect references these documents by id. The binary file itself remains
// a sibling project asset so effect JSON stays small, diffable, and portable.
// Procedural sources are completely reproducible from this document.

import { cloneSerializable, stableStringify } from '../core/generation.js';
import { parsePresetDocument } from '../core/presetDocuments.js';

export const VFX_SOURCE_DOCUMENT_TYPE = 'toonlab.vfx.source';
export const VFX_SOURCE_SCHEMA_VERSION = 1;
export const VFX_SOURCE_MAX_FILE_BYTES = 16 * 1024 * 1024;

export const VFX_SOURCE_CHANNELS = Object.freeze([
  'color',
  'distortion',
  'mask',
  'normal',
]);

export const VFX_SOURCE_GENERATORS = Object.freeze([
  Object.freeze({
    id: 'flow-bands',
    label: 'Flow bands',
    description: 'Layered directional bands for shells, water, smoke, and energy flow.',
    defaults: Object.freeze({ contrast: 0.72, density: 5, drift: 0.55, warp: 0.42 }),
    parameters: Object.freeze([
      Object.freeze({ id: 'density', label: 'Band density', min: 1, max: 14, step: 0.1 }),
      Object.freeze({ id: 'warp', label: 'Warp', min: 0, max: 1.5, step: 0.01 }),
      Object.freeze({ id: 'contrast', label: 'Contrast', min: 0, max: 1, step: 0.01 }),
      Object.freeze({ id: 'drift', label: 'Drift', min: 0, max: 2, step: 0.01 }),
    ]),
  }),
  Object.freeze({
    id: 'lightning-veins',
    label: 'Lightning veins',
    description: 'Branching animated filaments for electricity and unstable energy.',
    defaults: Object.freeze({ branches: 7, contrast: 0.84, drift: 0.7, width: 0.12 }),
    parameters: Object.freeze([
      Object.freeze({ id: 'branches', label: 'Branches', min: 2, max: 24, step: 1 }),
      Object.freeze({ id: 'width', label: 'Line width', min: 0.02, max: 0.6, step: 0.01 }),
      Object.freeze({ id: 'contrast', label: 'Contrast', min: 0, max: 1, step: 0.01 }),
      Object.freeze({ id: 'drift', label: 'Drift', min: 0, max: 2, step: 0.01 }),
    ]),
  }),
  Object.freeze({
    id: 'radial-shards',
    label: 'Radial shards',
    description: 'Outward shards suitable for impact, burst, and compression masks.',
    defaults: Object.freeze({ contrast: 0.78, density: 12, drift: 0.32, width: 0.2 }),
    parameters: Object.freeze([
      Object.freeze({ id: 'density', label: 'Shard count', min: 4, max: 32, step: 1 }),
      Object.freeze({ id: 'width', label: 'Shard width', min: 0.03, max: 0.8, step: 0.01 }),
      Object.freeze({ id: 'contrast', label: 'Contrast', min: 0, max: 1, step: 0.01 }),
      Object.freeze({ id: 'drift', label: 'Rotation speed', min: 0, max: 2, step: 0.01 }),
    ]),
  }),
]);

const CHANNELS = new Set(VFX_SOURCE_CHANNELS);
const GENERATORS = new Map(VFX_SOURCE_GENERATORS.map((entry) => [entry.id, entry]));
const cleanId = (value) => String(value ?? '').trim().replace(/[^a-zA-Z0-9._/-]+/g, '_');
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const plain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function normalizePlayback(value) {
  const source = plain(value) ? value : {};
  return {
    fps: clamp(finite(source.fps, 24), 1, 120),
    loop: source.loop === undefined ? true : Boolean(source.loop),
    speed: clamp(finite(source.speed, 1), 0, 8),
  };
}

function normalizeParameters(value) {
  const source = plain(value) ? value : {};
  return Object.fromEntries(Object.entries(source)
    .filter(([, entry]) => Number.isFinite(Number(entry)))
    .map(([key, entry]) => [cleanId(key), clamp(Number(entry), 0, 64)])
    .filter(([key]) => Boolean(key)));
}

export function validateVfxSourceDocument(input) {
  const errors = [];
  if (!plain(input)) {
    return { errors: ['VFX source document must be a JSON object.'], ok: false, value: null };
  }
  if (input.type !== VFX_SOURCE_DOCUMENT_TYPE) {
    errors.push(`VFX source document type must be "${VFX_SOURCE_DOCUMENT_TYPE}".`);
  }
  const version = Number(input.version ?? 1);
  if (!Number.isInteger(version) || version < 1) {
    errors.push('VFX source document version must be a positive integer.');
  } else if (version > VFX_SOURCE_SCHEMA_VERSION) {
    errors.push(`VFX source document version ${version} is newer than supported version ${VFX_SOURCE_SCHEMA_VERSION}.`);
  }

  const id = cleanId(input.id);
  if (!id) errors.push('VFX source document id is required.');
  const channel = cleanId(input.channel || 'mask');
  if (!CHANNELS.has(channel)) errors.push(`VFX source channel "${channel}" is not supported.`);
  const mode = String(input.mode ?? 'procedural');
  if (!['file', 'procedural'].includes(mode)) errors.push(`VFX source mode "${mode}" is not supported.`);

  const value = {
    channel,
    id,
    label: String(input.label || id),
    mode,
    playback: normalizePlayback(input.playback),
    type: VFX_SOURCE_DOCUMENT_TYPE,
    version: VFX_SOURCE_SCHEMA_VERSION,
  };

  if (mode === 'procedural') {
    const source = plain(input.procedural) ? input.procedural : {};
    const generator = cleanId(source.generator);
    if (!GENERATORS.has(generator)) errors.push(`Unknown VFX source generator "${generator}".`);
    value.procedural = {
      generator,
      parameters: normalizeParameters(source.parameters),
      seed: Math.max(1, Math.round(finite(source.seed, 1))),
    };
  } else {
    const source = plain(input.file) ? input.file : {};
    const byteLength = Math.max(0, Math.round(finite(source.byteLength, 0)));
    const mimeType = String(source.mimeType ?? '');
    const accepted = mimeType.startsWith('image/') || mimeType.startsWith('video/');
    if (!accepted) errors.push('Uploaded VFX sources must be image or video files.');
    if (byteLength <= 0) errors.push('Uploaded VFX source byteLength must be positive.');
    if (byteLength > VFX_SOURCE_MAX_FILE_BYTES) {
      errors.push(`Uploaded VFX source exceeds the ${VFX_SOURCE_MAX_FILE_BYTES} byte limit.`);
    }
    const sha256 = String(source.sha256 ?? '').toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(sha256)) errors.push('Uploaded VFX source requires a SHA-256 digest.');
    value.file = {
      byteLength,
      duration: Math.max(0, finite(source.duration, 0)),
      height: Math.max(0, Math.round(finite(source.height, 0))),
      mimeType,
      name: String(source.name ?? 'source'),
      sha256,
      uri: String(source.uri ?? ''),
      width: Math.max(0, Math.round(finite(source.width, 0))),
    };
    if (!value.file.uri.startsWith('project://')) {
      errors.push('Uploaded VFX source URI must use the project:// scheme.');
    }
  }

  return {
    errors: [...new Set(errors)],
    ok: errors.length === 0,
    value: errors.length === 0 ? value : null,
  };
}

export function createProceduralVfxSource(id, {
  channel = 'mask',
  generator = 'flow-bands',
  label = id,
  parameters = {},
  playback = {},
  seed = 1,
} = {}) {
  const definition = GENERATORS.get(generator);
  const result = validateVfxSourceDocument({
    channel,
    id,
    label,
    mode: 'procedural',
    playback,
    procedural: {
      generator,
      parameters: { ...(definition?.defaults ?? {}), ...parameters },
      seed,
    },
    type: VFX_SOURCE_DOCUMENT_TYPE,
    version: VFX_SOURCE_SCHEMA_VERSION,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function createFileVfxSource(id, definition = {}) {
  const result = validateVfxSourceDocument({
    channel: definition.channel ?? 'mask',
    file: definition.file,
    id,
    label: definition.label ?? id,
    mode: 'file',
    playback: definition.playback,
    type: VFX_SOURCE_DOCUMENT_TYPE,
    version: VFX_SOURCE_SCHEMA_VERSION,
  });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

export function createChargedShotDefaultSources(effectId, seed = 1) {
  const prefix = cleanId(effectId);
  return [
    createProceduralVfxSource(`${prefix}.shell-pattern`, {
      generator: 'flow-bands',
      label: 'Shell flow pattern',
      seed,
    }),
    createProceduralVfxSource(`${prefix}.filament-pattern`, {
      generator: 'lightning-veins',
      label: 'Filament pattern',
      seed: seed + 17,
    }),
  ];
}

export function getVfxSourceGeneratorOptions() {
  return cloneSerializable(VFX_SOURCE_GENERATORS);
}

export function parseVfxSourceDocument(input) {
  return parsePresetDocument(input, validateVfxSourceDocument, {
    invalidJsonLabel: 'VFX source document',
  });
}

export function serializeVfxSourceDocument(document, { pretty = true } = {}) {
  const result = validateVfxSourceDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return stableStringify(result.value, pretty ? 2 : 0);
}
