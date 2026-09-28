import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import {
  readDatasetJson,
  screenshotWithFloor,
  waitForPaintedFrame,
} from './captureGuards.mjs';

const outputDirectory = process.env.TOONLAB_BOULDER_OUT
  || new URL('../artifacts/research/toonlab-realistic-boulder/captures/', import.meta.url).pathname;
const baseUrl = process.env.TOONLAB_BOULDER_URL || 'http://127.0.0.1:5181';
const width = Number(process.env.TOONLAB_BOULDER_WIDTH || 1440);
const height = Number(process.env.TOONLAB_BOULDER_HEIGHT || 960);

const shots = [
  ...[11, 29, 53].flatMap((seed) => [
    { name: `seed-${seed}-realistic-hero`, query: { look: 'realistic', seed, view: 'hero' } },
    { name: `seed-${seed}-stylized-hero`, query: { look: 'stylized', seed, view: 'hero' } },
  ]),
  { name: 'seed-11-realistic-close', query: { look: 'realistic', seed: 11, view: 'close' } },
  { name: 'seed-11-realistic-ortho', query: { look: 'realistic', seed: 11, view: 'ortho' } },
  { name: 'seed-11-realistic-top', query: { look: 'realistic', seed: 11, view: 'top' } },
  { name: 'seed-11-wire-hero', query: { look: 'wire', seed: 11, view: 'hero' } },
  { name: 'seed-11-channels-close', query: { look: 'channels', seed: 11, view: 'close' } },
];

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height, width } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => consoleErrors.push(`page: ${error.stack ?? error.message}`));

const captures = [];
const failures = [];
for (const shot of shots) {
  consoleErrors.length = 0;
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(shot.query).map(([key, value]) => [key, String(value)])),
    hud: '0',
  });
  const url = `${baseUrl}/labs/toonlab-realistic-boulder/?${query}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const ready = await waitForPaintedFrame(page, {
    error: () => Boolean(document.body.dataset.rockError),
    ready: () => document.body.dataset.rockReady === 'true',
  });
  const report = await readDatasetJson(page, 'rockReport');
  if (!ready.ok || ready.dataset.rockError || !report || report.error || consoleErrors.length > 0) {
    failures.push({
      errors: consoleErrors.slice(),
      name: shot.name,
      ready,
      report,
      url,
    });
    continue;
  }
  const file = `${shot.name}.png`;
  const screenshot = await screenshotWithFloor(page, `${outputDirectory}/${file}`, {
    height,
    label: shot.name,
    width,
  });
  if (!screenshot.ok) failures.push({ name: shot.name, screenshot, url });
  else captures.push({ file, report, screenshot, url });
  console.log(`captured ${shot.name}`);
}

const manifest = {
  capturedAt: new Date().toISOString(),
  captures,
  failures,
  ok: failures.length === 0,
};
await writeFile(`${outputDirectory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
if (failures.length > 0) {
  throw new Error(`${failures.length} boulder capture(s) failed; see ${outputDirectory}/manifest.json`);
}
console.log(`${captures.length} captures written to ${outputDirectory}`);
