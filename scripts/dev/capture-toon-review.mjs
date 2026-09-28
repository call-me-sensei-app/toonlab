#!/usr/bin/env node
// Scripted captures of labs/toon-review for visual review and acceptance.
//
//   TOON_REVIEW_BASE=http://localhost:5210 node scripts/dev/capture-toon-review.mjs <outDir> <shots.json>
//
// shots.json: [{ "name": "ganyu-front", "size": "500x900",
//                "query": { "model": "...", "view": "full", ... },
//                "eval": "optional JS run in the page before the capture" }]

import { mkdir, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const [outDir, shotsPath] = process.argv.slice(2);
if (!outDir || !shotsPath) {
  console.error('usage: capture-toon-review.mjs <outDir> <shots.json>');
  process.exit(2);
}
const shots = JSON.parse(await readFile(shotsPath, 'utf8'));
const base = process.env.TOON_REVIEW_BASE ?? 'http://localhost:5210';

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', '--enable-gpu'], headless: true });
const page = await browser.newPage({ viewport: { height: 1500, width: 1500 } });
page.on('pageerror', (error) => console.error('  page error:', error.message));
try {
  for (const shot of shots) {
    const query = new URLSearchParams({ capture: shot.size ?? '800x800', ...shot.query });
    process.stdout.write(`  ${shot.name} … `);
    try {
      await page.goto('about:blank');
      await page.goto(`${base}/labs/toon-review/index.html?${query}`, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => ['true', 'error'].includes(document.body.dataset.ready), null, { timeout: 120000 });
      if (await page.evaluate(() => document.body.dataset.ready) === 'error') {
        console.log('ERROR', await page.evaluate(() => document.getElementById('status').textContent));
        continue;
      }
      if (shot.eval) await page.evaluate(shot.eval);
      await page.waitForTimeout(400);
      await page.locator('#stage canvas').screenshot({ path: `${outDir}/${shot.name}.png`, timeout: 120000 });
      console.log('ok');
    } catch (error) {
      console.log('FAILED', error.message.split('\n')[0]);
    }
  }
} finally {
  await browser.close();
}
