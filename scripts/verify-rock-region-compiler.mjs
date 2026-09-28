import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  HOODOO_CAPROCK_INPUT_SHA256,
  HOODOO_CAPROCK_REGION_PROFILE_ID,
  RockRegionCompilerError,
  compileRockRegionGlb,
  compileRockRegionGlbFile,
} from '../src/rockgen/node.js';
import { compileRockRegionGlbWithProfile } from '../src/rockgen/rockRegionGlbCompiler.node.js';

const GLB_JSON = 0x4e4f534a;
const GLB_BINARY = 0x004e4942;

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function pad(bytes, fill = 0) {
  const result = Buffer.alloc((bytes.length + 3) & ~3, fill);
  bytes.copy(result);
  return result;
}

function encode(json, binary) {
  const jsonBytes = pad(Buffer.from(JSON.stringify(json)), 0x20);
  const binaryBytes = pad(binary);
  const output = Buffer.alloc(12 + 8 + jsonBytes.length + 8 + binaryBytes.length);
  output.writeUInt32LE(0x46546c67, 0);
  output.writeUInt32LE(2, 4);
  output.writeUInt32LE(output.length, 8);
  output.writeUInt32LE(jsonBytes.length, 12);
  output.writeUInt32LE(GLB_JSON, 16);
  jsonBytes.copy(output, 20);
  const offset = 20 + jsonBytes.length;
  output.writeUInt32LE(binaryBytes.length, offset);
  output.writeUInt32LE(GLB_BINARY, offset + 4);
  binaryBytes.copy(output, offset + 8);
  return output;
}

function decode(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString().trim());
  const binaryHeader = 20 + jsonLength;
  const binaryLength = bytes.readUInt32LE(binaryHeader);
  return {
    json,
    binary: bytes.subarray(binaryHeader + 8, binaryHeader + 8 + binaryLength),
  };
}

function fixture(mutator = () => {}) {
  const positions = new Float32Array([
    -1, 0, 0,
    1, 0.1, 0,
    -0.8, 0.2, 0,
    0.8, 0.65, 0,
    -0.4, 0.75, 0,
    0.4, 1, 0,
  ]);
  const binary = Buffer.from(positions.buffer);
  const json = {
    asset: { version: '2.0', generator: 'ToonLab synthetic verifier' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'SyntheticHoodoo' }],
    meshes: [{ name: 'SyntheticHoodooMesh', primitives: [{ attributes: { POSITION: 0 } }] }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: binary.length, target: 34962 }],
    accessors: [{
      bufferView: 0,
      byteOffset: 0,
      componentType: 5126,
      count: positions.length / 3,
      type: 'VEC3',
      min: [-1, 0, 0],
      max: [1, 1, 0],
    }],
  };
  mutator(json);
  const bytes = encode(json, binary);
  const profile = Object.freeze({
    id: 'synthetic-hoodoo-height-v1',
    inputSha256: sha256(bytes),
    expectedNodeName: 'SyntheticHoodoo',
    expectedMeshName: 'SyntheticHoodooMesh',
    expectedPositionCount: 6,
    binding: Object.freeze({
      schema: 'toonlab.rock-region-binding',
      version: 1,
      profile: 'synthetic-hoodoo-height-v1',
      attribute: '_TL_ROCK_REGION',
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
    }),
  });
  return { bytes, profile };
}

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

function expectCode(callback, code) {
  assert.throws(callback, (error) => error instanceof RockRegionCompilerError && error.code === code);
}

const source = fixture();
const sourceBefore = Buffer.from(source.bytes);
const first = compileRockRegionGlbWithProfile(source.bytes, {
  profile: source.profile,
  inputSha256: source.profile.inputSha256,
});
const second = compileRockRegionGlbWithProfile(source.bytes, {
  profile: source.profile,
  inputSha256: source.profile.inputSha256,
});

check('synthetic compiler output is byte deterministic and does not mutate input', () => {
  assert.deepEqual(first.bytes, second.bytes);
  assert.deepEqual(source.bytes, sourceBefore);
  assert.equal(first.audit.output.sha256, second.audit.output.sha256);
});

check('audit and binding retain exact profile and complete channel coverage', () => {
  assert.equal(first.audit.profile, source.profile.id);
  assert.equal(first.audit.binding.profile, source.profile.id);
  assert.deepEqual(first.audit.primitiveAudits[0].channelMaxUnorm8, [255, 255, 255, 255]);
  assert.ok(first.audit.primitiveAudits[0].channelSamples.every((count) => count > 0));
});

check('original embedded binary is an exact output prefix', () => {
  const input = decode(source.bytes);
  const output = decode(Buffer.from(first.bytes));
  assert.deepEqual(output.binary.subarray(0, input.json.buffers[0].byteLength), input.binary.subarray(0, input.json.buffers[0].byteLength));
  assert.equal(first.audit.output.originalBinaryPrefixSha256, sha256(input.binary.subarray(0, input.json.buffers[0].byteLength)));
});

check('normalized UINT8 accessor bounds use raw stored component values', () => {
  const { json } = decode(Buffer.from(first.bytes));
  const regionAccessor = json.accessors[json.meshes[0].primitives[0].attributes._TL_ROCK_REGION];
  assert.equal(regionAccessor.componentType, 5121);
  assert.equal(regionAccessor.normalized, true);
  assert.deepEqual(regionAccessor.min, [0, 0, 0, 0]);
  assert.deepEqual(regionAccessor.max, [255, 255, 255, 255]);
});

check('public compiler is fixed to the admitted hoodoo profile and SHA', () => {
  assert.equal(HOODOO_CAPROCK_REGION_PROFILE_ID, 'hoodoo-caprock-normalized-height-v1');
  assert.equal(HOODOO_CAPROCK_INPUT_SHA256.length, 64);
  expectCode(() => compileRockRegionGlb(source.bytes, {
    profile: HOODOO_CAPROCK_REGION_PROFILE_ID,
    inputSha256: HOODOO_CAPROCK_INPUT_SHA256,
  }), 'INPUT_HASH_MISMATCH');
  expectCode(() => compileRockRegionGlb(source.bytes, {
    profile: 'basalt-column-height-v1',
    inputSha256: HOODOO_CAPROCK_INPUT_SHA256,
  }), 'UNSUPPORTED_PROFILE');
});

for (const [label, mutate, code] of [
  ['helper nodes', (json) => json.nodes.push({ name: 'collision_helper' }), 'UNSUPPORTED_MESH_COUNT'],
  ['node transforms', (json) => { json.nodes[0].rotation = [0, 0, 0, 1]; }, 'UNSUPPORTED_TRANSFORM'],
  ['helper mesh names', (json) => { json.meshes[0].name = 'SyntheticHoodoo_collision'; }, 'UNSUPPORTED_HELPER'],
  ['existing attributes', (json) => { json.meshes[0].primitives[0].attributes._TL_ROCK_REGION = 0; }, 'EXISTING_BINDING'],
  ['sparse positions', (json) => { json.accessors[0].sparse = { count: 1, indices: {}, values: {} }; }, 'UNSUPPORTED_SPARSE_POSITION'],
  ['quantized positions', (json) => { json.accessors[0].componentType = 5123; }, 'UNSUPPORTED_QUANTIZED_POSITION'],
  ['multiple primitives', (json) => { json.meshes[0].primitives.push({ attributes: { POSITION: 0 } }); }, 'UNSUPPORTED_PRIMITIVE_COUNT'],
]) {
  check(`compiler rejects ${label}`, () => {
    const candidate = fixture(mutate);
    expectCode(() => compileRockRegionGlbWithProfile(candidate.bytes, {
      profile: candidate.profile,
      inputSha256: candidate.profile.inputSha256,
    }), code);
  });
}

check('compiler rejects malformed GLB bytes', () => {
  const malformed = new Uint8Array([1, 2, 3, 4]);
  const profile = { ...source.profile, inputSha256: sha256(malformed) };
  expectCode(() => compileRockRegionGlbWithProfile(malformed, {
    profile,
    inputSha256: profile.inputSha256,
  }), 'INVALID_GLB');
});

const temporaryRoot = await mkdtemp(join(tmpdir(), 'toonlab-rock-region-compiler-'));
try {
  const outputPath = join(temporaryRoot, 'exists.glb');
  await writeFile(outputPath, 'protected');
  await assert.rejects(
    compileRockRegionGlbFile({
      inputPath: join(temporaryRoot, 'missing.glb'),
      outputPath,
      auditPath: join(temporaryRoot, 'audit.json'),
      inputSha256: HOODOO_CAPROCK_INPUT_SHA256,
    }),
    (error) => error instanceof RockRegionCompilerError && error.code === 'OUTPUT_EXISTS',
  );
  checks += 1;
  console.log('ok   compiler refuses to overwrite before reading input');
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}

console.log(`Rock-region compiler verification passed (${checks} checks).`);
