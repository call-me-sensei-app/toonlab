// Landscape project document — the portable serialized shape of a whole
// landscape project: settings + terrain brick + splat brick + foliage
// palette/instances. Bulk arrays travel as base64(deflate-raw) chunks so a
// default 2x2-tile project exports at ~100 KB. The autosave path does NOT go
// through this module (IndexedDB stores the live typed arrays via structured
// clone); this is the export/import/share/cloud interchange format.
//
// Works in both the browser and Node (verify scripts): base64 uses Buffer
// when available, and compression uses the web CompressionStream, falling
// back to raw encoding when the platform lacks it.

import { createLandscapeField } from './landscapeField.js';
import { sanitizeMaterialLayers } from './landscapeLayerTextures.js';
import { sanitizeLandscapeSettings } from './landscapeSettings.js';
import { deserializeTunnel, serializeTunnel } from './landscapeTunnel.js';

export const LANDSCAPE_PROJECT_DOCUMENT_TYPE = 'toonlab/landscape-project';
export const LANDSCAPE_PROJECT_SCHEMA_VERSION = 1;

/** Legacy stride (v1 docs/autosaves): x, y, z, yaw, scale. */
export const FOLIAGE_INSTANCE_STRIDE = 5;

/**
 * Current stride: x, y, z, yaw, scale, qx, qy, qz, qw — the quaternion is an
 * explicit surface-placement tilt (stalactites on cave ceilings). An all-zero
 * quaternion means "no explicit tilt" (slope-derived at compose time), so v1
 * records upgrade losslessly.
 */
export const FOLIAGE_INSTANCE_STRIDE_V2 = 9;

// --- bytes <-> base64 --------------------------------------------------------

function bytesToBase64(bytes) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(text) {
  if (typeof Buffer !== 'undefined') {
    const buffer = Buffer.from(text, 'base64');
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  }
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function pipeThrough(bytes, TransformCtor, mode) {
  const stream = new Blob([bytes]).stream().pipeThrough(new TransformCtor(mode));
  const buffer = await new Response(stream).arrayBuffer();
  return new Uint8Array(buffer);
}

async function encodeChunk(bytes) {
  if (typeof CompressionStream !== 'undefined') {
    try {
      const compressed = await pipeThrough(bytes, CompressionStream, 'deflate-raw');
      return { compression: 'deflate-raw', data: bytesToBase64(compressed) };
    } catch { /* fall through to raw */ }
  }
  return { compression: 'raw', data: bytesToBase64(bytes) };
}

async function decodeChunk(chunk) {
  const bytes = base64ToBytes(String(chunk?.data ?? ''));
  if (chunk?.compression === 'deflate-raw') {
    if (typeof DecompressionStream === 'undefined') {
      throw new Error('This platform cannot decompress deflate-raw landscape data.');
    }
    return pipeThrough(bytes, DecompressionStream, 'deflate-raw');
  }
  return bytes;
}

function float32FromBytes(bytes) {
  // Copy: the bytes may be an offset view into a larger buffer.
  const aligned = new Uint8Array(bytes);
  return new Float32Array(aligned.buffer, 0, Math.floor(aligned.byteLength / 4));
}

// --- serialize ---------------------------------------------------------------

const WATER_PLACEMENTS = ['avoid', 'any', 'bed', 'surface'];

function sanitizeRules(rules = {}) {
  const scaleRange = Array.isArray(rules.scaleRange) && rules.scaleRange.length >= 2
    ? [Number(rules.scaleRange[0]) || 1, Number(rules.scaleRange[1]) || 1]
    : [0.85, 1.25];
  return {
    minSpacing: Math.max(0, Number(rules.minSpacing) || 0),
    scaleRange,
    yawRandom: rules.yawRandom !== false,
    alignToSlope: Math.min(1, Math.max(0, Number(rules.alignToSlope) || 0)),
    maxSlope: Number.isFinite(rules.maxSlope) ? Number(rules.maxSlope) : 0.7,
    minHeight: Number.isFinite(rules.minHeight) ? Number(rules.minHeight) : null,
    maxHeight: Number.isFinite(rules.maxHeight) ? Number(rules.maxHeight) : null,
    avoidWater: rules.avoidWater !== false,
    // Legacy avoidWater maps onto the richer placement enum.
    waterPlacement: WATER_PLACEMENTS.includes(rules.waterPlacement)
      ? rules.waterPlacement
      : (rules.avoidWater !== false ? 'avoid' : 'any'),
  };
}

function sanitizePaletteEntry(entry) {
  if (!entry || typeof entry !== 'object' || !entry.id || !entry.source?.kind) return null;
  return {
    id: String(entry.id),
    label: String(entry.label ?? entry.id),
    // Sources are stored verbatim: recipes/documents inline for OSS built-ins,
    // { kind: 'pro-creation', creationId, jobId, options } for Pro assets.
    // Never a signed URL — those expire.
    source: entry.source,
    rules: sanitizeRules(entry.rules),
    density: Math.max(0.001, Number(entry.density) || 0.15),
    active: entry.active !== false,
  };
}

/**
 * Serializes a live project into a landscape-project document object.
 * `foliage.layers` entries carry `{ paletteId, instances: Float32Array }`
 * with FOLIAGE_INSTANCE_STRIDE floats per record.
 */
export async function createLandscapeProjectDocument({
  id = null,
  label = 'Untitled landscape',
  settings = {},
  field,
  materialLayers = null,
  tunnels = [],
  foliage = { palette: [], layers: [] },
} = {}) {
  if (!field?.heights) throw new TypeError('A landscape field is required to serialize a project.');
  const [heightsChunk, splatChunk, holesChunk, waterChunk] = await Promise.all([
    encodeChunk(new Uint8Array(field.heights.buffer, field.heights.byteOffset, field.heights.byteLength)),
    encodeChunk(field.splat),
    encodeChunk(field.holes),
    encodeChunk(field.water),
  ]);
  const layers = await Promise.all((foliage.layers ?? [])
    .filter((layer) => layer?.paletteId && layer.instances instanceof Float32Array)
    .map(async (layer) => {
      const stride = layer.stride ?? FOLIAGE_INSTANCE_STRIDE;
      return {
        paletteId: String(layer.paletteId),
        stride,
        count: Math.floor(layer.instances.length / stride),
        instances: await encodeChunk(new Uint8Array(
          layer.instances.buffer,
          layer.instances.byteOffset,
          layer.instances.byteLength,
        )),
      };
    }));
  return {
    type: LANDSCAPE_PROJECT_DOCUMENT_TYPE,
    version: LANDSCAPE_PROJECT_SCHEMA_VERSION,
    id: id ?? `landscape_${label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'project'}`,
    label: String(label),
    settings: sanitizeLandscapeSettings(settings),
    materialLayers: sanitizeMaterialLayers(materialLayers),
    tunnels: (tunnels ?? []).map(serializeTunnel),
    terrain: {
      tilesX: field.tilesX,
      tilesZ: field.tilesZ,
      quadsPerTile: field.quadsPerTile,
      spacing: field.spacing,
      origin: { x: field.origin.x, z: field.origin.z },
      heights: heightsChunk,
      splat: { ...splatChunk, width: field.splatW, height: field.splatD },
      holes: holesChunk,
      water: waterChunk,
    },
    foliage: {
      palette: (foliage.palette ?? []).map(sanitizePaletteEntry).filter(Boolean),
      layers,
    },
  };
}

/** Serialized JSON text of a project (the export download payload). */
export async function serializeLandscapeProject(options) {
  return JSON.stringify(await createLandscapeProjectDocument(options), null, 2);
}

// --- parse -------------------------------------------------------------------

/**
 * Parses + validates a landscape-project document (JSON text or object).
 * Returns `{ ok: true, value }` where value carries a rebuilt live `field`
 * plus `{ label, settings, foliage }`, or `{ ok: false, errors }`.
 */
export async function parseLandscapeProjectDocument(input) {
  let raw = input;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch (error) {
      return { ok: false, errors: [`Not valid JSON: ${error.message}`] };
    }
  }
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['Document must be a JSON object.'] };
  }
  if (raw.type !== LANDSCAPE_PROJECT_DOCUMENT_TYPE) {
    return { ok: false, errors: [`Expected type "${LANDSCAPE_PROJECT_DOCUMENT_TYPE}", received "${raw.type}".`] };
  }
  if (Number(raw.version) > LANDSCAPE_PROJECT_SCHEMA_VERSION) {
    return { ok: false, errors: [`Document version ${raw.version} is newer than this runtime (${LANDSCAPE_PROJECT_SCHEMA_VERSION}).`] };
  }
  const terrain = raw.terrain;
  if (!terrain?.heights?.data || !terrain?.splat?.data) {
    return { ok: false, errors: ['Document is missing terrain height/splat data.'] };
  }
  try {
    const heightsBytes = await decodeChunk(terrain.heights);
    const splatBytes = await decodeChunk(terrain.splat);
    // Pre-hole documents simply have no holes chunk — everything solid.
    const holesBytes = terrain.holes?.data ? await decodeChunk(terrain.holes) : null;
    // Pre-dry-zone documents have no water chunk — everything watered.
    const waterBytes = terrain.water?.data ? await decodeChunk(terrain.water) : null;
    const field = createLandscapeField({
      tilesX: terrain.tilesX,
      tilesZ: terrain.tilesZ,
      quadsPerTile: terrain.quadsPerTile,
      spacing: terrain.spacing,
      origin: terrain.origin,
      heights: float32FromBytes(heightsBytes),
      splat: new Uint8Array(splatBytes),
      holes: holesBytes ? new Uint8Array(holesBytes) : null,
      water: waterBytes ? new Uint8Array(waterBytes) : null,
    });
    const layers = await Promise.all((raw.foliage?.layers ?? [])
      .filter((layer) => layer?.paletteId && layer?.instances?.data)
      .map(async (layer) => ({
        paletteId: String(layer.paletteId),
        stride: Number.isInteger(layer.stride) ? layer.stride : FOLIAGE_INSTANCE_STRIDE,
        instances: float32FromBytes(await decodeChunk(layer.instances)),
      })));
    return {
      ok: true,
      value: {
        id: typeof raw.id === 'string' ? raw.id : null,
        label: typeof raw.label === 'string' ? raw.label : 'Imported landscape',
        settings: sanitizeLandscapeSettings(raw.settings ?? {}),
        materialLayers: sanitizeMaterialLayers(raw.materialLayers),
        // Docs from the short-lived slab era simply lose their bores —
        // the punched holes are still in the holes chunk.
        tunnels: (Array.isArray(raw.tunnels) ? raw.tunnels : []).map(deserializeTunnel).filter(Boolean),
        field,
        foliage: {
          palette: (raw.foliage?.palette ?? []).map(sanitizePaletteEntry).filter(Boolean),
          layers,
        },
      },
    };
  } catch (error) {
    return { ok: false, errors: [`Could not decode terrain data: ${error.message}`] };
  }
}
