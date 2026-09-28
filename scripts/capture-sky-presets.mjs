// Captures every shipped sky preset at a stable 1280x720 comparison framing.
//
//   npm run dev                                    # dev server on 5175
//   node scripts/capture-sky-presets.mjs           # all presets, cloud-shader-lab, webgpu
//   SKY_CAPTURE_LAB=sky-cloud-lab node scripts/capture-sky-presets.mjs
//   SKY_CAPTURE_PRESETS=partlyCloudy,pixar node scripts/capture-sky-presets.mjs
//   SKY_CAPTURE_SNAPSHOT=2.0 node scripts/capture-sky-presets.mjs
//   SKY_CAPTURE_COVERAGE=0.8 node scripts/capture-sky-presets.mjs # calibration override
//   SKY_CAPTURE_WEATHER_SCALE=40000 SKY_CAPTURE_WEATHER_PERIOD=4 node scripts/capture-sky-presets.mjs
//   SKY_CAPTURE_TYPE_BIAS=0.35 node scripts/capture-sky-presets.mjs
//   SKY_CAPTURE_SKY_MS=0.5 SKY_CAPTURE_AMBIENT=0.9 node scripts/capture-sky-presets.mjs

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PRESETS = [
  'fluffy', 'hazy', 'moonlitNight', 'partlyCloudy',
  'pixar', 'stormyEvening', 'stunningSunset', 'thunderstorm',
];

// Reference frames were captured at Ultra, 1x render scale, 1280x720. Matching all three is what
// makes a like-for-like comparison possible.
const VIEWPORT = { height: 720, width: 1280 };
const QUALITY = process.env.SKY_CAPTURE_QUALITY || 'ultra';
const snapshot = process.env.SKY_CAPTURE_SNAPSHOT || null;

const RENDERER_KINDS = ['webgpu', 'webgl', 'webgpu-forced-gl'];
const renderer = (process.env.SKY_CAPTURE_RENDERER || 'webgpu').toLowerCase();
if (!RENDERER_KINDS.includes(renderer)) {
  console.error(`Unknown SKY_CAPTURE_RENDERER "${renderer}" (expected ${RENDERER_KINDS.join(' | ')})`);
  process.exit(1);
}
const expectedBackend = { webgl: 'webgl2-fallback', webgpu: 'webgpu', 'webgpu-forced-gl': 'webgl2-fallback' }[renderer];

const lab = process.env.SKY_CAPTURE_LAB || 'cloud-shader-lab';
const baseUrl = process.env.SKY_CAPTURE_URL || `http://127.0.0.1:5175/${lab}/`;
const outDir = process.env.SKY_CAPTURE_OUT_DIR
  || join(process.cwd(), '.local-reference', 'toonlab-sky-captures');
const presets = (process.env.SKY_CAPTURE_PRESETS || PRESETS.join(',')).split(',').map((p) => p.trim()).filter(Boolean);

// Temporal reconstruction needs to settle before the frame is representative — the reference
// documents ~16 frames to warm up, so we give it a wide margin rather than racing it.
const CONVERGE_FRAMES = Number(process.env.SKY_CAPTURE_FRAMES || 90);

function numericOverride(name, { integer = false, max = Infinity, min = -Infinity } = {}) {
  if (process.env[name] === undefined) return null;
  const value = Number(process.env[name]);
  if (!Number.isFinite(value) || value < min || value > max || (integer && !Number.isInteger(value))) {
    console.error(`${name} must be a finite ${integer ? 'integer ' : ''}number in [${min}, ${max}].`);
    process.exit(1);
  }
  return value;
}

const calibrationOverrides = Object.freeze([
  {
    env: 'SKY_CAPTURE_COVERAGE',
    path: ['cloud', 'shape', 'coverage'],
    value: numericOverride('SKY_CAPTURE_COVERAGE', { min: 0, max: 1 }),
  },
  {
    env: 'SKY_CAPTURE_BASE_SCALE',
    path: ['cloud', 'shape', 'baseScale'],
    value: numericOverride('SKY_CAPTURE_BASE_SCALE', { min: 1, max: 200000 }),
  },
  {
    env: 'SKY_CAPTURE_WEATHER_SCALE',
    path: ['cloud', 'shape', 'weatherScale'],
    value: numericOverride('SKY_CAPTURE_WEATHER_SCALE', { min: 1, max: 200000 }),
  },
  {
    env: 'SKY_CAPTURE_EROSION_SCALE',
    path: ['cloud', 'shape', 'erosionScaleBaseMultiplier'],
    value: numericOverride('SKY_CAPTURE_EROSION_SCALE', { min: 0, max: 1 }),
  },
  {
    env: 'SKY_CAPTURE_WEATHER_PERIOD',
    path: ['noise', 'weather', 'profile', 'period'],
    value: numericOverride('SKY_CAPTURE_WEATHER_PERIOD', { integer: true, min: 1, max: 32 }),
  },
  {
    env: 'SKY_CAPTURE_TYPE_BIAS',
    path: ['noise', 'weather', 'profile', 'typeBias'],
    value: numericOverride('SKY_CAPTURE_TYPE_BIAS', { min: -1, max: 1 }),
  },
  {
    env: 'SKY_CAPTURE_SKY_MS',
    path: ['atmosphere', 'skyMultipleScattering'],
    value: numericOverride('SKY_CAPTURE_SKY_MS', { min: 0, max: 2 }),
  },
  {
    env: 'SKY_CAPTURE_AMBIENT',
    path: ['cloud', 'lighting', 'ambientIntensity'],
    value: numericOverride('SKY_CAPTURE_AMBIENT', { min: 0, max: 4 }),
  },
  {
    env: 'SKY_CAPTURE_BASE_SHADOW',
    path: ['cloud', 'lighting', 'baseShadowStrength'],
    value: numericOverride('SKY_CAPTURE_BASE_SHADOW', { min: 0, max: 1 }),
  },
].filter((override) => override.value !== null));

function chromiumLaunchOptions() {
  const options = { args: ['--enable-unsafe-webgpu', '--enable-gpu'], headless: true };
  if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) options.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
  if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) options.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;
  return options;
}

function makeUrl(preset) {
  const url = new URL(baseUrl);
  url.searchParams.set('preset', preset);
  url.searchParams.set('quality', QUALITY);
  if (snapshot) url.searchParams.set('snapshot', snapshot);
  // Hide the authoring UI so the capture is canvas-only, matching the reference frames.
  url.searchParams.set('hud', '0');
  url.searchParams.set('capture', '1');
  if (renderer !== 'webgpu') url.searchParams.set('renderer', renderer);
  return url.toString();
}

async function waitForSkyReady(page) {
  await page.waitForFunction((expectedSnapshot) => {
    const d = document.body.dataset;
    const ready = d.skyReady === 'true' || d.cloudShaderLabReady === 'true' || d.skyCloudLabReady === 'true';
    const snapshotReady = !expectedSnapshot || d.skyStyleSnapshot === expectedSnapshot;
    return ready && d.skyPresetApplied === 'true' && snapshotReady;
  }, snapshot, { timeout: 60_000 });
}

// Wait a fixed number of real animation frames rather than a wall-clock guess, so a slow machine
// still converges instead of capturing a half-accumulated frame.
async function settleFrames(page, frames) {
  await page.evaluate(async (count) => {
    for (let i = 0; i < count; i += 1) {
      await new Promise((resolve) => requestAnimationFrame(() => resolve()));
    }
  }, frames);
}

await mkdir(outDir, { recursive: true });

const browser = await chromium.launch(chromiumLaunchOptions());
const results = [];
let failed = false;

for (const preset of presets) {
  const messages = [];
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: VIEWPORT });
  page.on('console', (m) => { if (m.type() === 'error') messages.push(m.text()); });
  page.on('pageerror', (e) => messages.push(`pageerror: ${e.message}`));

  const url = makeUrl(preset);
  const record = { messages, preset, snapshot, url };
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await waitForSkyReady(page);

    // Calibration-only overrides: keep the full preset fixed and move explicit
    // documented controls. The report records every moved value, so a sweep is
    // reproducible and cannot be mistaken for the shipped preset.
    if (calibrationOverrides.length > 0) {
      await page.evaluate((overrides) => {
        for (const override of overrides) {
          window.__skyCloudLab.store.actions.setParam(override.path, override.value);
        }
      }, calibrationOverrides);
    }

    const backend = await page.evaluate(() => document.body.dataset.rendererBackend || null);
    if (backend !== expectedBackend) {
      // A silent fallback must fail the capture rather than masquerade as the backend under test.
      throw new Error(`expected renderer backend "${expectedBackend}" but the page booted "${backend}"`);
    }

    await settleFrames(page, CONVERGE_FRAMES);

    // A TSL build failure can leave a perfectly screenshot-able atmosphere with
    // the cloud pass missing. Treating that as a successful visual capture hid
    // exactly the kind of backend regression this gate exists to catch.
    if (messages.length > 0) {
      throw new Error(`renderer reported ${messages.length} error(s): ${messages.join(' | ')}`);
    }

    const canvas = await page.$('canvas');
    if (!canvas) throw new Error('no canvas on the page');
    const snapshotSuffix = snapshot ? `-v${snapshot.replace(/[^a-z0-9.-]/gi, '-')}` : '';
    const file = join(outDir, `ours-${preset}${snapshotSuffix}.png`);
    await canvas.screenshot({ path: file });

    record.backend = backend;
    record.file = file;
    record.appliedPreset = await page.evaluate(() => document.body.dataset.skyPreset || null);
    record.appliedSnapshot = await page.evaluate(() => document.body.dataset.skyStyleSnapshot || null);
    if (record.appliedPreset && record.appliedPreset !== preset) {
      throw new Error(`asked for preset "${preset}" but the lab reports "${record.appliedPreset}"`);
    }
    record.ok = true;
    console.log(`captured ${preset} -> ${file}`);
  } catch (error) {
    failed = true;
    record.ok = false;
    record.error = error.message;
    console.error(`FAILED ${preset}: ${error.message}`);
  } finally {
    results.push(record);
    await page.close();
  }
}

await browser.close();
await writeFile(join(outDir, 'capture-report.json'),
  `${JSON.stringify({ calibrationOverrides, lab, presets, quality: QUALITY, renderer, results, snapshot, viewport: VIEWPORT }, null, 2)}\n`);

const okCount = results.filter((r) => r.ok).length;
console.log(`\n${okCount}/${results.length} presets captured into ${outDir}`);
if (failed) process.exit(1);
