#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-13-regression/hoodoo-caprock',
);
const outputRoot = path.resolve(process.env.C13_OUTPUT_ROOT || path.join(artifactRoot, 'visual-captures'));
const baseUrl = process.env.C13_BASE_URL || 'http://127.0.0.1:5180';
const modes = ['lods', 'scale'];
const views = ['front', 'threeQuarter', 'top'];
const expectedTriangles = [180_000, 60_000, 20_000, 6_000];
const protectedFiles = [
  'hoodoo-caprock-lod0-desktop-4k.glb',
  'hoodoo-caprock-lod1-mobile-near-2k.glb',
  'hoodoo-caprock-lod2-mobile-mid-1k.glb',
  'hoodoo-caprock-lod3-mobile-far-1k.glb',
].map((file) => path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/'
    + 'v31-scan-assisted-runtime-package/exports',
  file,
));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function hashFiles() {
  return Promise.all(protectedFiles.map(async (file) => {
    const bytes = await readFile(file);
    return { file, bytes: bytes.length, sha256: sha256(bytes) };
  }));
}

await mkdir(outputRoot, { recursive: true });
const before = await hashFiles();
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1400, height: 900 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text());
});

const captures = [];
const failures = [];
for (const mode of modes) {
  for (const view of views) {
    const url = `${baseUrl}/labs/rock-geology-v2-c13/?${new URLSearchParams({
      hud: '1', mode, renderer: 'webgl', view,
    })}`;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
    await page.waitForFunction(
      () => document.body.dataset.c13Ready === 'true' && Boolean(document.body.dataset.c13Report),
      { timeout: 180_000 },
    );
    await page.waitForTimeout(300);
    const report = JSON.parse(await page.evaluate(() => document.body.dataset.c13Report));
    const file = path.join(outputRoot, `${mode}-${view}.png`);
    await page.screenshot({ path: file });
    const bytes = await readFile(file);
    const shotFailures = [];
    if (report.rendererBackend !== 'webgl2-fallback') shotFailures.push(`backend ${report.rendererBackend}`);
    if (report.mode !== mode || report.view !== view) shotFailures.push('query/report mismatch');
    if (report.items?.length !== 4) shotFailures.push('expected four comparison items');
    const triangles = report.items?.map((item) => item.triangles);
    if (mode === 'lods' && JSON.stringify(triangles) !== JSON.stringify(expectedTriangles)) {
      shotFailures.push(`LOD triangle lineage ${JSON.stringify(triangles)}`);
    }
    if (mode === 'scale' && !triangles?.every((value) => value === 180_000)) {
      shotFailures.push('scale matrix must use the same immutable LOD0 geometry');
    }
    if (mode === 'scale') {
      const rebake = report.items.map((item) => item.rebake);
      if (JSON.stringify(rebake) !== JSON.stringify([false, false, true, true])) {
        shotFailures.push(`rebake policy ${JSON.stringify(rebake)}`);
      }
    }
    if (shotFailures.length) failures.push({ mode, view, shotFailures });
    captures.push({
      mode, view, file, bytes: bytes.length, sha256: sha256(bytes), report, failures: shotFailures,
    });
    console.log(`captured ${mode}/${view}`);
  }
}

// Release the six heavy GLB scenes before composing the bitmap-only board.
await page.close();
const boardPage = await context.newPage();
await boardPage.setViewportSize({ width: 2400, height: 1260 });
const panels = await Promise.all(captures.map(async (capture) => ({
  ...capture,
  data: (await readFile(capture.file)).toString('base64'),
})));
await boardPage.setContent(`<!doctype html><html><head><style>
  *{box-sizing:border-box} body{margin:0;background:#0b1117;color:#edf3f7;font-family:Inter,system-ui,sans-serif}
  header{height:110px;padding:24px 34px;background:#111b24;border-bottom:1px solid #30404d}
  h1{font-size:28px;margin:0 0 7px} p{margin:0;color:#aebdca;font-size:15px}
  main{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:10px}
  figure{margin:0;background:#151f28;border:1px solid #30404d;border-radius:8px;overflow:hidden}
  img{display:block;width:100%;height:500px;object-fit:cover}
  figcaption{height:60px;padding:10px 14px;font-size:15px;text-transform:capitalize}
  figcaption span{display:block;color:#9fb0bd;font-size:12px;margin-top:3px}
</style></head><body><header><h1>C13 · Hoodoo LOD and scale regression</h1>
<p>Top row: the same admitted rock across authored 180k / 60k / 20k / 6k LODs. Bottom row: runtime-safe versus auto-rebake scale envelopes. Neutral PBR is unchanged.</p></header><main>
${panels.map((panel) => `<figure><img src="data:image/png;base64,${panel.data}"><figcaption>${panel.mode} · ${panel.view}<span>${panel.mode === 'lods' ? 'Authored LOD lineage' : 'Green: runtime-safe · orange: ToonLab rebake route'}</span></figcaption></figure>`).join('')}
</main></body></html>`, { waitUntil: 'load' });
const boardFile = path.join(artifactRoot, 'hoodoo-c13-lod-scale-regression.png');
await boardPage.screenshot({ path: boardFile, fullPage: true });
const boardBytes = await readFile(boardFile);

await context.close();
await browser.close();

const after = await hashFiles();
const sourceMutationFailures = before.flatMap((record, index) => (
  record.bytes === after[index].bytes && record.sha256 === after[index].sha256
    ? [] : [{ before: record, after: after[index] }]
));
if (sourceMutationFailures.length) failures.push({ sourceMutationFailures });
if (pageErrors.length) failures.push({ pageErrors });
if (consoleErrors.length) failures.push({ consoleErrors });

const manifest = {
  schema: 'toonlab/rock-geology-v2-c13-visual-manifest',
  version: 1,
  passed: failures.length === 0,
  actualBackend: 'webgl2-fallback',
  baseUrl,
  protectedInputsBefore: before,
  protectedInputsAfter: after,
  sourceMutationFailures,
  captures,
  comparisonBoard: { file: boardFile, bytes: boardBytes.length, sha256: sha256(boardBytes) },
  pageErrors,
  consoleErrors,
  failures,
};
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({
  passed: manifest.passed,
  captures: captures.length,
  board: manifest.comparisonBoard,
  failures,
}, null, 2));
if (!manifest.passed) process.exitCode = 1;
