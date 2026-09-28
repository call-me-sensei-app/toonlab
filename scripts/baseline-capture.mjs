import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const projectRoot = process.cwd();
const appUrl = process.env.VISUAL_BASELINE_URL || 'http://127.0.0.1:5175/shader-lab/legacy/';

// `?renderer=` matrix: webgpu (default; no param appended) | webgl (TSL
// WebGL2 fallback) | webgpu-forced-gl (compatibility alias of webgl). Every kind gets
// a hard assertion that the page booted the requested backend — a silent
// fallback must fail the capture, not masquerade as the backend under test.
const RENDERER_KINDS = ['webgpu', 'webgl', 'webgpu-forced-gl'];
const baselineRenderer = (process.env.TOON_BASELINE_RENDERER || 'webgpu').toLowerCase();
if (!RENDERER_KINDS.includes(baselineRenderer)) {
  console.error(`Unknown TOON_BASELINE_RENDERER "${baselineRenderer}" (expected ${RENDERER_KINDS.join(' | ')})`);
  process.exit(1);
}
const expectedRendererBackend = {
  webgl: 'webgl2-fallback',
  webgpu: 'webgpu',
  'webgpu-forced-gl': 'webgl2-fallback',
}[baselineRenderer];

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = process.env.VISUAL_BASELINE_OUT_DIR ||
  join('/private/tmp', 'threejs-toon-baselines',
    baselineRenderer === 'webgpu' ? timestamp : `${timestamp}-${baselineRenderer}`);
const viewportParts = (process.env.VISUAL_BASELINE_VIEWPORT || '2048x1160').split('x').map(Number);
const viewport = {
  height: Number.isFinite(viewportParts[1]) ? viewportParts[1] : 1160,
  width: Number.isFinite(viewportParts[0]) ? viewportParts[0] : 2048,
};
const debugModes = (process.env.TOON_BASELINE_DEBUG_MODES || 'off,sourceAlbedo,albedo,litAmount,terminator,sceneShadow,characterShadow,screenSpaceShadow,faceMap,shadowColor,lightColor,rim,specular,hairHighlight,roles,alpha')
  .split(',')
  .map((mode) => mode.trim())
  .filter(Boolean);
const captureFullMatrix = process.env.TOON_BASELINE_MATRIX === '1';
const captureScope = (process.env.TOON_BASELINE_SCOPE || 'ganyu').toLowerCase();

function chromiumLaunchOptions() {
  const options = {
    args: ['--enable-unsafe-webgpu', '--enable-gpu'],
    headless: true,
  };
  if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) options.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  return options;
}

const assets = {
  backdrop: 'assets-local/environments/tests/indoor/Liyue/backgrounds/background-afternoon.jpg',
  environment: 'assets-local/environments/tests/indoor/Liyue/models/IndoorScene_Ly_Xyx2022.fbx',
  furinaFbx: 'assets-local/models/tests/fbx/furina/source/furina.fbx',
  furinaGlb: 'assets-local/models/tests/glb/furina.glb',
  ganyu: 'assets-local/models/tests/pmx/ganyu/ganyu.pmx',
  glb: 'assets-local/models/tests/glb/lumine.glb',
  kazuha: 'assets-local/models/tests/pmx/kazuha/kazuha.pmx',
  nicole: 'assets-local/models/tests/pmx/nicole/nicole.pmx',
  obj: 'assets-local/models/tests/obj/source/Lumine.obj',
  objMtl: 'assets-local/models/tests/obj/source/Lumine.mtl',
};

const baselineScenarios = [
  {
    name: 'ganyu-front',
    params: { captureView: 'front', hud: '0', model: assets.ganyu },
    requiredAssets: [assets.ganyu],
  },
  {
    name: 'ganyu-side',
    params: { captureView: 'side', hud: '0', model: assets.ganyu },
    requiredAssets: [assets.ganyu],
  },
  {
    name: 'ganyu-back',
    params: { captureView: 'back', hud: '0', model: assets.ganyu },
    requiredAssets: [assets.ganyu],
  },
  {
    name: 'kazuha-face',
    params: { captureView: 'face', hud: '0', model: assets.kazuha },
    requiredAssets: [assets.kazuha],
  },
  {
    name: 'nicole-face',
    params: { captureView: 'face', hud: '0', model: assets.nicole },
    requiredAssets: [assets.nicole],
  },
  {
    name: 'obj-lumine',
    params: { hud: '0', model: assets.obj, mtl: assets.objMtl },
    requiredAssets: [assets.obj, assets.objMtl],
  },
  {
    name: 'glb-test',
    params: { hud: '0', model: assets.glb },
    requiredAssets: [assets.glb],
  },
  {
    name: 'furina-glb-face',
    params: { captureView: 'face', hud: '0', model: assets.furinaGlb, modelSize: '1.38' },
    requiredAssets: [assets.furinaGlb],
  },
  {
    name: 'furina-fbx-face',
    params: { captureView: 'face', hud: '0', model: assets.furinaFbx, modelSize: '1.38' },
    requiredAssets: [assets.furinaFbx],
  },
  {
    name: 'ganyu-environment',
    params: {
      env: '1',
      envBackdrop: '1',
      envOpenWindows: '1',
      envShader: 'anime',
      envView: 'interior',
      hud: '0',
      model: assets.ganyu,
    },
    requiredAssets: [assets.ganyu, assets.environment, assets.backdrop],
  },
];

// Fully procedural (no requiredAssets): deterministic on any clone.
// Captured under TOON_BASELINE_SCOPE=rock so the default ganyu scope and
// its baselines are untouched.
const rockScenarios = [
  {
    name: 'rock-boulder-hero',
    params: {
      captureView: 'hero', hud: '0', rockPreset: 'boulder', rockSeed: '7', scene: 'rock',
    },
  },
  {
    name: 'rock-karst-front',
    params: {
      captureView: 'front', hud: '0', rockPreset: 'karst-spire', rockSeed: '3', scene: 'rock',
    },
  },
  {
    name: 'rock-sea-stack-hero',
    params: {
      captureView: 'hero', hud: '0', rockPreset: 'sea-stack', rockSeed: '5', scene: 'rock',
    },
  },
  {
    name: 'rock-arch-hero',
    params: {
      captureView: 'hero', hud: '0', rockPreset: 'column-arch', rockSeed: '7', scene: 'rock',
    },
  },
];
const rockScenarioNames = new Set(rockScenarios.map((scenario) => scenario.name));
baselineScenarios.push(...rockScenarios);

const ganyuScenarioNames = new Set([
  'ganyu-front',
  'ganyu-side',
  'ganyu-back',
  'ganyu-environment',
]);

function localAssetExists(assetPath) {
  return existsSync(resolve(projectRoot, assetPath));
}

function scenarioIsAvailable(scenario) {
  return (scenario.requiredAssets || []).every(localAssetExists);
}

function missingAssetsForScenario(scenario) {
  return (scenario.requiredAssets || []).filter((assetPath) => !localAssetExists(assetPath));
}

function makeUrl(params) {
  const url = new URL(appUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, value);
  }
  return url.href;
}

function safeFileName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function buildCaptureJobs() {
  const scopedScenarios = captureScope === 'local' || captureScope === 'all'
    ? baselineScenarios
    : captureScope === 'rock'
      ? baselineScenarios.filter((scenario) => rockScenarioNames.has(scenario.name))
      : baselineScenarios.filter((scenario) => ganyuScenarioNames.has(scenario.name));
  const availableScenarios = scopedScenarios.filter(scenarioIsAvailable);
  const skippedScenarios = baselineScenarios
    .filter((scenario) => scopedScenarios.includes(scenario) && !scenarioIsAvailable(scenario))
    .map((scenario) => ({
      missingAssets: missingAssetsForScenario(scenario),
      name: scenario.name,
    }));

  const jobs = [];
  if (captureFullMatrix) {
    for (const scenario of availableScenarios) {
      for (const debugMode of debugModes) {
        jobs.push({
          name: `${scenario.name}-${debugMode}`,
          params: { ...scenario.params, toonDebug: debugMode },
          scenario: scenario.name,
          toonDebug: debugMode,
        });
      }
    }
    return { jobs, skippedScenarios };
  }

  for (const scenario of availableScenarios) {
    jobs.push({
      name: scenario.name,
      params: { ...scenario.params, toonDebug: 'off' },
      scenario: scenario.name,
      toonDebug: 'off',
    });
  }

  const debugAnchor = availableScenarios.find((scenario) => scenario.name === 'ganyu-front');
  if (debugAnchor) {
    for (const debugMode of debugModes.filter((mode) => mode !== 'off')) {
      jobs.push({
        name: `ganyu-front-${debugMode}`,
        params: { ...debugAnchor.params, toonDebug: debugMode },
        scenario: debugAnchor.name,
        toonDebug: debugMode,
      });
    }
  }

  return { jobs, skippedScenarios };
}

async function waitForSceneReady(page) {
  await page.waitForFunction(() => {
    const body = document.body;
    const modelReady = body.dataset.modelReady === 'true' || body.dataset.modelReady === 'error';
    const environmentReady = body.dataset.environmentReady !== 'false';
    const backdropReady = body.dataset.environmentBackdropReady !== 'false';
    const sunReady = body.dataset.environmentSunReady !== 'false';
    const probeReady = body.dataset.environmentProbeReady !== 'false';
    return modelReady && environmentReady && backdropReady && sunReady && probeReady;
  }, { timeout: 45000 });
  await page.waitForTimeout(700);
}

const { jobs, skippedScenarios } = buildCaptureJobs();
if (jobs.length === 0) {
  console.error('No baseline capture jobs are available. Check local ignored test assets.');
  process.exit(1);
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch(chromiumLaunchOptions());

const results = [];
let failed = false;

for (const job of jobs) {
  const messages = [];
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport,
  });

  page.on('console', (message) => {
    messages.push({ text: message.text(), type: message.type() });
  });
  page.on('pageerror', (error) => {
    messages.push({ text: error.message, type: 'pageerror' });
  });

  const url = makeUrl(baselineRenderer === 'webgl'
    ? job.params
    : { ...job.params, renderer: baselineRenderer });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await waitForSceneReady(page);

  const state = await page.evaluate(() => ({
    ambientLightCount: document.body.dataset.ambientLightCount || null,
    captureView: document.body.dataset.captureView || null,
    convertedMeshCount: document.body.dataset.convertedMeshCount || null,
    directionalLightCount: document.body.dataset.directionalLightCount || null,
    environmentReady: document.body.dataset.environmentReady || null,
    hemisphereLightCount: document.body.dataset.hemisphereLightCount || null,
    modelFormat: document.body.dataset.modelFormat || null,
    modelReady: document.body.dataset.modelReady || null,
    modelUrl: document.body.dataset.modelUrl || null,
    materialRoleSummary: document.body.dataset.materialRoleSummary || null,
    pointLightCount: document.body.dataset.pointLightCount || null,
    spotLightCount: document.body.dataset.spotLightCount || null,
    rendererBackend: document.body.dataset.rendererBackend || null,
    rendererKind: document.body.dataset.rendererKind || null,
    toonDebugMode: document.body.dataset.toonDebugMode || null,
    toonDebugValue: document.body.dataset.toonDebugValue || null,
    totalLightCount: document.body.dataset.totalLightCount || null,
  }));
  const backendMismatch = state.rendererBackend !== expectedRendererBackend;
  if (backendMismatch) {
    messages.push({
      text: `renderer backend mismatch: requested ${baselineRenderer}, page reports ${state.rendererBackend}`,
      type: 'error',
    });
  }
  const severeMessages = messages.filter((message) => (
    message.type === 'error' ||
    message.type === 'pageerror'
  ));
  const screenshotPath = join(outDir, `${safeFileName(job.name)}.png`);
  await page.screenshot({ path: screenshotPath });

  if (state.modelReady !== 'true' || severeMessages.length > 0) failed = true;

  results.push({
    ...job,
    screenshotPath,
    severeMessages,
    state,
    url,
  });

  await page.close();
}

await browser.close();

const manifest = {
  appUrl,
  captureScope,
  generatedAt: new Date().toISOString(),
  outDir,
  renderer: baselineRenderer,
  referenceImages: [
    'assets-local/reference/ganyu.png',
    'assets-local/reference/kazuha.png',
    'assets-local/reference/nicole.png',
    'assets-local/reference/scene-front.png',
    'assets-local/reference/scene-back.png',
  ].filter(localAssetExists),
  results,
  skippedScenarios,
  viewport,
};

const manifestPath = join(outDir, 'manifest.json');
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(JSON.stringify({
  failed,
  manifestPath,
  outDir,
  screenshotCount: results.length,
  skippedScenarios,
}, null, 2));

if (failed) {
  process.exitCode = 1;
}
