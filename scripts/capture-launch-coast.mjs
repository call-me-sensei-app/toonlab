import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const OUT = process.env.OUT_DIR ?? '/tmp/coast-caps';
const SHOTS = (process.env.SHOTS ?? 'hero').split(',');
const W = Number(process.env.W ?? 1600);
const H = Number(process.env.H ?? 900);
mkdirSync(OUT, { recursive: true });

// WebGPU needs the full Chromium build, never chrome-headless-shell. Point at
// an installed Playwright browser explicitly when the pinned revision differs.
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await browser.newPage({ viewport: { height: H, width: W } });
const messages = [];
page.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'info') messages.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.stack ?? e.message}`));

for (const shot of SHOTS) {
  const t0 = Date.now();
  await page.goto(`${BASE}/labs/launch-world/coast/?shot=${shot}${process.env.EXTRA ?? ''}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(
      () => document.body.dataset.coastReady === 'true' || document.body.dataset.coastError,
      null,
      { timeout: 300000 },
    );
  } catch (error) {
    console.log(`${shot}: TIMEOUT`, JSON.stringify(await page.evaluate(() => ({ ...document.body.dataset }))));
    await page.screenshot({ path: `${OUT}/${shot}-timeout.png` });
    continue;
  }
  await page.waitForFunction(() => Number(document.body.dataset.coastFrames ?? 0) > 260, null, { timeout: 300000 });
  await page.waitForTimeout(900);
  // Several agents share this dev server; a syntax error in an unrelated lab
  // pops a full-screen vite HMR overlay over every page it serves. Strip it so
  // a neighbour's broken file cannot silently corrupt a coast capture.
  await page.evaluate(() => {
    for (const node of document.querySelectorAll('vite-error-overlay')) node.remove();
  });
  const info = await page.evaluate(() => ({ ...document.body.dataset }));
  console.log(`${shot} (${((Date.now() - t0) / 1000).toFixed(1)}s):`, JSON.stringify(info));
  await page.screenshot({ path: `${OUT}/${shot}.png` });
}

if (messages.length > 0) console.log('--- console ---\n' + messages.slice(0, 40).join('\n'));
await browser.close();
console.log(`captures in ${OUT}`);
