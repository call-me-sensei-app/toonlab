import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import {
  ROCK_REGION_BINDING_KEY,
  applyRockShader,
  createRockShaderSettings,
  inspectRockRegionBinding,
  restoreRockShader,
} from '../src/rock-shader/index.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/v31-scan-assisted-runtime-package/exports',
);
const outputRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock/semantic-regions',
);
const variants = [
  ['hoodoo-caprock-lod0-desktop-4k.glb', 'hoodoo-caprock-lod0-desktop-4k-regions'],
  ['hoodoo-caprock-lod1-mobile-near-2k.glb', 'hoodoo-caprock-lod1-mobile-near-2k-regions'],
  ['hoodoo-caprock-lod2-mobile-mid-1k.glb', 'hoodoo-caprock-lod2-mobile-mid-1k-regions'],
  ['hoodoo-caprock-lod3-mobile-far-1k.glb', 'hoodoo-caprock-lod3-mobile-far-1k-regions'],
];

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function parseGlb(bytes) {
  assert.equal(bytes.readUInt32LE(0), 0x46546c67, 'GLB magic');
  assert.equal(bytes.readUInt32LE(4), 2, 'GLB version');
  assert.equal(bytes.readUInt32LE(8), bytes.length, 'GLB declared length');
  let json = null;
  let binary = null;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + length;
    if (type === 0x4e4f534a) {
      json = JSON.parse(bytes.subarray(start, end).toString('utf8').replace(/[\0 ]+$/u, ''));
    } else if (type === 0x004e4942) {
      binary = bytes.subarray(start, end);
    }
    offset = end;
  }
  assert(json && binary, 'GLB has JSON and binary chunks');
  return { json, binary };
}

function readAccessorComponentBounds(json, binary, accessorIndex) {
  const accessor = json.accessors[accessorIndex];
  assert.equal(accessor.componentType, 5121, 'region accessor componentType');
  assert.equal(accessor.type, 'VEC4', 'region accessor type');
  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride ?? 4;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const min = [255, 255, 255, 255];
  const max = [0, 0, 0, 0];
  for (let index = 0; index < accessor.count; index += 1) {
    for (let channel = 0; channel < 4; channel += 1) {
      const value = binary[start + (index * stride) + channel];
      min[channel] = Math.min(min[channel], value);
      max[channel] = Math.max(max[channel], value);
    }
  }
  return { min, max };
}

const structural = [];
for (const [sourceName, outputStem] of variants) {
  const sourceFile = path.join(sourceRoot, sourceName);
  const outputFile = path.join(outputRoot, `${outputStem}.glb`);
  const auditFile = path.join(outputRoot, `${outputStem}.audit.json`);
  const [sourceBytes, outputBytes, audit] = await Promise.all([
    readFile(sourceFile),
    readFile(outputFile),
    readFile(auditFile, 'utf8').then(JSON.parse),
  ]);
  const source = parseGlb(sourceBytes);
  const output = parseGlb(outputBytes);
  const originalBinaryLength = source.json.buffers[0].byteLength;
  assert.equal(audit.passed, true, `${outputStem} compiler audit`);
  assert.equal(audit.input.sha256, sha256(sourceBytes), `${outputStem} input hash`);
  assert.equal(audit.output.sha256, sha256(outputBytes), `${outputStem} output hash`);
  assert.equal(
    sha256(output.binary.subarray(0, originalBinaryLength)),
    sha256(source.binary.subarray(0, originalBinaryLength)),
    `${outputStem} preserves every original binary byte`,
  );
  assert.equal(output.json.asset.extras.toonlabRockRegionParentGlbSha256, sha256(sourceBytes));
  for (const node of output.json.nodes.filter((candidate) => Number.isInteger(candidate.mesh))) {
    const binding = node.extras?.toonlabRockRegionBinding;
    assert.equal(binding?.schema, 'toonlab.rock-region-binding');
    assert.equal(binding?.failClosed, true);
    assert.deepEqual(binding?.channels, ['base', 'shaft', 'neck', 'cap']);
  }
  for (const mesh of output.json.meshes) {
    for (const primitive of mesh.primitives) {
      const position = output.json.accessors[primitive.attributes.POSITION];
      const region = output.json.accessors[primitive.attributes._TL_ROCK_REGION];
      assert(region, `${outputStem} region accessor exists`);
      assert.equal(region.type, 'VEC4');
      assert.equal(region.componentType, 5121);
      assert.equal(region.normalized, true);
      assert.equal(region.count, position.count);
      const storedBounds = readAccessorComponentBounds(
        output.json,
        output.binary,
        primitive.attributes._TL_ROCK_REGION,
      );
      // glTF 2.0: normalization has no effect on accessor min/max; these must
      // be the actual stored UINT8 component bounds, not decoded 0..1 values.
      assert.deepEqual(region.min, storedBounds.min, `${outputStem} accessor min matches stored UINT8 values`);
      assert.deepEqual(region.max, storedBounds.max, `${outputStem} accessor max matches stored UINT8 values`);
    }
  }
  structural.push({
    input: sourceFile,
    inputSha256: sha256(sourceBytes),
    output: outputFile,
    outputSha256: sha256(outputBytes),
    preservedBinaryBytes: originalBinaryLength,
    semanticBytes: audit.output.semanticBytes,
    vertices: audit.primitiveAudits.reduce((sum, record) => sum + record.count, 0),
  });
}

function binding() {
  return {
    schema: 'toonlab.rock-region-binding',
    version: 1,
    profile: 'hoodoo-caprock-normalized-height-v1',
    attribute: '_TL_ROCK_REGION',
    encoding: 'unorm8',
    channels: ['base', 'shaft', 'neck', 'cap'],
    space: 'mesh-local-normalized-height',
    failClosed: true,
    bands: {
      base: [0.12, 0.30],
      cap: [0.72, 0.86],
      neckEnter: [0.60, 0.70],
      neckExit: [0.80, 0.89],
    },
  };
}

function smoothstep(edge0, edge1, value) {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - (2 * t));
}

function regionBytesForHeights(heights) {
  const min = Math.min(...heights);
  const max = Math.max(...heights);
  return new Uint8Array(heights.flatMap((height) => {
    const u = (height - min) / (max - min);
    const base = Math.round((1 - smoothstep(0.12, 0.30, u)) * 255);
    const cap = Math.round(smoothstep(0.72, 0.86, u) * 255);
    const neck = Math.round(
      smoothstep(0.60, 0.70, u) * (1 - smoothstep(0.80, 0.89, u)) * 255,
    );
    return [base, 255 - base - cap, neck, cap];
  }));
}

function makeMesh({ normalized = true, regionCount = 5, includeBinding = true } = {}) {
  const geometry = new THREE.BufferGeometry();
  const heights = [0, 0.8, 1.6, 1.8, 2.4];
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(
    heights.flatMap((height) => [0, height, 0]),
    3,
  ));
  const data = regionBytesForHeights(heights).slice(0, regionCount * 4);
  geometry.setAttribute('_tl_rock_region', new THREE.Uint8BufferAttribute(data, 4, normalized));
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  if (includeBinding) mesh.userData[ROCK_REGION_BINDING_KEY] = binding();
  return mesh;
}

const mesh = makeMesh();
const originalMaterial = mesh.material;
const originalGeometry = mesh.geometry;
const originalRegion = mesh.geometry.getAttribute('_tl_rock_region');
const inspected = inspectRockRegionBinding(mesh);
assert.equal(inspected.passed, true);
assert.equal(inspected.count, 5);
assert.equal(inspected.neckSamples, 2);
assert.equal(inspected.compilerProfileMismatches, 0);
assert.deepEqual(inspected.channelMaxUnorm8, [255, 255, 255, 255]);

const regionSettings = createRockShaderSettings({
  preset: 'call_me_sensei',
  assetIntegration: {
    regionTintStrength: 0.7,
    regionBaseTint: [0.8, 0.6, 0.45],
    regionShaftTint: [1, 0.8, 0.58],
    regionNeckTint: [0.55, 0.36, 0.24],
    regionCapTint: [0.62, 0.42, 0.3],
    regionNeckOverlayStrength: 0.65,
  },
});
assert.equal(regionSettings.assetIntegration.regionTintStrength, 0.7);
assert.deepEqual(regionSettings.assetIntegration.regionCapTint, [0.62, 0.42, 0.3]);
const report = applyRockShader(mesh, regionSettings, { detail: null });
assert.equal(report.applied, 1);
assert.deepEqual(report.rockRegions, {
  meshCount: 1,
  totalVertices: 5,
  totalBytes: 20,
  attribute: '_tl_rock_region',
});
assert.notEqual(mesh.material, originalMaterial);
assert.equal(restoreRockShader(mesh), 1);
assert.equal(mesh.material, originalMaterial);
assert.equal(mesh.geometry, originalGeometry);
assert.equal(mesh.geometry.getAttribute('_tl_rock_region'), originalRegion);
assert.equal(restoreRockShader(mesh), 0);

assert.throws(
  () => inspectRockRegionBinding(makeMesh({ includeBinding: false })),
  /missing toonlabRockRegionBinding/,
);
assert.throws(
  () => inspectRockRegionBinding(makeMesh({ normalized: false })),
  /must be normalized/,
);
assert.throws(
  () => inspectRockRegionBinding(makeMesh({ regionCount: 3 })),
  /accessor counts differ/,
);
const wrongOrder = makeMesh();
wrongOrder.userData[ROCK_REGION_BINDING_KEY].channels = ['base', 'neck', 'shaft', 'cap'];
assert.throws(() => inspectRockRegionBinding(wrongOrder), /channel order/);
const wrongProfile = makeMesh();
wrongProfile.userData[ROCK_REGION_BINDING_KEY].profile = 'untrusted-profile';
assert.throws(() => inspectRockRegionBinding(wrongProfile), /profile must be/);
const wrongBands = makeMesh();
wrongBands.userData[ROCK_REGION_BINDING_KEY].bands.cap = [0.5, 0.7];
assert.throws(() => inspectRockRegionBinding(wrongBands), /height bands/);
const allShaft = makeMesh();
allShaft.geometry.getAttribute('_tl_rock_region').array.set(new Uint8Array([
  0, 255, 1, 0,
  0, 255, 0, 0,
  0, 255, 0, 0,
  0, 255, 0, 0,
  0, 255, 0, 0,
]));
assert.throws(() => inspectRockRegionBinding(allShaft), /nonzero coverage|full authored coverage|compiler profile/);
const tamperedByte = makeMesh();
tamperedByte.geometry.getAttribute('_tl_rock_region').array[6] -= 1;
assert.throws(() => inspectRockRegionBinding(tamperedByte), /compiler profile|equal one/);
assert.throws(
  () => applyRockShader(makeMesh(), regionSettings, { detail: true }),
  /rebuild semantic masks after geometry changes/,
);

let khronosValidator = {
  available: false,
  passed: null,
  limitation: 'The Khronos glTF Validator package/CLI is not installed locally; exact stored-component accessor bounds are validated by the standards fixture above.',
};
try {
  const validator = await import('gltf-validator');
  const reports = [];
  for (const record of structural) {
    const bytes = await readFile(record.output);
    const report = await validator.validateBytes(new Uint8Array(bytes), {
      uri: path.basename(record.output),
      maxIssues: 100,
    });
    reports.push({
      file: record.output,
      errors: report.issues.numErrors,
      warnings: report.issues.numWarnings,
    });
    assert.equal(report.issues.numErrors, 0, `${record.output} Khronos validation errors`);
  }
  khronosValidator = { available: true, passed: true, reports };
} catch (error) {
  if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
  const cliAvailable = ['gltf-validator', 'gltf_validator'].some((command) => (
    spawnSync('which', [command], { encoding: 'utf8' }).status === 0
  ));
  assert.equal(cliAvailable, false, 'A Khronos validator CLI is present but was not executed');
}

const verification = {
  schema: 'toonlab/rock-region-verification',
  version: 1,
  passed: true,
  structural,
  runtime: {
    failClosedCases: 9,
    adversarialCases: ['missing-binding', 'unnormalized', 'count-mismatch', 'channel-order', 'wrong-profile', 'wrong-bands', 'all-shaft-one-neck', 'tampered-byte', 'geometry-detail'],
    immutableCompilerProfileValidated: true,
    exactRestore: true,
    regionReport: report.rockRegions,
    sourceGeometryUnchanged: mesh.geometry === originalGeometry,
    sourceRegionAttributeUnchanged: mesh.geometry.getAttribute('_tl_rock_region') === originalRegion,
  },
  standards: {
    accessorBoundsMatchStoredComponentValues: true,
    normalizedBoundsUseStoredIntegerDomain: true,
    khronosValidator,
  },
};
await writeFile(path.join(outputRoot, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`);
console.log(`Rock regions passed: ${structural.length} GLBs, fail-closed runtime, exact restore.`);
