import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { createWaterLabEngine } from '../engine/waterLabEngine.js';
import { createWaterStore } from '../store/waterStore.js';
import { App } from './App.jsx';

if (!window.__waterLabBooted) {
  window.__waterLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createWaterStore({ urlParams });
  const hasExplicitEntry = ['waterDoc', 'waterPreset', 'waterMode', 'waterScenario', 'waterStyle', 'waterStage']
    .some((key) => urlParams.has(key));
  const showEntryChooser = !hasExplicitEntry && store.getState().bootSource !== 'handoff';
  const engine = createWaterLabEngine({ mount: document.getElementById('stage'), store });
  // Automation handle (capture/probe scripts drive the camera through it).
  window.__waterLab = { engine, store };

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
    if (event.key.toLowerCase() === 'b') engine.dropBall();
    else if (event.key.toLowerCase() === 'c') engine.resetCamera();
  });

  engine.start().catch((error) => {
    console.error('Water Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    // Renderer switching lives in the top bar (RendererToggle) — no floating pill.
    createRoot(document.getElementById('app')).render(
      <App engine={engine} showEntryChooser={showEntryChooser} store={store} />,
    );
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
