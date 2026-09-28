import { createRoot } from 'react-dom/client';

import '../../shared/ui/tokens.css';
import '../../shared/ui/kit.css';
import './app.css';

import { installRendererSwitcher } from '../../shared/rendererSwitcher.js';
import { createFbxEditorEngine } from '../engine/fbxEditorEngine.js';
import { createFbxStore } from '../store/fbxStore.js';
import { App, openFbxFile } from './App.jsx';

if (!window.__fbxLabBooted) {
  window.__fbxLabBooted = true;
  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createFbxStore();
  const engine = createFbxEditorEngine({ mount: document.getElementById('stage'), store });
  // Automation/debug handle (capture scripts and MCP verification drive this).
  window.__fbxLab = { engine, store };

  window.addEventListener('keydown', (event) => {
    const target = event.target;
    const typing = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
      if (typing) return;
      event.preventDefault();
      engine.actions.undoDelete();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'o') {
      event.preventDefault();
      openFbxFile(engine);
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'w') engine.actions.setGizmoMode('translate');
    else if (key === 'e') engine.actions.setGizmoMode('rotate');
    else if (key === 'r') engine.actions.setGizmoMode('scale');
    else if (key === 'f') engine.actions.frameSelection();
    else if (key === 'delete' || key === 'backspace') {
      const selectedId = store.getState().selectedId;
      if (selectedId) engine.actions.deleteObject(selectedId);
    } else if (key === 'escape') engine.actions.selectById(null);
  });

  // Drag-drop an .fbx anywhere on the page.
  window.addEventListener('dragover', (event) => {
    event.preventDefault();
    document.body.dataset.fxDragging = 'true';
  });
  window.addEventListener('dragleave', () => {
    delete document.body.dataset.fxDragging;
  });
  window.addEventListener('drop', async (event) => {
    event.preventDefault();
    delete document.body.dataset.fxDragging;
    const file = [...(event.dataTransfer?.files ?? [])]
      .find((candidate) => candidate.name.toLowerCase().endsWith('.fbx'));
    if (!file) return;
    engine.actions.loadFromArrayBuffer(await file.arrayBuffer(), file.name);
  });

  // Deep-link loading (dev bridge or gallery URLs): /fbx-lab?src=/assets-local/….fbx
  const src = urlParams.get('src');
  if (src) {
    fetch(src)
      .then(async (response) => {
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        const buffer = await response.arrayBuffer();
        const name = decodeURIComponent(src.split('/').pop() || 'model.fbx');
        engine.actions.loadFromArrayBuffer(buffer, name);
      })
      .catch((error) => {
        console.error('FBX ?src load failed:', error);
        store.setState({ error: `Could not fetch ${src}: ${error.message}`, status: 'error' });
      });
  }

  engine.start().catch((error) => {
    console.error('FBX Editor failed to start:', error);
    document.body.dataset.modelReady = 'error';
  });

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    installRendererSwitcher();
    createRoot(document.getElementById('app')).render(<App engine={engine} store={store} />);
    requestAnimationFrame(() => { document.body.dataset.uiReady = 'true'; });
  }
}
