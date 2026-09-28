// Pro asset-library bridge for Landscape Lab — progressive enhancement, no
// build-time fork. The lab probes GET /api/my-prop-assets: on toonlab.io
// with a signed-in user it returns the user's generated 3D props (palette
// candidates) and ready texture_image jobs (splat-layer candidates); on the
// OSS static build the request 404s and the built-in procedural palette
// stands alone.
//
// Palette entries and layer refs store ONLY { creationId/jobId } — signed
// URLs expire in ~1 h, so every resolution re-polls /api/generation/job for
// a fresh URL and caches the DECODED result (GLTF scene / texture) instead.

import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { propAssetFromObject } from '../../src/propgen/propAsset.js';
import {
  registerFoliageSourceResolver,
  registerLayerTextureResolver,
} from '../../src/landscape/index.js';
import { loadImportedModel } from '../../src/assetlib/loadImported.js';
import {
  fetchPolyhavenFiles,
  fetchPolyhavenIndex,
  resolvePolyhavenModelDownload,
} from '../../src/assetlib/polyhaven.js';

// The hosted Pro app — the OSS lab reaches the PUBLIC gallery endpoints here
// cross-origin (they respond with CORS *; no sign-in involved). Local dev
// also tries the local Pro dev server so the OSS lab at :5175 gets the real
// gallery before the routes ship to production.
const PRO_ORIGINS = [
  'https://toonlab.io',
  ...(['localhost', '127.0.0.1'].includes(window.location.hostname)
    ? ['http://localhost:5180']
    : []),
];

let libraryPromise = null;
let resolversInstalled = false;
const gltfCache = new Map(); // jobId -> Promise<PropAsset>

let sharedLoader = null;
function gltfLoader() {
  if (!sharedLoader) {
    sharedLoader = new GLTFLoader();
    const draco = new DRACOLoader();
    draco.setDecoderPath('/draco/gltf/');
    sharedLoader.setDRACOLoader(draco);
  }
  return sharedLoader;
}

async function fetchJson(url, { credentials = 'include' } = {}) {
  const response = await fetch(url, { credentials });
  if (!response.ok) throw new Error(`${url} → ${response.status}`);
  return response.json();
}

async function freshJobUrl(jobId, field) {
  const payload = await fetchJson(`/api/generation/job?id=${encodeURIComponent(jobId)}`);
  const url = payload?.[field] ?? payload?.resultUrl;
  if (!url) throw new Error('The generated asset has no downloadable file yet.');
  return url;
}

// Creation-based resolution serves own, public-gallery, AND (from OSS) hosted
// public assets — trying same-origin first, then the hosted app cross-origin.
// Job-based resolution remains the fallback for palette entries saved before
// creation ids were stored.
async function freshAssetUrl(source, field) {
  if (source.creationId) {
    const path = `/api/prop-asset-file?creationId=${encodeURIComponent(source.creationId)}`;
    try {
      const payload = await fetchJson(path);
      const url = payload?.[field] ?? payload?.resultUrl;
      if (url) return url;
    } catch { /* endpoint absent (OSS) or private: keep falling back */ }
    for (const origin of PRO_ORIGINS) {
      try {
        const payload = await fetchJson(`${origin}${path}`, { credentials: 'omit' });
        const url = payload?.[field] ?? payload?.resultUrl;
        if (url) return url;
      } catch { /* next origin, then the owner-only job route */ }
    }
  }
  if (!source.jobId) throw new Error('The palette entry references no generation job.');
  return freshJobUrl(source.jobId, field);
}

async function loadGlbAsset(source) {
  const load = async () => {
    const url = await freshAssetUrl(source, 'glbUrl');
    // Retry once: first fetch after a cold CDN/lazy-cache fill can 5xx.
    let gltf;
    try {
      gltf = await gltfLoader().loadAsync(url);
    } catch {
      gltf = await gltfLoader().loadAsync(await freshAssetUrl(source, 'glbUrl'));
    }
    const scene = gltf.scene ?? gltf.scenes?.[0];
    if (!scene) throw new Error('The GLB contained no scene.');
    const suggestedScale = Number(source.options?.suggestedScale);
    if (Number.isFinite(suggestedScale) && suggestedScale > 0 && suggestedScale !== 1) {
      scene.scale.setScalar(suggestedScale);
    }
    return propAssetFromObject(scene, {
      footprint: source.options?.footprint ?? null,
      anchor: Number.isFinite(source.options?.anchor) ? source.options.anchor : null,
      name: source.label ?? 'library asset',
    });
  };
  const cacheId = source.creationId ?? source.jobId;
  if (!gltfCache.has(cacheId)) {
    gltfCache.set(cacheId, load().catch((error) => {
      gltfCache.delete(cacheId); // allow a later retry with a fresh URL
      throw error;
    }));
  }
  return gltfCache.get(cacheId);
}

/** Registers the pro-creation / pro-texture / polyhaven resolvers (idempotent). */
export function installProAssetResolvers() {
  if (resolversInstalled) return;
  resolversInstalled = true;
  registerFoliageSourceResolver('pro-creation', (source) => loadGlbAsset(source));
  // CC0 Poly Haven models: multi-file glTF from the CDN, companion files
  // remapped through the shared imported-model loader.
  registerFoliageSourceResolver('polyhaven', async (source) => {
    const files = await fetchPolyhavenFiles(source.assetId);
    const download = resolvePolyhavenModelDownload(files, { resolution: '1k' });
    const object = await loadImportedModel({ url: download.url, resources: download.resources });
    return propAssetFromObject(object, { name: source.label ?? source.assetId });
  });
  registerLayerTextureResolver('pro-texture', async (ref) => {
    const { TextureLoader } = await import('three');
    const url = await freshJobUrl(ref.jobId, 'resultUrl');
    return new TextureLoader().loadAsync(url);
  });
}

/** Searches the Poly Haven CC0 model index (browser-proxied, cached). */
export async function searchPolyhavenModels({ q = '', limit = 30 } = {}) {
  try {
    const index = await fetchPolyhavenIndex({ type: 'models' });
    const needle = q.trim().toLowerCase();
    return index
      .filter((asset) => !needle
        || asset.name.toLowerCase().includes(needle)
        || asset.tags.some((tag) => tag.includes(needle))
        || asset.categories.some((category) => category.includes(needle)))
      .slice(0, limit)
      .map((asset) => ({
        polyhavenId: asset.id,
        label: asset.name,
        thumbnailUrl: `${asset.thumbnailUrl.split('?')[0]}?width=256&height=256`,
      }));
  } catch {
    return null;
  }
}

/** Palette entry for a Poly Haven CC0 model. */
export function paletteEntryFromPolyhaven(model) {
  installProAssetResolvers();
  return {
    id: `ph-${model.polyhavenId}`,
    label: model.label,
    thumbnail: model.thumbnailUrl ?? null,
    source: { kind: 'polyhaven', assetId: model.polyhavenId, label: model.label },
    rules: { ...DEFAULT_RULES['prop-asset'], scaleRange: [...DEFAULT_RULES['prop-asset'].scaleRange] },
    density: 0.06,
    active: true,
  };
}

/**
 * Probes the Pro library. Resolves `{ models, textures }` when hosted by the
 * Pro app with a signed-in user, or null on OSS / signed-out — callers use
 * null to hide the library UI entirely.
 */
export function detectProAssetLibrary({ refresh = false } = {}) {
  if (libraryPromise && !refresh) return libraryPromise;
  libraryPromise = (async () => {
    try {
      const payload = await fetchJson('/api/my-prop-assets');
      if (!Array.isArray(payload?.models)) return null;
      installProAssetResolvers();
      return { models: payload.models, textures: payload.textures ?? [] };
    } catch {
      return null;
    }
  })();
  return libraryPromise;
}

/**
 * Searches the user's library or the public gallery for prop-assets.
 * Library needs a signed-in Pro session; the GALLERY is public — when the
 * same-origin endpoint is absent (OSS build) it falls back to the hosted
 * toonlab.io gallery cross-origin. Returns an array (possibly empty), or
 * null when the source is unreachable.
 */
export async function searchProAssets({ scope = 'library', q = '', limit = 40 } = {}) {
  const params = new URLSearchParams({ scope, limit: String(limit) });
  if (q) params.set('q', q);
  const path = `/api/prop-asset-search?${params}`;
  try {
    const payload = await fetchJson(path);
    if (Array.isArray(payload?.assets)) {
      installProAssetResolvers();
      return payload.assets;
    }
  } catch { /* endpoint absent or unauthorized: gallery still has a fallback */ }
  if (scope === 'gallery') {
    for (const origin of PRO_ORIGINS) {
      try {
        const payload = await fetchJson(`${origin}${path}`, { credentials: 'omit' });
        if (Array.isArray(payload?.assets)) {
          installProAssetResolvers();
          return payload.assets;
        }
      } catch { /* try the next origin */ }
    }
  }
  return null;
}

const DEFAULT_RULES = {
  'prop-asset': { minSpacing: 2, scaleRange: [0.85, 1.25], yawRandom: true, alignToSlope: 0.15, maxSlope: 0.7, minHeight: null, maxHeight: null, avoidWater: true },
  'tree-recipe': { minSpacing: 2.5, scaleRange: [0.8, 1.3], yawRandom: true, alignToSlope: 0.12, maxSlope: 0.55, minHeight: null, maxHeight: null, avoidWater: true },
  'grass-preset': { minSpacing: 0.45, scaleRange: [0.9, 1.1], yawRandom: true, alignToSlope: 0, maxSlope: 0.9, minHeight: null, maxHeight: null, avoidWater: true },
  'rock-project': { minSpacing: 1.2, scaleRange: [0.55, 1.6], yawRandom: true, alignToSlope: 0.45, maxSlope: 1.4, minHeight: null, maxHeight: null, avoidWater: false },
};
const DEFAULT_DENSITY = { 'prop-asset': 0.06, 'tree-recipe': 0.07, 'grass-preset': 1.6, 'rock-project': 0.045 };

/**
 * Palette entry for a library/gallery result (caller may tweak rules).
 * Generated GLBs resolve through the file routes; procedural asset types
 * (tree recipes, grass presets, rock projects saved from the other labs)
 * embed their document and rebuild locally.
 */
export function paletteEntryFromLibraryModel(model) {
  const assetType = model.assetType ?? 'prop-asset';
  const rules = DEFAULT_RULES[assetType] ?? DEFAULT_RULES['prop-asset'];
  const source = assetType === 'tree-recipe'
    ? { kind: 'tree-recipe', recipe: model.document }
    : assetType === 'grass-preset'
      ? { kind: 'grass-preset', document: model.document }
      : assetType === 'rock-project'
        ? { kind: 'rock-document', document: model.document, label: model.label }
        : {
          kind: 'pro-creation',
          creationId: model.creationId,
          jobId: model.jobId,
          label: model.label,
          options: model.options ?? {},
        };
  return {
    id: `pro-${model.creationId}`,
    label: model.label,
    thumbnail: model.thumbnailUrl ?? null,
    source,
    rules: { ...rules, scaleRange: [...rules.scaleRange] },
    density: DEFAULT_DENSITY[assetType] ?? 0.06,
    active: true,
  };
}
