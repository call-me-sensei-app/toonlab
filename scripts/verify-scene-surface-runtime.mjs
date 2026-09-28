import assert from 'node:assert/strict';

import * as THREE from 'three';

import { createSceneSurfaceRuntime } from '../src/runtime/sceneSurfaceRuntime.js';
import { applyStyleBundle } from '../src/styles/styleApplication.js';
import { CALL_ME_SENSEI_STYLE_BUNDLE } from '../src/styles/styleBundle.js';
import { collectStyleTargets } from '../src/styles/styleTargetDiscovery.js';

const heightAt = (x, z) => 0.2 * Math.sin(x * 0.25) + 0.05 * z;
const surface = createSceneSurfaceRuntime({
  bounds: { min: { x: -10, z: -10 }, max: { x: 10, z: 10 } },
  heightAt,
  waterLevel: 0.1,
});

assert.equal(surface.contains(0, 0), true);
assert.equal(surface.contains(11, 0), false);
assert.throws(
  () => createSceneSurfaceRuntime({ bounds: { minX: 0, minZ: 0, maxX: 2, maxZ: 2 } }),
  /requires heightAt/,
);
assert.throws(
  () => createSceneSurfaceRuntime({
    bounds: { minX: 0, minZ: 0, maxX: 2, maxZ: 2 },
    heightAt: () => Number.NaN,
  }).heightAt(1, 1),
  /non-finite height/,
);

const sourceTexture = new THREE.Texture();
const prop = new THREE.Group();
prop.name = 'Textured review prop';
const propMesh = new THREE.Mesh(
  new THREE.BoxGeometry(2, 2, 2),
  new THREE.MeshStandardMaterial({ map: sourceTexture }),
);
propMesh.castShadow = true;
propMesh.receiveShadow = true;
prop.add(propMesh);
surface.place(prop, { anchor: 'bounds', x: 2, z: 3 });
const groundedBounds = new THREE.Box3().setFromObject(prop);
assert.ok(Math.abs(groundedBounds.min.y - heightAt(2, 3)) < 1e-6);

const adapterTexture = new THREE.Texture();
const adapterProp = new THREE.Group();
adapterProp.name = 'Adapter-preserved textured prop';
const adapterMesh = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshStandardMaterial({ map: adapterTexture }),
);
adapterProp.add(adapterMesh);
surface.place(adapterProp, { anchor: 'bounds', x: -2, z: 2 });
const adapterMaterial = new THREE.MeshBasicMaterial();
adapterMaterial.uniforms = { base: { value: adapterTexture } };
adapterMesh.material.dispose();
adapterMesh.material = adapterMaterial;

const water = surface.createWaterSurface({
  depth: 8,
  maxSegments: 16,
  position: { x: 0, z: -4 },
  segmentsPerMeter: 1,
  width: 12,
});
assert.equal(water.position.y, surface.waterLevel);
assert.equal(water.bedHeightSampler, surface.heightAt);
assert.equal(water.nearshorePhaseEnabled, true);
assert.ok(water.shoreState);
assert.ok(water.volumeSkirt);
assert.equal(surface.waterBodyAt(0, -4)?.water, water);
assert.equal(surface.waterBodyAt(9, 9), null);

const grass = await surface.createGrassField({
  count: 64,
  max: { x: 5, z: 5 },
  min: { x: -5, z: -5 },
  seed: 17,
});
assert.equal(grass.placements.length, 64);
for (const placement of grass.placements) {
  assert.ok(Math.abs(placement.y - heightAt(placement.x, placement.z)) < 1e-9);
  const registeredWater = surface.waterBodyAt(placement.x, placement.z);
  assert.ok(!registeredWater || placement.y > registeredWater.y + 0.12);
}
assert.ok(
  grass.placements.some((placement) => (
    !surface.waterBodyAt(placement.x, placement.z)
    && placement.y <= surface.waterLevel + 0.12
  )),
  'Low dry terrain outside finite water footprints must retain grass.',
);
const labeledScene = new THREE.Scene();
labeledScene.add(water);
const waterDiscovery = collectStyleTargets(labeledScene);
assert.equal(waterDiscovery.ok, true, JSON.stringify(waterDiscovery.issues));
const waterApplication = await applyStyleBundle(CALL_ME_SENSEI_STYLE_BUNDLE, {
  mode: 'strict',
  targets: waterDiscovery.targets,
});
assert.deepEqual(waterApplication.applied.map(({ domain }) => domain), ['water']);
await waterApplication.revert();

const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 4, 4);
const styleRuntime = {
  groundFieldPass: {
    colorSemantics: 'visible-ground-color',
    ready: true,
  },
  shadowPass: {
    ready: true,
    renderCount: 1,
    shadowTexture: new THREE.Texture(),
    casterCoverage: {
      byDomain: {
        character: {
          coveredTargetIds: ['character'],
          eligibleTargetIds: ['character'],
        },
      },
    },
    receiverCoverage: {
      byDomain: {
        'terrain.ground': {
          coveredTargetIds: ['ground'],
          eligibleTargetIds: ['ground'],
        },
      },
    },
  },
};
const ready = surface.audit({
  camera,
  requireShadowDomains: ['character'],
  styleRuntime,
});
assert.equal(ready.ok, true, JSON.stringify(ready.issues));
assert.equal(ready.stats.grassFields, 1);
assert.equal(ready.stats.objectPlacements, 2);
assert.equal(ready.stats.waterBodies, 1);

const unlitGroundFieldFailure = surface.audit({
  camera,
  styleRuntime: {
    ...styleRuntime,
    groundFieldPass: { colorSemantics: 'surface-albedo', ready: true },
  },
});
assert.ok(unlitGroundFieldFailure.issues.some(
  ({ code }) => code === 'ground-field-visible-color-missing',
));

propMesh.material.map = null;
const textureFailure = surface.audit({ camera });
assert.equal(textureFailure.ok, false);
assert.ok(textureFailure.issues.some(({ code }) => code === 'source-texture-lost'));
propMesh.material.map = sourceTexture;

adapterMesh.material.uniforms.base.value = null;
const adapterTextureFailure = surface.audit({ camera });
assert.equal(adapterTextureFailure.ok, false);
assert.ok(adapterTextureFailure.issues.some(({ code }) => code === 'source-texture-lost'));
adapterMesh.material.uniforms.base.value = adapterTexture;

water.position.y += 1;
const waterFailure = surface.audit({ camera });
assert.ok(waterFailure.issues.some(({ code }) => code === 'water-level-mismatch'));
water.position.y = surface.waterLevel;

const shadowFailure = surface.audit({
  camera,
  requireShadowDomains: ['vegetation.tree'],
  styleRuntime,
});
assert.ok(shadowFailure.issues.some(({ code }) => code === 'incomplete-shadow-coverage'));

const unrenderedShadowFailure = surface.audit({
  camera,
  requireShadowDomains: ['character'],
  styleRuntime: {
    shadowPass: {
      ...styleRuntime.shadowPass,
      ready: false,
      renderCount: 0,
      shadowTexture: null,
    },
  },
});
assert.ok(unrenderedShadowFailure.issues.some(({ code }) => code === 'shadow-pass-not-rendered'));

camera.lookAt(0, -10, 0);
camera.updateMatrixWorld(true);
const hiddenSkyFailure = surface.audit({ camera, requireVisibleSky: true });
assert.ok(hiddenSkyFailure.issues.some(({ code }) => code === 'sky-outside-review-frustum'));
camera.lookAt(0, 4, 0);
camera.updateMatrixWorld(true);
const visibleSkyReady = surface.audit({ camera, requireVisibleSky: true });
assert.ok(!visibleSkyReady.issues.some(({ code }) => code === 'sky-outside-review-frustum'));

grass.dispose();
water.dispose();
propMesh.geometry.dispose();
propMesh.material.dispose();
sourceTexture.dispose();
adapterMesh.geometry.dispose();
adapterMesh.material.dispose();
adapterTexture.dispose();
styleRuntime.shadowPass.shadowTexture.dispose();

console.log('Scene surface runtime verification passed.');
