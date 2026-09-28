import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const editorApps = [
  'atmospheric-condition-lab',
  'building-lab',
  'debris-lab',
  'environment-lab',
  'fbx-lab',
  'grass-lab',
  'ground-shader-lab',
  'landscape-lab',
  'manufactured-material-lab',
  'prop-lab',
  'rock-generation-lab',
  'rock-shader-lab',
  'shader-lab',
  'sky-atmosphere-source-lab',
  'sky-cloud-lab',
  'texture-lab',
  'transparent-shader-lab',
  'tree-lab',
  'vegetation-shader-lab',
  'vfx-lab',
  'water-lab',
];

for (const lab of editorApps) {
  const source = await readFile(new URL(`../labs/${lab}/ui/App.jsx`, import.meta.url), 'utf8');
  assert.match(source, /LabEditorHeader/, `${lab} must use the shared two-row editor header`);
}

const chrome = await readFile(new URL('../labs/shared/ui/components/LabChrome.jsx', import.meta.url), 'utf8');
const kit = await readFile(new URL('../labs/shared/ui/kit.css', import.meta.url), 'utf8');
const tokens = await readFile(new URL('../labs/shared/ui/tokens.css', import.meta.url), 'utf8');
assert.match(chrome, /label: getCopy\(\)\.file/);
assert.match(chrome, /label: getCopy\(\)\.edit/);
assert.match(chrome, /label: getCopy\(\)\.view/);
assert.match(kit, /\.tk-lab-editor-header__commands/);
assert.match(tokens, /--topbar-h: 76px/);

console.log(`Shared two-row File/Edit/View header verified across ${editorApps.length} lab editor shells.`);
