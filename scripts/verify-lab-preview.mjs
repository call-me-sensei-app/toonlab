import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  DEFAULT_LAB_PREVIEW_ENVIRONMENT,
  LAB_PREVIEW_ENVIRONMENT_TYPE,
  LAB_PREVIEW_ENVIRONMENT_VERSION,
  LAB_PREVIEW_REFERENCE_STATES,
  LAB_PREVIEW_TIME_PRESETS,
  createLabPreviewEnvironment,
  formatLabPreviewHour,
  labPreviewPresetForHour,
  referenceLabPreviewState,
  sampleLabPreviewReferenceState,
} from '../labs/shared/previewEnvironmentContract.js';
import {
  DEMOS_SHOWCASE,
  LABS_SHOWCASE,
} from '../labs/home/labsShowcase.js';
import { DEFAULT_RAMP_SETTINGS } from '../src/toon/settings/rampSettings.js';

assert.equal(LAB_PREVIEW_ENVIRONMENT_TYPE, 'toonlab/lab-preview-environment');
assert.equal(LAB_PREVIEW_ENVIRONMENT_VERSION, 1);
assert.deepEqual(
  LAB_PREVIEW_TIME_PRESETS.map(({ hour, id }) => [id, hour]),
  [['dawn', 6], ['day', 13], ['sunset', 18], ['night', 22]],
);
assert.equal(DEFAULT_LAB_PREVIEW_ENVIRONMENT.hour, 13);
assert.equal(labPreviewPresetForHour(13), 'day');
assert.equal(labPreviewPresetForHour(18), 'sunset');
assert.equal(labPreviewPresetForHour(22), 'night');
assert.equal(createLabPreviewEnvironment({ hour: 25 }).hour, 1);
assert.equal(createLabPreviewEnvironment({ hour: -1 }).hour, 23);
assert.equal(referenceLabPreviewState(13).shadowTint, LAB_PREVIEW_REFERENCE_STATES.day.shadowTint);
assert.equal(sampleLabPreviewReferenceState(13).shadowTint, '#647fbd');
assert.equal(formatLabPreviewHour(13.25), '13:15');
assert.equal(formatLabPreviewHour(24), '00:00');

function rgbFromHex(value) {
  const hex = String(value).replace('#', '');
  return [
    Number.parseInt(hex.slice(0, 2), 16) / 255,
    Number.parseInt(hex.slice(2, 4), 16) / 255,
    Number.parseInt(hex.slice(4, 6), 16) / 255,
  ];
}

const dayShadow = rgbFromHex(LAB_PREVIEW_REFERENCE_STATES.day.shadowTint);
assert.ok(dayShadow[2] > dayShadow[0], 'Reference daylight shadow must be visibly blue/cool.');
assert.ok(dayShadow[2] - dayShadow[0] >= 0.2, 'Reference daylight blue relationship must be material.');

for (const lab of [...LABS_SHOWCASE, ...DEMOS_SHOWCASE]) {
  assert.equal(
    lab.previewContract,
    'toonlab/lab-preview-environment@1',
    `${lab.id} must require the universal time-of-day preview.`,
  );
}

// Rock and Ground use a first-party procedural shader range. Tree, Grass,
// and Flower use an asset-clean procedural garden with the same universal
// time controls and preview-only persistence boundary.
const timeControl = await readFile(
  new URL('../labs/shared/ui/components/LabTimeOfDayControl.jsx', import.meta.url),
  'utf8',
);
const sharedPreviewStyles = await readFile(
  new URL('../labs/shared/shader-preview/previewStyles.js', import.meta.url),
  'utf8',
);
const sharedPreviewStylesModal = await readFile(
  new URL('../labs/shared/shader-preview/PreviewStylesModal.jsx', import.meta.url),
  'utf8',
);
const proceduralPreviewScene = await readFile(
  new URL('../labs/shared/shader-preview/proceduralScene.js', import.meta.url),
  'utf8',
);
const rockApp = await readFile(
  new URL('../labs/rock-shader-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const rockEngine = await readFile(
  new URL('../labs/rock-shader-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const rockStore = await readFile(
  new URL('../labs/rock-shader-lab/ui/store.js', import.meta.url),
  'utf8',
);
const groundApp = await readFile(
  new URL('../labs/ground-shader-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const groundEngine = await readFile(
  new URL('../labs/ground-shader-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const groundStore = await readFile(
  new URL('../labs/ground-shader-lab/ui/store.js', import.meta.url),
  'utf8',
);
const vegetationApp = await readFile(
  new URL('../labs/vegetation-shader-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const vegetationEngine = await readFile(
  new URL('../labs/vegetation-shader-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const vegetationStore = await readFile(
  new URL('../labs/vegetation-shader-lab/ui/store.js', import.meta.url),
  'utf8',
);
assert.match(timeControl, /max=\{24\}/);
assert.match(timeControl, /min=\{0\}/);
assert.match(timeControl, /LAB_PREVIEW_TIME_PRESETS/);
assert.match(timeControl, /preview-time-autocycle/);

for (const [label, app, engine, store, authoredPattern] of [
  ['Rock', rockApp, rockEngine, rockStore, /authoredComponent: 'rock'/],
  ['Ground', groundApp, groundEngine, groundStore, /authoredComponent: 'ground'/],
]) {
  assert.match(app, /LabTimeOfDayControl/, `${label} must expose shared time controls.`);
  assert.match(app, /ShaderPreviewStylesModal/, `${label} must expose shared preview styles.`);
  assert.match(app, /testId="preview-styles"/, `${label} must expose one preview-settings button.`);
  assert.match(engine, /createShaderPreviewScene/, `${label} must use the first-party procedural scene.`);
  assert.match(engine, authoredPattern, `${label} must protect its authored component.`);
  assert.match(engine, /previewScene\.applyTime\(/, `${label} must apply shared preview time.`);
  assert.match(engine, /previewAutoCycle/, `${label} must support preview time cycling.`);
  assert.match(store, /previewHour: 13/, `${label} must start from the accepted Day state.`);
  assert.match(store, /preview: createShaderPreviewSettings/, `${label} must use shared preview settings.`);
  assert.doesNotMatch(
    store.match(/function persist\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '',
    /previewHour|previewAutoCycle|preview:/,
    `${label} preview scene, styles, and time must not enter its shader draft.`,
  );
  assert.doesNotMatch(engine, /shared\/p18|assets-local/i,
    `${label} must not retain third-party reference dependencies.`);
}

assert.match(vegetationApp, /LabTimeOfDayControl/);
assert.match(vegetationApp, /VegetationPreviewStylesModal/);
assert.match(vegetationApp, /testId="preview-styles"/);
assert.doesNotMatch(vegetationApp, /P18|p18|retainedGrassShader/);
assert.match(vegetationEngine, /createLabRenderer/);
assert.match(vegetationEngine, /createCallMeSenseiGrassField/);
assert.match(vegetationEngine, /groundAdoptStrength:\s*1/);
assert.match(vegetationEngine, /ground_adoption_zones/);
assert.match(vegetationEngine, /createPlantFromRecipe/);
assert.match(vegetationEngine, /sampleLabPreviewReferenceState/);
assert.match(vegetationEngine, /previewAutoCycle/);
assert.doesNotMatch(vegetationEngine, /P18|p18|referenceScene|retainedGrassShader/);
assert.match(vegetationStore, /previewHour: 13/);
assert.match(vegetationStore, /preview: createVegetationPreviewSettings/);
assert.doesNotMatch(
  vegetationStore.match(/function persist\(\) \{([\s\S]*?)\n  \}/)?.[1] ?? '',
  /previewHour|previewAutoCycle|preview:/,
  'Vegetation preview scene, styles, and time must not enter its shader draft.',
);

assert.match(proceduralPreviewScene, /createRockDocument/);
assert.match(proceduralPreviewScene, /meshDocument/);
assert.match(proceduralPreviewScene, /createCallMeSenseiGrassField/);
assert.match(proceduralPreviewScene, /new StylizedTree/);
assert.match(proceduralPreviewScene, /new StylizedFlowerField/);
assert.match(proceduralPreviewScene, /buildProp/);
assert.match(proceduralPreviewScene, /SkySystem\.create/);
assert.match(proceduralPreviewScene, /toonlab-natural-meadow/);
assert.match(proceduralPreviewScene, /function createGroundField/);
assert.match(proceduralPreviewScene, /new THREE\.DataTexture/);
assert.doesNotMatch(
  proceduralPreviewScene,
  /ConeGeometry|OctahedronGeometry|IcosahedronGeometry|new THREE\.SphereGeometry/,
  'Rock and Ground must not ship geometric stand-ins for vegetation, trees, props, sky, or clouds.',
);
assert.doesNotMatch(proceduralPreviewScene, /GLTFLoader|assets-local/i);
assert.match(rockEngine, /rockTextureSource/);
assert.match(groundEngine, /previewScene\.groundField/);
assert.match(vegetationEngine, /applyVegetationShaderScope/);
assert.match(vegetationEngine, /view\.viewMode === 'isolate'/);
assert.match(vegetationEngine, /toonlab-procedural-garden/);
assert.match(sharedPreviewStylesModal, /testId="preview-styles-modal"/);
assert.match(sharedPreviewStylesModal, /Style bundle/);
assert.match(sharedPreviewStylesModal, /From bundle/);
assert.match(sharedPreviewStyles, /bundle: 'call_me_sensei'/);
for (const componentId of [
  'rock',
  'ground',
  'grass',
  'tree',
  'flowers',
  'manufacturedProps',
  'sky',
  'clouds',
  'lighting',
]) {
  assert.match(
    sharedPreviewStyles,
    new RegExp(`(?:id: '${componentId}'|${componentId}: 'call_me_sensei')`),
    `Shader preview must expose a ${componentId} style assignment.`,
  );
}
assert.ok(
  DEFAULT_RAMP_SETTINGS.tone.cloth[2] > DEFAULT_RAMP_SETTINGS.tone.cloth[0],
  'Character Shader default cloth shadow tone must be cool/blue.',
);

const previewDocs = await readFile(new URL('../docs/lab-preview-environment.md', import.meta.url), 'utf8');
const liveLabs = await readFile(new URL('../docs/live-labs.md', import.meta.url), 'utf8');
assert.match(previewDocs, /Dawn \(06:00\), Day \(13:00\), Sunset \(18:00\), and Night \(22:00\)/);
assert.match(previewDocs, /#647fbd/);
assert.match(previewDocs, /shadows[\s\S]*blue\/cool relationship/);
assert.match(previewDocs, /Rock Shader Lab/);
assert.match(previewDocs, /isolation mode/);
assert.match(liveLabs, /Preview cameras, stages, lights, playback, and comparison/);

console.log(
  `${LABS_SHOWCASE.length} live Labs and ${DEMOS_SHOWCASE.length} user examples ` +
  'require the shared 24-hour preview; comparison and procedural shader-lab scenes verified.',
);
