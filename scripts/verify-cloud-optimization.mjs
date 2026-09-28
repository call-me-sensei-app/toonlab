import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NodeMaterial } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { createCloudParams } from '../src/cloud/cloudParams.js';
import { createCloudReprojection } from '../src/cloud/cloudReprojection.js';
import { createCloudTextureCache, getCloudTextureCacheStats } from '../src/cloud/noise/textureCache.js';
import { getCloudBaseShapeVolume, createCloudBaseShapeData } from '../src/cloud/noise/baseShapeVolume.js';
import { SkySystem } from '../src/sky/skySystem.js';

const cache = createCloudTextureCache('optimization-test');
const first = new THREE.DataTexture(new Uint8Array(4), 1, 1);
let disposed = false;
first.addEventListener('dispose', () => { disposed = true; });
cache.set('first', first);
for (let index = 0; index < 80; index++) {
  cache.set(index, new THREE.DataTexture(new Uint8Array(4), 1, 1));
}
assert.ok(getCloudTextureCacheStats().retainedEntries <= 32);
assert.ok(getCloudTextureCacheStats().retainedBytes <= 64 * 1024 * 1024);
assert.equal(disposed, false, 'Eviction must not dispose a texture held by a live host');
assert.equal(cache.get('first'), first, 'Live identity survives eviction');
first.dispose();
assert.equal(cache.get('first'), undefined, 'Disposed textures cannot be reused');
for (const texture of cache.values()) texture.dispose();
cache.clear();

const canonical = getCloudBaseShapeVolume({ dims: 16, seed: 1 });
for (let seed = 2; seed <= 40; seed++) {
  assert.equal(getCloudBaseShapeVolume({ dims: 16, seed }), canonical);
}
assert.deepEqual(createCloudBaseShapeData({ dims: 16, seed: 123 }).data, canonical.image.data);

const cloud = createCloudParams();
const material = new NodeMaterial();
const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100000);
const renderer = { target: null, getRenderTarget() { return this.target; },
  setRenderTarget(value) { this.target = value; }, render() {} };
const history = createCloudReprojection({ shape: cloud.shape, wind: cloud.wind,
  cloudMaterial: material, cloudUniforms: { pixelJitter: uniform(new THREE.Vector2()), marchJitter: uniform(0) },
  width: 128, height: 128 });
history.render(renderer, camera);
cloud.wind.offset.value.set(12, 0, -3);
history.render(renderer, camera);
assert.deepEqual(history.uniforms.windDelta.value.toArray(), [12, 0, -3]);
assert.equal(history.uniforms.cameraStatic.value, 0, 'Stationary camera does not mean stationary cloud');
history.render(renderer, camera);
assert.equal(history.uniforms.cameraStatic.value, 1);
cloud.wind.evolutionOffset.value.z += 1;
history.render(renderer, camera);
assert.equal(history.uniforms.cameraStatic.value, 0, 'Evolution also invalidates static history');
cloud.wind.offset.value.x += 1000;
history.render(renderer, camera);
assert.equal(history.framesSinceReset, 1, 'Large field jumps invalidate history');
history.dispose(); material.dispose();

// Real runtime wiring; no GPU render is needed for ownership/contract checks.
const sky = new SkySystem({ renderer: { render() {}, getPixelRatio() { return 1; },
  getDrawingBufferSize(target) { return target.set(128, 128); } },
  scene: new THREE.Scene(), camera, quality: 'low' });
assert.equal(sky.cloudShadowsEnabled, true);
const map = new THREE.DataTexture(new Float32Array([500]), 1, 1, THREE.RedFormat, THREE.FloatType);
sky.setSceneDepthTexture(map);
assert.equal(sky.cloud.uniforms.sceneDepthEnabled.value, 1);
assert.equal(sky.cloud.sceneDepthNode.value, map);
assert.equal(sky.backdrops.at(-1).material.depthTest, false);
assert.throws(() => sky.setSceneDepthTexture(new THREE.DepthTexture()), /linear view-distance/);
sky.setSceneDepthTexture(null);
assert.equal(sky.cloud.uniforms.sceneDepthEnabled.value, 0);
assert.equal(sky.backdrops.at(-1).material.depthTest, true);
let hostDisposed = false;
map.addEventListener('dispose', () => { hostDisposed = true; });
sky.setSceneDepthTexture(map);
sky.dispose();
assert.equal(hostDisposed, false);
map.dispose();
console.log('Cloud optimization verified: bounded retention, canonical sharing, moving-field history, and host-owned depth input.');
