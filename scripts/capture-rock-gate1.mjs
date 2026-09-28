// Captures the §12 Gate 1 evidence for the §6.3 cliff set.
//
//   node scripts/capture-rock-gate1.mjs
//   ROCK_GATE1_OUT=/tmp/g1 ROCK_GATE1_URL=http://localhost:5175 \
//     node scripts/capture-rock-gate1.mjs
//
// Gate 1 requires a neutral and a ToonLab shader view per rock, plus a
// ground-contact proof. The A/B frames additionally evidence the surface fixes
// (detail normal, moss authoring) that this pass landed.
//
// Requires the Vite dev server. Waits on the lab's `modelReady` contract so a
// capture never races asset loading.

import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

import { AZURE_HEADLAND_ROCKS } from '../labs/shared/azureHeadlandRocks.js';

const outDir = process.env.ROCK_GATE1_OUT
  || new URL('../../launch-plan/review/captures/rocks/', import.meta.url).pathname;
const baseUrl = process.env.ROCK_GATE1_URL || 'http://localhost:5175';
const width = Number(process.env.ROCK_GATE1_WIDTH || 1600);
const height = Number(process.env.ROCK_GATE1_HEIGHT || 1000);

/** @type {Array<{name: string, query: Record<string, string>}>} */
const shots = [];

// Per-asset Gate 1 pair, plus the close-up that shot S08 will actually use.
for (const rock of AZURE_HEADLAND_ROCKS) {
  for (const shader of ['neutral', 'call_me_sensei']) {
    shots.push({
      name: `${rock.role}-${rock.id}-${shader}`,
      query: { asset: rock.id, shader, view: 'hero' },
    });
  }
  shots.push({
    name: `${rock.role}-${rock.id}-detail-85mm`,
    query: { asset: rock.id, shader: 'call_me_sensei', view: 'detail' },
  });
  shots.push({
    name: `${rock.role}-${rock.id}-ground-contact`,
    query: { asset: rock.id, shader: 'call_me_sensei', view: 'contact' },
  });
}

// The distinctness question: three rocks, one frame.
shots.push({ name: 'trio-neutral', query: { shader: 'neutral', view: 'trio' } });
shots.push({ name: 'trio-call_me_sensei', query: { shader: 'call_me_sensei', view: 'trio' } });

// A/B evidence for the fixes landed in this pass.
shots.push({
  name: 'ab-normals-off',
  query: { normals: '0', shader: 'call_me_sensei', view: 'detail' },
});
shots.push({
  name: 'ab-normals-on',
  query: { normals: '1', shader: 'call_me_sensei', view: 'detail' },
});
// S08 is the 85 mm rock detail montage and the closest any launch frame gets to
// a rock, so it is where tessellation/displacement has to prove itself. Shot on
// ROCK-COAST-01 at subdivisions 3 — the hero budget.
shots.push({
  name: 's08-detail-off',
  query: { asset: 'rock-0119', detail: '0', shader: 'call_me_sensei', view: 'detail' },
});
shots.push({
  name: 's08-detail-on',
  query: {
    asset: 'rock-0119', detail: '1', shader: 'call_me_sensei', subdiv: '3', view: 'detail',
  },
});

// Moss on the trio view is diluted to ~2.7% of pixels and cannot be judged.
// ROCK-COAST-03 carries the full coverage (mossCoverage 1) and is the asset
// that shares an albedo with ROCK-COAST-01, so it is where moss has to do the
// per-asset differentiation work. Shot at hero framing.
shots.push({
  name: 'ab-moss-off',
  query: { asset: 'rock-0281', moss: '0', shader: 'call_me_sensei', view: 'hero' },
});
shots.push({
  name: 'ab-moss-on',
  query: { asset: 'rock-0281', moss: '1', shader: 'call_me_sensei', view: 'hero' },
});
// Harmonization only moves ROCK-COAST-02 — the other two are already at the
// weathered-limestone anchor, so a trio A/B averages the one real change away.
shots.push({
  name: 'ab-tint-catalog',
  query: { asset: 'rock-0111', harmonize: '0', shader: 'call_me_sensei', view: 'hero' },
});
shots.push({
  name: 'ab-tint-harmonized',
  query: { asset: 'rock-0111', harmonize: '1', shader: 'call_me_sensei', view: 'hero' },
});

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ deviceScaleFactor: 1, viewport: { height, width } });
page.on('pageerror', (error) => console.error(`  page error: ${String(error).slice(0, 200)}`));

// `modelReady` and `rockReport` are published by separate statements, so waiting
// on the flag alone can read the report one tick before it exists. Wait for both.
const settle = async () => {
  await page.waitForFunction(
    () => document.body.dataset.modelReady === 'true' && Boolean(document.body.dataset.rockReport),
    { timeout: 120000 },
  );
  await page.waitForTimeout(400);
};

// The lab re-bootstraps on a query change, so a late reload can destroy the
// execution context between the screenshot and the readback. Read both dataset
// values in one evaluate, and re-settle and retry if we lost the context.
const readState = async () => {
  let lastError = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const state = await page.evaluate(() => ({
        backend: document.body.dataset.rendererBackend,
        report: document.body.dataset.rockReport,
      }));
      // A reload can clear the dataset without destroying the context, so an
      // empty report is retryable rather than fatal.
      if (state.report) return state;
      lastError = new Error('rockReport was cleared mid-read');
    } catch (error) {
      lastError = error;
    }
    await settle();
  }
  throw lastError ?? new Error('rockReport unavailable');
};

const manifest = [];
for (const shot of shots) {
  const params = new URLSearchParams({ ...shot.query, hud: '0' });
  const url = `${baseUrl}/labs/rock-gate1/?${params.toString()}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await settle();
  const path = `${outDir}/${shot.name}.png`;
  await page.screenshot({ path });
  const state = await readState();
  if (!state.report) throw new Error(`${shot.name}: lab published no rockReport`);
  manifest.push({
    backend: state.backend,
    file: `${shot.name}.png`,
    report: JSON.parse(state.report),
    url,
  });
  console.log(`captured ${shot.name}`);
}

await writeFile(`${outDir}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
await browser.close();
console.log(`\n${manifest.length} captures + manifest.json in ${outDir}`);
