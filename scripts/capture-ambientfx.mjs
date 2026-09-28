// Ambient-fx visual capture: each effect isolated in the demo scene at the
// hour it is gated for, plus one all-on golden-hour shot. LOOK at the images
// (that is the whole point) — petals should read pink and fluttery under the
// blossom tree, fireflies as glowing dots over dark ground, mist as soft
// horizontal wisps over the pond margin.
//
// Usage:
//   BASE_URL=http://localhost:5177 OUT_DIR=/tmp/ambientfx-caps node scripts/capture-ambientfx.mjs

import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5177';
const OUT = process.env.OUT_DIR ?? '/tmp/ambientfx-caps';
mkdirSync(OUT, { recursive: true });

const only = (effect) => ['petals', 'leaves', 'fireflies', 'pollen', 'mist']
  .map((id) => `${id}=${id === effect ? 1 : 0}`)
  .join('&');

const SHOTS = [
  // Petals by day, orbiting the blossom tree (bloom-volume source).
  { name: 'petals-day', query: `${only('petals')}&time=14&tx=-7&ty=4.5&tz=-4&yaw=5.9&pitch=0.14&dist=15` },
  // Autumn leaves, orbiting the gold tree.
  { name: 'leaves-day', query: `${only('leaves')}&time=14&tx=9&ty=4.5&tz=9&yaw=2.4&pitch=0.14&dist=15` },
  // Fireflies at dusk over the meadow/shore (line of sight clear of trees).
  { name: 'fireflies-dusk', query: `${only('fireflies')}&time=20.5&yaw=5.0&pitch=0.14&dist=24` },
  // Pollen at noon, low and close over the meadow so the motes read against
  // grass and tree shadow instead of washing out on the sky.
  { name: 'pollen-noon', query: `${only('pollen')}&time=12&tx=-2&ty=1.4&yaw=1.2&pitch=0.14&dist=10` },
  // Mist at dawn over the pond margin, looking toward the low sun.
  { name: 'mist-dawn', query: `${only('mist')}&time=6&tx=14&ty=0.8&tz=-6&yaw=0.15&pitch=0.18&dist=20` },
  // Everything on through golden hour (day gates fading out, dusk fading in).
  { name: 'all-on', query: 'time=18.2&yaw=1.35&pitch=0.24&dist=32' },
];

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
});
const page = await browser.newPage({ viewport: { height: 800, width: 1280 } });
const messages = [];
page.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'info') messages.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.message}`));

for (const shot of SHOTS) {
  await page.goto(`${BASE}/examples/ambientfx-demo/?dpr=1&${shot.query}`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(
    () => document.body.dataset.demoReady === 'true' || document.body.dataset.demoReady === 'error',
    { timeout: 90000 },
  );
  await page.waitForTimeout(2600); // let motion/blink programs settle into character
  const info = await page.evaluate(() => ({
    backend: document.body.dataset.rendererBackend,
    byEffect: window.ambientFx?.stats.byEffect,
    particles: document.body.dataset.fxParticles,
    ready: document.body.dataset.demoReady,
  }));
  console.log(`${shot.name}:`, JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/${shot.name}.png` });
}

if (messages.length > 0) console.log(messages.slice(0, 20).join('\n'));
await browser.close();
console.log(`captures in ${OUT}`);
