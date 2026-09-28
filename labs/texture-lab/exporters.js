// Texture Lab exports: per-map PNGs, an all-maps ZIP (hand-rolled STORE
// zip — the repo carries no archive dependency), recipe JSON, and share
// URLs. Export bakes run at their own resolution, independent of preview.

import { downloadBlob } from '../shared/download.js';
import {
  createTextureRecipeDocument,
  evaluateTextureMaps,
} from '../../src/texgen/index.js';

export const TEXTURE_EXPORT_RESOLUTIONS = Object.freeze([256, 512, 1024, 2048]);

export const TEXTURE_EXPORT_MAPS = Object.freeze([
  Object.freeze({ buffer: 'albedo', file: 'albedo', label: 'Albedo' }),
  Object.freeze({ buffer: 'normal', file: 'normal', label: 'Normal' }),
  Object.freeze({ buffer: 'roughness', file: 'roughness', label: 'Roughness' }),
  Object.freeze({ buffer: 'metalness', file: 'metalness', label: 'Metalness' }),
  Object.freeze({ buffer: 'ao', file: 'ao', label: 'Occlusion' }),
  Object.freeze({ buffer: 'heightBytes', file: 'height', label: 'Height' }),
  Object.freeze({ buffer: 'orm', file: 'orm', label: 'ORM (glTF packed)' }),
  Object.freeze({ buffer: 'emissive', file: 'emissive', label: 'Emissive' }),
]);

export function textureSlug(name) {
  return String(name || 'texture').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'texture';
}

/** RGBA bytes -> PNG Blob via an offscreen canvas. */
async function bytesToPngBlob(bytes, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const image = new ImageData(new Uint8ClampedArray(bytes.buffer, bytes.byteOffset, bytes.byteLength), size, size);
  context.putImageData(image, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('PNG encoding failed.');
  return blob;
}

// --- minimal ZIP writer (method 0 = STORE) -----------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** entries: [{ name, data: Uint8Array }] -> zip file bytes. */
function buildZip(entries) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const header = new DataView(new ArrayBuffer(30));
    header.setUint32(0, 0x04034b50, true);
    header.setUint16(4, 20, true); // version needed
    header.setUint16(6, 0x0800, true); // UTF-8 names
    header.setUint16(8, 0, true); // method: store
    header.setUint16(10, 0, true); // time
    header.setUint16(12, 0, true); // date
    header.setUint32(14, crc, true);
    header.setUint32(18, entry.data.length, true);
    header.setUint32(22, entry.data.length, true);
    header.setUint16(26, nameBytes.length, true);
    header.setUint16(28, 0, true);
    chunks.push(new Uint8Array(header.buffer), nameBytes, entry.data);
    central.push({ crc, nameBytes, offset, size: entry.data.length });
    offset += 30 + nameBytes.length + entry.data.length;
  }

  const centralStart = offset;
  for (const entry of central) {
    const record = new DataView(new ArrayBuffer(46));
    record.setUint32(0, 0x02014b50, true);
    record.setUint16(4, 20, true);
    record.setUint16(6, 20, true);
    record.setUint16(8, 0x0800, true);
    record.setUint16(10, 0, true);
    record.setUint32(16, entry.crc, true);
    record.setUint32(20, entry.size, true);
    record.setUint32(24, entry.size, true);
    record.setUint16(28, entry.nameBytes.length, true);
    record.setUint32(42, entry.offset, true);
    chunks.push(new Uint8Array(record.buffer), entry.nameBytes);
    offset += 46 + entry.nameBytes.length;
  }

  const eocd = new DataView(new ArrayBuffer(22));
  eocd.setUint32(0, 0x06054b50, true);
  eocd.setUint16(8, central.length, true);
  eocd.setUint16(10, central.length, true);
  eocd.setUint32(12, offset - centralStart, true);
  eocd.setUint32(16, centralStart, true);
  chunks.push(new Uint8Array(eocd.buffer));

  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of chunks) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

// --- public export API ---------------------------------------------------------

/** Bakes at export resolution. Returns the maps (or null when cancelled). */
export async function bakeForExport(settings, { resolution, onProgress, shouldCancel, imagePixels = null }) {
  return evaluateTextureMaps(settings, {
    imagePixels,
    onProgress,
    shouldCancel,
    size: resolution,
  });
}

export async function downloadTextureMapPng(maps, mapSpec, name) {
  const blob = await bytesToPngBlob(maps[mapSpec.buffer], maps.size);
  downloadBlob(blob, `${textureSlug(name)}_${mapSpec.file}_${maps.size}.png`, 'image/png');
}

/**
 * Downloads every selected map plus recipe.json and material.json in one
 * zip. `mapFiles` is a list of TEXTURE_EXPORT_MAPS entries.
 */
export async function downloadTextureZip(maps, mapFiles, { name, settings }) {
  const slugName = textureSlug(name);
  const entries = [];
  for (const spec of mapFiles) {
    const blob = await bytesToPngBlob(maps[spec.buffer], maps.size);
    entries.push({ data: new Uint8Array(await blob.arrayBuffer()), name: `${slugName}/${spec.file}.png` });
  }
  const encoder = new TextEncoder();
  entries.push({
    data: encoder.encode(JSON.stringify(createTextureRecipeDocument(settings, { name }), null, 2)),
    name: `${slugName}/recipe.json`,
  });
  entries.push({
    data: encoder.encode(JSON.stringify({
      emissiveIntensity: maps.emissiveEnabled ? maps.emissiveIntensity : 0,
      hint: 'three.js: MeshStandardMaterial({ map: albedo (sRGB), normalMap, roughnessMap, metalnessMap, aoMap, emissiveMap }); orm.png packs AO/rough/metal for glTF.',
      maps: mapFiles.map((spec) => `${spec.file}.png`),
      resolution: maps.size,
      seamless: true,
    }, null, 2)),
    name: `${slugName}/material.json`,
  });
  downloadBlob(buildZip(entries), `${slugName}_${maps.size}.zip`, 'application/zip');
}

export function downloadTextureRecipe(settings, name) {
  const document = createTextureRecipeDocument(settings, { name });
  downloadBlob(JSON.stringify(document, null, 2), `${textureSlug(name)}.texture.json`, 'application/json');
}

/**
 * Copies a shareable lab URL with the recipe inlined in ?textureRecipe=.
 * The image base (a data URL, often 100 kB+) never fits in a URL — it is
 * stripped and the caller should say so. Returns { url, strippedImage }.
 */
export function textureShareUrl(settings, name) {
  const document = createTextureRecipeDocument(settings, { name });
  const strippedImage = Boolean(document.settings.image);
  if (strippedImage) document.settings.image = null;
  const url = new URL(window.location.href);
  url.search = '';
  url.searchParams.set('textureRecipe', JSON.stringify(document));
  return { strippedImage, url: url.toString() };
}
