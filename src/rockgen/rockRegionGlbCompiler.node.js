import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const GLB_MAGIC = 0x46546c67;
const GLB_JSON = 0x4e4f534a;
const GLB_BINARY = 0x004e4942;
const GLB_VERSION = 2;
const ARRAY_BUFFER = 34962;
const FLOAT = 5126;
const UNSIGNED_BYTE = 5121;
const REGION_ATTRIBUTE = '_TL_ROCK_REGION';
const REGION_BINDING_KEY = 'toonlabRockRegionBinding';
const HELPER_NAME = /(?:^|[_. -])(?:collision|collider|helper|proxy|ucx|ubx|usp|ucp)(?:$|[_. -])/iu;

export const ROCK_REGION_COMPILER_VERSION = 1;
export const HOODOO_CAPROCK_REGION_PROFILE_ID = 'hoodoo-caprock-normalized-height-v1';
export const HOODOO_CAPROCK_INPUT_SHA256 =
  'd8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e';

const REGION_BINDING = Object.freeze({
  schema: 'toonlab.rock-region-binding',
  version: 1,
  profile: HOODOO_CAPROCK_REGION_PROFILE_ID,
  attribute: REGION_ATTRIBUTE,
  encoding: 'unorm8',
  channels: Object.freeze(['base', 'shaft', 'neck', 'cap']),
  space: 'mesh-local-normalized-height',
  failClosed: true,
  bands: Object.freeze({
    base: Object.freeze([0.12, 0.30]),
    cap: Object.freeze([0.72, 0.86]),
    neckEnter: Object.freeze([0.60, 0.70]),
    neckExit: Object.freeze([0.80, 0.89]),
  }),
});

const HOODOO_CAPROCK_PROFILE = Object.freeze({
  id: HOODOO_CAPROCK_REGION_PROFILE_ID,
  inputSha256: HOODOO_CAPROCK_INPUT_SHA256,
  expectedNodeName: 'HoodooV31_Claron_LOD0',
  expectedMeshName: 'HoodooV31_Claron_LOD0_Mesh.001',
  expectedPositionCount: 134_981,
  binding: REGION_BINDING,
});

// Repository-only C11 regeneration profiles. They share one semantic profile
// but each pins an exact admitted source, name, and vertex count. Only LOD0 is
// re-exported by the public Node barrel.
const HOODOO_RESEARCH_PROFILES = Object.freeze([
  HOODOO_CAPROCK_PROFILE,
  Object.freeze({
    id: HOODOO_CAPROCK_REGION_PROFILE_ID,
    inputSha256: '32a4a24f4967080964031e179ce1741a0cbebb6d794ae8df4e56f24ea9cecd09',
    expectedNodeName: 'HoodooV31_Claron_LOD1',
    expectedMeshName: 'HoodooV31_Claron_LOD1_Mesh.001',
    expectedPositionCount: 55_201,
    binding: REGION_BINDING,
  }),
  Object.freeze({
    id: HOODOO_CAPROCK_REGION_PROFILE_ID,
    inputSha256: '5e09de7b855f0d13509e4628ea705f03b86220fc6c0026d3186ab1dee8d0c7fa',
    expectedNodeName: 'HoodooV31_Claron_LOD2',
    expectedMeshName: 'HoodooV31_Claron_LOD2_Mesh.001',
    expectedPositionCount: 20_548,
    binding: REGION_BINDING,
  }),
  Object.freeze({
    id: HOODOO_CAPROCK_REGION_PROFILE_ID,
    inputSha256: '1b29256626e579779dd9f45e7cc4833c18934eac27cfdc351c1b7cc16a399e55',
    expectedNodeName: 'HoodooV31_Claron_LOD3',
    expectedMeshName: 'HoodooV31_Claron_LOD3_Mesh.001',
    expectedPositionCount: 6_551,
    binding: REGION_BINDING,
  }),
]);

export class RockRegionCompilerError extends Error {
  constructor(code, message, details = null) {
    super(message);
    this.name = 'RockRegionCompilerError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details = null) {
  throw new RockRegionCompilerError(code, message, details);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function align4(value) {
  return (value + 3) & ~3;
}

function padTo4(bytes, fill = 0) {
  const padded = Buffer.alloc(align4(bytes.length), fill);
  bytes.copy(padded);
  return padded;
}

function parseGlb(input) {
  if (!(input instanceof Uint8Array)) {
    fail('INVALID_INPUT', 'Rock-region compiler input must be a Uint8Array.');
  }
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== GLB_MAGIC) {
    fail('INVALID_GLB', 'Input is not a valid GLB file.');
  }
  if (bytes.readUInt32LE(4) !== GLB_VERSION) {
    fail('UNSUPPORTED_GLB_VERSION', `Only GLB 2.0 is supported, found ${bytes.readUInt32LE(4)}.`);
  }
  if (bytes.readUInt32LE(8) !== bytes.length) {
    fail('INVALID_GLB_LENGTH', 'GLB header byte length does not match the input.');
  }

  let json = null;
  let binary = null;
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) fail('TRUNCATED_GLB', 'Truncated GLB chunk header.');
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (end > bytes.length) fail('TRUNCATED_GLB', 'GLB chunk exceeds file bounds.');
    if (type === GLB_JSON) {
      if (json) fail('UNSUPPORTED_GLB_LAYOUT', 'Multiple GLB JSON chunks are unsupported.');
      try {
        json = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/[\0 ]+$/u, ''));
      } catch (error) {
        fail('INVALID_GLB_JSON', 'GLB JSON chunk is invalid.', { cause: error?.message });
      }
    } else if (type === GLB_BINARY) {
      if (binary) fail('UNSUPPORTED_GLB_LAYOUT', 'Multiple GLB binary chunks are unsupported.');
      binary = Buffer.from(bytes.subarray(start, end));
    } else {
      fail('UNSUPPORTED_GLB_LAYOUT', `Unsupported GLB chunk type 0x${type.toString(16)}.`);
    }
    offset = end;
  }
  if (!json || typeof json !== 'object' || !binary) {
    fail('INVALID_GLB', 'One JSON chunk and one embedded binary chunk are required.');
  }
  if (json.buffers?.length !== 1 || json.buffers[0]?.uri) {
    fail('UNSUPPORTED_BUFFER_LAYOUT', 'Exactly one embedded GLB buffer is required.');
  }
  const declaredLength = json.buffers[0].byteLength;
  if (!Number.isInteger(declaredLength) || declaredLength < 0 || declaredLength > binary.length) {
    fail('INVALID_BUFFER_LENGTH', 'Declared GLB buffer length is invalid.');
  }
  if (binary.length - declaredLength > 3) {
    fail('INVALID_BUFFER_LENGTH', 'GLB binary chunk has more than three padding bytes.');
  }
  return { bytes, json, binary, declaredLength };
}

function validateProfile(profile) {
  if (!profile || typeof profile !== 'object') fail('INVALID_PROFILE', 'A compiler profile is required.');
  if (typeof profile.id !== 'string' || !profile.id) fail('INVALID_PROFILE', 'Profile id is required.');
  if (!/^[a-f0-9]{64}$/u.test(profile.inputSha256 ?? '')) {
    fail('INVALID_PROFILE', 'Profile inputSha256 must be a lowercase SHA-256 digest.');
  }
  if (!profile.binding || profile.binding.attribute !== REGION_ATTRIBUTE) {
    fail('INVALID_PROFILE', `Profile binding must define ${REGION_ATTRIBUTE}.`);
  }
  if (profile.binding.profile !== profile.id) {
    fail('INVALID_PROFILE', 'Binding profile must equal the compiler profile id.');
  }
}

function validateIdentityScene(json, profile) {
  if (json.asset?.extras?.toonlabRockRegionCompiler || json.asset?.extras?.toonlabRockRegionParentGlbSha256) {
    fail('EXISTING_BINDING', 'Input already carries ToonLab rock-region compiler provenance.');
  }
  if (json.scenes?.length !== 1 || json.scene !== 0) {
    fail('UNSUPPORTED_SCENE', 'Profile requires exactly one default GLB scene.');
  }
  if (json.nodes?.length !== 1 || json.scenes[0]?.nodes?.length !== 1 || json.scenes[0].nodes[0] !== 0) {
    fail('UNSUPPORTED_MESH_COUNT', 'Profile requires exactly one root visual mesh node and no helpers.');
  }
  if (json.meshes?.length !== 1) {
    fail('UNSUPPORTED_MESH_COUNT', 'Profile requires exactly one visual mesh payload.');
  }
  const node = json.nodes[0];
  if (node.mesh !== 0 || node.children?.length) {
    fail('UNSUPPORTED_MESH_COUNT', 'The sole scene node must directly own the sole visual mesh.');
  }
  if (node.matrix || node.translation || node.rotation || node.scale) {
    fail('UNSUPPORTED_TRANSFORM', 'Rock-region inputs must have applied transforms and no node transform fields.');
  }
  if (node.camera !== undefined || node.skin !== undefined) {
    fail('UNSUPPORTED_HELPER', 'Camera and skin nodes are unsupported.');
  }
  if ((json.cameras?.length ?? 0) > 0 || (json.skins?.length ?? 0) > 0 || (json.animations?.length ?? 0) > 0) {
    fail('UNSUPPORTED_HELPER', 'Cameras, skins, and animations are unsupported.');
  }
  if (json.extensions?.KHR_lights_punctual || node.extensions?.KHR_lights_punctual) {
    fail('UNSUPPORTED_HELPER', 'Light helpers are unsupported.');
  }
  const mesh = json.meshes[0];
  if (HELPER_NAME.test(node.name ?? '') || HELPER_NAME.test(mesh.name ?? '')) {
    fail('UNSUPPORTED_HELPER', 'Collision/helper mesh names are rejected.');
  }
  if (node.extras?.rockShaderExclude === true || node.extras?.toonlabCollision) {
    fail('UNSUPPORTED_HELPER', 'Collision/helper mesh metadata is rejected.');
  }
  if (node.extras?.[REGION_BINDING_KEY]) {
    fail('EXISTING_BINDING', `Input already has ${REGION_BINDING_KEY}.`);
  }
  if (profile.expectedNodeName && node.name !== profile.expectedNodeName) {
    fail('PROFILE_MISMATCH', `Profile requires node ${profile.expectedNodeName}.`, { actual: node.name ?? null });
  }
  if (profile.expectedMeshName && mesh.name !== profile.expectedMeshName) {
    fail('PROFILE_MISMATCH', `Profile requires mesh ${profile.expectedMeshName}.`, { actual: mesh.name ?? null });
  }
  if (mesh.primitives?.length !== 1) {
    fail('UNSUPPORTED_PRIMITIVE_COUNT', 'Profile requires exactly one visual mesh primitive.');
  }
  const primitive = mesh.primitives[0];
  if (primitive.mode !== undefined && primitive.mode !== 4) {
    fail('UNSUPPORTED_PRIMITIVE_MODE', 'Only triangle primitives are supported.');
  }
  if (primitive.targets?.length || mesh.weights?.length) {
    fail('UNSUPPORTED_MORPH_TARGET', 'Morph targets are unsupported.');
  }
  if (primitive.extensions?.KHR_draco_mesh_compression) {
    fail('UNSUPPORTED_COMPRESSION', 'Draco-compressed positions are unsupported.');
  }
  if (primitive.attributes?.[REGION_ATTRIBUTE] !== undefined) {
    fail('EXISTING_BINDING', `Input already has ${REGION_ATTRIBUTE}.`);
  }
  if (!Number.isInteger(primitive.attributes?.POSITION)) {
    fail('MISSING_POSITION', 'Visual primitive has no POSITION accessor.');
  }
  return { node, mesh, primitive };
}

function readPositionY(json, binary, declaredLength, accessorIndex, profile) {
  const accessor = json.accessors?.[accessorIndex];
  if (!accessor) fail('MISSING_POSITION', `POSITION accessor ${accessorIndex} does not exist.`);
  if (accessor.sparse) fail('UNSUPPORTED_SPARSE_POSITION', 'Sparse POSITION accessors are unsupported.');
  if (accessor.componentType !== FLOAT || accessor.type !== 'VEC3' || accessor.normalized === true) {
    fail('UNSUPPORTED_QUANTIZED_POSITION', 'POSITION must be a non-normalized FLOAT VEC3 accessor.');
  }
  if (!Number.isInteger(accessor.count) || accessor.count <= 0) {
    fail('INVALID_POSITION', 'POSITION count must be a positive integer.');
  }
  if (profile.expectedPositionCount && accessor.count !== profile.expectedPositionCount) {
    fail('PROFILE_MISMATCH', `Profile requires ${profile.expectedPositionCount} POSITION values.`, {
      actual: accessor.count,
    });
  }
  const view = json.bufferViews?.[accessor.bufferView];
  if (!view || view.buffer !== 0) {
    fail('UNSUPPORTED_BUFFER_LAYOUT', 'POSITION must reference the embedded GLB buffer.');
  }
  const stride = view.byteStride ?? 12;
  if (!Number.isInteger(stride) || stride < 12 || stride % 4 !== 0) {
    fail('INVALID_POSITION', 'POSITION byteStride is invalid.');
  }
  const viewStart = view.byteOffset ?? 0;
  const viewLength = view.byteLength;
  const accessorOffset = accessor.byteOffset ?? 0;
  if (![viewStart, viewLength, accessorOffset].every(Number.isInteger) || viewStart < 0 || viewLength < 0 || accessorOffset < 0) {
    fail('INVALID_POSITION', 'POSITION offsets must be non-negative integers.');
  }
  const start = viewStart + accessorOffset;
  const end = start + ((accessor.count - 1) * stride) + 12;
  if (start % 4 !== 0 || end > viewStart + viewLength || end > declaredLength) {
    fail('INVALID_POSITION', 'POSITION accessor exceeds its buffer view or declared buffer bounds.');
  }
  const data = new DataView(binary.buffer, binary.byteOffset, binary.byteLength);
  const y = new Float32Array(accessor.count);
  for (let index = 0; index < accessor.count; index += 1) {
    const value = data.getFloat32(start + (index * stride) + 4, true);
    if (!Number.isFinite(value)) fail('INVALID_POSITION', 'POSITION contains a non-finite height.', { index });
    y[index] = value;
  }
  return y;
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - (2 * t));
}

function buildRegionBytes(positionY, bands) {
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const value of positionY) {
    minY = Math.min(minY, value);
    maxY = Math.max(maxY, value);
  }
  const height = maxY - minY;
  if (!(height > 1e-8)) fail('INVALID_HEIGHT_DOMAIN', 'Rock height domain is empty.');
  const output = Buffer.alloc(positionY.length * 4);
  const channelMin = [255, 255, 255, 255];
  const channelMax = [0, 0, 0, 0];
  let primaryPartitionFailures = 0;
  let neckSamples = 0;
  const channelSamples = [0, 0, 0, 0];
  for (let index = 0; index < positionY.length; index += 1) {
    const u = (positionY[index] - minY) / height;
    const base = 1 - smoothstep(bands.base[0], bands.base[1], u);
    const cap = smoothstep(bands.cap[0], bands.cap[1], u);
    const neck = smoothstep(bands.neckEnter[0], bands.neckEnter[1], u)
      * (1 - smoothstep(bands.neckExit[0], bands.neckExit[1], u));
    const baseByte = Math.round(base * 255);
    const capByte = Math.round(cap * 255);
    const shaftByte = 255 - baseByte - capByte;
    const neckByte = Math.round(neck * 255);
    const channels = [baseByte, shaftByte, neckByte, capByte];
    if (baseByte + shaftByte + capByte !== 255 || shaftByte < 0) primaryPartitionFailures += 1;
    if (neckByte > 0) neckSamples += 1;
    for (let channel = 0; channel < 4; channel += 1) {
      output[(index * 4) + channel] = channels[channel];
      channelMin[channel] = Math.min(channelMin[channel], channels[channel]);
      channelMax[channel] = Math.max(channelMax[channel], channels[channel]);
      if (channels[channel] > 0) channelSamples[channel] += 1;
    }
  }
  return {
    bytes: output,
    minY,
    maxY,
    channelMin,
    channelMax,
    primaryPartitionFailures,
    neckSamples,
    channelSamples,
  };
}

function encodeGlb(json, binary) {
  const jsonBytes = padTo4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20);
  const binaryBytes = padTo4(binary, 0);
  const result = Buffer.alloc(12 + 8 + jsonBytes.length + 8 + binaryBytes.length);
  result.writeUInt32LE(GLB_MAGIC, 0);
  result.writeUInt32LE(GLB_VERSION, 4);
  result.writeUInt32LE(result.length, 8);
  result.writeUInt32LE(jsonBytes.length, 12);
  result.writeUInt32LE(GLB_JSON, 16);
  jsonBytes.copy(result, 20);
  const binaryHeader = 20 + jsonBytes.length;
  result.writeUInt32LE(binaryBytes.length, binaryHeader);
  result.writeUInt32LE(GLB_BINARY, binaryHeader + 4);
  binaryBytes.copy(result, binaryHeader + 8);
  return result;
}

/** @internal Synthetic-profile entry used by the repository verifier. */
export function compileRockRegionGlbWithProfile(input, { profile, inputSha256 } = {}) {
  validateProfile(profile);
  if (typeof inputSha256 !== 'string') {
    fail('INPUT_SHA256_REQUIRED', 'inputSha256 is required and must match the selected profile.');
  }
  if (inputSha256 !== profile.inputSha256) {
    fail('PROFILE_HASH_MISMATCH', 'inputSha256 does not match the selected compiler profile.', {
      expected: profile.inputSha256,
      actual: inputSha256,
    });
  }
  const parsed = parseGlb(input);
  const actualInputSha256 = sha256(parsed.bytes);
  if (actualInputSha256 !== inputSha256) {
    fail('INPUT_HASH_MISMATCH', 'Input bytes do not match inputSha256.', {
      expected: inputSha256,
      actual: actualInputSha256,
    });
  }
  const { json, binary, declaredLength } = parsed;
  const { node, mesh, primitive } = validateIdentityScene(json, profile);
  const originalBinary = Buffer.from(binary.subarray(0, declaredLength));
  const originalBinarySha256 = sha256(originalBinary);
  const positionY = readPositionY(
    json,
    originalBinary,
    declaredLength,
    primitive.attributes.POSITION,
    profile,
  );
  const region = buildRegionBytes(positionY, profile.binding.bands);
  const byteOffset = align4(declaredLength);
  const padding = byteOffset - declaredLength;
  const semanticParts = padding ? [originalBinary, Buffer.alloc(padding), region.bytes] : [originalBinary, region.bytes];
  const augmentedBinary = Buffer.concat(semanticParts);
  json.bufferViews ??= [];
  json.accessors ??= [];
  const bufferView = json.bufferViews.length;
  json.bufferViews.push({
    buffer: 0,
    byteOffset,
    byteLength: region.bytes.length,
    target: ARRAY_BUFFER,
    name: 'ToonLabRockRegion_M0_P0',
  });
  const accessor = json.accessors.length;
  json.accessors.push({
    bufferView,
    byteOffset: 0,
    componentType: UNSIGNED_BYTE,
    normalized: true,
    count: positionY.length,
    type: 'VEC4',
    // glTF accessor bounds are expressed in stored component values even when
    // the accessor is normalized. Dividing these UINT8 bounds by 255 would
    // make validators interpret the upper bounds as 0/1 byte values.
    min: [...region.channelMin],
    max: [...region.channelMax],
    name: 'ToonLabRockRegion_M0_P0',
  });
  primitive.attributes[REGION_ATTRIBUTE] = accessor;
  node.extras = {
    ...(node.extras ?? {}),
    [REGION_BINDING_KEY]: { ...profile.binding },
  };
  json.buffers[0].byteLength = augmentedBinary.length;
  json.asset = {
    ...json.asset,
    extras: {
      ...(json.asset?.extras ?? {}),
      toonlabRockRegionParentGlbSha256: actualInputSha256,
      toonlabRockRegionCompiler: `rock-region-glb-compiler@${ROCK_REGION_COMPILER_VERSION}`,
      toonlabRockRegionProfile: profile.id,
    },
  };

  const output = encodeGlb(json, augmentedBinary);
  const outputSha256 = sha256(output);
  const primitiveAudit = {
    meshIndex: 0,
    primitiveIndex: 0,
    positionAccessor: primitive.attributes.POSITION,
    regionAccessor: accessor,
    count: positionY.length,
    byteOffset,
    byteLength: region.bytes.length,
    sourceHeightRange: [region.minY, region.maxY],
    channelMinUnorm8: region.channelMin,
    channelMaxUnorm8: region.channelMax,
    primaryPartitionFailures: region.primaryPartitionFailures,
    neckSamples: region.neckSamples,
    channelSamples: region.channelSamples,
  };
  const passed = region.primaryPartitionFailures === 0
    && region.neckSamples > 0
    && region.channelMax.every((value) => value === 255)
    && [0, 1, 3].every((channel) => region.channelSamples[channel] > 0)
    && sha256(augmentedBinary.subarray(0, declaredLength)) === originalBinarySha256;
  if (!passed) fail('SEMANTIC_AUDIT_FAILED', 'Semantic GLB audit failed; no output was produced.');
  const audit = {
    schema: 'toonlab/rock-region-glb-audit',
    version: 1,
    compilerVersion: ROCK_REGION_COMPILER_VERSION,
    profile: profile.id,
    passed: true,
    input: {
      bytes: parsed.bytes.length,
      sha256: actualInputSha256,
      declaredBinaryBytes: declaredLength,
      declaredBinarySha256: originalBinarySha256,
    },
    output: {
      bytes: output.length,
      sha256: outputSha256,
      declaredBinaryBytes: augmentedBinary.length,
      originalBinaryPrefixBytes: declaredLength,
      originalBinaryPrefixSha256: originalBinarySha256,
      semanticBytes: augmentedBinary.length - declaredLength,
    },
    binding: profile.binding,
    primitiveAudits: [primitiveAudit],
  };
  return Object.freeze({ bytes: new Uint8Array(output), audit: Object.freeze(audit) });
}

export function compileRockRegionGlb(input, {
  profile = HOODOO_CAPROCK_REGION_PROFILE_ID,
  inputSha256,
} = {}) {
  if (profile !== HOODOO_CAPROCK_REGION_PROFILE_ID) {
    fail(
      'UNSUPPORTED_PROFILE',
      `Only ${HOODOO_CAPROCK_REGION_PROFILE_ID} is supported by this representative compiler.`,
      { profile },
    );
  }
  return compileRockRegionGlbWithProfile(input, {
    profile: HOODOO_CAPROCK_PROFILE,
    inputSha256,
  });
}

async function writeCompiledFiles({ outputPath, auditPath, result, overwrite }) {
  await Promise.all([mkdir(dirname(outputPath), { recursive: true }), mkdir(dirname(auditPath), { recursive: true })]);
  const flag = overwrite ? 'w' : 'wx';
  let outputCreated = false;
  try {
    await writeFile(outputPath, result.bytes, { flag });
    outputCreated = true;
    await writeFile(auditPath, `${JSON.stringify(result.audit, null, 2)}\n`, { encoding: 'utf8', flag });
  } catch (error) {
    if (outputCreated && !overwrite) await rm(outputPath, { force: true });
    if (error?.code === 'EEXIST') {
      fail('OUTPUT_EXISTS', 'Output or audit appeared while compiling; no existing file was replaced.');
    }
    throw error;
  }
}

async function assertAbsent(path, label) {
  try {
    await access(path, fsConstants.F_OK);
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  fail('OUTPUT_EXISTS', `${label} already exists; pass overwrite: true to replace it.`, { path });
}

export async function compileRockRegionGlbFile({
  inputPath,
  outputPath,
  auditPath,
  profile = HOODOO_CAPROCK_REGION_PROFILE_ID,
  inputSha256,
  overwrite = false,
} = {}) {
  if (![inputPath, outputPath, auditPath].every((value) => typeof value === 'string' && value.length > 0)) {
    fail('INVALID_FILE_OPTIONS', 'inputPath, outputPath, and auditPath are required.');
  }
  if (outputPath === auditPath || inputPath === outputPath || inputPath === auditPath) {
    fail('INVALID_FILE_OPTIONS', 'Input, output, and audit paths must be distinct.');
  }
  if (!overwrite) {
    await assertAbsent(outputPath, 'Output GLB');
    await assertAbsent(auditPath, 'Audit JSON');
  }
  const input = await readFile(inputPath);
  const result = compileRockRegionGlb(input, { profile, inputSha256 });
  await writeCompiledFiles({ outputPath, auditPath, result, overwrite });
  return result.audit;
}

/** @internal Exact-source bridge retained only for C11 evidence regeneration. */
export async function compileHoodooResearchRockRegionGlbFile({
  inputPath,
  outputPath,
  auditPath,
  inputSha256 = null,
  overwrite = false,
} = {}) {
  if (![inputPath, outputPath, auditPath].every((value) => typeof value === 'string' && value.length > 0)) {
    fail('INVALID_FILE_OPTIONS', 'inputPath, outputPath, and auditPath are required.');
  }
  if (outputPath === auditPath || inputPath === outputPath || inputPath === auditPath) {
    fail('INVALID_FILE_OPTIONS', 'Input, output, and audit paths must be distinct.');
  }
  if (!overwrite) {
    await assertAbsent(outputPath, 'Output GLB');
    await assertAbsent(auditPath, 'Audit JSON');
  }
  const input = await readFile(inputPath);
  const actualSha256 = sha256(input);
  if (inputSha256 && inputSha256 !== actualSha256) {
    fail('INPUT_HASH_MISMATCH', 'Input bytes do not match inputSha256.', {
      expected: inputSha256,
      actual: actualSha256,
    });
  }
  const profile = HOODOO_RESEARCH_PROFILES.find((candidate) => candidate.inputSha256 === actualSha256);
  if (!profile) {
    fail('UNADMITTED_RESEARCH_INPUT', 'Input is not one of the four exact admitted hoodoo research LODs.', {
      actual: actualSha256,
    });
  }
  const result = compileRockRegionGlbWithProfile(input, { profile, inputSha256: actualSha256 });
  await writeCompiledFiles({ outputPath, auditPath, result, overwrite });
  return result.audit;
}
