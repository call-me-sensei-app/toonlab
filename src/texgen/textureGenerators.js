// Generator catalog for the procedural texture engine. Every generator
// compiles a layer spec into a sampler `(u, v) -> { v, cell }` where u/v
// are tile coordinates in [0, 1), v is a scalar field in [0, 1], and cell
// is a stable uint32 id when the generator has discrete cells (bricks,
// tiles, worley) — null otherwise. All samplers tile exactly: noise wraps
// its lattice (see noise2.js) and patterns are periodic by construction.
//
// A layer spec carries the union of parameters; each generator declares
// `uses` so UIs can show only the sliders that matter. Params:
//   scale, detail, detailGain      lattice noise frequency / octaves / gain
//   stretchX, stretchY             anisotropy (periods stay integer)
//   columns, rows                  pattern grid
//   gap, bevel                     pattern mortar width + edge ramp
//   cellJitter                     worley jitter / dot scatter
//   cellVariation                  per-cell value variance
//   edgeWidth                      crack/caustic line width
//   rings, grain                   wood rings + streaks / marble veins
//   warp, warpScale                domain warp amount + frequency

import { hash3u, hashCombine } from '../rockgen/noise/prng.js';
import {
  periodicBillow2,
  periodicCellular2,
  periodicFbm2,
  periodicPerlin2,
  periodicRidged2,
  periodicTurbulence2,
  periodicValue2,
  periodicWarp2,
} from './noise2.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smoothstep(edge0, edge1, x) {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

/** Fractional part that stays positive. */
function fract(v) {
  return v - Math.floor(v);
}

/** Integer periods from scale * stretch, floored at 1 to keep tiling exact. */
function periods(params) {
  const scale = Math.max(1, params.scale ?? 6);
  return {
    px: Math.max(1, Math.round(scale * (params.stretchX ?? 1))),
    py: Math.max(1, Math.round(scale * (params.stretchY ?? 1))),
  };
}

function intIn(value, min, max, fallback) {
  const v = Math.round(Number(value));
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

/**
 * Shared domain warp: returns a function mapping (u, v) -> warped (u, v),
 * still periodic in the unit tile. `warp` is in fractions of a warp cell.
 */
function compileWarp(params, seed) {
  const amount = params.warp ?? 0;
  if (!(amount > 0)) return null;
  const wp = intIn(params.warpScale ?? 3, 1, 32, 3);
  const warpSeed = hashCombine(seed, 0x77a5);
  const strength = amount * 0.6 / wp;
  return (u, v) => {
    const { wx, wy } = periodicWarp2(warpSeed, u * wp, v * wp, wp, wp, 2);
    return { u: u + wx * strength, v: v + wy * strength };
  };
}

/** Per-cell random in [0, 1) from a cell hash id. */
function cellRandom(id, salt) {
  return hash3u(salt, id | 0, (id >>> 16) | 0, 0) / 4294967296;
}

/** Applies per-cell value variance inside the tile face (mask-weighted). */
function withCellVariation(value, id, amount, seed) {
  if (!(amount > 0)) return value;
  const r = cellRandom(id, hashCombine(seed, 0x51ce));
  return clamp01(value + (r - 0.5) * amount * 0.9 * Math.min(1, value * 2));
}

// ---------------------------------------------------------------------------
// Noise family
// ---------------------------------------------------------------------------

function makeNoise(evalNoise, signed) {
  return (params, seed) => {
    const { px, py } = periods(params);
    const octaves = intIn(params.detail ?? 4, 1, 8, 4);
    const gain = Math.min(0.85, Math.max(0.15, params.detailGain ?? 0.5));
    return (u, v) => {
      const n = evalNoise(seed, u * px, v * py, px, py, octaves, gain);
      return { v: clamp01(signed ? n * 0.5 + 0.5 : n), cell: null };
    };
  };
}

// ---------------------------------------------------------------------------
// Cellular family
// ---------------------------------------------------------------------------

function makeCellular(project) {
  return (params, seed) => {
    const { px, py } = periods(params);
    const jitter = clamp01(params.cellJitter ?? 1);
    const edgeWidth = Math.min(0.6, Math.max(0.01, params.edgeWidth ?? 0.12));
    const variation = clamp01(params.cellVariation ?? 0);
    return (u, v) => {
      const c = periodicCellular2(seed, u * px, v * py, px, py, jitter);
      const value = project(c, edgeWidth);
      return { v: withCellVariation(clamp01(value), c.id, variation, seed), cell: c.id };
    };
  };
}

// ---------------------------------------------------------------------------
// Grid patterns (bricks, tiles, checker, weave, ...)
// ---------------------------------------------------------------------------

/**
 * Distance-to-edge bevel profile for rectangular cells.
 *
 * `gap` and `bevel` are cell-local fractions, so a non-square cell (a plank,
 * a 200x100 subway tile, a clapboard) would otherwise get a joint whose world
 * width differs per axis by the cell aspect ratio. `sx`/`sy` scale the joint
 * per axis so an elongated module can carry an even mortar/groove line;
 * authors drive them from the layer's existing `stretchX`/`stretchY` fields.
 *
 * At sx = sy = 1 this is exactly the original single-axis form: smoothstep is
 * monotonic, so min(smoothstep(du), smoothstep(dv)) === smoothstep(min(du, dv)).
 */
function faceProfile(lu, lv, gap, bevel, sx = 1, sy = 1) {
  const du = Math.min(lu, 1 - lu);
  const dv = Math.min(lv, 1 - lv);
  const gu = gap * 0.5 * sx;
  const gv = gap * 0.5 * sy;
  const bu = Math.max(0.004, bevel * sx);
  const bv = Math.max(0.004, bevel * sy);
  return Math.min(
    smoothstep(gu, gu + bu, du),
    smoothstep(gv, gv + bv, dv),
  );
}

/**
 * Joint anisotropy from a layer's stretch fields (1 = isotropic). The clamp
 * mirrors the schema range for `stretchX`/`stretchY`; at 0.125 a module may run
 * 8:1 (a 1.6 m deck board in a 200 mm run) and still carry an even joint.
 */
function jointAspect(params) {
  const sx = Number.isFinite(params.stretchX) ? Math.min(16, Math.max(0.125, params.stretchX)) : 1;
  const sy = Number.isFinite(params.stretchY) ? Math.min(16, Math.max(0.125, params.stretchY)) : 1;
  return { sx, sy };
}

function compileBricks(params, seed, offsetMode) {
  const cols = intIn(params.columns ?? 4, 1, 256, 4);
  const rows = intIn(params.rows ?? 8, 1, 256, 8);
  const gap = Math.min(0.4, Math.max(0, params.gap ?? 0.06));
  const bevel = Math.min(0.5, Math.max(0, params.bevel ?? 0.12));
  const variation = clamp01(params.cellVariation ?? 0.35);
  const { sx, sy } = jointAspect(params);
  return (u, v) => {
    const y = v * rows;
    const row = Math.floor(y);
    const shift = offsetMode === 'running' ? (row & 1) * 0.5 : 0;
    const x = u * cols + shift;
    const col = Math.floor(x);
    const id = hash3u(seed, ((col % cols) + cols) % cols, ((row % rows) + rows) % rows, 0);
    const value = faceProfile(fract(x), fract(y), gap, bevel, sx, sy);
    return { v: withCellVariation(value, id, variation, seed), cell: id };
  };
}

function compileChecker(params, seed) {
  const cols = intIn(params.columns ?? 4, 1, 256, 4);
  const rows = intIn(params.rows ?? 4, 1, 256, 4);
  return (u, v) => {
    const x = Math.floor(u * cols);
    const y = Math.floor(v * rows);
    const id = hash3u(seed, ((x % cols) + cols) % cols, ((y % rows) + rows) % rows, 0);
    return { v: (x + y) & 1 ? 1 : 0, cell: id };
  };
}

function compileGrid(params) {
  const cols = intIn(params.columns ?? 8, 1, 256, 8);
  const rows = intIn(params.rows ?? 8, 1, 256, 8);
  const gap = Math.min(0.4, Math.max(0.005, params.gap ?? 0.06));
  const bevel = Math.min(0.5, Math.max(0.004, params.bevel ?? 0.06));
  const { sx, sy } = jointAspect(params);
  return (u, v) => {
    const lu = fract(u * cols);
    const lv = fract(v * rows);
    return { v: faceProfile(lu, lv, gap, bevel, sx, sy), cell: null };
  };
}

function compileStripes(params, seed) {
  const cols = intIn(params.columns ?? 8, 1, 256, 8);
  const rows = intIn(params.rows ?? 8, 1, 256, 8);
  const variation = clamp01(params.cellVariation ?? 0);
  return (u, v) => {
    const y = v * rows;
    const row = Math.floor(y);
    const nextRow = row + 1;
    const rowMix = smoothstep(0.25, 0.75, fract(y));
    const rowId = ((row % rows) + rows) % rows;
    const nextRowId = ((nextRow % rows) + rows) % rows;
    const phaseA = cellRandom(hash3u(seed, 0, rowId, 0), 0x57a1) - 0.5;
    const phaseB = cellRandom(hash3u(seed, 0, nextRowId, 0), 0x57a1) - 0.5;
    const valueA = cellRandom(hash3u(seed, 1, rowId, 0), 0x57a2);
    const valueB = cellRandom(hash3u(seed, 1, nextRowId, 0), 0x57a2);
    const phase = (phaseA + (phaseB - phaseA) * rowMix) * variation;
    const amplitude = 1 - variation * 0.55 * (valueA + (valueB - valueA) * rowMix);
    const t = fract(u * cols + phase);
    const stripe = 1 - Math.abs(t * 2 - 1);
    const cell = hash3u(seed, Math.floor(u * cols), rowId, 0);
    return { v: clamp01(stripe * amplitude), cell };
  };
}

function compileChevron(params) {
  const cols = intIn(params.columns ?? 8, 1, 256, 8);
  const rows = intIn(params.rows ?? 8, 1, 256, 8);
  return (u, v) => {
    const zig = Math.abs(fract(v * rows) * 2 - 1);
    const t = fract(u * cols + zig);
    return { v: 1 - Math.abs(t * 2 - 1), cell: null };
  };
}

function compileWeave(params, seed) {
  const cols = intIn(params.columns ?? 10, 1, 256, 10);
  const rows = intIn(params.rows ?? 10, 1, 256, 10);
  const gap = Math.min(0.45, Math.max(0.02, params.gap ?? 0.16));
  return (u, v) => {
    const x = u * cols;
    const y = v * rows;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const lx = fract(x);
    const ly = fract(y);
    // Rounded thread profiles; parity picks which thread crosses on top.
    const tx = 1 - Math.abs(lx * 2 - 1);
    const ty = 1 - Math.abs(ly * 2 - 1);
    const px = smoothstep(gap, gap + 0.35, tx);
    const py = smoothstep(gap, gap + 0.35, ty);
    const over = (ix + iy) & 1;
    const id = hash3u(seed, ((ix % cols) + cols) % cols, ((iy % rows) + rows) % rows, 0);
    const top = over ? px * (0.72 + 0.28 * ty) : py * (0.72 + 0.28 * tx);
    const under = over ? py * 0.5 : px * 0.5;
    return { v: clamp01(Math.max(top, under)), cell: id };
  };
}

function compileBasketWeave(params, seed) {
  const cols = intIn(params.columns ?? 6, 1, 256, 6);
  const rows = intIn(params.rows ?? 6, 1, 256, 6);
  const gap = Math.min(0.4, Math.max(0, params.gap ?? 0.08));
  const bevel = Math.min(0.5, Math.max(0.01, params.bevel ?? 0.1));
  const slats = 3;
  return (u, v) => {
    const x = u * cols;
    const y = v * rows;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const horizontal = (ix + iy) & 1;
    const lu = fract(x);
    const lv = fract(y);
    const along = horizontal ? lu : lv;
    const across = fract((horizontal ? lv : lu) * slats);
    const slat = 1 - Math.abs(across * 2 - 1);
    const face = faceProfile(lu, lv, gap, bevel);
    const id = hash3u(seed, ((ix % cols) + cols) % cols, ((iy % rows) + rows) % rows, 0);
    return {
      v: clamp01(face * (0.45 + 0.55 * smoothstep(0.06, 0.4, slat)) * (0.85 + 0.15 * along)),
      cell: id,
    };
  };
}

function compileHex(params, seed) {
  const cols = intIn(params.columns ?? 6, 1, 256, 6);
  // A staggered lattice with 2:sqrt(3) aspect produces regular hexagons
  // out of plain nearest-center Voronoi. Rows derive from columns so the
  // lattice stays periodic in the unit tile.
  const rows = Math.max(1, Math.round(cols * 1.1547));
  const gap = Math.min(0.5, Math.max(0.01, params.gap ?? 0.08));
  const bevel = Math.min(0.6, Math.max(0.01, params.bevel ?? 0.14));
  const variation = clamp01(params.cellVariation ?? 0.3);
  return (u, v) => {
    const x = u * cols;
    const y = v * rows;
    const yi = Math.floor(y);
    let f1 = 1e9;
    let f2 = 1e9;
    let id = 0;
    for (let dy = -1; dy <= 1; dy += 1) {
      const cy = yi + dy;
      const stagger = (((cy % 2) + 2) % 2) * 0.5;
      const xs = x - stagger;
      const xi = Math.floor(xs);
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = xi + dx;
        const centerX = cx + 0.5 + stagger;
        const centerY = cy + 0.5;
        const ddx = (x - centerX) * 1;
        const ddy = (y - centerY) * (cols / rows) * 1.1547;
        const d = ddx * ddx + ddy * ddy;
        const h = hash3u(seed, ((cx % cols) + cols) % cols, ((cy % rows) + rows) % rows, 0);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = h;
        } else if (d < f2) f2 = d;
      }
    }
    const edge = Math.sqrt(f2) - Math.sqrt(f1);
    const value = smoothstep(gap * 0.5, gap * 0.5 + bevel, edge);
    return { v: withCellVariation(value, id, variation, seed), cell: id };
  };
}

function compileScales(params, seed) {
  const cols = intIn(params.columns ?? 8, 1, 256, 8);
  const rows = intIn(params.rows ?? 12, 1, 256, 12);
  const variation = clamp01(params.cellVariation ?? 0.25);
  return (u, v) => {
    // Staggered rows of overlapping shingles: the row above clips the one
    // below, so sample this row and the next and keep the nearest arc.
    const y = v * rows;
    let best = 0;
    let id = 0;
    for (let dr = 0; dr <= 1; dr += 1) {
      const row = Math.floor(y) + dr;
      const stagger = (((row % 2) + 2) % 2) * 0.5;
      const x = u * cols + stagger;
      const col = Math.floor(x);
      const cx = fract(x) - 0.5;
      const cy = (y - row) * (cols / rows);
      const r = Math.sqrt(cx * cx + cy * cy) * 2;
      const value = clamp01(1 - r) * (1 - 0.55 * clamp01(-((y - row))));
      if (value > best) {
        best = value;
        id = hash3u(seed, ((col % cols) + cols) % cols, ((row % (rows * 2)) + rows * 2) % (rows * 2), 0);
      }
    }
    const shaped = clamp01(Math.pow(best, 0.7));
    return { v: withCellVariation(shaped, id, variation, seed), cell: id };
  };
}

function compileDots(params, seed) {
  const cols = intIn(params.columns ?? 8, 1, 256, 8);
  const rows = intIn(params.rows ?? 8, 1, 256, 8);
  const radius = Math.min(0.48, Math.max(0.02, 0.5 - (params.gap ?? 0.18)));
  const soft = Math.min(0.5, Math.max(0.01, params.bevel ?? 0.08));
  const jitter = clamp01(params.cellJitter ?? 0);
  const variation = clamp01(params.cellVariation ?? 0);
  return (u, v) => {
    const x = u * cols;
    const y = v * rows;
    let best = 0;
    let id = 0;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const cx = xi + dx;
        const cy = yi + dy;
        const h = hash3u(seed, ((cx % cols) + cols) % cols, ((cy % rows) + rows) % rows, 0);
        const ox = 0.5 + jitter * (((h & 0xffff) / 65536) - 0.5) * 0.8;
        const oy = 0.5 + jitter * ((((h >>> 16) & 0xffff) / 65536) - 0.5) * 0.8;
        const ddx = x - (cx + ox);
        const ddy = y - (cy + oy);
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        const value = 1 - smoothstep(radius - soft, radius + soft, d);
        if (value > best) {
          best = value;
          id = h;
        }
      }
    }
    return { v: withCellVariation(best, id, variation, seed), cell: best > 0.02 ? id : null };
  };
}

function compileSpeckle(params, seed) {
  const { px, py } = periods({ ...params, scale: Math.max(4, params.scale ?? 24) });
  const density = clamp01(params.cellVariation ?? 0.5);
  const size = Math.min(0.5, Math.max(0.04, params.edgeWidth ?? 0.18));
  return (u, v) => {
    const c = periodicCellular2(seed, u * px, v * py, px, py, 1);
    const r = cellRandom(c.id, hashCombine(seed, 0x3d5));
    if (r > density) return { v: 0, cell: null };
    const scaleR = size * (0.4 + 1.2 * cellRandom(c.id, hashCombine(seed, 0x7a1)));
    return { v: 1 - smoothstep(scaleR * 0.6, scaleR, c.f1), cell: c.id };
  };
}

// ---------------------------------------------------------------------------
// Material-flavored generators
// ---------------------------------------------------------------------------

function compileMarble(params, seed) {
  const { px, py } = periods(params);
  const octaves = intIn(params.detail ?? 4, 1, 8, 4);
  const sharp = 0.5 + (params.grain ?? 0.5) * 6;
  const veins = intIn(params.rings ?? 3, 1, 128, 3);
  return (u, v) => {
    const turb = periodicTurbulence2(seed, u * px, v * py, px, py, octaves, 0.55);
    const phase = fract(u * veins + turb * 1.35);
    const wave = Math.abs(phase * 2 - 1);
    return { v: clamp01(Math.pow(wave, sharp)), cell: null };
  };
}

function compileWoodGrain(params, seed) {
  const { px, py } = periods(params);
  const rings = intIn(params.rings ?? 6, 1, 128, 6);
  const grain = clamp01(params.grain ?? 0.5);
  const octaves = intIn(params.detail ?? 3, 1, 8, 3);
  const streakSeed = hashCombine(seed, 0xbeef);
  return (u, v) => {
    const wobble = periodicFbm2(seed, u * px, v * py, px, py, octaves, 0.5);
    const ringPhase = fract(u * rings + wobble * 0.7);
    const ring = 1 - Math.abs(ringPhase * 2 - 1);
    // Fine streaks run along the grain (v axis) — heavy stretch.
    const streak = periodicFbm2(streakSeed, u * px * 8, v * Math.max(1, Math.round(py / 4)), px * 8, Math.max(1, Math.round(py / 4)), 2, 0.5);
    return { v: clamp01(ring * (1 - grain * 0.45) + (streak * 0.5 + 0.5) * grain * 0.55), cell: null };
  };
}

function compileCracks(params, seed) {
  const { px, py } = periods(params);
  const width = Math.min(0.6, Math.max(0.01, params.edgeWidth ?? 0.1));
  const jitter = clamp01(params.cellJitter ?? 1);
  const variation = clamp01(params.cellVariation ?? 0);
  return (u, v) => {
    const c = periodicCellular2(seed, u * px, v * py, px, py, jitter);
    const edge = c.f2 - c.f1;
    const plate = smoothstep(width * 0.5, width * 1.5, edge);
    return { v: withCellVariation(plate, c.id, variation, seed), cell: c.id };
  };
}

function compileCaustics(params, seed) {
  const { px, py } = periods(params);
  const width = Math.min(0.6, Math.max(0.02, params.edgeWidth ?? 0.16));
  return (u, v) => {
    const c = periodicCellular2(seed, u * px, v * py, px, py, 1);
    const web = 1 - smoothstep(0, width, c.f2 - c.f1);
    return { v: clamp01(Math.pow(web, 1.5)), cell: null };
  };
}

function compileFlat() {
  return () => ({ v: 1, cell: null });
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const NOISE_USES = ['scale', 'detail', 'detailGain', 'stretchX', 'stretchY', 'warp', 'warpScale'];
const CELL_USES = ['scale', 'stretchX', 'stretchY', 'cellJitter', 'cellVariation', 'edgeWidth', 'warp', 'warpScale'];
// stretchX/stretchY scale the joint width per axis so non-square modules
// (planks, 200x100 subway tile) can carry an even mortar line.
const GRID_USES = ['columns', 'rows', 'gap', 'bevel', 'cellVariation', 'stretchX', 'stretchY', 'warp', 'warpScale'];

export const TEXTURE_GENERATORS = Object.freeze({
  fbm: { label: 'Soft noise (fbm)', category: 'noise', uses: NOISE_USES, compile: makeNoise(periodicFbm2, true) },
  billow: { label: 'Billow noise', category: 'noise', uses: NOISE_USES, compile: makeNoise(periodicBillow2, true) },
  ridged: { label: 'Ridged noise', category: 'noise', uses: NOISE_USES, compile: makeNoise(periodicRidged2, false) },
  turbulence: { label: 'Turbulence', category: 'noise', uses: NOISE_USES, compile: makeNoise(periodicTurbulence2, false) },
  value: {
    label: 'Blocky noise',
    category: 'noise',
    uses: ['scale', 'stretchX', 'stretchY', 'warp', 'warpScale'],
    compile: (params, seed) => {
      const { px, py } = periods(params);
      return (u, v) => ({ v: clamp01(periodicValue2(seed, u * px, v * py, px, py) * 0.5 + 0.5), cell: null });
    },
  },
  perlin: {
    label: 'Smooth waves',
    category: 'noise',
    uses: ['scale', 'stretchX', 'stretchY', 'warp', 'warpScale'],
    compile: (params, seed) => {
      const { px, py } = periods(params);
      return (u, v) => ({ v: clamp01(periodicPerlin2(seed, u * px, v * py, px, py) * 0.5 + 0.5), cell: null });
    },
  },

  // pow() flattens the conical distance falloff into plateau-topped cobbles.
  worley: { label: 'Cobbles (worley)', category: 'cellular', uses: CELL_USES, compile: makeCellular((c) => Math.pow(clamp01(1 - c.f1 * 1.15), 0.6)) },
  worleyF2: { label: 'Cell froth', category: 'cellular', uses: CELL_USES, compile: makeCellular((c) => 1 - Math.min(1, (c.f2 - 0.35) * 1.1)) },
  cells: {
    label: 'Flat cells (voronoi)',
    category: 'cellular',
    uses: CELL_USES,
    compile: makeCellular((c) => cellRandom(c.id, 0x1234)),
  },
  cracks: { label: 'Crack plates', category: 'cellular', uses: CELL_USES, compile: compileCracks },
  caustics: { label: 'Caustic web', category: 'cellular', uses: ['scale', 'stretchX', 'stretchY', 'edgeWidth', 'warp', 'warpScale'], compile: compileCaustics },
  speckle: { label: 'Speckle chips', category: 'cellular', uses: ['scale', 'cellVariation', 'edgeWidth'], compile: compileSpeckle },

  bricks: { label: 'Bricks (running bond)', category: 'pattern', uses: GRID_USES, compile: (p, s) => compileBricks(p, s, 'running') },
  tiles: { label: 'Tiles (stacked)', category: 'pattern', uses: GRID_USES, compile: (p, s) => compileBricks(p, s, 'stacked') },
  hex: { label: 'Hex tiles', category: 'pattern', uses: ['columns', 'gap', 'bevel', 'cellVariation', 'warp', 'warpScale'], compile: compileHex },
  checker: { label: 'Checker', category: 'pattern', uses: ['columns', 'rows', 'warp', 'warpScale'], compile: compileChecker },
  grid: { label: 'Grid lines', category: 'pattern', uses: ['columns', 'rows', 'gap', 'bevel', 'stretchX', 'stretchY', 'warp', 'warpScale'], compile: compileGrid },
  stripes: { label: 'Stripes', category: 'pattern', uses: ['columns', 'rows', 'cellVariation', 'warp', 'warpScale'], compile: compileStripes },
  chevron: { label: 'Chevron zigzag', category: 'pattern', uses: ['columns', 'rows', 'warp', 'warpScale'], compile: compileChevron },
  weave: { label: 'Cloth weave', category: 'pattern', uses: ['columns', 'rows', 'gap', 'warp', 'warpScale'], compile: compileWeave },
  basketWeave: { label: 'Basket weave', category: 'pattern', uses: ['columns', 'rows', 'gap', 'bevel', 'warp', 'warpScale'], compile: compileBasketWeave },
  scales: { label: 'Scales / shingles', category: 'pattern', uses: ['columns', 'rows', 'cellVariation', 'warp', 'warpScale'], compile: compileScales },
  dots: { label: 'Dots', category: 'pattern', uses: ['columns', 'rows', 'gap', 'bevel', 'cellJitter', 'cellVariation', 'warp', 'warpScale'], compile: compileDots },

  marble: { label: 'Marble veins', category: 'material', uses: ['scale', 'detail', 'rings', 'grain', 'stretchX', 'stretchY', 'warp', 'warpScale'], compile: compileMarble },
  woodGrain: { label: 'Wood grain', category: 'material', uses: ['scale', 'detail', 'rings', 'grain', 'stretchX', 'stretchY', 'warp', 'warpScale'], compile: compileWoodGrain },
  flat: { label: 'Flat (accents only)', category: 'material', uses: [], compile: compileFlat },
});

export const TEXTURE_GENERATOR_IDS = Object.freeze(Object.keys(TEXTURE_GENERATORS));

/**
 * Compiles a layer spec into a tileable sampler `(u, v) -> { v, cell }`.
 * Applies domain warp, invert, contrast, and bias around the raw generator.
 */
export function compileTextureLayer(spec, seed, salt) {
  const gen = TEXTURE_GENERATORS[spec.generator] ?? TEXTURE_GENERATORS.fbm;
  const layerSeed = hashCombine(seed >>> 0, salt >>> 0);
  const sample = gen.compile(spec, layerSeed);
  const warp = compileWarp(spec, layerSeed);
  const invert = Boolean(spec.invert);
  const rotate90 = Boolean(spec.rotate90);
  const contrast = Math.min(1, Math.max(-1, spec.contrast ?? 0));
  const bias = Math.min(0.5, Math.max(-0.5, spec.bias ?? 0));
  const gainFactor = contrast >= 0 ? 1 + contrast * 3 : 1 + contrast * 0.75;
  return (u0, v0) => {
    // A quarter turn on the square tile keeps tiling exact.
    let cu = rotate90 ? v0 : u0;
    let cv = rotate90 ? 1 - u0 : v0;
    const u = cu;
    const v = cv;
    if (warp) {
      const w = warp(u, v);
      cu = w.u - Math.floor(w.u);
      cv = w.v - Math.floor(w.v);
    }
    const out = sample(cu, cv);
    let value = invert ? 1 - out.v : out.v;
    value = clamp01((value - 0.5) * gainFactor + 0.5 + bias);
    return { v: value, cell: out.cell };
  };
}
