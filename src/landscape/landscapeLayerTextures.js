// Splat-layer texture resolution. A layer's `textureRef` is a small
// serializable descriptor — never a raw texture and never a signed URL:
//
//   { kind: 'texgen', presetId, size? }   — baked from a texgen preset
//   { kind: 'data-url', dataUrl }         — user-imported image (embedded)
//   { kind: '<external>', ... }           — resolved by a registered hook
//                                           (Pro registers 'pro-texture')
//
// Resolution is async and cached per-ref so re-applying settings never
// re-bakes a texgen preset or re-decodes an image.

import * as THREE from 'three';

import {
  BUILT_IN_TEXTURE_PRESETS,
  evaluateTextureMaps,
  findTexturePreset,
  syncTextureMapTextures,
} from '../texgen/index.js';

const TEXGEN_BAKE_SIZE = 256;

/** Curated texgen presets that make sense as terrain layers. */
export const LANDSCAPE_TEXGEN_PRESET_OPTIONS = Object.freeze(
  BUILT_IN_TEXTURE_PRESETS
    .filter((preset) => preset.category === 'ground' || preset.category === 'stone')
    .map((preset) => Object.freeze({ id: preset.id, label: preset.label })),
);

// Which texgen presets FIT each surface type — the texture picker shows the
// matching set instead of every ground/stone preset (a Grass surface offers
// grasses and ground covers, not cliff rock).
const PRESETS_BY_SURFACE = {
  grass: ['meadow-grass', 'forest-floor', 'fresh-snow'],
  dirt: ['dry-dirt', 'wet-mud', 'cracked-mud', 'forest-floor', 'gravel', 'asphalt'],
  rock: ['cliff-rock', 'granite', 'slate', 'basalt', 'sandstone-strata', 'cobblestone', 'castle-bricks', 'mossy-bricks', 'white-marble', 'black-gold-marble'],
  sand: ['desert-sand', 'gravel', 'sandstone-strata', 'cracked-mud', 'fresh-snow'],
};

/** `{ id, label }` texgen options fitting a surface-type id (grass/dirt/…). */
export function texgenOptionsForSurface(surfaceId) {
  const ids = PRESETS_BY_SURFACE[surfaceId];
  if (!ids) return [...LANDSCAPE_TEXGEN_PRESET_OPTIONS];
  return ids
    .map((id) => LANDSCAPE_TEXGEN_PRESET_OPTIONS.find((option) => option.id === id))
    .filter(Boolean);
}

const cache = new Map(); // cacheKey -> Promise<THREE.Texture|null>
const externalResolvers = new Map();

/** Pro registers `pro-texture` here (jobId → signed URL → texture). */
export function registerLayerTextureResolver(kind, resolver) {
  externalResolvers.set(kind, resolver);
}

function cacheKey(ref) {
  if (!ref?.kind) return null;
  if (ref.kind === 'texgen') return `texgen:${ref.presetId}:${ref.size ?? TEXGEN_BAKE_SIZE}`;
  if (ref.kind === 'data-url') return `data-url:${ref.dataUrl?.slice(0, 64)}:${ref.dataUrl?.length}`;
  return `${ref.kind}:${ref.jobId ?? ref.id ?? ref.url ?? ''}`;
}

async function bakeTexgen(ref) {
  const preset = findTexturePreset(ref.presetId);
  if (!preset) throw new Error(`Unknown texgen preset "${ref.presetId}".`);
  const maps = await evaluateTextureMaps(preset.settings, { size: ref.size ?? TEXGEN_BAKE_SIZE });
  if (!maps) return null;
  const { textures } = syncTextureMapTextures(maps);
  // Only the albedo lives on; the other maps are not used by the terrain
  // blend yet and would leak GPU memory.
  for (const [id, texture] of Object.entries(textures)) {
    if (id !== 'albedo') texture?.dispose?.();
  }
  return textures.albedo ?? null;
}

function loadDataUrl(ref) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(
      ref.dataUrl,
      (texture) => resolve(texture),
      undefined,
      () => reject(new Error('Could not decode the imported layer image.')),
    );
  });
}

/**
 * Resolves a textureRef to a repeat-wrapped THREE.Texture (or null for a
 * null/unknown ref). Results are cached; callers must NOT dispose them.
 */
export function resolveLayerTexture(ref) {
  if (!ref?.kind) return Promise.resolve(null);
  const key = cacheKey(ref);
  if (cache.has(key)) return cache.get(key);
  let load;
  if (ref.kind === 'texgen') {
    load = bakeTexgen(ref);
  } else if (ref.kind === 'data-url') {
    load = loadDataUrl(ref);
  } else {
    const resolver = externalResolvers.get(ref.kind);
    load = resolver ? Promise.resolve(resolver(ref)) : Promise.resolve(null);
  }
  const guarded = load.then((texture) => {
    if (texture) {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.needsUpdate = true;
    }
    return texture ?? null;
  }).catch((error) => {
    cache.delete(key);
    throw error;
  });
  cache.set(key, guarded);
  return guarded;
}

/** Default per-layer material state stored on the project document. */
export function createDefaultMaterialLayers() {
  return [0, 1, 2, 3].map(() => ({ textureRef: null, repeat: 0.35 }));
}

/** Sanitizes a serialized materialLayers array (drops unknown shapes). */
export function sanitizeMaterialLayers(layers) {
  const defaults = createDefaultMaterialLayers();
  if (!Array.isArray(layers)) return defaults;
  return defaults.map((fallback, index) => {
    const layer = layers[index];
    if (!layer || typeof layer !== 'object') return fallback;
    return {
      textureRef: layer.textureRef?.kind ? { ...layer.textureRef } : null,
      repeat: Number.isFinite(layer.repeat) && layer.repeat > 0 ? Number(layer.repeat) : fallback.repeat,
    };
  });
}
