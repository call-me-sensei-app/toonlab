import { writeRequiredLocalJson } from '../../shared/browserStorage.js';
import { createStore } from '../../shared/ui/createStore.js';
import {
  createGroundShaderPresetDocument,
  createGroundShaderSettings,
  getGroundShaderPresetOptions,
  parseGroundShaderPresetDocument,
  serializeGroundShaderPreset,
} from '../../../src/ground-shader/index.js';
import { serializeSingleSlotStyleBundle } from '../../shared/runtimeStyleBundle.js';
import {
  assertUserStyleId,
  isProtectedSystemStyleId,
} from '../../../src/core/systemStylePolicy.js';
import {
  createShaderPreviewSettings,
  DEFAULT_SHADER_PREVIEW_SETTINGS,
} from '../../shared/shader-preview/previewStyles.js';

export const GROUND_SHADER_DRAFT_STORAGE_KEY = 'toonlab.groundShaderDraft.v2';
export const GROUND_SHADER_LIBRARY_STORAGE_KEY = 'toonlab.groundShaderLibrary.v1';
const LOCAL_STYLE_LIMIT = 80;
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'ground-shader').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'ground_shader';
}

function presetLabel(id) {
  return getGroundShaderPresetOptions()
    .find((entry) => entry.value === id)?.label ?? id;
}

function readDraft() {
  try {
    const raw = window.localStorage?.getItem(GROUND_SHADER_DRAFT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(value) {
  try {
    window.localStorage?.setItem(GROUND_SHADER_DRAFT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Authoring remains available without browser persistence.
  }
}

function clearDraft() {
  try {
    window.localStorage?.removeItem(GROUND_SHADER_DRAFT_STORAGE_KEY);
  } catch {
    // Ignore unavailable browser storage.
  }
}

function readLocalStyles() {
  try {
    const raw = window.localStorage?.getItem(GROUND_SHADER_LIBRARY_STORAGE_KEY);
    const entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) return [];
    return entries
      .map((entry) => parseGroundShaderPresetDocument(entry))
      .filter((result) => result.ok)
      .map((result) => result.value)
      .filter((entry) => !isProtectedSystemStyleId(entry.id))
      .sort((a, b) => a.label.localeCompare(b.label));
  } catch {
    return [];
  }
}

function writeLocalStyles(entries) {
  writeRequiredLocalJson(GROUND_SHADER_LIBRARY_STORAGE_KEY, entries.slice(0, LOCAL_STYLE_LIMIT));
}

function upsertLocalStyle(document) {
  const parsed = parseGroundShaderPresetDocument(document);
  if (!parsed.ok) throw new Error(parsed.errors.join(' '));
  assertUserStyleId(parsed.value.id);
  const next = readLocalStyles().filter((entry) => entry.id !== parsed.value.id);
  next.push(parsed.value);
  next.sort((a, b) => a.label.localeCompare(b.label));
  writeLocalStyles(next);
  return parsed.value;
}

function deleteLocalStyle(id) {
  if (isProtectedSystemStyleId(id)) return false;
  writeLocalStyles(readLocalStyles().filter((entry) => entry.id !== id));
  return true;
}

function bootDocument(urlParams) {
  const linked = urlParams.get('groundShader');
  if (linked) {
    return {
      name: presetLabel(linked),
      presetId: linked,
      settings: createGroundShaderSettings({ preset: linked }),
    };
  }
  const saved = readDraft();
  if (saved?.settings) {
    return {
      name: saved.name || 'Untitled Ground Shader',
      presetId: saved.presetId ?? null,
      settings: createGroundShaderSettings(saved.settings),
      view: saved.view,
    };
  }
  return {
    name: presetLabel('call_me_sensei'),
    presetId: 'call_me_sensei',
    settings: createGroundShaderSettings({ preset: 'call_me_sensei' }),
  };
}

export function createGroundShaderLabStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const boot = bootDocument(urlParams);
  const entryChooserOpen = !urlParams.has('groundShader')
    && !urlParams.has('previewBundle')
    && !urlParams.has('previewScene')
    && urlParams.get('editor') !== '1'
    && urlParams.get('hud') !== '0';
  const localPresets = readLocalStyles();
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const requestedViewMode = boot.view?.viewMode;
  const viewMode = ['composition', 'surface', 'top'].includes(requestedViewMode)
    ? requestedViewMode
    : 'composition';

  const store = createStore({
    canRedo: false,
    canUndo: false,
    coverage: { applied: 0, matched: 0, skipped: 0, writes: 0 },
    docRevision: 0,
    entryChooserOpen,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    printCount: 0,
    previewAutoCycle: false,
    previewHour: 13,
    preview: createShaderPreviewSettings({
      bundle: urlParams.get('previewBundle')
        ?? DEFAULT_SHADER_PREVIEW_SETTINGS.bundle,
      scenePreset: urlParams.get('previewScene')
        ?? DEFAULT_SHADER_PREVIEW_SETTINGS.scenePreset,
    }),
    settings: boot.settings,
    status: '',
    view: {
      printShape: 'boot',
      printsVisible: true,
      snowCover: 0,
      wetness: 0,
      ...boot.view,
      viewMode,
    },
  });
  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
  });

  function currentDocument(id = state().presetId, label = state().name) {
    return createGroundShaderPresetDocument(id || slug(label), {
      label,
      settings: state().settings,
    });
  }

  function persist() {
    writeDraft({
      name: state().name,
      presetId: state().presetId,
      settings: state().settings,
      view: state().view,
    });
  }

  function updateHistoryFlags() {
    store.setState({ canRedo: redoStack.length > 0, canUndo: undoStack.length > 0 });
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
      settings: createGroundShaderSettings(settings),
    }, status);
  }

  function restore(entry, destination) {
    // An undo/redo boundary must end the previous slider gesture.
    lastHistoryKey = null;
    lastHistoryTime = 0;
    destination.push(snapshot());
    const restored = JSON.parse(entry);
    commit({
      ...restored,
      settings: createGroundShaderSettings(restored.settings),
    }, 'History restored.');
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },
    applyPreset(id) {
      const local = state().localPresets.find((entry) => entry.id === id);
      const label = local?.label ?? presetLabel(id);
      replace(local?.settings ?? { preset: id }, {
        name: label,
        presetId: id,
        status: `Opened ${label}.`,
      });
    },
    deleteStyle(id) {
      if (isProtectedSystemStyleId(id)
        || !state().localPresets.some((entry) => entry.id === id)) return false;
      try { deleteLocalStyle(id); }
      catch (error) { store.setState({ status: error.message }); return false; }
      store.setState({
        localPresets: readLocalStyles(),
        ...(state().presetId === id ? {
          name: presetLabel('call_me_sensei'),
          presetDirty: false,
          presetId: 'call_me_sensei',
          settings: createGroundShaderSettings({ preset: 'call_me_sensei' }),
          status: 'Saved style deleted. Call Me Sensei restored.',
        } : {}),
      });
      persist();
      return true;
    },
    exportDocument() {
      return serializeGroundShaderPreset(currentDocument(slug(state().name)));
    },
    exportStyleBundle() {
      return serializeSingleSlotStyleBundle({
        description: 'Terrain and ground shader style exported from Ground Shader Lab.',
        label: state().name,
        slotId: 'groundShader',
        styleDocument: currentDocument(slug(state().name)),
      });
    },
    importDocument(text) {
      const result = parseGroundShaderPresetDocument(text);
      if (!result.ok) return result;
      replace(result.value.settings, {
        name: result.value.label,
        status: `Imported ${result.value.label}.`,
      });
      return result;
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
        status: 'Ground Shader Lab reset.',
      });
      store.setState({
        preview: createShaderPreviewSettings(DEFAULT_SHADER_PREVIEW_SETTINGS),
        previewAutoCycle: false,
        previewHour: 13,
        view: {
          printShape: 'boot',
          printsVisible: true,
          snowCover: 0,
          viewMode: 'composition',
          wetness: 0,
        },
      });
    },
    setName(name) {
      const clean = String(name || '').trim();
      if (!clean) return;
      store.setState({ name: clean, presetDirty: true });
      persist();
    },
    saveStyleAs(name) {
      const clean = String(name || '').trim();
      if (!clean) return { errors: ['A style name is required.'], ok: false };
      const id = `local_${slug(clean)}_${Date.now().toString(36)}`;
      try {
        upsertLocalStyle(currentDocument(id, clean));
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: readLocalStyles(),
        name: clean,
        presetDirty: false,
        presetId: id,
        status: `Saved “${clean}”.`,
      });
      persist();
      return { ok: true };
    },
    updateStyle(name = state().name) {
      const id = state().presetId;
      if (!state().localPresets.some((entry) => entry.id === id)) {
        return { errors: ['Built-in styles are read-only. Use Save As to create an editable copy.'], ok: false };
      }
      const clean = String(name || '').trim();
      if (!clean) return { errors: ['A style name is required.'], ok: false };
      try {
        upsertLocalStyle(currentDocument(id, clean));
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: readLocalStyles(),
        name: clean,
        presetDirty: false,
        status: `Updated “${clean}”.`,
      });
      persist();
      return { ok: true };
    },
    setPreviewAutoCycle(previewAutoCycle) {
      store.setState({ previewAutoCycle: Boolean(previewAutoCycle) });
    },
    setPreviewHour(previewHour) {
      const value = Number(previewHour);
      if (!Number.isFinite(value)) return;
      store.setState({ previewHour: ((value % 24) + 24) % 24 });
    },
    resetPreviewSettings() {
      store.setState({
        preview: createShaderPreviewSettings(DEFAULT_SHADER_PREVIEW_SETTINGS),
        previewAutoCycle: false,
        previewHour: 13,
        view: { ...state().view, viewMode: 'composition' },
      });
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
    setSetting(groupId, key, value) {
      pushHistory(`setting:${groupId}.${key}`);
      commit({
        presetDirty: true,
        settings: createGroundShaderSettings({
          ...state().settings,
          [groupId]: { ...state().settings[groupId], [key]: value },
        }),
      });
    },
    setEntryChooserOpen(entryChooserOpen) {
      store.setState({ entryChooserOpen: Boolean(entryChooserOpen) });
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
