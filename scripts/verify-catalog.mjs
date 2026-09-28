// Catalog verification — the "catalog is a contract, not a wiki" suite:
// every entry validates, every ASSET entry actually spawns and builds a
// grounded object headlessly, snippets reference real exports, and the
// remote-source seam works. Run: node scripts/verify-catalog.mjs

import process from 'node:process';

import * as root from '../src/index.js';
import { catalog, createCatalog } from '../src/catalog/index.js';
import { validateCatalogEntry } from '../src/catalog/manifest.js';
import * as debrisgen from '../src/debrisgen/index.js';
import * as lighting from '../src/lighting/index.js';
import * as pathgen from '../src/pathgen/index.js';
import * as propgen from '../src/propgen/index.js';
import * as treeRecipe from '../src/vegetation/treeRecipe.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const entries = catalog.list();
check('catalog has a real library (≥ 50 entries)', entries.length >= 50, `${entries.length}`);
check('every entry validates', entries.every((entry) => validateCatalogEntry(entry).ok));
check('every existing preset family appears',
  ['propgen', 'rockgen', 'debrisgen', 'pathgen', 'water', 'sky', 'lighting', 'post', 'toon']
    .every((cluster) => entries.some((entry) => entry.cluster === cluster)));
check('Call Me Sensei is not catalogued as a Rock or Debris asset',
  !entries.some((entry) => ['rockgen', 'debrisgen'].includes(entry.cluster)
    && /call[-_]me[-_]sensei/.test(entry.id)));
check('Debris exposes Call Me Sensei as a style',
  debrisgen.getDebrisStyleOptions().some((entry) => entry.id === 'call_me_sensei'));
check('Call Me Sensei style composes over every debris preset',
  debrisgen.BUILT_IN_DEBRIS_PRESETS.every((preset) => {
    const styled = debrisgen.applyDebrisStyle(preset.settings, 'call_me_sensei');
    return styled.asset.variant === preset.variant
      && styled.surface.edgeLight === 0.34
      && styled.surface.roughness === 0.88;
  }));

// --- spawn contract across asset clusters -----------------------------------------
const SPAWN_IDS = {
  debrisgen: 'debris/bleached-driftwood',
  propgen: 'prop/lantern/stone-toro',
  rockgen: 'rock/boulder',
};
for (const [cluster, id] of Object.entries(SPAWN_IDS)) {
  try {
    const asset = catalog.spawn(id, { seed: 11 });
    const built = asset.build(11);
    const okShape = Boolean(built.object3D?.isObject3D)
      && Boolean(built.footprint?.radius || built.footprint?.circles?.length)
      && Number.isFinite(built.anchor ?? 0);
    check(`${cluster}: spawn('${id}') → PropAsset builds`, okShape);
    const again = asset.build(11);
    check(`${cluster}: spawn deterministic per seed`, (() => {
      let a = 0;
      let b = 0;
      built.object3D.traverse((o) => { if (o.isMesh) a += o.geometry.attributes.position.count; });
      again.object3D.traverse((o) => { if (o.isMesh) b += o.geometry.attributes.position.count; });
      return a === b && a > 0;
    })());
  } catch (error) {
    check(`${cluster}: spawn('${id}')`, false, error.message);
  }
}

// settings presets refuse to spawn, helpfully
let refused = false;
try {
  catalog.spawn('water/lake');
} catch (error) {
  refused = error.message.includes('snippet');
}
check('settings presets refuse spawn with the snippet', refused);

// --- snippets reference real stable or repository-local exports -------------------------
const stableExportNames = new Set(Object.keys(root));
const localOnlyExportNames = new Set([
  ...Object.keys(debrisgen),
  ...Object.keys(lighting),
  ...Object.keys(pathgen),
  ...Object.keys(propgen),
  ...Object.keys(treeRecipe),
]);
const snippetFunctions = new Set();
for (const entry of entries) {
  for (const match of entry.spawn.matchAll(/([A-Za-z_$][\w$]*)\s*\(/g)) {
    snippetFunctions.add(match[1]);
  }
}
const KNOWN_CONTEXT = new Set(['heightAt', 'entry', 'seed', 'THREE', 'Mesh', 'MeshStandardMaterial', 'loadModelAsset', 'new']);
const unknown = [...snippetFunctions].filter((name) => !stableExportNames.has(name)
  && !localOnlyExportNames.has(name)
  && !KNOWN_CONTEXT.has(name)
  && !['WaterSurface', 'StylizedSky'].includes(name));
check('every snippet function is available from a stable or repository-local module',
  unknown.length === 0, unknown.join(', '));
for (const name of [
  'createPropAssetFromRecipe',
  'createStylizedPathsFromRecipe',
  'propAssetFromObject',
]) {
  check(`pre-beta catalog helper ${name} is absent from the npm root`,
    stableExportNames.has(name) === false);
}

// --- register / addSource seam ----------------------------------------------------------
const isolated = createCatalog();
isolated.register({
  cluster: 'propgen',
  id: 'user/test/lantern',
  kind: 'recipe',
  label: 'Test',
  recipe: catalog.get('prop/lantern/stone-toro').recipe,
  spawn: 'createPropAssetFromRecipe(entry.recipe)',
  tags: ['user'],
});
check('user entries register + list', isolated.list({ tags: ['user'] }).length === 1);
check('user entry spawns', Boolean(isolated.spawn('user/test/lantern').build().object3D));
check('register rejects invalid entries', (() => {
  try {
    isolated.register({ id: 'BAD ID' });
    return false;
  } catch {
    return true;
  }
})());

// addSource against a deterministic in-process fetch fixture. The verifier
// must not require permission to open a listening socket merely to exercise
// URL resolution and remote-registry parsing.
const manifest = JSON.stringify({
  entries: [{
    cluster: 'propgen',
    id: 'remote/prop/bench',
    kind: 'recipe',
    label: 'Remote bench',
    recipe: catalog.get('prop/bench/plank').recipe,
    spawn: 'createPropAssetFromRecipe(entry.recipe)',
    tags: ['remote'],
    thumbnail: 'thumbs/bench.webp',
    version: 1,
  }],
});
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => new Response(manifest, {
  headers: { 'content-type': 'application/json' },
  status: 200,
});
let added;
try {
  added = await isolated.addSource('https://catalog.test/registry.json', {
    name: 'test-remote',
  });
} finally {
  globalThis.fetch = originalFetch;
}
check('addSource mounts remote entries', added === 1
  && isolated.get('remote/prop/bench') !== null);
check('remote thumbnails resolved absolute',
  isolated.get('remote/prop/bench').thumbnail.startsWith('http'));
check('remote entry spawns like a native one',
  Boolean(isolated.spawn('remote/prop/bench').build().object3D));

// --- list/filter behavior ---------------------------------------------------------------
check('tag filter works', catalog.list({ tags: ['shrine'] }).every((entry) => entry.tags.includes('shrine'))
  && catalog.list({ tags: ['shrine'] }).length >= 2);
check('text search works', catalog.list({ text: 'lantern' }).length >= 2);
check('cluster filter works', catalog.list({ cluster: 'rockgen' }).length >= 10);

console.log(failures === 0 ? '\nverify-catalog: all checks passed' : `\nverify-catalog: ${failures} failure(s)`);
process.exit(failures === 0 ? 0 : 1);
