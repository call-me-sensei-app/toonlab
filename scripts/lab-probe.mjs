import { chromium } from 'playwright';

const url = process.argv[2];
const shot = process.argv[3];
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const messages = [];
page.on('console', (m) => messages.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => messages.push(`[requestfailed] ${r.url()} ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) messages.push(`[http ${r.status()}] ${r.url()}`); });
page.on('request', (r) => { if (/\.(fbx|glb|pmx|gltf)(\?|$)/i.test(r.url())) messages.push(`[fetch] ${r.url()}`); });
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => document.body.dataset.modelReady === 'true' || document.body.dataset.modelReady === 'error', { timeout: 90000 }).catch(() => {});
const ds = await page.evaluate(() => JSON.stringify(document.body.dataset));
console.log('dataset:', ds);
console.log(messages.filter((m) => !m.startsWith('[log]')).slice(0, 40).join('\n'));
console.log('--- logs ---');
console.log(messages.filter((m) => m.startsWith('[log]')).slice(-25).join('\n'));
if (shot) {
  try { await page.screenshot({ path: shot, timeout: 10000 }); }
  catch (e) { console.log('screenshot failed:', e.message.split('\n')[0]); }
}
await browser.close();
