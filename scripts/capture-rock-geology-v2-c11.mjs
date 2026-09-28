import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock',
);
const outputRoot = path.resolve(process.env.C11_OUTPUT_ROOT || path.join(artifactRoot, 'captures'));
const baseUrl = process.env.C11_BASE_URL || 'http://127.0.0.1:5180';
const width = Number(process.env.C11_WIDTH || 1400);
const height = Number(process.env.C11_HEIGHT || 1000);
const backends = (process.env.C11_BACKENDS || 'webgpu,webgl').split(',').filter(Boolean);
const modes = (process.env.C11_MODES || 'neutral,styled,restored').split(',').filter(Boolean);
const views = (process.env.C11_VIEWS || 'front,rear,left,right,top,bottom,threeQuarter,detail')
  .split(',').filter(Boolean);
const styleVariant = process.env.C11_STYLE_VARIANT || 'toon';
const regionMode = process.env.C11_REGIONS === '1';

const expectedBackends = {
  webgpu: 'webgpu',
  webgl: 'webgl2-fallback',
};

const protectedInputs = [
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/'
    + 'v31-scan-assisted-runtime-package/exports/hoodoo-caprock-lod0-desktop-4k.glb',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/'
    + 'v31-scan-assisted-bake-4096/maps/hoodoo-caprock-basecolor-4096.png',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/'
    + 'v31-scan-assisted-bake-4096/maps/hoodoo-caprock-normal-4096.png',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/'
    + 'v31-scan-assisted-mobile-maps/hoodoo-caprock-orm-4096.png',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/'
    + 'v31-scan-assisted-bake-4096/maps/hoodoo-caprock-heightmicro-4096.png',
  'artifacts/research/rock-geology-v2/checkpoint-09-tripo-p1-pilot/hoodoo-caprock/'
    + 'v31-signed-residual-2048/hoodoo-caprock-v31-lod0-signed-residual-2048.png',
];

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function hashFile(relativeFile) {
  const absoluteFile = path.join(repoRoot, relativeFile);
  const data = await readFile(absoluteFile);
  return { file: absoluteFile, bytes: data.byteLength, sha256: sha256(data) };
}

async function hashInputs() {
  return Promise.all(protectedInputs.map(hashFile));
}

const beforeInputs = await hashInputs();
const canonicalGlb = beforeInputs[0];
if (canonicalGlb.sha256 !== 'd8081bb45a413bbeaab912767c47328308e91e0250aba5213ccb4409fdbf310e') {
  throw new Error(`Canonical hoodoo GLB hash drifted: ${canonicalGlb.sha256}`);
}

await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  deviceScaleFactor: 1,
  viewport: { width, height },
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
for (const renderer of backends) {
  const requiredBackend = expectedBackends[renderer];
  if (!requiredBackend) throw new Error(`Unknown C11 renderer request: ${renderer}`);
  for (const currentMode of modes) {
    for (const currentView of views) {
      const query = new URLSearchParams({
        cycles: '20',
        hud: '0',
        mode: currentMode,
        renderer,
        style: styleVariant,
        view: currentView,
      });
      if (regionMode) query.set('regions', '1');
      const url = `${baseUrl}/labs/rock-geology-v2-c11/?${query}`;
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120_000 });
      await page.waitForFunction(
        () => document.body.dataset.modelReady === 'true' && Boolean(document.body.dataset.rockReport),
        { timeout: 180_000 },
      );
      await page.waitForTimeout(250);
      const report = JSON.parse(await page.evaluate(() => document.body.dataset.rockReport));
      const shotDirectory = path.join(outputRoot, renderer, currentMode);
      await mkdir(shotDirectory, { recursive: true });
      const absoluteFile = path.join(shotDirectory, `${currentView}.png`);
      await page.screenshot({ path: absoluteFile });
      const bytes = await readFile(absoluteFile);

      const shotFailures = [];
      if (report.rendererBackend !== requiredBackend) {
        shotFailures.push(`backend ${report.rendererBackend} != ${requiredBackend}`);
      }
      if (report.asset?.triangles !== 180_000) {
        shotFailures.push(`triangles ${report.asset?.triangles} != 180000`);
      }
      if (report.asset?.meshCount !== 1) shotFailures.push('canonical asset must contain one mesh');
      if (report.regionMode !== regionMode) shotFailures.push('rock-region mode does not match capture request');
      if (regionMode && report.semanticMaskStatus?.passed !== true) {
        shotFailures.push('semantic rock-region binding did not pass');
      }
      if (currentMode === 'neutral' && report.styleReport !== null) {
        shotFailures.push('neutral mode replaced the source material');
      }
      if (currentMode === 'styled') {
        if (report.styleReport?.applied !== 1) shotFailures.push('styled mode did not style one mesh');
        if ((report.styleReport?.retainedSourceTextures ?? 0) < 3) {
          shotFailures.push('styled mode did not retain all three embedded PBR textures');
        }
        if (report.styleReport?.geometryDetail !== null) {
          shotFailures.push('styled mode changed geometry detail');
        }
        if ((report.styleReport?.rejectedTextures ?? []).length > 0) {
          shotFailures.push('styled mode rejected an embedded source texture');
        }
        if (regionMode && report.styleReport?.rockRegions?.totalVertices !== 134_981) {
          shotFailures.push('styled mode did not consume the complete rock-region accessor');
        }
      }
      if (currentMode === 'restored') {
        if (report.restore?.cycles !== 20) shotFailures.push('restore stress did not run 20 cycles');
        if (report.restore?.restoreCount !== 20) shotFailures.push('not every cycle restored the mesh');
        if (report.restore?.secondRestoreCount !== 0) shotFailures.push('restore is not idempotent');
        if (report.restore?.identity?.passed !== true) shotFailures.push('neutral identity was not restored');
      }
      if (shotFailures.length) failures.push({ renderer, mode: currentMode, view: currentView, failures: shotFailures });
      captures.push({
        renderer,
        requiredBackend,
        actualBackend: report.rendererBackend,
        mode: currentMode,
        view: currentView,
        file: absoluteFile,
        bytes: bytes.byteLength,
        sha256: sha256(bytes),
        report,
        failures: shotFailures,
      });
      console.log(`captured ${renderer}/${currentMode}/${currentView}`);
    }
  }
}

await context.close();
await browser.close();

const afterInputs = await hashInputs();
const sourceMutationFailures = beforeInputs.flatMap((before, index) => {
  const after = afterInputs[index];
  return before.sha256 === after.sha256 && before.bytes === after.bytes
    ? []
    : [{ file: before.file, before, after }];
});
if (sourceMutationFailures.length) failures.push({ protectedSourceMutation: sourceMutationFailures });

const restoredPixelChecks = [];
for (const renderer of backends) {
  for (const currentView of views) {
    const neutral = captures.find((entry) => (
      entry.renderer === renderer && entry.mode === 'neutral' && entry.view === currentView
    ));
    const restored = captures.find((entry) => (
      entry.renderer === renderer && entry.mode === 'restored' && entry.view === currentView
    ));
    if (!neutral || !restored) continue;
    const check = {
      renderer,
      view: currentView,
      neutralSha256: neutral.sha256,
      restoredSha256: restored.sha256,
      exactPngBytesEqual: neutral.sha256 === restored.sha256 && neutral.bytes === restored.bytes,
    };
    restoredPixelChecks.push(check);
    if (!check.exactPngBytesEqual) failures.push({ restorePixelMismatch: check });
  }
}

if (pageErrors.length) failures.push({ pageErrors });
if (consoleErrors.length) failures.push({ consoleErrors });

const manifest = {
  schema: 'toonlab/rock-geology-v2-c11-capture-manifest',
  version: 1,
  passed: failures.length === 0,
  baseUrl,
  styleVariant,
  regionMode,
  viewport: { width, height },
  protectedInputsBefore: beforeInputs,
  protectedInputsAfter: afterInputs,
  sourceMutationFailures,
  restoredPixelChecks,
  pageErrors,
  consoleErrors,
  captures,
  failures,
};
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(path.join(artifactRoot, 'style-settings.json'), `${JSON.stringify({
  schema: 'toonlab/rock-geology-v2-c11-style-settings',
  version: 1,
  geometryMode: 'material-only-reversible',
  style: captures.find((entry) => entry.mode === 'styled')?.report.style ?? null,
  sourceGeometryOrBakeModified: false,
}, null, 2)}\n`);

console.log(JSON.stringify({
  passed: manifest.passed,
  captures: captures.length,
  restoredPixelChecks: restoredPixelChecks.length,
  outputRoot,
  failures,
}, null, 2));
if (!manifest.passed) process.exitCode = 1;
