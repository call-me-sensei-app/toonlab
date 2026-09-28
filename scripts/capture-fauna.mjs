// Fauna demo visual capture: waits for demoReady, then screenshots the four
// camera presets (lake overview with birds in flight, low bird-flock angle,
// top-down fish through the refraction, meadow butterflies) plus a second
// moment of the default view so wing poses differ.
//
// Usage:
//   BASE_URL=http://localhost:5177 OUT_DIR=/tmp/fauna-caps node scripts/capture-fauna.mjs

import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5177';
const OUT = process.env.OUT_DIR ?? '/tmp/fauna-caps';
const SEED = process.env.SEED ?? '42';
const url = `${BASE}/examples/fauna-demo/?dpr=1&seed=${SEED}`;

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
});
const page = await browser.newPage({ viewport: { height: 800, width: 1280 } });
const messages = [];
page.on('console', (m) => messages.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.message}`));
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => document.body.dataset.demoReady === 'true' || document.body.dataset.demoReady === 'error',
  { timeout: 90000 },
);
const info = await page.evaluate(() => ({ ...document.body.dataset }));
console.log('info:', JSON.stringify(info));
await page.waitForTimeout(3500); // let flocks spread and wings desync

// Short settle after aiming: the views lead their targets by velocity, but
// a flock at 7 m/s leaves a fixed frame within seconds.
const shots = [
  ['orbit', 'fauna-lake.png', 1200],
  ['birds', 'fauna-birds.png', 1200],
  ['fish', 'fauna-fish-topdown.png', 1200],
  ['butterflies', 'fauna-butterflies.png', 600],
  ['dragonflies', 'fauna-dragonflies.png', 600],
];
for (const [view, file, settle] of shots) {
  await page.evaluate((name) => window.faunaDemo.setView(name), view);
  await page.waitForTimeout(settle);
  await page.screenshot({ path: `${OUT}/${file}` });
  console.log('captured', file);
}

// Second moment, re-aimed: different flap phases + flock shape.
await page.waitForTimeout(5000);
await page.evaluate(() => window.faunaDemo.setView('birds'));
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/fauna-birds-later.png` });
console.log('captured fauna-birds-later.png');

console.log(messages
  .filter((m) => !m.startsWith('[log]') && !m.startsWith('[debug]') && !m.startsWith('[info]'))
  .slice(0, 25)
  .join('\n'));
await browser.close();
