// Pathgen verification — no browser needed. Mirrors verify-rockgen.mjs:
// determinism (same seed → identical geometry), structural invariants
// (bridges over water, heightAt/maskAt contracts, budgets), and recipe
// round-trips. Run with: node scripts/verify-pathgen.mjs

import process from 'node:process';

import {
  createStylizedPaths,
  createStylizedPathsFromRecipe,
} from '../src/pathgen/index.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

// Deterministic synthetic terrain: rolling hills with a river channel along
// x ≈ 0 that dips well below the waterline, so a west↔east route must cross.
const WATER_LEVEL = 4;
function heightAt(x, z) {
  const hills = 10 + 6 * Math.sin(x / 90) * Math.cos(z / 110) + 2.2 * Math.sin(z / 41);
  const river = 13 * Math.exp(-((x / 26) ** 2));
  return hills - river;
}

function hashGeometryPositions(root) {
  let hash = 0x811c9dc5;
  const feed = (value) => {
    // quantize to mm so float noise can't flake the hash
    const quantized = Math.round(value * 1000);
    hash ^= quantized & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (quantized >> 16) & 0xff;
    hash = Math.imul(hash, 0x01000193);
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

function buildNetwork(seed = 42) {
  return createStylizedPaths({
    auto: { count: 4, styles: ['dirt', 'stone'] },
    heightAt,
    seed,
    size: 1000,
    waterLevel: WATER_LEVEL,
  });
}

// --- determinism -----------------------------------------------------------
const startedAt = performance.now();
const a = buildNetwork(42);
const buildMs = performance.now() - startedAt;
const b = buildNetwork(42);
const c = buildNetwork(43);

const hashA = hashGeometryPositions(a.root);
const hashB = hashGeometryPositions(b.root);
const hashC = hashGeometryPositions(c.root);
check('same seed → identical geometry', hashA === hashB, `${hashA} vs ${hashB}`);
check('different seed → different geometry', hashA !== hashC, `${hashA} vs ${hashC}`);
check('routes were built', a.routes.length >= 3, `routes=${a.routes.length}`);
check('build under 1 s budget', buildMs < 1000, `${buildMs.toFixed(0)} ms`);

// --- explicit route with a forced river crossing ----------------------------
const crossing = createStylizedPaths({
  heightAt,
  routes: [{ from: [-220, -180], style: 'dirt', to: [220, 160] }],
  seed: 7,
  size: 1000,
  waterLevel: WATER_LEVEL,
});
check('river crossing generates a bridge', crossing.bridges.length >= 1,
  `bridges=${crossing.bridges.length}`);
check('bridge rails registered blockers', crossing.blockers.length > 4,
  `blockers=${crossing.blockers.length}`);

// Deck must clear the waterline mid-crossing.
const route = crossing.routes[0];
const bridgeInfo = route.bridges[0];
check('bridge exists on route', Boolean(bridgeInfo));
if (bridgeInfo) {
  const wetSamples = route.samples.filter((sample) => sample.bridge);
  const minDeck = Math.min(...wetSamples.map((sample) => sample.profile));
  check('deck clears the waterline', minDeck >= WATER_LEVEL + 0.9,
    `minDeck=${minDeck.toFixed(2)} water=${WATER_LEVEL}`);
}

// --- heightAt / maskAt contracts --------------------------------------------
const mid = route.samples[Math.floor(route.samples.length / 2)];
const on = crossing.heightAt(mid.x, mid.z);
check('paths.heightAt reports the flattened profile on-path',
  Math.abs(on - (mid.profile + 0.07)) < 0.35,
  `heightAt=${on.toFixed(2)} profile=${mid.profile.toFixed(2)}`);
check('paths.maskAt ≈ 1 at the centerline', crossing.maskAt(mid.x, mid.z) > 0.85,
  `mask=${crossing.maskAt(mid.x, mid.z).toFixed(2)}`);
// Probe perpendicular to the route so the point is genuinely off-path.
const farX = mid.x + mid.sideX * 60;
const farZ = mid.z + mid.sideZ * 60;
const far = crossing.maskAt(farX, farZ);
check('paths.maskAt = 0 far off-path', far === 0, `mask=${far}`);
const rawFar = heightAt(farX, farZ);
check('paths.heightAt = raw far off-path',
  Math.abs(crossing.heightAt(farX, farZ) - rawFar) < 1e-9);

// --- budgets -----------------------------------------------------------------
check('triangle budget (≤ 40k for 4 routes at 1 km)', a.stats.triangles <= 40000,
  `triangles=${a.stats.triangles}`);
const styleDrawCalls = a.root.children.filter((child) => child.isMesh).length;
check('one draw call per style (+ stairs)', styleDrawCalls <= 4,
  `meshes=${styleDrawCalls}`);

// --- recipe round-trip ---------------------------------------------------------
const rebuilt = createStylizedPathsFromRecipe(a.recipe, {
  heightAt,
  size: 1000,
  waterLevel: WATER_LEVEL,
});
check('recipe round-trip rebuilds identical geometry',
  hashGeometryPositions(rebuilt.root) === hashA);

// --- splines -------------------------------------------------------------------
const spline = a.splines[0];
check('splines expose getPointAt/getLength',
  typeof spline?.getPointAt === 'function' && spline.getLength() > 10);

console.log(failures === 0 ? '\nverify-pathgen: all checks passed' : `\nverify-pathgen: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
