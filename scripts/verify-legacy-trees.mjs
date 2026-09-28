import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';

import {
  LEGACY_TREE_IDS,
  LEGACY_TREE_PRESETS,
  createLegacyTree,
  getLegacyTreePreset,
  getLegacyTreePresetOptions,
} from '../src/vegetation/legacyTreePresets.js';

const expectedIds = [
  'straight',
  'leaning',
  'see-through',
  'curved',
  'forest-mix',
  'wide-crown',
  'autumn-blend',
  'gnarled',
  'bonsai',
  'golden-gingko',
  'sumeru-tips',
  'massive-sumeru',
];

function geometryDigest(tree) {
  const hash = createHash('sha256');
  tree.traverse((object) => {
    if (!object.isMesh) return;
    const positions = object.geometry?.attributes?.position?.array;
    if (positions) hash.update(Buffer.from(positions.buffer, positions.byteOffset, positions.byteLength));
    const index = object.geometry?.index?.array;
    if (index) hash.update(Buffer.from(index.buffer, index.byteOffset, index.byteLength));
  });
  return hash.digest('hex');
}

assert.deepEqual(LEGACY_TREE_IDS, expectedIds);
assert.equal(LEGACY_TREE_PRESETS.length, 12);
assert.deepEqual(
  getLegacyTreePresetOptions().map(({ id }) => id),
  expectedIds,
);
assert.equal(getLegacyTreePreset('not-a-tree'), null);

const leafMap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
leafMap.needsUpdate = true;
for (const preset of LEGACY_TREE_PRESETS) {
  assert.equal(preset.schema, 'treeRecipe');
  assert.equal(preset.version, 3);
  assert.equal(preset.type, 'tree');
  assert.doesNotMatch(preset.id, /species/i);
  assert.equal('species' in preset.options, false);
  const first = createLegacyTree(preset.id, { foliage: { leafMap } });
  const second = createLegacyTree(preset.id, { foliage: { leafMap } });
  assert.equal(first.userData.legacyTree.id, preset.id);
  assert.equal(first.trunkMesh.castShadow, true, `${preset.id} trunk must cast shadows by default`);
  assert.equal(first.trunkMesh.receiveShadow, true, `${preset.id} trunk must receive shadows by default`);
  assert.equal(first.canopyMesh.castShadow, true, `${preset.id} foliage must cast shadows by default`);
  assert.equal(first.canopyMesh.receiveShadow, true, `${preset.id} foliage must receive shadows by default`);
  assert.equal(geometryDigest(first), geometryDigest(second), `${preset.id} must be deterministic`);
  const bounds = new THREE.Box3().setFromObject(first);
  assert.ok(bounds.isEmpty() === false, `${preset.id} must create visible geometry`);
  first.dispose();
  second.dispose();
}

const barkMap = new THREE.DataTexture(new Uint8Array([120, 70, 35, 255]), 1, 1);
barkMap.needsUpdate = true;
const customized = createLegacyTree('straight', {
  foliage: { leafMap },
  leafShape: { preset: 'maple' },
  trunkMap: barkMap,
  vegetationShader: { preset: 'call_me_sensei' },
});
assert.equal(customized.trunkMesh.material.map, barkMap);
assert.equal(customized.config.leafShape.preset, 'maple');
customized.dispose();
barkMap.dispose();
leafMap.dispose();

console.log('Legacy trees verified: 12 deterministic pre-species presets, named recipes, and leaf/bark overrides.');
