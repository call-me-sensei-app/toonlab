import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { isLabEditorLocation, stampLabHomeDocument } from '../../shared/labViewRouting.js';
import { installRendererSwitcher } from '../../shared/rendererSwitcher.js';
import { takeLabHandoff } from '../../shared/labHandoff.js';
import { createTextureEngine } from '../engine/textureEngine.js';
import { createTextureStore } from '../store/textureStore.js';
import { App } from './App.jsx';

if (!window.__textureLabBooted) {
  window.__textureLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createTextureStore({ urlParams });
  const editor = isLabEditorLocation({ directParams: ['textureRecipe', 'importImage'] });
  // The URL owns the initial surface. This prevents a persisted/default
  // gallery flag from bouncing a freshly opened editor back to its home page.
  store.actions.setView({ gallery: !editor });
  stampLabHomeDocument(!editor);
  const engine = editor
    ? createTextureEngine({ mount: document.getElementById('stage'), store })
    : null;
  window.__textureLab = { engine, store };
  if (engine) {
    // Shared Gallery/Library asset-page contract. The outer page owns the
    // wipe handle; Texture Lab renders neutral maps on the left and the
    // selected environment style on the right.
    window.__assetLabEngine = engine;
    engine.setCompare(urlParams.get('compare') === '1');
    engine.setSplit(Number.parseFloat(urlParams.get('split')) || 0.2);
  }

  // Cross-lab import (e.g. Asset Browser → "Toonify in Texture Lab"): the
  // handoff carries the same {dataUrl, name} shape as a manual upload and
  // lands as the image base layer — same sequence as the gallery's
  // "From an image" button, so it opens straight into the editor.
  if (urlParams.get('importImage') === '1') {
    const layer = takeLabHandoff('texture-image');
    if (layer?.dataUrl) {
      store.actions.startFromScratch();
      store.actions.setImage(layer);
    }
  }

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
    const stages = { 1: 'base', 2: 'color', 3: 'overlays', 4: 'surface', 5: 'ai' };
    if (stages[event.key]) {
      store.actions.setStage(stages[event.key]);
      store.actions.setView({ drawer: false });
    } else if (event.key.toLowerCase() === 'r') store.actions.reseed();
    else if (event.key === '`') store.actions.setView({ drawer: !store.getState().view.drawer });
    else if (event.key === 'Escape') store.actions.setView({ export: false });
  });

  engine?.start().catch((error) => {
    console.error('Texture Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    if (editor) installRendererSwitcher();
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
