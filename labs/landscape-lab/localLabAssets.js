// "Saved in Labs" palette source — assets the user saved in the OTHER labs
// in this browser: Tree Lab presets, Grass Lab presets, and Rock Lab
// projects, read straight from their localStorage stores. No export/import
// round-trip: sculpt an arch in Rock Lab, save it, and it's placeable here.
// Works identically in OSS and Pro (these stores are per-browser).

import { loadLocalTreePresets } from '../tree-lab/treePresetStore.js';
import { parseGrassPresetDocument } from '../../src/vegetation/stylizedGrass.js';

const GRASS_STORE_KEY = 'toonlab.grassPresets.v1';
const ROCK_STORE_KEY = 'toonlab.rockLab.projects.v1';
const ROCK_AUTOSAVE_ID = '__current__';

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : fallback;
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

const TREE_RULES = {
  minSpacing: 2.5,
  scaleRange: [0.8, 1.3],
  yawRandom: true,
  alignToSlope: 0.12,
  maxSlope: 0.55,
  minHeight: null,
  maxHeight: null,
  avoidWater: true,
};

const ROCK_RULES = {
  minSpacing: 1.2,
  scaleRange: [0.55, 1.6],
  yawRandom: true,
  alignToSlope: 0.45,
  maxSlope: 1.4,
  minHeight: null,
  maxHeight: null,
  avoidWater: false,
};

const GRASS_RULES = {
  minSpacing: 0.45,
  scaleRange: [0.9, 1.1],
  yawRandom: true,
  alignToSlope: 0,
  maxSlope: 0.9,
  minHeight: null,
  maxHeight: null,
  avoidWater: true,
};

/**
 * Palette entries for everything saved locally by the other labs. Sources
 * embed the full recipe/document, so a landscape project using them still
 * opens correctly in another browser.
 */
export function listLocalLabAssets() {
  const entries = [];

  for (const preset of loadLocalTreePresets()) {
    const recipe = preset.document ?? preset;
    if (!recipe?.options) continue;
    entries.push({
      id: `local-tree-${preset.id}`,
      label: preset.label ?? preset.id,
      origin: 'Tree Lab',
      source: { kind: 'tree-recipe', recipe },
      rules: { ...TREE_RULES, scaleRange: [...TREE_RULES.scaleRange] },
      density: 0.07,
      active: true,
    });
  }

  for (const raw of readJson(GRASS_STORE_KEY, [])) {
    const result = parseGrassPresetDocument(raw);
    if (!result.ok) continue;
    entries.push({
      id: `local-grass-${result.value.id}`,
      label: result.value.label ?? result.value.id,
      origin: 'Grass Lab',
      source: { kind: 'grass-preset', document: result.value },
      rules: { ...GRASS_RULES, scaleRange: [...GRASS_RULES.scaleRange] },
      density: 1.6,
      active: true,
    });
  }

  const rockStore = readJson(ROCK_STORE_KEY, {});
  for (const [id, saved] of Object.entries(rockStore)) {
    if (id === ROCK_AUTOSAVE_ID || !saved?.json) continue;
    entries.push({
      id: `local-rock-${id}`,
      label: saved.meta?.label ?? id,
      origin: 'Rock Lab',
      // Kept as the serialized JSON string; the resolver deserializes it.
      source: { kind: 'rock-document', document: saved.json, label: saved.meta?.label ?? id },
      rules: { ...ROCK_RULES, scaleRange: [...ROCK_RULES.scaleRange] },
      density: 0.045,
      active: true,
    });
  }

  return entries;
}
