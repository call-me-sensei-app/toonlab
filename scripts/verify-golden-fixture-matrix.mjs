import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const matrixUrl = new URL('../quality/call-me-sensei-golden-matrix.json', import.meta.url);
const matrix = JSON.parse(await readFile(matrixUrl, 'utf8'));
const schema = JSON.parse(await readFile(
  new URL('../quality/call-me-sensei-golden-matrix.schema.json', import.meta.url),
  'utf8',
));

assert.equal(matrix.schema, 'toonlab/golden-fixture-matrix@1');
assert.equal(schema.properties.schema.const, matrix.schema);
assert.equal(matrix.bundle, 'call-me-sensei');
assert.deepEqual(matrix.axes.renderers, ['webgpu', 'webgl']);
assert.deepEqual(matrix.axes.qualities, ['balanced', 'performance']);
assert.deepEqual(matrix.axes.cameras, ['near', 'medium', 'far']);
assert.deepEqual(matrix.axes.timesOfDay, ['noon', 'sunset', 'moonlit', 'overcast']);
assert.deepEqual(matrix.capture.viewport, {
  width: 1280,
  height: 720,
  deviceScaleFactor: 1,
});
assert.ok(Number.isInteger(matrix.capture.seed));
assert.ok(matrix.capture.repeatCount >= 2);
assert.ok(matrix.capture.fixedFrameCount >= 1);
assert.ok(matrix.capture.capturePrimeCount >= 0);

const requiredDomains = [
  'character',
  'grass',
  'ground',
  'integrated',
  'lighting',
  'manufactured',
  'rock',
  'sky-cloud',
  'tree',
  'water',
];
const fixtureDomains = [...new Set(matrix.fixtures.map((fixture) => fixture.domain))].sort();
assert.deepEqual(fixtureDomains, requiredDomains);

const ids = new Set();
for (const fixture of matrix.fixtures) {
  assert.match(fixture.id, /^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  assert.equal(ids.has(fixture.id), false, `duplicate fixture id ${fixture.id}`);
  ids.add(fixture.id);
  assert.match(fixture.route, /^\//);
  assert.ok(Array.isArray(fixture.cases) && fixture.cases.length > 0,
    `${fixture.id} must enumerate concrete cases`);
  assert.equal(typeof fixture.captureEnabled, 'boolean');
  assert.equal(typeof fixture.releaseEvidence, 'boolean');
  if (fixture.captureFrom) {
    assert.ok(matrix.fixtures.some(({ id }) => id === fixture.captureFrom),
      `${fixture.id} captureFrom must reference a fixture`);
  }
  for (const [axis, values] of Object.entries(fixture.axes ?? {})) {
    assert.ok(values.length > 0, `${fixture.id}.axes.${axis} must not be empty`);
    assert.ok(values.every((value) => matrix.axes[axis].includes(value)),
      `${fixture.id}.axes.${axis} must be a matrix subset`);
  }
  if (!fixture.captureEnabled) {
    assert.ok(
      (fixture.blockers?.length ?? 0) > 0 || (fixture.requiredAssertions?.length ?? 0) > 0,
      `${fixture.id} must explain why capture is not enabled or define its qualification assertions`,
    );
  }
}

const integrated = matrix.fixtures.find((fixture) => fixture.domain === 'integrated');
assert.ok(integrated.captureEnabled, 'the regression fixture must exercise the harness immediately');
assert.equal(integrated.cameraControl?.selector, '#sampleCamera');
assert.equal(integrated.scenarioControl?.selector, '#sampleTimeOfDay');
for (const camera of matrix.axes.cameras) {
  assert.equal(integrated.cameraPoses?.[camera]?.position?.length, 3);
  assert.equal(integrated.cameraPoses?.[camera]?.target?.length, 3);
}
assert.equal(integrated.releaseEvidence, false,
  'the repository Playground must never be counted as independent release evidence');
assert.deepEqual([...integrated.requiredDomains].sort(), [
  'character',
  'grass',
  'ground',
  'lighting',
  'manufactured',
  'rock',
  'sky-cloud',
  'tree',
  'water',
]);

const threshold = matrix.capture.thresholds;
assert.ok(threshold.ssim > 0 && threshold.ssim <= 1);
assert.ok(threshold.meanDeltaE > 0);
assert.ok(threshold.p95DeltaE >= threshold.meanDeltaE);
assert.ok(threshold.pixelRatioAboveDeltaE > 0 && threshold.pixelRatioAboveDeltaE < 1);

console.log(JSON.stringify({
  axes: Object.fromEntries(Object.entries(matrix.axes).map(([key, values]) => [key, values.length])),
  captureEnabled: matrix.fixtures.filter((fixture) => fixture.captureEnabled).map((fixture) => fixture.id),
  fixtureCount: matrix.fixtures.length,
  fixtureDomains,
  schema: matrix.schema,
}, null, 2));
