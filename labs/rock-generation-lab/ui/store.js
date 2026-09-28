import {
  bumpDocumentRevision,
  createC7SurfaceSpecification,
  createC8ReferenceAuthoritySourceId,
  createC8ReferenceGeometrySourceId,
  createC8ReferenceSurfaceSourceId,
  createRockDocument,
  deserializeRockDocument,
  exportDocumentToGLB,
  getRockgenPresetOptions,
  isRockSourceMeshReference,
  normalizeRockgenPresetName,
  normalizeRockgenStyleName,
  rebaseRockDocumentStyle,
  ROCK_SURFACE_TEXTURE_PRESETS,
  serializeRockDocument,
} from '../../../src/rockgen/index.js';
import { downloadBlob } from '../../shared/download.js';
import { createStore } from '../../shared/ui/createStore.js';
import {
  createCatalogVariationDocument,
  getRockVariationCatalogEntry,
} from './catalog.js';
import {
  DEFAULT_ROCK_GRASS_PREVIEW,
  sanitizeRockGrassPreview,
} from './rockGrassPreview.js';

const DRAFT_STORAGE_KEY = 'toonlab.rockGeneration.draft.v2';
const LEGACY_DRAFT_STORAGE_KEY = 'toonlab.rockGeneration.draft.v1';
const LIBRARY_STORAGE_KEY = 'toonlab.rockGeneration.library.v1';
const RESOLUTIONS = new Set([32, 40, 48, 64, 80, 96, 128]);

function slug(value, fallback = 'toonlab-rock') {
  return String(value ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback;
}

function presetLabel(id) {
  return getRockgenPresetOptions().find((entry) => entry.value === id)?.label ?? id;
}

function cloneDocument(document) {
  const clone = deserializeRockDocument(serializeRockDocument(document));
  // Serialization deliberately omits the runtime revision. Preserve it when
  // cloning for an edit so every subsequent bump remains strictly monotonic
  // and the engine never misses the second (or later) change.
  clone.revision = Math.max(0, Math.round(Number(document?.revision) || 0));
  return clone;
}

function readJsonStorage(key, fallback) {
  try {
    const raw = window.localStorage?.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonStorage(key, value) {
  try {
    window.localStorage?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function readDraftStorage() {
  let sessionDraft = null;
  try {
    const raw = window.sessionStorage?.getItem(DRAFT_STORAGE_KEY);
    sessionDraft = raw ? JSON.parse(raw) : null;
  } catch {
    // Local storage remains the durable fallback when session storage is unavailable.
  }
  const localDraft = readJsonStorage(DRAFT_STORAGE_KEY, null);
  // One storage area can hit its quota before the other. Never prefer an old
  // tab-local snapshot over a newer durable save just because it exists.
  if (sessionDraft && localDraft) {
    return (Date.parse(localDraft.updatedAt) || 0) > (Date.parse(sessionDraft.updatedAt) || 0)
      ? localDraft : sessionDraft;
  }
  return sessionDraft ?? localDraft ?? readJsonStorage(LEGACY_DRAFT_STORAGE_KEY, null);
}

function writeDraftStorage(value) {
  const persisted = writeJsonStorage(DRAFT_STORAGE_KEY, value);
  try {
    window.sessionStorage?.setItem(DRAFT_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A stale tab copy must not shadow the newly saved durable draft.
    if (persisted) {
      try { window.sessionStorage?.removeItem?.(DRAFT_STORAGE_KEY); } catch { /* Storage may be disabled. */ }
    }
  }
  return persisted;
}

function readLibrary() {
  const source = readJsonStorage(LIBRARY_STORAGE_KEY, []);
  if (!Array.isArray(source)) return [];
  return source
    .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.document === 'string')
    .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)));
}

function bootDocument(urlParams) {
  const requestedPreset = urlParams.get('rockPreset');
  const hasRequestedSeed = urlParams.has('rockSeed');
  const requestedSeed = hasRequestedSeed ? Number(urlParams.get('rockSeed')) : Number.NaN;
  const hasRequestedResolution = urlParams.has('rockRes');
  const requestedResolution = hasRequestedResolution ? Number(urlParams.get('rockRes')) : Number.NaN;
  if (requestedPreset || (hasRequestedSeed && Number.isFinite(requestedSeed))
    || (hasRequestedResolution && RESOLUTIONS.has(requestedResolution))) {
    const preset = normalizeRockgenPresetName(requestedPreset ?? 'boulder');
    const document = createRockDocument({
      preset,
      seed: Number.isFinite(requestedSeed) ? Math.max(Math.round(requestedSeed), 0) : 0,
      style: 'default',
    });
    if (RESOLUTIONS.has(requestedResolution)) {
      document.meshing.previewResolution = requestedResolution;
      bumpDocumentRevision(document);
    }
    return document;
  }
  const saved = readDraftStorage();
  if (saved?.document) {
    try {
      return deserializeRockDocument(saved.document);
    } catch {
      // A damaged draft must never prevent a clean procedural boot.
    }
  }
  return createRockDocument({ preset: 'boulder', seed: 0, style: 'default' });
}

function catalogEntryForDocument(document) {
  if (document?.reference?.sourceMode !== 'mesh-template') return null;
  return getRockVariationCatalogEntry(document.reference.id);
}

function sourceMeshMetadata(document) {
  const entry = catalogEntryForDocument(document);
  if (entry) return entry;
  if (document?.reference?.sourceMode !== 'c8-custom-mesh') return null;
  const source = document.reference.customMeshSource;
  const dimensions = source?.control?.dimensionsMetres;
  if (!Array.isArray(dimensions) || dimensions.length !== 3) return null;
  return {
    dimensionsMetres: { depth: dimensions[2], height: dimensions[1], width: dimensions[0] },
    geology: document.reference.geology,
    id: document.reference.id,
  };
}

function invalidateC8EditorDerivatives(reference, reason) {
  if (reference?.sourceMode !== 'c8-custom-mesh') return;
  reference.sourceRevision = Math.max(1, Math.round(Number(reference.sourceRevision) || 1)) + 1;
  reference.surfaceReprojection = null;
  reference.authoritySourceId = createC8ReferenceAuthoritySourceId(reference);
  reference.geometrySourceId = createC8ReferenceGeometrySourceId(reference);
  reference.surfaceSourceId = createC8ReferenceSurfaceSourceId(reference);
  reference.derivedArtifactState = Object.fromEntries([
    'collision',
    'geometricResidual',
    'lods',
    'pbrBake',
    'runtimePackage',
    'surfaceReprojection',
  ].map((role) => [role, {
    authoritySourceId: reference.authoritySourceId,
    contentHash: null,
    geometrySourceId: reference.geometrySourceId,
    reason,
    sourceRevision: reference.sourceRevision,
    status: 'stale',
    ...(['pbrBake', 'runtimePackage', 'surfaceReprojection'].includes(role)
      ? { surfaceSourceId: reference.surfaceSourceId }
      : {}),
    ...(role === 'surfaceReprojection' ? { trueHighToLowBake: false } : {}),
  }]));
}

function invalidateC8EditorSurfaceDerivatives(reference, reason) {
  if (reference?.sourceMode !== 'c8-custom-mesh') return;
  reference.surfaceReprojection = null;
  reference.authoritySourceId = createC8ReferenceAuthoritySourceId(reference);
  reference.geometrySourceId = createC8ReferenceGeometrySourceId(reference);
  reference.surfaceSourceId = createC8ReferenceSurfaceSourceId(reference);
  reference.derivedArtifactState ??= {};
  for (const role of ['pbrBake', 'runtimePackage', 'surfaceReprojection']) {
    reference.derivedArtifactState[role] = {
      authoritySourceId: reference.authoritySourceId,
      contentHash: null,
      geometrySourceId: reference.geometrySourceId,
      reason,
      sourceRevision: reference.sourceRevision,
      status: 'stale',
      surfaceSourceId: reference.surfaceSourceId,
      ...(role === 'surfaceReprojection' ? { trueHighToLowBake: false } : {}),
    };
  }
}

function validateC8EditorMeshEditSequence(reference, candidate) {
  for (const edit of [candidate]) {
    const meshVertexCount = reference.customMeshSource.control.geometryAudit.meshVertexCounts[edit?.meshIndex];
    if (!Number.isInteger(edit?.meshIndex) || edit.meshIndex < 0
      || !Number.isInteger(meshVertexCount) || !Array.isArray(edit?.deltas)) return false;
    const operationVertices = new Set();
    for (const delta of edit.deltas) {
      if (!Array.isArray(delta)
        || delta.length !== 4
        || !Number.isInteger(delta[0])
        || delta[0] < 0
        || delta[0] >= meshVertexCount
        || operationVertices.has(delta[0])
        || !delta.slice(1).every(Number.isFinite)) return false;
      operationVertices.add(delta[0]);
    }
  }
  return true;
}

function normalizedMeshOperationOrder(reference) {
  const meshEdits = reference?.meshEdits ?? [];
  const meshCuts = reference?.meshCuts ?? [];
  const order = reference?.meshOperationOrder;
  if (Array.isArray(order) && order.length === meshEdits.length + meshCuts.length) {
    return order.map((entry) => ({ index: entry.index, type: entry.type }));
  }
  return [
    ...meshEdits.map((_, index) => ({ index, type: 'sculpt' })),
    ...meshCuts.map((_, index) => ({ index, type: 'drill' })),
  ];
}

function normalizedCatalogMeshCut(cut) {
  if (!cut) return null;
  const point = Array.isArray(cut.point) ? cut.point.slice(0, 3).map(Number) : [];
  const normal = Array.isArray(cut.normal) ? cut.normal.slice(0, 3).map(Number) : [];
  const radius = Number(cut.radius);
  const roughness = Math.min(Math.max(Number(cut.roughness) || 0, 0), 1);
  const seed = Math.round(Number(cut.seed) || 0) >>> 0;
  const depth = Number(cut.depth);
  const meshIndex = Math.round(Number(cut.meshIndex));
  if (point.length !== 3 || normal.length !== 3
    || ![...point, ...normal, radius, depth, meshIndex].every(Number.isFinite)
    || Math.hypot(...normal) < 1e-6 || meshIndex < 0
    || radius < 0.01 || depth < 0.01) return null;
  const normalLength = Math.hypot(...normal);
  return {
    depth,
    meshIndex,
    normal: normal.map((component) => component / normalLength),
    point,
    radius,
    roughness,
    seed,
    through: Boolean(cut.through),
  };
}

function restoreCallMeSenseiCatalogBase(document) {
  const entry = sourceMeshMetadata(document);
  if (entry && document.style === 'call_me_sensei') {
    // Upgrade released catalog rocks to their accepted published geology surface.
    // The embedded GLB maps remain untouched and available as source evidence.
    document.reference.surfacePackage ??= entry.surfacePackage?.schema?.startsWith('toonlab/c8-')
      ? {
        ...structuredClone(entry.surfacePackage),
        boundsAuthority: 'rock-lab-edited-source-bounds',
        geometrySha256: entry.sourceContentHash || entry.surfacePackage.geometrySha256,
        seed: document.reference.variationSeed,
      }
      : createC7SurfaceSpecification({
        assetId: entry.id,
        dimensionsMetres: entry.dimensionsMetres,
        geology: entry.geology,
        seed: document.reference.variationSeed,
      });
    document.reference.surfaceMode = 'generated';
    if (document.reference.topFinish === 'source' || document.reference.topFinish === 'custom') {
      document.reference.topFinish = 'bare';
    }
  }
  return document;
}

function applyStyleBundleToBootDocument(document, styleBundleId) {
  if (String(styleBundleId ?? '').trim() !== 'call-me-sensei'
    || !isRockSourceMeshReference(document?.reference)) return document;
  document.style = 'call_me_sensei';
  return restoreCallMeSenseiCatalogBase(document);
}

function upgradeLegacyCatalogDocument(document, sourceId, variation = 0) {
  // A portable source-mesh document is already authoritative. Do not replace
  // it with a fresh catalog variation merely because the async catalog index
  // has not populated in this page yet; doing so erased saved holes and
  // topology snapshots during refresh before the same source resolved.
  if (isRockSourceMeshReference(document?.reference)) {
    return restoreCallMeSenseiCatalogBase(document);
  }
  const entry = getRockVariationCatalogEntry(sourceId);
  if (!entry) return document;
  const upgraded = createCatalogVariationDocument(entry, {
    style: document?.style,
    variation: Math.max(0, Math.round(Number(variation) || 0)),
  });
  upgraded.name = document?.name || upgraded.name;
  upgraded.revision = Number.isFinite(document?.revision) ? document.revision : upgraded.revision;
  return restoreCallMeSenseiCatalogBase(upgraded);
}

function isEditableDocument(document) {
  return !isRockSourceMeshReference(document?.reference)
    || Boolean(sourceMeshMetadata(document));
}

function sameValue(left, right) {
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right)
      && left.length === right.length
      && left.every((value, index) => value === right[index]);
  }
  return left === right;
}

export const ROCK_GENERATION_PREVIEW_RESOLUTIONS = Object.freeze(
  [...RESOLUTIONS].map((value) => ({ label: `${value} cells`, value })),
);

export const CATALOG_TOP_FINISH_OPTIONS = Object.freeze([
  Object.freeze({ label: 'None / bare', value: 'bare' }),
  Object.freeze({ label: 'Grass cap', value: 'grass' }),
  Object.freeze({ label: 'Sand cap', value: 'sand' }),
  Object.freeze({ label: 'Snow cap', value: 'snow' }),
]);

const CATALOG_TOP_SURFACE_KEYS = new Set([
  'topCoatStrength',
  'topColor',
  'topHeightStart',
  'topSlopeStart',
]);

export const CATALOG_SURFACE_PRESET_OPTIONS = Object.freeze([
  Object.freeze({
    description: 'New family-specific C7 PBR maps through the current Call Me Sensei rock shader; released GLB textures remain preserved but contribute 0%.',
    label: 'Call Me Sensei',
    value: 'call_me_sensei',
  }),
  ...Object.entries(ROCK_SURFACE_TEXTURE_PRESETS).map(([value, preset]) => Object.freeze({
    description: preset.description,
    label: preset.label,
    value,
  })),
]);

export function catalogSurfacePresetValue(document) {
  if (isRockSourceMeshReference(document?.reference)
    && document.surface?.pbrTexturePreset === 'none'
    && document.style === 'call_me_sensei') {
    return 'call_me_sensei';
  }
  const surface = document?.surface;
  if (!surface) return 'custom';
  for (const [value, preset] of Object.entries(ROCK_SURFACE_TEXTURE_PRESETS)) {
    if (Object.entries(preset.surface).every(([key, expected]) => (
      CATALOG_TOP_SURFACE_KEYS.has(key) || sameValue(surface[key], expected)
    ))) {
      return value;
    }
  }
  return 'custom';
}

const CATALOG_TOP_FINISHES = Object.freeze({
  bare: Object.freeze({
    topCoatStrength: 0,
  }),
  grass: Object.freeze({
    topCoatStrength: 1,
    topColor: Object.freeze([0.34, 0.52, 0.2]),
    topHeightStart: 0.22,
    topSlopeStart: 0.42,
  }),
  sand: Object.freeze({
    topCoatStrength: 1,
    topColor: Object.freeze([0.78, 0.64, 0.42]),
    topHeightStart: 0.24,
    topSlopeStart: 0.46,
  }),
  snow: Object.freeze({
    topCoatStrength: 1,
    topColor: Object.freeze([0.9, 0.94, 0.98]),
    topHeightStart: 0.28,
    topSlopeStart: 0.48,
  }),
});

export function createRockGenerationStore({
  urlParams = new URLSearchParams(window.location.search),
} = {}) {
  const savedDraft = readDraftStorage();
  const bootedDocument = bootDocument(urlParams);
  const upgradedDocument = upgradeLegacyCatalogDocument(
    bootedDocument,
    savedDraft?.catalogSourceId,
    savedDraft?.catalogVariation,
  );
  const document = applyStyleBundleToBootDocument(
    upgradedDocument,
    urlParams.get('styleBundle') ?? window.__toonlabActiveStyleBundleId,
  );
  const opensEditorDirectly = urlParams.has('rockPreset')
    || urlParams.has('rockSeed')
    || urlParams.has('rockRes')
    || urlParams.get('editor') === '1'
    || urlParams.get('hud') === '0';
  const undoStack = [];
  const redoStack = [];
  let gestureOpen = false;
  let catalogRuntime = null;
  let variationGesture = false;
  let variationGestureSaved = false;
  const bootCatalogEntry = catalogEntryForDocument(document);
  const store = createStore({
    canRedo: false,
    canUndo: false,
    dirty: false,
    draftSaveError: null,
    docRevision: document.revision,
    document,
    exporting: false,
    grassPreview: { ...DEFAULT_ROCK_GRASS_PREVIEW },
    grassPreviewStats: { blades: 0, clumps: 0 },
    catalogSourceId: bootCatalogEntry?.id ?? savedDraft?.catalogSourceId ?? null,
    catalogVariation: Math.max(0, Math.round(Number(savedDraft?.catalogVariation) || 0)),
    library: readLibrary(),
    meshStats: {
      bounds: '—',
      milliseconds: 0,
      triangles: 0,
      vertices: 0,
    },
    selectedLocalId: null,
    status: 'First-party procedural document ready.',
    view: { home: !opensEditorDirectly },
    viewRevision: 0,
  });
  const state = () => store.getState();

  function persistDraft(nextDocument = state().document) {
    const persisted = writeDraftStorage({
      catalogSourceId: state().catalogSourceId,
      catalogVariation: state().catalogVariation,
      document: serializeRockDocument(nextDocument),
      updatedAt: new Date().toISOString(),
    });
    store.setState({ draftSaveError: persisted ? null
      : 'Autosave failed: browser storage is full or unavailable. Export JSON from File before refreshing.' });
    const workspace = window.__TOONLAB_WORKSPACE__;
    if (persisted && workspace?.connected && workspace.flush) {
      store.setState({ draftSaveError: 'Saving to local database… Wait before refreshing.' });
      void workspace.flush().then((saved) => {
        if (state().document !== nextDocument) return;
        store.setState({ draftSaveError: saved === false
          ? 'Local database save failed. Export JSON from File before refreshing.' : null });
      });
    }
  }

  function updateHistoryFlags() {
    store.setState({
      canRedo: redoStack.length > 0,
      canUndo: undoStack.length > 0,
    });
  }

  function pushHistory({ retainDocument = false } = {}) {
    // Sparse mesh commits use copy-on-write. Retain their immutable baseline
    // instead of encoding large topology snapshots again on every mouse-up.
    undoStack.push(retainDocument ? state().document : serializeRockDocument(state().document));
    redoStack.length = 0;
    updateHistoryFlags();
  }

  function commit(nextDocument, {
    dirty = true,
    persist = true,
    reframe = false,
    selectedLocalId = state().selectedLocalId,
    catalogSourceId = state().catalogSourceId,
    catalogVariation = state().catalogVariation,
    status = null,
  } = {}) {
    store.setState((previous) => ({
      dirty,
      docRevision: nextDocument.revision,
      document: nextDocument,
      catalogSourceId,
      catalogVariation,
      selectedLocalId,
      ...(status === null ? {} : { status }),
      viewRevision: previous.viewRevision + (reframe ? 1 : 0),
    }));
    if (persist) persistDraft(nextDocument);
    updateHistoryFlags();
  }

  function replaceDocument(nextDocument, options = {}) {
    if (!isEditableDocument(nextDocument)) {
      throw new Error('This editor cannot resolve the source GLB for that rock document.');
    }
    pushHistory();
    nextDocument.revision = Math.max(nextDocument.revision, state().document.revision + 1);
    commit(nextDocument, { reframe: true, ...options });
  }

  function restoreFromHistory(source, destination) {
    const snapshot = source.pop();
    if (!snapshot) return;
    destination.push(serializeRockDocument(state().document));
    const restored = deserializeRockDocument(snapshot);
    restored.revision = state().document.revision + 1;
    const restoredCatalogEntry = catalogEntryForDocument(restored);
    commit(restored, {
      catalogSourceId: restoredCatalogEntry?.id ?? null,
      catalogVariation: restoredCatalogEntry ? state().catalogVariation : 0,
      dirty: true,
      reframe: true,
      status: 'History restored.',
    });
  }

  store.actions = {
    resizeCatalogDimensions(dimensions) {
      try { return catalogRuntime?.resizeDimensions?.(dimensions) ?? false; }
      catch (error) { store.setState({ status: error.message }); return false; }
    },
    beginVariationGesture() { variationGesture = true; variationGestureSaved = false; },
    endVariationGesture() { variationGesture = false; variationGestureSaved = false; },
    setCatalogVariationOptions(patch = {}) {
      const current = state().document;
      if (!isRockSourceMeshReference(current.reference)) return false;
      const next = cloneDocument(current);
      const reference = next.reference;
      const origin = { strength: reference.variation, seed: reference.variationSeed, settings: reference.variationSettings ?? {} };
      // Bake replayed edits into an editable baseline, never into the source.
      // Old documents without an origin keep their current shape on adoption.
      if (reference.meshEdits.length || reference.meshCuts.length) {
        const snapshots = catalogRuntime?.captureVariationBase?.();
        if (!snapshots) { store.setState({ status: 'Wait for the current mesh to finish loading before varying it.' }); return false; }
        reference.meshSnapshots = snapshots.map((snapshot) => ({ ...snapshot, variationOrigin: origin }));
        reference.meshEdits = []; reference.meshCuts = []; reference.meshOperationOrder = [];
      }
      reference.meshSnapshots = reference.meshSnapshots.map((snapshot) => ({
        ...snapshot, variationOrigin: snapshot.variationOrigin ?? origin,
      }));
      reference.variationSettings = { ...reference.variationSettings, version: 2 };
      if (patch.strength !== undefined) {
        const maximum = reference.sourceMode === 'c8-custom-mesh'
          ? reference.customMeshSource.editEnvelope.maximumVariationStrength : 1;
        reference.variation = Math.min(Math.max(Number(patch.strength) || 0, 0), maximum);
      }
      if (patch.seed !== undefined) reference.variationSeed = Math.round(Number(patch.seed) || 0) >>> 0;
      if (patch.settings) {
        reference.variationSettings = { ...reference.variationSettings, ...patch.settings };
        for (const [key, value] of Object.entries(reference.variationSettings)) if (value === null) delete reference.variationSettings[key];
        if (reference.variationSettings.locks) reference.variationSettings.locks = Object.fromEntries(
          Object.entries(reference.variationSettings.locks).filter(([, value]) => value),
        );
      }
      if (JSON.stringify(reference) === JSON.stringify(current.reference)) return false;
      try { catalogRuntime?.validateVariation?.(reference); }
      catch (error) { store.setState({ status: error.message }); return false; }
      if (!variationGesture || !variationGestureSaved) { pushHistory(); variationGestureSaved = true; }
      invalidateC8EditorDerivatives(reference, 'edited-mesh-variation');
      bumpDocumentRevision(next);
      commit(next, { status: 'Updated current-rock variation. Existing edits and holes are preserved.' });
      return true;
    },
    varyCurrentRock() {
      const reference = state().document.reference;
      if (!reference) return false;
      const settings = { ...reference.variationSettings };
      // Resolve automatic values before changing the seed for locked parameters.
      const profile = catalogRuntime?.variationProfile?.();
      const scaleKeys = ['width', 'height', 'depth'];
      for (const key of Object.keys(settings.locks ?? {})) {
        if (!settings.locks[key] || Number.isFinite(settings[key]) || !profile) continue;
        settings[key] = scaleKeys.includes(key) ? profile.scale[scaleKeys.indexOf(key)] : profile[key];
      }
      return store.actions.setCatalogVariationOptions({ seed: (reference.variationSeed + 0x9e3779b9) >>> 0, settings });
    },
    adoptEngineState(patch) {
      store.setState(patch);
    },

    applyPreset(value) {
      const preset = normalizeRockgenPresetName(value);
      const current = state().document;
      const next = createRockDocument({
        name: presetLabel(preset),
        preset,
        seed: current.seed,
        style: current.style,
      });
      replaceDocument(next, {
        selectedLocalId: null,
        status: `Started ${presetLabel(preset)}.`,
        catalogSourceId: null,
        catalogVariation: 0,
      });
    },

    applyStyle(value) {
      pushHistory();
      const next = restoreCallMeSenseiCatalogBase(rebaseRockDocumentStyle(
        state().document,
        normalizeRockgenStyleName(value),
      ));
      if (isRockSourceMeshReference(next.reference)) {
        const usesC7Surface = next.style === 'call_me_sensei';
        next.reference.surfaceMode = 'generated';
        next.reference.topFinish = usesC7Surface ? 'bare' : 'custom';
        invalidateC8EditorSurfaceDerivatives(next.reference, 'style-or-surface-mode-changed');
      }
      commit(next, {
        status: isRockSourceMeshReference(next.reference)
          && next.style === 'call_me_sensei'
          ? 'Applied the C7 geology maps through the current Call Me Sensei rock shader.'
          : `Applied ${next.style} generation style.`,
      });
    },

    applyStyleBundle(value) {
      const styleBundleId = typeof value === 'string' ? value : value?.id;
      const current = state().document;
      if (styleBundleId !== 'call-me-sensei'
        || !isRockSourceMeshReference(current.reference)) return false;
      const alreadyApplied = current.style === 'call_me_sensei'
        && current.reference.surfaceMode === 'generated'
        && Boolean(current.reference.surfacePackage);
      if (alreadyApplied) return true;
      pushHistory();
      const next = cloneDocument(current);
      next.style = 'call_me_sensei';
      restoreCallMeSenseiCatalogBase(next);
      invalidateC8EditorSurfaceDerivatives(next.reference, 'style-bundle-changed');
      bumpDocumentRevision(next);
      commit(next, {
        status: 'Applied the Call Me Sensei rock surface from the active Style Bundle.',
      });
      return true;
    },

    deleteLocal() {
      const id = state().selectedLocalId;
      if (!id) return false;
      const nextLibrary = state().library.filter((entry) => entry.id !== id);
      if (!writeJsonStorage(LIBRARY_STORAGE_KEY, nextLibrary)) {
        store.setState({ status: 'Could not update local saves.' });
        return false;
      }
      store.setState({
        dirty: true,
        library: nextLibrary,
        selectedLocalId: null,
        status: 'Local save deleted; the open document remains available.',
      });
      return true;
    },

    async exportGlb() {
      if (state().exporting) return;
      const snapshot = cloneDocument(state().document);
      const filename = `${slug(snapshot.name)}.glb`;
      store.setState({ exporting: true, status: 'Building GLB…' });
      try {
        const buffer = isRockSourceMeshReference(snapshot.reference)
          ? await catalogRuntime?.exportGlb?.()
          : await exportDocumentToGLB(snapshot, {
            lods: snapshot.meshing.exportLods,
            name: slug(snapshot.name),
            resolution: snapshot.meshing.exportResolution,
            uv: 'box',
          });
        if (!(buffer instanceof ArrayBuffer)) {
          throw new Error('The selected catalog source is still loading.');
        }
        downloadBlob(buffer, filename, 'model/gltf-binary');
        store.setState({
          status: snapshot.reference?.sourceMode === 'c8-custom-mesh'
            ? `Exported edited ${filename}; the saved C7 reprojection recipe is not a true texture bake.`
            : `Exported ${filename}.`,
        });
      } catch (error) {
        console.error('Rock GLB export failed:', error);
        store.setState({ status: `GLB export failed: ${error.message}` });
      } finally {
        store.setState({ exporting: false });
      }
    },

    exportJson() {
      const current = state().document;
      downloadBlob(
        serializeRockDocument(current, { pretty: true }),
        `${slug(current.name)}.rockgen.json`,
        'application/json',
      );
      store.setState({ status: 'Rock document JSON exported.' });
    },

    importDocument(text) {
      try {
        const next = upgradeLegacyCatalogDocument(deserializeRockDocument(text));
        if (!isEditableDocument(next)) {
          throw new Error('This editor cannot resolve the source GLB for that rock document.');
        }
        const catalogEntry = catalogEntryForDocument(next);
        next.revision = state().document.revision + 1;
        replaceDocument(next, {
          catalogSourceId: catalogEntry?.id ?? null,
          catalogVariation: 0,
          selectedLocalId: null,
          status: `Imported ${next.name}.`,
        });
        return { ok: true };
      } catch (error) {
        store.setState({ status: `Import failed: ${error.message}` });
        return { error: error.message, ok: false };
      }
    },

    loadLocal(id) {
      const entry = state().library.find((candidate) => candidate.id === id);
      if (!entry) return false;
      try {
        const next = upgradeLegacyCatalogDocument(
          deserializeRockDocument(entry.document),
          entry.catalogSourceId,
          entry.catalogVariation,
        );
        if (!isEditableDocument(next)) throw new Error('The saved catalog source is unavailable.');
        const catalogEntry = catalogEntryForDocument(next);
        next.revision = state().document.revision + 1;
        replaceDocument(next, {
          dirty: false,
          catalogSourceId: catalogEntry?.id ?? entry.catalogSourceId ?? null,
          catalogVariation: Math.max(0, Math.round(Number(entry.catalogVariation) || 0)),
          selectedLocalId: entry.id,
          status: `Opened local save “${entry.name}”.`,
        });
        return true;
      } catch (error) {
        store.setState({ status: `Could not open local save: ${error.message}` });
        return false;
      }
    },

    randomizeSeed() {
      store.actions.setSeed(Math.floor(Math.random() * 0xffffffff));
    },

    redo() {
      restoreFromHistory(redoStack, undoStack);
      updateHistoryFlags();
    },

    resetLab() {
      const next = createRockDocument({ preset: 'boulder', seed: 0, style: 'default' });
      replaceDocument(next, {
        selectedLocalId: null,
        catalogSourceId: null,
        catalogVariation: 0,
        status: 'Rock & Cliff Generation reset.',
      });
    },

    saveLocal() {
      const current = state().document;
      const now = new Date().toISOString();
      const id = state().selectedLocalId
        ?? `${slug(current.name, 'rock')}-${Date.now().toString(36)}`;
      const entry = {
        catalogSourceId: state().catalogSourceId,
        catalogVariation: state().catalogVariation,
        document: serializeRockDocument(current),
        id,
        name: current.name,
        updatedAt: now,
      };
      const nextLibrary = [
        entry,
        ...state().library.filter((candidate) => candidate.id !== id),
      ];
      if (!writeJsonStorage(LIBRARY_STORAGE_KEY, nextLibrary)) {
        store.setState({ status: 'Could not write this local save.' });
        return false;
      }
      store.setState({
        dirty: false,
        library: nextLibrary,
        selectedLocalId: id,
        status: `Saved “${current.name}” locally.`,
      });
      persistDraft(current);
      return true;
    },

    saveLocalAs(value = state().document.name) {
      const name = String(value ?? '').trim();
      if (!name) return false;
      const current = cloneDocument(state().document);
      current.name = name;
      bumpDocumentRevision(current);
      commit(current, {
        dirty: true,
        selectedLocalId: null,
        status: `Prepared “${name}” as a new local save.`,
      });
      return store.actions.saveLocal();
    },

    setHomeOpen(home) {
      store.setState({ view: { ...state().view, home: Boolean(home) } });
    },

    startCatalogVariation(id, variation = 0) {
      const entry = getRockVariationCatalogEntry(id);
      if (!entry) return false;
      const variationIndex = Math.max(0, Math.round(Number(variation) || 0));
      const strength = state().catalogSourceId === entry.id
        ? state().document.reference?.variation ?? 0.3
        : 0.3;
      const next = createCatalogVariationDocument(entry, {
        strength,
        style: 'call_me_sensei',
        variation: variationIndex,
      });
      next.reference.variationSettings = { version: 2 };
      replaceDocument(next, {
        catalogSourceId: entry.id,
        catalogVariation: variationIndex,
        selectedLocalId: null,
        status: `Loading ${entry.label} source GLB for variation ${variationIndex + 1}…`,
      });
      store.setState({ view: { ...state().view, home: false } });
      return true;
    },

    regenerateCatalogVariation() {
      const id = state().catalogSourceId;
      if (!id && state().document.reference?.sourceMode === 'c8-custom-mesh') {
        pushHistory();
        const next = cloneDocument(state().document);
        next.reference.variationSeed = (next.reference.variationSeed + 0x9e3779b9) >>> 0;
        next.reference.meshEdits = []; next.reference.meshCuts = []; next.reference.meshSnapshots = [];
        next.reference.meshOperationOrder = []; delete next.reference.variationSettings;
        invalidateC8EditorDerivatives(next.reference, 'bounded-procedural-seed');
        bumpDocumentRevision(next);
        commit(next, {
          catalogVariation: state().catalogVariation + 1,
          status: `Started fresh C8 template variation seed ${next.reference.variationSeed}.`,
        });
        return true;
      }
      if (!id) return false;
      return store.actions.startCatalogVariation(id, state().catalogVariation + 1);
    },

    registerCatalogRuntime(runtime) {
      catalogRuntime = runtime;
    },

    recordC8SurfaceReprojection(metadata) {
      const currentState = state();
      const current = currentState.document;
      if (current.reference?.sourceMode !== 'c8-custom-mesh' || !metadata) return false;
      if (metadata.documentRevision !== currentState.docRevision
        || metadata.authoritySourceId !== current.reference.authoritySourceId
        || metadata.geometrySourceId !== current.reference.geometrySourceId
        || metadata.surfaceSourceId !== current.reference.surfaceSourceId
        || metadata.sourceRevision !== current.reference.sourceRevision) return false;
      const previous = JSON.stringify(current.reference.surfaceReprojection);
      const normalizedCurrent = cloneDocument(current);
      const authoritySourceId = createC8ReferenceAuthoritySourceId(normalizedCurrent.reference);
      const geometrySourceId = createC8ReferenceGeometrySourceId(normalizedCurrent.reference);
      const surfaceSourceId = createC8ReferenceSurfaceSourceId(normalizedCurrent.reference);
      const nextMetadata = {
        ...structuredClone(metadata),
        authoritySourceId,
        controlContentHash: current.reference.customMeshSource.control.contentHash,
        editOperationCount: normalizedMeshOperationOrder(normalizedCurrent.reference).length,
        geometrySourceId,
        method: 'deterministic-metre-triplanar-map-reprojection',
        schema: 'toonlab/c8-surface-reprojection',
        sourceContentId: geometrySourceId,
        sourceId: current.reference.id,
        sourceRevision: current.reference.sourceRevision,
        surfaceSourceId,
        trueHighToLowBake: false,
        version: 1,
      };
      const next = normalizedCurrent;
      next.reference.authoritySourceId = authoritySourceId;
      next.reference.geometrySourceId = geometrySourceId;
      next.reference.surfaceSourceId = surfaceSourceId;
      next.reference.surfaceReprojection = nextMetadata;
      next.reference.derivedArtifactState ??= {};
      next.reference.derivedArtifactState.surfaceReprojection = {
        authoritySourceId,
        method: nextMetadata.method,
        geometrySourceId,
        sourceRevision: next.reference.sourceRevision,
        status: 'current',
        surfaceSourceId,
        trueHighToLowBake: false,
      };
      const normalized = cloneDocument(next);
      if (previous === JSON.stringify(normalized.reference.surfaceReprojection)) return false;
      // Runtime surface reprojection does not mutate geometry, so keep the
      // document revision stable and avoid scheduling a second remesh.
      store.setState({ document: normalized });
      persistDraft(normalized);
      return true;
    },

    setCatalogGrassPreview(patch = {}) {
      const grassPreview = sanitizeRockGrassPreview({ ...state().grassPreview, ...patch });
      store.setState({
        grassPreview,
        status: grassPreview.enabled
          ? 'Updating surface-following meadow grass preview…'
          : 'Meadow grass preview hidden.',
      });
      void catalogRuntime?.setGrassPreview?.(grassPreview);
    },

    setCatalogVariationStrength(value) { return store.actions.setCatalogVariationOptions({ strength: value }); },

    applyCatalogTopFinish(value) {
      const finish = String(value ?? 'source');
      const current = state().document;
      if (!isRockSourceMeshReference(current.reference)) return false;
      if (finish !== 'source' && !CATALOG_TOP_FINISHES[finish]) return false;
      pushHistory();
      const next = cloneDocument(current);
      if (current.reference.surfaceMode === 'source' && finish !== 'source') {
        next.style = 'call_me_sensei';
      }
      next.reference.surfaceMode = finish === 'source' ? 'source' : 'generated';
      next.reference.topFinish = finish;
      if (finish !== 'source') {
        Object.assign(next.surface, structuredClone(CATALOG_TOP_FINISHES[finish]));
      }
      invalidateC8EditorSurfaceDerivatives(next.reference, 'top-finish-changed');
      bumpDocumentRevision(next);
      commit(next, {
        status: finish === 'bare'
          ? 'Removed the top finish without changing the rock surface.'
          : `Applied ${finish} top finish to the source GLB.`,
      });
      return true;
    },

    applyCatalogSurfacePreset(value) {
      const presetId = String(value ?? 'call_me_sensei');
      const current = state().document;
      if (!isRockSourceMeshReference(current.reference)) return false;
      if (presetId !== 'call_me_sensei' && !ROCK_SURFACE_TEXTURE_PRESETS[presetId]) return false;
      pushHistory();
      const next = cloneDocument(current);
      if (presetId === 'call_me_sensei') {
        next.style = 'call_me_sensei';
        next.reference.surfaceMode = 'generated';
        next.reference.topFinish = 'bare';
        next.reference.surfacePackage ??= createC7SurfaceSpecification({
          assetId: sourceMeshMetadata(next)?.id,
          dimensionsMetres: sourceMeshMetadata(next)?.dimensionsMetres,
          geology: sourceMeshMetadata(next)?.geology,
          seed: next.reference.variationSeed,
        });
        Object.assign(next.surface, {
          lichenCoverage: 0,
          mossCoverage: 0,
          pbrTexturePreset: 'none',
          stainStrength: 0,
          topCoatStrength: 0,
          veinStrength: 0,
        });
      } else {
        const retainedFinish = CATALOG_TOP_FINISHES[current.reference.topFinish]
          ? current.reference.topFinish
          : 'bare';
        next.style = 'default';
        next.reference.surfaceMode = 'generated';
        next.reference.topFinish = retainedFinish;
        Object.assign(next.surface, structuredClone(ROCK_SURFACE_TEXTURE_PRESETS[presetId].surface));
        next.surface.pbrTexturePreset = 'none';
        Object.assign(next.surface, structuredClone(CATALOG_TOP_FINISHES[retainedFinish]));
      }
      invalidateC8EditorSurfaceDerivatives(next.reference, 'surface-preset-changed');
      bumpDocumentRevision(next);
      commit(next, {
        status: presetId === 'call_me_sensei'
          ? 'Applied the C7 geology maps through the current Call Me Sensei rock shader.'
          : `Applied ${ROCK_SURFACE_TEXTURE_PRESETS[presetId].label} surface preset.`,
      });
      return true;
    },

    clearCatalogMeshEdits() {
      const current = state().document;
      if (!isRockSourceMeshReference(current.reference)
        || ((current.reference.meshEdits?.length ?? 0)
          + (current.reference.meshCuts?.length ?? 0)
          + (current.reference.meshSnapshots?.length ?? 0)) === 0) return false;
      pushHistory();
      const next = cloneDocument(current);
      next.reference.meshCuts = [];
      next.reference.meshEdits = [];
      next.reference.meshOperationOrder = [];
      next.reference.meshSnapshots = [];
      invalidateC8EditorDerivatives(next.reference, 'reset-sparse-sculpt-deltas');
      bumpDocumentRevision(next);
      commit(next, { status: 'Reset the editable mesh to its generated variation.' });
      return true;
    },

    commitCatalogMeshEdit(edit) {
      const current = state().document;
      if (!isRockSourceMeshReference(current.reference)
        || !Array.isArray(edit?.deltas)
        || edit.deltas.length === 0) return false;
      if (current.reference.sourceMode === 'c8-custom-mesh'
        && (!Number.isInteger(edit.meshIndex)
          || edit.meshIndex < 0
          || edit.deltas.some((delta) => !Number.isInteger(delta?.[0])))) return false;
      const normalizedEdit = {
        deltas: edit.deltas.map(([vertexIndex, x, y, z]) => [
          Math.round(Number(vertexIndex)),
          Math.fround(Number(x)),
          Math.fround(Number(y)),
          Math.fround(Number(z)),
        ]),
        meshIndex: Math.max(0, Math.round(Number(edit.meshIndex) || 0)),
      };
      if (current.reference.sourceMode === 'c8-custom-mesh'
        && (current.reference.meshCuts?.length ?? 0) === 0
        && (current.reference.meshSnapshots?.length ?? 0) === 0) {
        const valid = validateC8EditorMeshEditSequence(current.reference, normalizedEdit);
        if (!valid) {
          store.setState({ status: 'Sculpt rejected: the edit contains an invalid mesh or vertex reference.' });
          return false;
        }
      }
      pushHistory({ retainDocument: true });
      const next = {
        ...current,
        reference: {
          ...current.reference,
          meshEdits: [...current.reference.meshEdits, normalizedEdit],
          meshOperationOrder: [...normalizedMeshOperationOrder(current.reference), {
            index: current.reference.meshEdits.length,
            type: 'sculpt',
          }],
        },
      };
      invalidateC8EditorDerivatives(next.reference, 'sparse-sculpt-delta');
      bumpDocumentRevision(next);
      commit(next, {
        status: `Sculpted ${normalizedEdit.deltas.length.toLocaleString()} vertices.`,
      });
      return true;
    },

    commitCatalogMeshCut(cut) {
      return store.actions.commitCatalogMeshCuts([cut]);
    },

    commitCatalogMeshCuts(cuts) {
      const current = state().document;
      if (!isRockSourceMeshReference(current.reference)
        || !Array.isArray(cuts) || cuts.length === 0) return false;
      const normalizedCuts = cuts.map(normalizedCatalogMeshCut);
      if (normalizedCuts.some((cut) => !cut)) return false;
      pushHistory();
      const next = cloneDocument(current);
      next.reference.meshCuts ??= [];
      next.reference.meshOperationOrder = normalizedMeshOperationOrder(current.reference);
      for (const normalizedCut of normalizedCuts) {
        next.reference.meshCuts.push(normalizedCut);
        next.reference.meshOperationOrder.push({
          index: next.reference.meshCuts.length - 1,
          type: 'drill',
        });
      }
      invalidateC8EditorDerivatives(next.reference, 'boolean-drill-cut');
      bumpDocumentRevision(next);
      commit(next, {
        status: normalizedCuts.length > 1
          ? `Carved a ${normalizedCuts.length}-stamp drill stroke.`
          : normalizedCuts[0].through
            ? `Drilled a ${(normalizedCuts[0].radius * 2).toFixed(2)} m through-hole.`
            : `Drilled a ${(normalizedCuts[0].radius * 2).toFixed(2)} m wide, ${normalizedCuts[0].depth.toFixed(2)} m deep cavity.`,
      });
      return true;
    },

    commitCatalogMeshSnapshots(meshSnapshots, status = 'Applied topology edit.') {
      const current = state().document;
      if (!isRockSourceMeshReference(current.reference)
        || !Array.isArray(meshSnapshots) || meshSnapshots.length === 0
        || meshSnapshots.some((snapshot) => !snapshot?.attributes?.position)) return false;
      pushHistory();
      const next = cloneDocument(current);
      const replaced = new Set(meshSnapshots.map((snapshot) => snapshot.meshIndex));
      next.reference.meshSnapshots = [
        ...(current.reference.meshSnapshots ?? []).filter((snapshot) => !replaced.has(snapshot.meshIndex)),
        ...structuredClone(meshSnapshots).map((snapshot) => ({ ...snapshot,
          variationOrigin: { strength: current.reference.variation, seed: current.reference.variationSeed,
            settings: current.reference.variationSettings ?? {} },
        })),
      ];
      const cuts = [];
      const edits = [];
      const order = [];
      for (const operation of normalizedMeshOperationOrder(current.reference)) {
        const entry = (operation.type === 'drill' ? current.reference.meshCuts : current.reference.meshEdits)[operation.index];
        if (replaced.has(entry.meshIndex)) continue;
        const target = operation.type === 'drill' ? cuts : edits;
        order.push({ type: operation.type, index: target.length });
        target.push(structuredClone(entry));
      }
      next.reference.meshCuts = cuts;
      next.reference.meshEdits = edits;
      next.reference.meshOperationOrder = order;
      invalidateC8EditorDerivatives(next.reference, 'topology-snapshot');
      bumpDocumentRevision(next);
      commit(next, { status });
      return true;
    },

    removeNearestCatalogMeshCut({ meshIndex, point }) {
      if (catalogRuntime?.fillHole) return catalogRuntime.fillHole({ meshIndex, point });
      const current = state().document;
      const cuts = current.reference?.meshCuts ?? [];
      if (!isRockSourceMeshReference(current.reference) || cuts.length === 0 || !Array.isArray(point)) return false;
      let nearestIndex = -1;
      let nearestDistance = Infinity;
      for (let index = 0; index < cuts.length; index += 1) {
        const cut = cuts[index];
        if (cut.meshIndex !== meshIndex) continue;
        const distance = Math.hypot(
          cut.point[0] - point[0],
          cut.point[1] - point[1],
          cut.point[2] - point[2],
        );
        if (distance < nearestDistance) {
          nearestDistance = distance;
          nearestIndex = index;
        }
      }
      if (nearestIndex < 0) return false;
      const ordered = normalizedMeshOperationOrder(current.reference);
      const cutOffset = ordered.findIndex((entry) => entry.type === 'drill' && entry.index === nearestIndex);
      if (ordered.slice(cutOffset + 1).some((entry) => entry.type === 'sculpt'
        && current.reference.meshEdits[entry.index]?.meshIndex === meshIndex)) {
        store.setState({ status: 'Open the mesh editor to fill this hole while preserving later sculpt edits.' });
        return false;
      }
      pushHistory();
      const next = cloneDocument(current);
      next.reference.meshCuts.splice(nearestIndex, 1);
      next.reference.meshOperationOrder = normalizedMeshOperationOrder(current.reference)
        .flatMap((operation) => {
          if (operation.type !== 'drill') return [operation];
          if (operation.index === nearestIndex) return [];
          return [{ ...operation, index: operation.index > nearestIndex ? operation.index - 1 : operation.index }];
        });
      invalidateC8EditorDerivatives(next.reference, 'drill-cut-filled');
      bumpDocumentRevision(next);
      commit(next, { status: 'Filled the nearest saved drill opening.' });
      return true;
    },

    setField(field, value, interaction = null) {
      const current = state().document;
      const target = field.group === 'surface' || field.group === 'meshing'
        ? current
        : current.pieces[0];
      const existing = target?.[field.group]?.[field.key];
      if (sameValue(existing, value)) {
        if (interaction?.gestureEnd) {
          gestureOpen = false;
          persistDraft(current);
        }
        return;
      }
      if (interaction?.gestureStart && !gestureOpen) {
        pushHistory();
        gestureOpen = true;
      } else if (!interaction?.transient && !interaction?.gestureEnd && !gestureOpen) {
        pushHistory();
      }
      const next = cloneDocument(current);
      const nextTarget = field.group === 'surface' || field.group === 'meshing'
        ? next
        : next.pieces[0];
      nextTarget[field.group][field.key] = Array.isArray(value) ? [...value] : value;
      if (field.group === 'surface' && isRockSourceMeshReference(next.reference)) {
        if (current.reference.surfaceMode === 'source') next.style = 'call_me_sensei';
        next.reference.surfaceMode = 'generated';
        if (CATALOG_TOP_SURFACE_KEYS.has(field.key)) next.reference.topFinish = 'custom';
        invalidateC8EditorSurfaceDerivatives(next.reference, `surface-field-${field.key}`);
      }
      bumpDocumentRevision(next);
      commit(next, {
        persist: !interaction?.transient,
        status: `Updated ${field.label}.`,
      });
      if (interaction?.gestureEnd) gestureOpen = false;
    },

    setName(value) {
      const name = String(value ?? '').trim();
      if (!name || name === state().document.name) return;
      pushHistory();
      const next = cloneDocument(state().document);
      next.name = name;
      bumpDocumentRevision(next);
      commit(next, { status: `Renamed to ${name}.` });
    },

    setResolution(value) {
      const resolution = Number(value);
      if (!RESOLUTIONS.has(resolution)) return;
      const field = {
        group: 'meshing',
        key: 'previewResolution',
        label: 'Preview Resolution',
      };
      store.actions.setField(field, resolution);
    },

    setSeed(value) {
      const seed = Math.max(Math.round(Number(value)) || 0, 0) >>> 0;
      if (seed === state().document.seed) return;
      pushHistory();
      const next = cloneDocument(state().document);
      next.seed = seed;
      bumpDocumentRevision(next);
      commit(next, { status: `Seed ${seed} generated.` });
    },

    setStatus(status) {
      store.setState({ status });
    },

    undo() {
      restoreFromHistory(undoStack, redoStack);
      updateHistoryFlags();
    },
  };

  persistDraft(document);
  return store;
}
