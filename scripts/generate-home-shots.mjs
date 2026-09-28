// Captures the Labs-home card screenshots: one 1280x720 PNG per showcase
// entry into public/home/shots/<id>.png. Requires an ALREADY-RUNNING dev
// server (env BASE_URL, default http://localhost:5175).
//
//   BASE_URL=http://localhost:5211 node scripts/generate-home-shots.mjs
//   BASE_URL=... node scripts/generate-home-shots.mjs shader water   # subset
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { DEMOS_SHOWCASE, LABS_SHOWCASE } from '../labs/home/labsShowcase.js';

const BASE = process.env.BASE_URL ?? 'http://localhost:5175';
const OUT_DIR = process.env.OUT_DIR ?? new URL('../public/home/shots', import.meta.url).pathname;
const only = process.argv.slice(2);

// Give slow world-scale pages more room than the single-asset editors.
const SLOW_IDS = new Set(['outdoor-world', 'playground', 'environment', 'water-playground', 'vfx-arena']);

const entries = [...LABS_SHOWCASE, ...DEMOS_SHOWCASE]
  .filter((entry) => Boolean(entry.href))
  .filter((entry) => only.length === 0 || only.includes(entry.id));

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });

// Ready when any body.dataset automation gate reports true (repo convention:
// modelReady / uiReady / <lab>Ready), else fall through after the timeout —
// a settle delay below still gives late frames a chance either way.
async function waitForReady(timeout) {
  return page.waitForFunction(() => {
    const dataset = document.body.dataset;
    return Object.keys(dataset).some((key) => /ready$/i.test(key) && dataset[key] === 'true');
  }, { timeout }).then(() => true).catch(() => false);
}

const failures = [];
for (const entry of entries) {
  const url = `${BASE}${entry.href}`;
  const timeout = SLOW_IDS.has(entry.id) ? 45000 : 25000;
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const ready = await waitForReady(timeout);
    await page.waitForTimeout(ready ? 2500 : 5000);
    const path = `${OUT_DIR}/${entry.id}.png`;
    await page.screenshot({ path });
    console.log(`captured ${entry.id}${ready ? '' : ' (no ready gate — settled capture)'}`);
  } catch (error) {
    failures.push(entry.id);
    console.warn(`FAILED ${entry.id}: ${error.message.split('\n')[0]}`);
  }
}

await browser.close();
if (failures.length) {
  console.warn(`\n${failures.length} capture(s) failed: ${failures.join(', ')} — their cards fall back to the kana tile.`);
}
