import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

import { createLabRenderer, whenRendererReady } from '../../shared/rendererFactory.js';
import {
  createHeroCloudWeatherTexture,
  getHeroCloudPreviewCenter,
  heroCloudSkyOverrides,
} from '../../../src/cloud/index.js';
import {
  SkySystem,
  createSkyParams,
  resolveSkyStyleSnapshot,
} from '../../../src/sky/index.js';
import {
  WeatherFieldRenderer,
  applySkyWeather,
  createWeatherSettings,
  resolveWeatherPreset,
} from '../../../src/weather/index.js';
import {
  applyLightingView,
  resolveCameraPose,
  resolveCameraView,
  resolveComparisonExposure,
} from './comparisonViews.js';
import { SkyPostPipeline } from './postPipeline.js';
import { createCloudProfiler } from './cloudProfiler.js';
import { createCloudOcclusionFixture } from './cloudOcclusionFixture.js';
import { NO_WEATHER_CONDITION } from './store.js';
import {
  CLOUD_WORKSPACE,
  SKY_CLOUD_WORKSPACE,
  SKY_WORKSPACE,
} from './labWorkspaces.js';

const STARMAP_URL = '/sky/starmap-procedural-2k.png';
const FIELD_OF_VIEW = 60;
const CAPTURE_SETTLE_FRAMES = 96;

function applyHeroCloudPreview(params, recipe) {
  const overrides = heroCloudSkyOverrides(recipe);
  return createSkyParams({
    ...params,
    cloud: {
      ...params.cloud,
      ...overrides.cloud,
      cirrus: { ...params.cloud.cirrus, ...overrides.cloud.cirrus },
      haze: { ...params.cloud.haze, ...overrides.cloud.haze },
      shape: { ...params.cloud.shape, ...overrides.cloud.shape },
    },
    noise: {
      ...params.noise,
      weather: { ...params.noise.weather, ...overrides.noise.weather },
    },
  });
}

function applyPhysicalCloudBaseline(params) {
  const baseline = resolveSkyStyleSnapshot('1.0');
  return createSkyParams({
    ...params,
    cloud: {
      ...params.cloud,
      style: baseline.cloudStyle,
    },
  });
}

function heroWeatherRecipeSignature(recipe) {
  return JSON.stringify({
    bounds: recipe.bounds,
    footprint: recipe.footprint,
    id: recipe.id,
    seed: recipe.seed,
  });
}

function frameClouds(camera, cameraView, params, quality, heroPreview = false, heroRecipe = null, controls = null) {
  // Keep the comparison camera fixed so captures preserve the same phase angle
  // and weather-map location. The viewport's boot pose is only temporary.
  if (heroPreview && heroRecipe) {
    const center = getHeroCloudPreviewCenter(heroRecipe);
    const { diameter, height } = heroRecipe.bounds;
    const baseAltitude = heroCloudSkyOverrides(heroRecipe).cloud.shape.altitude;
    camera.position.set(
      center.x - diameter * 0.56,
      baseAltitude + height * 0.72,
      center.z - diameter * 0.64,
    );
    const target = new THREE.Vector3(center.x, baseAltitude + height * 0.38, center.z);
    if (controls) {
      controls.target.copy(target);
      controls.cursor.copy(target);
      controls.update();
    } else {
      camera.lookAt(target);
    }
    camera.updateMatrixWorld();
    document.body.dataset.skyCameraView = 'hero-cloud-authoring';
    return;
  }
  const view = resolveCameraView(cameraView);
  const pose = resolveCameraPose(cameraView, params, { quality });
  camera.position.fromArray(pose.position);
  const target = new THREE.Vector3().fromArray(pose.target);
  if (controls) {
    controls.target.copy(target);
    controls.cursor.copy(target);
    controls.update();
  } else {
    camera.lookAt(target);
  }
  camera.updateMatrixWorld();
  document.body.dataset.skyCameraView = view.id;
}

export function createSkyCloudLabEngine({ mount, store }) {
  const profiling = new URLSearchParams(location.search).get('profile') === '1';
  const renderer = createLabRenderer({ antialias: true, preserveDrawingBuffer: true, trackTimestamp: profiling });
  renderer.setPixelRatio(store.getState().capture ? 1 : Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(FIELD_OF_VIEW, innerWidth / innerHeight, 0.1, 2_000_000);
  const initialState = store.getState();
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = !initialState.capture;
  controls.enablePan = true;
  controls.enableRotate = true;
  controls.enableZoom = true;
  controls.enabled = !initialState.capture;
  controls.screenSpacePanning = true;
  controls.zoomToCursor = true;
  controls.minDistance = 1;
  controls.maxDistance = 750_000;
  controls.maxTargetRadius = 500_000;
  controls.mouseButtons = {
    LEFT: THREE.MOUSE.ROTATE,
    MIDDLE: THREE.MOUSE.DOLLY,
    RIGHT: THREE.MOUSE.PAN,
  };
  frameClouds(
    camera,
    initialState.cameraView,
    initialState.params,
    initialState.quality,
    initialState.heroPreview,
    initialState.heroRecipe,
    controls,
  );
  // Weather owns precipitation and lightning geometry. Keeping its real field
  // renderer in the review scene avoids a second, lab-only implementation.
  const weatherField = new WeatherFieldRenderer({ electricalMode: 'manual', seed: 0x51a7e });
  scene.add(weatherField);

  let sky = null;
  let post = null;
  let profiler = null;
  let occlusionFixture = null;
  let disposed = false;
  let started = false;
  let appliedRevision = -1;
  let appliedQuality = null;
  let appliedCameraView = null;
  let appliedHeroPreview = null;
  let appliedHeroRecipeKey = null;
  let syncing = false;
  let previousTime = performance.now();
  let captureFrames = 0;
  let activeWeather = createWeatherSettings();
  let heroWeatherRecipeKey = null;
  let heroWeatherTexture = null;

  async function syncState() {
    if (!sky || syncing || disposed) return;
    syncing = true;
    store.actions.adoptEngineState({ applying: true });
    try {
      while (!disposed) {
        const state = store.getState();
        if (
          state.revision === appliedRevision
          && state.quality === appliedQuality
          && state.cameraView === appliedCameraView
        ) break;
        const revision = state.revision;
        const qualityChanged = state.quality !== appliedQuality;
        if (qualityChanged) {
          await sky.setQualityLevel(state.quality);
          appliedQuality = state.quality;
        }
        activeWeather = state.heroPreview || state.weatherCondition === NO_WEATHER_CONDITION
          ? createWeatherSettings()
          : resolveWeatherPreset(state.weatherCondition).settings;
        const cameraView = resolveCameraView(state.cameraView);
        const aboveClouds = state.heroPreview || cameraView.aboveClouds === true;
        const previewParams = applyLightingView(state.params, state.lightingView);
        const weatherParams = state.heroPreview || state.weatherCondition === NO_WEATHER_CONDITION
          ? createSkyParams(previewParams)
          : applySkyWeather(previewParams, activeWeather, { aboveClouds });
        const comparedParams = state.workspace === CLOUD_WORKSPACE
          && state.comparisonMode === 'physical'
          ? applyPhysicalCloudBaseline(weatherParams)
          : weatherParams;
        const renderedParams = state.heroPreview
          ? applyHeroCloudPreview(comparedParams, state.heroRecipe)
          : comparedParams;

        if (state.heroPreview) {
          const recipeKey = heroWeatherRecipeSignature(state.heroRecipe);
          if (recipeKey !== heroWeatherRecipeKey) {
            const nextTexture = createHeroCloudWeatherTexture(state.heroRecipe);
            sky.setCloudWeatherTexture(nextTexture);
            heroWeatherTexture?.dispose();
            heroWeatherTexture = nextTexture;
            heroWeatherRecipeKey = recipeKey;
          } else {
            sky.setCloudWeatherTexture(heroWeatherTexture);
          }
        } else {
          sky.setCloudWeatherTexture(null);
        }
        await sky.applyPreset(renderedParams);
        // A comparison state always starts from the authored cloud phase. This
        // keeps the CPU surface query and the GPU density field on the same
        // deterministic coordinates after a preset, camera, or quality change.
        sky.clouds.wind.reset();
        const nextHeroRecipeKey = state.heroPreview
          ? heroWeatherRecipeSignature(state.heroRecipe)
          : null;
        if (
          state.cameraView !== appliedCameraView
          || state.heroPreview !== appliedHeroPreview
          || nextHeroRecipeKey !== appliedHeroRecipeKey
          || qualityChanged
        ) {
          frameClouds(
            camera,
            state.cameraView,
            renderedParams,
            state.quality,
            state.heroPreview,
            state.heroRecipe,
            controls,
          );
          appliedCameraView = state.cameraView;
          appliedHeroPreview = state.heroPreview;
          appliedHeroRecipeKey = nextHeroRecipeKey;
        }
        const comparisonExposure = resolveComparisonExposure(state.lightingView, {
          workspace: state.workspace,
        });
        post?.setComparisonExposure(comparisonExposure);
        weatherField.applyWeatherSettings(activeWeather);
        // Rain, snow and ground haze belong below the cloud layer. The aerial
        // review cameras inspect the sunlit top without a camera-local field.
        weatherField.visible = !aboveClouds;
        if (weatherField.visible && activeWeather.lightning.enabled) {
          weatherField.triggerLightning(activeWeather.lightning);
        }
        if (state.capture) sky.timeOfDay.autoAdvanceSecondsPerDay = 0;
        sky.reprojection.reset();
        captureFrames = 0;
        appliedRevision = revision;
        document.body.dataset.skyPreset = state.preset;
        document.body.dataset.skyStyleSnapshot = state.styleSnapshot;
        document.body.dataset.skyPresetApplied = 'true';
        document.body.dataset.skyQuality = state.quality;
        document.body.dataset.skyWeatherCondition = state.weatherCondition;
        document.body.dataset.skyHeroCloudPreview = String(state.heroPreview);
        document.body.dataset.skyHeroCloudRecipe = state.heroRecipe.id;
        document.body.dataset.cloudComparisonMode = state.comparisonMode;
        document.body.dataset.skyAboveClouds = String(aboveClouds);
        document.body.dataset.skyWeatherParticles = String(weatherField.particleCount);
        document.body.dataset.skyExposureMode = comparisonExposure === null ? 'auto' : 'comparison';
      }
      store.actions.adoptEngineState({
        applying: false,
        status: 'Preview ready.',
      });
    } catch (error) {
      console.error('[volumetric-sky-lab] apply failed', error);
      store.actions.adoptEngineState({ applying: false, status: `Apply failed: ${error.message}` });
    } finally {
      syncing = false;
      const state = store.getState();
      if (!disposed && (
        state.revision !== appliedRevision
        || state.quality !== appliedQuality
        || state.cameraView !== appliedCameraView
      )) {
        queueMicrotask(syncState);
      }
    }
  }

  const unsubscribe = store.subscribe(syncState);

  function resize() {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    sky?.resize(innerWidth, innerHeight);
    post?.build();
    captureFrames = 0;
  }
  addEventListener('resize', resize);

  function renderFrame(now = performance.now()) {
    if (disposed || !sky) return;
    const capture = store.getState().capture;
    // A comparison capture has to become a fixed image. Keeping the animation
    // loop alive after the temporal reconstruction and exposure have settled
    // changes the jitter phase underneath screenshots, so two identical states
    // do not compare pixel-for-pixel. Settle the same number of frames after
    // every state/camera/resize change, then hold that result until something
    // authored changes again.
    if (capture && captureFrames >= CAPTURE_SETTLE_FRAMES && (!profiling || profiler?.complete)) return;
    const submitStart = profiling ? performance.now() : 0;
    const delta = capture
      ? 0
      : Math.min(Math.max((now - previousTime) / 1000, 0), 0.1);
    previousTime = now;
    const cameraView = resolveCameraView(store.getState().cameraView);
    // The walking camera is derived from a specific density surface. Keep that
    // internal review field fixed so wind cannot slide the surface away from
    // the camera while a developer inspects it.
    controls.update();
    occlusionFixture?.render();
    sky.update(cameraView.lockCloudField ? 0 : delta);
    // Freeze cloud motion in captures, but advance a deterministic lightning
    // strike over only the last few settle frames so the held image lands on
    // the flash peak instead of frame zero (where the pulse is invisible).
    const lightningFrames = Math.max(
      2,
      Math.round(activeWeather.lightning.duration * 30),
    );
    const lightningStart = CAPTURE_SETTLE_FRAMES - lightningFrames;
    if (capture && activeWeather.lightning.enabled && captureFrames === lightningStart) {
      weatherField.triggerLightning(activeWeather.lightning);
    }
    const weatherDelta = capture
      && activeWeather.lightning.enabled
      && captureFrames >= lightningStart
      ? 1 / 60
      : delta;
    weatherField.update(weatherDelta, {
      camera,
      floorY: camera.position.y - activeWeather.precipitation.fallHeight,
      renderer,
    });
    const sunY = THREE.MathUtils.clamp(sky.sun.direction.value.y, -1, 1);
    document.body.dataset.skyClock = sky.timeOfDay.time.value.toFixed(4);
    document.body.dataset.skyDarkness = sky.timeOfDay.skyDarkness.value.toFixed(4);
    document.body.dataset.skyMorningLight = sky.timeOfDay.morningLight.value.toFixed(4);
    document.body.dataset.skyEveningLight = sky.timeOfDay.eveningLight.value.toFixed(4);
    document.body.dataset.skySunElevation = THREE.MathUtils.radToDeg(Math.asin(sunY)).toFixed(2);
    // Capture mode freezes cloud motion, but the reference's auto-exposure
    // still settles over its capture frames. A zero metering delta would leave
    // every deterministic comparison stuck at the initial exposure forever.
    post?.render(capture ? 1 / 60 : delta);
    profiler?.frame(performance.now() - submitStart);
    if (capture) captureFrames += 1;
    if (post) {
      document.body.dataset.skyExposure = post.autoExposure.exposureUniform.value.toFixed(4);
    }
  }

  return {
    camera,
    controls,
    renderer,
    scene,
    get sky() { return sky; },

    dispose() {
      if (disposed) return;
      disposed = true;
      renderer.setAnimationLoop(null);
      removeEventListener('resize', resize);
      unsubscribe();
      controls.dispose();
      post?.dispose();
      profiler?.dispose();
      occlusionFixture?.dispose();
      weatherField.dispose();
      heroWeatherTexture?.dispose();
      sky?.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },

    renderFrame,

    resetCamera() {
      const state = store.getState();
      frameClouds(
        camera,
        state.cameraView,
        state.params,
        state.quality,
        state.heroPreview,
        state.heroRecipe,
        controls,
      );
      renderFrame();
    },

    setCameraMode(mode) {
      const resolved = ['pan', 'zoom'].includes(mode) ? mode : 'rotate';
      controls.mouseButtons.LEFT = resolved === 'pan'
        ? THREE.MOUSE.PAN
        : resolved === 'zoom'
          ? THREE.MOUSE.DOLLY
          : THREE.MOUSE.ROTATE;
      renderer.domElement.dataset.cameraMode = resolved;
    },

    async start() {
      if (started) return;
      started = true;
      await whenRendererReady(renderer);
      if (disposed) return;
      if (profiling) profiler = createCloudProfiler(renderer);
      sky = await SkySystem.create({
        camera,
        nightSky: { texture: STARMAP_URL },
        quality: store.getState().quality,
        renderer,
        scene,
      });
      // This sky-only stage has no ground/mesh receivers. God rays use their
      // own volume march, not the receiver shadow map.
      sky.cloudShadowsEnabled = false;
      post = new SkyPostPipeline({ renderer, scene, camera, sky });
      post.build();
      await syncState();
      if (new URLSearchParams(location.search).get('occlusion') === '1') {
        occlusionFixture = createCloudOcclusionFixture({ scene, camera, renderer, sky });
      }
      renderFrame();
      renderFrame();
      renderer.setAnimationLoop(renderFrame);
      document.body.dataset.modelReady = 'true';
      document.body.dataset.skyReady = 'true';
      const { workspace } = store.getState();
      if (workspace === SKY_WORKSPACE) document.body.dataset.skyLabReady = 'true';
      if (workspace === CLOUD_WORKSPACE) document.body.dataset.cloudShaderLabReady = 'true';
      if (workspace === SKY_CLOUD_WORKSPACE) document.body.dataset.skyCloudLabReady = 'true';
      store.actions.adoptEngineState({
        engineReady: true,
        status: 'Preview ready.',
      });
    },
  };
}
