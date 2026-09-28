// The asset catalog runtime — the photoscan catalogs moment, minus the download.
// One searchable registry of every ToonLab recipe/preset, and ONE function
// that turns any asset entry into a placeable PropAsset:
//
//   import { catalog } from '@call-me-sensei/toonlab/catalog';
//   catalog.list({ tags: ['prop'] });
//   const asset = catalog.spawn('prop/lantern/stone-toro', { seed: 7 });
//   placeAlongSpline({ asset, spline: world.paths.splines[0], ... });
//
// OSS ships the full built-in registry + local user entries;
// `catalog.addSource(url, { headers })` mounts remote registries (the pro
// cloud library and its generated imports use exactly this seam — the catalog never
// knows they exist).

import * as THREE from 'three';

import { validateCatalogEntry } from './manifest.js';
import { builtinCatalogEntries } from './builtinEntries.js';
import { createPropAssetFromRecipe, propAssetFromObject } from '../propgen/index.js';
import { createPlantFromRecipe } from '../vegetation/treeRecipe.js';
import { loadCompiledTreeAsset } from '../vegetation/compiledTree.js';
import { createRockDocument } from '../rockgen/rockDocument.js';
import { meshDocument } from '../rockgen/index.js';
import { createDebrisAsset } from '../debrisgen/debrisGenerator.js';
import { createStylizedPathsFromRecipe } from '../pathgen/stylizedPaths.js';

// Per-cluster spawners: entry (+ seed override) → PropAsset. Clusters whose
// presets are settings documents rather than placeable things (water, sky,
// post, toon) intentionally have no spawner — spawn() explains instead of
// guessing.
const SPAWNERS = {
  debrisgen(entry, { seed }) {
    const settings = entry.recipe.settings;
    const spawnSettings = seed === undefined
      ? settings
      : { ...settings, asset: { ...settings.asset, seed } };
    return {
      build(buildSeed = spawnSettings.asset.seed) {
        const root = createDebrisAsset({
          ...spawnSettings,
          asset: { ...spawnSettings.asset, seed: buildSeed },
        });
        const asset = propAssetFromObject(root, {
          footprint: {
            radius: Math.max((spawnSettings.asset.spread || 0.6) * spawnSettings.asset.scale, 0.4),
          },
        });
        return asset.build();
      },
      linear: false,
      type: 'debris',
      variant: spawnSettings.asset.variant,
    };
  },
  propgen(entry, { seed }) {
    const recipe = entry.recipe;
    const spawnRecipe = seed === undefined
      ? recipe
      : {
        ...recipe,
        settings: {
          ...recipe.settings,
          asset: { ...recipe.settings.asset, seed },
        },
      };
    return createPropAssetFromRecipe(spawnRecipe);
  },
  rockgen(entry, { seed = 4, resolution = 44 }) {
    const preset = entry.recipe.preset;
    return {
      build(buildSeed = seed) {
        const geometry = meshDocument(
          createRockDocument({ preset, seed: buildSeed }),
          { resolution },
        );
        const material = new THREE.MeshStandardMaterial({ vertexColors: true });
        material.userData.envRole = 'standard';
        const mesh = new THREE.Mesh(geometry, material);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        const asset = propAssetFromObject(mesh);
        return asset.build();
      },
      linear: false,
      type: 'rock',
      variant: preset,
    };
  },
  vegetation(entry, { seed }) {
    const recipe = entry.recipe;
    return {
      build(buildSeed = seed ?? recipe.options?.seed ?? 1) {
        const plant = createPlantFromRecipe({
          ...recipe,
          options: { ...recipe.options, seed: buildSeed },
        });
        const size = Number(recipe.options?.size) || 1.7;
        return propAssetFromObject(plant, {
          // trunk-scale blocker, not canopy-scale — characters walk under crowns
          anchor: 0,
          footprint: { radius: Math.max(0.13 * size, 0.2) },
        }).build();
      },
      linear: false,
      type: recipe.type ?? 'tree',
      variant: recipe.type ?? 'tree',
    };
  },
};

function createRegistry() {
  const entries = new Map();
  const sources = [];

  const register = (entry, { source = 'user' } = {}) => {
    const { ok, errors } = validateCatalogEntry(entry);
    if (!ok) throw new Error(`catalog.register: ${errors.join(' ')}`);
    entries.set(entry.id, { ...entry, source });
    return entry.id;
  };

  for (const entry of builtinCatalogEntries()) register(entry, { source: 'builtin' });

  return {
    /**
     * Mounts a remote registry: fetches `{ entries: [...] }` JSON and
     * registers every valid entry (thumbnails resolved against the source
     * URL). This is the whole pro seam — auth is just headers.
     */
    async addSource(url, { headers = {}, name = url } = {}) {
      const response = await fetch(url, { headers });
      if (!response.ok) throw new Error(`catalog.addSource: ${response.status} for ${url}`);
      const manifest = await response.json();
      const base = new URL(url, globalThis.location?.href ?? 'http://localhost/');
      let added = 0;
      for (const entry of manifest.entries ?? []) {
        try {
          const resolved = {
            ...entry,
            ...(entry.thumbnail ? { thumbnail: new URL(entry.thumbnail, base).href } : {}),
            ...(entry.runtime?.format === 'toonlab/compiled-tree'
              ? {
                runtime: {
                  ...entry.runtime,
                  manifest: new URL(entry.runtime.manifest, base).href,
                },
              }
              : {}),
          };
          register(resolved, { source: name });
          added += 1;
        } catch {
          // skip invalid remote entries; a bad source must not break the lab
        }
      }
      sources.push({ count: added, name, url });
      return added;
    },
    entries,
    get(id) {
      return entries.get(id) ?? null;
    },
    /** Filter by tags (every tag must match), cluster, kind, or free text. */
    list({ tags = null, cluster = null, kind = null, text = null } = {}) {
      const query = text ? String(text).toLowerCase() : null;
      const wanted = Array.isArray(tags) ? tags.map((tag) => tag.toLowerCase()) : null;
      const results = [];
      for (const entry of entries.values()) {
        if (cluster && entry.cluster !== cluster) continue;
        if (kind && entry.kind !== kind) continue;
        if (wanted && !wanted.every((tag) => entry.tags.includes(tag))) continue;
        if (query) {
          const haystack = `${entry.id} ${entry.label} ${entry.description ?? ''} ${entry.tags.join(' ')}`.toLowerCase();
          if (!haystack.includes(query)) continue;
        }
        results.push(entry);
      }
      return results.sort((a, b) => a.id.localeCompare(b.id));
    },
    register,
    sources,
    /**
     * Async counterpart of spawn(). Entries with a compiled-tree runtime load
     * their prebuilt four-LOD bundle; every other entry resolves to the
     * historical synchronous PropAsset unchanged.
     */
    async load(id, options = {}) {
      const entry = entries.get(id);
      if (!entry) throw new Error(`catalog.load: unknown entry "${id}".`);
      if (entry.runtime?.format !== 'toonlab/compiled-tree') {
        return this.spawn(id, options);
      }
      const compiled = await loadCompiledTreeAsset(entry.runtime.manifest, options);
      const size = Number(entry.recipe?.options?.size) || 1.7;
      return {
        build() {
          const instance = compiled.createInstance({
            quality: options.quality,
            styleTarget: options.styleTarget,
            surfaceLook: options.surfaceLook,
          });
          return {
            anchor: 0,
            footprint: { radius: Math.max(0.13 * size, 0.2) },
            lod: null,
            object3D: instance,
            compiledTree: instance,
          };
        },
        compiled,
        linear: false,
        type: 'tree',
        variant: entry.id,
      };
    },
    /**
     * The download button: any asset entry id → a PropAsset ready for
     * placeProps / scatterProps / placeAlongSpline. Settings-preset entries
     * (water, sky, post, toon, path networks) aren't placeable objects —
     * spawn throws with their copy-paste snippet instead.
     */
    spawn(id, options = {}) {
      const entry = entries.get(id);
      if (!entry) throw new Error(`catalog.spawn: unknown entry "${id}".`);
      const spawner = SPAWNERS[entry.cluster];
      if (!spawner) {
        throw new Error(
          `catalog.spawn: "${id}" is a ${entry.cluster} settings preset, not a placeable asset. Use its snippet instead:\n  ${entry.spawn}`,
        );
      }
      return spawner(entry, options);
    },
    unregister(id) {
      return entries.delete(id);
    },
  };
}

/** The shared default registry (labs and docs use this instance). */
export const catalog = createRegistry();

/** Fresh isolated registry (tests, embedded hosts). */
export function createCatalog() {
  return createRegistry();
}

export { createStylizedPathsFromRecipe };
