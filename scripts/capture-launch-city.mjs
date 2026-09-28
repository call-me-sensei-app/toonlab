// Review capture for the Nova Promenade massing pass.
//
//   node scripts/capture-launch-city.mjs [shot] [outPath] [width] [height]
//
// Loads /labs/launch-world/city/ from the running dev server at the §11 master
// resolution, waits for the massing audit to publish and the render loop to
// settle, then writes a PNG. The audit numbers are echoed so a capture is never
// separated from the build that produced it.

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const [, , shot = 's01', outArg, widthArg, heightArg] = process.argv;
const width = Number(widthArg) || 3840;
const height = Number(heightArg) || 2160;
const out = resolve(
  outArg ?? `../launch-plan/review/captures/city-massing-pass1.png`,
);
const origin = process.env.TOONLAB_DEV_ORIGIN ?? 'http://localhost:5199';
const url = `${origin}/labs/launch-world/city/?shot=${shot}&ui=0${process.env.CITY_SHADOWS === '1' ? '&shadows=1' : ''}`;

await mkdir(dirname(out), { recursive: true });

const browser = await chromium.launch({
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ],
  headless: true,
});
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height, width } });

const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error' || message.type() === 'warning') {
    consoleErrors.push(`${message.type()}: ${message.text()}`);
  }
});
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));

console.log(`→ ${url}  @ ${width}x${height}`);
await page.goto(url, { timeout: 120_000, waitUntil: 'load' });

await page.waitForFunction(
  () => document.body.dataset.cityMasses || document.body.dataset.cityError,
  { timeout: 180_000 },
);
const failure = await page.evaluate(() => document.body.dataset.cityError ?? null);
if (failure) {
  console.error('scene failed to build:', failure);
  await browser.close();
  process.exit(1);
}

// Let the sky, the sun-shadow pass and the post pipeline settle before the grab.
await page.waitForFunction(
  () => Number(document.body.dataset.cityFrames ?? 0) > 150,
  { polling: 250, timeout: 180_000 },
);

const audit = await page.evaluate(() => ({ ...document.body.dataset }));
await page.screenshot({ path: out, type: 'png' });
await browser.close();

console.log(`✓ ${out}`);
console.log(JSON.stringify({
  bands: audit.cityBands,
  colourStructure: audit.cityColourStructure,
  drawCalls: audit.cityDrawCalls,
  fps: audit.cityFps,
  grammarViolations: audit.cityGrammarViolations,
  layoutIssues: audit.cityLayoutIssues,
  masses: audit.cityMasses,
  peakHeight: audit.cityPeakHeight,
  shot,
  triangles: audit.cityTriangles,
  variationIssues: audit.cityVariationIssues,
  volumes: audit.cityVolumes,
  warmupError: audit.cityWarmupError ?? null,
}, null, 2));
if (consoleErrors.length > 0) {
  console.log(`console (${consoleErrors.length}):`);
  for (const line of consoleErrors.slice(0, 12)) console.log('  ', line);
}
