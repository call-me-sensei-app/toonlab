// Environment Shader Lab store: environment shader settings ({features, parameters}
// from createEnvironmentSettings), style identity, undo history, persistence,
// and view state (stage choice / debug output / walk preview). Same
// store->engine contract as the other redesigned labs.

import { createStore } from '../../shared/ui/createStore.js';
import { createEnvironmentSettings } from '../../../src/environment/environmentMaterialAdapter.js';
import {
  ENVIRONMENT_PRESET_ALIASES,
  ENVIRONMENT_PRESET_DOCUMENT_TYPE,
  ENVIRONMENT_PRESET_SCHEMA_VERSION,
  getEnvironmentPresetOptions,
  getEnvironmentScenarioOptions,
  resolveEnvironmentPreset,
  validateEnvironmentPresetDocument,
} from '../../../src/environment/environmentPresets.js';
import {
  deleteLocalEnvironmentPreset,
  loadLocalEnvironmentPresets,
  upsertLocalEnvironmentPresetDocument,
} from '../environmentPresetStore.js';

const DOCUMENT_STORAGE_KEY = 'toonlab.environmentLab.document.v1';
export const ENVIRONMENT_LAB_STYLE_QUERY_PARAM = 'envStyle';
export const ENVIRONMENT_LAB_PRESET_QUERY_PARAM = 'envPreset';
export const ENVIRONMENT_LAB_SCENARIO_QUERY_PARAM = 'envScenario';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'environment').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
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
    // Private modes may reject storage — the lab keeps working unsaved.
  }
}

function clearDocumentLocal() {
  try {
    window.localStorage?.removeItem(DOCUMENT_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/** The current settings as a portable environment-preset document. */
function documentFromSettings(id, label, description, settings) {
  return {
    description: String(description ?? ''),
    id,
    label,
    preset: { features: settings.features, parameters: settings.parameters, rig: null },
    schemaVersion: ENVIRONMENT_PRESET_SCHEMA_VERSION,
    type: ENVIRONMENT_PRESET_DOCUMENT_TYPE,
  };
}

function settingsFromPreset(id, scenario = null) {
  const preset = resolveEnvironmentPreset(id, scenario ?? undefined);
  return createEnvironmentSettings({ features: preset.features, parameters: preset.parameters });
}

function scenarioLabel(id) {
  return getEnvironmentScenarioOptions().find((entry) => entry.id === id)?.label ?? id;
}

function bootDocument(urlParams) {
  // Explicit lab / Pro deep links always beat the autosaved draft. Without
  // this guard, "Open in Environment Lab" appeared to work in the URL while
  // silently reopening whichever document happened to be edited last.
  const hasExplicitStart = [
    ENVIRONMENT_LAB_STYLE_QUERY_PARAM,
    ENVIRONMENT_LAB_PRESET_QUERY_PARAM,
    'preset',
    ENVIRONMENT_LAB_SCENARIO_QUERY_PARAM,
  ]
    .some((key) => urlParams.has(key));
  if (!hasExplicitStart) {
    const saved = loadDocument();
    if (saved?.settings) {
      return {
        bootSource: 'persisted',
        name: saved.name || 'Untitled environment',
        presetId: saved.presetId ?? null,
        scenarioId: saved.scenarioId ?? null,
        settings: createEnvironmentSettings(saved.settings),
        stage: saved.stage ?? 'builtin',
      };
    }
  }
  // envStyle is the preferred, explicit identity axis. envPreset and the
  // generic preset key remain readable so existing bookmarks keep working.
  const presetParam = urlParams.get(ENVIRONMENT_LAB_STYLE_QUERY_PARAM)
    || urlParams.get(ENVIRONMENT_LAB_PRESET_QUERY_PARAM)
    || urlParams.get('preset')
    || 'call_me_sensei';
  const scenarioParam = urlParams.get(ENVIRONMENT_LAB_SCENARIO_QUERY_PARAM);
  // Legacy single-look ids open as the Default style at that scenario.
  const alias = ENVIRONMENT_PRESET_ALIASES[presetParam];
  const known = getEnvironmentPresetOptions().find((entry) => entry.value === presetParam);
  const presetId = known ? presetParam : (alias ? alias.preset : 'default');
  const scenarioId = getEnvironmentScenarioOptions().some((entry) => entry.id === scenarioParam)
    ? scenarioParam
    : (alias?.scenario ?? null);
  return {
    bootSource: hasExplicitStart ? 'url' : 'fresh',
    name: alias ? scenarioLabel(alias.scenario) : (known?.label ?? 'Call Me Sensei'),
    presetId,
    scenarioId,
    settings: settingsFromPreset(presetId, scenarioId),
    stage: 'builtin',
  };
}

export function createEnvironmentLabStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const localPresets = loadLocalEnvironmentPresets(); // registers them for resolveEnvironmentPreset
  const boot = bootDocument(urlParams);
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    convertedMeshCount: 0,
    docRevision: 0,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    scenarioId: boot.scenarioId,
    settings: boot.settings,
    status: boot.bootSource === 'persisted' ? 'Restored your last environment.' : '',
    view: {
      ambientIntensity: 0.34,
      debug: 'off',
      stage: boot.stage,
      sunIntensity: 1.15,
      walkPreview: false,
    },
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    scenarioId: state().scenarioId,
    settings: state().settings,
  });

  function persist() {
    saveDocumentLocal({
      name: state().name,
      presetId: state().presetId,
      scenarioId: state().scenarioId,
      settings: state().settings,
      stage: state().view.stage,
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
    destination.push(snapshot());
    const document = JSON.parse(entry);
    commit({
      ...document,
      settings: createEnvironmentSettings(document.settings),
    }, { status: 'History restored.' });
  }

  function replaceForStart(settings, { name, presetId = null, scenarioId = null, status }) {
    pushHistory();
    store.setState({ name, presetDirty: false, presetId, scenarioId });
    commit({ settings }, { status });
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    // Opens one scenario of a style (scenario null = the style's base look).
    // Every style resolves in every canonical scenario.
    applyPreset(id, scenario = undefined) {
      const option = [
        ...getEnvironmentPresetOptions().map((entry) => ({ id: entry.value, label: entry.label })),
        ...state().localPresets,
      ].find((entry) => entry.id === id);
      if (!option) return false;
      const scenarioId = scenario === undefined ? state().scenarioId : scenario;
      const validScenario = getEnvironmentScenarioOptions().some((entry) => entry.id === scenarioId)
        ? scenarioId
        : null;
      replaceForStart(settingsFromPreset(id, validScenario), {
        name: option.label,
        presetId: id,
        scenarioId: validScenario,
        status: validScenario
          ? `Opened ${option.label} · ${scenarioLabel(validScenario)}.`
          : `Opened ${option.label}.`,
      });
      return true;
    },

    setScenario(scenario) {
      return store.actions.applyPreset(state().presetId ?? 'default', scenario ?? null);
    },

    deletePreset(id) {
      deleteLocalEnvironmentPreset(id);
      store.setState({
        localPresets: loadLocalEnvironmentPresets(),
        ...(state().presetId === id ? { presetId: null } : {}),
      });
      persist();
    },

    exportDocument() {
      return JSON.stringify(
        documentFromSettings(slug(state().name), state().name, '', state().settings),
        null,
        2,
      );
    },

    importDocument(text) {
      const result = validateEnvironmentPresetDocument(text);
      if (!result.ok) return result;
      replaceForStart(
        createEnvironmentSettings({ features: result.value.features, parameters: result.value.parameters }),
        {
          name: result.value.label || 'Imported environment',
          status: `Imported ${result.value.label || 'environment style'}.`,
        },
      );
      return result;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearDocumentLocal();
      replaceForStart(settingsFromPreset('call_me_sensei'), {
        name: 'Call Me Sensei',
        presetId: 'call_me_sensei',
        status: 'Environment Shader Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      try {
        upsertLocalEnvironmentPresetDocument(
          documentFromSettings(id, cleanName, '', state().settings),
        );
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalEnvironmentPresets(),
        name: cleanName,
        presetDirty: false,
        presetId: id,
        status: `Saved “${cleanName}” to your styles.`,
      });
      persist();
      return { ok: true };
    },

    /** Single schema-field edit: group is 'features' or 'parameters'. */
    setSetting(groupId, key, value) {
      const current = state().settings;
      pushHistory(`setting:${groupId}.${key}`);
      commit({
        presetDirty: true,
        settings: createEnvironmentSettings({
          ...current,
          [groupId]: { ...current[groupId], [key]: value },
        }),
      });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
      if (patch.stage) persist();
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
