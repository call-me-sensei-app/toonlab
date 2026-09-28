// Tree Lab refactor parity gate (UI redesign P1).
//
//   node scripts/tree-parity-baseline.mjs capture   # before the refactor
//   node scripts/tree-parity-baseline.mjs check     # after each phase
//
// For every built-in preset (plus seed variants of the first two), records
// __treeDesigner.geometryHash() and the full recipe document. `check` fails
// if any hash or recipe differs from the captured baseline — geometry and
// serialization must be bit-identical across the store/engine extraction.

import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const BASELINE_PATH = new URL('./tree-parity-baseline.json', import.meta.url);
const APP = 'http://[::1]:5175/tree-lab/';
const mode = process.argv[2] ?? 'check';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (error) => console.error('[pageerror]', error.message));

await page.goto(APP, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => Number(document.body.dataset.treeRebuildCount) >= 1, null, { timeout: 60000 });
// Preset list: legacy DOM select before P2, __treeDesigner hook after.
const presetIds = await page.evaluate(() => (
  window.__treeDesigner.getBuiltInPresetIds?.()
  ?? [...document.querySelectorAll('#treePreset option')].map((option) => option.value).filter(Boolean)
));

const results = {};
for (const presetId of presetIds) {
  await page.goto(`${APP}?treePreset=${encodeURIComponent(presetId)}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => Number(document.body.dataset.treeRebuildCount) >= 1, null, { timeout: 60000 });
  results[presetId] = await page.evaluate(() => ({
    hash: window.__treeDesigner.geometryHash(),
    recipe: JSON.stringify(window.__treeDesigner.getRecipe()),
  }));

  // Seed variants through the hook path (also exercises setRecipe).
  if (presetIds.indexOf(presetId) < 2) {
    for (const seed of [11, 42]) {
      const key = `${presetId}@seed${seed}`;
      results[key] = await page.evaluate((seedValue) => {
        const recipe = window.__treeDesigner.getRecipe();
        recipe.options.seed = seedValue;
        window.__treeDesigner.setRecipe(recipe);
        return {
          hash: window.__treeDesigner.geometryHash(),
          recipe: JSON.stringify(window.__treeDesigner.getRecipe()),
        };
      }, seed);
    }
  }
}
await browser.close();

if (mode === 'capture') {
  writeFileSync(BASELINE_PATH, JSON.stringify(results, null, 2));
  console.log(`captured ${Object.keys(results).length} fixtures -> tree-parity-baseline.json`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf8'));
let failures = 0;
for (const [key, expected] of Object.entries(baseline)) {
  const actual = results[key];
  if (!actual) {
    console.error(`FAIL ${key}: fixture missing`);
    failures += 1;
    continue;
  }
  if (actual.hash !== expected.hash) {
    console.error(`FAIL ${key}: hash ${expected.hash} -> ${actual.hash}`);
    failures += 1;
  } else if (actual.recipe !== expected.recipe) {
    console.error(`FAIL ${key}: recipe drifted`);
    failures += 1;
  } else {
    console.log(`ok   ${key} (${actual.hash})`);
  }
}
console.log(failures === 0 ? '\ntree-parity: all fixtures match' : `\ntree-parity: ${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
