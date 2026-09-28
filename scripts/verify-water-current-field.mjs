import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';

import {
  WaterCurrentField,
  WaterShoreStateField,
  WaterSurface,
} from '../src/water/index.js';

const close = (actual, expected, tolerance, label) => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `${label}: expected ${expected}, received ${actual}`,
  );
};

const constant = new WaterCurrentField({
  region: { centerX: 5, centerZ: -2, width: 10, depth: 6 },
  resolution: { x: 10, y: 6 },
  velocity: [1.25, -0.75],
  maxSpeed: 4,
});
assert.deepEqual(constant.sampleAt(5, -2).toArray(), [1.25, -0.75]);
assert.deepEqual(constant.sampleAt(-1, -2).toArray(), [0, 0]);
assert.deepEqual(constant.getRegion().toArray(), [5, -2, 5, 3]);
assert.equal(constant.texture.type, THREE.UnsignedByteType);
assert.equal(constant.texture.minFilter, THREE.LinearFilter);

// Byte 128 is reserved as exact zero. A generic UNORM 0.5 mapping would
// decode still water to a small positive velocity on the GPU.
const still = new WaterCurrentField({
  region: { width: 2, depth: 2 },
  resolution: 2,
  velocity: [0, 0],
});
assert.deepEqual([...still.encodedData.slice(0, 2)], [128, 128]);

// Bilinear CPU queries reconstruct linear authored flow between texel centers.
const linear = new WaterCurrentField({
  region: { centerX: 0, centerZ: 0, width: 8, depth: 8 },
  resolution: 8,
  maxSpeed: 8,
  velocitySampler: (x, z, out) => out.set(0.2 * x + 1, -0.15 * z + 0.4),
});
const linearSample = linear.sampleAt(0.25, -0.75);
close(linearSample.x, 1.05, 1e-6, 'bilinear x velocity');
close(linearSample.y, 0.5125, 1e-6, 'bilinear z velocity');
linear.setStrength(-0.5);
const reversed = linear.sampleAt(0.25, -0.75);
close(reversed.x, -0.525, 1e-6, 'cheap tidal reversal x');
close(reversed.y, -0.25625, 1e-6, 'cheap tidal reversal z');

// A time-aware sampler can be rebaked for a nonlinear tidal phase.
const timed = new WaterCurrentField({
  region: { width: 4, depth: 4 },
  resolution: 4,
  velocitySampler: (x, z, out, context) => out.set(context.time, -context.time),
  time: 0.25,
});
assert.deepEqual(timed.sampleAt(0, 0).toArray(), [0.25, -0.25]);
timed.setTime(0.75);
assert.deepEqual(timed.sampleAt(0, 0).toArray(), [0.75, -0.75]);

// Domain masks and signed-distance obstacles are independent inputs. The
// boundary projection removes velocity aimed into x<=0 while keeping the
// tangential component; it does not invent an around-obstacle solution.
const obstacle = new WaterCurrentField({
  region: { width: 4, depth: 4 },
  resolution: 32,
  velocity: [-2, 0.8],
  signedDistanceSampler: (x) => x,
  obstacleInfluence: 0.8,
  obstacleDeflection: 1,
  preserveTangentialSpeed: 0,
  maxSpeed: 4,
});
assert.equal(obstacle.sampleWeightAt(-0.5, 0), 0, 'solid cells have zero weight');
const nearObstacle = obstacle.sampleAt(0.08, 0);
assert.ok(nearObstacle.x > -0.35, `inward current must be projected, got ${nearObstacle.x}`);
assert.ok(nearObstacle.y > 0.25, 'tangential current must survive boundary projection');
const farFromObstacle = obstacle.sampleAt(1.5, 0);
close(farFromObstacle.x, -2, 1e-6, 'far-field authored velocity');
close(farFromObstacle.y, 0.8, 1e-6, 'far-field authored tangent');

const masked = new WaterCurrentField({
  region: { width: 4, depth: 4 },
  resolution: 16,
  velocity: [1, 0],
  maskSampler: (x, z) => (z > 0 ? 1 : 0),
});
assert.ok(masked.sampleAt(0, 1).x > 0.99);
assert.equal(masked.sampleAt(0, -1).x, 0);

// Shore-state transport receives the same texture/region/scale without adding
// variables to the main visible-water shader.
const shore = new WaterShoreStateField({
  region: { width: 8, depth: 8 },
  resolution: 16,
  bedHeightSampler: () => 0,
  currentField: linear,
});
assert.equal(shore.material.uniforms.uCurrentMap.value, linear.texture);
assert.equal(shore.material.uniforms.uUseCurrentMap.value, 1);
assert.deepEqual(
  shore.material.uniforms.uCurrentRegion.value.toArray(),
  linear.region.toArray(),
);
linear.setStrength(0.35);
shore.syncCurrentFieldUniforms();
close(shore.material.uniforms.uCurrentStrength.value, 0.35, 0, 'GPU tide strength');
shore.setCurrentField(null);
assert.equal(shore.material.uniforms.uUseCurrentMap.value, 0);

// Ground switches update one static bed texture in place. This is both
// bounded-memory and safe with a pending WebGPU command encoder: no old GPU
// texture is destroyed during the switch.
const persistentBedTexture = shore.bedTexture;
const persistentBedData = shore.bedTexture.image.data;
for (let i = 0; i < 20; i += 1) {
  shore.setBedHeightSampler(() => i * 0.01);
  assert.equal(shore.bedTexture, persistentBedTexture);
  assert.equal(shore.bedTexture.image.data, persistentBedData);
}
assert.equal('retiredBedTextures' in shore, false);
close(shore.bedTexture.image.data[0], 0.19, 1e-6, 'latest bed bake reaches texture');

// WaterSurface exposes authored-only and total-flow queries. External fields
// stay caller-owned; config-created fields are disposed with their surface.
const surface = new WaterSurface({
  width: 8,
  depth: 8,
  segmentsPerMeter: 2,
  simulation: false,
  splashes: false,
  passes: false,
  currentField: constant,
});
assert.deepEqual(surface.getCurrentAt(5, -2).toArray(), [1.25, -0.75]);
assert.deepEqual(surface.getFlowAt(5, -2).toArray(), [1.25, -0.75]);
surface.dispose();
assert.equal(constant.disposed, false, 'external current field remains caller-owned');

const ownedSurface = new WaterSurface({
  width: 4,
  depth: 4,
  segmentsPerMeter: 4,
  simulation: false,
  splashes: false,
  passes: false,
  currentField: { resolution: 8, velocity: [0.4, 0.2] },
});
const ownedField = ownedSurface.currentField;
ownedSurface.dispose();
assert.equal(ownedField.disposed, true, 'surface-owned current field is disposed');

const mainWaterSource = readFileSync(
  new URL('../src/shaders-tsl/water.js', import.meta.url),
  'utf8',
);
const stateSource = readFileSync(
  new URL('../src/shaders-tsl/water-shore-state-simulation.js', import.meta.url),
  'utf8',
);
assert.equal(mainWaterSource.includes('uCurrentMap'), false,
  'main visible-water shader must not absorb the current atlas');
assert.ok(stateSource.includes('const spatialCurrent =') &&
  stateSource.includes('encodedCurrent.rg.mul(255.0).sub(128.0).div(127.0)') &&
  stateSource.includes('.add(spatialCurrent.mul(instantWet))'));

shore.dispose();
constant.dispose();
linear.dispose();
timed.dispose();
obstacle.dispose();
masked.dispose();
still.dispose();

console.log('Water current field verification passed.');
