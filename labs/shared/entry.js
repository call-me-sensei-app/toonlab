import {
  bindCharacterModelControl,
  bindSceneHubControl,
} from './sceneHub.js';
import {
  bindModelErrorBanner,
  bindModelUrlControl,
  bindResetLabControl,
  persistLabParam,
  persistLabScene,
  restorePersistedParams,
} from './labParams.js';
import { initializeHudTabs } from './hudTabs.js';
import { resolveRendererKind } from './rendererKind.js';
import { installRendererSwitcher } from './rendererSwitcher.js';
import { primeActiveStyleBundle } from './stylePreference.js';

// Merge persisted lab state into the URL (explicit params win) BEFORE any lab
// module reads location.search.
restorePersistedParams();
primeActiveStyleBundle();

const params = new URLSearchParams(window.location.search);
const controllerMode = (params.get('controller') || '').toLowerCase();
const pathname = window.location.pathname.toLowerCase();
const isPlaygroundPath = pathname.startsWith('/playground');
const isRockLabPath = pathname.startsWith('/rock-lab');

// `?renderer=` flag (TSL migration): stamp the requested kind before any lab
// module loads. labs/shared/rendererFactory.js creates the matching renderer
// and reports the actual backend as dataset.rendererBackend after init.
document.body.dataset.rendererKind = resolveRendererKind();
installRendererSwitcher();

bindSceneHubControl({ onSelect: persistLabScene });
bindCharacterModelControl({ onSelect: (model) => persistLabParam('model', model) });
bindModelUrlControl();
bindModelErrorBanner();
bindResetLabControl();

// Loader parse failures (bad magic, corrupt file, HTML served for a missing
// path) can throw inside three.js loader callbacks, escaping the labs'
// promise chains. While the model is still loading, treat any uncaught error
// as a failed load so the HUD banner surfaces it instead of a silent scene.
function markModelLoadFailed(event) {
  const reason = event?.error ?? event?.reason;
  if (reason) {
    document.body.dataset.runtimeError = reason?.message || String(reason);
  }
  if (document.body.dataset.modelReady === 'false') {
    document.body.dataset.modelReady = 'error';
  }
}
window.addEventListener('error', markModelLoadFailed);
window.addEventListener('unhandledrejection', markModelLoadFailed);

if (isRockLabPath || (params.get('scene') || '').toLowerCase() === 'rock') {
  // Rock Lab remains available to the local migration workflow, but its
  // current optional catalog/reference modes still reach the licensed dev
  // archive. Keeping this import behind Vite's compile-time DEV flag prevents
  // Rollup from pulling that graph into otherwise clean production pages.
  if (import.meta.env.DEV) {
    import('../rock-lab/main.js');
  } else {
    document.body.dataset.modelReady = 'blocked';
    const error = document.querySelector('#model-error');
    if (error) {
      error.hidden = false;
      error.textContent = 'This route is not part of the public Labs surface.';
    }
  }
} else if (isPlaygroundPath || controllerMode === 'ecctrl') {
  // The Shader Lab initializes its own tabs in main.js; the playground's
  // identical tab strip is wired here.
  initializeHudTabs(params.get('hudTab') || 'character');
  import('../playground/ecctrlMain.jsx').catch((error) => {
    document.body.dataset.playgroundImportError = error?.message || String(error);
    throw error;
  });
} else {
  // /shader-lab/ (the Shader Lab page; the root path is the Labs home and
  // does not load this bootstrap).
  import('../shader-lab/main.js');
}
