// Perf harness: frame-time
// capture per scene per renderer backend, comparing native WebGPU against the
// TSL WebGL2 fallback. Mirrors the house Playwright pattern from
// scripts/baseline-capture.mjs (launch options, VISUAL_BASELINE_URL,
// requiredAssets skip logic, out-dir + manifest.json) but measures
// wall-clock rAF frame time instead of screenshots, and matrixes over ALL
// renderer kinds in one invocation instead of one per run.
//
// Capture (writes manifest.json + prints a compact JSON summary line):
//   node scripts/perf-baseline.mjs
//   PERF_RENDERERS=webgl,webgpu PERF_SCENES=ganyu-front node scripts/perf-baseline.mjs
//
// Compare two capture runs against the regression budget (<=10% frame
// time on the fallback backend):
//   node scripts/perf-baseline.mjs --compare <beforeDir> <afterDir>
//
// A single capture run ALSO reports an in-run comparison of every backend
// against that same run's `webgl` TSL fallback result. See `budgetChecks` in manifest.json and the
// final stdout summary.
//
// Exceedances are Run log findings -- this script reports them (manifest,
// final stdout line, non-zero exit) and never hides or auto-chases them.

import { existsSync, readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

const RENDERER_KINDS = ['webgpu', 'webgl', 'webgpu-forced-gl'];
const expectedRendererBackend = {
  webgl: 'webgl2-fallback',
  webgpu: 'webgpu',
  'webgpu-forced-gl': 'webgl2-fallback',
};

// Regression budget: <=10% frame time on the fallback backend. A ratio
// > BUDGET_RATIO is an exceedance.
const BUDGET_RATIO = 1.10;

const projectRoot = process.cwd();
const appUrl = process.env.VISUAL_BASELINE_URL || 'http://127.0.0.1:5175/shader-lab/legacy/';

const viewportParts = (process.env.VISUAL_BASELINE_VIEWPORT || '2048x1160').split('x').map(Number);
const viewport = {
  height: Number.isFinite(viewportParts[1]) ? viewportParts[1] : 1160,
  width: Number.isFinite(viewportParts[0]) ? viewportParts[0] : 2048,
};

function positiveIntEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : fallback;
}

const warmupFrames = positiveIntEnv('PERF_WARMUP_FRAMES', 60);
const measureFrames = positiveIntEnv('PERF_MEASURE_FRAMES', 300);
const settleMs = positiveIntEnv('PERF_SETTLE_MS', 700);

function chromiumLaunchOptions(renderer) {
  const options = {
    args: ['--enable-unsafe-webgpu', '--enable-gpu'],
    headless: true,
  };
  if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) options.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  return options;
}

// Scene list replicated from scripts/baseline-capture.mjs's `assets` map and
// `baselineScenarios`/`rockScenarios` (character front/side, environment,
// rock lab), plus a Tree Lab entry -- its own HTML entry point at
// `/tree-lab/` (vite.config.js build.rollupOptions.input.treeLab),
// not present in baseline-capture's table, added here per the Phase 9
// checklist's "tree lab if they have stable URLs". Kept as a local literal
// (not imported from baseline-capture.mjs) so this script has no
// intra-scripts/ coupling and stays runnable on its own.
const assets = {
  environment: 'assets-local/environments/tests/indoor/Liyue/models/IndoorScene_Ly_Xyx2022.fbx',
  backdrop: 'assets-local/environments/tests/indoor/Liyue/backgrounds/background-afternoon.jpg',
  ganyu: 'assets-local/models/tests/pmx/ganyu/ganyu.pmx',
};

const perfScenarios = [
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
    name: 'ganyu-environment',
    params: {
      env: '1', envBackdrop: '1', envOpenWindows: '1', envShader: 'anime', envView: 'interior', hud: '0', model: assets.ganyu,
    },
    requiredAssets: [assets.ganyu, assets.environment, assets.backdrop],
  },
  {
    name: 'rock-boulder-hero',
    params: {
      captureView: 'hero', hud: '0', rockPreset: 'boulder', rockSeed: '7', scene: 'rock',
    },
  },
  {
    name: 'tree-lab',
    params: { grass: '2000', hud: '0' },
    path: '/tree-lab/',
  },
];

function localAssetExists(assetPath) {
  return existsSync(resolve(projectRoot, assetPath));
}
function scenarioIsAvailable(scenario) {
  return (scenario.requiredAssets || []).every(localAssetExists);
}
function missingAssetsForScenario(scenario) {
  return (scenario.requiredAssets || []).filter((assetPath) => !localAssetExists(assetPath));
}

function makeUrl(params, path) {
  const url = new URL(appUrl);
  if (path) url.pathname = path;
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, value);
  }
  return url.href;
}

// Readiness gate shared with scripts/baseline-capture.mjs's
// waitForSceneReady -- deliberately loose on environment flags (scenes that
// never set them, e.g. Rock Lab / Tree Lab, read as ready trivially
// since the checks are `!== 'false'`). The settle delay is a separate step
// here (PERF_SETTLE_MS) so it stays independently configurable.
async function waitForSceneReady(page) {
  await page.waitForFunction(() => {
    const body = document.body;
    const modelReady = body.dataset.modelReady === 'true' || body.dataset.modelReady === 'error';
    const environmentReady = body.dataset.environmentReady !== 'false';
    const backdropReady = body.dataset.environmentBackdropReady !== 'false';
    const sunReady = body.dataset.environmentSunReady !== 'false';
    return modelReady && environmentReady && backdropReady && sunReady;
  }, { timeout: 45000 });
}

// Injected into the page: rAF loop collecting performance.now() deltas.
// Skips `warmupFrames` deltas (JIT/texture-upload settle), then records
// `measureFrames` deltas. Safety-capped so a stalled rAF loop cannot hang
// the harness forever; `incomplete: true` flags a short sample set instead
// of silently reporting stats from too few frames.
function measureFrameTimesInPage({ warmupFrames, measureFrames }) {
  return new Promise((resolveMeasurement) => {
    const samples = [];
    const maxAttempts = (warmupFrames + measureFrames) * 4 + 200;
    let frameIndex = 0;
    let attempts = 0;
    let previous = null;

    function onFrame() {
      attempts += 1;
      const now = performance.now();
      if (previous !== null) {
        frameIndex += 1;
        if (frameIndex > warmupFrames) samples.push(now - previous);
      }
      previous = now;

      if (samples.length >= measureFrames) {
        resolveMeasurement({ incomplete: false, samples });
        return;
      }
      if (attempts >= maxAttempts) {
        resolveMeasurement({ incomplete: true, samples });
        return;
      }
      requestAnimationFrame(onFrame);
    }

    requestAnimationFrame(onFrame);
  });
}

function percentile(sortedValues, p) {
  if (sortedValues.length === 1) return sortedValues[0];
  const rank = (p / 100) * (sortedValues.length - 1);
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sortedValues[lower];
  const weight = rank - lower;
  return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
}

function computeStats(samples) {
  if (!samples.length) {
    return {
      count: 0, max: null, mean: null, meanFps: null, median: null, min: null, p95: null, p99: null, stdDev: null,
    };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;
  const variance = sorted.reduce((sum, value) => sum + (value - mean) ** 2, 0) / sorted.length;
  return {
    count: sorted.length,
    max: sorted[sorted.length - 1],
    mean,
    meanFps: 1000 / mean,
    median: percentile(sorted, 50),
    min: sorted[0],
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    stdDev: Math.sqrt(variance),
  };
}

function round2(value) {
  return typeof value === 'number' ? Math.round(value * 100) / 100 : value;
}

// In-run comparison against the TSL WebGL fallback in the same manifest.
function computeBudgetChecks(results) {
  const byKey = new Map(results.map((result) => [`${result.scene}::${result.renderer}`, result]));
  const sceneNames = [...new Set(results.map((result) => result.scene))];
  const checks = [];

  for (const scene of sceneNames) {
    const groundTruthRenderer = 'webgl';
    const groundTruth = byKey.get(`${scene}::${groundTruthRenderer}`);
    if (!groundTruth?.stats?.mean) continue;

    for (const renderer of ['webgl', 'webgpu-forced-gl', 'webgpu']) {
      if (renderer === groundTruthRenderer) continue;
      const candidate = byKey.get(`${scene}::${renderer}`);
      if (!candidate?.stats?.mean) continue;
      const ratio = candidate.stats.mean / groundTruth.stats.mean;
      const budgeted = renderer === 'webgl' || renderer === 'webgpu-forced-gl';
      checks.push({
        budgeted,
        budgetLimit: BUDGET_RATIO,
        candidateMeanMs: candidate.stats.mean,
        exceedsBudget: budgeted && ratio > BUDGET_RATIO,
        groundTruthMeanMs: groundTruth.stats.mean,
        groundTruthRenderer,
        ratio,
        regressionPct: (ratio - 1) * 100,
        renderer,
        scene,
      });
    }
  }
  return checks;
}

async function runCaptureMode() {
  const requestedRenderers = (process.env.PERF_RENDERERS || RENDERER_KINDS.join(','))
    .split(',').map((value) => value.trim().toLowerCase()).filter(Boolean);
  for (const renderer of requestedRenderers) {
    if (!RENDERER_KINDS.includes(renderer)) {
      console.error(`Unknown PERF_RENDERERS entry "${renderer}" (expected ${RENDERER_KINDS.join(' | ')})`);
      process.exit(1);
    }
  }

  const requestedSceneNames = (process.env.PERF_SCENES || '')
    .split(',').map((value) => value.trim()).filter(Boolean);
  const scopedScenarios = requestedSceneNames.length > 0
    ? perfScenarios.filter((scenario) => requestedSceneNames.includes(scenario.name))
    : perfScenarios;
  if (requestedSceneNames.length > 0 && scopedScenarios.length === 0) {
    console.error(`PERF_SCENES matched no known scenario (known: ${perfScenarios.map((s) => s.name).join(', ')})`);
    process.exit(1);
  }

  const availableScenarios = scopedScenarios.filter(scenarioIsAvailable);
  const skippedScenarios = scopedScenarios
    .filter((scenario) => !scenarioIsAvailable(scenario))
    .map((scenario) => ({ missingAssets: missingAssetsForScenario(scenario), name: scenario.name }));

  if (availableScenarios.length === 0) {
    console.error('No perf scenarios are available. Check local ignored test assets (assets-local/).');
    process.exit(1);
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = process.env.PERF_OUT_DIR || join(tmpdir(), 'threejs-toon-perf', timestamp);
  await mkdir(outDir, { recursive: true });

  const results = [];
  let failed = false;

  for (const renderer of requestedRenderers) {
    const browser = await chromium.launch(chromiumLaunchOptions(renderer));
    try {
      for (const scenario of availableScenarios) {
        console.error(`[perf-baseline] ${scenario.name} / ${renderer} -- loading...`);
        const messages = [];
        const page = await browser.newPage({ deviceScaleFactor: 1, viewport });
        page.on('console', (message) => messages.push({ text: message.text(), type: message.type() }));
        page.on('pageerror', (error) => messages.push({ text: error.message, type: 'pageerror' }));

        const url = makeUrl(
          renderer === 'webgl' ? scenario.params : { ...scenario.params, renderer },
          scenario.path,
        );

        let stats = null;
        let samples = [];
        let incomplete = false;
        let state = null;
        let errorMessage = null;

        try {
          await page.goto(url, { waitUntil: 'domcontentloaded' });
          await waitForSceneReady(page);
          await page.waitForTimeout(settleMs);

          state = await page.evaluate(() => ({
            modelReady: document.body.dataset.modelReady || null,
            rendererBackend: document.body.dataset.rendererBackend || null,
            rendererKind: document.body.dataset.rendererKind || null,
            scene: document.body.dataset.scene || null,
          }));

          const backendMismatch = state.rendererBackend !== expectedRendererBackend[renderer];
          if (backendMismatch) {
            // A silent fallback must fail the measurement, not masquerade as
            // the backend under test (same rule as baseline-capture.mjs).
            messages.push({
              text: `renderer backend mismatch: requested ${renderer}, page reports ${state.rendererBackend}`,
              type: 'error',
            });
          }

          const readyOk = state.modelReady === 'true' && !backendMismatch &&
            !messages.some((message) => message.type === 'error' || message.type === 'pageerror');

          if (readyOk) {
            const measurement = await page.evaluate(measureFrameTimesInPage, { measureFrames, warmupFrames });
            samples = measurement.samples;
            incomplete = measurement.incomplete;
            stats = computeStats(samples);
          }
        } catch (error) {
          errorMessage = error.message;
        } finally {
          await page.close();
        }

        const severeMessages = messages.filter((message) => message.type === 'error' || message.type === 'pageerror');
        const jobFailed = Boolean(errorMessage) || incomplete || severeMessages.length > 0 ||
          !state || state.modelReady !== 'true' || stats === null;
        if (jobFailed) failed = true;

        results.push({
          errorMessage,
          failed: jobFailed,
          incomplete,
          renderer,
          rendererBackendActual: state?.rendererBackend ?? null,
          rendererBackendExpected: expectedRendererBackend[renderer],
          samples,
          scene: scenario.name,
          severeMessages,
          stats,
          url,
        });

        console.error(stats
          ? `[perf-baseline] ${scenario.name} / ${renderer} -- mean=${round2(stats.mean)}ms median=${round2(stats.median)}ms p95=${round2(stats.p95)}ms p99=${round2(stats.p99)}ms${jobFailed ? ' (FAILED)' : ''}`
          : `[perf-baseline] ${scenario.name} / ${renderer} -- FAILED (${errorMessage || 'see severeMessages'})`);
      }
    } finally {
      await browser.close();
    }
  }

  const budgetChecks = computeBudgetChecks(results);
  const budgetExceedances = budgetChecks.filter((check) => check.exceedsBudget);
  if (budgetExceedances.length > 0) failed = true;

  const manifest = {
    appUrl,
    budgetChecks,
    budgetRatio: BUDGET_RATIO,
    generatedAt: new Date().toISOString(),
    measureFrames,
    outDir,
    renderers: requestedRenderers,
    results,
    scenes: availableScenarios.map((scenario) => scenario.name),
    settleMs,
    skippedScenarios,
    viewport,
    warmupFrames,
  };
  const manifestPath = join(outDir, 'manifest.json');
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  // Exceedances are Run log findings -- reported here (manifest + this
  // final line + non-zero exit), never hidden and never auto-chased.
  console.log(JSON.stringify({
    budgetExceedanceCount: budgetExceedances.length,
    budgetExceedances,
    failed,
    manifestPath,
    outDir,
    renderers: requestedRenderers,
    resultCount: results.length,
    skippedScenarios: skippedScenarios.map((scenario) => scenario.name),
    summary: results.map((result) => ({
      backend: result.rendererBackendActual,
      failed: result.failed,
      meanMs: round2(result.stats?.mean ?? null),
      p95Ms: round2(result.stats?.p95 ?? null),
      renderer: result.renderer,
      scene: result.scene,
    })),
  }));

  if (failed) process.exitCode = 1;
}

async function runCompareMode() {
  const beforeDir = process.argv[3] || process.env.PERF_BEFORE_DIR;
  const afterDir = process.argv[4] || process.env.PERF_AFTER_DIR;

  if (!beforeDir || !afterDir) {
    console.error('Usage: node scripts/perf-baseline.mjs --compare <beforeDir> <afterDir>');
    process.exit(1);
  }
  if (!existsSync(beforeDir) || !existsSync(afterDir)) {
    console.error(`Both perf directories must exist: ${beforeDir} ${afterDir}`);
    process.exit(1);
  }

  const beforeManifestPath = join(beforeDir, 'manifest.json');
  const afterManifestPath = join(afterDir, 'manifest.json');
  if (!existsSync(beforeManifestPath) || !existsSync(afterManifestPath)) {
    console.error(`Both directories must contain manifest.json: ${beforeManifestPath} ${afterManifestPath}`);
    process.exit(1);
  }

  const beforeManifest = JSON.parse(readFileSync(beforeManifestPath, 'utf8'));
  const afterManifest = JSON.parse(readFileSync(afterManifestPath, 'utf8'));

  const keyOf = (result) => `${result.scene}::${result.renderer}`;
  const beforeByKey = new Map((beforeManifest.results || []).map((result) => [keyOf(result), result]));
  const afterByKey = new Map((afterManifest.results || []).map((result) => [keyOf(result), result]));

  const sharedKeys = [...beforeByKey.keys()].filter((key) => afterByKey.has(key));
  const missingInAfter = [...beforeByKey.keys()].filter((key) => !afterByKey.has(key));
  const missingInBefore = [...afterByKey.keys()].filter((key) => !beforeByKey.has(key));

  if (sharedKeys.length === 0) {
    console.error('No matching (scene, renderer) pairs were found between before/after manifests.');
    process.exit(1);
  }

  const comparisons = sharedKeys.map((key) => {
    const beforeResult = beforeByKey.get(key);
    const afterResult = afterByKey.get(key);
    const beforeMean = beforeResult.stats?.mean ?? null;
    const afterMean = afterResult.stats?.mean ?? null;
    const ratio = beforeMean && afterMean ? afterMean / beforeMean : null;
    return {
      afterMeanMs: afterMean,
      beforeMeanMs: beforeMean,
      budgetLimit: BUDGET_RATIO,
      exceedsBudget: ratio !== null && ratio > BUDGET_RATIO,
      ratio,
      regressionPct: ratio !== null ? (ratio - 1) * 100 : null,
      renderer: beforeResult.renderer,
      scene: beforeResult.scene,
    };
  });

  // Every backend is regression-gated here (unlike the in-run ground-truth
  // check, which only budgets the fallback backend): this mode answers "did
  // a code change slow anything down", and the checklist's "do not hide
  // them" rule applies equally to a regressed webgpu native backend.
  const exceedances = comparisons.filter((comparison) => comparison.exceedsBudget);

  const summary = {
    after: afterDir,
    before: beforeDir,
    budgetLimit: BUDGET_RATIO,
    comparedCount: comparisons.length,
    comparisons,
    exceedanceCount: exceedances.length,
    exceedances,
    missingInAfter,
    missingInBefore,
  };

  console.log(JSON.stringify(summary, null, 2));

  if (exceedances.length > 0) process.exitCode = 1;
}

if (process.argv[2] === '--compare') {
  await runCompareMode();
} else {
  await runCaptureMode();
}
