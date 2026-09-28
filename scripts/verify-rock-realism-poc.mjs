import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { buildGraniteGeometry } from '../labs/rock-realism-poc/buildGraniteGeometry.js';

const notice = await readFile(
  new URL('../labs/rock-realism-poc/THIRD_PARTY_NOTICES.md', import.meta.url),
  'utf8',
);
assert.match(notice, /10bba5dbb0dcac855fbbeb112c1804c5999ca120/);
assert.match(notice, /MIT/);

const reports = [];
for (const mesher of ['vibe', 'toonlab']) {
  for (const seed of [1, 2, 3]) {
    const { geometry, report } = buildGraniteGeometry({
      detailNormals: true,
      mesher,
      resolution: 44,
      seed,
    });
    assert.ok(report.vertices > 250, `${mesher} seed ${seed} has useful geometry`);
    assert.ok(report.triangles > 400, `${mesher} seed ${seed} has useful topology`);
    assert.equal(report.nonFiniteVertices, 0, `${mesher} seed ${seed} is finite`);
    assert.equal(report.components, 1, `${mesher} seed ${seed} is one retained component`);
    assert.equal(geometry.getAttribute('normal').count, report.vertices);
    assert.equal(geometry.getAttribute('color').count, report.vertices);
    assert.equal(geometry.getAttribute('envVertexAo').count, report.vertices);
    reports.push(report);
    geometry.dispose();
  }
}

const first = buildGraniteGeometry({ mesher: 'vibe', resolution: 32, seed: 1 });
const second = buildGraniteGeometry({ mesher: 'vibe', resolution: 32, seed: 1 });
assert.equal(first.report.geometryHash, second.report.geometryHash, 'reference extraction is deterministic');
first.geometry.dispose();
second.geometry.dispose();

console.log(JSON.stringify({
  ok: true,
  reports,
}, null, 2));

