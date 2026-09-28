import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNearestVertexLookup } from '../labs/rock-generation-lab/ui/nearestVertex.js';
import { transferCatalogWeights, subdivideCatalogGeometry } from '../labs/rock-generation-lab/ui/catalogSourceMesh.js';

const source = new THREE.SphereGeometry(2, 128, 96);
const target = subdivideCatalogGeometry(source);
const a = source.attributes.position, b = target.attributes.position;
const weights = Float32Array.from({ length: a.count }, (_, index) => (index % 31) / 30);
const baseline = new Float32Array(b.count);
const start = performance.now();
for (let i = 0; i < b.count; i += 1) {
  let nearest = -1, distance = Infinity;
  for (let j = 0; j < a.count; j += 1) {
    const d = (a.getX(j) - b.getX(i)) ** 2 + (a.getY(j) - b.getY(i)) ** 2 + (a.getZ(j) - b.getZ(i)) ** 2;
    if (d < distance) { distance = d; nearest = j; }
  }
  baseline[i] = weights[nearest] ?? 0;
}
const bruteForceMs = performance.now() - start;
const optimizedStart = performance.now();
const accelerated = transferCatalogWeights(source, target, weights);
const acceleratedMs = performance.now() - optimizedStart;
assert.deepEqual(accelerated, baseline, 'performance improvements must preserve exact mask/selection transfer');
const queries = Array.from({ length: 600 }, (_, i) => [Math.sin(i * 0.37) * 2, Math.cos(i * 0.73) * 2, Math.sin(i * 0.17) * 2]);
const fillStart = performance.now();
for (const query of queries) {
  let distance = Infinity;
  for (let i = 0; i < a.count; i += 1) distance = Math.min(distance, new THREE.Vector3(query[0], query[1], query[2])
    .distanceToSquared(new THREE.Vector3().fromBufferAttribute(a, i)));
}
const fillBruteMs = performance.now() - fillStart;
const fillAcceleratedStart = performance.now(), lookup = createNearestVertexLookup(a);
queries.forEach((point) => lookup(...point));
const fillAcceleratedMs = performance.now() - fillAcceleratedStart;
console.log(JSON.stringify({ sourceVertices: a.count, targetVertices: b.count,
  selectionTransfer: { bruteForceMs, acceleratedMs, speedup: bruteForceMs / acceleratedMs },
  holeVertexQueries: { count: queries.length, bruteForceMs: fillBruteMs, acceleratedMs: fillAcceleratedMs, speedup: fillBruteMs / fillAcceleratedMs },
  exactResults: true,
}, null, 2));
source.dispose(); target.dispose();
