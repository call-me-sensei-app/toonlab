#!/usr/bin/env node
// Measures the night sky THROUGH SkySystem, on a GPU, on both backends.
//
// scripts/probe-night-sky.mjs already proves the shader: the phase law, the
// panorama's UV frame, the occlusion. This proves the WIRING — that
// `SkySystem.create({ nightSky })` actually builds the thing, adds it to the
// scene, ticks it, and hands it back as `sky.nightSky`. Every measurement below
// is taken from a real SkySystem's real frame, never from the night-sky module
// directly, because a night sky that renders perfectly and is never constructed
// is exactly the bug this replaces.
//
//   npm run dev                                        # dev server on 5175
//   node scripts/probe-sky-system-night.mjs            # both backends
//   SKY_SYSTEM_NIGHT_RENDERER=webgpu node scripts/probe-sky-system-night.mjs
//
// The five claims, and the honest form of each:
//
//   1. `sky.nightSky` is non-null when a `nightSky` option was supplied and null
//      when it was not, and the option's `intensity` reaches both the live
//      uniform and `toParams()`.
//   2. The stars fade in across twilight and are ABSENT at noon. Measured with
//      the camera on the celestial pole, which is the one direction the star
//      rotation leaves fixed, so the same patch of panorama is in frame at every
//      clock reading and a change in the mean is the fade and nothing else. The
//      strong form is that mean / skyDarkness is constant: the fade is linear in
//      the clock's own darkness term, not merely monotonic.
//   3. The moon disc appears opposite the sun. `moonDirection · sunDirection` is
//      -1, the disc renders at the moon, and the frame aimed at the SUN is
//      empty — the antipode has to stay dark or there are two moons.
//   4. Phase 0 is dark and phase 0.5 is bright in the SAME direction: the disc
//      region is measured against the sky just outside it at both phases, and
//      `moonDirection` is compared bit for bit between them.
//   5. Omitting the texture renders black rather than throwing: a SkySystem
//      built with `nightSky: {}` constructs, reports `nightSky.texture === null`,
//      and with the moon dialled out renders exactly zero.

import process from 'node:process';
import { chromium } from 'playwright';

const RENDERERS = ['webgpu', 'webgpu-forced-gl'];
const requested = (process.env.SKY_SYSTEM_NIGHT_RENDERER || '').toLowerCase();
const renderers = requested ? [requested] : RENDERERS;
const baseUrl = process.env.SKY_SYSTEM_NIGHT_URL || 'http://127.0.0.1:5175/sky-smoke/';

const SIZE = 256;
// Vertical field for the disc frames. The moon's default angular radius is
// 1.404 degrees, so 4 degrees holds the whole disc with sky around it.
const DISC_FOV = 4;
// Vertical field for the star frames, and the angular radius actually averaged
// inside it. A CIRCLE around the frame centre is what makes the measurement
// invariant to the sky's roll about the pole; a rectangle's corners are not.
const STAR_FOV = 50;
const STAR_APERTURE_DEG = 18;

/** The procedural stand-in panorama. See scripts/generate-procedural-starmap.mjs. */
const STARMAP_URL = '/sky/starmap-procedural-2k.png';

/** Star intensity asked for through the option bag — not the 0.3 default. */
const REQUESTED_INTENSITY = 1.25;
/** Star intensity asked for through applyPreset, to prove the guard is live. */
const PRESET_INTENSITY = 0.62;

const expectedBackend = {
  webgl: 'webgl2-fallback', webgpu: 'webgpu', 'webgpu-forced-gl': 'webgl2-fallback',
};

function makeUrl(renderer) {
  const url = new URL(baseUrl);
  url.searchParams.set('hud', '0');
  url.searchParams.set('capture', '1');
  url.searchParams.set('preset', 'moonlitNight');
  if (renderer !== 'webgpu') url.searchParams.set('renderer', renderer);
  return url.toString();
}

// Runs in the page. Every import is a repo path the dev server transforms, so
// `three` resolves to the single instance the page already booted.
async function probe({
  discFov, presetIntensity, requestedIntensity, starApertureDeg, starFov, starmapUrl,
}) {
  const stage = window.__skySmoke;
  const { camera, renderer, scene, skyTarget } = stage;
  renderer.setAnimationLoop(null);
  // The smoke page's own dome is a second opaque backdrop in the same scene.
  stage.dome.group.visible = false;

  const { SkySystem } = await import('/src/sky/skySystem.js');

  const width = skyTarget.width;
  const height = skyTarget.height;

  const fromHalf = (bits) => {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x3ff;
    if (exponent === 0) return sign * (2 ** -24) * fraction;
    if (exponent === 31) return fraction ? NaN : sign * Infinity;
    return sign * (2 ** (exponent - 15)) * (1 + (fraction / 1024));
  };

  async function readFrame() {
    renderer.setRenderTarget(skyTarget);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const raw = await renderer.readRenderTargetPixelsAsync(skyTarget, 0, 0, width, height);
    const pixels = new Float32Array(raw.length);
    if (raw instanceof Uint16Array) {
      for (let i = 0; i < raw.length; i += 1) pixels[i] = fromHalf(raw[i]);
    } else {
      for (let i = 0; i < raw.length; i += 1) pixels[i] = raw[i];
    }
    return pixels;
  }

  const luminanceOf = (pixels, index) => (0.2126 * pixels[index * 4])
    + (0.7152 * pixels[(index * 4) + 1])
    + (0.0722 * pixels[(index * 4) + 2]);

  // Half-float quantises around 0.01 at about 1e-5, so anything under a few of
  // those is a zero that survived the encode rather than a signal.
  const HALF_EPSILON = 3e-5;

  /** Angular distance from frame centre, degrees, for the current fov. */
  function angleField(fov) {
    const halfTan = Math.tan((fov * Math.PI) / 360);
    const field = new Float32Array(width * height);
    for (let y = 0; y < height; y += 1) {
      const ny = (((y + 0.5) / height) * 2 - 1) * halfTan;
      for (let x = 0; x < width; x += 1) {
        const nx = (((x + 0.5) / width) * 2 - 1) * halfTan * (width / height);
        field[(y * width) + x] = (Math.atan(Math.hypot(nx, ny)) * 180) / Math.PI;
      }
    }
    return field;
  }

  const discAngles = angleField(discFov);
  const starAngles = angleField(starFov);

  function aim(sky, direction, fov) {
    camera.fov = fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.position.set(0, 1.7, 0);
    camera.lookAt(direction[0], 1.7 + direction[1], direction[2]);
    camera.updateMatrixWorld();
    // The system's own per-frame tick, not a hand-written one: this is what
    // re-centres the star sphere on the camera, and if it were missing the
    // sphere would sit at the origin and the probe would say so.
    sky.update(0);
  }

  /** Mean luminance inside a cone about the frame centre, and the peak in it. */
  function coneStats(pixels, angles, limitDeg) {
    let sum = 0;
    let count = 0;
    let peak = 0;
    for (let index = 0; index < width * height; index += 1) {
      if (angles[index] > limitDeg) continue;
      const luminance = luminanceOf(pixels, index);
      sum += luminance;
      count += 1;
      if (luminance > peak) peak = luminance;
    }
    return { mean: count ? sum / count : 0, peak, samples: count };
  }

  /** World direction that maps to the celestial pole under `starRotation`. */
  function celestialPoleOf(sky) {
    // starRotation takes world -> celestial, and three's Matrix3 elements are
    // column-major, so the world vector that lands on celestial +Y is the
    // matrix's second ROW.
    const e = sky.timeOfDay.starRotation.value.elements;
    return [e[1], e[4], e[7]];
  }

  // --- 1. null when not configured -----------------------------------------

  const plain = await SkySystem.create({ renderer, camera, scene });
  const withoutOption = {
    backdrops: plain.backdrops.length,
    nightSky: plain.nightSky,
    params: plain.toParams().nightSky,
  };
  plain.dispose();

  // --- the configured system -----------------------------------------------

  let createError = null;
  let sky = null;
  try {
    sky = await SkySystem.create({
      camera,
      nightSky: { intensity: requestedIntensity, texture: starmapUrl },
      renderer,
      scene,
      timeOfDay: { autoAdvanceSecondsPerDay: 0, azimuth: 0, latitude: 45, time: 0 },
    });
  } catch (error) {
    createError = `${error.name}: ${error.message}`;
  }
  if (!sky) return { createError, withoutOption };

  sky.clouds.enabled = false;
  sky.dome.group.visible = false;
  sky.update(0);

  const configured = {
    backdrops: sky.backdrops.length,
    inScene: sky.backdrops.includes(sky.nightSky.group) && sky.nightSky.group.parent === scene,
    intensityUniform: sky.nightSky.intensity.value,
    nightSkyIsNull: sky.nightSky === null,
    params: sky.toParams().nightSky,
    radius: sky.nightSky.radius,
    renderOrder: sky.nightSky.group.renderOrder,
    textureName: sky.nightSky.texture?.name ?? null,
    textureSize: sky.nightSky.texture
      ? [sky.nightSky.texture.image.width, sky.nightSky.texture.image.height]
      : null,
  };

  // --- 2. the twilight fade -------------------------------------------------
  //
  // The moon is dialled all the way out first: `moonIntensity` 0 removes the
  // disc, the rim and the ambient lift together, so whatever is left in frame is
  // the star term and nothing else.
  sky.timeOfDay.applyParams({ moon: { intensity: 0 } });

  const twilight = [];
  for (const time of [0.5, 0.7, 0.74, 0.76, 0.78, 0.8, 0.85, 0.95, 0]) {
    sky.timeOfDay.applyParams({ time });
    // eslint-disable-next-line no-await-in-loop
    aim(sky, celestialPoleOf(sky), starFov);
    // eslint-disable-next-line no-await-in-loop
    const pixels = await readFrame();
    const stats = coneStats(pixels, starAngles, starApertureDeg);
    twilight.push({
      darkness: sky.timeOfDay.skyDarkness.value,
      mean: stats.mean,
      peak: stats.peak,
      samples: stats.samples,
      sunElevationDeg: (Math.asin(Math.max(-1, Math.min(1, sky.sun.direction.value.y)))
        * 180) / Math.PI,
      time,
    });
  }

  // --- 3. the moon is opposite the sun -------------------------------------

  sky.timeOfDay.applyParams({ moon: { intensity: 1, phase: 0.5 }, time: 0 });
  sky.update(0);
  const sunDirection = sky.sun.direction.value.clone();
  const moonDirection = sky.timeOfDay.moonDirection.value.clone();
  const opposition = sunDirection.dot(moonDirection);
  const discRadiusDeg = (Math.acos(1 - sky.timeOfDay.moonAngularSize.value) * 180) / Math.PI;

  aim(sky, [moonDirection.x, moonDirection.y, moonDirection.z], discFov);
  const atMoon = await readFrame();
  const moonInside = coneStats(atMoon, discAngles, discRadiusDeg * 0.9);

  aim(sky, [sunDirection.x, sunDirection.y, sunDirection.z], discFov);
  const atSun = await readFrame();
  const sunInside = coneStats(atSun, discAngles, discRadiusDeg * 0.9);
  // The sky just outside where a disc WOULD be, so "no moon at the antipode" is
  // measured against the star field there rather than against zero.
  let sunOutsideSum = 0;
  let sunOutsideCount = 0;
  for (let index = 0; index < width * height; index += 1) {
    if (discAngles[index] < discRadiusDeg * 1.1) continue;
    sunOutsideSum += luminanceOf(atSun, index);
    sunOutsideCount += 1;
  }
  const sunOutsideMean = sunOutsideCount ? sunOutsideSum / sunOutsideCount : 0;

  // --- 4. phase 0 dark, phase 0.5 bright, same direction --------------------

  const phases = [];
  for (const phase of [0, 0.5]) {
    sky.timeOfDay.applyParams({ moon: { intensity: 1, phase } });
    // eslint-disable-next-line no-await-in-loop
    aim(sky, [moonDirection.x, moonDirection.y, moonDirection.z], discFov);
    const direction = sky.timeOfDay.moonDirection.value;
    // eslint-disable-next-line no-await-in-loop
    const pixels = await readFrame();

    let insideSum = 0;
    let insideCount = 0;
    let insidePeak = 0;
    let outsideSum = 0;
    let outsideCount = 0;
    for (let index = 0; index < width * height; index += 1) {
      const luminance = luminanceOf(pixels, index);
      if (discAngles[index] <= discRadiusDeg * 0.9) {
        insideSum += luminance;
        insideCount += 1;
        if (luminance > insidePeak) insidePeak = luminance;
      } else if (discAngles[index] >= discRadiusDeg * 1.1) {
        outsideSum += luminance;
        outsideCount += 1;
      }
    }

    // Where the lit body IS, measured on a SECOND frame with the panorama
    // turned off. The star field is not scenery for this measurement: a
    // magnitude-1 star three degrees from the moon clears any threshold the
    // disc's own limb clears, so with the stars in frame the footprint below
    // would be measuring the sky. Their occlusion by the disc is what the
    // insideMean/outsideMean pair above is for, and probe-night-sky.mjs
    // measures the hole directly.
    const starIntensity = sky.nightSky.intensity.value;
    sky.nightSky.intensity.value = 0;
    // eslint-disable-next-line no-await-in-loop
    const bare = await readFrame();
    sky.nightSky.intensity.value = starIntensity;

    let barePeak = 0;
    for (let index = 0; index < width * height; index += 1) {
      const luminance = luminanceOf(bare, index);
      if (discAngles[index] <= discRadiusDeg * 0.9 && luminance > barePeak) barePeak = luminance;
    }

    // UNWEIGHTED, over every pixel above a tenth of the disc's peak. Unweighted
    // on purpose: the lunar albedo bake has maria on one side, so a
    // brightness-weighted centroid measures the map's asymmetry — 6 px of it, a
    // fifteenth of a disc radius — and not the direction the body is drawn in,
    // which is what this check is about.
    const threshold = barePeak * 0.1;
    let footprint = 0;
    let footprintX = 0;
    let footprintY = 0;
    let footprintReachDeg = 0;
    if (threshold > 1e-4) {
      for (let index = 0; index < width * height; index += 1) {
        if (luminanceOf(bare, index) < threshold) continue;
        footprint += 1;
        footprintX += (index % width) - ((width - 1) / 2);
        footprintY += Math.floor(index / width) - ((height - 1) / 2);
        if (discAngles[index] > footprintReachDeg) footprintReachDeg = discAngles[index];
      }
    }

    phases.push({
      barePeak,
      centroid: footprint ? [footprintX / footprint, footprintY / footprint] : null,
      direction: [direction.x, direction.y, direction.z],
      footprint,
      footprintReachDeg,
      illumination: sky.timeOfDay.moonPhaseIllumination.value,
      insideMean: insideCount ? insideSum / insideCount : 0,
      insidePeak,
      outsideMean: outsideCount ? outsideSum / outsideCount : 0,
      phase,
    });
  }

  // --- the intensity guard in applyPreset -----------------------------------
  //
  // The line this probe exists to make live: before the fix `#nightSky` was
  // permanently null, so a preset's star intensity was clamped, stored, returned
  // by toParams() and never written to anything that renders.
  await sky.applyPreset({ nightSky: { intensity: presetIntensity } });
  const afterPreset = {
    params: sky.toParams().nightSky,
    uniform: sky.nightSky.intensity.value,
  };

  sky.dispose();

  // --- 5. no texture --------------------------------------------------------

  let blackError = null;
  let black = null;
  try {
    const dark = await SkySystem.create({
      camera,
      nightSky: {},
      renderer,
      scene,
      timeOfDay: { autoAdvanceSecondsPerDay: 0, azimuth: 0, latitude: 45, time: 0 },
    });
    dark.clouds.enabled = false;
    dark.dome.group.visible = false;
    // The moon out too, so "black" is a statement about the whole night sky
    // rather than about a starless one with a moon in it.
    dark.timeOfDay.applyParams({ moon: { intensity: 0 } });
    aim(dark, celestialPoleOf(dark), starFov);
    const pixels = await readFrame();
    let peak = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      peak = Math.max(peak, Math.abs(pixels[i]), Math.abs(pixels[i + 1]), Math.abs(pixels[i + 2]));
    }
    // And the moon back on, to prove the zero above was the missing panorama and
    // not a night sky that failed to build.
    dark.timeOfDay.applyParams({ moon: { intensity: 1, phase: 0.5 } });
    const moon = dark.timeOfDay.moonDirection.value;
    aim(dark, [moon.x, moon.y, moon.z], discFov);
    const moonPixels = await readFrame();
    const moonStats = coneStats(moonPixels, discAngles, discRadiusDeg * 0.9);

    black = {
      isNull: dark.nightSky === null,
      moonMean: moonStats.mean,
      moonPeak: moonStats.peak,
      peak,
      texture: dark.nightSky?.texture ?? null,
      intensity: dark.nightSky?.intensity.value ?? null,
    };
    dark.dispose();
  } catch (error) {
    blackError = `${error.name}: ${error.message}`;
  }

  // --- a URL that does not exist -------------------------------------------
  //
  // Rejecting is the documented behaviour, not a black sky: a panorama that was
  // asked for and never arrived is not the same as one that was never asked for.
  let missingError = null;
  try {
    const broken = await SkySystem.create({
      camera, nightSky: { texture: '/sky/does-not-exist.png' }, renderer, scene,
    });
    broken.dispose();
    missingError = null;
  } catch (error) {
    missingError = `${error.name}: ${error.message}`;
  }

  return {
    afterPreset,
    backend: document.body.dataset.rendererBackend ?? null,
    black,
    blackError,
    configured,
    createError,
    discRadiusDeg,
    frame: { height, width },
    halfEpsilon: HALF_EPSILON,
    missingError,
    moonDirection: [moonDirection.x, moonDirection.y, moonDirection.z],
    moonInside,
    opposition,
    phases,
    sunDirection: [sunDirection.x, sunDirection.y, sunDirection.z],
    sunInside,
    sunOutsideMean,
    twilight,
    withoutOption,
  };
}

// ---------------------------------------------------------------------------

let failures = 0;
const check = (label, ok, detail) => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `  ${detail}` : ''}`);
};

const browser = await chromium.launch({
  args: ['--enable-unsafe-webgpu', '--enable-gpu'],
  headless: true,
});

for (const renderer of renderers) {
  console.log(`\n=== ${renderer} ===`);
  const page = await browser.newPage({
    deviceScaleFactor: 1,
    viewport: { height: SIZE, width: SIZE },
  });
  const errors = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });

  try {
    await page.goto(makeUrl(renderer), { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => document.body.dataset.skyReady === 'true', { timeout: 90_000 });
    const backend = await page.evaluate(() => document.body.dataset.rendererBackend || null);
    check(`backend is ${expectedBackend[renderer]}`, backend === expectedBackend[renderer], backend);

    const result = await page.evaluate(probe, {
      discFov: DISC_FOV,
      presetIntensity: PRESET_INTENSITY,
      requestedIntensity: REQUESTED_INTENSITY,
      starApertureDeg: STAR_APERTURE_DEG,
      starFov: STAR_FOV,
      starmapUrl: STARMAP_URL,
    });

    if (result.createError) {
      check('SkySystem.create({ nightSky }) builds', false, result.createError);
      throw new Error(result.createError);
    }

    console.log(`\nframe ${result.frame.width}x${result.frame.height}`
      + `  disc radius ${result.discRadiusDeg.toFixed(3)} deg`);

    // --- 1 -----------------------------------------------------------------
    console.log('\n-- 1. construction');
    console.log(`  no option:   nightSky ${String(result.withoutOption.nightSky)}`
      + `  backdrops ${result.withoutOption.backdrops}`
      + `  toParams().nightSky.intensity ${result.withoutOption.params.intensity}`);
    console.log(`  configured:  texture ${result.configured.textureName} `
      + `${result.configured.textureSize?.join('x')}`
      + `  radius ${result.configured.radius}`
      + `  renderOrder ${result.configured.renderOrder}`
      + `  backdrops ${result.configured.backdrops}`);
    console.log(`               intensity uniform ${result.configured.intensityUniform}`
      + `  toParams ${result.configured.params.intensity}`);

    check('sky.nightSky is null with no option', result.withoutOption.nightSky === null,
      String(result.withoutOption.nightSky));
    check('sky.nightSky is non-null when configured', result.configured.nightSkyIsNull === false);
    check('the night-sky group is in the scene and in backdrops', result.configured.inScene);
    check('backdrops grows by exactly the night sky',
      result.configured.backdrops === result.withoutOption.backdrops + 1,
      `${result.withoutOption.backdrops} -> ${result.configured.backdrops}`);
    check('the URL was loaded into a real texture',
      result.configured.textureSize?.[0] > 0 && result.configured.textureSize?.[1] > 0,
      result.configured.textureSize?.join('x'));
    check('the option intensity reaches the uniform',
      Math.abs(result.configured.intensityUniform - REQUESTED_INTENSITY) < 1e-6,
      `${result.configured.intensityUniform} vs ${REQUESTED_INTENSITY}`);
    check('the option intensity reaches toParams()',
      Math.abs(result.configured.params.intensity - REQUESTED_INTENSITY) < 1e-6,
      `${result.configured.params.intensity}`);
    check('radius defaults to 100000', result.configured.radius === 100_000,
      String(result.configured.radius));

    // --- 2 -----------------------------------------------------------------
    console.log('\n-- 2. the stars across twilight (camera on the celestial pole, moon off)');
    console.log('time    sunElev     darkness   starMean      starPeak      mean/darkness');
    const ratios = [];
    for (const sample of result.twilight) {
      const ratio = sample.darkness > 0.05 ? sample.mean / sample.darkness : null;
      if (ratio !== null) ratios.push(ratio);
      console.log(
        `${sample.time.toFixed(2)}    ${sample.sunElevationDeg.toFixed(2).padStart(7)} deg  `
        + `${sample.darkness.toFixed(4)}     ${sample.mean.toExponential(3)}     `
        + `${sample.peak.toExponential(3)}     ${ratio === null ? '     -' : ratio.toExponential(3)}`,
      );
    }
    const noon = result.twilight.find((sample) => sample.time === 0.5);
    const midnight = result.twilight.find((sample) => sample.time === 0);
    const ratioSpread = ratios.length
      ? (Math.max(...ratios) - Math.min(...ratios)) / (ratios.reduce((a, b) => a + b, 0)
        / ratios.length)
      : Infinity;

    check('stars are absent at noon', noon.peak < result.halfEpsilon,
      `peak ${noon.peak.toExponential(3)} < ${result.halfEpsilon.toExponential(1)}`);
    // A star field is mostly empty sky, so the MEAN over an 18-degree cone is
    // small by construction — the peak is what says a star is on screen, and the
    // mean is what says the field is there rather than one hot texel.
    check('stars are present at midnight',
      midnight.peak > 1e-2 && midnight.mean > 20 * result.halfEpsilon,
      `mean ${midnight.mean.toExponential(3)}  peak ${midnight.peak.toExponential(3)}`);
    check('the fade is monotonic across twilight',
      result.twilight.every((sample, index) => index === 0
        || sample.mean >= result.twilight[index - 1].mean - result.halfEpsilon),
      result.twilight.map((sample) => sample.mean.toExponential(1)).join(' -> '));
    check('the fade is linear in skyDarkness', ratioSpread < 0.03,
      `mean/darkness spread ${(ratioSpread * 100).toFixed(2)}% over ${ratios.length} night samples`);

    // --- 3 -----------------------------------------------------------------
    console.log('\n-- 3. the moon is opposite the sun');
    console.log(`  sun  [${result.sunDirection.map((v) => v.toFixed(5)).join(', ')}]`);
    console.log(`  moon [${result.moonDirection.map((v) => v.toFixed(5)).join(', ')}]`
      + `  dot ${result.opposition.toFixed(9)}`);
    console.log(`  frame at the moon: disc mean ${result.moonInside.mean.toExponential(3)}`
      + `  peak ${result.moonInside.peak.toExponential(3)}`);
    console.log(`  frame at the sun:  disc mean ${result.sunInside.mean.toExponential(3)}`
      + `  surrounding sky ${result.sunOutsideMean.toExponential(3)}`);

    check('moonDirection is the sun antipode', Math.abs(result.opposition + 1) < 1e-6,
      `dot ${result.opposition}`);
    check('the disc renders at the moon', result.moonInside.peak > 1e-3,
      `peak ${result.moonInside.peak.toExponential(3)}`);
    check('nothing renders at the sun antipode',
      result.sunInside.mean < result.sunOutsideMean * 1.5 + result.halfEpsilon,
      `${result.sunInside.mean.toExponential(3)} vs sky ${result.sunOutsideMean.toExponential(3)}`);

    // --- 4 -----------------------------------------------------------------
    console.log('\n-- 4. phase 0 vs phase 0.5, same direction');
    console.log('   (disc/sky columns are the full frame; footprint columns are a second frame '
      + 'with the panorama off)');
    console.log('phase  illum   discMean      discPeak      skyOutside    disc-sky      '
      + 'footprint  centroid px       reach');
    for (const sample of result.phases) {
      console.log(
        `${sample.phase.toFixed(2)}   ${sample.illumination.toFixed(3)}   `
        + `${sample.insideMean.toExponential(3)}     ${sample.insidePeak.toExponential(3)}     `
        + `${sample.outsideMean.toExponential(3)}     `
        + `${(sample.insideMean - sample.outsideMean).toExponential(3)}     `
        + `${String(sample.footprint).padStart(6)} px  `
        + `${(sample.centroid ? sample.centroid.map((v) => v.toFixed(2)).join(', ') : '(no light)').padEnd(16)}  `
        + `${sample.footprintReachDeg.toFixed(3)} deg`,
      );
    }
    const dark = result.phases[0];
    const full = result.phases[1];
    const sameDirection = dark.direction.every((v, i) => v === full.direction[i]);
    console.log(`  moonDirection at phase 0   [${dark.direction.map((v) => v.toFixed(9)).join(', ')}]`);
    console.log(`  moonDirection at phase 0.5 [${full.direction.map((v) => v.toFixed(9)).join(', ')}]`);

    check('phase 0 leaves the disc dark', dark.insideMean <= dark.outsideMean,
      `disc ${dark.insideMean.toExponential(3)} <= sky ${dark.outsideMean.toExponential(3)}`);
    check('phase 0.5 lights the disc', full.insideMean > dark.insideMean * 50 + 1e-3,
      `${dark.insideMean.toExponential(3)} -> ${full.insideMean.toExponential(3)}`);
    check('the direction is bit-identical across the phase change', sameDirection);
    check('the lit disc is centred on the frame, i.e. on moonDirection',
      full.centroid !== null && Math.hypot(full.centroid[0], full.centroid[1]) < 2,
      full.centroid ? `${Math.hypot(full.centroid[0], full.centroid[1]).toFixed(3)} px` : 'none');
    // Radius on frame, in pixels, for an angular radius over this field.
    const pixelRadius = (deg) => (Math.tan((deg * Math.PI) / 180)
      / Math.tan((DISC_FOV * Math.PI) / 360)) * (SIZE / 2);
    // A shade under `moonAngularSize`, and the shortfall is the module's own rim
    // fade: MOON_RIM_FADE smoothsteps the mask to zero at the limb, so the
    // outermost sliver of the disc sits below a tenth of the peak. What matters
    // is that it does not reach PAST the disc, which would be radiance leaking
    // into the sky around the moon.
    check('the lit region reaches the disc limb and no further',
      full.footprintReachDeg <= result.discRadiusDeg
        && full.footprintReachDeg > result.discRadiusDeg * 0.98,
      `${full.footprintReachDeg.toFixed(3)} vs ${result.discRadiusDeg.toFixed(3)} deg limb`);
    // Round, not a crescent or a wedge: the area has to be the area of a filled
    // disc of the radius just measured. The full-disc figure over a 4-degree
    // field on a 256-pixel frame is 25337 px, the same footprint
    // src/sky/nightSky.js quotes in its own header.
    const roundArea = Math.PI * pixelRadius(full.footprintReachDeg) ** 2;
    check('the lit region is a filled disc of that radius',
      Math.abs(full.footprint / roundArea - 1) < 0.015,
      `${full.footprint} px vs ${roundArea.toFixed(0)} px for a filled disc `
      + `(${pixelRadius(result.discRadiusDeg).toFixed(1)} px limb, ${(Math.PI * pixelRadius(result.discRadiusDeg) ** 2).toFixed(0)} px)`);
    check('phase 0 draws no lit footprint at all', dark.footprint === 0,
      `${dark.footprint} px`);

    // --- the preset guard ---------------------------------------------------
    console.log('\n-- applyPreset drives the live uniform');
    console.log(`  asked ${PRESET_INTENSITY}  uniform ${result.afterPreset.uniform}`
      + `  toParams ${result.afterPreset.params.intensity}`);
    check('applyPreset writes nightSky.intensity through to the uniform',
      Math.abs(result.afterPreset.uniform - PRESET_INTENSITY) < 1e-6,
      String(result.afterPreset.uniform));

    // --- 5 -----------------------------------------------------------------
    console.log('\n-- 5. no panorama');
    if (result.blackError) {
      check('nightSky with no texture builds without throwing', false, result.blackError);
    } else {
      console.log(`  nightSky ${result.black.isNull ? 'null' : 'built'}`
        + `  texture ${String(result.black.texture)}`
        + `  intensity ${result.black.intensity}`);
      console.log(`  star frame peak ${result.black.peak.toExponential(3)}`
        + `  moon-on disc mean ${result.black.moonMean.toExponential(3)}`
        + `  peak ${result.black.moonPeak.toExponential(3)}`);
      check('nightSky with no texture builds without throwing', true);
      check('it is still a real night sky', result.black.isNull === false);
      check('its panorama is null', result.black.texture === null);
      check('and it renders exactly black', result.black.peak < result.halfEpsilon,
        `peak ${result.black.peak.toExponential(3)}`);
      check('while the moon still rises', result.black.moonPeak > 1e-3,
        `peak ${result.black.moonPeak.toExponential(3)}`);
    }

    console.log('\n-- a texture URL that does not exist');
    console.log(`  ${result.missingError ?? '(no error — it rendered black instead)'}`);
    check('a missing panorama rejects rather than silently rendering black',
      typeof result.missingError === 'string' && result.missingError.includes('nightSky.texture'));

  } catch (error) {
    failures += 1;
    console.log(`FAIL probe threw  ${error.message}`);
  }

  // The star panorama's 404 is deliberate and is checked above; anything else on
  // the console is a real page error.
  const real = errors.filter((text) => !text.includes('does-not-exist'));
  if (real.length) {
    failures += real.length;
    for (const text of real) console.log(`FAIL console  ${text}`);
  }
  await page.close();
}

await browser.close();
console.log(`\n${failures === 0 ? 'all checks passed' : `${failures} FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
