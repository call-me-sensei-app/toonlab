// Stages and captures the Landscape Lab guide illustrations into
// public/landscape-guide/ (synced to Pro with public/). Deterministic
// scenarios built through the same scripted-stroke APIs the probes use.
// Run: node scripts/generate-landscape-guide-shots.mjs [base]
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5175';
const OUT = 'public/landscape-guide';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  args: ['--enable-unsafe-webgpu', '--enable-gpu', '--use-angle=metal'],
});
const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
await page.goto(`${BASE}/landscape-lab/?fresh=1`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.modelReady === 'true', { timeout: 90000 });
await page.waitForTimeout(2200);
await page.evaluate(() => window.__landscapeLab.store.actions.resetLab());
await page.waitForTimeout(400);

const shot = async (name) => {
  await page.waitForTimeout(450);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`captured ${name}`);
};

// 1. Sculpt: hills + the floating tool strip.
await page.evaluate(async () => {
  const { engine, store } = window.__landscapeLab;
  store.actions.setMode('sculpt');
  store.actions.setSetting('brushRadius', 14);
  store.actions.setSetting('brushStrength', 1);
  for (let pass = 0; pass < 14; pass += 1) {
    await engine.runBrushStrokeForTest([{ x: -18, z: -6 }, { x: 6, z: 10 }, { x: 22, z: -12 }], 'raise');
  }
  await engine.runBrushStrokeForTest([{ x: -18, z: -6 }, { x: 6, z: 10 }, { x: 22, z: -12 }], 'smooth');
  engine.resetCamera();
});
await shot('sculpt');

// 2. Lake: dug basin below the waterline, planted shore.
await page.evaluate(async () => {
  const { engine, store } = window.__landscapeLab;
  const ring = [];
  for (let i = 0; i < 16; i += 1) {
    const a = (i / 16) * Math.PI * 2;
    ring.push({ x: -20 + Math.cos(a) * 8, z: 22 + Math.sin(a) * 7 });
  }
  for (let pass = 0; pass < 9; pass += 1) await engine.runBrushStrokeForTest(ring, 'raise', { invert: true });
  await engine.runBrushStrokeForTest(ring, 'smooth');
  store.actions.setSetting('brushRadius', 6);
  await engine.runFoliageStrokeForTest([{ x: -34, z: 14 }, { x: -6, z: 30 }, { x: -32, z: 32 }]);
  engine.camera.position.set(-2, 16, 52);
  engine.controls.target.set(-20, -1, 22);
  engine.controls.update();
});
await shot('lake');

// 3. Surfaces: splat patches + the Paint inspector.
await page.evaluate(async () => {
  const { engine, store } = window.__landscapeLab;
  store.actions.setMode('paint');
  store.actions.setSetting('brushRadius', 10);
  await engine.runSplatStrokeForTest([{ x: -18, z: -6 }, { x: -10, z: -2 }], 2, 0.9);
  await engine.runSplatStrokeForTest([{ x: 8, z: 12 }, { x: 14, z: 8 }], 1, 0.9);
  await engine.runSplatStrokeForTest([{ x: 24, z: -14 }], 3, 0.9);
  engine.resetCamera();
});
await shot('surfaces');

// 4. Cave: dome + dry entrance + rock interior + stalactites.
await page.evaluate(async () => {
  const { engine, store } = window.__landscapeLab;
  store.actions.setMode('sculpt');
  store.actions.setSetting('brushRadius', 18);
  const dome = [{ x: 34, z: 30 }];
  for (let pass = 0; pass < 30; pass += 1) await engine.runBrushStrokeForTest(dome, 'raise');
  await engine.runBrushStrokeForTest([{ x: 34, z: 30 }, { x: 30, z: 28 }], 'smooth');
  store.actions.setSetting('brushRadius', 3.5);
  await engine.runHoleStrokeForTest(
    [{ x: 34, z: 18 }, { x: 34, z: 22 }, { x: 34, z: 27 }],
    { dry: true },
  );
  const layer = await engine.foliage.ensureLayer('builtin-rock-granite');
  const field = store.getDocument().field;
  const records = [];
  for (let gx = -1; gx <= 1; gx += 1) {
    for (let gz = 0; gz <= 2; gz += 1) {
      records.push({ x: 34 + gx * 4.2, y: -2.4, z: 24 + gz * 4.2, yaw: gx * gz, scale: 3 });
    }
  }
  const ceiling = field.heightAt(34, 28) - 1.1;
  records.push({ x: 33, y: ceiling, z: 26, yaw: 0, scale: 0.8, tilt: [1, 0, 0, 0] });
  records.push({ x: 36, y: ceiling - 0.4, z: 28, yaw: 2, scale: 0.6, tilt: [1, 0, 0, 0] });
  const added = layer.addInstances(records);
  store.actions.commitFoliageStroke({ layers: [{ paletteId: 'builtin-rock-granite', added: added.map((r) => ({ ...r })), removed: [] }] });
  engine.camera.position.set(34, 8, -2);
  engine.controls.target.set(34, 2, 26);
  engine.controls.update();
});
await shot('cave');

// 4b. Tunnel: swept-tube bore through a ridge (portals punched, crest intact).
await page.evaluate(async () => {
  const { engine, store } = window.__landscapeLab;
  store.actions.setMode('sculpt');
  store.actions.setSetting('brushRadius', 12);
  const ridge = [{ x: -34, z: -26 }, { x: -26, z: -26 }, { x: -18, z: -26 }];
  for (let pass = 0; pass < 22; pass += 1) await engine.runBrushStrokeForTest(ridge, 'raise');
  await engine.runBrushStrokeForTest(ridge, 'smooth');
  await engine.runTunnelForTest({ x: -26, z: -36 }, { x: -26, z: -16 }, { width: 6, height: 4 });
  store.actions.setTool('tunnel');
  engine.camera.position.set(-33, 9, -62);
  engine.controls.target.set(-26, 3, -26);
  engine.controls.update();
});
await shot('tunnel');

// 4c. The tunnel planner modal (cross-section + route doodle).
await page.evaluate(() => {
  const { store } = window.__landscapeLab;
  const field = store.getDocument().field;
  store.actions.openTunnelPlanner({
    a: { x: -26, y: field.heightAt(-26, -38), z: -38 },
    b: { x: -26, y: field.heightAt(-26, -14), z: -14 },
  });
});
await page.waitForSelector('[data-testid="tunnel-planner"]');
await shot('tunnel-planner');
await page.evaluate(() => {
  window.__landscapeLab.store.actions.closeTunnelPlanner();
  window.__landscapeLab.store.actions.setTool('orbit');
});

// 5. Walk preview, first person at the cave mouth.
await page.click('[data-testid="stage-walk"]');
await page.waitForFunction(() => window.__landscapeLab.engine.scene.getObjectByName('Walk mannequin'), { timeout: 30000 });
await page.evaluate(() => {
  const { engine, store } = window.__landscapeLab;
  const walker = engine.scene.getObjectByName('Walk mannequin');
  walker.position.set(34, store.getDocument().field.heightAt(34, 14), 14);
  store.actions.setWalkCamera('first');
});
await page.waitForTimeout(500);
await page.evaluate(() => {
  const { engine } = window.__landscapeLab;
  const head = engine.controls.target;
  engine.camera.position.set(head.x, head.y, head.z - 0.3);
  engine.camera.lookAt(head.x, head.y + 0.3, head.z + 6);
  engine.controls.update();
});
await shot('walk-first');
await page.click('[data-testid="walk-camera"] button:nth-child(1)');
await page.click('[data-testid="stage-walk"]');

// 6. Foliage palette manager.
await page.click('[data-testid="mode-foliage"]');
await page.click('[data-testid="manage-palette"]');
await page.waitForSelector('[data-testid="palette-manager"]');
await shot('palette-manager');
await page.keyboard.press('Escape');

// 7. Terrain size with the block placed off-center.
await page.click('[data-testid="doc-title"]');
await page.click('[data-testid="open-terrain-size"]');
await page.waitForSelector('[data-testid="terrain-size"]');
await page.locator('[data-testid="size-tiles-x"]').selectOption('5');
await page.locator('[data-testid="size-tiles-z"]').selectOption('4');
await page.waitForTimeout(200);
const grip = await page.locator('[data-testid="size-cell-0-0"]').boundingBox();
const drop = await page.locator('[data-testid="size-cell-2-1"]').boundingBox();
await page.mouse.move(grip.x + 10, grip.y + 10);
await page.mouse.down();
await page.mouse.move(drop.x + 10, drop.y + 10, { steps: 4 });
await page.mouse.up();
await shot('terrain-size');
await page.keyboard.press('Escape');

// 8. Generate modal with tiles selected.
await page.click('[data-testid="doc-title"]');
await page.click('[data-testid="open-terrain-generate"]');
await page.waitForSelector('[data-testid="terrain-generate"]');
const mapBox = await page.locator('[data-testid="generate-map"]').boundingBox();
await page.mouse.click(mapBox.x + mapBox.width * 0.75, mapBox.y + mapBox.height * 0.25);
await page.mouse.click(mapBox.x + mapBox.width * 0.75, mapBox.y + mapBox.height * 0.75);
await page.locator('[data-testid="generate-type"]').selectOption('mountains');
await shot('generate');

await browser.close();
console.log('landscape guide shots done');
