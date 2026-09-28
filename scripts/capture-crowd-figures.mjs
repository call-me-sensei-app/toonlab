// FILL-006 evidence capture — figure review frames + the Gate 4 cost table.
//
//   node scripts/capture-crowd-figures.mjs
//   CROWD_URL=http://localhost:5199 node scripts/capture-crowd-figures.mjs
//
// Requires the Vite dev server. Deterministic: one fixed seed, one fixed
// animation time per frame, no per-load regeneration — so a re-run after the
// FILL-006 merge produces comparable frames.

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const outDir = process.env.CROWD_OUT
  || new URL('../../launch-plan/review/captures/figures/', import.meta.url).pathname;
const baseUrl = process.env.CROWD_URL || 'http://localhost:5199';
const seed = process.env.CROWD_SEED || '20260815';
// Headless Chromium has no WebGPU adapter, so the capture runs the lab's
// documented WebGL fallback backend. Draw calls, triangles and build times are
// backend-independent; the frame time is not, and is reported as such.
const rendererKind = process.env.CROWD_RENDERER || 'webgl';

const shots = [
  { name: 'lineup-11-archetypes', query: { count: '11', shot: 'lineup' }, size: [2560, 1080] },
  { name: 'lineup-close-three', query: { count: '3', shot: 'close' }, size: [1920, 1440] },
  { name: 'depth-bands-18', query: { count: '18', shot: 'crowd' }, size: [2560, 1440] },
  { name: 'depth-bands-36', query: { count: '36', shot: 'crowd' }, size: [2560, 1440] },
  { name: 'garden-figure', query: { set: 'garden', shot: 'close' }, size: [1920, 1440] },
];

// Gate 4 sweep. Draw calls and triangles are exact per-frame values read from
// `renderer.info` after a single reset+render; frame time is the median of a
// windowed rAF sample the lab itself keeps.
const gate4 = [
  { count: '0', res: '1440' },
  { count: '1', res: '1440' },
  { count: '11', res: '1440' },
  { count: '18', res: '1440' },
  { count: '36', res: '1440' },
  { count: '0', res: '2160' },
  { count: '18', res: '2160' },
  { count: '36', res: '2160' },
];

const MEASURE = `(async () => {
  const g = globalThis.toonlabCrowd;
  const { renderer, scene, camera, crowd } = g;
  for (let i = 0; i < 30; i += 1) crowd.update(0.0166);
  let t0 = performance.now();
  for (let i = 0; i < 300; i += 1) crowd.update(0.0166);
  const updateMs = (performance.now() - t0) / 300;
  renderer.info.reset?.();
  await renderer.renderAsync(scene, camera);
  const info = renderer.info.render;
  const d = document.body.dataset;
  return {
    figures: Number(d.crowdFigures),
    pixels: renderer.domElement.width + 'x' + renderer.domElement.height,
    drawCalls: info.drawCalls,
    trianglesRendered: info.triangles,
    trianglesAuthored: Number(d.crowdTriangles),
    updateMs: Number(updateMs.toFixed(4)),
    fps: Number(d.crowdFps ?? 0),
    cpuFrameMs: Number(d.crowdCpuFrameMs ?? 0),
    buildMs: Number(d.crowdBuildMs),
    sourceMs: Number(d.crowdSourceMs),
    geometryMs: Number(d.crowdGeometryMs),
    toonMs: Number(d.crowdToonMs),
    heapMb: Number(d.crowdHeapMb),
    retargets: Number(d.crowdRetargets),
  };
})()`;

function url(query) {
  const target = new URL('/labs/launch-world/crowd/', baseUrl);
  for (const [key, value] of Object.entries({ renderer: rendererKind, seed, ui: '0', ...query })) {
    target.searchParams.set(key, value);
  }
  return target.toString();
}

async function waitForCrowd(page) {
  await page.waitForFunction(() => Boolean(globalThis.toonlabCrowd), null, { timeout: 90_000 });
  await page.waitForTimeout(2500);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({
    args: ['--enable-unsafe-swiftshader', '--use-gl=angle', '--ignore-gpu-blocklist'],
  });

  const results = [];
  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: { height: shot.size[1], width: shot.size[0] },
    });
    page.on('console', (message) => {
      if (message.type() === 'error') console.error(`  console: ${message.text()}`);
    });
    await page.goto(url(shot.query), { waitUntil: 'load' });
    await waitForCrowd(page);
    const buffer = await page.screenshot({ type: 'png' });
    await writeFile(new URL(`${shot.name}.png`, `file://${outDir}`), buffer);
    console.log(`captured ${shot.name}.png`);
    await page.close();
  }

  for (const entry of gate4) {
    const page = await browser.newPage({ viewport: { height: 900, width: 1600 } });
    await page.goto(url({ count: entry.count, res: entry.res, shot: 'crowd' }), { waitUntil: 'load' });
    await waitForCrowd(page);
    const measurement = await page.evaluate(MEASURE);
    results.push(measurement);
    console.log(JSON.stringify(measurement));
    await page.close();
  }

  await writeFile(
    new URL('gate4-crowd-cost.json', `file://${outDir}`),
    `${JSON.stringify(results, null, 2)}\n`,
  );
  console.log(`wrote gate4-crowd-cost.json (${results.length} rows)`);
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
