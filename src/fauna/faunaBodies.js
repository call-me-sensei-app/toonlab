// Procedural low-poly fauna bodies — seeded, palette-driven, no model files.
// Same philosophy as debrisgen pieces: geometry + vertex color carry the
// whole read. Bodies are silhouette-first (a bird must read at 100 m), with
// anime cel shading BAKED into the vertex colors (lit top, cool shaded
// underside): the meshes render UNLIT, exactly like the forest billboard
// impostors — distant creatures with no scene-light dependency never turn
// near-black against a bright sky, which is how modern anime layers its
// ambient life. Near-field hosts that want scene lighting can still rebuild
// with their own material; the geometry carries plain `color` attributes.
//
// Every geometry ships two animation attributes consumed by the fauna TSL
// vertex stage (see stylizedFauna.js):
//   aWing — signed lateral extent from the spine in model meters (0 = body);
//           drives the pseudo-rotation wing flap.
//   aTail — 0 at the nose → 1 at the tail tip; drives the fish body sway.
//
// Model conventions: forward = +Z, up = +Y, wings along ±X, real-world
// meters at scale 1.

import * as THREE from 'three';

import { hashCombine } from './boids.js';
import { FAUNA_PALETTE_IDS } from './faunaSettings.js';

export { hashCombine };

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Palette colors are authored in sRGB and stored linear (vertex colors feed
// the node material's working space, same as the tree-export bake).
const colorScratch = new THREE.Color();
function srgb(r, g, b) {
  colorScratch.setRGB(r, g, b, THREE.SRGBColorSpace);
  return [colorScratch.r, colorScratch.g, colorScratch.b];
}

// ---------------------------------------------------------------- palettes
//
// Each palette entry is a list of variant schemes; the scheme count is the
// species' variant count (2–4 per the fauna plan). Ids must match
// FAUNA_PALETTE_IDS in faunaSettings.js.

export const BIRD_PALETTES = Object.freeze({
  swallow: [
    { back: srgb(0.16, 0.2, 0.42), belly: srgb(0.96, 0.93, 0.84), throat: srgb(0.82, 0.42, 0.25), wing: srgb(0.12, 0.15, 0.34), tip: srgb(0.07, 0.09, 0.2) },
    { back: srgb(0.2, 0.3, 0.52), belly: srgb(0.98, 0.97, 0.94), throat: srgb(0.9, 0.55, 0.3), wing: srgb(0.14, 0.2, 0.42), tip: srgb(0.08, 0.11, 0.24) },
    { back: srgb(0.13, 0.14, 0.24), belly: srgb(0.88, 0.86, 0.82), throat: srgb(0.7, 0.32, 0.22), wing: srgb(0.1, 0.11, 0.2), tip: srgb(0.05, 0.06, 0.12) },
  ],
  egret: [
    { back: srgb(0.97, 0.97, 0.95), belly: srgb(1.0, 1.0, 0.98), throat: srgb(0.98, 0.95, 0.88), wing: srgb(0.88, 0.9, 0.92), tip: srgb(0.28, 0.3, 0.36) },
    { back: srgb(0.78, 0.82, 0.88), belly: srgb(0.95, 0.96, 0.97), throat: srgb(0.9, 0.9, 0.9), wing: srgb(0.6, 0.66, 0.76), tip: srgb(0.2, 0.24, 0.32) },
    { back: srgb(0.92, 0.9, 0.86), belly: srgb(0.99, 0.98, 0.94), throat: srgb(0.95, 0.9, 0.8), wing: srgb(0.8, 0.78, 0.74), tip: srgb(0.32, 0.28, 0.26) },
  ],
  finch: [
    { back: srgb(0.55, 0.38, 0.2), belly: srgb(0.95, 0.85, 0.62), throat: srgb(0.92, 0.62, 0.28), wing: srgb(0.4, 0.28, 0.16), tip: srgb(0.2, 0.14, 0.09) },
    { back: srgb(0.72, 0.52, 0.22), belly: srgb(0.98, 0.92, 0.72), throat: srgb(0.95, 0.75, 0.3), wing: srgb(0.55, 0.38, 0.17), tip: srgb(0.26, 0.18, 0.1) },
    { back: srgb(0.45, 0.42, 0.3), belly: srgb(0.9, 0.88, 0.74), throat: srgb(0.85, 0.6, 0.35), wing: srgb(0.34, 0.32, 0.24), tip: srgb(0.16, 0.15, 0.12) },
  ],
});

export const BUTTERFLY_PALETTES = Object.freeze({
  meadow: [
    { wing: srgb(0.95, 0.52, 0.12), rim: srgb(0.16, 0.1, 0.07), accent: srgb(0.99, 0.78, 0.32), body: srgb(0.14, 0.1, 0.08) },   // monarch
    { wing: srgb(0.25, 0.55, 0.98), rim: srgb(0.06, 0.1, 0.28), accent: srgb(0.6, 0.85, 1.0), body: srgb(0.08, 0.09, 0.16) },   // morpho
    { wing: srgb(0.97, 0.97, 0.92), rim: srgb(0.35, 0.4, 0.3), accent: srgb(0.85, 0.92, 0.75), body: srgb(0.2, 0.22, 0.16) },   // cabbage white
    { wing: srgb(0.98, 0.88, 0.25), rim: srgb(0.3, 0.2, 0.06), accent: srgb(1.0, 0.95, 0.55), body: srgb(0.18, 0.14, 0.06) },   // sulphur
  ],
  twilight: [
    { wing: srgb(0.5, 0.3, 0.75), rim: srgb(0.12, 0.06, 0.2), accent: srgb(0.78, 0.55, 0.95), body: srgb(0.1, 0.07, 0.14) },
    { wing: srgb(0.2, 0.62, 0.62), rim: srgb(0.05, 0.18, 0.18), accent: srgb(0.5, 0.9, 0.85), body: srgb(0.06, 0.14, 0.13) },
    { wing: srgb(0.9, 0.86, 0.74), rim: srgb(0.42, 0.36, 0.26), accent: srgb(0.98, 0.95, 0.85), body: srgb(0.25, 0.21, 0.15) },
  ],
});

export const DRAGONFLY_PALETTES = Object.freeze({
  pond: [
    { body: srgb(0.92, 0.24, 0.14), thorax: srgb(0.75, 0.18, 0.12), eye: srgb(0.55, 0.16, 0.12), wing: srgb(0.85, 0.9, 0.95) }, // akatombo
    { body: srgb(0.25, 0.75, 0.9), thorax: srgb(0.16, 0.5, 0.64), eye: srgb(0.14, 0.32, 0.42), wing: srgb(0.85, 0.92, 0.97) },
    { body: srgb(0.36, 0.72, 0.45), thorax: srgb(0.24, 0.5, 0.34), eye: srgb(0.2, 0.35, 0.25), wing: srgb(0.88, 0.93, 0.9) },
  ],
  ember: [
    { body: srgb(0.95, 0.32, 0.12), thorax: srgb(0.72, 0.22, 0.1), eye: srgb(0.5, 0.16, 0.08), wing: srgb(0.95, 0.88, 0.8) },
    { body: srgb(0.97, 0.65, 0.18), thorax: srgb(0.75, 0.46, 0.12), eye: srgb(0.5, 0.28, 0.1), wing: srgb(0.96, 0.92, 0.85) },
  ],
});

export const FISH_PALETTES = Object.freeze({
  koi: [
    { base: srgb(1.0, 0.99, 0.95), patch: srgb(0.98, 0.3, 0.05), belly: srgb(1.0, 1.0, 0.98), fin: srgb(1.0, 0.9, 0.8), patchiness: 0.85 },      // kohaku
    { base: srgb(1.0, 0.78, 0.18), patch: srgb(1.0, 0.92, 0.45), belly: srgb(1.0, 0.96, 0.72), fin: srgb(1.0, 0.85, 0.42), patchiness: 0.35 },   // yamabuki
    // Benigoi (solid vermilion), not asagi: blue-grey koi vanish against a
    // teal water body — warm hues are what read through the refraction.
    { base: srgb(1.0, 0.42, 0.08), patch: srgb(0.85, 0.25, 0.04), belly: srgb(1.0, 0.72, 0.45), fin: srgb(1.0, 0.55, 0.25), patchiness: 0.3 },
    { base: srgb(0.98, 0.97, 0.94), patch: srgb(0.14, 0.14, 0.18), belly: srgb(1.0, 0.99, 0.97), fin: srgb(0.95, 0.93, 0.9), patchiness: 0.6 },  // shiro bekko
  ],
  silver: [
    { base: srgb(0.72, 0.78, 0.85), patch: srgb(0.45, 0.55, 0.68), belly: srgb(0.92, 0.95, 0.97), fin: srgb(0.62, 0.7, 0.8), patchiness: 0.0 },
    { base: srgb(0.55, 0.65, 0.72), patch: srgb(0.35, 0.45, 0.55), belly: srgb(0.85, 0.9, 0.92), fin: srgb(0.5, 0.6, 0.68), patchiness: 0.0 },
    { base: srgb(0.6, 0.68, 0.6), patch: srgb(0.4, 0.48, 0.42), belly: srgb(0.88, 0.92, 0.86), fin: srgb(0.55, 0.62, 0.55), patchiness: 0.0 },
  ],
});

const SPECIES_PALETTES = Object.freeze({
  birds: BIRD_PALETTES,
  butterflies: BUTTERFLY_PALETTES,
  dragonflies: DRAGONFLY_PALETTES,
  fish: FISH_PALETTES,
});

function resolvePalette(species, paletteId) {
  const palettes = SPECIES_PALETTES[species];
  const fallback = FAUNA_PALETTE_IDS[species][0];
  return palettes[paletteId] ?? palettes[fallback];
}

/** Variant count a species/palette pair provides (drives instancing splits). */
export function getFaunaVariantCount(species, paletteId) {
  return resolvePalette(species, paletteId).length;
}

// ------------------------------------------------------------- mesh builder

class FaunaMeshBuilder {
  constructor() {
    this.positions = [];
    this.colors = [];
    this.wing = [];
    this.tail = [];
    this.indices = [];
  }

  vertex(x, y, z, color, wingExt = 0, tailWeight = 0) {
    const index = this.positions.length / 3;
    this.positions.push(x, y, z);
    this.colors.push(color[0], color[1], color[2]);
    this.wing.push(wingExt);
    this.tail.push(tailWeight);
    return index;
  }

  tri(a, b, c) {
    this.indices.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.indices.push(a, b, c, a, c, d);
  }

  build(name) {
    const geometry = new THREE.BufferGeometry();
    geometry.name = name;
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.setAttribute('aWing', new THREE.Float32BufferAttribute(this.wing, 1));
    geometry.setAttribute('aTail', new THREE.Float32BufferAttribute(this.tail, 1));
    geometry.setIndex(this.indices);
    return geometry;
  }
}

// Anime cel bake: a soft two-tone by "how much this surface faces the sky",
// with the terminator pushed low so bodies stay bright and the underside
// carries a cool shadow tint (matches the environment shadowTint family).
function shadeTone(color, upness, lift = 1) {
  const t = Math.min(1, Math.max(0, (upness + 0.55) / 1.05));
  const band = t < 0.42 ? 0.0 : t < 0.58 ? (t - 0.42) / 0.16 : 1.0; // soft cel step
  // `lift` raises the whole tone (shadow floor included) — tiny bodies like
  // dragonflies otherwise read as black flecks from their shaded side.
  const lit = (0.72 + 0.34 * band) * lift;
  return [
    color[0] * (lit * (band < 1 ? 0.96 : 1)) + (1 - band) * 0.015,
    color[1] * lit + (1 - band) * 0.02,
    color[2] * (lit * 1.02) + (1 - band) * 0.05, // shadow side drifts cool/blue
  ];
}

function mixColor(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

// Elliptical lathe around +Z with per-station color pickers. `colorAt(station,
// upness, angle)` returns the vertex color BEFORE the cel bake.
function lathe(builder, stations, { radial = 6, squashX = 1, colorAt, tailAt = null, shadeLift = 1 }) {
  const rings = [];
  for (let s = 0; s < stations.length; s += 1) {
    const st = stations[s];
    const ring = [];
    for (let k = 0; k < radial; k += 1) {
      const a = (k / radial) * Math.PI * 2;
      const nx = Math.cos(a) * squashX;
      const ny = Math.sin(a);
      const base = colorAt(st, ny, a);
      const color = shadeTone(base, ny, shadeLift);
      ring.push(builder.vertex(
        nx * st.r, st.y + ny * st.r, st.z, color, 0,
        tailAt ? tailAt(st.z) : 0,
      ));
    }
    rings.push(ring);
  }
  for (let s = 0; s < rings.length - 1; s += 1) {
    for (let k = 0; k < radial; k += 1) {
      const k2 = (k + 1) % radial;
      builder.quad(rings[s][k], rings[s][k2], rings[s + 1][k2], rings[s + 1][k]);
    }
  }
  return rings;
}

function capRing(builder, ring, z, y, color, tailWeight = 0) {
  const center = builder.vertex(0, y, z, shadeTone(color, 0.4), 0, tailWeight);
  for (let k = 0; k < ring.length; k += 1) {
    builder.tri(ring[k], ring[(k + 1) % ring.length], center);
  }
}

// ------------------------------------------------------------------- birds

/**
 * Swallow-family silhouette: plump lathed body, swept pointed wings, forked
 * tail. ~130 triangles — readable at 100 m by outline alone.
 */
export function buildBirdGeometry({ seed = 1, variant = 0, palette = 'swallow' } = {}) {
  const schemes = resolvePalette('birds', palette);
  const scheme = schemes[variant % schemes.length];
  const rng = mulberry32(hashCombine(seed, 0xb14d + variant));
  const builder = new FaunaMeshBuilder();

  const L = 0.36 * (0.92 + rng() * 0.2);          // body length (m)
  const plump = 0.9 + rng() * 0.28;
  const span = 0.4 + rng() * 0.1;                 // half wingspan (m)
  const sweep = 0.16 + rng() * 0.1;

  // Body profile, tail → beak. yOff arches the back and lifts the head.
  const stations = [
    { z: -0.5 * L, r: 0.045 * L * plump, y: 0.045 * L, part: 'back' },
    { z: -0.24 * L, r: 0.115 * L * plump, y: 0.012 * L, part: 'mid' },
    { z: 0.02 * L, r: 0.15 * L * plump, y: 0.0, part: 'mid' },
    { z: 0.26 * L, r: 0.135 * L * plump, y: 0.02 * L, part: 'throat' },
    { z: 0.4 * L, r: 0.1 * L * plump, y: 0.07 * L, part: 'head' },
    { z: 0.5 * L, r: 0.095 * L * plump, y: 0.095 * L, part: 'head' },
    { z: 0.6 * L, r: 0.035 * L, y: 0.08 * L, part: 'beak' },
  ];
  const colorAt = (st, ny) => {
    if (st.part === 'beak') return scheme.tip;
    if (st.part === 'head') return ny > -0.25 ? scheme.back : scheme.throat;
    if (st.part === 'throat') return ny > 0.1 ? scheme.back : scheme.throat;
    if (st.part === 'back') return ny > -0.1 ? scheme.back : scheme.belly;
    return ny > 0.2 ? scheme.back : scheme.belly;
  };
  const rings = lathe(builder, stations, { radial: 6, squashX: 0.88, colorAt });
  capRing(builder, rings[rings.length - 1], 0.66 * L, 0.075 * L, scheme.tip);

  // Wings: single-surface swept strips (double-sided material). Stations run
  // shoulder → tip; leading/trailing z shape the pointed swallow outline.
  const wingStations = [
    { x: 0.08, lead: 0.16 * L, trail: -0.1 * L, y: 0.06 * L },
    { x: span * 0.38, lead: 0.13 * L, trail: -0.16 * L, y: 0.085 * L },
    { x: span * 0.7, lead: 0.06 * L - sweep * 0.35, trail: -0.17 * L - sweep * 0.5, y: 0.11 * L },
    { x: span, lead: -sweep - 0.02, trail: -sweep - 0.055, y: 0.14 * L },
  ];
  for (const side of [1, -1]) {
    let prev = null;
    for (let i = 0; i < wingStations.length; i += 1) {
      const st = wingStations[i];
      const spanT = i / (wingStations.length - 1);
      const top = mixColor(scheme.wing, scheme.tip, spanT * spanT);
      const color = shadeTone(top, 0.5, 1 - spanT * 0.25);
      const x = side * st.x;
      const leadIdx = builder.vertex(x, st.y, st.lead, color, x, 0);
      const trailIdx = builder.vertex(x, st.y - 0.01 * L, st.trail, shadeTone(top, -0.1), x, 0);
      if (prev) builder.quad(prev.leadIdx, leadIdx, trailIdx, prev.trailIdx);
      prev = { leadIdx, trailIdx };
    }
  }

  // Forked tail: two angled prongs.
  const forkLen = (0.28 + rng() * 0.14) * L;
  for (const side of [1, -1]) {
    const rootIn = builder.vertex(side * 0.012, 0.05 * L, -0.42 * L, shadeTone(scheme.back, 0.4), 0, 0);
    const rootOut = builder.vertex(side * 0.05 * L, 0.05 * L, -0.48 * L, shadeTone(scheme.wing, 0.3), 0, 0);
    const tipOut = builder.vertex(side * 0.1 * L, 0.06 * L, -0.5 * L - forkLen, shadeTone(scheme.tip, 0.2), 0, 0);
    const tipIn = builder.vertex(side * 0.03 * L, 0.055 * L, -0.46 * L - forkLen * 0.72, shadeTone(scheme.tip, 0.25), 0, 0);
    builder.quad(rootIn, rootOut, tipOut, tipIn);
  }

  return builder.build(`FaunaBird_${palette}_${variant}`);
}

// -------------------------------------------------------------- butterflies

/**
 * Butterfly from 5 textureless quads: dark body sliver + fore/hind wing per
 * side, silhouette shaped by the quad corners, rim darkening baked into the
 * outer vertices. ~10 triangles.
 */
export function buildButterflyGeometry({ seed = 1, variant = 0, palette = 'meadow' } = {}) {
  const schemes = resolvePalette('butterflies', palette);
  const scheme = schemes[variant % schemes.length];
  const rng = mulberry32(hashCombine(seed, 0xbf17 + variant));
  const builder = new FaunaMeshBuilder();

  const span = 0.085 * (0.9 + rng() * 0.3);       // half wingspan (m)
  const lenScale = 0.9 + rng() * 0.25;

  // Body: a thin vertical-diamond sliver so the side view isn't empty.
  const bodyL = 0.055 * lenScale;
  const b0 = builder.vertex(0, 0, bodyL * 0.7, shadeTone(scheme.body, 0.3), 0, 0);
  const b1 = builder.vertex(0, 0.008, bodyL * 0.1, shadeTone(scheme.body, 0.5), 0, 0);
  const b2 = builder.vertex(0, 0, -bodyL * 0.8, shadeTone(scheme.body, 0.2), 0, 0);
  const b3 = builder.vertex(0, -0.008, bodyL * 0.1, shadeTone(scheme.body, -0.4), 0, 0);
  builder.quad(b0, b1, b2, b3);

  const rim = scheme.rim;
  for (const side of [1, -1]) {
    // Forewing: swept up-forward, pointed outer tip.
    const f0 = builder.vertex(side * 0.006, 0, bodyL * 0.45, shadeTone(scheme.accent, 0.6), side * 0.006, 0);
    const f1 = builder.vertex(side * span, 0, bodyL * 0.75 + span * 0.28, shadeTone(rim, 0.45), side * span, 0);
    const f2 = builder.vertex(side * span * 0.82, 0, bodyL * 0.1, shadeTone(mixColor(scheme.wing, rim, 0.35), 0.5), side * span * 0.82, 0);
    const f3 = builder.vertex(side * 0.006, 0, bodyL * 0.05, shadeTone(scheme.wing, 0.55), side * 0.006, 0);
    builder.quad(f0, f1, f2, f3);
    // Hindwing: rounder, tucked behind, slight overlap with the forewing.
    const h0 = builder.vertex(side * 0.006, -0.001, bodyL * 0.12, shadeTone(scheme.wing, 0.5), side * 0.006, 0);
    const h1 = builder.vertex(side * span * 0.72, -0.001, bodyL * 0.0, shadeTone(scheme.wing, 0.45), side * span * 0.72, 0);
    const h2 = builder.vertex(side * span * 0.5, -0.001, -bodyL * 0.85, shadeTone(rim, 0.35), side * span * 0.5, 0);
    const h3 = builder.vertex(side * 0.006, -0.001, -bodyL * 0.6, shadeTone(mixColor(scheme.wing, scheme.accent, 0.4), 0.5), side * 0.006, 0);
    builder.quad(h0, h1, h2, h3);
  }

  return builder.build(`FaunaButterfly_${palette}_${variant}`);
}

// -------------------------------------------------------------- dragonflies

/** Needle body, four narrow wing blades, oversized eye ring. ~46 triangles. */
export function buildDragonflyGeometry({ seed = 1, variant = 0, palette = 'pond' } = {}) {
  const schemes = resolvePalette('dragonflies', palette);
  const scheme = schemes[variant % schemes.length];
  const rng = mulberry32(hashCombine(seed, 0xd41f + variant));
  const builder = new FaunaMeshBuilder();

  const L = 0.14 * (0.9 + rng() * 0.25);
  // Needle proportions: the abdomen is a sliver, the head a stylized bead —
  // an oversized head ring reads as a blob, not an insect.
  const stations = [
    { z: -0.62 * L, r: 0.028 * L, y: 0, part: 'abdomen' },
    { z: -0.2 * L, r: 0.042 * L, y: 0, part: 'abdomen' },
    { z: 0.1 * L, r: 0.1 * L, y: 0, part: 'thorax' },
    { z: 0.3 * L, r: 0.09 * L, y: 0.004, part: 'thorax' },
    { z: 0.42 * L, r: 0.115 * L, y: 0.004, part: 'eye' },
  ];
  const colorAt = (st) => (st.part === 'eye' ? scheme.eye : st.part === 'thorax' ? scheme.thorax : scheme.body);
  // Lifted shading: a head-on dragonfly is a few pixels of cross-section, and
  // a dark one reads as a floating blob.
  const rings = lathe(builder, stations, { colorAt, radial: 5, shadeLift: 1.3, squashX: 1 });
  capRing(builder, rings[rings.length - 1], 0.5 * L, 0.004, scheme.eye);
  capRing(builder, [...rings[0]].reverse(), -0.68 * L, 0, scheme.body);

  // Two wing pairs, splayed slightly forward/back so the top view reads X.
  const span = 0.09 * (0.9 + rng() * 0.2);
  const wingPairs = [
    { zRoot: 0.22 * L, splay: 0.35, chord: 0.02 },
    { zRoot: 0.04 * L, splay: -0.3, chord: 0.018 },
  ];
  for (const pair of wingPairs) {
    for (const side of [1, -1]) {
      const wc = shadeTone(scheme.wing, 0.55);
      const tipZ = pair.zRoot + side * 0 + pair.splay * span * 0.6;
      const w0 = builder.vertex(side * 0.008, 0.006, pair.zRoot + pair.chord, wc, side * 0.008, 0);
      const w1 = builder.vertex(side * span, 0.01, tipZ + pair.chord * 0.5, shadeTone(scheme.wing, 0.4), side * span, 0);
      const w2 = builder.vertex(side * span * 0.96, 0.01, tipZ - pair.chord * 0.6, shadeTone(scheme.wing, 0.3), side * span * 0.96, 0);
      const w3 = builder.vertex(side * 0.008, 0.006, pair.zRoot - pair.chord, shadeTone(scheme.wing, 0.45), side * 0.008, 0);
      builder.quad(w0, w1, w2, w3);
    }
  }

  return builder.build(`FaunaDragonfly_${palette}_${variant}`);
}

// -------------------------------------------------------------------- fish

// Blobby koi patches: a few seeded patch centers in (station, angle) space;
// vertices inside a center's radius take the patch color. Reads as classic
// koi mottling from above (the view the refraction pass shows).
function makePatchSampler(rng, patchiness) {
  const count = patchiness <= 0 ? 0 : 2 + Math.floor(rng() * 3);
  const patches = [];
  for (let i = 0; i < count; i += 1) {
    patches.push({
      s: rng(),                      // 0..1 along the body
      a: (rng() - 0.5) * 2.4,        // radians around the top (0 = straight up)
      r: 0.16 + rng() * 0.24 * patchiness,
    });
  }
  return (s, angle, ny) => {
    if (ny < -0.15) return false;    // belly stays clean
    for (const p of patches) {
      const da = Math.atan2(Math.sin(angle - Math.PI / 2 - p.a), Math.cos(angle - Math.PI / 2 - p.a)) * 0.35;
      const ds = s - p.s;
      if (ds * ds + da * da < p.r * p.r) return true;
    }
    return false;
  };
}

/**
 * Koi/shoal fish: laterally squashed lathe body, forked tail fan, dorsal
 * ridge, pectoral pair. `aTail` ramps nose→tail for the GPU body sway.
 * ~90 triangles.
 */
export function buildFishGeometry({ seed = 1, variant = 0, palette = 'koi' } = {}) {
  const schemes = resolvePalette('fish', palette);
  const scheme = schemes[variant % schemes.length];
  const rng = mulberry32(hashCombine(seed, 0xf1f + variant));
  const builder = new FaunaMeshBuilder();

  const L = 0.42 * (0.85 + rng() * 0.35);
  const girth = 0.9 + rng() * 0.3;
  const patchAt = makePatchSampler(rng, scheme.patchiness);
  const tailAt = (z) => {
    const t = (0.5 * L - z) / (1.1 * L);
    return Math.max(0, Math.min(1, t)) ** 1.4;
  };

  const stations = [
    { z: 0.5 * L, r: 0.03 * L, y: 0, s: 0 },
    { z: 0.34 * L, r: 0.1 * L * girth, y: 0, s: 0.15 },
    { z: 0.1 * L, r: 0.13 * L * girth, y: 0.005 * L, s: 0.4 },
    { z: -0.14 * L, r: 0.105 * L * girth, y: 0.004 * L, s: 0.62 },
    { z: -0.32 * L, r: 0.06 * L * girth, y: 0, s: 0.8 },
    { z: -0.44 * L, r: 0.026 * L, y: 0, s: 0.92 },
  ];
  const colorAt = (st, ny, angle) => {
    if (ny < -0.45) return scheme.belly;
    return patchAt(st.s, angle, ny) ? scheme.patch : scheme.base;
  };
  const rings = lathe(builder, stations, { radial: 6, squashX: 0.62, colorAt, tailAt });
  capRing(builder, rings[0], 0.56 * L, 0, scheme.base, tailAt(0.56 * L));

  // Forked tail fan: two blades sweeping back from the peduncle.
  const tailL = 0.24 * L * (0.9 + rng() * 0.3);
  for (const side of [1, -1]) {
    const up = side; // one blade up, one down — a vertical fork seen side-on
    const fin = shadeTone(scheme.fin, 0.3 * up);
    const t0 = builder.vertex(0, 0.0, -0.44 * L, fin, 0, tailAt(-0.44 * L));
    const t1 = builder.vertex(0, up * 0.1 * L, -0.44 * L - tailL, shadeTone(scheme.fin, 0.15 * up), 0, 1);
    const t2 = builder.vertex(0, up * 0.028 * L, -0.44 * L - tailL * 0.62, shadeTone(scheme.fin, 0.2 * up), 0, 1);
    builder.tri(t0, t1, t2); // single face; the DoubleSide material shows both sides
  }

  // Dorsal fin: low triangle ridge.
  const d0 = builder.vertex(0, 0.13 * L * girth, 0.08 * L, shadeTone(scheme.fin, 0.7), 0, tailAt(0.08 * L));
  const d1 = builder.vertex(0, 0.2 * L * girth, -0.08 * L, shadeTone(scheme.fin, 0.6), 0, tailAt(-0.08 * L));
  const d2 = builder.vertex(0, 0.11 * L * girth, -0.2 * L, shadeTone(scheme.fin, 0.55), 0, tailAt(-0.2 * L));
  builder.tri(d0, d1, d2);

  // Pectoral fins: small angled quads that sell the top-down koi read.
  for (const side of [1, -1]) {
    const px = side * 0.09 * L;
    const p0 = builder.vertex(side * 0.055 * L, -0.02 * L, 0.22 * L, shadeTone(scheme.fin, 0.2), 0, 0.2);
    const p1 = builder.vertex(px * 1.9, -0.045 * L, 0.12 * L, shadeTone(scheme.fin, 0.05), 0, 0.25);
    const p2 = builder.vertex(px * 1.5, -0.04 * L, 0.02 * L, shadeTone(scheme.fin, 0.1), 0, 0.3);
    builder.tri(p0, p1, p2);
  }

  return builder.build(`FaunaFish_${palette}_${variant}`);
}

// ------------------------------------------------------------------ generic

const BUILDERS = Object.freeze({
  birds: buildBirdGeometry,
  butterflies: buildButterflyGeometry,
  dragonflies: buildDragonflyGeometry,
  fish: buildFishGeometry,
});

/** Species-generic entry: `buildFaunaGeometry('birds', { seed, variant, palette })`. */
export function buildFaunaGeometry(species, options = {}) {
  const builder = BUILDERS[species];
  if (!builder) throw new Error(`Unknown fauna species "${species}".`);
  return builder(options);
}
