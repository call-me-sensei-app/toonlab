import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';

import {
  analyzePngContent,
  comparePngBuffers,
  contentPass,
  metricsPass,
} from './golden-image-metrics.mjs';

const matrix = JSON.parse(await readFile(
  new URL('../quality/call-me-sensei-golden-matrix.json', import.meta.url),
  'utf8',
));
const baseUrl = process.env.GOLDEN_BASE_URL || 'http://127.0.0.1:5177';
const outputDir = resolve(process.env.GOLDEN_OUT_DIR || '/private/tmp/toonlab-goldens');
const filter = new Set((process.env.GOLDEN_FIXTURES || '')
  .split(',').map((value) => value.trim()).filter(Boolean));
const smoke = process.env.GOLDEN_SMOKE === '1';
const thresholds = matrix.capture.thresholds;
const contentThresholds = matrix.capture.contentThresholds;
const capturePrimeCount = matrix.capture.capturePrimeCount;
const fixedFrameCount = matrix.capture.fixedFrameCount;
const repeatCount = matrix.capture.repeatCount;
const readyTimeoutMs = Number(process.env.GOLDEN_READY_TIMEOUT_MS) || 60000;
const FRAME_DEPENDENT_DATASETS = new Set(['groundFieldReady', 'walkablePhysicsReady']);

function axisFilter(name, values) {
  const requested = new Set((process.env[name] || '')
    .split(',').map((value) => value.trim()).filter(Boolean));
  if (requested.size === 0) return values;
  const unknown = [...requested].filter((value) => !values.includes(value));
  if (unknown.length > 0) {
    throw new Error(`${name} contains unknown values: ${unknown.join(', ')}`);
  }
  return values.filter((value) => requested.has(value));
}

const axes = {
  cameras: axisFilter('GOLDEN_CAMERAS', matrix.axes.cameras),
  qualities: axisFilter('GOLDEN_QUALITIES', matrix.axes.qualities),
  renderers: axisFilter('GOLDEN_RENDERERS', matrix.axes.renderers),
  timesOfDay: axisFilter('GOLDEN_TIMES_OF_DAY', matrix.axes.timesOfDay),
};

function fixtureAxis(fixture, axis) {
  const requested = fixture.axes?.[axis] ?? matrix.axes[axis];
  const unknown = requested.filter((value) => !matrix.axes[axis].includes(value));
  if (unknown.length > 0) {
    throw new Error(`${fixture.id}.axes.${axis} contains unavailable values: ${unknown.join(', ')}`);
  }
  return axes[axis].filter((value) => requested.includes(value));
}

function resolveCaptureFixture(fixture) {
  if (!fixture.captureFrom) return fixture;
  const base = matrix.fixtures.find(({ id }) => id === fixture.captureFrom);
  if (!base) throw new Error(`${fixture.id} references unknown captureFrom fixture ${fixture.captureFrom}.`);
  return {
    ...base,
    ...fixture,
    captureFrom: fixture.captureFrom,
    datasets: { ...(base.datasets ?? {}), ...(fixture.datasets ?? {}) },
  };
}

function selected(values) {
  return smoke ? values.slice(0, 1) : values;
}

function safeName(value) {
  return value.replace(/[^a-z0-9._-]+/gi, '-').replace(/^-+|-+$/g, '');
}

function seededRandomScript(seed) {
  return ({ initialSeed }) => {
    let state = initialSeed >>> 0;
    Math.random = () => {
      state += 0x6D2B79F5;
      let value = state;
      value = Math.imul(value ^ value >>> 15, value | 1);
      value ^= value + Math.imul(value ^ value >>> 7, value | 61);
      return ((value ^ value >>> 14) >>> 0) / 4294967296;
    };
  };
}

async function selectFixtureControl(page, control, value, label) {
  if (!control?.selector) return;
  const locator = page.locator(control.selector);
  const count = await locator.count();
  if (count !== 1) {
    throw new Error(`${label} selector "${control.selector}" matched ${count} elements.`);
  }
  const supportedValues = await locator.locator('option').evaluateAll((options) =>
    options.map((option) => option.value));
  if (!supportedValues.includes(value)) {
    throw new Error(`${label} value "${value}" is not available in ${control.selector}.`);
  }
  await locator.selectOption(value);
}

async function readCanvasPng(page) {
  const dataUrl = await page.evaluate(() => window.__toonlabGoldenCapture.readPng());
  const marker = 'data:image/png;base64,';
  if (!dataUrl.startsWith(marker)) throw new Error('Canvas did not return a PNG data URL.');
  return Buffer.from(dataUrl.slice(marker.length), 'base64');
}

const jobs = [];
for (const fixture of matrix.fixtures) {
  if (!fixture.captureEnabled || filter.size > 0 && !filter.has(fixture.id)) continue;
  const captureFixture = resolveCaptureFixture(fixture);
  for (const renderer of selected(fixtureAxis(captureFixture, 'renderers'))) {
    for (const quality of selected(fixtureAxis(captureFixture, 'qualities'))) {
      for (const timeOfDay of selected(fixtureAxis(captureFixture, 'timesOfDay'))) {
        for (const camera of selected(fixtureAxis(captureFixture, 'cameras'))) {
          jobs.push({ camera, fixture: captureFixture, quality, renderer, timeOfDay });
        }
      }
    }
  }
}
if (jobs.length === 0) throw new Error('No capture-enabled golden jobs matched the filter.');

await mkdir(outputDir, { recursive: true });
const launchOptions = {
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: process.env.GOLDEN_HEADED !== '1',
};
if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) launchOptions.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
const browser = await chromium.launch(launchOptions);
const results = [];

for (const job of jobs) {
  const messages = [];
  const page = await browser.newPage({ viewport: matrix.capture.viewport });
  await page.addInitScript(seededRandomScript(matrix.capture.seed), {
    initialSeed: matrix.capture.seed,
  });
  page.on('console', (message) => messages.push({ type: message.type(), text: message.text() }));
  page.on('pageerror', (error) => messages.push({ type: 'pageerror', text: error.message }));

  const url = new URL(job.fixture.route, baseUrl);
  const cameraValue = job.fixture.cameraControl?.values?.[job.camera];
  const cameraPose = job.fixture.cameraPoses?.[job.camera] ?? null;
  if (job.renderer !== 'webgpu') url.searchParams.set('renderer', job.renderer);
  url.searchParams.set('quality', job.quality);
  url.searchParams.set('waterEnv', job.timeOfDay);
  url.searchParams.set('goldenSeed', String(matrix.capture.seed));
  url.searchParams.set('goldenCapture', '1');
  // Multipass systems must render from the same camera as the evidence frame.
  // The Playground's free-camera query is consumed when MapControls mounts,
  // before Water generates its grab/depth/reflection passes. Rendering later
  // through a detached clone makes those screen-space textures disagree with
  // the final projection and creates false white/clipped surfaces.
  if (cameraValue === 'free' && cameraPose?.position && cameraPose?.target) {
    url.searchParams.set('freecam', [
      ...cameraPose.position,
      ...cameraPose.target,
    ].join(','));
  }
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });

  try {
    await page.waitForFunction(({ datasets, quality, renderer }) => {
      const expectedBackend = renderer === 'webgpu' ? 'webgpu' : 'webgl2-fallback';
      return document.body.dataset.rendererBackend === expectedBackend &&
        window.__toonlabGoldenCapture?.advanceFrames &&
        Object.entries(datasets).every(([key, value]) => document.body.dataset[key] === value);
    }, {
      datasets: Object.fromEntries(Object.entries(job.fixture.datasets ?? {})
        .filter(([key]) => !FRAME_DEPENDENT_DATASETS.has(key))),
      quality: job.quality,
      renderer: job.renderer,
    }, { timeout: readyTimeoutMs });
  } catch (error) {
    const diagnostics = await page.evaluate(() => ({
      datasets: { ...document.body.dataset },
      goldenCapture: Boolean(window.__toonlabGoldenCapture?.advanceFrames),
    })).catch(() => null);
    const failure = { diagnostics, messages, url: url.href };
    await writeFile(join(outputDir, `${safeName(job.fixture.id)}-failed-diagnostics.json`),
      `${JSON.stringify(failure, null, 2)}\n`);
    throw new Error(`${error.message}\nFixture diagnostics: ${JSON.stringify(diagnostics)}\nMessages: ${JSON.stringify(messages)}`);
  }

  await selectFixtureControl(
    page,
    job.fixture.scenarioControl,
    job.timeOfDay,
    'Scenario control',
  );
  if (cameraValue) {
    await selectFixtureControl(page, job.fixture.cameraControl, cameraValue, 'Camera control');
  }
  const wheel = job.fixture.cameraControl?.wheel?.[job.camera] ?? 0;
  if (wheel !== 0 && !(cameraValue === 'free' && cameraPose)) {
    const canvasBox = await page.locator('canvas').boundingBox();
    if (canvasBox) {
      await page.mouse.move(canvasBox.x + canvasBox.width / 2, canvasBox.y + canvasBox.height / 2);
      await page.mouse.wheel(0, wheel);
    }
  }
  for (const selector of job.fixture.selectorsToHide ?? []) {
    await page.locator(selector).evaluateAll((nodes) => {
      for (const node of nodes) node.style.visibility = 'hidden';
    });
  }
  await page.waitForTimeout(matrix.capture.warmupMs);
  await page.evaluate(async (count) => {
    await window.__toonlabGoldenCapture.advanceFrames(count);
  }, fixedFrameCount);
  await page.waitForFunction(({ datasets, quality }) =>
    document.body.dataset.sceneQuality === quality &&
    Object.entries(datasets).every(([key, value]) => document.body.dataset[key] === value), {
    datasets: job.fixture.datasets ?? {},
    quality: job.quality,
  }, { timeout: 30000 });

  // Stop the host's R3F loop through its explicit capture protocol, then
  // present one deterministic frame. Replacing browser clocks here clears
  // GPU swap-chain content on some backends and produces false black frames.
  await page.evaluate(async (pose) => {
    if (!window.__toonlabGoldenCapture?.freeze) {
      throw new Error('Fixture does not expose the ToonLab golden capture protocol.');
    }
    await window.__toonlabGoldenCapture.freeze(pose);
  }, job.fixture.cameraControl ? null : cameraPose);
  await page.waitForFunction(() =>
    document.body.dataset.goldenCaptureFrozen === 'true');
  await page.waitForTimeout(100);
  const canvas = page.locator('canvas');
  const canvasBox = await canvas.boundingBox();
  if (!canvasBox) throw new Error('Golden fixture canvas has no visible bounding box.');
  // GPU-backed canvases can expose an older swap-chain image to the first
  // read even after the deterministic frame has presented. Prime those direct
  // canvas reads; only the following captures are evidence.
  for (let primeIndex = 0; primeIndex < capturePrimeCount; primeIndex += 1) {
    await readCanvasPng(page);
  }
  const captures = [];
  for (let repeatIndex = 0; repeatIndex < repeatCount; repeatIndex += 1) {
    captures.push(await readCanvasPng(page));
  }
  const primary = captures[0];
  const content = analyzePngContent(primary);
  const contentValid = contentPass(content, contentThresholds);
  const determinismThresholds = {
    ...thresholds,
    meanDeltaE: 0,
    p95DeltaE: 0,
    pixelRatioAboveDeltaE: 0,
    ssim: 1,
  };
  const repeatComparisons = captures.slice(1).map((capture, index) => ({
    metrics: comparePngBuffers(primary, capture, thresholds),
    repeat: index + 2,
  }));
  const deterministic = repeatComparisons.every(({ metrics }) =>
    metricsPass(metrics, determinismThresholds));
  const telemetry = await page.evaluate(() => ({
    goldenCapture: window.__toonlabGoldenCapture?.getState?.() ?? null,
    datasets: { ...document.body.dataset },
    devicePixelRatio: window.devicePixelRatio,
    viewport: { height: window.innerHeight, width: window.innerWidth },
  }));

  const name = safeName([
    job.fixture.id,
    job.renderer,
    job.quality,
    job.timeOfDay,
    job.camera,
  ].join('--'));
  const screenshotPath = join(outputDir, `${name}.png`);
  await writeFile(screenshotPath, primary);
  const severeMessages = messages.filter((message) =>
    message.type === 'error' || message.type === 'pageerror');
  results.push({
    ...job,
    content,
    contentValid,
    deterministic,
    repeatComparisons,
    repeatCount,
    evidenceLimit: job.fixture.evidenceLimit ?? null,
    fixture: job.fixture.id,
    releaseEvidence: job.fixture.releaseEvidence,
    screenshotPath,
    severeMessages,
    telemetry,
    url: url.href,
  });
  await page.close();
}
await browser.close();

const failed = results.filter((result) =>
  !result.contentValid || !result.deterministic || result.severeMessages.length > 0);
const report = {
  baseUrl,
  failed: failed.map((result) => result.fixture),
  generatedAt: new Date().toISOString(),
  jobs: results,
  matrixSchema: matrix.schema,
  outputDir,
  packageVersion: matrix.packageVersion,
  repeatCount,
  schema: 'toonlab/golden-capture-report@1',
  smoke,
};
const reportPath = join(outputDir, 'capture-report.json');
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({
  captured: results.length,
  failed: report.failed,
  outputDir,
  reportPath,
  smoke,
}, null, 2));
if (failed.length > 0) process.exitCode = 1;
