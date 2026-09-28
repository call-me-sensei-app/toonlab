import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { createSkyAtmosphereSourceStore } from '../store.js';
import { App } from './App.jsx';

if (!window.__skyAtmosphereSourceLabBooted) {
  window.__skyAtmosphereSourceLabBooted = true;
  const store = createSkyAtmosphereSourceStore();
  window.__skyAtmosphereSourceLab = { store };
  document.body.dataset.rendererBackend = 'canvas2d';
  createRoot(document.getElementById('app')).render(<App store={store} />);
  requestAnimationFrame(() => {
    document.body.dataset.uiReady = 'true';
    store.actions.bake();
  });
}
