import assert from 'node:assert/strict';
import * as THREE from 'three';

import {
  applyRockShader,
  clearRockSemanticMaterialCaches,
  prepareRockSemanticMaterialBindings,
} from '../src/rock-shader/index.js';

function texture(name) {
  const value = new THREE.DataTexture(new Uint8Array([127, 127, 127, 255]), 1, 1);
  value.name = name;
  value.needsUpdate = true;
  return value;
}

const sourceTextures = Object.fromEntries([
  'rock', 'rockNormal', 'smoothness', 'topMask',
  'grass', 'grassRoughness', 'sand', 'sandNormal',
].map((role) => [role, texture(role)]));
const binding = Object.freeze({
  failClosed: true,
  geometrySeed: 101,
  manifest: 'material-sets/manifest.json',
  materialSeed: 202,
  materialSetId: 'semantic-set-test',
  materialVariation: {
    colorGain: [0.97, 1.02, 1.01],
    metallicGain: 1.03,
    normalGain: 0.94,
    roughnessGain: 1.04,
    specularGain: 0.98,
  },
  schema: 'toonlab.rock-material-binding',
});
const semantic = Object.freeze({
  binding,
  materialSetId: binding.materialSetId,
  profile: {
    base: { metallic: 0.1, smoothness: 0.32, tint: [1, 1, 1], triplanarScale: 2.4 },
    layerMask: {
      cavityStrength: 0.25,
      exposureStrength: 0.2,
      heightEnd: 0.88,
      heightStart: 0.48,
      offset: 0.3,
      semanticMaskStrength: 1,
      sharpness: 0.8,
    },
    layers: {
      grass: { enabled: true, metalness: 0, normalStrength: 0, roughness: 0.91, tint: [1, 1, 1] },
      sand: { enabled: false, metalness: 0, normalStrength: 0.72, roughness: 0.84, tint: [1, 1, 1] },
      snow: { enabled: false, metalness: 0, normalStrength: 0, roughness: 0.94, tint: [1, 1, 1] },
    },
    striping: { enabled: false },
  },
  sourceChannels: {},
  textures: Object.freeze(sourceTextures),
});

function semanticRock() {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.getAttribute('position').count;
  for (const name of ['rockCavity', 'rockExposure', 'rockHeight']) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count).fill(0.5), 1));
  }
  const sourceMaterial = new THREE.MeshStandardMaterial({ color: 0x000000, opacity: 0, transparent: true });
  sourceMaterial.userData.toonlabRockSemanticMaterial = semantic;
  return new THREE.Mesh(geometry, sourceMaterial);
}

const rock = semanticRock();
rock.scale.set(3.2, 0.65, 1.7);
applyRockShader(rock, {}, { surfaceState: 'grass' });
const grassResponse = rock.material.userData.toonlabRockActiveSurfaceResponse;
assert.equal(grassResponse.activeLayer, 'grass');
assert.equal(grassResponse.color, sourceTextures.grass.uuid);
assert.equal(grassResponse.normal, null);
assert.equal(grassResponse.roughness, sourceTextures.grassRoughness.uuid);

applyRockShader(rock, {}, { surfaceState: 'sand' });
const sandResponse = rock.material.userData.toonlabRockActiveSurfaceResponse;
assert.deepEqual(sandResponse, {
  activeLayer: 'sand',
  color: sourceTextures.sand.uuid,
  normal: sourceTextures.sandNormal.uuid,
  roughness: 0.84,
});
assert.ok(!JSON.stringify(sandResponse).includes(sourceTextures.grass.uuid));
assert.ok(!JSON.stringify(sandResponse).includes(sourceTextures.grassRoughness.uuid));
assert.deepEqual(rock.material.userData.toonlabRockProjectionContract, {
  normalBlend: 'whiteout-world-to-tangent',
  primary: 'world-space-triplanar',
  scaleCompensation: 'absolute-world-position',
  texelDensityInvariantUnderNonUniformScale: true,
});

const incomplete = semanticRock();
incomplete.material.userData.toonlabRockSemanticMaterial = Object.freeze({
  ...semantic,
  textures: Object.freeze({ rock: sourceTextures.rock }),
});
assert.throws(
  () => applyRockShader(incomplete, {}, { surfaceState: 'sand' }),
  /has no faithful sand layer input/,
);

clearRockSemanticMaterialCaches();
const fetches = [];
const loaded = [];
const fetchImpl = async (url) => {
  fetches.push(url);
  const body = url.endsWith('/manifest.json')
    ? {
      schema: 'toonlab.rock-semantic-material-library',
      sets: [{ file: 'sets/semantic-set-test.json', id: binding.materialSetId }],
      textures: [{
        colorSpace: 'srgb',
        file: 'textures/source-hash.png',
        hash: 'source-hash',
        normalMap: false,
      }],
    }
    : {
      id: binding.materialSetId,
      profile: semantic.profile,
      schema: 'toonlab.rock-semantic-material-set',
      semanticTextures: {
        primaryAlbedo: {
          colorSpace: 'srgb', file: 'textures/source-hash.png', hash: 'source-hash',
        },
      },
      sourceChannels: {},
    };
  return { json: async () => body, ok: true, status: 200 };
};
const textureLoader = {
  async loadAsync(url) {
    loaded.push(url);
    return texture('loaded-source');
  },
};
function boundRock() {
  const material = new THREE.MeshStandardMaterial();
  material.userData.toonlabRockMaterialBinding = binding;
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const count = geometry.getAttribute('position').count;
  for (const name of ['_rockcavity', '_rockexposure', '_rockheight']) {
    geometry.setAttribute(name, new THREE.BufferAttribute(new Float32Array(count).fill(0.5), 1));
  }
  return new THREE.Mesh(geometry, material);
}
const first = boundRock();
const second = boundRock();
await prepareRockSemanticMaterialBindings(first, {
  fetchImpl, modelUrl: 'https://local.test/rocks/a.glb', textureLoader,
});
await prepareRockSemanticMaterialBindings(second, {
  fetchImpl, modelUrl: 'https://local.test/rocks/b.glb', textureLoader,
});
assert.equal(loaded.length, 1, 'content-addressed texture bytes must load once');
assert.equal(
  first.material.userData.toonlabRockSemanticMaterial.textures.rock,
  second.material.userData.toonlabRockSemanticMaterial.textures.rock,
  'variants must reuse the same cached Texture object',
);
assert.equal(fetches.filter((url) => url.endsWith('/manifest.json')).length, 1);
assert.equal(fetches.filter((url) => url.endsWith('/semantic-set-test.json')).length, 1);
for (const name of ['rockCavity', 'rockExposure', 'rockHeight']) {
  assert.equal(first.geometry.getAttribute(name), first.geometry.getAttribute(`_${name.toLowerCase()}`));
}

console.log('Semantic rock material acceptance verification passed.');
