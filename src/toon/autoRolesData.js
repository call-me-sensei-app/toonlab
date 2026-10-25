import * as THREE from 'three';

import { AUTO_ROLE_ATTRIBUTE } from './autoRoles.js';
import { isCompressedTexture } from './texturePixels.js';
import { TOONLAB_VERSION } from '../version.js';

// Precomputed automatic roles: the result of autoRoles.js (per-vertex role
// weights, the per-texel role mask, the inferred rest forward and head frame)
// and the other texture evidence conversion measures (alpha coverage, the skin
// colour of materials named as skin), saved once offline and applied at load
// without looking at a single texel. The live analysis reads every base-colour
// texture back on the main thread (about 0.3–1 s per generated chibi on a Mac,
// several seconds on a phone) and cannot read a GPU-compressed texture at all.
//
// A record is made by exportAutoRoles (toonMaterialAdapter.js) on the same
// model the runtime loads, with the same conversion options, and applied with
// `applyToonShader(model, { autoRoles: { mode: 'precomputed', data } })`.
// Applying writes exactly what the live analysis writes — the same weight
// attribute, mask, flags and root userData — so the shader, the face-map bake
// and head tracking see the same model either way.
//
// Meshes are matched by their position in a depth-first traversal of the
// model (the order Object3D.traverse visits them, ToonLab's own outline hulls
// and fur shells excluded), checked against their vertex count. Clones keep
// that order; a re-exported or edited model needs a new record.

export const AUTO_ROLES_DATA_FORMAT = 'toonlab.auto-roles';
export const AUTO_ROLES_DATA_VERSION = 1;

/**
 * The meshes conversion visits, in traversal order. Their index in this list
 * is a mesh's key in a precomputed record.
 */
export function listConvertibleMeshes(root) {
  const meshes = [];
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry || obj.userData?.isToonOutline || obj.userData?.isToonFurShell) return;
    meshes.push(obj);
  });
  return meshes;
}

function evidenceKey(meshIndex, slot) {
  return `${meshIndex}:${slot ?? 0}`;
}

// ---------------------------------------------------------------------------
// Texture evidence: measured live, measured and recorded, or read from a record.

/**
 * The texture evidence conversion consults: per mesh and material slot the
 * alpha coverage, the skin share of a material named as skin, the
 * base-colour texels at the vertices the eye-white lid and stocking bakes
 * look at and an imported MMD toon ramp's tone; for the whole model whether
 * the face texture already draws a nose.
 * `measure` holds the live measurements; a recording source also stores what
 * was measured, and a precomputed source answers from the record only (null
 * where the record has nothing, which conversion treats as "no evidence", as
 * it does for an unreadable texture).
 */
export function createTextureEvidence({ meshes, measure = {}, precomputed = null, record = null }) {
  const indexOf = new Map(meshes.map((mesh, index) => [mesh, index]));
  const answer = (kind, key, measureFn) => {
    if (precomputed) return key === null ? null : precomputed[kind]?.[key] ?? null;
    const value = measureFn();
    if (record && key !== null && value !== null && value !== undefined) {
      record[kind] ??= {};
      record[kind][key] = value;
    }
    return value;
  };
  const slotKey = (mesh, slot) => (indexOf.has(mesh) ? evidenceKey(indexOf.get(mesh), slot) : null);
  return {
    alphaCoverage: (mesh, material, slot) => answer('alphaCoverage', slotKey(mesh, slot), () => measure.alphaCoverage(mesh, material, slot)),
    mmdRampTone: (mesh, material, slot, measureFn) => answer('mmdRampTone', slotKey(mesh, slot), measureFn),
    noseDrawn: (measureFn) => answer('noseDrawn', 'model', measureFn),
    skinEvidence: (mesh, material, slot) => answer('skinEvidence', slotKey(mesh, slot), () => measure.skinEvidence(mesh, material, slot)),
    vertexTexels: (mesh, material, slot, measureFn) => answer('vertexTexels', slotKey(mesh, slot), measureFn),
  };
}

// ---------------------------------------------------------------------------
// Building a record from a model the live analysis has just run on.

function roleMaskTexels(mask) {
  const { data, height, width } = mask?.image ?? {};
  if (!(data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return null;
  return { data: new Uint8Array(data), height, width };
}

/**
 * Collects what inferAutoRoleWeights wrote onto `root` into a record.
 * `inputs` are the conversion inputs the result depends on (recorded so a
 * runtime with different ones is warned); `evidence` the recorded texture
 * evidence.
 */
export function collectAutoRolesRecord(root, { autoRoles, evidence, forwardInferred, inputs, meshes }) {
  const entries = [];
  let vertices = 0;
  meshes.forEach((mesh, index) => {
    const geometry = mesh.geometry;
    vertices += geometry.attributes.position.count;
    const weights = autoRoles?.applied ? geometry.attributes[AUTO_ROLE_ATTRIBUTE] : null;
    if (!weights) return;
    const mask = geometry.userData.toonAutoRoleMask ? roleMaskTexels(geometry.userData.toonAutoRoleMask) : null;
    entries.push({
      hasHair: Boolean(geometry.userData.toonRoleWeightsHasHair),
      index,
      mask,
      name: mesh.name ?? '',
      roleWeights: new Uint8Array(weights.array),
      vertexCount: geometry.attributes.position.count,
    });
  });
  return {
    autoRoles: autoRoles ?? null,
    evidence,
    format: AUTO_ROLES_DATA_FORMAT,
    forward: Array.isArray(root.userData?.toonForward) ? [...root.userData.toonForward] : null,
    forwardInferred: Boolean(forwardInferred),
    headEstimate: autoRoles?.applied && root.userData?.toonHeadEstimate ? structuredClone(root.userData.toonHeadEstimate) : null,
    inputs,
    meshes: entries,
    model: { meshes: meshes.length, vertices },
    toonlab: TOONLAB_VERSION,
    version: AUTO_ROLES_DATA_VERSION,
  };
}

// ---------------------------------------------------------------------------
// Applying a record.

/**
 * Why `record` cannot be applied to the meshes listConvertibleMeshes found,
 * or null when it matches.
 */
export function describeAutoRolesMismatch(record, meshes) {
  if (record?.format !== AUTO_ROLES_DATA_FORMAT) return 'not a ToonLab auto-roles record';
  if (record.version !== AUTO_ROLES_DATA_VERSION) return `record version ${record.version}, this ToonLab reads ${AUTO_ROLES_DATA_VERSION}`;
  if (record.model?.meshes !== meshes.length) return `the record describes ${record.model?.meshes} mesh(es), the model has ${meshes.length}`;
  for (const entry of record.meshes ?? []) {
    const mesh = meshes[entry.index];
    const count = mesh?.geometry?.attributes?.position?.count;
    if (count !== entry.vertexCount) return `mesh ${entry.index} (${entry.name || 'unnamed'}) has ${count} vertices, the record ${entry.vertexCount}`;
    if (!(entry.roleWeights instanceof Uint8Array) || entry.roleWeights.length !== count * 4) return `mesh ${entry.index} has no decoded role weights; parse the record with parseAutoRoles`;
  }
  return null;
}

// A role mask is linear data sampled on the mesh's own UVs with the row
// order the bake wrote (row 0 at v = 0), so it is never colour-managed or
// flipped. Supplied textures are set up that way; raw texels become the same
// DataTexture the live bake makes.
function roleMaskTexture(mask) {
  if (!mask) return null;
  if (mask.isTexture) {
    let changed = false;
    if (mask.colorSpace !== THREE.NoColorSpace) {
      mask.colorSpace = THREE.NoColorSpace;
      changed = true;
    }
    if (!isCompressedTexture(mask) && mask.flipY) {
      mask.flipY = false;
      changed = true;
    }
    if (changed) mask.needsUpdate = true;
    return mask;
  }
  if (!(mask.data instanceof Uint8Array) || mask.data.length !== mask.width * mask.height * 4) return null;
  const texture = new THREE.DataTexture(mask.data, mask.width, mask.height, THREE.RGBAFormat);
  texture.colorSpace = THREE.NoColorSpace;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.name = 'toonAutoRoleMask';
  texture.needsUpdate = true;
  return texture;
}

/**
 * Writes a record's automatic roles onto `root`, as inferAutoRoleWeights
 * would have. Returns the recorded analysis result (with `source:
 * 'precomputed'`), or `{ applied: false, reason }` without modifying anything
 * when the record does not match the model.
 */
export function applyAutoRolesRecord(root, record, meshes) {
  const mismatch = describeAutoRolesMismatch(record, meshes);
  if (mismatch) return { applied: false, mismatch, reason: 'precomputed-mismatch', source: 'precomputed' };
  const result = record.autoRoles;
  if (!result?.applied) return { ...(result ?? { applied: false, reason: 'not-analysed' }), source: 'precomputed' };

  for (const entry of record.meshes) {
    const geometry = meshes[entry.index].geometry;
    geometry.setAttribute(AUTO_ROLE_ATTRIBUTE, new THREE.BufferAttribute(entry.roleWeights, 4, true));
    geometry.userData.toonRoleWeightsHasHair = entry.hasHair;
    const mask = roleMaskTexture(entry.mask);
    if (mask) geometry.userData.toonAutoRoleMask = mask;
    else delete geometry.userData.toonAutoRoleMask;
  }
  if (record.forwardInferred && !Array.isArray(root.userData.toonForward) && record.forward) {
    root.userData.toonForward = [...record.forward];
  }
  if (record.headEstimate) root.userData.toonHeadEstimate = structuredClone(record.headEstimate);
  return { ...result, source: 'precomputed' };
}

/** Names of recorded inputs that differ from this conversion's. */
export function differingAutoRolesInputs(recorded = {}, current = {}) {
  return Object.keys({ ...recorded, ...current })
    .filter((key) => JSON.stringify(recorded[key] ?? null) !== JSON.stringify(current[key] ?? null))
    .sort();
}

// ---------------------------------------------------------------------------
// Serialisation: a JSON document plus one RGBA image per role mask.

function encodeBase64(bytes) {
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function decodeBase64(text) {
  if (typeof Buffer !== 'undefined') return new Uint8Array(Buffer.from(text, 'base64'));
  const binary = atob(text);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Box-filters an RGBA role mask down to at most `maxSize` on its long side by
 * an integer factor (a 1024 mask to 512 averages 2×2 texels). Averaging
 * keeps the role partition up to rounding. Returns the mask unchanged when it
 * already fits or the factor does not divide its size.
 */
export function downsampleRoleMask(mask, maxSize) {
  const factor = Math.ceil(Math.max(mask.width, mask.height) / maxSize);
  if (!(factor > 1) || mask.width % factor || mask.height % factor) return mask;
  const width = mask.width / factor;
  const height = mask.height / factor;
  const data = new Uint8Array(width * height * 4);
  const area = factor * factor;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      for (let k = 0; k < 4; k += 1) {
        let sum = 0;
        for (let dy = 0; dy < factor; dy += 1) {
          const row = ((y * factor + dy) * mask.width + x * factor) * 4 + k;
          for (let dx = 0; dx < factor; dx += 1) sum += mask.data[row + dx * 4];
        }
        data[(y * width + x) * 4 + k] = Math.round(sum / area);
      }
    }
  }
  return { data, height, width };
}

/**
 * Splits a record into a JSON document and its role masks. Each mask is
 * returned as raw RGBA (row 0 at v = 0, the top row of an image file) under
 * the URI the document names for it: `maskUri(meshIndex)` (default
 * `role-mask-<index>.png`, relative to the document). `maskSize` caps the
 * masks' size (box filter).
 */
export function serializeAutoRoles(record, { maskSize = Infinity, maskUri = (index) => `role-mask-${index}.png`, pretty = false } = {}) {
  const masks = [];
  const document = {
    ...record,
    evidence: {
      ...record.evidence,
      vertexTexels: Object.fromEntries(Object.entries(record.evidence?.vertexTexels ?? {}).map(([key, texels]) => [key, encodeBase64(texels)])),
    },
    meshes: record.meshes.map((entry) => {
      let mask = null;
      if (entry.mask?.data) {
        const texels = Number.isFinite(maskSize) ? downsampleRoleMask(entry.mask, maskSize) : entry.mask;
        const uri = maskUri(entry.index);
        masks.push({ ...texels, index: entry.index, uri });
        mask = { height: texels.height, uri, width: texels.width };
      }
      return { ...entry, mask, roleWeights: encodeBase64(entry.roleWeights) };
    }),
  };
  return { json: `${JSON.stringify(document, null, pretty ? 2 : 0)}\n`, masks };
}

/**
 * Turns a serialised record (JSON text or the parsed object) back into one
 * applyToonShader accepts. `masks` supplies each role mask by the URI the
 * document names: a texture (an image, a DataTexture or a CompressedTexture
 * such as KTX2) or raw `{ data, width, height }` RGBA. A mask left out is
 * dropped, and that mesh shades from its vertex weights alone.
 */
export function parseAutoRoles(input, { masks = {} } = {}) {
  const document = typeof input === 'string' ? JSON.parse(input) : input;
  if (document?.format !== AUTO_ROLES_DATA_FORMAT) throw new Error('Not a ToonLab auto-roles document.');
  const maskFor = (uri) => (masks instanceof Map ? masks.get(uri) : masks[uri]) ?? null;
  return {
    ...document,
    evidence: {
      ...document.evidence,
      vertexTexels: Object.fromEntries(Object.entries(document.evidence?.vertexTexels ?? {})
        .map(([key, texels]) => [key, typeof texels === 'string' ? decodeBase64(texels) : texels])),
    },
    meshes: (document.meshes ?? []).map((entry) => ({
      ...entry,
      mask: entry.mask?.uri ? maskFor(entry.mask.uri) : null,
      roleWeights: typeof entry.roleWeights === 'string' ? decodeBase64(entry.roleWeights) : entry.roleWeights,
    })),
  };
}

function loadImageTexture(url) {
  return new THREE.TextureLoader().loadAsync(url);
}

/**
 * Fetches a serialised record and its role masks (resolved relative to
 * `url`) and parses it. `loadTexture(url)` loads a mask (default: three's
 * TextureLoader); pass a KTX2Loader's `loadAsync` for `.ktx2` masks.
 */
export async function loadAutoRoles(url, { fetch: fetchImpl = globalThis.fetch, loadTexture = loadImageTexture } = {}) {
  const response = await fetchImpl(url);
  if (!response.ok) throw new Error(`Could not load ${url}: HTTP ${response.status}`);
  const document = await response.json();
  const base = new URL(url, globalThis.location?.href ?? 'file:///');
  const masks = new Map();
  await Promise.all((document.meshes ?? []).map(async (entry) => {
    if (!entry.mask?.uri) return;
    masks.set(entry.mask.uri, await loadTexture(new URL(entry.mask.uri, base).href));
  }));
  return parseAutoRoles(document, { masks });
}
