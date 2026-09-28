import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

import {
  DENSE_FIELD_ROCK_CULL_BELOW_PIXELS,
  DENSE_FIELD_ROCK_PIXEL_THRESHOLDS,
  DENSE_FIELD_ROCK_PRODUCTION_RULE,
  DENSE_FIELD_ROCK_TRIANGLE_CEILINGS,
  createDenseFieldRockLodRuntime,
  inferDenseFieldRockClass,
  validateDenseFieldRockLodTargets,
} from '../src/rockgen/lod/rockDenseFieldPolicy.js';

const batchPolicy = JSON.parse(fs.readFileSync(
  new URL('./fixtures/rock-dense-field-lod-policy.json', import.meta.url),
  'utf8',
));

assert.deepEqual(batchPolicy.pixelThresholds, [...DENSE_FIELD_ROCK_PIXEL_THRESHOLDS]);
assert.equal(batchPolicy.cullBelowPixels, DENSE_FIELD_ROCK_CULL_BELOW_PIXELS);
assert.equal(batchPolicy.shadowLastLevel, DENSE_FIELD_ROCK_PRODUCTION_RULE.farShadowLastLevel);
assert.deepEqual(batchPolicy.classes, {
  ordinary: {
    LOD3Ceiling: DENSE_FIELD_ROCK_TRIANGLE_CEILINGS.ordinary.LOD3,
    LOD4Ceiling: DENSE_FIELD_ROCK_TRIANGLE_CEILINGS.ordinary.LOD4,
  },
  formation: {
    LOD3Ceiling: DENSE_FIELD_ROCK_TRIANGLE_CEILINGS.formation.LOD3,
    LOD4Ceiling: DENSE_FIELD_ROCK_TRIANGLE_CEILINGS.formation.LOD4,
  },
  landmark: {
    LOD3Ceiling: DENSE_FIELD_ROCK_TRIANGLE_CEILINGS.landmark.LOD3,
    LOD4Ceiling: DENSE_FIELD_ROCK_TRIANGLE_CEILINGS.landmark.LOD4,
  },
});

assert.equal(inferDenseFieldRockClass({ targetHeightMetres: 1 }), 'ordinary');
assert.equal(inferDenseFieldRockClass({ targetHeightMetres: 3 }), 'formation');
assert.equal(inferDenseFieldRockClass({ targetHeightMetres: 9 }), 'landmark');
assert.equal(validateDenseFieldRockLodTargets({
  LOD0: 90000,
  LOD1: 32000,
  LOD2: 10000,
  LOD3: 650,
  LOD4: 160,
}, { assetClass: 'ordinary' }).valid, true);
assert.equal(validateDenseFieldRockLodTargets({
  LOD0: 90000,
  LOD1: 32000,
  LOD2: 10000,
  LOD3: 2800,
  LOD4: 160,
}, { assetClass: 'ordinary' }).valid, false, 'the old 2.8k ordinary-rock LOD3 must fail');

const root = new THREE.Group();
for (let level = 0; level < 5; level += 1) {
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshBasicMaterial());
  mesh.name = `dense-rock_LOD${level}_mesh`;
  mesh.castShadow = true;
  root.add(mesh);
}
const runtime = createDenseFieldRockLodRuntime(root);
assert.equal(root.children[2].castShadow, true);
assert.equal(root.children[3].castShadow, false);
assert.equal(root.children[4].castShadow, false);
assert.equal(root.children[4].userData.toonlabDenseFieldRock.silhouetteOnly, true);
assert.equal(runtime.update({ projectedPixels: 8 }).level, 4);
assert.equal(runtime.update({ projectedPixels: 4 }).culled, true);
assert.equal(root.children.every((mesh) => !mesh.visible), true);
runtime.dispose();
assert.equal(root.children.every((mesh) => mesh.castShadow), true);
root.traverse((object) => {
  object.geometry?.dispose();
  object.material?.dispose();
});

const incomplete = new THREE.Group();
const onlyLod0 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
onlyLod0.name = 'incomplete_LOD0_mesh';
incomplete.add(onlyLod0);
assert.throws(
  () => createDenseFieldRockLodRuntime(incomplete),
  /missing required visual tiers: LOD1, LOD2, LOD3, LOD4/,
);
onlyLod0.geometry.dispose();
onlyLod0.material.dispose();

console.log('Dense-field rock LOD policy verification passed.');
