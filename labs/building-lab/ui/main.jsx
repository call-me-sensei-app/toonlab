import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { installRendererSwitcher } from '../../shared/rendererSwitcher.js';
import { createBuildingEngine } from '../engine/buildingEngine.js';
import { createBuildingStore } from '../store/buildingStore.js';
import { App } from './App.jsx';

if (!window.__buildingLabBooted) {
  window.__buildingLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createBuildingStore({ urlParams });
  const engine = createBuildingEngine({ mount: document.getElementById('stage'), store });

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
    const stages = { 1: 'type', 2: 'shape', 3: 'roof', 4: 'facade', 5: 'look', 6: 'place' };
    if (stages[event.key]) {
      store.actions.setStage(stages[event.key]);
      store.actions.setView({ drawer: false });
    } else if (event.key.toLowerCase() === 'r') store.actions.randomizeCurrent();
    else if (event.key === '`') store.actions.setView({ drawer: !store.getState().view.drawer });
    else if (event.key === 'Escape') store.actions.setView({ export: false });
  });

  engine.start().catch((error) => {
    console.error('Building Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    installRendererSwitcher();
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
