// D19-062 field diagnostic — loads the coastal launch scene headless, dumps the
// live lighting/shadow state, and captures the hero frame.
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://localhost:5199';
const OUT = process.env.OUT_DIR ?? '/tmp/d19062';
const SHOT = process.env.SHOT ?? 'hero';
const EXTRA = process.env.EXTRA ?? '';
const NAME = process.env.NAME ?? 'coast';
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
});
const page = await browser.newPage({ viewport: { height: 900, width: 1600 } });
const messages = [];
page.on('console', (m) => { if (m.type() !== 'log' && m.type() !== 'info') messages.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => messages.push(`[pageerror] ${e.stack ?? e.message}`));

await page.goto(`${BASE}/labs/launch-world/coast/?shot=${SHOT}${EXTRA}`, { waitUntil: 'domcontentloaded' });
await page.waitForFunction(
  () => document.body.dataset.coastReady === 'true' || document.body.dataset.coastError,
  null,
  { timeout: 420000 },
);
await page.waitForFunction(() => Number(document.body.dataset.coastFrames ?? 0) > 200, null, { timeout: 300000 });
await page.evaluate(() => {
  for (const node of document.querySelectorAll('vite-error-overlay')) node.remove();
});
console.log('dataset:', JSON.stringify(await page.evaluate(() => ({ ...document.body.dataset }))));
await page.screenshot({ path: `${OUT}/${NAME}-${SHOT}.png` });

const diag = await page.evaluate(async () => {
  const [{ environmentSunShadow }, { environmentCloudShadow }] = await Promise.all([
    import('/src/shaders-tsl/chunks/environment-sun-shadow.js'),
    import('/src/sky/cloudShadow.js'),
  ]);
  const world = globalThis.azureHeadland ?? null;
  const lights = [];
  const materials = [];
  if (world?.scene) {
    world.scene.traverse((object) => {
      if (object.isLight) {
        lights.push({
          castShadow: Boolean(object.castShadow),
          color: object.color?.toArray?.().map((v) => Number(v.toFixed(3))) ?? null,
          contract: object.shadow?.toonLabLightingContract ?? null,
          intensity: Number((object.intensity ?? 0).toFixed(3)),
          name: object.name || object.type,
          position: object.position?.toArray?.().map((v) => Number(v.toFixed(2))) ?? null,
          target: object.target?.position?.toArray?.().map((v) => Number(v.toFixed(2))) ?? null,
          type: object.type,
          visible: object.visible,
        });
      }
      if (object.isMesh && object.material?.userData?.toonLabSurfaceLighting && materials.length < 4) {
        materials.push({
          castShadow: object.castShadow,
          indirectStrength: object.material.userData.toonLabSurfaceLighting.indirectStrength,
          material: object.material.name,
          mesh: object.name,
          receiveShadow: object.receiveShadow,
          workflow: object.material.userData.toonLabSurfaceLighting.workflow,
        });
      }
    });
  }
  return {
    cloudShadow: {
      enabled: environmentCloudShadow.enabled.value,
      extent: environmentCloudShadow.extent.value,
      intensity: environmentCloudShadow.intensity.value,
      ready: environmentCloudShadow.ready.value,
    },
    lights,
    materials,
    shadowPass: world?.runtime?.shadowPass
      ? {
        farReady: environmentSunShadow.farReady.value,
        ready: environmentSunShadow.ready.value,
        renderCount: world.runtime.shadowPass.renderCount,
      }
      : { note: 'no world global', ready: environmentSunShadow.ready.value, farReady: environmentSunShadow.farReady.value },
    sunShadowUniforms: {
      bias: environmentSunShadow.bias.value,
      mapSize: environmentSunShadow.mapSize.value,
      normalBias: environmentSunShadow.normalBias.value,
      radius: environmentSunShadow.radius.value,
    },
  };
});
console.log('diag:', JSON.stringify(diag, null, 1));
if (messages.length) console.log('--- console ---\n' + messages.slice(0, 30).join('\n'));
await browser.close();
console.log(`capture in ${OUT}`);
