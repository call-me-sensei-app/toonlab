// Bakes the original non-textual sign-art set with ToonLab Texture Lab (src/texgen).
//
//   node scripts/bake-launch-world-signage.mjs [--fast] [--validate] [ID,...]
//
//   --validate  recipe + semantic-role + metric validation at 256 px, writes a
//               single contact sheet and no per-entry maps. Use this to prove
//               the set still bakes without producing ~1 GB of PNGs.
//   --fast      full pipeline at 512 px.
//   (default)   full pipeline at each entry's declared source resolution.
//
// Outputs (full pipeline)
//   assets-local/launch-world/signage/<ID>/recipe.json    portable texture recipe
//   assets-local/launch-world/signage/<ID>/maps/*.png     albedo/normal/roughness/
//                                                         metalness/ao/orm/height
//   assets-local/launch-world/signage/signage-set.json    tiles, roles, px/cm, metrics
//   ../launch-plan/review/captures/signage/<ID>-flat.png     single tile
//   ../launch-plan/review/captures/signage/<ID>-tiled4x4.png repetition check
//   ../launch-plan/review/captures/signage/contact-sheet.png whole set at a glance
//
// Everything here is deterministic: evaluateTextureMaps is pure CPU, seeded and
// DOM-free, so the same recipe always bakes the same bytes. No generated images
// and no generation credits are involved at any point.
//
// Structure and helpers deliberately mirror `bake-launch-world-materials.mjs`
// so the two sets fail the same way and can later merge into one bake.

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
  SIGNAGE_SET,
  HERO_TEXEL_BAR,
  SUPPORTING_TEXEL_BAR,
  ACCENT_SATURATION_THRESHOLD,
  texelDensity,
} from './launch-world-signage-set.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const signageDir = resolve(repo, 'assets-local/launch-world/signage');
const capturesDir = resolve(repo, '../launch-plan/review/captures/signage');

const argv = process.argv.slice(2);
const validateOnly = argv.includes('--validate');
const fast = argv.includes('--fast');
const only = argv.filter((token) => !token.startsWith('--')).join(',') || null;
const onlyIds = only ? new Set(only.split(',').map((s) => s.trim())) : null;

// --- PNG writer (RGBA8 / RGB8, no dependencies) -------------------------------

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
      row.set(rgba.subarray(y * width * 4, (y + 1) * width * 4));
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

// --- image helpers ------------------------------------------------------------

const toBuffer = (view) => Buffer.from(view.buffer, view.byteOffset, view.byteLength);

/** Power-of-two downscale factor landing closest to `target` px. */
function pickFactor(size, target) {
  let factor = 1;
  while (size / (factor * 2) >= target) factor *= 2;
  return factor;
}

/** Box downscale of an RGBA8 square by an integer factor. */
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
      dst[d] = Math.round(r / area); dst[d + 1] = Math.round(g / area);
      dst[d + 2] = Math.round(b / area); dst[d + 3] = Math.round(a / area);
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

// --- metrics ------------------------------------------------------------------

/**
 * Repetition proxy, same definition as the §9 material set: peak-to-peak
 * luminance of the tile blurred to 16x16. A landmark that would survive
 * repetition shows up as a high value.
 *
 * Signage reads this metric differently from a wall material, and that matters.
 * A wall wants a LOW figure — high macro contrast on concrete means a visible
 * repeating blotch. A sign panel legitimately HAS a landmark: the mark is the
 * whole point. So this is reported for signage but never gated on, except for
 * the entries whose panel repeat exceeds 1 on an axis, where the tile really
 * does repeat across one object and a landmark really would stamp.
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
    const l = (i * size) * 4;
    const r = (i * size + size - 1) * 4;
    const t = i * 4;
    const b = ((size - 1) * size + i) * 4;
    for (let c = 0; c < 3; c += 1) {
      du += Math.abs(rgba[l + c] - rgba[r + c]);
      dv += Math.abs(rgba[t + c] - rgba[b + c]);
    }
  }
  return { u: du / (size * 3), v: dv / (size * 3) };
}

/**
 * The colour-budget metric — the one this set exists to keep honest.
 *
 * `accentFraction` is the fraction of albedo pixels above
 * ACCENT_SATURATION_THRESHOLD (0.55) HSV saturation. The parity analysis §5.5
 * requires that the scene's accent colours be the ONLY pixels above that line,
 * so an entry that overspends is not merely "a bit bright" — it is competing
 * for a budget that belongs to the whole frame.
 *
 * Each entry declares `accentBudget` up front and the bake fails it if the
 * measurement exceeds the declaration. Declaring a number and then measuring it
 * is the difference between a colour policy and a colour opinion.
 */
function saturationProfile(rgba, size) {
  const n = size * size;
  let above = 0; let satSum = 0; let lumSum = 0;
  let lumMin = 1; let lumMax = 0;
  for (let i = 0; i < n; i += 1) {
    const s = i * 4;
    const r = rgba[s] / 255; const g = rgba[s + 1] / 255; const b = rgba[s + 2] / 255;
    const mx = Math.max(r, g, b); const mn = Math.min(r, g, b);
    const sat = mx > 0 ? (mx - mn) / mx : 0;
    if (sat > ACCENT_SATURATION_THRESHOLD) above += 1;
    satSum += sat;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    lumSum += lum;
    if (lum < lumMin) lumMin = lum;
    if (lum > lumMax) lumMax = lum;
  }
  return {
    accentFraction: above / n,
    meanSaturation: satSum / n,
    meanLuma: lumSum / n,
    lumaRange: lumMax - lumMin,
  };
}

// --- role validation ----------------------------------------------------------

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

// --- bake ---------------------------------------------------------------------

mkdirSync(capturesDir, { recursive: true });
if (!validateOnly) mkdirSync(signageDir, { recursive: true });

const MAPS = [
  ['albedo', 'albedo'],
  ['normal', 'normal'],
  ['roughness', 'roughness'],
  ['metalness', 'metalness'],
  ['ao', 'ao'],
  ['orm', 'orm'],
  ['heightBytes', 'height'],
];

const CONTACT_CELL = 256;
const report = [];
const contactCells = [];
let failures = 0;

for (const entry of SIGNAGE_SET) {
  if (onlyIds && !onlyIds.has(entry.id) && !onlyIds.has(entry.family ?? '')) continue;

  const size = validateOnly ? 256 : (fast ? Math.min(512, entry.resolution) : entry.resolution);
  const density = texelDensity(entry);
  const bar = entry.heroUse ? HERO_TEXEL_BAR : SUPPORTING_TEXEL_BAR;

  const document = createTextureRecipeDocument(entry.settings, { name: entry.name });
  document.id = entry.id;

  const validation = validateTextureRecipeDocument(document);
  if (!validation.ok) {
    console.error(`${entry.id}: INVALID RECIPE -> ${validation.errors.join(' ')}`);
    failures += 1;
    continue;
  }
  const roleErrors = validateRoles(entry);
  if (roleErrors.length > 0) {
    console.error(`${entry.id}: INVALID SEMANTIC ROLES -> ${roleErrors.join(' | ')}`);
    failures += 1;
    continue;
  }

  const started = Date.now();
  const maps = await evaluateTextureMaps(document.settings, { size });
  const ms = Date.now() - started;

  const albedo = toBuffer(maps.albedo);
  const macro = macroContrast(albedo, size);
  const seam = seamError(albedo, size);
  const colour = saturationProfile(albedo, size);

  // Density gate (§8) and colour-budget gate (§10.2 / parity §5.5).
  const densityOk = density >= bar;
  const accentOk = colour.accentFraction <= entry.accentBudget + 1e-6;
  if (!densityOk) {
    console.error(
      `${entry.id}: TEXEL DENSITY ${density.toFixed(2)} px/cm below bar ${bar}`,
    );
    failures += 1;
  }
  if (!accentOk) {
    console.error(
      `${entry.id}: ACCENT OVERSPEND — measured ${(colour.accentFraction * 100).toFixed(1)}% `
      + `of pixels above ${ACCENT_SATURATION_THRESHOLD} saturation, declared budget `
      + `${(entry.accentBudget * 100).toFixed(1)}%`,
    );
    failures += 1;
  }

  // Emissive is permitted only for entries declared as real fixtures (§8).
  const hasEmissive = entry.settings.emissive?.enabled === true;
  if (hasEmissive !== Boolean(entry.emissiveFixture)) {
    console.error(
      `${entry.id}: EMISSIVE/FIXTURE MISMATCH — map ${hasEmissive ? 'emits' : 'does not emit'}, `
      + `entry ${entry.emissiveFixture ? 'is' : 'is not'} declared a fixture. `
      + '§8 permits emissive only for real fixtures.',
    );
    failures += 1;
  }

  if (!validateOnly) {
    const dir = resolve(signageDir, entry.id);
    mkdirSync(resolve(dir, 'maps'), { recursive: true });

    const provenance = {
      Title: `${entry.id} — ${entry.name}`,
      Source: 'ToonLab Texture Lab (@call-me-sensei/toonlab/texgen), procedural, deterministic',
      Comment:
        `world tile ${entry.tile} m · ${size} px source · ${density.toFixed(2)} px/cm · `
        + `seed ${entry.settings.global.seed} · original non-textual graphic, no readable text · `
        + 'no generated-image content · albedo carries no baked lighting, cast shadow, '
        + 'matcap or reflection',
    };

    for (const [buffer, file] of MAPS) {
      writeFileSync(
        resolve(dir, 'maps', `${file}.png`),
        encodePng(toBuffer(maps[buffer]), size, size, {
          channels: 4, text: { ...provenance, Title: `${entry.id} ${file}` },
        }),
      );
    }

    const flatFactor = pickFactor(size, 1024);
    const flat = flatFactor > 1 ? boxDownscale(albedo, size, flatFactor) : albedo;
    writeFileSync(
      resolve(capturesDir, `${entry.id}-flat.png`),
      encodePng(flat, size / flatFactor, size / flatFactor, { channels: 3, text: provenance }),
    );

    const cellFactor = pickFactor(size, 320);
    const cell = cellFactor > 1 ? boxDownscale(albedo, size, cellFactor) : albedo;
    const cellSize = size / cellFactor;
    writeFileSync(
      resolve(capturesDir, `${entry.id}-tiled4x4.png`),
      encodePng(tileImage(cell, cellSize, 4), cellSize * 4, cellSize * 4, {
        channels: 3,
        text: { ...provenance, Comment: `4x4 repetition check — covers ${(entry.tile * 4).toFixed(1)} m` },
      }),
    );

    writeFileSync(resolve(dir, 'recipe.json'), `${JSON.stringify(document, null, 2)}\n`);
  }

  // Contact-sheet cell for the whole set at a glance.
  const contactFactor = pickFactor(size, CONTACT_CELL);
  contactCells.push([
    entry.id,
    contactFactor > 1 ? boxDownscale(albedo, size, contactFactor) : albedo,
    size / contactFactor,
  ]);

  report.push({
    id: entry.id,
    family: entry.family,
    name: entry.name,
    mark: entry.mark,
    sourceResolution: entry.resolution,
    bakedAt: size,
    worldTileMetres: entry.tile,
    texelDensityPxPerCm: Number(density.toFixed(2)),
    bar,
    clearsBar: densityOk,
    marginOverBar: Number((density / bar).toFixed(2)),
    coveredByOneTile: `${entry.tile} x ${entry.tile} m`,
    panel: entry.panel,
    mapping: entry.mapping ?? 'planar — U across the panel width, V up its height',
    accentBudget: entry.accentBudget,
    accentFractionMeasured: Number(colour.accentFraction.toFixed(4)),
    accentWithinBudget: accentOk,
    meanSaturation: Number(colour.meanSaturation.toFixed(4)),
    meanLuma: Number(colour.meanLuma.toFixed(4)),
    lumaRange: Number(colour.lumaRange.toFixed(4)),
    emissiveFixture: Boolean(entry.emissiveFixture),
    roles: entry.roles,
    alternateRoles: entry.alternateRoles ?? [],
    styleDomain: 'manufactured.surface',
    shots: entry.shots,
    use: entry.use,
    seed: entry.settings.global.seed,
    macroContrastPeakToPeak: Number(macro.peakToPeak.toFixed(4)),
    seamErrorU: Number(seam.u.toFixed(3)),
    seamErrorV: Number(seam.v.toFixed(3)),
    bakeMs: ms,
    notes: entry.notes,
  });

  console.log(
    `${entry.id.padEnd(14)} ${String(size).padStart(5)}px  tile ${String(entry.tile).padStart(4)}m  `
    + `${density.toFixed(2).padStart(6)} px/cm ${densityOk ? 'PASS' : 'FAIL'}  `
    + `accent ${(colour.accentFraction * 100).toFixed(1).padStart(5)}% / `
    + `${(entry.accentBudget * 100).toFixed(0).padStart(3)}% ${accentOk ? 'ok ' : 'OVER'}  `
    + `satMean ${colour.meanSaturation.toFixed(3)}  macro ${macro.peakToPeak.toFixed(3)}  `
    + `seam ${seam.u.toFixed(2)}/${seam.v.toFixed(2)}  ${ms}ms`,
  );
}

// --- contact sheet ------------------------------------------------------------

if (contactCells.length > 0) {
  const cols = 6;
  const cell = contactCells[0][2];
  const rows = Math.ceil(contactCells.length / cols);
  const W = cols * cell; const H = rows * cell;
  const sheet = Buffer.alloc(W * H * 4, 255);
  contactCells.forEach(([, buf, s], i) => {
    const ox = (i % cols) * cell; const oy = Math.floor(i / cols) * cell;
    for (let y = 0; y < Math.min(s, cell); y += 1) {
      for (let x = 0; x < Math.min(s, cell); x += 1) {
        const src = (y * s + x) * 4; const dst = ((oy + y) * W + ox + x) * 4;
        sheet[dst] = buf[src]; sheet[dst + 1] = buf[src + 1]; sheet[dst + 2] = buf[src + 2];
      }
    }
  });
  writeFileSync(
    resolve(capturesDir, 'contact-sheet.png'),
    encodePng(sheet, W, H, {
      channels: 3,
      text: {
        Title: 'Original non-textual sign-art set — contact sheet',
        Comment: `${contactCells.length} entries, ${cols} per row, reading order: `
          + contactCells.map(([id]) => id).join(' '),
      },
    }),
  );
}

// --- manifest -----------------------------------------------------------------

if (!validateOnly) {
  const setPath = resolve(signageDir, 'signage-set.json');
  const previous = existsSync(setPath)
    ? (JSON.parse(readFileSync(setPath, 'utf8')).signage ?? [])
    : [];
  const merged = [...previous];
  for (const row of report) {
    const index = merged.findIndex((existing) => existing.id === row.id);
    if (index >= 0) merged[index] = row; else merged.push(row);
  }
  const order = new Map(SIGNAGE_SET.map((entry, index) => [entry.id, index]));
  merged.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  writeFileSync(setPath, `${JSON.stringify({
    type: 'toonlab/launch-world-signage-set',
    version: 1,
    spec: 'launch-plan/18-launch-video-world-production-plan-2026-08-15.md §8/§9/§10.2/§13',
    resolution: 'launch-plan/review/art-direction-parity-analysis.md §2 gap #4',
    source: 'ToonLab Texture Lab (@call-me-sensei/toonlab/texgen)',
    generatedImages: false,
    readableText: false,
    runtimeOutput: 'KTX2',
    texelBars: { hero: HERO_TEXEL_BAR, supporting: SUPPORTING_TEXEL_BAR },
    accentSaturationThreshold: ACCENT_SATURATION_THRESHOLD,
    signage: merged,
  }, null, 2)}\n`);
  console.log(`\n${report.length} entries -> ${signageDir}`);
}

console.log(`proof sheets -> ${capturesDir}`);
if (failures > 0) {
  console.error(`\n${failures} gate failure(s).`);
  process.exitCode = 1;
} else {
  console.log(`\nall ${report.length} entries pass density, accent-budget and emissive gates.`);
}
