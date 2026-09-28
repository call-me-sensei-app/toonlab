import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as tools from '../labs/rock-generation-lab/ui/catalogSourceMesh.js';
// Runs the established suite and supplies its isolated catalog/storage fixtures.
await import('./verify-rock-generation-lab.mjs');
const { createRockGenerationStore } = await import('../labs/rock-generation-lab/ui/store.js');
const { getRockVariationCatalogEntry } = await import('../labs/rock-generation-lab/ui/catalog.js');
const { serializeRockDocument, deserializeRockDocument } = await import('../src/rockgen/index.js');

function volume(geometry) {
  const position = geometry.getAttribute('position');
  let sum = 0;
  for (let i = 0; i < (geometry.index?.count ?? position.count); i += 3) {
    const [a, b, c] = [0, 1, 2].map((corner) => new THREE.Vector3().fromBufferAttribute(
      position, geometry.index ? geometry.index.getX(i + corner) : i + corner,
    ));
    sum += a.dot(b.cross(c)) / 6;
  }
  return sum;
}

const left = new THREE.BoxGeometry(1, 1, 1);
const right = new THREE.BoxGeometry(1, 1, 1).translate(1.1, 0, 0);
const pair = mergeGeometries([left, right]);
const weights = tools.createCatalogSculptWeights(pair, {
  point: [0.5, 0, 0], radius: 2, rigidConnectedComponent: true, seedIndices: [0, 1, 2],
});
assert.ok(weights.slice(0, 24).every((weight) => weight === 1));
assert.ok(weights.slice(24).every((weight) => weight === 0), 'selection must exclude nearby disconnected shells');
const pairBefore = new Float32Array(pair.attributes.position.array);
tools.resizeCatalogGeometry(pair, { before: pairBefore, weights, scale: 2 });
assert.deepEqual(pair.attributes.position.array.slice(72), pairBefore.slice(72));

for (const indexed of [true, false]) {
  const box = indexed ? new THREE.BoxGeometry(2, 2, 2) : new THREE.BoxGeometry(2, 2, 2).toNonIndexed();
  tools.mirrorCatalogGeometry(box, new Float32Array(box.attributes.position.count).fill(1));
  assert.ok(Math.abs(volume(box) - 8) < 1e-6, 'Mirror must preserve outward winding for both geometry layouts');
  box.dispose();
}

const elevated = new THREE.BoxGeometry(2, 2, 2);
const worldMatrix = new THREE.Matrix4().makeRotationZ(0.4).setPosition(0, 5, 0);
tools.settleCatalogGeometry(elevated, new Float32Array(elevated.attributes.position.count).fill(1), { worldMatrix });
let groundMinimum = Infinity;
for (let i = 0; i < elevated.attributes.position.count; i += 1) {
  groundMinimum = Math.min(groundMinimum, new THREE.Vector3().fromBufferAttribute(elevated.attributes.position, i).applyMatrix4(worldMatrix).y);
}
assert.ok(Math.abs(groundMinimum) < 1e-5, 'Settle must land on world ground even under a translated/rotated source hierarchy');

const triangle = new THREE.BufferGeometry();
triangle.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
const triangleBefore = new Float32Array(triangle.attributes.position.array);
triangle.attributes.position.setXYZ(1, 0, 0, 0);
assert.equal(tools.auditCatalogSculptGeometry(triangle, triangleBefore, { allowLargeDeformation: true }).ok, false);
tools.restoreCatalogGeometrySnapshot(triangle, triangleBefore);
tools.grabCatalogGeometry(triangle, { before: triangleBefore, weights: new Float32Array([0, 1, 0]), delta: [-2, 0, 0], strength: 1 });
assert.ok(triangle.attributes.position.getX(1) > 0, 'Grab must stop before collapse/inversion without a distance ceiling');

const sourceBox = new THREE.BoxGeometry(3, 2, 2, 4, 4, 4);
const sourceRoot = new THREE.Group();
sourceRoot.add(new THREE.Mesh(sourceBox, new THREE.MeshStandardMaterial()),
  new THREE.Mesh(sourceBox.clone(), new THREE.MeshStandardMaterial()));
const source = { entry: getRockVariationCatalogEntry('rock-0026'), root: sourceRoot };
const store = createRockGenerationStore({ urlParams: new URLSearchParams() });
store.actions.startCatalogVariation('rock-0026', 0);
store.actions.commitCatalogMeshEdit({ meshIndex: 1, deltas: [[0, 3, 0, 0]] });
store.actions.commitCatalogMeshSnapshots([tools.serializeCatalogGeometry(sourceBox, 0)]);
assert.equal(store.getState().document.reference.meshEdits.length, 1, 'snapshot must retain other mesh history');
const rebuilt = tools.createCatalogVariation(source, { ...store.getState().document.reference, strength: 0 });
assert.equal(rebuilt.meshes[1].geometry.attributes.position.getX(0), 4.5);
store.actions.undo();
assert.equal(store.getState().document.reference.meshSnapshots.length, 0);
store.actions.redo();
assert.equal(store.getState().document.reference.meshEdits.length, 1);

// Sparse commits share immutable topology instead of repeatedly encoding it.
// Subsequent edits, topology replacements, and undo/redo must not mutate history.
const retained = store.getState().document;
const retainedJSON = serializeRockDocument(retained);
assert.equal(store.actions.commitCatalogMeshEdit({ meshIndex: 0, deltas: [[0, 0.1, 0, 0]] }), true);
assert.equal(store.getState().document.reference.meshSnapshots, retained.reference.meshSnapshots);
assert.equal(serializeRockDocument(retained), retainedJSON);

const savedSetItem = window.localStorage.setItem;
try {
  window.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
  store.actions.commitCatalogMeshEdit({ meshIndex: 0, deltas: [[0, 0.1, 0, 0]] });
  assert.match(store.getState().draftSaveError, /Export JSON/);
  store.actions.adoptEngineState({ status: 'Surface reprojected.' });
  assert.match(store.getState().draftSaveError, /Autosave failed/, 'engine status must not hide save failures');
} finally {
  window.localStorage.setItem = savedSetItem;
}
store.actions.undo();
assert.equal(store.getState().draftSaveError, null, 'a successful durable save clears the warning');
const savedSessionStorage = window.sessionStorage;
try {
  const staleDraft = JSON.parse(window.localStorage.getItem('toonlab.rockGeneration.draft.v2'));
  staleDraft.updatedAt = '2000-01-01T00:00:00.000Z';
  window.sessionStorage = { getItem: () => JSON.stringify(staleDraft), setItem() { throw new Error('QuotaExceededError'); } };
  store.actions.commitCatalogMeshEdit({ meshIndex: 0, deltas: [[0, 0.2, 0, 0]] });
  const reopened = createRockGenerationStore({ urlParams: new URLSearchParams() });
  assert.equal(serializeRockDocument(reopened.getState().document), serializeRockDocument(store.getState().document),
    'a stale session copy must not replace a newer durable draft on refresh');
  store.actions.undo();
} finally {
  window.sessionStorage = savedSessionStorage;
}
const sparseJSON = serializeRockDocument(store.getState().document);
store.actions.commitCatalogMeshSnapshots([tools.serializeCatalogGeometry(sourceBox, 0)]);
assert.equal(serializeRockDocument(retained), retainedJSON);
store.actions.undo();
assert.equal(serializeRockDocument(store.getState().document), sparseJSON);
store.actions.undo();
assert.equal(serializeRockDocument(store.getState().document), retainedJSON);
store.actions.redo();
assert.equal(serializeRockDocument(store.getState().document), sparseJSON);
assert.equal(serializeRockDocument(retained), retainedJSON);

const offset = tools.catalogPreviewOffset(source, { strength: 0 });
const moved = tools.createCatalogVariation(source, { strength: 0 });
const moving = moved.meshes[0].geometry;
const beforeMove = new Float32Array(moving.attributes.position.array);
tools.grabCatalogGeometry(moving, {
  before: beforeMove, weights: new Float32Array(moving.attributes.position.count).fill(1), delta: [10, 0, 0], strength: 1,
});
assert.equal(moving.attributes.position.getX(0) + offset.x - (beforeMove[0] + offset.x), 10);
assert.deepEqual(tools.catalogPreviewOffset(source, { strength: 0 }).toArray(), offset.toArray());

const mask = new Float32Array(sourceBox.attributes.position.count).fill(0.8);
sourceBox.setAttribute('sculptMask', new THREE.Float32BufferAttribute(mask, 1));
const maskCopy = sourceBox.clone();
assert.deepEqual(tools.transferCatalogWeights(sourceBox, maskCopy, mask), mask);
const refined = tools.inheritCatalogEditState(sourceBox, tools.subdivideCatalogGeometry(sourceBox));
assert.ok(refined.getAttribute('sculptMask').array.every((weight) => Math.abs(weight - 0.8) < 1e-6));

const sphere = new THREE.SphereGeometry(2, 16, 12);
const clay = sphere.clone(), inflate = sphere.clone();
const brush = { point: [0, 2, 0], normal: [0, 1, 0], radius: 1, strength: 0.05 };
tools.sculptCatalogGeometry(clay, { ...brush, tool: 'clay' });
tools.sculptCatalogGeometry(inflate, { ...brush, strength: brush.strength * 0.42 / 0.65, tool: 'inflate' });
assert.notDeepEqual(clay.attributes.position.array, inflate.attributes.position.array, 'Clay must have distinct deposition behavior');

const fracture = tools.fractureCatalogGeometry(new THREE.BoxGeometry(2, 2, 2), {
  normal: [1, 0, 0], point: [0.95, 0, 0], width: 0.04,
});
assert.ok(fracture);
const xs = Array.from(fracture.attributes.position.array).filter((_, index) => index % 3 === 0);
assert.ok(xs.some((x) => Math.abs(x - 0.93) < 1e-5) && xs.some((x) => Math.abs(x - 0.97) < 1e-5),
  'Fracture must retain the exact requested plane and separation');

const cut = (x) => ({ point: [x, 1, 0], normal: [0, 1, 0], radius: 0.3, depth: 0.7, meshIndex: 0 });
const first = tools.drillCatalogGeometry(sourceBox, cut(-0.7));
const second = tools.drillCatalogGeometry(first, cut(0.7));
assert.ok(first && second);
assert.equal(second.userData.toonlabFillPatches.length, 2);
const beforeSculpt = new Float32Array(second.attributes.position.array);
const outerWeights = Float32Array.from({ length: second.attributes.position.count }, (_, index) => (
  second.attributes.position.getX(index) > 1.4 ? 1 : 0
));
tools.grabCatalogGeometry(second, { before: beforeSculpt, weights: outerWeights, delta: [0.4, 0, 0], strength: 1 });
second.computeBoundingBox();
const maxBeforeFill = second.boundingBox.max.x;
store.actions.commitCatalogMeshSnapshots([tools.serializeCatalogGeometry(second, 0)]);
const reloaded = deserializeRockDocument(serializeRockDocument(store.getState().document));
const restored = tools.deserializeCatalogGeometry(reloaded.reference.meshSnapshots[0]);
assert.equal(restored.userData.toonlabFillPatches.length, 2, 'fill volumes must survive packed project serialization');
const filled = tools.fillCatalogGeometry(restored, [-0.7, 1, 0]);
assert.ok(filled, 'fill must succeed after a later sculpt and snapshot reload');
filled.computeBoundingBox();
assert.ok(Math.abs(filled.boundingBox.max.x - maxBeforeFill) < 1e-6, 'filling must preserve the later sculpt');
const material = new THREE.MeshBasicMaterial();
const hitY = (geometry, x) => new THREE.Raycaster(new THREE.Vector3(x, 3, 0), new THREE.Vector3(0, -1, 0))
  .intersectObject(new THREE.Mesh(geometry, material))[0]?.point.y;
assert.ok(Math.abs(hitY(filled, -0.7) - 1) < 1e-5, 'chosen hole must close at the original surface');
assert.ok(Math.abs(hitY(filled, 0.7) - 0.3) < 1e-5, 'the other hole must retain its bottom');
assert.equal(filled.userData.toonlabFillPatches.length, 1);
const scaleBefore = new Float32Array(filled.attributes.position.array);
tools.resizeCatalogGeometry(filled, { before: scaleBefore, scale: 2, weights: new Float32Array(filled.attributes.position.count).fill(1) });
const lastFill = tools.fillCatalogGeometry(filled, filled.userData.toonlabFillPatches[0].point);
assert.ok(lastFill, 'a saved fill volume must follow subsequent resize');
assert.equal(lastFill.userData.toonlabFillPatches.length, 0);

console.log('Rock tool correctness regressions passed: selection, winding, collapse, history, stable placement, masks, clay, exact fracture, fill/reload/resize.');
