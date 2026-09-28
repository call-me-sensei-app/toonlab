import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { App } from './App.jsx';
import { createAtmosphericConditionLabEngine } from './engine.js';
import { createAtmosphericConditionLabStore } from './store.js';

const initialUrlParams = new URLSearchParams(window.location.search);
if (initialUrlParams.get('workspace') === 'cloud') {
  // Compatibility for old Lab cards/bookmarks. Cloud appearance is now an
  // independent profile editor; atmospheric conditions remain on this route.
  window.location.replace('/cloud-shader-lab/');
} else if (!window.__atmosphericConditionLabBooted) {
  window.__atmosphericConditionLabBooted = true;
  const urlParams = initialUrlParams;
  const store = createAtmosphericConditionLabStore({ urlParams });
  const engine = createAtmosphericConditionLabEngine({
    mount: document.getElementById('stage'),
    store,
  });
  window.__atmosphericConditionLab = { engine, store };

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement;
    if (typing) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) store.actions.redo();
      else store.actions.undo();
    }
  });

  createRoot(document.getElementById('app')).render(<App store={store} />);
  requestAnimationFrame(() => {
    document.body.dataset.uiReady = 'true';
  });

  engine.start().catch((error) => {
    console.error('Atmospheric Condition Lab failed to start:', error);
    store.actions.adoptEngineState({
      status: error instanceof Error ? error.message : String(error),
    });
    document.body.dataset.atmosphericConditionLabReady = 'error';
  });

  window.addEventListener('beforeunload', () => engine.dispose(), {
    once: true,
  });
}
