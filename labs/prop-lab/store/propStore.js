import { createStore } from '../../shared/ui/index.js';
import {
  PROP_TYPES,
  createPropRecipeDocument,
  createPropSettings,
  findPropPreset,
  validatePropRecipeDocument,
} from '../../../src/propgen/index.js';
import {
  clearPropDocument,
  loadLocalPropPresets,
  loadPropDocument,
  savePropDocument,
  upsertLocalPropPreset,
} from '../propProjectStore.js';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function randomSeed() {
  return Math.floor(Math.random() * 100000) >>> 0;
}

function slug(value) {
  return String(value || 'prop').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findAnyPreset(id) {
  return findPropPreset(id) ?? loadLocalPropPresets().find((entry) => entry.id === id) ?? null;
}

function defaultView() {
  return { drawer: false, export: false, lodPreview: 'hi', scatter: false };
}

function bootDocument(urlParams) {
  const encoded = urlParams.get('propRecipe') || urlParams.get('recipe');
  if (encoded) {
    try {
      const document = JSON.parse(encoded);
      if (validatePropRecipeDocument(document).ok) {
        return {
          bootSource: 'url',
          name: document.name || 'Shared prop',
          presetId: null,
          settings: createPropSettings(document.settings),
        };
      }
    } catch { /* fall through to persisted/fresh */ }
  }
  const saved = loadPropDocument();
  if (saved) return { ...saved, bootSource: 'persisted' };
  return {
    bootSource: 'fresh',
    name: 'Untitled prop',
    presetId: null,
    settings: createPropSettings(),
  };
}

export function createPropStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
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
    status: boot.bootSource === 'fresh' ? '' : 'Restored your last prop recipe.',
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
    savePropDocument({ name: state().name, presetId: state().presetId, settings: state().settings });
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

  // View changes that alter the preview scene (LOD mode, scatter rehearsal)
  // ride the same docRevision → engine rebuild path as document edits, but
  // never touch history, the persisted document, or the dirty flag.
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
      settings: createPropSettings(document.settings),
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
    commit({ settings: createPropSettings(settings) }, { immediate: true, reframe: true, status });
  }

  store.actions = {
    applyPreset(id) {
      const preset = findAnyPreset(id);
      if (!preset) return false;
      replaceForStart(preset.recipe.settings, {
        name: preset.label,
        presetId: preset.id,
        status: `Opened ${preset.label}.`,
      });
      return true;
    },

    getRecipeDocument() {
      return createPropRecipeDocument(state().settings, { name: state().name });
    },

    importRecipe(text) {
      try {
        const document = JSON.parse(text);
        const result = validatePropRecipeDocument(document);
        if (!result.ok) return result;
        replaceForStart(document.settings, {
          name: document.name || 'Imported prop',
          status: `Imported ${document.name || 'prop recipe'}.`,
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
        settings: createPropSettings({
          ...current,
          asset: { ...current.asset, seed: randomSeed() },
        }),
      }, { immediate: true, status: `Rolled a new ${PROP_TYPES[current.asset.type].label.toLowerCase()} seed.` });
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearPropDocument();
      replaceForStart(createPropSettings(), {
        name: 'Untitled prop',
        status: 'Prop Lab reset.',
      });
    },

    revertPreset() {
      if (state().presetId) this.applyPreset(state().presetId);
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local-${slug(cleanName)}-${Date.now().toString(36)}`;
      const preset = upsertLocalPropPreset({
        description: 'Saved in this browser.',
        id,
        label: cleanName,
        recipe: createPropRecipeDocument(state().settings, { name: cleanName }),
      });
      store.setState({ name: cleanName, presetDirty: false, presetId: id, status: `Saved “${cleanName}” to your library.` });
      persist();
      return { ok: true, preset };
    },

    setExporting(exporting) {
      store.setState({ exporting: Boolean(exporting) });
    },

    setField(section, key, value) {
      const current = state().settings;
      const nextValue = Number(value);
      if (!Number.isFinite(nextValue)) return;
      pushHistory(`field:${section}.${key}`);
      commit({
        presetDirty: true,
        settings: createPropSettings({
          ...current,
          [section]: { ...current[section], [key]: nextValue },
        }),
      }, { reframe: section === 'asset' && key === 'scale' });
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

    setScatter(scatter) {
      commitView({ scatter: Boolean(scatter) }, {
        reframe: true,
        status: scatter
          ? 'Scattered 24 seeded copies across the terrain — exactly what world placement does.'
          : 'Back to the single hero prop.',
      });
    },

    setSeed(seed) {
      const current = state().settings;
      pushHistory('seed');
      commit({
        presetDirty: true,
        settings: createPropSettings({
          ...current,
          asset: { ...current.asset, seed: Math.max(0, Math.round(Number(seed) || 0)) },
        }),
      }, { immediate: true, status: 'Generated a new deterministic build.' });
    },

    setStage(stage) {
      store.setState({ stage });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setSurfaceColor(key, value) {
      const current = state().settings;
      pushHistory(`color:${key}`);
      commit({
        presetDirty: true,
        settings: createPropSettings({
          ...current,
          surface: { ...current.surface, [key]: [...value] },
        }),
      });
    },

    setType(type) {
      if (!PROP_TYPES[type]) return;
      const current = state().settings;
      pushHistory();
      // createPropSettings layers PROP_TYPE_DEFAULTS (shape + palette +
      // default variant) under the kept identity fields.
      commit({
        name: `Untitled ${PROP_TYPES[type].label.toLowerCase()}`,
        presetDirty: true,
        presetId: null,
        settings: createPropSettings({
          asset: { scale: current.asset.scale, seed: current.asset.seed, type },
        }),
      }, { immediate: true, reframe: true, status: `Switched to ${PROP_TYPES[type].label}.` });
    },

    setVariant(variant) {
      const current = state().settings;
      if (!PROP_TYPES[current.asset.type].variants.some((entry) => entry.id === variant)) return;
      pushHistory();
      commit({
        presetDirty: true,
        presetId: null,
        settings: createPropSettings({
          ...current,
          asset: { ...current.asset, variant },
        }),
      }, { immediate: true, reframe: true });
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
