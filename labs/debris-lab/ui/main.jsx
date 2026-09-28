import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { isLabEditorLocation, stampLabHomeDocument } from '../../shared/labViewRouting.js';
import { createDebrisEngine } from '../engine/debrisEngine.js';
import { createDebrisStore } from '../store/debrisStore.js';
import { App } from './App.jsx';

if (!window.__debrisLabBooted) {
  window.__debrisLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createDebrisStore({ urlParams });
  const editor = isLabEditorLocation({ directParams: ['debrisRecipe', 'recipe', 'debrisPreset', 'debrisStyle'] });
  store.actions.setView({ gallery: !editor });
  stampLabHomeDocument(!editor);
  const engine = editor
    ? createDebrisEngine({ mount: document.getElementById('stage'), store })
    : null;

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
    const stages = { 1: 'type', 2: 'shape', 3: 'scatter', 4: 'look' };
    if (stages[event.key]) {
      store.actions.setStage(stages[event.key]);
      store.actions.setView({ drawer: false });
    } else if (event.key.toLowerCase() === 'r') store.actions.randomizeCurrent();
    else if (event.key === '`') store.actions.setView({ drawer: !store.getState().view.drawer });
    else if (event.key === 'Escape') store.actions.setView({ export: false });
  });

  engine?.start().catch((error) => {
    console.error('Debris Lab failed to start:', error);
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
