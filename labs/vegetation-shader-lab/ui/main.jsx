import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';
import './preview.css';

import { createVegetationMaterialLabEngine } from './engine.js';
import { createVegetationMaterialLabStore } from './store.js';
import { App } from './App.jsx';

function scopeFromLocation(
  pathname = window.location.pathname,
  search = window.location.search,
) {
  const requestedScope = new URLSearchParams(search).get('vegetationScope');
  if (['tree', 'grass', 'flower'].includes(requestedScope)) return requestedScope;
  if (pathname.startsWith('/tree-shader-lab')) return 'tree';
  if (pathname.startsWith('/grass-shader-lab')) return 'grass';
  if (pathname.startsWith('/flower-shader-lab')) return 'flower';
  return 'vegetation';
}

if (!window.__vegetationMaterialLabBooted) {
  window.__vegetationMaterialLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const scope = scopeFromLocation();
  const store = createVegetationMaterialLabStore({ scope, urlParams });
  const engine = await createVegetationMaterialLabEngine({
    mount: document.getElementById('stage'),
    store,
  });
  window.__vegetationMaterialLab = { engine, scope, store };

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
      && event.key.toLowerCase() === 'c') engine.resetCamera();
  });

  engine.start().catch((error) => {
    console.error('Vegetation Shader Lab failed to start:', error);
    document.body.dataset.modelError = String(error?.stack ?? error?.message ?? error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
