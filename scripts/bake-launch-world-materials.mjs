// Bakes the §9 launch-world material set with ToonLab Texture Lab (src/texgen).
//
//   node scripts/bake-launch-world-materials.mjs [--fast] [ID,...]
//
// Outputs
//   assets-local/launch-world/materials/<ID>/recipe.json   portable texture recipe
//   assets-local/launch-world/materials/<ID>/maps/*.png    albedo/normal/roughness/
//                                                          metalness/ao/orm/height
//   assets-local/launch-world/materials/material-set.json  tile sizes, roles, px/cm
//   ../launch-plan/review/captures/materials/<ID>-flat.png    single tile
//   ../launch-plan/review/captures/materials/<ID>-tiled4x4.png 4x4 repetition check
//
// Everything here is deterministic: evaluateTextureMaps is pure CPU, seeded,
// and DOM-free, so the same recipe always bakes the same bytes.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import {
  createTextureRecipeDocument,
  evaluateTextureMaps,
  validateTextureRecipeDocument,
} from '../src/texgen/index.js';
import {
  MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  MANUFACTURED_MATERIAL_MANIFEST_VERSION,
  validateManufacturedMaterialManifest,
} from '../src/environment/manufacturedMaterialContract.js';
import {
  MATERIAL_SET,
  RETIRED_MATERIALS,
  HERO_TEXEL_BAR,
  SUPPORTING_TEXEL_BAR,
  texelDensity,
} from './launch-world-material-set.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const materialsDir = resolve(repo, 'assets-local/launch-world/materials');
const capturesDir = resolve(repo, '../launch-plan/review/captures/materials');

const argv = process.argv.slice(2);
const fast = argv.includes('--fast');
const only = argv.filter((token) => !token.startsWith('--')).join(',') || null;
const onlyIds = only ? new Set(only.split(',').map((s) => s.trim())) : null;

// --- PNG writer (RGBA8 / GRAY8, no dependencies) -----------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function textChunk(keyword, text) {
  return pngChunk('tEXt', Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(String(text).replaceAll('\n', ' '), 'latin1'),
  ]));
}

/** `rgba` is RGBA8; `channels` 4 writes RGBA, 3 writes RGB (drops alpha). */
function encodePng(rgba, width, height, { channels = 4, text = {} } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = channels === 4 ? 6 : 2;
  const stride = width * channels;
  const raw = Buffer.alloc(height * (1 + stride));
  const row = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    if (channels === 4) {
      rgba.copy
        ? rgba.copy(row, 0, y * width * 4, (y + 1) * width * 4)
        : row.set(rgba.subarray(y * width * 4, (y + 1) * width * 4));
    } else {
      for (let x = 0; x < width; x += 1) {
        const s = (y * width + x) * 4;
        row[x * 3] = rgba[s];
        row[x * 3 + 1] = rgba[s + 1];
        row[x * 3 + 2] = rgba[s + 2];
      }
    }
    const start = y * (1 + stride);
    raw[start] = 1; // Sub filter
    for (let i = 0; i < stride; i += 1) {
      raw[start + 1 + i] = (row[i] - (i >= channels ? row[i - channels] : 0)) & 0xFF;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    pngChunk('IHDR', ihdr),
    ...Object.entries(text).map(([k, v]) => textChunk(k, v)),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// --- image helpers -----------------------------------------------------------

function toBuffer(view) {
  return Buffer.from(view.buffer, view.byteOffset, view.byteLength);
}

/**
 * Power-of-two downscale factor landing closest to `target` px. Source sizes
 * are 1024/2048/4096, so only powers of two divide them exactly — a fractional
 * factor would produce a non-integer output size and a torn image.
 */
function pickFactor(size, target) {
  let factor = 1;
  while (size / (factor * 2) >= target) factor *= 2;
  return factor;
}

/** Nearest-neighbour-free box downscale of an RGBA8 square by an integer factor. */
function boxDownscale(src, size, factor) {
  const out = size / factor;
  const dst = Buffer.alloc(out * out * 4);
  const area = factor * factor;
  for (let y = 0; y < out; y += 1) {
    for (let x = 0; x < out; x += 1) {
      let r = 0; let g = 0; let b = 0; let a = 0;
      for (let j = 0; j < factor; j += 1) {
        const rowBase = ((y * factor + j) * size + x * factor) * 4;
        for (let i = 0; i < factor; i += 1) {
          const s = rowBase + i * 4;
          r += src[s]; g += src[s + 1]; b += src[s + 2]; a += src[s + 3];
        }
      }
      const d = (y * out + x) * 4;
      dst[d] = Math.round(r / area);
      dst[d + 1] = Math.round(g / area);
      dst[d + 2] = Math.round(b / area);
      dst[d + 3] = Math.round(a / area);
    }
  }
  return dst;
}

/** Repeats an RGBA8 square `n` times on each axis. */
function tileImage(src, size, n) {
  const out = size * n;
  const dst = Buffer.alloc(out * out * 4);
  for (let y = 0; y < out; y += 1) {
    const sy = y % size;
    for (let x = 0; x < out; x += 1) {
      const s = (sy * size + (x % size)) * 4;
      const d = (y * out + x) * 4;
      dst[d] = src[s]; dst[d + 1] = src[s + 1];
      dst[d + 2] = src[s + 2]; dst[d + 3] = src[s + 3];
    }
  }
  return dst;
}

// --- repetition metric -------------------------------------------------------

/**
 * Autocorrelation-style repetition read: how strongly the tile's own
 * low-frequency luminance structure stands out. A tile whose macro contrast is
 * high has a landmark that survives repetition; a flat one does not.
 * Returns the peak-to-peak luminance of the tile blurred to 16x16, in sRGB 0-1.
 */
function macroContrast(rgba, size) {
  const cells = 16;
  const step = size / cells;
  const grid = new Float64Array(cells * cells);
  for (let cy = 0; cy < cells; cy += 1) {
    for (let cx = 0; cx < cells; cx += 1) {
      let sum = 0; let count = 0;
      for (let y = Math.floor(cy * step); y < Math.floor((cy + 1) * step); y += 1) {
        for (let x = Math.floor(cx * step); x < Math.floor((cx + 1) * step); x += 1) {
          const s = (y * size + x) * 4;
          sum += 0.2126 * rgba[s] + 0.7152 * rgba[s + 1] + 0.0722 * rgba[s + 2];
          count += 1;
        }
      }
      grid[cy * cells + cx] = sum / count / 255;
    }
  }
  let min = 1; let max = 0; let mean = 0;
  for (const v of grid) { min = Math.min(min, v); max = Math.max(max, v); mean += v; }
  mean /= grid.length;
  let variance = 0;
  for (const v of grid) variance += (v - mean) ** 2;
  return { peakToPeak: max - min, rms: Math.sqrt(variance / grid.length), mean };
}

/** Seam check: mean |delta| between opposite tile edges, in 0-255 units. */
function seamError(rgba, size) {
  let du = 0; let dv = 0;
  for (let i = 0; i < size; i += 1) {
    const l = (i * size + 0) * 4;
    const r = (i * size + size - 1) * 4;
    const t = (0 * size + i) * 4;
    const b = ((size - 1) * size + i) * 4;
    for (let c = 0; c < 3; c += 1) {
      du += Math.abs(rgba[l + c] - rgba[r + c]);
      dv += Math.abs(rgba[t + c] - rgba[b + c]);
    }
  }
  return { u: du / (size * 3), v: dv / (size * 3) };
}

// --- bake --------------------------------------------------------------------

mkdirSync(materialsDir, { recursive: true });
mkdirSync(capturesDir, { recursive: true });

const MAPS = [
  ['albedo', 'albedo', 'sRGB'],
  ['normal', 'normal', 'linear'],
  ['roughness', 'roughness', 'linear'],
  ['metalness', 'metalness', 'linear'],
  ['ao', 'ao', 'linear'],
  ['orm', 'orm', 'linear'],
  ['heightBytes', 'height', 'linear'],
];

/**
 * §8: "Every material receives semantic ToonLab roles before the Manufactured
 * Surface shader is applied." Validate the declared roles — primary and every
 * alternate use — against the shipped contract rather than trusting the table.
 */
function validateRoles(entry) {
  const variants = [
    { note: 'primary', ...entry.roles },
    ...(entry.alternateRoles ?? []).map((alternate) => ({ ...entry.roles, ...alternate })),
  ];
  const errors = [];
  for (const variant of variants) {
    const { note, objectClass, ...classification } = variant;
    const result = validateManufacturedMaterialManifest({
      type: MANUFACTURED_MATERIAL_MANIFEST_TYPE,
      version: MANUFACTURED_MATERIAL_MANIFEST_VERSION,
      assetId: entry.id,
      objectClass: objectClass ?? entry.roles.objectClass,
      assignments: [{ selector: { materialName: entry.id }, classification }],
    });
    if (!result.ok) errors.push(`${note ?? 'alternate'}: ${result.errors.join(' ')}`);
  }
  return errors;
}

const report = [];

for (const entry of MATERIAL_SET) {
  if (onlyIds && !onlyIds.has(entry.id) && !onlyIds.has(entry.setId ?? '')) continue;
  const size = fast ? Math.min(1024, entry.resolution) : entry.resolution;
  const density = texelDensity(entry);
  const bar = entry.heroUse ? HERO_TEXEL_BAR : SUPPORTING_TEXEL_BAR;

  const document = createTextureRecipeDocument(entry.settings, { name: entry.name });
  document.id = entry.id;
  const validation = validateTextureRecipeDocument(document);
  if (!validation.ok) {
    console.error(`${entry.id}: INVALID RECIPE -> ${validation.errors.join(' ')}`);
    process.exitCode = 1;
    continue;
  }
  const roleErrors = validateRoles(entry);
  if (roleErrors.length > 0) {
    console.error(`${entry.id}: INVALID SEMANTIC ROLES -> ${roleErrors.join(' | ')}`);
    process.exitCode = 1;
    continue;
  }

  const started = Date.now();
  const maps = await evaluateTextureMaps(document.settings, { size });
  const ms = Date.now() - started;

  const dir = resolve(materialsDir, entry.id);
  mkdirSync(resolve(dir, 'maps'), { recursive: true });

  const provenance = {
    Title: `${entry.id} — ${entry.material}`,
    Source: 'ToonLab Texture Lab (@call-me-sensei/toonlab/texgen), procedural, deterministic',
    Comment:
      `world tile ${entry.tile} m · ${size} px source · ${density.toFixed(2)} px/cm · `
      + `seed ${entry.settings.global.seed} · no generated-image content · `
      + 'albedo carries no baked lighting, cast shadow, matcap or reflection',
  };

  for (const [buffer, file] of MAPS) {
    const png = encodePng(toBuffer(maps[buffer]), size, size, {
      channels: 4,
      text: { ...provenance, Title: `${entry.id} ${file}` },
    });
    writeFileSync(resolve(dir, 'maps', `${file}.png`), png);
  }

  const albedo = toBuffer(maps.albedo);
  const macro = macroContrast(albedo, size);
  const seam = seamError(albedo, size);

  // Proof sheet 1 — flat tile at 1024.
  const flatFactor = pickFactor(size, 1024);
  const flat = flatFactor > 1 ? boxDownscale(albedo, size, flatFactor) : albedo;
  const flatSize = size / flatFactor;
  writeFileSync(
    resolve(capturesDir, `${entry.id}-flat.png`),
    encodePng(flat, flatSize, flatSize, { channels: 3, text: provenance }),
  );

  // Proof sheet 2 — 4x4 repetition check at 1536 (384 px per tile).
  const cellFactor = pickFactor(size, 320);
  const cell = cellFactor > 1 ? boxDownscale(albedo, size, cellFactor) : albedo;
  const cellSize = size / cellFactor;
  const tiled = tileImage(cell, cellSize, 4);
  writeFileSync(
    resolve(capturesDir, `${entry.id}-tiled4x4.png`),
    encodePng(tiled, cellSize * 4, cellSize * 4, {
      channels: 3,
      text: { ...provenance, Comment: `4x4 repetition check — covers ${(entry.tile * 4).toFixed(1)} m` },
    }),
  );

  writeFileSync(
    resolve(dir, 'recipe.json'),
    `${JSON.stringify(document, null, 2)}\n`,
  );

  const row = {
    id: entry.id,
    setId: entry.setId ?? entry.id,
    material: entry.material,
    sourceResolution: entry.resolution,
    bakedAt: size,
    worldTileMetres: entry.tile,
    texelDensityPxPerCm: Number(density.toFixed(2)),
    bar,
    clearsBar: density >= bar,
    marginOverBar: Number((density / bar).toFixed(2)),
    coveredByOneTile: `${entry.tile} x ${entry.tile} m`,
    roles: entry.roles,
    alternateRoles: entry.alternateRoles ?? [],
    styleDomain: entry.styleDomain ?? 'manufactured.surface',
    terrainDomainBlocked: entry.terrainDomainBlocked ?? null,
    groundSplat: entry.groundSplat ?? null,
    waterDriven: entry.waterDriven ?? null,
    shots: entry.shots,
    use: entry.use,
    module: entry.module ?? null,
    seed: entry.settings.global.seed,
    macroContrastPeakToPeak: Number(macro.peakToPeak.toFixed(4)),
    macroContrastRms: Number(macro.rms.toFixed(4)),
    seamErrorU: Number(seam.u.toFixed(3)),
    seamErrorV: Number(seam.v.toFixed(3)),
    bakeMs: ms,
    notes: entry.notes,
  };
  report.push(row);

  console.log(
    `${entry.id.padEnd(22)} ${String(size).padStart(5)}px  tile ${String(entry.tile).padStart(4)}m  `
    + `${density.toFixed(2).padStart(6)} px/cm  ${density >= bar ? 'PASS' : 'FAIL'} (bar ${bar})  `
    + `macro p2p ${macro.peakToPeak.toFixed(3)}  seam u/v ${seam.u.toFixed(2)}/${seam.v.toFixed(2)}  ${ms}ms`,
  );
}

// A filtered bake must not drop the materials it did not touch: the manifest is
// the source of truth for tile size, roles and density for the whole set, and
// the proof stage reads it by id. Merge onto whatever is already on disk.
const setPath = resolve(materialsDir, 'material-set.json');
const previous = existsSync(setPath)
  ? (JSON.parse(readFileSync(setPath, 'utf8')).materials ?? [])
  : [];
const merged = [...previous];
for (const row of report) {
  const index = merged.findIndex((existing) => existing.id === row.id);
  if (index >= 0) merged[index] = row;
  else merged.push(row);
}
const order = new Map(MATERIAL_SET.map((entry, index) => [entry.id, index]));
merged.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

// Materials authored for the cancelled Nova Promenade / Azure Headland scenes
// keep their bakes on disk but must not be readable as live rows: a consumer
// scanning `materials` for a tile size would otherwise pick up a surface no
// longer in any scene and no longer under any quality claim.
const retiredIds = new Set(RETIRED_MATERIALS.map((entry) => entry.id));
const live = merged.filter((row) => !retiredIds.has(row.id));
const retired = RETIRED_MATERIALS.map((entry) => ({
  ...entry,
  lastBaked: merged.find((row) => row.id === entry.id) ?? null,
}));

writeFileSync(
  setPath,
  `${JSON.stringify({
    type: 'toonlab/launch-world-material-set',
    version: 1,
    spec: 'launch-plan/18-launch-video-world-production-plan-2026-08-15.md §9',
    scene: 'launch-plan/20-stillwater-garden-scene-brief.md (Stillwater Garden)',
    source: 'ToonLab Texture Lab (@call-me-sensei/toonlab/texgen)',
    generatedImages: false,
    runtimeOutput: 'KTX2',
    texelBars: { hero: HERO_TEXEL_BAR, supporting: SUPPORTING_TEXEL_BAR },
    materials: live,
    retired,
  }, null, 2)}\n`,
);

console.log(`\n${report.length} materials -> ${materialsDir}`);
console.log(`proof sheets -> ${capturesDir}`);
