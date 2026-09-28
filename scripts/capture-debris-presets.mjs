// Captures every built-in debris preset through the REAL debris lab
// (environment toon shader, WebGPU/WebGL renderer) via the lab's
// ?debrisRecipe= boot param. Requires a dev server (default
// http://127.0.0.1:5175) — start one with `npx vite`.
// Usage: node scripts/capture-debris-presets.mjs [outDir] [presetIdFilter,...]

import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

import { BUILT_IN_DEBRIS_PRESETS } from '../src/debrisgen/debrisPresets.js';
import { createDebrisRecipeDocument } from '../src/debrisgen/debrisSettings.js';

const base = process.env.DEBRIS_LAB_URL || 'http://127.0.0.1:5175/debris-lab/';
const outDir = process.argv[2] || '/tmp/debris-lab-shots';
const only = process.argv[3] ? process.argv[3].split(',') : null;

mkdirSync(outDir, { recursive: true });

const launchOptions = { args: ['--enable-unsafe-webgpu', '--enable-gpu'], headless: true };
if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) launchOptions.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { height: 760, width: 1080 } });

for (const preset of BUILT_IN_DEBRIS_PRESETS) {
  if (only && !only.some((token) => preset.id.includes(token))) continue;
  const recipe = createDebrisRecipeDocument(preset.settings, { name: preset.label });
  const url = `${base}?debrisRecipe=${encodeURIComponent(JSON.stringify(recipe))}`;
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector('canvas', { timeout: 20000 });
  // Let the renderer settle (async pipeline compile + first frames).
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${outDir}/${preset.id}.png` });
  console.log(preset.id);
}

await browser.close();
console.log('done ->', outDir);
