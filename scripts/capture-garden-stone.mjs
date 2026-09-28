// Captures the Stillwater Garden stone evidence.
//
//   node scripts/capture-garden-stone.mjs
//   GARDEN_STONE_OUT=/tmp/gs GARDEN_STONE_URL=http://localhost:5175 \
//     node scripts/capture-garden-stone.mjs
//
// Requires the Vite dev server. Waits on the lab's `modelReady` contract so a
// capture never races asset loading.

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import { STILLWATER_GARDEN_STONES } from '../labs/shared/stillwaterGardenStones.js';

const outDir = process.env.GARDEN_STONE_OUT
  || new URL('../../launch-plan/review/captures/garden-stone/', import.meta.url).pathname;
const baseUrl = process.env.GARDEN_STONE_URL || 'http://localhost:5175';
const width = Number(process.env.GARDEN_STONE_WIDTH || 1600);
const height = Number(process.env.GARDEN_STONE_HEIGHT || 1000);

/** @type {Array<{name: string, query: Record<string, string>}>} */
const shots = [];

// The headline comparison: the stone the scene ships today against the stone
// it should ship. Same rig, same framing, same moss.
shots.push({ name: 'AB-family-cliff-scaled', query: { family: 'cliff', view: 'group' } });
shots.push({ name: 'AB-family-garden', query: { group: 'set-stone', view: 'group' } });

// Each compositional group as a group — the "does this read as deliberate"
// question that a per-asset turntable cannot answer.
for (const group of ['set-stone', 'cascade', 'gravel-island', 'path-edging']) {
  shots.push({ name: `group-${group}`, query: { group, view: 'group' } });
}

// Per-stone hero + close read.
for (const stone of STILLWATER_GARDEN_STONES) {
  shots.push({ name: `${stone.role}-${stone.id}-hero`, query: { asset: stone.id, view: 'hero' } });
  shots.push({ name: `${stone.role}-${stone.id}-detail`, query: { asset: stone.id, view: 'detail' } });
}

// Ground contact: stone seated in the moss bed.
shots.push({ name: 'contact-GDN-SET-01', query: { asset: 'rock-0222', view: 'contact' } });

// A/B for each fix landed in this pass.
shots.push({ name: 'AB-detail-off', query: { asset: 'rock-0222', detail: '0', view: 'detail' } });
shots.push({ name: 'AB-detail-on', query: { asset: 'rock-0222', view: 'detail' } });
shots.push({ name: 'AB-moss-off', query: { asset: 'rock-0206', moss: '0', view: 'detail' } });
shots.push({ name: 'AB-moss-legacy', query: { asset: 'rock-0206', mossmode: 'legacy', view: 'detail' } });
shots.push({ name: 'AB-moss-hero', query: { asset: 'rock-0206', view: 'detail' } });

// The judging lens. Every look call in the realism pass was made at 85 mm, so
// the evidence has to exist at 85 mm — the wider `detail` view is too forgiving
// about a soft margin and about whether a cushion has any thickness.
for (const stone of ['rock-0222', 'rock-0206', 'rock-0247', 'rock-0088']) {
  shots.push({ name: `lens85-${stone}`, query: { asset: stone, view: 'lens85' } });
}
// Per-term A/B at that lens, so each of the four defects can be judged against
// its own fix rather than against the whole pass at once.
shots.push({ name: 'AB85-camo-baseline', query: { asset: 'rock-0206', mossmode: 'legacy', view: 'lens85' } });
shots.push({ name: 'AB85-no-cushion', query: { asset: 'rock-0206', contact: '0', cushion: '0', view: 'lens85' } });
shots.push({ name: 'AB85-no-damp', query: { asset: 'rock-0206', damp: '0', view: 'lens85' } });
shots.push({ name: 'AB85-no-exposure', query: { asset: 'rock-0206', exposure: '0', view: 'lens85' } });
shots.push({ name: 'AB85-no-fringe', query: { asset: 'rock-0206', fringe: '0', view: 'lens85' } });
shots.push({ name: 'AB85-raw-ramp', query: { asset: 'rock-0206', patternFloor: '-1', view: 'lens85' } });
shots.push({ name: 'AB85-all-on', query: { asset: 'rock-0206', view: 'lens85' } });
// The scene-side value grade recommended in
// launch-plan/review/garden-stone-value-grade.md. Not applied by default —
// this is the evidence the recommendation ships with.
shots.push({ name: 'AB85-grade-off', query: { asset: 'rock-0206', view: 'lens85' } });
shots.push({ name: 'AB85-grade-on', query: { asset: 'rock-0206', grade: '1', view: 'lens85' } });
shots.push({ name: 'group-set-stone-graded', query: { grade: '1', group: 'set-stone', view: 'group' } });

// Neutral view per stone group, so the form is reviewable without the shader.
shots.push({ name: 'neutral-set-stone', query: { group: 'set-stone', shader: 'neutral', view: 'group' } });

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { height, width } });
page.on('pageerror', (error) => console.error('  page error:', error.message));

const manifest = [];
for (const shot of shots) {
  const query = new URLSearchParams({ hud: '0', ...shot.query });
  // Dev-only labs are not rollup inputs and are not rewritten to a root
  // route, so the explicit path is the one that actually resolves.
  const url = `${baseUrl}/labs/garden-stone-gate/index.html?${query}`;
  process.stdout.write(`  ${shot.name} … `);
  // Clear between shots. Navigating straight from one lab URL to the next can
  // be interrupted by the previous page's own late navigation, and a blank
  // page in between makes each load independent.
  await page.goto('about:blank');
  for (let attempt = 1; ; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      await page.waitForTimeout(500);
    }
  }
  await page.waitForFunction(() => document.body.dataset.modelReady === 'true', null, { timeout: 90000 });
  // One extra frame so the first render has certainly presented.
  await page.waitForTimeout(350);
  const report = JSON.parse(await page.evaluate(() => document.body.dataset.rockReport));
  const file = `${shot.name}.png`;
  await page.screenshot({ path: `${outDir}/${file}` });
  manifest.push({ file, report, url });
  console.log('ok');
}

await writeFile(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
console.log(`\n${shots.length} frames → ${outDir}`);
