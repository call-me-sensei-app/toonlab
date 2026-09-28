// VFX Lab state owns isolated effect projects:
//
// 1. Each project has one portable VFX Effect document.
// 2. Each effect references independent procedural or file-backed VFX Source
//    documents. Uploaded binaries persist in IndexedDB; portable metadata
//    uses SHA-256 identity and project:// URIs.
// 3. Legacy system settings remain available only through compatibility APIs;
//    they are not mixed into the single-effect editor.
//
// Preview-only state (loop and chargePreview) never enters the exported
// document.

import { createStore } from '../../shared/ui/createStore.js';
import {
  createChargedShotDefaultSources,
  createFileVfxSource,
  createProceduralVfxSource,
  createVfxEffectFromTemplate,
  createVfxSettings,
  DEFAULT_VFX_SETTINGS,
  getVfxEffectParameterValues,
  getVfxEffectTemplate,
  parseVfxSourceDocument,
  parseVfxEffectDocument,
  resolveVfxStyle,
  resolveVfxStyleName,
  setVfxEffectParameterValues,
  validateVfxEffectDocument,
  VFX_SOURCE_MAX_FILE_BYTES,
} from '../../../src/vfxgen/index.js';

const DEFAULT_TEMPLATE_ID = 'charged-energy-shot';
const PROJECT_STORAGE_KEY = 'toonlab:vfx-effect-projects:v1';
const SOURCE_DB_NAME = 'toonlab-vfx-source-files';
const SOURCE_DB_STORE = 'files';
const ACCEPTED_SOURCE_TYPES = new Set([
  'image/gif',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/webm',
]);

function hasBrowserStorage() {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

function openSourceDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(SOURCE_DB_NAME, 1);
    request.addEventListener('upgradeneeded', () => {
      if (!request.result.objectStoreNames.contains(SOURCE_DB_STORE)) {
        request.result.createObjectStore(SOURCE_DB_STORE);
      }
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
}

async function storeSourceBlob(sha256, blob) {
  const database = await openSourceDatabase();
  if (!database) return false;
  await new Promise((resolve, reject) => {
    const transaction = database.transaction(SOURCE_DB_STORE, 'readwrite');
    transaction.objectStore(SOURCE_DB_STORE).put(blob, sha256);
    transaction.addEventListener('complete', resolve, { once: true });
    transaction.addEventListener('error', () => reject(transaction.error), { once: true });
  });
  database.close();
  return true;
}

async function loadSourceBlob(sha256) {
  const database = await openSourceDatabase();
  if (!database) return null;
  const result = await new Promise((resolve, reject) => {
    const request = database.transaction(SOURCE_DB_STORE, 'readonly')
      .objectStore(SOURCE_DB_STORE).get(sha256);
    request.addEventListener('success', () => resolve(request.result ?? null), { once: true });
    request.addEventListener('error', () => reject(request.error), { once: true });
  });
  database.close();
  return result;
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function mergeGroupOverrides(...layers) {
  const merged = {};
  for (const layer of layers) {
    for (const [group, values] of Object.entries(cleanObject(layer))) {
      merged[group] = { ...merged[group], ...cleanObject(values) };
    }
  }
  return merged;
}

function sameValue(a, b) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((entry, index) => entry === b[index]);
  }
  return a === b;
}

function templateDefaultAnswers(templateId) {
  const template = getVfxEffectTemplate(templateId);
  return Object.fromEntries((template?.questions ?? []).map((question) => [
    question.id,
    question.default,
  ]));
}

function createManagedEffect({
  answers,
  existing = null,
  parameterOverrides = {},
  styleId,
  templateId,
}) {
  const created = createVfxEffectFromTemplate(templateId, {
    answers,
    id: existing?.id,
    label: existing?.label,
    parameters: parameterOverrides,
    style: styleId,
  });
  if (!existing) return created;
  const template = getVfxEffectTemplate(templateId);
  const layers = created.layers.map((layer) => {
    const slot = template?.sourceSlots?.find((entry) => entry.layer === layer.id);
    const previous = existing.layers.find((entry) => entry.id === layer.id);
    const previousAsset = previous?.settings?.[slot?.settingsPath?.[0]];
    return previousAsset
      ? { ...layer, settings: { ...layer.settings, [slot.settingsPath[0]]: previousAsset } }
      : layer;
  });
  const result = validateVfxEffectDocument({ ...created, layers });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

function upgradeManagedEffect(effectDocument) {
  if (effectDocument.template.id !== DEFAULT_TEMPLATE_ID
    || Number(effectDocument.template.version) >= 7) {
    return effectDocument;
  }
  const parameterOverrides = getVfxEffectParameterValues(effectDocument);
  // Template v6 changes this value from a tight 0.9–1.4 surface multiplier
  // into an explicit 1.05–2.4 body-relative orbit clearance. Preserve the
  // authored position proportionally instead of leaving migrated lightning
  // pressed against the projectile.
  if (Number(effectDocument.template.version) < 6) {
    const legacyOffset = Number(parameterOverrides.circulationSurfaceOffset);
    if (Number.isFinite(legacyOffset)) {
      const normalized = Math.min(Math.max((legacyOffset - 0.9) / 0.5, 0), 1);
      parameterOverrides.circulationSurfaceOffset = 1.05 + normalized * 1.35;
    }
  }
  // Template v7 retracts the oversized release volume back into a compact
  // warped ring. Map v6 wavefront controls into the narrower ring ranges so
  // existing projects keep their relative depth without retaining the blast.
  if (Number(effectDocument.template.version) < 7) {
    const legacyDepth = Number(parameterOverrides.releaseDepth);
    if (Number.isFinite(legacyDepth)) {
      const normalized = Math.min(Math.max((legacyDepth - 0.35) / 1.05, 0), 1);
      parameterOverrides.releaseDepth = 0.05 + normalized * 0.6;
    }
    const legacyIrregularity = Number(parameterOverrides.releaseIrregularity);
    if (Number.isFinite(legacyIrregularity)) {
      parameterOverrides.releaseIrregularity = Math.min(
        Math.max(legacyIrregularity * 0.55, 0),
        0.75,
      );
    }
    const legacyLobes = Number(parameterOverrides.releaseLobes);
    if (Number.isFinite(legacyLobes)) {
      const normalized = Math.min(Math.max((legacyLobes - 2) / 7, 0), 1);
      parameterOverrides.releaseLobes = Math.round(2 + normalized * 5);
    }
  }
  return createManagedEffect({
    answers: {
      ...templateDefaultAnswers(effectDocument.template.id),
      ...cleanObject(effectDocument.template.answers),
    },
    existing: effectDocument,
    parameterOverrides,
    styleId: effectDocument.style,
    templateId: effectDocument.template.id,
  });
}

function sourceMapForEffect(effectDocument, seed = 1) {
  return Object.fromEntries(
    createChargedShotDefaultSources(effectDocument.id, seed)
      .map((source) => [source.id, source]),
  );
}

function replaceProject(state, effectDocument) {
  return {
    effectDocument,
    effectProjects: state.effectProjects.map((entry) => (
      entry.id === state.activeProjectId ? effectDocument : entry
    )),
  };
}

function cleanProjectId(value) {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'vfx-effect';
}

function uniqueProjectId(projects, requested) {
  const base = cleanProjectId(requested);
  const ids = new Set(projects.map((entry) => entry.id));
  if (!ids.has(base)) return base;
  let suffix = 2;
  while (ids.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function setEffectSlotAsset(effectDocument, slot, assetId) {
  const layers = effectDocument.layers.map((layer) => (
    layer.id === slot.layer
      ? {
        ...layer,
        settings: {
          ...layer.settings,
          [slot.settingsPath[0]]: assetId,
        },
      }
      : layer
  ));
  const result = validateVfxEffectDocument({ ...effectDocument, layers });
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

function referencedSourceDocuments(state) {
  const template = getVfxEffectTemplate(state.effectDocument.template.id);
  const ids = new Set((template?.sourceSlots ?? []).map((slot) => (
    state.effectDocument.layers
      .find((layer) => layer.id === slot.layer)?.settings?.[slot.settingsPath[0]]
  )).filter(Boolean));
  return [...ids].map((id) => state.sourceAssets[id]).filter(Boolean);
}

async function sha256Hex(file) {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function readMediaMetadata(file, url) {
  return new Promise((resolve, reject) => {
    const isVideo = file.type.startsWith('video/');
    const media = document.createElement(isVideo ? 'video' : 'img');
    const cleanup = () => {
      media.removeAttribute('src');
      media.load?.();
    };
    const onError = () => {
      cleanup();
      reject(new Error('The selected source could not be decoded.'));
    };
    media.addEventListener('error', onError, { once: true });
    if (isVideo) {
      media.preload = 'metadata';
      media.addEventListener('loadedmetadata', () => {
        const result = {
          duration: Number.isFinite(media.duration) ? media.duration : 0,
          height: media.videoHeight,
          width: media.videoWidth,
        };
        cleanup();
        resolve(result);
      }, { once: true });
    } else {
      media.addEventListener('load', () => {
        const result = {
          duration: 0,
          height: media.naturalHeight,
          width: media.naturalWidth,
        };
        cleanup();
        resolve(result);
      }, { once: true });
    }
    media.src = url;
  });
}

function loadPersistedProjectState() {
  if (!hasBrowserStorage()) return null;
  try {
    const raw = window.localStorage.getItem(PROJECT_STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    const effectProjects = (Array.isArray(saved.effectProjects) ? saved.effectProjects : [])
      .map((entry) => validateVfxEffectDocument(entry))
      .filter((entry) => entry.ok)
      .map((entry) => upgradeManagedEffect(entry.value));
    if (effectProjects.length === 0) return null;
    const sourceAssets = {};
    for (const entry of Array.isArray(saved.sourceAssets) ? saved.sourceAssets : []) {
      const parsed = parseVfxSourceDocument(entry);
      if (parsed.ok) sourceAssets[parsed.value.id] = parsed.value;
    }
    const activeProjectId = effectProjects.some((entry) => entry.id === saved.activeProjectId)
      ? saved.activeProjectId
      : effectProjects[0].id;
    return { activeProjectId, effectProjects, sourceAssets };
  } catch {
    return null;
  }
}

function persistProjectState(state) {
  if (!hasBrowserStorage()) return;
  try {
    window.localStorage.setItem(PROJECT_STORAGE_KEY, JSON.stringify({
      activeProjectId: state.activeProjectId,
      effectProjects: state.effectProjects,
      sourceAssets: Object.values(state.sourceAssets),
      version: 1,
    }));
  } catch {
    // The active in-memory project remains usable when storage is unavailable.
  }
}

function deriveParameterOverrides(document, {
  answers = document.template.answers,
  styleId = document.style,
  templateId = document.template.id,
} = {}) {
  const baseline = createManagedEffect({
    answers,
    styleId,
    templateId,
  });
  const baselineValues = getVfxEffectParameterValues(baseline);
  return Object.fromEntries(
    Object.entries(getVfxEffectParameterValues(document))
      .filter(([id, value]) => !sameValue(value, baselineValues[id])),
  );
}

function createInitialState() {
  const styleId = 'call_me_sensei';
  const templateId = DEFAULT_TEMPLATE_ID;
  const templateAnswers = templateDefaultAnswers(templateId);
  const effectDocument = createManagedEffect({
    answers: templateAnswers,
    styleId,
    templateId,
  });
  return {
    activeProjectId: effectDocument.id,
    chargePreview: 1,
    effectDocument,
    effectProjects: [effectDocument],
    loop: true,
    overrides: {},
    parameterOverrides: {},
    previewAutoCycle: false,
    previewHour: 13,
    previewSegment: 'sequence',
    seed: 20267,
    status: '',
    styleId,
    sourceAssets: sourceMapForEffect(effectDocument, 20267),
    sourceRevision: 0,
    sourceRuntimeUrls: {},
    templateAnswers,
    templateId,
  };
}

export function createVfxLabStore({ urlParams } = {}) {
  const initial = createInitialState();

  // NOTE: get() returns null when absent and Number(null) === 0 — guard on
  // presence first or every unparameterized load pins the seed to 1.
  const rawSeed = urlParams?.get('seed');
  if (rawSeed !== null && rawSeed !== undefined && Number.isFinite(Number(rawSeed))) {
    initial.seed = Math.max(1, Math.round(Number(rawSeed)));
  }
  const styleParam = urlParams?.get('vfxStyle') ?? urlParams?.get('style') ?? urlParams?.get('preset');
  if (styleParam) initial.styleId = resolveVfxStyleName(styleParam);

  // Compatibility import for links exported by the original VFX Lab.
  const recipeParam = urlParams?.get('vfxRecipe');
  if (recipeParam) {
    try {
      const doc = JSON.parse(recipeParam);
      if (doc && typeof doc === 'object') {
        if (typeof doc.style === 'string') initial.styleId = resolveVfxStyleName(doc.style);
        else if (typeof doc.preset === 'string') initial.styleId = resolveVfxStyleName(doc.preset);
        if (Number.isFinite(Number(doc.seed))) initial.seed = Number(doc.seed);
        initial.overrides = cleanObject(doc.settings);
      }
    } catch {
      initial.status = 'The legacy VFX recipe in this URL was malformed and was ignored.';
    }
  }

  const effectParam = urlParams?.get('vfxEffect');
  if (effectParam) {
    const parsed = parseVfxEffectDocument(effectParam);
    const template = parsed.ok ? getVfxEffectTemplate(parsed.value.template.id) : null;
    if (parsed.ok && template?.status === 'available') {
      initial.effectDocument = upgradeManagedEffect(parsed.value);
      initial.styleId = resolveVfxStyleName(initial.effectDocument.style);
      initial.templateId = initial.effectDocument.template.id;
      initial.templateAnswers = {
        ...templateDefaultAnswers(initial.templateId),
        ...cleanObject(parsed.value.template.answers),
      };
      initial.parameterOverrides = deriveParameterOverrides(parsed.value, {
        answers: initial.templateAnswers,
        styleId: initial.styleId,
        templateId: initial.templateId,
      });
      initial.status = parsed.warnings.length > 0 ? parsed.warnings.join(' ') : '';
    } else {
      initial.status = parsed.ok
        ? `The effect requires unavailable template "${parsed.value.template.id}".`
        : parsed.errors.join(' ');
    }
  } else {
    initial.templateAnswers = templateDefaultAnswers(initial.templateId);
    initial.effectDocument = createManagedEffect({
      answers: initial.templateAnswers,
      styleId: initial.styleId,
      templateId: initial.templateId,
    });
  }

  const persisted = effectParam ? null : loadPersistedProjectState();
  if (persisted) {
    const requestedProjectId = urlParams?.get('effect');
    const activeProjectId = persisted.effectProjects.some((entry) => entry.id === requestedProjectId)
      ? requestedProjectId
      : persisted.activeProjectId;
    const effectDocument = persisted.effectProjects
      .find((entry) => entry.id === activeProjectId) ?? persisted.effectProjects[0];
    const template = getVfxEffectTemplate(effectDocument.template.id);
    if (template?.status === 'available') {
      initial.activeProjectId = effectDocument.id;
      initial.effectDocument = effectDocument;
      initial.effectProjects = persisted.effectProjects;
      initial.sourceAssets = persisted.sourceAssets;
      initial.styleId = resolveVfxStyleName(effectDocument.style);
      initial.templateId = effectDocument.template.id;
      initial.templateAnswers = {
        ...templateDefaultAnswers(initial.templateId),
        ...cleanObject(effectDocument.template.answers),
      };
      initial.parameterOverrides = deriveParameterOverrides(effectDocument, {
        answers: initial.templateAnswers,
        styleId: initial.styleId,
        templateId: initial.templateId,
      });
    }
  }

  if (urlParams?.get('loop') === '0') initial.loop = false;
  const rawCharge = urlParams?.get('charge');
  if (rawCharge !== null && rawCharge !== undefined && Number.isFinite(Number(rawCharge))) {
    initial.chargePreview = Math.min(Math.max(Number(rawCharge), 0), 1);
  }
  const rawPreviewHour = urlParams?.get('previewHour');
  if (rawPreviewHour !== null && rawPreviewHour !== undefined
    && Number.isFinite(Number(rawPreviewHour))) {
    initial.previewHour = ((Number(rawPreviewHour) % 24) + 24) % 24;
  }
  initial.activeProjectId = initial.effectDocument.id;
  if (!persisted || effectParam) initial.effectProjects = [initial.effectDocument];
  initial.sourceAssets = {
    ...sourceMapForEffect(initial.effectDocument, initial.seed),
    ...initial.sourceAssets,
  };
  const sourceParam = urlParams?.get('vfxSources');
  if (sourceParam) {
    try {
      const imported = JSON.parse(sourceParam);
      if (!Array.isArray(imported)) throw new Error('VFX sources must be an array.');
      for (const entry of imported) {
        const parsed = parseVfxSourceDocument(entry);
        if (!parsed.ok) throw new Error(parsed.errors.join(' '));
        initial.sourceAssets[parsed.value.id] = parsed.value;
        if (parsed.value.mode === 'file') {
          initial.status = [
            initial.status,
            `Source "${parsed.value.file.name}" needs its project binary before it can preview.`,
          ].filter(Boolean).join(' ');
        }
      }
    } catch (error) {
      initial.status = [initial.status, `Source manifest ignored: ${error.message}`]
        .filter(Boolean).join(' ');
    }
  }

  const store = createStore(initial);
  store.subscribe(() => persistProjectState(store.getState()));
  persistProjectState(initial);

  async function hydratePersistedSourceFiles() {
    const state = store.getState();
    const sourceRuntimeUrls = { ...state.sourceRuntimeUrls };
    let restored = 0;
    for (const source of Object.values(state.sourceAssets)) {
      if (source.mode !== 'file' || sourceRuntimeUrls[source.id]?.url) continue;
      const blob = await loadSourceBlob(source.file.sha256);
      if (!blob) continue;
      sourceRuntimeUrls[source.id] = {
        mimeType: source.file.mimeType,
        name: source.file.name,
        url: URL.createObjectURL(blob),
      };
      restored += 1;
    }
    if (restored > 0) {
      const latest = store.getState();
      store.setState({
        sourceRevision: latest.sourceRevision + 1,
        sourceRuntimeUrls: { ...latest.sourceRuntimeUrls, ...sourceRuntimeUrls },
        status: `Restored ${restored} uploaded visual source${restored === 1 ? '' : 's'} from this browser.`,
      });
    }
  }

  /** Style + legacy overrides resolved to full settings (what old panels show). */
  function effectiveSettings(state = store.getState()) {
    return createVfxSettings(
      mergeGroupOverrides(resolveVfxStyle(state.styleId), state.overrides));
  }

  function applyStyle(styleId) {
    const nextStyle = resolveVfxStyleName(styleId);
    store.setState((state) => {
      const nextBase = resolveVfxStyle(nextStyle);
      const overrides = {};
      for (const [groupId, values] of Object.entries(state.overrides)) {
        const group = Object.fromEntries(Object.entries(cleanObject(values))
          .filter(([key, value]) => !sameValue(
            value,
            nextBase?.[groupId]?.[key] ?? DEFAULT_VFX_SETTINGS[groupId]?.[key],
          )));
        if (Object.keys(group).length > 0) overrides[groupId] = group;
      }
      const effectDocument = createManagedEffect({
        answers: state.templateAnswers,
        existing: state.effectDocument,
        parameterOverrides: state.parameterOverrides,
        styleId: nextStyle,
        templateId: state.templateId,
      });
      return {
        ...replaceProject(state, effectDocument),
        overrides,
        status: `Style "${nextStyle}" applied. Authored effect overrides were preserved.`,
        styleId: nextStyle,
      };
    });
  }

  const actions = {
    /** Legacy panel edit; pruned when it matches the selected VFX style. */
    setField(groupId, key, value) {
      store.setState((state) => {
        const styleValue = resolveVfxStyle(state.styleId)?.[groupId]?.[key]
          ?? DEFAULT_VFX_SETTINGS[groupId]?.[key];
        const group = { ...cleanObject(state.overrides[groupId]) };
        if (sameValue(value, styleValue)) delete group[key];
        else group[key] = value;
        const overrides = { ...state.overrides };
        if (Object.keys(group).length === 0) delete overrides[groupId];
        else overrides[groupId] = group;
        return { overrides, status: '' };
      });
    },
    applyStyle,
    // Compatibility for integrations wired to the original Lab action name.
    applyPreset: applyStyle,
    setTemplate(templateId) {
      const template = getVfxEffectTemplate(templateId);
      if (!template || template.status !== 'available') {
        store.setState({ status: `Template "${templateId}" is planned but not implemented yet.` });
        return;
      }
      const state = store.getState();
      const templateAnswers = templateDefaultAnswers(templateId);
      const effectDocument = createManagedEffect({
        answers: templateAnswers,
        existing: state.effectDocument,
        styleId: state.styleId,
        templateId,
      });
      store.setState({
        ...replaceProject(state, effectDocument),
        parameterOverrides: {},
        status: `Started "${template.label}" from its production template.`,
        templateAnswers,
        templateId,
      });
    },
    setTemplateAnswer(questionId, value) {
      const state = store.getState();
      const templateAnswers = { ...state.templateAnswers, [questionId]: value };
      try {
        const effectDocument = createManagedEffect({
          answers: templateAnswers,
          existing: state.effectDocument,
          parameterOverrides: state.parameterOverrides,
          styleId: state.styleId,
          templateId: state.templateId,
        });
        store.setState({ ...replaceProject(state, effectDocument), status: '', templateAnswers });
      } catch (error) {
        store.setState({ status: error.message });
      }
    },
    setEffectParameters(values = {}) {
      const state = store.getState();
      const baseline = createManagedEffect({
        answers: state.templateAnswers,
        styleId: state.styleId,
        templateId: state.templateId,
      });
      const baselineValues = getVfxEffectParameterValues(baseline);
      const parameterOverrides = { ...state.parameterOverrides };
      for (const [parameterId, value] of Object.entries(cleanObject(values))) {
        if (sameValue(value, baselineValues[parameterId])) delete parameterOverrides[parameterId];
        else parameterOverrides[parameterId] = value;
      }
      const effectDocument = setVfxEffectParameterValues(state.effectDocument, values);
      store.setState({
        ...replaceProject(state, effectDocument),
        parameterOverrides,
        status: '',
      });
    },
    setEffectParameter(parameterId, value) {
      actions.setEffectParameters({ [parameterId]: value });
    },
    openProject(effectId) {
      const state = store.getState();
      const effectDocument = state.effectProjects.find((entry) => entry.id === effectId);
      if (!effectDocument) {
        store.setState({ status: `Effect project "${effectId}" was not found.` });
        return;
      }
      const template = getVfxEffectTemplate(effectDocument.template.id);
      const templateAnswers = {
        ...templateDefaultAnswers(effectDocument.template.id),
        ...cleanObject(effectDocument.template.answers),
      };
      store.setState({
        activeProjectId: effectDocument.id,
        effectDocument,
        parameterOverrides: deriveParameterOverrides(effectDocument, {
          answers: templateAnswers,
          styleId: effectDocument.style,
          templateId: effectDocument.template.id,
        }),
        status: '',
        styleId: resolveVfxStyleName(effectDocument.style),
        templateAnswers,
        templateId: effectDocument.template.id,
      });
    },
    createProject({ label = 'Charged Energy Shot', templateId = DEFAULT_TEMPLATE_ID } = {}) {
      const state = store.getState();
      const template = getVfxEffectTemplate(templateId);
      if (!template || template.status !== 'available') {
        store.setState({ status: `Template "${templateId}" is not available.` });
        return null;
      }
      const id = uniqueProjectId(state.effectProjects, label || template.label);
      const templateAnswers = templateDefaultAnswers(templateId);
      const effectDocument = createVfxEffectFromTemplate(templateId, {
        answers: templateAnswers,
        id,
        label: label || template.label,
        style: state.styleId,
      });
      const defaults = sourceMapForEffect(effectDocument, state.seed + state.effectProjects.length * 31);
      store.setState({
        activeProjectId: id,
        effectDocument,
        effectProjects: [...state.effectProjects, effectDocument],
        parameterOverrides: {},
        sourceAssets: { ...state.sourceAssets, ...defaults },
        sourceRevision: state.sourceRevision + 1,
        status: `Created "${effectDocument.label}" as a separate effect project.`,
        templateAnswers,
        templateId,
      });
      return id;
    },
    duplicateActiveProject() {
      const state = store.getState();
      const source = state.effectDocument;
      const id = uniqueProjectId(state.effectProjects, `${source.id}-copy`);
      const effectDocument = createVfxEffectFromTemplate(source.template.id, {
        answers: source.template.answers,
        id,
        label: `${source.label} Copy`,
        parameters: getVfxEffectParameterValues(source),
        style: source.style,
      });
      const defaults = sourceMapForEffect(effectDocument, state.seed + state.effectProjects.length * 47);
      store.setState({
        activeProjectId: id,
        effectDocument,
        effectProjects: [...state.effectProjects, effectDocument],
        parameterOverrides: deriveParameterOverrides(effectDocument),
        sourceAssets: { ...state.sourceAssets, ...defaults },
        sourceRevision: state.sourceRevision + 1,
        status: `Duplicated "${source.label}" into an independent effect project.`,
      });
      return id;
    },
    renameActiveProject(label) {
      const state = store.getState();
      const result = validateVfxEffectDocument({
        ...state.effectDocument,
        label: String(label ?? '').trim() || state.effectDocument.label,
      });
      if (!result.ok) {
        store.setState({ status: result.errors.join(' ') });
        return;
      }
      store.setState({
        ...replaceProject(state, result.value),
        status: `Renamed effect to "${result.value.label}".`,
      });
    },
    setSourceGenerator(slotId, generator) {
      const state = store.getState();
      const template = getVfxEffectTemplate(state.templateId);
      const slot = template?.sourceSlots?.find((entry) => entry.id === slotId);
      if (!slot || !slot.generators.includes(generator)) {
        store.setState({ status: `Generator "${generator}" is not valid for source slot "${slotId}".` });
        return;
      }
      const assetId = `${state.effectDocument.id}.${slot.id}`;
      const source = createProceduralVfxSource(assetId, {
        channel: slot.channel,
        generator,
        label: `${state.effectDocument.label} · ${slot.label}`,
        seed: state.seed + state.sourceRevision + 1,
      });
      const previousAssetId = state.effectDocument.layers
        .find((layer) => layer.id === slot.layer)?.settings?.[slot.settingsPath[0]];
      const effectDocument = setEffectSlotAsset(state.effectDocument, slot, assetId);
      const previous = state.sourceRuntimeUrls[previousAssetId];
      if (previous?.url) URL.revokeObjectURL(previous.url);
      const sourceRuntimeUrls = { ...state.sourceRuntimeUrls };
      delete sourceRuntimeUrls[previousAssetId];
      store.setState({
        ...replaceProject(state, effectDocument),
        sourceAssets: { ...state.sourceAssets, [assetId]: source },
        sourceRevision: state.sourceRevision + 1,
        sourceRuntimeUrls,
        status: `Generated ${slot.label.toLowerCase()} with "${source.procedural.generator}".`,
      });
    },
    randomizeSource(slotId) {
      const state = store.getState();
      const template = getVfxEffectTemplate(state.templateId);
      const slot = template?.sourceSlots?.find((entry) => entry.id === slotId);
      const assetId = state.effectDocument.layers
        .find((layer) => layer.id === slot?.layer)?.settings?.[slot?.settingsPath?.[0]];
      const source = state.sourceAssets[assetId];
      if (!slot || source?.mode !== 'procedural') {
        store.setState({ status: 'Select a procedural source before randomizing it.' });
        return;
      }
      const next = createProceduralVfxSource(source.id, {
        channel: source.channel,
        generator: source.procedural.generator,
        label: source.label,
        parameters: source.procedural.parameters,
        playback: source.playback,
        seed: 1 + Math.floor(Math.random() * 0x7ffffffe),
      });
      store.setState({
        sourceAssets: { ...state.sourceAssets, [next.id]: next },
        sourceRevision: state.sourceRevision + 1,
        status: `Regenerated ${slot.label.toLowerCase()} with a new deterministic seed.`,
      });
    },
    setSourceParameter(slotId, parameterId, value) {
      const state = store.getState();
      const template = getVfxEffectTemplate(state.templateId);
      const slot = template?.sourceSlots?.find((entry) => entry.id === slotId);
      const assetId = state.effectDocument.layers
        .find((layer) => layer.id === slot?.layer)?.settings?.[slot?.settingsPath?.[0]];
      const source = state.sourceAssets[assetId];
      if (!slot || source?.mode !== 'procedural') return;
      const next = createProceduralVfxSource(source.id, {
        channel: source.channel,
        generator: source.procedural.generator,
        label: source.label,
        parameters: {
          ...source.procedural.parameters,
          [parameterId]: Number(value),
        },
        playback: source.playback,
        seed: source.procedural.seed,
      });
      store.setState({
        sourceAssets: { ...state.sourceAssets, [next.id]: next },
        sourceRevision: state.sourceRevision + 1,
        status: '',
      });
    },
    async importSourceFile(slotId, file) {
      const state = store.getState();
      const template = getVfxEffectTemplate(state.templateId);
      const slot = template?.sourceSlots?.find((entry) => entry.id === slotId);
      if (!slot) throw new Error(`Unknown source slot "${slotId}".`);
      if (!file || !ACCEPTED_SOURCE_TYPES.has(file.type) || !slot.acceptedMimeTypes.includes(file.type)) {
        throw new Error('Choose a PNG, JPEG, WebP, GIF, MP4, or WebM source.');
      }
      if (file.size <= 0 || file.size > VFX_SOURCE_MAX_FILE_BYTES) {
        throw new Error(`Source files must be between 1 byte and ${Math.round(VFX_SOURCE_MAX_FILE_BYTES / 1048576)} MB.`);
      }
      const url = URL.createObjectURL(file);
      try {
        const [sha256, metadata] = await Promise.all([
          sha256Hex(file),
          readMediaMetadata(file, url),
        ]);
        const latest = store.getState();
        if (latest.activeProjectId !== state.activeProjectId) {
          URL.revokeObjectURL(url);
          throw new Error('The active effect changed while the source was loading. Import it again.');
        }
        const assetId = `${state.effectDocument.id}.${slot.id}.${sha256.slice(0, 10)}`;
        const source = createFileVfxSource(assetId, {
          channel: slot.channel,
          file: {
            byteLength: file.size,
            ...metadata,
            mimeType: file.type,
            name: file.name,
            sha256,
            uri: `project://vfx-sources/${sha256.slice(0, 16)}-${cleanProjectId(file.name)}`,
          },
          label: `${state.effectDocument.label} · ${slot.label}`,
        });
        await storeSourceBlob(sha256, file);
        const effectDocument = setEffectSlotAsset(latest.effectDocument, slot, assetId);
        const previousAssetId = latest.effectDocument.layers
          .find((layer) => layer.id === slot.layer)?.settings?.[slot.settingsPath[0]];
        const previousRuntime = latest.sourceRuntimeUrls[previousAssetId];
        if (previousRuntime?.url) URL.revokeObjectURL(previousRuntime.url);
        const sourceRuntimeUrls = { ...latest.sourceRuntimeUrls };
        delete sourceRuntimeUrls[previousAssetId];
        sourceRuntimeUrls[assetId] = { mimeType: file.type, name: file.name, url };
        store.setState({
          ...replaceProject(latest, effectDocument),
          sourceAssets: { ...latest.sourceAssets, [assetId]: source },
          sourceRevision: latest.sourceRevision + 1,
          sourceRuntimeUrls,
          status: `Imported "${file.name}" into ${slot.label.toLowerCase()}.`,
        });
        return source;
      } catch (error) {
        URL.revokeObjectURL(url);
        throw error;
      }
    },
    setChargePreview(chargePreview) {
      store.setState({
        chargePreview: Math.min(Math.max(Number(chargePreview) || 0, 0), 1),
      });
    },
    setPreviewHour(previewHour) {
      const value = Number(previewHour);
      store.setState({
        previewHour: Number.isFinite(value) ? ((value % 24) + 24) % 24 : 13,
      });
    },
    setPreviewAutoCycle(previewAutoCycle) {
      store.setState({ previewAutoCycle: Boolean(previewAutoCycle) });
    },
    setPreviewSegment(previewSegment) {
      const state = store.getState();
      const valid = previewSegment === 'sequence'
        || state.effectDocument.phases.some((phase) => phase.id === previewSegment);
      if (valid) store.setState({ previewSegment });
    },
    setSeed(seed) {
      store.setState({ seed: Math.max(1, Math.round(Number(seed) || 1)) });
    },
    randomizeSeed() {
      store.setState({ seed: 1 + Math.floor(Math.random() * 99999) });
    },
    setLoop(loop) {
      store.setState({ loop: Boolean(loop) });
    },
    setStatus(status) {
      store.setState({ status });
    },
    resetLab() {
      for (const runtime of Object.values(store.getState().sourceRuntimeUrls)) {
        if (runtime?.url) URL.revokeObjectURL(runtime.url);
      }
      store.setState({ ...createInitialState(), status: 'Lab reset.' });
    },
    /** Primary artifact: a complete portable VFX Effect document. */
    getEffectDocument() {
      return store.getState().effectDocument;
    },
    // Primary export name retained for integrations that call getRecipeDocument.
    getRecipeDocument() {
      return store.getState().effectDocument;
    },
    getSourceDocuments() {
      return referencedSourceDocuments(store.getState());
    },
    getProjectDocument() {
      const state = store.getState();
      return {
        effect: state.effectDocument,
        sources: referencedSourceDocuments(state),
        type: 'toonlab.vfx.project',
        version: 1,
      };
    },
    /** Compatibility artifact for the original system-wide tuning surface. */
    getLegacyRecipeDocument() {
      const state = store.getState();
      return {
        schema: 'toonlab.vfxgen',
        version: 1,
        seed: state.seed,
        settings: state.overrides,
        style: state.styleId,
      };
    },
    getCodeSnippet() {
      const state = store.getState();
      const documentJson = JSON.stringify(state.effectDocument, null, 2);
      const sourcesJson = JSON.stringify(referencedSourceDocuments(state), null, 2);
      const settings = Object.keys(state.overrides).length > 0
        ? `\n  settings: ${JSON.stringify(state.overrides, null, 2).replace(/\n/g, '\n  ')},`
        : '';
      return `import {
  createVfxSourceRuntime,
  createVfxSystem,
} from '@call-me-sensei/toonlab/vfxgen';

const chargedShot = ${documentJson};
const sourceAssets = ${sourcesJson};

// Resolve project:// file URIs to browser URLs in your asset pipeline.
const sourceRuntime = createVfxSourceRuntime({
  sourceAssets: Object.fromEntries(sourceAssets.map((source) => [source.id, source])),
  runtimeUrls: resolveProjectVfxSourceUrls(sourceAssets),
});

const vfx = createVfxSystem({
  effectDocuments: [chargedShot],
  seed: ${state.seed},
  sourceTextures: sourceRuntime.textures,
  style: '${state.styleId}',${settings}
  heightAt: world?.collision?.groundHeight,
});
scene.add(vfx.root);

// Per frame
sourceRuntime.update(elapsedTime);
vfx.update(delta, camera);

// Gameplay event: charge is runtime state, not baked into the asset.
const shot = vfx.spawn(chargedShot.id, {
  charge: 1,
  from: muzzlePosition,
  velocity: aimDirection.multiplyScalar(18),
  onHit: (position) => applyChargedShotDamage(position),
});

// Collision systems may resolve the exact contact point and normal:
// shot.explode(contactPoint, contactNormal);
// shot.cancel();`;
    },
  };

  if (typeof queueMicrotask === 'function' && typeof indexedDB !== 'undefined') {
    queueMicrotask(() => {
      hydratePersistedSourceFiles().catch((error) => {
        store.setState({ status: `Uploaded source restore failed: ${error.message}` });
      });
    });
  }

  return {
    actions,
    effectiveSettings,
    getState: store.getState,
    setState: store.setState,
    subscribe: store.subscribe,
  };
}
