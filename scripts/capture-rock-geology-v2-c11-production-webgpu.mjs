import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium } from 'playwright';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const c11Root = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/checkpoint-11-stylization/hoodoo-caprock',
);
const outputRoot = path.resolve(
  process.env.C11_PRODUCTION_OUTPUT_ROOT
    || path.join(c11Root, 'production-scene/webgpu-six-view'),
);
const baseUrl = process.env.C11_BASE_URL || 'http://127.0.0.1:5180';
const views = ['front', 'rear', 'left', 'right', 'top', 'bottom'];
const modes = ['neutral', 'styled', 'restored'];
const validationRunCount = 2;
const settledFrameCount = 48;
const viewport = { width: 1400, height: 1000 };
const sourceFiles = {
  semanticGlb: path.join(
    c11Root,
    'semantic-regions/hoodoo-caprock-lod0-desktop-4k-regions.glb',
  ),
  labIndex: path.join(repoRoot, 'labs/rock-geology-v2-c11-production/index.html'),
  labMain: path.join(repoRoot, 'labs/rock-geology-v2-c11-production/main.js'),
  rockMaterial: path.join(repoRoot, 'src/rock-shader/rockMaterial.js'),
  rockRegionRuntime: path.join(repoRoot, 'src/rock-shader/rockRegionRuntime.js'),
  rockShaderRuntime: path.join(repoRoot, 'src/rock-shader/rockShaderRuntime.js'),
};

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hashFile = async (file) => {
  const bytes = await readFile(file);
  return { file, bytes: bytes.byteLength, sha256: sha256(bytes) };
};
const hashSources = async () => Object.fromEntries(await Promise.all(
  Object.entries(sourceFiles).map(async ([key, file]) => [key, await hashFile(file)]),
));
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

function validateReport(report, { mode, view }) {
  const failures = [];
  if (report.rendererBackend !== 'webgpu') failures.push('backend is not WebGPU');
  if (report.asset?.triangles !== 180_000 || report.asset?.meshCount !== 1) {
    failures.push('asset identity mismatch');
  }
  if (report.semanticRegions?.passed !== true
    || report.semanticRegions?.totalVertices !== 134_981) {
    failures.push('semantic region accessor failed');
  }
  if (!sameJson(
    report.application?.systemTargetIds,
    ['toonlab:lighting', 'toonlab:post', 'toonlab:sky'],
  )) failures.push('shared system target set mismatch');
  if (!sameJson(report.application?.objectTargetIds, ['c11/ground'])) {
    failures.push('ground was not the sole object target');
  }
  if (report.application?.hoodooWasSceneStyleTarget !== false) {
    failures.push('scene style runtime modified the hoodoo');
  }
  const diagnostics = report.inspector?.diagnostics;
  if (diagnostics?.cloudShadows?.ready !== true
    || diagnostics?.cloudShadows?.enabled !== true
    || diagnostics?.cloudShadows?.mapName !== 'ToonLabCloudShadowMap'
    || diagnostics?.cloudShadows?.source !== 'sky-system-volumetric-transmittance') {
    failures.push('cloud-shadow contract failed');
  }
  if (report.shadowPass?.health?.ok !== true) {
    failures.push('shared sun-shadow pass is unhealthy');
  }
  if (!report.shadowPass?.casterCoverage?.coveredTargetIds?.includes('c11/hoodoo')) {
    failures.push('hoodoo is absent from shared caster coverage');
  }
  if (!['top', 'bottom'].includes(view)
    && !report.shadowPass?.receiverCoverage?.coveredTargetIds?.includes('c11/ground')) {
    failures.push('ground is absent from shared receiver coverage');
  }
  if (mode === 'neutral' && report.styleReport !== null) {
    failures.push('neutral rock material was replaced');
  }
  if (mode === 'styled' && (
    report.styleReport?.applied !== 1
    || report.styleReport?.retainedSourceTextures !== 3
    || report.styleReport?.rockRegions?.totalVertices !== 134_981
    || report.styleReport?.geometryDetail !== null
    || report.styleReport?.rejectedTextures?.length !== 0
  )) failures.push('styled rock material contract failed');
  if (mode === 'restored' && (
    report.restore?.cycles !== 20
    || report.restore?.restored !== 20
    || report.restore?.secondRestoreCount !== 0
    || report.restore?.identity?.passed !== true
  )) failures.push('restore stress failed');
  return failures;
}

await mkdir(outputRoot, { recursive: true });
const sourceEvidence = await hashSources();
const browser = await chromium.launch({ headless: false });
const stabilityRuns = [];
const failures = [];
let canonicalStyle = null;

for (let runIndex = 0; runIndex < validationRunCount; runIndex += 1) {
  const runNumber = runIndex + 1;
  const context = await browser.newContext({ deviceScaleFactor: 1, viewport });
  const page = await context.newPage();
  const pageErrors = [];
  const consoleErrors = [];
  const failedResponses = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push({ text: message.text(), location: message.location() });
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      failedResponses.push({ status: response.status(), url: response.url() });
    }
  });
  const records = [];
  const runFailures = [];

  for (const view of views) {
    const state = {};
    for (const mode of modes) {
      const query = new URLSearchParams({
        capture: '1',
        cycles: '20',
        hud: '0',
        mode,
        renderer: 'webgpu',
        view,
      });
      await page.goto(`${baseUrl}/labs/rock-geology-v2-c11-production/?${query}`, {
        waitUntil: 'domcontentloaded',
        timeout: 120_000,
      });
      await page.waitForFunction(
        (minimumFrames) => document.body.dataset.ready === 'true'
          && Boolean(document.body.dataset.productionReport)
          && Number(document.body.dataset.frames) >= minimumFrames,
        settledFrameCount,
        { timeout: 180_000 },
      );
      await page.evaluate(() => {
        globalThis.__TOONLAB_C11_PRODUCTION.renderer.setAnimationLoop(null);
      });
      await page.waitForTimeout(100);
      const report = JSON.parse(await page.evaluate(
        () => document.body.dataset.productionReport,
      ));
      const directory = path.join(outputRoot, `run-${runNumber}`, view);
      await mkdir(directory, { recursive: true });
      const file = path.join(directory, `${mode}.png`);
      await page.screenshot({ path: file });
      const image = await hashFile(file);
      const shotFailures = validateReport(report, { mode, view });
      if (shotFailures.length) runFailures.push({ view, mode, failures: shotFailures });
      if (mode === 'styled') {
        canonicalStyle ??= report.style;
        if (!sameJson(report.style, canonicalStyle)) {
          runFailures.push({ view, mode, failures: ['style document changed'] });
        }
      }
      state[mode] = { ...image, report };
    }

    const exactRestorePng = state.neutral.sha256 === state.restored.sha256
      && state.neutral.bytes === state.restored.bytes;
    const sceneLookEqual = sameJson(
      state.neutral.report.sceneLookSignature,
      state.styled.report.sceneLookSignature,
    ) && sameJson(
      state.neutral.report.sceneLookSignature,
      state.restored.report.sceneLookSignature,
    );
    if (!exactRestorePng || !sceneLookEqual) {
      runFailures.push({ view, exactRestorePng, sceneLookEqual });
    }
    records.push({
      view,
      backend: state.neutral.report.rendererBackend,
      neutral: { file: state.neutral.file, bytes: state.neutral.bytes, sha256: state.neutral.sha256 },
      styled: {
        file: state.styled.file,
        bytes: state.styled.bytes,
        sha256: state.styled.sha256,
        report: state.styled.report.styleReport,
      },
      restored: {
        file: state.restored.file,
        bytes: state.restored.bytes,
        sha256: state.restored.sha256,
        report: state.restored.report.restore,
      },
      exactRestorePng,
      sceneLookEqual,
      application: state.neutral.report.application,
      diagnostics: state.neutral.report.inspector?.diagnostics ?? null,
      shadowPass: state.neutral.report.shadowPass,
    });
  }

  if (pageErrors.length) runFailures.push({ pageErrors });
  if (consoleErrors.length) runFailures.push({ consoleErrors });
  if (failedResponses.length) runFailures.push({ failedResponses });
  const run = {
    run: runNumber,
    passed: runFailures.length === 0,
    settledFrameCount,
    pageErrors,
    consoleErrors,
    failedResponses,
    records,
    failures: runFailures,
  };
  stabilityRuns.push(run);
  if (!run.passed) failures.push({ run: runNumber, failures: runFailures });
  await context.close();
}

await browser.close();
const sourceEvidenceAfter = await hashSources();
if (!sameJson(sourceEvidence, sourceEvidenceAfter)) {
  failures.push({ sourceMutation: { before: sourceEvidence, after: sourceEvidenceAfter } });
}

const records = stabilityRuns.at(-1)?.records ?? [];
const pageErrors = stabilityRuns.flatMap((run) => run.pageErrors);
const consoleErrors = stabilityRuns.flatMap((run) => run.consoleErrors);
const failedResponses = stabilityRuns.flatMap((run) => run.failedResponses);
const manifest = {
  schema: 'toonlab/rock-geology-v2-c11-production-webgpu-six-view',
  version: 3,
  generatedAt: new Date().toISOString(),
  passed: failures.length === 0
    && stabilityRuns.length === validationRunCount
    && stabilityRuns.every((run) => run.passed),
  renderer: 'webgpu',
  headed: true,
  validationRunCount,
  settledFrameCount,
  viewport,
  expectedViews: views,
  style: canonicalStyle,
  sourceEvidence,
  sourceEvidenceAfter,
  pageErrors,
  consoleErrors,
  failedResponses,
  stabilityRuns,
  records,
  failures,
};
await writeFile(
  path.join(outputRoot, 'manifest.json'),
  `${JSON.stringify(manifest, null, 2)}\n`,
);
process.stdout.write(`${JSON.stringify({
  passed: manifest.passed,
  validationRuns: stabilityRuns.map((run) => ({
    run: run.run,
    passed: run.passed,
    records: run.records.length,
    exactRestoreViews: run.records.filter((record) => record.exactRestorePng).length,
  })),
  failures,
  outputRoot,
}, null, 2)}\n`);
if (!manifest.passed) process.exitCode = 1;
