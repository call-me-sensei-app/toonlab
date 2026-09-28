import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  collectCatalogLodBindings,
  createCatalogLodRuntime,
  estimateCatalogProjectedPixels,
  normalizeCatalogLodDistances,
  selectCatalogLodLevel,
  selectCatalogLodLevelByProjectedPixels,
} from '../src/catalog/officialCatalogLod.js';

const root = new THREE.Group();
root.position.set(10, 0, 0);
root.scale.setScalar(2);
const lod0 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
lod0.name = 'ridge_LOD0_mesh';
const lod2 = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
lod2.userData.toonlabLodLevel = 2;
const unmanaged = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
unmanaged.name = 'collision-helper';
root.add(lod0, lod2, unmanaged);

const bindings = collectCatalogLodBindings(root);
assert.deepEqual(bindings.map(({ level }) => level), [0, 2]);
assert.deepEqual(normalizeCatalogLodDistances([0, 30, 90]), [0, 30, 90]);
assert.equal(selectCatalogLodLevel({
  availableLevels: [0, 2], distance: 50, distances: [0, 30, 90],
}), 0, 'missing LOD1 falls back to the nearest available lower level');
assert.equal(selectCatalogLodLevel({
  availableLevels: [0, 2], distance: 100, distances: [0, 30, 90],
}), 2);
assert.equal(selectCatalogLodLevelByProjectedPixels({
  availableLevels: [0, 1, 2, 3, 4],
  cullBelowPixels: 5,
  pixelThresholds: [240, 110, 48, 16, 6],
  projectedPixels: 12,
}), 4, 'very-far screen coverage selects the silhouette tier');
assert.equal(selectCatalogLodLevelByProjectedPixels({
  availableLevels: [0, 1, 2, 3, 4],
  cullBelowPixels: 5,
  pixelThresholds: [240, 110, 48, 16, 6],
  projectedPixels: 4.9,
}), null, 'sub-pixel-scale authored assets are culled');

const runtime = createCatalogLodRuntime(root, { distances: [0, 30, 90] });
assert.equal(runtime.level, 0);
assert.equal(lod0.visible, true);
assert.equal(lod2.visible, false);
assert.equal(unmanaged.visible, true);

runtime.update({ distance: 50 });
assert.equal(runtime.level, 0);
runtime.update({ distance: 100 });
assert.equal(runtime.level, 2);
assert.equal(lod0.visible, false);
assert.equal(lod2.visible, true);

const camera = new THREE.PerspectiveCamera();
camera.position.set(210, 0, 0);
runtime.update({ camera });
assert.equal(runtime.level, 2, 'world scale normalizes the camera distance');

runtime.dispose();
assert.equal(lod0.visible, true);
assert.equal(lod2.visible, true);
assert.equal(unmanaged.visible, true);

const capped = createCatalogLodRuntime(root, {
  distances: [0, 30, 90],
  maxLevel: 0,
});
capped.update({ distance: 1000 });
assert.equal(capped.level, 0);
capped.dispose();

const stableRoot = new THREE.Group();
for (let level = 0; level < 3; level += 1) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = `stable_LOD${level}_mesh`;
  stableRoot.add(mesh);
}
const stable = createCatalogLodRuntime(stableRoot, {
  distances: [0, 45, 120],
  hysteresis: 0.1,
});
for (let cycle = 0; cycle < 100; cycle += 1) {
  const result = stable.update({ distance: cycle % 2 === 0 ? 44.9 : 45.1 });
  assert.equal(result.level, 0, 'boundary jitter must not thrash into a coarser LOD');
}
assert.equal(stable.update({ distance: 49.51 }).level, 1, 'upper hysteresis boundary changes LOD');
for (let cycle = 0; cycle < 100; cycle += 1) {
  const result = stable.update({ distance: cycle % 2 === 0 ? 44.9 : 45.1 });
  assert.equal(result.level, 1, 'boundary jitter must not thrash back into a finer LOD');
}
assert.equal(stable.update({ distance: 40.4 }).level, 0, 'lower hysteresis boundary restores finer LOD');
stable.dispose();
stableRoot.traverse((object) => {
  object.geometry?.dispose();
  object.material?.dispose();
});

assert.throws(
  () => createCatalogLodRuntime(root, { hysteresis: -0.1 }),
  /hysteresis must be a finite ratio/,
);

const screenRoot = new THREE.Group();
for (let level = 0; level < 5; level += 1) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
  mesh.name = `screen_LOD${level}_mesh`;
  screenRoot.add(mesh);
}
const screenRuntime = createCatalogLodRuntime(screenRoot, {
  cullBelowPixels: 5,
  hysteresis: 0,
  pixelThresholds: [240, 110, 48, 16, 6],
});
assert.equal(screenRuntime.update({ projectedPixels: 10 }).level, 4);
const culled = screenRuntime.update({ projectedPixels: 4 });
assert.equal(culled.level, null);
assert.equal(culled.culled, true);
assert.equal(screenRoot.children.every((mesh) => !mesh.visible), true);
const perspective = new THREE.PerspectiveCamera(60, 1, 0.1, 1000);
assert.ok(estimateCatalogProjectedPixels({
  camera: perspective,
  distance: 10,
  referenceDiameter: 2,
  viewportHeight: 1080,
}) > 100);
screenRuntime.dispose();
screenRoot.traverse((object) => {
  object.geometry?.dispose();
  object.material?.dispose();
});

console.log('Official catalog LOD verification passed.');
