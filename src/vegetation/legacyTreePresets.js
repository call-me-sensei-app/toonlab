import {
  StylizedTree,
  TREE_RECIPE_SCHEMA,
  TREE_RECIPE_VERSION,
  serializableTreeOptions,
} from './stylizedTree.js';
import { STYLIZED_TREE_EXAMPLES } from './stylizedTreeExamples.js';

const LEGACY_TREE_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'straight', label: 'Straight' }),
  Object.freeze({ id: 'leaning', label: 'Leaning' }),
  Object.freeze({ id: 'see-through', label: 'See-through' }),
  Object.freeze({ id: 'curved', label: 'Curved' }),
  Object.freeze({ id: 'forest-mix', label: 'Forest Mix' }),
  Object.freeze({ id: 'wide-crown', label: 'Wide Crown' }),
  Object.freeze({ id: 'autumn-blend', label: 'Autumn Blend' }),
  Object.freeze({ id: 'gnarled', label: 'Gnarled' }),
  Object.freeze({ id: 'bonsai', label: 'Bonsai' }),
  Object.freeze({ id: 'golden-gingko', label: 'Golden Gingko' }),
  Object.freeze({ id: 'sumeru-tips', label: 'Sumeru Tips' }),
  Object.freeze({ id: 'massive-sumeru', label: 'Massive Sumeru' }),
]);

function clone(value) {
  if (Array.isArray(value)) return value.map(clone);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, clone(entry)]));
  }
  return value;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const entry of Object.values(value)) deepFreeze(entry);
  return Object.freeze(value);
}

function legacyOptions(example) {
  // `pale` and `climbable` are old showcase-scene hints, not tree generator
  // inputs. Preserve them as document metadata without feeding them into the
  // stable constructor surface.
  const { pale = false, climbable = false, ...options } = example;
  return {
    metadata: { climbable: Boolean(climbable), pale: Boolean(pale) },
    options: serializableTreeOptions(options),
  };
}

/**
 * The twelve pre-species ToonLab trees, now named and versioned explicitly.
 *
 * This is the supported legacy set that existed before the repository's
 * botanical species research. It contains only generic stylized silhouettes;
 * none of the documents claims a botanical species identity.
 */
export const LEGACY_TREE_PRESETS = deepFreeze(LEGACY_TREE_DEFINITIONS.map((definition, index) => {
  const normalized = legacyOptions(STYLIZED_TREE_EXAMPLES[index]);
  return {
    builtIn: true,
    id: definition.id,
    label: definition.label,
    metadata: normalized.metadata,
    options: normalized.options,
    schema: TREE_RECIPE_SCHEMA,
    type: 'tree',
    version: TREE_RECIPE_VERSION,
  };
}));

export const LEGACY_TREE_IDS = Object.freeze(LEGACY_TREE_PRESETS.map(({ id }) => id));

/** Returns one immutable legacy recipe document, or null. */
export function getLegacyTreePreset(id) {
  return LEGACY_TREE_PRESETS.find((preset) => preset.id === id) ?? null;
}

/** Lists the stable legacy IDs and labels without duplicating recipe data. */
export function getLegacyTreePresetOptions() {
  return LEGACY_TREE_PRESETS.map(({ id, label, metadata }) => ({
    id,
    label,
    metadata: { ...metadata },
  }));
}

/**
 * Creates one tree from the supported pre-species set.
 *
 * Overrides remain the ordinary StylizedTree contract, including `leafShape`,
 * `trunkMap`, `foliage.leafMap`, and `vegetationShader`. Nested generator and
 * material groups merge over the selected recipe instead of replacing it.
 */
export function createLegacyTree(id, overrides = {}) {
  const preset = getLegacyTreePreset(id);
  if (!preset) throw new Error(`Unknown legacy tree preset "${String(id)}".`);
  const base = clone(preset.options);
  const source = overrides && typeof overrides === 'object' && !Array.isArray(overrides)
    ? overrides
    : {};
  const tree = new StylizedTree({
    ...base,
    ...source,
    canopy: { ...(base.canopy ?? {}), ...(source.canopy ?? {}) },
    foliage: { ...(base.foliage ?? {}), ...(source.foliage ?? {}) },
    skeleton: { ...(base.skeleton ?? {}), ...(source.skeleton ?? {}) },
    tree: {
      ...(base.tree ?? {}),
      ...(source.tree ?? {}),
      trunkReceiveShadow: source.tree?.trunkReceiveShadow ?? true,
    },
    trunk: { ...(base.trunk ?? {}), ...(source.trunk ?? {}) },
  });
  tree.name = `LegacyTree:${preset.id}`;
  tree.userData.legacyTree = {
    id: preset.id,
    label: preset.label,
    recipeVersion: preset.version,
  };
  return tree;
}
