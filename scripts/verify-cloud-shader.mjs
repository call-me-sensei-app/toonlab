// Cloud Shader Lab contract — the PER-PIXEL LOOK half of the volumetric cloud
// system, per docs/sky-cloud-parameters.md "Lab responsibilities".
//
// This file used to verify the 31-field flat cloud-shader profile that drove
// the 2.5D card renderer. Decision 1 of the rebuild replaced that treatment
// outright, so every claim here is now the equivalent claim about the six
// SkyParams cloud groups: the fields the shader lab owns, their spec defaults
// and units, their clamping, and the applyParams/toParams round-trip.
//
// Deliberately NOT covered here, with the task that covers it:
//   - The eight named looks and their completeness. They are whole-sky presets
//     in src/sky/skyPresets.js, which is not built; there is no cloud-only
//     preset registry to replace DEFAULT_CLOUD_SHADER_PRESET with.
//   - Detailed lab interaction behavior. The route now uses the shared
//     production SkySystem engine; scripts/verify-sky-cloud-lab.mjs owns its
//     workspace routing, hero-cloud authoring, and comparison-mode tests.
//   - Tiling, determinism, the 8³ volume floor and the sun/moon solver:
//     scripts/verify-volumetric-sky.mjs owns those and is not duplicated.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CLOUD_EROSION_MIN_SCALE,
  CLOUD_PARAMS_FIELD_SCHEMA,
  CLOUD_PARAM_GROUPS,
  CLOUD_PARAM_GROUP_IDS,
  CLOUD_STYLE_FIELD_SCHEMA,
  CLOUD_STYLE_SNAPSHOT_IDS,
  DEFAULT_CLOUD_STYLE_PARAMS,
  DEFAULT_CLOUD_PARAMS,
  MAX_MARCH_DIST_MARGIN,
  createCloudStyleParams,
  createCloudParams,
  matchCloudStyleSnapshot,
  resolveCloudStyleSnapshot,
} from '../src/cloud/index.js';
import {
  DEFAULT_ATMOSPHERE_PARAMS,
  DEFAULT_SKY_COLOR_PARAMS,
  SKY_COLOR_FIELD_SCHEMA,
  SKY_PARAMS_DOCUMENT_TYPE,
  SKY_PARAMS_SCHEMA_VERSION,
  SKY_STYLE_SNAPSHOT_IDS,
  createSkyColorParams,
  createSkyParams,
  createSkyParamsDocument,
  matchSkyStyleSnapshot,
  parseSkyParamsDocument,
  resolveSkyStyleSnapshot,
  serializeSkyParamsDocument,
  timeStyleWeightsFor,
  validateSkyParams,
} from '../src/sky/index.js';
import { LOOK_DEVELOPMENT_LABS_SHOWCASE } from '../labs/home/labsShowcase.js';
import {
  STYLE_BUNDLE_SLOTS,
  createStyleBundleDocument,
  resolveStyleBundleSettings,
} from '../src/styles/styleBundle.js';

const packageJson = JSON.parse(await readFile(
  new URL('../package.json', import.meta.url),
  'utf8',
));
const marcherSource = await readFile(
  new URL('../src/cloud/cloudVolume.js', import.meta.url),
  'utf8',
);
const lightingSource = await readFile(
  new URL('../src/cloud/cloudLighting.js', import.meta.url),
  'utf8',
);
const cloudShadowSource = await readFile(
  new URL('../src/sky/cloudShadow.js', import.meta.url),
  'utf8',
);
const skyColorSource = await readFile(
  new URL('../src/sky/skyColor.js', import.meta.url),
  'utf8',
);
const nightSkySource = await readFile(
  new URL('../src/sky/nightSky.js', import.meta.url),
  'utf8',
);
const legacyMainSource = await readFile(
  new URL('../labs/atmospheric-condition-lab/ui/main.jsx', import.meta.url),
  'utf8',
);
const docs = await readFile(
  new URL('../docs/cloud-shader.md', import.meta.url),
  'utf8',
);
const parameterReference = await readFile(
  new URL('../docs/sky-cloud-parameters.md', import.meta.url),
  'utf8',
);
const cloudRouteSource = await readFile(
  new URL('../cloud-shader-lab/index.html', import.meta.url),
  'utf8',
);
const sharedLabAppSource = await readFile(
  new URL('../labs/sky-cloud-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const labWorkspacesSource = await readFile(
  new URL('../labs/sky-cloud-lab/ui/labWorkspaces.js', import.meta.url),
  'utf8',
);

// ---------------------------------------------------------------------------
// The field set the lab authors
// ---------------------------------------------------------------------------

// Exactly the split docs/sky-cloud-parameters.md assigns to this lab. Written
// out rather than derived so a field silently changing owner fails here instead
// of quietly moving between two authoring surfaces.
const SHADER_LAB_FIELDS = Object.freeze({
  cirrus: ['scale', 'strength'],
  fade: ['hazeDensityScale', 'horizonMeltStart', 'horizonMeltEnd', 'maxMarchDist'],
  haze: ['density', 'scale'],
  lighting: [
    'scatteringAlbedo', 'powderStrength', 'ambientIntensity', 'groundBounceAlbedo',
    'baseShadowStrength', 'baseShadowHeight', 'moonGain',
  ],
  shape: [
    'density', 'baseStrength', 'erosionShape', 'erosionStrengthBase',
    'erosionStrengthPeak', 'erosionScaleBaseMultiplier', 'edgeSoftness',
    'edgeSoftnessFalloff',
  ],
});

assert.equal(SKY_PARAMS_DOCUMENT_TYPE, 'toonlab/sky-params');
assert.equal(SKY_PARAMS_SCHEMA_VERSION, 9);
assert.deepEqual(
  CLOUD_PARAM_GROUPS.map((group) => group.id),
  ['shape', 'lighting', 'wind', 'cirrus', 'haze', 'fade'],
);
assert.deepEqual([...CLOUD_PARAM_GROUP_IDS], CLOUD_PARAM_GROUPS.map((group) => group.id));

// The count that replaces CLOUD_SHADER_FIELD_COUNT, asserted the same two ways:
// against the published schema and against what a live group actually carries.
const CLOUD_PARAM_FIELD_COUNT = 38;
assert.equal(
  Object.values(CLOUD_PARAMS_FIELD_SCHEMA)
    .flatMap((group) => Object.values(group))
    .length,
  CLOUD_PARAM_FIELD_COUNT,
);
const live = createCloudParams();
assert.equal(
  CLOUD_PARAM_GROUP_IDS
    .flatMap((id) => Object.keys(live[id].toParams()))
    .length,
  CLOUD_PARAM_FIELD_COUNT,
);
// `enabled` is the master switch, not a parameter: a preset must not be able to
// switch the layer off behind the author's back.
assert.equal(live.enabled, true);
assert.equal(live.toParams().enabled, undefined);
assert.equal(CLOUD_PARAMS_FIELD_SCHEMA.shape.enabled, undefined);

// V2 styling is a separate, uniform-backed module tree. The default is the V1
// bypass, and every module owns an independent switch.
assert.deepEqual([...CLOUD_STYLE_SNAPSHOT_IDS], ['1.0', '2.0', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9']);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.tone.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.blueShadow.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.shadowWash.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.innerPaint.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.whiteTop.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.topLight.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.surfaceLight.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.lightBlend.enabled, false);
assert.equal(DEFAULT_CLOUD_STYLE_PARAMS.timePalette.enabled, false);
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.tone.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.blueShadow.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.shadowWash.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.innerPaint.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.whiteTop.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.topLight.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.surfaceLight.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.lightBlend.enabled.type, 'boolean');
assert.equal(CLOUD_STYLE_FIELD_SCHEMA.timePalette.enabled.type, 'boolean');
const liveStyle = createCloudStyleParams();
assert.equal(liveStyle.enabled.isUniformNode, true);
assert.equal(liveStyle.tone.enabled.isUniformNode, true);
assert.equal(liveStyle.blueShadow.enabled.isUniformNode, true);
assert.equal(liveStyle.shadowWash.enabled.isUniformNode, true);
assert.equal(liveStyle.innerPaint.enabled.isUniformNode, true);
assert.equal(liveStyle.whiteTop.enabled.isUniformNode, true);
assert.equal(liveStyle.topLight.enabled.isUniformNode, true);
assert.equal(liveStyle.surfaceLight.enabled.isUniformNode, true);
assert.equal(liveStyle.lightBlend.enabled.isUniformNode, true);
assert.equal(liveStyle.timePalette.enabled.isUniformNode, true);
assert.equal(liveStyle.enabled.value, 0);
assert.equal(liveStyle.tone.enabled.value, 0);
assert.equal(liveStyle.blueShadow.enabled.value, 0);
assert.equal(liveStyle.shadowWash.enabled.value, 0);
assert.equal(liveStyle.innerPaint.enabled.value, 0);
assert.equal(liveStyle.whiteTop.enabled.value, 0);
assert.equal(liveStyle.topLight.enabled.value, 0);
assert.equal(liveStyle.surfaceLight.enabled.value, 0);
assert.equal(liveStyle.lightBlend.enabled.value, 0);
assert.equal(liveStyle.timePalette.enabled.value, 0);
const v20Style = resolveCloudStyleSnapshot('2.0').cloudStyle;
liveStyle.applyParams(v20Style);
assert.equal(liveStyle.enabled.value, 1);
assert.equal(liveStyle.tone.enabled.value, 1);
assert.equal(liveStyle.blueShadow.enabled.value, 0);
assert.equal(liveStyle.shadowWash.enabled.value, 0);
assert.equal(liveStyle.innerPaint.enabled.value, 0);
assert.equal(liveStyle.whiteTop.enabled.value, 0);
assert.equal(liveStyle.topLight.enabled.value, 0);
assert.equal(liveStyle.surfaceLight.enabled.value, 0);
assert.equal(liveStyle.lightBlend.enabled.value, 0);
assert.equal(liveStyle.timePalette.enabled.value, 0);
assert.equal(matchCloudStyleSnapshot(liveStyle.toParams()), '2.0');

// V2.1 composes an independently switchable sky-colour block over the same
// physical atmosphere and the unchanged V2.0 cloud tone snapshot.
assert.deepEqual([...SKY_STYLE_SNAPSHOT_IDS], ['1.0', '2.0', '2.1', '2.2', '2.3', '2.4', '2.5', '2.6', '2.7', '2.8', '2.9', '2.10']);
assert.equal(DEFAULT_SKY_COLOR_PARAMS.enabled, false);
assert.equal(DEFAULT_SKY_COLOR_PARAMS.palette.enabled, false);
assert.equal(DEFAULT_SKY_COLOR_PARAMS.timePalette.enabled, false);
assert.equal(DEFAULT_SKY_COLOR_PARAMS.starField.enabled, false);
assert.equal(SKY_COLOR_FIELD_SCHEMA.enabled.type, 'boolean');
assert.equal(SKY_COLOR_FIELD_SCHEMA.palette.enabled.type, 'boolean');
assert.equal(SKY_COLOR_FIELD_SCHEMA.timePalette.enabled.type, 'boolean');
assert.equal(SKY_COLOR_FIELD_SCHEMA.starField.enabled.type, 'boolean');
const liveSkyColor = createSkyColorParams();
assert.equal(liveSkyColor.enabled.isUniformNode, true);
assert.equal(liveSkyColor.palette.enabled.isUniformNode, true);
assert.equal(liveSkyColor.timePalette.enabled.isUniformNode, true);
assert.equal(liveSkyColor.starField.enabled.isUniformNode, true);
assert.equal(liveSkyColor.enabled.value, 0);
assert.equal(liveSkyColor.palette.enabled.value, 0);
assert.equal(liveSkyColor.timePalette.enabled.value, 0);
assert.equal(liveSkyColor.starField.enabled.value, 0);
const v21Style = resolveSkyStyleSnapshot('2.1');
liveSkyColor.applyParams(v21Style.skyColor);
assert.equal(liveSkyColor.enabled.value, 1);
assert.equal(liveSkyColor.palette.enabled.value, 1);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: liveSkyColor.toParams() },
  cloud: { style: v21Style.cloudStyle },
}), '2.1');
const v22Style = resolveSkyStyleSnapshot('2.2');
liveStyle.applyParams(v22Style.cloudStyle);
assert.equal(liveStyle.blueShadow.enabled.value, 1);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: v22Style.skyColor },
  cloud: { style: liveStyle.toParams() },
}), '2.2');
const v23Style = resolveSkyStyleSnapshot('2.3');
liveStyle.applyParams(v23Style.cloudStyle);
assert.equal(liveStyle.shadowWash.enabled.value, 1);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: v23Style.skyColor },
  cloud: { style: liveStyle.toParams() },
}), '2.3');
const v24Style = resolveSkyStyleSnapshot('2.4');
liveStyle.applyParams(v24Style.cloudStyle);
assert.equal(liveStyle.innerPaint.enabled.value, 1);
assert.equal(liveStyle.innerPaint.edgeKeep.value, 0.22);
assert.equal(liveStyle.innerPaint.edgeBlend.value, 0.28);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: v24Style.skyColor },
  cloud: { style: liveStyle.toParams() },
}), '2.4');

const v25Style = resolveSkyStyleSnapshot('2.5');
liveStyle.applyParams(v25Style.cloudStyle);
assert.equal(liveStyle.whiteTop.enabled.value, 1);
assert.equal(liveStyle.whiteTop.area.value, 0.75);
assert.equal(liveStyle.whiteTop.softness.value, 0.18);
assert.equal(liveStyle.whiteTop.detail.value, 0.3);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: v25Style.skyColor },
  cloud: { style: liveStyle.toParams() },
}), '2.5');

const v26Style = resolveSkyStyleSnapshot('2.6');
liveStyle.applyParams(v26Style.cloudStyle);
assert.equal(liveStyle.lightBlend.enabled.value, 1);
assert.equal(liveStyle.lightBlend.amount.value, 0.5);
assert.equal(liveStyle.lightBlend.balance.value, 0.16);
assert.equal(liveStyle.lightBlend.softness.value, 0.14);
assert.equal(liveStyle.lightBlend.detail.value, 0.65);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: v26Style.skyColor },
  cloud: { style: liveStyle.toParams() },
}), '2.6');

const v27Style = resolveSkyStyleSnapshot('2.7');
liveStyle.applyParams(v27Style.cloudStyle);
liveSkyColor.applyParams(v27Style.skyColor);
assert.equal(liveStyle.timePalette.enabled.value, 1);
assert.equal(liveStyle.timePalette.morningEnabled.value, 1);
assert.equal(liveStyle.timePalette.morningAmount.value, 0.96);
assert.equal(liveStyle.timePalette.morningDetail.value, 0.2);
assert.equal(liveStyle.timePalette.morningBrightness.value, 1.5);
assert.equal(liveStyle.timePalette.eveningEnabled.value, 1);
assert.equal(liveStyle.timePalette.eveningAmount.value, 0.97);
assert.equal(liveStyle.timePalette.eveningDetail.value, 0.12);
assert.equal(liveStyle.timePalette.eveningBrightness.value, 1.45);
assert.equal(liveStyle.timePalette.nightEnabled.value, 1);
assert.equal(liveStyle.timePalette.nightAmount.value, 0.98);
assert.equal(liveStyle.timePalette.nightDetail.value, 0.4);
assert.equal(liveStyle.timePalette.nightContrast.value, 0.18);
assert.equal(liveStyle.timePalette.nightBrightness.value, 2.4);
assert.equal(liveSkyColor.timePalette.nightStars.value, 1);
assert.equal(liveSkyColor.timePalette.enabled.value, 1);
assert.equal(liveSkyColor.timePalette.morningEnabled.value, 1);
assert.equal(liveSkyColor.timePalette.morningAmount.value, 0.92);
assert.equal(liveSkyColor.timePalette.morningFill.value, 0.57);
assert.equal(liveSkyColor.timePalette.eveningEnabled.value, 1);
assert.equal(liveSkyColor.timePalette.eveningAmount.value, 0.98);
assert.equal(liveSkyColor.timePalette.eveningFill.value, 0.7);
assert.equal(liveSkyColor.timePalette.nightEnabled.value, 1);
assert.equal(liveSkyColor.timePalette.nightAmount.value, 0.98);
assert.equal(liveSkyColor.timePalette.nightFill.value, 0.18);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: liveSkyColor.toParams() },
  cloud: { style: liveStyle.toParams() },
}), '2.7');

const v28Style = resolveSkyStyleSnapshot('2.8');
liveStyle.applyParams(v28Style.cloudStyle);
liveSkyColor.applyParams(v28Style.skyColor);
assert.equal(liveStyle.whiteTop.enabled.value, 1);
assert.equal(liveStyle.whiteTop.detail.value, 0.3);
assert.equal(liveStyle.topLight.enabled.value, 1);
assert.equal(liveStyle.topLight.amount.value, 1);
assert.deepEqual(v28Style.skyColor, v27Style.skyColor);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: liveSkyColor.toParams() },
  cloud: { style: liveStyle.toParams() },
}), '2.8');

const v29Style = resolveSkyStyleSnapshot('2.9');
liveStyle.applyParams(v29Style.cloudStyle);
liveSkyColor.applyParams(v29Style.skyColor);
assert.equal(liveStyle.surfaceLight.enabled.value, 1);
assert.equal(liveStyle.surfaceLight.amount.value, 1);
assert.deepEqual(v29Style.skyColor, v28Style.skyColor);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: liveSkyColor.toParams() },
  cloud: { style: liveStyle.toParams() },
}), '2.9');

const v210Style = resolveSkyStyleSnapshot('2.10');
liveStyle.applyParams(v210Style.cloudStyle);
liveSkyColor.applyParams(v210Style.skyColor);
assert.deepEqual(v210Style.cloudStyle, v29Style.cloudStyle);
assert.equal(liveSkyColor.starField.enabled.value, 1);
assert.equal(liveSkyColor.starField.amount.value, 1);
assert.equal(liveSkyColor.starField.pointThreshold.value, 0.02);
assert.equal(liveSkyColor.starField.pointSoftness.value, 0.06);
assert.equal(liveSkyColor.starField.diffuseStrength.value, 0.08);
assert.equal(liveSkyColor.starField.pointBrightness.value, 0.75);
assert.equal(matchSkyStyleSnapshot({
  atmosphere: { style: liveSkyColor.toParams() },
  cloud: { style: liveStyle.toParams() },
}), '2.10');

// One CPU-owned set of time weights drives both sky and cloud. Midday and the
// approved afternoon view are exact zeros, so editing any V2.7 time palette
// cannot reach V2.6 daylight.
for (const [label, elevation, time] of [
  ['midday', 65, 0.5],
  ['afternoon', 40, 0.625],
]) {
  const weights = timeStyleWeightsFor(Math.sin(elevation * Math.PI / 180), time);
  assert.deepEqual(weights, { morning: 0, evening: 0, night: 0 }, label);
}
const morningWeights = timeStyleWeightsFor(Math.sin(3 * Math.PI / 180), 0.26);
assert.ok(morningWeights.morning > 0);
assert.equal(morningWeights.evening, 0);
assert.equal(morningWeights.night, 0);
const eveningWeights = timeStyleWeightsFor(Math.sin(3 * Math.PI / 180), 0.74);
assert.equal(eveningWeights.morning, 0);
assert.ok(eveningWeights.evening > 0);
assert.equal(eveningWeights.night, 0);
const nightWeights = timeStyleWeightsFor(Math.sin(-65 * Math.PI / 180), 0);
assert.deepEqual(nightWeights, { morning: 0, evening: 0, night: 1 });

// V2.4 is colour-only by contract. The density-field function cannot know the
// module exists, the cloud-shadow pass cannot read it, and the only marcher
// integration point is the final resolved colour after alpha is known.
const densityFieldSource = marcherSource.slice(
  marcherSource.indexOf('export function createCloudDensityField'),
  marcherSource.indexOf('/**\n * Builds the light march'),
);
assert.doesNotMatch(densityFieldSource, /innerPaint|style/);
assert.doesNotMatch(cloudShadowSource, /innerPaint/);
assert.doesNotMatch(densityFieldSource, /whiteTop|sunlitHeight/);
assert.doesNotMatch(cloudShadowSource, /whiteTop|sunlitHeight/);
assert.doesNotMatch(densityFieldSource, /surfaceLight/);
assert.doesNotMatch(cloudShadowSource, /surfaceLight/);
assert.doesNotMatch(densityFieldSource, /lightBlend/);
assert.doesNotMatch(cloudShadowSource, /lightBlend/);
assert.doesNotMatch(densityFieldSource, /timePalette/);
assert.doesNotMatch(cloudShadowSource, /timePalette/);
assert.match(
  marcherSource,
  /applyCloudInnerPaintNode\([\s\S]*scattered[\s\S]*volumeAlpha[\s\S]*style[\s\S]*whiteTopDaylight/,
);
assert.match(
  lightingSource,
  /applyCloudInnerPaintNode[\s\S]*saturate\(float\(alpha\)\)/,
);
assert.match(
  marcherSource,
  /applyCloudWhiteTopNode\([\s\S]*whiteTopHeight[\s\S]*style/,
);
assert.match(
  lightingSource,
  /applyCloudWhiteTopNode[\s\S]*saturate\(float\(alpha\)\)/,
);
assert.match(
  marcherSource,
  /applyCloudLightBlendNode\([\s\S]*march\.sunlitHeight[\s\S]*whiteTopDaylight[\s\S]*style/,
);
assert.match(
  marcherSource,
  /recordSurfaceLight\([\s\S]*surfacePhysicalLight[\s\S]*surfaceSunlight[\s\S]*surfaceSunlitHeight/,
);
assert.match(
  marcherSource,
  /const recordSurfaceLight[\s\S]*coarseDensityNode[\s\S]*const gradient/,
);
assert.match(marcherSource, /CLOUD_SURFACE_NORMAL_RADIUS = 100/);
assert.match(
  marcherSource,
  /surfaceLightAmount[\s\S]*march\.surfaceSunlitHeight[\s\S]*whiteTopHeight/,
);
assert.match(
  marcherSource,
  /applyCloudTopLightNode\([\s\S]*whiteTopPhysicalLight[\s\S]*whiteTopSunlight[\s\S]*whiteTopHeight/,
);
assert.match(
  lightingSource,
  /applyCloudLightBlendNode[\s\S]*keepWhiteTop[\s\S]*saturate\(float\(alpha\)\)[\s\S]*keepWhiteTop\.oneMinus\(\)/,
);
assert.match(
  marcherSource,
  /applyCloudTimePaletteNode\([\s\S]*march\.sunlitHeight[\s\S]*morningLight[\s\S]*eveningLight[\s\S]*skyDarkness[\s\S]*style/,
);
assert.match(
  lightingSource,
  /applyCloudTimePaletteNode[\s\S]*morningEnabled[\s\S]*eveningEnabled[\s\S]*nightEnabled[\s\S]*timeAmount[\s\S]*contourColor/,
);
assert.match(
  lightingSource,
  /applyCloudStyleNode\(radiance, style = null, daylightAmount = 1\)[\s\S]*mix\(physical, styled, saturate\(float\(daylightAmount\)\)\)/,
);
assert.match(
  lightingSource,
  /applyCloudStyleNode\(physical, style, nightFactor\.oneMinus\(\)\)/,
);
assert.match(
  marcherSource,
  /moonLightOpticalDepth[\s\S]*nightFactor[\s\S]*lightDepthNode\([\s\S]*moonDirection/,
);
assert.match(
  lightingSource,
  /cloudMoonDirectionalNode[\s\S]*lightOpticalDepth[\s\S]*moonIllumination[\s\S]*nightFactor/,
);
assert.match(
  skyColorSource,
  /applySkyColorNode[\s\S]*skyDarkness[\s\S]*morningLight[\s\S]*eveningLight[\s\S]*morningEnabled[\s\S]*eveningEnabled[\s\S]*nightEnabled[\s\S]*morningAmount[\s\S]*eveningAmount[\s\S]*nightAmount/,
);
assert.match(
  nightSkySource,
  /starRadianceNode[\s\S]*starField[\s\S]*pointThreshold[\s\S]*pointSoftness[\s\S]*pointCore[\s\S]*diffuseStrength[\s\S]*pointBrightness/,
);

// Every field this lab owns exists, carries the spec's unit, and is reachable
// as a live uniform — a slider that writes a plain property the marcher never
// reads is the failure this catches.
for (const [group, keys] of Object.entries(SHADER_LAB_FIELDS)) {
  for (const key of keys) {
    const field = CLOUD_PARAMS_FIELD_SCHEMA[group][key];
    assert.ok(field, `cloud.${group}.${key} is missing from the schema`);
    assert.equal(typeof field.unit, 'string', `cloud.${group}.${key} has no unit`);
    assert.equal(field.uniform, true, `cloud.${group}.${key} is not a uniform the marcher reads`);
    assert.equal(
      live[group][key].isUniformNode,
      true,
      `cloud.${group}.${key} is not live on the built group`,
    );
  }
}

// Defaults, cell for cell against the spec's cloud.lighting / cloud.shape /
// cirrus / haze / fade tables — the reference's published compatibility surface.
assert.equal(DEFAULT_CLOUD_PARAMS.shape.density, 0.048);
assert.equal(DEFAULT_CLOUD_PARAMS.shape.baseStrength, 1);
assert.equal(DEFAULT_CLOUD_PARAMS.shape.erosionShape, 0);
assert.equal(DEFAULT_CLOUD_PARAMS.shape.erosionScaleBaseMultiplier, 0.5);
assert.equal(DEFAULT_CLOUD_PARAMS.shape.edgeSoftness, 0.05);
assert.equal(DEFAULT_CLOUD_PARAMS.shape.edgeSoftnessFalloff, 1);
assert.equal(DEFAULT_CLOUD_PARAMS.lighting.scatteringAlbedo, 0.9);
assert.equal(DEFAULT_CLOUD_PARAMS.lighting.powderStrength, 1);
assert.equal(DEFAULT_CLOUD_PARAMS.lighting.ambientIntensity, 0.6);
assert.equal(DEFAULT_CLOUD_PARAMS.lighting.baseShadowHeight, 0.6);
assert.equal(DEFAULT_CLOUD_PARAMS.lighting.moonGain, 1);
assert.deepEqual(
  DEFAULT_CLOUD_PARAMS.lighting.groundBounceAlbedo.toArray(),
  [0.18, 0.17, 0.15],
);
assert.equal(DEFAULT_CLOUD_PARAMS.cirrus.scale, 30000);
assert.equal(DEFAULT_CLOUD_PARAMS.cirrus.strength, 0);
assert.equal(DEFAULT_CLOUD_PARAMS.haze.density, 0);
assert.equal(DEFAULT_CLOUD_PARAMS.haze.scale, 40000);
assert.equal(DEFAULT_CLOUD_PARAMS.fade.hazeDensityScale, 1);
assert.equal(DEFAULT_CLOUD_PARAMS.fade.horizonMeltStart, 25000);
assert.equal(DEFAULT_CLOUD_PARAMS.fade.horizonMeltEnd, 40000);
assert.equal(DEFAULT_CLOUD_PARAMS.fade.maxMarchDist, 42000);

// The one atmosphere knob the spec hands to this lab rather than to
// sky-cloud-lab. It stays owned by src/sky/atmosphereParams.js: the shader lab
// reads it, it does not get a second copy inside the cloud groups.
assert.equal(DEFAULT_ATMOSPHERE_PARAMS.multipleScattering, 0.2);
assert.equal(CLOUD_PARAMS_FIELD_SCHEMA.lighting.multipleScattering, undefined);

// ---------------------------------------------------------------------------
// Clamping, derived values, and colour representation
// ---------------------------------------------------------------------------

const clamped = validateSkyParams({
  cloud: {
    lighting: { scatteringAlbedo: 9 },
    shape: { density: -5, erosionShape: 4 },
  },
});
assert.equal(clamped.ok, true, clamped.errors.join(' '));
assert.equal(clamped.value.cloud.lighting.scatteringAlbedo, 1);
assert.equal(clamped.value.cloud.shape.density, 0);
assert.equal(clamped.value.cloud.shape.erosionShape, 1);
// Clamping is reported, not silent — a lab that shows 9 while the shader runs 1
// is a document disagreeing with its own pixels.
assert.equal(clamped.warnings.length, 3, clamped.warnings.join(' '));
assert.ok(clamped.warnings.every((warning) => /was normalized to/.test(warning)));

// `maxMarchDist` is derived, read-only, and always horizonMeltEnd + the margin.
assert.equal(CLOUD_PARAMS_FIELD_SCHEMA.fade.maxMarchDist.derived, true);
const melted = createSkyParams({ cloud: { fade: { horizonMeltEnd: 30000 } } });
assert.equal(melted.cloud.fade.maxMarchDist, 30000 + MAX_MARCH_DIST_MARGIN);

// Colours are linear on both sides of the boundary: [r, g, b] in the document,
// THREE.Color live. groundBounceAlbedo is an albedo, so unlike the sun and moon
// radiance colours it is clamped into 0..1 rather than given HDR headroom.
const colour = validateSkyParams({ cloud: { lighting: { groundBounceAlbedo: [0.4, 0.31, 0.22] } } });
assert.equal(colour.ok, true, colour.errors.join(' '));
assert.equal(colour.value.cloud.lighting.groundBounceAlbedo.isColor, true);
assert.deepEqual(colour.value.cloud.lighting.groundBounceAlbedo.toArray(), [0.4, 0.31, 0.22]);
assert.deepEqual(
  validateSkyParams({ cloud: { lighting: { groundBounceAlbedo: [1.8, 1.4, 1.1] } } })
    .value.cloud.lighting.groundBounceAlbedo.toArray(),
  [1, 1, 1],
);

// The marcher must not take the scene's fog: the cloud image already carries
// its own aerial perspective through cloud.fade.
assert.match(marcherSource, /material\.fog = false/);
assert.match(marcherSource, /createCloudLightingModel\(\{ atmosphere, lighting, style, timeOfDay \}\)/);

// The current model does not use the old Perlin-Worley remap. It samples one packed RGB
// inverted-Worley volume for the broad boundary offset, then samples that same
// volume at the erosion scale. Keep those source-equivalent operations visible
// in the marcher so the discarded lab recipe cannot creep back in.
assert.match(
  marcherSource,
  /const packed = baseShapeNode\.sample\(macroUv\)\.level\(baseLod\)\.toVar\(\);/,
);
assert.match(
  marcherSource,
  /let boundaryOffset = packed\.r\.mul\(baseLow\)\s*\.add\(packed\.g\.mul\(baseMid\)\)\s*\.add\(packed\.b\.mul\(baseHigh\)\)/,
);
assert.match(
  marcherSource,
  /const erosionPacked = baseShapeNode\s*\.sample\(evolved\.div\(erosionScale\)\)\s*\.level\(erosionLod\)/,
);
assert.match(
  marcherSource,
  /const coverageThreshold = weather\s*\.add\(effectiveCoverage\.sub\(1\)\)\s*\.add\(boundaryOffset\.mul\(effectiveCoverage\)\)/,
);

// ---------------------------------------------------------------------------
// A zero erosion multiplier: published, storable, and survivable
// ---------------------------------------------------------------------------
//
// `cloud.shape.erosionScaleBaseMultiplier` publishes 0 as the bottom of its
// range, and 0 there means "no erosion detail" — NOT "detail of size zero".
// Two independent things have to hold for that to be true, and neither is worth
// anything without the other.
//
// The schema has to STORE 0. It used to clamp to 0.001, which put the published
// low end out of reach and made a slider parked at its own minimum clamp and
// warn. That is the spec deviation this section pins shut.
//
// The marcher has to SURVIVE 0. The erosion sample scale is
// `baseScale * multiplier`, so dividing a sample position by that product at
// multiplier 0 is Infinity, then NaN once it reaches the texture fetch, then a
// black or missing cloud layer rather than a cloud layer with no erosion on it.
// Re-flooring the clamp is therefore not the fix for it: that trades a NaN back
// for the spec deviation, and the range check below fails if anyone tries.

// The published range, read out of the spec table rather than transcribed, so a
// doc edited without the code fails as loudly as the reverse.
const erosionScaleSpecRow = /\|\s*`erosionScaleBaseMultiplier`\s*\|([^|]*)\|([^|]*)\|/
  .exec(parameterReference);
assert.ok(erosionScaleSpecRow, 'the spec no longer publishes an erosionScaleBaseMultiplier row');
const erosionScaleSpecRange = /(\d+(?:\.\d+)?)\s*[–—-]\s*(\d+(?:\.\d+)?)/
  .exec(erosionScaleSpecRow[2]);
assert.ok(
  erosionScaleSpecRange,
  `the spec publishes no range for erosionScaleBaseMultiplier: ${erosionScaleSpecRow[2].trim()}`,
);
const erosionScaleField = CLOUD_PARAMS_FIELD_SCHEMA.shape.erosionScaleBaseMultiplier;
assert.equal(Number(erosionScaleSpecRange[1]), 0);
assert.equal(
  erosionScaleField.limit.min,
  Number(erosionScaleSpecRange[1]),
  'the clamp floor leaves the published low end unreachable',
);
assert.equal(erosionScaleField.limit.max, Number(erosionScaleSpecRange[2]));
assert.equal(
  Number(erosionScaleSpecRow[1]),
  DEFAULT_CLOUD_PARAMS.shape.erosionScaleBaseMultiplier,
);

// Storing the published low end is silent: an author who types 0 gets 0 back on
// the document path and on the live uniform, with nothing "normalized to".
const zeroErosion = validateSkyParams({ cloud: { shape: { erosionScaleBaseMultiplier: 0 } } });
assert.equal(zeroErosion.ok, true, zeroErosion.errors.join(' '));
assert.equal(zeroErosion.warnings.length, 0, zeroErosion.warnings.join(' '));
assert.equal(zeroErosion.value.cloud.shape.erosionScaleBaseMultiplier, 0);
const zeroLive = createCloudParams().applyParams({ shape: { erosionScaleBaseMultiplier: 0 } });
assert.equal(zeroLive.shape.erosionScaleBaseMultiplier.value, 0);
assert.equal(zeroLive.toParams().shape.erosionScaleBaseMultiplier, 0);

// The general form of that defect — a slider whose track reaches somewhere its
// own clamp refuses to store — is deliberately NOT re-checked here.
// paramSchema's assertSchemaInvariants rejects it for every field at import
// time, so a schema carrying it cannot load at all, and verify-volumetric-sky
// owns that contract. What that guard cannot see is the narrower defect above,
// where the clamp and the slider track agree with each other and both disagree
// with the published range; that is why the low end is read out of the spec
// rather than compared against the field's own neighbouring number.

/**
 * The body of the balanced `(...)` opening at or after `from`. Cuts the erosion
 * block out of the marcher by its own gate rather than by line numbers, which
 * move. Counting parentheses is enough because that block carries no string
 * literals; one added later would have to be handled here.
 */
function balancedCall(source, from) {
  const open = source.indexOf('(', from);
  assert.notEqual(open, -1, 'no call to cut the erosion block out of');
  let depth = 0;
  for (let i = open; i < source.length; i += 1) {
    if (source[i] === '(') depth += 1;
    else if (source[i] === ')') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, i);
    }
  }
  throw new Error('unbalanced parentheses cutting the erosion block');
}

// The marcher's half of the contract, checked structurally. The multiplier is a
// UNIFORM, so the shader text is identical whether it holds 0 or 0.5 — the zero
// case is a runtime path, not a compiled variant, and there is no second program
// to build here and inspect. What is checkable in-process is that the emitted
// block still carries both of the things that keep that path finite.
const erosionGateAt = marcherSource.indexOf('If(shape.erosionScaleBaseMultiplier');
assert.notEqual(
  erosionGateAt,
  -1,
  'the marcher no longer gates its erosion block on the multiplier',
);
const erosionBlock = balancedCall(marcherSource, erosionGateAt);
// Guard one: the whole erosion contribution branches out at 0, so "no erosion
// detail" skips the sample rather than paying for it and multiplying by zero.
assert.match(erosionBlock, /^shape\.erosionScaleBaseMultiplier\.greaterThan\(/);
// Guard two: the divisor is floored, so any multiplier the gate does let
// through still divides by a non-zero tile.
assert.match(
  erosionBlock,
  /max\(\s*shape\.baseScale\.mul\(shape\.erosionScaleBaseMultiplier\),\s*CLOUD_EROSION_MIN_SCALE/,
);
// Erosion re-samples the packed base-shape volume. Exactly one of
// its two fetches must live inside this gate; the other is the broad shape tap.
assert.equal([...marcherSource.matchAll(/baseShapeNode\s*\.sample\(/g)].length, 2);
assert.match(erosionBlock, /baseShapeNode\s*\.sample\(/);
assert.match(
  erosionBlock,
  /sample\(evolved\.div\(erosionScale\)\)/,
  'the erosion texture coordinate must divide by the floored erosionScale',
);

// The arithmetic itself, swept over the whole published surface rather than the
// single value that broke. `erosionScale` is what the block above divides sample
// positions by, so a finite non-zero tile at every reachable multiplier — zero
// included — is what "a params set with erosionScaleBaseMultiplier 0 produces a
// finite density field" reduces to once the gate and the floor are known to be
// in place. Driven off the real constant and the schema's own bounds, so it
// cannot go on passing against a floor someone has since set to 0.
assert.ok(
  Number.isFinite(CLOUD_EROSION_MIN_SCALE) && CLOUD_EROSION_MIN_SCALE > 0,
  'the erosion tile floor is what stands between a zero multiplier and a divide by zero',
);
const baseScaleField = CLOUD_PARAMS_FIELD_SCHEMA.shape.baseScale;
// The largest numerator the marcher can hand that divisor: the far end of the
// march, where a sample position is furthest from the camera.
const farthestSample = DEFAULT_CLOUD_PARAMS.fade.maxMarchDist;
let erosionScalesChecked = 0;
for (const baseScale of [
  baseScaleField.limit.min,
  baseScaleField.range.min,
  DEFAULT_CLOUD_PARAMS.shape.baseScale,
  baseScaleField.range.max,
]) {
  for (const multiplier of [
    erosionScaleField.limit.min,
    Number.MIN_VALUE,
    1e-6,
    erosionScaleField.range.step,
    DEFAULT_CLOUD_PARAMS.shape.erosionScaleBaseMultiplier,
    erosionScaleField.limit.max,
  ]) {
    const erosionScale = Math.max(baseScale * multiplier, CLOUD_EROSION_MIN_SCALE);
    const where = `baseScale ${baseScale} x multiplier ${multiplier}`;
    assert.ok(
      Number.isFinite(erosionScale) && erosionScale >= CLOUD_EROSION_MIN_SCALE,
      `${where}: erosion tile ${erosionScale} is not usable`,
    );
    assert.ok(
      Number.isFinite(farthestSample / erosionScale),
      `${where}: the erosion sample position is not finite`,
    );
    erosionScalesChecked += 1;
  }
}
assert.equal(erosionScalesChecked, 24);

// ---------------------------------------------------------------------------
// applyParams / toParams round-trip identity
// ---------------------------------------------------------------------------

const authored = {
  cirrus: { scale: 18000, strength: 0.35 },
  fade: { hazeDensityScale: 1.4, horizonMeltEnd: 33000, horizonMeltStart: 12000, maxMarchDist: 35000 },
  haze: { density: 0.22, scale: 26000 },
  lighting: {
    ambientIntensity: 0.42, baseShadowHeight: 0.35, baseShadowStrength: 0.6,
    groundBounceAlbedo: [0.21, 0.2, 0.16], moonGain: 1.6, powderStrength: 0.7,
    scatteringAlbedo: 0.82,
  },
  shape: {
    altitude: 1800, baseScale: 6400, baseStrength: 1.2, baseWeatherHeightEnd: 0.14,
    baseWeatherHeightStart: 0.06, baseWeatherStrength: 0.3, coverage: 0.72,
    density: 0.061, edgeSoftness: 0.09, edgeSoftnessFalloff: 1.4,
    erosionScaleBaseMultiplier: 0.65, erosionShape: 0.4, erosionStrengthBase: 1.3,
    erosionStrengthPeak: 0.8, horizonCoverageAmount: 0.4, horizonCoverageRamp: 18000,
    horizonCoverageStart: 9000, thickness: 3200, weatherScale: 34000,
  },
  wind: { evolutionSpeed: 3, heading: 210, skew: 400, speed: 12 },
};
// Authored above with every one of the 38 fields present, so the loop below
// compares the whole surface rather than whichever subset happened to be typed.
assert.equal(
  Object.values(authored).flatMap((group) => Object.keys(group)).length,
  CLOUD_PARAM_FIELD_COUNT,
);
const applied = createCloudParams().applyParams(authored).toParams();
let roundTripped = 0;
for (const id of CLOUD_PARAM_GROUP_IDS) {
  for (const [key, field] of Object.entries(CLOUD_PARAMS_FIELD_SCHEMA[id])) {
    const actual = field.type === 'color' ? applied[id][key].toArray() : applied[id][key];
    if (field.derived) {
      // The supplied 35000 is replaced by the rule, which is the point of it
      // being read-only rather than merely documented.
      assert.equal(actual, applied.fade.horizonMeltEnd + MAX_MARCH_DIST_MARGIN);
    } else {
      assert.deepEqual(actual, authored[id][key], `cloud.${id}.${key} did not survive the round-trip`);
    }
    roundTripped += 1;
  }
}
assert.equal(roundTripped, CLOUD_PARAM_FIELD_COUNT);
// Applying what was just read back changes nothing: the round-trip is a fixed
// point, which is what lets a lab save, reload and keep authoring.
assert.deepEqual(
  createCloudParams().applyParams(applied).toParams().shape,
  applied.shape,
);

// An unknown key is dropped and reported rather than stored, on both the live
// path and the document path.
const unknown = validateSkyParams({ cloud: { shape: { currentWeather: 'heavyRain' } } });
assert.equal(unknown.ok, true);
assert.equal(unknown.value.cloud.shape.currentWeather, undefined);
assert.ok(unknown.warnings.some((warning) => warning.includes('currentWeather')));

// ---------------------------------------------------------------------------
// The portable document
// ---------------------------------------------------------------------------

const document = createSkyParamsDocument('verification_cloud', {
  label: 'Verification Cloud',
  params: {
    atmosphere: { style: v21Style.skyColor },
    cloud: {
      cirrus: { strength: 0.6 },
      lighting: { scatteringAlbedo: 9 },
      shape: { coverage: 0.46 },
      style: v20Style,
    },
  },
});
assert.equal(document.type, SKY_PARAMS_DOCUMENT_TYPE);
assert.equal(document.version, SKY_PARAMS_SCHEMA_VERSION);
assert.equal(document.label, 'Verification Cloud');
assert.equal(document.params.cloud.lighting.scatteringAlbedo, 1);
assert.equal(document.params.cloud.shape.coverage, 0.46);
assert.equal(document.params.cloud.cirrus.strength, 0.6);
assert.equal(document.params.cloud.style.enabled, true);
assert.equal(document.params.cloud.style.tone.enabled, true);
assert.equal(document.params.atmosphere.style.enabled, true);
assert.equal(document.params.atmosphere.style.palette.enabled, true);
// A partial document is completed, not left partial: every group and every
// field is present after validation, so applying one fully replaces sky state.
assert.deepEqual(
  Object.keys(document.params.cloud).sort(),
  [...CLOUD_PARAM_GROUP_IDS, 'style'].sort(),
);
assert.equal(
  CLOUD_PARAM_GROUP_IDS.flatMap((id) => Object.values(document.params.cloud[id])).length,
  CLOUD_PARAM_FIELD_COUNT,
);
assert.equal(document.params.cloud.shape.altitude, DEFAULT_CLOUD_PARAMS.shape.altitude);

const v1Document = parseSkyParamsDocument({
  ...document,
  params: {
    ...document.params,
    atmosphere: { ...document.params.atmosphere, style: undefined },
    cloud: { ...document.params.cloud, style: undefined },
  },
  version: 1,
});
assert.equal(v1Document.ok, true, v1Document.errors.join(' '));
assert.equal(v1Document.value.version, 9);
assert.equal(v1Document.value.params.atmosphere.style.enabled, false);
assert.equal(v1Document.value.params.atmosphere.style.palette.enabled, false);
assert.equal(v1Document.value.params.atmosphere.style.timePalette.enabled, false);
assert.equal(v1Document.value.params.cloud.style.enabled, false);
assert.equal(v1Document.value.params.cloud.style.tone.enabled, false);
assert.equal(v1Document.value.params.cloud.style.blueShadow.enabled, false);
assert.equal(v1Document.value.params.cloud.style.shadowWash.enabled, false);
assert.equal(v1Document.value.params.cloud.style.innerPaint.enabled, false);
assert.equal(v1Document.value.params.cloud.style.whiteTop.enabled, false);
assert.equal(v1Document.value.params.cloud.style.lightBlend.enabled, false);
assert.equal(v1Document.value.params.cloud.style.timePalette.enabled, false);
assert.ok(v1Document.warnings.some((warning) => warning.includes('migrated')));

const serialized = serializeSkyParamsDocument(document);
const parsed = parseSkyParamsDocument(serialized);
assert.equal(parsed.ok, true, parsed.errors.join(' '));
assert.equal(parsed.warnings.length, 0, parsed.warnings.join(' '));
assert.equal(serializeSkyParamsDocument(parsed.value), serialized);

const future = parseSkyParamsDocument({ ...document, version: 999 });
assert.equal(future.ok, false);
assert.match(future.errors.join(' '), /newer than supported/);

// ---------------------------------------------------------------------------
// Package surface and the style bundle
// ---------------------------------------------------------------------------

assert.equal(packageJson.exports['./cloud']?.default, './src/cloud/index.js');
assert.equal(packageJson.exports['./sky']?.default, './src/sky/index.js');

assert.equal(STYLE_BUNDLE_SLOTS.cloud.documentType, SKY_PARAMS_DOCUMENT_TYPE);
assert.equal(STYLE_BUNDLE_SLOTS.cloud.parseDocument, parseSkyParamsDocument);
const cloudBundle = createStyleBundleDocument('cloud-verification', {
  slots: { cloud: { document } },
});
const resolvedBundle = resolveStyleBundleSettings(cloudBundle);
assert.equal(resolvedBundle.cloud.shape.coverage, 0.46);
assert.equal(resolvedBundle.cloud.cirrus.strength, 0.6);
assert.equal(resolvedBundle.cloud.lighting.groundBounceAlbedo.isColor, true);
// The bundle carries the cloud block and nothing else from the envelope.
assert.deepEqual(
  Object.keys(resolvedBundle.cloud).sort(),
  [...CLOUD_PARAM_GROUP_IDS, 'style'].sort(),
);
assert.equal(resolvedBundle.cloud.style.enabled, true);

const card = LOOK_DEVELOPMENT_LABS_SHOWCASE
  .find((entry) => entry.id === 'cloud-shader');
assert.equal(card.href, '/cloud-shader-lab/');
assert.equal(card.labStatus, 'beta');
assert.equal(card.libraryStatus, 'beta');
assert.equal(card.npm, '@call-me-sensei/toonlab/cloud');

// The routing rule survives the renderer swap: Cloud Shader Lab is its own
// route and must never bounce into Atmospheric Condition Lab.
assert.match(legacyMainSource, /workspace'\) === 'cloud'/);
assert.match(legacyMainSource, /window\.location\.replace\('\/cloud-shader-lab\/'\)/);
assert.match(docs, /Cloud Shader Lab must never route into Atmospheric Condition Lab|never restores an atmospheric condition/);
assert.match(cloudRouteSource, /data-lab-workspace="cloud"/);
assert.match(cloudRouteSource, /labs\/sky-cloud-lab\/ui\/main\.jsx/);
assert.match(labWorkspacesSource, /label: 'Cloud Shader Lab'/);
assert.match(labWorkspacesSource, /id: 'hero-cloud'/);
assert.match(labWorkspacesSource, /id: 'cloud-look'/);
assert.match(labWorkspacesSource, /id: 'cloud-style'/);
assert.match(sharedLabAppSource, /Physical volume/);
assert.match(sharedLabAppSource, /Stylized result/);
assert.match(sharedLabAppSource, /function CloudStyle/);

await import('./verify-cloud-optimization.mjs');

console.log(
  `Cloud Shader verified: ${CLOUD_PARAM_FIELD_COUNT} volumetric fields across `
  + `${CLOUD_PARAM_GROUP_IDS.length} groups, spec defaults and units, clamping reported, `
  + 'a zero erosion multiplier stored without a warning and finite through the '
  + `marcher at ${erosionScalesChecked} scale combinations, `
  + 'applyParams/toParams a fixed point, SkyParams document round-trip, '
  + 'style-bundle cloud slot.',
);
