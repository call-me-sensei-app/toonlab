import { createStore } from '../../shared/ui/index.js';
import {
  BUILDING_SETTING_FIELD_SCHEMA,
  BUILDING_TYPES,
  buildingRecipeFromSettings,
  buildingSettingsFromRecipe,
  createBuildingSettings,
  findBuildingPreset,
  validateBuildingRecipeDocument,
} from '../../../src/buildinggen/index.js';
import {
  clearBuildingDocument,
  loadBuildingDocument,
  loadLocalBuildingPresets,
  saveBuildingDocument,
  upsertLocalBuildingPreset,
} from '../buildingProjectStore.js';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function randomSeed() {
  return Math.floor(Math.random() * 100000) >>> 0;
}

function slug(value) {
  return String(value || 'building').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findAnyPreset(id) {
  return findBuildingPreset(id) ?? loadLocalBuildingPresets().find((entry) => entry.id === id) ?? null;
}

function defaultView() {
  return { drawer: false, export: false, lodPreview: 'hi', slopeTest: false };
}

function bootDocument(urlParams) {
  const encoded = urlParams.get('buildingRecipe') || urlParams.get('recipe');
  if (encoded) {
    try {
      const document = JSON.parse(encoded);
      if (validateBuildingRecipeDocument(document).ok) {
        return {
          bootSource: 'url',
          name: document.name || 'Shared building',
          presetId: null,
          settings: buildingSettingsFromRecipe(document),
        };
      }
    } catch { /* fall through to persisted/fresh */ }
  }
  const saved = loadBuildingDocument();
  if (saved) return { ...saved, bootSource: 'persisted' };
  return {
    bootSource: 'fresh',
    name: 'Untitled building',
    presetId: null,
    settings: createBuildingSettings(),
  };
}

export function createBuildingStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const boot = bootDocument(urlParams);
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    exporting: false,
    lastChange: { immediate: false, reframe: false },
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    stage: 'type',
    status: boot.bootSource === 'fresh' ? '' : 'Restored your last building recipe.',
    view: defaultView(),
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
  });

  function persist() {
    saveBuildingDocument({ name: state().name, presetId: state().presetId, settings: state().settings });
  }

  function pushHistory(key = null) {
    const now = Date.now();
    if (key && lastHistoryKey === key && now - lastHistoryTime < HISTORY_COALESCE_MS) {
      lastHistoryTime = now;
      return;
    }
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    lastHistoryKey = key;
    lastHistoryTime = now;
  }

  function updateHistoryFlags() {
    store.setState({ canRedo: redoStack.length > 0, canUndo: undoStack.length > 0 });
  }

  function commit(patch, { immediate = false, reframe = false, status = null } = {}) {
    store.setState((previous) => ({
      ...patch,
      docRevision: previous.docRevision + 1,
      lastChange: { immediate, reframe },
      ...(status === null ? {} : { status }),
    }));
    persist();
    updateHistoryFlags();
  }

  // View changes that alter the preview scene (LOD mode, slope test) ride
  // the same docRevision → engine rebuild path as document edits, but never
  // touch history, the persisted document, or the dirty flag.
  function commitView(patch, { reframe = false, status = null } = {}) {
    store.setState((previous) => ({
      docRevision: previous.docRevision + 1,
      lastChange: { immediate: true, reframe },
      view: { ...previous.view, ...patch },
      ...(status === null ? {} : { status }),
    }));
  }

  function restore(entry, destination) {
    destination.push(snapshot());
    const document = JSON.parse(entry);
    commit({
      ...document,
      settings: createBuildingSettings(document.settings),
    }, { immediate: true, reframe: true, status: 'History restored.' });
  }

  function replaceForStart(settings, { name, presetId = null, status }) {
    pushHistory();
    store.setState({
      bootSource: 'started',
      name,
      presetDirty: false,
      presetId,
      stage: 'type',
      view: defaultView(),
    });
    commit({ settings: createBuildingSettings(settings) }, { immediate: true, reframe: true, status });
  }

  store.actions = {
    applyPreset(id) {
      const preset = findAnyPreset(id);
      if (!preset) return false;
      replaceForStart(buildingSettingsFromRecipe(preset.recipe), {
        name: preset.label,
        presetId: preset.id,
        status: `Opened ${preset.label}.`,
      });
      return true;
    },

    getRecipeDocument() {
      return buildingRecipeFromSettings(state().settings);
    },

    importRecipe(text) {
      try {
        const document = JSON.parse(text);
        const result = validateBuildingRecipeDocument(document);
        if (!result.ok) return result;
        replaceForStart(buildingSettingsFromRecipe(document), {
          name: document.name || `Imported ${BUILDING_TYPES[document.type].label.toLowerCase()}`,
          status: `Imported a ${BUILDING_TYPES[document.type].label.toLowerCase()} recipe.`,
        });
        return { errors: [], ok: true };
      } catch (error) {
        return { errors: [`Invalid JSON: ${error.message}`], ok: false };
      }
    },

    randomizeCurrent() {
      const current = state().settings;
      pushHistory();
      commit({
        presetDirty: true,
        settings: createBuildingSettings({ ...current, seed: randomSeed() }),
      }, { immediate: true, status: `Rolled a new ${BUILDING_TYPES[current.type].label.toLowerCase()} seed.` });
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearBuildingDocument();
      replaceForStart(createBuildingSettings(), {
        name: 'Untitled building',
        status: 'Building Lab reset.',
      });
    },

    revertPreset() {
      if (state().presetId) this.applyPreset(state().presetId);
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local-${slug(cleanName)}-${Date.now().toString(36)}`;
      const preset = upsertLocalBuildingPreset({
        description: 'Saved in this browser.',
        id,
        label: cleanName,
        recipe: buildingRecipeFromSettings(state().settings),
      });
      store.setState({ name: cleanName, presetDirty: false, presetId: id, status: `Saved “${cleanName}” to your library.` });
      persist();
      return { ok: true, preset };
    },

    setExporting(exporting) {
      store.setState({ exporting: Boolean(exporting) });
    },

    setField(group, key, value) {
      const field = BUILDING_SETTING_FIELD_SCHEMA[group]?.[key];
      if (!field) return;
      const current = state().settings;
      let nextValue = value;
      if (field.type === 'color') {
        if (!Array.isArray(value)) return;
        nextValue = [...value];
      } else if (field.type === 'number') {
        nextValue = Number(value);
        if (!Number.isFinite(nextValue)) return;
      }
      pushHistory(`field:${group}.${key}`);
      commit({
        presetDirty: true,
        settings: createBuildingSettings({
          ...current,
          [group]: { ...current[group], [key]: nextValue },
        }),
      }, {
        // Plan and floor changes move the whole silhouette — keep it framed.
        reframe: group === 'footprint' || (group === 'massing' && (key === 'floors' || key === 'floorHeight')),
      });
    },

    setLodPreview(lodPreview) {
      if (!['hi', 'lo', 'both'].includes(lodPreview)) return;
      commitView({ lodPreview }, {
        reframe: true,
        status: lodPreview === 'both'
          ? 'Hi mesh left, lo mesh right — the distance swap should be invisible.'
          : `Previewing the ${lodPreview} detail mesh.`,
      });
    },

    setName(name) {
      const next = String(name || '').trim();
      if (!next) return;
      store.setState({ name: next, presetDirty: true });
      persist();
    },

    setSeed(seed) {
      const current = state().settings;
      pushHistory('seed');
      commit({
        presetDirty: true,
        settings: createBuildingSettings({ ...current, seed: Math.max(0, Math.round(Number(seed) || 0)) }),
      }, { immediate: true, status: 'Generated a new deterministic build.' });
    },

    setSlopeTest(slopeTest) {
      commitView({ slopeTest: Boolean(slopeTest) }, {
        reframe: true,
        status: slopeTest
          ? 'Dropped onto the 16° test slope — the buried foundation skirt keeps every corner grounded.'
          : 'Back to the gentle terrain swell.',
      });
    },

    setStage(stage) {
      store.setState({ stage });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setType(type) {
      if (!BUILDING_TYPES[type]) return;
      const current = state().settings;
      pushHistory();
      // createBuildingSettings layers BUILDING_TYPE_DEFAULTS (footprint,
      // massing, roof, facade, palette) under the kept seed.
      commit({
        name: `Untitled ${BUILDING_TYPES[type].label.toLowerCase()}`,
        presetDirty: true,
        presetId: null,
        settings: createBuildingSettings({ seed: current.seed, type }),
      }, { immediate: true, reframe: true, status: `Switched to ${BUILDING_TYPES[type].label}.` });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
