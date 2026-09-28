#!/usr/bin/env node

// Captures the exact released 480 meshes with their deterministic C7 geology
// maps and the current Call Me Sensei rock shader. Geometry variation is
// explicitly disabled: gallery thumbnails must not imply a different shape.

import { execFile } from 'node:child_process';
import { access, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

import { chromium } from 'playwright';

const DEFAULT_OUTPUT = 'assets-local/rock-c7-gallery-release/2026-08-c7-v2/thumbnails';
const FFMPEG = process.env.FFMPEG_PATH ?? '/opt/homebrew/bin/ffmpeg';
const execFileAsync = promisify(execFile);

function argument(name, fallback = null) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] ?? fallback : fallback;
}

const baseUrl = String(argument('--base-url', 'http://127.0.0.1:5177')).replace(/\/+$/u, '');
const outputDirectory = path.resolve(argument('--output-dir', DEFAULT_OUTPUT));
const limit = Number(argument('--limit', '480'));
const filter = argument('--filter');
const force = process.argv.includes('--force');
if (!Number.isInteger(limit) || limit < 1 || limit > 480) {
  throw new RangeError('--limit must be an integer from 1 to 480.');
}

async function usableThumbnail(file) {
  try {
    return (await stat(file)).size > 8_000;
  } catch {
    return false;
  }
}

async function inspectThumbnailPixels(file) {
  const { stdout } = await execFileAsync(FFMPEG, [
    '-v', 'error', '-i', file, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1',
  ], { encoding: null, maxBuffer: 512 * 384 * 3 + 1024 });
  const width = 512;
  const height = 384;
  if (stdout.length !== width * height * 3) {
    throw new Error(`${file}: expected ${width}x${height} RGB pixels, received ${stdout.length} bytes.`);
  }
  const backgrounds = [
    [stdout[0], stdout[1], stdout[2]],
    (() => {
      const offset = ((height - 1) * width) * 3;
      return [stdout[offset], stdout[offset + 1], stdout[offset + 2]];
    })(),
  ];
  let nearBlackPixels = 0;
  let foregroundPixels = 0;
  let sum = 0;
  let sumSquared = 0;
  const quantized = new Set();
  const x0 = 40;
  const x1 = width - 40;
  const y0 = 16;
  const y1 = height - 16;
  const pixels = (x1 - x0) * (y1 - y0);
  for (let y = y0; y < y1; y += 1) {
    for (let x = x0; x < x1; x += 1) {
      const offset = ((y * width) + x) * 3;
      const r = stdout[offset];
      const g = stdout[offset + 1];
      const b = stdout[offset + 2];
      const luminance = (r * 0.2126) + (g * 0.7152) + (b * 0.0722);
      if (r <= 5 && g <= 5 && b <= 5) nearBlackPixels += 1;
      if (backgrounds.every(([br, bg, bb]) => (
        ((r - br) ** 2) + ((g - bg) ** 2) + ((b - bb) ** 2) > 18 ** 2
      ))) foregroundPixels += 1;
      sum += luminance;
      sumSquared += luminance ** 2;
      quantized.add(`${r >> 4}:${g >> 4}:${b >> 4}`);
    }
  }
  const mean = sum / pixels;
  const variance = Math.max(0, (sumSquared / pixels) - (mean ** 2));
  return {
    foregroundCoverage: foregroundPixels / pixels,
    luminanceVariance: variance,
    nearBlackPixels,
    nearBlackRatio: nearBlackPixels / pixels,
    quantizedColors: quantized.size,
    sampledPixels: pixels,
  };
}

async function stableSceneState(page, id) {
  const snapshots = [];
  for (let sample = 0; sample < 3; sample += 1) {
    if (sample > 0) await page.waitForTimeout(100);
    snapshots.push(await page.evaluate(() => {
      const current = window.__rockGenerationLab.store.getState();
      return {
        bounds: current.meshStats.bounds,
        catalogSourceId: current.catalogSourceId,
        status: current.status,
        triangles: current.meshStats.triangles,
        vertices: current.meshStats.vertices,
      };
    }));
  }
  if (snapshots.some((snapshot) => snapshot.catalogSourceId !== id)
    || snapshots.some((snapshot) => JSON.stringify(snapshot) !== JSON.stringify(snapshots[0]))) {
    throw new Error(`${id}: scene state did not settle across three consecutive samples.`);
  }
  return snapshots[0];
}

await mkdir(outputDirectory, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-gpu', '--enable-unsafe-webgpu'],
  headless: true,
});
const page = await browser.newPage({
  deviceScaleFactor: 1,
  viewport: { height: 384, width: 512 },
});
const errors = [];
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`page: ${error.stack ?? error.message}`));

try {
  await page.goto(`${baseUrl}/rock-lab/?editor=1&hud=0`, {
    timeout: 120_000,
    waitUntil: 'domcontentloaded',
  });
  await page.waitForFunction(() => (
    window.__rockGenerationLab?.engine
    && window.__rockGenerationLab?.store?.actions?.startCatalogVariation
  ), null, { timeout: 120_000 });

  const ids = await page.evaluate(() => {
    const entries = window.__rockGenerationLab.store.getState?.().catalogEntries;
    if (Array.isArray(entries) && entries.length) return entries.map((entry) => entry.id);
    return Array.from({ length: 480 }, (_, index) => `rock-${String(index + 1).padStart(4, '0')}`);
  });
  const selected = ids
    .filter((id) => !filter || new RegExp(filter, 'u').test(id))
    .slice(0, limit);
  const results = [];

  for (const [index, id] of selected.entries()) {
    const file = path.join(outputDirectory, `${id}.png`);
    if (!force && await usableThumbnail(file)) {
      results.push({ id, status: 'skipped' });
      console.log(`[${index + 1}/${selected.length}] ${id} skipped`);
      continue;
    }
    errors.length = 0;
    const started = await page.evaluate((assetId) => {
      const { store } = window.__rockGenerationLab;
      const ok = store.actions.startCatalogVariation(assetId, 0);
      if (ok) store.actions.setCatalogVariationStrength(0);
      return ok;
    }, id);
    if (!started) throw new Error(`${id}: editor did not recognize the catalog asset.`);
    await page.waitForFunction((assetId) => {
      const state = window.__rockGenerationLab.store.getState();
      return state.catalogSourceId === assetId
        && state.document?.reference?.variation === 0
        && state.meshStats?.triangles > 0
        && /^Loaded and decoded /u.test(state.status ?? '')
        && /C7 .* maps \+ Call Me Sensei shader/u.test(state.status ?? '');
    }, id, { timeout: 120_000 });
    // startCatalogVariation reframes, then the immediate 0% strength commit
    // intentionally supersedes that build. Reframe the final exact-source
    // model explicitly so a prior asset's camera cannot yield a blank card.
    await page.evaluate(() => window.__rockGenerationLab.engine.resetCamera());
    await page.waitForTimeout(500);
    const state = await stableSceneState(page, id);
    const canvas = page.locator('#stage canvas');
    await canvas.screenshot({ path: file, type: 'png' });
    const bytes = (await stat(file)).size;
    if (bytes < 8_000) throw new Error(`${id}: thumbnail is suspiciously small (${bytes} bytes).`);
    if (errors.length) throw new Error(`${id}: ${errors.join(' | ')}`);
    const pixels = await inspectThumbnailPixels(file);
    if (pixels.nearBlackRatio > 0.002) {
      throw new Error(`${id}: ${(pixels.nearBlackRatio * 100).toFixed(2)}% near-black pixels indicate broken facets.`);
    }
    if (pixels.foregroundCoverage < 0.03 || pixels.quantizedColors < 16
      || pixels.luminanceVariance < 10) {
      throw new Error(`${id}: thumbnail coverage/variance gate failed (${JSON.stringify(pixels)}).`);
    }
    results.push({ bytes, id, pixels, state, status: 'captured' });
    console.log(`[${index + 1}/${selected.length}] ${id} captured (${bytes} bytes)`);
  }

  const manifest = {
    capturedAt: new Date().toISOString(),
    exactSourceGeometry: true,
    failures: [],
    results,
    schema: 'toonlab/c7-rock-gallery-thumbnails',
    selected: selected.length,
    shaderPreset: 'call_me_sensei',
    surfaceSchema: 'toonlab/c7-geology-surface',
    visualGate: {
      maxNearBlackRatio: 0.002,
      minForegroundCoverage: 0.03,
      minLuminanceVariance: 10,
      minQuantizedColors: 16,
      sceneStateSamples: 3,
    },
    version: 2,
  };
  await writeFile(
    path.join(outputDirectory, 'manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
} finally {
  await browser.close();
}

await access(path.join(outputDirectory, 'manifest.json'));
