import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  createCatalogGrabSession, createCatalogSculptWeights, grabCatalogGeometry,
  auditCatalogSculptGeometry, drillCatalogGeometry, fillCatalogGeometry,
  serializeCatalogGeometry, deserializeCatalogGeometry, whenCatalogTopologyReady,
} from '../labs/rock-generation-lab/ui/catalogSourceMesh.js';

const timings = [];
for (const [width, height] of [[24, 16], [128, 96], [256, 192]]) {
  const geometry = new THREE.SphereGeometry(2, width, height);
  const before = new Float32Array(geometry.attributes.position.array);
  const weights = createCatalogSculptWeights(geometry, { point: [0, 2, 0], radius: 0.5, seedIndices: [0, 1, 2], topologyRings: 4 });
  const old = geometry.clone(), start = performance.now();
  const session = createCatalogGrabSession(geometry, { before, weights, preventFaceFlips: true });
  const prepareMs = performance.now() - start;
  const samples = [];
  for (const delta of [[0.1, 0, 0], [2, -2, 0], [5, -5, 0], [-1, 1, 0.5]]) {
    const baselineStart = performance.now();
    grabCatalogGeometry(old, { before, weights, delta });
    const baselineMs = performance.now() - baselineStart;
    const moveStart = performance.now(); session.move(delta); const moveMs = performance.now() - moveStart;
    assert.ok(auditCatalogSculptGeometry(geometry, before, { allowLargeDeformation: true, preventFaceFlips: true }).ok);
    if (delta[0] === 0.1) {
      const actual = geometry.attributes.position.array, expected = old.attributes.position.array;
      assert.ok(actual.every((value, i) => Math.abs(value - expected[i]) < 2e-6), 'unconstrained grabs retain the established falloff');
    }
    samples.push({ delta, baselineMs, moveMs });
  }
  session.move([0, 0, 0]); assert.deepEqual(geometry.attributes.position.array, before, 'returning the pointer restores the gesture baseline');
  for (let i = 0; i < 20; i += 1) {
    session.move([Math.sin(i * 3) * 10, Math.cos(i * 2) * 10, Math.sin(i) * 10]);
    assert.ok(auditCatalogSculptGeometry(geometry, before, { allowLargeDeformation: true, preventFaceFlips: true }).ok, 'analytic constraints must prevent face folds');
  }
  session.finish();
  const restored = deserializeCatalogGeometry(serializeCatalogGeometry(geometry));
  assert.deepEqual(restored.attributes.position.array, geometry.attributes.position.array);
  timings.push({ vertices: before.length / 3, prepareMs, boundaryConstraints: session.constraintCount, samples });
  old.dispose(); geometry.dispose(); restored.dispose();
}

const triangle = new THREE.BufferGeometry();
triangle.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
const beforeTriangle = new Float32Array(triangle.attributes.position.array);
const guarded = createCatalogGrabSession(triangle, { before: beforeTriangle, weights: [0, 1, 0], preventFaceFlips: true });
guarded.move([-2, 0, 0]); assert.ok(triangle.attributes.position.getX(1) > 0, 'move stops before a triangle collapses');
const accepted = new Float32Array(triangle.attributes.position.array);
guarded.move([Number.MAX_VALUE, 0, 0]); guarded.finish();
assert.deepEqual(triangle.attributes.position.array, accepted, 'overflow cannot damage the last accepted position');

await whenCatalogTopologyReady();
const source = new THREE.BoxGeometry(2, 2, 2, 4, 4, 4);
const drilled = drillCatalogGeometry(source, { kernel: 'manifold', point: [0, 1, 0], normal: [0, 1, 0], radius: 0.3, depth: 0.6 });
const beforeDrill = new Float32Array(drilled.attributes.position.array), initialFills = structuredClone(drilled.userData.toonlabFillPatches);
const rigid = createCatalogGrabSession(drilled, { before: beforeDrill, weights: new Float32Array(beforeDrill.length / 3).fill(1) });
assert.equal(rigid.constraintCount, 0, 'a rigid translation needs no repeated face scans');
rigid.move([10, 0, 0]); rigid.move([3, 2, -1]);
assert.deepEqual(drilled.userData.toonlabFillPatches, initialFills, 'invisible fill volumes are not rebuilt during pointer moves');
rigid.finish();
const filled = fillCatalogGeometry(drilled, [3, 3, -1]); assert.ok(filled, 'fill follows the final grab correctly');
rigid.rollback(); assert.deepEqual(drilled.attributes.position.array, beforeDrill); assert.deepEqual(drilled.userData.toonlabFillPatches, initialFills);
for (const geometry of [triangle, source, drilled, filled]) geometry.dispose();
console.log('Prepared Move passed: legacy falloff, large/rigid moves, face-fold prevention, overflow, saved holes, serialization, and rollback.');
console.log(JSON.stringify(timings, null, 2));
