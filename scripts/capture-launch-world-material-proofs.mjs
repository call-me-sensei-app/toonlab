// Captures the applied-surface proof for every §9 launch-world material.
//
//   node scripts/capture-launch-world-material-proofs.mjs [ID,...]
//
// Requires an ALREADY-RUNNING dev server (env BASE_URL, default
// http://127.0.0.1:5175) — this script never starts its own, matching
// scripts/generate-prop-thumbs.mjs.
//
// Output: ../launch-plan/review/captures/materials/<ID>-applied.png

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, '..');
const outDir = resolve(repo, '../launch-plan/review/captures/materials');
const setPath = resolve(repo, 'assets-local/launch-world/materials/material-set.json');

const base = `${process.env.BASE_URL || 'http://127.0.0.1:5175'}/quality/launch-world-materials/proof.html`;
const WIDTH = 1920;
const HEIGHT = 1080;

const set = JSON.parse(readFileSync(setPath, 'utf8'));
const only = process.argv.slice(2).filter((token) => !token.startsWith('--'));
const ids = only.length > 0
  ? only.flatMap((token) => token.split(','))
  : set.materials.map((row) => row.id);

mkdirSync(outDir, { recursive: true });

const launchOptions = { args: ['--enable-unsafe-webgpu', '--enable-gpu'], headless: true };
if (process.env.PLAYWRIGHT_BROWSER_CHANNEL) launchOptions.channel = process.env.PLAYWRIGHT_BROWSER_CHANNEL;
if (process.env.PLAYWRIGHT_EXECUTABLE_PATH) launchOptions.executablePath = process.env.PLAYWRIGHT_EXECUTABLE_PATH;

const browser = await chromium.launch(launchOptions);
const page = await browser.newPage({ viewport: { height: HEIGHT, width: WIDTH } });
page.on('console', (message) => {
  if (message.type() === 'error') console.error(`  console: ${message.text().slice(0, 300)}`);
});

let failures = 0;
for (const id of ids) {
  const url = `${base}?id=${encodeURIComponent(id)}&w=${WIDTH}&h=${HEIGHT}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => document.title.startsWith('proof-'), null, { timeout: 90000 });
  } catch {
    console.error(`FAIL ${id}: timed out before the stage reported a state`);
    failures += 1;
    continue;
  }
  const title = await page.title();
  if (title !== 'proof-ready') {
    console.error(`FAIL ${id}: ${title}`);
    failures += 1;
    continue;
  }
  const png = await page.locator('canvas').screenshot();
  writeFileSync(resolve(outDir, `${id}-applied.png`), png);
  const info = await page.evaluate(() => ({ ...document.body.dataset }));
  console.log(
    `${id.padEnd(24)} ${info.toonlabShot}  tile ${info.toonlabTile} m  `
    + `${info.toonlabDensity} px/cm  ${info.toonlabClassification}  `
    + `${info.toonlabManifestAssignments} role assignment(s)  `
    + `${(png.length / 1024).toFixed(0)} KB`,
  );
}

await browser.close();
console.log(`\napplied proofs -> ${outDir}`);
if (failures > 0) {
  console.error(`${failures} material(s) failed to render`);
  process.exitCode = 1;
}
