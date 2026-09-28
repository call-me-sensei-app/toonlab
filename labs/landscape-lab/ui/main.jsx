import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { createLandscapeLabEngine } from '../engine/landscapeLabEngine.js';
import { installLandscapeTools } from '../engine/landscapeTools.js';
import { createLandscapeStore } from '../store/landscapeStore.js';
import { loadLandscapeProject } from '../landscapeProjectStore.js';
import { installProAssetResolvers } from '../proAssets.js';
import { App } from './App.jsx';

if (!window.__landscapeLabBooted) {
  window.__landscapeLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  // IndexedDB restore is async — resolve it before the store boots so a
  // reload opens straight into the saved project (top-level await).
  const saved = await loadLandscapeProject();
  // Register pro-creation/pro-texture resolvers before the engine restores a
  // project that may reference library assets (harmless on OSS — resolution
  // only runs when such a ref actually exists).
  installProAssetResolvers();
  const store = createLandscapeStore({ urlParams, saved });
  const engine = createLandscapeLabEngine({ mount: document.getElementById('stage'), store });
  const tools = installLandscapeTools({ engine, store });
  // Automation handle (capture/probe scripts drive the camera through it).
  window.__landscapeLab = { engine, store, tools };

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
    const key = event.key;
    if (key === '[' || key === ']') {
      // ToonLab convention: [ and ] step the brush radius.
      const radius = store.getState().settings.brushRadius;
      const next = key === '[' ? radius / 1.15 : radius * 1.15;
      store.actions.setSetting('brushRadius', Math.round(next * 10) / 10);
    } else if (key === '1' || key === '2' || key === '3') {
      store.actions.setMode(key === '1' ? 'sculpt' : key === '2' ? 'paint' : 'foliage');
    } else if (key === 'Escape') {
      if (tools.hasRampAnchor()) tools.cancelRamp();
      if (tools.hasTunnelAnchor()) tools.cancelTunnel();
    } else if (key.toLowerCase() === 'c') {
      engine.resetCamera();
    }
  });

  engine.start().then(async () => {
    // First run (no autosave): hand the user a sculptable starter landscape
    // instead of a cold flat plane. One deterministic archetype bake + a few
    // tree strokes — both ordinary history entries, so undo (or Reset lab)
    // returns to flat. `?fresh=1` forces the flat start for testing.
    if (store.getState().bootSource === 'fresh' && urlParams.get('fresh') !== '1') {
      store.actions.seedFromArchetype('lakeland', 7);
      await engine.runFoliageStrokeForTest([
        { x: -22, z: -14 }, { x: -10, z: -26 }, { x: 14, z: -18 }, { x: 26, z: 8 }, { x: -18, z: 20 },
      ]);
      store.actions.setStatus('Seeded a starter landscape — sculpt away, or Reset lab for a flat start.');
      engine.resetCamera();
    }
  }).catch((error) => {
    console.error('Landscape Lab failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
