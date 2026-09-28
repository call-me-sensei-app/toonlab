// Regression gate for the deterministic placement scatter helpers, and in
// particular for `scatterOnSurface` — placement onto surfaces that are not
// single-valued in y (cliff caps, ledges, shelves), which the ground-heightfield
// scatterers cannot express.
import assert from 'node:assert/strict';

import {
  combineMasks,
  createCapEdgeWeight,
  scatterInRect,
  scatterOnSurface,
} from '../src/vegetation/scatter.js';

const CAPS = [
  { center: { x: 0, y: 30, z: 0 }, radius: 10, normal: { x: 0, y: 1, z: 0 } },
  // Directly above the first: an (x, z) spacing grid would starve this one.
  { center: { x: 0, y: 60, z: 0 }, radius: 8, normal: { x: 0, y: 1, z: 0 } },
  { center: { x: 40, y: 20, z: 5 }, radius: 6, normal: { x: 0.5, y: 0.8, z: 0 } },
];

const base = { surfaces: CAPS, density: 2, seed: 7, minSpacing: 0.8 };

// --- determinism ------------------------------------------------------------
const first = scatterOnSurface(base);
assert.ok(first.length > 0, 'scatterOnSurface must place something on valid discs');
assert.deepEqual(scatterOnSurface(base), first, 'same inputs must yield the same placements');

// Per-surface streams: adding a surface must not reshuffle the existing ones,
// so an author can add a cap without re-rolling the whole scene.
const extended = scatterOnSurface({
  ...base,
  surfaces: [...CAPS, { center: { x: -40, y: 10, z: 0 }, radius: 5 }],
});
assert.deepEqual(
  extended.filter((p) => p.surfaceIndex === 0),
  first.filter((p) => p.surfaceIndex === 0),
  'adding a surface must not change earlier surfaces',
);

// --- geometry ---------------------------------------------------------------
for (const placement of first) {
  const surface = CAPS[placement.surfaceIndex];
  const distance = Math.hypot(
    placement.x - surface.center.x,
    placement.y - surface.center.y,
    placement.z - surface.center.z,
  );
  assert.ok(distance <= surface.radius + 1e-6, 'placements must stay inside their disc');

  const dot = placement.forward[0] * placement.normal[0]
    + placement.forward[1] * placement.normal[1]
    + placement.forward[2] * placement.normal[2];
  assert.ok(Math.abs(dot) < 1e-6, 'forward must lie in the surface plane');

  const length = Math.hypot(...placement.normal);
  assert.ok(Math.abs(length - 1) < 1e-6, 'normal must be unit length');
}

// Stacked caps must both be populated — the 3D spacing requirement.
for (const index of [0, 1]) {
  assert.ok(
    first.some((p) => p.surfaceIndex === index),
    `stacked cap ${index} must receive placements`,
  );
}

// Spacing is honoured in 3D, not in the ground plane.
let closest = Infinity;
for (let i = 0; i < first.length; i += 1) {
  for (let j = i + 1; j < first.length; j += 1) {
    const distance = Math.hypot(
      first[i].x - first[j].x,
      first[i].y - first[j].y,
      first[i].z - first[j].z,
    );
    if (distance < closest) closest = distance;
  }
}
assert.ok(closest >= 0.8 - 1e-9, `minSpacing must hold in 3D (worst ${closest})`);

// A tilted ledge keeps its own normal rather than snapping to world up.
const tilted = first.find((p) => p.surfaceIndex === 2);
assert.ok(tilted && tilted.normal[0] > 0.4, 'tilted surfaces must keep their normal');

// `normalBlend` leans placements back toward world up without losing the surface.
const leaned = scatterOnSurface({ ...base, normalBlend: 1 });
const leanedTilted = leaned.find((p) => p.surfaceIndex === 2);
assert.ok(
  leanedTilted && leanedTilted.normal[1] > 0.99,
  'normalBlend: 1 must orient placements to world up',
);

// --- masks and weights ------------------------------------------------------
// The existing (x, z) mask factories must compose unchanged.
const masked = scatterOnSurface({ ...base, mask: combineMasks((x) => x < 20) });
assert.ok(masked.length > 0 && masked.every((p) => p.x < 20), '(x, z) masks must compose');

// The rim weight must actually thin the rim.
const weighted = scatterOnSurface({
  surfaces: [CAPS[0]],
  density: 8,
  seed: 3,
  weightAt: createCapEdgeWeight({ rimBias: 0.05, falloff: 0.25 }),
});
const rim = weighted.filter((p) => Math.hypot(p.x, p.z) > 9).length;
const core = weighted.filter((p) => Math.hypot(p.x, p.z) < 5).length;
assert.ok(rim < core, `createCapEdgeWeight must thin the rim (rim ${rim}, core ${core})`);

const soilCapWeight = createCapEdgeWeight({ rimBias: 0.05, falloff: 0.25, break: 0 });
assert.ok(
  soilCapWeight(0.75, 0) <= soilCapWeight(0, 0) * 1.05,
  'default soil-cap weighting must not create a dense outer annulus',
);

// --- counts -----------------------------------------------------------------
const counted = scatterOnSurface({ surfaces: CAPS, count: 120, seed: 5 });
assert.ok(Math.abs(counted.length - 120) <= 3, `count mode must honour the total (${counted.length})`);

const capped = scatterOnSurface({ surfaces: CAPS, density: 500, seed: 5, maxCount: 50 });
assert.ok(capped.length <= 50, 'maxCount must bound the result');

// Degenerate surfaces are skipped rather than throwing.
assert.deepEqual(scatterOnSurface({ surfaces: [{ center: { x: 0, y: 0, z: 0 }, radius: 0 }] }), []);
assert.deepEqual(scatterOnSurface({}), []);

// --- the ground scatterers still behave -------------------------------------
const rect = scatterInRect({ count: 40, seed: 2, minSpacing: 1 });
assert.deepEqual(scatterInRect({ count: 40, seed: 2, minSpacing: 1 }), rect);

console.log(
  `Scatter verified: ${first.length} surface placements across ${CAPS.length} surfaces, `
  + `3D spacing ${closest.toFixed(3)} m, deterministic per surface.`,
);
