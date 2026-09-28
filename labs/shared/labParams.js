// URL-param / UI parity + persistence for the labs.
//
// Rules:
// - Every URL param has a HUD control; the HUD writes the URL, so deep links
//   stay shareable but stop being the input method.
// - Lab state is saved per-lab in localStorage and restored on load. An
//   explicit URL param ALWAYS wins over a stored value.
// - "Reset lab" clears the stored state.
//
// Mechanism: entry.js calls restorePersistedParams() before any lab module
// loads. Stored values for params absent from the URL are injected via
// history.replaceState, so every existing `new URLSearchParams(location
// .search)` read in the labs picks them up without changes.

import { navigateToCharacterModel, resolveSceneHubId, sceneHubUrl } from './sceneHub.js';

const STORAGE_PREFIX = 'toonlab';
const SCENE_STORAGE_KEY = `${STORAGE_PREFIX}.hub.scene`;

// Params persisted per lab (keyed by scene-hub id). Scene identity params
// (controller/scene/waterMode/env) are NOT here — the scene itself is
// persisted as the hub id via SCENE_STORAGE_KEY.
export const PERSISTED_LAB_PARAMS = Object.freeze([
  'model',
  'toonPreset',
  'envPreset',
  'toonDebug',
  'envDebug',
  'rockFamily',
  'rockGeometry',
  'rockMaterial',
  'rockPreset',
  'rockSeed',
  'rockRes',
  'rockStyle',
  'rockTime',
  'rockType',
  'rockVariation',
]);

function storageAvailable() {
  try {
    const probe = `${STORAGE_PREFIX}.__probe__`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const HAS_STORAGE = typeof window !== 'undefined' && storageAvailable();

function paramStorageKey(sceneId, name) {
  return `${STORAGE_PREFIX}.${sceneId}.${name}`;
}

export function persistLabParam(name, value, sceneId = resolveSceneHubId()) {
  if (!HAS_STORAGE) return;
  const key = paramStorageKey(sceneId, name);
  if (value === null || value === undefined || value === '') {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, String(value));
  }
}

export function persistedLabParam(name, sceneId = resolveSceneHubId()) {
  if (!HAS_STORAGE) return null;
  return window.localStorage.getItem(paramStorageKey(sceneId, name));
}

export function persistLabScene(sceneId) {
  if (!HAS_STORAGE) return;
  window.localStorage.setItem(SCENE_STORAGE_KEY, sceneId);
}

export function clearLabState(sceneId = resolveSceneHubId()) {
  if (!HAS_STORAGE) return;
  window.localStorage.removeItem(SCENE_STORAGE_KEY);
  const prefix = `${STORAGE_PREFIX}.${sceneId}.`;
  for (const key of Object.keys(window.localStorage)) {
    if (key.startsWith(prefix)) window.localStorage.removeItem(key);
  }
}

function isRootHubPath() {
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  return path === '/' || path === '/index.html';
}

// Called once by entry.js before the lab modules load.
export function restorePersistedParams() {
  if (!HAS_STORAGE) return;

  // 1. Bare root URL -> restore the last scene. Explicit paths such as
  //    /playground/, /rock-lab/, and /tree-lab/ are already intentional.
  if (!window.location.search && isRootHubPath()) {
    const storedScene = window.localStorage.getItem(SCENE_STORAGE_KEY);
    if (storedScene && storedScene !== 'character') {
      const url = sceneHubUrl(storedScene);
      // Standalone-page scenes need a real navigation; a replaceState to
      // another pathname would relabel the URL while the hub page keeps
      // loading.
      if (new URL(url).pathname !== window.location.pathname) {
        window.location.replace(url);
        return;
      }
      if (url !== window.location.href) window.history.replaceState(null, '', url);
    }
  }

  // 2. Inject stored per-lab params that the URL doesn't set explicitly.
  const params = new URLSearchParams(window.location.search);
  const sceneId = resolveSceneHubId(params);
  let changed = false;
  for (const name of PERSISTED_LAB_PARAMS) {
    if (params.has(name)) continue;
    const stored = persistedLabParam(name, sceneId);
    if (stored === null) continue;
    params.set(name, stored);
    changed = true;
  }
  if (changed) {
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }
}

// Single write path for HUD controls: updates the URL (reload by default so
// the lab reboots with the new state, replaceState for live-applied params)
// and persists the values for this lab. Pass null/undefined to delete a param.
export function setLabParams(updates, { navigate = true, persist = true } = {}) {
  const params = new URLSearchParams(window.location.search);
  const sceneId = resolveSceneHubId(params);
  for (const [name, value] of Object.entries(updates)) {
    if (value === null || value === undefined || value === '') params.delete(name);
    else params.set(name, String(value));
    if (persist && PERSISTED_LAB_PARAMS.includes(name)) persistLabParam(name, value, sceneId);
  }
  const query = params.toString();
  if (navigate) {
    window.location.search = query;
  } else {
    window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }
}

// --- Parity HUD controls -------------------------------------------------

// Free-text model loader: paste any local path or hosted URL (CORS
// permitting) instead of hand-editing ?model=.
export function bindModelUrlControl({
  button = document.getElementById('modelUrlApply'),
  input = document.getElementById('modelUrlInput'),
} = {}) {
  if (!input || !button) return;

  const apply = () => {
    const url = input.value.trim();
    if (!url) return;
    persistLabParam('model', url);
    navigateToCharacterModel(url);
  };
  button.addEventListener('click', apply);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') apply();
  });
}

// Clears this lab's stored state and reloads it with a clean URL.
export function bindResetLabControl({
  button = document.getElementById('resetLabButton'),
} = {}) {
  if (!button) return;
  button.addEventListener('click', () => {
    clearLabState();
    window.location.href = window.location.pathname;
  });
}

// Surfaces model-load failures in the HUD instead of a silently empty scene.
// The labs already publish load state on document.body.dataset.modelReady.
export function bindModelErrorBanner({
  banner = document.getElementById('modelLoadError'),
} = {}) {
  if (!banner || typeof MutationObserver === 'undefined') return;

  const update = () => {
    const state = document.body.dataset.modelReady;
    if (state === 'error') {
      const model = document.body.dataset.modelUrl
        || new URLSearchParams(window.location.search).get('model')
        || 'model';
      const isRemote = /^https?:\/\//i.test(model);
      banner.textContent = `Failed to load ${model}.`
        + (isRemote ? ' Remote URLs need CORS headers (Access-Control-Allow-Origin) on the host.' : '')
        + ' See the browser console for details.';
      banner.hidden = false;
    } else {
      banner.hidden = true;
    }
  };
  new MutationObserver(update).observe(document.body, {
    attributeFilter: ['data-model-ready'],
    attributes: true,
  });
  update();
}
