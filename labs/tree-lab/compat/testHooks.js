// window.__treeDesigner / window.__flowerDesigner — the Playwright/test
// contract, backed by the shared store + engine. Semantics preserved from
// the legacy designer:
// setRecipe rebuilds SYNCHRONOUSLY (tests call geometryHash immediately
// after), and every hook works with ?hud=0 (no React mounted).

import { BUILT_IN_TREE_PRESETS } from '../treePresetStore.js';

export function installTestHooks({ engine, labKind = 'tree', store }) {
  const isFlowerLab = labKind === 'flower';
  const hookName = isFlowerLab ? '__flowerDesigner' : '__treeDesigner';
  window[hookName] = {
    getBuiltInPresetIds: () => BUILT_IN_TREE_PRESETS
      .filter((preset) => isFlowerLab ? preset.type === 'flower' : preset.type !== 'flower')
      .map((preset) => preset.id),
    getRecipe: () => store.actions.getRecipeDocument(),
    getSettings: () => JSON.parse(JSON.stringify(store.getState().settings)),
    setRecipe: (recipe) => store.actions.setRecipe(recipe),
    rebuild: engine.rebuild,
    geometryHash: engine.geometryHash,
    getPlant: engine.getPlant,
    getPreviewLod: () => store.getState().previewLod,
    getPreviewStats: () => ({
      error: document.body.dataset.treePreviewError ?? null,
      level: document.body.dataset.treePreviewLod ?? 'edit',
      materials: Number(document.body.dataset.treePreviewMaterials ?? 0),
      triangleCap: Number(document.body.dataset.treePreviewTriangleCap ?? 0),
      triangles: Number(document.body.dataset.treePreviewTriangles ?? 0),
    }),
    setPreviewLod: (level) => store.actions.setPreviewLod(level),
    // World point → CSS pixel coordinates (stroke tests aim at the real
    // on-screen trunk instead of guessing pixels).
    projectToScreen: engine.projectToScreen,
    // Store access for redesign-era tests (P2+ UI drives through this).
    getState: store.getState,
    actions: store.actions,
  };
}
