// §5 character evidence capture for Yua.
//
//   node scripts/capture-yua-review.mjs                 # the whole §5 package
//   node scripts/capture-yua-review.mjs face coast 50   # one frame
//
// Drives /labs/launch-world/character/ on the running dev server at the §11
// master resolution, waits for the review rig to publish its measurement block,
// and writes both the PNGs and a machine-readable evidence record next to them.
// The measurements always travel with the frames that produced them.

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

import { chromium } from 'playwright';

const OUT_DIR = resolve('../launch-plan/review/captures/yua');
const ORIGIN = process.env.TOONLAB_DEV_ORIGIN ?? 'http://localhost:5199';

/** The §5 inspection list, plus the §11 S02 wipe and the locomotion states. */
const PACKAGE = [
  { compare: 0, ground: 'studio', mode: 'toon', name: 'front-toon', shot: 'front' },
  { compare: 100, ground: 'studio', name: 'front-neutral', shot: 'front' },
  { compare: 0, ground: 'studio', name: 'three-quarter-toon', shot: 'three-quarter' },
  { compare: 100, ground: 'studio', name: 'three-quarter-neutral', shot: 'three-quarter' },
  { compare: 50, ground: 'studio', name: 'three-quarter-wipe', shot: 'three-quarter' },
  { compare: 0, ground: 'studio', name: 'side-toon', shot: 'side' },
  { compare: 0, ground: 'studio', name: 'face-toon', shot: 'face' },
  { compare: 100, ground: 'studio', name: 'face-neutral', shot: 'face' },
  { compare: 50, ground: 'studio', name: 'face-wipe', shot: 'face' },
  { compare: 0, ground: 'studio', name: 'hair-edge', shot: 'hair' },
  { compare: 0, ground: 'studio', name: 'lashes', shot: 'lashes' },
  { compare: 0, ground: 'studio', name: 'outerwear', shot: 'outerwear' },
  { compare: 0, ground: 'studio', name: 'shoes', shot: 'shoes' },
  { compare: 0, ground: 'studio', name: 'contact-shadow', shot: 'contact' },
  { clip: 'walk', compare: 0, ground: 'studio', name: 'walk', shot: 'three-quarter' },
  { clip: 'run', compare: 0, ground: 'studio', name: 'run', shot: 'three-quarter' },
  // Stillwater Garden: the stone path is the grounding test that matters now.
  { compare: 0, ground: 'stones', name: 'grounding-stones-contact', shot: 'contact' },
  { compare: 0, ground: 'stones', name: 'grounding-stones-shoes', shot: 'shoes' },
  { compare: 0, ground: 'stones', name: 'grounding-stones-wide', shot: 'front' },
  { clip: 'walk', compare: 0, ground: 'stones', name: 'grounding-stones-walk', shot: 'side' },
];

const [, , shotArg, groundArg, splitArg] = process.argv;
const jobs = shotArg
  ? [{
    compare: Number(splitArg ?? 0),
    ground: groundArg ?? 'studio',
    name: `${shotArg}-${groundArg ?? 'studio'}`,
    shot: shotArg,
  }]
  : PACKAGE;

const width = Number(process.env.CAPTURE_WIDTH) || 3840;
const height = Number(process.env.CAPTURE_HEIGHT) || 2160;

await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=metal',
    '--ignore-gpu-blocklist',
    '--enable-gpu-rasterization',
  ],
  headless: true,
});
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height, width } });

const problems = [];
page.on('console', (message) => {
  if (message.type() === 'error') problems.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

const evidence = {};
let failed = 0;

for (const job of jobs) {
  const url = `${ORIGIN}/labs/launch-world/character/?hud=0`
    + `&shot=${job.shot}&ground=${job.ground}&clip=${job.clip ?? 'idle'}`
    + `&split=${job.compare}&compare=${job.compare > 0 ? 1 : 0}`;
  process.stdout.write(`→ ${job.name.padEnd(24)} ${url}\n`);
  const before = problems.length;
  // Headless WebGPU drops its device on the first heavy upload often enough that
  // a single-shot capture is not reproducible; the page reloads itself and the
  // execution context under an in-flight evaluate goes away. Retry the whole
  // navigation rather than papering over it with longer timeouts.
  let captured = false;
  for (let attempt = 1; attempt <= 3 && !captured; attempt += 1) {
    try {
      await page.goto(url, { timeout: 120_000, waitUntil: 'load' });
      // Frames, not first paint: the sky march, the cloud deck and the post
      // pipeline all have to reach steady state before a review frame means
      // anything.
      // NOTE the `null`: Playwright's signature is (fn, arg, options). Passing
      // the options object second silently makes it the *argument* and leaves
      // the 30 s default timeout in place.
      await page.waitForFunction(
        () => Number(document.body.dataset.yuaFrames ?? 0) > 150,
        null,
        { polling: 250, timeout: 240_000 },
      );
      const record = await page.evaluate(() => JSON.parse(document.body.dataset.yuaEvidence));
      evidence[job.name] = record;
      const out = resolve(OUT_DIR, `${job.name}.png`);
      await mkdir(dirname(out), { recursive: true });
      await page.screenshot({ path: out, type: 'png' });
      captured = true;
    } catch (error) {
      if (attempt === 3) {
        failed += 1;
        problems.push(`${job.name}: ${error.message}`);
        process.stdout.write(`  FAILED ${error.message}\n`);
      } else {
        process.stdout.write(`  retry ${attempt}: ${error.message.split('\n')[0]}\n`);
      }
    }
  }
  for (const problem of problems.slice(before)) process.stdout.write(`  ! ${problem}\n`);
}

await writeFile(
  resolve(OUT_DIR, 'evidence.json'),
  `${JSON.stringify({ capturedAt: new Date().toISOString(), evidence, problems }, null, 2)}\n`,
);
await browser.close();
process.stdout.write(`\n${jobs.length - failed}/${jobs.length} captured into ${OUT_DIR}\n`);
process.exit(failed ? 1 : 0);
