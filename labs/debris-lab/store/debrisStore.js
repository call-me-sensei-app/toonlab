import { createStore } from '../../shared/ui/createStore.js';
import {
  BUILT_IN_DEBRIS_PRESETS,
  DEBRIS_TYPES,
  DEBRIS_TYPE_DEFAULTS,
  DEBRIS_TYPE_FIELDS,
  applyDebrisStyle,
  createDebrisRecipeDocument,
  createDebrisSettings,
  findDebrisPreset,
  getDebrisStyleOptions,
  rebaseDebrisSettingsStyle,
  resolveDebrisStyleName,
  validateDebrisRecipeDocument,
} from '../../../src/debrisgen/index.js';
import {
  clearDebrisDocument,
  loadDebrisDocument,
  loadLocalDebrisPresets,
  saveDebrisDocument,
  upsertLocalDebrisPreset,
} from '../debrisProjectStore.js';

const UNDO_LIMIT = 50;
const HISTORY_COALESCE_MS = 500;
const DEFAULT_DEBRIS_STYLE = 'call_me_sensei';
const VARIANT_LAYOUT_DEFAULTS = Object.freeze({
  antler: Object.freeze({ count: 2, spread: 1.1 }),
  ashPile: Object.freeze({ count: 14, spread: 0.65 }),
  barkChips: Object.freeze({ count: 18, spread: 1.4 }),
  branch: Object.freeze({ count: 1, spread: 0 }),
  bricks: Object.freeze({ count: 11, spread: 1.45 }),
  campfire: Object.freeze({ count: 10, spread: 0.5 }),
  cans: Object.freeze({ count: 9, spread: 1.45 }),
  charcoal: Object.freeze({ count: 18, spread: 1.15 }),
  driftwood: Object.freeze({ count: 1, spread: 0 }),
  gems: Object.freeze({ count: 8, spread: 1.05 }),
  jawBone: Object.freeze({ count: 3, spread: 1.05 }),
  leafLitter: Object.freeze({ count: 28, spread: 1.8 }),
  logs: Object.freeze({ count: 6, spread: 1.2 }),
  longBone: Object.freeze({ count: 5, spread: 1.35 }),
  meteor: Object.freeze({ count: 5, spread: 1.3 }),
  obsidian: Object.freeze({ count: 9, spread: 1.2 }),
  pinecones: Object.freeze({ count: 10, spread: 1.4 }),
  planks: Object.freeze({ count: 7, spread: 1.4 }),
  riverstones: Object.freeze({ count: 15, spread: 1.35 }),
  rootStump: Object.freeze({ count: 1, spread: 0 }),
  rubble: Object.freeze({ count: 13, spread: 1.55 }),
  sawdust: Object.freeze({ count: 10, spread: 0.6 }),
  scrapPile: Object.freeze({ count: 12, spread: 1.5 }),
  shards: Object.freeze({ count: 17, spread: 1.6 }),
  sheets: Object.freeze({ count: 5, spread: 1.35 }),
  shells: Object.freeze({ count: 13, spread: 1.55 }),
  skull: Object.freeze({ count: 1, spread: 0 }),
  twigPile: Object.freeze({ count: 12, spread: 1.25 }),
});

function randomSeed() {
  return Math.floor(Math.random() * 100000) >>> 0;
}

function slug(value) {
  return String(value || 'debris').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function findAnyPreset(id) {
  return findDebrisPreset(id) ?? loadLocalDebrisPresets().find((entry) => entry.id === id) ?? null;
}

function bootDocument(urlParams) {
  const encoded = urlParams.get('debrisRecipe') || urlParams.get('recipe');
  if (encoded) {
    try {
      const document = JSON.parse(encoded);
      if (validateDebrisRecipeDocument(document).ok) {
        const styleId = resolveDebrisStyleName(urlParams.get('debrisStyle'));
        return {
          baseSettings: createDebrisSettings(document.settings),
          bootSource: 'url',
          name: document.name || 'Shared debris',
          presetId: null,
          settings: applyDebrisStyle(document.settings, styleId),
          styleId,
        };
      }
    } catch { /* fall through to persisted/fresh */ }
  }
  const requestedPreset = urlParams.get('debrisPreset');
  const legacyStyle = getDebrisStyleOptions().some((entry) => entry.id === requestedPreset)
    ? requestedPreset
    : null;
  if (requestedPreset || urlParams.has('debrisStyle')) {
    const presetId = legacyStyle ? 'bleached-driftwood' : requestedPreset;
    const preset = findAnyPreset(presetId);
    const styleId = resolveDebrisStyleName(urlParams.get('debrisStyle') ?? legacyStyle);
    return {
      baseSettings: createDebrisSettings(preset?.settings ?? createDebrisSettings()),
      bootSource: 'url',
      name: preset?.label ?? 'Untitled debris',
      presetId: preset?.id ?? null,
      settings: applyDebrisStyle(preset?.settings ?? createDebrisSettings(), styleId),
      styleId,
    };
  }
  const saved = loadDebrisDocument();
  if (saved) return { ...saved, bootSource: 'persisted' };
  return {
    baseSettings: createDebrisSettings(),
    bootSource: 'fresh',
    name: 'Untitled debris',
    presetId: null,
    settings: applyDebrisStyle(createDebrisSettings(), DEFAULT_DEBRIS_STYLE),
    styleId: DEFAULT_DEBRIS_STYLE,
  };
}

export function createDebrisStore({ urlParams = new URLSearchParams(window.location.search) } = {}) {
  const boot = bootDocument(urlParams);
  const undoStack = [];
  const redoStack = [];
  let lastHistoryKey = null;
  let lastHistoryTime = 0;

  const store = createStore({
    baseSettings: createDebrisSettings(boot.baseSettings ?? boot.settings),
    bootSource: boot.bootSource,
    canRedo: false,
    canUndo: false,
    docRevision: 0,
    exporting: false,
    lastChange: { immediate: false, reframe: false },
    name: boot.name,
    presetDirty: false,
    presetId: boot.presetId,
    settings: boot.settings,
    stage: 'type',
    status: boot.bootSource === 'persisted' ? 'Restored your last debris recipe.' : '',
    styleId: resolveDebrisStyleName(boot.styleId ?? 'default'),
    view: { drawer: false, export: false, gallery: boot.bootSource === 'fresh' },
  });

  const state = () => store.getState();
  const snapshot = () => JSON.stringify({
    baseSettings: state().baseSettings,
    name: state().name,
    presetDirty: state().presetDirty,
    presetId: state().presetId,
    settings: state().settings,
    styleId: state().styleId,
  });

  function persist() {
    saveDebrisDocument({
      baseSettings: state().baseSettings,
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

  function commit(patch, { immediate = false, reframe = false, status = null } = {}) {
    const nextPatch = patch.settings && patch.baseSettings === undefined
      ? {
        ...patch,
        baseSettings: rebaseDebrisSettingsStyle(patch.settings, {
          baseSettings: state().baseSettings,
          fromStyle: state().styleId,
          toStyle: 'default',
        }),
      }
      : patch;
    store.setState((previous) => ({
      ...nextPatch,
      docRevision: previous.docRevision + 1,
      lastChange: { immediate, reframe },
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
      baseSettings: createDebrisSettings(document.baseSettings ?? document.settings),
      settings: createDebrisSettings(document.settings),
    }, { immediate: true, reframe: true, status: 'History restored.' });
  }

  function replaceForStart(settings, {
    baseSettings = settings,
    name,
    presetId = null,
    status,
    styleId = state().styleId,
  }) {
    pushHistory();
    store.setState({
      baseSettings: createDebrisSettings(baseSettings),
      bootSource: 'started',
      name,
      presetDirty: false,
      presetId,
      stage: 'type',
      styleId: resolveDebrisStyleName(styleId),
      view: { drawer: false, export: false, gallery: false },
    });
    commit({
      baseSettings: createDebrisSettings(baseSettings),
      settings: createDebrisSettings(settings),
    }, { immediate: true, reframe: true, status });
  }

  store.actions = {
    applyPreset(id) {
      const preset = findAnyPreset(id);
      if (!preset) return false;
      replaceForStart(applyDebrisStyle(preset.settings, state().styleId), {
        baseSettings: preset.settings,
        name: preset.label,
        presetId: preset.id,
        styleId: state().styleId,
        status: `Opened ${preset.label}.`,
      });
      return true;
    },

    getRecipeDocument() {
      return createDebrisRecipeDocument(state().baseSettings, { name: state().name });
    },

    importRecipe(text) {
      try {
        const document = JSON.parse(text);
        const result = validateDebrisRecipeDocument(document);
        if (!result.ok) return result;
        replaceForStart(document.settings, {
          baseSettings: document.settings,
          name: document.name || 'Imported debris',
          styleId: 'default',
          status: `Imported ${document.name || 'debris recipe'}.`,
        });
        return { errors: [], ok: true };
      } catch (error) {
        return { errors: [`Invalid JSON: ${error.message}`], ok: false };
      }
    },

    randomizeCurrent() {
      const current = state().settings;
      const fields = DEBRIS_TYPE_FIELDS[current.asset.type];
      const shape = { ...current.shape };
      for (const field of fields) {
        const steps = Math.round((field.max - field.min) / field.step);
        shape[field.key] = Number((field.min + Math.floor(Math.random() * (steps + 1)) * field.step).toFixed(6));
      }
      pushHistory();
      commit({
        presetDirty: true,
        settings: createDebrisSettings({
          ...current,
          asset: {
            ...current.asset,
            count: Math.max(1, Math.min(48, Math.round(current.asset.count * (0.6 + Math.random() * 0.9)))),
            damage: Number((0.2 + Math.random() * 0.7).toFixed(2)),
            messiness: Number((0.2 + Math.random() * 0.7).toFixed(2)),
            seed: randomSeed(),
            spread: Number((0.35 + Math.random() * 1.8).toFixed(2)),
          },
          shape,
        }),
      }, { immediate: true, reframe: true, status: `Randomized ${DEBRIS_TYPES[current.asset.type].label.toLowerCase()} recipe.` });
    },

    redo() {
      const entry = redoStack.pop();
      if (entry) restore(entry, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      clearDebrisDocument();
      replaceForStart(applyDebrisStyle(createDebrisSettings(), DEFAULT_DEBRIS_STYLE), {
        baseSettings: createDebrisSettings(),
        name: 'Untitled debris',
        styleId: DEFAULT_DEBRIS_STYLE,
        status: 'Debris Lab reset.',
      });
    },

    revertPreset() {
      if (state().presetId) this.applyPreset(state().presetId);
    },

    savePresetAs(name) {
      const cleanName = String(name || '').trim();
      if (!cleanName) return { ok: false };
      const id = `local-${slug(cleanName)}-${Date.now().toString(36)}`;
      const preset = upsertLocalDebrisPreset({
        description: 'Saved in this browser.',
        id,
        label: cleanName,
        settings: createDebrisSettings(state().baseSettings),
        type: state().settings.asset.type,
        variant: state().settings.asset.variant,
      });
      store.setState({ name: cleanName, presetDirty: false, presetId: id, status: `Saved “${cleanName}” to your library.` });
      persist();
      return { ok: true, preset };
    },

    setExporting(exporting) {
      store.setState({ exporting: Boolean(exporting) });
    },

    setField(section, key, value) {
      const current = state().settings;
      const nextValue = Number(value);
      if (!Number.isFinite(nextValue)) return;
      pushHistory(`field:${section}.${key}`);
      commit({
        presetDirty: true,
        settings: createDebrisSettings({
          ...current,
          [section]: { ...current[section], [key]: nextValue },
        }),
      }, { reframe: section === 'asset' && (key === 'scale' || key === 'spread') });
    },

    applyPalette(paletteEntry) {
      const current = state().settings;
      pushHistory();
      commit({
        presetDirty: true,
        settings: createDebrisSettings({
          ...current,
          surface: {
            ...current.surface,
            accentColor: [...paletteEntry.accentColor],
            primaryColor: [...paletteEntry.primaryColor],
            secondaryColor: [...paletteEntry.secondaryColor],
          },
        }),
      }, { status: `Applied the ${paletteEntry.label.toLowerCase()} palette.` });
    },

    setArrangement(arrangement) {
      const current = state().settings;
      pushHistory();
      commit({
        presetDirty: true,
        settings: createDebrisSettings({
          ...current,
          asset: { ...current.asset, arrangement },
        }),
      }, { immediate: true, reframe: true, status: `Arranged as ${arrangement}.` });
    },

    setTextureStyle(textureStyle) {
      const current = state().settings;
      pushHistory('textureStyle');
      commit({
        presetDirty: true,
        settings: createDebrisSettings({
          ...current,
          surface: { ...current.surface, textureStyle },
        }),
      });
    },

    setCustomTexture(customTexture) {
      const current = state().settings;
      pushHistory('customTexture');
      commit({
        presetDirty: true,
        settings: createDebrisSettings({
          ...current,
          surface: { ...current.surface, customTexture },
        }),
      }, {
        status: customTexture
          ? `Using uploaded texture “${customTexture.name}”.`
          : 'Removed the custom texture.',
      });
    },

    setName(name) {
      const next = String(name || '').trim();
      if (!next) return;
      store.setState({ name: next, presetDirty: true });
      persist();
    },

    setSeed(seed) {
      const current = state().settings;
      pushHistory('seed');
      commit({
        presetDirty: true,
        settings: createDebrisSettings({
          ...current,
          asset: { ...current.asset, seed: Math.max(0, Math.round(Number(seed) || 0)) },
        }),
      }, { immediate: true, status: 'Generated a new deterministic arrangement.' });
    },

    setStage(stage) {
      store.setState({ stage });
    },

    setStatus(status) {
      store.setState({ status: String(status || '') });
    },

    setStyle(id) {
      const styleId = resolveDebrisStyleName(id);
      if (!getDebrisStyleOptions().some((entry) => entry.id === styleId)) return false;
      const current = state();
      pushHistory();
      const settings = rebaseDebrisSettingsStyle(current.settings, {
        baseSettings: current.baseSettings,
        fromStyle: current.styleId,
        toStyle: styleId,
      });
      commit({ baseSettings: current.baseSettings, settings, styleId }, {
        immediate: true,
        status: `Applied ${getDebrisStyleOptions().find((entry) => entry.id === styleId)?.label ?? styleId} across this debris preset.`,
      });
      return true;
    },

    setSurfaceColor(key, value) {
      const current = state().settings;
      pushHistory(`color:${key}`);
      commit({
        presetDirty: true,
        settings: createDebrisSettings({
          ...current,
          surface: { ...current.surface, [key]: [...value] },
        }),
      });
    },

    setType(type) {
      if (!DEBRIS_TYPES[type]) return;
      const defaults = DEBRIS_TYPE_DEFAULTS[type];
      const current = state().settings;
      pushHistory();
      commit({
        name: `Untitled ${DEBRIS_TYPES[type].label.toLowerCase()}`,
        presetDirty: true,
        presetId: null,
        settings: applyDebrisStyle(createDebrisSettings({
          asset: {
            ...defaults.asset,
            arrangement: current.asset.arrangement,
            damage: current.asset.damage,
            messiness: current.asset.messiness,
            rotationJitter: current.asset.rotationJitter,
            scale: current.asset.scale,
            seed: current.asset.seed,
            type,
          },
          shape: defaults.shape,
          surface: { ...current.surface, ...defaults.surface },
        }), state().styleId),
      }, { immediate: true, reframe: true, status: `Switched to ${DEBRIS_TYPES[type].label}.` });
    },

    setVariant(variant) {
      const current = state().settings;
      if (!DEBRIS_TYPES[current.asset.type].variants.some((entry) => entry.id === variant)) return;
      pushHistory();
      commit({
        presetDirty: true,
        presetId: null,
        settings: createDebrisSettings({
          ...current,
          asset: { ...current.asset, ...(VARIANT_LAYOUT_DEFAULTS[variant] ?? {}), variant },
        }),
      }, { immediate: true, reframe: true });
    },

    setView(patch) {
      store.setState({ view: { ...state().view, ...patch } });
    },

    startFromScratch(type = 'wood') {
      const defaults = applyDebrisStyle(
        createDebrisSettings({ asset: { count: 1, seed: 0, spread: 0, type } }),
        state().styleId,
      );
      replaceForStart(defaults, {
        name: `Untitled ${DEBRIS_TYPES[type].label.toLowerCase()}`,
        status: 'Started from a single clean procedural piece.',
      });
    },

    startProcedural() {
      const types = Object.keys(DEBRIS_TYPES);
      const type = types[Math.floor(Math.random() * types.length)];
      const variants = DEBRIS_TYPES[type].variants;
      const variant = variants[Math.floor(Math.random() * variants.length)].id;
      const presets = BUILT_IN_DEBRIS_PRESETS.filter((entry) => entry.type === type && entry.variant === variant);
      const base = presets[0]?.settings ?? createDebrisSettings({ asset: { type, variant } });
      const settings = applyDebrisStyle(createDebrisSettings({
        ...base,
        asset: { ...base.asset, seed: randomSeed(), type, variant },
      }), state().styleId);
      replaceForStart(settings, {
        name: `Random ${DEBRIS_TYPES[type].label.toLowerCase()}`,
        status: `Generated random ${DEBRIS_TYPES[type].label.toLowerCase()} debris.`,
      });
      // Make more than the seed random while retaining the coherent base recipe.
      this.randomizeCurrent();
    },

    undo() {
      const entry = undoStack.pop();
      if (entry) restore(entry, redoStack);
      updateHistoryFlags();
    },
  };

  return store;
}
