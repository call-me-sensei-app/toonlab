// Texture Lab store: document state (settings/name/preset), undo history,
// persistence, and the store->engine rebuild contract (docRevision +
// lastChange, same as rock/debris labs).

import { createStore } from '../../shared/ui/createStore.js';
import {
  createTextureRecipeDocument,
  createTextureSettings,
  findTexturePreset,
  validateTextureRecipeDocument,
} from '../../../src/texgen/index.js';
import {
  clearTextureDocument,
  loadAiConfig,
  loadLocalTexturePresets,
  loadTextureDocument,
  saveAiConfig,
  saveTextureDocument,
  upsertLocalTexturePreset,
} from '../textureProjectStore.js';
import {
  NEUTRAL_TEXTURE_PREVIEW_STYLE,
  normalizeTexturePreviewStyle,
  texturePreviewStyleLabel,
} from '../previewStyles.js';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function randomSeed() {
  return Math.floor(Math.random() * 100000) >>> 0;
}

function slug(value) {
  return String(value || 'texture').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findAnyPreset(id) {
  return findTexturePreset(id) ?? loadLocalTexturePresets().find((entry) => entry.id === id) ?? null;
}

function bootDocument(urlParams) {
  const encoded = urlParams.get('textureRecipe') || urlParams.get('recipe');
  if (encoded) {
    try {
      const document = JSON.parse(encoded);
      if (validateTextureRecipeDocument(document).ok) {
        return {
          bootSource: 'url',
          name: document.name || 'Shared texture',
          presetId: null,
          settings: createTextureSettings(document.settings),
        };
      }
    } catch { /* fall through to persisted/fresh */ }
  }
  const saved = loadTextureDocument();
  if (saved) return { ...saved, bootSource: 'persisted' };
  return {
    bootSource: 'fresh',
    name: 'Untitled texture',
    presetId: null,
    settings: createTextureSettings(),
  };
}

export function createTextureStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const boot = bootDocument(urlParams);
  const previewStyle = normalizeTexturePreviewStyle(
    urlParams.get('texturePreviewStyle') ?? urlParams.get('style'),
  );
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    ai: { ...loadAiConfig(), busy: false, notes: '' },
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    exporting: false,
    gen: { busy: false, ms: 0, progress: 0, size: 0 },
    lastChange: { immediate: false },
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    stage: 'base',
    status: boot.bootSource === 'fresh' ? '' : 'Restored your last texture.',
    view: {
      drawer: false,
      export: false,
      // Always enter through the texture browser, including when a previous
      // document exists. Explicit recipe/image handoffs are the only flows
      // that should open directly in the editor.
      gallery: !urlParams.has('textureRecipe')
        && !urlParams.has('recipe')
        && urlParams.get('importImage') !== '1',
      hq: false,
      map: 'final',
      mesh: 'sphere',
      mode: '3d',
      previewStyle,
      spin: true,
      tiling: 1,
    },
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
  });

  function persist() {
    saveTextureDocument({ name: state().name, presetId: state().presetId, settings: state().settings });
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

  function commit(patch, { immediate = false, status = null } = {}) {
    store.setState((previous) => ({
      ...patch,
      docRevision: previous.docRevision + 1,
      lastChange: { immediate },
      ...(status === null ? {} : { status }),
    }));
    persist();
    updateHistoryFlags();
  }

  function restore(entry, destination) {
    // An undo/redo boundary must end the previous slider gesture.
    lastHistoryKey = null;
    lastHistoryTime = 0;
    destination.push(snapshot());
    const document = JSON.parse(entry);
    commit({
      ...document,
      settings: createTextureSettings(document.settings),
    }, { immediate: true, status: 'History restored.' });
  }

  function replaceForStart(settings, { name, presetId = null, status }) {
    pushHistory();
    store.setState({
      bootSource: 'started',
      name,
      presetDirty: false,
      presetId,
      view: { ...state().view, export: false, gallery: false },
    });
    commit({ settings: createTextureSettings(settings) }, { immediate: true, status });
  }

  store.actions = {
    applyPreset(id) {
      const preset = findAnyPreset(id);
      if (!preset) return false;
      replaceForStart(preset.settings, {
        name: preset.label,
        presetId: preset.id,
        status: `Opened ${preset.label}.`,
      });
      return true;
    },

    /** Applies a compiled AI/import recipe (settings already clamped). */
    applyRecipe({ settings, name, presetId = null }, status) {
      replaceForStart(settings, {
        name: name || 'Generated texture',
        presetId,
        status: status ?? `Applied “${name}”.`,
      });
    },

    getRecipeDocument() {
      return createTextureRecipeDocument(state().settings, { name: state().name });
    },

    importRecipe(text) {
      try {
        const document = JSON.parse(text);
        const result = validateTextureRecipeDocument(document);
        if (!result.ok) return result;
        replaceForStart(document.settings, {
          name: document.name || 'Imported texture',
          status: `Imported ${document.name || 'texture recipe'}.`,
        });
        return { errors: [], ok: true };
      } catch (error) {
        return { errors: [`Invalid JSON: ${error.message}`], ok: false };
      }
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    reseed() {
      const current = state().settings;
      pushHistory('seed');
      commit({
        presetDirty: true,
        settings: createTextureSettings({ ...current, global: { seed: randomSeed() } }),
      }, { immediate: true, status: 'Re-rolled the seed.' });
    },

    resetLab() {
      clearTextureDocument();
      replaceForStart(createTextureSettings(), {
        name: 'Untitled texture',
        status: 'Texture Lab reset.',
      });
      store.setState({ view: { ...state().view, gallery: true } });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local-${slug(cleanName)}-${Date.now().toString(36)}`;
      let preset;
      try {
        preset = upsertLocalTexturePreset({
          id,
          label: cleanName,
          settings: createTextureSettings(state().settings),
          tags: [],
        });
      } catch (error) { return { errors: [error.message], ok: false }; }
      store.setState({ name: cleanName, presetDirty: false, presetId: id, status: `Saved “${cleanName}” to your library.` });
      persist();
      return { ok: true, preset };
    },

    updatePreset(name = state().name) {
      const current = loadLocalTexturePresets().find((entry) => entry.id === state().presetId);
      if (!current) {
        return { errors: ['Built-in textures are read-only. Use Save As to create an editable copy.'], ok: false };
      }
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['A texture name is required.'], ok: false };
      let preset;
      try {
        preset = upsertLocalTexturePreset({
          id: current.id,
          label: cleanName,
          settings: createTextureSettings(state().settings),
          tags: current.tags ?? [],
        });
      } catch (error) { return { errors: [error.message], ok: false }; }
      store.setState({
        name: cleanName,
        presetDirty: false,
        status: `Updated “${cleanName}”.`,
      });
      persist();
      return { ok: true, preset };
    },

    setAi(patch) {
      const next = { ...state().ai, ...patch };
      store.setState({ ai: next });
      const { busy, notes, ...persisted } = next;
      saveAiConfig(persisted);
    },

    setExporting(exporting) {
      store.setState({ exporting: Boolean(exporting) });
    },

    setField(group, key, value) {
      const current = state().settings;
      pushHistory(`field:${group}.${key}`);
      commit({
        presetDirty: true,
        settings: createTextureSettings({
          ...current,
          [group]: { ...current[group], [key]: value },
        }),
      });
    },

    setGen(patch) {
      store.setState({ gen: { ...state().gen, ...patch } });
    },

    /** Sets/patches/removes the image base layer (null clears it). */
    setImage(patch) {
      const current = state().settings;
      const next = patch === null ? null : { ...(current.image ?? {}), ...patch };
      pushHistory(patch === null || patch?.dataUrl ? null : 'image');
      commit({
        presetDirty: true,
        settings: createTextureSettings({ ...current, image: next }),
      }, {
        immediate: patch === null || Boolean(patch?.dataUrl),
        ...(patch === null
          ? { status: 'Removed the image base.' }
          : patch?.dataUrl ? { status: `Using “${patch.name ?? 'image'}” as the base — overlays, wear, and glow still apply.` } : {}),
      });
    },

    setName(name) {
      const next = String(name || '').trim();
      if (!next) return;
      store.setState({ name: next, presetDirty: true });
      persist();
    },

    setPreviewStyle(value) {
      const previewStyle = normalizeTexturePreviewStyle(value);
      if (previewStyle === state().view.previewStyle) return;
      store.setState({
        status: previewStyle === NEUTRAL_TEXTURE_PREVIEW_STYLE
          ? 'Previewing the exact maps with neutral PBR lighting.'
          : `Previewing the same maps through ${texturePreviewStyleLabel(previewStyle)}.`,
        view: { ...state().view, previewStyle },
      });
      const url = new URL(window.location.href);
      url.searchParams.set('texturePreviewStyle', previewStyle);
      window.history.replaceState(null, '', url);
    },

    setSeed(seed) {
      const current = state().settings;
      pushHistory('seed');
      commit({
        presetDirty: true,
        settings: createTextureSettings({ ...current, global: { seed } }),
      }, { immediate: true });
    },

    setStage(stage) {
      store.setState({ stage });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
    },

    startFromScratch() {
      replaceForStart(createTextureSettings(), {
        name: 'Untitled texture',
        status: 'Started from the neutral base material.',
      });
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
