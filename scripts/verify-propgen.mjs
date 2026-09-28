// Propgen verification — no browser needed. Determinism, budgets, the
// PropAsset contract, placement pipeline invariants, and the frozen catalog
// entry format. Run with: node scripts/verify-propgen.mjs

import process from 'node:process';

import * as THREE from 'three';

import {
  BUILT_IN_PROP_PRESETS,
  PROP_TYPES,
  buildProp,
  createPropAsset,
  createPropAssetFromRecipe,
  createPropFromRecipe,
  createPropRecipeDocument,
  placeAlongSpline,
  placeProps,
  propAssetFromObject,
  scatterProps,
} from '../src/propgen/index.js';
import { createCatalogEntry, validateCatalogEntry } from '../src/catalog/manifest.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function hashGeometryPositions(root) {
  let hash = 0x811c9dc5;
  const feed = (value) => {
    const quantized = Math.round(value * 1000);
    for (const shift of [0, 8, 16]) {
      hash ^= (quantized >> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const meshes = [];
  root.traverse((object) => { if (object.isMesh) meshes.push(object); });
  meshes.sort((a, b) => a.name.localeCompare(b.name));
  for (const mesh of meshes) {
    const position = mesh.geometry?.attributes?.position;
    if (!position) continue;
    for (let index = 0; index < position.array.length; index += 1) feed(position.array[index]);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const heightAt = (x, z) => 3 * Math.sin(x / 40) * Math.cos(z / 55);

// --- every type builds, deterministically, within budget ------------------------
const pointTypes = Object.keys(PROP_TYPES).filter((type) => !PROP_TYPES[type].linear);
for (const type of pointTypes) {
  const settings = { asset: { seed: 99, type } };
  const a = buildProp(settings);
  const b = buildProp(settings);
  const c = buildProp({ asset: { seed: 100, type } });
  check(`${type}: same seed → identical geometry`,
    hashGeometryPositions(a.object3D) === hashGeometryPositions(b.object3D));
  check(`${type}: different seed → different geometry`,
    hashGeometryPositions(a.object3D) !== hashGeometryPositions(c.object3D));
  check(`${type}: hi budget ≤ 2k triangles`, a.stats.triangles <= 2000,
    `${a.stats.triangles} tris`);
  const lo = buildProp(settings, { detail: 'lo' });
  let loTris = 0;
  lo.object3D.traverse((object) => {
    if (object.isMesh && object.geometry.index) loTris += object.geometry.index.count / 3;
  });
  check(`${type}: lo budget ≤ 600 triangles`, loTris <= 600, `${loTris} tris`);
  check(`${type}: footprint present`,
    Boolean(a.footprint?.radius || a.footprint?.circles?.length));
}

// --- PropAsset contract -----------------------------------------------------------
const lanternAsset = createPropAsset({ asset: { seed: 7, type: 'lantern', variant: 'stoneToro' } });
const built = lanternAsset.build(1234);
check('asset.build returns object3D + footprint + anchor + lod',
  Boolean(built.object3D?.isObject3D)
  && Boolean(built.footprint)
  && Number.isFinite(built.anchor)
  && Boolean(built.lod?.far?.isObject3D)
  && Number.isFinite(built.lod?.distance));
const rebuilt = lanternAsset.build(1234);
check('asset.build(seed) is deterministic',
  hashGeometryPositions(built.object3D) === hashGeometryPositions(rebuilt.object3D));

// --- placement: explicit ---------------------------------------------------------
const collisionLog = [];
const fakeCollision = { addCircles: (list) => collisionLog.push(...list) };
const parent = new THREE.Group();
const placed = placeProps({
  asset: lanternAsset,
  collision: fakeCollision,
  heightAt,
  parent,
  positions: [{ x: 0, z: 0 }, { x: 8, z: 4 }, { x: -6, z: 9 }],
  seed: 5,
});
check('placeProps parents instances', parent.children.includes(placed.root));
check('placeProps registers collision circles', collisionLog.length >= 3,
  `${collisionLog.length} circles`);
check('placements grounded via heightAt',
  placed.placements.every((p) => Math.abs(p.y - heightAt(p.x, p.z)) < 1e-9));

// --- placement: scatter -----------------------------------------------------------
const scatterA = scatterProps({
  asset: lanternAsset,
  center: { x: 0, z: 0 },
  count: 40,
  heightAt,
  mask: (x) => x > -20,
  minSpacing: 3,
  radius: 40,
  seed: 9,
});
const scatterB = scatterProps({
  asset: lanternAsset,
  center: { x: 0, z: 0 },
  count: 40,
  heightAt,
  mask: (x) => x > -20,
  minSpacing: 3,
  radius: 40,
  seed: 9,
});
check('scatterProps deterministic placements',
  JSON.stringify(scatterA.placements) === JSON.stringify(scatterB.placements));
check('scatterProps respects mask', scatterA.placements.every((p) => p.x > -20));
const tooClose = scatterA.placements.some((a, i) => scatterA.placements.some(
  (b, j) => i < j && (a.x - b.x) ** 2 + (a.z - b.z) ** 2 < 3 * 3 - 1e-6,
));
check('scatterProps honors minSpacing', !tooClose);

// --- placement: along spline (fence acceptance) --------------------------------------
const spline = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-30, 0, -30),
  new THREE.Vector3(-10, 1, 0),
  new THREE.Vector3(15, 0.5, 10),
  new THREE.Vector3(35, 2, 30),
]);
const fenceAsset = createPropAsset({ asset: { seed: 3, type: 'fence', variant: 'ranch' } });
check('fence asset is linear (buildAlong)', typeof fenceAsset.buildAlong === 'function');
const fenceRun = placeAlongSpline({
  asset: fenceAsset,
  collision: fakeCollision,
  heightAt,
  offset: 2.4,
  spacing: 2.2,
  spline,
});
check('placeAlongSpline(fence) builds geometry in one call',
  fenceRun.root.children.length > 0 && fenceRun.blockers.length > 10,
  `children=${fenceRun.root.children.length} blockers=${fenceRun.blockers.length}`);
let fenceMinY = Infinity;
let fenceMaxDrift = 0;
fenceRun.root.traverse((object) => {
  if (!object.isMesh) return;
  const position = object.geometry.attributes.position;
  for (let index = 0; index < position.count; index += 1) {
    fenceMinY = Math.min(fenceMinY, position.getY(index));
  }
});
for (const blocker of fenceRun.blockers) {
  fenceMaxDrift = Math.max(fenceMaxDrift, Math.abs(heightAt(blocker.x, blocker.z)));
}
check('fence run follows terrain (posts near ground)', fenceMinY < 1.5 && fenceMaxDrift > 0.2,
  `minY=${fenceMinY.toFixed(2)}`);

// point props along the same spline
const lanternRun = placeAlongSpline({
  asset: lanternAsset,
  heightAt,
  offset: 2.8,
  spacing: 8,
  spline,
});
check('placeAlongSpline(point asset) instanced placements',
  lanternRun.blockers.length >= 5, `${lanternRun.blockers.length} lanterns`);

// --- propAssetFromObject: the OSS↔pro seam ------------------------------------------
const importedSource = new THREE.Group();
const importedMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 2, 0.8), new THREE.MeshStandardMaterial());
importedMesh.position.y = 1.4; // base at y=0.4 — anchor must compensate
importedSource.add(importedMesh);
const importedAsset = propAssetFromObject(importedSource);
const importedBuilt = importedAsset.build();
check('propAssetFromObject grounds the object (anchor = -min.y)',
  Math.abs(importedBuilt.anchor - -0.4) < 1e-6, `anchor=${importedBuilt.anchor}`);
check('propAssetFromObject measures a footprint',
  importedBuilt.footprint.radius > 0.3);
const importedPlaced = placeProps({
  asset: importedAsset,
  collision: fakeCollision,
  heightAt,
  positions: [{ x: 3, z: 3 }],
});
check('imported asset flows through placeProps',
  importedPlaced.placements.length === 1 && importedPlaced.blockers.length === 1);

// --- recipes + presets + catalog format -----------------------------------------------
const recipe = createPropRecipeDocument({ asset: { seed: 7, type: 'torii' } });
const fromRecipe = createPropFromRecipe(recipe);
check('createPropFromRecipe builds', Boolean(fromRecipe.object3D));
check('createPropAssetFromRecipe returns an asset',
  typeof createPropAssetFromRecipe(recipe).build === 'function');
check('all built-in presets valid + buildable', BUILT_IN_PROP_PRESETS.every((preset) => {
  try {
    const asset = createPropAssetFromRecipe(preset.recipe);
    return Boolean(asset.build().object3D);
  } catch {
    return false;
  }
}));
const entry = createCatalogEntry({
  budget: { triHi: 1800, triLo: 160 },
  cluster: 'propgen',
  id: 'prop/lantern/stone-toro',
  kind: 'recipe',
  recipe,
  spawn: 'createPropAssetFromRecipe(recipe)',
  tags: ['prop', 'lighting'],
  thumbnail: 'thumbs/prop-lantern-stone-toro.webp',
});
check('catalog entry format round-trips', validateCatalogEntry(entry).ok);
check('catalog entry rejects bad ids',
  !validateCatalogEntry({ ...entry, id: 'Bad ID!' }).ok);

// --- LOD swap machinery ------------------------------------------------------------------
const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 2, 0);
placed.update(1, camera); // force a reassign
check('PropInstances update runs with a camera', true);

console.log(failures === 0 ? '\nverify-propgen: all checks passed' : `\nverify-propgen: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
