import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import '../../grass-lab/ui/app.css';
import './app.css';

import { App } from './App.jsx';

if (!window.__manufacturedMaterialLabBooted) {
  window.__manufacturedMaterialLabBooted = true;
  const params = new URLSearchParams(window.location.search);
  if (!params.has('renderer')) {
    params.set('renderer', 'webgl');
    history.replaceState(null, '', `${location.pathname}?${params}${location.hash}`);
  }

  createRoot(document.getElementById('app')).render(<App />);
  // Do not gate the benchmark import on requestAnimationFrame. Browsers may
  // pause rAF while a newly opened lab tab is not yet foregrounded, leaving
  // the entire editor permanently behind its loading veil. React has already
  // received the render request; the module can start loading immediately.
  try {
    await import('../../../examples/urban-prop-shader/main.js');
  } catch (error) {
    document.body.dataset.stageReady = 'error';
    const loading = document.getElementById('loading');
    if (loading) loading.textContent = `Failed to start the manufactured material lab: ${error.message}`;
    console.error(error);
  }

  const markReady = () => {
    document.body.dataset.uiReady = 'true';
  };
  if (window.__manufacturedMaterialLab) markReady();
  else window.addEventListener('toonlab:manufactured-material-ready', markReady, { once: true });
}
