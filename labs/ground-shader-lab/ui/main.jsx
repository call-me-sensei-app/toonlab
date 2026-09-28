import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import '../../vegetation-shader-lab/ui/app.css';
import '../../shared/shader-preview/preview.css';

import { App } from './App.jsx';
import { createGroundShaderLabEngine } from './engine.js';
import { createGroundShaderLabStore } from './store.js';

if (!window.__groundShaderLabBooted) {
  window.__groundShaderLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createGroundShaderLabStore({ urlParams });
  const engine = await createGroundShaderLabEngine({
    mount: document.getElementById('stage'),
    store,
  });
  window.__groundShaderLab = { engine, store };

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement
      || target instanceof HTMLTextAreaElement
      || target instanceof HTMLSelectElement;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      if (typing) return;
      event.preventDefault();
      if (event.shiftKey) store.actions.redo();
      else store.actions.undo();
      return;
    }
    if (!typing && !event.metaKey && !event.ctrlKey && !event.altKey
      && event.key.toLowerCase() === 'c') {
      engine.resetCamera();
    }
  });

  engine.start().catch((error) => {
    console.error('Ground Shader Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
