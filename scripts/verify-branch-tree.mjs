import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';

import {
  BRANCH_TREE_DOCUMENT_TYPE,
  BRANCH_TREE_DOCUMENT_VERSION,
  BRANCH_TREE_LEAF_SHAPES,
  BranchTree,
  createBranchTree,
  createBranchTreeDocument,
  createBranchTreeSettings,
  parseBranchTreeDocument,
} from '../src/vegetation/branchTree.js';
import * as vegetation from '../src/vegetation/index.js';
import {
  StylizedTree,
  createStylizedTreeSettings,
} from '../src/vegetation/stylizedTree.js';

function onePixelTexture(color) {
  const texture = new THREE.DataTexture(
    new Uint8Array(color),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.needsUpdate = true;
  return texture;
}

function geometryDigest(tree) {
  const hash = createHash('sha256');
  for (const geometry of [tree.trunkMesh.geometry, tree.canopyMesh.geometry]) {
    hash.update(Buffer.from(geometry.attributes.position.array.buffer));
    if (geometry.index) hash.update(Buffer.from(geometry.index.array.buffer));
  }
  return hash.digest('hex');
}

assert.deepEqual(
  BRANCH_TREE_LEAF_SHAPES,
  ['teardrop', 'round', 'oak', 'maple', 'palmate', 'gingko', 'needle', 'needle-fascicle'],
  'the supported leaf selector stays small and closed, and now spans conifers',
);
// 'palmate' is Acer palmatum's dissected seven-lobe leaf, distinct from the
// blunt five-point sugar-maple star 'maple' draws; 'needle' and
// 'needle-fascicle' are conifer organs. BranchTree is a recursive woody
// skeleton with foliage at the branch tips, which is exactly how a
// cloud-pruned garden pine is built, so restricting the selector to
// broadleaves was a documentation-level assumption rather than an
// architectural one.

const normalized = createBranchTreeSettings({
  seed: 41,
  branches: { angle: 500, children: 50, levels: 9 },
  leaves: { color: '#4d9e52', density: 9, shape: 'unknown' },
  roots: 'large',
  trunk: { height: 0, textureRef: 'asset://bark/oak-01' },
});
assert.equal(normalized.branches.angle, 120);
assert.equal(normalized.branches.children, 12);
assert.equal(normalized.branches.levels, 4);
assert.equal(normalized.leaves.density, 2);
assert.equal(normalized.leaves.shape, 'round');
assert.equal(normalized.trunk.height, 0.2);
assert.equal(normalized.trunk.textureRef, 'asset://bark/oak-01');
assert.equal(normalized.roots, 'large');

const namedDefaults = createStylizedTreeSettings({
  canopy: { architecture: 'cloud-cards' },
  skeleton: { generator: 'limbs' },
});
assert.equal(namedDefaults.skeleton.generator, 'limbs',
  'the settings validator must accept its own public limbs default');
assert.equal(namedDefaults.canopy.architecture, 'cloud-cards',
  'the settings validator must accept its own public cloud-cards default');

const surfaceTestLeafMap = onePixelTexture([255, 255, 255, 255]);
const signatureTree = new StylizedTree({
  foliage: { leafMap: surfaceTestLeafMap },
  preset: 'call_me_sensei',
  seed: 41,
});
assert.equal(
  signatureTree.trunkMesh.material.map?.userData?.profileId,
  'call-me-sensei-bark-v1',
  'Call Me Sensei trees choose the registered signature bark when no authored map exists',
);
assert.deepEqual(signatureTree.trunkMesh.material.userData.toonlabBarkSurface, {
  profileId: 'call-me-sensei-bark-v1',
  source: 'registered-profile',
});

const bundleStyledTree = new StylizedTree({
  foliage: { leafMap: surfaceTestLeafMap },
  seed: 42,
});
assert.equal(bundleStyledTree.trunkMesh.material.map, null,
  'the neutral tree remains flat until a style chooses a fallback');
const bundleSurface = bundleStyledTree.setVegetationShader({
  preset: 'call_me_sensei',
  style: 'call_me_sensei',
}).surface;
assert.deepEqual(bundleSurface, {
  applied: true,
  profileId: 'call-me-sensei-bark-v1',
  reason: 'style-fallback',
});
assert.equal(
  bundleStyledTree.trunkMesh.material.map?.userData?.profileId,
  'call-me-sensei-bark-v1',
  'applying the style bundle fills a missing generated-tree bark surface',
);

const deliberatelyFlatTree = new StylizedTree({
  foliage: { leafMap: surfaceTestLeafMap },
  seed: 43,
  trunkSurfaceProfile: 'none',
});
assert.equal(
  deliberatelyFlatTree.setVegetationShader({
    preset: 'call_me_sensei',
    style: 'call_me_sensei',
  }).surface.reason,
  'explicit-none',
  'an explicit flat-color authoring decision wins over the style fallback',
);

const trunkMap = onePixelTexture([154, 93, 52, 255]);
const leafMap = onePixelTexture([255, 255, 255, 255]);
const options = {
  seed: 73,
  branches: { children: 5, levels: 3, gnarliness: 0.22 },
  leaves: {
    color: [0.17, 0.46, 0.2],
    coverageScale: 0.72,
    map: leafMap,
    palette: {
      crown: [0.12, 0.32, 0.13],
      lit: [0.28, 0.62, 0.3],
      shadow: [0.08, 0.22, 0.1],
    },
    shape: 'oak',
    textureRef: 'asset://leaf/oak-mask-v1',
  },
  trunk: {
    map: trunkMap,
    textureRef: 'asset://bark/branch-tree-v1',
  },
};
const first = createBranchTree(options);
const second = new BranchTree(options);
assert.equal(first.name, 'BranchTree');
assert.equal(first.settings.skeleton.generator, 'branching');
assert.equal(first.trunkMesh.material.map, trunkMap, 'trunk texture reaches the woody shader');
assert.equal(first.canopyMesh.material.map, leafMap, 'leaf texture reaches the leaf shader');
assert.equal(first.trunkMesh.castShadow, true, 'BranchTree trunks cast shadows by default');
assert.equal(first.trunkMesh.receiveShadow, true, 'BranchTree trunks receive shadows by default');
assert.equal(first.canopyMesh.castShadow, true, 'BranchTree foliage casts cutout shadows by default');
assert.equal(first.canopyMesh.receiveShadow, true, 'BranchTree foliage receives shadows by default');
assert.equal(first.settings.canopy.coverageScale, 0.72,
  'leaf coverage scale remains independent from the tree world scale');
assert.deepEqual(first.settings.tree.canopyPalette, options.leaves.palette,
  'portable lit/shadow/crown leaf palette reaches the canopy material contract');
assert.equal(geometryDigest(first), geometryDigest(second), 'same settings and seed are deterministic');

const changed = createBranchTree({ ...options, seed: 74 });
assert.notEqual(
  geometryDigest(first),
  geometryDigest(changed),
  'changing the seed changes the generated branch tree',
);
const shapedTrunk = createBranchTree({
  ...options,
  trunk: { ...options.trunk, bend: 0.72, radiusTop: 0.035, twist: 1.1 },
});
assert.notEqual(
  geometryDigest(first),
  geometryDigest(shapedTrunk),
  'portable bend, twist, and radiusTop inputs must change generated geometry',
);

const shadowToggleTree = new StylizedTree({
  foliage: { leafMap },
  tree: { trunkReceiveShadow: false },
});
assert.equal(shadowToggleTree.trunkMesh.material.uniforms.uSceneShadowStrength.value, 0,
  'trunkReceiveShadow=false must disable the node-backend scene-shadow sample');
shadowToggleTree.applySettings({ tree: { trunkReceiveShadow: true } });
assert.equal(shadowToggleTree.trunkMesh.material.uniforms.uSceneShadowStrength.value, 1,
  'trunkReceiveShadow live updates must reach the woody material uniform');
const sceneFog = new THREE.Fog(0x9db7d8, 18, 140);
shadowToggleTree.setSceneFog(sceneFog);
assert.equal(shadowToggleTree.canopyMesh.material.uniforms.uFogNear.value, 18);
assert.equal(shadowToggleTree.canopyMesh.material.uniforms.uFogFar.value, 140);
assert.equal(shadowToggleTree.canopyMesh.material.uniforms.uFogColor.value.getHex(),
  sceneFog.color.getHex(), 'tree foliage must expose its true billboard-depth fog sync');

const document = first.toJSON();
assert.equal(document.type, BRANCH_TREE_DOCUMENT_TYPE);
assert.equal(document.version, BRANCH_TREE_DOCUMENT_VERSION);
assert.equal(document.settings.trunk.textureRef, 'asset://bark/branch-tree-v1');
assert.equal(document.settings.leaves.textureRef, 'asset://leaf/oak-mask-v1');
assert.equal(document.settings.leaves.coverageScale, 0.72);
assert.deepEqual(document.settings.leaves.palette, options.leaves.palette);
assert.equal('map' in document.settings.trunk, false, 'live trunk textures are not embedded');
assert.equal('map' in document.settings.leaves, false, 'live leaf textures are not embedded');
assert.deepEqual(
  parseBranchTreeDocument(JSON.stringify(document)),
  { errors: [], ok: true, value: createBranchTreeDocument(document.settings) },
  'portable documents round-trip canonically',
);
assert.equal(parseBranchTreeDocument({ ...document, version: 99 }).ok, false);

for (const symbol of [
  'TREE_SPECIES_PROFILES',
  'TREE_SPECIES_ROSTER',
  'createTreeSpeciesRecipe',
  'createPlantGraph',
  'ProceduralSpeciesTree',
]) {
  assert.equal(symbol in vegetation, false, `${symbol} must remain experimental and unpublished`);
}
for (const symbol of [
  'BranchTree',
  'createBranchTree',
  'createBranchTreeDocument',
  'createBranchTreeSettings',
  'syncFoliageFog',
]) {
  assert.equal(symbol in vegetation, true, `${symbol} is required on the stable vegetation surface`);
}

first.dispose();
second.dispose();
changed.dispose();
shapedTrunk.dispose();
shadowToggleTree.dispose();
signatureTree.dispose();
bundleStyledTree.dispose();
deliberatelyFlatTree.dispose();
trunkMap.dispose();
leafMap.dispose();
surfaceTestLeafMap.dispose();

console.log('BranchTree verified: deterministic branching, eight leaf shapes, authored/fallback bark maps, portable documents, and no public species roster.');
