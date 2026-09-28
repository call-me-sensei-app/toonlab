import {
  azimuthOf,
  elevationOf,
  resolveQuality,
  sunDirectionAt,
} from '../../../src/sky/index.js';
import {
  CLOUD_BASE_CHANNEL_STRENGTHS,
  CLOUD_EROSION_CHANNEL_STRENGTHS,
  CLOUD_EROSION_MIN_SCALE,
  CLOUD_WEATHER_CARVE_WIDTH,
} from '../../../src/cloud/cloudVolume.js';
import { getCloudBaseShapeVolume } from '../../../src/cloud/noise/baseShapeVolume.js';
import { getWeatherMap } from '../../../src/cloud/noise/weatherMap.js';

export const DEFAULT_CAMERA_VIEW = 'upward';
export const DEFAULT_LIGHTING_VIEW = 'preset';

// Exposure values are calibrated once from the canonical horizon-side view.
// Controlled comparisons reuse the value for every camera, so moving close to
// a bright cloud cannot make that same cloud turn grey through auto exposure.
// Sky/integration preset lighting can meter automatically. Cloud comparisons
// must keep exposure fixed even when the optional color treatment changes.
export const COMPARISON_EXPOSURE_BY_LIGHTING = Object.freeze({
  'high-daylight': 0.78,
  morning: 0.56,
  afternoon: 0.74,
  evening: 0.56,
  night: 4,
});

const CAMERA_POSITION = Object.freeze([
  -1605.9791716481948,
  283.46842569075056,
  -981.3420432373877,
]);
const CAMERA_TARGET_XZ = Object.freeze([
  -1835.9416644531116,
  -1088.0876584383047,
]);
const CAMERA_FORWARD_XZ = Object.freeze([-0.9072, -0.4207]);
const WEATHER_MAX_CACHE = new WeakMap();
const WEATHER_PEAK_CACHE = new WeakMap();
const CLOUD_SHAPE_MAX_OFFSET = CLOUD_BASE_CHANNEL_STRENGTHS
  .reduce((total, weight) => total + weight, 0);
const CLOUD_SURFACE_DENSITY = 0.05;
const CLOUD_SURFACE_STEPS = 512;

export const CAMERA_VIEWS = Object.freeze({
  'horizon-side': Object.freeze({
    id: 'horizon-side',
    label: 'Horizon side — 6°',
    description: 'Shows more of the cloud side and less of its underside.',
    position: CAMERA_POSITION,
    target: Object.freeze([CAMERA_TARGET_XZ[0], 310, CAMERA_TARGET_XZ[1]]),
  }),
  upward: Object.freeze({
    id: 'upward',
    label: 'Upward — 10°',
    description: 'The preserved V1–V2.4 comparison camera.',
    position: CAMERA_POSITION,
    target: Object.freeze([CAMERA_TARGET_XZ[0], 329.8610545680153, CAMERA_TARGET_XZ[1]]),
  }),
  skyward: Object.freeze({
    id: 'skyward',
    label: 'Skyward — 16°',
    description: 'Shows more underside for stress-testing interior shading.',
    position: CAMERA_POSITION,
    target: Object.freeze([CAMERA_TARGET_XZ[0], 356, CAMERA_TARGET_XZ[1]]),
  }),
  'above-clouds': Object.freeze({
    id: 'above-clouds',
    label: 'Above clouds — flyover',
    description: 'Places the camera above the cloud shell and looks diagonally across its sunlit top.',
    aboveClouds: true,
    heightAboveCloud: 2600,
    lookBelowCloudTop: 1900,
    lookDistance: 14000,
  }),
  'cloud-top': Object.freeze({
    id: 'cloud-top',
    label: 'Cloud surface — walking',
    description: 'Places the camera at eye level on a dense cloud surface and looks almost horizontally across it.',
    aboveClouds: true,
    lockCloudField: true,
    eyeHeight: 8,
    lookDrop: 2,
    lookDistance: 900,
  }),
});

export const CAMERA_VIEW_OPTIONS = Object.freeze(
  Object.values(CAMERA_VIEWS).map(({ id, label, description }) => Object.freeze({
    description,
    label,
    value: id,
  })),
);

export const LIGHTING_VIEW_OPTIONS = Object.freeze([
  Object.freeze({
    description: 'Uses the selected weather preset’s authored sun and clock.',
    label: 'Preset time',
    value: 'preset',
  }),
  Object.freeze({
    description: 'Controlled high-day comparison with the sun kept on the same left/front bearing.',
    label: 'High daylight — 12:00 / 65°',
    value: 'high-daylight',
  }),
  Object.freeze({
    description: 'Controlled morning comparison with the low sun kept on the daylight bearing.',
    label: 'Morning — 06:14 / 3°',
    value: 'morning',
  }),
  Object.freeze({
    description: 'Controlled afternoon comparison using the unchanged V2.6 day treatment.',
    label: 'Afternoon — 15:00 / 40°',
    value: 'afternoon',
  }),
  Object.freeze({
    description: 'Controlled evening comparison with the low sun kept on the daylight bearing.',
    label: 'Evening — 17:46 / 3°',
    value: 'evening',
  }),
  Object.freeze({
    description: 'Controlled midnight comparison with the moon kept on the same left/front bearing.',
    label: 'Night — 00:00 / moon 65°',
    value: 'night',
  }),
]);

const LIGHTING_VIEW_IDS = new Set(LIGHTING_VIEW_OPTIONS.map(({ value }) => value));
const HIGH_DAYLIGHT_TIME = 0.5;
const HIGH_DAYLIGHT_LATITUDE = 25;
const HIGH_DAYLIGHT_SUN_BEARING = -125.3852333469329;
const MORNING_TIME = 0.26;
const AFTERNOON_TIME = 0.625;
const EVENING_TIME = 0.74;
const NIGHT_TIME = 0;
const NIGHT_SUN_BEARING = HIGH_DAYLIGHT_SUN_BEARING + 180;

function foldBearing(degrees) {
  const value = ((degrees + 180) % 360 + 360) % 360;
  return value - 180;
}

function createFixedLighting(time, latitude, bearing) {
  const unswungDirection = sunDirectionAt(time, latitude, 0);
  const celestialAzimuth = foldBearing(bearing - azimuthOf(unswungDirection));
  const direction = sunDirectionAt(time, latitude, celestialAzimuth);
  return Object.freeze({
    azimuth: azimuthOf(direction),
    celestialAzimuth,
    elevation: elevationOf(direction),
    latitude,
    time,
  });
}

export const HIGH_DAYLIGHT = createFixedLighting(
  HIGH_DAYLIGHT_TIME,
  HIGH_DAYLIGHT_LATITUDE,
  HIGH_DAYLIGHT_SUN_BEARING,
);
export const MORNING = createFixedLighting(
  MORNING_TIME,
  HIGH_DAYLIGHT_LATITUDE,
  HIGH_DAYLIGHT_SUN_BEARING,
);
export const AFTERNOON = createFixedLighting(
  AFTERNOON_TIME,
  HIGH_DAYLIGHT_LATITUDE,
  HIGH_DAYLIGHT_SUN_BEARING,
);
export const EVENING = createFixedLighting(
  EVENING_TIME,
  HIGH_DAYLIGHT_LATITUDE,
  HIGH_DAYLIGHT_SUN_BEARING,
);
export const SUNSET = EVENING;
export const NIGHT = createFixedLighting(
  NIGHT_TIME,
  HIGH_DAYLIGHT_LATITUDE,
  NIGHT_SUN_BEARING,
);
const FIXED_LIGHTING_VIEWS = Object.freeze({
  'high-daylight': HIGH_DAYLIGHT,
  morning: MORNING,
  afternoon: AFTERNOON,
  evening: EVENING,
  night: NIGHT,
});

export function resolveCameraView(value) {
  return CAMERA_VIEWS[value] ?? CAMERA_VIEWS[DEFAULT_CAMERA_VIEW];
}

export function resolveCameraViewId(value) {
  return resolveCameraView(value).id;
}

/** Returns a camera-independent exposure for a controlled lighting view. */
export function resolveComparisonExposure(value, { workspace } = {}) {
  const exposure = COMPARISON_EXPOSURE_BY_LIGHTING[value];
  if (Number.isFinite(exposure)) return exposure;
  // Neutral multiplier: atmosphere.exposure remains the authored brightness.
  return workspace === 'cloud' ? 1 : null;
}

function getWeatherMaximum(weather = {}) {
  const texture = getWeatherMap(weather);
  const cached = WEATHER_MAX_CACHE.get(texture);
  if (cached !== undefined) return cached;

  const data = texture.image?.data;
  let maximum = 0;
  for (let index = 0; index < (data?.length ?? 0); index += 4) {
    maximum = Math.max(maximum, data[index] / 255);
  }
  WEATHER_MAX_CACHE.set(texture, maximum);
  return maximum;
}

function repeatIndex(value, size) {
  return ((value % size) + size) % size;
}

function mixNumber(start, end, amount) {
  return start + (end - start) * amount;
}

function clamp01(value) {
  return Math.min(Math.max(value, 0), 1);
}

function smoothStep(start, end, value) {
  const amount = clamp01((value - start) / Math.max(end - start, 1e-6));
  return amount * amount * (3 - 2 * amount);
}

function sampleMap(texture, u, v, channel = 0) {
  const { data, width, height } = texture.image;
  const x = u * width - 0.5;
  const y = v * height - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const mixX = x - x0;
  const mixY = y - y0;
  const read = (sampleX, sampleY) => data[
    (repeatIndex(sampleY, height) * width + repeatIndex(sampleX, width)) * 4 + channel
  ] / 255;
  const lower = mixNumber(read(x0, y0), read(x0 + 1, y0), mixX);
  const upper = mixNumber(read(x0, y0 + 1), read(x0 + 1, y0 + 1), mixX);
  return mixNumber(lower, upper, mixY);
}

function sampleVolume(texture, u, v, w, channel) {
  const { data, width, height, depth } = texture.image;
  const x = u * width - 0.5;
  const y = v * height - 0.5;
  const z = w * depth - 0.5;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const mixX = x - x0;
  const mixY = y - y0;
  const mixZ = z - z0;
  const read = (sampleX, sampleY, sampleZ) => data[
    (
      (repeatIndex(sampleZ, depth) * height + repeatIndex(sampleY, height)) * width
      + repeatIndex(sampleX, width)
    ) * 4 + channel
  ] / 255;
  const sampleSlice = (sampleZ) => {
    const lower = mixNumber(read(x0, y0, sampleZ), read(x0 + 1, y0, sampleZ), mixX);
    const upper = mixNumber(
      read(x0, y0 + 1, sampleZ),
      read(x0 + 1, y0 + 1, sampleZ),
      mixX,
    );
    return mixNumber(lower, upper, mixY);
  };
  return mixNumber(sampleSlice(z0), sampleSlice(z0 + 1), mixZ);
}

function getWeatherPeak(weather = {}) {
  const texture = getWeatherMap(weather);
  const cached = WEATHER_PEAK_CACHE.get(texture);
  if (cached) return cached;

  const { data, width, height } = texture.image;
  let bestIndex = 0;
  let bestValue = -1;
  for (let index = 0; index < data.length; index += 4) {
    if (data[index] > bestValue) {
      bestValue = data[index];
      bestIndex = index / 4;
    }
  }
  const peak = Object.freeze({
    u: (bestIndex % width + 0.5) / width,
    v: (Math.floor(bestIndex / width) + 0.5) / height,
  });
  WEATHER_PEAK_CACHE.set(texture, peak);
  return peak;
}

function nearestRepeat(fraction, scale, reference) {
  const first = fraction * scale;
  return first + Math.round((reference - first) / scale) * scale;
}

function densityAt(params, x, y, z, weatherValue, baseShape) {
  const shape = params.cloud?.shape ?? params.shape ?? {};
  const wind = params.cloud?.wind ?? params.wind ?? {};
  const thickness = Math.max(shape.thickness, 1);
  const height = clamp01((y - shape.altitude) / thickness);
  const heading = (wind.heading ?? 0) * Math.PI / 180;
  const skew = (wind.skew ?? 0) * height;
  const sampleX = x - Math.sin(heading) * skew;
  const sampleZ = z - Math.cos(heading) * skew;
  const baseScale = Math.max(shape.baseScale, 1);
  const base = [0, 1, 2].map((channel) => sampleVolume(
    baseShape,
    sampleX / baseScale,
    y / baseScale,
    sampleZ / baseScale,
    channel,
  ));
  const baseOffset = base.reduce(
    (total, value, index) => total + value * CLOUD_BASE_CHANNEL_STRENGTHS[index],
    0,
  ) * Math.max(shape.baseStrength, 0);
  const coverage = Math.max(shape.coverage, 0);
  const expectedTop = weatherValue + coverage - 1 + baseOffset * coverage;
  const localHeight = clamp01(height / Math.max(expectedTop, 1e-3));
  const erosionScale = Math.max(
    baseScale * Math.max(shape.erosionScaleBaseMultiplier, 0),
    CLOUD_EROSION_MIN_SCALE,
  );
  const erosion = [0, 1, 2].map((channel) => sampleVolume(
    baseShape,
    sampleX / erosionScale,
    y / erosionScale,
    sampleZ / erosionScale,
    channel,
  ));
  const erosionShape = clamp01(shape.erosionShape);
  const erosionOffset = erosion.reduce((total, value, index) => (
    total
      + mixNumber(1 - value, value, erosionShape)
        * CLOUD_EROSION_CHANNEL_STRENGTHS[index]
  ), 0) * mixNumber(
    Math.max(shape.erosionStrengthBase, 0),
    Math.max(shape.erosionStrengthPeak, 0),
    localHeight,
  );
  const threshold = weatherValue + coverage - 1 + (baseOffset - erosionOffset) * coverage;
  const heightKm = Math.max(height, 0) * thickness * 0.001;
  const edge = Math.max(
    Math.max(shape.edgeSoftness, 0) / Math.pow(
      Math.max(shape.edgeSoftnessFalloff, 1e-3),
      heightKm,
    ),
    1e-4,
  );
  const topFade = smoothStep(-edge, edge, threshold - height);
  const baseFade = smoothStep(-edge, edge, height - erosionOffset * coverage);
  const baseBandEnd = Math.max(
    shape.baseWeatherHeightEnd,
    shape.baseWeatherHeightStart + 1e-3,
  );
  const baseBand = smoothStep(shape.baseWeatherHeightStart, baseBandEnd, height);
  const requiredCoverage = (1 - baseBand) * Math.max(shape.baseWeatherStrength, 0);
  const weatherFade = smoothStep(
    requiredCoverage - CLOUD_WEATHER_CARVE_WIDTH,
    requiredCoverage,
    weatherValue,
  );
  return topFade * baseFade * weatherFade;
}

/** Finds a dense, deterministic point and the rendered cloud surface there. */
export function getCloudSurfacePoint(params = {}, { quality = 'high' } = {}) {
  const shape = params.cloud?.shape ?? params.shape ?? {};
  const weather = params.noise?.weather ?? {};
  const weatherTexture = getWeatherMap(weather);
  const weatherScale = Math.max(shape.weatherScale, 1);
  const peak = getWeatherPeak(weather);
  const x = nearestRepeat(peak.u, weatherScale, CAMERA_POSITION[0]);
  const z = nearestRepeat(peak.v, weatherScale, CAMERA_POSITION[2]);
  const weatherValue = sampleMap(weatherTexture, x / weatherScale, z / weatherScale);
  const resolvedQuality = resolveQuality(quality);
  const baseShape = getCloudBaseShapeVolume({
    dims: resolvedQuality.baseShapeDims,
    seed: weather.seed ?? 1,
  });
  const altitude = Math.max(shape.altitude, 0);
  const thickness = Math.max(shape.thickness, 1);
  let surface = altitude;
  for (let stepIndex = 0; stepIndex <= CLOUD_SURFACE_STEPS; stepIndex += 1) {
    const y = altitude + thickness * stepIndex / CLOUD_SURFACE_STEPS;
    if (densityAt(params, x, y, z, weatherValue, baseShape) >= CLOUD_SURFACE_DENSITY) {
      surface = y;
    }
  }
  return Object.freeze({ x, y: surface, z });
}

/**
 * Highest altitude at which the current density field can remain visible.
 *
 * The cloud shell is only a march boundary. Its generated columns end at the
 * weather value plus the largest base-shape displacement, with edge softness
 * providing the final fade. Using that authored density bound keeps aerial
 * cameras near the cloud instead of thousands of metres above empty shell.
 */
export function getVisibleCloudTop(params = {}) {
  const shape = params.cloud?.shape ?? params.shape ?? {};
  const weather = params.noise?.weather ?? {};
  const altitude = Number.isFinite(shape.altitude) ? Math.max(shape.altitude, 0) : 0;
  const thickness = Number.isFinite(shape.thickness) ? Math.max(shape.thickness, 1) : 1;
  const coverage = Number.isFinite(shape.coverage) ? Math.max(shape.coverage, 0) : 0;
  const baseStrength = Number.isFinite(shape.baseStrength) ? Math.max(shape.baseStrength, 0) : 0;
  const edgeSoftness = Number.isFinite(shape.edgeSoftness) ? Math.max(shape.edgeSoftness, 0) : 0;
  const topFraction = Math.min(Math.max(
    getWeatherMaximum(weather)
      + coverage
      - 1
      + baseStrength * CLOUD_SHAPE_MAX_OFFSET * coverage
      + edgeSoftness,
    0,
  ), 1);
  return altitude + thickness * topFraction;
}

export function resolveCameraPose(value, params = {}, options = {}) {
  const view = resolveCameraView(value);
  if (Number.isFinite(view.eyeHeight)) {
    const surface = getCloudSurfacePoint(params, options);
    const eyeY = surface.y + view.eyeHeight;
    return {
      position: [surface.x, eyeY, surface.z],
      target: [
        surface.x + CAMERA_FORWARD_XZ[0] * view.lookDistance,
        eyeY - view.lookDrop,
        surface.z + CAMERA_FORWARD_XZ[1] * view.lookDistance,
      ],
    };
  }
  if (!Number.isFinite(view.heightAboveCloud)) {
    return { position: view.position, target: view.target };
  }
  const cloudTop = getVisibleCloudTop(params);
  return {
    position: [
      CAMERA_POSITION[0],
      cloudTop + view.heightAboveCloud,
      CAMERA_POSITION[2],
    ],
    target: [
      CAMERA_POSITION[0] + CAMERA_FORWARD_XZ[0] * view.lookDistance,
      cloudTop - view.lookBelowCloudTop,
      CAMERA_POSITION[2] + CAMERA_FORWARD_XZ[1] * view.lookDistance,
    ],
  };
}

export function resolveLightingViewId(value) {
  if (value === 'custom') return 'custom';
  if (value === 'sunset') return 'evening';
  return LIGHTING_VIEW_IDS.has(value) ? value : DEFAULT_LIGHTING_VIEW;
}

export function applyLightingView(params, lightingView) {
  const fixed = FIXED_LIGHTING_VIEWS[lightingView === 'sunset' ? 'evening' : lightingView];
  if (!fixed) return params;
  return {
    ...params,
    sun: {
      ...params.sun,
      azimuth: fixed.azimuth,
      elevation: fixed.elevation,
    },
    time: {
      ...params.time,
      autoAdvanceSecondsPerDay: 0,
      azimuth: fixed.celestialAzimuth,
      latitude: fixed.latitude,
      time: fixed.time,
    },
  };
}
