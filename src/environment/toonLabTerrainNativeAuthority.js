// Native ToonLab Terrain renderer authority that is intentionally kept outside
// the immutable scene export manifest. The original manifest is the capture-
// bound comparison artifact; this sidecar adds later diagnostic probes and
// ToonLab Terrain.GetPosition() without rewriting that pinned evidence.

export const TOONLAB_TERRAIN_NATIVE_AUTHORITY_FILE =
  'terrain-native-authority.json';

export const TOONLAB_TERRAIN_NATIVE_AUTHORITY_CONTRACT = Object.freeze({
  schema: 'toonlab.terrain-native-authority',
  schemaVersion: 1,
});

function joinAssetUrl(baseUrl, relativePath) {
  if (/^(?:data:|blob:|https?:\/\/|\/\/)/i.test(String(relativePath))) {
    return String(relativePath);
  }
  return `${String(baseUrl).replace(/\/$/, '')}/${String(relativePath).replace(/^\//, '')}`;
}

function valuesEqual(left, right) {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left)
      && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => valuesEqual(value, right[index]));
  }
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  const leftKeys = Object.keys(left);
  const rightKeys = Object.keys(right);
  return leftKeys.length === rightKeys.length
    && leftKeys.every((key) => Object.hasOwn(right, key) && valuesEqual(left[key], right[key]));
}

function validateAuthorityRecord(record, terrain, index) {
  if (!record || record.index !== index || record.node !== terrain.node) {
    throw new Error(`ToonLab Terrain native authority record ${index} does not match the scene manifest.`);
  }
  if (record.terrainData?.guid !== terrain.terrainData?.guid
    || record.terrainData?.localFileId !== terrain.terrainData?.localFileId) {
    throw new Error(`ToonLab Terrain native authority record ${index} targets a different TerrainData asset.`);
  }
  if (!Array.isArray(record.position)
    || record.position.length !== 3
    || !record.position.every(Number.isFinite)) {
    throw new Error(`ToonLab Terrain native authority record ${index} has an invalid position.`);
  }
  if (record.renderTransformAuthority
    !== 'ToonLabEngine.Terrain.GetPosition(): translation only; rotation and scale ignored') {
    throw new Error(`ToonLab Terrain native authority record ${index} has an unknown transform contract.`);
  }
  if (!Array.isArray(record.surfaceProbes) || record.surfaceProbes.length !== 81) {
    throw new Error(`ToonLab Terrain native authority record ${index} must retain the 9x9 probe grid.`);
  }
}

/**
 * Hydrate a scene manifest with the three fields added by the native Terrain
 * authority export. No other manifest path is changed.
 */
export function applyToonLabTerrainNativeAuthority(manifest, authority) {
  if (!manifest || !authority) {
    throw new TypeError('A ToonLab scene manifest and Terrain native authority sidecar are required.');
  }
  const contract = TOONLAB_TERRAIN_NATIVE_AUTHORITY_CONTRACT;
  if (authority.schema !== contract.schema || authority.schemaVersion !== contract.schemaVersion) {
    throw new Error(
      `Unsupported ToonLab Terrain native authority ${authority.schema ?? '<missing>'}`
      + ` v${authority.schemaVersion ?? '<missing>'}.`,
    );
  }
  if (authority.sourceScene !== manifest.sourceScene) {
    throw new Error('ToonLab Terrain native authority belongs to a different source scene.');
  }
  if (!Array.isArray(manifest.terrains)
    || !Array.isArray(authority.terrains)
    || authority.terrains.length !== manifest.terrains.length) {
    throw new Error('ToonLab Terrain native authority inventory differs from the scene manifest.');
  }

  const authorityByIndex = new Map(authority.terrains.map((record) => [record.index, record]));
  if (authorityByIndex.size !== authority.terrains.length) {
    throw new Error('ToonLab Terrain native authority contains duplicate terrain indices.');
  }
  const terrains = manifest.terrains.map((terrain, index) => {
    const record = authorityByIndex.get(index);
    validateAuthorityRecord(record, terrain, index);
    for (const [field, value] of [
      ['position', record.position],
      ['surfaceProbes', record.surfaceProbes],
    ]) {
      if (terrain[field] !== undefined && !valuesEqual(terrain[field], value)) {
        throw new Error(`ToonLab Terrain ${field} conflicts with its native authority sidecar.`);
      }
    }
    if (terrain.renderTransformAuthority !== undefined
      && terrain.renderTransformAuthority !== record.renderTransformAuthority) {
      throw new Error('ToonLab Terrain transform contract conflicts with its native authority sidecar.');
    }
    return {
      ...terrain,
      position: [...record.position],
      renderTransformAuthority: record.renderTransformAuthority,
      surfaceProbes: record.surfaceProbes,
    };
  });
  return { ...manifest, terrains };
}

/** Load the optional native Terrain authority sidecar next to a scene export. */
export async function loadToonLabTerrainNativeAuthority({
  baseUrl,
  fetchFn = globalThis.fetch?.bind(globalThis),
  required = false,
} = {}) {
  if (typeof fetchFn !== 'function') {
    if (required) throw new TypeError('ToonLab Terrain native authority loading requires fetch support.');
    return null;
  }
  const url = joinAssetUrl(baseUrl, TOONLAB_TERRAIN_NATIVE_AUTHORITY_FILE);
  const response = await fetchFn(url, { cache: 'no-cache' });
  if (!response?.ok) {
    if (!required && response?.status === 404) return null;
    throw new Error(
      `ToonLab Terrain native authority unavailable (${response?.status ?? 'no response'}): ${url}`,
    );
  }
  return response.json();
}
