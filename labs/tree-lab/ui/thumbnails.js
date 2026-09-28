// Real rendered preset thumbnails for the start gallery. Results are cached
// as data URLs in localStorage keyed by a hash of the recipe options, so the
// gallery is instant after first open. WebGPU/WebGL2 node-renderer readback is
// async, so getPresetThumbnails returns cache hits immediately and reports new
// renders later via onUpdate.

import * as THREE from 'three';
import {
  createPlantFromRecipe,
  recipeFromSettings,
  resolveVegetationShaderPreset,
  settingsFromRecipe,
} from '../../../src/vegetation/experimental.js';
import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import { createBarkMaterial } from '../engine/barkTextures.js';

const CACHE_KEY = 'toonlab.treeDesigner.thumbs.v1';
const THUMBNAIL_RENDERER_VERSION = 2;

// Node-backend tile size: a multiple of 64 texels (64 * 4 bytes = 256
// bytes) so an atlas row of any tile count is already 256-byte aligned —
// sidesteps three's WebGPU-backend readRenderTargetPixelsAsync row padding
// (its copyTextureToBuffer aligns bytesPerRow up to 256 bytes; a
// non-aligned width would return padded rows the atlas slicing below would
// otherwise have to special-case). Visually indistinguishable from the
// the former 260px thumbnail scale — these are CSS-scaled <img> tags.
const NODE_TILE_SIZE = 256;
// Tiles per atlas batch: ONE. Multiple live plants in the scene during a
// batch cross-contaminate through shared foliage material/texture state
// (measured: canopy cards sampling the bark texture — every tile rendered
// warm-orange smears at batch 16, correct green trees at batch 1). One
// plant per render+readback also removes the mid-batch-await hazard the
// batching originally worked around. Thumbnails are cached after first
// render, so the extra readbacks are a one-time cost.
const NODE_ATLAS_BATCH = 1;

function optionsHash(recipe) {
  const text = `${THUMBNAIL_RENDERER_VERSION}|${JSON.stringify(recipe.options)}|${recipe.type}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16);
}

function readCache() {
  try {
    return JSON.parse(window.localStorage?.getItem(CACHE_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

function writeCache(cache) {
  try {
    window.localStorage?.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch { /* quota — thumbnails just re-render next time */ }
}

// ---- Node-backend rendering (webgpu / webgpu-forced-gl) --------------------

// Byte->byte linear-to-sRGB OETF lookup. Node backends render a CUSTOM
// render target in LINEAR working space regardless of texture.colorSpace —
// "rendering into a user render target skips the renderer's output color
// transform" on node backends (src/water/waterScenePasses.js grab-target
// notes; docs/tsl-conventions.md gotcha 18 — the encode only happens at the
// canvas draw).
const SRGB_ENCODE_LUT = new Uint8ClampedArray(256);
for (let i = 0; i < 256; i += 1) {
  const c = i / 255;
  const encoded = c <= 0.0031308 ? c * 12.92 : 1.055 * (c ** (1 / 2.4)) - 0.055;
  SRGB_ENCODE_LUT[i] = Math.round(encoded * 255);
}

let nodeThumbRenderer = null;
let nodeThumbAtlas = null;

function getNodeThumbRenderer() {
  if (!nodeThumbRenderer) {
    // Never appended to the DOM — matches the classic renderer below; its
    // canvas is never presented, only its render target is ever read.
    nodeThumbRenderer = createLabRenderer({ antialias: true });
    nodeThumbRenderer.setSize(NODE_TILE_SIZE, NODE_TILE_SIZE);
  }
  return nodeThumbRenderer;
}

function getNodeThumbAtlas() {
  if (!nodeThumbAtlas) {
    nodeThumbAtlas = new THREE.WebGLRenderTarget(
      NODE_TILE_SIZE * NODE_ATLAS_BATCH,
      NODE_TILE_SIZE,
      { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter },
    );
  }
  return nodeThumbAtlas;
}

function buildThumbScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x171c25);
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.7);
  sun.position.set(12, 20, 14);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xe8f5ff, 0.7));
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0xd4b678, 0.5));
  return scene;
}

function frameThumbCamera(camera, preset) {
  const size = preset.options?.size ?? 1.7;
  const eye = (preset.type === 'bush' ? 0.7 : 1.5) * size;
  camera.position.set(size * 1.4, eye + size * 0.5, 4.6 * size);
  camera.lookAt(0, eye * 0.9, 0);
}

function runtimeRecipeForThumbnail(preset) {
  const canonical = recipeFromSettings(settingsFromRecipe(preset));
  return {
    ...canonical,
    options: {
      ...canonical.options,
      ...(preset.options ?? {}),
    },
  };
}

function isMonochromeGalleryPreset(preset) {
  return preset?.options?.galleryMonochrome?.version >= 2
    || /^local_gallery_tree_\d+$/.test(String(preset?.id ?? ''));
}

function applyThumbnailStyle(plant, preset) {
  if (!isMonochromeGalleryPreset(preset)) return;
  const styleId = typeof preset.options?.vegetationShader === 'string'
    ? preset.options.vegetationShader
    : 'default';
  plant.setVegetationShader?.(resolveVegetationShaderPreset(styleId, {
    foliage: {
      // The candidate recipe owns the hue family. Thumbnails must use the
      // same zero-hue-variation treatment as the live editor instead of the
      // default seeded ±36° card shifts that made one tree look multicolored.
      hueShift: 0,
      hueVariation: 0,
      styleColorStrength: 0,
    },
  }));
}

// Slices one batch's atlas readback into per-preset data URLs. Node-backend
// RTs are written top-down (docs/tsl-conventions.md gotcha 6;
// src/shaders-tsl/chunks/pass-depth-color.js shadowClipAdjustWebGPU/GL and
// src/water/waterScenePasses.js FLIP_Y_UV_MATRIX both apply the identical
// y-adjust for webgpu AND webgpu-forced-gl), so row 0 of the readback is
// already the top row ImageData expects: no vertical flip here — verified
// empirically after fixing the batch contamination below (a flip renders
// the trees upside down on both node backends).
function sliceAtlasBatch(pixels, batch, cache, rendered) {
  const atlasWidth = NODE_TILE_SIZE * batch.length;
  const canvas2d = document.createElement('canvas');
  canvas2d.width = NODE_TILE_SIZE;
  canvas2d.height = NODE_TILE_SIZE;
  const ctx2d = canvas2d.getContext('2d');
  const batchRendered = {};

  batch.forEach(({ key, preset, ok }, index) => {
    if (!ok) return; // creation/render failed for this tile — leave uncached
    const imageData = ctx2d.createImageData(NODE_TILE_SIZE, NODE_TILE_SIZE);
    for (let y = 0; y < NODE_TILE_SIZE; y += 1) {
      const srcRowStart = (y * atlasWidth + index * NODE_TILE_SIZE) * 4;
      const destRowStart = y * NODE_TILE_SIZE * 4;
      for (let x = 0; x < NODE_TILE_SIZE; x += 1) {
        const srcPixel = srcRowStart + x * 4;
        const destPixel = destRowStart + x * 4;
        imageData.data[destPixel] = SRGB_ENCODE_LUT[pixels[srcPixel]];
        imageData.data[destPixel + 1] = SRGB_ENCODE_LUT[pixels[srcPixel + 1]];
        imageData.data[destPixel + 2] = SRGB_ENCODE_LUT[pixels[srcPixel + 2]];
        imageData.data[destPixel + 3] = 255;
      }
    }
    ctx2d.putImageData(imageData, 0, 0);
    const url = canvas2d.toDataURL('image/jpeg', 0.82);
    rendered[preset.id] = url;
    batchRendered[preset.id] = url;
    cache[preset.id] = { key, url };
  });
  return batchRendered;
}

async function renderThumbnailsNode(missing, { onProgress } = {}) {
  const cache = readCache();
  const rendered = {};
  const renderer = getNodeThumbRenderer();
  await whenRendererReady(renderer);

  const scene = buildThumbScene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
  const atlas = getNodeThumbAtlas();
  const retired = [];
  let completed = 0;

  for (let offset = 0; offset < missing.length; offset += NODE_ATLAS_BATCH) {
    const batch = missing.slice(offset, offset + NODE_ATLAS_BATCH);
    const plants = [];

    renderer.setRenderTarget(atlas);
    renderer.setScissorTest?.(false);
    renderer.clear();
    // One manual clear for the whole atlas; per-render autoClear would wipe
    // the previously rendered tiles (environmentAmbientProbe pattern).
    const previousAutoClear = renderer.autoClear;
    renderer.autoClear = false;

    batch.forEach((entry, index) => {
      let plant = null;
      try {
        const runtimeRecipe = runtimeRecipeForThumbnail(entry.preset);
        const styleId = typeof runtimeRecipe.options?.vegetationShader === 'string'
          ? runtimeRecipe.options.vegetationShader
          : 'default';
        plant = createPlantFromRecipe(runtimeRecipe, {
          trunkMaterial: createBarkMaterial(runtimeRecipe.options?.barkTexture, {
            height: runtimeRecipe.options?.trunk?.height ?? 1,
            vegetationShader: styleId,
          }),
        });
        applyThumbnailStyle(plant, entry.preset);
        plant.setSun({
          direction: [0.45, 0.75, 0.5], color: [1.0, 0.96, 0.86], sky: [0.72, 0.87, 1.0],
        });
        scene.add(plant);
        frameThumbCamera(camera, entry.preset);
        renderer.setViewport(index * NODE_TILE_SIZE, 0, NODE_TILE_SIZE, NODE_TILE_SIZE);
        renderer.render(scene, camera);
        entry.ok = true;
      } catch (error) {
        console.warn(`Thumbnail failed for ${entry.preset.id}:`, error);
      } finally {
        // Detach only — GPU disposal waits until after the batch readback
        // confirms every queued render actually completed (disposing here,
        // between renders, risks "used in submit while destroyed": the same
        // render-object revalidation hazard environmentAmbientProbe avoids
        // by never awaiting mid-batch).
        if (plant) scene.remove(plant);
        plants.push(plant);
      }
    });

    renderer.autoClear = previousAutoClear;

    let pixels = null;
    try {
      pixels = await renderer.readRenderTargetPixelsAsync(
        atlas, 0, 0, NODE_TILE_SIZE * batch.length, NODE_TILE_SIZE,
      );
    } catch (error) {
      console.warn('Thumbnail atlas readback failed:', error);
    }

    let batchRendered = {};
    if (pixels) {
      batchRendered = sliceAtlasBatch(pixels, batch, cache, rendered);
      // Persist per batch, not once at the end: a long queue interrupted by
      // a reload (or a failing tile later in the queue) keeps its progress.
      writeCache(cache);
    }
    completed += batch.length;
    onProgress?.({ completed, total: missing.length, rendered: batchRendered });

    // Yield a frame between batches so the workspace stays interactive while
    // the queue drains — without this, a cold cache froze the scene until
    // every tile had rendered.
    await new Promise((resolve) => requestAnimationFrame(resolve));
    // GPU disposal waits until the WHOLE queue drains: disposing between
    // batches raced the renderer's queued submits ("used in submit while
    // destroyed" validation errors), even one frame after the readback.
    retired.push(...plants);
  }

  renderer.setRenderTarget(null);
  retired.forEach((plant) => plant?.dispose());
  return rendered;
}

// Concurrent getPresetThumbnails calls (e.g. localPresets changing while an
// earlier render is still in flight) share one renderer/atlas — queue them
// instead of letting their render+readback cycles interleave.
let nodeRenderQueue = Promise.resolve();
function queueRenderThumbnailsNode(missing, options = {}) {
  const run = () => renderThumbnailsNode(missing, options);
  nodeRenderQueue = nodeRenderQueue.then(run, run);
  return nodeRenderQueue;
}

// ---- Public API --------------------------------------------------------

/**
 * Returns { [presetId]: dataUrl } for the given recipe documents,
 * rendering only the ones whose cache entry is missing or stale.
 *
 * On node backends, presets that are still rendering are absent from the
 * synchronous return; pass onUpdate to receive them (id -> dataUrl) once
 * their batch finishes.
 */
export function getPresetThumbnails(presets, { onUpdate } = {}) {
  const cache = readCache();
  const result = {};
  const missing = [];
  for (const preset of presets) {
    const key = optionsHash(preset);
    const entry = cache[preset.id];
    if (entry?.key === key) result[preset.id] = entry.url;
    else missing.push({ key, preset });
  }
  if (!missing.length) return result;

  queueRenderThumbnailsNode(missing)
    .then((rendered) => {
      if (Object.keys(rendered).length) onUpdate?.(rendered);
    })
    .catch((error) => console.warn('Node-backend thumbnail render failed:', error));
  return result;
}

/**
 * Explicitly render and cache every requested gallery thumbnail. The gallery
 * already renders cache misses in the background, but this promise-based API
 * gives the author a visible, repeatable "capture" action for a whole batch.
 * `onProgress` receives `{ completed, total, rendered }` after each tile.
 */
export function capturePresetThumbnails(presets, { onProgress } = {}) {
  const cache = readCache();
  const missing = [];
  let cached = 0;
  for (const preset of presets) {
    const key = optionsHash(preset);
    const entry = cache[preset.id];
    if (entry?.key === key) cached += 1;
    else missing.push({ key, preset });
  }
  const total = presets.length;
  onProgress?.({ completed: cached, total, rendered: {} });
  if (!missing.length) return Promise.resolve({});

  return queueRenderThumbnailsNode(missing, {
    onProgress: ({ completed, rendered }) => {
      onProgress?.({ completed: cached + completed, total, rendered });
    },
  });
}
