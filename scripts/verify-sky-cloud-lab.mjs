// Sky & Cloud Lab contract — the PROCEDURAL GENERATION and WORLD half of the
// volumetric system, per docs/sky-cloud-parameters.md "Lab responsibilities".
//
// This file used to verify the painted cloud-source / composition / card-field
// pipeline. Decision 1 of the rebuild replaced that outright, so every claim
// about it is now the equivalent claim about what decides *where cloud exists*:
// the weather map and shape volumes (same seed => same field), the shell and
// coverage parameters, wind, the celestial blocks, the quality tiers that size
// generation, and the SkyParams document all three focused labs read and write.
//
// Deliberately NOT covered here, with the task that covers it:
//   - Pixel-level visual acceptance. The route/workspace ownership, portable
//     hero recipe and deterministic comparison contracts are covered here;
//     browser visual QA remains a separate review gate.
//   - Tiling, the 8³ floor, hostile input and the closed-form sun/moon solver:
//     scripts/verify-volumetric-sky.mjs owns those and is not duplicated.

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  CLOUD_PARAMS_FIELD_SCHEMA,
  CLOUD_BASE_SHAPE_MASTER_DIM,
  CLOUD_BASE_SHAPE_MIN_DIM,
  DEFAULT_HERO_CLOUD_RECIPE,
  HERO_CLOUD_MAP_PADDING,
  HERO_CLOUD_PREVIEW_ALTITUDE,
  HERO_CLOUD_RECIPE_TYPE,
  HERO_CLOUD_RECIPE_VERSION,
  WEATHER_MAP_DEFAULT_RESOLUTION,
  WEATHER_MAP_PROFILE_DEFAULTS,
  WEATHER_MAP_PROFILE_FIELDS,
  WEATHER_MAP_RESOLUTIONS,
  createCloudBaseShapeData,
  createCloudErosionData,
  createHeroCloudRecipe,
  createHeroCloudWeatherTexture,
  createCurlNoiseData,
  createWeatherMapData,
  createWeatherMapProfile,
  getHeroCloudPreviewCenter,
  heroCloudSkyOverrides,
  parseHeroCloudRecipe,
  rasterizeHeroCloudFootprint,
  resolveWeatherMapResolution,
  serializeHeroCloudRecipe,
} from '../src/cloud/index.js';
import {
  AtmosphereSky,
  DEFAULT_ATMOSPHERE_PARAMS,
  DEFAULT_MOON_PARAMS,
  DEFAULT_QUALITY_LEVEL,
  DEFAULT_SKY_PARAMS,
  DEFAULT_SUN_PARAMS,
  DEFAULT_TIME_OF_DAY_PARAMS,
  PRESETS,
  QUALITY_LEVELS,
  QUALITY_LEVEL_NAMES,
  SKY_PARAMS_BLOCK_IDS,
  SKY_PARAMS_DOCUMENT_TYPE,
  SKY_SHADER_DOCUMENT_TYPE,
  createSkyParamsDocument,
  createSkyShaderPresetDocument,
  createSkyTimeKeyframes,
  parseSkyParamsDocument,
  parseSkyShaderPresetDocument,
  resolveQuality,
  sampleSkyTimeKeyframes,
  serializeSkyParamsDocument,
  toSerializableSkyParams,
} from '../src/sky/index.js';
import {
  parseStyleBundleDocument,
  resolveStyleBundleSettings,
} from '../src/styles/index.js';
import {
  AFTERNOON,
  CAMERA_VIEW_OPTIONS,
  COMPARISON_EXPOSURE_BY_LIGHTING,
  EVENING,
  HIGH_DAYLIGHT,
  LIGHTING_VIEW_OPTIONS,
  MORNING,
  NIGHT,
  SUNSET,
  applyLightingView,
  getCloudSurfacePoint,
  getVisibleCloudTop,
  resolveCameraPose,
  resolveCameraView,
  resolveCameraViewId,
  resolveComparisonExposure,
  resolveLightingViewId,
} from '../labs/sky-cloud-lab/ui/comparisonViews.js';
import {
  NO_WEATHER_CONDITION,
  SKY_WEATHER_OPTIONS,
  createSkyCloudLabStore,
  resolveCloudComparisonMode,
  resolveSkyWeatherId,
} from '../labs/sky-cloud-lab/ui/store.js';
import {
  CLOUD_WORKSPACE,
  LAB_WORKSPACES,
  SKY_CLOUD_WORKSPACE,
  SKY_WORKSPACE,
  resolveLabTab,
  resolveLabWorkspace,
} from '../labs/sky-cloud-lab/ui/labWorkspaces.js';

// Review framing is explicit and reproducible. It may move the camera and sun,
// but it never edits the cloud field or the selected style snapshot.
assert.deepEqual(
  CAMERA_VIEW_OPTIONS.map(({ value }) => value),
  ['horizon-side', 'upward', 'skyward', 'above-clouds', 'cloud-top'],
);
assert.deepEqual(
  LIGHTING_VIEW_OPTIONS.map(({ value }) => value),
  ['preset', 'high-daylight', 'morning', 'afternoon', 'evening', 'night'],
);
assert.equal(resolveCameraViewId('missing'), 'upward');
assert.equal(resolveCameraView('horizon-side').target[1], 310);
assert.equal(resolveCameraView('horizon-side').aboveClouds, undefined);
assert.equal(resolveCameraView('above-clouds').aboveClouds, true);
assert.equal(resolveCameraView('cloud-top').aboveClouds, true);
assert.equal(resolveCameraView('cloud-top').lockCloudField, true);
const partlyCloudyTop = getVisibleCloudTop(PRESETS.partlyCloudy);
assert.ok(Math.abs(partlyCloudyTop - 7175.135701960783) < 1e-9);
const flyoverPose = resolveCameraPose('above-clouds', PRESETS.partlyCloudy);
assert.equal(flyoverPose.position[1], partlyCloudyTop + 2600);
assert.ok(
  flyoverPose.target[1] < flyoverPose.position[1],
);
const cloudTopPose = resolveCameraPose('cloud-top', PRESETS.partlyCloudy, { quality: 'ultra' });
const cloudSurface = getCloudSurfacePoint(PRESETS.partlyCloudy, { quality: 'ultra' });
assert.deepEqual(
  [cloudTopPose.position[0], cloudTopPose.position[2]],
  [cloudSurface.x, cloudSurface.z],
);
assert.equal(cloudTopPose.position[1], cloudSurface.y + 8);
assert.equal(cloudTopPose.target[1], cloudTopPose.position[1] - 2);
assert.ok(cloudSurface.y >= PRESETS.partlyCloudy.cloud.shape.altitude);
assert.ok(cloudSurface.y < partlyCloudyTop);
assert.ok(cloudTopPose.position[1] < flyoverPose.position[1]);
assert.deepEqual(COMPARISON_EXPOSURE_BY_LIGHTING, {
  'high-daylight': 0.78,
  morning: 0.56,
  afternoon: 0.74,
  evening: 0.56,
  night: 4,
});
for (const viewId of ['horizon-side', 'upward', 'skyward', 'above-clouds', 'cloud-top']) {
  assert.equal(
    resolveComparisonExposure('high-daylight'),
    COMPARISON_EXPOSURE_BY_LIGHTING['high-daylight'],
    `Exposure must not depend on camera ${viewId}.`,
  );
}
assert.equal(resolveComparisonExposure('preset'), null);
assert.equal(resolveComparisonExposure('custom'), null);
assert.equal(resolveLightingViewId('missing'), 'preset');
assert.equal(resolveLightingViewId('custom'), 'custom');
assert.equal(resolveLightingViewId('sunset'), 'evening');
assert.ok(Math.abs(HIGH_DAYLIGHT.time - 0.5) < 1e-9);
assert.ok(Math.abs(HIGH_DAYLIGHT.elevation - 65) < 1e-9);
assert.ok(Math.abs(HIGH_DAYLIGHT.azimuth - -125.3852333469329) < 1e-9);
assert.ok(Math.abs(MORNING.time - 0.26) < 1e-9);
assert.ok(Math.abs(MORNING.elevation - 3.26232412148278) < 1e-9);
assert.ok(Math.abs(AFTERNOON.time - 0.625) < 1e-9);
assert.ok(Math.abs(AFTERNOON.elevation - 39.855707431618754) < 1e-9);
assert.ok(Math.abs(EVENING.time - 0.74) < 1e-9);
assert.ok(Math.abs(EVENING.elevation - 3.26232412148278) < 1e-9);
assert.equal(SUNSET, EVENING);
assert.ok(Math.abs(EVENING.azimuth - HIGH_DAYLIGHT.azimuth) < 1e-9);
assert.ok(Math.abs(NIGHT.time) < 1e-9);
assert.ok(Math.abs(NIGHT.elevation - -65) < 1e-9);
const comparisonLighting = applyLightingView(DEFAULT_SKY_PARAMS, 'high-daylight');
assert.equal(comparisonLighting.time.time, HIGH_DAYLIGHT.time);
assert.equal(comparisonLighting.time.latitude, HIGH_DAYLIGHT.latitude);
assert.equal(comparisonLighting.sun.elevation, HIGH_DAYLIGHT.elevation);
assert.equal(comparisonLighting.cloud, DEFAULT_SKY_PARAMS.cloud);
const morningLighting = applyLightingView(DEFAULT_SKY_PARAMS, 'morning');
assert.equal(morningLighting.time.time, MORNING.time);
assert.equal(morningLighting.sun.elevation, MORNING.elevation);
assert.equal(morningLighting.cloud, DEFAULT_SKY_PARAMS.cloud);
const afternoonLighting = applyLightingView(DEFAULT_SKY_PARAMS, 'afternoon');
assert.equal(afternoonLighting.time.time, AFTERNOON.time);
assert.equal(afternoonLighting.sun.elevation, AFTERNOON.elevation);
assert.equal(afternoonLighting.cloud, DEFAULT_SKY_PARAMS.cloud);
const eveningLighting = applyLightingView(DEFAULT_SKY_PARAMS, 'evening');
assert.equal(eveningLighting.time.time, EVENING.time);
assert.equal(eveningLighting.sun.elevation, EVENING.elevation);
assert.equal(eveningLighting.cloud, DEFAULT_SKY_PARAMS.cloud);
const nightLighting = applyLightingView(DEFAULT_SKY_PARAMS, 'night');
assert.equal(nightLighting.time.time, NIGHT.time);
assert.equal(nightLighting.sun.elevation, NIGHT.elevation);
assert.equal(nightLighting.cloud, DEFAULT_SKY_PARAMS.cloud);
assert.equal(applyLightingView(DEFAULT_SKY_PARAMS, 'preset'), DEFAULT_SKY_PARAMS);
assert.equal(resolveSkyWeatherId('rain'), 'rain');
assert.equal(resolveSkyWeatherId('not-a-condition'), NO_WEATHER_CONDITION);
assert.ok(SKY_WEATHER_OPTIONS.some(({ id }) => id === 'thunderstorm'));
const cloudReviewStore = createSkyCloudLabStore({
  urlParams: new URLSearchParams('capture=1'),
  workspace: CLOUD_WORKSPACE,
});
const authoredBeforeReviewLight = JSON.stringify(cloudReviewStore.getState().params);
cloudReviewStore.actions.setLightingView('night');
assert.equal(cloudReviewStore.getState().lightingView, 'night');
assert.equal(
  JSON.stringify(cloudReviewStore.getState().params),
  authoredBeforeReviewLight,
  'Comparison light must not enter the shared authored SkyParams document.',
);

// ---------------------------------------------------------------------------
// 1. Procedural generation is deterministic in its seed
// ---------------------------------------------------------------------------

// The canonical weather bake has fixed per-layer z slices. The retained
// top-level seed is serialization compatibility only; changing the profile is
// the source-equivalent way to regenerate a different weather field.
const profile = createWeatherMapProfile();
assert.deepEqual({ ...profile }, { ...WEATHER_MAP_PROFILE_DEFAULTS });
assert.deepEqual(Object.keys(WEATHER_MAP_PROFILE_FIELDS), Object.keys(WEATHER_MAP_PROFILE_DEFAULTS));

const weatherA = createWeatherMapData({ profile, resolution: 256, seed: 73 });
const weatherB = createWeatherMapData({ profile, resolution: 256, seed: 73 });
assert.deepEqual(weatherA.data, weatherB.data, 'Weather-map generation must be deterministic.');
assert.equal(weatherA.resolution, 256);
assert.equal(weatherA.seed, 73);
assert.deepEqual(weatherA.profile, weatherB.profile);
assert.deepEqual(
  weatherA.data,
  createWeatherMapData({ profile, resolution: 256, seed: 74 }).data,
  'The compatibility seed must not perturb the canonical weather field.',
);
// A profile edit is a regeneration trigger too, not only the seed.
assert.notDeepEqual(
  weatherA.data,
  createWeatherMapData({
    profile: createWeatherMapProfile({ coverageBias: 0.35 }),
    resolution: 256,
    seed: 73,
  }).data,
  'A new weather profile must change the generated coverage field.',
);
// The map is a real coverage field, not a flat or empty texture.
assert.ok(weatherA.coverageMean > 0 && weatherA.coverageMean < 1);
assert.ok(weatherA.data.some((value) => value > 0));
assert.ok(new Set(weatherA.data).size > 32);

// The lab picks a resolution from a legal set, and anything else snaps into it
// rather than baking a texture the document then disagrees with.
assert.deepEqual([...WEATHER_MAP_RESOLUTIONS], [256, 512, 1024]);
assert.equal(WEATHER_MAP_DEFAULT_RESOLUTION, 1024);
assert.equal(resolveWeatherMapResolution(384), 256);
assert.equal(resolveWeatherMapResolution(99999), 1024);

const shapeA = createCloudBaseShapeData({ dims: 16, seed: 73 });
assert.deepEqual(
  shapeA.data,
  createCloudBaseShapeData({ dims: 16, seed: 73 }).data,
  'Base-shape volume generation must be deterministic.',
);
assert.deepEqual(
  shapeA.data,
  createCloudBaseShapeData({ dims: 16, seed: 74 }).data,
  'The compatibility seed must not perturb the canonical base-shape volume.',
);
// 32³ rather than 16³ for these two: below 32 the erosion generator has to
// band-limit its three detail channels and warns, and a degenerate field is not
// what the determinism claim is about.
assert.deepEqual(
  createCloudErosionData({ dims: 32, seed: 73 }).data,
  createCloudErosionData({ dims: 32, seed: 73 }).data,
  'Erosion volume generation must be deterministic.',
);
assert.deepEqual(
  createCurlNoiseData({ dims: 32, seed: 73 }).data,
  createCurlNoiseData({ dims: 32, seed: 73 }).data,
  'Curl volume generation must be deterministic.',
);
assert.equal(CLOUD_BASE_SHAPE_MASTER_DIM, 64);
assert.equal(CLOUD_BASE_SHAPE_MIN_DIM, 8);

// ---------------------------------------------------------------------------
// 1b. A hero-cloud doodle authors shape, never scene placement
// ---------------------------------------------------------------------------

const heroRecipe = createHeroCloudRecipe({
  ...DEFAULT_HERO_CLOUD_RECIPE,
  bounds: { baseAltitude: 9999, diameter: 7200, height: 2600 },
  id: 'Hero Cloud / Verify',
  seed: 91,
});
assert.equal(heroRecipe.type, HERO_CLOUD_RECIPE_TYPE);
assert.equal(heroRecipe.version, HERO_CLOUD_RECIPE_VERSION);
assert.equal(heroRecipe.id, 'hero_cloud_verify');
assert.deepEqual(heroRecipe.bounds, { diameter: 7200, height: 2600 });
assert.equal(heroRecipe.position, undefined);
assert.equal(heroRecipe.rotation, undefined);
assert.equal(heroRecipe.transform, undefined);
assert.equal(heroRecipe.bounds.baseAltitude, undefined);
const parsedHeroRecipe = parseHeroCloudRecipe(JSON.parse(serializeHeroCloudRecipe(heroRecipe)));
assert.equal(parsedHeroRecipe.ok, true);
assert.deepEqual(parsedHeroRecipe.value, heroRecipe);
assert.equal(parseHeroCloudRecipe({ ...heroRecipe, version: 999 }).ok, false);
assert.equal(parseHeroCloudRecipe({ ...heroRecipe, type: 'wrong/type' }).ok, false);
assert.equal(parseHeroCloudRecipe(null).ok, false);

const heroRasterA = rasterizeHeroCloudFootprint(heroRecipe, { resolution: 64 });
const heroRasterB = rasterizeHeroCloudFootprint(heroRecipe, { resolution: 64 });
assert.deepEqual(heroRasterA.data, heroRasterB.data);
assert.equal(heroRasterA.width, 64);
assert.ok(heroRasterA.data.some((value) => value > 0));
assert.notDeepEqual(
  heroRasterA.data,
  rasterizeHeroCloudFootprint({ ...heroRecipe, seed: 92 }, { resolution: 64 }).data,
  'Hero-cloud seed must change the organic column-height reconstruction.',
);

const addOnly = rasterizeHeroCloudFootprint({
  ...heroRecipe,
  footprint: {
    ...heroRecipe.footprint,
    strokes: [{ mode: 'add', points: [[0.5, 0.5]], radius: 0.25, strength: 1 }],
  },
}, { resolution: 64 });
const addThenErase = rasterizeHeroCloudFootprint({
  ...heroRecipe,
  footprint: {
    ...heroRecipe.footprint,
    strokes: [
      { mode: 'add', points: [[0.5, 0.5]], radius: 0.25, strength: 1 },
      { mode: 'erase', points: [[0.5, 0.5]], radius: 0.1, strength: 1 },
    ],
  },
}, { resolution: 64 });
const centerPixel = 32 * 64 + 32;
assert.ok(addOnly.data[centerPixel] > addThenErase.data[centerPixel]);

const heroWeatherTexture = createHeroCloudWeatherTexture(heroRecipe, { resolution: 128 });
assert.equal(heroWeatherTexture.isTexture, true);
assert.equal(heroWeatherTexture.image.width, 128);
assert.equal(heroWeatherTexture.image.height, 128);
assert.equal(heroWeatherTexture.userData.toonlabCloudNoise.kind, 'hero-cloud-weather-map');
assert.equal(heroWeatherTexture.userData.toonlabCloudNoise.recipeId, heroRecipe.id);
assert.equal(HERO_CLOUD_MAP_PADDING, 8);
assert.ok(heroWeatherTexture.userData.toonlabCloudNoise.coverageMean > 0);
assert.ok(heroWeatherTexture.userData.toonlabCloudNoise.coverageMean < 0.1);
const heroOverrides = heroCloudSkyOverrides(heroRecipe);
assert.equal(heroOverrides.cloud.shape.altitude, HERO_CLOUD_PREVIEW_ALTITUDE);
assert.equal(heroOverrides.cloud.shape.thickness, heroRecipe.bounds.height);
assert.equal(
  heroOverrides.cloud.shape.weatherScale,
  heroRecipe.bounds.diameter * HERO_CLOUD_MAP_PADDING,
);
assert.equal(heroOverrides.cloud.cirrus.strength, 0);
assert.equal(heroOverrides.cloud.haze.density, 0);
assert.equal(
  getHeroCloudPreviewCenter(heroRecipe).x,
  heroRecipe.bounds.diameter * HERO_CLOUD_MAP_PADDING * 0.5,
);
heroWeatherTexture.dispose();

// ---------------------------------------------------------------------------
// 2. The parameters this lab authors
// ---------------------------------------------------------------------------

// Shell geometry, coverage field, bottom carving and horizon banking — the
// spec's sky-cloud-lab list, each with its published default.
const shape = DEFAULT_SKY_PARAMS.cloud.shape;
assert.equal(shape.altitude, 1400);
assert.equal(shape.thickness, 2800);
assert.equal(shape.coverage, 1);
assert.equal(shape.baseScale, 8000);
assert.equal(shape.weatherScale, 40000);
assert.equal(shape.baseWeatherStrength, 0);
assert.equal(shape.baseWeatherHeightStart, 0.05);
assert.equal(shape.baseWeatherHeightEnd, 0.1);
assert.equal(shape.horizonCoverageAmount, 0);
assert.equal(shape.horizonCoverageStart, 10000);
assert.equal(shape.horizonCoverageRamp, 20000);

// All of wind. `skew` is the only uniform of the four; heading, speed and
// evolutionSpeed are plain numbers so they can change without a GPU upload.
assert.deepEqual(DEFAULT_SKY_PARAMS.cloud.wind, {
  evolutionSpeed: 0, heading: 0, skew: 0, speed: 0,
});
for (const key of ['heading', 'speed', 'evolutionSpeed']) {
  assert.equal(CLOUD_PARAMS_FIELD_SCHEMA.wind[key].uniform, false, `wind.${key} must not be a uniform`);
}
assert.equal(CLOUD_PARAMS_FIELD_SCHEMA.wind.skew.uniform, true);

// All of atmosphere except multipleScattering, which the shader lab owns.
assert.equal(DEFAULT_ATMOSPHERE_PARAMS.rayleigh, 1);
assert.equal(DEFAULT_ATMOSPHERE_PARAMS.turbidity, 3.3);
assert.equal(DEFAULT_ATMOSPHERE_PARAMS.mieDirectionalG, 0.7);
assert.equal(DEFAULT_ATMOSPHERE_PARAMS.skyMultipleScattering, 0.5);
assert.equal(DEFAULT_ATMOSPHERE_PARAMS.fogDensity, 1.25);

// All of sun, and all of time including the moon block.
assert.equal(DEFAULT_SUN_PARAMS.intensity, 6.6);
assert.equal(DEFAULT_SUN_PARAMS.discSize, 0.0003);
assert.equal(DEFAULT_TIME_OF_DAY_PARAMS.time, 0.5);
assert.equal(DEFAULT_TIME_OF_DAY_PARAMS.autoAdvanceSecondsPerDay, 600);
assert.equal(DEFAULT_TIME_OF_DAY_PARAMS.latitude, 45);
assert.equal(DEFAULT_MOON_PARAMS.phase, 0.5);
assert.equal(DEFAULT_MOON_PARAMS.discBrightness, 9);
assert.equal(DEFAULT_MOON_PARAMS.ambient, 0.015);

// godRays and nightSky.
assert.equal(DEFAULT_SKY_PARAMS.godRays.enabled, true);
assert.equal(DEFAULT_SKY_PARAMS.godRays.strength, 2);
assert.equal(DEFAULT_SKY_PARAMS.godRays.maxDistance, 12500);
assert.equal(DEFAULT_SKY_PARAMS.godRays.steps, undefined, 'godRay steps is tier-driven, not a params field');
assert.equal(DEFAULT_SKY_PARAMS.nightSky.intensity, 0.3);

// Quality tier selection. The two tier fields that size procedural generation
// have to agree with the generators' own legal sets, or the lab offers a tier
// that bakes something else.
assert.deepEqual([...QUALITY_LEVEL_NAMES], ['low', 'medium', 'high', 'ultra']);
assert.equal(DEFAULT_QUALITY_LEVEL, 'high');
for (const name of QUALITY_LEVEL_NAMES) {
  const tier = QUALITY_LEVELS[name];
  assert.ok(
    WEATHER_MAP_RESOLUTIONS.includes(tier.weatherMapResolution),
    `${name}.weatherMapResolution ${tier.weatherMapResolution} is not a legal weather-map resolution`,
  );
  assert.ok(tier.baseShapeDims.x >= CLOUD_BASE_SHAPE_MIN_DIM);
  assert.ok(tier.baseShapeDims.x <= CLOUD_BASE_SHAPE_MASTER_DIM);
  assert.deepEqual(resolveQuality(name), tier);
}
assert.equal(QUALITY_LEVELS.low.weatherMapResolution, 256);
assert.equal(QUALITY_LEVELS.ultra.weatherMapResolution, 1024);
assert.deepEqual(QUALITY_LEVELS.low.baseShapeDims, { x: 16, y: 16, z: 16 });
assert.deepEqual(QUALITY_LEVELS.ultra.baseShapeDims, { x: 64, y: 64, z: 64 });

// ---------------------------------------------------------------------------
// 3. The document both labs read and write
// ---------------------------------------------------------------------------

// The store contract: an authored sky is one complete SkyParams document, and
// it survives save/reload unchanged. This replaces the four separate painted
// documents (sky preset, cloud source, cloud look, composition) the retired
// workspace manifest stitched together.
assert.equal(SKY_PARAMS_DOCUMENT_TYPE, 'toonlab/sky-params');
assert.deepEqual(
  [...SKY_PARAMS_BLOCK_IDS],
  ['atmosphere', 'sun', 'time', 'cloud', 'noise', 'godRays', 'nightSky'],
);

const world = createSkyParamsDocument('sky-cloud-verification', {
  label: 'Sky Cloud Verification',
  params: {
    atmosphere: { turbidity: 6.4 },
    cloud: {
      shape: { altitude: 2200, coverage: 0.55, horizonCoverageAmount: 0.8, thickness: 3600 },
      style: { enabled: true, amount: 0.8, tone: { enabled: true } },
      wind: { heading: 135, speed: 8 },
    },
    godRays: { strength: 3.5 },
    nightSky: { intensity: 0.42 },
    noise: { weather: { profile: { coverageBias: 0.2 }, resolution: 512, seed: 4242 } },
    sun: { elevation: 22, intensity: 5.1 },
    time: { latitude: -33, moon: { phase: 0.25 }, time: 0.78 },
  },
});
assert.equal(world.type, SKY_PARAMS_DOCUMENT_TYPE);
assert.deepEqual(Object.keys(world.params).sort(), [...SKY_PARAMS_BLOCK_IDS].sort());
assert.equal(world.params.cloud.shape.altitude, 2200);
assert.equal(world.params.cloud.wind.heading, 135);
assert.equal(world.params.cloud.style.enabled, true);
assert.equal(world.params.cloud.style.tone.enabled, true);
assert.equal(world.params.noise.weather.resolution, 512);
assert.equal(world.params.noise.weather.seed, 4242);
assert.equal(world.params.noise.weather.profile.coverageBias, 0.2);
assert.equal(world.params.time.latitude, -33);
assert.equal(world.params.time.moon.phase, 0.25);

const savedText = serializeSkyParamsDocument(world);
const reloaded = parseSkyParamsDocument(savedText);
assert.equal(reloaded.ok, true, reloaded.errors.join(' '));
assert.equal(reloaded.warnings.length, 0, reloaded.warnings.join(' '));
assert.equal(
  serializeSkyParamsDocument(reloaded.value),
  savedText,
  'A saved sky must reload byte-identically or the lab cannot round-trip.',
);
// The serialized form is plain JSON: colours are [r, g, b] triples, never a
// THREE.Color collapsed to an sRGB hex integer.
const serializedParams = toSerializableSkyParams(world.params);
assert.ok(Array.isArray(serializedParams.cloud.lighting.groundBounceAlbedo));
assert.equal(serializedParams.cloud.lighting.groundBounceAlbedo.length, 3);
assert.ok(Array.isArray(serializedParams.cloud.style.tone.shadowColor));
assert.ok(Array.isArray(serializedParams.sun.color));
assert.ok(Array.isArray(serializedParams.time.moon.color));

// The reloaded seed and profile regenerate exactly the field they were saved
// with — the whole point of putting them in the document.
const reloadedWeather = reloaded.value.params.noise.weather;
assert.deepEqual(
  createWeatherMapData({
    profile: reloadedWeather.profile,
    resolution: reloadedWeather.resolution,
    seed: reloadedWeather.seed,
  }).data,
  createWeatherMapData({
    profile: world.params.noise.weather.profile,
    resolution: world.params.noise.weather.resolution,
    seed: world.params.noise.weather.seed,
  }).data,
);

const migratedFuture = parseSkyParamsDocument({ ...world, version: 999 });
assert.equal(migratedFuture.ok, false);
assert.match(migratedFuture.errors.join(' '), /newer than supported/);

// ---------------------------------------------------------------------------
// 4. Shared sky document compatibility and focused lab routes
// ---------------------------------------------------------------------------

// The production SkySystem powers all three routes. Legacy sky-shader documents
// still parse because downstream consumers continue to use that public surface.
const sky = createSkyShaderPresetDocument('verification-atmosphere', {
  label: 'Verification Atmosphere',
});
assert.equal(sky.type, SKY_SHADER_DOCUMENT_TYPE);
assert.equal(sky.version, 2);
assert.ok(sky.timeKeyframes.length >= 2);
assert.equal(sky.atmosphere.turbidity, 3.1, 'Call Me Sensei must be the default atmosphere.');
assert.ok(
  sky.timeKeyframes.some((keyframe) => keyframe.id === 'sensei-day'),
  'The Genshin-inspired Call Me Sensei daylight curve must be the product default.',
);
assert.equal(sky.hour, undefined, 'Current preview/runtime time must not serialize into the style.');

const cyclic = createSkyTimeKeyframes([
  {
    belowHorizonTint: [0, 0, 0], contrast: 1, exposure: 1, horizonGlow: 0,
    horizonGlowColor: [0, 0, 0], horizonTint: [0, 0, 0], hour: 23,
    id: 'late', label: 'Late', saturation: 1, zenithTint: [0, 0, 0],
  },
  {
    belowHorizonTint: [1, 1, 1], contrast: 2, exposure: 2, horizonGlow: 1,
    horizonGlowColor: [1, 1, 1], horizonTint: [1, 1, 1], hour: 1,
    id: 'early', label: 'Early', saturation: 2, zenithTint: [1, 1, 1],
  },
]);
const midnight = sampleSkyTimeKeyframes(cyclic, 0);
assert.equal(midnight.from.id, 'late');
assert.equal(midnight.to.id, 'early');
assert.ok(Math.abs(midnight.amount - 0.5) < 1e-9);
assert.ok(midnight.zenithTint.every((channel) => channel > 0 && channel < 1));
const duplicate = createSkyTimeKeyframes([...cyclic, { ...cyclic[0], hour: 1, id: 'replacement' }]);
assert.equal(duplicate.length, 2);
assert.equal(duplicate.find((entry) => entry.hour === 1).id, 'replacement');

const migratedSky = parseSkyShaderPresetDocument({
  id: 'old-sky', label: 'Old Sky', settings: {}, type: SKY_SHADER_DOCUMENT_TYPE, version: 1,
});
assert.equal(migratedSky.ok, true);
assert.ok(migratedSky.warnings.some((warning) => warning.includes('migrated')));

const atmosphere = new AtmosphereSky({ ...sky, hour: 18 });
assert.equal(atmosphere.skyMesh.cloudCoverage.value, 0);
assert.equal(atmosphere.skyMesh.cloudDensity.value, 0);
assert.equal(atmosphere.setTime(0).hour, 0);
atmosphere.dispose();

const skyRoute = await readFile(new URL('../sky-lab/index.html', import.meta.url), 'utf8');
const cloudRoute = await readFile(new URL('../cloud-shader-lab/index.html', import.meta.url), 'utf8');
const integrationRoute = await readFile(new URL('../sky-cloud-lab/index.html', import.meta.url), 'utf8');
const labEngine = await readFile(
  new URL('../labs/sky-cloud-lab/ui/engine.js', import.meta.url),
  'utf8',
);
const labApp = await readFile(
  new URL('../labs/sky-cloud-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
assert.match(skyRoute, /data-lab-workspace="sky" data-initial-tab="preview"/);
assert.match(cloudRoute, /data-lab-workspace="cloud" data-initial-tab="preview"/);
assert.match(integrationRoute, /data-lab-workspace="integration" data-initial-tab="preview"/);
assert.match(skyRoute, /labs\/sky-cloud-lab\/ui\/main\.jsx/);
assert.match(cloudRoute, /labs\/sky-cloud-lab\/ui\/main\.jsx/);
assert.deepEqual(
  LAB_WORKSPACES[CLOUD_WORKSPACE].tabs.map(({ id }) => id),
  ['preview', 'hero-cloud', 'cloud-look', 'cloud-style'],
);
assert.deepEqual(
  LAB_WORKSPACES[SKY_WORKSPACE].tabs.map(({ id }) => id),
  ['preview', 'atmosphere', 'sky-style', 'celestial'],
);
assert.deepEqual(
  LAB_WORKSPACES[SKY_CLOUD_WORKSPACE].tabs.map(({ id }) => id),
  ['preview', 'cloud-world', 'generation', 'environment'],
);
assert.equal(resolveLabTab(SKY_WORKSPACE, 'atmosphere'), 'atmosphere');
assert.equal(resolveLabTab(SKY_WORKSPACE, 'hero-cloud'), 'preview');
assert.equal(resolveLabTab(CLOUD_WORKSPACE, 'assets'), 'preview');
assert.equal(resolveLabWorkspace('missing').id, SKY_CLOUD_WORKSPACE);
assert.equal(resolveCloudComparisonMode('physical'), 'physical');
assert.equal(resolveCloudComparisonMode('missing'), 'styled');
assert.match(labEngine, /CAPTURE_SETTLE_FRAMES = 96/);
assert.match(labEngine, /captureFrames >= CAPTURE_SETTLE_FRAMES/);
assert.match(labEngine, /captureFrames = 0/);
assert.match(labEngine, /skyMorningLight/);
assert.match(labEngine, /skyEveningLight/);
assert.match(labEngine, /createHeroCloudWeatherTexture/);
assert.match(labEngine, /applyPhysicalCloudBaseline/);
assert.match(labEngine, /OrbitControls/);
assert.match(labEngine, /setCameraMode/);
assert.match(labEngine, /resetCamera/);
assert.match(labApp, /Physical volume/);
assert.match(labApp, /Stylized result/);
assert.match(labApp, /HeroCloudRecipe JSON/);
assert.match(labApp, /BrandLockup/);
assert.match(labApp, /SearchSelect/);
assert.match(labApp, />Update</);
assert.match(labApp, />Save As…</);
assert.match(labApp, /Export cloud treatment bundle/);
assert.match(labApp, /StyleBundleExportPrompt/);
assert.match(labApp, /Export preview PNG/);
assert.match(labApp, /Export footprint PNG/);
assert.match(labApp, /\['ultra', 'Maximum'\]/);
assert.doesNotMatch(labApp, />ultra</i);
assert.doesNotMatch(labApp, />Snapshot</);
assert.doesNotMatch(labApp, /title="[^\"]*V2\./);

// Named style persistence is not a lab-only blob: reopen and update preserve
// the public typed SkyParams document, and the bundle resolves through the
// same runtime style contract consumers use.
const memory = new Map();
const localStorage = {
  getItem: (key) => memory.get(key) ?? null,
  removeItem: (key) => memory.delete(key),
  setItem: (key, value) => memory.set(key, String(value)),
};
globalThis.localStorage = localStorage;
globalThis.window = { localStorage };
const styleStore = createSkyCloudLabStore({
  urlParams: new URLSearchParams(),
  workspace: CLOUD_WORKSPACE,
});
styleStore.actions.setParam(['cloud', 'shape', 'coverage'], 0.42);
const savedStyle = styleStore.actions.saveStyleAs('Verifier Cloud');
assert.equal(savedStyle.ok, true, savedStyle.errors?.join(' '));
const styleId = savedStyle.document.id;
styleStore.actions.setParam(['cloud', 'shape', 'coverage'], 0.58);
const updatedStyle = styleStore.actions.updateStyle('Verifier Cloud Updated');
assert.equal(updatedStyle.ok, true, updatedStyle.errors?.join(' '));

const reopenedStyleStore = createSkyCloudLabStore({
  urlParams: new URLSearchParams(),
  workspace: SKY_WORKSPACE,
});
assert.ok(reopenedStyleStore.getState().savedStyles.some(({ id }) => id === styleId));
assert.equal(reopenedStyleStore.actions.openStyle(styleId), true);
assert.equal(reopenedStyleStore.getState().styleName, 'Verifier Cloud Updated');
assert.equal(reopenedStyleStore.getState().params.cloud.shape.coverage, 0.58);
const exportedStyle = parseSkyParamsDocument(reopenedStyleStore.actions.exportStyleDocument());
assert.equal(exportedStyle.ok, true, exportedStyle.errors?.join(' '));
assert.equal(exportedStyle.value.id, styleId);
assert.throws(() => reopenedStyleStore.actions.exportStyleBundle(), /full SkyParams export/);
const exportedBundle = parseStyleBundleDocument(styleStore.actions.exportStyleBundle());
assert.equal(exportedBundle.ok, true, exportedBundle.errors?.join(' '));
assert.equal(resolveStyleBundleSettings(exportedBundle.value).cloud.shape.coverage, 0.58);
assert.equal(reopenedStyleStore.actions.deleteStyle(styleId), true);
assert.ok(!reopenedStyleStore.getState().savedStyles.some(({ id }) => id === styleId));

await import('./verify-sky-lab-authoring.mjs');
await import('./verify-cloud-lab-authoring.mjs');

console.log(
  'Sky & Cloud Lab verified: deterministic weather/shape/erosion/curl generation, '
  + `${WEATHER_MAP_RESOLUTIONS.length} legal weather resolutions, `
  + `${QUALITY_LEVEL_NAMES.length} tiers agreeing with the generators, `
  + 'placement-free hero-cloud doodles, focused Cloud/Sky/Integration workspaces, '
  + 'and the shared SkyParams document round-trip.',
);
