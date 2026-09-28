import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';

import {
  BETA_LAB_GROUPS,
  BETA_LABS_SHOWCASE,
  IN_PROGRESS_LABS_SHOWCASE,
  LABS_SHOWCASE,
} from '../labs/home/labsShowcase.js';
import { LIVE_LAB_DOCUMENTATION } from '../labs/shared/liveLabDocumentation.js';

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const liveDocs = await readFile(new URL('../docs/live-labs.md', import.meta.url), 'utf8');
const architecture = await readFile(new URL('../docs/lab-architecture.md', import.meta.url), 'utf8');
const homeSource = await readFile(new URL('../labs/home/main.js', import.meta.url), 'utf8');
const homeHtml = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const viteConfig = await readFile(new URL('../vite.config.js', import.meta.url), 'utf8');

const EXPECTED_LAB_IDS = Object.freeze([
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

assert.equal(LABS_SHOWCASE.length, 15);
assert.equal(BETA_LABS_SHOWCASE.length, 15);
assert.equal(IN_PROGRESS_LABS_SHOWCASE.length, 0);
assert.deepEqual(LABS_SHOWCASE.map((entry) => entry.id), EXPECTED_LAB_IDS);
assert.deepEqual(LIVE_LAB_DOCUMENTATION.map((entry) => entry.id), EXPECTED_LAB_IDS);
assert.equal(new Set(LABS_SHOWCASE.map((entry) => entry.href)).size, 15);

for (const lab of LABS_SHOWCASE) {
  assert.equal(lab.labStatus, 'beta');
  assert.equal(lab.libraryStatus, 'beta');
  assert.ok(lab.href);
  assert.ok(lab.npm.startsWith('@call-me-sensei/toonlab/'));
  const exportSuffix = lab.npm.slice('@call-me-sensei/toonlab'.length);
  assert.ok(packageJson.exports[`.${exportSuffix}`], `${lab.id} needs export .${exportSuffix}`);
  const pathname = new URL(lab.href, 'https://toonlab.invalid').pathname;
  await access(new URL(`..${pathname}index.html`, import.meta.url));
}

assert.deepEqual(BETA_LAB_GROUPS.map((group) => group.id), [
  'shaders',
  'asset-generation',
  'source-texture-generation',
]);
assert.deepEqual(
  BETA_LAB_GROUPS.flatMap((group) => group.entries.map((entry) => entry.id)),
  EXPECTED_LAB_IDS,
);

for (const lab of LIVE_LAB_DOCUMENTATION) {
  assert.match(liveDocs, new RegExp(lab.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(liveDocs, new RegExp(lab.creationType.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.match(liveDocs, /Stylized rock catalog/);
assert.match(liveDocs, /without a physical template/);
assert.match(liveDocs, /Template-based procedural generation/);
assert.match(architecture, /fifteen user-facing Labs|15 live ToonLab Labs/);
assert.doesNotMatch(homeHtml, /In Progress|roadmap|data-in-progress-lab-count/);
assert.doesNotMatch(homeSource, /IN_PROGRESS_LABS_SHOWCASE|renderProgressList/);
for (const lab of LABS_SHOWCASE) {
  assert.match(viteConfig, new RegExp(`resolve\\(__dirname, '${lab.href.slice(1)}index\\.html'\\)`));
}
console.log('The public Labs navigation contains exactly 15 user-facing Labs without removing other buildable tools.');
