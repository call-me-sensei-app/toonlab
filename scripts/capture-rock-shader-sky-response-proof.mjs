#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { chromium } from 'playwright';

const repoRoot = path.resolve(process.cwd());
const baseUrl = process.env.ROCK_SHADER_BASE_URL || 'http://127.0.0.1:5173';
const outputRoot = path.join(
  repoRoot,
  'artifacts/research/rock-geology-v2/rock-shader-four-sky-contexts-v0.2',
);
const renderRoot = path.join(outputRoot, 'renders');
await mkdir(renderRoot, { recursive: true });

const samples = [
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
const sourceHashesBefore = Object.fromEntries(await Promise.all(samples.map(async (sample) => {
  const file = path.join(sourceRoot, sample.id, 'original/rock.glb');
  const bytes = await readFile(file);
  return [sample.id, { bytes: bytes.length, file, sha256: sha256(bytes) }];
})));

const browserErrors = [];
const captures = [];
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height: 900, width: 900 } });
  page.on('pageerror', (error) => browserErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') browserErrors.push(message.text());
  });
  for (const sample of samples) {
    for (const time of times) {
      const query = new URLSearchParams({
        asset: sample.id,
        mode: 'styled-c7',
        renderer: 'webgl',
        time: String(time.hour),
      });
      await page.goto(`${baseUrl}/labs/rock-legacy-current-shader/?${query}`, {
        timeout: 120_000,
        waitUntil: 'domcontentloaded',
      });
      await page.waitForFunction(
        () => document.body.dataset.modelReady === 'true' && Boolean(document.body.dataset.rockReport),
        { timeout: 180_000 },
      );
      await page.waitForTimeout(250);
      const report = JSON.parse(await page.evaluate(() => document.body.dataset.rockReport));
      const file = path.join(renderRoot, `${sample.id}-${time.hour}.png`);
      await page.locator('#stage').screenshot({ path: file });
      captures.push({
        bytes: (await stat(file)).size,
        file,
        report,
        sample,
        time,
      });
      console.log(`captured ${sample.id} at ${time.hour}:00`);
    }
  }
  await page.close();

  const board = await browser.newPage({ deviceScaleFactor: 1, viewport: { height: 1000, width: 2000 } });
  const cards = captures.map((capture) => {
    const frame = capture.report.lighting;
    const visible = capture.report.visibleSky;
    return `<article><div class="tag">${capture.time.label} · ${capture.time.hour}:00</div><img src="renders/${path.basename(capture.file)}"><div class="meta">${capture.sample.name} · ${capture.sample.family}<br>CMS Sky ${visible.styleSnapshot} · dark ${visible.derived.skyDarkness.toFixed(2)} · morning ${visible.derived.morningLight.toFixed(2)} · evening ${visible.derived.eveningLight.toFixed(2)}<br>actual sky ${frame.skyHorizonColor.map((v) => v.toFixed(2)).join(' / ')} · shader input ${frame.rockSkyResponse.skyColor.map((v) => v.toFixed(2)).join(' / ')}</div></article>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:0;padding:22px;background:#09100e;color:#edf3ef;font-family:Inter,system-ui,sans-serif}h1{margin:0;font-size:27px}.lead{margin:7px 0 16px;color:#a9b8b0;font-size:13px}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}article{position:relative;overflow:hidden;border:1px solid #34423b;border-radius:11px;background:#151d19}img{display:block;width:100%}.tag{position:absolute;left:10px;top:10px;padding:7px 9px;border-radius:7px;background:#08100cdd;font-weight:800}.meta{padding:9px 11px;color:#afbeb6;font:11px/1.45 ui-monospace,monospace}</style></head><body><h1>Current rock shader · four real sky contexts</h1><p class="lead">Same C7 maps and immutable legacy geometry under the actual Call Me Sensei SkySystem at the shared Dawn, Day, Sunset, and Night review anchors.</p><main class="grid">${cards}</main></body></html>`;
  await writeFile(path.join(outputRoot, 'comparison.html'), html);
  await board.goto(`${baseUrl}/artifacts/research/rock-geology-v2/rock-shader-four-sky-contexts-v0.2/comparison.html`, { waitUntil: 'networkidle' });
  await board.screenshot({ path: path.join(outputRoot, 'comparison.png'), fullPage: true });
  await board.close();
} finally {
  await browser.close();
}

const protectedSources = await Promise.all(samples.map(async (sample) => {
  const before = sourceHashesBefore[sample.id];
  const bytes = await readFile(before.file);
  return {
    ...before,
    afterBytes: bytes.length,
    afterSha256: sha256(bytes),
    assetId: sample.id,
    passed: before.bytes === bytes.length && before.sha256 === sha256(bytes),
  };
}));
const failures = [];
if (browserErrors.length > 0) failures.push({ browserErrors });
if (!protectedSources.every((entry) => entry.passed)) failures.push({ protectedSources });
for (const capture of captures) {
  if (!capture.report.geometryIdentityPassed) failures.push({ assetId: capture.sample.id, reason: 'geometry changed' });
  if (capture.report.shaderRuntime !== 'applyRockShader') failures.push({ assetId: capture.sample.id, reason: 'wrong shader' });
  if (capture.report.lighting.source !== 'createSceneStyleRuntime(call-me-sensei) + SkySystem') failures.push({ assetId: capture.sample.id, reason: 'wrong lighting' });
  if (capture.report.visibleSky.styleSnapshot !== '2.10') failures.push({ assetId: capture.sample.id, reason: 'wrong Call Me Sensei sky style snapshot' });
  const actualSky = capture.report.lighting.skyHorizonColor;
  const shaderSky = capture.report.lighting.rockSkyResponse?.skyColor;
  if (!Array.isArray(shaderSky) || shaderSky.some((value, index) => Math.abs(value - actualSky[index]) > 1e-6)) failures.push({ assetId: capture.sample.id, reason: 'rock shader sky input does not match the actual scene sky' });
  const composition = capture.report.textureCompositions?.[0];
  if (!composition || composition.sourceTextureCount !== 0 || composition.sourcePbrChannels?.primaryAo !== true) failures.push({ assetId: capture.sample.id, reason: 'C7-only texture composition is not active' });
  if (Math.abs(capture.report.visibleSky.params.time.time - (capture.time.hour / 24)) > 1e-8) failures.push({ assetId: capture.sample.id, reason: 'wrong SkySystem clock' });
  if (capture.time.hour === 22 && capture.report.visibleSky.params.sun.elevation >= 0) failures.push({ assetId: capture.sample.id, reason: 'night sun did not cross below horizon' });
}
const report = {
  schema: 'toonlab/rock-shader-four-sky-contexts-proof',
  version: 2,
  passed: failures.length === 0,
  browserErrors,
  captures,
  failures,
  protectedSources,
};
await writeFile(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ captures: captures.length, failures, passed: report.passed }, null, 2));
if (!report.passed) process.exitCode = 1;
