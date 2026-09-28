import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  BETA_LAB_GROUPS,
  BETA_LABS_SHOWCASE,
} from '../labs/home/labsShowcase.js';
import {
  LIVE_LAB_DOCUMENTATION,
  liveLabDocumentationHref,
} from '../labs/shared/liveLabDocumentation.js';
import { parseStyleBundleDocument, resolveStyleBundleSettings } from '../src/styles/index.js';
import { parseToonPresetDocument } from '../src/toon/index.js';
import { parseGroundShaderPresetDocument } from '../src/ground-shader/index.js';
import { validateTextureRecipeDocument } from '../src/texgen/index.js';

const EXPECTED_BETA_IDS = Object.freeze([
  'shader',
  'tree-shader',
  'grass-shader',
  'flower-shader',
  'rock-shader',
  'terrain-shader',
  'manufactured-material',
  'water',
  'sky',
  'cloud-shader',
  'sky-cloud',
  'rock',
  'tree',
  'grass',
  'texture',
]);

class MemoryStorage {
  #values = new Map();

  clear() { this.#values.clear(); }

  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }

  removeItem(key) { this.#values.delete(key); }

  setItem(key, value) { this.#values.set(String(key), String(value)); }
}

const localStorage = new MemoryStorage();
const location = {
  href: 'https://labs.toonlab.test/',
  pathname: '/',
  search: '',
};
globalThis.location = location;
globalThis.document = { body: { dataset: {} } };
globalThis.window = {
  addEventListener() {},
  dispatchEvent() {},
  history: { replaceState() {} },
  localStorage,
  location,
  removeEventListener() {},
};

const [
  { createCharacterShaderStore },
  { createGroundShaderLabStore },
  { createTextureStore },
] = await Promise.all([
  import('../labs/shader-lab/ui/store.js'),
  import('../labs/ground-shader-lab/ui/store.js'),
  import('../labs/texture-lab/store/textureStore.js'),
]);

const sceneHubSource = await readFile(new URL('../labs/shared/sceneHub.js', import.meta.url), 'utf8');
const entryChooserSource = await readFile(
  new URL('../labs/shared/ui/components/LabEntryChooser.jsx', import.meta.url),
  'utf8',
);
const primitivesSource = await readFile(
  new URL('../labs/shared/ui/components/primitives.jsx', import.meta.url),
  'utf8',
);
const chromeSource = await readFile(
  new URL('../labs/shared/ui/components/LabChrome.jsx', import.meta.url),
  'utf8',
);
const [walkableTreeSource, walkableVegetationSource, walkableWaterSource] = await Promise.all([
  readFile(new URL('../labs/playground/scenes/toonlabBroadleaf.js', import.meta.url), 'utf8'),
  readFile(new URL('../labs/playground/scenes/vegetation.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../labs/playground/scenes/waterScenes.jsx', import.meta.url), 'utf8'),
]);
const walkableCharacterHudSource = await readFile(
  new URL('../labs/playground/characterHud.js', import.meta.url),
  'utf8',
);

let checks = 0;
function check(label, callback) {
  callback();
  checks += 1;
  console.log(`ok   ${label}`);
}

check('the first public release exposes the exact approved 15 Beta Labs', () => {
  assert.deepEqual(BETA_LABS_SHOWCASE.map((entry) => entry.id), EXPECTED_BETA_IDS);
  assert.equal(new Set(BETA_LABS_SHOWCASE.map((entry) => entry.href)).size, 15);
  assert.ok(BETA_LABS_SHOWCASE.every((entry) => entry.labStatus === 'beta'));
  assert.ok(BETA_LABS_SHOWCASE.every((entry) => entry.href && entry.npm));
});

check('the walkable reference uses solid per-tree colors from one curated palette', () => {
  assert.match(walkableTreeSource, /WALKABLE_CALL_ME_SENSEI_TREE_COLORS\s*=\s*Object\.freeze/);
  assert.match(
    walkableTreeSource,
    /WALKABLE_CALL_ME_SENSEI_CANOPY_COLOR\s*=\s*\n?\s*WALKABLE_CALL_ME_SENSEI_TREE_COLORS\.meadow/,
  );
  assert.match(
    walkableTreeSource,
    /resolvedCanopyColor\s*=\s*canopyColor\s*\?\?\s*WALKABLE_CALL_ME_SENSEI_CANOPY_COLOR/,
  );
  assert.match(walkableTreeSource, /crown:\s*resolvedCanopyColor/);
  assert.match(walkableTreeSource, /lit:\s*resolvedCanopyColor/);
  assert.match(walkableTreeSource, /shadow:\s*resolvedCanopyColor/);
  assert.match(walkableTreeSource, /cardVariationStrength:\s*0/);
  assert.match(walkableTreeSource, /hueVariation:\s*0/);
  assert.match(walkableTreeSource, /spriteLuminanceStrength:\s*0/);
  assert.match(walkableTreeSource, /mode:\s*'solid-per-tree'/);
  assert.match(walkableVegetationSource, /canopyColor:\s*WALKABLE_CALL_ME_SENSEI_TREE_COLORS\./,
    'showcase trees must select their own palette entry');
  assert.match(walkableWaterSource, /canopyColor=\{WALKABLE_CALL_ME_SENSEI_TREE_COLORS\./,
    'water-scene trees must select their own palette entry');
  assert.doesNotMatch(walkableWaterSource, /canopyColor=['"]#/,
    'placements must use the shared curated palette instead of raw colors');
});

check('the walkable horizon composes catalog cliffs instead of enlarging backdrop slabs', () => {
  const horizonContract = walkableWaterSource.match(
    /const HORIZON_CLIFF_FORMATIONS[\s\S]*?const HORIZON_CLIFF_PARTS/,
  )?.[0] ?? '';
  assert.match(horizonContract, /id:\s*'west-cliffs'/);
  assert.match(horizonContract, /id:\s*'mountain-spine'/);
  assert.match(horizonContract, /id:\s*'east-cliffs'/);
  assert.match(horizonContract, /rock-0303/);
  assert.match(horizonContract, /rock-0118/);
  assert.match(horizonContract, /rock-0024/);
  assert.doesNotMatch(horizonContract, /rock-0468|rock-0469|rock-0471|rock-0480/);
  assert.doesNotMatch(horizonContract, /maxLodLevel:\s*0/,
    'background geology must retain catalog distance LODs');
  assert.match(walkableWaterSource, /horizonMountainConstruction\s*=\s*'catalog-cliff-composition'/);
});

check('the walkable character never inherits a stale shader diagnostic', () => {
  assert.match(
    walkableCharacterHudSource,
    /const initialDebug = URL_PARAMS\.get\('toonDebug'\) \|\| 'off';/,
    'mount must explicitly write the off mode after a debug query is removed',
  );
  assert.match(walkableCharacterHudSource, /applyDebugMode\(initialDebug\);/);
  assert.doesNotMatch(walkableCharacterHudSource, /if \(initialDebug !== 'off'\)/);
  assert.match(
    walkableCharacterHudSource,
    /return \(\) => \{[\s\S]*?setToonDebugOutput\(modelRoot, 'off'\);/,
    'unmount must leave reusable character materials in production mode',
  );
});

check('every live Lab has complete shared documentation and an editor Help entry', () => {
  assert.deepEqual(LIVE_LAB_DOCUMENTATION.map((entry) => entry.id), EXPECTED_BETA_IDS);
  for (const entry of LIVE_LAB_DOCUMENTATION) {
    assert.ok(entry.summary && entry.artifact && entry.creationType && entry.runtime, `${entry.id} documents its contract`);
    assert.ok(entry.workflow.length >= 3, `${entry.id} documents its workflow`);
    assert.ok(entry.controls.length >= 3, `${entry.id} documents its controls`);
    assert.ok(entry.previewOnly.length >= 1, `${entry.id} documents its preview boundary`);
  }
  assert.match(chromeSource, /id:\s*'help'/);
  assert.match(chromeSource, /label:\s*copy\.help/);
  assert.match(chromeSource, /label:\s*copy\.documentation/);
  assert.equal(
    liveLabDocumentationHref({ pathname: '/labs/rock' }),
    '/docs/labs#rock',
  );
  assert.equal(
    liveLabDocumentationHref({ pathname: '/rock-lab/' }),
    '/docs/#/labs/rock',
  );
});

check('Beta cards are grouped only by product type', () => {
  assert.deepEqual(BETA_LAB_GROUPS.map((group) => group.id), [
    'shaders',
    'asset-generation',
    'source-texture-generation',
  ]);
  assert.deepEqual(
    BETA_LAB_GROUPS.flatMap((group) => group.entries.map((entry) => entry.id)),
    EXPECTED_BETA_IDS,
  );
});

check('public Lab switchers expose only the approved release inventory', () => {
  const publicIdsSource = sceneHubSource.match(
    /const PUBLIC_SCENE_HUB_IDS = Object\.freeze\(\[([\s\S]*?)\]\);/,
  )?.[1] ?? '';
  const publicIds = [...publicIdsSource.matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(publicIds, [
    'home',
    'character',
    'treeShaderLab',
    'grassShaderLab',
    'flowerShaderLab',
    'rockShaderLab',
    'groundShaderLab',
    'manufacturedMaterialLab',
    'waterLab',
    'skyLab',
    'cloudShaderLab',
    'skyCloudLab',
    'rockLab',
    'treeLab',
    'grassLab',
    'textureLab',
  ]);
  assert.match(sceneHubSource, /PUBLIC_SCENE_HUB_IDS\.map\(\(id\) => SCENE_HUB_OPTIONS\.find/);
});

const PUBLIC_LAB_SOURCES = Object.freeze([
  ['Character Shader', ['labs/shader-lab/ui/App.jsx', 'labs/shader-lab/ui/engine.js']],
  ['Tree, Grass, and Flower Shaders', ['labs/vegetation-shader-lab/ui/App.jsx', 'labs/vegetation-shader-lab/ui/engine.js']],
  ['Rock Shader', ['labs/rock-shader-lab/ui/App.jsx', 'labs/rock-shader-lab/ui/engine.js']],
  ['Terrain & Ground Shader', ['labs/ground-shader-lab/ui/App.jsx', 'labs/ground-shader-lab/ui/engine.js']],
  ['Manufactured Surface Shader', ['labs/manufactured-material-lab/ui/App.jsx', 'examples/urban-prop-shader/main.js']],
  ['Water Shader', ['labs/water-lab/ui/App.jsx', 'labs/water-lab/engine/waterLabEngine.js']],
  ['Sky, Cloud, and Sky & Cloud', ['labs/sky-cloud-lab/ui/App.jsx', 'labs/sky-cloud-lab/ui/engine.js']],
  ['Rock Generation', ['labs/rock-generation-lab/ui/App.jsx', 'labs/rock-generation-lab/ui/engine.js']],
  ['Tree & Shrub Generation', ['labs/tree-lab/ui/App.jsx', 'labs/tree-lab/ui/screens/GalleryScreen.jsx', 'labs/tree-lab/engine/engine.js']],
  ['Grass & Groundcover Generation', ['labs/grass-lab/ui/App.jsx', 'labs/grass-lab/ui/engine.js']],
  ['Texture', ['labs/texture-lab/ui/App.jsx', 'labs/texture-lab/ui/GalleryScreen.jsx', 'labs/texture-lab/engine/textureEngine.js']],
]);

const publicLabSourceText = await Promise.all(PUBLIC_LAB_SOURCES.map(async ([label, paths]) => [
  label,
  (await Promise.all(paths.map((path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8')))).join('\n'),
]));

check('every public Lab exposes the common authoring and navigation contract', () => {
  for (const [label, source] of publicLabSourceText) {
    assert.match(source, /BrandLockup/, `${label} must show the ToonLab logo`);
    assert.match(source, /Save As|saveAs/, `${label} must support Save As`);
    assert.match(source, /Update|update/, `${label} must support targeted Update`);
    assert.match(source, /LabEntryChooser|SearchSelect|type=["']search["']|Search /, `${label} must expose searchable entries`);
    assert.match(source, /Export|export/, `${label} must expose its runtime asset or style export`);
    assert.match(source, /Rotate|rotate/i, `${label} must expose rotate navigation`);
    assert.match(source, /Pan|pan/i, `${label} must expose pan navigation`);
    assert.match(source, /Zoom|zoom/i, `${label} must expose zoom navigation`);
    assert.match(source, /title=|description|Info/, `${label} must explain its features inline`);
  }
});

const EDITOR_FIRST_LAB_APPS = Object.freeze([
  ['Character Shader', 'labs/shader-lab/ui/App.jsx'],
  ['Tree, Grass, and Flower Shaders', 'labs/vegetation-shader-lab/ui/App.jsx'],
  ['Rock Shader', 'labs/rock-shader-lab/ui/App.jsx'],
  ['Terrain & Ground Shader', 'labs/ground-shader-lab/ui/App.jsx'],
  ['Manufactured Surface Shader', 'labs/manufactured-material-lab/ui/App.jsx'],
  ['Water Shader', 'labs/water-lab/ui/App.jsx'],
  ['Sky, Cloud, and Sky & Cloud', 'labs/sky-cloud-lab/ui/App.jsx'],
  ['Grass & Groundcover Generation', 'labs/grass-lab/ui/App.jsx'],
]);
const editorFirstLabSourceText = await Promise.all(EDITOR_FIRST_LAB_APPS.map(async ([label, path]) => [
  label,
  await readFile(new URL(`../${path}`, import.meta.url), 'utf8'),
]));

check('editor-first Labs require an explicit Continue, New, or Open choice', () => {
  assert.match(entryChooserSource, /Back to Labs|backToLabs/, 'the blocking chooser must let users return to Labs');
  assert.match(entryChooserSource, /labsHomeHref\(\)/, 'the exit must resolve correctly in OSS and Pro');
  assert.doesNotMatch(primitivesSource, /<datalist/, 'searchable entry pickers must use the styled listbox');
  assert.match(primitivesSource, /role="listbox"/, 'searchable entry pickers must expose a real listbox');
  for (const [label, source] of editorFirstLabSourceText) {
    assert.match(source, /LabEntryChooser/, `${label} must use the shared entry chooser`);
    assert.match(source, /onContinue/, `${label} must expose Continue`);
    assert.match(source, /onCreate/, `${label} must expose New`);
    assert.match(source, /onOpenEntry/, `${label} must expose searchable Open`);
  }
});

check('Sky style switching uses a desktop document menu and deliberate dialogs', () => {
  const skySource = editorFirstLabSourceText.find(([label]) => label.startsWith('Sky'))?.[1] ?? '';
  assert.match(skySource, /Open style…/);
  assert.match(skySource, /sky-open-style-dialog/);
  assert.match(skySource, /sky-style-open/);
  assert.match(skySource, /Recent/);
  assert.match(skySource, /savedStyles\.slice\(0, 5\)/);
  assert.match(skySource, /sky-delete-style-dialog/);
  assert.match(skySource, /sky-export-dialog/);
  assert.match(skySource, /StyleBundleExportPrompt/);
  assert.doesNotMatch(skySource, /id:\s*['"]export['"]/, 'Export must not be a workflow-rail tab');
  assert.doesNotMatch(
    skySource,
    /<SearchSelect[\s\S]{0,400}onChange=\{\(id\) => \{\s*actions\.openStyle/,
    'the searchable browser must stage a selection until explicit Open',
  );
});

check('style export dialogs can hand off to the complete Style Bundle builder', () => {
  assert.match(chromeSource, /Want to export the whole style as a bundle\?/);
  assert.match(chromeSource, /characters, trees, grass, flowers, rocks, ground/);
  assert.match(chromeSource, /Open Style Bundle builder|openStyleBundle/);
  assert.match(chromeSource, /window\.location\.pathname\.startsWith\('\/labs'\) \? '\/styles' : '\/styles\/'/);
  for (const [label, source] of editorFirstLabSourceText.slice(0, 7)) {
    assert.match(source, /StyleBundleExportPrompt/, `${label} must link its export dialog to the whole-style builder`);
    assert.match(source, /ExportDialog|sky-export-dialog/, `${label} must export through a dedicated dialog`);
  }
});

check('shader Labs switch documents through a style browser, not an inspector Style dropdown', () => {
  for (const [label, source] of editorFirstLabSourceText) {
    if (label === 'Grass & Groundcover Generation') continue;
    assert.doesNotMatch(
      source,
      /<PresetRowShell\s+label=["']Style["']|testId=["']style-select["']|testId=["']saved-style-search["']/,
      `${label} must route style switching through its browser/home action`,
    );
  }
});

const [rockHomeSource, plantHomeSource, textureHomeSource] = await Promise.all([
  readFile(new URL('../labs/rock-generation-lab/ui/App.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../labs/tree-lab/ui/screens/GalleryScreen.jsx', import.meta.url), 'utf8'),
  readFile(new URL('../labs/texture-lab/ui/GalleryScreen.jsx', import.meta.url), 'utf8'),
]);

check('generation Labs with real homes keep those homes as the ordinary front door', () => {
  const [rockSource, plantSource, textureSource] = [rockHomeSource, plantHomeSource, textureHomeSource];
  assert.match(rockSource, /RockHome/);
  assert.match(plantSource, /GalleryScreen/);
  assert.match(textureSource, /GalleryScreen/);
});

check('Character Shader supports Save As, targeted Update, reload, and runtime bundle export', () => {
  localStorage.clear();
  const store = createCharacterShaderStore({ urlParams: new URLSearchParams() });
  const saved = store.actions.savePresetAs('Release character style');
  assert.equal(saved.ok, true, saved.errors?.join(' '));
  const id = store.getState().presetId;
  assert.ok(id);
  assert.equal(store.actions.updatePreset('Release character style v2').ok, true);
  assert.equal(parseToonPresetDocument(store.actions.exportDocument()).ok, true);
  const bundle = parseStyleBundleDocument(store.actions.exportStyleBundle());
  assert.equal(bundle.ok, true, bundle.errors?.join(' '));
  assert.ok(resolveStyleBundleSettings(bundle.value).toon);

  const reloaded = createCharacterShaderStore({ urlParams: new URLSearchParams() });
  assert.ok(reloaded.getState().localPresets.some((entry) => entry.id === id));
  reloaded.actions.applyPreset(id);
  assert.equal(reloaded.getState().name, 'Release character style v2');
});

check('Ground Shader supports Save As, targeted Update, reload, search data, and runtime bundle export', () => {
  localStorage.clear();
  const store = createGroundShaderLabStore({ urlParams: new URLSearchParams() });
  assert.equal(store.actions.saveStyleAs('Release ground style').ok, true);
  const id = store.getState().presetId;
  assert.equal(store.actions.updateStyle('Release ground style v2').ok, true);
  assert.equal(parseGroundShaderPresetDocument(store.actions.exportDocument()).ok, true);
  const bundle = parseStyleBundleDocument(store.actions.exportStyleBundle());
  assert.equal(bundle.ok, true, bundle.errors?.join(' '));
  assert.ok(resolveStyleBundleSettings(bundle.value).groundShader);

  const reloaded = createGroundShaderLabStore({ urlParams: new URLSearchParams() });
  assert.ok(reloaded.getState().localPresets.some((entry) => entry.id === id));
  reloaded.actions.applyPreset(id);
  assert.equal(reloaded.getState().name, 'Release ground style v2');
});

check('Texture Lab opens on its searchable home and preserves editable recipes', () => {
  assert.match(textureHomeSource, /data-testid="texture-home-screen"/);
  assert.match(textureHomeSource, /Current editable draft/);
  assert.match(textureHomeSource, /Saved textures/);
  assert.match(textureHomeSource, /Create a texture/);
  assert.match(textureHomeSource, /Authored material library/);
  assert.match(textureHomeSource, /Search texture presets/);
  localStorage.clear();
  const store = createTextureStore({ urlParams: new URLSearchParams() });
  assert.equal(store.getState().view.gallery, true);
  assert.equal(store.actions.savePresetAs('Release texture').ok, true);
  const id = store.getState().presetId;
  assert.equal(store.actions.updatePreset('Release texture v2').ok, true);
  assert.equal(validateTextureRecipeDocument(store.actions.getRecipeDocument()).ok, true);

  const reloaded = createTextureStore({ urlParams: new URLSearchParams() });
  assert.equal(reloaded.actions.applyPreset(id), true);
  assert.equal(reloaded.getState().name, 'Release texture v2');
  assert.equal(reloaded.getState().view.gallery, false,
    'opening a selected texture leaves the home screen and enters its editor');
});

console.log(`\nPublic Lab authoring verified: ${checks} contract groups.`);
