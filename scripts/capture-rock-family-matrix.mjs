import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import {
  readDatasetJson,
  screenshotWithFloor,
  waitForPaintedFrame,
} from './captureGuards.mjs';

const outputDirectory = process.env.TOONLAB_ROCK_MATRIX_OUT
  || new URL('../artifacts/research/toonlab-rock-family-matrix/captures/', import.meta.url).pathname;
const artifactIndexPath = new URL(
  '../assets-local/labs/toonlab-rock-family-matrix/index.json',
  import.meta.url,
);
const baseUrl = process.env.TOONLAB_ROCK_MATRIX_URL || 'http://127.0.0.1:5181';
const width = Number(process.env.TOONLAB_ROCK_MATRIX_WIDTH || 1440);
const height = Number(process.env.TOONLAB_ROCK_MATRIX_HEIGHT || 960);
const artifactIndex = JSON.parse(await readFile(artifactIndexPath, 'utf8'));
const requested = new Set(
  String(process.env.TOONLAB_ROCK_FAMILIES || 'all').split(',').map((value) => value.trim()),
);
const families = artifactIndex.reports.filter((entry) => (
  entry.ok && (requested.has('all') || requested.has(entry.familyId))
));
if (families.length === 0) throw new Error('No compiled rock families matched the capture request.');

const shots = families.flatMap((family) => [
  {
    family,
    name: `${family.familyId}-before-after-hero`,
    query: { family: family.familyId, look: 'compare', seed: artifactIndex.seed, view: 'hero' },
  },
  {
    family,
    name: `${family.familyId}-after-close`,
    query: { family: family.familyId, look: 'after', seed: artifactIndex.seed, view: 'close' },
  },
  {
    family,
    name: `${family.familyId}-stylized-hero`,
    query: { family: family.familyId, look: 'stylized', seed: artifactIndex.seed, view: 'hero' },
  },
]);

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height, width } });
const consoleErrors = [];
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => consoleErrors.push(`page: ${error.stack ?? error.message}`));

const captures = [];
const failures = [];
for (const shot of shots) {
  consoleErrors.length = 0;
  const query = new URLSearchParams({
    ...Object.fromEntries(Object.entries(shot.query).map(([key, value]) => [key, String(value)])),
    hud: '0',
  });
  const url = `${baseUrl}/labs/toonlab-rock-family-matrix/?${query}`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
  const ready = await waitForPaintedFrame(page, {
    error: () => Boolean(document.body.dataset.rockError),
    ready: () => document.body.dataset.rockReady === 'true',
  });
  const report = await readDatasetJson(page, 'rockReport');
  if (!ready.ok || ready.dataset.rockError || !report || report.error || consoleErrors.length > 0) {
    failures.push({ errors: consoleErrors.slice(), name: shot.name, ready, report, url });
    continue;
  }
  const file = `${shot.name}.png`;
  const screenshot = await screenshotWithFloor(page, `${outputDirectory}/${file}`, {
    height,
    label: shot.name,
    width,
  });
  if (!screenshot.ok) failures.push({ name: shot.name, screenshot, url });
  else captures.push({
    accepted: shot.family.accepted,
    familyId: shot.family.familyId,
    familyLabel: shot.family.familyLabel,
    file,
    report,
    screenshot,
    url,
  });
  console.log(`captured ${shot.name}`);
}

const comparisonCaptures = captures.filter((entry) => entry.file.includes('-before-after-hero'));
const cards = comparisonCaptures.map((entry) => `
  <article class="${entry.accepted ? 'accepted' : 'rejected'}">
    <img src="${baseUrl}/artifacts/research/toonlab-rock-family-matrix/captures/${entry.file}" />
    <div><strong>${entry.familyLabel}</strong><span>${entry.accepted ? 'gate accepted' : 'tested · gate blocked'}</span></div>
  </article>`).join('');
await page.setViewportSize({ width: 1800, height: 1200 });
await page.setContent(`<!doctype html><html><head><style>
  *{box-sizing:border-box} body{margin:0;padding:28px;background:#202421;color:#f4f1e8;font-family:Inter,system-ui,sans-serif}
  h1{margin:0 0 8px;font-size:25px} p{margin:0 0 24px;color:#bfc5bf;font-size:13px}
  main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}
  article{overflow:hidden;background:#303530;border:1px solid #4c534d;border-radius:10px}
  article.rejected{border-color:#8e5f46} img{display:block;width:100%;aspect-ratio:3/2;object-fit:cover}
  article div{display:flex;justify-content:space-between;gap:10px;padding:9px 11px;font-size:11px}
  article strong{font-size:12px} article span{color:#a9b6aa}.rejected span{color:#d2a07f}
</style></head><body><h1>ToonLab rock families · before / after high-to-low bake</h1>
<p>Identical mesh, seed, camera, lighting, and geology palette. Orange cards were tested but blocked by structural or atlas gates.</p>
<main>${cards}</main></body></html>`, { waitUntil: 'load' });
await page.waitForFunction(() => [...document.images].every((image) => image.complete && image.naturalWidth > 0));
await page.waitForTimeout(300);
const contactSheetPath = `${outputDirectory}/family-comparison-contact-sheet.png`;
await page.screenshot({ fullPage: true, path: contactSheetPath });
const contactSheetBytes = (await stat(contactSheetPath)).size;
if (contactSheetBytes < 100_000) failures.push({ error: 'contact sheet is suspiciously small', contactSheetBytes });

const manifest = {
  artifactIndex: {
    atlasResolution: artifactIndex.atlasResolution,
    meshResolution: artifactIndex.meshResolution,
    seed: artifactIndex.seed,
  },
  capturedAt: new Date().toISOString(),
  captures,
  contactSheet: {
    bytes: contactSheetBytes,
    file: 'family-comparison-contact-sheet.png',
  },
  failures,
  ok: failures.length === 0,
};
await writeFile(`${outputDirectory}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
if (failures.length > 0) {
  throw new Error(`${failures.length} rock-family capture failure(s); see ${outputDirectory}/manifest.json`);
}
console.log(`${captures.length} captures and one contact sheet written to ${outputDirectory}`);
