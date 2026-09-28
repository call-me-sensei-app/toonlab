// Rock shader authoring state. Preview fixture selection stays outside the
// portable shader document, just as procedural geometry stays outside it.

import { createStore } from '../../shared/ui/createStore.js';
import {
  createRockShaderPresetDocument,
  createRockShaderSettings,
  getRockShaderPresetOptions,
  parseRockShaderPresetDocument,
  serializeRockShaderPreset,
} from '../../../src/rock-shader/index.js';
import {
  createShaderPreviewSettings,
  DEFAULT_SHADER_PREVIEW_SETTINGS,
} from '../../shared/shader-preview/previewStyles.js';
import { serializeSingleSlotStyleBundle } from '../../shared/runtimeStyleBundle.js';
import { isProtectedSystemStyleId } from '../../../src/core/systemStylePolicy.js';

export const ROCK_SHADER_DRAFT_STORAGE_KEY = 'toonlab.rockShaderDraft.v2';
export const ROCK_SHADER_LIBRARY_STORAGE_KEY = 'toonlab.rockShaderLibrary.v1';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'rock-shader').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'rock_shader';
}

function presetLabel(id) {
  return getRockShaderPresetOptions()
    .find((entry) => entry.value === id)?.label ?? id;
}

function readDraft() {
  try {
    const value = window.localStorage?.getItem(ROCK_SHADER_DRAFT_STORAGE_KEY);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeDraft(value) {
  try {
    window.localStorage?.setItem(ROCK_SHADER_DRAFT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Authoring remains available when browser persistence is unavailable.
  }
}

function clearDraft() {
  try {
    window.localStorage?.removeItem(ROCK_SHADER_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore browser storage failures.
  }
}

function readLibrary() {
  try {
    const source = JSON.parse(window.localStorage?.getItem(ROCK_SHADER_LIBRARY_STORAGE_KEY) ?? '[]');
    if (!Array.isArray(source)) return [];
    return source.filter((entry) => (
      entry && typeof entry.id === 'string' && typeof entry.document === 'string'
      && !isProtectedSystemStyleId(entry.id)
    )).sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
  } catch {
    return [];
  }
}

function writeLibrary(entries) {
  try {
    window.localStorage?.setItem(ROCK_SHADER_LIBRARY_STORAGE_KEY, JSON.stringify(entries));
    return true;
  } catch {
    return false;
  }
}

function bootDocument(urlParams) {
  const linkedPreset = urlParams.get('rockShader');
  if (linkedPreset) {
    return {
      name: presetLabel(linkedPreset),
      presetId: linkedPreset,
      settings: createRockShaderSettings({ preset: linkedPreset }),
    };
  }
  const saved = readDraft();
  if (saved?.settings) {
    return {
      name: saved.name || 'Untitled rock shader',
      presetId: saved.presetId ?? null,
      settings: createRockShaderSettings(saved.settings),
      selectedStyleId: saved.selectedStyleId ?? null,
      view: saved.view,
    };
  }
  return {
    name: presetLabel('call_me_sensei'),
    presetId: 'call_me_sensei',
    settings: createRockShaderSettings({ preset: 'call_me_sensei' }),
  };
}

export function createRockShaderLabStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const boot = bootDocument(urlParams);
  const entryChooserOpen = !urlParams.has('rockShader')
    && !urlParams.has('previewBundle')
    && !urlParams.has('previewScene')
    && urlParams.get('editor') !== '1'
    && urlParams.get('hud') !== '0';
  const requestedFixture = String(boot.view?.fixture ?? '');
  const fixture = /^spire-0[1-8]$/.test(requestedFixture)
    ? requestedFixture
    : 'spire-05';
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    canRedo: false,
    canUndo: false,
    coverage: { applied: 0, matched: 0, skipped: 0 },
    docRevision: 0,
    entryChooserOpen,
    name: boot.name,
    library: readLibrary(),
    presetDirty: false,
    presetId: boot.presetId,
    previewAutoCycle: false,
    previewHour: 13,
    preview: createShaderPreviewSettings({
      bundle: urlParams.get('previewBundle')
        ?? DEFAULT_SHADER_PREVIEW_SETTINGS.bundle,
      scenePreset: urlParams.get('previewScene')
        ?? DEFAULT_SHADER_PREVIEW_SETTINGS.scenePreset,
    }),
    settings: boot.settings,
    selectedStyleId: boot.selectedStyleId ?? null,
    status: '',
    view: {
      fixture,
      ...boot.view,
      fixture,
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
    writeDraft({
      name: state().name,
      presetId: state().presetId,
      selectedStyleId: state().selectedStyleId,
      settings: state().settings,
      view: state().view,
    });
  }

  function updateHistoryFlags() {
    store.setState({ canRedo: redoStack.length > 0, canUndo: undoStack.length > 0 });
  }

  function pushHistory(key = null) {
    const now = Date.now();
    if (key && key === lastHistoryKey && now - lastHistoryTime < HISTORY_COALESCE_MS) {
      lastHistoryTime = now;
      return;
    }
    undoStack.push(snapshot());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
    lastHistoryKey = key;
    lastHistoryTime = now;
  }

  function commit(patch, status = null) {
    store.setState((previous) => ({
      ...patch,
      docRevision: previous.docRevision + 1,
      ...(status === null ? {} : { status }),
    }));
    persist();
    updateHistoryFlags();
  }

  function replace(settings, { name, presetId = null, status }) {
    pushHistory();
    commit({
      name,
      presetDirty: false,
      presetId,
      selectedStyleId: null,
      settings: createRockShaderSettings(settings),
    }, status);
  }

  function currentDocument() {
    return createRockShaderPresetDocument(slug(state().name), {
      label: state().name,
      settings: state().settings,
    });
  }

  function restore(entry, destination) {
    // An undo/redo boundary must end the previous slider gesture.
    lastHistoryKey = null;
    lastHistoryTime = 0;
    destination.push(snapshot());
    const restored = JSON.parse(entry);
    commit({
      ...restored,
      settings: createRockShaderSettings(restored.settings),
    }, 'History restored.');
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(id) {
      replace({ preset: id }, {
        name: presetLabel(id),
        presetId: id,
        status: `Opened ${presetLabel(id)}.`,
      });
    },

    exportDocument() {
      return serializeRockShaderPreset(currentDocument());
    },

    exportStyleBundle() {
      return serializeSingleSlotStyleBundle({
        description: `${state().name} rock treatment exported from Rock Shader Lab.`,
        label: state().name,
        slotId: 'rock',
        styleDocument: currentDocument(),
      });
    },

    importDocument(text) {
      const result = parseRockShaderPresetDocument(text);
      if (!result.ok) return result;
      replace(result.value.settings, {
        name: result.value.label,
        status: `Imported ${result.value.label}.`,
      });
      return result;
    },

    loadStyle(id) {
      if (isProtectedSystemStyleId(id)) return false;
      const entry = state().library.find((candidate) => candidate.id === id);
      if (!entry) return false;
      const result = parseRockShaderPresetDocument(entry.document);
      if (!result.ok) {
        store.setState({ status: `Could not open “${entry.name}”.` });
        return false;
      }
      pushHistory();
      commit({
        name: result.value.label,
        presetDirty: false,
        presetId: null,
        selectedStyleId: entry.id,
        settings: result.value.settings,
      }, `Opened saved style “${entry.name}”.`);
      return true;
    },

    deleteStyle() {
      const id = state().selectedStyleId;
      if (!id || isProtectedSystemStyleId(id)
        || !state().library.some((entry) => entry.id === id)) return false;
      const library = state().library.filter((entry) => entry.id !== id);
      if (!writeLibrary(library)) return false;
      store.setState({ library });
      replace({ preset: 'call_me_sensei' }, {
        name: presetLabel('call_me_sensei'),
        presetId: 'call_me_sensei',
        status: 'Saved style deleted. Call Me Sensei restored.',
      });
      return true;
    },

    saveStyle() {
      if (!state().selectedStyleId
        || isProtectedSystemStyleId(state().selectedStyleId)
        || !state().library.some((entry) => entry.id === state().selectedStyleId)) {
        return store.actions.saveStyleAs(state().name);
      }
      const now = new Date().toISOString();
      const entry = {
        document: serializeRockShaderPreset(currentDocument()),
        id: state().selectedStyleId,
        name: state().name,
        updatedAt: now,
      };
      const library = [entry, ...state().library.filter((candidate) => candidate.id !== entry.id)];
      if (!writeLibrary(library)) return false;
      store.setState({ library, presetDirty: false, status: `Updated “${entry.name}”.` });
      persist();
      return true;
    },

    saveStyleAs(value = state().name) {
      const name = String(value ?? '').trim();
      if (!name) return false;
      const originalName = state().name;
      store.setState({ name });
      const entry = {
        document: serializeRockShaderPreset(currentDocument()),
        id: `${slug(name)}-${Date.now().toString(36)}`,
        name,
        updatedAt: new Date().toISOString(),
      };
      const library = [entry, ...state().library];
      if (!writeLibrary(library)) {
        store.setState({ name: originalName, status: 'Could not save this style.' });
        return false;
      }
      store.setState({
        library,
        presetDirty: false,
        selectedStyleId: entry.id,
        status: `Saved “${name}” as a new style.`,
      });
      persist();
      return true;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearDraft();
      replace({ preset: 'call_me_sensei' }, {
        name: presetLabel('call_me_sensei'),
        presetId: 'call_me_sensei',
        status: 'Rock Shader Lab reset.',
      });
      store.setState({
        preview: createShaderPreviewSettings(DEFAULT_SHADER_PREVIEW_SETTINGS),
        previewAutoCycle: false,
        previewHour: 13,
        view: { ...state().view, fixture: 'spire-05' },
      });
    },

    resetPreviewSettings() {
      store.setState({
        preview: createShaderPreviewSettings(DEFAULT_SHADER_PREVIEW_SETTINGS),
        previewAutoCycle: false,
        previewHour: 13,
        view: { ...state().view, fixture: 'spire-05' },
      });
    },

    setName(name) {
      const clean = String(name || '').trim();
      if (!clean) return;
      store.setState({ name: clean });
      persist();
    },

    setEntryChooserOpen(entryChooserOpen) {
      store.setState({ entryChooserOpen: Boolean(entryChooserOpen) });
    },

    setSetting(groupId, key, value) {
      pushHistory(`setting:${groupId}.${key}`);
      commit({
        presetDirty: true,
        settings: createRockShaderSettings({
          ...state().settings,
          [groupId]: { ...state().settings[groupId], [key]: value },
        }),
      });
    },

    setPreviewAutoCycle(previewAutoCycle) {
      store.setState({ previewAutoCycle: Boolean(previewAutoCycle) });
    },

    setPreviewHour(previewHour) {
      const value = Number(previewHour);
      if (!Number.isFinite(value)) return;
      store.setState({ previewHour: ((value % 24) + 24) % 24 });
    },

    setPreviewBundle(bundle) {
      store.setState({
        preview: createShaderPreviewSettings({ ...state().preview, bundle }),
      });
    },

    setPreviewComponentStyle(componentId, style) {
      store.setState({
        preview: createShaderPreviewSettings({
          ...state().preview,
          componentStyles: {
            ...state().preview.componentStyles,
            [componentId]: style,
          },
        }),
      });
    },

    setPreviewComponentVisible(componentId, visible) {
      store.setState({
        preview: createShaderPreviewSettings({
          ...state().preview,
          componentVisibility: {
            ...state().preview.componentVisibility,
            [componentId]: Boolean(visible),
          },
        }),
      });
    },

    setPreviewScenePreset(scenePreset) {
      store.setState({
        preview: createShaderPreviewSettings({
          ...state().preview,
          scenePreset,
        }),
      });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
      persist();
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
