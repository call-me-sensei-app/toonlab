// Shared Tree/Flower Lab boot pipeline. Both labs use the same recipe engine
// and editor shell, while labKind owns document storage, preset filtering,
// authoring vocabulary, and tree-only attached-blossom behavior.

import { createRoot } from 'react-dom/client';
import { createDesignerStore } from '../store/designerStore.js';
import { createTreeEngine } from '../engine/engine.js';
import { createSketchBindings } from '../engine/sketchCommits.js';
import { installBranchPicking } from '../engine/picking.js';
import { createLeafParticles } from '../engine/leafParticles.js';
import { createFlowerPatch } from '../engine/flowerPatch.js';
import { createSceneDressing } from '../engine/sceneDressing.js';
import { createSkyWeather } from '../engine/skyWeather.js';
import { installTestHooks } from '../compat/testHooks.js';
import { isLabEditorLocation, stampLabHomeDocument } from '../../shared/labViewRouting.js';
import { isWalkPreviewInputCode } from '../../shared/walkPreview.js';
import { App } from './App.jsx';

export function bootPlantLab({ labKind = 'tree' } = {}) {
  const isFlowerLab = labKind === 'flower';
  const bootKey = isFlowerLab ? '__flowerDesignerBooted' : '__treeDesignerBooted';
  if (window[bootKey]) return;
  window[bootKey] = true;

  const urlParams = new URLSearchParams(window.location.search);
  const hudHidden = urlParams.get('hud') === '0';
  const store = createDesignerStore({ labKind, urlParams });
  const presetParam = isFlowerLab ? 'flowerPreset' : 'treePreset';
  const editor = isLabEditorLocation({ directParams: ['recipe', presetParam] });
  store.actions.setView({ gallery: !editor });
  stampLabHomeDocument(!editor);
  const engine = editor
    ? createTreeEngine({
      mount: document.getElementById('stage'),
      store,
      urlParams,
    })
    : null;
  const sketchBindings = engine
    ? createSketchBindings({ engine, ground: engine.ground, store })
    : null;
  if (engine) {
    installBranchPicking({ engine, store });
    createLeafParticles({ engine, store });
    // This layer means blossoms attached to a tree canopy. Standalone flower
    // heads are already built by StylizedFlower inside the shared engine.
    if (!isFlowerLab) createFlowerPatch({ engine, store });
    const dressing = createSceneDressing({ engine, store });
    createSkyWeather({ engine, grass: dressing.grass, store });
    installTestHooks({ engine, labKind, store });
  }

  // Keyboard map (single-key shortcuts suppressed while typing).
  const TOOL_KEYS = {
    b: 'branch', c: 'crown', e: 'erase', l: 'leaves', s: 'thicken', t: 'trunk', v: 'move',
  };
  const STAGE_KEYS = {
    1: 'shape', 2: 'wood', 3: 'leaves', 4: 'look', 5: 'animation', 6: 'flowers',
  };
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
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'e') {
      event.preventDefault();
      store.actions.setView({ export: true });
      return;
    }
    if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
    // Walk preview owns movement keys; single-key tool/stage shortcuts pause.
    if (store.getState().walkPreview && isWalkPreviewInputCode(event.code)) return;
    const key = event.key.toLowerCase();
    if (TOOL_KEYS[key]) store.actions.setTool(TOOL_KEYS[key]);
    else if (STAGE_KEYS[key]) {
      store.actions.setStage(STAGE_KEYS[key]);
      store.actions.setView({ drawer: false });
    } else if (key === '`') store.actions.setView({ drawer: !store.getState().view.drawer });
    else if (key === 'escape') store.actions.setTool('orbit');
    else if (key === 'r') store.actions.randomizeSeed();
    else if (key === '[') {
      const { branchRadius } = store.getState().brush;
      store.actions.setBrush({ branchRadius: Math.max(0.03, branchRadius - 0.005) });
    } else if (key === ']') {
      const { branchRadius } = store.getState().brush;
      store.actions.setBrush({ branchRadius: Math.min(0.2, branchRadius + 0.005) });
    }
  });

  // Hold Space: temporary Move — pan/orbit mid-tool, release to get the
  // tool back (the Photoshop hand-tool convention).
  let spaceHeldTool = null;
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.repeat || store.getState().walkPreview) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
      || target instanceof HTMLButtonElement) return;
    const { tool } = store.getState();
    if (tool !== 'orbit') {
      spaceHeldTool = tool;
      store.actions.setTool('orbit');
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => {
    if (event.code !== 'Space' || !spaceHeldTool) return;
    store.actions.setTool(spaceHeldTool);
    spaceHeldTool = null;
  });

  engine?.start();

  if (hudHidden) {
    document.body.dataset.hideHud = 'true';
  } else {
    const root = createRoot(document.getElementById('app'));
    root.render(
      <App engine={engine} labKind={labKind} sketchBindings={sketchBindings} store={store} />,
    );
    requestAnimationFrame(() => {
      document.body.dataset.uiReady = 'true';
    });
  }
}
