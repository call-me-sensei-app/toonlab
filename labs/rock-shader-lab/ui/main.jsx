import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import '../../vegetation-shader-lab/ui/app.css';
import '../../shared/shader-preview/preview.css';
import './app.css';

import { App } from './App.jsx';
import { createRockShaderLabEngine } from './engine.js';
import { createRockShaderLabStore } from './store.js';

if (!window.__rockShaderLabBooted) {
  window.__rockShaderLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createRockShaderLabStore({ urlParams });
  const engine = await createRockShaderLabEngine({
    mount: document.getElementById('stage'),
    store,
  });
  window.__rockShaderLab = { engine, store };

  window.addEventListener('keydown', (event) => {
    const typing = event.target instanceof HTMLInputElement
      || event.target instanceof HTMLTextAreaElement
      || event.target instanceof HTMLSelectElement;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !typing) {
      event.preventDefault();
      if (event.shiftKey) store.actions.redo();
      else store.actions.undo();
    } else if (!typing && event.key.toLowerCase() === 'c') {
      engine.resetCamera();
    }
  });

  engine.start().catch((error) => {
    console.error('Rock Shader Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
