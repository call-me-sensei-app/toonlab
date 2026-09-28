// The night sky: the star panorama, the phase-shaded moon disc, and the ambient
// lift the moon puts on the sky.
//
// This module owns the `nightSky` param group of SkyParams, and per the spec's
// module-ownership table (docs/sky-cloud-parameters.md, "Module ownership") it
// is the sole definition of it. Anything that needs that default imports it from
// here. The group is declared ahead of the effect for the same reason as
// sky/godRays.js: the SkyParams envelope has to compose a `nightSky` block, and
// letting the envelope declare the group inline is how a second copy of a
// default gets created later, which is what breaks `export *` barrels.
//
// The star texture is supplied by the HOST, not bundled: omit it and the
// panorama renders black, which is documented behaviour rather than an error.
// `intensity` is calibrated for atmosphere.exposure 1.0.
//
// The moon's own parameters are NOT here. `moon.phase`, `intensity`,
// `discBrightness`, `angularSize`, `color` and `ambient` are the nested `moon`
// block of the `time` group and belong to sky/timeOfDay.js, which drives the
// moon's direction and its phase illumination. This module consumes them.
//
// Composition. Both the stars and the moon are radiance ADDED to the sky, so the
// mesh is a blended backdrop (RenderLayer.backgroundOverlay) rather than an
// opaque one: sky/atmosphereDome.js draws the whole sphere opaquely in
// RenderLayer.background, so a night sky placed *under* it could never be seen.
// `radianceNode` is the same graph as a callable node function, for the env-map
// bake and for water reflections, which the reference documents as including the
// stars, the moon disc and the ambient lift.
//
// Everything here is linear HDR in the same unit as `sun.intensity`. No exposure
// and no tonemap: the post chain owns both, exactly as the sky dome leaves them.
//
// Sampling convention. The panorama is read with three.js' own equirect
// background mapping (see three/src/nodes/utils/EquirectUV.js) applied in the
// celestial frame, so a texture that looks right as `scene.background` looks
// right here — the same longitude handedness, the same poles at the top and
// bottom edges, only turned by the clock. The one deliberate difference is a
// quarter-turn shift of u, which puts the driver's celestial longitude 0 — where
// `sunDriver.starRotationAt` anchors the midnight moon — at u 0.5, the middle of
// the panorama.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  Fn,
  cameraPosition,
  cross,
  dot,
  float,
  max,
  mix,
  normalize,
  positionWorld,
  saturate,
  smoothstep,
  sqrt,
  step,
  texture,
  uniform,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import { encodeUnorm8 } from '../cloud/noise/noiseVolume.js';
import { finiteNumber } from '../cloud/paramSchema.js';
import { hashCombine } from '../rockgen/noise/prng.js';
import { createRandom } from '../rockgen/noise/prng.js';
import { fbm3 } from '../rockgen/noise/valueNoise3.js';
import { placeInLayer, RenderLayer } from './renderLayers.js';
import { DEFAULT_MOON_PARAMS } from './timeOfDay.js';

const TAU = Math.PI * 2;

export const NIGHT_SKY_PARAM_SCHEMA = Object.freeze({
  intensity: Object.freeze({
    description: 'Star panorama brightness, calibrated for exposure 1.0. The star texture itself is supplied by the host; without one the night sky is black.',
    label: 'Star Intensity',
    range: Object.freeze({ max: 3, min: 0, step: 0.01 }),
    type: 'number',
    unit: '',
    value: 0.3,
  }),
});

export const NIGHT_SKY_PARAM_KEYS = Object.freeze(Object.keys(NIGHT_SKY_PARAM_SCHEMA));

export const DEFAULT_NIGHT_SKY_PARAMS = Object.freeze(
  Object.fromEntries(NIGHT_SKY_PARAM_KEYS.map((key) => [key, NIGHT_SKY_PARAM_SCHEMA[key].value])),
);

/** Star sphere radius in world units, from the reference's `nightSky.radius`. */
export const NIGHT_SKY_DEFAULT_RADIUS = 100_000;

// ---------------------------------------------------------------------------
// Procedural lunar albedo
// ---------------------------------------------------------------------------
//
// The reference bundles a lunar surface texture and exposes it as a data URL. We
// have no access to theirs, so this bakes one: maria, a power-law crater field
// and two ray systems, all from the repo's seeded PRNG. A texture rather than an
// analytic disc because the drawn moon is not small — `moonAngularSize` 0.0003 is
// an angular radius of 1.403 degrees, so a disc 2.81 degrees wide: 45 pixels
// across at 720p and a 45-degree vertical field (measured, not estimated — the GPU
// probe reads a 25324-pixel footprint at a 4-degree field over 256 pixels), and an
// author raising it for a cinematic moon gets far more. At those sizes the maria
// are the feature that reads as "moon"; a
// smooth shaded ball reads as a planet or a lamp, and no photometric function
// can put a Mare Imbrium on it.
//
// The map is an EQUIRECT map of the lunar sphere, longitude 0 at the centre of
// the near side and latitude 0 across the middle — the same layout as published
// lunar albedo maps (NASA's CGI Moon Kit and friends), so one of those can be
// dropped in through `setMoonTexture` without a reprojection. Foreshortening at
// the limb therefore falls out of the disc-space normal the shader reconstructs,
// which is what makes the disc read as a sphere rather than a sticker.
//
// Values are RELATIVE albedo in linear space, normalised so the mean over the
// visible disc is exactly `MOON_ALBEDO_DISC_MEAN`. The Moon's real geometric
// albedo is about 0.12, which as an absolute number would make the disc a dark
// grey smudge; the absolute level belongs to `moon.discBrightness`, and pinning
// the map's mean is what makes that dial's default of 9.0 mean something.

export const MOON_ALBEDO_SCHEMA_VERSION = 1;

export const MOON_ALBEDO_PLAN = Object.freeze({
  height: 128,
  seed: 1,
  width: 256,
});

/**
 * Disc-area mean of the generated map, which the disc shading divides back out.
 *
 * Under a half rather than a half, so the brightest ray systems have byte
 * headroom: the map is normalised TO this mean, and a bright crater ray inside
 * another crater's ejecta runs a little over twice it. Measured across seeds 1,
 * 2, 3, 7, 11, 42 and 1337 the realised peak lands between 0.80 and 0.94 of the
 * byte range, and `createMoonAlbedoData` reports it so a bake that would clip
 * says so instead of quietly flattening its rays.
 */
export const MOON_ALBEDO_DISC_MEAN = 0.42;

/**
 * Seed namespace for the lunar bake.
 *
 * Every noise field in this project seeds its bands by a namespace so two fields
 * asked for the same frequency under the same document seed are not the same
 * field (see CLOUD_EROSION_SEED_NAMESPACE — sharing one namespace once carved a
 * cloud with a copy of its own basis).
 */
export const MOON_ALBEDO_SEED_NAMESPACE = 0x6d6f6f6e;

/** Scales an RGB tint to a mean of exactly 1, so it carries no brightness. */
function unitMeanTint(channels) {
  const mean = (channels[0] + channels[1] + channels[2]) / 3;
  return Object.freeze(channels.map((channel) => channel / mean));
}

// Relative to the mean, before normalisation. Highlands and maria differ by
// about 2x in reality; the tints are the small colour difference between
// feldspathic highland and titanium-rich basalt, which survives as a hint of
// warm/cool structure once `moon.color` has tinted the whole disc.
const MOON_HIGHLAND_ALBEDO = 0.13;
const MOON_MARE_ALBEDO = 0.068;
// Normalised to a mean of exactly 1 so a tint carries chroma and no brightness:
// otherwise the disc-mean calibration below would be off by the tints' own mean,
// and `moon.discBrightness` would stop meaning what it says.
const MOON_HIGHLAND_TINT = unitMeanTint([1, 0.985, 0.955]);
const MOON_MARE_TINT = unitMeanTint([0.955, 0.975, 1]);

// Maria are a near-side phenomenon — the far side has almost none — so their
// centres are drawn from a band around the sub-Earth point, wide enough to run
// together into one connected dark system the way Imbrium, Serenitatis and
// Tranquillitatis do.
const MOON_MARE_COUNT = 7;
const MOON_MARE_MIN_RADIUS = 0.22;
const MOON_MARE_MAX_RADIUS = 0.58;
const MOON_MARE_LONGITUDE_SPREAD = 1.25;
const MOON_MARE_LATITUDE_SPREAD = 0.8;
const MOON_MARE_WARP = 0.34;
// Maria are flood basalt over older ground, so the craters they buried are gone.
// That contrast — dark and smooth against light and cratered — is the thing that
// reads as the Moon rather than as an asteroid, so only this fraction of a
// crater's relief survives inside one.
const MOON_MARE_CRATER_SURVIVAL = 0.16;

// Radii are arc radians; the Moon's radius is 1737 km, so 0.006 is a 10 km
// crater and 0.13 a 226 km basin. The cubic draw below is a stand-in for the
// observed size-frequency power law: many small, few large.
const MOON_CRATER_COUNT = 900;
const MOON_CRATER_MIN_RADIUS = 0.005;
const MOON_CRATER_MAX_RADIUS = 0.13;
const MOON_CRATER_EJECTA_REACH = 2;
const MOON_CRATER_PEAK_RADIUS = 0.035;

// The bright ray systems of the youngest large craters (Tycho, Copernicus) are
// the most recognisable thing on the near side after the maria, and at 45-odd
// pixels they survive where a single crater rim does not.
const MOON_RAY_CRATERS = 2;
const MOON_RAY_REACH = 5;
const MOON_RAY_STRENGTH = 0.42;

// Overlapping craters multiply, and three coincident rims inside a ray system
// multiply to nearly 3x the surrounding albedo — brighter than any real lunar
// unit, and past what a byte-encoded map normalised to a mean of
// MOON_ALBEDO_DISC_MEAN can carry. The window is the physical range: no unit on
// the Moon is much under half or over 1.6x its surroundings.
const MOON_FEATURE_FLOOR = 0.6;
const MOON_FEATURE_CEILING = 1.6;

const clamp01 = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

/** Hermite ramp on [0, 1], clamped outside it. */
function smoothRamp(t) {
  const x = clamp01(t);
  return x * x * (3 - 2 * x);
}

/** Parabolic bump: 1 at 0, 0 at |t| >= 1. */
function bump(t) {
  const a = t < 0 ? -t : t;
  return a >= 1 ? 0 : 1 - a * a;
}

function directionFromLonLat(lon, lat, target = { x: 0, y: 0, z: 0 }) {
  const cosLat = Math.cos(lat);
  target.x = cosLat * Math.sin(lon);
  target.y = Math.sin(lat);
  target.z = cosLat * Math.cos(lon);
  return target;
}

/**
 * Multiplicative albedo factor of one crater at `t` = angular distance / radius.
 *
 * A dark flat floor, a bright rim crest, and an ejecta blanket fading out to
 * `MOON_CRATER_EJECTA_REACH`. Large craters also get a central peak. The
 * numbers are a legibility choice, not a measurement: what matters at 45 pixels
 * is that rims read bright against floors, which is the contrast the eye uses to
 * call a round patch a crater.
 */
function craterFactor(t, radiusRad) {
  if (t >= MOON_CRATER_EJECTA_REACH) return 1;
  const floorMask = 1 - smoothRamp((t - 0.52) / 0.34);
  const rimMask = bump((t - 0.97) / 0.15);
  const ejectaMask = smoothRamp((t - 0.9) / 0.15)
    * (1 - smoothRamp((t - 1.05) / (MOON_CRATER_EJECTA_REACH - 1.05)));
  const peak = radiusRad > MOON_CRATER_PEAK_RADIUS ? 0.3 * bump(t / 0.18) : 0;
  return 1 - 0.22 * floorMask + 0.26 * rimMask + 0.07 * ejectaMask + peak;
}

/**
 * Visits every texel of an equirect map within `reach` radians of `centre`.
 *
 * A spherical-cap rasteriser rather than a per-texel loop over every feature:
 * 900 craters against 32768 texels is 29 million distance tests, where splatting
 * each feature over its own cap is a few hundred thousand. The longitude span of
 * a cap at a given latitude is exact (the spherical law of cosines), so no
 * feature is clipped, and the callback still gets the true angular distance.
 */
function splatCap({ centre, directions, height, lat, lon, reach, visit, width }) {
  const cosReach = Math.cos(reach);
  const cosCentreLat = Math.cos(lat);
  const jMin = Math.max(0, Math.floor((((lat - reach) / Math.PI) + 0.5) * height));
  const jMax = Math.min(height - 1, Math.ceil((((lat + reach) / Math.PI) + 0.5) * height));
  for (let j = jMin; j <= jMax; j += 1) {
    const rowLat = (((j + 0.5) / height) - 0.5) * Math.PI;
    const cosRowLat = Math.cos(rowLat);
    let halfSpan;
    if (cosRowLat <= 1e-6 || cosCentreLat <= 1e-6) {
      halfSpan = Math.PI;
    } else {
      const cosDelta = (cosReach - (Math.sin(rowLat) * Math.sin(lat)))
        / (cosRowLat * cosCentreLat);
      if (cosDelta >= 1) continue;
      halfSpan = cosDelta <= -1 ? Math.PI : Math.acos(cosDelta);
    }
    const halfTexels = ((halfSpan / TAU) * width) + 1;
    const wholeRow = halfTexels * 2 >= width;
    const iCentre = (((lon / TAU) + 0.5) * width) - 0.5;
    const from = wholeRow ? 0 : Math.floor(iCentre - halfTexels);
    const to = wholeRow ? width - 1 : Math.ceil(iCentre + halfTexels);
    for (let k = from; k <= to; k += 1) {
      const i = wholeRow ? k : (((k % width) + width) % width);
      const index = (j * width) + i;
      const base = index * 3;
      const cosAngle = (directions[base] * centre.x)
        + (directions[base + 1] * centre.y)
        + (directions[base + 2] * centre.z);
      const angle = Math.acos(cosAngle < -1 ? -1 : cosAngle > 1 ? 1 : cosAngle);
      if (angle > reach) continue;
      visit(index, angle, directions[base], directions[base + 1], directions[base + 2]);
    }
  }
}

/**
 * Bakes the lunar albedo map. Deterministic in `seed`: the same seed produces
 * byte-identical output, which is what lets the verification treat the moon as a
 * fixture rather than a variable.
 *
 * Returns the encoded RGBA bytes plus the measurements the caller needs to trust
 * them: `discMean` is the projected-area mean the map was normalised FROM, and
 * `peak` the largest normalised channel, so a bake that would have clipped
 * against the byte range says so instead of quietly flattening its ray systems.
 */
export function createMoonAlbedoData({
  height = MOON_ALBEDO_PLAN.height,
  seed = MOON_ALBEDO_PLAN.seed,
  width = MOON_ALBEDO_PLAN.width,
} = {}) {
  const mapWidth = Math.max(8, Math.round(finiteNumber(width) ?? MOON_ALBEDO_PLAN.width));
  const mapHeight = Math.max(4, Math.round(finiteNumber(height) ?? MOON_ALBEDO_PLAN.height));
  const seedValue = (finiteNumber(seed) ?? MOON_ALBEDO_PLAN.seed) >>> 0;
  const namespace = hashCombine(seedValue, MOON_ALBEDO_SEED_NAMESPACE);
  const random = createRandom(namespace);
  const texels = mapWidth * mapHeight;

  // The surface normal of every texel, once. Both the feature splats and the
  // noise fields need it, and recomputing two transcendentals per feature per
  // texel is the only expensive thing in this bake.
  const directions = new Float32Array(texels * 3);
  for (let j = 0; j < mapHeight; j += 1) {
    const lat = (((j + 0.5) / mapHeight) - 0.5) * Math.PI;
    const cosLat = Math.cos(lat);
    const sinLat = Math.sin(lat);
    for (let i = 0; i < mapWidth; i += 1) {
      const lon = (((i + 0.5) / mapWidth) - 0.5) * TAU;
      const base = (((j * mapWidth) + i) * 3);
      directions[base] = cosLat * Math.sin(lon);
      directions[base + 1] = sinLat;
      directions[base + 2] = cosLat * Math.cos(lon);
    }
  }

  // Every feature is drawn before any is rasterised, so the field evaluation
  // order cannot move the PRNG and the bake stays reproducible if the splat
  // loops are ever reordered for speed.
  const maria = [];
  for (let index = 0; index < MOON_MARE_COUNT; index += 1) {
    const lon = ((random() * 2) - 1) * MOON_MARE_LONGITUDE_SPREAD;
    const lat = ((random() * 2) - 1) * MOON_MARE_LATITUDE_SPREAD;
    const radius = MOON_MARE_MIN_RADIUS
      + ((MOON_MARE_MAX_RADIUS - MOON_MARE_MIN_RADIUS) * random() * random());
    maria.push({
      centre: directionFromLonLat(lon, lat),
      lat,
      lon,
      radius,
      warpSeed: hashCombine(namespace, 0x4d415245 + index),
    });
  }

  const craters = [];
  for (let index = 0; index < MOON_CRATER_COUNT; index += 1) {
    const lat = Math.asin((random() * 2) - 1);
    const lon = ((random() * 2) - 1) * Math.PI;
    const size = random();
    const radius = MOON_CRATER_MIN_RADIUS
      + ((MOON_CRATER_MAX_RADIUS - MOON_CRATER_MIN_RADIUS) * size * size * size * size);
    craters.push({
      centre: directionFromLonLat(lon, lat), lat, lon, radius,
    });
  }
  // The ray systems go on the largest craters, which is where they are in
  // reality: a small crater's rays are gone long before its rim is.
  const rayCraters = craters
    .map((crater, index) => ({ index, radius: crater.radius }))
    .sort((a, b) => b.radius - a.radius)
    .slice(0, MOON_RAY_CRATERS)
    .map(({ index }) => ({
      ...craters[index],
      lobes: 5 + Math.floor(random() * 7),
      phase: random() * TAU,
    }));

  const mare = new Float32Array(texels);
  const factor = new Float32Array(texels).fill(1);

  for (const basin of maria) {
    splatCap({
      centre: basin.centre,
      directions,
      height: mapHeight,
      lat: basin.lat,
      lon: basin.lon,
      reach: Math.min(basin.radius * (1 + MOON_MARE_WARP) * 1.05, Math.PI),
      visit(index, angle, nx, ny, nz) {
        const warp = fbm3(basin.warpSeed, nx * 3, ny * 3, nz * 3, 3);
        const radius = basin.radius * (1 + (MOON_MARE_WARP * warp));
        // A sharp edge, because a mare boundary is where the basalt stopped, not
        // a gradient. Wide enough only to stay smooth at one texel per 1.4 deg.
        const mask = 1 - smoothRamp(((angle / radius) - 0.86) / 0.16);
        if (mask > mare[index]) mare[index] = mask;
      },
      width: mapWidth,
    });
  }

  for (const crater of craters) {
    splatCap({
      centre: crater.centre,
      directions,
      height: mapHeight,
      lat: crater.lat,
      lon: crater.lon,
      reach: Math.min(crater.radius * MOON_CRATER_EJECTA_REACH, Math.PI),
      visit(index, angle) {
        const relief = craterFactor(angle / crater.radius, crater.radius) - 1;
        // Buried by the basalt wherever a mare covers it. The maria are splatted
        // first for exactly this reason.
        const survival = 1 - ((1 - MOON_MARE_CRATER_SURVIVAL) * clamp01(mare[index]));
        factor[index] *= 1 + (relief * survival);
      },
      width: mapWidth,
    });
  }

  for (const crater of rayCraters) {
    // Azimuth basis for the streaks. `cross(pole, centre)` degenerates only for
    // a crater exactly at a lunar pole, where the fallback is still a tangent.
    let tx = -crater.centre.z;
    let tz = crater.centre.x;
    const tLength = Math.hypot(tx, tz);
    let ty = 0;
    if (tLength < 1e-6) {
      tx = 1;
      tz = 0;
    } else {
      tx /= tLength;
      tz /= tLength;
    }
    const ux = (crater.centre.y * tz) - (crater.centre.z * ty);
    const uy = (crater.centre.z * tx) - (crater.centre.x * tz);
    const uz = (crater.centre.x * ty) - (crater.centre.y * tx);
    splatCap({
      centre: crater.centre,
      directions,
      height: mapHeight,
      lat: crater.lat,
      lon: crater.lon,
      reach: Math.min(crater.radius * MOON_RAY_REACH, Math.PI),
      visit(index, angle, nx, ny, nz) {
        const t = angle / crater.radius;
        if (t <= 1.05) return;
        const radial = 1 - smoothRamp((t - 1.05) / (MOON_RAY_REACH - 1.05));
        const phi = Math.atan2(
          (nx * ux) + (ny * uy) + (nz * uz),
          (nx * tx) + (ny * ty) + (nz * tz),
        );
        const streak = 0.5 + (0.5 * Math.cos((crater.lobes * phi) + crater.phase));
        factor[index] *= 1 + (MOON_RAY_STRENGTH * radial * (streak ** 2.5));
      },
      width: mapWidth,
    });
  }

  // Scalar albedo, its tint, and the projected-area mean over the visible disc.
  // The weight is the Jacobian of (longitude, latitude) -> the orthographic disc
  // coordinates, cos^2(lat) * cos(lon), so `discMean` really is the mean of what
  // a viewer sees rather than the mean of the map's texels.
  const scalar = new Float32Array(texels);
  const tint = new Float32Array(texels * 3);
  let weightedSum = 0;
  let weightTotal = 0;
  for (let index = 0; index < texels; index += 1) {
    const base = index * 3;
    const nx = directions[base];
    const ny = directions[base + 1];
    const nz = directions[base + 2];
    const highland = MOON_HIGHLAND_ALBEDO
      * (1 + (0.16 * fbm3(namespace + 1, nx * 2.5, ny * 2.5, nz * 2.5, 3)));
    const basalt = MOON_MARE_ALBEDO
      * (1 + (0.2 * fbm3(namespace + 2, nx * 4.5, ny * 4.5, nz * 4.5, 2)));
    const mask = clamp01(mare[index]);
    const relief = Math.min(Math.max(factor[index], MOON_FEATURE_FLOOR), MOON_FEATURE_CEILING);
    const value = Math.max(((highland * (1 - mask)) + (basalt * mask)) * relief, 0);
    scalar[index] = value;
    for (let channel = 0; channel < 3; channel += 1) {
      tint[base + channel] = MOON_HIGHLAND_TINT[channel]
        + ((MOON_MARE_TINT[channel] - MOON_HIGHLAND_TINT[channel]) * mask);
    }
    // cos(lon) > 0 is the near side; cos^2(lat) is the rest of the Jacobian.
    const cosLatSquared = 1 - (ny * ny);
    const cosLon = cosLatSquared <= 1e-9 ? 0 : nz / Math.sqrt(cosLatSquared);
    if (cosLon > 0) {
      const weight = cosLatSquared * cosLon;
      weightedSum += value * weight;
      weightTotal += weight;
    }
  }

  const discMean = weightTotal > 0 ? weightedSum / weightTotal : 0;
  const scale = discMean > 0 ? MOON_ALBEDO_DISC_MEAN / discMean : 0;
  const data = new Uint8Array(texels * 4);
  let peak = 0;
  for (let index = 0; index < texels; index += 1) {
    const base = index * 3;
    const target = index * 4;
    for (let channel = 0; channel < 3; channel += 1) {
      const value = scalar[index] * scale * tint[base + channel];
      if (value > peak) peak = value;
      data[target + channel] = encodeUnorm8(value);
    }
    data[target + 3] = 255;
  }

  return { data, discMean, height: mapHeight, peak, seed: seedValue, width: mapWidth };
}

/**
 * The lunar albedo map as a texture.
 *
 * `NoColorSpace` and linear values: this is a generated albedo field, not an
 * sRGB photograph, so nothing decodes it. `wrapS` repeats because longitude
 * wraps; `wrapT` clamps because latitude does not — a repeat there would fold
 * the north pole onto the south one.
 */
export function createMoonAlbedoTexture(options = {}) {
  const baked = createMoonAlbedoData(options);
  const map = new THREE.DataTexture(
    baked.data,
    baked.width,
    baked.height,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  map.name = `ToonLabMoonAlbedo${baked.width}x${baked.height}`;
  map.colorSpace = THREE.NoColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  // Both filters are Linear because a DataTexture defaults to Nearest, which the
  // node builders classify as unfilterable: the tap would compile to a
  // `textureLoad` with no sampler, and swapping a filtered map in later cannot
  // rebuild the program (a TextureNode carries no cache key). The same trap the
  // cloud cirrus deck documents.
  map.magFilter = THREE.LinearFilter;
  map.minFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.unpackAlignment = 1;
  map.needsUpdate = true;
  map.userData.toonlabMoonAlbedo = {
    discMean: baked.discMean,
    height: baked.height,
    kind: 'moon-albedo',
    normalisedDiscMean: MOON_ALBEDO_DISC_MEAN,
    peak: baked.peak,
    seed: baked.seed,
    version: MOON_ALBEDO_SCHEMA_VERSION,
    width: baked.width,
  };
  return map;
}

const moonAlbedoCache = new Map();

/**
 * Cached lunar albedo, keyed by size and seed. The on-screen night sky and an
 * env-map bake share one map instead of baking two identical ones, which is why
 * `createNightSky` never disposes it — `disposeMoonAlbedoTextures()` does, the
 * same contract as the cloud noise volumes.
 */
export function getMoonAlbedoTexture(options = {}) {
  const width = Math.max(8, Math.round(finiteNumber(options.width) ?? MOON_ALBEDO_PLAN.width));
  const height = Math.max(4, Math.round(finiteNumber(options.height) ?? MOON_ALBEDO_PLAN.height));
  const seed = (finiteNumber(options.seed) ?? MOON_ALBEDO_PLAN.seed) >>> 0;
  const key = `${width}x${height}:${seed}`;
  const cached = moonAlbedoCache.get(key);
  if (cached) return cached;
  const map = createMoonAlbedoTexture({ height, seed, width });
  moonAlbedoCache.set(key, map);
  return map;
}

/** Releases every cached lunar albedo map. */
export function disposeMoonAlbedoTextures() {
  for (const map of moonAlbedoCache.values()) map.dispose();
  moonAlbedoCache.clear();
}

// ---------------------------------------------------------------------------
// Shading nodes
// ---------------------------------------------------------------------------

// The drawn disc's rim needs a few pixels of falloff or it aliases into a
// polygon at 45-odd pixels across. Fraction of the squared radius it spans.
const MOON_RIM_FADE = 0.12;

// Lommel-Seeliger at zero phase. Incidence equals emission when the light is
// behind the viewer, so mu0 / (mu0 + mu) is exactly one half everywhere on the
// disc — which is the analytic statement of the thing everyone notices about a
// full moon: it is flat, not a shaded ball.
export const LOMMEL_SEELIGER_AT_FULL = 0.5;

/** Rim falloff in normalised squared radius, 1 at the centre, 0 at the edge. */
function moonRimProfile(radiusSquared) {
  const rho2 = clamp01(radiusSquared);
  return 1 - smoothRamp((rho2 - (1 - MOON_RIM_FADE)) / MOON_RIM_FADE);
}

/**
 * Mean disc radiance of a full moon at the documented default moon block, in
 * multiples of `moonColor`.
 *
 * Calibrated so the default moon keeps visible texture after ACES tone mapping.
 * The map's peak-to-mean ratio over the disc is about 1.8, so a mean radiance
 * near 0.3 preserves highlight headroom.
 *
 * The alternative reading of `moon.discBrightness` — that 9.0 IS the disc's
 * radiance — is ruled out by the same frame: 9 tone maps to 0.977, a clipped
 * white circle with every feature erased.
 */
export const MOON_DISC_FULL_MEAN_RADIANCE = 0.3;

/**
 * Scale that lands a full moon's mean disc radiance on
 * `moonColor * moonIntensity * (moonDiscBrightness / 9) *
 * MOON_DISC_FULL_MEAN_RADIANCE`.
 *
 * Uniform samples in squared radius are uniform in disc area, so the arithmetic
 * mean of the profile is its area average — the same normalisation the sky dome
 * applies to the sun's limb profile. Dividing the profile, the map's mean and the
 * default brightness back out is what makes `moon.discBrightness` a dial whose
 * default means something and whose doubling doubles the disc.
 */
export const MOON_DISC_NORMALISATION = (() => {
  const samples = 4096;
  let total = 0;
  for (let i = 0; i < samples; i += 1) {
    total += LOMMEL_SEELIGER_AT_FULL * moonRimProfile((i + 0.5) / samples);
  }
  const profileMean = total / samples;
  return MOON_DISC_FULL_MEAN_RADIANCE
    / (profileMean * MOON_ALBEDO_DISC_MEAN * DEFAULT_MOON_PARAMS.discBrightness);
})();

/**
 * Panorama UV for a direction in the celestial frame.
 *
 * three.js' `equirectUV` with u turned a quarter of a revolution, so celestial
 * longitude 0 — the frame's +Z, where `starRotationAt` parks the midnight moon —
 * lands at the middle of the map. u leaves [0, 1] either side of that, which is
 * why the panorama is forced to `RepeatWrapping` in S; v is clamped at the poles,
 * which is the top and bottom edge of the image.
 */
export function starPanoramaUVNode(celestialDir) {
  const direction = normalize(celestialDir);
  const u = direction.z.atan(direction.x).mul(1 / TAU).add(0.25);
  const v = direction.y.clamp(-1, 1).asin().mul(1 / Math.PI).add(0.5);
  return vec2(u, v);
}

/**
 * Lunar-surface UV for a disc-space normal.
 *
 * Longitude 0 is the sub-observer point (disc-space +z, straight at the viewer)
 * and latitude runs to the celestial pole, so a published lunar map's centre
 * lands at the centre of the disc. Lunar east is to the viewer's right, matching
 * the IAU convention for how the Moon appears from Earth.
 */
export function moonSurfaceUVNode(normal) {
  const u = normal.x.atan(normal.z).mul(1 / TAU).add(0.5);
  const v = normal.y.clamp(-1, 1).asin().mul(1 / Math.PI).add(0.5);
  return vec2(u, v);
}

/**
 * Star radiance for one panorama sample.
 *
 * `nightFactor` is the clock's `skyDarkness`, which is what fades the field in
 * across twilight: 0 while the sun is up, 1 once it is 12 degrees down.
 */
export function starRadianceNode({
  intensity, nightFactor, panorama, style = null, uvNode,
}) {
  const source = panorama.sample(uvNode).rgb.toVar();
  const starField = style?.starField;
  const styled = starField
    ? (() => {
      const luminance = dot(source, vec3(0.2126, 0.7152, 0.0722)).toVar();
      const threshold = max(starField.pointThreshold, 0).toVar();
      const pointMask = smoothstep(
        threshold,
        threshold.add(max(starField.pointSoftness, 0.005)),
        luminance,
      ).toVar();
      const pointCore = pointMask.mul(pointMask).toVar();
      const shaped = source.mul(mix(
        max(starField.diffuseStrength, 0),
        max(starField.pointBrightness, 0),
        pointCore,
      )).toVar();
      const amount = saturate(
        style.enabled
          .mul(starField.enabled)
          .mul(style.amount)
          .mul(starField.amount),
      );
      return mix(source, shaped, amount);
    })()
    : source;
  return styled
    .mul(max(float(intensity), 0))
    .mul(saturate(float(nightFactor)));
}

/**
 * The moon disc's radiance along one view direction, in the celestial frame.
 *
 * Geometry. `moonAngularSize` is an angular radius as `1 - cos(theta)`, the same
 * convention as `sun.discSize`, so the disc's edge is at
 * `sin(theta) = sqrt(size * (2 - size))`. The view direction's component
 * perpendicular to the moon, divided by that, is the point's offset across the
 * disc in units of lunar radii — which is the orthographic projection of the
 * lunar sphere, exact to the half percent at 400000 km, so the sphere normal is
 * just `(x, y, sqrt(1 - x^2 - y^2))`.
 *
 * The disc frame has +z at the viewer, +x along the celestial equator and +y at
 * the north celestial pole. The moon rides declination 0 in this system, so that
 * +x is always well defined, and the frame turns with the sky: the face and the
 * terminator rotate through the night the way a real moon's do.
 *
 * Phase. `moonPhaseTrig` is (sin, cos) of the phase angle, which the clock hands
 * over as the sub-solar direction `vec3(sin, 0, cos)` in exactly this frame, so
 * the terminator is a plane through the disc's centre and phase never moves the
 * moon. Brightness across the lit part is Lommel-Seeliger, `mu0 / (mu0 + mu)` —
 * the standard first-order lunar photometric law, and the reason a gibbous moon
 * stays bright to its limb where a Lambert ball would fall off.
 *
 * The whole term also scales by the lit fraction, per the reference's rule that
 * all three moonshine terms do. That is not double-counting the terminator: the
 * real Moon's flux falls off far faster than its lit fraction (a quarter moon is
 * about a twelfth of a full one, not a half), and Lommel-Seeliger alone only
 * accounts for part of that gap.
 *
 * Returns `vec4(radiance, coverage)`. The coverage is the disc's own opacity —
 * 1 inside it, 0 outside, rim fade included — and it is not decoration: the moon
 * is a rock, so whatever the panorama has behind it has to be occluded. Without
 * that the unlit half of a crescent is transparent and stars shine through it.
 *
 * `bodyOpacity` scales that coverage, and the composer passes `moonIntensity`
 * into it for one reason: the parameter surface has no "moon off" flag, so
 * `moonIntensity = 0` is how a host removes the moon, and the body has to go with
 * the light. Leaving the coverage at 1 there would punch a black disc out of the
 * star field with nothing drawn in it.
 */
export function moonDiscRadianceNode({
  albedo,
  angularSize,
  bodyOpacity = 1,
  celestialMoon,
  celestialView,
  discBrightness,
  illumination,
  moonRadiance,
  phaseTrig,
}) {
  const moonDir = normalize(celestialMoon).toVar();
  const viewDir = normalize(celestialView).toVar();

  // +z at the viewer. +x from the celestial pole, which is (0, 1, 0) here
  // because this frame is the one `starRotation` maps into. The alternate
  // tangent covers a moon parked exactly on the pole — unreachable on a
  // declination-0 arc, but a NaN there would take the whole frame with it.
  const discZ = moonDir.negate().toVar();
  const poleTangent = cross(vec3(0, 1, 0), discZ).toVar();
  const alternate = cross(vec3(0, 0, 1), discZ);
  const degenerate = smoothstep(1e-3, 1e-2, poleTangent.length()).oneMinus();
  const discX = normalize(poleTangent.mul(degenerate.oneMinus()).add(alternate.mul(degenerate)))
    .toVar();
  const discY = cross(discZ, discX).toVar();

  const size = max(float(angularSize), 1e-7).toVar();
  const sinEdge = sqrt(size.mul(float(2).sub(size))).toVar();
  const cosMoon = dot(viewDir, moonDir).toVar();
  const offset = viewDir.sub(moonDir.mul(cosMoon)).toVar();
  const planar = vec2(
    dot(offset, discX).div(sinEdge),
    dot(offset, discY).div(sinEdge),
  ).toVar();
  const radiusSquared = dot(planar, planar).toVar();
  const surface = vec3(planar, sqrt(saturate(radiusSquared.oneMinus()))).toVar();

  // Lommel-Seeliger. The epsilon only guards the limb, where incidence and
  // emission both vanish; the rim fade has already reached zero there.
  const sunward = vec3(phaseTrig.x, 0, phaseTrig.y);
  const incidence = saturate(dot(surface, sunward)).toVar();
  const emission = surface.z.toVar();
  const photometric = incidence.div(incidence.add(emission).add(1e-4));

  // rho^2 keeps growing outside the disc, so the fade reaching 0 at 1 is most of
  // the mask — nothing leaks in from the sky around the moon.
  //
  // The hemisphere gate is the rest of it, and it is not optional: the tangential
  // offset is symmetric under `viewDir -> -viewDir`, so rho^2 returns to 0 at the
  // moon's ANTIPODE as well. Without this the module drew a second, fully lit moon
  // exactly where the sun is — which the GPU probe found by measuring the frame
  // pointed away from the moon and reading back a full disc.
  const facing = step(float(0), cosMoon);
  const rim = smoothstep(1 - MOON_RIM_FADE, 1, radiusSquared).oneMinus().mul(facing).toVar();

  const radiance = moonRadiance
    .mul(max(float(discBrightness), 0))
    .mul(albedo.sample(moonSurfaceUVNode(surface)).rgb)
    .mul(photometric.mul(MOON_DISC_NORMALISATION))
    .mul(saturate(float(illumination)))
    .mul(rim);
  return vec4(radiance, rim.mul(saturate(float(bodyOpacity))));
}

/**
 * The ambient lift the moon puts on the whole sky — what keeps a clear night
 * from going pitch black.
 *
 * Flat across the sphere by design: it stands in for moonlight already scattered
 * by the whole atmosphere, which is the one part of the night sky that has no
 * direction left in it. Scales by the lit fraction and by how night it is, so it
 * is gone by day and a sliver moon lifts far less than a full one.
 */
export function moonAmbientRadianceNode({
  illumination, moonAmbient, moonRadiance, nightFactor,
}) {
  return moonRadiance
    .mul(saturate(float(moonAmbient)))
    .mul(saturate(float(illumination)))
    .mul(saturate(float(nightFactor)));
}

// ---------------------------------------------------------------------------
// The night sky
// ---------------------------------------------------------------------------

/**
 * Adopts a host panorama, correcting what the documented format requires.
 *
 * A texture straight out of `THREE.TextureLoader` arrives unlabelled and clamped
 * on both axes, which for an equirect panorama means an sRGB JPEG read as linear
 * and a visible seam at longitude 0. Those two are set silently because the
 * format states them ("sRGB-encoded", "X = longitude 0..2pi"); a point-sampled
 * map warns as well as being fixed, because the shader was compiled against a
 * filterable texture and cannot be rebuilt for a swap.
 */
function adoptPanorama(map, label) {
  if (!map?.isTexture) return map;
  if (map.colorSpace === THREE.NoColorSpace) {
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
  }
  if (map.wrapS !== THREE.RepeatWrapping) {
    map.wrapS = THREE.RepeatWrapping;
    map.needsUpdate = true;
  }
  if (map.wrapT !== THREE.ClampToEdgeWrapping) {
    map.wrapT = THREE.ClampToEdgeWrapping;
    map.needsUpdate = true;
  }
  if (map.magFilter === THREE.NearestFilter || map.minFilter === THREE.NearestFilter) {
    console.warn(
      `[nightSky] ${label} "${map.name || 'unnamed'}" was point-sampled; filters were set to `
      + 'LinearFilter so the panorama matches the compiled shader.',
    );
    map.magFilter = THREE.LinearFilter;
    map.minFilter = map.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
    map.needsUpdate = true;
  }
  return map;
}

/**
 * A swappable texture binding that remembers whether it may dispose what it
 * holds. Both panoramas need the same three rules — never dispose a host's
 * texture, always dispose one handed over, never dispose the fallback — and one
 * copy of them is one copy of the bug.
 */
function createTextureSlot({ adopt, fallback, label }) {
  const node = texture(fallback);
  let current = null;
  let owned = false;
  return {
    node,
    get current() {
      return current;
    },
    get owned() {
      return owned;
    },
    set(next, ownsNext = false) {
      const map = next?.isTexture ? next : null;
      if (map === current) {
        // Re-declaring ownership of the texture already held must not dispose
        // the thing it is declaring ownership of.
        owned = owned || Boolean(ownsNext);
        return current;
      }
      const previous = current;
      const previouslyOwned = owned;
      current = map;
      owned = Boolean(map && ownsNext);
      node.value = map ? adopt(map, label) : fallback;
      if (previous && previouslyOwned) previous.dispose();
      return current;
    },
    dispose() {
      if (current && owned) current.dispose();
      current = null;
      owned = false;
      node.value = fallback;
    },
  };
}

/**
 * Builds the night sky.
 *
 * `timeOfDay` is required: every celestial term here reads the clock's driven
 * uniforms (`starRotation`, `skyDarkness`, `moonDirection`, `moonPhaseTrig`,
 * `moonPhaseIllumination`) and its moon block, and a night sky with no clock
 * would be a night sky that cannot know what time it is.
 *
 * `texture` is the star panorama, which is NOT bundled. Without one the panorama
 * samples a 1x1 black stand-in and the star term is exactly zero — the
 * documented "omit it and the night sky renders black", as a no-op rather than an
 * error. The moon does not depend on it: the disc and the ambient lift come from
 * the clock, so a host with no starmap still gets a moon rather than an empty sky
 * with a moon-shaped hole in it.
 *
 * The option names follow the reference's `nightSky` option bag — `texture`,
 * `moonTexture`, `radius`, `intensity` — so a SkySystem can pass one straight
 * through. `params` is the serialized `nightSky` block instead, and `intensity`
 * wins over it because it is the more specific of the two.
 */
export function createNightSky({
  intensity: initialIntensity = undefined,
  moonAlbedoOptions = MOON_ALBEDO_PLAN,
  moonTexture = null,
  name = 'ToonLabNightSky',
  ownsMoonTexture = false,
  ownsTexture = false,
  params = {},
  radius = NIGHT_SKY_DEFAULT_RADIUS,
  style = null,
  texture: starTexture = null,
  timeOfDay,
} = {}) {
  if (!timeOfDay?.starRotation || !timeOfDay?.moonDirection || !timeOfDay?.moonPhaseTrig) {
    throw new TypeError('createNightSky needs a TimeOfDay clock.');
  }

  const intensity = uniform(DEFAULT_NIGHT_SKY_PARAMS.intensity);

  // 1x1 black, so an absent panorama contributes exactly nothing while the graph
  // stays the shape it compiled as. Filterable for the same reason the moon map
  // is: an unfilterable stand-in would compile a `textureLoad` that a later swap
  // could not undo.
  const starFallback = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  starFallback.name = `${name}StarFallback`;
  starFallback.colorSpace = THREE.NoColorSpace;
  starFallback.wrapS = THREE.RepeatWrapping;
  starFallback.wrapT = THREE.ClampToEdgeWrapping;
  starFallback.magFilter = THREE.LinearFilter;
  starFallback.minFilter = THREE.LinearFilter;
  starFallback.generateMipmaps = false;
  starFallback.unpackAlignment = 1;
  starFallback.needsUpdate = true;

  const stars = createTextureSlot({
    adopt: adoptPanorama,
    fallback: starFallback,
    label: 'Star panorama',
  });
  stars.set(starTexture, ownsTexture);

  // The generated map is the fallback rather than a slot value, so it is the
  // shared cached bake and `dispose()` leaves it alone; a host override goes
  // through the slot and follows the ownership flag it was handed.
  const bakedMoon = getMoonAlbedoTexture(moonAlbedoOptions);
  const moon = createTextureSlot({
    adopt: adoptPanorama,
    fallback: bakedMoon,
    label: 'Moon albedo',
  });
  moon.set(moonTexture, ownsMoonTexture);

  /**
   * Linear HDR radiance the night sky ADDS along a world-space view direction.
   *
   * Exported on the returned object so the env-map bake and water reflections
   * compose one definition of "what the night sky looks like this frame" instead
   * of a second one that drifts, the same arrangement as the dome's
   * `skyRadiance`.
   */
  const radianceNode = Fn(([viewDir]) => {
    const direction = normalize(viewDir).toVar();
    // The panorama is a sky, not a world-space sphere painted through the
    // ground. Fade every night term out just below the real horizon so stars,
    // the moon, and ambient night lift cannot appear under the scene floor.
    const skyMask = smoothstep(-0.02, 0.03, direction.y).toVar();
    // One rotation, then everything celestial is in one frame: the panorama's
    // longitude, the pole the disc's frame is built from, and the moon. A
    // rotation preserves dot products, so the disc's angular mask is the same as
    // it would be in world space.
    const celestialView = timeOfDay.starRotation.mul(direction).toVar();
    const celestialMoon = timeOfDay.starRotation.mul(timeOfDay.moonDirection).toVar();
    const night = saturate(timeOfDay.skyDarkness).toVar();
    const illumination = saturate(timeOfDay.moonPhaseIllumination).toVar();
    const moonRadiance = timeOfDay.moonColor.mul(max(timeOfDay.moonIntensity, 0)).toVar();

    // Not faded by `skyDarkness`: the disc is an object, not a night term. A moon
    // a few degrees up in civil twilight is plainly visible, and the atmosphere's
    // own radiance is what washes it out when the sun is higher.
    const disc = moonDiscRadianceNode({
      albedo: moon.node,
      angularSize: timeOfDay.moonAngularSize,
      bodyOpacity: timeOfDay.moonIntensity,
      celestialMoon,
      celestialView,
      discBrightness: timeOfDay.moonDiscBrightness,
      illumination,
      moonRadiance,
      phaseTrig: timeOfDay.moonPhaseTrig,
    }).toVar();

    // The moon occludes the panorama behind it — `disc.a` is its coverage. The
    // ambient lift does not get occluded: it stands for moonlight already
    // scattered in the air between the viewer and the moon, which is in front.
    const starStyle = style?.timePalette;
    const starStyleAmount = starStyle
      ? saturate(style.enabled.mul(starStyle.enabled).mul(starStyle.nightEnabled))
      : float(0);
    const starBrightness = starStyle
      ? mix(float(1), max(starStyle.nightStars, 0), starStyleAmount)
      : float(1);
    const starTerm = starRadianceNode({
      intensity,
      nightFactor: night,
      panorama: stars.node,
      style,
      uvNode: starPanoramaUVNode(celestialView),
    }).mul(disc.a.oneMinus()).mul(starBrightness);

    const ambientTerm = moonAmbientRadianceNode({
      illumination,
      moonAmbient: timeOfDay.moonAmbient,
      moonRadiance,
      nightFactor: night,
    });

    return max(starTerm.add(disc.rgb).add(ambientTerm), vec3(0)).mul(skyMask);
  });

  // Additive, because this is radiance on top of the atmosphere rather than a
  // replacement for it. `depthTest: false` keeps the sphere off the depth
  // buffer, while the host camera must still include `radius` inside its far
  // plane because clip-space clipping happens first. The render layer holds it
  // behind the scene.
  const material = new MeshBasicNodeMaterial({
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    side: THREE.BackSide,
    toneMapped: false,
    transparent: true,
  });
  material.name = name;
  material.fog = false;
  // Alpha 1 with three's AdditiveBlending (SrcAlpha, One) is a plain add.
  material.colorNode = Fn(() => vec4(radianceNode(positionWorld.sub(cameraPosition)), 1))();

  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), material);
  mesh.name = name;
  mesh.frustumCulled = false;
  mesh.matrixAutoUpdate = false;

  const group = new THREE.Group();
  group.name = `${name}Root`;
  group.frustumCulled = false;
  group.add(mesh);

  // `backgroundOverlay`, the one layer that is both blended and behind every
  // piece of scene content. `background` is the opaque sky dome's, and an
  // additive sphere placed there would sort into the wrong draw list — three
  // separates the lists before it ever looks at an order, which is why
  // placeInLayer warns about the mismatch instead of silently misplacing it.
  //
  // The Group is placed, not the mesh: r185 takes an enclosing Group's
  // renderOrder as the PRIMARY sort key (projectObject sets groupOrder from it,
  // and painterSortStable compares groupOrder before renderOrder), so an order on
  // the mesh alone lets host content inside a group of its own draw behind the
  // stars.
  placeInLayer(group, RenderLayer.backgroundOverlay);

  let currentRadius = NIGHT_SKY_DEFAULT_RADIUS;

  const nightSky = {
    group,
    material,
    mesh,
    timeOfDay,

    /** Star panorama brightness, calibrated for exposure 1.0. */
    intensity,

    /** Linear HDR radiance the night sky adds along a world-space direction. */
    radianceNode,

    /** The star panorama, or null when the host has supplied none. */
    get texture() {
      return stars.current;
    },

    /** The lunar albedo map actually bound — the generated bake unless overridden. */
    get moonTexture() {
      return moon.current ?? bakedMoon;
    },

    /** Sphere radius in world units. */
    get radius() {
      return currentRadius;
    },
    set radius(value) {
      const next = finiteNumber(value);
      if (next === null) return;
      currentRadius = Math.max(1, next);
      mesh.scale.setScalar(currentRadius);
      mesh.updateMatrix();
    },

    /**
     * Swaps the star panorama at runtime. `ownsNewTexture` hands its disposal
     * over; without it the host keeps it and this module never disposes it.
     * `null` returns to the black stand-in, which turns the stars off.
     */
    setTexture(next, ownsNewTexture = false) {
      return stars.set(next, ownsNewTexture);
    },

    /**
     * Overrides the lunar albedo map. The map must be an equirect lunar surface
     * with longitude 0 at the centre of the near side and a disc-area mean of
     * MOON_ALBEDO_DISC_MEAN, which is what the disc's brightness calibration
     * assumes; `null` returns to the generated bake.
     */
    setMoonTexture(next, ownsNewTexture = false) {
      return moon.set(next, ownsNewTexture);
    },

    applyParams(next = {}) {
      if (next.intensity !== undefined) {
        const value = finiteNumber(next.intensity);
        if (value !== null) {
          // The owner clamps to its own published range, so the live object and
          // the document layer (which adopts this range as its hard limit)
          // cannot disagree about what round-trips.
          const { max: limit, min } = NIGHT_SKY_PARAM_SCHEMA.intensity.range;
          intensity.value = THREE.MathUtils.clamp(value, min, limit);
        }
      }
    },

    toParams() {
      return { intensity: intensity.value };
    },

    /** Re-centres the sphere on the camera. Safe every frame. */
    update(_delta, camera) {
      if (camera?.position) group.position.copy(camera.position);
      return group;
    },

    dispose() {
      stars.dispose();
      moon.dispose();
      starFallback.dispose();
      mesh.geometry.dispose();
      material.dispose();
      group.removeFromParent();
    },
  };

  nightSky.radius = radius;
  nightSky.applyParams({ ...DEFAULT_NIGHT_SKY_PARAMS, ...params });
  if (initialIntensity !== undefined) nightSky.applyParams({ intensity: initialIntensity });
  return nightSky;
}
