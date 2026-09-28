import { createStore } from '../../shared/ui/index.js';
import {
  DEFAULT_ATMOSPHERIC_CONDITION_SET,
  createAtmosphericConditionDocument,
  createAtmosphericConditionSettings,
  getAtmosphericConditionOptions,
  parseAtmosphericConditionDocument,
  serializeAtmosphericConditionDocument,
} from '../../../src/atmospheric-condition/index.js';

export const ATMOSPHERIC_CONDITION_DRAFT_STORAGE_KEY =
  'toonlab.atmosphericConditionLab.document.v1';

const HISTORY_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'atmospheric-condition').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    || 'atmospheric_condition';
}

function conditionLabel(id) {
  return getAtmosphericConditionOptions()
    .find((entry) => entry.id === id)?.label ?? id;
}

function readDraft() {
  try {
    const value = window.localStorage?.getItem(
      ATMOSPHERIC_CONDITION_DRAFT_STORAGE_KEY,
    );
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function writeDraft(value) {
  try {
    window.localStorage?.setItem(
      ATMOSPHERIC_CONDITION_DRAFT_STORAGE_KEY,
      JSON.stringify(value),
    );
  } catch {
    // Editing remains usable when local persistence is unavailable.
  }
}

function clearDraft() {
  try {
    window.localStorage?.removeItem(
      ATMOSPHERIC_CONDITION_DRAFT_STORAGE_KEY,
    );
  } catch {
    // Ignore browser storage failures.
  }
}

function replaceAtPath(source, path, value) {
  const output = structuredClone(source);
  const parts = String(path).split('.');
  let cursor = output;
  for (let index = 0; index < parts.length - 1; index += 1) {
    cursor = cursor[parts[index]];
  }
  cursor[parts.at(-1)] = structuredClone(value);
  return output;
}

function bootDocument(urlParams) {
  const requested = urlParams.get('atmosphericCondition')
    ?? urlParams.get('condition');
  const known = getAtmosphericConditionOptions()
    .some((entry) => entry.id === requested);
  if (known) {
    return {
      conditionId: requested,
      name: conditionLabel(requested),
      setId: DEFAULT_ATMOSPHERIC_CONDITION_SET,
      settings: createAtmosphericConditionSettings(requested),
    };
  }
  const draft = readDraft();
  if (draft?.settings) {
    return {
      conditionId: draft.conditionId ?? null,
      name: draft.name || 'Untitled atmospheric condition',
      setId: draft.setId ?? DEFAULT_ATMOSPHERIC_CONDITION_SET,
      settings: createAtmosphericConditionSettings(draft.settings),
    };
  }
  return {
    conditionId: 'openSky',
    name: conditionLabel('openSky'),
    setId: DEFAULT_ATMOSPHERIC_CONDITION_SET,
    settings: createAtmosphericConditionSettings('openSky'),
  };
}

export function createAtmosphericConditionLabStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const boot = bootDocument(urlParams);
  const requestedWorkspace = urlParams.get('workspace');
  const workspaceScope = ['atmosphere', 'cloud', 'condition'].includes(
    requestedWorkspace,
  )
    ? requestedWorkspace
    : 'condition';
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    ...boot,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    engineReady: false,
    presetDirty: false,
    previewAutoCycle: false,
    previewHour: 13,
    status: '',
    workspaceScope,
    view: {
      effectsEnabled: true,
      exposure: 1,
      previewMode: 'diagnostic',
    },
  });
  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    conditionId: state().conditionId,
    name: state().name,
    presetDirty: state().presetDirty,
    setId: state().setId,
    settings: state().settings,
  });

  function persist() {
    writeDraft({
      conditionId: state().conditionId,
      name: state().name,
      setId: state().setId,
      settings: state().settings,
    });
  }

  function historyFlags() {
    store.setState({
      canRedo: redoStack.length > 0,
      canUndo: undoStack.length > 0,
    });
  }

  function pushHistory(key = null) {
    const now = Date.now();
    if (
      key
      && key === lastHistoryKey
      && now - lastHistoryTime < HISTORY_COALESCE_MS
    ) {
      lastHistoryTime = now;
      return;
    }
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
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
    historyFlags();
  }

  function restore(entry, destination) {
    destination.push(snapshot());
    const restored = JSON.parse(entry);
    commit({
      ...restored,
      settings: createAtmosphericConditionSettings(restored.settings),
    }, 'History restored.');
  }

  function replaceCondition(id, status) {
    pushHistory();
    commit({
      conditionId: id,
      name: conditionLabel(id),
      presetDirty: false,
      settings: createAtmosphericConditionSettings(id),
    }, status);
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyCondition(id) {
      replaceCondition(id, `Opened ${conditionLabel(id)}.`);
      const params = new URLSearchParams(window.location.search);
      params.set('atmosphericCondition', id);
      params.delete('condition');
      window.history.replaceState(
        null,
        '',
        `${window.location.pathname}?${params.toString()}`,
      );
    },

    exportDocument() {
      return serializeAtmosphericConditionDocument(
        createAtmosphericConditionDocument(slug(state().name), {
          label: state().name,
          set: state().setId,
          settings: state().settings,
        }),
      );
    },

    importDocument(text) {
      const result = parseAtmosphericConditionDocument(text);
      if (!result.ok) return result;
      pushHistory();
      commit({
        conditionId: null,
        name: result.value.label,
        presetDirty: true,
        setId: result.value.setId,
        settings: result.value.settings,
      }, `Imported ${result.value.label}.`);
      return result;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      historyFlags();
    },

    resetLab() {
      clearDraft();
      store.setState({
        previewAutoCycle: false,
        previewHour: 13,
        view: {
          effectsEnabled: true,
          exposure: 1,
          previewMode: 'diagnostic',
        },
      });
      replaceCondition('openSky', 'Atmospheric Condition Lab reset.');
    },

    setName(name) {
      pushHistory();
      commit({
        name: String(name || 'Untitled atmospheric condition'),
        presetDirty: true,
      });
    },

    setPreviewAutoCycle(previewAutoCycle) {
      store.setState({ previewAutoCycle: Boolean(previewAutoCycle) });
    },

    setPreviewHour(previewHour) {
      store.setState({ previewHour });
    },

    setSetting(path, value) {
      pushHistory(`setting:${path}`);
      commit({
        conditionId: null,
        presetDirty: true,
        settings: replaceAtPath(state().settings, path, value),
      });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      historyFlags();
    },
  };

  return store;
}
