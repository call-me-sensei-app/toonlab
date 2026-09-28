// Shared Tree/Flower Lab store: framework-agnostic document + session state with
// undo/redo, persistence, and change bookkeeping. The three.js engine and
// the UI (vanilla glue in P1, React from P2) both consume it through
// getState/subscribe; every mutation goes through an action here.
//
// Change bookkeeping contract (consumed by engine/engine.js):
//   docRevision  bumped => geometry rebuild needed
//   liveRevision bumped => live-applied material params only (color/wind)
//   lastChange { immediate, reframe } => rebuild now vs debounced, and
//                whether to re-frame the camera afterwards.

import { createStore } from '../../shared/ui/createStore.js';
import { WALK_PREVIEW_STATUS } from '../../shared/walkPreview.js';
import {
  TREE_SETTING_FIELD_SCHEMA,
  TREE_GROWTH_FORM_SUBTYPES,
  TREE_SPECIES_PROFILE_BY_ID,
  TREE_TRUNK_STYLES,
  cloneTreeSettings,
  createTreeSpeciesRecipe,
  getVegetationShaderPresetOptions,
  matchTrunkStyle,
  settingsFromRecipe,
  validateTreeRecipeDocument,
} from '../../../src/vegetation/experimental.js';
import {
  BUILT_IN_TREE_PRESETS, findTreePreset, loadLocalTreePresets, upsertLocalTreePreset,
} from '../treePresetStore.js';
import {
  bootState, clearStoredState, normalizeSketch, persistState, recipeDocumentFor, sketchFromOptions,
} from './docUtils.js';

const UNDO_CAP = 50;
const TRUNK_VALUE_KEYS = ['height', 'radiusBottom', 'bend', 'lean', 'twist', 'gnarl'];
const SEED_RANGE = TREE_SETTING_FIELD_SCHEMA.plant.seed.range;
const DEFAULT_VEGETATION_STYLE_ID = 'call_me_sensei';
export const FLOWER_STATE_STORAGE_KEY = 'toonlab.flowerDesigner.state.v1';

const round4 = (value) => Math.round(value * 10000) / 10000;

function normalizeVegetationStyleId(value) {
  const id = String(value ?? '').trim();
  return getVegetationShaderPresetOptions().some((entry) => entry.id === id)
    ? id
    : DEFAULT_VEGETATION_STYLE_ID;
}

export function createDesignerStore({
  labKind = 'tree',
  storageKey = labKind === 'flower' ? FLOWER_STATE_STORAGE_KEY : undefined,
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const isFlowerLab = labKind === 'flower';
  const presetParam = isFlowerLab ? 'flowerPreset' : 'treePreset';
  const styleId = normalizeVegetationStyleId(
    urlParams.get('vegetationStyle') ?? urlParams.get('style'),
  );
  let boot = bootState(urlParams, { presetParam, storageKey });
  // Each lab owns one authoring scope. A stale/cross-lab document must not
  // silently turn the Flower Lab back into the Tree Lab (or vice versa).
  // Legacy flower deep links in Tree Lab remain readable for compatibility,
  // but every new/open/import action below enforces the current lab scope.
  if (isFlowerLab && boot.settings.plant.type !== 'flower') {
    const fallback = findTreePreset('species_daisy_clump', loadLocalTreePresets());
    boot = {
      ...boot,
      animation: null,
      barkTexture: null,
      flowers: null,
      leafShape: fallback?.options?.leafShape ?? null,
      leafStyle: fallback?.options?.leafStyle ?? null,
      presetId: '',
      roots: null,
      settings: settingsFromRecipe(fallback),
      sketch: sketchFromOptions(fallback?.options),
      trunkProfile: null,
      woodDetails: null,
    };
  }
  const undoStack = [];
  const redoStack = [];

  const acceptsType = (type) => isFlowerLab ? type === 'flower' : type !== 'flower';

  const store = createStore({
    // document slice (persisted + undoable)
    animation: boot.animation, // { preset, intensity } | null — engine-side particles
    flowers: boot.flowers, // { preset, ... } | null — attached tree blossoms
    roots: boot.roots, // { preset } | null — surface root tubes
    trunkProfile: boot.trunkProfile, // { outline } | null — drawn trunk cross-section
    barkTexture: boot.barkTexture, // { id, dataUrl? } | null — wood surface texture
    woodDetails: boot.woodDetails, // { knots, scars } | null — trunk imperfections
    leafShape: boot.leafShape, // { preset, outline? } | null — crown sprite silhouette
    leafStyle: boot.leafStyle, // { presetId, season } | null — UI memory for the leaf styles
    presetId: boot.presetId,
    settings: boot.settings,
    sketch: boot.sketch,
    // session slice
    bootSource: boot.bootSource,
    brush: { branchRadius: 0.07, doodleSizePx: 30, leafTip: true },
    canRedo: false,
    canUndo: false,
    glbMode: 'crossed',
    mannequin: false, // 1.8m scale reference figure
    moveMode: 'rotate', // 'pan' | 'rotate' | 'zoom' — what LEFT-drag does in Move
    previewLod: null, // null = editable live tree; 0..3 = compiled export LOD inspection
    sky: { hour: 12, weather: 'clear' }, // environment presentation (session)
    // IP-wide rendition used by the preview. It deliberately stays outside
    // the tree/flower recipe, persistence, history, and dirty-state contract.
    styleId,
    walkPreview: false, // Keyboard-walk the mannequin around the tree.
    presetDirty: false,
    selection: null, // { branchIndex, screen: {x, y} }
    // Sketch mode: crayon doodling with NO live rebuilds — strokes pool in
    // pendingStrokes (world-space, session-only) until "Convert to Tree".
    pendingStrokes: [], // [{ brush: 'wood'|'leaves', points: [[x,y,z]], planeNormal: [x,y,z] }]
    sketchMode: false,
    stage: 'shape',
    status: '',
    tool: 'orbit',
    // Ordinary visits always enter through the real asset gallery so Continue,
    // New, and Open remain explicit. Valid recipe/preset deep links retain the
    // direct-to-editor behavior callers rely on.
    view: {
      drawer: false,
      export: false,
      gallery: boot.bootSource !== 'recipe' && boot.bootSource !== 'preset',
    },
    // bookkeeping
    docRevision: 0,
    lastChange: { immediate: false, reframe: false, transient: false },
    liveRevision: 0,
  });

  const state = () => store.getState();

  function documentSnapshot() {
    const {
      animation, barkTexture, flowers, leafShape, leafStyle, presetId, roots, settings, sketch,
      trunkProfile, woodDetails,
    } = state();
    return JSON.stringify({
      settings, sketch, presetId, leafShape, leafStyle, animation, roots, flowers, trunkProfile,
      barkTexture, woodDetails,
    });
  }

  function pushUndo() {
    undoStack.push(documentSnapshot());
    if (undoStack.length > UNDO_CAP) undoStack.shift();
    redoStack.length = 0;
  }

  function extrasOf(source) {
    return {
      animation: source.animation,
      flowers: source.flowers,
      leafShape: source.leafShape,
      leafStyle: source.leafStyle,
      roots: source.roots,
      trunkProfile: source.trunkProfile,
      barkTexture: source.barkTexture,
      woodDetails: source.woodDetails,
    };
  }

  function presetIsDirty(next) {
    if (!next.presetId) return false;
    const preset = findTreePreset(next.presetId, loadLocalTreePresets());
    if (!preset) return true;
    const recipe = recipeDocumentFor(next.settings, next.sketch, next.presetId, extrasOf(next));
    return JSON.stringify(recipe.options) !== JSON.stringify(preset.options)
      || recipe.type !== preset.type;
  }

  /**
   * Every document mutation funnels through here: optional undo snapshot,
   * apply, persist, bump the right revision, notify once.
   */
  function commitDocument(mutate, {
    immediate = false, live = false, reframe = false, snapshot = true, transient = false,
  } = {}) {
    if (snapshot) pushUndo();
    const current = state();
    const draft = {
      animation: current.animation,
      flowers: current.flowers,
      leafShape: current.leafShape,
      leafStyle: current.leafStyle,
      presetId: current.presetId,
      roots: current.roots,
      settings: current.settings,
      sketch: current.sketch,
      trunkProfile: current.trunkProfile,
      barkTexture: current.barkTexture,
      woodDetails: current.woodDetails,
    };
    mutate(draft);
    if (!transient) persistState(draft, storageKey);
    const next = {
      ...draft,
      canRedo: redoStack.length > 0,
      canUndo: undoStack.length > 0,
      lastChange: { immediate, reframe, transient },
      presetDirty: presetIsDirty(draft),
      ...(live
        ? { liveRevision: current.liveRevision + 1 }
        : { docRevision: current.docRevision + 1 }),
    };
    store.setState(next);
  }

  function coerceTool(tool, settings) {
    // Flowers are trees with blooms — every sketch tool works on them.
    // Bushes have no wood to draw on, but their preview still needs the
    // explicit Move camera tool and its Rotate / Pan / Zoom sub-modes.
    return settings.plant.type === 'bush' && tool !== 'move' && tool !== 'orbit'
      ? 'orbit'
      : tool;
  }

  const actions = {
    // ---- settings ---------------------------------------------------------
    setBaselineControl(controlId, value, { snapshot = true } = {}) {
      commitDocument((draft) => {
        draft.settings = {
          ...draft.settings,
          baselineControls: {
            ...(draft.settings.baselineControls ?? {}),
            [controlId]: value,
          },
        };
      }, { reframe: false, snapshot });
    },
    clearBaselineControl(controlId, { snapshot = true } = {}) {
      commitDocument((draft) => {
        const baselineControls = { ...(draft.settings.baselineControls ?? {}) };
        delete baselineControls[controlId];
        draft.settings = { ...draft.settings, baselineControls };
      }, { reframe: false, snapshot });
    },
    setField(field, value, { snapshot = true, transient = false } = {}) {
      const live = field.bake === 'live';
      commitDocument((draft) => {
        if (field.id === 'plant.speciesProfileId' && value) {
          const current = draft.settings;
          draft.settings = settingsFromRecipe(createTreeSpeciesRecipe(value, {
            seed: current.plant.seed,
            // Species profiles own real-world proportions. Carrying the
            // previous generic preset's global scale (often 2–4×) into a
            // botanical preset makes otherwise valid dimensions look wildly
            // wrong and defeats the review camera's auto-framing.
            options: {
              size: 1,
              vegetationShader: current.plant.stylePreset,
              growthForm: current.plant.growthForm,
              growthFormSubtype: current.plant.growthFormSubtype,
            },
          }));
          // Species architecture owns its organ shape. Never leak a maple,
          // oak, or custom editor leaf into bamboo, palms, conifers, or a
          // newly selected broadleaf preset.
          draft.leafShape = null;
          draft.leafStyle = null;
          return;
        }
        const settings = { ...draft.settings, [field.group]: { ...draft.settings[field.group] } };
        settings[field.group][field.key] = value;
        if (field.id === 'plant.speciesProfileId' && !value) {
          settings.structure = { ...settings.structure, engine: 'legacy-woody' };
        }
        if ((field.id === 'plant.lifeStageSlot' || field.id === 'plant.foliageState')
          && settings.plant.speciesProfileId) {
          const profile = TREE_SPECIES_PROFILE_BY_ID[settings.plant.speciesProfileId];
          if (field.id === 'plant.lifeStageSlot' && !profile.supportedStages.includes(value)) {
            settings.plant.lifeStageSlot = profile.supportedStages[2];
          }
          if (field.id === 'plant.lifeStageSlot') {
            settings.plant.developmentProgress = profile.supportedStages.indexOf(
              settings.plant.lifeStageSlot,
            ) / Math.max(1, profile.supportedStages.length - 1);
          }
          if (field.id === 'plant.foliageState' && !profile.validFoliageStates.includes(value)) {
            settings.plant.foliageState = profile.validFoliageStates[0];
          }
        }
        if (field.id === 'plant.developmentProgress' && settings.plant.speciesProfileId) {
          const profile = TREE_SPECIES_PROFILE_BY_ID[settings.plant.speciesProfileId];
          const progress = Math.max(0, Math.min(1, Number(value) || 0));
          settings.plant.developmentProgress = progress;
          settings.plant.lifeStageSlot = profile.supportedStages[
            Math.round(progress * (profile.supportedStages.length - 1))
          ];
        }
        if (field.id === 'plant.growthForm') {
          settings.plant.growthFormSubtype = TREE_GROWTH_FORM_SUBTYPES[value]?.[0]
            ?? 'species-default';
        }
        if (field.id === 'trunk.style' && value !== 'custom') {
          // Spread the preset's concrete values into the sliders; recipes
          // always carry explicit numbers, never preset names.
          const style = TREE_TRUNK_STYLES[value] ?? {};
          for (const key of TRUNK_VALUE_KEYS) {
            if (style[key] !== undefined) settings.trunk[key] = style[key];
          }
          if (style.leanOffset !== undefined) {
            settings.trunk.leanOffsetAuto = false;
            settings.trunk.leanOffset = style.leanOffset;
          }
        } else if (field.group === 'trunk' && field.key !== 'style') {
          settings.trunk.style = matchTrunkStyle(settings.trunk);
        }
        draft.settings = settings;
      }, {
        live,
        reframe: [
          'plant.speciesProfileId',
          'plant.lifeStageSlot',
          'plant.developmentProgress',
          'plant.growthForm',
          'plant.growthFormSubtype',
          'plant.size',
        ].includes(field.id),
        snapshot,
        transient,
      });
      // Switching into drawn mode arms the wood brush (legacy behavior).
      if (field.id === 'skeleton.generator' && value === 'drawn') actions.setTool('branch');
      if (field.id === 'plant.type') actions.setTool(state().tool);
    },
    setSeed(seed) {
      const clamped = Math.min(SEED_RANGE.max,
        Math.max(SEED_RANGE.min, Math.round(Number(seed) || SEED_RANGE.min)));
      actions.setField(TREE_SETTING_FIELD_SCHEMA.plant.seed, clamped);
    },
    randomizeSeed() {
      actions.setSeed(SEED_RANGE.min
        + Math.floor(Math.random() * (SEED_RANGE.max - SEED_RANGE.min)));
    },

    // ---- document lifecycle -------------------------------------------------
    applyPreset(presetId) {
      const preset = findTreePreset(presetId, loadLocalTreePresets());
      if (!preset || !acceptsType(preset.type)) {
        store.setState({ presetDirty: false, presetId: '' });
        if (preset) {
          store.setState({ status: isFlowerLab
            ? 'That recipe belongs in Tree Lab.'
            : 'That flower recipe belongs in Flower Lab.' });
        }
        return false;
      }
      commitDocument((draft) => {
        draft.settings = settingsFromRecipe(preset);
        draft.sketch = sketchFromOptions(preset.options);
        draft.presetId = preset.id;
        draft.leafShape = preset.options.leafShape ?? null;
        draft.leafStyle = preset.options.leafStyle ?? null;
        draft.animation = preset.options.animation ?? null;
        draft.roots = preset.options.roots ?? null;
        draft.flowers = preset.options.flowers ?? null;
        draft.trunkProfile = preset.options.trunkProfile ?? null;
        draft.barkTexture = preset.options.barkTexture ?? null;
        draft.woodDetails = preset.options.woodDetails ?? null;
      }, { immediate: true, reframe: true });
      const url = new URL(window.location.href);
      url.search = `?${presetParam}=${encodeURIComponent(preset.id)}`;
      window.history.replaceState(null, '', url);
      actions.setStatus(`Loaded “${preset.label}”.`);
      return true;
    },
    savePresetAs(label) {
      const trimmed = String(label ?? '').trim();
      if (!trimmed) return { error: 'Name the preset first.', ok: false };
      const slug = trimmed.toLowerCase().replace(/[\s-]+/g, '_').replace(/[^a-z0-9_]/g, '')
        || (isFlowerLab ? 'flower' : 'tree');
      const id = `local_${slug}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        const saved = upsertLocalTreePreset({ ...actions.getRecipeDocument(), id, label: trimmed });
        store.setState({ presetDirty: false, presetId: saved.id });
        persistState(state(), storageKey);
        actions.setStatus(`Saved “${saved.label}” locally.`);
        return { ok: true, preset: saved };
      } catch (error) {
        return { error: `Save failed: ${error.message}`, ok: false };
      }
    },
    updatePreset() {
      const local = loadLocalTreePresets().find(({ id }) => id === state().presetId);
      if (!local) {
        return { error: 'Choose a saved local asset before updating.', ok: false };
      }
      try {
        const saved = upsertLocalTreePreset({
          ...actions.getRecipeDocument(),
          id: local.id,
          label: local.label,
        });
        store.setState({ presetDirty: false, presetId: saved.id });
        persistState(state(), storageKey);
        actions.setStatus(`Updated “${saved.label}”.`);
        return { ok: true, preset: saved };
      } catch (error) {
        return { error: `Update failed: ${error.message}`, ok: false };
      }
    },
    importRecipe(jsonOrObject) {
      let parsed = jsonOrObject;
      if (typeof parsed === 'string') {
        try {
          parsed = JSON.parse(parsed);
        } catch {
          return { errors: ['Not valid JSON.'], ok: false };
        }
      }
      const result = validateTreeRecipeDocument(parsed);
      if (!result.ok) return { errors: result.errors, ok: false };
      if (!acceptsType(result.value.type)) {
        return { errors: [isFlowerLab
          ? 'Flower Lab only opens flower recipes.'
          : 'Flower recipes open in Flower Lab.'], ok: false };
      }
      commitDocument((draft) => {
        draft.settings = settingsFromRecipe(result.value);
        draft.sketch = sketchFromOptions(result.value.options);
        draft.presetId = '';
        draft.leafShape = result.value.options.leafShape ?? null;
        draft.leafStyle = result.value.options.leafStyle ?? null;
        draft.animation = result.value.options.animation ?? null;
        draft.roots = result.value.options.roots ?? null;
        draft.flowers = result.value.options.flowers ?? null;
        draft.trunkProfile = result.value.options.trunkProfile ?? null;
        draft.barkTexture = result.value.options.barkTexture ?? null;
        draft.woodDetails = result.value.options.woodDetails ?? null;
      }, { immediate: true, reframe: true });
      actions.setStatus('Recipe imported.');
      return { ok: true };
    },
    /** __treeDesigner.setRecipe semantics: throws on invalid, NO reframe. */
    setRecipe(recipe) {
      const result = validateTreeRecipeDocument(recipe);
      if (!result.ok) throw new Error(result.errors.join(' '));
      if (!acceptsType(result.value.type)) {
        throw new Error(isFlowerLab
          ? 'Flower Lab only opens flower recipes.'
          : 'Flower recipes open in Flower Lab.');
      }
      commitDocument((draft) => {
        draft.settings = settingsFromRecipe(result.value);
        draft.sketch = sketchFromOptions(result.value.options);
        draft.presetId = '';
        draft.leafShape = result.value.options.leafShape ?? null;
        draft.leafStyle = result.value.options.leafStyle ?? null;
        draft.animation = result.value.options.animation ?? null;
        draft.roots = result.value.options.roots ?? null;
        draft.flowers = result.value.options.flowers ?? null;
        draft.trunkProfile = result.value.options.trunkProfile ?? null;
        draft.barkTexture = result.value.options.barkTexture ?? null;
        draft.woodDetails = result.value.options.woodDetails ?? null;
      }, { immediate: true });
      return true;
    },
    newTree({ drawn, randomize = true }) {
      // A new document starts a fresh history — undo must never step back
      // across the document boundary into the previous tree.
      undoStack.length = 0;
      redoStack.length = 0;
      commitDocument((draft) => {
        draft.settings = cloneTreeSettings();
        draft.sketch = normalizeSketch();
        draft.presetId = '';
        draft.leafShape = null;
        draft.leafStyle = null;
        draft.animation = null;
        draft.roots = null;
        draft.flowers = null;
        draft.trunkProfile = null;
        draft.barkTexture = null;
        draft.woodDetails = null;
        if (isFlowerLab) {
          const templates = BUILT_IN_TREE_PRESETS.filter((preset) => preset.type === 'flower');
          const template = randomize
            ? templates[Math.floor(Math.random() * templates.length)]
            : (findTreePreset('species_daisy_clump') ?? templates[0]);
          draft.settings = settingsFromRecipe(template);
          draft.settings.plant.seed = randomize
            ? SEED_RANGE.min + Math.floor(Math.random() * (SEED_RANGE.max - SEED_RANGE.min))
            : draft.settings.plant.seed;
        } else if (drawn) {
          draft.settings.skeleton.generator = 'drawn';
        } else {
          // Surprise me rolls a random ARCHETYPE (any built-in tree template:
          // EZ broadleaves, conifers, tips styles, blob crowns) x a random
          // seed — not just a reseeded default blob tree.
          // Modern species only — the classic dense blob examples would
          // dominate by count and defeat the point of a surprise.
          const templates = BUILT_IN_TREE_PRESETS.filter((preset) =>
            preset.type === 'tree' &&
            (preset.id.startsWith('species_') || preset.id === 'example_branching'));
          const template = templates[Math.floor(Math.random() * templates.length)];
          draft.settings = settingsFromRecipe(template);
          draft.settings.plant.seed = SEED_RANGE.min
            + Math.floor(Math.random() * (SEED_RANGE.max - SEED_RANGE.min));
        }
      }, { immediate: true, reframe: true, snapshot: false });
      actions.setTool(!isFlowerLab && drawn ? 'branch' : 'orbit');
      actions.setStatus(isFlowerLab
        ? 'Fresh procedural flower — tune its bloom, stem, leaves, and structure.'
        : drawn
          ? 'Blank canvas — drag ✏️ from the ground up to draw the trunk, then scribble 🍃 loops for leaves.'
          : 'Fresh procedural tree — tweak the sliders or hit 🎲 for variants.');
    },
    resetLab() {
      clearStoredState(storageKey);
      window.location.href = window.location.pathname;
    },
    getRecipeDocument() {
      const current = state();
      return recipeDocumentFor(
        current.settings, current.sketch, current.presetId, extrasOf(current));
    },

    // ---- leaf style + animation (document side-channels) ------------------
    setLeafShape(leafShape, { leafStyle = undefined } = {}) {
      commitDocument((draft) => {
        draft.leafShape = leafShape;
        if (leafStyle !== undefined) draft.leafStyle = leafStyle;
      }, { immediate: true });
    },
    setLeafStyle(leafStyle) {
      commitDocument((draft) => {
        draft.leafStyle = leafStyle;
      }, { live: true });
    },
    setWoodDetails(woodDetails) {
      commitDocument((draft) => {
        draft.woodDetails = woodDetails;
      });
    },
    setBarkTexture(barkTexture) {
      commitDocument((draft) => {
        draft.barkTexture = barkTexture;
      }, { live: true });
    },
    setTrunkProfile(trunkProfile) {
      commitDocument((draft) => {
        draft.trunkProfile = trunkProfile;
      }, { immediate: true });
    },
    setRoots(roots) {
      commitDocument((draft) => {
        draft.roots = roots;
      }, { immediate: true });
    },
    setFlowers(flowers) {
      commitDocument((draft) => {
        draft.flowers = flowers;
      }, { live: true });
    },
    setAnimation(animation) {
      // No geometry rebuild needed — the engine's particle layer watches
      // this by reference through liveRevision.
      commitDocument((draft) => {
        draft.animation = animation;
      }, { live: true });
    },

    // ---- history ---------------------------------------------------------------
    undo() {
      const snapshot = undoStack.pop();
      if (!snapshot) return false;
      redoStack.push(documentSnapshot());
      const parsed = JSON.parse(snapshot);
      commitDocument((draft) => {
        draft.settings = parsed.settings;
        draft.sketch = normalizeSketch(parsed.sketch);
        draft.presetId = parsed.presetId ?? '';
        draft.leafShape = parsed.leafShape ?? null;
        draft.leafStyle = parsed.leafStyle ?? null;
        draft.animation = parsed.animation ?? null;
        draft.roots = parsed.roots ?? null;
        draft.flowers = parsed.flowers ?? null;
        draft.trunkProfile = parsed.trunkProfile ?? null;
        draft.barkTexture = parsed.barkTexture ?? null;
        draft.woodDetails = parsed.woodDetails ?? null;
      }, { immediate: true, snapshot: false });
      return true;
    },
    redo() {
      const snapshot = redoStack.pop();
      if (!snapshot) return false;
      undoStack.push(documentSnapshot());
      const parsed = JSON.parse(snapshot);
      commitDocument((draft) => {
        draft.settings = parsed.settings;
        draft.sketch = normalizeSketch(parsed.sketch);
        draft.presetId = parsed.presetId ?? '';
        draft.leafShape = parsed.leafShape ?? null;
        draft.leafStyle = parsed.leafStyle ?? null;
        draft.animation = parsed.animation ?? null;
        draft.roots = parsed.roots ?? null;
        draft.flowers = parsed.flowers ?? null;
        draft.trunkProfile = parsed.trunkProfile ?? null;
        draft.barkTexture = parsed.barkTexture ?? null;
        draft.woodDetails = parsed.woodDetails ?? null;
      }, { immediate: true, snapshot: false });
      return true;
    },

    // ---- session ------------------------------------------------------------------
    setTool(tool) {
      store.setState({ tool: coerceTool(tool, state().settings) });
    },
    setStage(stage) {
      store.setState({ stage });
    },
    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
    },
    setSketchMode(on) {
      store.setState({
        sketchMode: Boolean(on),
        tool: on ? 'doodleWood' : 'orbit',
        ...(on ? {} : { pendingStrokes: [] }),
      });
      if (on) {
        actions.setStatus('Sketch mode — doodle wood and leaves, then hit Convert to Tree.');
      }
    },
    addPendingStroke(stroke) {
      store.setState({ pendingStrokes: [...state().pendingStrokes, stroke] });
    },
    clearPendingStrokes() {
      store.setState({ pendingStrokes: [] });
      actions.setStatus('Sketch cleared.');
    },
    removePendingStrokes(indices) {
      const drop = new Set(indices);
      if (!drop.size) return;
      store.setState({
        pendingStrokes: state().pendingStrokes.filter((_, index) => !drop.has(index)),
      });
      actions.setStatus(`Erased ${drop.size} stroke${drop.size === 1 ? '' : 's'}.`);
    },
    setBrush(patch) {
      store.setState({ brush: { ...state().brush, ...patch } });
    },
    setGlbMode(glbMode) {
      store.setState({ glbMode });
    },
    setMoveMode(moveMode) {
      store.setState({ moveMode });
    },
    setPreviewLod(previewLod) {
      const normalized = previewLod === null || previewLod === 'edit'
        ? null
        : Math.min(3, Math.max(0, Math.round(Number(previewLod) || 0)));
      store.setState({
        previewLod: normalized,
        ...(normalized === null ? {} : { selection: null }),
      });
    },
    setMannequin(mannequin) {
      store.setState({ mannequin });
    },
    setSky(partial) {
      store.setState({ sky: { ...state().sky, ...partial } });
    },
    setStyleId(value) {
      const next = normalizeVegetationStyleId(value);
      if (next === state().styleId) return;
      const label = getVegetationShaderPresetOptions()
        .find((entry) => entry.id === next)?.label ?? next;
      store.setState({
        status: `Previewing every plant preset through ${label}.`,
        styleId: next,
      });
      const url = new URL(window.location.href);
      url.searchParams.set('vegetationStyle', next);
      window.history.replaceState(null, '', url);
    },
    setWalkPreview(walkPreview) {
      store.setState({ walkPreview });
      if (walkPreview) {
        actions.setStatus(WALK_PREVIEW_STATUS);
      }
    },
    setStatus(status) {
      store.setState({ status });
    },
    select(branchIndex, screen) {
      store.setState({ selection: { branchIndex, screen } });
    },
    clearSelection() {
      if (state().selection) store.setState({ selection: null });
    },

    // ---- sketch commits (engine/sketchCommits.js) ------------------------------------
    addBranchSpine(spine, { status }) {
      commitDocument((draft) => {
        draft.sketch = { ...draft.sketch, branchSpines: [...draft.sketch.branchSpines, spine] };
      }, { immediate: true });
      actions.setStatus(status);
    },
    addLeafAttachments(attachments, { status }) {
      commitDocument((draft) => {
        draft.sketch = {
          ...draft.sketch,
          extraAttachments: [...draft.sketch.extraAttachments, ...attachments],
        };
      }, { immediate: true });
      actions.setStatus(status);
    },
    addFoliageBlobs(blobs, { status }) {
      commitDocument((draft) => {
        draft.sketch = { ...draft.sketch, extraBlobs: [...draft.sketch.extraBlobs, ...blobs] };
      }, { immediate: true });
      actions.setStatus(status);
    },
    // Doodle-grow: the drawn trunk becomes the branching generator's leader
    // spine; the generator then grows the whole tree along it.
    setTrunkSpine(points, { status }) {
      commitDocument((draft) => {
        draft.sketch = { ...draft.sketch, trunkSpine: points };
        draft.settings = {
          ...draft.settings,
          skeleton: { ...draft.settings.skeleton, generator: 'branching' },
        };
      }, { immediate: true });
      actions.setStatus(status);
    },
    setCrownBlobs(blobs, { status, switchGeneratorToLimbs = false }) {
      commitDocument((draft) => {
        draft.sketch = { ...draft.sketch, crownBlobs: [...draft.sketch.crownBlobs, ...blobs] };
        if (switchGeneratorToLimbs) {
          draft.settings = {
            ...draft.settings,
            skeleton: { ...draft.settings.skeleton, generator: 'limbs' },
          };
        }
      }, { immediate: true });
      actions.setStatus(status);
    },
    removeSketchItem(kind, index) {
      commitDocument((draft) => {
        const list = [...draft.sketch[kind]];
        list.splice(index, 1);
        draft.sketch = { ...draft.sketch, [kind]: list };
      }, { immediate: true });
      actions.setStatus('Stroke erased.');
    },
    clearCrownBlobs() {
      if (!state().sketch.crownBlobs.length) return;
      commitDocument((draft) => {
        draft.sketch = { ...draft.sketch, crownBlobs: [] };
      }, { immediate: true });
      actions.setStatus('Drawn crown cleared — Crown Shape sliders steer the layout again.');
    },
    clearStrokes() {
      const { sketch } = state();
      if (!sketch.branchSpines.length && !sketch.extraBlobs.length
        && !sketch.extraAttachments.length) return;
      commitDocument((draft) => {
        draft.sketch = sketchFromOptions();
      }, { immediate: true });
      actions.setStatus('All strokes cleared.');
    },
    resizeSpine(index, factor) {
      let radius = 0;
      commitDocument((draft) => {
        const spines = [...draft.sketch.branchSpines];
        const spine = { ...spines[index] };
        spine.radiusStart = round4(Math.min(Math.max(spine.radiusStart * factor, 0.01), 0.5));
        spine.radiusEnd = round4(Math.min(Math.max(spine.radiusEnd * factor, 0.005), 0.3));
        spines[index] = spine;
        draft.sketch = { ...draft.sketch, branchSpines: spines };
        radius = spine.radiusStart;
      }, { immediate: true });
      actions.setStatus(`Drawn branch ${factor < 1 ? 'thinned' : 'thickened'} to ${radius.toFixed(3)}.`);
    },
    setTrunkRadiusBottom(factor) {
      let next = 0;
      commitDocument((draft) => {
        const trunk = { ...draft.settings.trunk };
        next = round4(Math.min(Math.max(trunk.radiusBottom * factor, 0.05), 0.6));
        trunk.radiusBottom = next;
        trunk.style = matchTrunkStyle(trunk);
        draft.settings = { ...draft.settings, trunk };
      }, { immediate: true });
      actions.setStatus(
        `Trunk ${factor < 1 ? 'thinned' : 'thickened'} to ${next.toFixed(3)} — all procedural wood scales with it.`);
      return next;
    },

    // ---- branch overrides (branch inspector) --------------------------------------------
    mutateBranchOverrides(mutate, { snapshot = true } = {}) {
      commitDocument((draft) => {
        const overrides = structuredClone(draft.sketch.branchOverrides);
        mutate(overrides);
        draft.sketch = { ...draft.sketch, branchOverrides: overrides };
      }, { snapshot });
    },
  };

  return {
    actions, getState: store.getState, seedRange: SEED_RANGE, subscribe: store.subscribe,
  };
}
