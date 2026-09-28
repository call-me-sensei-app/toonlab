// Deterministic placement documents for the FILL-006 review lab.
//
// A placement document is data, not code: `{ figure, at, yaw, activity, path,
// colors }`. That is the shape a scene owner mounts, and the shape the
// register's equivalence test replays — nothing here reads the clock, the
// camera, or `Math.random`.

import { CROWD_FIGURES } from './figureLibrary.js';
import { mulberry32 } from './figureParts.js';

/**
 * Lab ground. Gentle mounding so contact stamps can be graded on slope, faded
 * flat through the line-up band (|z| < 3) so silhouettes compare on one datum.
 */
export function groundHeightAt(x, z) {
  const relief = 0.42 * Math.sin(x * 0.105) * Math.cos(z * 0.086)
    + 0.16 * Math.sin(x * 0.29 + z * 0.21)
    + 0.05 * Math.sin(x * 0.71 - z * 0.63);
  const flat = Math.min(1, Math.max(0, (Math.abs(z) - 3) / 5));
  return relief * flat;
}

// Palette families, so a colourway rotation stays inside the §10 colour
// structure instead of wandering into a hue the scene does not own.
const FAMILIES = {
  accent: ['coral', 'amber', 'teal', 'plum', 'brick'],
  deep: ['slateNavy', 'denimDeep', 'oliveGreen', 'shoeDark', 'strapBrown', 'denim', 'slateMid'],
  hair: ['hairInk', 'hairChestnut', 'hairAsh', 'hairSand', 'hairAuburn'],
  neutral: ['linenWhite', 'paleStone', 'chalk', 'ashGrey', 'greyBlue', 'sandKhaki', 'seafoam', 'skyBlue', 'straw'],
  skin: ['skinPale', 'skinWarm', 'skinTan', 'skinDeep'],
};

const FAMILY_OF = new Map();
for (const [family, names] of Object.entries(FAMILIES)) {
  for (const name of names) FAMILY_OF.set(name, family);
}

/**
 * Rotates a subset of an archetype's palette slots within their own family.
 * This is the §13 anti-repetition tool for people: two instances of one
 * archetype in frame must not share a colourway, and a family-bounded rotation
 * guarantees that without letting the crowd drift off the scene's palette.
 */
function rotateColours(archetype, random, strength = 0.7) {
  const colors = {};
  for (const [slot, name] of Object.entries(archetype.slots)) {
    const family = FAMILY_OF.get(name);
    if (!family || random() > strength) continue;
    const options = FAMILIES[family].filter((option) => option !== name);
    colors[slot] = options[Math.floor(random() * options.length)];
  }
  return colors;
}

/** Everything except the garden figure — the crowd designs. */
const CROWD_ONLY = CROWD_FIGURES.filter((figure) => figure.id !== 'FIG-GARDEN-01');

/**
 * Review population.
 *
 * The first `CROWD_FIGURES.length` placements are the LINE-UP: one instance of
 * every design, evenly spaced on a flat datum, all facing camera, all on
 * `idle`. That row is the silhouette-variety proof — it is what a reviewer
 * grades §13's repetition criterion against.
 *
 * Everything past the line-up is DEPTH-BAND population: seeded positions
 * across five bands from 6 m to 90 m, activities drawn from each archetype's
 * own affinity list, walkers given patrol polylines, and colourways rotated.
 */
export function buildReviewPlacements({ count = 18, seed = 20260815 } = {}) {
  const random = mulberry32(seed);
  const placements = [];

  const lineup = Math.min(count, CROWD_FIGURES.length);
  const span = 2.05;
  for (let i = 0; i < lineup; i += 1) {
    const figure = CROWD_FIGURES[i];
    placements.push({
      activity: figure.id === 'FIG-GARDEN-01' ? 'sit' : 'idle',
      at: [(i - (lineup - 1) / 2) * span, 0],
      figure: figure.id,
      phase: (i * 0.137) % 1,
      // The source rig faces +Z at rest, so yaw 0 looks toward a camera on +Z.
      yaw: 0,
    });
  }

  // Five depth bands. The parity analysis's §4(a) point is that a scene reads
  // its own depth off figures at MULTIPLE distances, so the bands are the
  // deliverable, not the head count.
  const BANDS = [
    { from: 6, to: 14, weight: 0.16 },
    { from: 14, to: 26, weight: 0.24 },
    { from: 26, to: 45, weight: 0.24 },
    { from: 45, to: 68, weight: 0.20 },
    { from: 68, to: 92, weight: 0.16 },
  ];

  for (let i = lineup; i < count; i += 1) {
    const archetype = CROWD_ONLY[Math.floor(random() * CROWD_ONLY.length)];
    let roll = random();
    let band = BANDS[BANDS.length - 1];
    for (const candidate of BANDS) {
      if (roll < candidate.weight) { band = candidate; break; }
      roll -= candidate.weight;
    }
    const depth = band.from + random() * (band.to - band.from);
    const lateral = (random() * 2 - 1) * (7 + depth * 0.55);
    const z = -depth;
    const activity = archetype.activity[Math.floor(random() * archetype.activity.length)];
    const yaw = random() * Math.PI * 2;

    const placement = {
      activity,
      at: [lateral, z],
      colors: rotateColours(archetype, random),
      figure: archetype.id,
      phase: random(),
      yaw,
    };

    // Walkers get somewhere to walk. A short two-leg polyline is enough: the
    // figure is background, and a closed loop is what makes it never arrive.
    if (activity === 'walk' || activity === 'walkSlow' || activity === 'jog') {
      const heading = random() * Math.PI * 2;
      const length = 8 + random() * 16;
      const ax = lateral - Math.sin(heading) * length * 0.5;
      const az = z - Math.cos(heading) * length * 0.5;
      const bx = lateral + Math.sin(heading) * length * 0.5;
      const bz = z + Math.cos(heading) * length * 0.5;
      placement.path = [[ax, az], [bx, bz], [ax, az]];
    }
    placements.push(placement);
  }

  return placements;
}

/**
 * The Stillwater Garden recommendation: ONE figure, seated at the teahouse
 * engawa, still, muted, partly occluded by the eave line.
 *
 * Kept here rather than in the garden scene so the scene owner mounts data
 * they can move, and so this module carries no dependency on a scene that did
 * not exist when it was written. Coordinates are placeholders against doc 20's
 * sketch (teahouse on the east side of the pond, terrace facing west): the
 * scene owner sets `at` and `yaw` from the real terrace mark.
 */
export const STILLWATER_GARDEN_FIGURE = Object.freeze([
  Object.freeze({
    activity: 'sit',
    at: [8.4, -3.2],
    colors: Object.freeze({ robe: 'slateNavy', obi: 'sandKhaki', hair: 'hairInk' }),
    figure: 'FIG-GARDEN-01',
    // Fixed, not seeded: a single hero-adjacent figure must be frame-identical
    // between takes, and a seeded phase would drift if the seed ever moved.
    phase: 0.22,
    yaw: -2.05,
  }),
]);
