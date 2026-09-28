import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c11Root = path.join(repoRoot, 'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock');
const outputRoot = path.resolve(process.env.C11_PRODUCTION_OUTPUT_ROOT || path.join(c11Root, 'production-scene/captures'));
const baseUrl = process.env.C11_BASE_URL || 'http://127.0.0.1:5180';
const rendererRequest = process.env.C11_PRODUCTION_RENDERER || 'webgl';
const requiredBackend = rendererRequest === 'webgpu' ? 'webgpu' : 'webgl2-fallback';
const views = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
const modes = ['neutral', 'styled', 'restored'];
const protectedFiles = [
  path.join(c11Root, 'semantic-regions/hoodoo-caprock-lod0-desktop-4k-regions.glb'),
  path.join(c11Root, '../..', 'checkpoint-09-tripo-p1-pilot/hoodoo-caprock/v31-scan-assisted-runtime-package/exports/hoodoo-caprock-lod0-desktop-4k.glb'),
].map((file) => path.resolve(file));

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function hashFiles() {
  return Promise.all(protectedFiles.map(async (file) => {
    const bytes = await readFile(file);
    return { file, bytes: bytes.byteLength, sha256: sha256(bytes) };
  }));
}

const before = await hashFiles();
await mkdir(outputRoot, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ deviceScaleFactor: 1, viewport: { width: 1400, height: 1000 } });
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });

const captures = [];
const failures = [];
for (const view of views) {
  const query = new URLSearchParams({ capture: '1', cycles: '20', hud: '0', mode: 'neutral', renderer: rendererRequest, view });
  await page.goto(`${baseUrl}/labs/rock-geology-v2-c11-production/?${query}`, {
    waitUntil: 'domcontentloaded',
    timeout: 120_000,
  });
  for (const mode of modes) {
    if (mode !== 'neutral') {
      await page.keyboard.press(mode === 'styled' ? '2' : '3');
    }
    await page.waitForFunction(
      () => document.body.dataset.ready === 'true' && Boolean(document.body.dataset.productionReport),
      null,
      { timeout: 180_000 },
    );
    await page.waitForTimeout(250);
    const report = JSON.parse(await page.evaluate(() => document.body.dataset.productionReport));
    const directory = path.join(outputRoot, mode);
    await mkdir(directory, { recursive: true });
    const file = path.join(directory, `${view}.png`);
    await page.screenshot({ path: file });
    const bytes = await readFile(file);
    const shotFailures = [];
    if (report.rendererBackend !== requiredBackend) shotFailures.push(`backend ${report.rendererBackend} != ${requiredBackend}`);
    if (report.asset?.triangles !== 180_000 || report.asset?.meshCount !== 1) shotFailures.push('asset identity mismatch');
    if (report.semanticRegions?.passed !== true || report.semanticRegions?.totalVertices !== 134_981) {
      shotFailures.push('semantic region accessor failed');
    }
    if (JSON.stringify(report.application?.systemTargetIds) !== JSON.stringify(['toonlab:lighting', 'toonlab:post', 'toonlab:sky'])) {
      shotFailures.push('shared system target set mismatch');
    }
    if (JSON.stringify(report.application?.objectTargetIds) !== JSON.stringify(['c11/ground'])) {
      shotFailures.push('ground was not the sole object target');
    }
    if (report.application?.hoodooWasSceneStyleTarget !== false) shotFailures.push('scene style runtime modified the hoodoo');
    const diagnostics = report.inspector?.diagnostics;
    if (diagnostics?.cloudShadows?.ready !== true
      || diagnostics?.cloudShadows?.enabled !== true
      || diagnostics?.cloudShadows?.mapName !== 'ToonLabCloudShadowMap'
      || diagnostics?.cloudShadows?.source !== 'sky-system-volumetric-transmittance') {
      shotFailures.push('cloud-shadow contract failed');
    }
    if (report.shadowPass?.health?.ok !== true) shotFailures.push('shared sun-shadow pass is unhealthy');
    if (!report.shadowPass?.casterCoverage?.coveredTargetIds?.includes('c11/hoodoo')) {
      shotFailures.push('hoodoo is absent from shared caster coverage');
    }
    if (!['top', 'bottom'].includes(view)
      && !report.shadowPass?.receiverCoverage?.coveredTargetIds?.includes('c11/ground')) {
      shotFailures.push('ground is absent from shared receiver coverage');
    }
    if (mode === 'neutral' && report.styleReport !== null) shotFailures.push('neutral rock material was replaced');
    if (mode === 'styled' && (
      report.styleReport?.applied !== 1
      || report.styleReport?.retainedSourceTextures !== 3
      || report.styleReport?.rockRegions?.totalVertices !== 134_981
      || report.styleReport?.geometryDetail !== null
      || report.styleReport?.rejectedTextures?.length !== 0
    )) shotFailures.push('styled rock material contract failed');
    if (mode === 'restored' && (
      report.restore?.cycles !== 20
      || report.restore?.restored !== 20
      || report.restore?.secondRestoreCount !== 0
      || report.restore?.identity?.passed !== true
    )) shotFailures.push('restore stress failed');
    if (shotFailures.length) failures.push({ mode, view, failures: shotFailures });
    captures.push({
      mode,
      view,
      file,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      report,
      failures: shotFailures,
    });
    console.log(`captured ${mode}/${view}`);
  }
}

await context.close();
await browser.close();
const after = await hashFiles();
const sourceMutationFailures = before.flatMap((record, index) => (
  record.sha256 === after[index].sha256 && record.bytes === after[index].bytes
    ? [] : [{ before: record, after: after[index] }]
));
if (sourceMutationFailures.length) failures.push({ sourceMutationFailures });

const stateChecks = [];
for (const view of views) {
  const records = Object.fromEntries(modes.map((mode) => [mode, captures.find((entry) => entry.mode === mode && entry.view === view)]));
  const sceneLookEqual = JSON.stringify(records.neutral.report.sceneLookSignature)
    === JSON.stringify(records.styled.report.sceneLookSignature)
    && JSON.stringify(records.neutral.report.sceneLookSignature)
      === JSON.stringify(records.restored.report.sceneLookSignature);
  const exactRestorePng = records.neutral.sha256 === records.restored.sha256
    && records.neutral.bytes === records.restored.bytes;
  const check = { view, sceneLookEqual, exactRestorePng };
  stateChecks.push(check);
  if (!sceneLookEqual || !exactRestorePng) failures.push({ stateCheck: check });
}
if (pageErrors.length) failures.push({ pageErrors });
if (consoleErrors.length) failures.push({ consoleErrors });

const manifest = {
  schema: 'toonlab/rock-geology-v2-c11-production-scene-capture',
  version: 1,
  passed: failures.length === 0,
  rendererRequest,
  requiredBackend,
  viewport: { width: 1400, height: 1000 },
  protectedInputsBefore: before,
  protectedInputsAfter: after,
  sourceMutationFailures,
  stateChecks,
  pageErrors,
  consoleErrors,
  captures,
  failures,
};
await writeFile(path.join(outputRoot, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ passed: manifest.passed, captures: captures.length, failures, outputRoot }, null, 2));
if (!manifest.passed) process.exitCode = 1;
