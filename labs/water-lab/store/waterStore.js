// Water Lab store: document state (settings/name/preset), undo history,
// persistence, and the store->engine contract (docRevision + lastChange,
// same as texture/rock/debris labs). Settings are the flat createWaterSettings
// object; preset identity lives on presetId, never inside settings.

import { createStore } from '../../shared/ui/createStore.js';
import { takeLabHandoff } from '../../shared/labHandoff.js';
import { serializeSingleSlotStyleBundle } from '../../shared/runtimeStyleBundle.js';
import {
  createWaterPresetDocument,
  createWaterSettings,
  getWaterPresetOptions,
  getWaterStyleOptions,
  parseWaterPresetDocument,
  rebaseWaterSettingsStyle,
  resolveWaterStyleName,
  sanitizeWaterPresetSettings,
  serializeWaterPreset,
} from '../../../src/water/index.js';
import {
  clearWaterDocument,
  deleteLocalWaterPreset,
  loadLocalWaterPresets,
  loadWaterDocument,
  loadWaterSceneSettings,
  saveWaterSceneSettings,
  saveWaterDocument,
  upsertLocalWaterPreset,
} from '../waterProjectStore.js';
import { STAGE_BY_PRESET, WATER_LAB_STAGES } from '../engine/waterLabEngine.js';
import { waterStageOverrides } from './waterStageSettings.js';
import { isProtectedSystemStyleId } from '../../../src/core/systemStylePolicy.js';
import { normalizeExperimentSettings, EXPERIMENT_RANGES } from '../experiments/experimentModels.js';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;
const DEFAULT_WATER_LAB_STYLE = 'call_me_sensei';

function slug(value) {
  return String(value || 'water').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

function stageOrientation(presetId) {
  const stage = STAGE_BY_PRESET[presetId];
  return waterStageOverrides(stage);
}

function builtinPreset(id) {
  return getWaterPresetOptions().find((entry) => entry.id === id) ?? null;
}

function localPreset(id) {
  return loadLocalWaterPresets().find((entry) => entry.id === id) ?? null;
}

function currentWaterDocument(current, { id = slug(current.name), label = current.name } = {}) {
  return createWaterPresetDocument(id, {
    label,
    settings: sanitizeWaterPresetSettings(current.settings),
  });
}

function inferDocumentStyle(settings) {
  return resolveWaterStyleName(
    settings?.style ?? (settings?.colorTone === 'anime' ? 'call_me_sensei' : 'default'),
  );
}

function builtinStyle(id) {
  return getWaterStyleOptions().find((entry) => entry.id === id) ?? null;
}

function bootDocument(urlParams) {
  // Shared/bookmarked document: ?waterDoc=<preset document JSON>.
  const encoded = urlParams.get('waterDoc');
  if (encoded) {
    const result = parseWaterPresetDocument(encoded);
    if (result.ok) {
      return {
        bootSource: 'url',
        name: result.value.label || 'Shared water',
        presetId: null,
        styleId: 'default',
        settings: createWaterSettings(result.value.settings),
      };
    }
  }
  const hasExplicitStart = ['waterPreset', 'waterMode', 'waterScenario', 'waterStyle']
    .some((key) => urlParams.has(key));
  if (!hasExplicitStart) {
    // "Edit in Water Lab" from the playground preview scene.
    const handoff = takeLabHandoff('water-lab-import');
    if (handoff?.settings) {
      return {
        bootSource: 'handoff',
        name: 'Playground water',
        presetId: handoff.preset ?? null,
        styleId: resolveWaterStyleName(handoff.style ?? handoff.settings?.style),
        settings: createWaterSettings({
          preset: handoff.preset ?? undefined,
          style: handoff.style ?? handoff.settings?.style,
          ...handoff.settings,
        }),
      };
    }
    const saved = loadWaterDocument();
    if (saved) return { ...saved, bootSource: 'persisted' };
  }
  const requestedPreset = urlParams.get('waterPreset') || urlParams.get('waterMode') || 'lake';
  const legacyStyle = builtinStyle(requestedPreset)?.id ?? null;
  const preset = legacyStyle
    ? (urlParams.get('waterScenario') || 'lake')
    : requestedPreset;
  const knownBuiltin = builtinPreset(preset);
  const knownLocal = knownBuiltin ? null : localPreset(preset);
  const known = knownBuiltin ?? knownLocal;
  const presetId = known ? known.id : 'lake';
  const styleId = resolveWaterStyleName(
    urlParams.get('waterStyle')
      ?? legacyStyle
      ?? (knownLocal ? inferDocumentStyle(knownLocal.settings) : DEFAULT_WATER_LAB_STYLE),
  );
  return {
    bootSource: hasExplicitStart ? 'url' : 'fresh',
    name: known ? known.label : 'Untitled water',
    presetId: known ? known.id : null,
    styleId,
    settings: knownLocal
      ? createWaterSettings({ ...knownLocal.settings, style: styleId })
      : createWaterSettings({ preset: presetId, style: styleId, ...stageOrientation(presetId) }),
  };
}

export function createWaterStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const boot = bootDocument(urlParams);
  const requestedStage = urlParams.get('waterStage');
  const bootStage = WATER_LAB_STAGES.some(({id}) => id === requestedStage)
    ? requestedStage : STAGE_BY_PRESET[boot.presetId] ?? 'shore';
  const bootBase = builtinPreset(boot.presetId)
    ? createWaterSettings({ preset: boot.presetId, style: boot.styleId })
    : boot.settings;
  // Persisted documents predate the Ground contract and can contain an
  // offshore wave direction while reopening directly on Beach. Normalize
  // before the first engine build so a reload cannot silently reintroduce
  // the cross-shore phase bug.
  boot.settings = createWaterSettings({
    ...boot.settings,
    ...waterStageOverrides(bootStage, bootBase),
  });
  if (urlParams.has('waterIntensity') && Number.isFinite(Number(urlParams.get('waterIntensity')))) {
    boot.settings = createWaterSettings({ ...boot.settings, waveIntensity: Number(urlParams.get('waterIntensity')) });
  }
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    lastChange: { immediate: false },
    localPresets: loadLocalWaterPresets(),
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    styleId: resolveWaterStyleName(boot.styleId),
    status: boot.bootSource === 'handoff'
      ? 'Imported the playground water.'
      : boot.bootSource === 'persisted' ? 'Restored your last water.' : '',
    experimentSettings: normalizeExperimentSettings(loadWaterSceneSettings()),
    view: {
      debug: 'off',
      reference: urlParams.get('waterReference') === '1',
      paused: urlParams.get('waterPaused') === '1',
      fish: 30,
      kelp: 60,
      rain: false,
      rocks: true,
      // The ground under the water follows the preset (ocean should never
      // show a beach) but stays user-overridable in the Stage section.
      stage: bootStage,
    },
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
    styleId: state().styleId,
  });

  function persist() {
    saveWaterDocument({
      name: state().name,
      presetId: state().presetId,
      settings: state().settings,
      styleId: state().styleId,
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
      settings: createWaterSettings(document.settings),
    }, { immediate: true, status: 'History restored.' });
  }

  function replaceForStart(settings, {
    name,
    presetId = null,
    status,
    styleId = state().styleId,
  }) {
    pushHistory();
    store.setState({
      bootSource: 'started',
      name,
      presetDirty: false,
      presetId,
      styleId: resolveWaterStyleName(styleId),
    });
    commit({ settings }, { immediate: true, status });
  }

  store.actions = {
    /** Applies a built-in or local preset by id. */
    applyPreset(id) {
      const builtin = builtinPreset(id);
      if (builtin) {
        const styleId = state().styleId;
        replaceForStart(createWaterSettings({ preset: id, style: styleId, ...stageOrientation(id) }), {
          name: builtin.label,
          presetId: id,
          styleId,
          status: `Opened ${builtin.label}.`,
        });
        const stage = STAGE_BY_PRESET[id];
        if (stage) store.setState({ view: { ...state().view, stage } });
        return true;
      }
      const local = localPreset(id);
      if (local) {
        const styleId = inferDocumentStyle(local.settings);
        replaceForStart(createWaterSettings(local.settings), {
          name: local.label,
          presetId: id,
          styleId,
          status: `Opened ${local.label}.`,
        });
        return true;
      }
      return false;
    },

    deletePreset(id) {
      if (isProtectedSystemStyleId(id)
        || !state().localPresets.some((entry) => entry.id === id)) return false;
      try { deleteLocalWaterPreset(id); }
      catch (error) { store.setState({ status: error.message }); return false; }
      if (state().presetId === id) {
        const preset = builtinPreset('lake');
        store.setState({
          localPresets: loadLocalWaterPresets(),
          name: preset.label,
          presetDirty: false,
          presetId: preset.id,
          settings: createWaterSettings({ preset: preset.id, style: state().styleId }),
          status: 'Saved style deleted. Call Me Sensei Lake restored.',
        });
      } else store.setState({ localPresets: loadLocalWaterPresets() });
      persist();
      return true;
    },

    /** Serialized water-preset document JSON of the current settings. */
    exportDocument() {
      return serializeWaterPreset(currentWaterDocument(state()));
    },

    /** Canonical style-bundle JSON with this water document inline. */
    exportStyleBundle() {
      const current = state();
      return serializeSingleSlotStyleBundle({
        description: `${current.name} water treatment. Water body identity and scene conditions remain host-owned.`,
        label: current.name,
        slotId: 'water',
        styleDocument: currentWaterDocument(current),
      });
    },

    /** Sanitized snapshot for the playground preview handoff. */
    getHandoffPayload() {
      return {
        preset: state().presetId,
        settings: sanitizeWaterPresetSettings(state().settings),
        style: state().styleId,
      };
    },

    importDocument(text) {
      const result = parseWaterPresetDocument(text);
      if (!result.ok) return result;
      replaceForStart(createWaterSettings(result.value.settings), {
        name: result.value.label || 'Imported water',
        styleId: inferDocumentStyle(result.value.settings),
        status: `Imported ${result.value.label || 'water preset'}.`,
      });
      return result;
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearWaterDocument();
      replaceForStart(createWaterSettings({ preset: 'lake', style: DEFAULT_WATER_LAB_STYLE }), {
        name: 'Untitled water',
        presetId: 'lake',
        styleId: DEFAULT_WATER_LAB_STYLE,
        status: 'Water Lab reset.',
      });
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      let document;
      try {
        document = createWaterPresetDocument(id, {
          label: cleanName,
          settings: sanitizeWaterPresetSettings(state().settings),
        });
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      let saved;
      try { saved = upsertLocalWaterPreset(document); }
      catch (error) { return { errors: [error.message], ok: false }; }
      if (!saved) return { ok: false };
      store.setState({
        localPresets: loadLocalWaterPresets(),
        name: cleanName,
        presetDirty: false,
        presetId: saved.id,
        status: `Saved “${cleanName}” to your presets.`,
      });
      persist();
      return { ok: true, preset: saved };
    },

    updatePreset(name = state().name) {
      const current = state();
      const existing = current.localPresets.find((entry) => entry.id === current.presetId);
      if (!existing) return { errors: ['Open a saved preset before using Update.'], ok: false };
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['Preset name is required.'], ok: false };
      let document;
      try {
        document = currentWaterDocument(current, { id: existing.id, label: cleanName });
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      let saved;
      try { saved = upsertLocalWaterPreset(document); }
      catch (error) { return { errors: [error.message], ok: false }; }
      if (!saved) return { errors: ['Could not update the preset.'], ok: false };
      store.setState({
        localPresets: loadLocalWaterPresets(),
        name: cleanName,
        presetDirty: false,
        status: `Updated “${cleanName}”.`,
      });
      persist();
      return { ok: true, preset: saved };
    },

    setName(name) {
      const next = String(name || '').trim();
      if (!next) return;
      store.setState({ name: next, presetDirty: true });
      persist();
    },

    /** Single schema-field edit; value is already the field's plain shape. */
    setSetting(key, value) {
      const current = state().settings;
      pushHistory(`setting:${key}`);
      commit({
        presetDirty: true,
        settings: createWaterSettings({ ...current, [key]: value }),
      });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setStyle(id) {
      const style = builtinStyle(id);
      if (!style) return false;
      const current = state();
      const preset = builtinPreset(current.presetId);
      const settings = rebaseWaterSettingsStyle(current.settings, style.id);
      replaceForStart(settings, {
        name: current.name,
        presetId: current.presetId,
        styleId: style.id,
        status: `Applied ${style.label} across ${preset?.label ?? current.name}.`,
      });
      return true;
    },

    setExperimentSetting(key, value) {
      const current = state();
      const ranges = EXPERIMENT_RANGES;
      if (ranges[key]) {
        if (!Number.isFinite(Number(value))) return;
        value = Math.max(ranges[key][0],Math.min(ranges[key][1],Number(value)));
      } else if (key === 'breakerMode') { if (!['barrel','spilling'].includes(value)) return; }
      else if (key === 'fluidQuality') {if(!['standard','high'].includes(value))return;}
      else if (key === 'lighting') {if(!['cinematic','neutral'].includes(value))return;}
      else if (key === 'surfer' || key === 'impactRocks' || key === 'midLedge') value = Boolean(value);
      else return;
      if(current.experimentSettings[key]===value)return;
      const experimentSettings={...current.experimentSettings,[key]:value};
      store.setState({experimentSettings});saveWaterSceneSettings(experimentSettings);
    },

    setView(patch) {
      const current = state();
      const nextStage = patch.stage;
      if (nextStage && nextStage !== current.view.stage) {
        const builtin = builtinPreset(current.presetId);
        const baseSettings = builtin
          ? createWaterSettings({ preset: builtin.id, style: current.styleId })
          : current.settings;
        const stageSettings = waterStageOverrides(nextStage, baseSettings);
        pushHistory('view:stage');
        commit({
          presetDirty: true,
          settings: createWaterSettings({ ...current.settings, ...stageSettings }),
          view: { ...current.view, ...patch },
        }, {
          immediate: true,
          status: nextStage === 'beach'
            ? 'Beach: incoming waves drive run-up and backwash.'
            : 'Ground changed.',
        });
        return;
      }
      store.setState({ view: { ...current.view, ...patch } });
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
