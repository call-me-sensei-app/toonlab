// Tree, Grass, and Flower own independent role settings over one editable
// vegetation treatment base. Preview state remains outside every document so
// current palette/weather/wind never leak into a shader profile.

import { createStore } from '../../shared/ui/createStore.js';
import {
  createVegetationSharedShaderSettings,
  createVegetationShaderPresetDocument,
  createVegetationShaderScopePresetDocument,
  createVegetationShaderSettings,
  getVegetationShaderPresetOptions,
  isVegetationSharedShaderGroup,
  mergeVegetationSharedShaderSettings,
  parseVegetationShaderPresetDocument,
  parseVegetationShaderScopePresetDocument,
  serializeVegetationShaderPreset,
  serializeVegetationShaderScopePreset,
  VEGETATION_SHADER_SCOPES,
} from '../../../src/vegetation/vegetationShaders.js';
import {
  deleteLocalVegetationShaderProfile,
  loadLocalVegetationShaderProfiles,
  upsertLocalVegetationShaderProfile,
} from '../vegetationShaderPresetStore.js';
import {
  createVegetationPreviewSettings,
  DEFAULT_VEGETATION_PREVIEW_SETTINGS,
} from './previewSettings.js';
import {
  DEFAULT_FLOWER_SHADER_PREVIEW_ASSET,
  DEFAULT_TREE_SHADER_PREVIEW_ASSET,
  normalizeFlowerShaderPreviewAsset,
  normalizeTreeShaderPreviewAsset,
} from '../previewAssets.js';
import {
  createStyleBundleDocument,
  serializeStyleBundle,
} from '../../../src/styles/styleBundle.js';
import { serializeSingleSlotStyleBundle } from '../../shared/runtimeStyleBundle.js';

export const VEGETATION_SHADER_DRAFT_STORAGE_KEY = 'toonlab.vegetationShaderDraft.v1';
export const VEGETATION_SHADER_SHARED_BASE_STORAGE_KEY =
  'toonlab.vegetationShaderSharedBase.v1';
const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;

function slug(value) {
  return String(value || 'vegetation-style').toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'vegetation_style';
}

function draftStorageKey(scope) {
  return scope === 'vegetation'
    ? VEGETATION_SHADER_DRAFT_STORAGE_KEY
    : `toonlab.vegetationShaderDraft.${scope}.v1`;
}

function previewStorageKey(scope) {
  return `toonlab.vegetationShaderPreview.${scope}.v1`;
}

function readDraft(scope) {
  try {
    const raw = window.localStorage?.getItem(draftStorageKey(scope));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeDraft(scope, document) {
  try {
    window.localStorage?.setItem(draftStorageKey(scope), JSON.stringify(document));
  } catch {
    // Keep authoring when storage is unavailable.
  }
}

function clearDraft(scope) {
  try {
    window.localStorage?.removeItem(draftStorageKey(scope));
  } catch {
    // Ignore storage failures.
  }
}

function readPreviewState(scope) {
  try {
    const raw = window.localStorage?.getItem(previewStorageKey(scope));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writePreviewState(scope, previewState) {
  try {
    window.localStorage?.setItem(previewStorageKey(scope), JSON.stringify(previewState));
  } catch {
    // Preview preferences are optional when browser storage is unavailable.
  }
}

function readSharedBase() {
  try {
    const raw = window.localStorage?.getItem(
      VEGETATION_SHADER_SHARED_BASE_STORAGE_KEY,
    );
    const saved = raw ? JSON.parse(raw) : {};
    return createVegetationSharedShaderSettings({
      preset: 'call_me_sensei',
      ...saved,
    });
  } catch {
    return createVegetationSharedShaderSettings({ preset: 'call_me_sensei' });
  }
}

function writeSharedBase(settings) {
  try {
    window.localStorage?.setItem(
      VEGETATION_SHADER_SHARED_BASE_STORAGE_KEY,
      JSON.stringify(createVegetationSharedShaderSettings(settings)),
    );
  } catch {
    // Keep authoring when storage is unavailable.
  }
}

function presetLabel(id) {
  return getVegetationShaderPresetOptions()
    .find((entry) => (entry.value ?? entry.id) === id)?.label ?? id;
}

function queryParameterForScope(scope) {
  return scope === 'vegetation' ? 'vegetationShader' : `${scope}Shader`;
}

function defaultPreviewAsset(scope) {
  if (scope === 'tree') return DEFAULT_TREE_SHADER_PREVIEW_ASSET;
  if (scope === 'flower') return DEFAULT_FLOWER_SHADER_PREVIEW_ASSET;
  return null;
}

function normalizePreviewAsset(scope, value) {
  if (scope === 'tree') return normalizeTreeShaderPreviewAsset(value);
  if (scope === 'flower') return normalizeFlowerShaderPreviewAsset(value);
  return null;
}

function bootDocument(urlParams, scope) {
  // Explicit profile links (including Pro's ?cloudDoc= hydration, which
  // resolves to ?vegetationShader= before this module boots) must win over
  // an unrelated autosaved draft. Ordinary visits still restore the draft.
  const previewState = readPreviewState(scope);
  const linkedPresetId = urlParams.get(queryParameterForScope(scope));
  if (linkedPresetId) {
    return {
      bootSource: 'preset',
      name: presetLabel(linkedPresetId),
      presetId: linkedPresetId,
      preview: previewState?.preview ?? null,
      previewAutoCycle: Boolean(previewState?.previewAutoCycle),
      previewHour: Number.isFinite(previewState?.previewHour) ? previewState.previewHour : 13,
      settings: createVegetationShaderSettings({ preset: linkedPresetId }),
      view: previewState?.view ?? {},
    };
  }
  const saved = readDraft(scope);
  if (saved?.settings) {
    return {
      bootSource: 'persisted',
      name: saved.name || 'Untitled vegetation shader',
      presetId: saved.presetId ?? null,
      preview: previewState?.preview ?? saved.preview ?? null,
      previewAutoCycle: Boolean(previewState?.previewAutoCycle),
      previewHour: Number.isFinite(previewState?.previewHour)
        ? previewState.previewHour
        : (Number.isFinite(saved.previewHour) ? saved.previewHour : 13),
      settings: createVegetationShaderSettings(saved.settings),
      view: previewState?.view ?? saved.view ?? {},
    };
  }
  const presetId = 'call_me_sensei';
  return {
    bootSource: 'fresh',
    name: scope === 'vegetation'
      ? presetLabel(presetId)
      : `${presetLabel(presetId)} · ${VEGETATION_SHADER_SCOPES[scope].label}`,
    presetId,
    preview: previewState?.preview ?? null,
    previewAutoCycle: Boolean(previewState?.previewAutoCycle),
    previewHour: Number.isFinite(previewState?.previewHour) ? previewState.previewHour : 13,
    settings: createVegetationShaderSettings({ preset: presetId }),
    view: previewState?.view ?? {},
  };
}

export function createVegetationMaterialLabStore({
  scope = 'vegetation',
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const resolvedScope = scope === 'vegetation' || VEGETATION_SHADER_SCOPES[scope]
    ? scope
    : 'vegetation';
  const localPresets = loadLocalVegetationShaderProfiles(resolvedScope);
  const boot = bootDocument(urlParams, resolvedScope);
  const sharedBase = readSharedBase();
  const defaultPreviewScene = resolvedScope === 'grass'
    ? 'ground_adoption_zones'
    : DEFAULT_VEGETATION_PREVIEW_SETTINGS.scenePreset;
  const defaultPreviewSettings = {
    ...DEFAULT_VEGETATION_PREVIEW_SETTINGS,
    componentVisibility: {
      ...DEFAULT_VEGETATION_PREVIEW_SETTINGS.componentVisibility,
      ...(resolvedScope === 'flower' ? { tree: false } : {}),
    },
    scenePreset: defaultPreviewScene,
  };
  const effectiveBootSettings = resolvedScope === 'vegetation'
    ? createVegetationShaderSettings({
      ...boot.settings,
      ...sharedBase,
    })
    : mergeVegetationSharedShaderSettings(
      resolvedScope,
      boot.settings,
      sharedBase,
    );
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    coverage: {
      applied: 0,
      fallback: 0,
      matched: 0,
      unsupported: 0,
      writes: 0,
    },
    docRevision: 0,
    localPresets,
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    previewAutoCycle: boot.previewAutoCycle,
    previewHour: boot.previewHour,
    runtimeAdapter: null,
    runtimeErrors: [],
    preview: createVegetationPreviewSettings({
      ...defaultPreviewSettings,
      ...(boot.preview ?? {}),
      bundle: urlParams.get('previewBundle')
        ?? boot.preview?.bundle
        ?? DEFAULT_VEGETATION_PREVIEW_SETTINGS.bundle,
      scenePreset: urlParams.get('previewScene')
        ?? boot.preview?.scenePreset
        ?? defaultPreviewScene,
    }),
    scope: resolvedScope,
    settings: effectiveBootSettings,
    sharedBase,
    status: boot.bootSource === 'persisted' ? 'Restored your vegetation shader profile.' : '',
    view: {
      ...boot.view,
      cameraMode: ['rotate', 'pan', 'zoom'].includes(boot.view?.cameraMode)
        ? boot.view.cameraMode
        : 'rotate',
      // Ordinary visits stop at the entry chooser. Explicit shader profile
      // links remain direct-open because the URL has already chosen a document.
      entryChooser: boot.bootSource !== 'preset',
      interactionAmount: Number.isFinite(boot.view?.interactionAmount)
        ? boot.view.interactionAmount
        : 0,
      previewAsset: normalizePreviewAsset(
        resolvedScope,
        boot.view?.previewAsset,
      ),
      viewMode: ['composition', 'isolate', 'top'].includes(boot.view?.viewMode)
        ? boot.view.viewMode
        : 'composition',
      snowCover: Number.isFinite(boot.view?.snowCover) ? boot.view.snowCover : 0,
      wetness: Number.isFinite(boot.view?.wetness) ? boot.view.wetness : 0,
      windStrength: Number.isFinite(boot.view?.windStrength)
        ? boot.view.windStrength
        : 1.2,
    },
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
    sharedBase: state().sharedBase,
  });

  function persist() {
    writeDraft(resolvedScope, {
      name: state().name,
      presetId: state().presetId,
      settings: state().settings,
    });
    writeSharedBase(state().sharedBase);
  }

  function persistPreview() {
    writePreviewState(resolvedScope, {
      preview: state().preview,
      previewAutoCycle: state().previewAutoCycle,
      previewHour: state().previewHour,
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

  function restore(entry, destination) {
    // An undo/redo boundary must end the previous slider gesture.
    lastHistoryKey = null;
    lastHistoryTime = 0;
    destination.push(snapshot());
    const document = JSON.parse(entry);
    const restoredShared = createVegetationSharedShaderSettings({
      preset: 'call_me_sensei',
      ...document.sharedBase,
    });
    commit({
      ...document,
      settings: resolvedScope === 'vegetation'
        ? createVegetationShaderSettings({
          ...document.settings,
          ...restoredShared,
        })
        : mergeVegetationSharedShaderSettings(
          resolvedScope,
          document.settings,
          restoredShared,
        ),
      sharedBase: restoredShared,
    }, 'History restored.');
  }

  function replace(settings, { name, presetId = null, status }) {
    pushHistory();
    const nextSharedBase = createVegetationSharedShaderSettings(settings);
    store.setState({ name, presetDirty: false, presetId });
    commit({
      settings: resolvedScope === 'vegetation'
        ? createVegetationShaderSettings({
          ...settings,
          ...nextSharedBase,
        })
        : mergeVegetationSharedShaderSettings(
          resolvedScope,
          settings,
          nextSharedBase,
        ),
      sharedBase: nextSharedBase,
    }, status);
  }

  function currentDocument({ id = slug(state().name), label = state().name } = {}) {
    return resolvedScope === 'vegetation'
      ? createVegetationShaderPresetDocument(id, {
        label,
        settings: state().settings,
      })
      : createVegetationShaderScopePresetDocument(resolvedScope, id, {
        label,
        settings: state().settings,
      });
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(id) {
      replace(createVegetationShaderSettings({ preset: id }), {
        name: presetLabel(id),
        presetId: id,
        status: `Opened ${presetLabel(id)}.`,
      });
    },

    deletePreset(id) {
      const deletingCurrent = state().presetId === id;
      try {
        deleteLocalVegetationShaderProfile(id, resolvedScope);
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({ localPresets: loadLocalVegetationShaderProfiles(resolvedScope) });
      if (deletingCurrent) {
        replace(createVegetationShaderSettings({ preset: 'call_me_sensei' }), {
          name: resolvedScope === 'vegetation'
            ? presetLabel('call_me_sensei')
            : `${presetLabel('call_me_sensei')} · ${VEGETATION_SHADER_SCOPES[resolvedScope].label}`,
          presetId: 'call_me_sensei',
          status: 'Deleted the saved profile and restored Call Me Sensei.',
        });
        return { ok: true };
      }
      persist();
      return { ok: true };
    },

    exportDocument() {
      if (resolvedScope === 'vegetation') {
        return serializeVegetationShaderPreset(currentDocument());
      }
      return serializeVegetationShaderScopePreset(
        resolvedScope,
        currentDocument(),
      );
    },

    exportStyleBundle() {
      if (resolvedScope === 'vegetation') {
        const aggregate = currentDocument();
        const slots = Object.fromEntries(['tree', 'grass', 'flower'].map((scopeId) => [
          `${scopeId}Shader`,
          {
            document: createVegetationShaderScopePresetDocument(
              scopeId,
              `${aggregate.id}_${scopeId}`,
              { label: `${aggregate.label} · ${VEGETATION_SHADER_SCOPES[scopeId].label}`, settings: aggregate.settings },
            ),
          },
        ]));
        return serializeStyleBundle(createStyleBundleDocument(`${aggregate.id}-bundle`, {
          description: 'Vegetation shader profiles exported by ToonLab.',
          label: `${aggregate.label} bundle`,
          slots,
        }));
      }
      const document = currentDocument();
      return serializeSingleSlotStyleBundle({
        description: `${VEGETATION_SHADER_SCOPES[resolvedScope].label} profile exported by ToonLab.`,
        label: document.label,
        slotId: `${resolvedScope}Shader`,
        styleDocument: document,
      });
    },

    importDocument(text) {
      const result = resolvedScope === 'vegetation'
        ? parseVegetationShaderPresetDocument(text)
        : parseVegetationShaderScopePresetDocument(resolvedScope, text);
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
      clearDraft(resolvedScope);
      replace(createVegetationShaderSettings({ preset: 'call_me_sensei' }), {
        name: resolvedScope === 'vegetation'
          ? presetLabel('call_me_sensei')
          : `${presetLabel('call_me_sensei')} · ${VEGETATION_SHADER_SCOPES[resolvedScope].label}`,
        presetId: 'call_me_sensei',
        status: `${VEGETATION_SHADER_SCOPES[resolvedScope]?.label ?? 'Vegetation Shader Lab'} reset.`,
      });
      store.setState({
        preview: createVegetationPreviewSettings(defaultPreviewSettings),
        previewAutoCycle: false,
        previewHour: 13,
        view: {
          cameraMode: 'rotate',
          interactionAmount: 0,
          previewAsset: defaultPreviewAsset(resolvedScope),
          viewMode: 'composition',
          snowCover: 0,
          wetness: 0,
          windStrength: 1.2,
        },
      });
      persist();
      persistPreview();
      // A clean profile starts a new history boundary.
      undoStack.length = 0;
      redoStack.length = 0;
      updateHistoryFlags();
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['Profile name is required.'], ok: false };
      const documentId = `local_${resolvedScope}_${slug(cleanName)}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
      const document = resolvedScope === 'vegetation'
        ? createVegetationShaderPresetDocument(documentId, {
          label: cleanName,
          settings: state().settings,
        })
        : createVegetationShaderScopePresetDocument(resolvedScope, documentId, {
          label: cleanName,
          settings: state().settings,
        });
      try {
        upsertLocalVegetationShaderProfile(document, resolvedScope);
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalVegetationShaderProfiles(resolvedScope),
        name: cleanName,
        presetDirty: false,
        presetId: document.id,
        status: `Saved “${cleanName}” to your profiles.`,
      });
      persist();
      return { ok: true };
    },

    updatePreset() {
      const local = state().localPresets.find(({ id }) => id === state().presetId);
      if (!local) {
        return { errors: ['Choose a saved local profile before updating.'], ok: false };
      }
      const document = currentDocument({ id: local.id, label: state().name || local.label });
      try {
        upsertLocalVegetationShaderProfile(document, resolvedScope);
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      store.setState({
        localPresets: loadLocalVegetationShaderProfiles(resolvedScope),
        name: document.label,
        presetDirty: false,
        status: `Updated “${document.label}”.`,
      });
      persist();
      return { ok: true };
    },

    setSetting(groupId, key, value) {
      pushHistory(`setting:${groupId}.${key}`);
      if (isVegetationSharedShaderGroup(groupId)) {
        const nextSharedBase = createVegetationSharedShaderSettings({
          ...state().sharedBase,
          [groupId]: { ...state().sharedBase[groupId], [key]: value },
        });
        commit({
          presetDirty: true,
          settings: resolvedScope === 'vegetation'
            ? createVegetationShaderSettings({
              ...state().settings,
              ...nextSharedBase,
            })
            : mergeVegetationSharedShaderSettings(
              resolvedScope,
              state().settings,
              nextSharedBase,
            ),
          sharedBase: nextSharedBase,
        }, `Updated shared ${groupId}; Tree, Grass, and Flower now use this value.`);
        return;
      }
      commit({
        presetDirty: true,
        settings: resolvedScope === 'vegetation'
          ? createVegetationShaderSettings({
            ...state().settings,
            [groupId]: { ...state().settings[groupId], [key]: value },
          })
          : mergeVegetationSharedShaderSettings(
            resolvedScope,
            {
              ...state().settings,
              [groupId]: { ...state().settings[groupId], [key]: value },
            },
            state().sharedBase,
          ),
      });
    },

    setPreviewAutoCycle(previewAutoCycle) {
      store.setState({ previewAutoCycle: Boolean(previewAutoCycle) });
      persistPreview();
    },

    setPreviewAsset(previewAsset) {
      if (resolvedScope !== 'tree' && resolvedScope !== 'flower') return;
      const resolved = normalizePreviewAsset(resolvedScope, previewAsset);
      store.setState({
        status: `Previewing ${resolved.label}. The shader profile was not changed.`,
        view: { ...state().view, previewAsset: resolved },
      });
      persistPreview();
    },

    resetPreviewSettings() {
      store.setState({
        preview: createVegetationPreviewSettings(defaultPreviewSettings),
        previewAutoCycle: false,
        previewHour: 13,
        view: {
          ...state().view,
          previewAsset: defaultPreviewAsset(resolvedScope)
            ?? state().view.previewAsset,
          viewMode: 'composition',
        },
      });
      persistPreview();
    },

    setPreviewBundle(bundle) {
      store.setState({
        preview: createVegetationPreviewSettings({ ...state().preview, bundle }),
      });
      persistPreview();
    },

    setPreviewComponentStyle(componentId, style) {
      store.setState({
        preview: createVegetationPreviewSettings({
          ...state().preview,
          componentStyles: {
            ...state().preview.componentStyles,
            [componentId]: style,
          },
        }),
      });
      persistPreview();
    },

    setPreviewComponentVisible(componentId, visible) {
      store.setState({
        preview: createVegetationPreviewSettings({
          ...state().preview,
          componentVisibility: {
            ...state().preview.componentVisibility,
            [componentId]: Boolean(visible),
          },
        }),
      });
      persistPreview();
    },

    setPreviewScenePreset(scenePreset) {
      store.setState({
        preview: createVegetationPreviewSettings({
          ...state().preview,
          scenePreset,
        }),
      });
      persistPreview();
    },

    setPreviewHour(previewHour) {
      const value = Number(previewHour);
      if (!Number.isFinite(value)) return;
      store.setState({ previewHour: ((value % 24) + 24) % 24 });
      persistPreview();
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
      persistPreview();
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
