// Sky smoke test — the smallest scene that puts the volumetric rebuild on a GPU.
//
// This is not a lab and must not grow into one. It exists to answer the one
// question no unit test can: does `src/sky/skySystem.js` boot, apply a shipped
// preset, and produce a plausible frame on the WebGPU backend AND on the
// forced-WebGL2 backend? Everything here is either the shipped module under test
// or the minimum wiring that module needs.
//
// The system is driven exactly the way its docs describe a host driving it:
//
//   1. `SkySystem.create({ renderer, camera, scene })` — async, because the
//      backend has to be up and the star panorama loaded before the first frame;
//   2. `await sky.applyPreset(PRESETS[key])` — also async, because a preset
//      carries the weather-map resolution and applying one regenerates the map;
//   3. `sky.update(dt)` once per frame BEFORE the scene render, because the
//      clouds are a backdrop mesh in the scene rather than a post stage.
//
// Two passes, because SkySystem hands the host linear HDR and nothing else:
// the scene (dome + night sky + cloud backdrop) into a half-float target, then
// the post step the spec's post-processing section asks for — `atmosphere.exposure`
// and an ACES filmic curve as the LAST step, on a graph that is otherwise pure
// linear HDR. Without it every bright pixel clips to white: the sun disc alone
// is three or four orders of magnitude above the sky, which is exactly why the
// sky materials are marked `toneMapped = false`.
//
// Deliberately absent, because each is its own task and none of it is needed to
// prove the GPU path: god rays and the aerial-perspective fog (both live in
// `applyTo`, which needs a `pass()` node and scene geometry to composite
// against), the env-map bake, and any host geometry at all. There is no terrain
// here, so below the horizon the frame is the sky dome's ground term.

import * as THREE from 'three';
import { NodeMaterial, QuadMesh } from 'three/webgpu';
import {
  Fn,
  acesFilmicToneMapping,
  max,
  screenUV,
  texture,
  vec3,
  vec4,
} from 'three/tsl';

import { createLabRenderer, whenRendererReady } from '../labs/shared/rendererFactory.js';
import { PRESETS, DEFAULT_PRESET_NAME } from '../src/sky/skyPresets.js';
import { SkySystem } from '../src/sky/skySystem.js';
import { resolveQualityLevelName } from '../src/sky/skyQualityTiers.js';
import { directionFromAngles, elevationOf } from '../src/sky/sunDriver.js';

// --- framing ---------------------------------------------------------------

// The reference frames put the horizon at ~62% of frame height with the sky
// filling the upper band, and the comparison crops the top 60%, so the cloud
// deck rather than terrain is the subject. See the spec's Capture contract.
const HORIZON_FRAME_FRACTION = 0.62;
const FIELD_OF_VIEW_DEGREES = 45;
// Eye height. Low on purpose: the horizon's geometric dip is sqrt(2h/R), which
// at 1.7 m is 0.037 degrees — a fifth of a pixel at 720p — so the horizon lands
// where the pitch below puts it without a curvature correction.
const CAMERA_HEIGHT_METRES = 1.7;

/** The procedural stand-in panorama. See scripts/generate-procedural-starmap.mjs. */
const STARMAP_URL = '/sky/starmap-procedural-2k.png';

/**
 * Compass bearing the camera looks along, degrees. 0 = +Z, 90 = +X.
 *
 * FIXED, and that is the whole point. The reference frames were shot from one
 * camera over one lake while the presets moved the sky around it: `ref-fluffy`
 * and `ref-partlyCloudy` share a clock yet one has the solar aureole burning at
 * the top of frame and the other has deep blue there, which only a change of
 * `time.azimuth` — the documented "rotate the celestial sphere to line the sun's
 * arc up with your world" dial — can produce. A camera that chased the sun would
 * cancel that dial exactly, so every preset would be shot straight down its own
 * aureole and the two frames would be indistinguishable. Presets place their own
 * light relative to this bearing.
 */
const CAMERA_BEARING_DEGREES = 0;

/**
 * Camera pitch, degrees, that lands the horizon ray at `HORIZON_FRAME_FRACTION`.
 *
 * A ray at elevation e above the horizon sits at NDC y = tan(e - pitch) /
 * tan(fov/2); the horizon is e = 0, and NDC y for a fraction f down from the top
 * of frame is 1 - 2f.
 */
function horizonPitchDegrees(fovDegrees, frameFraction) {
  const halfFov = THREE.MathUtils.degToRad(fovDegrees) * 0.5;
  return THREE.MathUtils.radToDeg(
    Math.atan((2 * frameFraction - 1) * Math.tan(halfFov)),
  );
}

// --- URL contract ----------------------------------------------------------

const query = new URLSearchParams(window.location.search);
const requestedPreset = query.get('preset') || DEFAULT_PRESET_NAME;
const presetKey = requestedPreset in PRESETS ? requestedPreset : DEFAULT_PRESET_NAME;
const qualityName = resolveQualityLevelName(query.get('quality'));
const hudVisible = query.get('hud') !== '0';
// Deterministic mode: freezes wind accumulation at t=0 and pins the pixel ratio,
// which with the preset's own paused clock is what makes a capture reproducible
// frame for frame.
const captureMode = query.get('capture') === '1';
// Dome and night sky only. The one switch that is not a preset field, because
// "does the atmosphere alone read right" is a question about this scene rather
// than about a look — and answering it with a preset's coverage set to 0 would
// change the sky too, since coverage also drives the storm haze.
const cloudsEnabled = query.get('clouds') !== '0';

const stage = document.getElementById('stage');
const hud = document.getElementById('hud');
const fail = document.getElementById('fail');
hud.hidden = !hudVisible;

/** Surfaces a boot failure in the page as well as the console — capture scripts read both. */
function reportFailure(stageName, error) {
  const detail = `${stageName}: ${error?.stack || error?.message || String(error)}`;
  document.body.dataset.skyFailed = 'true';
  document.body.dataset.skyError = detail;
  fail.textContent = detail;
  console.error(`[sky-smoke] ${detail}`);
}

// --- renderer --------------------------------------------------------------

const renderer = createLabRenderer({ antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(captureMode ? 1 : Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
// The composite pass below applies ACES itself, so the renderer must not apply a
// second curve on top of it.
renderer.toneMapping = THREE.NoToneMapping;
renderer.shadowMap.enabled = false;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(
  FIELD_OF_VIEW_DEGREES,
  window.innerWidth / window.innerHeight,
  0.1,
  2_000_000,
);

/**
 * Half-float, because the scene pass carries unbounded radiance. An 8-bit target
 * would clip the sun disc to white before the tonemap ever saw it, which is the
 * failure this scene exists to rule out.
 */
function createHdrTarget(name) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const target = new THREE.RenderTarget(size.x, size.y, {
    depthBuffer: true,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    magFilter: THREE.LinearFilter,
    minFilter: THREE.LinearFilter,
    type: THREE.HalfFloatType,
  });
  target.texture.name = name;
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

const skyTarget = createHdrTarget('SkySmokeSkyRadiance');

let sky = null;

// The post chain the spec's post-processing section asks for: exposure and an
// ACES filmic curve as the last step. Built before the system exists, so the
// exposure uniform is read through a late binding rather than captured.
const compositeMaterial = new NodeMaterial();
compositeMaterial.name = 'SkySmokeComposite';
compositeMaterial.depthTest = false;
compositeMaterial.depthWrite = false;
compositeMaterial.transparent = false;
compositeMaterial.blending = THREE.NoBlending;
compositeMaterial.fog = false;
compositeMaterial.toneMapped = false;

const compositeQuad = new QuadMesh(compositeMaterial);

/**
 * Puts the camera on `CAMERA_BEARING_DEGREES` with the horizon at the framing
 * fraction. Called once per preset rather than per frame: the presets pause the
 * clock, so nothing moves the pose afterwards.
 */
function frameHorizon() {
  const pitch = horizonPitchDegrees(camera.fov, HORIZON_FRAME_FRACTION);
  const forward = directionFromAngles(pitch, CAMERA_BEARING_DEGREES, new THREE.Vector3());
  camera.position.set(0, CAMERA_HEIGHT_METRES, 0);
  camera.lookAt(camera.position.clone().add(forward));
  camera.updateMatrixWorld();
  document.body.dataset.skyHorizonFraction = String(HORIZON_FRAME_FRACTION);
  document.body.dataset.skyCameraBearing = String(CAMERA_BEARING_DEGREES);
}

/**
 * Applies a shipped preset and re-frames on the light it puts in the sky.
 *
 * Awaited because `applyPreset` regenerates the weather map on the CPU. The
 * reconstruction history is dropped afterwards: it holds frames marched against
 * the previous preset's cloud field, and reprojecting those into the new one is
 * a smear that takes the warmup to clear.
 */
async function applyPreset(key) {
  await sky.applyPreset(PRESETS[key]);
  sky.clouds.enabled = cloudsEnabled;
  if (captureMode) {
    // Belt and braces over the preset's own paused clock: a capture must be
    // reproducible frame for frame, and an advancing clock would walk the sun
    // out of the pose the preset authored.
    sky.timeOfDay.autoAdvanceSecondsPerDay = 0;
  }
  frameHorizon();
  sky.reprojection.reset();
  document.body.dataset.skyPreset = key;
  document.body.dataset.skyPresetApplied = 'true';
}

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  skyTarget.setSize(size.x, size.y);
  sky?.resize(width, height);
}
window.addEventListener('resize', resize);

let frames = 0;
let previousTime = performance.now();

function renderFrame(frameTime = performance.now()) {
  // A frozen delta in capture mode, so a capture is reproducible frame for
  // frame rather than dependent on when the browser got round to it.
  const delta = captureMode
    ? 0
    : Math.min(Math.max((frameTime - previousTime) / 1000, 0), 0.1);
  previousTime = frameTime;

  // Before the scene render and before the target is bound: the tick marches the
  // cloud pass into its own reconstruction targets and leaves the backdrop mesh
  // pointing at the result.
  sky.update(delta);

  renderer.setRenderTarget(skyTarget);
  renderer.render(scene, camera);

  renderer.setRenderTarget(null);
  compositeQuad.render(renderer);

  frames += 1;
  if (hudVisible && frames % 15 === 0) {
    const sun = sky.sun;
    hud.textContent = [
      `preset    ${presetKey}${presetKey === requestedPreset ? '' : ` (asked ${requestedPreset})`}`,
      `quality   ${qualityName}${captureMode ? '  capture' : ''}${cloudsEnabled ? '' : '  no-clouds'}`,
      `backend   ${document.body.dataset.rendererBackend ?? '?'}`,
      `sun       elev ${sun.elevationDeg.toFixed(1)}deg  az ${sun.azimuthDeg.toFixed(1)}deg`,
      `moon      elev ${elevationOf(sky.timeOfDay.moonDirection.value).toFixed(1)}deg  phase ${sky.timeOfDay.moonPhase.value.toFixed(2)}`,
      `exposure  ${sky.atmosphere.exposure.value.toFixed(2)}x  darkness ${sky.timeOfDay.skyDarkness.value.toFixed(2)}`,
      `coverage  ${sky.clouds.shape.coverage.value.toFixed(2)}  density ${sky.clouds.shape.density.value.toFixed(3)}`,
      `frames    ${frames}`,
    ].join('\n');
  }
}

async function start() {
  await whenRendererReady(renderer);

  sky = await SkySystem.create({
    camera,
    // Supplied unconditionally: `moonlitNight` needs the panorama, and a preset
    // switch must not be able to ask for a star field the system was not built
    // with. Daylight presets pay for one extra additive sphere behind an opaque
    // dome, which is the cheap direction of that trade.
    nightSky: { texture: STARMAP_URL },
    quality: qualityName,
    renderer,
    scene,
  });

  compositeMaterial.fragmentNode = Fn(() => {
    // `screenUV` is top-left origin on both backends, and three flips the sample
    // of a render-target texture for the WebGL backend on its own, so one
    // expression reads the same pixel under WebGPU and forced WebGL2.
    const radiance = texture(skyTarget.texture).sample(screenUV).rgb.toVar();
    // Alpha is 1: this is the frame, not a layer.
    return vec4(acesFilmicToneMapping(max(radiance, vec3(0)), sky.atmosphere.exposure), 1);
  })();

  await applyPreset(presetKey);
  document.body.dataset.skyQuality = qualityName;
  document.body.dataset.skyCapture = captureMode ? '1' : '0';

  // Two frames before the ready flag, so `skyReady` means the noise volumes are
  // built, every pass has compiled its pipeline, and a frame really has landed —
  // not merely that the module loaded. The second frame is what proves a
  // compiled pipeline can be re-submitted, which is where the WebGL backend's
  // uniform-buffer churn shows up if it is going to.
  renderFrame(performance.now());
  renderFrame(performance.now());
  document.body.dataset.skyReady = 'true';

  renderer.setAnimationLoop(renderFrame);
}

// Same handle shape the labs publish (`window.__<page> = { … }`). It is what lets
// a driver script pull the *generated* WGSL/GLSL back out with
// `renderer.debug.getShaderAsync(...)` — the only way to check from outside that
// the density field really is one GPU function per backend rather than 896
// inlined copies, and the fastest route to a compile log when it is not.
// `applyPreset`, `frameHorizon` and `renderFrame` are published for the preset
// authoring loop: a probe can walk candidate SkyParams through the real system
// in one page session instead of reloading per candidate.
// The render target is published with them because three keys its render-object
// cache on the render context: a shader dump taken while the frame's own target
// is bound returns the build that rendered, and one taken with any other target
// bound forces a fresh build. Both answers are worth being able to ask for.
window.__skySmoke = {
  applyPreset,
  camera,
  compositeQuad,
  frameHorizon,
  renderFrame,
  renderer,
  scene,
  skyTarget,
  get sky() {
    return sky;
  },
};

start().catch((error) => reportFailure('boot', error));
