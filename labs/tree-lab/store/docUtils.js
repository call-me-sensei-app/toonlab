// Document utilities for the shared Tree/Flower Lab store: sketch normalization,
// recipe assembly, boot precedence, and localStorage persistence. Pure
// functions — no DOM, no three.js, no store coupling — so both the store
// and tests can use them directly.
//
// COMPATIBILITY: the persistence key and payload shape
// ('toonlab.treeDesigner.state.v1', { settings, sketch, presetId }) are
// byte-compatible with the pre-redesign designer. Do not reshape.

import {
  cloneTreeSettings,
  recipeFromSettings,
  settingsFromRecipe,
  validateTreeRecipeDocument,
} from '../../../src/vegetation/experimental.js';
import { findTreePreset, loadLocalTreePresets } from '../treePresetStore.js';

export const STATE_STORAGE_KEY = 'toonlab.treeDesigner.state.v1';

function cleanOverrides(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

export function sketchFromOptions(options = {}) {
  return {
    branchSpines: Array.isArray(options.branchSpines) ? options.branchSpines : [],
    extraBlobs: Array.isArray(options.extraBlobs) ? options.extraBlobs : [],
    extraAttachments: Array.isArray(options.extraAttachments) ? options.extraAttachments : [],
    // Crown brush: a PINNED blob layout the limb growth fills (replaces the
    // generated crown, unlike extraBlobs which append to it).
    crownBlobs: Array.isArray(options.canopy?.blobs) ? options.canopy.blobs : [],
    // Per-branch foliage overrides from the branch inspector (keyed by
    // attachment index) — rides beside strokes so undo/presets carry it.
    branchOverrides: cleanOverrides(options.branchOverrides),
    // Doodle-grown trunk: the branching generator's leader follows this
    // drawn polyline (tree-local) instead of growing procedurally.
    trunkSpine: Array.isArray(options.skeleton?.trunkSpine) ? options.skeleton.trunkSpine : null,
  };
}

// Restored sketch state (localStorage, undo snapshots) may predate newer
// stroke kinds — normalize so every member exists.
export function normalizeSketch(value = {}) {
  return {
    branchSpines: Array.isArray(value.branchSpines) ? value.branchSpines : [],
    extraBlobs: Array.isArray(value.extraBlobs) ? value.extraBlobs : [],
    extraAttachments: Array.isArray(value.extraAttachments) ? value.extraAttachments : [],
    crownBlobs: Array.isArray(value.crownBlobs) ? value.crownBlobs : [],
    branchOverrides: cleanOverrides(value.branchOverrides),
    trunkSpine: Array.isArray(value.trunkSpine) ? value.trunkSpine : null,
  };
}

export function mergeSketchIntoRecipe(recipe, sketch, extras = {}) {
  // Flowers take the same sketch side-channels as trees (StylizedFlower
  // forwards them to the StylizedTree constructor); bushes take none.
  if (recipe.type === 'bush') return recipe;
  if (sketch.branchSpines.length) recipe.options.branchSpines = sketch.branchSpines;
  if (sketch.extraBlobs.length) recipe.options.extraBlobs = sketch.extraBlobs;
  if (sketch.extraAttachments.length) recipe.options.extraAttachments = sketch.extraAttachments;
  if (sketch.crownBlobs.length) {
    recipe.options.canopy = { ...(recipe.options.canopy ?? {}), blobs: sketch.crownBlobs };
  }
  if (Object.keys(sketch.branchOverrides).length) {
    recipe.options.branchOverrides = sketch.branchOverrides;
  }
  if (sketch.trunkSpine) {
    recipe.options.skeleton = { ...(recipe.options.skeleton ?? {}), trunkSpine: sketch.trunkSpine };
  }
  // Designer side-channels beyond sketching: only written when set, so
  // legacy recipes stay byte-identical.
  if (extras.leafShape) recipe.options.leafShape = extras.leafShape;
  if (extras.leafStyle) recipe.options.leafStyle = extras.leafStyle;
  if (extras.animation && extras.animation.preset !== 'none') {
    recipe.options.animation = extras.animation;
  }
  if (extras.roots && extras.roots.preset !== 'none') {
    recipe.options.roots = extras.roots;
  }
  if (extras.flowers && extras.flowers.preset !== 'none') {
    recipe.options.flowers = extras.flowers;
  }
  if (extras.trunkProfile) recipe.options.trunkProfile = extras.trunkProfile;
  if (extras.barkTexture) recipe.options.barkTexture = extras.barkTexture;
  if (extras.woodDetails && (extras.woodDetails.knots || extras.woodDetails.scars)) {
    recipe.options.woodDetails = extras.woodDetails;
  }
  return recipe;
}

/** The shareable/exported recipe for a document state. */
export function recipeDocumentFor(settings, sketch, presetId, extras = {}) {
  const recipe = mergeSketchIntoRecipe(recipeFromSettings(settings), sketch, extras);
  const preset = presetId ? findTreePreset(presetId, loadLocalTreePresets()) : null;
  if (preset) {
    recipe.id = preset.id;
    recipe.label = preset.label;
  }
  return recipe;
}

export function readStoredState(storageKey = STATE_STORAGE_KEY) {
  try {
    const raw = window.localStorage?.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Failed to read designer state:', error);
    return null;
  }
}

export function persistState({
  animation, barkTexture, flowers, leafShape, leafStyle, presetId, roots, settings, sketch,
  trunkProfile, woodDetails,
}, storageKey = STATE_STORAGE_KEY) {
  try {
    window.localStorage?.setItem(
      storageKey,
      // Additive keys after presetId: pre-redesign payloads still parse.
      JSON.stringify({
        settings, sketch, presetId, leafShape, leafStyle, animation, roots, flowers, trunkProfile,
        barkTexture, woodDetails,
      }));
  } catch (error) {
    console.warn('Failed to save designer state:', error);
  }
}

function cleanSideChannels(source = {}) {
  const object = (value) => (value && typeof value === 'object' ? value : null);
  return {
    animation: object(source.animation),
    flowers: object(source.flowers),
    leafShape: object(source.leafShape),
    leafStyle: object(source.leafStyle),
    roots: object(source.roots),
    trunkProfile: object(source.trunkProfile),
    barkTexture: object(source.barkTexture),
    woodDetails: object(source.woodDetails),
  };
}

export function clearStoredState(storageKey = STATE_STORAGE_KEY) {
  try {
    window.localStorage?.removeItem(storageKey);
  } catch { /* storage unavailable */ }
}

/**
 * Boot precedence: explicit ?recipe= > the configured preset param >
 * persisted state > defaults. `bootSource` also tells the UI whether to open
 * the gallery ('fresh') or the workspace.
 */
export function bootState(urlParams, {
  presetParam = 'treePreset',
  storageKey = STATE_STORAGE_KEY,
} = {}) {
  if (urlParams.has('recipe')) {
    try {
      const result = validateTreeRecipeDocument(JSON.parse(urlParams.get('recipe')));
      if (result.ok) {
        return {
          bootSource: 'recipe',
          presetId: '',
          settings: settingsFromRecipe(result.value),
          sketch: sketchFromOptions(result.value.options),
          ...cleanSideChannels(result.value.options),
        };
      }
      console.warn('Invalid ?recipe= param:', result.errors.join(' '));
    } catch (error) {
      console.warn('Unparseable ?recipe= param:', error);
    }
  }
  if (urlParams.has(presetParam)) {
    const preset = findTreePreset(urlParams.get(presetParam), loadLocalTreePresets());
    if (preset) {
      return {
        bootSource: 'preset',
        presetId: preset.id,
        settings: settingsFromRecipe(preset),
        sketch: sketchFromOptions(preset.options),
        ...cleanSideChannels(preset.options),
      };
    }
  }
  const stored = readStoredState(storageKey);
  if (stored?.settings) {
    // Group-level merge over the defaults so documents persisted before a
    // schema gained a group (e.g. `flower`) still hydrate every group.
    const defaults = cloneTreeSettings();
    const settings = Object.fromEntries(Object.keys(defaults).map((group) => [
      group, { ...defaults[group], ...cleanOverrides(stored.settings[group]) },
    ]));
    return {
      bootSource: 'persisted',
      presetId: stored.presetId ?? '',
      settings,
      sketch: normalizeSketch(stored.sketch),
      ...cleanSideChannels(stored),
    };
  }
  return {
    bootSource: 'fresh',
    presetId: '',
    settings: cloneTreeSettings(),
    sketch: normalizeSketch(),
    ...cleanSideChannels(),
  };
}
