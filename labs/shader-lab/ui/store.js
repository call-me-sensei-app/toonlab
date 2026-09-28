// Character Shader Lab store: toon settings document (nested group settings from
// createToonSettings), preset identity, undo history, persistence, and view
// state (walk preview / idle animation / model url). Same store->engine
// contract as the other redesigned labs: docRevision bumps on every settings
// change and the engine re-applies materials.

import { createStore } from '../../shared/ui/createStore.js';
import {
  createToonPresetDocument,
  createToonSettings,
  getToonPresetOptions,
  parseToonPresetDocument,
  sanitizeToonPresetSettings,
} from '../../../src/toon/toonMaterialAdapter.js';
import {
  deleteLocalToonPreset,
  loadLocalToonPresets,
  upsertLocalToonPresetDocument,
} from '../toonPresetStore.js';
import { DEFAULT_MODEL_URL } from '../modelDefaults.js';
import { withToonGroupValue } from '../../shared/toonSettingFields.js';
import { resolveCharacterShaderBoot } from './characterShaderBoot.js';
import { serializeSingleSlotStyleBundle } from '../../shared/runtimeStyleBundle.js';
import { isProtectedSystemStyleId } from '../../../src/core/systemStylePolicy.js';

// Autosaved draft of the open look. The key names the settings schema the
// draft was written with; a draft of another schema is not restored.
const DOCUMENT_STORAGE_KEY = 'toonlab.characterShader.document.v2';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'toon').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function loadDocument() {
  try {
    const raw = window.localStorage?.getItem(DOCUMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDocument(document) {
  try {
    window.localStorage?.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // Private modes may reject storage — the lab keeps working unsaved.
  }
}

function clearDocument() {
  try {
    window.localStorage?.removeItem(DOCUMENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function bootDocument(urlParams) {
  return resolveCharacterShaderBoot({
    defaultModelUrl: DEFAULT_MODEL_URL,
    savedDocument: loadDocument(),
    urlParams,
  });
}

export function createCharacterShaderStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const localPresets = loadLocalToonPresets(); // registers them for createToonSettings
  const boot = bootDocument(urlParams);
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    animate: true,
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    convertedMeshCount: 0,
    docRevision: 0,
    hasClips: false,
    hasLocomotion: false,
    localPresets,
    modelMtl: boot.modelMtl ?? null,
    modelUrl: boot.modelUrl,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    status: boot.bootSource === 'persisted' ? 'Restored your last look.' : '',
    walkPreview: false,
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: sanitizeToonPresetSettings(state().settings),
  });

  function currentPresetDocument(id = state().presetId, label = state().name) {
    return createToonPresetDocument(id || slug(label), {
      label,
      settings: sanitizeToonPresetSettings(state().settings),
    });
  }

  function persist() {
    saveDocument({
      modelMtl: state().modelMtl,
      modelUrl: state().modelUrl,
      name: state().name,
      presetId: state().presetId,
      settings: sanitizeToonPresetSettings(state().settings),
    });
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

  function commit(patch, { status = null } = {}) {
    store.setState((previous) => ({
      ...patch,
      docRevision: previous.docRevision + 1,
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
      settings: createToonSettings({ preset: document.presetId ?? undefined, ...document.settings }),
    }, { status: 'History restored.' });
  }

  function replaceForStart(settings, { name, presetId = null, status }) {
    pushHistory();
    store.setState({ name, presetDirty: false, presetId });
    commit({ settings }, { status });
  }

  store.actions = {
    /** Engine feedback after a model load / toon conversion. */
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(id) {
      const settings = createToonSettings({ preset: id });
      const known = settings.preset === id;
      replaceForStart(settings, {
        name: settings.presetLabel || id,
        presetId: settings.preset,
        status: `Opened ${settings.presetLabel || id}.`,
      });
      return known;
    },

    deletePreset(id) {
      if (isProtectedSystemStyleId(id)) return false;
      try { deleteLocalToonPreset(id); }
      catch (error) { store.setState({ status: error.message }); return false; }
      if (state().presetId === id) {
        const settings = createToonSettings({ preset: 'call_me_sensei' });
        store.setState({
          localPresets: loadLocalToonPresets(),
          name: settings.presetLabel,
          presetDirty: false,
          presetId: 'call_me_sensei',
          settings,
          status: 'Saved style deleted. Call Me Sensei restored.',
        });
      } else store.setState({
        localPresets: loadLocalToonPresets(),
      });
      persist();
      return true;
    },

    exportDocument() {
      return JSON.stringify(currentPresetDocument(slug(state().name)), null, 2);
    },

    exportStyleBundle() {
      return serializeSingleSlotStyleBundle({
        description: 'Character and creature shader style exported from Character Shader Lab.',
        label: state().name,
        slotId: 'toon',
        styleDocument: currentPresetDocument(slug(state().name)),
      });
    },

    importDocument(text) {
      const result = parseToonPresetDocument(text);
      if (!result.ok) return result;
      replaceForStart(createToonSettings(result.value.settings ?? {}), {
        name: result.value.label || 'Imported look',
        status: `Imported ${result.value.label || 'toon preset'}.`,
      });
      return result;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearDocument();
      const settings = createToonSettings({ preset: 'call_me_sensei' });
      replaceForStart(settings, {
        name: settings.presetLabel || 'Untitled look',
        presetId: settings.preset ?? null,
        status: 'Character Shader Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      let presetDocument;
      try {
        presetDocument = createToonPresetDocument(id, {
          label: cleanName,
          settings: sanitizeToonPresetSettings(state().settings),
        });
        upsertLocalToonPresetDocument(presetDocument);
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalToonPresets(),
        name: cleanName,
        presetDirty: false,
        presetId: id,
        status: `Saved “${cleanName}” to your presets.`,
      });
      persist();
      return { ok: true };
    },

    updatePreset(name = state().name) {
      const id = state().presetId;
      if (!state().localPresets.some((entry) => entry.id === id)) {
        return { errors: ['Built-in styles are read-only. Use Save As to create an editable copy.'], ok: false };
      }
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['A style name is required.'], ok: false };
      try {
        upsertLocalToonPresetDocument(currentPresetDocument(id, cleanName));
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalToonPresets(),
        name: cleanName,
        presetDirty: false,
        status: `Updated “${cleanName}”.`,
      });
      persist();
      return { ok: true };
    },

    setAnimate(animate) {
      store.setState({ animate: Boolean(animate) });
    },

    /** mtl: explicit material file for OBJ models (null otherwise). */
    setModel(url, mtl = null) {
      if (!url || url === state().modelUrl) return;
      store.setState({ modelMtl: mtl || null, modelUrl: url });
      persist();
    },

    /** Single schema-field edit: a group id and the field's dotted key (`'cameraLight.strength'`). */
    setSetting(groupId, key, value) {
      const current = state().settings;
      pushHistory(`setting:${groupId}.${key}`);
      commit({
        presetDirty: true,
        settings: createToonSettings({
          ...current,
          [groupId]: withToonGroupValue(current[groupId], key, value),
        }),
      });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setWalkPreview(walkPreview) {
      store.setState({ walkPreview: Boolean(walkPreview) });
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}

export function getBuiltInToonPresetOptions() {
  return getToonPresetOptions();
}
