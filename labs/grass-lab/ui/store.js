// Grass Lab store: portable grass-asset settings, preset identity, undo
// history, and independent scene-preview state. Live wind, cloud shadow, and
// interaction inputs never enter the document/history contract.

import { createStore } from '../../shared/ui/createStore.js';
import {
  DEFAULT_GRASS_SETTINGS,
  applyGrassColorPalette,
  createGrassSettings,
  getGrassPresetOptions,
  sanitizeGrassPresetSettings,
} from '../../../src/vegetation/stylizedGrass.js';
import {
  createGrassPresetDocument,
  deleteLocalGrassPreset,
  loadLocalGrassPresets,
  parseGrassPresetDocument,
  serializeGrassPreset,
  upsertLocalGrassPresetDocument,
} from '../grassPresetStore.js';
import { isProtectedSystemStyleId } from '../../../src/core/systemStylePolicy.js';

const DOCUMENT_STORAGE_KEY = 'toonlab.grassLab.document.v1';
const VIEW_STORAGE_KEY = 'toonlab.grassLab.preview.v1';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'grass').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function loadDocument() {
  try {
    const raw = window.localStorage?.getItem(DOCUMENT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveDocumentLocal(document) {
  try {
    window.localStorage?.setItem(DOCUMENT_STORAGE_KEY, JSON.stringify(document));
  } catch {
    // ignore
  }
}

function clearDocumentLocal() {
  try {
    window.localStorage?.removeItem(DOCUMENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

function loadViewLocal() {
  try {
    const raw = window.localStorage?.getItem(VIEW_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveViewLocal(view) {
  try {
    window.localStorage?.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  } catch {
    // Preview preferences are optional when browser storage is unavailable.
  }
}

function presetLabel(id) {
  return [...getGrassPresetOptions()].find((entry) => (entry.value ?? entry.id) === id)?.label ?? id;
}

function authoredGrassSettings(input = {}, { migrateLegacySceneWind = false } = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input)
    ? { ...input }
    : input;
  if (migrateLegacySceneWind && source && typeof source === 'object'
    && source.windResponse === undefined && Number.isFinite(Number(source.windStrength))) {
    source.windResponse = Math.max(Number(source.windStrength), 0)
      / DEFAULT_GRASS_SETTINGS.windStrength;
  }
  return sanitizeGrassPresetSettings(createGrassSettings(source));
}

function bootDocument(urlParams) {
  const savedView = loadViewLocal();
  const requestedPreset = urlParams.get('grassPreset');
  if (requestedPreset) {
    return {
      bootSource: 'deep-link',
      mode: 'patch',
      name: presetLabel(requestedPreset),
      presetId: requestedPreset,
      settings: authoredGrassSettings({ preset: requestedPreset }),
      view: savedView ?? {},
    };
  }
  const saved = loadDocument();
  if (saved?.settings) {
    return {
      bootSource: 'persisted',
      mode: saved.mode ?? 'patch',
      name: saved.name || 'Untitled grass',
      presetId: saved.presetId ?? null,
      settings: authoredGrassSettings(saved.settings, { migrateLegacySceneWind: true }),
      view: savedView ?? saved.view ?? {},
    };
  }
  const preset = 'call_me_sensei_clump';
  return {
    bootSource: 'fresh',
    mode: 'patch',
    name: presetLabel(preset),
    presetId: preset,
    settings: authoredGrassSettings({ preset }),
    view: savedView ?? {},
  };
}

export function createGrassLabStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const localPresets = loadLocalGrassPresets();
  const boot = bootDocument(urlParams);
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bladeCount: 0,
    clumpCount: 0,
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    status: boot.bootSource === 'persisted' ? 'Restored your last grass.' : '',
    view: {
      ambientIntensity: 0.5,
      cloudShadowCoverage: DEFAULT_GRASS_SETTINGS.cloudShadowCoverage,
      cloudShadowScale: DEFAULT_GRASS_SETTINGS.cloudShadowScale,
      cloudShadowStrength: DEFAULT_GRASS_SETTINGS.cloudShadowStrength,
      cloudShadowVelocity: [...DEFAULT_GRASS_SETTINGS.cloudShadowVelocity],
      gustFrequency: DEFAULT_GRASS_SETTINGS.gustFrequency,
      gustSpeed: DEFAULT_GRASS_SETTINGS.gustSpeed,
      pushRadius: DEFAULT_GRASS_SETTINGS.pushRadius,
      sunIntensity: 1.2,
      walkPreview: false,
      windDirection: [...DEFAULT_GRASS_SETTINGS.windDirection],
      windSpeed: DEFAULT_GRASS_SETTINGS.windSpeed,
      windStrength: DEFAULT_GRASS_SETTINGS.windStrength,
      ...boot.view,
      cameraMode: ['rotate', 'pan', 'zoom'].includes(boot.view?.cameraMode)
        ? boot.view.cameraMode
        : 'rotate',
      // Every ordinary visit asks whether to continue, create, or open. An
      // explicit preset deep link is already an answer and opens directly.
      entryChooser: boot.bootSource !== 'deep-link',
      mode: boot.view?.mode ?? boot.mode,
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
    saveDocumentLocal({
      name: state().name,
      presetId: state().presetId,
      settings: state().settings,
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
    commit({ ...document, settings: authoredGrassSettings(document.settings) }, { status: 'History restored.' });
  }

  function replaceForStart(settings, { name, presetId = null, status }) {
    pushHistory();
    store.setState({ name, presetDirty: false, presetId });
    commit({ settings: authoredGrassSettings(settings) }, { status });
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(id) {
      replaceForStart(authoredGrassSettings({ preset: id }), {
        name: presetLabel(id),
        presetId: id,
        status: `Opened ${presetLabel(id)}.`,
      });
      return true;
    },

    applyColorPalette(palette) {
      let settings;
      try {
        settings = authoredGrassSettings(applyGrassColorPalette(state().settings, palette));
      } catch (error) {
        store.setState({ status: error.message });
        return false;
      }
      const unchanged = ['baseColor', 'tipColor', 'shadowTint'].every((key) =>
        JSON.stringify(settings[key]) === JSON.stringify(state().settings[key]));
      if (unchanged) {
        store.setState({ status: `${palette.label} is already active.` });
        return true;
      }
      pushHistory();
      commit({
        presetDirty: true,
        settings,
      }, {
        status: `Applied ${palette.label}. Base, tip, and shadow tint updated together.`,
      });
      return true;
    },

    deletePreset(id) {
      if (isProtectedSystemStyleId(id)
        || !state().localPresets.some((entry) => entry.id === id)) return false;
      try { deleteLocalGrassPreset(id); }
      catch (error) { store.setState({ status: error.message }); return false; }
      if (state().presetId === id) store.setState({
        localPresets: loadLocalGrassPresets(),
        name: presetLabel('call_me_sensei_clump'),
        presetDirty: false,
        presetId: 'call_me_sensei_clump',
        settings: authoredGrassSettings({ preset: 'call_me_sensei_clump' }),
        status: 'Saved grass deleted. Call Me Sensei Clump restored.',
      });
      else store.setState({ localPresets: loadLocalGrassPresets() });
      persist();
      return true;
    },

    exportDocument() {
      return serializeGrassPreset(slug(state().name), {
        label: state().name,
        settings: state().settings,
      });
    },

    importDocument(text) {
      const result = parseGrassPresetDocument(text);
      if (!result.ok) return result;
      replaceForStart(result.value.settings, {
        name: result.value.label || 'Imported grass',
        status: `Imported ${result.value.label || 'grass preset'}.`,
      });
      return result;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearDocumentLocal();
      replaceForStart(authoredGrassSettings({ preset: 'call_me_sensei_clump' }), {
        name: presetLabel('call_me_sensei_clump'),
        presetId: 'call_me_sensei_clump',
        status: 'Grass Lab reset.',
      });
      // Creating/resetting is a document boundary: history must not lead back
      // into the previous draft.
      undoStack.length = 0;
      redoStack.length = 0;
      updateHistoryFlags();
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      try {
        upsertLocalGrassPresetDocument(createGrassPresetDocument(id, {
          label: cleanName,
          settings: state().settings,
        }));
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalGrassPresets(),
        name: cleanName,
        presetDirty: false,
        presetId: id,
        status: `Saved “${cleanName}” to your presets.`,
      });
      persist();
      return { ok: true };
    },

    updatePreset() {
      const local = state().localPresets.find(({ id }) => id === state().presetId);
      if (!local) {
        return { errors: ['Choose a saved local grass asset before updating.'], ok: false };
      }
      try {
        upsertLocalGrassPresetDocument(createGrassPresetDocument(local.id, {
          label: state().name || local.label,
          settings: state().settings,
        }));
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalGrassPresets(),
        presetDirty: false,
        status: `Updated “${state().name || local.label}”.`,
      });
      persist();
      return { ok: true };
    },

    /** Single schema-field edit (grass settings are flat). */
    setSetting(key, value) {
      pushHistory(`setting:${key}`);
      commit({
        presetDirty: true,
        settings: authoredGrassSettings({ ...state().settings, [key]: value }),
      });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
      saveViewLocal(state().view);
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
