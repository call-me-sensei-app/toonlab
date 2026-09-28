// Outdoor World + paths visual capture: waits for worldReady, captures
// (1) spawn view, (2) aerial network view, (3) a ground-level trail view,
// (4) a bridge close-up when the seed produces one, (5) the minimap overlay.
//
// Usage:
//   BASE_URL=http://localhost:5175 SEED=13 OUT_DIR=/tmp node scripts/capture-outdoor-paths.mjs
import { mkdirSync } from 'node:fs';

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5175';
const OUT = process.env.OUT_DIR ?? '/tmp/toonlab-paths';
const SEED = process.env.SEED ?? '';
const url = `${BASE}/examples/outdoor-world/?paths=4&dpr=1${SEED ? `&seed=${SEED}` : ''}`;

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
  () => document.body.dataset.worldReady === 'true' || document.body.dataset.worldReady === 'error',
  { timeout: 120000 },
);
await page.waitForTimeout(2500);
const info = await page.evaluate(() => ({ ...document.body.dataset }));
console.log('info:', JSON.stringify({
  backend: info.rendererBackend,
  bridges: info.pathBridges,
  routes: info.pathRoutes,
  triangles: info.pathTriangles,
  worldReady: info.worldReady,
}));

await page.screenshot({ path: `${OUT}/paths-spawn.png` });

// Aerial view of the network.
await page.keyboard.press('3');
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/paths-aerial.png` });

// Ground-level trail view: stand the character on the first route.
const onRoute = await page.evaluate(() => {
  const route = window.toonWorld?.paths?.routes?.[0];
  if (!route) return null;
  const mid = route.samples[Math.floor(route.samples.length / 2)];
  window.toonTravel(mid.x, mid.z);
  return { x: mid.x, z: mid.z };
});
if (onRoute) {
  await page.keyboard.press('1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/paths-ground.png` });
}

// Bridge close-up: put the character on the bank beside the first deck.
const bridge = await page.evaluate(() => {
  const world = window.toonWorld;
  const route = world?.paths?.routes?.find((entry) => entry.bridges.length > 0);
  if (!route) return null;
  const crossing = route.bridges[0];
  const sample = route.samples.find((point) => point.bridge) ?? route.samples[0];
  window.toonTravel(sample.x, sample.z);
  return { span: crossing.span, x: sample.x, z: sample.z };
});
console.log('bridge:', JSON.stringify(bridge));
if (bridge) {
  await page.keyboard.press('1');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/paths-bridge.png` });
}

// Minimap close-up (has the path overlay).
const minimap = await page.$('#minimap');
if (minimap) await minimap.screenshot({ path: `${OUT}/paths-minimap.png` });

console.log(messages
  .filter((m) => !m.startsWith('[log]') && !m.startsWith('[debug]') && !m.startsWith('[info]'))
  .filter((m) => !m.includes('not found on geometry'))
  .slice(0, 20)
  .join('\n'));
await browser.close();
