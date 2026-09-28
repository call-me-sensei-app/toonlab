// Headless smoke for Landscape Lab: boots on WebGPU (and the WebGL
// fallback), then drives scripted sculpt / splat / foliage strokes through
// the SAME brush/commit path as pointer input, asserts the hybrid undo
// history round-trips, and captures screenshots.
// Run: node scripts/probe-landscape-lab.mjs [base] [shotDir]
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5175';
const SHOT_DIR = process.argv[3] ?? '.';

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal'],
});

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

async function bootPage(url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message.split('\n')[0]));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().split('\n')[0]); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.modelReady === 'true' || document.body.dataset.modelReady === 'error',
    { timeout: 90000 },
  ).catch(() => {});
  await page.waitForTimeout(2000);
  const dataset = await page.evaluate(() => ({ ...document.body.dataset }));
  return { context, dataset, errors, page };
}

// --- 1. WebGPU boot + full editing loop --------------------------------------
{
  const { context, dataset, errors, page } = await bootPage(`${BASE}/landscape-lab/`);
  check('webgpu: modelReady', dataset.modelReady === 'true', JSON.stringify(dataset));
  check('webgpu: UI ready', dataset.uiReady === 'true');
  check('webgpu: backend reported', ['webgpu', 'webgl2-fallback'].includes(dataset.rendererBackend), dataset.rendererBackend);
  console.log(`     backend: ${dataset.rendererBackend}`);
  check('webgpu: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));

  const workspace = await page.evaluate(() => ({
    modes: document.querySelectorAll('button[data-testid^="mode-"]').length,
    tools: document.querySelectorAll('button[data-testid^="tool-"]').length,
    inspector: document.querySelector('[data-testid="inspector-title"]')?.textContent?.trim(),
  }));
  check('webgpu: mode rail renders 3 modes', workspace.modes === 3, JSON.stringify(workspace));
  check('webgpu: sculpt tools render in the floating strip', workspace.tools === 9, String(workspace.tools));
  check('webgpu: inspector opens on Sculpt', workspace.inspector === 'Sculpt', workspace.inspector);

  // Warmup reload: the first boot can trigger vite's "new dependencies
  // optimized" full page reload mid-scenario (the known HMR probe race);
  // reloading here settles dependency optimization before assertions drive
  // the page.
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.modelReady === 'true', { timeout: 90000 }).catch(() => {});
  await page.waitForTimeout(1500);

  // Start from a clean project (a previous probe run may have autosaved).
  await page.evaluate(() => window.__landscapeLab.store.actions.resetLab());
  await page.waitForTimeout(300);

  // Sculpt: raise a hill, checking heights + undo round-trip.
  const sculpt = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const field = store.getDocument().field;
    const before = field.heightAt(0, 0);
    const points = [];
    for (let i = 0; i < 24; i += 1) {
      const angle = (i / 24) * Math.PI * 2;
      points.push({ x: Math.cos(angle) * 6, z: Math.sin(angle) * 6 });
    }
    for (let pass = 0; pass < 8; pass += 1) await engine.runBrushStrokeForTest(points, 'raise');
    await engine.runBrushStrokeForTest([{ x: 0, z: 0 }, { x: 2, z: 0 }], 'smooth');
    const raised = field.heightAt(4, 0);
    const canUndo = store.getState().canUndo;
    return { before, raised, canUndo };
  });
  check('webgpu: sculpt raises terrain', sculpt.raised > sculpt.before + 0.5, JSON.stringify(sculpt));
  check('webgpu: strokes fill the undo stack', sculpt.canUndo === true);

  const undoCheck = await page.evaluate(() => {
    const { store } = window.__landscapeLab;
    const field = store.getDocument().field;
    const beforeUndo = field.heightAt(4, 0);
    store.actions.undo(); // smooth
    store.actions.undo(); // last raise pass
    const afterUndo = field.heightAt(4, 0);
    store.actions.redo();
    store.actions.redo();
    const afterRedo = field.heightAt(4, 0);
    return { beforeUndo, afterUndo, afterRedo };
  });
  check('webgpu: terrain undo reverts heights', undoCheck.afterUndo !== undoCheck.beforeUndo, JSON.stringify(undoCheck));
  check('webgpu: terrain redo restores heights', Math.abs(undoCheck.afterRedo - undoCheck.beforeUndo) < 1e-6, JSON.stringify(undoCheck));

  // Splat: paint rock (layer 2) onto the hill, verify texel change + undo.
  const splat = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const field = store.getDocument().field;
    const texel = (tx, tz) => field.splat[(tz * field.splatW + tx) * 4 + 2];
    const centerTexel = [Math.floor(field.splatW / 2), Math.floor(field.splatD / 2)];
    const before = texel(...centerTexel);
    const result = await engine.runSplatStrokeForTest(
      [{ x: 0, z: 0 }, { x: 3, z: 1 }, { x: -2, z: -2 }],
      2,
      0.9,
    );
    const after = texel(...centerTexel);
    store.actions.undo();
    const afterUndo = texel(...centerTexel);
    store.actions.redo();
    return { before, after, afterUndo, changed: result.changed };
  });
  check('webgpu: splat paint raises the rock channel', splat.after > splat.before, JSON.stringify(splat));
  check('webgpu: splat undo reverts the texel', splat.afterUndo === splat.before, JSON.stringify(splat));
  check('webgpu: splat stroke reports changed texels', splat.changed > 0, String(splat.changed));

  // Foliage: paint the default active tree entry, erase part, undo both.
  const foliage = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const paint = await engine.runFoliageStrokeForTest([
      { x: -12, z: -12 }, { x: -6, z: -14 }, { x: 2, z: -10 }, { x: 10, z: -12 },
    ]);
    const painted = store.getState().foliageTotal;
    const erase = await engine.runFoliageStrokeForTest([{ x: -12, z: -12 }], { erase: true });
    const afterErase = store.getState().foliageTotal;
    store.actions.undo(); // undo erase
    const afterUndoErase = store.getState().foliageTotal;
    store.actions.undo(); // undo paint
    const afterUndoPaint = store.getState().foliageTotal;
    store.actions.redo(); // repaint
    const afterRedo = store.getState().foliageTotal;
    return { added: paint.added, removed: erase.removed, painted, afterErase, afterUndoErase, afterUndoPaint, afterRedo };
  });
  check('webgpu: foliage paint adds instances', foliage.added > 0 && foliage.painted === foliage.added, JSON.stringify(foliage));
  check('webgpu: foliage erase removes instances', foliage.removed > 0 && foliage.afterErase === foliage.painted - foliage.removed, JSON.stringify(foliage));
  check('webgpu: foliage undo round-trips counts',
    foliage.afterUndoErase === foliage.painted && foliage.afterUndoPaint === 0 && foliage.afterRedo === foliage.painted,
    JSON.stringify(foliage));

  // Mode switching drives the tool rail.
  await page.click('[data-testid="mode-foliage"]');
  const foliageUi = await page.evaluate(() => ({
    palette: document.querySelectorAll('[data-testid^="palette-builtin-"]').length,
    rules: Boolean(document.querySelector('[data-testid="palette-rules"]')),
    tool: window.__landscapeLab.store.getState().tool,
  }));
  check('webgpu: foliage mode shows the palette grid', foliageUi.palette >= 4, JSON.stringify(foliageUi));
  check('webgpu: foliage mode arms the paint tool', foliageUi.tool === 'paintFoliage', foliageUi.tool);

  // Palette manager: opens full-screen, built-in tab lists assets, and a
  // remove → re-add round-trip works (removal also erases painted instances).
  await page.click('[data-testid="manage-palette"]');
  await page.waitForSelector('[data-testid="palette-manager"]', { timeout: 10000 });
  // The browser grid fills from an effect one tick after mount.
  await page.waitForSelector('.ll-manager-results .ll-library-tile', { timeout: 10000 });
  const managerBefore = await page.evaluate(() => ({
    entries: document.querySelectorAll('[data-testid^="manager-entry-"]').length,
    tiles: document.querySelectorAll('.ll-manager-results .ll-library-tile').length,
    width: document.querySelector('[data-testid="palette-manager"]').getBoundingClientRect().width,
    viewport: window.innerWidth,
    tabs: document.querySelectorAll('[data-testid="manager-tabs"] button').length,
  }));
  check('webgpu: manager lists the current palette', managerBefore.entries >= 4, JSON.stringify(managerBefore));
  check('webgpu: manager built-in browser lists assets', managerBefore.tiles >= 4, JSON.stringify(managerBefore));
  check('webgpu: manager is truly full screen', Math.abs(managerBefore.width - managerBefore.viewport) < 2,
    JSON.stringify(managerBefore));
  check('webgpu: manager shows all four source tabs', managerBefore.tabs === 4, String(managerBefore.tabs));
  await page.evaluate(() => {
    document.querySelector('[data-testid="manager-entry-builtin-rock-mossy"] .tk-icon-button')?.click()
      ?? window.__landscapeLab.store.actions.removePaletteEntry('builtin-rock-mossy');
  });
  await page.waitForFunction(
    () => !window.__landscapeLab.store.getState().palette.some((entry) => entry.id === 'builtin-rock-mossy'),
    { timeout: 5000 },
  );
  const removedCount = await page.evaluate(() => window.__landscapeLab.store.getState().palette.length);
  check('webgpu: manager removes a palette entry', removedCount === managerBefore.entries - 1, String(removedCount));
  await page.evaluate(() => {
    const tiles = [...document.querySelectorAll('.ll-manager-results .ll-library-tile')];
    tiles.find((tile) => !tile.disabled && tile.textContent.includes('Mossy'))?.click();
  });
  await page.waitForFunction(
    () => window.__landscapeLab.store.getState().palette.some((entry) => entry.id === 'builtin-rock-mossy'),
    { timeout: 5000 },
  );
  check('webgpu: manager re-adds from the built-in browser', true);
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="palette-manager"]', { state: 'detached', timeout: 5000 });
  await page.click('[data-testid="mode-paint"]');
  const paintUi = await page.evaluate(() => ({
    layers: document.querySelectorAll('button[data-testid^="layer-"]').length,
    tool: window.__landscapeLab.store.getState().tool,
  }));
  check('webgpu: paint mode shows 4 target layers', paintUi.layers === 4, JSON.stringify(paintUi));

  // Holes: punch through the terrain, raycast passes through, undo restores.
  const holes = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const field = store.getDocument().field;
    const result = await engine.runHoleStrokeForTest([{ x: 20, z: 20 }]);
    const punched = field.isHole(20, 20);
    const rayThrough = field.raycast({ x: 20, y: 80, z: 20 }, { x: 0, y: -1, z: 0 });
    store.actions.undo();
    const afterUndo = field.isHole(20, 20);
    store.actions.redo();
    const afterRedo = field.isHole(20, 20);
    return { changed: result.changed, punched, rayThrough, afterUndo, afterRedo };
  });
  check('webgpu: hole stroke punches quads', holes.changed > 0 && holes.punched === true, JSON.stringify(holes));
  check('webgpu: rays pass through cave openings', holes.rayThrough === null);
  check('webgpu: hole undo/redo round-trips', holes.afterUndo === false && holes.afterRedo === true, JSON.stringify(holes));
  await page.evaluate(async () => {
    await window.__landscapeLab.engine.runHoleStrokeForTest([{ x: 20, z: 20 }], { restore: true });
  });

  // Brush Shape: square brushes reach their corners; round ones don't.
  const brushShape = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const field = store.getDocument().field;
    store.actions.setSetting('brushShape', 'square');
    await engine.runHoleStrokeForTest([{ x: -32, z: -32 }]);
    const radius = store.getState().settings.brushRadius;
    const cornerOffset = radius * 0.85;
    const squareCorner = field.isHole(-32 + cornerOffset, -32 + cornerOffset);
    store.actions.undo();
    store.actions.setSetting('brushShape', 'round');
    await engine.runHoleStrokeForTest([{ x: -32, z: -32 }]);
    const roundCorner = field.isHole(-32 + cornerOffset, -32 + cornerOffset);
    store.actions.undo();
    return { squareCorner, roundCorner };
  });
  check('webgpu: brush shape setting drives square vs round holes',
    brushShape.squareCorner === true && brushShape.roundCorner === false, JSON.stringify(brushShape));

  // Draped cursor: hovering a cliff face stretches the outline down the
  // wall (large Y-span, fill hidden); flat ground keeps it flat with fill.
  const drape = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    store.actions.setMode('sculpt');
    store.actions.setTool('raise');
    store.actions.setSetting('brushShape', 'round');
    store.actions.setSetting('brushRadius', 6);
    store.actions.setSetting('brushStrength', 1);
    for (let i = 0; i < 14; i += 1) await engine.runBrushStrokeForTest([{ x: -40, z: -40 }], 'raise');
    engine.camera.position.set(-14, 14, -14);
    engine.controls.target.set(-40, 3, -40);
    engine.controls.update();
    const element = engine.renderer.domElement;
    const bounds = element.getBoundingClientRect();
    const hover = (x, y, z) => {
      const v = engine.camera.position.clone().set(x, y, z).project(engine.camera);
      element.dispatchEvent(new PointerEvent('pointermove', {
        bubbles: true,
        clientX: bounds.left + ((v.x + 1) / 2) * bounds.width,
        clientY: bounds.top + ((1 - v.y) / 2) * bounds.height,
      }));
    };
    const cursorSpan = () => {
      const group = engine.scene.getObjectByName('LandscapeBrushCursor');
      const ring = group.getObjectByName('BrushOutline');
      const positions = ring.geometry.attributes.position.array;
      let min = Infinity;
      let max = -Infinity;
      for (let i = 1; i < positions.length; i += 3) {
        min = Math.min(min, positions[i]);
        max = Math.max(max, positions[i]);
      }
      const disc = group.children.find((child) => child.geometry?.type === 'CircleGeometry');
      return { span: max - min, fill: disc.visible, visible: group.visible };
    };
    const field = store.getDocument().field;
    // Cliff flank of the spike, then flat ground far away.
    hover(-37.5, field.heightAt(-37.5, -40) * 0.6, -40);
    const wall = cursorSpan();
    hover(-14, field.heightAt(-14, -14), -14);
    const flat = cursorSpan();
    store.actions.undo(); // remove the spike strokes we added (14 strokes → undo all)
    for (let i = 0; i < 13; i += 1) store.actions.undo();
    return { wall, flat };
  });
  check('webgpu: cursor drapes down cliff faces',
    drape.wall.visible && drape.wall.span > 3 && drape.wall.fill === false, JSON.stringify(drape));
  check('webgpu: cursor stays flat with fill on level ground',
    drape.flat.visible && drape.flat.span < 2 && drape.flat.fill === true, JSON.stringify(drape));

  // Dry zones: the brush suppresses stage water; a DRY hole sets hole + dry
  // in ONE stroke and one undo clears both.
  const dryZones = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const field = store.getDocument().field;
    await engine.runDryStrokeForTest([{ x: -20, z: -20 }]);
    const dried = field.isDry(-20, -20);
    store.actions.undo();
    const afterUndo = field.isDry(-20, -20);
    await engine.runHoleStrokeForTest([{ x: -20, z: 20 }], { dry: true });
    const compound = field.isHole(-20, 20) && field.isDry(-20, 20);
    store.actions.undo();
    const compoundUndone = !field.isHole(-20, 20) && !field.isDry(-20, 20);
    return { dried, afterUndo, compound, compoundUndone };
  });
  check('webgpu: dry brush paints + undoes', dryZones.dried === true && dryZones.afterUndo === false,
    JSON.stringify(dryZones));
  check('webgpu: dry hole is one compound undo entry', dryZones.compound && dryZones.compoundUndone,
    JSON.stringify(dryZones));

  // Tunnel: a swept tube bores HORIZONTALLY through a ridge. Terrain is
  // punched ONLY at the portals; the crest above the passage stays intact
  // heightfield. Floor + walls meshes appear, and it is ONE history entry.
  const tunnel = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const field = store.getDocument().field;
    store.actions.setSetting('brushRadius', 6);
    store.actions.setSetting('brushStrength', 1);
    for (let i = 0; i < 16; i += 1) await engine.runBrushStrokeForTest([{ x: 40, z: 0 }], 'raise');
    const ridgeHeight = field.heightAt(40, 0);
    const a = { x: 40, y: field.heightAt(40, -8), z: -8 };
    const b = { x: 40, y: field.heightAt(40, 8), z: 8 };
    const result = await engine.runTunnelForTest(a, b, { width: 5, height: 3 });
    const tunnelCount = store.getDocument().tunnels.length;
    const group = engine.scene.getObjectByName('LandscapeTunnels');
    const meshCount = group ? group.children.length : 0;
    let portalHoles = 0;
    for (let z = -8; z <= 8; z += 0.5) {
      if (field.isHole(40, z)) portalHoles += 1;
    }
    const crestIntact = !field.isHole(40, 0) && field.heightAt(40, 0) === ridgeHeight
      && ridgeHeight > 3.8; // the ridge really is above the tube ceiling
    store.actions.undo();
    const undone = store.getDocument().tunnels.length === 0
      && (group ? group.children.length : 0) === 0
      && !field.isHole(40, -7);
    store.actions.redo();
    const redone = store.getDocument().tunnels.length === tunnelCount
      && group.children.length === meshCount;
    store.actions.undo(); // drop the tunnel again
    for (let i = 0; i < 16; i += 1) store.actions.undo(); // drop the ridge strokes
    return { bored: result.bored, tunnelId: result.tunnelId, tunnelCount, meshCount, portalHoles, crestIntact, undone, redone };
  });
  check('webgpu: tunnel punches only the portals, crest stays intact',
    tunnel.bored > 0 && tunnel.portalHoles > 0 && tunnel.crestIntact, JSON.stringify(tunnel));
  check('webgpu: tunnel builds floor + wall meshes in the scene',
    Boolean(tunnel.tunnelId) && tunnel.tunnelCount === 1 && tunnel.meshCount === 2, JSON.stringify(tunnel));
  check('webgpu: tunnel is one undo entry and redo restores it',
    tunnel.undone && tunnel.redone, JSON.stringify(tunnel));

  // The planner modal: two-click gesture state opens it; Bore commits a
  // dead-end cave through the same pipeline.
  await page.evaluate(() => {
    const { store } = window.__landscapeLab;
    const field = store.getDocument().field;
    store.actions.openTunnelPlanner({
      a: { x: -40, y: field.heightAt(-40, -8), z: -8 },
      b: { x: -40, y: field.heightAt(-40, 8), z: 8 },
    });
  });
  await page.waitForSelector('[data-testid="tunnel-planner"]', { timeout: 10000 });
  await page.click('[data-testid="tunnel-preset-round"]');
  await page.click('[data-testid="tunnel-bore"]');
  const plannerResult = await page.evaluate(() => {
    const { store } = window.__landscapeLab;
    const committed = store.getDocument().tunnels.length;
    const closed = store.getState().tunnelPlanner === null;
    store.actions.undo();
    return { committed, closed, afterUndo: store.getDocument().tunnels.length };
  });
  check('webgpu: planner modal bores and closes',
    plannerResult.committed === 1 && plannerResult.closed && plannerResult.afterUndo === 0,
    JSON.stringify(plannerResult));

  // Surface placement: a tilted single instance survives serialize round-trip.
  const placed = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const layer = await engine.foliage.ensureLayer(store.getState().palette[0].id);
    const before = layer.count;
    const added = layer.addInstances([{ x: 30, y: 8, z: 30, yaw: 0.5, scale: 1, tilt: [0, 0, 1, 0] }]);
    const data = layer.serializeInstances();
    const stride9 = data.length === layer.count * 9;
    layer.removeInstances(added.map((record) => record.id));
    return { before, afterAdd: before + added.length, stride9 };
  });
  check('webgpu: tilted instances serialize at stride 9', placed.stride9, JSON.stringify(placed));

  // Grass painting: the builtin grass entry paints through its own blade
  // layer (GrassFoliageLayer), not mesh instancing, and undo round-trips.
  const grassPaint = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    store.actions.updatePaletteEntry('builtin-grass', { active: true });
    store.actions.updatePaletteEntry('builtin-tree-green', { active: false });
    const before = store.getState().foliageTotal;
    const painted = await engine.runFoliageStrokeForTest([{ x: -30, z: 30 }, { x: -26, z: 32 }]);
    const layer = engine.foliage.layerFor('builtin-grass');
    const isGrassLayer = Boolean(layer) && layer.name.startsWith('LandscapeGrass');
    const total = store.getState().foliageTotal;
    store.actions.undo();
    const afterUndo = store.getState().foliageTotal;
    store.actions.redo();
    store.actions.updatePaletteEntry('builtin-grass', { active: false });
    store.actions.updatePaletteEntry('builtin-tree-green', { active: true });
    return { added: painted.added, before, total, afterUndo, isGrassLayer };
  });
  check('webgpu: grass paints via the blade layer', grassPaint.added > 0 && grassPaint.isGrassLayer, JSON.stringify(grassPaint));
  check('webgpu: grass undo round-trips', grassPaint.afterUndo === grassPaint.before
    && grassPaint.total === grassPaint.before + grassPaint.added, JSON.stringify(grassPaint));

  // Layer textures: assigning a texgen preset bakes and applies an albedo.
  const layerTexture = await page.evaluate(async () => {
    const { store } = window.__landscapeLab;
    store.actions.setLayerTexture(2, { kind: 'texgen', presetId: 'cliff-rock' });
    await new Promise((resolve) => setTimeout(resolve, 4000)); // texgen bake
    const materialLayers = store.getState().materialLayers;
    return {
      ref: materialLayers[2]?.textureRef?.presetId,
      status: store.getState().status,
    };
  });
  check('webgpu: texgen layer texture assigned without errors',
    layerTexture.ref === 'cliff-rock' && !String(layerTexture.status).startsWith('Layer texture failed'),
    JSON.stringify(layerTexture));

  // Guide: full-screen, sections navigate.
  await page.click('[data-testid="open-guide"]');
  await page.waitForSelector('[data-testid="landscape-guide"]', { timeout: 10000 });
  await page.click('[data-testid="guide-recipes"]');
  const guide = await page.evaluate(() => ({
    width: document.querySelector('[data-testid="landscape-guide"]').getBoundingClientRect().width,
    viewport: window.innerWidth,
    sections: document.querySelectorAll('.ll-guide-nav-item').length,
    heading: document.querySelector('.ll-guide-body h2')?.textContent,
  }));
  check('webgpu: guide opens full screen with sections',
    Math.abs(guide.width - guide.viewport) < 2 && guide.sections >= 10 && guide.heading === 'Recipes',
    JSON.stringify(guide));
  await page.keyboard.press('Escape');
  await page.waitForSelector('[data-testid="landscape-guide"]', { state: 'detached', timeout: 5000 });

  // Generate modal: pick a tile on the map view, generate mountains, undo.
  await page.click('[data-testid="doc-title"]');
  await page.click('[data-testid="open-terrain-generate"]');
  await page.waitForSelector('[data-testid="terrain-generate"]', { timeout: 10000 });
  const mapBox = await page.locator('[data-testid="generate-map"]').boundingBox();
  await page.mouse.click(mapBox.x + mapBox.width * 0.1, mapBox.y + mapBox.height * 0.1);
  await page.locator('[data-testid="generate-type"]').selectOption('mountains');
  const preGenerate = await page.evaluate(() => {
    const field = window.__landscapeLab.store.getDocument().field;
    const tile = field.quadsPerTile * field.spacing;
    return {
      cx: field.origin.x + tile * 0.5,
      cz: field.origin.z + tile * 0.5,
      height: field.heightAt(field.origin.x + tile * 0.5, field.origin.z + tile * 0.5),
    };
  });
  await page.click('[data-testid="generate-apply"]');
  await page.waitForSelector('[data-testid="terrain-generate"]', { state: 'detached', timeout: 30000 });
  const postGenerate = await page.evaluate(({ cx, cz }) => {
    const { store } = window.__landscapeLab;
    const generated = store.getDocument().field.heightAt(cx, cz);
    store.actions.undo();
    const undone = store.getDocument().field.heightAt(cx, cz);
    store.actions.redo();
    return { generated, undone };
  }, preGenerate);
  check('webgpu: generate rewrites the selected tile',
    Math.abs(postGenerate.generated - preGenerate.height) > 0.25, JSON.stringify({ preGenerate, postGenerate }));
  check('webgpu: generate undoes as one compound entry',
    Math.abs(postGenerate.undone - preGenerate.height) < 1e-6, JSON.stringify({ preGenerate, postGenerate }));

  // Camera bar: the segmented mode maps what an unarmed left-drag does.
  await page.evaluate(() => window.__landscapeLab.store.actions.setTool('orbit'));
  const rotateLeft = await page.evaluate(() => window.__landscapeLab.engine.controls.mouseButtons.LEFT);
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Pan' }).click();
  await page.waitForFunction(
    (initial) => window.__landscapeLab.engine.controls.mouseButtons.LEFT !== initial,
    rotateLeft,
    { timeout: 5000 },
  );
  const panLeft = await page.evaluate(() => window.__landscapeLab.engine.controls.mouseButtons.LEFT);
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Rotate' }).click();
  check('webgpu: camera bar maps left-drag rotate/pan', rotateLeft !== panLeft,
    JSON.stringify({ rotateLeft, panLeft }));

  // Terrain resize through the placement-grid UI: expand 2×2 → 4×4 with the
  // existing block dragged to (2,1); world content must not move.
  const preResize = await page.evaluate(() => {
    const field = window.__landscapeLab.store.getDocument().field;
    return { tilesX: field.tilesX, tilesZ: field.tilesZ, height: field.heightAt(4, 0) };
  });
  await page.click('[data-testid="doc-title"]');
  await page.click('[data-testid="open-terrain-size"]');
  await page.waitForSelector('[data-testid="terrain-size"]', { timeout: 10000 });
  await page.locator('[data-testid="size-tiles-x"]').selectOption('4');
  await page.locator('[data-testid="size-tiles-z"]').selectOption('4');
  await page.waitForSelector('[data-testid="size-cell-3-3"]', { timeout: 5000 });
  // Grip the block's top-left cell, drag it so the block lands at (2,1).
  const gripBox = await page.locator('[data-testid="size-cell-0-0"]').boundingBox();
  const dropBox = await page.locator('[data-testid="size-cell-2-1"]').boundingBox();
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(dropBox.x + dropBox.width / 2, dropBox.y + dropBox.height / 2, { steps: 6 });
  await page.mouse.up();
  await page.click('[data-testid="size-apply"]');
  await page.waitForFunction(
    () => window.__landscapeLab.store.getDocument().field.tilesX === 4,
    { timeout: 5000 },
  );
  const postResize = await page.evaluate(() => {
    const field = window.__landscapeLab.store.getDocument().field;
    return {
      tilesX: field.tilesX,
      tilesZ: field.tilesZ,
      height: field.heightAt(4, 0),
      originX: field.origin.x,
      originZ: field.origin.z,
    };
  });
  check('webgpu: resize expands the tile grid', postResize.tilesX === 4 && postResize.tilesZ === 4, JSON.stringify(postResize));
  check('webgpu: resize keeps sculpted heights at world coords',
    Math.abs(postResize.height - preResize.height) < 1e-6,
    JSON.stringify({ preResize, postResize }));
  const resizeUndo = await page.evaluate(() => {
    const { store } = window.__landscapeLab;
    store.actions.undo();
    const undone = store.getDocument().field.tilesX;
    store.actions.redo();
    return { undone, redone: store.getDocument().field.tilesX };
  });
  check('webgpu: resize undo/redo swaps the whole grid',
    resizeUndo.undone === preResize.tilesX && resizeUndo.redone === 4, JSON.stringify(resizeUndo));

  // Seed-from-archetype is one undoable entry.
  const seed = await page.evaluate(() => {
    const { store } = window.__landscapeLab;
    const field = store.getDocument().field;
    const before = field.heightAt(20, 20);
    store.actions.seedFromArchetype('rollingPlains', 7);
    const after = field.heightAt(20, 20);
    store.actions.undo();
    const afterUndo = field.heightAt(20, 20);
    store.actions.redo();
    return { before, after, afterUndo };
  });
  check('webgpu: archetype seed changes terrain', seed.after !== seed.before, JSON.stringify(seed));
  check('webgpu: archetype seed undoes in one step', Math.abs(seed.afterUndo - seed.before) < 1e-6, JSON.stringify(seed));

  // Walk preview: toggling loads the mannequin, snaps it to the terrain,
  // and WASD input moves it with foliage collision resolving.
  await page.click('[data-testid="stage-walk"]');
  await page.waitForFunction(
    () => window.__landscapeLab.engine.scene.getObjectByName('Walk mannequin'),
    { timeout: 30000 },
  );
  const walk = await page.evaluate(async () => {
    const { engine, store } = window.__landscapeLab;
    const walker = engine.scene.getObjectByName('Walk mannequin');
    const start = { x: walker.position.x, y: walker.position.y, z: walker.position.z };
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW', bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 900));
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyW', bubbles: true }));
    const field = store.getDocument().field;
    const end = { x: walker.position.x, y: walker.position.y, z: walker.position.z };
    return {
      moved: Math.hypot(end.x - start.x, end.z - start.z),
      groundError: Math.abs(end.y - field.heightAt(end.x, end.z)),
    };
  });
  check('webgpu: walk preview moves the walker', walk.moved > 0.2, JSON.stringify(walk));
  check('webgpu: walker stays grounded on the sculpted field', walk.groundError < 0.5, JSON.stringify(walk));

  // Tools stay armed while walking (edit-from-inside-the-world workflow).
  const walkEditing = await page.evaluate(() => {
    const { store } = window.__landscapeLab;
    store.actions.setMode('sculpt');
    store.actions.setTool('raise');
    return { tool: store.getState().tool, walking: store.getState().walkPreview };
  });
  check('webgpu: brushes stay armed during walk preview',
    walkEditing.walking === true && walkEditing.tool === 'raise', JSON.stringify(walkEditing));

  // Follow (TPS lock): the character stays centered — the orbit target pins
  // to the walker every frame, even while idle — and the vertical look range
  // opens to the full 0..π.
  await page.click('[data-testid="walk-camera"] button:nth-child(2)');
  await page.waitForTimeout(300);
  const followMode = await page.evaluate(async () => {
    const { engine } = window.__landscapeLab;
    const walker = engine.scene.getObjectByName('Walk mannequin');
    walker.position.x += 5; // idle teleport: free mode would NOT re-center
    await new Promise((resolve) => setTimeout(resolve, 250));
    const target = engine.controls.target;
    return {
      centered: Math.hypot(target.x - walker.position.x, target.z - walker.position.z) < 0.05,
      visible: walker.visible,
      minPolar: engine.controls.minPolarAngle,
      maxPolar: engine.controls.maxPolarAngle,
    };
  });
  check('webgpu: follow mode keeps the character centered',
    followMode.centered && followMode.visible === true, JSON.stringify(followMode));
  check('webgpu: walk modes unlock the full vertical look range',
    followMode.minPolar === 0 && Math.abs(followMode.maxPolar - Math.PI) < 1e-6, JSON.stringify(followMode));

  // First person: camera pins to the walker's head, mannequin hides.
  await page.click('[data-testid="walk-camera"] button:nth-child(3)');
  await page.waitForTimeout(400);
  const firstPerson = await page.evaluate(() => {
    const { engine } = window.__landscapeLab;
    const walker = engine.scene.getObjectByName('Walk mannequin');
    const head = { x: walker.position.x, y: walker.position.y + 1.5, z: walker.position.z };
    const distance = Math.hypot(
      engine.camera.position.x - head.x,
      engine.camera.position.y - head.y,
      engine.camera.position.z - head.z,
    );
    return { distance, visible: walker.visible, mode: window.__landscapeLab.store.getState().walkCamera };
  });
  check('webgpu: first person pins the camera to the head',
    firstPerson.mode === 'first' && firstPerson.distance < 1.2, JSON.stringify(firstPerson));
  check('webgpu: first person hides the mannequin', firstPerson.visible === false);
  await page.click('[data-testid="walk-camera"] button:nth-child(1)');
  await page.waitForTimeout(300);
  const thirdPerson = await page.evaluate(() => {
    const { engine } = window.__landscapeLab;
    const walker = engine.scene.getObjectByName('Walk mannequin');
    return { visible: walker.visible, mode: window.__landscapeLab.store.getState().walkCamera };
  });
  check('webgpu: third person restores the follow view',
    thirdPerson.mode === 'third' && thirdPerson.visible === true, JSON.stringify(thirdPerson));
  await page.click('[data-testid="stage-walk"]');

  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT_DIR}/landscape-lab-webgpu.png`, timeout: 10000 }).catch(() => {});
  await page.evaluate(() => window.__landscapeLab.engine.setCameraView('low'));
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/landscape-lab-low.png`, timeout: 10000 }).catch(() => {});
  check('webgpu: editing loop adds no page errors', errors.length === 0, errors.slice(0, 8).join(' | '));

  // Autosave lands in IndexedDB and a reload restores it.
  const expectedFoliage = await page.evaluate(() => window.__landscapeLab.store.getState().foliageTotal);
  await page.waitForTimeout(2600); // autosave debounce
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.modelReady === 'true', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const restored = await page.evaluate(() => ({
    bootSource: window.__landscapeLab.store.getState().bootSource,
    foliageTotal: window.__landscapeLab.store.getState().foliageTotal,
    height: window.__landscapeLab.store.getDocument().field.heightAt(20, 20),
  }));
  check('webgpu: reload restores the autosaved project', restored.bootSource === 'persisted', JSON.stringify(restored));
  check('webgpu: restored terrain keeps the seeded heights', Math.abs(restored.height - seed.after) < 1e-6, JSON.stringify({ restored: restored.height, expected: seed.after }));
  check('webgpu: restored foliage reloads instances', restored.foliageTotal === expectedFoliage,
    JSON.stringify({ restored, expectedFoliage }));

  // Export → import round-trip through the portable document.
  const roundTrip = await page.evaluate(async () => {
    const { store } = window.__landscapeLab;
    const heightBefore = store.getDocument().field.heightAt(20, 20);
    const json = await store.actions.exportDocument();
    const result = await store.actions.importDocument(json);
    return {
      ok: result.ok,
      size: json.length,
      heightAfter: store.getDocument().field.heightAt(20, 20),
      heightBefore,
    };
  });
  check('webgpu: export/import round-trips in-app', roundTrip.ok === true && Math.abs(roundTrip.heightAfter - roundTrip.heightBefore) < 1e-6, JSON.stringify(roundTrip));
  console.log(`     export size: ${(roundTrip.size / 1024).toFixed(0)} KB`);
  await context.close();
}

// --- 2. WebGL fallback boot ---------------------------------------------------
{
  const { context, dataset, errors, page } = await bootPage(`${BASE}/landscape-lab/?renderer=webgl`);
  check('webgl: modelReady', dataset.modelReady === 'true', JSON.stringify(dataset));
  check('webgl: forced fallback backend', dataset.rendererBackend === 'webgl2-fallback', dataset.rendererBackend);
  check('webgl: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.evaluate(async () => {
    const { engine } = window.__landscapeLab;
    const points = [];
    for (let i = 0; i < 12; i += 1) points.push({ x: i - 6, z: Math.sin(i) * 4 });
    await engine.runBrushStrokeForTest(points, 'raise');
    await engine.runSplatStrokeForTest([{ x: 0, z: 0 }], 1, 0.8);
  });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${SHOT_DIR}/landscape-lab-webgl.png`, timeout: 10000 }).catch(() => {});
  await context.close();
}

await browser.close();
if (failures > 0) {
  console.error(`\nprobe-landscape-lab: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nprobe-landscape-lab: all checks passed');
