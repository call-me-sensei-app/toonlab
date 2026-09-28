// Captures every rockgen preset (or a comma list) from the running dev
// server for visual tuning passes.
//
//   node scripts/capture-rock-presets.mjs
//   ROCK_CAPTURE_PRESETS=boulder,cliff-wall ROCK_CAPTURE_SEED=7 \
//   ROCK_CAPTURE_OUT=/tmp/rocks node scripts/capture-rock-presets.mjs
//
// Requires the Vite dev server (see toon-shader-verification-workflow:
// http://localhost:5175, IPv6). Waits for modelReady + the scene-aware AO
// bake so captures match what the user sees.

import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { getRockgenPresetOptions } from '../src/rockgen/rockgenPresets.js';

const outDir = process.env.ROCK_CAPTURE_OUT || '/private/tmp/rock-presets';
const seed = process.env.ROCK_CAPTURE_SEED || '2';
const baseUrl = process.env.ROCK_CAPTURE_URL || 'http://localhost:5175';
const presets = process.env.ROCK_CAPTURE_PRESETS
  ? process.env.ROCK_CAPTURE_PRESETS.split(',')
  : getRockgenPresetOptions().map((option) => option.value);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1200, height: 800 }, deviceScaleFactor: 1 });

for (const preset of presets) {
  const params = new URLSearchParams({
    captureView: 'hero',
    hud: '0',
    rockPreset: preset,
    rockSeed: seed,
    scene: 'rock',
  });
  const url = `${baseUrl}/rock-lab/?${params.toString()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.body.dataset.modelReady === 'true', { timeout: 30000 });
  await page.waitForFunction(() => document.body.dataset.rockAoState === 'baked', { timeout: 30000 })
    .catch(() => console.warn(`${preset}: AO never reached baked; capturing anyway`));
  await page.waitForTimeout(300);
  const path = `${outDir}/${preset}-seed${seed}.png`;
  await page.screenshot({ path });
  console.log(`captured ${path}`);
}

await browser.close();
