import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import * as THREE from 'three';

import {
  clearEnvironmentCloudShadowPass,
  environmentCloudShadow,
  syncEnvironmentCloudShadowPass,
} from '../src/sky/cloudShadow.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = async (path) => readFile(`${root}/${path}`, 'utf8');

const receiverSources = Object.freeze([
  'src/environment/toonLabSurfaceLighting.js',
  'src/environment/urbanPropMaterial.js',
  'src/ground-shader/groundShaderMaterial.js',
  'src/shaders-tsl/character/characterMaterial.js',
  'src/shaders-tsl/environment.js',
  'src/shaders-tsl/flower.js',
  'src/shaders-tsl/grass.js',
  'src/shaders-tsl/tree-leaf.js',
  'src/shaders-tsl/water-breaker.js',
  'src/shaders-tsl/water.js',
  'src/shaders-tsl/woody-surface.js',
  'src/water/waterShoreMaterial.js',
]);

for (const path of receiverSources) {
  const text = await source(path);
  assert.match(
    text,
    /sampleEnvironmentCloudShadow/,
    `${path} must consume the Sky System's authoritative cloud-shadow projection`,
  );
}

for (const path of [
  'src/environment/toonLabSurfaceLighting.js',
  'src/environment/urbanPropMaterial.js',
  'src/ground-shader/groundShaderMaterial.js',
  'src/shaders-tsl/character/characterMaterial.js',
  'src/shaders-tsl/water-breaker.js',
  'src/shaders-tsl/water.js',
  'src/shaders-tsl/woody-surface.js',
  'src/water/waterShoreMaterial.js',
]) {
  const text = await source(path);
  assert.match(
    text,
    /sampleEnvironmentSunShadow/,
    `${path} must consume the shared sun-shadow projection`,
  );
}

const water = await source('src/shaders-tsl/water.js');
assert.match(water, /foamTint\.mulAssign\(mix\([\s\S]*sceneShadow/,
  'Water foam must be attenuated after its foam color is composed');
assert.match(water, /sparkles[\s\S]*sunVisibility/,
  'Water sparkles must be gated by direct-sun visibility');

const shore = await source('src/water/waterShoreMaterial.js');
assert.match(shore, /shadowedFoamColor/,
  'Persistent shoreline foam must use a shadowed foam color');
assert.match(shore, /projectedWaterCaustics[\s\S]*mul\(receiverVisibility\)/,
  'Projected shore caustics must disappear with direct sun');

const breaker = await source('src/shaders-tsl/water-breaker.js');
assert.match(breaker, /foamTint[\s\S]*receiverVisibility/,
  'Breaker foam must use the shared receiver visibility');

const sceneStyleRuntime = await source('src/styles/sceneStyleRuntime.js');
assert.match(sceneStyleRuntime, /sky-system-volumetric-transmittance/,
  'Scene diagnostics must distinguish the real Sky System transmittance map from procedural fallbacks');
assert.match(sceneStyleRuntime, /environmentCloudShadow\.map\.value\?\.name/,
  'Scene diagnostics must publish the bound cloud-shadow texture identity');

const texture = new THREE.DataTexture(new Uint8Array([64, 64, 64, 255]), 1, 1);
texture.name = 'ToonLabCloudShadowMap';
const pass = {
  projection: {
    axisU: { value: new THREE.Vector3(0, 0, 1) },
    axisV: { value: new THREE.Vector3(1, 0, 0) },
    center: { value: new THREE.Vector3(12, 3, -4) },
    enabled: { value: 1 },
    extent: { value: 1800 },
    intensity: { value: 0.72 },
  },
  texture,
};
assert.equal(syncEnvironmentCloudShadowPass(pass), true);
assert.equal(environmentCloudShadow.ready.value, true);
assert.equal(environmentCloudShadow.map.value, texture);
assert.deepEqual(environmentCloudShadow.center.value.toArray(), [12, 3, -4]);
assert.equal(environmentCloudShadow.extent.value, 1800);
assert.equal(environmentCloudShadow.intensity.value, 0.72);
assert.equal(clearEnvironmentCloudShadowPass(pass), true);
assert.equal(environmentCloudShadow.ready.value, false);
assert.notEqual(environmentCloudShadow.map.value, texture);

console.log(`Shared shadow receiver contract verified across ${receiverSources.length} material paths.`);
