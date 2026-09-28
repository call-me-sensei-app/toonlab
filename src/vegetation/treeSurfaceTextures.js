import * as THREE from 'three';

export const TREE_SURFACE_TEXTURE_VERSION = 1;

export const TREE_SURFACE_PROFILES = Object.freeze({
  'call-me-sensei-bark-v1': Object.freeze({
    id: 'call-me-sensei-bark-v1',
    label: 'Call Me Sensei fissured bark',
    shader: Object.freeze({
      bandSoftness: 0.08,
      shadowFloor: 0.48,
      skyFillStrength: 0.06,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.5, 1]),
  }),
  'oak-fissured-v1': Object.freeze({
    id: 'oak-fissured-v1',
    label: 'Stylized fissured oak',
    shader: Object.freeze({
      bandSoftness: 0.08,
      shadowFloor: 0.48,
      skyFillStrength: 0.06,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.5, 1]),
  }),
  // Smooth-barked broadleaf. Beech has no fissures at all: the read is soft
  // mottled patches and faint vertical shading on a pale grey-green ground,
  // which is why it needs its own generator rather than a re-tinted oak.
  // Softer light bands than the fissured profiles, because there is no deep
  // relief for a hard terminator to sit in.
  'beech-smooth-v1': Object.freeze({
    id: 'beech-smooth-v1',
    label: 'Stylized smooth beech',
    shader: Object.freeze({
      bandSoftness: 0.115,
      shadowFloor: 0.54,
      skyFillStrength: 0.07,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.25, 1]),
  }),
  // Papery pale bark with dark horizontal lenticel dashes and the occasional
  // shed-limb patch. The lenticels are the entire silhouette read, so they
  // stay high-contrast and the ground stays near-white.
  'birch-papery-v1': Object.freeze({
    id: 'birch-papery-v1',
    label: 'Stylized papery birch',
    shader: Object.freeze({
      bandSoftness: 0.13,
      shadowFloor: 0.6,
      skyFillStrength: 0.085,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.25, 1]),
  }),
  // Acer palmatum. The read is a fine-grained, cool grey-brown cylinder
  // carrying close vertical striae and scattered pale lenticels, with only a
  // shallow fissure where an old multi-stem trunk has started to split. It is
  // neither smooth like beech nor plated like oak, and a re-tinted oak reads
  // far too coarse on a 4 m tree standing 3 m from the lens.
  'maple-striated-v1': Object.freeze({
    id: 'maple-striated-v1',
    label: 'Stylized striated Japanese maple',
    shader: Object.freeze({
      bandSoftness: 0.1,
      shadowFloor: 0.5,
      skyFillStrength: 0.065,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.35, 1]),
  }),
  // Pinus thunbergii. Black pine bark is the opposite of a ridge-and-furrow
  // profile: thick irregular PLATES, blocky in both axes, separated by deep
  // near-black fissures, with warm ochre showing in the splits. The plate
  // boundaries are cellular, not sinusoidal, which is why this needs its own
  // generator rather than a darker oak — a warped sine gives long vertical
  // ridges and reads as elm at any distance the garden camera works at.
  'pine-plated-v1': Object.freeze({
    id: 'pine-plated-v1',
    label: 'Stylized plated Japanese black pine',
    shader: Object.freeze({
      bandSoftness: 0.065,
      // Higher than a dark bark would suggest, on purpose. A cloud-pruned
      // pine's bare limbs cross its own crown in full view, and they are
      // thin: at the default floor a dark plated bark on a 3 cm twig turned
      // shadow-side goes to near-black and reads as a crack scribbled across
      // the foliage rather than as wood.
      shadowFloor: 0.6,
      skyFillStrength: 0.1,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.6, 1.15]),
  }),
  'bamboo-waxy-v1': Object.freeze({
    id: 'bamboo-waxy-v1',
    label: 'Stylized waxy bamboo culm',
    shader: Object.freeze({
      bandSoftness: 0.1,
      shadowFloor: 0.52,
      skyFillStrength: 0.075,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1, 1]),
  }),
  'yucca-fibrous-v1': Object.freeze({
    id: 'yucca-fibrous-v1',
    label: 'Stylized fibrous Joshua tree',
    shader: Object.freeze({
      bandSoftness: 0.075,
      shadowFloor: 0.46,
      skyFillStrength: 0.055,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1.8, 0.85]),
  }),
  'saguaro-waxy-v1': Object.freeze({
    id: 'saguaro-waxy-v1',
    label: 'Stylized waxy saguaro epidermis',
    shader: Object.freeze({
      bandSoftness: 0.085,
      shadowFloor: 0.62,
      skyFillStrength: 0.085,
    }),
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
    uvRepeat: Object.freeze([1, 0.7]),
  }),
});

export const TREE_SURFACE_PROFILE_DEFAULTS = Object.freeze({
  call_me_sensei: 'call-me-sensei-bark-v1',
});

/**
 * Short bark names an author actually reaches for, mapped onto profile ids.
 *
 * Tree Lab has always spoken in species words ('beech', 'birch', 'oak'), and
 * recipes get authored in the same vocabulary. Without this table those names
 * resolve to nothing and the trunk silently ships bare, so the alias set is
 * part of the contract rather than a convenience.
 */
export const TREE_SURFACE_PROFILE_ALIASES = Object.freeze({
  beech: 'beech-smooth-v1',
  birch: 'birch-papery-v1',
  oak: 'oak-fissured-v1',
  maple: 'maple-striated-v1',
  acer: 'maple-striated-v1',
  'japanese-maple': 'maple-striated-v1',
  pine: 'pine-plated-v1',
  'black-pine': 'pine-plated-v1',
  'japanese-black-pine': 'pine-plated-v1',
  bamboo: 'bamboo-waxy-v1',
  yucca: 'yucca-fibrous-v1',
  saguaro: 'saguaro-waxy-v1',
  classic: 'call-me-sensei-bark-v1',
  call_me_sensei: 'call-me-sensei-bark-v1',
  'call-me-sensei': 'call-me-sensei-bark-v1',
});

/**
 * Resolve a bark reference — a profile id or a short alias — to a profile id.
 * Returns null for anything unregistered so callers can fall back to their own
 * default instead of throwing on a caller-owned asset string.
 */
export function resolveTreeSurfaceProfileId(reference) {
  if (typeof reference !== 'string') return null;
  const key = reference.trim();
  if (!key) return null;
  if (TREE_SURFACE_PROFILES[key]) return key;
  return TREE_SURFACE_PROFILE_ALIASES[key.toLowerCase()] ?? null;
}

export function getTreeSurfaceProfileOptions() {
  return Object.values(TREE_SURFACE_PROFILES).map(({ id, label }) => ({
    id,
    label,
    value: id,
  }));
}

const SURFACE_PROFILE_BY_SPECIES = Object.freeze({
  // Start with one reference species. Additional species only move onto a
  // generated surface after this restrained treatment passes live and export
  // review; sharing a genus is not sufficient evidence by itself.
  'quercus-robur': 'oak-fissured-v1',
  'phyllostachys-edulis': 'bamboo-waxy-v1',
  'yucca-brevifolia': 'yucca-fibrous-v1',
  'carnegiea-gigantea': 'saguaro-waxy-v1',
});

const textureCache = new Map();

function hash2d(x, y, seed) {
  let value = (Math.imul(x + 1, 374761393)
    ^ Math.imul(y + 1, 668265263)
    ^ Math.imul(seed + 1, 2246822519)) >>> 0;
  value = Math.imul(value ^ (value >>> 13), 1274126177) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) / 4294967295;
}

function smooth(value) {
  return value * value * (3 - 2 * value);
}

function periodicValueNoise(x, y, periodX, periodY, seed) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smooth(x - x0);
  const ty = smooth(y - y0);
  const sample = (px, py) => hash2d(
    ((px % periodX) + periodX) % periodX,
    ((py % periodY) + periodY) % periodY,
    seed,
  );
  const a = sample(x0, y0);
  const b = sample(x0 + 1, y0);
  const c = sample(x0, y0 + 1);
  const d = sample(x0 + 1, y0 + 1);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(a, b, tx),
    THREE.MathUtils.lerp(c, d, tx),
    ty,
  );
}

function quantize(value, steps) {
  return Math.round(THREE.MathUtils.clamp(value, 0, 1) * (steps - 1))
    / Math.max(steps - 1, 1);
}

/**
 * Tiling cellular (Worley) noise on a jittered lattice.
 *
 * Returns the nearest and second-nearest feature distances plus a stable
 * per-cell id. Plated bark — pine, and the plated end of the oak family — is
 * a *cellular* pattern: irregular blocks bounded on all sides, each block
 * weathered to its own tone. Warped sine bands cannot express that; they only
 * ever produce long ridges. Periodic in both axes so the trunk tile still
 * wraps, which the sine-based generators above already rely on.
 */
function periodicCellular(x, y, periodX, periodY, seed) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  let best = Infinity;
  let second = Infinity;
  let bestId = 0;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      const cx = xi + dx;
      const cy = yi + dy;
      const wx = ((cx % periodX) + periodX) % periodX;
      const wy = ((cy % periodY) + periodY) % periodY;
      const jx = hash2d(wx, wy, seed);
      const jy = hash2d(wx, wy, seed + 911);
      const fx = cx + 0.15 + jx * 0.7;
      const fy = cy + 0.15 + jy * 0.7;
      const distance = Math.hypot(x - fx, y - fy);
      if (distance < best) {
        second = best;
        best = distance;
        bestId = hash2d(wx, wy, seed + 1733);
      } else if (distance < second) {
        second = distance;
      }
    }
  }
  return { edge: second - best, first: best, id: bestId };
}

function oakFissuredPixel(u, v, seed) {
  // Large vertical plates and a small number of cross-breaks carry the
  // silhouette-scale bark read. Fine photographic pores are intentionally
  // omitted so the result stays compatible with ToonLab's broad color bands.
  const broadNoise = periodicValueNoise(u * 5, v * 5, 5, 5, seed);
  const warp = (broadNoise - 0.5) * 0.36 + Math.sin(v * Math.PI * 4) * 0.035;
  const ridgeCoordinate = u * 11 + warp;
  const ridgePhase = Math.abs((ridgeCoordinate - Math.floor(ridgeCoordinate)) - 0.5) * 2;
  const fissure = 1 - THREE.MathUtils.smoothstep(ridgePhase, 0.08, 0.2);

  const breakNoise = periodicValueNoise(u * 7, v * 7, 7, 7, seed + 17);
  const horizontalCoordinate = v * 3 + (breakNoise - 0.5) * 0.62;
  const horizontalPhase = Math.abs(
    (horizontalCoordinate - Math.floor(horizontalCoordinate)) - 0.5,
  ) * 2;
  const crossBreak = (1 - THREE.MathUtils.smoothstep(horizontalPhase, 0.035, 0.11))
    * THREE.MathUtils.smoothstep(broadNoise, 0.44, 0.72);

  const plateNoise = periodicValueNoise(u * 11, v * 11, 11, 11, seed + 31);
  const plateTone = quantize(0.38 + broadNoise * 0.34 + plateNoise * 0.18, 5);
  const shade = THREE.MathUtils.clamp(
    0.78 + plateTone * 0.35 - fissure * 0.18 - crossBreak * 0.05,
    0.58,
    1.03,
  );
  const warmLift = quantize(periodicValueNoise(u * 3, v * 3, 3, 3, seed + 53), 4);
  return [
    (0.7 + warmLift * 0.065) * shade,
    (0.54 + warmLift * 0.035) * shade,
    (0.39 + warmLift * 0.02) * shade,
  ];
}

function beechSmoothPixel(u, v, seed) {
  // Fagus bark is smooth: no fissures, no plates, no cross-breaks. What reads
  // at silhouette scale is soft overlapping mottle patches on a pale grey
  // ground, a faint vertical grain from the trunk's own taper, and sparse
  // darker healed scars. Quantized like the other profiles so it stays inside
  // ToonLab's broad stylized light bands.
  const broad = periodicValueNoise(u * 3, v * 4, 3, 4, seed + 229);
  const mottle = periodicValueNoise(u * 6, v * 5, 6, 5, seed + 233);
  const fine = periodicValueNoise(u * 13, v * 9, 13, 9, seed + 239);

  // Faint vertical shading bands — a smooth cylinder, not a carved one.
  const grainWarp = (broad - 0.5) * 0.22;
  const grain = (Math.sin((u * 4 + grainWarp) * Math.PI * 2) * 0.5 + 0.5) * 0.06;

  // Sparse healed scars: small, soft, and far apart. They are the only dark
  // marks on a smooth trunk, so they are deliberately rare.
  const scarNoise = periodicValueNoise(u * 9, v * 11, 9, 11, seed + 241);
  const scar = THREE.MathUtils.smoothstep(scarNoise, 0.87, 0.98) * 0.16;

  const tone = quantize(0.46 + broad * 0.28 + mottle * 0.18 + fine * 0.06, 5);
  const shade = THREE.MathUtils.clamp(0.74 + tone * 0.34 + grain - scar, 0.62, 1.04);
  // Pale grey-green ground: green and blue close together, red held under both.
  const coolLift = quantize(periodicValueNoise(u * 2, v * 3, 2, 3, seed + 251), 4);
  return [
    (0.62 + coolLift * 0.035) * shade,
    (0.63 + coolLift * 0.03) * shade,
    (0.58 + coolLift * 0.04) * shade,
  ];
}

function birchPaperyPixel(u, v, seed) {
  // Betula reads as a near-white papery ground carrying dark horizontal
  // lenticel dashes. The dashes are the whole identity, so they keep hard
  // edges and high contrast while the ground stays almost flat.
  const broad = periodicValueNoise(u * 4, v * 3, 4, 3, seed + 257);
  const paper = periodicValueNoise(u * 11, v * 7, 11, 7, seed + 263);

  // Lenticels: short horizontal strokes, banded in v, broken up in u so they
  // do not run all the way around the trunk.
  const bandNoise = periodicValueNoise(u * 5, v * 13, 5, 13, seed + 269);
  const bandPhase = Math.abs(
    ((v * 14 + (bandNoise - 0.5) * 0.5) % 1 + 1) % 1 - 0.5,
  ) * 2;
  const bandMask = 1 - THREE.MathUtils.smoothstep(bandPhase, 0.05, 0.16);
  const breakNoise = periodicValueNoise(u * 17, v * 13, 17, 13, seed + 271);
  const lenticel = bandMask * THREE.MathUtils.smoothstep(breakNoise, 0.36, 0.6);

  // Occasional large dark patch where a limb was shed.
  const shedNoise = periodicValueNoise(u * 3, v * 5, 3, 5, seed + 277);
  const shed = THREE.MathUtils.smoothstep(shedNoise, 0.84, 0.99);

  const tone = quantize(0.78 + broad * 0.12 + paper * 0.1, 4);
  const shade = THREE.MathUtils.clamp(
    0.86 + tone * 0.22 - lenticel * 0.52 - shed * 0.3,
    0.3,
    1.05,
  );
  // Warm-white paper; the dashes darken all three channels together so they
  // read as value, not as a hue shift.
  const warmLift = quantize(periodicValueNoise(u * 2, v * 4, 2, 4, seed + 281), 3);
  return [
    (0.89 + warmLift * 0.03) * shade,
    (0.87 + warmLift * 0.025) * shade,
    (0.81 + warmLift * 0.02) * shade,
  ];
}

function mapleStriatedPixel(u, v, seed) {
  // Acer palmatum. Three things carry the read and nothing else should
  // compete with them: close vertical striae (fine pale lines, ~2 mm apart on
  // the real thing), a soft grey-brown mottle underneath, and scattered pale
  // lenticels. A single shallow fissure family is allowed for the old
  // multi-stem trunks the garden uses, but at a fraction of oak's depth —
  // maple is a fine-grained bark and reading it as fissured is the classic
  // way a stylized maple ends up looking like a small oak.
  const broad = periodicValueNoise(u * 3, v * 4, 3, 4, seed + 307);
  const mottle = periodicValueNoise(u * 7, v * 6, 7, 6, seed + 311);

  // Close vertical striae. Two incommensurate frequencies keep them from
  // reading as a comb; the warp keeps them from reading as a ruled grid.
  const striaWarp = (broad - 0.5) * 0.28 + Math.sin(v * Math.PI * 6) * 0.02;
  const striaA = Math.sin((u * 26 + striaWarp) * Math.PI * 2) * 0.5 + 0.5;
  const striaB = Math.sin((u * 41 - striaWarp * 0.7) * Math.PI * 2) * 0.5 + 0.5;
  const stria = striaA * 0.68 + striaB * 0.32;

  // Shallow age fissures: sparse, narrow, and much weaker than oak's.
  const fissureWarp = (mottle - 0.5) * 0.4;
  const fissureCoordinate = u * 7 + fissureWarp;
  const fissurePhase = Math.abs(
    (fissureCoordinate - Math.floor(fissureCoordinate)) - 0.5,
  ) * 2;
  const fissure = (1 - THREE.MathUtils.smoothstep(fissurePhase, 0.03, 0.1))
    * THREE.MathUtils.smoothstep(broad, 0.52, 0.86);

  // Lenticels: small pale flecks, brighter than the ground, sparse.
  const lenticelNoise = periodicValueNoise(u * 15, v * 19, 15, 19, seed + 313);
  const lenticel = THREE.MathUtils.smoothstep(lenticelNoise, 0.9, 0.99) * 0.2;

  const tone = quantize(0.3 + broad * 0.24 + mottle * 0.18 + stria * 0.2, 5);
  const shade = THREE.MathUtils.clamp(
    0.6 + tone * 0.42 + stria * 0.14 + lenticel - fissure * 0.26,
    0.42,
    1.02,
  );
  // Cool grey-brown, and genuinely dark: an Acer palmatum trunk is a middle
  // value, not a pale one. A washed-out ground was the first version's real
  // failure — against the deep-green field of §2 a pale trunk pulls the eye
  // to the wood instead of to the autumn canopy it is supposed to support.
  // Red only a little above green, blue held back but not starved, which is
  // what separates maple from both the warm oak family and the near-neutral
  // beech.
  const warmLift = quantize(periodicValueNoise(u * 2, v * 3, 2, 3, seed + 317), 4);
  return [
    (0.52 + warmLift * 0.05) * shade,
    (0.46 + warmLift * 0.035) * shade,
    (0.42 + warmLift * 0.035) * shade,
  ];
}

function pinePlatedPixel(u, v, seed) {
  // Pinus thunbergii. Thick irregular plates, blocky in BOTH axes, separated
  // by deep near-black fissures with warm ochre showing in the splits. The
  // plates are cellular, so they come from periodicCellular rather than from
  // a warped band; each cell is weathered to its own tone, which is the whole
  // close-camera read. A second, finer cellular pass breaks the large plates
  // into the scaly sub-plates the species is named for.
  const broad = periodicValueNoise(u * 4, v * 5, 4, 5, seed + 331);
  const warpX = (broad - 0.5) * 0.55;
  const warpY = (periodicValueNoise(u * 5, v * 4, 5, 4, seed + 337) - 0.5) * 0.45;

  // Large plates. The lattice is sampled at 7 x 6 over a tile that is itself
  // 1:2, so a cell spans roughly twice the trunk height it spans in
  // circumference and the plates come out clearly ELONGATED along the trunk.
  // Equal periods gave near-round cells, which read as dried mud rather than
  // as pine, and that was the first version's real failure.
  const plate = periodicCellular(u * 7 + warpX, v * 6 + warpY, 7, 6, seed + 347);
  // Scales inside each plate.
  const scale = periodicCellular(u * 15 + warpX * 0.5, v * 13 + warpY * 0.5, 15, 13, seed + 353);

  // Fissure = the cell boundary. Deep and hard-edged for the plate network,
  // shallow and soft for the scale network. Narrower than the first version:
  // a black pine's fissures are deep, not wide, and widening them turns the
  // plate network into a grout grid.
  const plateFissure = 1 - THREE.MathUtils.smoothstep(plate.edge, 0.02, 0.1);
  const scaleFissure = (1 - THREE.MathUtils.smoothstep(scale.edge, 0.015, 0.075)) * 0.36;
  const fissure = Math.min(1, plateFissure + scaleFissure * (1 - plateFissure));

  // Per-plate weathering. Quantized hard so plates group into ToonLab's broad
  // value bands instead of dissolving into per-pixel grain.
  const plateTone = quantize(plate.id, 4);
  const scaleTone = quantize(scale.id, 3);
  const grain = periodicValueNoise(u * 21, v * 27, 21, 27, seed + 359);

  // The tile is a MULTIPLIER, not a final colour: the woody material takes
  // `map x trunk.color` and then tone-maps it. Authoring black pine at the
  // absolute value real black pine bark reads at put the tile around byte 76
  // — half the value of every other profile in this file — and the trunk came
  // out a featureless black cylinder in which none of the plate work was
  // visible at 85 mm. The plate-to-fissure CONTRAST is what carries the
  // species; the overall level has to sit with its neighbours.
  const shade = THREE.MathUtils.clamp(
    0.72 + plateTone * 0.34 + scaleTone * 0.1 + grain * 0.07 - fissure * 0.46,
    0.32,
    1.12,
  );
  // Dark grey-charcoal plate faces; the fissures let a little warm brown
  // through, so red is lifted exactly where the value drops. Without any
  // warmth the trunk reads as wet slate — but the first version overdid it
  // and the fissure network glowed orange like fired brick, so the lift is
  // now a fraction of what it was and stays under the value drop.
  const ochre = fissure * (0.35 + plateTone * 0.4);
  return [
    (0.45 + ochre * 0.17) * shade,
    (0.44 + ochre * 0.08) * shade,
    (0.43 + ochre * 0.02) * shade,
  ];
}

function bambooWaxyPixel(u, v, seed) {
  // Moso culms read as smooth gray-green cylinders with restrained vertical
  // striation and irregular wax bloom. Nodes remain semantic ring geometry;
  // they are deliberately not painted into this tile so internode length can
  // vary without duplicated fake joints.
  const broad = periodicValueNoise(u * 5, v * 3, 5, 3, seed + 71);
  const streakWarp = (broad - 0.5) * 0.18;
  const streakPhase = (
    Math.sin((u * 9 + streakWarp) * Math.PI * 2) * 0.5 + 0.5
  );
  const wax = quantize(
    periodicValueNoise(u * 7, v * 7, 7, 7, seed + 89),
    5,
  );
  const ageMottle = quantize(
    periodicValueNoise(u * 3, v * 4, 3, 4, seed + 107),
    4,
  );
  const shade = THREE.MathUtils.clamp(
    0.82 + broad * 0.12 + streakPhase * 0.035 + wax * 0.045,
    0.78,
    1.03,
  );
  return [
    (0.43 + ageMottle * 0.055) * shade,
    (0.57 + wax * 0.055) * shade,
    (0.43 + wax * 0.035) * shade,
  ];
}

function yuccaFibrousPixel(u, v, seed) {
  // Joshua bark is built from coarse, persistent leaf-base fibers. Use a
  // restrained vertical weave plus sparse horizontal scars; no vendor or
  // photographic texture pixels are sampled. Quantized values keep the
  // pattern compatible with ToonLab's broad stylized light bands.
  const broad = periodicValueNoise(u * 5, v * 6, 5, 6, seed + 131);
  const warp = (broad - 0.5) * 0.34
    + Math.sin(v * Math.PI * 5) * 0.025;
  const strand = Math.sin((u * 19 + warp) * Math.PI * 2) * 0.5 + 0.5;
  const secondary = Math.sin((u * 31 - warp * 0.6) * Math.PI * 2) * 0.5 + 0.5;
  const scarNoise = periodicValueNoise(u * 7, v * 7, 7, 7, seed + 149);
  const scarPhase = Math.abs(
    ((v * 8 + (scarNoise - 0.5) * 0.42) % 1 + 1) % 1 - 0.5,
  ) * 2;
  const leafScar = 1 - THREE.MathUtils.smoothstep(scarPhase, 0.05, 0.14);
  const tone = quantize(
    0.42 + broad * 0.24 + strand * 0.2 + secondary * 0.07 - leafScar * 0.09,
    6,
  );
  const shade = THREE.MathUtils.clamp(0.68 + tone * 0.46, 0.62, 1.04);
  return [
    (0.53 + broad * 0.055) * shade,
    (0.44 + broad * 0.04) * shade,
    (0.31 + broad * 0.025) * shade,
  ];
}

function saguaroWaxyPixel(u, v, seed) {
  // The ribs are real geometry; this tile supplies only the restrained wax
  // bloom, age mottling, and faint vertical water streaks visible between
  // them. It is generated from noise and bands, never sampled from the NPS,
  // botanical-reference or third-party reference pixels.
  const broad = periodicValueNoise(u * 4, v * 5, 4, 5, seed + 173);
  const bloom = quantize(
    periodicValueNoise(u * 7, v * 7, 7, 7, seed + 191),
    5,
  );
  const streakWarp = (broad - 0.5) * 0.15;
  const streak = Math.sin((u * 13 + streakWarp) * Math.PI * 2) * 0.5 + 0.5;
  const ageBand = quantize(
    periodicValueNoise(u * 3, v * 4, 3, 4, seed + 211),
    4,
  );
  const shade = THREE.MathUtils.clamp(
    0.82 + broad * 0.12 + bloom * 0.055 - streak * 0.025,
    0.78,
    1.02,
  );
  return [
    (0.34 + ageBand * 0.045) * shade,
    (0.6 + bloom * 0.06) * shade,
    (0.4 + bloom * 0.04) * shade,
  ];
}

function surfacePixel(profileId, u, v, seed) {
  if (profileId === 'call-me-sensei-bark-v1' || profileId === 'oak-fissured-v1') {
    return oakFissuredPixel(u, v, seed);
  }
  if (profileId === 'beech-smooth-v1') return beechSmoothPixel(u, v, seed);
  if (profileId === 'birch-papery-v1') return birchPaperyPixel(u, v, seed);
  if (profileId === 'maple-striated-v1') return mapleStriatedPixel(u, v, seed);
  if (profileId === 'pine-plated-v1') return pinePlatedPixel(u, v, seed);
  if (profileId === 'bamboo-waxy-v1') return bambooWaxyPixel(u, v, seed);
  if (profileId === 'yucca-fibrous-v1') return yuccaFibrousPixel(u, v, seed);
  if (profileId === 'saguaro-waxy-v1') return saguaroWaxyPixel(u, v, seed);
  throw new Error(`No surface generator registered for "${profileId}".`);
}

export function treeSurfaceProfileId(speciesProfileOrId) {
  const id = typeof speciesProfileOrId === 'string'
    ? speciesProfileOrId
    : speciesProfileOrId?.id;
  return SURFACE_PROFILE_BY_SPECIES[id] ?? null;
}

export function treeSurfaceProfile(speciesProfileOrId) {
  const profileId = treeSurfaceProfileId(speciesProfileOrId);
  return profileId ? TREE_SURFACE_PROFILES[profileId] : null;
}

export function createTreeSurfaceTextureData({
  profileId,
  resolution = 128,
  seed = 1,
} = {}) {
  if (!TREE_SURFACE_PROFILES[profileId]) {
    throw new Error(`Unknown tree surface profile "${profileId}".`);
  }
  const width = Math.max(16, Math.round(resolution));
  const height = width * 2;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const v = y / height;
    for (let x = 0; x < width; x += 1) {
      const u = x / width;
      const color = surfacePixel(profileId, u, v, seed);
      const offset = (y * width + x) * 4;
      data[offset] = Math.round(THREE.MathUtils.clamp(color[0], 0, 1) * 255);
      data[offset + 1] = Math.round(THREE.MathUtils.clamp(color[1], 0, 1) * 255);
      data[offset + 2] = Math.round(THREE.MathUtils.clamp(color[2], 0, 1) * 255);
      data[offset + 3] = 255;
    }
  }
  return Object.freeze({
    data,
    height,
    profileId,
    seed,
    version: TREE_SURFACE_TEXTURE_VERSION,
    width,
  });
}

export function createTreeSurfaceTexture({
  profileId,
  resolution = 128,
  seed = 1,
} = {}) {
  const cacheKey = `${profileId}:${resolution}:${seed}`;
  if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);
  const generated = createTreeSurfaceTextureData({ profileId, resolution, seed });
  const texture = new THREE.DataTexture(
    generated.data,
    generated.width,
    generated.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  texture.name = `ToonLabTreeSurface.${profileId}.${seed}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  const uvRepeat = TREE_SURFACE_PROFILES[profileId].uvRepeat ?? [1, 1];
  texture.repeat.set(uvRepeat[0], uvRepeat[1]);
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.anisotropy = 4;
  texture.userData = {
    generatedBy: 'toonlab/tree-surface-texture',
    profileId,
    seed,
    textureVersion: TREE_SURFACE_TEXTURE_VERSION,
  };
  texture.needsUpdate = true;
  textureCache.set(cacheKey, texture);
  return texture;
}

export function treeSurfaceTextureForSpecies(speciesProfileOrId, options = {}) {
  const profileId = treeSurfaceProfileId(speciesProfileOrId);
  return profileId ? createTreeSurfaceTexture({ ...options, profileId }) : null;
}
