import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';
import './contracts.css';

import { App } from './App.jsx';
import { createSkyCloudLabEngine } from './engine.js';
import {
  CLOUD_WORKSPACE,
  SKY_WORKSPACE,
  resolveLabTab,
  resolveLabWorkspace,
} from './labWorkspaces.js';
import { createSkyCloudLabStore } from './store.js';

if (!window.__volumetricSkyLabBooted) {
  window.__volumetricSkyLabBooted = true;
  const urlParams = new URLSearchParams(location.search);
  const workspace = resolveLabWorkspace(document.body.dataset.labWorkspace).id;
  const hasExplicitEntry = ['preset', 'snapshot', 'skyStyle', 'style'].some((key) => urlParams.has(key));
  const showEntryChooser = !hasExplicitEntry && urlParams.get('capture') !== '1';
  const initialTab = resolveLabTab(
    workspace,
    urlParams.get('tab') || document.body.dataset.initialTab || 'preview',
  );
  const store = createSkyCloudLabStore({ initialTab, urlParams, workspace });
  const engine = createSkyCloudLabEngine({ mount: document.getElementById('stage'), store });
  const handle = { engine, store, workspace };
  window.__skyCloudLab = handle;
  if (workspace === SKY_WORKSPACE) window.__skyLab = handle;
  if (workspace === CLOUD_WORKSPACE) window.__cloudShaderLab = handle;

  if (urlParams.get('hud') !== '0') {
    createRoot(document.getElementById('app')).render(
      <App
        engine={engine}
        showEntryChooser={showEntryChooser}
        store={store}
        workspace={workspace}
      />,
    );
  } else {
    document.getElementById('app').hidden = true;
  }
  requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });

  addEventListener('beforeunload', () => engine.dispose(), { once: true });
  engine.start().catch((error) => {
    console.error('[volumetric-sky-lab] boot failed', error);
    document.body.dataset.modelReady = 'error';
    document.body.dataset.skyReady = 'error';
    store.actions.adoptEngineState({ applying: false, status: `Preview failed: ${error.message}` });
  });
}
