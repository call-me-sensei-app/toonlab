#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const repoRoot = path.resolve(process.cwd());
const baseUrl = process.env.ROCK_WALKABLE_BASE_URL || 'http://127.0.0.1:5173';
const readinessTimeout = Number(process.env.ROCK_WALKABLE_READINESS_TIMEOUT || 240_000);
const outputRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/rock-c7-walkable-repair-v0.1',
);
const renderRoot = path.join(outputRoot, 'renders');
await mkdir(renderRoot, { recursive: true });

const assets = [
  { family: 'layered-sandstone', id: 'rock-0005', name: 'Layered Slab 9' },
  { family: 'columnar-basalt', id: 'rock-0362', name: 'Column Field 6' },
];
const times = [
  { hour: 6, label: 'Dawn' },
  { hour: 13, label: 'Day' },
  { hour: 18, label: 'Sunset' },
  { hour: 22, label: 'Night' },
];
const sourceRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/legacy-480-c7-pilot-v0.1',
);
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const protectedBefore = await Promise.all(assets.map(async (asset) => {
  const file = path.join(sourceRoot, asset.id, 'original/rock.glb');
  const bytes = await readFile(file);
  return { assetId: asset.id, bytes: bytes.length, file, sha256: sha256(bytes) };
}));

const failures = [];
const browserErrors = [];
const captures = [];
let browser = await chromium.launch({
  args: [
    '--disable-background-timer-throttling',
    '--disable-renderer-backgrounding',
  ],
  headless: true,
});
try {
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: 900, width: 1440 },
  });
  page.on('pageerror', (error) => browserErrors.push({ kind: 'pageerror', text: String(error) }));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push({ kind: 'console', text: message.text() });
  });

  for (const time of times) {
    const query = new URLSearchParams({
      capture: '1',
      hour: String(time.hour),
      model: '/characters/mannequin.glb',
      quality: 'balanced',
      renderer: 'webgl',
      rockPilot: 'c7-repair',
      view: 'c7-rocks',
    });
    await page.goto(`${baseUrl}/examples/walkable-reference/?${query}`, {
      timeout: 180_000,
      waitUntil: 'domcontentloaded',
    });
    await page.bringToFront();
    await page.waitForFunction(() => (
      document.body.dataset.toonlabC7RepairPilotReady === 'true'
      && typeof globalThis.__toonlabReview?.captureFrame === 'function'
    ), null, { timeout: readinessTimeout });
    // WebGPURenderer intentionally owns the production animation loop. SwiftShader
    // may throttle that loop in headless Chromium, so drive the same public review
    // callback until its ordinary every-tenth-frame fail-closed audit has run.
    await page.evaluate(() => {
      for (let frame = 0; frame < 30; frame += 1) {
        globalThis.__toonlabReview.captureFrame();
      }
    });
    try {
      await page.waitForFunction(() => (
        document.body.dataset.toonlabReady === 'true'
        && document.body.dataset.toonlabC7RepairPilotReady === 'true'
        && document.body.dataset.toonlabSurfaceAudit === 'pass'
        && document.body.dataset.toonlabCloudShadow === 'ready'
      ), null, { timeout: readinessTimeout });
    } catch (error) {
      const diagnostic = await page.evaluate(() => ({
        bodyDataset: { ...document.body.dataset },
        reviewKeys: Object.keys(globalThis.__toonlabReview ?? {}),
        status: document.querySelector('#status')?.textContent ?? null,
      }));
      console.error(JSON.stringify({ browserErrors, diagnostic, hour: time.hour }, null, 2));
      throw error;
    }

    const stability = [];
    for (let reading = 0; reading < 4; reading += 1) {
      stability.push(await page.evaluate(() => {
        let drawables = 0;
        let triangles = 0;
        globalThis.__toonlabReview.scene.traverse((object) => {
          if (!object.isMesh || !object.visible || !object.geometry) return;
          drawables += 1;
          const position = object.geometry.getAttribute('position');
          if (!position) return;
          triangles += object.geometry.index
            ? object.geometry.index.count / 3
            : position.count / 3;
        });
        return { drawables, triangles };
      }));
      await page.waitForTimeout(250);
    }
    const settled = stability.slice(1).every(
      (entry) => JSON.stringify(entry) === JSON.stringify(stability.at(-1)),
    );
    const runtime = await page.evaluate(() => {
      const review = globalThis.__toonlabReview;
      const rockMaterials = [];
      for (const pilot of review.c7Pilots) {
        pilot.container.traverse((object) => {
          if (!object.isMesh) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          for (const material of materials) {
            rockMaterials.push({
              assetId: pilot.record.id,
              lighting: material.userData?.toonLabSurfaceLighting ?? null,
              profile: material.userData?.toonLabRockProfile ?? null,
              sceneSkyColor: material.userData?.toonLabRockSceneState?.skyColor?.value?.toArray?.() ?? null,
              textureComposition: material.userData?.toonLabRockTextureComposition ?? null,
            });
          }
        });
      }
      return {
        audit: document.body.dataset.toonlabSurfaceAudit,
        cloudShadow: document.body.dataset.toonlabCloudShadow,
        collision: document.body.dataset.toonlabCollisionReady,
        hour: Number(document.body.dataset.toonlabReviewHour),
        pilotReports: review.c7PilotReports,
        rockMaterials,
        sky: review.sky.toParams(),
        styleBundle: document.body.dataset.styleBundle,
      };
    });
    const file = path.join(renderRoot, `${time.hour}.png`);
    await page.locator('#scene').screenshot({ path: file });
    captures.push({
      bytes: (await stat(file)).size,
      file,
      runtime,
      settled,
      stability,
      time,
    });
    console.log(`captured walkable C7 repair at ${time.hour}:00`);
  }
  await page.close();

  // Release the four heavy scene contexts before composing the static board.
  // SwiftShader can otherwise refuse one final capture despite all source
  // renders having completed successfully.
  await browser.close();
  browser = await chromium.launch({ headless: true });

  const board = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: 1100, width: 1800 },
  });
  const cards = captures.map((capture) => {
    const sky = capture.runtime.sky;
    return `<article><div class="tag">${capture.time.label} · ${capture.time.hour}:00</div><img src="renders/${path.basename(capture.file)}"><div class="meta">Call Me Sensei Sky 2.10 · sun elevation ${sky.sun.elevation.toFixed(1)}° · settled ${capture.settled}<br>original textures + C7 geology maps + repaired current rock shader</div></article>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:22px;background:#08100d;color:#eef5f0;font-family:Inter,system-ui,sans-serif}h1{margin:0;font-size:28px}.lead{margin:7px 0 16px;color:#aabbb1;font-size:13px}.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}article{position:relative;overflow:hidden;border:1px solid #34433b;border-radius:11px;background:#141c18}img{display:block;width:100%}.tag{position:absolute;left:12px;top:12px;padding:8px 10px;border-radius:7px;background:#07100cdd;font-weight:800}.meta{padding:9px 11px;color:#b3c1b9;font:11px/1.5 ui-monospace,monospace}</style></head><body><h1>Repaired C7 rocks · canonical walkable scene</h1><p class="lead">Layered sandstone and columnar basalt at human scale, on the real ground/grass/water scene under the shared Dawn, Day, Sunset, and Night clocks.</p><main class="grid">${cards}</main></body></html>`;
  await writeFile(path.join(outputRoot, 'comparison.html'), html);
  await board.goto(`${baseUrl}/artifacts/research/rock-geology-v2/rock-c7-walkable-repair-v0.1/comparison.html`, {
    waitUntil: 'networkidle',
  });
  await board.screenshot({ path: path.join(outputRoot, 'comparison.png'), fullPage: true });
  await board.close();
} finally {
  await browser.close();
}

const protectedAfter = await Promise.all(protectedBefore.map(async (before) => {
  const bytes = await readFile(before.file);
  return {
    ...before,
    afterBytes: bytes.length,
    afterSha256: sha256(bytes),
    passed: before.bytes === bytes.length && before.sha256 === sha256(bytes),
  };
}));
if (browserErrors.length > 0) failures.push({ browserErrors });
if (!protectedAfter.every(({ passed }) => passed)) failures.push({ protectedSources: protectedAfter });
for (const capture of captures) {
  if (!capture.settled) failures.push({ hour: capture.time.hour, reason: 'scene graph did not settle' });
  if (capture.runtime.audit !== 'pass') failures.push({ hour: capture.time.hour, reason: 'surface audit failed' });
  if (capture.runtime.cloudShadow !== 'ready') failures.push({ hour: capture.time.hour, reason: 'cloud shadow not ready' });
  if (capture.runtime.collision !== 'true') failures.push({ hour: capture.time.hour, reason: 'collision not ready' });
  if (capture.runtime.styleBundle !== 'call-me-sensei') failures.push({ hour: capture.time.hour, reason: 'wrong style bundle' });
  if (capture.runtime.hour !== capture.time.hour) failures.push({ hour: capture.time.hour, reason: 'wrong scene clock' });
  if (capture.runtime.pilotReports.length !== assets.length) failures.push({ hour: capture.time.hour, reason: 'wrong pilot count' });
  if (!capture.runtime.rockMaterials.every(({ assetId, lighting, profile, textureComposition }) => (
    lighting?.directStrength === 0.95
    && lighting?.shadowFill === 0
    && lighting?.useSharedSunShadow === false
    && lighting?.indirectStrength === 0.72
    && lighting?.indirectTintSource === 'dynamic-node'
    && lighting?.indirectTintMode === 'multiply'
    && profile?.lighting?.skyFillStrength === 0.72
    && profile?.lighting?.skyColorInfluence === 1
    && textureComposition?.sourceAlbedoStrength === (
      assetId === 'rock-0005' ? 0.18 : 0.35
    )
  ))) failures.push({ hour: capture.time.hour, reason: 'repaired shader contract missing' });
  if (capture.time.hour === 22 && capture.runtime.sky.sun.elevation >= 0) {
    failures.push({ hour: capture.time.hour, reason: 'night sun is above horizon' });
  }
}
const report = {
  schema: 'toonlab/rock-c7-walkable-repair-proof',
  version: 1,
  passed: failures.length === 0,
  assets,
  browserErrors,
  captures,
  failures,
  protectedSources: protectedAfter,
};
await writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ captures: captures.length, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
