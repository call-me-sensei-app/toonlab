// Stillwater Garden review captures. Retargeted from capture-launch-coast.mjs.
//
//   SHOTS=hero,pond,cascade node scripts/capture-launch-garden.mjs
//   W=3840 H=2160 OUT=launch-plan/review/captures node scripts/capture-launch-garden.mjs
//
// Keeps the coast harness's two hard-won guards:
//   D19-067  strips <vite-error-overlay>, because several agents share one dev
//            server and a neighbour's syntax error otherwise gets recorded as
//            this scene while readiness still reports true;
//   plus a frame-darkness check, so a capture that IS the overlay (or a black
//   canvas) is reported rather than filed.

import { mkdirSync, statSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const OUT = process.env.OUT_DIR ?? process.env.OUT ?? '/tmp/garden-caps';
const SHOTS = (process.env.SHOTS ?? 'hero').split(',');
const W = Number(process.env.W ?? 1600);
const H = Number(process.env.H ?? 900);
const PREFIX = process.env.PREFIX ?? '';
mkdirSync(OUT, { recursive: true });

// WebGPU needs the full Chromium build, never chrome-headless-shell. Point at
// an installed Playwright browser explicitly when the pinned revision differs.
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
  ...(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {}),
});
const page = await browser.newPage({ viewport: { height: H, width: W } });
const messages = [];
page.on('console', (m) => {
  if (m.type() !== 'log' && m.type() !== 'info') messages.push(`[${m.type()}] ${m.text()}`);
});
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.stack ?? e.message}`));

const failures = [];

for (const shot of SHOTS) {
  const t0 = Date.now();
  const url = `${BASE}/labs/launch-world/garden/?shot=${shot}${process.env.EXTRA ?? ''}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForFunction(
      () => document.body.dataset.gardenReady === 'true' || document.body.dataset.gardenError,
      null,
      { timeout: 420_000 },
    );
  } catch {
    console.log(`${shot}: TIMEOUT`, JSON.stringify(await page.evaluate(() => ({ ...document.body.dataset }))));
    await page.screenshot({ path: `${OUT}/${PREFIX}${shot}-timeout.png` });
    continue;
  }
  // Bail on a build failure BEFORE waiting for frames. The readiness wait above
  // is satisfied by `gardenError` as well as by `gardenReady`, but the frame
  // wait that follows can never be satisfied by a scene that threw during
  // assembly — so a one-line assembly error used to burn the full 420 s timeout
  // per shot and report `TIMEOUT`, which points the owner at performance
  // instead of at the stack trace sitting in the dataset.
  const buildError = await page.evaluate(() => document.body.dataset.gardenError ?? '');
  if (buildError) {
    console.log(`${shot}: BUILD FAILED — ${buildError}`);
    await page.screenshot({ path: `${OUT}/${PREFIX}${shot}-error.png` });
    continue;
  }

  // THE FRAME IS NOT THE FRAME UNTIL THE TEMPORAL HISTORY HAS CONVERGED.
  //
  // This waited for 260 frames, and 260 frames is 19% of the way there. The
  // post pipeline carries a temporal history (`post.resetHistory`) that takes
  // about 1,400 frames to settle, and until it does the scene renders as a
  // DIFFERENT IMAGE — not a noisier one. Measured on `lane`, one page load,
  // nothing changed between samples:
  //
  //   frames   frameLuma  lowerThird  satMean  detailOcc  shadowHue
  //     270      0.598      0.540      0.133     54.9     346 deg  (8.5%)
  //     400      0.556      0.459      0.139     57.9     349 deg  (8.9%)
  //     600      0.499      0.347      0.157     63.5     316 deg (13.0%)
  //     900      0.456      0.263      0.185     68.2     284 deg (20.1%)
  //    1400      0.442      0.235      0.200     68.9     281 deg (21.0%)
  //    2200      0.441      0.232      0.202     68.9     280 deg (21.0%)
  //    3000      0.441      0.232      0.202     68.9     280 deg (21.0%)
  //    3800      0.441      0.232      0.201     69.0     280 deg (21.0%)
  //
  // Bit-stable from 2,200 on, so this converges — it is not a drifting cloud
  // deck that never settles. The transient frame is 36% brighter, carries a
  // third less detail, and shows a hard black cast-shadow band and bleached
  // white plaster that are simply absent once the history fills in.
  //
  // Every capture this project has filed, and every A/B any owner has taken off
  // one, was shot at 260. That is why the same scene has been described as
  // "bleached" and as "a funeral" in the same week, and why levers kept
  // measuring smaller than they are.
  //
  // 1,500 costs about 75 s per shot at 20 fps. A capture that is not the
  // product costs a review round, which is worth more than 75 s.
  const SETTLE_FRAMES = Number(process.env.SETTLE_FRAMES ?? 1_500);
  await page.waitForFunction(
    (frames) => Number(document.body.dataset.gardenFrames ?? 0) > frames,
    SETTLE_FRAMES,
    { timeout: 600_000 },
  );
  await page.waitForTimeout(1_200);

  // D19-067. A shared dev server pops a full-screen overlay on every page it
  // serves when ANY lab fails to compile; strip it before the shutter.
  const hadOverlay = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('vite-error-overlay')];
    for (const node of nodes) node.remove();
    return nodes.length > 0;
  });
  if (hadOverlay) console.log(`${shot}: WARNING — a vite error overlay was stripped before capture.`);

  const info = await page.evaluate(() => ({ ...document.body.dataset }));

  // THE REPRESENTATIVENESS GATE — before the shutter, never after.
  //
  // The overlay/darkness guards below prove a frame is REAL. This one proves it
  // is REPRESENTATIVE: that the scene which produced it had every system it
  // claims to demo switched on and carrying the values it was authored with.
  // It exists because three defects — grass ground adoption scaled to a third
  // by a tint, a water preset that silently resolved to another one, and trunk
  // shadow receiving switched off — were reviewed as art-direction problems for
  // two full passes. All three were plain text in the scene's own settings, and
  // all three produced frames that looked like perfectly plausible frames.
  //
  // A failure does NOT write a PNG. A frame that misrepresents the product is
  // worse than no frame, because it costs a review round to disbelieve.
  console.log(`${shot}: config ${info.gardenConfigAudit ?? '<absent>'} — ${info.gardenConfigSummary ?? ''}`);
  if (info.gardenConfigReport) console.log(info.gardenConfigReport);
  if (info.gardenConfigAudit !== 'pass') {
    console.log(`${shot}: CONFIG AUDIT FAILED — no frame written.`);
    console.log(info.gardenConfigFailures ?? '(no failure detail)');
    failures.push(shot);
    continue;
  }

  console.log(`${shot} (${((Date.now() - t0) / 1000).toFixed(1)}s):`, JSON.stringify(info));
  const path = `${OUT}/${PREFIX}${shot}.png`;
  await page.screenshot({ path });

  // A frame that is nearly uniform compresses to almost nothing. Reading the
  // WebGPU canvas back through a 2D context does NOT work (there is no
  // preserved drawing buffer, so it reports pure black on a perfectly good
  // frame and cries wolf on every capture); the PNG's own size is the honest
  // signal, and it catches the overlay, a black canvas and a camera pointed at
  // nothing alike.
  const bytes = statSync(path).size;
  console.log(`${shot}: ${(bytes / 1024).toFixed(0)} KB${bytes < 40_000 ? '  <-- SUSPECT, frame is nearly uniform' : ''}`);
}

if (messages.length > 0) console.log(`--- console ---\n${messages.slice(0, 40).join('\n')}`);
await browser.close();
console.log(`captures in ${OUT}`);
if (failures.length > 0) {
  console.log(`\nCONFIG AUDIT FAILED for: ${failures.join(', ')} — no frames written for these.`);
  process.exitCode = 1;
}
