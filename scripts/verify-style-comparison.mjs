// Pixel-identity proof for the §11 shader wipe, plus the Gate 3 captures.
//
//   node scripts/verify-style-comparison.mjs
//   WIPE_URL=http://localhost:5199 WIPE_OUT=/tmp/wipe node scripts/verify-style-comparison.mjs
//
// What it proves, per shot:
//
//   1. split=0 is bit-identical to a full-frame render of the ToonLab variant.
//   2. split=1 is bit-identical to a full-frame render of the neutral variant.
//   3. At 0.25 / 0.5 / 0.75 the scissored region is bit-identical to the SAME
//      region of the neutral full frame, and the region outside it is
//      bit-identical to the same region of the ToonLab full frame. A pixel at
//      (x, y) in the wipe equals that pixel in a full-frame render of its own
//      variant — only possible if both halves share one camera and one framing.
//   4. Camera matrices, light transforms, exposure, tone mapping, shadow state
//      and every animation clock are unchanged by the composite render.
//   5. Every pixel that differs between the halves lies inside the region the
//      tracked subject affects, measured by rendering with the subject hidden.
//      Nothing outside the intended material treatment moved.
//   6. Both variants hold the same geometry buffer, skeleton and morph
//      influences on every tracked node.
//
// The assertions live in `src/renderer/styleComparison.js`
// (`verifyStyleComparisonIdentity`) so the filler register's equivalence test
// can call them directly instead of re-deriving them from a screenshot.
//
// Requires the Vite dev server (`npm run dev`, port 5199).

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import {
  readDataset,
  readDatasetJson,
  screenshotWithFloor,
  stripViteErrorOverlay,
  waitForPaintedFrame,
} from './captureGuards.mjs';

const baseUrl = process.env.WIPE_URL || 'http://localhost:5199';
const outDir = process.env.WIPE_OUT
  || new URL('../../launch-plan/review/captures/wipe/', import.meta.url).pathname;
const width = Number(process.env.WIPE_WIDTH || 1920);
const height = Number(process.env.WIPE_HEIGHT || 1080);
const proofWidth = Number(process.env.WIPE_PROOF_WIDTH || 480);
const proofHeight = Number(process.env.WIPE_PROOF_HEIGHT || 270);

const shots = ['S02', 'S07'];
const splits = [0, 25, 50, 75, 100];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan', '--use-angle=metal'],
  headless: true,
});
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height, width } });

const consoleIssues = [];
page.on('pageerror', (error) => consoleIssues.push(`pageerror: ${String(error).slice(0, 300)}`));
page.on('console', (message) => {
  if (message.type() === 'error') consoleIssues.push(`console.error: ${message.text().slice(0, 300)}`);
});

const manifest = { captures: [], consoleIssues, proofs: [], suspectPlates: [] };
let failed = false;

// D19-154. Readiness alone is not evidence — see scripts/captureGuards.mjs for
// the full account of how two of these plates ended up being screenshots of the
// loading overlay while the run reported success.
const readyPredicate = () => document.body.dataset.wipeReady === 'true';

for (const shot of shots) {
  // --- Gate 3 captures -----------------------------------------------------
  for (const split of splits) {
    const url = `${baseUrl}/labs/launch-world/wipe/?shot=${shot}&split=${split}&hud=0`;
    const name = `${shot}-split-${String(split).padStart(3, '0')}`;
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    const painted = await waitForPaintedFrame(page, { ready: readyPredicate, timeout: 180000 });
    if (!painted.ok) {
      // Do NOT file a plate, and do NOT abort the run: the manifest has to be
      // written or the surviving plates become undescribed.
      console.error(`${name}: NOT CAPTURED — ${painted.error}`);
      console.error(`  dataset: ${JSON.stringify(painted.dataset)}`);
      manifest.suspectPlates.push({ dataset: painted.dataset, file: `${name}.png`, reason: painted.error, url });
      failed = true;
      continue;
    }
    await stripViteErrorOverlay(page, name);

    const plate = await screenshotWithFloor(page, `${outDir}/${name}.png`, { height, label: name, width });
    if (!plate.ok) {
      manifest.suspectPlates.push({
        bytes: plate.bytes,
        dataset: await readDataset(page),
        file: `${name}.png`,
        minimumBytes: plate.minimum,
        reason: 'PNG below the nearly-uniform-frame floor',
        url,
      });
      failed = true;
      continue;
    }

    // A missing report must not throw — `JSON.parse(undefined)` here is what
    // killed the run before the manifest was written.
    const shotReport = await readDatasetJson(page, 'shotReport');
    const wipeReport = await readDatasetJson(page, 'wipeReport');
    if (!shotReport || !wipeReport) {
      console.error(`${name}: missing dataset report (shotReport=${Boolean(shotReport)}, wipeReport=${Boolean(wipeReport)})`);
      failed = true;
    }
    manifest.captures.push({
      backend: await page.evaluate(() => document.body.dataset.rendererBackend),
      bytes: plate.bytes,
      file: `${name}.png`,
      shot: shotReport,
      split,
      url,
      wipe: wipeReport,
    });
    console.log(`captured ${name}  ${(plate.bytes / 1024).toFixed(0)} KB`);
  }

  // --- pixel-identity proof ------------------------------------------------
  await page.goto(`${baseUrl}/labs/launch-world/wipe/?shot=${shot}&hud=0`, { waitUntil: 'domcontentloaded' });
  const proofPainted = await waitForPaintedFrame(page, {
    ready: readyPredicate,
    settleMs: 900,
    timeout: 180000,
  });
  if (!proofPainted.ok) {
    console.error(`${shot} pixel-identity proof: NOT RUN — ${proofPainted.error}`);
    manifest.proofs.push({ error: proofPainted.error, ok: false, shot });
    failed = true;
    continue;
  }
  await page.evaluate(([w, h]) => {
    globalThis.__PROOF = null;
    globalThis.__TOONLAB_LAUNCH_WIPE
      .verify({ height: h, width: w })
      .then((result) => { globalThis.__PROOF = result; },
        (error) => { globalThis.__PROOF = { error: String(error?.stack ?? error).slice(0, 2000), ok: false }; });
  }, [proofWidth, proofHeight]);
  const proof = await page.waitForFunction(() => globalThis.__PROOF, null, { timeout: 300000 })
    .then((handle) => handle.jsonValue());

  manifest.proofs.push({ ...proof, shot });
  const failures = (proof.checks ?? []).filter((check) => !check.ok);
  if (!proof.ok) failed = true;
  console.log(`\n${shot} pixel-identity proof: ${proof.ok ? 'PASS' : 'FAIL'}`);
  for (const check of proof.checks ?? []) {
    const detail = check.differingPixels === undefined
      ? (check.differences ?? []).join('; ')
      : `${check.differingPixels} differing px (max channel delta ${check.maxChannelDelta ?? 0})`;
    console.log(`  ${check.ok ? 'PASS' : 'FAIL'}  ${check.id.padEnd(34)} ${detail}`);
  }
  if (proof.error) console.log(`  error: ${proof.error}`);
  if (failures.length) console.log(`  ${failures.length} failing check(s)`);
}

await writeFile(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();

console.log(`\n${manifest.captures.length} captures + manifest.json in ${outDir}`);
if (manifest.suspectPlates.length) {
  // The point of D19-154: a run that produced a suspect plate must say so
  // loudly and exit non-zero. Silence here is how the two 13 KB / 15 KB plates
  // survived in the review set as the headline shot's evidence.
  console.error(`\n${manifest.suspectPlates.length} SUSPECT PLATE(S) — not filed as evidence:`);
  for (const plate of manifest.suspectPlates) console.error(`  ${plate.file}: ${plate.reason}`);
}
if (consoleIssues.length) {
  console.log(`\nConsole issues (${consoleIssues.length}):`);
  for (const issue of consoleIssues.slice(0, 20)) console.log(`  ${issue}`);
  failed = true;
}
if (failed) {
  console.error('\nStyle-comparison verification FAILED.');
  process.exitCode = 1;
} else {
  console.log('\nStyle-comparison verification passed.');
}
