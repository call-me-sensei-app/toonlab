import assert from 'node:assert/strict';
import * as THREE from 'three';

import { createOfficialCatalogAssetRuntime } from '../src/catalog/officialCatalogAssetRuntime.js';
import { loadOfficialCatalogAsset } from '../src/catalog/officialCatalogPlacement.js';
import { normalizeOfficialCatalogAsset } from '../src/catalog/officialCatalogProvider.js';
import { readStyleTargetLabel } from '../src/styles/styleTargetDiscovery.js';
import { CALL_ME_SENSEI_STYLE_BUNDLE } from '../src/styles/styleBundle.js';
import { createToonLabInspector } from '../src/styles/styleInspector.js';
import { createWorldCollision } from '../src/worldCollision.js';
import { TRIMESH_DATA_COLLISION_ADAPTER } from '../src/collisionMetadata.js';

const raw = {
  download_url: '/official/current/rock-0303/rock.glb',
  id: 'rock-0303',
  kind: 'model',
  metadata: {
    catalog: 'rocks',
    recipe: {
      kind: 'toonlab/rock-recipe',
      lod: { count: 2, distances: [0, 20] },
      version: 1,
    },
    recipeHash: 'placement-recipe',
    revision: 2,
  },
  name: 'Placement rock',
  source: 'toonlab-rock',
};
const asset = normalizeOfficialCatalogAsset(raw, {
  baseUrl: 'https://assets.example/',
  expectedSource: 'toonlab-rock',
});
const sourceRoot = new THREE.Group();
for (const level of [0, 1]) {
  const geometry = new THREE.BoxGeometry(1, 1, 1);
  const normalMap = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({ normalMap });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `rock_LOD${level}_mesh`;
  sourceRoot.add(mesh);
}
const runtime = createOfficialCatalogAssetRuntime({
  loadModel: async (url) => ({ format: 'gltf', root: sourceRoot, url }),
  prepareTextures: async () => {},
  provider: { getAsset: async () => asset },
  renderer: {},
  transcodersFactory: () => ({ dispose() {} }),
});
const collision = createWorldCollision();
const inspector = createToonLabInspector({ bundle: CALL_ME_SENSEI_STYLE_BUNDLE });
const scene = new THREE.Scene();
const placement = await loadOfficialCatalogAsset({
  assetId: asset.id,
  assetRuntime: runtime,
  collisionWorld: collision,
  inspector,
  parent: scene,
  position: [10, 2, 5],
  scale: 2,
  styleBundle: CALL_ME_SENSEI_STYLE_BUNDLE,
});

assert.equal(placement.asset, asset);
assert.equal(placement.container.parent, scene);
assert.equal(placement.normalization.grounded, true);
assert.equal(placement.object.position.y, 0.5);
assert.deepEqual(placement.lod.availableLevels, [0, 1]);
assert.equal(placement.collision.kind, 'bounds');
assert.equal(collision.circles.length, 1);
assert.ok(Math.abs(collision.circles[0].x - 10) < 1e-6);
assert.ok(Math.abs(collision.circles[0].z - 5) < 1e-6);
const label = readStyleTargetLabel(placement.object);
assert.equal(label.domain, 'natural.rock');
assert.equal(label.assetId, asset.id);
assert.equal(label.collision.kind, 'bounds');
placement.object.traverse((object) => {
  if (!object.isMesh) return;
  assert.equal(object.castShadow, true);
  assert.equal(object.receiveShadow, true);
  assert.equal(object.userData.rockShaderPreset, 'call_me_sensei');
});
placement.updateLod({ distance: 100 });
assert.equal(placement.lod.level, 1);
const inspectorTarget = inspector.snapshot().targets.find(({ targetId }) => (
  targetId === `official-catalog/${asset.id}`
));
assert.equal(inspectorTarget.adapterId, 'toonlab-official-catalog-rock');
assert.equal(inspectorTarget.participation.collision.kind, 'bounds');
assert.deepEqual(inspectorTarget.participation.lod.availableLevels, [0, 1]);
assert.equal(inspectorTarget.participation.shadows.castShadows, 2);

assert.equal(await placement.release(), true);
assert.equal(await placement.release(), false);
assert.equal(collision.circles.length, 0);
assert.equal(placement.container.parent, null);
assert.equal(runtime.stats().activeHandles, 0);
assert.equal(inspector.snapshot().targets.length, 0);

const decorative = await loadOfficialCatalogAsset({
  assetId: asset.id,
  assetRuntime: runtime,
  collision: false,
  styleBundle: CALL_ME_SENSEI_STYLE_BUNDLE,
});
assert.equal(decorative.collision, null);
assert.equal(readStyleTargetLabel(decorative.object).collision.kind, 'none');
await decorative.release();

const physical = await loadOfficialCatalogAsset({
  assetId: asset.id,
  assetRuntime: runtime,
  collisionAdapter: TRIMESH_DATA_COLLISION_ADAPTER,
  styleBundle: CALL_ME_SENSEI_STYLE_BUNDLE,
});
assert.equal(physical.collision.kind, 'trimesh');
assert.ok(physical.collision.trimesh.vertices.length > 0);
assert.ok(physical.collision.trimesh.indices.length > 0);
await physical.release();
inspector.dispose();
await runtime.dispose();

console.log('Official catalog placement verification passed.');
