import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createOfficialCatalogAssetRuntime } from '../src/catalog/officialCatalogAssetRuntime.js';
import { normalizeOfficialCatalogAsset } from '../src/catalog/officialCatalogProvider.js';

function normalizedAsset(id = 'rock-0303') {
  return normalizeOfficialCatalogAsset({
    download_url: `/official/current/${id}/rock.glb`,
    id,
    kind: 'model',
    metadata: {
      catalog: 'rocks',
      recipe: { kind: 'toonlab/rock-recipe', version: 1 },
      recipeHash: `recipe-${id}`,
      revision: 1,
    },
    name: id,
    source: 'toonlab-rock',
  }, {
    baseUrl: 'https://assets.example/',
    expectedSource: 'toonlab-rock',
  });
}

const asset = normalizedAsset();
const texture = new THREE.Texture();
const material = new THREE.MeshStandardMaterial({ map: texture });
const geometry = new THREE.BoxGeometry(1, 1, 1);
const sourceRoot = new THREE.Group();
sourceRoot.add(new THREE.Mesh(geometry, material));
let loaderCalls = 0;
let prepareCalls = 0;
let transcoderCreates = 0;
let transcoderDisposals = 0;
let geometryDisposals = 0;
let materialDisposals = 0;
let textureDisposals = 0;
geometry.addEventListener('dispose', () => { geometryDisposals += 1; });
material.addEventListener('dispose', () => { materialDisposals += 1; });
texture.addEventListener('dispose', () => { textureDisposals += 1; });

const provider = { getAsset: async () => asset };
const renderer = {};
const transcodersFactory = () => {
  transcoderCreates += 1;
  return { dispose: () => { transcoderDisposals += 1; } };
};
const runtime = createOfficialCatalogAssetRuntime({
  loadModel: async (url, options) => {
    loaderCalls += 1;
    assert.equal(url, asset.modelUrl);
    assert.ok(options.transcoders);
    return { clips: [], format: 'gltf', resourcePath: '/', root: sourceRoot, url };
  },
  prepareTextures: async () => { prepareCalls += 1; },
  provider,
  renderer,
  transcodersFactory,
});

const [first, second] = await Promise.all([
  runtime.acquireAsset(asset.id),
  runtime.acquireAsset(asset.id),
]);
const firstMesh = first.root.children[0];
const secondMesh = second.root.children[0];
assert.equal(loaderCalls, 1);
assert.equal(prepareCalls, 1);
assert.equal(transcoderCreates, 1);
assert.notEqual(first.root, second.root);
assert.equal(firstMesh.geometry, geometry);
assert.equal(secondMesh.geometry, geometry);
assert.notEqual(firstMesh.material, material);
assert.notEqual(firstMesh.material, secondMesh.material);
assert.equal(firstMesh.material.map, texture);
assert.equal(secondMesh.material.map, texture);
assert.equal(runtime.stats().cachedAssets, 1);
assert.equal(runtime.stats().activeHandles, 2);
assert.equal(runtime.stats().entries[0].refs, 2);
assert.equal(runtime.evict(asset.id), false);

let firstMaterialDisposals = 0;
firstMesh.material.addEventListener('dispose', () => { firstMaterialDisposals += 1; });
assert.equal(first.release(), true);
assert.equal(first.release(), false);
assert.equal(firstMaterialDisposals, 1);
assert.equal(runtime.stats().entries[0].refs, 1);
assert.equal(geometryDisposals, 0);
assert.equal(textureDisposals, 0);
second.release();
assert.equal(runtime.evict(asset.id), true);
assert.equal(geometryDisposals, 1);
assert.equal(materialDisposals, 1);
assert.equal(textureDisposals, 1);

// Decoder/transcoder ownership is shared across runtimes using the same
// renderer, base path, and factory, then released only after the last runtime.
const rootA = new THREE.Group();
rootA.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
const rootB = new THREE.Group();
rootB.add(new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial()));
const runtimeA = createOfficialCatalogAssetRuntime({
  loadModel: async (url) => ({ format: 'gltf', root: rootA, url }),
  prepareTextures: async () => {},
  provider,
  renderer,
  transcodersFactory,
});
const runtimeB = createOfficialCatalogAssetRuntime({
  loadModel: async (url) => ({ format: 'gltf', root: rootB, url }),
  prepareTextures: async () => {},
  provider,
  renderer,
  transcodersFactory,
});
const handleA = await runtimeA.acquireAsset(asset);
const handleB = await runtimeB.acquireAsset(asset);
assert.equal(transcoderCreates, 1, 'all three runtimes share the renderer pool');
handleA.release();
handleB.release();
await runtimeA.dispose();
assert.equal(transcoderDisposals, 0, 'first runtime keeps shared pool alive');
await runtimeB.dispose();
assert.equal(transcoderDisposals, 0, 'original runtime still owns the shared pool');

await runtime.dispose();
assert.equal(transcoderDisposals, 1, 'last runtime releases shared pool');
assert.equal(runtime.disposed, true);
await assert.rejects(() => runtime.acquireAsset(asset), /disposed/u);

console.log('Official catalog asset runtime verification passed.');
