// Buildinggen verification: the 1000-seed grammar invariant suite (asserted,
// not eyeballed — per the plan), determinism, budgets, build time, recipe
// round-trips, and the PropAsset seam. Run: node scripts/verify-buildinggen.mjs

import process from 'node:process';

import {
  BUILDING_TYPES,
  BUILT_IN_BUILDING_PRESETS,
  buildingAsset,
  buildingRecipeFromSettings,
  checkPlanInvariants,
  createBuildingFromRecipe,
  createBuildingSettings,
  resolveBuildingPlan,
  validateBuildingRecipeDocument,
} from '../src/buildinggen/index.js';
import { placeProps } from '../src/propgen/index.js';

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

// --- 1000-seed grammar invariant suite -------------------------------------------
const types = Object.keys(BUILDING_TYPES);
let violations = 0;
let plansChecked = 0;
const t0 = performance.now();
for (let seed = 1; seed <= 1000; seed += 1) {
  const type = types[seed % types.length];
  const plan = resolveBuildingPlan(createBuildingSettings({ seed, type }));
  const found = checkPlanInvariants(plan);
  plansChecked += 1;
  if (found.length > 0) {
    violations += 1;
    if (violations <= 3) console.error(`  seed ${seed} (${type}): ${found.join('; ')}`);
  }
}
const invariantMs = performance.now() - t0;
check(`grammar invariants clean across ${plansChecked} seeds`, violations === 0,
  `${violations} violating plans`);
console.log(`     (invariant sweep: ${invariantMs.toFixed(0)} ms)`);

// --- determinism + budgets + build time per type ------------------------------------
const BUDGETS = { cottage: 8000, farmhouse: 10000, shed: 4000, shrine: 15000, watchtower: 9000 };
for (const type of types) {
  const a = createBuildingFromRecipe({ seed: 77, type });
  const b = createBuildingFromRecipe({ seed: 77, type });
  const c = createBuildingFromRecipe({ seed: 78, type });
  check(`${type}: same recipe → identical building`,
    hashGeometryPositions(a.object3D) === hashGeometryPositions(b.object3D));
  check(`${type}: different seed → different building`,
    hashGeometryPositions(a.object3D) !== hashGeometryPositions(c.object3D));
  check(`${type}: hi ≤ ${BUDGETS[type]} tris`, a.stats.triangles <= BUDGETS[type],
    `${a.stats.triangles}`);
  const lo = createBuildingFromRecipe({ seed: 77, type }, { detail: 'lo' });
  check(`${type}: lo ≤ 900 tris`, lo.stats.triangles <= 900, `${lo.stats.triangles}`);
  check(`${type}: ≤ 6 draw calls`, a.object3D.children.length <= 6,
    `${a.object3D.children.length} meshes`);
  const start = performance.now();
  createBuildingFromRecipe({ seed: 101, type });
  const buildMs = performance.now() - start;
  check(`${type}: build ≤ 50 ms`, buildMs <= 50, `${buildMs.toFixed(1)} ms`);
}

// --- recipe round-trip ------------------------------------------------------------------
const recipe = buildingRecipeFromSettings({ seed: 42, type: 'cottage' });
check('recipe validates', validateBuildingRecipeDocument(recipe).ok);
const first = createBuildingFromRecipe(recipe);
const second = createBuildingFromRecipe(recipe);
check('recipe → identical rebuild',
  hashGeometryPositions(first.object3D) === hashGeometryPositions(second.object3D));
check('version respected', !validateBuildingRecipeDocument({ ...recipe, version: 99 }).ok);

// --- PropAsset seam: 30 seeded cottages on sloped terrain --------------------------------
const heightAt = (x, z) => 4 * Math.sin(x / 30) * Math.cos(z / 40); // slopes up to ~19°
const asset = buildingAsset({ seed: 1, type: 'cottage' });
const positions = [];
for (let index = 0; index < 30; index += 1) {
  positions.push({ x: (index % 6) * 18 - 45, z: Math.floor(index / 6) * 18 - 36 });
}
const blockers = [];
const placed = placeProps({
  asset,
  collision: { addCircles: (list) => blockers.push(...list) },
  heightAt,
  positions,
  seed: 4,
  variants: 6,
});
check('30 cottages placed with multi-circle collision',
  placed.placements.length === 30 && blockers.length >= 30,
  `${blockers.length} circles`);
const builtOnce = asset.build(9);
check('building asset exposes door anchor for villages',
  Number.isFinite(builtOnce.door?.x) && Number.isFinite(builtOnce.door?.nx));
check('foundation skirt reaches below ground (no floating corners ≤ 20°)', (() => {
  // deepest skirt vertex must sit ≥1 m below the origin plane, so a ±1.4 m
  // slope across the footprint never exposes the underside
  let minY = Infinity;
  builtOnce.object3D.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry.attributes.position;
    for (let index = 0; index < position.count; index += 1) {
      minY = Math.min(minY, position.getY(index));
    }
  });
  return minY <= -1;
})());

// --- presets ---------------------------------------------------------------------------------
check('all built-in presets valid + buildable', BUILT_IN_BUILDING_PRESETS.every((preset) => {
  try {
    return validateBuildingRecipeDocument(preset.recipe).ok
      && Boolean(createBuildingFromRecipe(preset.recipe).object3D);
  } catch {
    return false;
  }
}));

console.log(failures === 0 ? '\nverify-buildinggen: all checks passed' : `\nverify-buildinggen: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
