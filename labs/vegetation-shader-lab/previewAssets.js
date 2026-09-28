// Preview fixtures are lab state, never shader-profile state. Every built-in
// option is generated from a ToonLab plant recipe; saved and imported recipes
// use the same path so the shader editor never depends on reference content.

import {
  upgradeTreeRecipeDocument,
  validateTreeRecipeDocument,
} from '../../src/vegetation/experimental.js';
import {
  BUILT_IN_TREE_PRESETS,
  loadLocalTreePresets,
} from '../tree-lab/treePresetStore.js';

function recipeOption(document, source) {
  // The classic built-in roster predates the v3 architecture envelope but
  // currently carries the package's latest version number. Route those
  // first-party legacy recipes through the supported v2 -> v3 upgrader before
  // the preview engine consumes them.
  const recipe = document.type !== 'flower'
    && document.version === 3
    && !document.architecture
    ? upgradeTreeRecipeDocument({ ...document, version: 2 })
    : document;
  const assetKind = document.type === 'flower'
    ? 'Procedural flower'
    : document.type === 'bush'
      ? 'Procedural shrub'
      : 'Procedural tree';
  return {
    description: document.description
      || `${assetKind} recipe with asset-owned geometry, seed, and botanical palette.`,
    id: `${source}:${document.id}`,
    kind: 'procedural',
    label: document.label || document.id,
    recipe,
    source: source === 'saved' ? 'Saved procedural' : 'Built-in procedural',
  };
}

function builtInRecipe(id, acceptedTypes) {
  const recipe = BUILT_IN_TREE_PRESETS.find((entry) => (
    entry.id === id && acceptedTypes.includes(entry.type)
  )) ?? BUILT_IN_TREE_PRESETS.find((entry) => acceptedTypes.includes(entry.type));
  if (!recipe) throw new Error(`No built-in ${acceptedTypes.join('/')} preview recipe is available.`);
  return recipeOption(recipe, 'built-in');
}

export const DEFAULT_TREE_SHADER_PREVIEW_ASSET = Object.freeze(
  builtInRecipe('species_pine_stylized', ['tree', 'bush']),
);

export const DEFAULT_FLOWER_SHADER_PREVIEW_ASSET = Object.freeze(
  builtInRecipe('species_daisy_clump', ['flower']),
);

function savedPlantRecipes() {
  return typeof document === 'undefined' ? [] : loadLocalTreePresets();
}

export function getTreeShaderPreviewAssets() {
  const builtIn = BUILT_IN_TREE_PRESETS
    .filter((entry) => entry.type === 'tree' || entry.type === 'bush')
    .map((entry) => recipeOption(entry, 'built-in'));
  const saved = savedPlantRecipes()
    .filter((entry) => entry.type === 'tree' || entry.type === 'bush')
    .map((entry) => recipeOption(entry, 'saved'));
  return [
    DEFAULT_TREE_SHADER_PREVIEW_ASSET,
    ...saved,
    ...builtIn.filter(({ id }) => id !== DEFAULT_TREE_SHADER_PREVIEW_ASSET.id),
  ];
}

export function getFlowerShaderPreviewAssets() {
  const builtIn = BUILT_IN_TREE_PRESETS
    .filter((entry) => entry.type === 'flower')
    .map((entry) => recipeOption(entry, 'built-in'));
  const saved = savedPlantRecipes()
    .filter((entry) => entry.type === 'flower')
    .map((entry) => recipeOption(entry, 'saved'));
  return [
    DEFAULT_FLOWER_SHADER_PREVIEW_ASSET,
    ...saved,
    ...builtIn.filter(({ id }) => id !== DEFAULT_FLOWER_SHADER_PREVIEW_ASSET.id),
  ];
}

export function parseTreeShaderPreviewAsset(input, {
  fallbackLabel = 'Imported procedural tree',
} = {}) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid tree recipe JSON: ${error.message}`],
        ok: false,
        value: null,
      };
    }
  }
  const result = validateTreeRecipeDocument(source);
  if (!result.ok) return { ...result, value: null };
  if (result.value.type !== 'tree' && result.value.type !== 'bush') {
    return {
      errors: ['Tree Shader preview accepts tree or bush recipes. Use Flower Shader Lab for flower recipes.'],
      ok: false,
      value: null,
    };
  }
  const identity = String(
    result.value.id
      || source?.id
      || `imported_${Date.now().toString(36)}`,
  );
  const document = {
    ...result.value,
    id: identity,
    label: result.value.label || source?.label || fallbackLabel,
  };
  return {
    errors: [],
    ok: true,
    value: {
      ...recipeOption(document, 'imported'),
      id: `imported:${identity}`,
      source: 'Imported procedural',
    },
  };
}

export function normalizeTreeShaderPreviewAsset(value) {
  if (!value || value.id === DEFAULT_TREE_SHADER_PREVIEW_ASSET.id) {
    return DEFAULT_TREE_SHADER_PREVIEW_ASSET;
  }
  if (value.kind !== 'procedural' || !value.recipe) {
    return DEFAULT_TREE_SHADER_PREVIEW_ASSET;
  }
  const result = parseTreeShaderPreviewAsset(value.recipe, {
    fallbackLabel: value.label,
  });
  if (!result.ok) return DEFAULT_TREE_SHADER_PREVIEW_ASSET;
  return {
    ...result.value,
    id: String(value.id || result.value.id),
    label: String(value.label || result.value.label),
    source: String(value.source || result.value.source),
  };
}

export function parseFlowerShaderPreviewAsset(input, {
  fallbackLabel = 'Imported procedural flower',
} = {}) {
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return {
        errors: [`Invalid flower recipe JSON: ${error.message}`],
        ok: false,
        value: null,
      };
    }
  }
  const result = validateTreeRecipeDocument(source);
  if (!result.ok) return { ...result, value: null };
  if (result.value.type !== 'flower') {
    return {
      errors: ['Flower Shader preview accepts flower recipes. Use Tree Shader Lab for tree or bush recipes.'],
      ok: false,
      value: null,
    };
  }
  const identity = String(
    result.value.id
      || source?.id
      || `imported_${Date.now().toString(36)}`,
  );
  const document = {
    ...result.value,
    id: identity,
    label: result.value.label || source?.label || fallbackLabel,
  };
  return {
    errors: [],
    ok: true,
    value: {
      ...recipeOption(document, 'imported'),
      id: `imported:${identity}`,
      source: 'Imported procedural',
    },
  };
}

export function normalizeFlowerShaderPreviewAsset(value) {
  if (!value || value.id === DEFAULT_FLOWER_SHADER_PREVIEW_ASSET.id) {
    return DEFAULT_FLOWER_SHADER_PREVIEW_ASSET;
  }
  if (value.kind !== 'procedural' || !value.recipe) {
    return DEFAULT_FLOWER_SHADER_PREVIEW_ASSET;
  }
  const result = parseFlowerShaderPreviewAsset(value.recipe, {
    fallbackLabel: value.label,
  });
  if (!result.ok) return DEFAULT_FLOWER_SHADER_PREVIEW_ASSET;
  return {
    ...result.value,
    id: String(value.id || result.value.id),
    label: String(value.label || result.value.label),
    source: String(value.source || result.value.source),
  };
}
