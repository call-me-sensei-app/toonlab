// Data-only catalog used by the published MCP server. It intentionally uses
// stable public domains only; repository-only generators and pre-beta systems
// are never pulled into the npm tarball through the MCP dependency graph.

import { POST_PROCESSING_PRESETS } from '../src/post/postProcessing.js';
import { getRockgenPresetOptions } from '../src/rockgen/rockgenPresets.js';
import { getSkyPresetOptions } from '../src/sky/stylizedSky.js';
import { getToonPresetOptions } from '../src/toon/toonSettings.js';
import { getWaterPresetOptions } from '../src/water/waterSettings.js';

const slug = (value) => String(value)
  .replace(/[^a-zA-Z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .toLowerCase();

const thumbnailFor = (id) => `thumbs/${id.replaceAll('/', '-')}.webp`;

function entry(input) {
  return Object.freeze({
    description: null,
    tags: [],
    thumbnail: null,
    ...input,
  });
}

let cached = null;

export function publicMcpCatalogEntries() {
  if (cached) return cached;
  // Authored vegetation recipes are Gallery assets, not package built-ins.
  // The packaged MCP discovers them from the public Gallery so provenance,
  // license, review state, and immutable documents stay attached.
  const entries = [];

  for (const option of getRockgenPresetOptions()) {
    const id = `rock/${slug(option.value)}`;
    entries.push(entry({
      cluster: 'rockgen',
      description: option.description,
      id,
      kind: 'preset',
      label: option.label,
      recipe: { preset: option.value, schema: 'rockgenPresetRef', version: 1 },
      spawn: 'meshDocument(createRockDocument({ preset: entry.recipe.preset, seed }))',
      tags: ['rock', 'nature', 'stone'],
      thumbnail: thumbnailFor(id),
    }));
  }

  for (const option of getWaterPresetOptions()) {
    entries.push(entry({
      cluster: 'water',
      description: option.description,
      id: `water/${slug(option.id)}`,
      kind: 'preset',
      label: option.label,
      recipe: { preset: option.id, schema: 'waterPresetRef', version: 1 },
      spawn: `new WaterSurface({ preset: '${option.id}', width, depth, bedHeight: heightAt })`,
      tags: ['water', 'settings', 'anime'],
    }));
  }

  for (const option of getSkyPresetOptions()) {
    entries.push(entry({
      cluster: 'sky',
      description: option.description,
      id: `sky/${slug(option.id)}`,
      kind: 'preset',
      label: option.label,
      recipe: { preset: option.id, schema: 'skyPresetRef', version: 1 },
      spawn: `new StylizedSky({ preset: '${option.id}' })`,
      tags: ['sky', 'settings', 'anime'],
    }));
  }

  for (const id of Object.keys(POST_PROCESSING_PRESETS)) {
    entries.push(entry({
      cluster: 'post',
      id: `post/${slug(id)}`,
      kind: 'preset',
      label: id,
      recipe: { preset: id, schema: 'postPresetRef', version: 1 },
      spawn: `createPostProcessingPipeline({ renderer, scene, camera, preset: '${id}' })`,
      tags: ['post', 'settings', 'anime'],
    }));
  }

  for (const option of getToonPresetOptions()) {
    entries.push(entry({
      cluster: 'toon',
      description: option.description,
      id: `toon/${slug(option.id)}`,
      kind: 'preset',
      label: option.label,
      recipe: { preset: option.id, schema: 'toonPresetRef', version: 1 },
      spawn: `applyToonShader(characterRoot, { settings: createToonSettings({ preset: '${option.id}' }) })`,
      tags: ['toon', 'character', 'anime'],
    }));
  }

  cached = Object.freeze(entries);
  return cached;
}
