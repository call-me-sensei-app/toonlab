// Water settings/schema/preset-document verification — the contracts the
// standalone Water Lab builds on: the field schema covers the defaults, the
// grouped schema plugs into SchemaGroup, preset documents round-trip, and
// registration feeds the preset picker. Run: node scripts/verify-watergen.mjs

import process from 'node:process';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';

import {
  DEFAULT_WATER_SETTINGS,
  WATER_COLOR_TONES,
  WATER_PRESET_NAMES,
  WATER_SCENE_OVERRIDE_KEYS,
  WATER_SCENE_OVERRIDE_PRIORITIES,
  WATER_SETTING_FIELD_SCHEMA,
  WATER_SETTING_FIELD_SCHEMA_BY_GROUP,
  WATER_SETTING_GROUPS,
  buildGerstnerWaves,
  computeBreakingDepth,
  createWaterShoreMaterial,
  createWaterPresetDocument,
  createWaterSettings,
  extractBreakLineChains,
  getWaterPresetOptions,
  getWaterStyleOptions,
  parseWaterPresetDocument,
  rebaseWaterSettingsStyle,
  registerSerializedWaterPreset,
  sampleGerstnerSwellHeight,
  samplePrimarySwellCycle,
  samplePrimarySwellSequence,
  sampleSwashCycleVariation,
  sampleSwashDistance,
  sampleSwashEdgeOffset,
  sampleSwashEventShape,
  sampleSwashFrameState,
  sanitizeWaterPresetSettings,
  serializeWaterPreset,
  shapeSwashProgress,
  shouldUseDedicatedBreakerShell,
  validateWaterPresetDocument,
  WaterShoreStateField,
  WaterScenePasses,
  WaterSurface,
  updateWaterShoreMaterial,
  resolveWaterUnderwaterAtmosphereState,
  WaterUnderwaterAtmosphere,
} from '../src/water/index.js';
import { beachBedHeight } from '../labs/water-lab/engine/waterLabEngine.js';
import {
  BEACH_DIRECTION_SPREAD,
  BEACH_RUNUP_DISTANCE,
  BEACH_WATER_LEVEL,
  BEACH_WAVE_SPEED,
  waterStageOverrides,
} from '../labs/water-lab/store/waterStageSettings.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) console.log(`ok   ${label}`);
  else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

// --- schema coverage -----------------------------------------------------------
const schemaKeys = Object.keys(WATER_SETTING_FIELD_SCHEMA);
check('schema is substantial (≥ 70 fields)', schemaKeys.length >= 70, `${schemaKeys.length}`);
check('every schema key has a default value',
  schemaKeys.every((key) => DEFAULT_WATER_SETTINGS[key] !== undefined),
  schemaKeys.filter((key) => DEFAULT_WATER_SETTINGS[key] === undefined).join(', '));

const groupIds = new Set(WATER_SETTING_GROUPS.map((group) => group.id));
check('every schema field belongs to a declared group',
  schemaKeys.every((key) => groupIds.has(WATER_SETTING_FIELD_SCHEMA[key].group)));
const groupedKeys = Object.values(WATER_SETTING_FIELD_SCHEMA_BY_GROUP)
  .flatMap((fields) => Object.keys(fields));
check('grouped schema covers the full flat schema',
  groupedKeys.length === schemaKeys.length && groupedKeys.every((key) => WATER_SETTING_FIELD_SCHEMA[key]));
check('grouped schema only uses declared group ids',
  Object.keys(WATER_SETTING_FIELD_SCHEMA_BY_GROUP).every((id) => groupIds.has(id)));
check('number fields carry a complete range',
  schemaKeys.every((key) => {
    const field = WATER_SETTING_FIELD_SCHEMA[key];
    if (field.type !== 'number') return true;
    return Number.isFinite(field.range?.min) && Number.isFinite(field.range?.max) && field.range.step > 0;
  }));

// --- presets resolve -------------------------------------------------------------
for (const name of WATER_PRESET_NAMES) {
  const settings = createWaterSettings({ preset: name });
  check(`preset '${name}' resolves through createWaterSettings`, settings.preset === name);
}
check('preset picker lists the built-ins',
  WATER_PRESET_NAMES.every((name) => getWaterPresetOptions().some((option) => option.id === name)));
check('Call Me Sensei is not listed as a water preset',
  !getWaterPresetOptions().some((option) => option.id === 'call_me_sensei'));

// --- tone override contract (the lab disables these fields in the UI) ---------------
const tealTone = WATER_COLOR_TONES.teal;
const teal = createWaterSettings({ colorTone: 'teal', shallowColor: [1, 0, 0] });
check('non-classic tone forces its palette over explicit values',
  deepEqual(teal.shallowColor, tealTone.shallowColor));
const classic = createWaterSettings({ colorTone: 'classic', shallowColor: [1, 0, 0] });
check('classic tone leaves explicit colors alone', deepEqual(classic.shallowColor, [1, 0, 0]));

const underwaterLimits = createWaterSettings({
  indexOfRefraction: 9,
  underwaterTransmission: -1,
  underwaterTintStrength: 2,
});
check('underwater optics settings clamp to their public ranges',
  underwaterLimits.indexOfRefraction === 1.8
    && underwaterLimits.underwaterTransmission === 0
    && underwaterLimits.underwaterTintStrength === 1);

const remediationWaterShaderSource = readFileSync(
  new URL('../src/shaders-tsl/water.js', import.meta.url),
  'utf8',
);
const remediationWaterSurfaceSource = readFileSync(
  new URL('../src/water/waterSurface.js', import.meta.url),
  'utf8',
);
check('finite shore-state tiles retain procedural shoreline fallback outside their region',
  remediationWaterShaderSource.includes('fallbackBand.mul(persistentShoreCoverage.oneMinus())'));
check('water mirrors host FogExp2 density as well as linear Fog',
  remediationWaterSurfaceSource.includes('scene?.fog?.isFogExp2')
    && remediationWaterShaderSource.includes('uSceneFogDensity'));

// --- default camera-underwater scene atmosphere ------------------------------------
const underwaterAtmosphereProbe = resolveWaterUnderwaterAtmosphereState({
  cameraX: 2,
  cameraY: -3,
  cameraZ: -4,
  waterX: 0,
  waterY: 0,
  waterZ: 0,
  width: 20,
  depth: 20,
  settings: { midColor: [0.2, 0.4, 0.6] },
});
check('default underwater atmosphere matches the proven Water Lab treatment',
  underwaterAtmosphereProbe.active
    && underwaterAtmosphereProbe.fogNear === 0.5
    && underwaterAtmosphereProbe.fogFar === 32
    && underwaterAtmosphereProbe.color.every((channel, index) => (
      Math.abs(channel - [0.16, 0.34, 0.54][index]) < 1e-9
    )));
check('finite surface bounds prevent underwater fog outside the water body',
  !resolveWaterUnderwaterAtmosphereState({
    cameraX: 11,
    cameraY: -3,
    cameraZ: 0,
    waterY: 0,
    width: 20,
    depth: 20,
  }).active);

const atmosphereScene = new THREE.Scene();
const hostBackground = new THREE.Color(0.45, 0.7, 0.95);
const hostFog = new THREE.Fog(0xbadcee, 40, 180);
const hostFogNode = { name: 'host-fog-node' };
atmosphereScene.background = hostBackground;
atmosphereScene.fog = hostFog;
atmosphereScene.fogNode = hostFogNode;
const atmosphereController = new WaterUnderwaterAtmosphere();
const atmosphereCamera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 100);
atmosphereCamera.position.set(0, -2, 4);
atmosphereController.beginFrame(atmosphereScene);
const appliedAtmosphere = atmosphereController.update(atmosphereScene, {
  camera: atmosphereCamera,
  cameraY: -2,
  waterY: 0,
  width: 20,
  depth: 20,
  settings: { midColor: [0.2, 0.4, 0.6] },
});
check('scene adapter applies package-owned fog/background and clears host fogNode underwater',
  appliedAtmosphere.active
    && atmosphereScene.background !== hostBackground
    && atmosphereScene.fog !== hostFog
    && atmosphereScene.fog.near === 0.5
    && atmosphereScene.fog.far === 32
    && atmosphereScene.fogNode === null
    && atmosphereScene.getObjectByName('ToonLab Underwater Atmosphere Veil')?.visible);
atmosphereController.beginFrame(atmosphereScene);
check('scene adapter restores the exact host air scene before water capture passes',
  atmosphereScene.background === hostBackground
    && atmosphereScene.fog === hostFog
    && atmosphereScene.fogNode === hostFogNode
    && !atmosphereScene.getObjectByName('ToonLab Underwater Atmosphere Veil')?.visible);
atmosphereController.update(atmosphereScene, {
  cameraY: 2,
  waterY: 0,
  width: 20,
  depth: 20,
  settings: { midColor: [0.2, 0.4, 0.6] },
});
check('above-water update leaves the restored host scene untouched',
  !atmosphereController.state.active
    && atmosphereScene.background === hostBackground
    && atmosphereScene.fog === hostFog
    && atmosphereScene.fogNode === hostFogNode);
atmosphereController.dispose();

// --- sanitize + document round-trips -----------------------------------------------
const sanitized = sanitizeWaterPresetSettings(DEFAULT_WATER_SETTINGS);
check('sanitize covers every schema key from the defaults',
  schemaKeys.every((key) => sanitized[key] !== undefined));
check('sanitize drops preset/mode identity keys',
  sanitized.preset === undefined && sanitized.mode === undefined && sanitized.style === undefined);
check('sanitize round-trips', deepEqual(sanitizeWaterPresetSettings(sanitized), sanitized));

const custom = sanitizeWaterPresetSettings(createWaterSettings({
  preset: 'ocean',
  colorTone: 'lagoon',
  waveAmplitude: 1.7,
  waveDirection: [0.2, -0.9],
}));
const document = createWaterPresetDocument('verify_suite_water', {
  description: 'verify-watergen round-trip preset',
  label: 'Verify Suite Water',
  settings: custom,
});
check('document creation normalizes type/version/id',
  document.type === 'toonlab/water-preset' && document.version === 2 && document.id === 'verify_suite_water');

// --- style × preset contract ---------------------------------------------------------
{
  const styles = getWaterStyleOptions();
  check('water styles expose default and call_me_sensei',
    styles.some((s) => s.id === 'default') && styles.some((s) => s.id === 'call_me_sensei'));
  check('every water style reports coverage for every water preset',
    styles.every((s) => deepEqual(Object.keys(s.presets), [...WATER_PRESET_NAMES])));
  const cmsRiver = createWaterSettings({ preset: 'river', style: 'call_me_sensei' });
  check('preset physics survive under every style',
    Math.abs(cmsRiver.flowSpeed - 1.15) < 1e-9);
  check('style identity composes over the preset',
    cmsRiver.style === 'call_me_sensei' && cmsRiver.preset === 'river' && cmsRiver.colorTone === 'anime');
  const defaultOcean = createWaterSettings({ preset: 'ocean', style: 'default' });
  const legacyOcean = createWaterSettings({ preset: 'ocean' });
  check('default style preserves preset recipes byte-for-byte',
    deepEqual(
      { ...defaultOcean, mode: null, preset: null, style: null },
      { ...legacyOcean, mode: null, preset: null, style: null },
    ));
  const legacyCmsRiver = createWaterSettings({ preset: 'call_me_sensei', scenario: 'river' });
  check('legacy style-as-preset calls remain compatible',
    deepEqual(legacyCmsRiver, cmsRiver));
  const customDefaultRiver = createWaterSettings({
    preset: 'river',
    style: 'default',
    waveSpeed: 3.33,
  });
  const rebasedRiver = rebaseWaterSettingsStyle(customDefaultRiver, 'call_me_sensei');
  check('style rebasing retains the asset preset and authored overrides',
    rebasedRiver.preset === 'river'
      && rebasedRiver.style === 'call_me_sensei'
      && rebasedRiver.waveSpeed === 3.33);
  check('style rebasing applies the new style instead of preserving a full old baseline',
    rebasedRiver.colorTone === cmsRiver.colorTone
      && deepEqual(rebasedRiver.deepColor, cmsRiver.deepColor));
}
const serialized = serializeWaterPreset(document);
const parsed = parseWaterPresetDocument(serialized);
check('serialize → parse round-trips ok', parsed.ok, parsed.errors.join(' '));
check('round-tripped settings are deep-equal', deepEqual(parsed.value.settings, custom));
check('round-tripped label/description survive',
  parsed.value.label === 'Verify Suite Water' && parsed.value.description.includes('round-trip'));

// --- registration feeds the picker ---------------------------------------------------
const registered = registerSerializedWaterPreset(serialized);
check('registerSerializedWaterPreset returns the preset id', registered.id === 'verify_suite_water');
check('registered preset appears in the picker options',
  getWaterPresetOptions().some((option) => option.id === 'verify_suite_water'));
const resolved = createWaterSettings({ preset: 'verify_suite_water' });
check('registered preset resolves with its settings',
  Math.abs(resolved.waveAmplitude - 1.7) < 1e-9 && resolved.colorTone === 'lagoon');

// --- authored water vs transient scene/weather state -------------------------------
check('water scene override contract exposes only baseline wave/light fields',
  deepEqual(WATER_SCENE_OVERRIDE_KEYS, [
    'waveIntensity',
    'sunDirection',
    'sunColor',
    'skyZenithColor',
    'skyHorizonColor',
  ]));

const runtimeWater = new WaterSurface({
  depth: 1,
  passes: false,
  segmentsPerMeter: 1,
  simulation: false,
  splashes: false,
  sunColor: [1, 0.9, 0.7],
  waveIntensity: 0.2,
  width: 1,
});
runtimeWater.setStyle('call_me_sensei');
check('finite water includes a closed side/bottom volume for side and below-surface views',
  runtimeWater.volumeSkirt?.geometry?.getAttribute('position')?.count === 30
    && runtimeWater.volumeSkirt.material.transparent === true
    && runtimeWater.volumeSkirt.userData.waterExclude === true);
check('WaterSurface.setStyle applies the orthogonal style to its current preset',
  runtimeWater.settings.preset === 'lake'
    && runtimeWater.settings.style === 'call_me_sensei'
    && runtimeWater.settings.waveIntensity === 0.2);
const authoredWaterSnapshot = JSON.stringify(runtimeWater.settings);
const baselineWaveEnergy = runtimeWater.waveEnergy;
const weatherLayer = Symbol('verify-weather');
runtimeWater.setSceneOverrideLayer('lighting', {
  sunColor: [0.42, 0.58, 0.96],
}, { priority: WATER_SCENE_OVERRIDE_PRIORITIES.lighting });
runtimeWater.setSceneOverrideLayer(weatherLayer, (base) => ({
  waveIntensity: Math.min(base.waveIntensity + 0.35, 1),
}), { priority: WATER_SCENE_OVERRIDE_PRIORITIES.weather });
check('scene/weather overrides leave authored water.settings untouched',
  JSON.stringify(runtimeWater.settings) === authoredWaterSnapshot);
check('rendered water composes live lighting and additive weather',
  Math.abs(runtimeWater.renderedSettings.waveIntensity - 0.55) < 1e-9
    && deepEqual(runtimeWater.renderedSettings.sunColor, [0.42, 0.58, 0.96])
    && runtimeWater.waveEnergy > baselineWaveEnergy);
const inspectedWaterOverrides = runtimeWater.sceneOverrides;
inspectedWaterOverrides.sunColor[0] = 0;
check('effective runtime state is inspectable without leaking mutable values',
  Math.abs(runtimeWater.sceneOverrides.waveIntensity - 0.55) < 1e-9
    && deepEqual(runtimeWater.sceneOverrides.sunColor, [0.42, 0.58, 0.96])
    && runtimeWater.sceneOverrideLayers.length === 2);

runtimeWater.applySettings({ waveAmplitude: 0.6, waveIntensity: 0.3 });
check('legacy applySettings still authors values while active weather recomposes',
  runtimeWater.settings.waveIntensity === 0.3
    && runtimeWater.settings.waveAmplitude === 0.6
    && Math.abs(runtimeWater.renderedSettings.waveIntensity - 0.65) < 1e-9);
const runtimeDocument = parseWaterPresetDocument(serializeWaterPreset('runtime_boundary', {
  settings: runtimeWater.settings,
}));
check('portable water export sees authored baseline, never transient weather',
  runtimeDocument.ok
    && runtimeDocument.value.settings.waveIntensity === 0.3
    && runtimeDocument.value.settings.waveIntensity !== runtimeWater.renderedSettings.waveIntensity);

runtimeWater.clearSceneOverrideLayer(weatherLayer);
check('clearing Weather restores authored waves without disturbing Lighting',
  runtimeWater.renderedSettings.waveIntensity === 0.3
    && deepEqual(runtimeWater.renderedSettings.sunColor, [0.42, 0.58, 0.96])
    && runtimeWater.sceneOverrideLayers.length === 1);
runtimeWater.setSceneOverrides({
  deepColor: [1, 0, 0],
  waveIntensity: 0.8,
});
check('convenience scene override rejects asset palette fields',
  runtimeWater.renderedSettings.waveIntensity === 0.8
    && deepEqual(runtimeWater.renderedSettings.deepColor, runtimeWater.settings.deepColor));
runtimeWater.clearSceneOverrides();
check('clearing the convenience scene layer preserves independent Lighting',
  runtimeWater.renderedSettings.waveIntensity === runtimeWater.settings.waveIntensity
    && deepEqual(runtimeWater.renderedSettings.sunColor, [0.42, 0.58, 0.96])
    && runtimeWater.sceneOverrideLayers.length === 1);
runtimeWater.clearAllSceneOverrideLayers();
check('explicit full teardown restores every authored fallback',
  runtimeWater.renderedSettings.waveIntensity === runtimeWater.settings.waveIntensity
    && deepEqual(runtimeWater.renderedSettings.sunColor, runtimeWater.settings.sunColor)
    && Object.keys(runtimeWater.sceneOverrides).length === 0);
runtimeWater.dispose();

// --- legacy / loose document shapes ----------------------------------------------------
const legacy = validateWaterPresetDocument({
  name: 'Legacy Shape',
  waveIntensity: 0.9,
  normalStrength: 0.5, // legacy alias for detailNormalStrength
});
check('legacy loose document migrates + validates', legacy.ok, legacy.errors.join(' '));
check('legacy alias keys resolve to canonical names',
  legacy.ok && legacy.value.settings.detailNormalStrength === 0.5);
const invalid = parseWaterPresetDocument('{not json');
check('invalid JSON reports errors without throwing', !invalid.ok && invalid.errors.length > 0);

// --- vector fields (the SchemaField vector2/vector3 contract) ---------------------------
const vectorFields = schemaKeys.filter((key) => ['vector2', 'vector3'].includes(WATER_SETTING_FIELD_SCHEMA[key].type));
check('vector fields exist (waveDirection/flowDirection/sunDirection)', vectorFields.length === 3, vectorFields.join(', '));
check('vector defaults are plain numeric arrays',
  vectorFields.every((key) => Array.isArray(DEFAULT_WATER_SETTINGS[key]) && DEFAULT_WATER_SETTINGS[key].every(Number.isFinite)));

// --- Water Lab ground-relative shoreline contract -------------------------------
const oceanBase = createWaterSettings({ preset: 'ocean' });
const oceanBeach = createWaterSettings({ ...oceanBase, ...waterStageOverrides('beach', oceanBase) });
check('beach ground forces the documented 10 m run-up contract',
  oceanBeach.runupDistance === BEACH_RUNUP_DISTANCE
    && oceanBeach.waterLevel === BEACH_WATER_LEVEL
    && oceanBeach.waveSpeed === BEACH_WAVE_SPEED
    && oceanBeach.waveDirectionSpread === BEACH_DIRECTION_SPREAD);
check('beach ground orients Ocean swell shoreward at an oblique angle',
  oceanBeach.waveDirection[1] > 0.8
    && oceanBeach.flowDirection[1] > 0.8
    && Math.abs(oceanBeach.waveDirection[0]) > 0.2
    && Math.abs(oceanBeach.flowDirection[0]) > 0.2);
const reopenedOcean = createWaterSettings({ ...oceanBeach, ...waterStageOverrides('open', oceanBase) });
check('returning to open ground restores the preset direction and disables explicit run-up',
  deepEqual(reopenedOcean.waveDirection, oceanBase.waveDirection)
    && deepEqual(reopenedOcean.flowDirection, oceanBase.flowDirection)
    && reopenedOcean.waterLevel === oceanBase.waterLevel
    && reopenedOcean.waveSpeed === oceanBase.waveSpeed
    && reopenedOcean.waveDirectionSpread === oceanBase.waveDirectionSpread
    && reopenedOcean.runupDistance === 0);

const swellProbe = [
  { amplitude: 2, dirX: 0, dirZ: 1, omega: 0, phase: Math.PI / 2, waveNumber: 1 },
  { amplitude: 1, dirX: 0, dirZ: 1, omega: 0, phase: Math.PI / 2, waveNumber: 0.5 },
  { amplitude: 99, dirX: 1, dirZ: 0, omega: 0, phase: Math.PI / 2, waveNumber: 4 },
];
check('swash signal uses only the two surf-surviving swell slots',
  Math.abs(sampleGerstnerSwellHeight(swellProbe, 0, 0, 0) - 3) < 1e-9);

const phaseProbe = [
  { amplitude: 0.2, dirX: 0, dirZ: 1, omega: 2, phase: Math.PI / 2, waveNumber: 1 },
  { amplitude: 999, dirX: 1, dirZ: 0, omega: 0, phase: 0, waveNumber: 9 },
];
const eventPeaks = Array.from({ length: 32 }, (_, index) => sampleSwashDistance(
  phaseProbe,
  (index + 0.34) * Math.PI,
  BEACH_RUNUP_DISTANCE,
));
const eventRundowns = Array.from({ length: 32 }, (_, index) => sampleSwashDistance(
  phaseProbe,
  (index + 0.999999) * Math.PI,
  BEACH_RUNUP_DISTANCE,
));
check('explicit swash varies ordinary 10 m peaks over a bounded 8–10 m range',
  Math.min(...eventPeaks) >= 8 - 1e-9
    && Math.max(...eventPeaks) <= 10 + 1e-9
    && Math.max(...eventPeaks) - Math.min(...eventPeaks) > 0.7);
const swashVariations = Array.from(
  { length: 128 },
  (_, index) => sampleSwashCycleVariation(index - 32),
);
check('deeper previous rundown gives only a non-negative modest uprush carry',
  swashVariations.every((variation, offset) => {
    const index = offset - 32;
    const previous = sampleSwashCycleVariation(index - 1);
    const expectedCarry = Math.max(previous.backwashStrength - 0.5, 0) * 0.04;
    return variation.backwashCarry >= 0
      && variation.backwashCarry <= 0.02 + 1e-12
      && Math.abs(variation.backwashCarry - expectedCarry) < 1e-12
      && variation.runupScale + 1e-12 >= variation.baseRunupScale;
  })
    && swashVariations.some((variation) => variation.backwashCarry > 0.005));
check('successive swash events share one continuous rundown/uprush boundary',
  Array.from({ length: 12 }, (_, index) => {
    const boundary = (index + 1) * Math.PI;
    return Math.abs(
      sampleSwashDistance(phaseProbe, boundary - 1e-7, BEACH_RUNUP_DISTANCE)
      - sampleSwashDistance(phaseProbe, boundary + 1e-7, BEACH_RUNUP_DISTANCE),
    ) < 1e-4;
  }).every(Boolean));
check('rundown endpoints vary around the still-water shoreline',
  Math.min(...eventRundowns) >= -0.91
    && Math.max(...eventRundowns) <= 0.36
    && Math.max(...eventRundowns) - Math.min(...eventRundowns) > 0.35);
check('swash sequence and variation expose the event used by the renderer',
  samplePrimarySwellSequence(phaseProbe, Math.PI * 4.2).index === 4
    && sampleSwashCycleVariation(4).runupScale >= 0.8
    && sampleSwashCycleVariation(4).runupScale <= 1);
const sharedSwashFrame = sampleSwashFrameState(
  phaseProbe,
  Math.PI * 4.17,
  BEACH_RUNUP_DISTANCE,
);
check('visible swash and temporal shoreline state share one CPU-authored frame',
  Math.abs(sharedSwashFrame.edgeDistance - sampleSwashDistance(
    phaseProbe,
    Math.PI * 4.17,
    BEACH_RUNUP_DISTANCE,
  )) < 1e-9
    && Math.abs(sharedSwashFrame.progress - shapeSwashProgress(sharedSwashFrame.cycle)) < 1e-9
    && sharedSwashFrame.eventIndex === samplePrimarySwellSequence(
      phaseProbe,
      Math.PI * 4.17,
    ).index
    && Number.isFinite(sharedSwashFrame.edgeDistanceSpeed)
    && Number.isFinite(sharedSwashFrame.progressSpeed)
    && Number.isFinite(sharedSwashFrame.cycleSpeed)
    && sharedSwashFrame.edgeShape.amplitude >= 0.55
    && sharedSwashFrame.edgeShape.amplitude <= 1.05);
check('oblique swash retains an alongshore arrival lag at nominal endpoints',
  sampleSwashEdgeOffset(-8, 0, 0, 0.34) > sampleSwashEdgeOffset(8, 0, 0, 0.34)
    && sampleSwashEdgeOffset(-8, 0, 1, 0.34) > sampleSwashEdgeOffset(8, 0, 1, 0.34)
    && sampleSwashEdgeOffset(0, 7.3, 0.63, 0.34) === 0);
const macroShape = sampleSwashEventShape(4);
const macroOffsets = [-30, -18, -8, 0, 9, 20, 30].map((x) => sampleSwashEdgeOffset(
  x,
  7.3,
  shapeSwashProgress(0.34),
  0.34,
  0.34,
  macroShape,
));
check('each swash event adds broad bounded tongues while preserving the centerline',
  macroOffsets.every(Number.isFinite)
    && Math.abs(macroOffsets[3]) < 1e-12
    && Math.max(...macroOffsets) - Math.min(...macroOffsets) > 1.0
    && Math.max(...macroOffsets.map(Math.abs)) < 4.5);

// A 180 m tile used to turn the oblique x*slope term into a +/-20 m edge
// displacement. Clamping that unbounded result pinned dozens of adjacent
// columns to one reach endpoint, producing the ruler-straight line and the
// block-by-block release visible in the Water Lab. Exercise the complete
// alongshore span, including more extreme incidence than the beach preset.
const swashAlongshoreSamples = Array.from({ length: 361 }, (_, index) => -90 + index * 0.5);
const boundedEdgeOffsets = [
  ...swashAlongshoreSamples.map((x) => sampleSwashEdgeOffset(x, 0, 0, 0.34)),
  ...swashAlongshoreSamples.map((x) => sampleSwashEdgeOffset(x, 7.1, 0.5, 0.34)),
  ...swashAlongshoreSamples.map((x) => sampleSwashEdgeOffset(x, 22.1, 0.5, -1)),
  ...swashAlongshoreSamples.map((x) => sampleSwashEdgeOffset(x, 31.7, 0.83, 1)),
];
check('alongshore swash offset stays finite and bounded across the full 180 m tile',
  boundedEdgeOffsets.every(Number.isFinite)
    && Math.max(...boundedEdgeOffsets.map(Math.abs)) < 3.1,
  `${Math.max(...boundedEdgeOffsets.map(Math.abs)).toFixed(3)} m`);

// Probe a real low-energy event during uprush. A clamp plateau has identical
// neighbouring edge positions for a long run; the bounded soft-sign profile
// remains connected but continues changing from column to column.
const profileTime = (11 + 0.17) * Math.PI;
const profileProgress = shapeSwashProgress(samplePrimarySwellCycle(phaseProbe, profileTime));
const profileCenter = sampleSwashDistance(phaseProbe, profileTime, BEACH_RUNUP_DISTANCE);
const alongshoreEdgeProfile = swashAlongshoreSamples.map((x) => profileCenter +
  sampleSwashEdgeOffset(x, profileTime, profileProgress, 0.34));
let longestEdgePlateau = 1;
let currentEdgePlateau = 1;
for (let index = 1; index < alongshoreEdgeProfile.length; index += 1) {
  if (Math.abs(alongshoreEdgeProfile[index] - alongshoreEdgeProfile[index - 1]) < 1e-5) {
    currentEdgePlateau += 1;
    longestEdgePlateau = Math.max(longestEdgePlateau, currentEdgePlateau);
  } else {
    currentEdgePlateau = 1;
  }
}
check('connected oblique edge has no repeated-value clamp plateau',
  longestEdgePlateau <= 2
    && new Set(alongshoreEdgeProfile.map((value) => value.toFixed(6))).size >=
      alongshoreEdgeProfile.length - 1,
  `${longestEdgePlateau} columns`);

// Centerline continuity alone did not catch the old wide-tile artifact. Test
// the complete local edge (event distance + traveling oblique offset) on both
// sides of twelve event boundaries and across the whole shoreline.
let maximumAlongshoreBoundaryJump = 0;
for (let eventIndex = 0; eventIndex < 12; eventIndex += 1) {
  const boundary = (eventIndex + 1) * Math.PI;
  const epsilon = 1e-4;
  for (const x of swashAlongshoreSamples) {
    const beforeTime = boundary - epsilon;
    const afterTime = boundary + epsilon;
    const beforeProgress = shapeSwashProgress(samplePrimarySwellCycle(phaseProbe, beforeTime));
    const afterProgress = shapeSwashProgress(samplePrimarySwellCycle(phaseProbe, afterTime));
    const beforeFrame = sampleSwashFrameState(
      phaseProbe, beforeTime, BEACH_RUNUP_DISTANCE,
    );
    const afterFrame = sampleSwashFrameState(
      phaseProbe, afterTime, BEACH_RUNUP_DISTANCE,
    );
    const beforeEdge = sampleSwashDistance(
      phaseProbe, beforeTime, BEACH_RUNUP_DISTANCE,
    ) + sampleSwashEdgeOffset(
      x, beforeTime, beforeProgress, 0.34, beforeFrame.cycle, beforeFrame.edgeShape,
    );
    const afterEdge = sampleSwashDistance(
      phaseProbe, afterTime, BEACH_RUNUP_DISTANCE,
    ) + sampleSwashEdgeOffset(
      x, afterTime, afterProgress, 0.34, afterFrame.cycle, afterFrame.edgeShape,
    );
    maximumAlongshoreBoundaryJump = Math.max(
      maximumAlongshoreBoundaryJump,
      Math.abs(afterEdge - beforeEdge),
    );
  }
}
check('full alongshore swash edge remains continuous across event boundaries',
  maximumAlongshoreBoundaryJump < 0.005,
  `${(maximumAlongshoreBoundaryJump * 1000).toFixed(2)} mm`);
check('swash timing reserves more of each wave cycle for backwash than uprush',
  shapeSwashProgress(0.17) > 0.45
    && shapeSwashProgress(0.67) > 0.45);

check('the measured 20 m beach is a monotonic 1:20 plane from z=-10 to z=10',
  Math.abs(beachBedHeight(0, -10) + 0.14) < 1e-9
    && Math.abs(beachBedHeight(0, 0) - 0.36) < 1e-9
    && Math.abs(beachBedHeight(0, 10) - 0.86) < 1e-9
    && Math.abs(beachBedHeight(8, 4) - beachBedHeight(-8, 4)) < 1e-9);

const coastBeach = createWaterSettings({
  preset: 'coast',
  ...waterStageOverrides('beach', createWaterSettings({ preset: 'coast' })),
});
const coastWaves = buildGerstnerWaves(coastBeach);
const coastEnergy = coastWaves.reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0);
const coastBreakDepth = computeBreakingDepth(coastBeach, coastEnergy);
const coastBreakLines = extractBreakLineChains({
  bedSampler: beachBedHeight,
  breakDepth: coastBreakDepth,
  depth: 40,
  originX: 0,
  originZ: 0,
  surfaceY: coastBeach.waterLevel,
  waveDirX: coastWaves[0].dirX,
  waveDirZ: coastWaves[0].dirZ,
  width: 40,
});
check('shoreward Coast swell produces a continuous beach-facing break line',
  coastBreakLines.length > 0
    && coastBreakLines.some((chain) => chain.length >= 20)
    && coastBreakLines.flat().every((point) => point.facing > 0.25));
check('explicit beach swash uses the welded heightfield breaker, not a detached shell',
  !shouldUseDedicatedBreakerShell(coastBeach, true)
    && shouldUseDedicatedBreakerShell(createWaterSettings({ preset: 'coast', runupDistance: 0 }), true));

// --- persistent shoreline state ------------------------------------------------
const shoreField = new WaterShoreStateField({
  region: { centerX: 2, centerZ: -1, width: 24, depth: 12 },
  resolution: { x: 32, y: 16 },
  bedHeight: (x, z) => 0.2 + x * 0.03 + z * 0.05,
});
const shoreRegion = shoreField.getRegion(new THREE.Vector4());
const centerTexel = ((8 * 32) + 16) * 4;
const bedData = shoreField.bedTexture.image.data;
check('shore-state field uses a fixed world-space RGBA16F history atlas',
  shoreField.texture.type === THREE.HalfFloatType
    && shoreField.texture.format === THREE.RGBAFormat
    && shoreRegion.equals(new THREE.Vector4(2, -1, 12, 6)));
check('shore-state bed atlas stores height, X/Z gradients, and validity',
  shoreField.bedTexture.type === THREE.FloatType
    && Math.abs(bedData[centerTexel + 1] - 0.03) < 1e-5
    && Math.abs(bedData[centerTexel + 2] - 0.05) < 1e-5
    && bedData[centerTexel + 3] === 1);
shoreField.setParameters({ foamDiffusion: 0, foamGain: 3.25 });
check('shore-state transport parameters remain runtime-adjustable',
  shoreField.material.uniforms.uFoamDiffusion.value === 0
    && shoreField.material.uniforms.uFoamGain.value === 3.25);
shoreField.dispose();

const shorePresentationMaterial = createWaterShoreMaterial({ foamAmount: 1.2 });
updateWaterShoreMaterial(shorePresentationMaterial, { foamAmount: 0 });
check('sand-side foam presentation can be disabled by the Swash Foam control',
  shorePresentationMaterial.uniforms.uShoreFoamAmount.value === 0);
shorePresentationMaterial.dispose();

// A direct value-noise fallback in the already-large visible shader caused
// WebGPU's 8,192-byte private-address-space pipeline failure. Temporal source
// breakup belongs in its own small pass; keep this architectural boundary
// explicit in the fast regression suite in addition to the live smoke probe.
const visibleWaterShaderSource = readFileSync(
  new URL('../src/shaders-tsl/water.js', import.meta.url),
  'utf8',
);
const waterColorShaderSource = readFileSync(
  new URL('../src/shaders-tsl/chunks/water-color.js', import.meta.url),
  'utf8',
);
const waterMaterialSource = readFileSync(
  new URL('../src/water/waterMaterial.js', import.meta.url),
  'utf8',
);
const waterVegetationSource = readFileSync(
  new URL('../src/water/waterVegetation.js', import.meta.url),
  'utf8',
);
const shoreStateShaderSource = readFileSync(
  new URL('../src/shaders-tsl/water-shore-state-simulation.js', import.meta.url),
  'utf8',
);
const shoreGroundMaterialSource = readFileSync(
  new URL('../src/water/waterShoreMaterial.js', import.meta.url),
  'utf8',
);
const waterLabEngineSource = readFileSync(
  new URL('../labs/water-lab/engine/waterLabEngine.js', import.meta.url),
  'utf8',
);
const waterSurfaceSource = readFileSync(
  new URL('../src/water/waterSurface.js', import.meta.url),
  'utf8',
);
const scenePassSource = readFileSync(
  new URL('../src/water/waterScenePasses.js', import.meta.url),
  'utf8',
);
const projectedCausticsSource = readFileSync(
  new URL('../src/shaders-tsl/chunks/projected-water-caustics.js', import.meta.url),
  'utf8',
);
const environmentShaderSource = readFileSync(
  new URL('../src/shaders-tsl/environment.js', import.meta.url),
  'utf8',
);
check('temporal foam breakup stays out of the private-memory-heavy main shader',
  !visibleWaterShaderSource.includes('waterValueNoise(')
    && shoreStateShaderSource.includes('const fineNoise ='));
check('canonical water depth targets remap for reversed-depth renderers',
  visibleWaterShaderSource.includes('uDepthTargetNeedsReverse: uniform(0)')
    && waterColorShaderSource.includes('stored.oneMinus()')
    && waterColorShaderSource.includes('storedDepthHasGeometry')
    && waterMaterialSource.includes('renderer.reversedDepthBuffer ? 1 : 0'));
check('packaged underwater vegetation is deterministic and shadow-ready by default',
  waterVegetationSource.includes('seed = 1')
    && waterVegetationSource.includes('const random = mulberry32(seed)')
    && !waterVegetationSource.includes('Math.random()')
    && waterVegetationSource.includes('this.castShadow = true')
    && waterVegetationSource.includes('this.receiveShadow = true'));
check('swash foam injection stays registered to the visible signed water edge',
  shoreStateShaderSource.includes('const sourceHead = filmHead.add(edgeJitter)')
    && shoreStateShaderSource.includes('min(foamWidth.mul(0.22), 0.004)')
    && !shoreStateShaderSource.includes('foamWidth).mul(1.4)'));
check('swash foam rafts vary their inward reach without moving off the edge',
  shoreStateShaderSource.includes('const raftReach = foamWidth')
    && shoreStateShaderSource.includes('mix(0.5, 1.9, noiseSample.g)')
    && shoreStateShaderSource.includes('smoothstep(-0.01, -0.001, sourceHead)'));
check('fast uprush latches gated foam to the current lip without a coverage floor',
  shoreStateShaderSource.includes('const attachedLip = frontSource.mul(0.72)')
    && shoreStateShaderSource.includes('max(\n          retainedFoam.add'));
check('coherent edge foam continues onto wet sand instead of clipping at the water mesh',
  shoreGroundMaterialSource.includes('smoothstep(0.46, 0.68, activeFoam)')
    && shoreGroundMaterialSource.includes('visibleActiveFoam.mul(0.72)')
    && shoreGroundMaterialSource.includes('0.74,'));
check('Swash Foam controls both the water-side and sand-side presentation',
  shoreGroundMaterialSource.includes('uShoreFoamAmount')
    && waterLabEngineSource.includes('foamAmount: settings.swashFoamAmount'));
check('underwater surface uses a physical IOR boundary around a captured air-side scene',
  visibleWaterShaderSource.includes('refract(')
    && visibleWaterShaderSource.includes('const criticalCos =')
    && visibleWaterShaderSource.includes('const capturedAir = u.uSceneColor'));
check('submerged grab uses a same-pose camera clipped to the air side',
  scenePassSource.includes('this.transmissionCamera = new THREE.PerspectiveCamera()')
    && scenePassSource.includes('this.applyWaterClipPlane(renderer, transmissionCamera, waterY)')
    && scenePassSource.includes('if (cameraBelow) {\n        this.depthValid = false;'));
check('projected floor caustics combine two independently moving seamless samples',
  projectedCausticsSource.includes('const cellA =')
    && projectedCausticsSource.includes('const cellB =')
    && projectedCausticsSource.includes('min(cellA, cellB).oneMinus()'));
check('environment and shore materials both receive the underwater caustic projector',
  environmentShaderSource.includes('projectedWaterCaustics(vWorldPosition, normalWorld)')
    && shoreGroundMaterialSource.includes('projectedWaterCaustics(positionWorld, normalWorld)'));
check('Water Lab exposes repeatable underside and seabed inspection cameras',
  waterLabEngineSource.includes("view === 'underwater-up'")
    && waterLabEngineSource.includes("view !== 'underwater-floor'"));
check('WaterSurface restores air state before passes and applies its default atmosphere after them',
  waterSurfaceSource.indexOf('this.underwaterAtmosphere.beginFrame(scene)')
    < waterSurfaceSource.indexOf('this.passes.render(renderer, scene, camera, this)')
    && waterSurfaceSource.indexOf('this.underwaterAtmosphere.update(scene, {')
    > waterSurfaceSource.indexOf('this.passes.render(renderer, scene, camera, this)'));
check('Water Lab consumes the package atmosphere instead of owning a private fog swap',
  !waterLabEngineSource.includes('syncUnderwaterAtmosphere')
    && waterLabEngineSource.includes('water.underwaterAtmosphereState.active'));

// --- water-pass camera-facing object contract + cost reporting --------------------
{
  const scene = new THREE.Scene();
  const waterMesh = new THREE.Object3D();
  const billboard = new THREE.Object3D();
  billboard.position.set(3, 2, 1);
  const passKinds = [];
  let cleanupCalls = 0;
  billboard.userData.onWaterPass = function onWaterPass(passCamera, passKind) {
    passKinds.push({ camera: passCamera, kind: passKind });
    this.position.x = passKind === 'reflection' ? 20 : 10;
    return () => { cleanupCalls += 1; };
  };
  scene.add(waterMesh, billboard);
  scene.updateMatrixWorld(true);

  const camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.1, 100);
  camera.position.set(0, 5, 10);
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const renderPositions = [];
  const renderer = {
    _clearAlpha: 1,
    _clearColor: new THREE.Color(0),
    _target: null,
    coordinateSystem: THREE.WebGLCoordinateSystem,
    shadowMap: { autoUpdate: true },
    xr: { enabled: true },
    clear() {},
    getClearAlpha() { return this._clearAlpha; },
    getClearColor(target) { return target.copy(this._clearColor); },
    getDrawingBufferSize(target) { return target.set(800, 600); },
    getRenderTarget() { return this._target; },
    render() { renderPositions.push(billboard.position.x); },
    setClearColor(color, alpha = 1) {
      this._clearColor.set(color);
      this._clearAlpha = alpha;
    },
    setRenderTarget(target) { this._target = target; },
  };
  const passes = new WaterScenePasses();
  passes.render(renderer, scene, camera, waterMesh);
  check('water pass hook receives grab and mirrored reflection cameras',
    deepEqual(passKinds.map(({ kind }) => kind), ['grab', 'reflection'])
      && passKinds[0].camera === camera
      && passKinds[1].camera === passes.reflectionCamera);
  check('water pass hook transform remains active through grab/depth/reflection renders',
    deepEqual(renderPositions, [10, 10, 20]));
  check('water pass hook cleanup and exact host transform restoration are guaranteed',
    cleanupCalls === 2 && billboard.position.equals(new THREE.Vector3(3, 2, 1)));
  check('water pass stats expose the real offscreen scene-render budget and target sizes',
    passes.stats.configuredMaximumSceneRenders === 3
      && passes.stats.lastFrame.sceneRenders === 3
      && deepEqual(passes.stats.lastFrame.passes, ['grab', 'depth', 'reflection'])
      && deepEqual(passes.stats.targets.grab, { height: 600, width: 800 })
      && deepEqual(passes.stats.targets.depth, { height: 600, width: 800 })
      && deepEqual(passes.stats.targets.reflection, { height: 300, width: 400 }));
  passes.dispose();
}

if (failures > 0) {
  console.error(`\nverify-watergen: ${failures} failure(s)`);
  process.exit(1);
}
console.log('\nverify-watergen: all checks passed');
