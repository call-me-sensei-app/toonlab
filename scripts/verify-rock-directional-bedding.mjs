#!/usr/bin/env node

import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  createRockShaderMaterial,
  createRockShaderSettings,
  describeToonLabDirectionalBeddingProjection,
  normalizeToonLabRockProfile,
  rockShaderSettingsToProfile,
} from '../src/rock-shader/index.js';
import {
  C8_FIRST12_ASSET_IDS,
  C8_FIRST12_ASSET_SURFACE_BINDINGS,
  C8_FIRST12_LITHOLOGY_PROFILES,
  C8_FIRST12_MAP_ROLES,
  C8_FIRST12_SURFACE_VERSION,
  createC8First12SurfaceSpecification,
} from '../src/rockgen/experimental/geology-v2/surface/c8First12Surface.node.js';
import {
  C8_FIRST100_ASSET_IDS,
  C8_FIRST100_ASSET_SURFACE_BINDINGS,
  C8_FIRST100_COMPOSITE_PROFILE_IDS,
  C8_FIRST100_SURFACE_VERSION,
  createC8First100SurfaceSpecification,
} from '../src/rockgen/experimental/geology-v2/surface/c8First100Surface.node.js';
import {
  applyCatalogGeologySurface,
  disposeCatalogC7SurfaceCache,
} from '../labs/rock-generation-lab/ui/c7CatalogSurface.js';

const defaults = createRockShaderSettings();
assert.equal(defaults.projection.mode, 'triplanar');
assert.equal(defaults.projection.upAxis, 'y');
assert.equal(defaults.projection.sideOnly, false);

const legacySideOnly = rockShaderSettingsToProfile({ projection: { sideOnly: true } });
assert.equal(legacySideOnly.base.mode, 'triplanar');
assert.equal(legacySideOnly.base.sideOnly, true);
assert.equal(legacySideOnly.base.upAxis, 'y');

const invalid = createRockShaderSettings({
  projection: { mode: 'cylindrical', upAxis: 'q' },
});
assert.equal(invalid.projection.mode, 'triplanar');
assert.equal(invalid.projection.upAxis, 'y');
assert.equal(normalizeToonLabRockProfile({
  base: { mode: 'cylindrical', upAxis: 'q' },
}).base.mode, 'triplanar');
assert.equal(normalizeToonLabRockProfile({
  base: { mode: 'cylindrical', upAxis: 'q' },
}).base.upAxis, 'y');

for (const upAxis of ['x', 'y', 'z']) {
  const descriptor = describeToonLabDirectionalBeddingProjection(upAxis);
  assert.equal(descriptor.upAxis, upAxis);
  assert.equal(descriptor.suppressedProjectionAxis, upAxis);
  assert.equal(descriptor.lateral.length, 2);
  assert(descriptor.lateral.every(({ faceAxis, uv }) => faceAxis !== upAxis
    && uv.length === 2
    && uv[1] === upAxis));
}
assert.deepEqual(
  describeToonLabDirectionalBeddingProjection('y').lateral.map(({ uv }) => uv),
  ['zy', 'xy'],
);
assert.equal(
  describeToonLabDirectionalBeddingProjection('invalid').upAxis,
  'y',
);

// Synthetic top-facing stripe: the forbidden XZ sample is deliberately made
// obvious. Directional Y-up uses only ZY and XY, and splits abs(ny) equally
// between them, so the result is 0.5 rather than the sentinel 99.
const syntheticSamples = { xy: 1, xz: 99, zy: 0 };
const yDescriptor = describeToonLabDirectionalBeddingProjection('y');
const syntheticTopResult = yDescriptor.lateral.reduce(
  (sum, { uv }) => sum + (syntheticSamples[uv] * 0.5),
  0,
);
assert.equal(syntheticTopResult, 0.5);
assert(!yDescriptor.lateral.some(({ uv }) => uv === 'xz'));

function specificationFor(factory, assetId) {
  return factory({
    assetId,
    editedBoundsMetres: [1.2, 2.4, 1.8],
    geometrySha256: 'a'.repeat(64),
    mapResolution: 1024,
  });
}

const compositeProfileIds = new Set(C8_FIRST100_COMPOSITE_PROFILE_IDS);
for (const [ids, bindings, factory, version, expectedVersion] of [
  [
    C8_FIRST12_ASSET_IDS,
    C8_FIRST12_ASSET_SURFACE_BINDINGS,
    createC8First12SurfaceSpecification,
    C8_FIRST12_SURFACE_VERSION,
    2,
  ],
  [
    C8_FIRST100_ASSET_IDS,
    C8_FIRST100_ASSET_SURFACE_BINDINGS,
    createC8First100SurfaceSpecification,
    C8_FIRST100_SURFACE_VERSION,
    3,
  ],
]) {
  assert.equal(version, expectedVersion);
  for (const assetId of ids) {
    if (compositeProfileIds.has(bindings[assetId].profileId)) {
      assert.equal(bindings[assetId].requiresSemanticRegions, true);
      assert.throws(
        () => specificationFor(factory, assetId),
        /requires semantic regions.*homogeneous synthesis is forbidden/u,
        `${assetId}: composite directional specification must fail closed`,
      );
      continue;
    }
    const specification = specificationFor(factory, assetId);
    const bedded = Boolean(C8_FIRST12_LITHOLOGY_PROFILES[bindings[assetId].profileId].strata);
    assert.equal(specification.projection.mode, bedded ? 'directional-bedding' : 'triplanar');
    assert.equal(specification.projection.upAxis, 'y');
    assert.deepEqual(Object.keys(specification.projection.mapRoleProjection), C8_FIRST12_MAP_ROLES);
    for (const role of C8_FIRST12_MAP_ROLES) {
      assert.deepEqual(specification.projection.mapRoleProjection[role], {
        mode: specification.projection.mode,
        upAxis: specification.projection.upAxis,
      });
    }
    if (bedded) {
      assert.equal(
        specification.projection.directionalBeddingAxisUv.suppressedProjection,
        'yProjection/XZ',
      );
    } else {
      assert.equal(specification.projection.directionalBeddingAxisUv, null);
    }
  }
}

const texture = new THREE.DataTexture(new Uint8Array([
  128, 128, 128, 255,
  128, 128, 128, 255,
  128, 128, 128, 255,
  128, 128, 128, 255,
]), 2, 2);
texture.needsUpdate = true;
const directionalMaterial = createRockShaderMaterial({
  settings: {
    projection: {
      mode: 'directional-bedding',
      sideOnly: true,
      upAxis: 'y',
    },
  },
  textures: {
    rock: texture,
    rockAo: texture,
    rockNormal: texture,
    smoothness: texture,
  },
});
assert.deepEqual(directionalMaterial.userData.toonlabRockProjectionContract, {
  mapRoles: ['BaseColor', 'NearDetail', 'Smoothness', 'NormalGL', 'AO'],
  mode: 'directional-bedding',
  sideOnly: true,
  upAxis: 'y',
});
directionalMaterial.dispose();
texture.dispose();

const first100Bedded = specificationFor(
  createC8First100SurfaceSpecification,
  'arch-sandstone',
);
const sourceGeometry = new THREE.BoxGeometry(1.2, 2.4, 1.8);
const sourceMaterial = new THREE.MeshStandardMaterial();
const labRoot = new THREE.Group();
const labMesh = new THREE.Mesh(sourceGeometry, sourceMaterial);
labRoot.add(labMesh);
const applied = await applyCatalogGeologySurface(labRoot, first100Bedded, {
  depth: 1.8,
  height: 2.4,
  width: 1.2,
});
assert(applied, 'Rock Lab rejected the C8 first-100 surface schema.');
assert.equal(applied.projection.mode, 'directional-bedding');
assert.equal(applied.projection.upAxis, 'y');
assert.equal(labMesh.material.userData.toonlabRockProjectionContract.mode, 'directional-bedding');
assert.equal(labMesh.material.userData.toonlabRockProjectionContract.upAxis, 'y');
applied.dispose();

const publishedGeometry = new THREE.BoxGeometry(1.2, 2.4, 1.8);
const publishedSourceMaterial = new THREE.MeshStandardMaterial();
const publishedRoot = new THREE.Group();
const publishedMesh = new THREE.Mesh(publishedGeometry, publishedSourceMaterial);
publishedRoot.add(publishedMesh);
const loadedTextureUrls = [];
const publishedMaterialUrl = 'https://assets.example/official/c8/arch-sandstone/material-config.json';
const published = await applyCatalogGeologySurface(publishedRoot, first100Bedded, {
  depth: 1.8,
  height: 2.4,
  width: 1.2,
}, {
  fetchImpl: async (url) => {
    assert.equal(url, publishedMaterialUrl);
    return new Response(JSON.stringify({
      assetId: 'rock-c8-arch-sandstone',
      schema: 'toonlab.pro-rock-material',
      shader: {
        preset: 'call_me_sensei',
        settings: {
          assetIntegration: { sourceAlbedoMode: 'replace' },
          projection: { nearDetailScale: 1.25, scale: 3.8 },
        },
      },
      textures: Object.fromEntries(
        ['rock', 'rockAo', 'rockNormal', 'smoothness']
          .map((role) => [role, { srgb: role === 'rock', url: `https://assets.example/${role}.png` }]),
      ),
      version: 2,
    }), { status: 200 });
  },
  materialConfigUrl: publishedMaterialUrl,
  textureLoader: {
    async loadAsync(url) {
      loadedTextureUrls.push(url);
      return new THREE.DataTexture(new Uint8Array(16).fill(128), 2, 2);
    },
  },
});
assert.equal(published.audit.source, 'immutable-published-material-package');
assert.equal(loadedTextureUrls.length, 4);
assert.equal(publishedMesh.material.userData.toonLabRockTextureComposition.base, 'provided');
assert.equal(publishedMesh.material.userData.toonlabRockProjectionContract.mode, 'directional-bedding');
published.dispose();
disposeCatalogC7SurfaceCache();
sourceGeometry.dispose();
sourceMaterial.dispose();
publishedGeometry.dispose();
publishedSourceMaterial.dispose();

console.log(JSON.stringify({
  first100: C8_FIRST100_ASSET_IDS.length,
  first12: C8_FIRST12_ASSET_IDS.length,
  passed: true,
  projectionModes: ['triplanar', 'directional-bedding'],
}, null, 2));
