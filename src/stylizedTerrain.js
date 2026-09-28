import * as THREE from 'three';

import { deepMerge } from './core/generation.js';
import { createHorizonCastle } from './worldLandmarks.js';

// Seeded stylized-terrain generator. Import from '@call-me-sensei/toonlab'.
//
// The randomization contract: ANY seed yields a valid, playable world.
// Nothing in here is tuned to one seed — the pieces that were hand-picked
// in early demos are all derived at generation time:
//
//  - The waterline is solved from the height histogram: `waterCoverage:
//    0.35` puts 35% of the playable area under water for any seed, instead
//    of tuning noise amplitudes against a fixed water level.
//  - Paint bands (rock-by-height, snow line, golden fields) are fractions
//    of the observed relief, not absolute meters.
//  - The spawn is found by probing (walkable slope, near a shore, open
//    sightlines), deterministically per seed, then the meadow around it is
//    flattened.
//  - Degenerate seeds (no acceptable spawn) re-roll a derived sub-seed;
//    the same input seed always resolves to the same world.
//
// Dimension knobs:
//  - `size` — playable extent in meters: a number (square) or `{ x, z }`
//    (rectangular). The mesh extends to 2× into a mountain rim.
//  - `height` (H) — mountain-range amplitude override in meters.
//  - `depth` (D) — how far basins dip below the ground datum, in meters
//    (deep lakes / room under the waterline). True underground structure
//    (caves, overhangs) is beyond a heightfield — that needs volumetric
//    terrain and is tracked separately.
//  - `floatingIslands` — `true` or `{ count, minAltitude, maxAltitude,
//    minRadius, maxRadius }`: seeded sky islands (meadow tops, tapered
//    rock undersides), returned in `islands`; each carries
//    `topAt(worldX, worldZ)` so hosts can stand trees or characters on it.
//  - `sinkholes` — `true` or `{ count, minRadius, maxRadius, depth }`:
//    seeded karst dolines, sheer-walled pits carved into the land; one cut
//    below the waterline floods into a cenote pool. Returned in
//    `sinkholes`. The spawn probe never lands in one.
//
//   const terrain = createStylizedTerrain({
//     seed: 42,
//     size: { x: 1200, z: 800 },
//     archetype: 'terracedKarst', // 'lakeland' | 'alpine' | 'rollingPlains' | 'archipelago'
//     waterCoverage: 0.35,        // ← "more water" is one knob
//     height: 220,                // ← taller mountain range
//     depth: 60,                  // ← deeper basins
//     floatingIslands: { count: 4 },
//   });
//   scene.add(terrain.root);
//   const collision = createWorldCollision({ heightAt: terrain.heightAt });
//   character.position.copy(terrain.spawn);

// Morphology + paint bundles. Amplitudes are meters; band values are
// fractions of the archetype's observed land relief above the waterline.
const TERRAIN_ARCHETYPES = new Map([
  ['lushKarst', {
    continent: { amp: 96, bias: -0.38, freq: 0.00105 },
    label: 'Lush Karst',
    mountains: { amp: 145, freq: 0.0008, mask: [0.58, 0.72], ridgeExp: 1.85, ridgeFreq: 0.0065 },
    // Localized outcrops interrupt the meadow without turning every square
    // meter into a rock wall.
    outcrops: { amp: 36, freq: 0.0032, mask: [0.68, 0.84], ridgeExp: 2.1, ridgeFreq: 0.014 },
    paint: { rockHeightBand: [0.7, 0.84], rockSlopeBand: [0.72, 1.12] },
    rim: { base: 62, ridged: 132 },
    rolling: { amp: 24, freq: 0.0034 },
    terraces: {
      blendOff: [0.8, 1.0], lowlandBlend: 0.08, mountainBlend: 0.92, sharpness: 4.5, step: 20,
    },
    waterCoverage: 0.14,
  }],
  ['terracedKarst', {
    continent: { amp: 160, bias: -0.535, freq: 0.0011 },
    label: 'Terraced Karst',
    mountains: { amp: 170, freq: 0.00076, mask: [0.47, 0.6], ridgeExp: 1.8, ridgeFreq: 0.007 },
    rim: { base: 55, ridged: 120 },
    rolling: { amp: 18, freq: 0.0036 },
    terraces: { blendOff: [0.8, 1.0], sharpness: 5, step: 20 },
    waterCoverage: 0.14,
  }],
  ['lakeland', {
    continent: { amp: 70, bias: -0.5, freq: 0.0013 },
    label: 'Lakeland',
    mountains: { amp: 60, freq: 0.0009, mask: [0.55, 0.7], ridgeExp: 1.6, ridgeFreq: 0.008 },
    rim: { base: 40, ridged: 70 },
    rolling: { amp: 14, freq: 0.004 },
    terraces: { blendOff: [0.75, 0.95], sharpness: 4, step: 12 },
    waterCoverage: 0.4,
  }],
  ['alpine', {
    continent: { amp: 130, bias: -0.5, freq: 0.001 },
    label: 'Alpine',
    mountains: { amp: 260, freq: 0.0007, mask: [0.4, 0.56], ridgeExp: 1.6, ridgeFreq: 0.006 },
    rim: { base: 80, ridged: 160 },
    rolling: { amp: 24, freq: 0.0034 },
    terraces: { blendOff: [0.55, 0.75], sharpness: 4, step: 30 },
    waterCoverage: 0.08,
  }],
  ['rollingPlains', {
    continent: { amp: 46, bias: -0.46, freq: 0.0012 },
    label: 'Rolling Plains',
    mountains: { amp: 34, freq: 0.0009, mask: [0.6, 0.75], ridgeExp: 1.5, ridgeFreq: 0.008 },
    rim: { base: 36, ridged: 60 },
    rolling: { amp: 20, freq: 0.0038 },
    terraces: null,
    waterCoverage: 0.12,
  }],
  ['archipelago', {
    continent: { amp: 110, bias: -0.62, freq: 0.0014 },
    label: 'Archipelago',
    mountains: { amp: 90, freq: 0.001, mask: [0.5, 0.66], ridgeExp: 1.7, ridgeFreq: 0.008 },
    rim: { base: 40, ridged: 90 },
    rolling: { amp: 16, freq: 0.004 },
    terraces: { blendOff: [0.7, 0.92], sharpness: 4, step: 14 },
    waterCoverage: 0.55,
  }],
]);

/** Lists terrain archetypes as `{ id, label }` (for HUDs / docs). */
export function getTerrainArchetypeOptions() {
  return Array.from(TERRAIN_ARCHETYPES.entries()).map(([id, a]) => ({ id, label: a.label }));
}

/**
 * Registers an extensible terrain starting point. The definition is merged
 * over `options.extends` (rollingPlains by default), so plugins can add new
 * morphology families without modifying ToonLab or choosing from a fixed
 * built-in catalog.
 */
export function registerTerrainArchetype(id, definition = {}, options = {}) {
  const key = String(id ?? '').trim();
  if (!key) throw new Error('Terrain archetype id is required.');
  if (!options.overwrite && TERRAIN_ARCHETYPES.has(key)) {
    throw new Error(`Terrain archetype "${key}" already exists.`);
  }
  const parentId = options.extends ?? 'rollingPlains';
  const parent = TERRAIN_ARCHETYPES.get(parentId);
  if (!parent) throw new Error(`Unknown parent terrain archetype "${parentId}".`);
  const next = deepMerge(parent, definition);
  next.label = String(definition.label || key);
  TERRAIN_ARCHETYPES.set(key, next);
  return { id: key, label: next.label };
}

const DEFAULT_PALETTE = {
  golden: 0xd2b24c,
  haze: 0xa9c6e8,
  meadow: 0x64ad48,
  // Warm limestone rather than cool uniform gray. The dedicated triplanar
  // cliff map below supplies ochre strata and dark mineral seams.
  rock: 0xa58e6d,
  sand: 0xe2d49a,
  snow: 0xe4e6e2,
};

function smoothstep(edge0, edge1, value) {
  const t = Math.min(Math.max((value - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

// Terracing is the signature of the karst look: quantize height into steps
// with steep eased walls, so hills become flat-topped mesas.
function terrace(y, step, sharpness) {
  const t = y / step;
  const base = Math.floor(t);
  const f = t - base;
  const eased = f ** sharpness / (f ** sharpness + (1 - f) ** sharpness);
  return (base + eased) * step;
}

// Seeded value-noise kit; every stream hangs off the resolved seed so the
// same seed is the same world, bit for bit.
function createNoiseKit(seed) {
  const hashCell = (ix, iz) => {
    let h = (ix * 374761393 + iz * 668265263 + seed * 971) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const valueNoise = (x, z) => {
    const ix = Math.floor(x);
    const iz = Math.floor(z);
    const fx = x - ix;
    const fz = z - iz;
    const sx = fx * fx * (3 - 2 * fx);
    const sz = fz * fz * (3 - 2 * fz);
    const a = hashCell(ix, iz);
    const b = hashCell(ix + 1, iz);
    const c = hashCell(ix, iz + 1);
    const d = hashCell(ix + 1, iz + 1);
    return a + (b - a) * sx + (c - a) * sz + (a - b - c + d) * sx * sz;
  };
  const fbm = (x, z, octaves = 4) => {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    let norm = 0;
    for (let i = 0; i < octaves; i += 1) {
      sum += amplitude * valueNoise(x * frequency, z * frequency);
      norm += amplitude;
      amplitude *= 0.5;
      frequency *= 2;
    }
    return sum / norm;
  };
  return { fbm, hashCell, valueNoise };
}

// Tiling value-noise mottling multiplied under the vertex-color biomes so
// grass and sand read as ground instead of flat paint.
function createGroundDetailTexture(kit, repeatX, repeatZ) {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const n1 = kit.valueNoise((px % size) * 0.09, (py % size) * 0.09);
      const n2 = kit.valueNoise((px % size) * 0.23 + 37, (py % size) * 0.23 + 59);
      const shade = 215 + (n1 * 0.65 + n2 * 0.35) * 40;
      const i = (py * size + px) * 4;
      image.data[i] = shade;
      image.data[i + 1] = shade;
      image.data[i + 2] = shade;
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatZ);
  texture.name = 'ToonLabTerrainGroundDetail';
  return texture;
}

// World-covering macro colormap: the seeded stand-in for a hand-painted
// biome color map. Very low-frequency warm (dry gold) and cool (lush teal)
// patches drift across the meadow so big vistas never read as one flat
// green. Texels encode a MULTIPLIER around mid-gray (shader decodes ×2), in
// linear space — this is math data, not a diffuse image.
function createMacroColormapTexture(kit) {
  if (typeof document === 'undefined') return null;
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const WARM = [1.16, 1.05, 0.66];
  const COOL = [0.82, 0.98, 1.04];
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const u = px / size;
      const v = py / size;
      const warm = smoothstep(0.48, 0.72, kit.fbm(u * 5.2 + 11.7, v * 5.2 + 3.9, 3));
      const cool = smoothstep(0.5, 0.74, kit.fbm(u * 4.1 + 47.3, v * 4.1 + 29.1, 3));
      const drift = (kit.fbm(u * 9.7 + 71.1, v * 9.7 + 5.7, 2) - 0.5) * 0.14;
      const i = (py * size + px) * 4;
      for (let ch = 0; ch < 3; ch += 1) {
        const tint = 1 + warm * (WARM[ch] - 1) + cool * (COOL[ch] - 1) + drift;
        image.data[i + ch] = Math.round(THREE.MathUtils.clamp(tint * 127.5, 0, 255));
      }
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 4;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.name = 'ToonLabTerrainMacroColormap';
  return texture;
}

// Seamless painterly limestone used automatically on steep generated-terrain
// faces. Integer-frequency waves make the tile periodic; the vertical V axis
// carries unmistakable horizontal sediment bands, with thin dark crevices and
// warmer iron-stained shelves. This is material identity, not high-frequency
// vertex paint, so it remains stable on coarse distant terrain meshes.
function createCliffDetailTexture(kit) {
  if (typeof document === 'undefined') return null;
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const image = ctx.createImageData(size, size);
  const tau = Math.PI * 2;
  const phase = kit.hashCell(73, 191) * tau;

  for (let py = 0; py < size; py += 1) {
    const v = py / size;
    for (let px = 0; px < size; px += 1) {
      const u = px / size;
      const warp = Math.sin(tau * u * 2 + phase) * 0.035
        + Math.sin(tau * u * 4 - phase * 0.7) * 0.012;
      // Broad shelf-scale bands survive mipmapping without turning into a
      // close-range herringbone pattern on blended triplanar axes.
      const strata = (v + warp) * 5;
      const seamT = strata - Math.floor(strata);
      const crevice = Math.exp(-(((seamT - 0.075) / 0.055) ** 2));
      const secondarySeam = Math.exp(-(((seamT - 0.58) / 0.11) ** 2)) * 0.24;
      const shelf = smoothstep(0.12, 0.3, seamT) * (1 - smoothstep(0.4, 0.62, seamT));
      const mottle = Math.sin(tau * (u * 3 + v * 2) + phase) * 0.5
        + Math.sin(tau * (u * 6 - v * 3) - phase * 0.4) * 0.24;
      const stain = 0.5 + 0.5 * Math.sin(tau * (u + v * 2) + phase * 0.6);
      const shade = 0.92 + mottle * 0.08 + shelf * 0.08
        - crevice * 0.32 - secondarySeam * 0.16;
      const i = (py * size + px) * 4;
      image.data[i] = Math.round(THREE.MathUtils.clamp(190 * shade + stain * 14, 28, 255));
      image.data[i + 1] = Math.round(THREE.MathUtils.clamp(166 * shade + stain * 7, 24, 245));
      image.data[i + 2] = Math.round(THREE.MathUtils.clamp(126 * shade - stain * 3, 20, 225));
      image.data[i + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 16;
  texture.generateMipmaps = true;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.name = 'ToonLabTerrainLimestoneStrata';
  return texture;
}

/**
 * Generates a seeded stylized heightfield world: morphology from a named
 * archetype, waterline solved from `waterCoverage`, spawn found by probing,
 * biome paint in relief-relative bands, optional floating islands. Returns
 * `{ archetype, dispose, heightAt, islands, mesh, meshExtent, resolvedSeed,
 * root, size, spawn, stats, waterLevel }`.
 */
export function createStylizedTerrain({
  seed = 1,
  size = 1000,
  archetype = 'lushKarst',
  // Continuous morphology overrides turn archetypes into starting points,
  // not a closed catalog. Any nested continent/mountains/rolling/rim/
  // terraces value may be replaced by a generated biome recipe.
  morphology = null,
  waterCoverage = null,           // 0..0.6; default from the archetype
  height = null,                  // H: mountain amplitude override (m)
  depth = null,                   // D: basin depth below the ground datum (m)
  floatingIslands = false,
  sinkholes = false,              // true | { count, minRadius, maxRadius, depth }
  palette = {},
  segments = 512,
  detailTexture = true,
  landmark = 'auto',
  maxAttempts = 4,
} = {}) {
  const base = TERRAIN_ARCHETYPES.get(archetype);
  if (!base) {
    throw new Error(`Unknown terrain archetype "${archetype}" (have: ${[...TERRAIN_ARCHETYPES.keys()].join(', ')}).`);
  }
  const customized = morphology && typeof morphology === 'object'
    ? deepMerge(base, morphology)
    : base;
  const spec = Number.isFinite(height)
    ? { ...customized, mountains: { ...customized.mountains, amp: Math.max(height, 1) } }
    : customized;
  const coverage = Math.min(Math.max(
    Number.isFinite(waterCoverage) ? waterCoverage : spec.waterCoverage, 0), 0.6);
  const sizeX = Number.isFinite(size?.x) ? size.x : Number(size) || 1000;
  const sizeZ = Number.isFinite(size?.z) ? size.z : sizeX;
  const halfX = sizeX / 2;
  const halfZ = sizeZ / 2;
  const meshExtent = { x: sizeX * 2, z: sizeZ * 2 };
  // Normalized elliptical distance: 1 at the playable edge, rim beyond.
  const edgeDistance = (x, z) => Math.hypot(x / halfX, z / halfZ);
  // D: scale the below-datum range. The archetype's nominal basin depth is
  // continent.amp × |bias|; `depth` remaps it.
  const nominalDepth = spec.continent.amp * Math.abs(spec.continent.bias);
  const depthScale = Number.isFinite(depth) ? Math.max(depth, 1) / nominalDepth : 1;

  // ---- attempt loop: raw morphology → waterline → spawn; re-roll a
  //      derived sub-seed if no acceptable spawn exists. ----
  let attempt = 0;
  let resolvedSeed = (Number(seed) >>> 0) || 1;
  let kit;
  let rawHeight;
  let waterLevel;
  let spawn = null;
  let landPeak = 1;
  let holes = [];

  while (attempt < maxAttempts) {
    kit = createNoiseKit(resolvedSeed);
    const { fbm } = kit;
    const { continent, mountains, outcrops, rolling, rim, terraces } = spec;

    // Sinkholes (karst dolines): seeded pits with sheer carved walls — the
    // heightfield's version of underground structure. One that cuts below
    // the waterline floods into a cenote pool. The slope paint and cliff
    // decorators pick their walls up automatically. True caves/overhangs
    // need volumetric terrain and are tracked separately.
    holes = [];
    if (sinkholes) {
      const ho = typeof sinkholes === 'object' ? sinkholes : {};
      const count = Math.max(1, Math.round(ho.count ?? 3));
      const minR = ho.minRadius ?? 26;
      const maxR = ho.maxRadius ?? 52;
      for (let i = 0; i < count; i += 1) {
        holes.push({
          depth: ho.depth ?? 34 + kit.hashCell(i * 19 + 3, i * 7 + 29) * 26,
          radius: minR + (maxR - minR) * kit.hashCell(i * 11 + 1, i * 5 + 17),
          x: (kit.hashCell(i * 13 + 7, i * 3 + 2) - 0.5) * sizeX * 0.72,
          z: (kit.hashCell(i * 29 + 5, i * 23 + 11) - 0.5) * sizeZ * 0.72,
        });
      }
    }

    rawHeight = (x, z) => {
      const cont = (fbm(x * continent.freq, z * continent.freq, 4) + continent.bias) * continent.amp;
      const roll = fbm(x * rolling.freq, z * rolling.freq, 4) * rolling.amp;
      const mask = smoothstep(mountains.mask[0], mountains.mask[1],
        fbm(x * mountains.freq + 11, z * mountains.freq + 7, 3));
      const ridged = (1 - Math.abs(2 * fbm(x * mountains.ridgeFreq + 31, z * mountains.ridgeFreq + 17, 4) - 1))
        ** mountains.ridgeExp;
      let y = cont + roll + mask * ridged * mountains.amp;
      if (outcrops) {
        const outcropMask = smoothstep(outcrops.mask[0], outcrops.mask[1],
          fbm(x * outcrops.freq + 67, z * outcrops.freq + 29, 3));
        const outcropRidge = (1 - Math.abs(
          2 * fbm(x * outcrops.ridgeFreq + 19, z * outcrops.ridgeFreq + 73, 3) - 1
        )) ** outcrops.ridgeExp;
        y += outcropMask * outcropRidge * outcrops.amp;
      }
      if (y < 0) y *= depthScale; // D: basins scale independently of peaks
      if (terraces && y > 2) {
        let blend = 1 - smoothstep(
          mountains.amp * terraces.blendOff[0],
          mountains.amp * terraces.blendOff[1],
          y,
        );
        if (Number.isFinite(terraces.lowlandBlend) || Number.isFinite(terraces.mountainBlend)) {
          blend *= THREE.MathUtils.lerp(
            Number(terraces.lowlandBlend) || 0,
            Number.isFinite(terraces.mountainBlend) ? terraces.mountainBlend : 1,
            mask,
          );
        }
        y = y * (1 - blend) + terrace(y, terraces.step, terraces.sharpness) * blend;
      }
      const rimBlend = smoothstep(1.3, 1.9, edgeDistance(x, z));
      y += rimBlend * (rim.base + ridged * rim.ridged);
      for (const hole of holes) {
        const d = Math.hypot(x - hole.x, z - hole.z);
        if (d < hole.radius * 1.05) {
          y -= hole.depth * smoothstep(hole.radius, hole.radius * 0.45, d);
        }
      }
      return y;
    };

    // Waterline: the requested coverage percentile of the playable-area
    // height histogram. Works for any seed by construction.
    const samples = [];
    for (let gx = 0; gx <= 80; gx += 1) {
      for (let gz = 0; gz <= 80; gz += 1) {
        samples.push(rawHeight(-halfX + (gx / 80) * sizeX, -halfZ + (gz / 80) * sizeZ));
      }
    }
    samples.sort((a, b) => a - b);
    waterLevel = samples[Math.min(Math.floor(samples.length * coverage), samples.length - 1)];
    landPeak = Math.max(samples[Math.floor(samples.length * 0.995)] - waterLevel, 1);

    spawn = probeSpawn(rawHeight, waterLevel, halfX, halfZ, { holes });
    if (spawn) break;
    attempt += 1;
    resolvedSeed = (Math.imul(resolvedSeed, 2654435761) + 101) >>> 0;
  }
  if (!spawn) {
    // Every candidate failed even after re-rolls — take the least-bad site
    // rather than throwing: a mediocre spawn beats no world.
    spawn = probeSpawn(rawHeight, waterLevel, halfX, halfZ, { holes, relaxed: true })
      ?? { openness: 0, x: 0, y: rawHeight(0, 0), z: 0 };
  }

  // Final height function: raw + a flattened spawn meadow.
  const spawnHeight = Math.max(rawHeight(spawn.x, spawn.z), waterLevel + 3);
  const flattenFar = Math.min(sizeX, sizeZ) * 0.12;
  const flattenNear = flattenFar / 3;
  const heightAt = (x, z) => {
    const y = rawHeight(x, z);
    const flatten = smoothstep(flattenFar, flattenNear, Math.hypot(x - spawn.x, z - spawn.z));
    return y * (1 - flatten) + spawnHeight * flatten;
  };
  spawn.y = heightAt(spawn.x, spawn.z);

  // ---- mesh + paint (bands are fractions of the observed relief) ----
  const colors = {
    golden: new THREE.Color(palette.golden ?? DEFAULT_PALETTE.golden),
    haze: new THREE.Color(palette.haze ?? DEFAULT_PALETTE.haze),
    meadow: new THREE.Color(palette.meadow ?? DEFAULT_PALETTE.meadow),
    rock: new THREE.Color(palette.rock ?? DEFAULT_PALETTE.rock),
    sand: new THREE.Color(palette.sand ?? DEFAULT_PALETTE.sand),
    snow: new THREE.Color(palette.snow ?? DEFAULT_PALETTE.snow),
  };
  const rockHeightBand = spec.paint?.rockHeightBand ?? [0.5, 0.66];
  const rockSlopeBand = spec.paint?.rockSlopeBand ?? [0.5, 0.9];
  const rockBand = [
    waterLevel + landPeak * rockHeightBand[0],
    waterLevel + landPeak * rockHeightBand[1],
  ];
  const snowBand = [waterLevel + landPeak * 0.95, waterLevel + landPeak * 1.15];
  const goldTop = waterLevel + landPeak * 0.42;
  const { fbm } = kit;
  const goldenField = (x, z) => smoothstep(0.54, 0.68, fbm(x * 0.003 + 91, z * 0.003 + 43, 3));

  // World-space band jitter (the reference pack's per-layer height noise):
  // grass↔rock and height-band boundaries wander organically instead of
  // tracing the smooth analytic contour of the classifier. ~50 m wavelength
  // stays far above vertex spacing, so no sawtooth aliasing.
  const bandNoise = spec.paint?.bandNoise ?? 1;
  const paintVertex = (color, x, y, z, grade) => {
    const wander = (fbm(x * 0.02 + 131, z * 0.02 + 67, 3) - 0.5) * bandNoise;
    const jitteredGrade = grade + wander * 0.22;
    const jitteredY = y + wander * landPeak * 0.1;
    const rockiness = Math.max(
      smoothstep(rockSlopeBand[0], rockSlopeBand[1], jitteredGrade),
      smoothstep(rockBand[0], rockBand[1], jitteredY),
    );
    color.copy(colors.meadow)
      // Golden fields on flat lowlands only: loose gates leak gold up cliff
      // triangles as sawtooth wedges.
      .lerp(colors.golden, goldenField(x, z) * 0.85
        * (1 - smoothstep(goldTop * 0.72, goldTop, jitteredY)) * (1 - smoothstep(0.16, 0.32, grade)))
      .lerp(colors.rock, rockiness)
      .lerp(colors.snow, smoothstep(snowBand[0], snowBand[1], jitteredY));
    // Low-frequency strata + drift: frequencies stay above the vertex
    // spacing (finer bands alias into zigzag triangles on walls); fine
    // rock detail belongs to the triplanar stone texture.
    if (rockiness > 0.02) {
      const strata = 0.95 + 0.1 * fbm(y * 0.1 + 17, (x + z) * 0.004, 2);
      const drift = 0.95 + 0.1 * fbm(x * 0.008 + 5, z * 0.008 + 9, 2);
      color.lerp(color.clone().multiplyScalar(strata * drift), rockiness);
    }
    color
      .lerp(colors.sand, smoothstep(waterLevel + 2.5, waterLevel + 0.3, y))
      // Baked atmospheric perspective: the rim reads as hazy blue peaks.
      .lerp(colors.haze, smoothstep(1.4, 2.1, edgeDistance(x, z)) * 0.45);
    return color;
  };

  const geometry = new THREE.PlaneGeometry(meshExtent.x, meshExtent.z, segments, segments);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i += 1) {
    positions.setY(i, heightAt(positions.getX(i), positions.getZ(i)));
  }
  geometry.computeVertexNormals();

  const colorAttr = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    // Analytic slope: sharper than smoothed normals, so terrace walls
    // reliably classify as cliff.
    const e = 4;
    const grade = Math.hypot(
      heightAt(x + e, z) - heightAt(x - e, z),
      heightAt(x, z + e) - heightAt(x, z - e),
    ) / (2 * e);
    paintVertex(color, x, positions.getY(i), z, grade);
    colorAttr.set([color.r, color.g, color.b], i * 3);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colorAttr, 3));

  // Generation-time terrain AO: a broad four-direction horizon sample adds
  // soft cavity grounding at zero frame cost. This ships on the geometry,
  // so createStylizedWorld does not need a slow boot-time ray bake for the
  // quarter-million-vertex terrain. The high floor is a hard readability
  // contract—valleys gain contact, never black holes.
  const vertexAo = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const reach = 10;
    const surrounding = (
      heightAt(x + reach, z) + heightAt(x - reach, z)
      + heightAt(x, z + reach) + heightAt(x, z - reach)
    ) * 0.25;
    const enclosure = THREE.MathUtils.clamp((surrounding - y) / 22, 0, 1);
    vertexAo[i] = 1 - enclosure * 0.22;
  }
  geometry.setAttribute('envVertexAo', new THREE.BufferAttribute(vertexAo, 1));

  const groundDetailMap = detailTexture
    ? createGroundDetailTexture(kit, Math.round(meshExtent.x / 11), Math.round(meshExtent.z / 11))
    : null;
  const cliffDetailMap = detailTexture ? createCliffDetailTexture(kit) : null;
  const material = new THREE.MeshStandardMaterial({
    map: groundDetailMap,
    vertexColors: true,
  });
  if (cliffDetailMap) material.userData.envTriplanarMap = cliffDetailMap;
  const macroColormap = detailTexture ? createMacroColormapTexture(kit) : null;
  if (macroColormap) {
    material.userData.envColormapMap = macroColormap;
    material.userData.envColormapRegion = new THREE.Vector4(
      -meshExtent.x / 2, -meshExtent.z / 2, 1 / meshExtent.x, 1 / meshExtent.z,
    );
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true; // cliff walls shadow their own valleys
  mesh.receiveShadow = true;
  // Displaced world-scale geometry misjudges its bounding volume — never cull.
  mesh.frustumCulled = false;
  mesh.name = 'terrain';
  // The environment ground-field pass is ToonLab's RVT equivalent. Grass
  // clumps sample this writer at each blade root so their lower color follows
  // the painted terrain while their tips retain the authored palette.
  mesh.userData.groundFieldWrite = true;
  const root = new THREE.Group();
  root.name = 'StylizedTerrain';
  root.add(mesh);

  const landmarks = [];
  if (landmark !== false && (landmark === 'castle' || (landmark === 'auto' && archetype === 'lushKarst'))) {
    let direction = new THREE.Vector2(-spawn.x / Math.max(halfX, 1), -spawn.z / Math.max(halfZ, 1));
    if (direction.lengthSq() < 0.04) {
      const angle = kit.hashCell(701, 919) * Math.PI * 2;
      direction.set(Math.cos(angle), Math.sin(angle));
    }
    direction.normalize();
    const x = direction.x * halfX * 0.76;
    const z = direction.y * halfZ * 0.76;
    const castle = createHorizonCastle({
      facing: Math.atan2(-x, -z),
      position: { x, y: heightAt(x, z), z },
      scale: THREE.MathUtils.clamp(Math.min(sizeX, sizeZ) / 850, 0.65, 1.6),
    });
    root.add(castle);
    landmarks.push(castle);
  }

  // ---- floating islands (optional): meadow-topped sky rocks with tapered
  //      undersides. Decorative by default — returned so hosts can scatter
  //      trees on them, hang waterfalls, or add collision. ----
  const islands = [];
  const islandDisposables = [];
  if (floatingIslands) {
    const opts = typeof floatingIslands === 'object' ? floatingIslands : {};
    const count = Math.max(1, Math.round(opts.count ?? 3));
    const minAlt = opts.minAltitude ?? waterLevel + landPeak * 1.1;
    const maxAlt = opts.maxAltitude ?? waterLevel + landPeak * 1.7;
    const minR = opts.minRadius ?? 26;
    const maxR = opts.maxRadius ?? 70;
    for (let i = 0; i < count; i += 1) {
      const r1 = kit.hashCell(i * 53 + 5, i * 31 + 9);
      const r2 = kit.hashCell(i * 97 + 3, i * 17 + 21);
      const r3 = kit.hashCell(i * 13 + 41, i * 71 + 2);
      const radius = minR + (maxR - minR) * r3;
      const island = {
        radius,
        x: (r1 - 0.5) * sizeX * 0.9,
        y: minAlt + (maxAlt - minAlt) * kit.hashCell(i * 7 + 1, i * 3 + 8),
        z: (r2 - 0.5) * sizeZ * 0.9,
      };
      const built = buildFloatingIsland(kit, island, i, colors, paintVertex, waterLevel, landPeak);
      root.add(built.mesh);
      islandDisposables.push(built);
      islands.push(island);
    }
  }

  return {
    archetype,
    heightAt,
    islands,
    landmarks,
    mesh,
    meshExtent,
    resolvedSeed,
    root,
    sinkholes: holes,
    size: { x: sizeX, z: sizeZ },
    spawn,
    stats: { attempts: attempt + 1, landPeak, waterLevel },
    waterLevel,
    dispose() {
      geometry.dispose();
      groundDetailMap?.dispose();
      cliffDetailMap?.dispose();
      material.dispose();
      for (const built of islandDisposables) built.dispose();
      for (const built of landmarks) built.dispose?.();
      root.parent?.remove(root);
    },
  };
}

// One floating island: a displaced top disc (meadow) and a deeper tapered
// bottom disc (rock) sharing their rim ring, so the silhouette closes.
function buildFloatingIsland(kit, island, index, colors, paintVertex, waterLevel, landPeak) {
  const segments = 40;
  const rings = 12;
  const { radius } = island;
  const topAmp = radius * 0.18;
  const bottomDepth = radius * (0.7 + kit.hashCell(index * 3 + 2, index * 11 + 6) * 0.5);
  const positions = [];
  const colorList = [];
  const indexList = [];
  const color = new THREE.Color();

  // Local top-surface height; also exposed as island.topAt(worldX, worldZ)
  // so hosts can stand trees, props, or a character on the island.
  const topOffset = (x, z) => {
    const t = Math.min(Math.hypot(x, z) / radius, 1);
    const rimFalloff = 1 - t * t;
    return (kit.fbm(x * 0.05 + index * 7, z * 0.05 + index * 13, 3) - 0.3) * topAmp * 2 * rimFalloff
      + topAmp * 0.4 * rimFalloff;
  };
  island.topAt = (worldX, worldZ) => island.y + topOffset(worldX - island.x, worldZ - island.z);

  const ringVertex = (side, ring, seg) => {
    const t = ring / rings; // 0 center → 1 rim
    const angle = (seg / segments) * Math.PI * 2;
    const r = t * radius;
    const x = Math.cos(angle) * r;
    const z = Math.sin(angle) * r;
    let y;
    if (side === 'top') {
      y = topOffset(x, z);
    } else {
      const taper = (1 - t) ** 0.75;
      y = -bottomDepth * taper * (0.65 + kit.fbm(x * 0.06 + 51, z * 0.06 + 77, 3) * 0.7);
    }
    positions.push(island.x + x, island.y + y, island.z + z);
    if (side === 'top') {
      // Reuse the terrain paint at a meadow-friendly virtual altitude so
      // island tops match the ground biome exactly.
      paintVertex(color, x + island.x, waterLevel + landPeak * 0.15, z + island.z, t * 0.35);
    } else {
      color.copy(colors.rock).multiplyScalar(0.82 + kit.fbm(x * 0.1, z * 0.1, 2) * 0.25);
    }
    colorList.push(color.r, color.g, color.b);
  };

  const sideOffsets = {};
  for (const side of ['top', 'bottom']) {
    sideOffsets[side] = positions.length / 3;
    for (let ring = 0; ring <= rings; ring += 1) {
      for (let seg = 0; seg < segments; seg += 1) ringVertex(side, ring, seg);
    }
    const start = sideOffsets[side];
    for (let ring = 0; ring < rings; ring += 1) {
      for (let seg = 0; seg < segments; seg += 1) {
        const a = start + ring * segments + seg;
        const b = start + ring * segments + ((seg + 1) % segments);
        const c = start + (ring + 1) * segments + seg;
        const d = start + (ring + 1) * segments + ((seg + 1) % segments);
        if (side === 'top') indexList.push(a, c, b, b, c, d);
        else indexList.push(a, b, c, b, d, c);
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colorList), 3));
  geometry.setIndex(indexList);
  geometry.computeVertexNormals();
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // large displaced silhouette, same rule as terrain
  mesh.name = `FloatingIsland${index}`;
  return { dispose: () => { geometry.dispose(); material.dispose(); }, mesh };
}

// Deterministic spawn search: walkable slope, above the waterline, near a
// shore, and open sightlines (no tall wall close by in any direction).
function probeSpawn(rawHeight, waterLevel, halfX, halfZ, { holes = [], relaxed = false } = {}) {
  const maxRX = halfX * 0.85;
  const maxRZ = halfZ * 0.85;
  const wallLimit = relaxed ? 45 : 27;
  let best = null;
  for (let x = -maxRX; x <= maxRX; x += 20) {
    for (let z = -maxRZ; z <= maxRZ; z += 20) {
      // Never spawn inside (or on the lip of) a sinkhole.
      if (holes.some((h) => Math.hypot(x - h.x, z - h.z) < h.radius * 1.4)) continue;
      const y = rawHeight(x, z);
      if (y < waterLevel + 1.2 || y > waterLevel + 22) continue;
      const e = 4;
      const grade = Math.hypot(
        rawHeight(x + e, z) - rawHeight(x - e, z),
        rawHeight(x, z + e) - rawHeight(x, z - e),
      ) / (2 * e);
      if (grade > (relaxed ? 0.4 : 0.22)) continue;
      // Shore distance: probe rings outward until a sample dips underwater.
      let shore = Infinity;
      outer: for (let r = 15; r <= 90; r += 15) {
        for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
          if (rawHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) < waterLevel) {
            shore = r;
            break outer;
          }
        }
      }
      if (!relaxed && shore > 90) continue;
      // Openness: penalize tall walls within 150 m along 8 rays.
      let openness = 0;
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 4) {
        let rayClear = 1;
        for (let r = 40; r <= 150; r += 25) {
          if (rawHeight(x + Math.cos(a) * r, z + Math.sin(a) * r) - y > wallLimit) {
            rayClear = 0;
            break;
          }
        }
        openness += rayClear;
      }
      if (!relaxed && openness < 6) continue;
      const score = openness * 10 - Math.abs(shore - 35) * 0.1 - grade * 20;
      if (!best || score > best.score) best = { openness, score, x, y, z };
    }
  }
  return best;
}
