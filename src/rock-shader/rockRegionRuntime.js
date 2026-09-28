export const ROCK_REGION_BINDING_SCHEMA = 'toonlab.rock-region-binding';
export const ROCK_REGION_BINDING_VERSION = 1;
export const ROCK_REGION_PROFILE = 'hoodoo-caprock-normalized-height-v1';
export const ROCK_REGION_GLTF_ATTRIBUTE = '_TL_ROCK_REGION';
export const ROCK_REGION_THREE_ATTRIBUTE = '_tl_rock_region';
export const ROCK_REGION_CHANNELS = Object.freeze(['base', 'shaft', 'neck', 'cap']);
export const ROCK_REGION_BINDING_KEY = 'toonlabRockRegionBinding';
export const ROCK_REGION_BANDS = Object.freeze({
  base: Object.freeze([0.12, 0.30]),
  cap: Object.freeze([0.72, 0.86]),
  neckEnter: Object.freeze([0.60, 0.70]),
  neckExit: Object.freeze([0.80, 0.89]),
});

function fail(reason, details = null) {
  const error = new Error(`Invalid ToonLab rock-region binding: ${reason}`);
  error.code = 'TOONLAB_ROCK_REGION_BINDING_INVALID';
  error.details = details;
  throw error;
}

function sameChannels(value) {
  return Array.isArray(value)
    && value.length === ROCK_REGION_CHANNELS.length
    && value.every((channel, index) => channel === ROCK_REGION_CHANNELS[index]);
}

function sameBands(value) {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(ROCK_REGION_BANDS).every(([key, expected]) => (
    Array.isArray(value[key])
    && value[key].length === expected.length
    && value[key].every((entry, index) => entry === expected[index])
  ));
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - (2 * t));
}

function expectedRegionBytes(normalizedHeight) {
  const base = 1 - smoothstep(...ROCK_REGION_BANDS.base, normalizedHeight);
  const cap = smoothstep(...ROCK_REGION_BANDS.cap, normalizedHeight);
  const neck = smoothstep(...ROCK_REGION_BANDS.neckEnter, normalizedHeight)
    * (1 - smoothstep(...ROCK_REGION_BANDS.neckExit, normalizedHeight));
  const baseByte = Math.round(base * 255);
  const capByte = Math.round(cap * 255);
  return [baseByte, 255 - baseByte - capByte, Math.round(neck * 255), capByte];
}

/**
 * Validates one loaded GLB mesh without adding aliases or mutating geometry.
 * GLTFLoader lower-cases the custom `_TL_ROCK_REGION` semantic and exposes it
 * as `_tl_rock_region`, which TSL can consume directly.
 */
export function inspectRockRegionBinding(mesh, { sampleValues = true } = {}) {
  if (!mesh?.isMesh || !mesh.geometry?.isBufferGeometry) {
    fail('target must be a THREE.Mesh with BufferGeometry');
  }
  const binding = mesh.userData?.[ROCK_REGION_BINDING_KEY];
  if (!binding || typeof binding !== 'object') fail(`missing ${ROCK_REGION_BINDING_KEY}`);
  if (binding.schema !== ROCK_REGION_BINDING_SCHEMA) fail(`schema must be ${ROCK_REGION_BINDING_SCHEMA}`);
  if (binding.version !== ROCK_REGION_BINDING_VERSION) fail(`version must be ${ROCK_REGION_BINDING_VERSION}`);
  if (binding.profile !== ROCK_REGION_PROFILE) fail(`profile must be ${ROCK_REGION_PROFILE}`);
  if (binding.attribute !== ROCK_REGION_GLTF_ATTRIBUTE) fail(`attribute must be ${ROCK_REGION_GLTF_ATTRIBUTE}`);
  if (binding.encoding !== 'unorm8') fail('encoding must be unorm8');
  if (binding.space !== 'mesh-local-normalized-height') fail('unsupported coordinate space');
  if (binding.failClosed !== true) fail('failClosed must be true');
  if (!sameChannels(binding.channels)) fail('channel order must be base, shaft, neck, cap');
  if (!sameBands(binding.bands)) fail('height bands do not match the immutable hoodoo-caprock-normalized-height-v1 profile');

  const position = mesh.geometry.getAttribute('position');
  const region = mesh.geometry.getAttribute(ROCK_REGION_THREE_ATTRIBUTE);
  if (!position) fail('mesh has no position attribute');
  if (!region) fail(`mesh has no ${ROCK_REGION_THREE_ATTRIBUTE} attribute`);
  if (region.itemSize !== 4) fail('region attribute must be VEC4');
  if (region.count !== position.count) fail('region and position accessor counts differ');
  if (region.normalized !== true) fail('region attribute must be normalized');
  if (!(region.array instanceof Uint8Array)) fail('region attribute must use UNSIGNED_BYTE storage');

  let primaryPartitionFailures = 0;
  let compilerProfileMismatches = 0;
  let neckSamples = 0;
  const nonzeroSamples = [0, 0, 0, 0];
  const channelMinUnorm8 = [255, 255, 255, 255];
  const channelMaxUnorm8 = [0, 0, 0, 0];
  if (sampleValues) {
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;
    for (let index = 0; index < position.count; index += 1) {
      const y = position.getY(index);
      if (!Number.isFinite(y)) fail('position attribute contains a non-finite height value');
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const height = maxY - minY;
    if (!(height > 1e-8)) fail('mesh height range is too small for hoodoo-caprock-normalized-height-v1 regions');
    for (let index = 0; index < region.count; index += 1) {
      const offset = index * 4;
      const base = region.array[offset];
      const shaft = region.array[offset + 1];
      const neck = region.array[offset + 2];
      const cap = region.array[offset + 3];
      if (base + shaft + cap !== 255) primaryPartitionFailures += 1;
      if (neck > 0) neckSamples += 1;
      const channels = [base, shaft, neck, cap];
      const expected = expectedRegionBytes((position.getY(index) - minY) / height);
      for (let channel = 0; channel < channels.length; channel += 1) {
        const value = channels[channel];
        if (value > 0) nonzeroSamples[channel] += 1;
        channelMinUnorm8[channel] = Math.min(channelMinUnorm8[channel], value);
        channelMaxUnorm8[channel] = Math.max(channelMaxUnorm8[channel], value);
        if (value !== expected[channel]) compilerProfileMismatches += 1;
      }
    }
    if (primaryPartitionFailures > 0) {
      fail('base + shaft + cap must equal one at every quantized vertex', { primaryPartitionFailures });
    }
    if (neckSamples === 0) fail('neck overlay has no nonzero samples');
    if (nonzeroSamples[0] === 0 || nonzeroSamples[1] === 0 || nonzeroSamples[3] === 0) {
      fail('base, shaft, and cap must each have nonzero coverage', { nonzeroSamples });
    }
    if (channelMaxUnorm8.some((value) => value !== 255)) {
      fail('base, shaft, neck, and cap must each reach full authored coverage', { channelMaxUnorm8 });
    }
    if (compilerProfileMismatches > 0) {
      fail('region bytes do not match the immutable hoodoo-caprock-normalized-height-v1 compiler profile', {
        compilerProfileMismatches,
      });
    }
  }

  return Object.freeze({
    binding,
    attribute: region,
    attributeName: ROCK_REGION_THREE_ATTRIBUTE,
    count: region.count,
    bytes: region.array.byteLength,
    primaryPartitionFailures,
    compilerProfileMismatches,
    neckSamples,
    nonzeroSamples: Object.freeze([...nonzeroSamples]),
    channelMinUnorm8: Object.freeze([...channelMinUnorm8]),
    channelMaxUnorm8: Object.freeze([...channelMaxUnorm8]),
    passed: true,
  });
}

/**
 * Audits all visual meshes. Missing bindings are failures by default because
 * silently applying a partial palette to a multi-primitive rock changes its
 * geological reading.
 */
export function inspectRockRegionBindings(root, {
  requireEveryMesh = true,
  sampleValues = true,
} = {}) {
  const records = [];
  const failures = [];
  root?.traverse?.((object) => {
    if (!object?.isMesh || object.userData?.rockShaderExclude === true) return;
    const hasBinding = Boolean(object.userData?.[ROCK_REGION_BINDING_KEY]);
    if (!hasBinding && !requireEveryMesh) return;
    try {
      records.push({ mesh: object, ...inspectRockRegionBinding(object, { sampleValues }) });
    } catch (error) {
      failures.push({ mesh: object, error });
    }
  });
  if (!records.length && !failures.length) fail('root has no visual meshes');
  if (failures.length) {
    fail(`${failures.length} mesh binding(s) failed validation`, failures.map(({ mesh, error }) => ({
      mesh: mesh.name,
      reason: error.message,
    })));
  }
  return Object.freeze({
    passed: true,
    meshCount: records.length,
    totalVertices: records.reduce((sum, record) => sum + record.count, 0),
    totalBytes: records.reduce((sum, record) => sum + record.bytes, 0),
    records: Object.freeze(records),
  });
}
