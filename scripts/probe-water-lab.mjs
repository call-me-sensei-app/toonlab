// Headless smoke for the standalone Water Lab: boots the lab on WebGPU and
// the WebGL fallback, asserts the probe dataset contract, then drives the
// "Preview in scene" handoff into the playground and asserts the settings
// (preset + color tone) actually flowed.
import { chromium } from 'playwright';

const BASE = process.argv[2] ?? 'http://localhost:5177';
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

function distance3(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

async function bootPage(url) {
  // Each scenario gets clean local/session storage. Otherwise the Beach
  // switch in the native-backend case changes the initial ground/preset seen
  // by the forced fallback and preview-handoff cases.
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
  // HMR/settle guard: give the page a beat, then re-read the dataset fresh.
  await page.waitForTimeout(2500);
  const dataset = await page.evaluate(() => ({ ...document.body.dataset }));
  return { context, dataset, errors, page };
}

// --- 1. WebGPU boot ---------------------------------------------------------
{
  const { context, dataset, errors, page } = await bootPage(`${BASE}/water-lab/`);
  check('webgpu: modelReady', dataset.modelReady === 'true', JSON.stringify(dataset));
  check('webgpu: scene dataset', dataset.scene === 'water-lab');
  check('webgpu: water dataset mirrored', dataset.waterMode === 'lake' && dataset.waterTone === 'classic' && Boolean(dataset.waterLevel));
  check('webgpu: stage dataset mirrored', dataset.waterStage === 'shore', dataset.waterStage);
  check('webgpu: backend reported', ['webgpu', 'webgl2-fallback'].includes(dataset.rendererBackend), dataset.rendererBackend);
  console.log(`     backend: ${dataset.rendererBackend}`);
  check('webgpu: UI ready', dataset.uiReady === 'true');
  check('webgpu: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  const workspace = await page.evaluate(() => ({
    active: document.querySelector('[data-testid="section-stage"]')?.dataset.active,
    groups: [...document.querySelectorAll('[data-testid^="group-"]')].map((entry) => entry.dataset.testid),
    rail: Boolean(document.querySelector('[data-testid="section-rail"]')),
    railSections: document.querySelectorAll('button[data-testid^="section-"]').length,
    title: document.querySelector('[data-testid="inspector-title"]')?.textContent?.trim(),
  }));
  check('webgpu: left workflow rail renders', workspace.rail, JSON.stringify(workspace));
  check('webgpu: rail exposes Stage + 7 setting sections', workspace.railSections === 8, String(workspace.railSections));
  check('webgpu: Stage is the active focused inspector', workspace.active === 'true' && workspace.title === 'Stage', JSON.stringify(workspace));
  check('webgpu: right inspector renders one focused section', workspace.groups.length === 1 && workspace.groups[0] === 'group-stage', workspace.groups.join(', '));

  await page.click('[data-testid="section-waves"]');
  const wavesInspector = await page.evaluate(() => ({
    active: document.querySelector('[data-testid="section-waves"]')?.dataset.active,
    groups: [...document.querySelectorAll('[data-testid^="group-"]')].map((entry) => entry.dataset.testid),
    title: document.querySelector('[data-testid="inspector-title"]')?.textContent?.trim(),
  }));
  check('webgpu: rail swaps the focused settings group', wavesInspector.active === 'true' && wavesInspector.title === 'Waves', JSON.stringify(wavesInspector));
  check('webgpu: inactive groups leave the inspector', wavesInspector.groups.length === 1 && wavesInspector.groups[0] === 'group-waves', wavesInspector.groups.join(', '));

  const initialCameraButton = await page.evaluate(() => window.__waterLab.engine.controls.mouseButtons.LEFT);
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Pan' }).click();
  await page.waitForFunction((initial) => window.__waterLab.engine.controls.mouseButtons.LEFT !== initial, initialCameraButton);
  const panCameraButton = await page.evaluate(() => window.__waterLab.engine.controls.mouseButtons.LEFT);
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Zoom' }).click();
  await page.waitForFunction((pan) => window.__waterLab.engine.controls.mouseButtons.LEFT !== pan, panCameraButton);
  const zoomCameraButton = await page.evaluate(() => window.__waterLab.engine.controls.mouseButtons.LEFT);
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Rotate' }).click();
  await page.waitForFunction((initial) => window.__waterLab.engine.controls.mouseButtons.LEFT === initial, initialCameraButton);
  const rotateCameraButton = await page.evaluate(() => window.__waterLab.engine.controls.mouseButtons.LEFT);
  check(
    'webgpu: camera bar maps left-drag to rotate, pan, and zoom',
    new Set([rotateCameraButton, panCameraButton, zoomCameraButton]).size === 3 && rotateCameraButton === initialCameraButton,
    JSON.stringify({ panCameraButton, rotateCameraButton, zoomCameraButton }),
  );
  const cameraBounds = await page.evaluate(() => ({
    maxDistance: window.__waterLab.engine.controls.maxDistance,
    maxTargetRadius: window.__waterLab.engine.controls.maxTargetRadius,
  }));
  check('webgpu: camera stays inside the fully shaded water tile',
    cameraBounds.maxDistance <= 65 && cameraBounds.maxTargetRadius <= 34,
    JSON.stringify(cameraBounds));

  // Exercise the real gestures as well as the enum mapping. This catches the
  // failure mode where the segmented bar updates but OrbitControls remains
  // frozen after a WebGPU stage rebuild.
  const cameraPose = () => page.evaluate(() => ({
    position: window.__waterLab.engine.camera.position.toArray(),
    target: window.__waterLab.engine.controls.target.toArray(),
  }));
  const resetCamera = async () => {
    await page.getByRole('button', { name: 'Reset camera' }).click();
    await page.waitForTimeout(80);
  };
  const canvasPoint = await page.evaluate(() => {
    const rect = window.__waterLab.engine.renderer.domElement.getBoundingClientRect();
    return {
      x: rect.left + rect.width * 0.52,
      y: rect.top + rect.height * 0.48,
    };
  });
  await resetCamera();
  const rotateBefore = await cameraPose();
  await page.mouse.move(canvasPoint.x, canvasPoint.y);
  await page.mouse.down();
  await page.mouse.move(canvasPoint.x + 90, canvasPoint.y - 55, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const rotateAfter = await cameraPose();
  check('webgpu: rotate drag moves the camera',
    distance3(rotateBefore.position, rotateAfter.position) > 0.02,
    JSON.stringify({ rotateBefore, rotateAfter }));

  await resetCamera();
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Pan' }).click();
  const panBefore = await cameraPose();
  await page.mouse.move(canvasPoint.x, canvasPoint.y);
  await page.mouse.down();
  await page.mouse.move(canvasPoint.x + 75, canvasPoint.y + 35, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const panAfter = await cameraPose();
  check('webgpu: pan drag moves the orbit target',
    distance3(panBefore.target, panAfter.target) > 0.02,
    JSON.stringify({ panBefore, panAfter }));

  await resetCamera();
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Zoom' }).click();
  const zoomBefore = await cameraPose();
  await page.mouse.move(canvasPoint.x, canvasPoint.y);
  await page.mouse.down();
  await page.mouse.move(canvasPoint.x, canvasPoint.y + 95, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(80);
  const zoomAfter = await cameraPose();
  const zoomDistanceBefore = distance3(zoomBefore.position, zoomBefore.target);
  const zoomDistanceAfter = distance3(zoomAfter.position, zoomAfter.target);
  check('webgpu: zoom drag changes camera distance',
    Math.abs(zoomDistanceBefore - zoomDistanceAfter) > 0.02,
    JSON.stringify({ zoomDistanceBefore, zoomDistanceAfter }));
  await resetCamera();
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Rotate' }).click();

  // Switch the expensive ground while the native backend is live, then make
  // a camera input immediately. The old regression rendered the new scene
  // and blocked interaction for roughly ten seconds during pipeline churn.
  await page.click('[data-testid="section-stage"]');
  const stageSwitchStarted = Date.now();
  await page.locator('[data-testid="stage-ground"]').selectOption('beach');
  await page.waitForFunction(
    () => document.body.dataset.waterStage === 'beach' &&
      window.__waterLab.store.getState().settings.runupDistance === 10,
    { timeout: 10000 },
  );
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Pan' }).click();
  await page.waitForFunction(
    (rotateButton) => window.__waterLab.engine.controls.mouseButtons.LEFT !== rotateButton,
    rotateCameraButton,
    { timeout: 2500 },
  );
  const stageSwitchInputMs = Date.now() - stageSwitchStarted;
  check('webgpu: Beach switch remains camera-responsive', stageSwitchInputMs < 2500,
    `${stageSwitchInputMs} ms`);
  console.log(`     Beach switch + camera input: ${stageSwitchInputMs} ms`);
  const beachState = await page.evaluate(() => ({
    runupDistance: window.__waterLab.store.getState().settings.runupDistance,
    stage: document.body.dataset.waterStage,
    waterLevel: Number(document.body.dataset.waterLevel),
  }));
  check('webgpu: Beach loads the measured 10 m swash contract',
    beachState.stage === 'beach' && beachState.runupDistance === 10 &&
      Math.abs(beachState.waterLevel - 0.36) < 1e-6,
    JSON.stringify(beachState));
  await page.locator('[data-testid="camera-mode"] button', { hasText: 'Rotate' }).click();
  await resetCamera();

  // Capture more than a complete ~8.2 s Coast swash period. These artifacts
  // make edge attachment, event-to-event variation, raster stepping, water
  // coverage, and interior-vs-edge foam regressions reviewable together.
  for (let phase = 0; phase < 4; phase += 1) {
    if (phase > 0) await page.waitForTimeout(3200);
    await page.screenshot({
      path: `${SHOT_DIR}/water-lab-beach-phase-${phase + 1}.png`,
      timeout: 10000,
    }).catch(() => {});
  }

  await page.locator('.wl-stagebar select').selectOption('caustics');
  await page.screenshot({ path: `${SHOT_DIR}/water-lab-beach-caustics.png`, timeout: 10000 }).catch(() => {});
  await page.locator('.wl-stagebar select').selectOption('off');
  check('webgpu: Beach stage adds no renderer errors', errors.length === 0, errors.slice(0, 8).join(' | '));
  await page.screenshot({ path: `${SHOT_DIR}/water-lab-webgpu.png`, timeout: 10000 }).catch(() => {});
  await context.close();
}

// --- 2. WebGL fallback boot ---------------------------------------------------
{
  const { context, dataset, errors, page } = await bootPage(`${BASE}/water-lab/?renderer=webgl`);
  check('webgl: modelReady', dataset.modelReady === 'true', JSON.stringify(dataset));
  check('webgl: forced fallback backend', dataset.rendererBackend === 'webgl2-fallback', dataset.rendererBackend);
  check('webgl: no page errors', errors.length === 0, errors.slice(0, 5).join(' | '));
  await page.screenshot({ path: `${SHOT_DIR}/water-lab-webgl.png`, timeout: 10000 }).catch(() => {});
  await context.close();
}

// --- 3. Preview-in-scene handoff (Call Me Sensei style × Lake preset) -----------
{
  const { context, dataset, page } = await bootPage(`${BASE}/water-lab/?waterPreset=call_me_sensei`);
  check('handoff: lab boots the Call Me Sensei style',
    dataset.waterStyle === 'call_me_sensei' && dataset.waterMode === 'lake', JSON.stringify(dataset));
  await page.click('[data-testid="preview-scene"]');
  await page.waitForURL('**/playground/**', { timeout: 30000 });
  await page.waitForFunction(
    () => document.body.dataset.waterReady === 'true' || document.body.dataset.modelReady === 'error',
    { timeout: 120000 },
  ).catch(() => {});
  await page.waitForTimeout(2500);
  const play = await page.evaluate(() => ({ ...document.body.dataset }));
  check('handoff: playground water ready', play.waterReady === 'true', JSON.stringify(play).slice(0, 300));
  check('handoff: color tone flowed into the preview', play.waterTone === 'anime', play.waterTone);
  check('handoff: preset flowed into the preview', play.waterMode === 'lake', play.waterMode);
  check('handoff: style flowed into the preview', play.waterStyle === 'call_me_sensei', play.waterStyle);
  await page.screenshot({ path: `${SHOT_DIR}/water-preview-scene.png`, timeout: 10000 }).catch(() => {});
  await context.close();
}

await browser.close();
if (failures > 0) {
  console.error(`\nprobe-water-lab: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nprobe-water-lab: all checks passed');
