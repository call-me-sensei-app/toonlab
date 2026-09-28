import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { readFileSync } from 'node:fs';
import * as tools from '../labs/rock-generation-lab/ui/catalogSourceMesh.js';
import { createNearestVertexLookup } from '../labs/rock-generation-lab/ui/nearestVertex.js';
import { createFramePointerQueue } from '../labs/rock-generation-lab/ui/framePointer.js';

await import('./verify-rock-variation-workflow.mjs');
const exercised = new Set();
const valid = (geometry) => {
  assert.ok(geometry?.attributes.position, 'tool must return geometry');
  assert.ok(geometry.attributes.position.array.every(Number.isFinite));
  assert.ok(!geometry.index || geometry.index.array.every((i) => i < geometry.attributes.position.count));
  const restored = tools.deserializeCatalogGeometry(tools.serializeCatalogGeometry(geometry));
  assert.deepEqual(restored.attributes.position.array, geometry.attributes.position.array);
  restored.dispose();
};
const heightPatch = new THREE.PlaneGeometry(4, 4, 12, 12).rotateX(-Math.PI / 2);
const positions = heightPatch.attributes.position;
for (let i = 0; i < positions.count; i += 1) {
  const x = positions.getX(i), z = positions.getZ(i);
  positions.setY(i, 1 + 0.18 * Math.cos(x * 3) * Math.cos(z * 4));
}
heightPatch.computeVertexNormals();
const brush = { point: [0, 1, 0], normal: [0, 1, 0], radius: 1.4, strength: 0.2 };
const responses = new Map();
for (const tool of ['inflate', 'clay', 'deflate', 'scrape', 'smooth', 'pinch', 'flatten', 'crack', 'roughen', 'erode', 'terrace']) {
  const geometry = heightPatch.clone(), before = new Float32Array(geometry.attributes.position.array);
  assert.ok(tools.sculptCatalogGeometry(geometry, { ...brush, tool }) > 0, `${tool} must affect the brush patch`);
  const after = geometry.attributes.position.array;
  assert.ok(after.some((value, i) => Math.abs(value - before[i]) > 1e-4), `${tool} must have a measurable effect`);
  assert.ok(tools.auditCatalogSculptGeometry(geometry, before).ok, `${tool} must preserve local mesh integrity`);
  const ys = Array.from({ length: positions.count }, (_, i) => after[i * 3 + 1] - before[i * 3 + 1]);
  if (['inflate', 'clay'].includes(tool)) assert.ok(ys.every((delta) => delta >= -1e-6));
  if (['deflate', 'crack', 'scrape'].includes(tool)) assert.ok(ys.every((delta) => delta <= 1e-6));
  if (tool === 'roughen') assert.ok(ys.some((d) => d > 1e-4) && ys.some((d) => d < -1e-4));
  if (tool === 'flatten') assert.ok(Array.from({ length: positions.count }, (_, i) => Math.abs(after[i * 3 + 1] - 1) - Math.abs(before[i * 3 + 1] - 1)).every((d) => d < 1e-6));
  if (tool === 'terrace') {
    const step = brush.radius * 0.2;
    const distance = (y) => Math.abs(y - Math.round(y / step) * step);
    assert.ok(Array.from({ length: positions.count }, (_, i) => distance(after[i * 3 + 1]) - distance(before[i * 3 + 1])).every((d) => d < 1e-6));
  }
  if (tool === 'pinch') assert.ok(Array.from({ length: positions.count }, (_, i) => Math.hypot(after[i * 3], after[i * 3 + 2]) - Math.hypot(before[i * 3], before[i * 3 + 2])).every((d) => d < 1e-6));
  if (tool === 'erode') assert.ok(ys.reduce((sum, delta) => sum + delta, 0) < 0);
  responses.set(tool, [...after]); valid(geometry);
  const protectedGeometry = heightPatch.clone();
  tools.sculptCatalogGeometry(protectedGeometry, { ...brush, tool, maskWeights: new Float32Array(positions.count).fill(1) });
  assert.deepEqual(protectedGeometry.attributes.position.array, heightPatch.attributes.position.array, `${tool} must respect masks`);
  exercised.add(tool); geometry.dispose(); protectedGeometry.dispose();
}
for (const [a, left] of responses) for (const [b, right] of responses) if (a !== b) assert.notDeepEqual(left, right, `${a} and ${b} must not be aliases`);

// Flatten's affected region follows the cursor, but its target plane does not.
const movingFlatten = heightPatch.clone();
tools.sculptCatalogGeometry(movingFlatten, { ...brush, tool: 'flatten', point: [1.5, 1, 0], planePoint: [0, 1, 0], radius: 0.4 });
let leftChanged = false, rightChanged = false;
for (let i = 0; i < positions.count; i += 1) {
  const changed = Math.abs(movingFlatten.attributes.position.getY(i) - positions.getY(i)) > 1e-6;
  if (positions.getX(i) < -1) leftChanged ||= changed;
  if (positions.getX(i) > 1) rightChanged ||= changed;
}
assert.equal(leftChanged, false); assert.equal(rightChanged, true);

const box = new THREE.BoxGeometry(2, 3, 2, 4, 4, 4);
const all = new Float32Array(box.attributes.position.count).fill(1);
for (const tool of ['grab', 'resize', 'rotate', 'mirror', 'settle']) {
  const geometry = box.clone().translate(0, 3, 0), before = new Float32Array(geometry.attributes.position.array);
  if (tool === 'grab') tools.grabCatalogGeometry(geometry, { before, weights: all, delta: [10, 0, 0] });
  if (tool === 'resize') tools.resizeCatalogGeometry(geometry, { before, weights: all, scale: 3 });
  if (tool === 'rotate') tools.rotateCatalogGeometry(geometry, { before, weights: all, angle: Math.PI / 3 });
  if (tool === 'mirror') tools.mirrorCatalogGeometry(geometry, all);
  if (tool === 'settle') tools.settleCatalogGeometry(geometry, all);
  assert.notDeepEqual(geometry.attributes.position.array, before); valid(geometry); exercised.add(tool); geometry.dispose();
}
for (const tool of ['trim', 'fracture', 'remesh', 'subdivide', 'decimate']) {
  const operation = { trim: () => tools.trimCatalogGeometry(box, { point: [0, 0, 0], normal: [1, 0, 0] }),
    fracture: () => tools.fractureCatalogGeometry(box, { point: [0, 0, 0], normal: [1, 0, 0], width: 0.15 }),
    remesh: () => tools.remeshCatalogGeometry(box), subdivide: () => tools.subdivideCatalogGeometry(box), decimate: () => tools.decimateCatalogGeometry(box, 0.5) };
  const output = operation[tool](); valid(output);
  if (tool === 'trim') { output.computeBoundingBox(); assert.ok(output.boundingBox.max.x < 1e-5); }
  if (tool === 'subdivide') assert.equal(output.index.count, box.index.count * 4);
  if (tool === 'decimate') assert.ok(output.index.count < box.index.count * 0.7);
  exercised.add(tool); output.dispose();
}
const overlap = mergeGeometries([box, box.clone().translate(0.8, 0, 0)]);
const united = tools.unionCatalogGeometryComponents(overlap); valid(united); exercised.add('union');
for (const through of [false, true]) {
  const drilled = tools.drillCatalogGeometry(box, { kernel: 'manifold', point: [0, 1.5, 0], normal: [0, 1, 0], radius: 0.35, depth: 0.8, through, roughness: 0.2 });
  assert.equal(drilled?.userData.toonlabDrillKernel, 'manifold', 'new editor cuts use the solid kernel');
  const drillMesh = new THREE.Mesh(drilled, new THREE.MeshBasicMaterial());
  const centerHits = new THREE.Raycaster(new THREE.Vector3(0, 4, 0), new THREE.Vector3(0, -1, 0)).intersectObject(drillMesh);
  if (through) assert.equal(centerHits.length, 0, 'the new through bore is unobstructed');
  else assert.ok(centerHits.length && Math.abs(centerHits[0].point.y - 0.7) < 1e-5, 'the new blind bore retains the specified bottom');
  for (let sector = 0; sector < 16; sector += 1) {
    const angle = sector * Math.PI / 8;
    const hits = new THREE.Raycaster(new THREE.Vector3(0, 1.1, 0), new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle))).intersectObject(drillMesh);
    assert.ok(hits.length && hits[0].distance > 0.3 && hits[0].distance < 0.4, 'every radial sector has a complete bore wall');
  }
  drillMesh.material.dispose();
  valid(drilled); assert.equal(drilled.userData.toonlabFillPatches.length, 1); exercised.add('drill');
  const filled = tools.fillCatalogGeometry(drilled, [0, 1.5, 0]); valid(filled); assert.equal(filled.userData.toonlabFillPatches.length, 0); exercised.add('fill');
  drilled.dispose(); filled.dispose();
}
const separated = mergeGeometries([box, box.clone().translate(5, 0, 0)]);
const selected = tools.createCatalogSculptWeights(separated, { point: [1, 0, 0], radius: 10, rigidConnectedComponent: true, seedIndices: [0] });
assert.ok(selected.slice(0, all.length).every((v) => v === 1)); assert.ok(selected.slice(all.length).every((v) => v === 0)); exercised.add('select');
// Mask and measure dispatch are also checked in the live browser. Core contract:
// mask uses bounded brush weights, measurement is read-only world-space distance.
const mask = tools.createCatalogSculptWeights(box, { ...brush });
assert.ok(mask.some((v) => v > 0)); assert.ok(mask.every((v) => v >= 0 && v <= 1)); exercised.add('mask');
const measureBefore = new Float32Array(box.attributes.position.array);
assert.equal(new THREE.Vector3(0, 0, 0).distanceTo(new THREE.Vector3(3, 4, 0)), 5);
assert.deepEqual(box.attributes.position.array, measureBefore); exercised.add('measure');
const app = readFileSync(new URL('../labs/rock-generation-lab/ui/App.jsx', import.meta.url), 'utf8');
assert.doesNotMatch(app.match(/const SOURCE_SECTIONS = Object.freeze\(\[([\s\S]*?)\n\]\);/)[1], /label: 'Output'/);
assert.match(app, /Export settings & information…/);
const toolBlock = app.match(/const CATALOG_MESH_TOOLS = Object.freeze\(\[([\s\S]*?)\n\]\);/)[1];
const toolIds = [...toolBlock.matchAll(/value: '([^']+)'/g)].map((m) => m[1]);
assert.deepEqual([...exercised].sort(), toolIds.sort(), 'every exposed tool needs a behavioral check');

// Spatial acceleration must give exactly the brute-force answer, including ties.
const nearest = createNearestVertexLookup(separated.attributes.position);
for (let i = 0; i < 100; i += 1) {
  const point = [Math.sin(i * 3.7) * 7, Math.cos(i * 0.7) * 4, Math.sin(i) * 3];
  let best = -1, distance = Infinity;
  for (let j = 0; j < separated.attributes.position.count; j += 1) {
    const d = new THREE.Vector3().fromBufferAttribute(separated.attributes.position, j).distanceToSquared(new THREE.Vector3(...point));
    if (d < distance) { distance = d; best = j; }
  }
  assert.equal(nearest(...point), best);
}
let scheduled, applied = [];
const queue = createFramePointerQueue((value) => applied.push(value), { request: (fn) => { scheduled = fn; return 1; }, cancel() {} });
for (let i = 0; i < 100; i += 1) queue.enqueue(i + 1);
scheduled(); assert.deepEqual(applied, [100], '100 moves require one transform per frame');
queue.enqueue(101); queue.flush(); assert.deepEqual(applied, [100, 101], 'pointer-up retains the final endpoint');
queue.enqueue(102); queue.clear(); queue.flush(); assert.deepEqual(applied, [100, 101]);
console.log(`Behavioral audit passed for ${exercised.size} tool contracts; masked brushes, moving Flatten, spatial lookup, and frame coalescing passed.`);
await import('./verify-rock-grab-responsiveness.mjs');
await import('./verify-rock-transform-modes.mjs');
await import('./verify-rock-resize-handles.mjs');
await import('./verify-rock-viewport-axes.mjs');
await import('./verify-rock-brush-freedom.mjs');
await import('./verify-workspace-large-saves.mjs');
