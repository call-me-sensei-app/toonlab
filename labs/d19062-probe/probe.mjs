import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const URLS = (process.env.URLS ?? '?mode=plain,?mode=styled').split(',');
const SHOT = process.env.SHOT_DIR ?? null;

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
});
const page = await browser.newPage({ viewport: { height: 420, width: 660 } });
const messages = [];
page.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'info') messages.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.stack ?? e.message}`));

const rgb = (value) => (value ? value.map((v) => String(v).padStart(3)).join(',') : '     -');

for (const suffix of URLS) {
  messages.length = 0;
  await page.goto(`${BASE}/labs/d19062-probe/${suffix}`, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(() => document.body.dataset.probeReady === 'true', null, { timeout: 90000 });
  } catch {
    console.log(suffix, 'TIMEOUT');
    console.log(messages.slice(0, 20).join('\n'));
    continue;
  }
  const report = JSON.parse(await page.evaluate(() => document.body.dataset.probeReport));
  const sun = report.lights.find((light) => light.type === 'DirectionalLight');
  const rows = Object.entries(report.samples)
    .map(([name, value]) => `${name.padEnd(18)} mean ${rgb(value.mean)}   max ${rgb(value.brightest)}`);
  console.log(
    `${suffix.padEnd(48)} ${report.backend}  shadowPass=${report.shadowPassRenderCount}`
    + `  sunShadowReady=${report.sunShadow.ready}`
    + `  sun=[${sun ? sun.position.join(',') : '-'}]->[${sun?.target ? sun.target.join(',') : '-'}] i=${sun?.intensity}`,
  );
  for (const row of rows) console.log('   ', row);
  if (report.shadowPassHealth) console.log('    health:', JSON.stringify(report.shadowPassHealth));
  if (report.shadowAudit) console.log('    audit:', JSON.stringify(report.shadowAudit));
  if (messages.length) console.log('    console:', messages.slice(0, 6).join(' | '));
  if (SHOT) await page.screenshot({ path: `${SHOT}/${suffix.replaceAll(/[?=&]/g, '_')}.png` });
}
await browser.close();
