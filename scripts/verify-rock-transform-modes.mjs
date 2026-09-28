import assert from 'node:assert/strict';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  createCatalogGrabSession, resizeCatalogGeometry, auditCatalogSculptGeometry,
  serializeCatalogGeometry, deserializeCatalogGeometry,
} from '../labs/rock-generation-lab/ui/catalogSourceMesh.js';

// A face turning past its original normal is not necessarily degenerate.
// Free Move must accept the full displacement and still commit/round-trip it.
const triangle = new THREE.BufferGeometry();
triangle.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
const before = new Float32Array(triangle.attributes.position.array);
const free = createCatalogGrabSession(triangle, { before, weights: [0, 1, 0] });
free.move([-20, 10, 2]);
assert.equal(triangle.attributes.position.getX(1), -19);
assert.equal(triangle.attributes.position.getY(1), 10);
assert.equal(free.appliedScale, 1);
assert.ok(auditCatalogSculptGeometry(triangle, before, { allowLargeDeformation: true }).ok);
free.finish();
const restored = deserializeCatalogGeometry(serializeCatalogGeometry(triangle));
assert.deepEqual(restored.attributes.position.array, triangle.attributes.position.array);
free.move([0, 30, 0]);
assert.equal(triangle.attributes.position.getY(1), 30, 'subsequent samples use the original baseline, not a capped one');
free.rollback();
assert.deepEqual(triangle.attributes.position.array, before);
const guarded = createCatalogGrabSession(triangle, { before, weights: [0, 1, 0], preventFaceFlips: true });
guarded.move([-20, 10, 2]);
assert.ok(guarded.appliedScale < 1, 'fold protection is an explicit opt-in');
guarded.rollback();

const left = new THREE.BoxGeometry(2, 4, 6);
const right = new THREE.BoxGeometry(2, 4, 6).translate(10, 0, 0);
for (const axis of ['uniform', 'x', 'y', 'z']) {
  for (const scale of [0.1, 3, 20]) {
    const geometry = mergeGeometries([left, right]);
    const original = new Float32Array(geometry.attributes.position.array);
    const weights = Float32Array.from({ length: geometry.attributes.position.count }, (_, i) => i < left.attributes.position.count ? 1 : 0);
    assert.ok(resizeCatalogGeometry(geometry, { before: original, weights, axis, scale }) > 0);
    const positions = geometry.attributes.position.array;
    for (let i = 0; i < left.attributes.position.count * 3; i += 1) {
      const factor = axis === 'uniform' || ['x', 'y', 'z'][i % 3] === axis ? scale : 1;
      assert.ok(Math.abs(positions[i] - original[i] * factor) < 1e-5, `${axis}: only requested axes scale`);
    }
    assert.deepEqual(positions.slice(left.attributes.position.count * 3), original.slice(left.attributes.position.count * 3), 'unselected shell remains fixed');
    const reloaded = deserializeCatalogGeometry(serializeCatalogGeometry(geometry));
    assert.deepEqual(reloaded.attributes.position.array, positions);
    resizeCatalogGeometry(geometry, { before: original, weights, axis, scale: 1 });
    assert.deepEqual(geometry.attributes.position.array, original, 'drag back to origin restores every axis');
    geometry.dispose(); reloaded.dispose();
  }
}
for (const geometry of [triangle, restored, left, right]) geometry.dispose();
console.log('Transform modes passed: unrestricted 20–30m Move, optional fold guard, proportional/X/Y/Z grow/shrink, selection, and persistence.');
