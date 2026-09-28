import { createStore } from '../../shared/ui/createStore.js';
import {
  DEFAULT_HERO_CLOUD_RECIPE,
  createHeroCloudRecipe,
  parseHeroCloudRecipe,
} from '../../../src/cloud/index.js';
import {
  DEFAULT_PRESET_NAME,
  PRESETS,
  SKY_STYLE_SNAPSHOT_IDS,
  createSkyParams,
  parseSkyParamsDocument,
  matchSkyStyleSnapshot,
  resolveSkyStyleSnapshot,
  toSerializableSkyParams,
} from '../../../src/sky/index.js';
import { serializeSingleSlotStyleBundle } from '../../shared/runtimeStyleBundle.js';
import {
  CALL_ME_SENSEI_SYSTEM_STYLE_ID,
  isProtectedSystemStyleId,
} from '../../../src/core/systemStylePolicy.js';
import { resolveQualityLevelName } from '../../../src/sky/skyQualityTiers.js';
import {
  getWeatherPresetOptions,
} from '../../../src/weather/index.js';
import {
  resolveCameraViewId,
  resolveLightingViewId,
} from './comparisonViews.js';
import {
  CLOUD_WORKSPACE,
  SKY_WORKSPACE,
  resolveLabTab,
  resolveLabWorkspace,
} from './labWorkspaces.js';
import {
  createWorkspaceStyleDocument,
  deleteSkyCloudStyle,
  loadSkyCloudStyles,
  upsertSkyCloudStyle,
} from './workspaceStyleStore.js';

export const SKY_CLOUD_LAB_STORAGE_KEY = 'toonlab.volumetricSkyLab.v13';
const LEGACY_SKY_CLOUD_LAB_STORAGE_KEYS = [
  'toonlab.volumetricSkyLab.v12',
  'toonlab.volumetricSkyLab.v11',
  'toonlab.volumetricSkyLab.v10',
  'toonlab.volumetricSkyLab.v9',
  'toonlab.volumetricSkyLab.v8',
  'toonlab.volumetricSkyLab.v7',
  'toonlab.volumetricSkyLab.v6',
  'toonlab.volumetricSkyLab.v5',
  'toonlab.volumetricSkyLab.v4',
  'toonlab.volumetricSkyLab.v3',
  'toonlab.volumetricSkyLab.v2',
  'toonlab.volumetricSkyLab.v1',
];

export const NO_WEATHER_CONDITION = 'none';
export const SKY_WEATHER_OPTIONS = Object.freeze([
  Object.freeze({
    description: 'No transient weather layer. Shows the selected sky preset exactly as authored.',
    id: NO_WEATHER_CONDITION,
    label: 'None (authored sky)',
  }),
  ...getWeatherPresetOptions().map((option) => Object.freeze({ ...option })),
]);
const SKY_WEATHER_IDS = new Set(SKY_WEATHER_OPTIONS.map(({ id }) => id));
const FINAL_LAB_STYLE_SNAPSHOT = SKY_STYLE_SNAPSHOT_IDS.includes('2.10')
  ? '2.10'
  : SKY_STYLE_SNAPSHOT_IDS[SKY_STYLE_SNAPSHOT_IDS.length - 1];
const COMPARISON_MODES = new Set(['physical', 'styled']);
const WORKSPACE_VIEW_DEFAULTS = Object.freeze({
  cloud: Object.freeze({
    cameraView: 'upward',
    comparisonMode: 'styled',
    lightingView: 'high-daylight',
    quality: 'high',
    weatherCondition: NO_WEATHER_CONDITION,
  }),
  integration: Object.freeze({
    cameraView: 'upward',
    comparisonMode: 'styled',
    lightingView: 'preset',
    quality: 'high',
    weatherCondition: NO_WEATHER_CONDITION,
  }),
  sky: Object.freeze({
    cameraView: 'horizon-side',
    comparisonMode: 'styled',
    lightingView: 'high-daylight',
    quality: 'high',
    weatherCondition: NO_WEATHER_CONDITION,
  }),
});

export function resolveCloudComparisonMode(value) {
  return COMPARISON_MODES.has(value) ? value : 'styled';
}

export function resolveSkyWeatherId(value) {
  const requested = String(value ?? '').trim();
  return SKY_WEATHER_IDS.has(requested) ? requested : NO_WEATHER_CONDITION;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function slug(value) {
  return String(value || 'sky-style')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'sky_style';
}

function presetParams(name, styles = null) {
  const base = PRESETS[name] ?? PRESETS[DEFAULT_PRESET_NAME];
  return toSerializableSkyParams(createSkyParams({
    ...base,
    atmosphere: {
      ...base.atmosphere,
      style: styles?.skyColor ?? base.atmosphere.style,
    },
    cloud: {
      ...base.cloud,
      style: styles?.cloudStyle ?? base.cloud.style,
    },
  }));
}

function readSaved() {
  try {
    const text = localStorage.getItem(SKY_CLOUD_LAB_STORAGE_KEY)
      ?? LEGACY_SKY_CLOUD_LAB_STORAGE_KEYS
        .map((key) => localStorage.getItem(key))
        .find(Boolean);
    const value = JSON.parse(text);
    if (!value || typeof value !== 'object') return null;
    return value;
  } catch {
    return null;
  }
}

const DOCUMENT_FIELDS = ['activeStyleId', 'params', 'preset',
  'styleDirty', 'styleName', 'styleSnapshot'];
const PREVIEW_FIELDS = ['cameraView', 'comparisonMode', 'lightingView',
  'quality', 'weatherCondition'];

function writeSaved(state, patch) {
  try {
    const current = readSaved() ?? {};
    const workspaceViews = current.workspaceViews && typeof current.workspaceViews === 'object'
      ? current.workspaceViews
      : {};
    const authored = DOCUMENT_FIELDS.filter((key) => key in patch);
    // An authored action saves one coherent snapshot. Preview-only actions
    // must preserve the latest snapshot, which may belong to another tab.
    const document = authored.length
      ? Object.fromEntries(DOCUMENT_FIELDS.map((key) => [key, state[key]]))
      : {};
    const preview = PREVIEW_FIELDS.filter((key) => key in patch);
    localStorage.setItem(SKY_CLOUD_LAB_STORAGE_KEY, JSON.stringify({
      ...current,
      ...document,
      ...('heroRecipe' in patch ? { heroRecipe: state.heroRecipe } : {}),
      workspaceViews: {
        ...workspaceViews,
        [state.workspace]: {
          ...workspaceViews[state.workspace],
          ...Object.fromEntries(preview.map((key) => [key, state[key]])),
        },
      },
    }));
  } catch {
    // The lab remains fully usable when storage is unavailable.
  }
}

function setPath(source, path, value) {
  const next = clone(source);
  let cursor = next;
  for (let index = 0; index < path.length - 1; index += 1) cursor = cursor[path[index]];
  cursor[path[path.length - 1]] = value;
  return toSerializableSkyParams(createSkyParams(next));
}

function setRecipePath(source, path, value) {
  const next = clone(source);
  let cursor = next;
  for (let index = 0; index < path.length - 1; index += 1) cursor = cursor[path[index]];
  cursor[path[path.length - 1]] = value;
  return createHeroCloudRecipe(next);
}

export function createSkyCloudLabStore({
  initialTab = 'preview',
  urlParams,
  workspace = 'integration',
} = {}) {
  const query = urlParams ?? new URLSearchParams(location.search);
  const resolvedWorkspace = resolveLabWorkspace(workspace).id;
  const requestedPreset = query.get('preset');
  const requestedStyle = query.get('skyStyle') || query.get('style');
  const requestedQuality = query.get('quality');
  const requestedSnapshot = query.get('snapshot');
  const requestedSeed = Number(query.get('seed'));
  const requestedWeather = query.get('condition');
  const capture = query.get('capture') === '1';
  const saved = capture ? null : readSaved();
  const savedStyles = capture ? [] : loadSkyCloudStyles();
  const viewDefaults = WORKSPACE_VIEW_DEFAULTS[resolvedWorkspace];
  const savedView = saved?.workspaceViews?.[resolvedWorkspace];
  const comparisonMode = resolveCloudComparisonMode(
    query.get('compare') ?? savedView?.comparisonMode ?? viewDefaults.comparisonMode,
  );
  const cameraView = resolveCameraViewId(
    query.get('camera') ?? savedView?.cameraView ?? viewDefaults.cameraView,
  );
  const lightingView = resolveLightingViewId(
    query.get('lighting') ?? savedView?.lightingView ?? viewDefaults.lightingView,
  );
  const preset = requestedPreset in PRESETS
    ? requestedPreset
    : (saved?.preset in PRESETS ? saved.preset : DEFAULT_PRESET_NAME);
  const quality = resolveQualityLevelName(
    requestedQuality ?? savedView?.quality ?? viewDefaults.quality,
  );
  const weatherCondition = resolveSkyWeatherId(
    requestedWeather ?? savedView?.weatherCondition ?? viewDefaults.weatherCondition,
  );
  const heroPreview = query.get('hero') === '1' || initialTab === 'hero-cloud';
  const heroRecipe = createHeroCloudRecipe(saved?.heroRecipe ?? DEFAULT_HERO_CLOUD_RECIPE);
  const requestedSnapshotIsKnown = SKY_STYLE_SNAPSHOT_IDS.includes(requestedSnapshot);
  let styleSnapshot = requestedSnapshotIsKnown
    ? requestedSnapshot
    : (SKY_STYLE_SNAPSHOT_IDS.includes(saved?.styleSnapshot)
      ? saved.styleSnapshot
      : FINAL_LAB_STYLE_SNAPSHOT);
  let params;
  try {
    params = requestedPreset || requestedSnapshotIsKnown || !saved?.params
      ? presetParams(preset, resolveSkyStyleSnapshot(styleSnapshot))
      : toSerializableSkyParams(createSkyParams(saved.params));
  } catch {
    styleSnapshot = FINAL_LAB_STYLE_SNAPSHOT;
    params = presetParams(preset, resolveSkyStyleSnapshot(styleSnapshot));
  }
  styleSnapshot = matchSkyStyleSnapshot(params) ?? 'custom';
  if (Number.isFinite(requestedSeed) && query.has('seed')) {
    params = toSerializableSkyParams(createSkyParams({
      ...params,
      noise: {
        ...params.noise,
        weather: { ...params.noise.weather, seed: requestedSeed },
      },
    }));
  }
  if (capture) params.time.autoAdvanceSecondsPerDay = 0;

  const restoredStyleId = isProtectedSystemStyleId(saved?.activeStyleId)
    ? CALL_ME_SENSEI_SYSTEM_STYLE_ID
    : (savedStyles.some((entry) => entry.id === saved?.activeStyleId) ? saved.activeStyleId : null);
  const initialStyleId = restoredStyleId
    ?? (!saved?.params && styleSnapshot === FINAL_LAB_STYLE_SNAPSHOT
      ? CALL_ME_SENSEI_SYSTEM_STYLE_ID
      : null);
  const store = createStore({
    activeStyleId: initialStyleId,
    activeTab: resolveLabTab(resolvedWorkspace, initialTab),
    applying: true,
    cameraView,
    capture,
    comparisonMode,
    engineReady: false,
    entryError: null,
    heroPreview,
    heroRecipe,
    lightingView,
    params,
    preset,
    quality,
    revision: 0,
    status: 'Building the authored environment…',
    savedStyles,
    styleDirty: Boolean(saved?.styleDirty),
    styleName: isProtectedSystemStyleId(initialStyleId)
      ? 'Call Me Sensei'
      : (typeof saved?.styleName === 'string' && saved.styleName.trim()
        ? saved.styleName.trim()
        : `${preset} ${resolveLabWorkspace(resolvedWorkspace).label.replace(' Lab', '')}`),
    styleSnapshot,
    weatherCondition,
    workspace: resolvedWorkspace,
  });

  function commit(patch, status) {
    store.setState((previous) => ({
      ...patch,
      revision: previous.revision + 1,
      status,
    }));
    if (!store.getState().capture) writeSaved(store.getState(), patch);
  }

  function styleDocument(current = store.getState(), { id, label } = {}) {
    return createWorkspaceStyleDocument(
      id ?? current.activeStyleId ?? slug(current.styleName),
      {
        description: `${resolveLabWorkspace(resolvedWorkspace).label} style exported from ToonLab.`,
        label: label ?? current.styleName,
        params: current.params,
      },
    );
  }

  function refreshStyleLibrary() {
    store.setState({ savedStyles: loadSkyCloudStyles() });
  }

  store.actions = {
    adoptEngineState(patch) {
      store.setState(patch);
    },

    createNewStyle() {
      const defaults = WORKSPACE_VIEW_DEFAULTS[resolvedWorkspace];
      const styleSnapshot = FINAL_LAB_STYLE_SNAPSHOT;
      commit({
        entryError: null,
        activeStyleId: CALL_ME_SENSEI_SYSTEM_STYLE_ID,
        activeTab: resolveLabTab(resolvedWorkspace, 'preview'),
        cameraView: defaults.cameraView,
        comparisonMode: defaults.comparisonMode,
        heroPreview: false,
        heroRecipe: createHeroCloudRecipe(DEFAULT_HERO_CLOUD_RECIPE),
        lightingView: defaults.lightingView,
        params: presetParams(DEFAULT_PRESET_NAME, resolveSkyStyleSnapshot(styleSnapshot)),
        preset: DEFAULT_PRESET_NAME,
        quality: defaults.quality,
        styleDirty: false,
        styleName: 'Call Me Sensei',
        styleSnapshot,
        weatherCondition: defaults.weatherCondition,
      }, `New ${resolveLabWorkspace(resolvedWorkspace).label} style started.`);
    },

    importJson(text) {
      try {
        const input = JSON.parse(text);
        const parsedDocument = input?.type ? parseSkyParamsDocument(input) : null;
        if (parsedDocument && !parsedDocument.ok) throw new Error(parsedDocument.errors.join(' '));
        const paramsValue = toSerializableSkyParams(createSkyParams(
          parsedDocument?.value?.params ?? input,
        ));
        const matched = matchSkyStyleSnapshot(paramsValue) ?? 'custom';
        commit({
          entryError: null,
          heroPreview: false,
          activeStyleId: parsedDocument?.value?.id ?? null,
          lightingView: 'custom',
          params: paramsValue,
          styleDirty: parsedDocument ? false : true,
          styleName: parsedDocument?.value?.label ?? 'Imported sky style',
          styleSnapshot: matched,
        }, 'Imported and normalized SkyParams.');
      } catch (error) {
        store.setState({ status: `Import failed: ${error.message}` });
      }
    },

    importHeroJson(text) {
      try {
        const parsed = parseHeroCloudRecipe(JSON.parse(text));
        if (!parsed.ok) {
          store.setState({ status: `Hero-cloud import failed: ${parsed.errors.join(' ')}` });
          return;
        }
        commit({ heroRecipe: parsed.value, heroPreview: true }, parsed.warnings.length
          ? `Hero-cloud recipe imported. ${parsed.warnings.join(' ')}`
          : 'Hero-cloud recipe imported.');
      } catch (error) {
        store.setState({ status: `Hero-cloud import failed: ${error.message}` });
      }
    },

    resetPreset() {
      const state = store.getState();
      const styles = state.styleSnapshot === 'custom'
        ? {
          cloudStyle: state.params.cloud.style,
          skyColor: state.params.atmosphere.style,
        }
        : resolveSkyStyleSnapshot(state.styleSnapshot);
      const lightingView = state.lightingView === 'custom' ? 'preset' : state.lightingView;
      const paramsValue = presetParams(state.preset, styles);
      commit({
        activeStyleId: null,
        heroPreview: false,
        lightingView,
        params: paramsValue,
        styleDirty: false,
        styleName: `${state.preset} ${resolveLabWorkspace(resolvedWorkspace).label.replace(' Lab', '')}`,
      }, 'Preset restored.');
    },

    setActiveTab(activeTab) {
      const resolvedTab = resolveLabTab(resolvedWorkspace, activeTab);
      const current = store.getState();
      const forceStyled = resolvedWorkspace === CLOUD_WORKSPACE
        && resolvedTab !== 'preview';
      const heroPreview = resolvedTab === 'hero-cloud';
      if (heroPreview !== current.heroPreview
        || (forceStyled && current.comparisonMode !== 'styled')) {
        commit({
          activeTab: resolvedTab,
          comparisonMode: forceStyled ? 'styled' : current.comparisonMode,
          heroPreview,
        }, heroPreview ? 'Hero-cloud preview enabled.' : 'Authored cloud field restored.');
        return;
      }
      store.setState({ activeTab: resolvedTab });
    },

    addHeroStroke(stroke) {
      const current = store.getState().heroRecipe;
      const heroRecipeValue = createHeroCloudRecipe({
        ...current,
        footprint: {
          ...current.footprint,
          strokes: [...current.footprint.strokes, stroke],
        },
      });
      commit({ heroRecipe: heroRecipeValue, heroPreview: true }, 'Hero-cloud footprint updated.');
    },

    clearHeroFootprint() {
      const current = store.getState().heroRecipe;
      const heroRecipeValue = createHeroCloudRecipe({
        ...current,
        footprint: { ...current.footprint, strokes: [] },
      });
      commit({ heroRecipe: heroRecipeValue }, 'Hero-cloud footprint cleared.');
    },

    resetHeroRecipe() {
      commit({
        heroPreview: true,
        heroRecipe: createHeroCloudRecipe(DEFAULT_HERO_CLOUD_RECIPE),
      }, 'Hero-cloud example restored.');
    },

    setHeroPreview(heroPreviewValue) {
      commit({ heroPreview: Boolean(heroPreviewValue) }, heroPreviewValue
        ? 'Hero-cloud preview enabled.'
        : 'Hero-cloud preview disabled.');
    },

    setHeroRecipe(path, value) {
      const heroRecipeValue = setRecipePath(store.getState().heroRecipe, path, value);
      commit({ heroRecipe: heroRecipeValue }, `heroCloud.${path.join('.')} updated.`);
    },

    stepHeroSeed() {
      const current = store.getState().heroRecipe;
      const heroRecipeValue = createHeroCloudRecipe({ ...current, seed: current.seed + 1 });
      commit({ heroRecipe: heroRecipeValue, heroPreview: true }, `Hero-cloud seed ${heroRecipeValue.seed}.`);
    },

    setParam(path, value) {
      const paramsValue = setPath(store.getState().params, path, value);
      const editsStyle = path[1] === 'style'
        && (path[0] === 'cloud' || path[0] === 'atmosphere');
      const styleSnapshot = editsStyle
        ? (matchSkyStyleSnapshot(paramsValue) ?? 'custom')
        : store.getState().styleSnapshot;
      const editsLighting = path[0] === 'sun' || path[0] === 'time';
      commit({
        comparisonMode: resolvedWorkspace === CLOUD_WORKSPACE
          ? 'styled'
          : store.getState().comparisonMode,
        lightingView: editsLighting ? 'custom' : store.getState().lightingView,
        params: paramsValue,
        styleDirty: true,
        styleSnapshot,
      }, `${path.join('.')} updated.`);
    },

    setPreset(presetName) {
      if (!(presetName in PRESETS)) return;
      const lightingView = store.getState().lightingView === 'custom'
        ? 'preset'
        : store.getState().lightingView;
      const paramsValue = presetParams(presetName, {
        cloudStyle: store.getState().params.cloud.style,
        skyColor: store.getState().params.atmosphere.style,
      });
      commit({
        activeStyleId: null,
        heroPreview: false,
        lightingView,
        params: paramsValue,
        preset: presetName,
        styleDirty: false,
        styleName: `${presetName} ${resolveLabWorkspace(resolvedWorkspace).label.replace(' Lab', '')}`,
      }, `Applied ${presetName}.`);
    },

    setCameraView(cameraView) {
      const resolved = resolveCameraViewId(cameraView);
      commit({ cameraView: resolved }, `Camera set to ${resolved}.`);
    },

    setLightingView(lightingView) {
      const resolved = resolveLightingViewId(lightingView);
      commit({ lightingView: resolved }, `Comparison light set to ${resolved}.`);
    },

    setStyleSnapshot(snapshotId) {
      if (!SKY_STYLE_SNAPSHOT_IDS.includes(snapshotId)) return;
      const current = store.getState().params;
      const snapshot = resolveSkyStyleSnapshot(snapshotId);
      const paramsValue = toSerializableSkyParams(createSkyParams({
        ...current,
        atmosphere: {
          ...current.atmosphere,
          style: snapshot.skyColor,
        },
        cloud: {
          ...current.cloud,
          style: snapshot.cloudStyle,
        },
      }));
      commit({ params: paramsValue, styleDirty: true, styleSnapshot: snapshotId }, `Applied style snapshot ${snapshotId}.`);
    },

    preserveCloudVolumeDetail() {
      const current = store.getState().params;
      const style = current.cloud.style;
      const params = toSerializableSkyParams(createSkyParams({
        ...current,
        cloud: { ...current.cloud, style: {
          ...style,
          innerPaint: { ...style.innerPaint, amount: 0.55 },
          whiteTop: { ...style.whiteTop, area: 0.6, detail: 0.65 },
        } },
      }));
      commit({ params, comparisonMode: 'styled', styleDirty: true,
        styleSnapshot: matchSkyStyleSnapshot(params) ?? 'custom' }, 'Billow shading detail restored.');
    },

    setWeatherCondition(weatherCondition) {
      const resolved = resolveSkyWeatherId(weatherCondition);
      commit({ weatherCondition: resolved }, `Weather condition set to ${resolved}.`);
    },

    setQuality(qualityName) {
      commit({ quality: resolveQualityLevelName(qualityName) }, `Quality set to ${qualityName}.`);
    },

    setComparisonMode(value) {
      const resolved = resolveCloudComparisonMode(value);
      commit({ comparisonMode: resolved }, resolved === 'physical'
        ? 'Showing the unchanged physical cloud volume.'
        : 'Showing the authored stylized cloud result.');
    },

    deleteStyle(id) {
      if (isProtectedSystemStyleId(id)) return false;
      const removed = deleteSkyCloudStyle(id);
      refreshStyleLibrary();
      if (removed && store.getState().activeStyleId === id) {
        const current = store.getState();
        commit({
          activeStyleId: CALL_ME_SENSEI_SYSTEM_STYLE_ID,
          params: presetParams(current.preset, resolveSkyStyleSnapshot(FINAL_LAB_STYLE_SNAPSHOT)),
          styleDirty: false,
          styleName: 'Call Me Sensei',
          styleSnapshot: FINAL_LAB_STYLE_SNAPSHOT,
        }, 'Saved style deleted. Call Me Sensei restored.');
      }
      return removed;
    },

    exportStyleBundle() {
      if (resolvedWorkspace === SKY_WORKSPACE) {
        throw new Error('Sky treatments require the full SkyParams export; a sky-only bundle is not supported.');
      }
      const current = store.getState();
      return serializeSingleSlotStyleBundle({
        description: `${current.styleName} volumetric cloud treatment. Apply the full SkyParams document to SkySystem for the exact integrated sky.`,
        label: current.styleName,
        slotId: 'cloud',
        styleDocument: styleDocument(current),
      });
    },

    exportStyleDocument() {
      return JSON.stringify(styleDocument(), null, 2);
    },

    openStyle(id) {
      if (isProtectedSystemStyleId(id)) {
        const current = store.getState();
        commit({
          entryError: null,
          heroPreview: false,
          activeStyleId: CALL_ME_SENSEI_SYSTEM_STYLE_ID,
          lightingView: 'custom',
          params: presetParams(current.preset, resolveSkyStyleSnapshot(FINAL_LAB_STYLE_SNAPSHOT)),
          styleDirty: false,
          styleName: 'Call Me Sensei',
          styleSnapshot: FINAL_LAB_STYLE_SNAPSHOT,
        }, 'Opened “Call Me Sensei” system style.');
        return true;
      }
      const entry = loadSkyCloudStyles().find((candidate) => candidate.id === id);
      if (!entry) return false;
      const paramsValue = toSerializableSkyParams(createSkyParams(entry.document.params));
      commit({
        entryError: null,
        heroPreview: false,
        activeStyleId: entry.id,
        lightingView: 'custom',
        params: paramsValue,
        savedStyles: loadSkyCloudStyles(),
        styleDirty: false,
        styleName: entry.label,
        styleSnapshot: matchSkyStyleSnapshot(paramsValue) ?? 'custom',
      }, `Opened “${entry.label}”.`);
      return true;
    },

    saveStyleAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['Style name is required.'], ok: false };
      const id = `local_${slug(cleanName)}_${Date.now().toString(36)}`;
      let document;
      try {
        document = styleDocument(store.getState(), { id, label: cleanName });
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      const savedDocument = upsertSkyCloudStyle({ document, workspace: resolvedWorkspace });
      if (!savedDocument) return { errors: ['Browser storage rejected the style.'], ok: false };
      commit({
        activeStyleId: savedDocument.id,
        savedStyles: loadSkyCloudStyles(),
        styleDirty: false,
        styleName: savedDocument.label,
      }, `Saved “${savedDocument.label}”.`);
      return { document: savedDocument, ok: true };
    },

    setStyleName(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return;
      commit({ styleDirty: true, styleName: cleanName }, 'Style name updated.');
    },

    updateStyle(name = store.getState().styleName) {
      const current = store.getState();
      if (!current.activeStyleId) return { errors: ['Open a saved style before using Update.'], ok: false };
      if (isProtectedSystemStyleId(current.activeStyleId)) {
        return { errors: ['Call Me Sensei is a read-only system style. Use Save As to create an editable copy.'], ok: false };
      }
      const cleanName = String(name || '').trim();
      if (!cleanName) return { errors: ['Style name is required.'], ok: false };
      let document;
      try {
        document = styleDocument(current, { id: current.activeStyleId, label: cleanName });
      } catch (error) {
        return { errors: [error.message], ok: false };
      }
      const savedDocument = upsertSkyCloudStyle({ document, workspace: resolvedWorkspace });
      if (!savedDocument) return { errors: ['Browser storage rejected the style.'], ok: false };
      commit({
        savedStyles: loadSkyCloudStyles(),
        styleDirty: false,
        styleName: savedDocument.label,
      }, `Updated “${savedDocument.label}”.`);
      return { document: savedDocument, ok: true };
    },
  };

  if (requestedStyle && !store.actions.openStyle(requestedStyle)) {
    store.setState({
      entryError: `Could not open sky style “${requestedStyle}”. It is not available in this browser. Open a saved style or import its SkyParams document.`,
    });
  }

  return store;
}
