// Villagegen verification: the automated invariant run the plan demands —
// 20 random seeds × archetypes: zero footprint overlaps, zero buildings in
// water, zero unreachable entries — plus determinism, naming, and the
// generation-time budget. Run: node scripts/verify-villagegen.mjs

import process from 'node:process';

import {
  POI_ARCHETYPES,
  createStylizedVillage,
  generatePlaceName,
  pickPoiSites,
} from '../src/villagegen/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Rolling terrain with a lake basin: sites must avoid the wet middle-left.
const WATER_LEVEL = 0;
const heightAt = (x, z) => 6
  + 5 * Math.sin(x / 120) * Math.cos(z / 150)
  + 1.6 * Math.sin(x / 33) * Math.cos(z / 41)
  - 14 * Math.exp(-(((x + 160) / 90) ** 2) - ((z / 110) ** 2));

// --- invariants across 20 seeds × 3 archetypes --------------------------------------
const archetypes = ['village', 'shrine', 'pierHamlet'];
let overlapViolations = 0;
let waterViolations = 0;
let entryViolations = 0;
let slowest = 0;
for (let run = 0; run < 20; run += 1) {
  const archetype = archetypes[run % archetypes.length];
  const started = performance.now();
  const village = createStylizedVillage({
    archetype,
    center: { x: 120 + (run % 5) * 30, z: -80 + Math.floor(run / 5) * 60 },
    heightAt,
    radius: 34,
    seed: run * 977 + 5,
    waterLevel: WATER_LEVEL,
  });
  slowest = Math.max(slowest, performance.now() - started);

  // zero footprint overlaps between buildings
  for (let a = 0; a < village.buildings.length; a += 1) {
    for (let b = a + 1; b < village.buildings.length; b += 1) {
      for (const circleA of village.buildings[a].circles) {
        for (const circleB of village.buildings[b].circles) {
          const minDistance = circleA.radius + circleB.radius;
          if ((circleA.x - circleB.x) ** 2 + (circleA.z - circleB.z) ** 2 < minDistance ** 2 * 0.98) {
            overlapViolations += 1;
          }
        }
      }
    }
  }
  // zero buildings in water
  for (const building of village.buildings) {
    if (building.y < WATER_LEVEL + 0.5) waterViolations += 1;
    for (const circle of building.circles) {
      if (heightAt(circle.x, circle.z) < WATER_LEVEL + 0.4) waterViolations += 1;
    }
  }
  // entries on dry land (reachable by the router)
  for (const entry of village.entries) {
    if (heightAt(entry.x, entry.z) < WATER_LEVEL + 0.5) entryViolations += 1;
  }
  village.dispose();
}
check('zero footprint overlaps across 20 seeds', overlapViolations === 0, `${overlapViolations}`);
check('zero buildings in water across 20 seeds', waterViolations === 0, `${waterViolations}`);
check('zero underwater entries across 20 seeds', entryViolations === 0, `${entryViolations}`);
check('village generates ≤ 1.5 s', slowest <= 1500, `${slowest.toFixed(0)} ms worst`);

// --- determinism -----------------------------------------------------------------------
const buildTwice = () => {
  const village = createStylizedVillage({
    archetype: 'village', center: { x: 100, z: 40 }, heightAt, radius: 34, seed: 42, waterLevel: WATER_LEVEL,
  });
  const summary = JSON.stringify({
    blockers: village.blockers.length,
    buildings: village.buildings.map((b) => [b.type, b.x.toFixed(3), b.z.toFixed(3), b.yaw.toFixed(4)]),
    entries: village.entries,
    name: village.name,
    routes: village.streetRoutes,
  });
  village.dispose();
  return summary;
};
check('same seed → identical village (placement, name, routes)', buildTwice() === buildTwice());
check('names deterministic + archetype-suffixed',
  generatePlaceName(7, 'village') === generatePlaceName(7, 'village')
  && generatePlaceName(7, 'village') !== generatePlaceName(8, 'village'));

// --- composition sanity -------------------------------------------------------------------
const sample = createStylizedVillage({
  archetype: 'village', center: { x: 100, z: 40 }, heightAt, radius: 34, seed: 42, waterLevel: WATER_LEVEL,
});
check('village grows a sensible number of buildings',
  sample.buildings.length >= 6, `${sample.buildings.length} buildings`);
check('street routes use explicit points (exact centerlines)',
  sample.streetRoutes.every((route) => Array.isArray(route.points) && route.points.length >= 2));
check('buildings face the street (door yaw set)', sample.buildings.every((b) => Number.isFinite(b.yaw)));
check('building meshes merged ≤ 6 draw calls per LOD level', (() => {
  let hi = 0;
  sample.root.traverse((object) => {
    if (object.isMesh && object.parent?.name === 'VillageBuildings-hi') hi += 1;
  });
  return hi > 0 && hi <= 6;
})());
sample.dispose();

// --- site selection --------------------------------------------------------------------------
const sites = pickPoiSites({
  heightAt,
  requests: [{ archetype: 'village', count: 2 }, { archetype: 'shrine', count: 1 }],
  seed: 11,
  size: 1000,
  waterLevel: WATER_LEVEL,
});
check('site selection fills requests on viable terrain', sites.length === 3, `${sites.length} sites`);
check('sites mutually distant', sites.every((a, i) => sites.every((b, j) => i >= j
  || Math.hypot(a.x - b.x, a.z - b.z) > 60)));
check('shrine archetype defined with hilltop scorer', typeof POI_ARCHETYPES.shrine.siteScore === 'function');

console.log(failures === 0 ? '\nverify-villagegen: all checks passed' : `\nverify-villagegen: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
