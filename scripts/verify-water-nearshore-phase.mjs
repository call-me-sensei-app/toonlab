import assert from 'node:assert/strict';

import {
  buildNearshorePhaseField,
  sampleNearshorePhaseField,
  solveFiniteDepthWaveNumber,
} from '../src/water/waterNearshorePhase.js';
import { sampleGerstnerHeight } from '../src/water/waterSettings.js';
import { WaterSurface } from '../src/water/waterSurface.js';

const close = (actual, expected, tolerance, message) => {
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: expected ${expected}, received ${actual}`);
};

// Newton solve obeys finite-depth dispersion and converges to deep k0.
for (const wavelength of [4.2, 9, 13, 40]) {
  const k0 = 2 * Math.PI / wavelength;
  let previous = Infinity;
  for (const depth of [0.05, 0.2, 0.5, 1, 2, 4, 20, 100]) {
    const k = solveFiniteDepthWaveNumber(k0, depth);
    close(k * Math.tanh(k * depth), k0, 1e-8, 'dispersion residual');
    assert.ok(k <= previous + 1e-9, 'wavenumber must fall as water deepens');
    previous = k;
  }
  close(solveFiniteDepthWaveNumber(k0, 100), k0, 1e-6, 'deep-water limit');
  close(solveFiniteDepthWaveNumber(k0, Infinity), k0, 0, 'infinite-depth limit');
}

const columns = 33;
const rows = 81;
const originX = -8;
const originZ = -20;
const stepX = 0.5;
const stepZ = 0.5;
const directionLength = Math.hypot(0.34, 0.94);
const directionX = 0.34 / directionLength;
const directionZ = 0.94 / directionLength;
const k0 = 2 * Math.PI / 9;

const deepDepths = new Float32Array(columns * rows).fill(50);
const deepField = buildNearshorePhaseField({
  restDepths: deepDepths,
  columns,
  rows,
  originX,
  originZ,
  stepX,
  stepZ,
  directionX,
  directionZ,
  deepWaveNumber: k0,
});
for (const [ix, iz] of [[0, 0], [16, 40], [32, 80]]) {
  const index = iz * columns + ix;
  const x = originX + ix * stepX;
  const z = originZ + iz * stepZ;
  close(deepField.phaseCoordinate[index], directionX * x + directionZ * z, 2e-5,
    'uniform deep water must preserve the original phase');
  close(deepField.waveVector[index * 2], directionX, 2e-5,
    'uniform deep-water wave-vector x');
  close(deepField.waveVector[index * 2 + 1], directionZ, 2e-5,
    'uniform deep-water wave-vector z');
}

// A planar beach becomes shallower along +Z. The alongshore wave-number
// component stays nearly constant while the cross-shore component grows, so
// the wave turns toward the beach normal and its wavelength contracts.
const beachDepths = new Float32Array(columns * rows);
for (let iz = 0; iz < rows; iz += 1) {
  const depth = 4 - iz / (rows - 1) * 3.8;
  for (let ix = 0; ix < columns; ix += 1) beachDepths[iz * columns + ix] = depth;
}
const beachField = buildNearshorePhaseField({
  restDepths: beachDepths,
  columns,
  rows,
  originX,
  originZ,
  stepX,
  stepZ,
  directionX,
  directionZ,
  deepWaveNumber: k0,
});
assert.equal(beachField.incidentAxis, 'z', 'auto mode must keep the planar beach offshore edge');
assert.equal(beachField.invalidCount, 0, 'smooth planar beach must stay inside mild-slope validity');
const offshore = sampleNearshorePhaseField(beachField, 0, originZ + stepZ * 3);
const inshore = sampleNearshorePhaseField(beachField, 0, originZ + stepZ * (rows - 4));
const offshoreMagnitude = Math.hypot(offshore.waveVectorX, offshore.waveVectorZ);
const inshoreMagnitude = Math.hypot(inshore.waveVectorX, inshore.waveVectorZ);
assert.ok(inshoreMagnitude > offshoreMagnitude * 1.8,
  'finite-depth wavelength must contract substantially near shore');
assert.ok(Math.abs(inshore.waveVectorX / inshoreMagnitude) <
  Math.abs(offshore.waveVectorX / offshoreMagnitude),
  'oblique swell must refract toward the shore normal');
close(inshore.waveVectorX, directionX, 2e-4,
  'planar beach must conserve the alongshore wave-number component');

const inshoreIndex = (rows - 4) * columns + 16;
close(
  Math.hypot(
    beachField.waveVector[inshoreIndex * 2],
    beachField.waveVector[inshoreIndex * 2 + 1],
  ),
  beachField.waveNumberRatio[inshoreIndex],
  1e-2,
  'phase gradient must match the capped finite-depth wave-number ratio',
);

// The same invariant must hold for an X-major, +X-traveling beach.
const xBeachDepths = new Float32Array(columns * rows);
for (let iz = 0; iz < rows; iz += 1) {
  for (let ix = 0; ix < columns; ix += 1) {
    xBeachDepths[iz * columns + ix] = 4 - ix / (columns - 1) * 3.8;
  }
}
const xDirectionLength = Math.hypot(0.94, 0.34);
const xDirectionX = 0.94 / xDirectionLength;
const xDirectionZ = 0.34 / xDirectionLength;
const xBeachField = buildNearshorePhaseField({
  restDepths: xBeachDepths,
  columns,
  rows,
  originX,
  originZ,
  stepX,
  stepZ,
  directionX: xDirectionX,
  directionZ: xDirectionZ,
  deepWaveNumber: k0,
});
const xInshore = sampleNearshorePhaseField(
  xBeachField,
  originX + stepX * (columns - 3),
  0,
);
close(xInshore.waveVectorZ, xDirectionZ, 2e-4,
  'X-major beach must conserve its alongshore wave-number component');
assert.ok(Math.hypot(xInshore.waveVectorX, xInshore.waveVectorZ) > 1.5,
  'X-major beach must contract wavelength near shore');

// Reversing propagation and bathymetry must produce the same physical result.
const reverseDepths = new Float32Array(columns * rows);
for (let iz = 0; iz < rows; iz += 1) {
  const depth = 0.2 + iz / (rows - 1) * 3.8;
  for (let ix = 0; ix < columns; ix += 1) reverseDepths[iz * columns + ix] = depth;
}
const reverseField = buildNearshorePhaseField({
  restDepths: reverseDepths,
  columns,
  rows,
  originX,
  originZ,
  stepX,
  stepZ,
  directionX,
  directionZ: -directionZ,
  deepWaveNumber: k0,
});
const reverseInshore = sampleNearshorePhaseField(reverseField, 0, originZ + stepZ * 3);
close(reverseInshore.waveVectorX, directionX, 2e-4,
  'negative-direction beach must conserve its alongshore wave-number component');
assert.ok(reverseInshore.waveVectorZ < -1,
  'negative-direction beach must keep the incoming propagation sign');

// A beach must not pop when incidence crosses the old X/Z marching threshold.
const buildAtDegrees = (degrees) => {
  const radians = degrees * Math.PI / 180;
  return buildNearshorePhaseField({
    restDepths: beachDepths,
    columns,
    rows,
    originX,
    originZ,
    stepX,
    stepZ,
    directionX: Math.cos(radians),
    directionZ: Math.sin(radians),
    deepWaveNumber: k0,
  });
};
const below45 = sampleNearshorePhaseField(buildAtDegrees(44.99), 0, originZ + stepZ * (rows - 4));
const above45 = sampleNearshorePhaseField(buildAtDegrees(45.01), 0, originZ + stepZ * (rows - 4));
assert.ok(Math.abs(below45.phaseCoordinate - above45.phaseCoordinate) < 0.01,
  'phase field must stay continuous across 45-degree incidence');
assert.ok(Math.hypot(
  below45.waveVectorX - above45.waveVectorX,
  below45.waveVectorZ - above45.waveVectorZ,
) < 0.01, 'wave vector must stay continuous across 45-degree incidence');

const belowOldScoreCrossing = sampleNearshorePhaseField(
  buildAtDegrees(39.070), 0, originZ + stepZ * (rows - 4),
);
const aboveOldScoreCrossing = sampleNearshorePhaseField(
  buildAtDegrees(39.075), 0, originZ + stepZ * (rows - 4),
);
assert.ok(Math.abs(
  belowOldScoreCrossing.phaseCoordinate - aboveOldScoreCrossing.phaseCoordinate,
) < 0.01, 'incident-edge selection must not pop at the former angle-weighted score crossing');

// Out-of-grid CPU queries continue the edge phase instead of becoming flat.
const edge = sampleNearshorePhaseField(deepField, originX + (columns - 1) * stepX, 0);
const outside = sampleNearshorePhaseField(deepField, originX + (columns + 3) * stepX, 0);
assert.ok(Math.abs(outside.phaseCoordinate - edge.phaseCoordinate) > 0.5,
  'phase must continue beyond the CPU atlas boundary');

// Translating an otherwise identical static grid changes q only by D dot T;
// moving/rebaking an axis-aligned water body therefore preserves world phase.
const shiftX = 11;
const shiftZ = -7;
const translated = buildNearshorePhaseField({
  restDepths: beachDepths,
  columns,
  rows,
  originX: originX + shiftX,
  originZ: originZ + shiftZ,
  stepX,
  stepZ,
  directionX,
  directionZ,
  deepWaveNumber: k0,
});
const expectedShift = directionX * shiftX + directionZ * shiftZ;
for (const index of [0, Math.floor(columns * rows / 2), columns * rows - 1]) {
  close(translated.phaseCoordinate[index] - beachField.phaseCoordinate[index], expectedShift, 3e-5,
    'world translation phase shift');
}

// CPU buoyancy mirror consumes the same blended q coordinate for dominant
// slots while leaving short chop on its original plane phase.
const probeWaves = [
  { amplitude: 0.7, dirX: directionX, dirZ: directionZ, omega: 1.4, phase: 0.2, waveNumber: k0 },
  { amplitude: 0.25, dirX: directionX, dirZ: directionZ, omega: 1.6, phase: -0.5, waveNumber: k0 * 1.1 },
  { amplitude: 0.18, dirX: -0.6, dirZ: 0.8, omega: 2.3, phase: 0.8, waveNumber: k0 * 2 },
];
const phaseProbe = sampleNearshorePhaseField(beachField, 1.25, 16);
phaseProbe.blend = 0.65;
const probeTime = 2.4;
const probeChop = 0.3;
const mirroredHeight = sampleGerstnerHeight(
  probeWaves,
  1.25,
  16,
  probeTime,
  probeChop,
  phaseProbe,
);
const expectedHeight = probeWaves.reduce((sum, wave, index) => {
  const baseCoordinate = wave.dirX * 1.25 + wave.dirZ * 16;
  const coordinate = index < 2
    ? baseCoordinate + (phaseProbe.phaseCoordinate - baseCoordinate) * phaseProbe.blend
    : baseCoordinate;
  return sum + wave.amplitude * (index < 2 ? 1 : probeChop) * Math.sin(
    wave.waveNumber * coordinate - wave.omega * probeTime + wave.phase,
  );
}, 0);
close(mirroredHeight, expectedHeight, 1e-12, 'CPU blended nearshore phase mirror');

// WaterSurface integration: bake from the existing bed grid, pack one vec3
// per vertex, keep the explicit Z incident edge, and phase-lock swash to the
// physical crest at the z=0 rest shoreline.
const integrationSurface = new WaterSurface({
  width: 20,
  depth: 20,
  segmentsPerMeter: 1,
  maxSegments: 20,
  simulation: false,
  splashes: false,
  passes: false,
  bedHeight: (_x, z) => 0.36 + z * 0.05,
  nearshorePhase: { incidentAxis: 'z', referenceX: 0, referenceZ: 0 },
  preset: 'coast',
  runupDistance: 10,
  waveDirection: [0.34, 0.94],
  waterLevel: 0.36,
});
integrationSurface.position.y = 0.36;
integrationSurface.bakeShoalingDepths();
assert.equal(integrationSurface.nearshorePhaseStatus.active, true,
  'WaterSurface must activate the phase field on a smooth explicit-runup beach');
assert.equal(integrationSurface.nearshorePhaseStatus.incidentAxis, 'z',
  'WaterSurface must retain the authored Beach incident axis');
assert.equal(integrationSurface.nearshorePhaseStatus.slotMask, 2,
  'an enabled same-direction set beat must share the primary phase field');
assert.equal(
  integrationSurface.geometry.attributes.aNearshorePhase.count,
  integrationSurface.geometry.attributes.position.count,
  'packed phase attribute must cover every water vertex',
);
assert.equal(integrationSurface.geometry.attributes.aNearshorePhase.itemSize, 4,
  'packed phase attribute must include an explicit activation channel');
assert.ok(
  Math.abs(integrationSurface.nearshorePhaseReference.directionX) <
    Math.abs(integrationSurface.gerstnerWaves[0].dirX),
  'shoreline phase direction must refract toward the cross-shore normal',
);
const integrationPrimary = integrationSurface.gerstnerWaves[0];
const shorelineCrestTime = (
  integrationPrimary.waveNumber * integrationSurface.nearshorePhaseReference.phaseCoordinate +
  integrationPrimary.phase - Math.PI * 0.5
) / integrationPrimary.omega;
const lockedFrame = integrationSurface.sampleSwashFrame(shorelineCrestTime, 10);
assert.ok(Math.min(lockedFrame.cycle, 1 - lockedFrame.cycle) < 1e-7,
  'swash cycle zero must coincide with the refracted shoreline crest');

// With set beating disabled, slot 1 is an ordinary spectrum component. Even
// at zero spread (where it happens to align), it must retain its own plane
// phase and must not influence the reference k used to bake slot 0.
for (const spread of [0, 0.1, 0.6, 1]) {
  integrationSurface.applySettings({
    waveDirectionSpread: spread,
    waveSetStrength: 0,
  });
  integrationSurface.bakeShoalingDepths();
  const waves = integrationSurface.gerstnerWaves;
  assert.equal(integrationSurface.nearshorePhaseStatus.slotMask, 1,
    `waveSetStrength=0 must keep slot 1 on plane phase at spread ${spread}`);
  close(
    integrationSurface.nearshorePhaseField.deepWaveNumber,
    waves[0].waveNumber,
    1e-12,
    `slot 1 must not enter reference k at spread ${spread}`,
  );
  const x = 2.25;
  const z = -5;
  const time = 0.73;
  const restDepth = 0.36 - (0.36 + z * 0.05);
  const nearshore = integrationSurface.sampleNearshoreAt(x, z, restDepth);
  assert.equal(nearshore.slotMask, 1, `CPU slot mask at spread ${spread}`);
  const primaryBase = waves[0].dirX * x + waves[0].dirZ * z;
  const primaryCoordinate = primaryBase +
    (nearshore.phaseCoordinate - primaryBase) * nearshore.blend;
  assert.ok(Math.abs(primaryCoordinate - primaryBase) > 0.1,
    `slot 0 must remain refracted at spread ${spread}`);
  const secondaryCoordinate = waves[1].dirX * x + waves[1].dirZ * z;
  const expectedDominantHeight =
    waves[0].amplitude * Math.sin(
      waves[0].waveNumber * primaryCoordinate - waves[0].omega * time + waves[0].phase,
    ) +
    waves[1].amplitude * Math.sin(
      waves[1].waveNumber * secondaryCoordinate - waves[1].omega * time + waves[1].phase,
    );
  close(
    sampleGerstnerHeight(waves, x, z, time, 0, nearshore),
    expectedDominantHeight,
    1e-12,
    `slot 1 plane-phase CPU mirror at spread ${spread}`,
  );
}
integrationSurface.setNearshorePhase(false);
assert.equal(integrationSurface.nearshorePhaseField, null,
  'disabling nearshore phase must drop the active CPU field');
assert.ok(integrationSurface.geometry.attributes.aNearshorePhase.array.every(
  (value, index) => index % 4 !== 3 || value === 0,
), 'disabled stages must zero the slot mask instead of coercing slot 1 to slot 0 phase');
integrationSurface.dispose();

console.log('Water nearshore phase verification passed.');
