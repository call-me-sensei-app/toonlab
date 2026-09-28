// Measures src/sky/nightSky.js on a GPU, on both backends.
//
// Every claim this module makes lives in a shader, so a CPU assertion about it
// would only be asserting a second implementation of the same arithmetic. This
// drives the shipped material instead: it boots the sky-smoke page (the smallest
// scene that puts the rebuild on a GPU), hides the atmosphere dome, adds the real
// night-sky mesh with its real additive blending, renders into the page's own
// half-float target and reads the pixels back.
//
//   npm run dev                                   # dev server on 5175
//   node scripts/probe-night-sky.mjs              # both backends
//   NIGHT_SKY_PROBE_RENDERER=webgpu node scripts/probe-night-sky.mjs
//
// What it measures, and why each one is the honest form of the claim:
//
//   1. Moon phase. Mean and peak radiance over the disc across the phase dial,
//      against the disc's own footprint. "Dark at 0, brightest at 0.5" is a
//      statement about radiance; "the direction is unchanged" is the statement
//      that NO radiance appears outside 1.404 degrees of `moonDirection` at any
//      phase and that the lit region still reaches both limbs across the
//      terminator, which is what pins the terminator through the disc's centre.
//   2. Star rotation. The panorama is sampled with a (u, v) ramp texture, so the
//      pixel that comes back IS the UV the shader sampled. Advancing the clock
//      must move u by exactly the elapsed fraction of a day, and latitude must
//      tilt v; both are checked against the celestial frame the driver publishes,
//      so the shader and `starRotationAt` cannot drift apart.
//   3. No texture. Without a panorama the star term must be exactly zero rather
//      than an error, and with the moon dialled out the whole night sky must be
//      exactly zero.

import process from 'node:process';
import { chromium } from 'playwright';

const RENDERERS = ['webgpu', 'webgpu-forced-gl'];
const requested = (process.env.NIGHT_SKY_PROBE_RENDERER || '').toLowerCase();
const renderers = requested ? [requested] : RENDERERS;
const baseUrl = process.env.NIGHT_SKY_PROBE_URL || 'http://127.0.0.1:5175/sky-smoke/';
const SIZE = 256;
// Vertical field for the disc probe. The moon's default angular radius is 1.404
// degrees, so 4 degrees puts the whole disc inside the frame with room around it
// for the "nothing outside the disc" check.
const DISC_FOV = 4;

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

// Runs in the page. Everything it imports is a repo module the dev server
// transforms, so `three` resolves to the one instance the page already booted.
async function probe({ discFov, size }) {
  const stage = window.__skySmoke;
  const { camera, dome, renderer, scene, skyTarget } = stage;
  renderer.setAnimationLoop(null);
  dome.group.visible = false;

  const { createTimeOfDay } = await import('/src/sky/timeOfDay.js');
  const { createSun, createSunDriver, starRotationAt } = await import('/src/sky/sunDriver.js');
  const nightSkyModule = await import('/src/sky/nightSky.js');
  const { createNightSky } = nightSkyModule;

  const clock = createTimeOfDay();
  const sun = createSun();
  const driver = createSunDriver({ sun, timeOfDay: clock });
  const nightSky = createNightSky({ timeOfDay: clock });
  scene.add(nightSky.group);

  // Half-float bit patterns, decoded without three so this stays a plain
  // readback. The target is the page's own, so this is the format the whole
  // rebuild renders into.
  const fromHalf = (bits) => {
    const sign = bits & 0x8000 ? -1 : 1;
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x3ff;
    if (exponent === 0) return sign * (2 ** -24) * fraction;
    if (exponent === 31) return fraction ? NaN : sign * Infinity;
    return sign * (2 ** (exponent - 15)) * (1 + (fraction / 1024));
  };

  const width = skyTarget.width;
  const height = skyTarget.height;

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

  function aim(direction, fov) {
    camera.fov = fov;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    camera.position.set(0, 1.7, 0);
    camera.lookAt(direction[0], 1.7 + direction[1], direction[2]);
    camera.updateMatrixWorld();
    nightSky.update(0, camera);
  }

  // --- 1. the moon disc across the phase dial ------------------------------

  clock.applyParams({ autoAdvanceSecondsPerDay: 0, azimuth: 0, latitude: 45, time: 0 });
  driver.apply();
  const moonDirection = clock.moonDirection.value.clone();
  const discRadiusDeg = (Math.acos(1 - clock.moonAngularSize.value) * 180) / Math.PI;
  aim([moonDirection.x, moonDirection.y, moonDirection.z], discFov);

  // Angular distance from frame centre for every pixel, so "inside the disc" is
  // measured in degrees rather than in pixels. `discX` is the same offset along
  // the image's horizontal axis in units of lunar radii: at time 0 the moon is at
  // upper transit, so the disc's own +x axis (along the celestial equator) is
  // exactly the image's horizontal, and the terminator's crossing can be compared
  // against the phase angle directly.
  const halfTan = Math.tan((discFov * Math.PI) / 360);
  const discTan = Math.tan((discRadiusDeg * Math.PI) / 180);
  const angleDeg = new Float32Array(width * height);
  const discX = new Float32Array(width);
  for (let x = 0; x < width; x += 1) {
    discX[x] = ((((x + 0.5) / width) * 2 - 1) * halfTan * (width / height)) / discTan;
  }
  for (let y = 0; y < height; y += 1) {
    const ny = (((y + 0.5) / height) * 2 - 1) * halfTan;
    for (let x = 0; x < width; x += 1) {
      const nx = (((x + 0.5) / width) * 2 - 1) * halfTan * (width / height);
      angleDeg[(y * width) + x] = (Math.atan(Math.hypot(nx, ny)) * 180) / Math.PI;
    }
  }
  const centreRow = Math.floor(height / 2);

  const luminanceOf = (pixels, index) => (0.2126 * pixels[index * 4])
    + (0.7152 * pixels[(index * 4) + 1])
    + (0.0722 * pixels[(index * 4) + 2]);

  // Rec.709 luminance of a linear colour scaled by a gain, so the expected
  // radiance of a term can be compared against a measured luminance.
  const gainLuminance = (color, gain) => (0.2126 * color.r * gain)
    + (0.7152 * color.g * gain) + (0.0722 * color.b * gain);

  // Half-float quantises around 0.01 at about 1e-5, so anything under a few of
  // those is a zero that survived the encode, not a signal.
  const HALF_EPSILON = 3e-5;

  const phases = [0, 0.05, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 0.95, 1];
  const discSamples = [];
  for (const phase of phases) {
    clock.applyParams({ moon: { phase } });
    driver.apply();
    // eslint-disable-next-line no-await-in-loop
    const pixels = await readFrame();

    // The documented ambient lift covers the whole sphere, so the sky well
    // outside the disc IS that lift and nothing else. Measured rather than
    // assumed, then taken off every pixel, which turns "is the disc dark" into a
    // question about the disc instead of about the lift underneath it.
    let ambientSum = 0;
    let ambientCount = 0;
    let ambientMin = Infinity;
    let ambientMax = -Infinity;
    for (let index = 0; index < width * height; index += 1) {
      if (angleDeg[index] < discRadiusDeg * 1.05) continue;
      const luminance = luminanceOf(pixels, index);
      ambientSum += luminance;
      ambientCount += 1;
      if (luminance < ambientMin) ambientMin = luminance;
      if (luminance > ambientMax) ambientMax = luminance;
    }
    const ambient = ambientSum / ambientCount;

    let inside = 0;
    let insideSum = 0;
    let insidePeak = 0;
    let lit = 0;
    let outsidePeak = 0;
    let litMaxAngle = 0;
    let leftSum = 0;
    let rightSum = 0;
    // Does the lit region still touch both limbs across the terminator? A
    // terminator through the centre always leaves the far edges of the disc lit
    // on one side; a moon that had MOVED would light one limb and not the other.
    let topLit = 0;
    let bottomLit = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width) + x;
        const luminance = luminanceOf(pixels, index) - ambient;
        if (angleDeg[index] <= discRadiusDeg * 0.98) {
          inside += 1;
          insideSum += luminance;
          if (luminance > insidePeak) insidePeak = luminance;
          if (luminance > HALF_EPSILON) {
            lit += 1;
            if (angleDeg[index] > litMaxAngle) litMaxAngle = angleDeg[index];
            if (x < width / 2) leftSum += luminance; else rightSum += luminance;
            if (y < height / 2) topLit += 1; else bottomLit += 1;
          }
        } else if (angleDeg[index] >= discRadiusDeg * 1.05) {
          outsidePeak = Math.max(outsidePeak, Math.abs(luminance));
        }
      }
    }
    // The lit interval across the disc's horizontal diameter, in lunar radii. The
    // terminator is the plane dot(normal, sunward) = 0, which crosses that
    // diameter at x = -cos(phase angle) whatever the phase — and the lit side runs
    // from there to the limb at |x| = 1. Both edges are measured from the frame
    // centre, so this is simultaneously a statement about the phase and about
    // where the disc is.
    let litMin = Infinity;
    let litMax = -Infinity;
    for (let x = 0; x < width; x += 1) {
      const index = (centreRow * width) + x;
      if (angleDeg[index] > discRadiusDeg) continue;
      if (luminanceOf(pixels, index) - ambient <= HALF_EPSILON) continue;
      litMin = Math.min(litMin, discX[x]);
      litMax = Math.max(litMax, discX[x]);
    }

    discSamples.push({
      ambient,
      ambientExpected: gainLuminance(
        clock.moonColor.value,
        clock.moonAmbient.value * clock.moonPhaseIllumination.value
          * clock.skyDarkness.value * clock.moonIntensity.value,
      ),
      ambientSpread: ambientMax - ambientMin,
      illumination: clock.moonPhaseIllumination.value,
      insideMean: insideSum / inside,
      insidePeak,
      leftShare: leftSum + rightSum > 0 ? leftSum / (leftSum + rightSum) : 0,
      litFraction: lit / inside,
      litMaxAngleDeg: litMaxAngle,
      litMaxX: Number.isFinite(litMax) ? litMax : null,
      litMinX: Number.isFinite(litMin) ? litMin : null,
      litSpanBalance: topLit + bottomLit > 0
        ? Math.min(topLit, bottomLit) / Math.max(topLit, bottomLit) : 0,
      outsidePeak,
      phase,
      // Where the lit interval has to start and end, straight off the clock's own
      // (sin, cos) phase trig. The terminator crosses the horizontal diameter at
      // x = -cos(psi) * sign(sin(psi)) — solving dot(normal, sunward) = 0 at
      // ny = 0 — and the lit limb is the disc's edge on the sunward side,
      // x = sign(sin(psi)). A full moon has no terminator on the disc at all, so
      // it spans the whole diameter.
      ...(() => {
        const sinPhase = clock.moonPhaseTrig.value.x;
        const cosPhase = clock.moonPhaseTrig.value.y;
        if (Math.abs(sinPhase) < 1e-6) return { expectedFrom: -1, expectedTo: 1, side: 0 };
        const side = Math.sign(sinPhase);
        const terminator = -cosPhase * side;
        return side > 0
          ? { expectedFrom: terminator, expectedTo: 1, side }
          : { expectedFrom: -1, expectedTo: terminator, side };
      })(),
    });
  }

  // What the module's own calibration says a full moon's disc mean should be, as
  // a luminance, so the measurement is compared in the unit it was taken in.
  clock.applyParams({ moon: { phase: 0.5 } });
  driver.apply();
  const expectedFullMean = gainLuminance(
    clock.moonColor.value,
    nightSkyModule.MOON_DISC_FULL_MEAN_RADIANCE * clock.moonIntensity.value
      * (clock.moonDiscBrightness.value / 9),
  );

  // The disc's direction, read off the frame rather than assumed: the centroid of
  // the disc's footprint at full phase, where the whole disc is lit and the
  // footprint IS the disc.
  const centroids = [];
  for (const phase of [0.5]) {
    clock.applyParams({ moon: { phase } });
    driver.apply();
    // eslint-disable-next-line no-await-in-loop
    const pixels = await readFrame();
    const ambient = gainLuminance(
      clock.moonColor.value,
      clock.moonAmbient.value * clock.moonPhaseIllumination.value
        * clock.skyDarkness.value * clock.moonIntensity.value,
    );
    let weight = 0;
    let sx = 0;
    let sy = 0;
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width) + x;
        if (angleDeg[index] > discRadiusDeg * 1.5) continue;
        // The footprint, not the brightness: a crescent's brightness centroid
        // moves with the phase by design, its footprint does not.
        if (luminanceOf(pixels, index) - ambient <= HALF_EPSILON) continue;
        weight += 1;
        sx += x + 0.5;
        sy += y + 0.5;
      }
    }
    centroids.push({
      footprintPixels: weight,
      offsetXPixels: weight ? (sx / weight) - (width / 2) : null,
      offsetYPixels: weight ? (sy / weight) - (height / 2) : null,
      phase,
    });
  }

  // --- 2. star rotation, read out of the sampler ---------------------------

  clock.applyParams({ moon: { intensity: 0, phase: 0.5 } });
  nightSky.intensity.value = 1;

  // A (u, v) ramp in linear space, so the pixel that comes back is the panorama
  // coordinate the shader sampled. Built from the constructor of a texture the
  // module already made, which is how this stays free of a second `three`.
  const RAMP = 64;
  const rampData = new Uint8Array(RAMP * RAMP * 4);
  for (let j = 0; j < RAMP; j += 1) {
    for (let i = 0; i < RAMP; i += 1) {
      const offset = (((j * RAMP) + i) * 4);
      rampData[offset] = Math.round((((i + 0.5) / RAMP) * 255));
      rampData[offset + 1] = Math.round((((j + 0.5) / RAMP) * 255));
      rampData[offset + 2] = 0;
      rampData[offset + 3] = 255;
    }
  }
  const template = nightSky.moonTexture;
  const ramp = new template.constructor(
    rampData, RAMP, RAMP, template.format, template.type,
  );
  ramp.name = 'NightSkyProbeRamp';
  // Explicitly linear, so `adoptPanorama` leaves the encoding alone and the ramp
  // reads back as the numbers it was written as.
  ramp.colorSpace = 'srgb-linear';
  ramp.magFilter = template.magFilter;
  ramp.minFilter = template.minFilter;
  ramp.generateMipmaps = false;
  ramp.flipY = false;
  ramp.unpackAlignment = 1;
  ramp.needsUpdate = true;
  nightSky.setTexture(ramp, true);

  const toRad = Math.PI / 180;
  const directionOf = (elevation, azimuth) => [
    Math.cos(elevation * toRad) * Math.sin(azimuth * toRad),
    Math.sin(elevation * toRad),
    Math.cos(elevation * toRad) * Math.cos(azimuth * toRad),
  ];
  // Two fixed world directions. The rate probe looks well away from the poles so
  // u is the clean readout; the tilt probe looks nearly straight up due north,
  // where the declination it lands on is 90 - |latitude - 85| and so sweeps the
  // celestial latitude as the observer moves.
  const rateDir = directionOf(35, 20);
  const tiltDir = directionOf(85, 0);

  async function readCentreUV() {
    const pixels = await readFrame();
    let u = 0;
    let v = 0;
    for (const [dx, dy] of [[0, 0], [-1, 0], [0, -1], [-1, -1]]) {
      const offset = ((((height / 2) + dy) * width) + (width / 2) + dx) * 4;
      u += pixels[offset] / 4;
      v += pixels[offset + 1] / 4;
    }
    return { u, v };
  }

  // The same UV from the celestial frame the driver publishes, as the reference
  // the sampler has to agree with. Rows of `starRotation` project a world
  // direction onto the celestial axes; the quarter-turn on u is the module's
  // documented shift that centres celestial longitude 0 on the panorama.
  function modelUV(direction, time, latitude, azimuth) {
    const e = starRotationAt(time, latitude, azimuth).elements;
    const cx = (e[0] * direction[0]) + (e[3] * direction[1]) + (e[6] * direction[2]);
    const cy = (e[1] * direction[0]) + (e[4] * direction[1]) + (e[7] * direction[2]);
    const cz = (e[2] * direction[0]) + (e[5] * direction[1]) + (e[8] * direction[2]);
    let u = (Math.atan2(cz, cx) / (Math.PI * 2)) + 0.25;
    u -= Math.floor(u);
    const v = (Math.asin(Math.max(-1, Math.min(1, cy))) / Math.PI) + 0.5;
    return { u, v };
  }

  // Night only, and for a reason worth stating: the stars are multiplied by
  // `skyDarkness`, so a daylight sample reads exactly 0 and carries no UV at all.
  // At latitude 45 the sun is below the horizon from about 0.77 through 0.23.
  const clockSamples = [];
  for (const time of [0.8, 0.85, 0.9, 0.95, 0, 0.05, 0.1]) {
    clock.applyParams({ latitude: 45, time });
    driver.apply();
    aim(rateDir, discFov);
    // eslint-disable-next-line no-await-in-loop
    const measured = await readCentreUV();
    clockSamples.push({
      darkness: clock.skyDarkness.value,
      latitude: 45,
      measured,
      model: modelUV(rateDir, time, 45, 0),
      // Unwrapped, so a rate can be fitted across midnight.
      timeline: time >= 0.5 ? time - 1 : time,
      time,
    });
  }

  // Latitude 90 is left out on purpose: the equinox arc puts the sun exactly on
  // the horizon all day there, so `skyDarkness` never leaves 0 and there is no
  // night to read stars in.
  const latitudeSamples = [];
  for (const latitude of [0, 15, 30, 45, 60, 75]) {
    clock.applyParams({ latitude, time: 0 });
    driver.apply();
    aim(tiltDir, discFov);
    // eslint-disable-next-line no-await-in-loop
    const measured = await readCentreUV();
    latitudeSamples.push({
      darkness: clock.skyDarkness.value,
      // Declination of a point 85 degrees up due north, in degrees.
      declinationExpected: 90 - Math.abs(latitude - 85),
      latitude,
      measured,
      model: modelUV(tiltDir, 0, latitude, 0),
      time: 0,
    });
  }

  // --- 3. no panorama, and no moon --------------------------------------

  clock.applyParams({ latitude: 45, moon: { intensity: 1, phase: 0.5 }, time: 0 });
  driver.apply();
  // Away from the moon, so the only thing that could be in frame is the sky.
  aim([-moonDirection.x, -moonDirection.y, -moonDirection.z], discFov);
  nightSky.setTexture(null);
  const withoutTexture = await readFrame();
  let starlessPeak = 0;
  let starlessFloor = Infinity;
  for (let index = 0; index < width * height; index += 1) {
    const luminance = luminanceOf(withoutTexture, index);
    if (luminance > starlessPeak) starlessPeak = luminance;
    if (luminance < starlessFloor) starlessFloor = luminance;
  }

  // The documented ambient lift is the only thing that should be left:
  // moonAmbient * illumination * skyDarkness * moonIntensity * moonColor.
  const expectedAmbient = gainLuminance(
    clock.moonColor.value,
    clock.moonAmbient.value * clock.moonPhaseIllumination.value
      * clock.skyDarkness.value * clock.moonIntensity.value,
  );

  clock.applyParams({ moon: { intensity: 0 } });
  driver.apply();
  const blackFrame = await readFrame();
  let blackPeak = 0;
  for (let i = 0; i < blackFrame.length; i += 4) {
    blackPeak = Math.max(
      blackPeak,
      Math.abs(blackFrame[i]),
      Math.abs(blackFrame[i + 1]),
      Math.abs(blackFrame[i + 2]),
    );
  }

  // Star term with a panorama back in, to prove the zero above was the missing
  // texture and not a dead graph.
  clock.applyParams({ moon: { intensity: 0 } });
  nightSky.setTexture(ramp, true);
  driver.apply();
  const withTexture = await readFrame();
  let starPeak = 0;
  for (let i = 0; i < withTexture.length; i += 4) {
    starPeak = Math.max(starPeak, withTexture[i], withTexture[i + 1], withTexture[i + 2]);
  }

  // --- 4. the moon occludes the panorama behind it -----------------------
  //
  // A new moon is the clean case: nothing is lit, so if the body occludes the
  // stars the disc is a hole in the field, and if it does not the disc is
  // invisible. Both are measurable against the sky just outside it.
  clock.applyParams({ latitude: 45, moon: { intensity: 1, phase: 0 }, time: 0 });
  driver.apply();
  aim([moonDirection.x, moonDirection.y, moonDirection.z], discFov);
  const newMoonFrame = await readFrame();
  let holePeak = 0;
  let skyMin = Infinity;
  for (let index = 0; index < width * height; index += 1) {
    const luminance = luminanceOf(newMoonFrame, index);
    if (angleDeg[index] <= discRadiusDeg * 0.9) holePeak = Math.max(holePeak, luminance);
    else if (angleDeg[index] >= discRadiusDeg * 1.1) skyMin = Math.min(skyMin, luminance);
  }

  const albedo = nightSky.moonTexture.userData.toonlabMoonAlbedo;
  return {
    holePeak,
    skyMin,
    albedo,
    backend: document.body.dataset.rendererBackend ?? null,
    blackPeak,
    centroids,
    clockSamples,
    discRadiusDeg,
    discSamples,
    expectedAmbient,
    expectedFullMean,
    halfEpsilon: HALF_EPSILON,
    frame: { height, width },
    latitudeSamples,
    moonDirection: [moonDirection.x, moonDirection.y, moonDirection.z],
    normalisation: {
      discMeanTarget: nightSkyModule.MOON_ALBEDO_DISC_MEAN,
      fullMeanRadiance: nightSkyModule.MOON_DISC_FULL_MEAN_RADIANCE,
      scale: nightSkyModule.MOON_DISC_NORMALISATION,
    },
    renderOrder: { group: nightSky.group.renderOrder, mesh: nightSky.mesh.renderOrder },
    starPeak,
    starlessFloor,
    starlessPeak,
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

    const result = await page.evaluate(probe, { discFov: DISC_FOV, size: SIZE });

    console.log(`\nframe ${result.frame.width}x${result.frame.height}`
      + `  disc radius ${result.discRadiusDeg.toFixed(3)} deg`
      + `  moonDirection [${result.moonDirection.map((v) => v.toFixed(4)).join(', ')}]`);
    console.log(`albedo map ${result.albedo.width}x${result.albedo.height}`
      + `  preNormDiscMean ${result.albedo.discMean.toFixed(4)}`
      + `  peak ${result.albedo.peak.toFixed(4)}`
      + `  normalised to ${result.albedo.normalisedDiscMean}`);
    console.log(`disc calibration: full-moon mean target ${result.normalisation.fullMeanRadiance}`
      + `  scale ${result.normalisation.scale.toFixed(6)}`);
    console.log(`render order: group ${result.renderOrder.group}  mesh ${result.renderOrder.mesh}`);

    console.log('\n-- moon disc across the phase dial (ambient lift measured and removed)');
    console.log('phase  illum   litFrac  discMean   discPeak   vsFull   maxLitAngle  litLimbs  litSide  leakOutside   ambient   ambientModel  ambientSpread');
    const full = result.discSamples.find((sample) => sample.phase === 0.5);
    for (const sample of result.discSamples) {
      console.log(
        `${sample.phase.toFixed(3)}  ${sample.illumination.toFixed(3)}   `
        + `${sample.litFraction.toFixed(3)}    ${sample.insideMean.toFixed(5)}    `
        + `${sample.insidePeak.toFixed(5)}   ${(sample.insideMean / full.insideMean).toFixed(4)}   `
        + `${sample.litMaxAngleDeg.toFixed(3)} deg    ${sample.litSpanBalance.toFixed(3)}     `
        + `${sample.leftShare.toFixed(3)}    ${sample.outsidePeak.toExponential(2)}      `
        + `${sample.ambient.toFixed(6)}  ${sample.ambientExpected.toFixed(6)}      `
        + `${sample.ambientSpread.toExponential(2)}`,
      );
    }
    console.log(`full-moon disc mean: measured ${full.insideMean.toFixed(5)}, `
      + `calibration predicts ${result.expectedFullMean.toFixed(5)} `
      + `(${((full.insideMean / result.expectedFullMean - 1) * 100).toFixed(2)}%)`);

    console.log('\n-- disc footprint centroid at full phase (pixels from frame centre)');
    for (const centroid of result.centroids) {
      console.log(
        `phase ${centroid.phase.toFixed(2)}  footprint ${centroid.footprintPixels} px  `
        + `offset (${centroid.offsetXPixels?.toFixed(3)}, ${centroid.offsetYPixels?.toFixed(3)})`,
      );
    }

    console.log('\n-- the lit interval across the disc, in lunar radii from moonDirection');
    console.log('   (terminator at -cos(psi)*sign(sin(psi)), lit limb at sign(sin(psi)))');
    console.log('phase  measuredFrom  measuredTo   modelFrom   modelTo    error');
    for (const sample of result.discSamples) {
      if (sample.litMinX === null) {
        console.log(`${sample.phase.toFixed(3)}  (dark)`);
        continue;
      }
      const error = Math.max(
        Math.abs(sample.litMinX - sample.expectedFrom),
        Math.abs(sample.litMaxX - sample.expectedTo),
      );
      console.log(
        `${sample.phase.toFixed(3)}  ${sample.litMinX.toFixed(4).padStart(12)}  `
        + `${sample.litMaxX.toFixed(4).padStart(10)}  ${sample.expectedFrom.toFixed(4).padStart(10)}  `
        + `${sample.expectedTo.toFixed(4).padStart(9)}  ${error.toFixed(4).padStart(7)}`,
      );
    }

    console.log('\n-- star rotation vs the clock, at elevation 35 / azimuth 20');
    console.log('   (u = celestial longitude / 2pi, so du should equal the elapsed day fraction)');
    console.log('time   darkness  measuredU  modelU    du       dtime     du/dtime   measuredV  modelV');
    const firstClock = result.clockSamples[0];
    for (const sample of result.clockSamples) {
      const raw = sample.measured.u - firstClock.measured.u;
      const du = raw < -0.5 ? raw + 1 : raw > 0.5 ? raw - 1 : raw;
      const dt = sample.timeline - firstClock.timeline;
      console.log(
        `${sample.time.toFixed(2)}   ${sample.darkness.toFixed(3)}     ${sample.measured.u.toFixed(5)}    `
        + `${sample.model.u.toFixed(5)}   ${du >= 0 ? ' ' : ''}${du.toFixed(5)}  ${dt.toFixed(5)}   `
        + `${dt === 0 ? '     -   ' : (du / dt).toFixed(5).padStart(9)}   `
        + `${sample.measured.v.toFixed(5)}    ${sample.model.v.toFixed(5)}`,
      );
    }

    console.log('\n-- star tilt vs latitude, at elevation 85 / azimuth 0');
    console.log('   (v = celestial latitude; the declination a near-zenith ray lands on is 90 - |lat - 85|)');
    console.log('lat   darkness  measuredV  modelV    measuredDec  expectedDec  measuredU  modelU');
    for (const sample of result.latitudeSamples) {
      const measuredDec = (sample.measured.v - 0.5) * 180;
      console.log(
        `${String(sample.latitude).padStart(3)}   ${sample.darkness.toFixed(3)}     `
        + `${sample.measured.v.toFixed(5)}    ${sample.model.v.toFixed(5)}   `
        + `${measuredDec.toFixed(3).padStart(11)}  ${String(sample.declinationExpected).padStart(11)}  `
        + `${sample.measured.u.toFixed(5)}    ${sample.model.u.toFixed(5)}`,
      );
    }

    console.log('\n-- without a star panorama');
    console.log(`peak luminance ${result.starlessPeak.toFixed(6)}`
      + `  floor ${result.starlessFloor.toFixed(6)}`
      + `  expected ambient lift ${result.expectedAmbient.toFixed(6)}`);
    console.log(`moon dialled out as well: peak channel ${result.blackPeak.toFixed(8)}`);
    console.log(`panorama back in, moon still out: peak channel ${result.starPeak.toFixed(6)}`);

    console.log('\n-- a new moon against the panorama (does the body occlude the stars?)');
    console.log(`inside the disc: peak luminance ${result.holePeak.toExponential(3)}`);
    console.log(`just outside it: floor luminance ${result.skyMin.toFixed(6)}`);

    console.log('');
    const dark = result.discSamples.find((sample) => sample.phase === 0);
    const newMoonEnd = result.discSamples.find((sample) => sample.phase === 1);
    check('phase 0 is a dark disc', dark.insidePeak === 0, `peak ${dark.insidePeak}`);
    check('phase 1 is a dark disc', newMoonEnd.insidePeak === 0, `peak ${newMoonEnd.insidePeak}`);
    check(
      'phase 0.5 is the brightest disc',
      result.discSamples.every((sample) => sample.insideMean <= full.insideMean + 1e-9),
      `mean ${full.insideMean.toFixed(5)}`,
    );
    check(
      'the disc mean rises monotonically to full and falls after',
      result.discSamples.filter((sample) => sample.phase <= 0.5)
        .every((sample, index, list) => index === 0 || sample.insideMean >= list[index - 1].insideMean)
      && result.discSamples.filter((sample) => sample.phase >= 0.5)
        .every((sample, index, list) => index === 0 || sample.insideMean <= list[index - 1].insideMean),
    );
    check(
      'the full disc lands on the calibrated mean radiance',
      Math.abs(full.insideMean - result.expectedFullMean) < 0.05 * result.expectedFullMean,
      `${full.insideMean.toFixed(5)} against ${result.expectedFullMean.toFixed(5)}`,
    );
    check(
      'the lit fraction of the disc tracks the phase',
      Math.abs(result.discSamples.find((sample) => sample.phase === 0.25).litFraction - 0.5) < 0.03
        && Math.abs(result.discSamples.find((sample) => sample.phase === 0.75).litFraction - 0.5) < 0.03
        && full.litFraction > 0.99,
      `0.25 -> ${result.discSamples.find((sample) => sample.phase === 0.25).litFraction.toFixed(3)}, `
      + `0.5 -> ${full.litFraction.toFixed(3)}, `
      + `0.75 -> ${result.discSamples.find((sample) => sample.phase === 0.75).litFraction.toFixed(3)}`,
    );
    check(
      'the ambient lift is uniform and scales with the lit fraction',
      result.discSamples.every((sample) => sample.ambientSpread < result.halfEpsilon
        && Math.abs(sample.ambient - sample.ambientExpected) < 1e-4),
      `worst spread ${Math.max(...result.discSamples.map((s) => s.ambientSpread)).toExponential(2)}, `
      + `worst error ${Math.max(...result.discSamples.map((s) => Math.abs(s.ambient - s.ambientExpected))).toExponential(2)}`,
    );
    const litSamples = result.discSamples.filter((sample) => sample.litFraction > 0.02);
    check(
      'no radiance outside the disc at any phase',
      result.discSamples.every((sample) => sample.outsidePeak < result.halfEpsilon),
      `worst ${Math.max(...result.discSamples.map((sample) => sample.outsidePeak)).toExponential(2)}`,
    );
    check(
      'the lit region reaches the disc edge at every lit phase',
      litSamples.every((sample) => sample.litMaxAngleDeg > result.discRadiusDeg * 0.9),
      `worst ${Math.min(...litSamples.map((sample) => sample.litMaxAngleDeg)).toFixed(3)} deg`,
    );
    check(
      'the terminator runs through the disc centre (both limbs stay lit)',
      litSamples.every((sample) => sample.litSpanBalance > 0.9),
      `worst ${Math.min(...litSamples.map((sample) => sample.litSpanBalance)).toFixed(3)}`,
    );
    const fullCentroid = result.centroids.find((entry) => entry.phase === 0.5);
    check(
      'the full disc is centred on moonDirection',
      Math.abs(fullCentroid.offsetXPixels) < 1 && Math.abs(fullCentroid.offsetYPixels) < 1,
      `(${fullCentroid.offsetXPixels.toFixed(3)}, ${fullCentroid.offsetYPixels.toFixed(3)}) px`,
    );
    // Phase moves the terminator across a disc that has not moved: the lit limb
    // stays on the disc's edge and the terminator lands exactly where the phase
    // angle puts it, both measured from `moonDirection`. One pixel is 0.011 lunar
    // radii at this framing, so 0.03 is under three pixels.
    const geometry = litSamples.map((sample) => Math.max(
      Math.abs(sample.litMinX - sample.expectedFrom),
      Math.abs(sample.litMaxX - sample.expectedTo),
    ));
    check(
      'phase moves the terminator, not the disc',
      geometry.every((error) => error < 0.03),
      `worst edge error ${Math.max(...geometry).toFixed(4)} lunar radii `
      + `(one pixel is ${(2 / result.frame.width / Math.tan((result.discRadiusDeg * Math.PI) / 180) * Math.tan((DISC_FOV * Math.PI) / 360)).toFixed(4)})`,
    );
    const uvError = (samples) => Math.max(...samples.map((sample) => {
      const raw = Math.abs(sample.measured.u - sample.model.u);
      return Math.max(Math.min(raw, 1 - raw), Math.abs(sample.measured.v - sample.model.v));
    }));
    check(
      'the sampler agrees with starRotationAt across the clock',
      uvError(result.clockSamples) < 0.01,
      `worst UV error ${uvError(result.clockSamples).toFixed(5)}`,
    );
    check(
      'the sampler agrees with starRotationAt across latitude',
      uvError(result.latitudeSamples) < 0.01,
      `worst UV error ${uvError(result.latitudeSamples).toFixed(5)}`,
    );
    const rate = result.clockSamples.slice(1).map((sample) => {
      const delta = sample.measured.u - firstClock.measured.u;
      const wrapped = delta < -0.5 ? delta + 1 : delta > 0.5 ? delta - 1 : delta;
      return wrapped / (sample.timeline - firstClock.timeline);
    });
    check(
      'star rotation advances exactly one turn per day',
      rate.every((value) => Math.abs(value - 1) < 0.02),
      `rates ${rate.map((value) => value.toFixed(4)).join(' ')}`,
    );
    const declinations = result.latitudeSamples.map((sample) => (sample.measured.v - 0.5) * 180);
    check(
      'latitude tilts the star field onto the declination the arc predicts',
      result.latitudeSamples.every((sample, index) => Math.abs(declinations[index]
        - sample.declinationExpected) < 1.5)
        && declinations.every((value, index) => index === 0 || value > declinations[index - 1]),
      `declinations ${declinations.map((value) => value.toFixed(2)).join(' ')} `
      + `against ${result.latitudeSamples.map((sample) => sample.declinationExpected).join(' ')}`,
    );
    check(
      'without a panorama the star term is gone, leaving only the ambient lift',
      Math.abs(result.starlessPeak - result.expectedAmbient) < 1e-4
        && Math.abs(result.starlessFloor - result.expectedAmbient) < 1e-4,
      `${result.starlessFloor.toFixed(6)}..${result.starlessPeak.toFixed(6)} `
      + `against ${result.expectedAmbient.toFixed(6)}`,
    );
    check(
      'no panorama and no moon renders exactly black',
      result.blackPeak === 0,
      `peak ${result.blackPeak}`,
    );
    check(
      'a panorama put back produces star radiance',
      result.starPeak > 0.01,
      `peak ${result.starPeak.toFixed(5)}`,
    );
    check(
      'the moon body occludes the panorama behind it',
      result.holePeak < result.halfEpsilon && result.skyMin > 0.05,
      `disc ${result.holePeak.toExponential(2)} against sky ${result.skyMin.toFixed(4)}`,
    );
    check(
      'the mesh is a blended backdrop behind the scene',
      result.renderOrder.group === -990 && result.renderOrder.mesh === -990,
      `group ${result.renderOrder.group} mesh ${result.renderOrder.mesh}`,
    );
    check('no console errors or page exceptions', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (error) {
    failures += 1;
    console.error(`FAIL ${renderer}: ${error.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
console.log(`\n${failures === 0 ? 'all night-sky probes passed' : `${failures} night-sky probe failures`}`);
process.exit(failures === 0 ? 0 : 1);
