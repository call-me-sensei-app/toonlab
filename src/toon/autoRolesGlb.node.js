// Node-only: precomputes a GLB's automatic roles without a browser
// (`toonlab auto-roles`, cli/autoRoles.mjs). three's GLTFLoader parses the
// file; its base-colour images are decoded with `sharp` (an optional peer
// dependency, imported only here) into DataTextures, downscaled to what the
// browser analysis reads: readTexturePixels draws the image at most 1024 px
// on the long edge with image smoothing off. Measured on a Tokyo Story Map
// NPC (2048 px JPEG, Chrome 151, 2026-10-25): sharp's JPEG decode equals
// Chrome's bit for bit, and Chrome's nearest downscale keeps source texel
// floor(x · 2), which nearestDownscale reproduces (sharp's own nearest
// kernel keeps the odd texels, a mean difference of 7/255). Never import
// this from browser code.

import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, join } from 'node:path';

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';

import { serializeAutoRoles } from './autoRolesData.js';
import { exportAutoRoles } from './toonMaterialAdapter.js';

// readTexturePixels reads base colour at this size in the browser.
const ANALYSIS_TEXTURE_SIZE = 1024;
const GL_WRAPPING = { 10497: THREE.RepeatWrapping, 33071: THREE.ClampToEdgeWrapping, 33648: THREE.MirroredRepeatWrapping };

async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    throw new Error('toonlab auto-roles decodes textures with sharp; install it next to ToonLab: npm install --save-dev sharp');
  }
}

// Every texture a material uses as its base colour (the only image the
// analysis reads); others get a 1×1 stand-in and are never decoded.
function baseColorTextureIndices(json) {
  const indices = new Set();
  for (const material of json.materials ?? []) {
    const index = material.pbrMetallicRoughness?.baseColorTexture?.index;
    if (Number.isInteger(index)) indices.add(index);
  }
  return indices;
}

function placeholderTexture() {
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
  texture.needsUpdate = true;
  return texture;
}

// GLTFLoader plugin: decodes base-colour images itself (GLTFLoader's own path
// needs the DOM or createImageBitmap) and configures them as
// GLTFParser.loadTextureImage would.
function nodeTexturePlugin(sharp) {
  return (parser) => {
    const json = parser.json;
    const decoded = baseColorTextureIndices(json);
    return {
      name: 'TOONLAB_node_textures',
      loadTexture: async (textureIndex) => {
        const textureDef = json.textures[textureIndex];
        if (!decoded.has(textureIndex)) return placeholderTexture();
        const sourceDef = json.images?.[textureDef.source];
        if (!sourceDef) throw new Error(`Texture ${textureIndex} has no image this tool can decode (a KTX2/Basis-only texture?). Export auto roles from the GLB with its source JPEG/PNG/WebP images, before compressing them.`);
        const bytes = sourceDef.bufferView !== undefined
          ? new Uint8Array(await parser.getDependency('bufferView', sourceDef.bufferView))
          : await readImageUri(sourceDef.uri, parser.options.path);
        const { data, info } = await sharp(bytes).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
        const pixels = nearestDownscale({ data: new Uint8Array(data), height: info.height, width: info.width }, ANALYSIS_TEXTURE_SIZE);
        const texture = new THREE.DataTexture(pixels.data, pixels.width, pixels.height, THREE.RGBAFormat);
        const sampler = json.samplers?.[textureDef.sampler] ?? {};
        texture.flipY = false;
        texture.name = textureDef.name || sourceDef.name || '';
        texture.wrapS = GL_WRAPPING[sampler.wrapS] ?? THREE.RepeatWrapping;
        texture.wrapT = GL_WRAPPING[sampler.wrapT] ?? THREE.RepeatWrapping;
        texture.userData.mimeType = sourceDef.mimeType ?? '';
        texture.needsUpdate = true;
        parser.associations.set(texture, { textures: textureIndex });
        return texture;
      },
    };
  };
}

// RGBA image to at most `maxSize` on its long edge (readTexturePixels'
// rounding), keeping source texel floor(x · source / target) as Chrome's
// unsmoothed drawImage does.
export function nearestDownscale(image, maxSize) {
  const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
  if (scale === 1) return image;
  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const sourceRow = Math.min(image.height - 1, Math.floor((y * image.height) / height)) * image.width;
    for (let x = 0; x < width; x += 1) {
      const source = (sourceRow + Math.min(image.width - 1, Math.floor((x * image.width) / width))) * 4;
      data.set(image.data.subarray(source, source + 4), (y * width + x) * 4);
    }
  }
  return { data, height, width };
}

async function readImageUri(uri, basePath) {
  if (uri.startsWith('data:')) return new Uint8Array(Buffer.from(uri.slice(uri.indexOf(',') + 1), 'base64'));
  return new Uint8Array(await readFile(join(basePath, decodeURIComponent(uri))));
}

/** Parses a GLB/glTF file in Node with its base-colour textures decoded. */
export async function loadGlbForAutoRoles(path) {
  const sharp = await loadSharp();
  await MeshoptDecoder.ready;
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  loader.register(nodeTexturePlugin(sharp));
  const file = await readFile(path);
  const buffer = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
  return loader.parseAsync(buffer, `${dirname(path)}/`);
}

/**
 * Exports a model file's automatic roles next to it: `<name>.toonroles.json`
 * and one `<name>.toonroles.<mesh>.png` per role mask (RGB; mask alpha is
 * unused). `options` are the applyToonShader options the runtime converts
 * with; `forward` sets `root.userData.toonForward` first, as a runtime that
 * declares the rest-pose facing does. Returns the paths written and the live
 * conversion's auto-role result and report.
 */
export async function exportAutoRolesForFile(path, {
  forward = null,
  maskSize = Infinity,
  options = {},
  outDir = dirname(path),
  pretty = false,
} = {}) {
  const sharp = await loadSharp();
  const gltf = await loadGlbForAutoRoles(path);
  const root = gltf.scene;
  if (forward) root.userData.toonForward = [...forward];
  const started = performance.now();
  const { conversion, record } = exportAutoRoles(root, options);
  const analysisMs = Math.round(performance.now() - started);
  const stem = basename(path, extname(path));
  const { json, masks } = serializeAutoRoles(record, { maskSize, maskUri: (index) => `${stem}.toonroles.${index}.png`, pretty });
  const written = [];
  for (const mask of masks) {
    const file = join(outDir, mask.uri);
    await sharp(Buffer.from(mask.data.buffer, mask.data.byteOffset, mask.data.byteLength), { raw: { channels: 4, height: mask.height, width: mask.width } })
      .removeAlpha()
      .png({ compressionLevel: 9 })
      .toFile(file);
    written.push(file);
  }
  const jsonPath = join(outDir, `${stem}.toonroles.json`);
  await writeFile(jsonPath, json, 'utf8');
  written.unshift(jsonPath);
  return {
    analysisMs,
    autoRoles: conversion.autoRoles,
    files: written,
    report: conversion.report,
  };
}
