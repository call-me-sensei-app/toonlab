#!/usr/bin/env node
// Bakes a procedural equirectangular star panorama into
// public/sky/starmap-procedural-2k.png.
//
//   npm run assets:starmap
//
// ===========================================================================
// THIS IS A STAND-IN, NOT AN ASTRONOMICAL MAP.
// ===========================================================================
//
// Not one star here is a real star. There is no catalogue behind it: every
// position, magnitude and colour is drawn from the repo's seeded PRNG
// (src/rockgen/noise/prng.js) against STATISTICAL distributions that match the
// real sky in aggregate. Orion is not in it. Polaris is not in it. Nothing in
// this image may be used to identify anything, and no capture taken against it
// is evidence about where a real star should land.
//
// It exists because `src/sky/nightSky.js` documents the star panorama as
// HOST-SUPPLIED and deliberately does not bundle one — the good catalogue maps
// (NASA/Goddard SVS Deep Star Maps, Solar System Scope, ESO) all carry
// attribution terms, and a licence-free repo cannot vendor them. Without any
// panorama the night sky renders black, which is correct behaviour and useless
// for a capture harness: a black frame cannot show that the stars fade in
// across twilight, or that the moon disc occludes what is behind it. So the
// harness gets a plausible field with no licence attached, and a shipping host
// swaps in a real one through `nightSky: { texture }` or `setTexture()`.
//
// What IS faithful, and why each choice was made:
//
//   Magnitude distribution. N(<m) = 9100 * 10^(0.49 * (m - 6.5)), fitted to the
//   naked-eye star counts: it predicts 18 stars brighter than magnitude 1
//   (actual ~15), 175 brighter than 3 (actual 171), 1675 brighter than 5
//   (actual ~1602), and 1.1 brighter than -1.5 — which is why the field has one
//   Sirius-class star in it rather than a hand-placed one.
//
//   Sky distribution. 35% of the field is concentrated to the galactic plane
//   with a Gaussian scale height and a mild rise toward the galactic centre;
//   the rest is isotropic. The galactic frame is rotated into equatorial
//   coordinates through the real J2000 pole, so the Milky Way crosses the map
//   at the angle a real RA/Dec panorama's does. That angle is the single most
//   recognisable thing about a star panorama and the one part of this file that
//   is not invented.
//
//   Colour. Blackbody spectra through the Wyman/Sledge/Slusallek analytic CIE
//   1931 fit, per spectral class, weighted by the naked-eye class census
//   (K and B dominate, not G). Each tint is normalised to unit Rec.709
//   luminance, so class carries chroma only and magnitude alone sets brightness
//   — the same split `unitMeanTint` makes in src/sky/nightSky.js.
//
//   Point spread. Brightness is split between peak and width, so a bright star
//   is a wider disc as well as a hotter pixel and its core clips at 1.0 — which
//   is exactly what a photographic star map does and what makes a
//   first-magnitude star read as bright through an 8-bit encode. The peak is
//   compressed rather than proportional to flux; see FLUX_COMPRESSION for why an
//   8-bit container leaves no choice.
//
// Format, per the panorama contract in src/sky/nightSky.js and the reference's
// "Panorama Format": equirectangular, X = longitude 0..2pi, Y = latitude
// -pi/2..pi/2, the top and bottom EDGES are the celestial poles, sRGB-encoded
// 8-bit PNG. Splatting uses the exact angular distance between a pixel's
// direction and the star's, so a star near a pole spreads across the whole row
// the way the projection demands instead of being squashed into an ellipse.
//
// Deterministic: same seed, same bytes. The disclaimer above is also written
// into the PNG's own tEXt chunks, so it cannot be separated from the file.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

import { createRandom, hash3f, hashCombine } from '../src/rockgen/noise/prng.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(HERE, '../public/sky/starmap-procedural-2k.png');

// 2048x1024 is 0.176 degrees per pixel. Real catalogue maps ship at 8K or 16K;
// a quarter of that keeps the file small enough to live in git while still
// putting a magnitude-6 star inside a single pixel rather than smeared over
// four.
const WIDTH = 2048;
const HEIGHT = 1024;

/** Master seed. 1 is the repo's default document seed (weather map, moon bake). */
const SEED = 1;

// Seed namespaces, one per field. Sharing one namespace between two fields is
// how two fields end up being the same field — see CLOUD_EROSION_SEED_NAMESPACE
// in src/cloud/noise/erosionVolume.js for the bug that rule came from.
const STAR_NAMESPACE = 0x73746172; // 'star'
const BAND_NAMESPACE = 0x6d776179; // 'mway'

// --- the magnitude law -----------------------------------------------------

const LIMIT_MAGNITUDE = 6.5;
/** Stars over the whole sphere brighter than LIMIT_MAGNITUDE. */
const STAR_COUNT = 9100;
/** Slope of log10 N(<m). 0.49 is the fit to the naked-eye counts. */
const MAGNITUDE_SLOPE = 0.49;
/**
 * Brightest magnitude drawn.
 *
 * The law expects 1.1 stars above it over the whole sphere, so this is a clamp
 * that fires about once per bake rather than a cap that reshapes the top of the
 * distribution — and -1.46 is Sirius, the real brightest star.
 */
const BRIGHTEST_MAGNITUDE = -1.46;

// --- the point spread ------------------------------------------------------

// Gaussian sigma in DEGREES, at the faint limit and at the bright limit. The
// faint end is a shade under one map pixel (0.176 deg) so a magnitude-6 star is
// a point; the bright end is a two-pixel core that clips into a small disc.
const SIGMA_FAINT_DEG = 0.115;
const SIGMA_BRIGHT_DEG = 0.20;
/** Splat radius, in sigmas. 3.2 sigma holds 99.4% of a 2D Gaussian's flux. */
const SPLAT_SIGMAS = 3.2;

/**
 * Linear radiance a magnitude-6.5 star puts in its own peak pixel.
 *
 * Calibrated, not chosen: at the faint sigma this lands the limit magnitude on
 * sRGB byte 39, which survives the encode as a dim but visible point.
 */
const LIMIT_PEAK_RADIANCE = 0.0205;

/**
 * Power the flux ratio is raised to before it becomes a peak value.
 *
 * NOT 1, and the reason is the container. An 8-bit sRGB panorama has three
 * orders of magnitude of range and the naked-eye sky has 1445x between the
 * limit magnitude and Sirius, so a linear response either buries the faint end
 * at byte 1 or turns every first-magnitude star into a saturated blob a degree
 * across — which is what a first cut of this file did, and it read as fog with
 * a moon in it. 0.62 is the same kind of stretch every processed astrophoto
 * carries, and it is honest about what it costs: relative BRIGHTNESS between
 * two stars in this map is compressed, their relative ORDER is not. Nothing
 * photometric should be read off this image, which is true of it for a dozen
 * other reasons already.
 */
const FLUX_COMPRESSION = 0.62;

// --- the Milky Way ---------------------------------------------------------

/** Share of stars drawn from the galactic-plane population. */
const GALACTIC_FRACTION = 0.35;
/** Gaussian scale height of that population, degrees of galactic latitude. */
const GALACTIC_SCALE_HEIGHT_DEG = 12;
/** How much more likely the galactic centre is than the anticentre. */
const GALACTIC_CENTRE_BIAS = 0.6;

/**
 * Peak linear radiance of the unresolved diffuse band.
 *
 * Deliberately low. At the module's default `nightSky.intensity` of 0.3 this is
 * 0.0036 in the same unit as `sun.intensity` — a band you notice once your eye
 * adapts, not a stripe. The real Milky Way is about 1% of the light of a full
 * moon spread over a fifth of the sky.
 */
const BAND_PEAK_RADIANCE = 0.024;

/** J2000 galactic pole and the galactic longitude of the north celestial pole. */
const NGP_RA_DEG = 192.85948;
const NGP_DEC_DEG = 27.12825;
const NCP_GALACTIC_LON_DEG = 122.93192;

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function linearChannelToSrgb(value) {
  const c = clamp01(value);
  return c <= 0.0031308 ? c * 12.92 : (1.055 * c ** (1 / 2.4)) - 0.055;
}

/** Asymmetric Gaussian lobe, the primitive of the Wyman CIE fit. */
function lobe(x, mu, sigmaLow, sigmaHigh) {
  const t = (x - mu) / (x < mu ? sigmaLow : sigmaHigh);
  return Math.exp(-0.5 * t * t);
}

// Wyman, Sledge & Slusallek (2013), "Simple Analytic Approximations to the CIE
// XYZ Color Matching Functions" — the multi-lobe fit, accurate to a fraction of
// a percent across the visible band. Used instead of a hard-coded RGB table per
// spectral class so the tints are derived from a temperature rather than picked
// by eye.
function cieX(nm) {
  return (1.056 * lobe(nm, 599.8, 37.9, 31.9))
    + (0.362 * lobe(nm, 442.0, 16.0, 26.7))
    - (0.065 * lobe(nm, 501.1, 20.4, 26.2));
}

function cieY(nm) {
  return (0.821 * lobe(nm, 568.8, 46.9, 40.5)) + (0.286 * lobe(nm, 530.9, 16.3, 31.1));
}

function cieZ(nm) {
  return (1.217 * lobe(nm, 437.0, 11.8, 36.0)) + (0.681 * lobe(nm, 459.0, 26.0, 13.8));
}

/** Planck spectral radiance, arbitrary scale — only the SHAPE survives below. */
function planck(nm, kelvin) {
  const lambda = nm * 1e-9;
  const c1 = 3.741771852e-16; // 2 h c^2
  const c2 = 1.438776877e-2; // h c / k
  return c1 / (lambda ** 5 * (Math.exp(c2 / (lambda * kelvin)) - 1));
}

/**
 * A blackbody as linear sRGB with Rec.709 luminance exactly 1.
 *
 * Unit luminance is the point: the star's magnitude is the only thing allowed
 * to set its brightness, so the spectral class may carry chroma and nothing
 * else. Negative channels — temperatures outside the sRGB gamut, which every
 * O and B star is — are clipped to 0 before the normalisation, so the hottest
 * stars go as blue as the gamut allows and no further.
 */
function blackbodyLinearRgb(kelvin) {
  let x = 0;
  let y = 0;
  let z = 0;
  for (let nm = 360; nm <= 830; nm += 1) {
    const power = planck(nm, kelvin);
    x += power * cieX(nm);
    y += power * cieY(nm);
    z += power * cieZ(nm);
  }
  const sum = x + y + z;
  const nx = x / sum;
  const ny = y / sum;
  const nz = z / sum;
  const rgb = [
    Math.max(0, (3.2406 * nx) - (1.5372 * ny) - (0.4986 * nz)),
    Math.max(0, (-0.9689 * nx) + (1.8758 * ny) + (0.0415 * nz)),
    Math.max(0, (0.0557 * nx) - (0.2040 * ny) + (1.0570 * nz)),
  ];
  const luminance = (0.2126 * rgb[0]) + (0.7152 * rgb[1]) + (0.0722 * rgb[2]);
  return rgb.map((channel) => channel / luminance);
}

/**
 * The naked-eye spectral census.
 *
 * Weights are the Hipparcos bright-star mix, NOT the mix of stars that exist:
 * the sky you can see is dominated by distant luminous B stars and nearby K
 * giants, while the M dwarfs that make up three quarters of the galaxy are all
 * invisible. Getting this wrong is what makes a synthetic starfield look like
 * white noise — a real one is visibly two-toned.
 */
const SPECTRAL_CLASSES = [
  { kelvin: 30000, name: 'O', weight: 0.001 },
  { kelvin: 15000, name: 'B', weight: 0.120 },
  { kelvin: 9000, name: 'A', weight: 0.200 },
  { kelvin: 6800, name: 'F', weight: 0.150 },
  { kelvin: 5600, name: 'G', weight: 0.130 },
  { kelvin: 4400, name: 'K', weight: 0.270 },
  { kelvin: 3200, name: 'M', weight: 0.129 },
];

const SPECTRAL_TABLE = (() => {
  let cumulative = 0;
  return SPECTRAL_CLASSES.map((entry) => {
    cumulative += entry.weight;
    return { ...entry, cumulative, tint: blackbodyLinearRgb(entry.kelvin) };
  });
})();

function pickSpectralTint(u) {
  const total = SPECTRAL_TABLE[SPECTRAL_TABLE.length - 1].cumulative;
  const target = u * total;
  return (SPECTRAL_TABLE.find((entry) => target <= entry.cumulative)
    ?? SPECTRAL_TABLE[SPECTRAL_TABLE.length - 1]);
}

// ---------------------------------------------------------------------------
// CPU value noise, from the repo's lattice hash
// ---------------------------------------------------------------------------
//
// fbm3 in src/rockgen/noise/valueNoise3.js is a TSL node function and cannot be
// evaluated on the CPU, so this is the same construction — trilinear value
// noise on a hashed integer lattice, smoothstep-faded — over `hash3f`, which is
// the identical hash the GPU version seeds from.

function valueNoise3(seed, x, y, z) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  const fx = x - xi;
  const fy = y - yi;
  const fz = z - zi;
  const sx = fx * fx * (3 - (2 * fx));
  const sy = fy * fy * (3 - (2 * fy));
  const sz = fz * fz * (3 - (2 * fz));
  let result = 0;
  for (let dz = 0; dz < 2; dz += 1) {
    const wz = dz ? sz : 1 - sz;
    for (let dy = 0; dy < 2; dy += 1) {
      const wy = dy ? sy : 1 - sy;
      for (let dx = 0; dx < 2; dx += 1) {
        const wx = dx ? sx : 1 - sx;
        result += wx * wy * wz * hash3f(seed, xi + dx, yi + dy, zi + dz);
      }
    }
  }
  return result;
}

function fbm3cpu(seed, x, y, z, octaves) {
  let sum = 0;
  let amplitude = 1;
  let total = 0;
  let frequency = 1;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += amplitude * valueNoise3(
      hashCombine(seed, octave),
      x * frequency,
      y * frequency,
      z * frequency,
    );
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03; // Off two so octaves do not re-align on the lattice.
  }
  return sum / total;
}

// ---------------------------------------------------------------------------
// Coordinates
// ---------------------------------------------------------------------------

/**
 * Panorama direction for a longitude/latitude pair, in the celestial frame
 * `starPanoramaUVNode` reads: u = atan2(z, x) / 2pi + 0.25, v = asin(y) / pi
 * + 0.5, so +Y is the north celestial pole and longitude is atan2(z, x).
 */
function directionOf(lonRad, latRad) {
  const cosLat = Math.cos(latRad);
  return [cosLat * Math.cos(lonRad), Math.sin(latRad), cosLat * Math.sin(lonRad)];
}

/**
 * Galactic (l, b) to equatorial (RA, Dec), J2000. The standard rotation — this
 * is the one piece of real astronomy in the file, and it is here so the band
 * crosses the map at the angle it does in a catalogue panorama.
 */
function galacticToEquatorial(lRad, bRad) {
  const decNgp = NGP_DEC_DEG * DEG;
  const raNgp = NGP_RA_DEG * DEG;
  const lNcp = NCP_GALACTIC_LON_DEG * DEG;
  const dl = lNcp - lRad;
  const sinDec = (Math.sin(decNgp) * Math.sin(bRad))
    + (Math.cos(decNgp) * Math.cos(bRad) * Math.cos(dl));
  const dec = Math.asin(Math.min(1, Math.max(-1, sinDec)));
  const yTerm = Math.cos(bRad) * Math.sin(dl);
  const xTerm = (Math.cos(decNgp) * Math.sin(bRad))
    - (Math.sin(decNgp) * Math.cos(bRad) * Math.cos(dl));
  const ra = Math.atan2(yTerm, xTerm) + raNgp;
  return { dec, ra: ((ra % TAU) + TAU) % TAU };
}

/** Galactic latitude of a panorama direction, radians. Drives the diffuse band. */
const galacticPoleDirection = (() => {
  // The equatorial direction of the north galactic pole, in the panorama frame.
  const dec = NGP_DEC_DEG * DEG;
  const ra = NGP_RA_DEG * DEG;
  return directionOf(ra, dec);
})();

const galacticCentreDirection = (() => {
  const { dec, ra } = galacticToEquatorial(0, 0);
  return directionOf(ra, dec);
})();

// ---------------------------------------------------------------------------
// The bake
// ---------------------------------------------------------------------------

/** Linear HDR accumulation buffer, RGB. Encoded to sRGB bytes at the end. */
const radiance = new Float64Array(WIDTH * HEIGHT * 3);

// Per-row geometry, hoisted: every star splat and every band pixel needs it.
const rowSin = new Float64Array(HEIGHT);
const rowCos = new Float64Array(HEIGHT);
const rowLat = new Float64Array(HEIGHT);
for (let py = 0; py < HEIGHT; py += 1) {
  // Row 0 is the TOP of the image, and three.js flips Y on upload, so the top
  // row is v = 1 — the north celestial pole. Poles land on the edge rows, which
  // is what the panorama format requires.
  const v = 1 - ((py + 0.5) / HEIGHT);
  const lat = (v - 0.5) * Math.PI;
  rowLat[py] = lat;
  rowSin[py] = Math.sin(lat);
  rowCos[py] = Math.cos(lat);
}

const colLon = new Float64Array(WIDTH);
for (let px = 0; px < WIDTH; px += 1) {
  colLon[px] = (((px + 0.5) / WIDTH) - 0.25) * TAU;
}

// --- 1. the diffuse band ---------------------------------------------------

function bandRadiance(direction) {
  const sinB = (direction[0] * galacticPoleDirection[0])
    + (direction[1] * galacticPoleDirection[1])
    + (direction[2] * galacticPoleDirection[2]);
  const bDeg = (Math.asin(Math.min(1, Math.max(-1, sinB))) * 180) / Math.PI;

  // Two components: a thin bright ridge and the thick disc around it. One
  // Gaussian cannot be both narrow at the core and wide in the wings, and the
  // real band is exactly that shape.
  const thin = Math.exp(-0.5 * (bDeg / 4.0) ** 2);
  const thick = Math.exp(-0.5 * (bDeg / 15.0) ** 2);
  const profile = (0.62 * thin) + (0.38 * thick);
  if (profile < 1e-4) return 0;

  // Brighter toward Sagittarius, dimmer toward the anticentre.
  const cosCentre = (direction[0] * galacticCentreDirection[0])
    + (direction[1] * galacticCentreDirection[1])
    + (direction[2] * galacticCentreDirection[2]);
  const towardCentre = 0.35 + (0.65 * clamp01((cosCentre + 0.2) / 1.2) ** 1.6);

  // Structure: coarse lumps (spiral-arm brightness) times a high-frequency
  // granularity that stands in for unresolved stars, minus dark rifts. The
  // rifts are the interstellar dust lanes and they are most of what makes a
  // real band read as a band rather than an airbrushed stripe.
  const lumps = 0.70 + (0.60 * fbm3cpu(
    hashCombine(SEED, BAND_NAMESPACE),
    direction[0] * 2.2,
    direction[1] * 2.2,
    direction[2] * 2.2,
    4,
  ));
  const grain = 0.78 + (0.44 * fbm3cpu(
    hashCombine(SEED, BAND_NAMESPACE + 1),
    direction[0] * 47,
    direction[1] * 47,
    direction[2] * 47,
    3,
  ));
  // Floored well under the fbm's ~0.5 mean so the rifts CUT the band in places
  // rather than thinning it everywhere: a dust lane is a local absence, and a
  // mask that averages 0.45 would just be a dimmer band.
  const rift = clamp01((fbm3cpu(
    hashCombine(SEED, BAND_NAMESPACE + 2),
    direction[0] * 5.0,
    direction[1] * 5.0,
    direction[2] * 5.0,
    3,
  ) - 0.27) / 0.26);

  return BAND_PEAK_RADIANCE * profile * towardCentre * lumps * grain * rift;
}

// The band's own colour: slightly warm, because it is the integrated light of
// mostly K and G stars seen through dust that reddens it further. Unit
// luminance for the same reason the star tints are.
const BAND_TINT = blackbodyLinearRgb(4900);

for (let py = 0; py < HEIGHT; py += 1) {
  for (let px = 0; px < WIDTH; px += 1) {
    const lon = colLon[px];
    const direction = [rowCos[py] * Math.cos(lon), rowSin[py], rowCos[py] * Math.sin(lon)];
    const level = bandRadiance(direction);
    if (level <= 0) continue;
    const base = ((py * WIDTH) + px) * 3;
    radiance[base] += level * BAND_TINT[0];
    radiance[base + 1] += level * BAND_TINT[1];
    radiance[base + 2] += level * BAND_TINT[2];
  }
}

// --- 2. the stars ----------------------------------------------------------

const random = createRandom(hashCombine(SEED, STAR_NAMESPACE));

/** Flux relative to the limit magnitude. Pogson: 10^(-0.4 dm). */
const fluxOf = (magnitude) => 10 ** (-0.4 * (magnitude - LIMIT_MAGNITUDE));

const stars = [];
for (let index = 0; index < STAR_COUNT; index += 1) {
  // Magnitude first, by inverting N(<m) / N = 10^(slope * (m - limit)).
  const u = Math.max(random(), 1e-12);
  const magnitude = Math.max(
    BRIGHTEST_MAGNITUDE,
    LIMIT_MAGNITUDE + (Math.log10(u) / MAGNITUDE_SLOPE),
  );

  let lon;
  let lat;
  if (random() < GALACTIC_FRACTION) {
    // Galactic-plane population. Latitude from a Gaussian scale height
    // (Box-Muller on two draws), longitude weighted toward the centre by
    // rejection — cheap, and it keeps the draw count per star bounded in
    // practice because the acceptance floor is 1 / (1 + bias).
    const r1 = Math.max(random(), 1e-12);
    const r2 = random();
    const gaussian = Math.sqrt(-2 * Math.log(r1)) * Math.cos(TAU * r2);
    const b = gaussian * GALACTIC_SCALE_HEIGHT_DEG * DEG;
    let l = 0;
    for (let attempt = 0; attempt < 32; attempt += 1) {
      l = random() * TAU;
      const weight = (1 + (GALACTIC_CENTRE_BIAS * Math.cos(l))) / (1 + GALACTIC_CENTRE_BIAS);
      if (random() <= weight) break;
    }
    const equatorial = galacticToEquatorial(l, Math.max(-1.5533, Math.min(1.5533, b)));
    lon = equatorial.ra;
    lat = equatorial.dec;
  } else {
    // Isotropic: uniform in sin(latitude), which is what makes the density per
    // steradian constant instead of piling stars onto the poles.
    lon = random() * TAU;
    lat = Math.asin((random() * 2) - 1);
  }

  const tint = pickSpectralTint(random());
  stars.push({ lat, lon, magnitude, tint: tint.tint, tintName: tint.name });
}

// Brightness-ordered stats, and the splat itself.
stars.sort((a, b) => a.magnitude - b.magnitude);

let peakLinear = 0;
const classCounts = Object.create(null);

for (const star of stars) {
  classCounts[star.tintName] = (classCounts[star.tintName] ?? 0) + 1;

  const flux = fluxOf(star.magnitude);
  // Sigma grows with brightness on a log scale, so the width tracks magnitude
  // rather than flux and the brightest star is a disc instead of a crater.
  const brightness = clamp01(
    (LIMIT_MAGNITUDE - star.magnitude) / (LIMIT_MAGNITUDE - BRIGHTEST_MAGNITUDE),
  );
  const sigmaDeg = SIGMA_FAINT_DEG + ((SIGMA_BRIGHT_DEG - SIGMA_FAINT_DEG) * brightness);
  const sigma = sigmaDeg * DEG;
  // Brightness goes into the peak (compressed, see FLUX_COMPRESSION) and size
  // goes into sigma, so a brighter star is both hotter and wider — which is what
  // survives an 8-bit encode as "brighter" once the core clips.
  const peak = LIMIT_PEAK_RADIANCE * (flux ** FLUX_COMPRESSION);
  peakLinear = Math.max(peakLinear, peak);

  const reach = SPLAT_SIGMAS * sigma;
  const cosReach = Math.cos(reach);
  const direction = directionOf(star.lon, star.lat);

  const latMin = star.lat - reach;
  const latMax = star.lat + reach;
  // Rows are top-down and latitude runs the other way, hence the swap.
  const rowFrom = Math.max(0, Math.floor(((0.5 - (latMax / Math.PI)) * HEIGHT) - 1));
  const rowTo = Math.min(HEIGHT - 1, Math.ceil(((0.5 - (latMin / Math.PI)) * HEIGHT) + 1));

  for (let py = rowFrom; py <= rowTo; py += 1) {
    // Half-width of the splat on THIS row, from the spherical law of cosines.
    // Near a pole the denominator collapses and the whole row is inside the
    // splat, which is the projection being honest rather than a special case.
    const denominator = rowCos[py] * Math.cos(star.lat);
    let halfSpanColumns = WIDTH;
    if (denominator > 1e-6) {
      const cosDelta = (cosReach - (rowSin[py] * Math.sin(star.lat))) / denominator;
      if (cosDelta > 1) continue;
      if (cosDelta > -1) {
        halfSpanColumns = Math.ceil(((Math.acos(cosDelta) / TAU) * WIDTH) + 1);
      }
    }

    const centreColumn = Math.round((((star.lon / TAU) + 0.25) * WIDTH) - 0.5);
    // Capped at one full turn: a splat that reaches past the pole spans every
    // column, and without the cap the wrap below would visit each of them twice
    // and double its flux.
    const columnCount = Math.min(WIDTH, (2 * halfSpanColumns) + 1);
    for (let step = 0; step < columnCount; step += 1) {
      // Longitude wraps; latitude does not.
      const px = (((centreColumn - halfSpanColumns + step) % WIDTH) + WIDTH) % WIDTH;
      const lon = colLon[px];
      const dot = (rowCos[py] * Math.cos(lon) * direction[0])
        + (rowSin[py] * direction[1])
        + (rowCos[py] * Math.sin(lon) * direction[2]);
      const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
      if (angle > reach) continue;
      const falloff = Math.exp(-0.5 * (angle / sigma) ** 2);
      const level = peak * falloff;
      if (level < 1e-6) continue;
      const base = ((py * WIDTH) + px) * 3;
      radiance[base] += level * star.tint[0];
      radiance[base + 1] += level * star.tint[1];
      radiance[base + 2] += level * star.tint[2];
    }
  }
}

// --- 3. encode -------------------------------------------------------------

const rgba = Buffer.alloc(WIDTH * HEIGHT * 4);
let litPixels = 0;
let clippedPixels = 0;
let luminanceSum = 0;
for (let index = 0; index < WIDTH * HEIGHT; index += 1) {
  const base = index * 3;
  const r = radiance[base];
  const g = radiance[base + 1];
  const b = radiance[base + 2];
  luminanceSum += (0.2126 * r) + (0.7152 * g) + (0.0722 * b);
  if (r >= 1 || g >= 1 || b >= 1) clippedPixels += 1;
  const out = index * 4;
  rgba[out] = Math.round(linearChannelToSrgb(r) * 255);
  rgba[out + 1] = Math.round(linearChannelToSrgb(g) * 255);
  rgba[out + 2] = Math.round(linearChannelToSrgb(b) * 255);
  rgba[out + 3] = 255;
  if (rgba[out] || rgba[out + 1] || rgba[out + 2]) litPixels += 1;
}

// --- PNG ------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xFFFFFFFF;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

/** A tEXt chunk: latin1 keyword, NUL, latin1 text. */
function textChunk(keyword, text) {
  return pngChunk('tEXt', Buffer.concat([
    Buffer.from(keyword, 'latin1'),
    Buffer.from([0]),
    Buffer.from(text.replaceAll('\n', ' '), 'latin1'),
  ]));
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(WIDTH, 0);
ihdr.writeUInt32BE(HEIGHT, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 6; // RGBA

// Filter type 1 (Sub) per row. The image is mostly black with isolated points,
// so Sub turns runs of identical bytes into runs of zeros and deflate then
// collapses them; filter 0 leaves the band's gradients as raw bytes.
const stride = WIDTH * 4;
const raw = Buffer.alloc(HEIGHT * (1 + stride));
for (let py = 0; py < HEIGHT; py += 1) {
  const rowStart = py * (1 + stride);
  raw[rowStart] = 1;
  for (let index = 0; index < stride; index += 1) {
    const here = rgba[(py * stride) + index];
    const left = index >= 4 ? rgba[(py * stride) + index - 4] : 0;
    raw[rowStart + 1 + index] = (here - left) & 0xFF;
  }
}

const file = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
  pngChunk('IHDR', ihdr),
  textChunk('Title', 'ToonLab procedural star panorama (stand-in)'),
  textChunk(
    'Description',
    'NOT AN ASTRONOMICAL MAP. Every star in this image is synthetic: positions, magnitudes '
    + 'and colours are drawn from a seeded PRNG against statistical distributions, with no '
    + 'catalogue behind them. No real constellation appears here and nothing in it may be '
    + 'used to identify a real star. It is a licence-free stand-in so the ToonLab volumetric '
    + 'sky harness has a panorama to render; ship a real catalogue map (NASA/Goddard SVS Deep '
    + 'Star Maps, Solar System Scope, ESO) in its place.',
  ),
  textChunk(
    'Source',
    'Generated by toonlab/scripts/generate-procedural-starmap.mjs '
    + `(seed ${SEED}, ${STAR_COUNT} stars to magnitude ${LIMIT_MAGNITUDE}).`,
  ),
  textChunk(
    'Comment',
    'Equirectangular, X = longitude 0..2pi, Y = latitude -pi/2..pi/2, poles on the top and '
    + 'bottom edges, sRGB-encoded. Matches the panorama format in src/sky/nightSky.js. The '
    + 'Milky Way band is placed through the real J2000 galactic pole so its angle across an '
    + 'RA/Dec panorama is correct; nothing else here is.',
  ),
  pngChunk('IDAT', deflateSync(raw, { level: 9 })),
  pngChunk('IEND', Buffer.alloc(0)),
]);

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(OUT_PATH, file);

// --- report ----------------------------------------------------------------

const brightest = stars[0];
const meanLuminance = luminanceSum / (WIDTH * HEIGHT);
const cumulative = (limit) => stars.filter((star) => star.magnitude < limit).length;

console.log(`wrote ${OUT_PATH}`);
console.log(`  ${WIDTH}x${HEIGHT}, ${(file.length / 1024).toFixed(1)} KiB, seed ${SEED}`);
console.log(`  ${STAR_COUNT} stars to magnitude ${LIMIT_MAGNITUDE}`);
console.log(`  brightest magnitude ${brightest.magnitude.toFixed(2)} (class ${brightest.tintName})`
  + `, peak linear radiance ${peakLinear.toFixed(4)}`);
console.log('  cumulative counts  N(<1) %d [~15]  N(<2) %d [~48]  N(<3) %d [~171]  '
  + 'N(<4) %d [~513]  N(<5) %d [~1602]',
cumulative(1), cumulative(2), cumulative(3), cumulative(4), cumulative(5));
console.log(`  spectral census    ${SPECTRAL_TABLE.map((entry) => `${entry.name} ${classCounts[entry.name] ?? 0}`).join('  ')}`);
console.log(`  lit pixels ${litPixels} (${((litPixels / (WIDTH * HEIGHT)) * 100).toFixed(2)}%)`
  + `, clipped ${clippedPixels}, mean linear luminance ${meanLuminance.toExponential(3)}`);

if (!Number.isFinite(meanLuminance) || meanLuminance <= 0) {
  console.error('starmap bake produced no light — refusing to claim success.');
  process.exit(1);
}
