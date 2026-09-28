import { createRoot } from 'react-dom/client';

import { registerModelTextureAssetPaths } from '../../../src/character/modelLoader.js';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { isWalkPreviewInputCode } from '../../shared/walkPreview.js';
import { createCharacterShaderEngine } from './engine.js';
import { createCharacterShaderStore } from './store.js';
import { App } from './App.jsx';
import { TEST_CHARACTER_TEXTURE_ASSET_PATHS } from '../assetCatalog.js';

registerModelTextureAssetPaths(TEST_CHARACTER_TEXTURE_ASSET_PATHS);

if (!window.__characterShaderBooted) {
  window.__characterShaderBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createCharacterShaderStore({ urlParams });
  const engine = createCharacterShaderEngine({ mount: document.getElementById('stage'), store });
  // Automation handle (capture/probe scripts drive the lab through it).
  window.__characterShader = { engine, store };

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      if (typing) return;
      event.preventDefault();
      if (event.shiftKey) store.actions.redo();
      else store.actions.undo();
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    // The walk controller owns its input codes while the preview is on.
    if (store.getState().walkPreview && isWalkPreviewInputCode(event.code)) return;
    if (event.key.toLowerCase() === 'c') engine.resetCamera();
  });

  engine.start().catch((error) => {
    console.error('Character Shader Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    // Renderer switching lives in the top bar (RendererToggle) — no floating pill.
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
