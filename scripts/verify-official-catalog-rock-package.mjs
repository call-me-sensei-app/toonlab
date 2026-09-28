import assert from 'node:assert/strict';
import * as THREE from 'three';

import { normalizeOfficialCatalogAsset } from '../src/catalog/officialCatalogProvider.js';
import {
  createOfficialCatalogRockEditorDescriptor,
  loadOfficialCatalogRockPackage,
  loadOfficialCatalogRockShaderInput,
} from '../src/catalog/officialCatalogRockPackage.js';

const recipe = {
  editing: {
    boundedProceduralVariation: true,
    deterministicReprojection: true,
    manualVertexSculpt: true,
    reapplySurfaceAfterEdit: true,
    rebuildLodsAndCollisionAfterShapeEdit: true,
    rebakePortableTexturesAfterShapeEdit: true,
  },
  generator: { kind: 'editable-control-mesh', seed: 1555903648, unit: 'metre' },
  output: { collision: true, cullBelowPixels: 2, lods: ['LOD0', 'LOD1', 'LOD2', 'LOD3', 'LOD4'] },
  schema: 'toonlab/rock-gallery-recipe',
  version: 1,
};
const materialConfig = {
  assetId: 'rock-c8-arch-sandstone',
  schema: 'toonlab.pro-rock-material',
  shader: {
    preset: 'call_me_sensei',
    settings: { projection: { mode: 'directional-bedding', scale: 3.78 } },
  },
  textures: {
    rock: { srgb: true, url: 'https://assets.example/baseColor.png' },
    rockNormal: { srgb: false, url: 'https://assets.example/normalGL.png' },
    rockAo: { srgb: false, url: 'https://assets.example/ao.png' },
    smoothness: { srgb: false, url: 'https://assets.example/smoothness.png' },
  },
  version: 2,
};
const asset = normalizeOfficialCatalogAsset({
  artifacts: [
    ['rock.glb', 'model/gltf-binary'],
    ['control.glb', 'model/gltf-binary'],
    ['retained-high.glb', 'model/gltf-binary'],
    ...Array.from({ length: 5 }, (_, level) => [`lod${level}.glb`, 'model/gltf-binary']),
    ['collision.glb', 'model/gltf-binary'],
    ['material-config.json', 'application/json'],
    ['recipe.json', 'application/json'],
  ].map(([name, contentType]) => ({ contentType, download: `/official/c8/${name}`, name })),
  id: 'rock-c8-arch-sandstone',
  kind: 'model',
  recipe,
  recipeHash: 'recipe-hash',
  revision: 2,
}, { baseUrl: 'https://assets.example/', expectedSource: 'toonlab-rock' });

const requests = [];
const rockPackage = await loadOfficialCatalogRockPackage(asset, {
  fetchImpl: async (url) => {
    requests.push(url);
    const document = url.endsWith('recipe.json') ? recipe : materialConfig;
    return new Response(JSON.stringify(document), { status: 200 });
  },
});
assert.equal(requests.length, 2);
assert.equal(rockPackage.recipe.schema, 'toonlab/rock-gallery-recipe');
assert.equal(rockPackage.materialConfig.shader.preset, 'call_me_sensei');

const loadedUrls = [];
const shaderInput = await loadOfficialCatalogRockShaderInput(rockPackage, {
  textureLoader: {
    async loadAsync(url) {
      loadedUrls.push(url);
      const texture = new THREE.Texture({ width: 1024, height: 1024 });
      return texture;
    },
  },
});
assert.deepEqual(loadedUrls.sort(), Object.values(materialConfig.textures).map(({ url }) => url).sort());
assert.equal(shaderInput.textures.rock.colorSpace, THREE.SRGBColorSpace);
assert.equal(shaderInput.textures.rockNormal.colorSpace, THREE.NoColorSpace);
assert.equal(shaderInput.settings.projection.mode, 'directional-bedding');

const editor = createOfficialCatalogRockEditorDescriptor(asset, rockPackage);
assert.equal(editor.worldUnitMetres, 1);
assert.equal(editor.controlModelUrl, 'https://assets.example/official/c8/control.glb');
assert.equal(editor.retainedHighModelUrl, 'https://assets.example/official/c8/retained-high.glb');
assert.equal(editor.lodModelUrls.length, 5);
assert.equal(editor.cullBelowPixels, 2);
assert.equal(editor.editing.rebakePortableTexturesAfterShapeEdit, true);

Object.values(shaderInput.textures).forEach((texture) => texture.dispose());
console.log('Official catalog rock package verification passed.');
