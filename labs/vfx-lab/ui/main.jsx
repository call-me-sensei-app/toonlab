import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { createVfxLabEngine } from '../engine/vfxLabEngine.js';
import { createVfxLabStore } from '../store/vfxStore.js';
import { App } from './App.jsx';

if (!window.__vfxLabBooted) {
  window.__vfxLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createVfxLabStore({ urlParams });
  const engine = createVfxLabEngine({ mount: document.getElementById('stage'), store });

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.code === 'Space') {
      event.preventDefault();
      engine.trigger('activeEffect');
    } else if (event.key.toLowerCase() === 'l') store.actions.setLoop(!store.getState().loop);
    else if (event.key.toLowerCase() === 'r') store.actions.randomizeSeed();
  });

  engine.start().catch((error) => {
    console.error('VFX Lab failed to start:', error);
    document.body.dataset.vfxLabReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    // Renderer switching lives in the standard ToonLab top bar.
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
