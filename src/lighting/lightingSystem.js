// Developer-facing lighting runtime: one style + a fixture vocabulary +
// tiny scene overlays, instead of per-scene light configuration.
//
//   const lighting = createLightingSystem({ scene, renderer, style: 'storybook' });
//   lighting.attachWorld(world);            // binds sun rig, fog (once per world)
//   lighting.setTimeOfDay(18.5);            // whole look follows the style's day cycle
//   lighting.place('street-lamp', [4, 0, 2]);  // semantic fixture, seeded variation
//   lighting.applyOverlay(tavernOverlay);   // small per-scene adjustments
//   lighting.update(dt, camera);            // flicker, blends, light budgets
//
// Ownership contract (one writer per property): while attached, the system
// owns sun direction/color/intensity + accents, coordinated Sky/Water/
// vegetation scene inputs, environment tints, fog color, tone-mapping
// exposure, its own ambient light, and every placed fixture. A composed world
// keeps owning the physical shadow-follow translation while Lighting supplies
// the true direction through world.setSun(). Weather modulates through
// setWeatherModulation() rather than writing the same targets.

import * as THREE from 'three';

import { deriveSeed } from '../core/generation.js';
import { createLightingManager } from './lightingRuntime.js';
import { resolveFixturePlacement, resolveLightFixture } from './lightingFixtures.js';
import { resolveLightingStylePreset, sampleLightingStyle } from './lightingStyle.js';
import {
  CALL_ME_SENSEI_LIGHTING_CONTRACT,
  configureCallMeSenseiDirectionalLight,
  createCallMeSenseiSkyLightProbe,
  updateCallMeSenseiSkyLightProbe,
} from './callMeSenseiLightingContract.js';
import { clamp, cloneJson, finite, isPlainObject, slug } from './utils.js';
import { SKY_SCENE_OVERRIDE_PRIORITIES } from '../sky/sceneOverrideLayers.js';
import { WATER_SCENE_OVERRIDE_PRIORITIES } from '../water/sceneOverrideLayers.js';

const DEFAULT_MODULATION = Object.freeze({
  ambientScale: 1,
  exposureScale: 1,
  fixtureScale: 1,
  fogColorOverride: null,
  fogColorTint: null,
  sunColorTint: null,
  sunIntensityScale: 1,
});

function normalizeModulation(source = {}) {
  const input = isPlainObject(source) ? source : {};
  return {
    ambientScale: Math.max(finite(input.ambientScale, 1), 0),
    exposureScale: Math.max(finite(input.exposureScale, 1), 0),
    fixtureScale: Math.max(finite(input.fixtureScale, 1), 0),
    fogColorOverride: Array.isArray(input.fogColorOverride)
      ? input.fogColorOverride.slice(0, 3).map((v) => clamp(finite(v, 0), 0, 1))
      : null,
    fogColorTint: Array.isArray(input.fogColorTint) ? input.fogColorTint.slice(0, 3).map((v) => Math.max(finite(v, 1), 0)) : null,
    sunColorTint: Array.isArray(input.sunColorTint) ? input.sunColorTint.slice(0, 3).map((v) => Math.max(finite(v, 1), 0)) : null,
    sunIntensityScale: Math.max(finite(input.sunIntensityScale, 1), 0),
  };
}

function normalizeOverlay(source = {}) {
  const input = isPlainObject(source) ? source : {};
  const adjustments = isPlainObject(input.adjustments) ? input.adjustments : input;
  return {
    adjustments: {
      ambientScale: Math.max(finite(adjustments.ambientScale, 1), 0),
      exposureScale: Math.max(finite(adjustments.exposureScale, 1), 0),
      fixtureScale: Math.max(finite(adjustments.fixtureScale, 1), 0),
      fogColor: Array.isArray(adjustments.fogColor) ? adjustments.fogColor.slice(0, 3).map((v) => clamp(finite(v, 0), 0, 1)) : null,
      sunIntensityScale: Math.max(finite(adjustments.sunIntensityScale, 1), 0),
    },
    fixtures: Array.isArray(input.fixtures)
      ? input.fixtures.filter(isPlainObject).map((entry) => ({
        fixture: entry.fixture ?? entry.id,
        overrides: isPlainObject(entry.overrides) ? entry.overrides : null,
        position: Array.isArray(entry.position) ? entry.position.slice(0, 3) : null,
        seed: entry.seed,
        target: Array.isArray(entry.target) ? entry.target.slice(0, 3) : null,
      }))
      : [],
    id: slug(input.id ?? input.name, 'overlay'),
  };
}

function scheduleScale(schedule, frame) {
  if (schedule.mode === 'always') return 1;
  if (schedule.mode === 'day') {
    // fixtureScale is high at night; day fixtures invert it.
    return Math.max(clamp(1 - frame.fixtureScale, 0, 1), schedule.minimum);
  }
  return Math.max(frame.fixtureScale, schedule.minimum);
}

const ENVIRONMENT_LIGHTING_UNIFORM_KEYS = Object.freeze([
  'heightFogColor',
  'skyGroundTint',
  'skyTopTint',
]);

function captureEnvironmentLighting(root) {
  if (!root?.traverse) return [];
  const seen = new Set();
  const snapshots = [];
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (seen.has(material) || !material?.userData?.environmentMaterial || !material.uniforms) continue;
      seen.add(material);
      const values = {};
      for (const key of ENVIRONMENT_LIGHTING_UNIFORM_KEYS) {
        const value = material.uniforms[key]?.value;
        if (value?.clone) values[key] = value.clone();
      }
      snapshots.push({ material, values });
    }
  });
  return snapshots;
}

function restoreEnvironmentLighting(snapshots = []) {
  for (const { material, values } of snapshots) {
    for (const [key, value] of Object.entries(values)) {
      material?.uniforms?.[key]?.value?.copy?.(value);
    }
  }
}

function captureSunRigState(sunRig) {
  const light = sunRig?.light;
  if (!light) return null;
  const opacity = (mesh) => mesh?.material?.uniforms?.opacity?.value ?? null;
  return {
    beamOpacity: opacity(sunRig.beam),
    color: light.color.toArray(),
    diskOpacity: opacity(sunRig.disk),
    intensity: light.intensity,
    shaftOpacity: opacity(sunRig.shaft),
    spillOpacity: opacity(sunRig.spill),
  };
}

function restoreSunRigState(sunRig, state) {
  if (!sunRig?.light || !state) return;
  const color = Array.isArray(state.color)
    ? new THREE.Color().fromArray(state.color)
    : state.color;
  if (sunRig.setState) {
    sunRig.setState({
      beamOpacity: state.beamOpacity ?? undefined,
      color,
      diskOpacity: state.diskOpacity ?? undefined,
      intensity: state.intensity,
      shaftOpacity: state.shaftOpacity ?? undefined,
      spillOpacity: state.spillOpacity ?? undefined,
    });
  } else {
    if (color) sunRig.light.color.copy(color);
    if (state.intensity !== null && state.intensity !== undefined) sunRig.light.intensity = state.intensity;
  }
}

function captureDirectionalShadowState(light) {
  const shadow = light?.isDirectionalLight ? light.shadow : null;
  if (!shadow) return null;
  return {
    bias: shadow.bias,
    cameraFar: shadow.camera.far,
    cameraNear: shadow.camera.near,
    castShadow: light.castShadow,
    filterNode: shadow.filterNode,
    mapSize: shadow.mapSize.clone(),
    normalBias: shadow.normalBias,
    radius: shadow.radius,
    toonLabConstantDepthBias: shadow.toonLabConstantDepthBias,
    toonLabLightDirectionToLight: shadow.toonLabLightDirectionToLight?.clone?.() ?? null,
    toonLabReceiverTransitionFloor: shadow.toonLabReceiverTransitionFloor,
    toonLabSourceBiasContract: shadow.toonLabSourceBiasContract,
    toonLabSourceFilter: shadow.toonLabSourceFilter,
    toonLabTransitionScale: shadow.toonLabTransitionScale,
  };
}

function restoreDirectionalShadowState(light, state) {
  const shadow = light?.isDirectionalLight ? light.shadow : null;
  if (!shadow || !state) return;
  light.castShadow = state.castShadow;
  shadow.mapSize.copy(state.mapSize);
  shadow.camera.near = state.cameraNear;
  shadow.camera.far = state.cameraFar;
  shadow.bias = state.bias;
  shadow.normalBias = state.normalBias;
  shadow.radius = state.radius;
  shadow.camera.updateProjectionMatrix();
  for (const [key, value] of Object.entries({
    filterNode: state.filterNode,
    toonLabConstantDepthBias: state.toonLabConstantDepthBias,
    toonLabReceiverTransitionFloor: state.toonLabReceiverTransitionFloor,
    toonLabSourceBiasContract: state.toonLabSourceBiasContract,
    toonLabSourceFilter: state.toonLabSourceFilter,
    toonLabTransitionScale: state.toonLabTransitionScale,
  })) {
    if (value === undefined) delete shadow[key];
    else shadow[key] = value;
  }
  if (state.toonLabLightDirectionToLight) {
    shadow.toonLabLightDirectionToLight = state.toonLabLightDirectionToLight.clone();
  } else {
    delete shadow.toonLabLightDirectionToLight;
  }
}

export function createLightingSystem({
  camera = null,
  capabilities = null,
  quality = null,
  renderer = null,
  scene = null,
  seed = 1,
  style = 'storybook',
  textureResolver = null,
  timeOfDay = 12,
} = {}) {
  let styleSettings = resolveLightingStylePreset(style);
  let hour = clamp(finite(timeOfDay, 12), 0, 24);
  let frame = sampleLightingStyle(styleSettings, hour);
  let modulation = { ...DEFAULT_MODULATION };
  let sunDirectionOverride = null;
  let clock = 0;
  let placementCounter = 0;
  let disposed = false;

  const manager = createLightingManager({
    camera,
    capabilities,
    quality: quality ?? styleSettings.quality,
    recipe: { id: 'lighting-system', lights: [], name: 'Lighting System', shadowPolicy: styleSettings.shadowPolicy },
    renderer,
    scene,
    textureResolver,
  });

  // The system owns exactly one ambient light so scene ambience has a single
  // writer; it lives in the manager group so scene attachment follows along.
  const ambientLight = new THREE.AmbientLight(0xffffff, 0);
  ambientLight.name = 'Lighting System Ambient';
  manager.group.add(ambientLight);
  let skyLightProbe = null;
  let skyLightProbeSignature = '';

  const placements = new Map();
  const overlays = new Map();
  const skyOverrideLayer = Symbol('ToonLab LightingSystem sky layer');
  const waterOverrideLayer = Symbol('ToonLab LightingSystem water layer');

  // Attach targets + the state to restore on detach/dispose.
  const attachment = {
    driveSunPosition: false,
    environmentRoot: null,
    fog: null,
    getSun: null,
    getSunDirection: null,
    lampRig: null,
    ownSun: null,
    restore: null,
    sky: null,
    sunDistance: 60,
    setSunDirection: null,
    setSun: null,
    sunRig: null,
    weather: null,
    weatherLighting: null,
    water: null,
  };

  const SKY_DRIVEN_KEYS = ['horizonColor', 'starsStrength', 'sunColor', 'sunDirection', 'zenithColor'];
  const WATER_DRIVEN_KEYS = ['skyHorizonColor', 'skyZenithColor', 'sunColor', 'sunDirection'];

  function captureRestoreState() {
    const sunLight = attachment.sunRig?.light ?? attachment.ownSun ?? null;
    const skySettings = attachment.sky?.setSceneOverrideLayer
      ? null
      : attachment.sky?.settings ?? null;
    const waterSettings = attachment.water?.setSceneOverrideLayer
      ? null
      : attachment.water?.settings ?? null;
    attachment.restore = {
      environmentLighting: captureEnvironmentLighting(attachment.environmentRoot),
      exposure: renderer ? renderer.toneMappingExposure : null,
      fogColor: attachment.fog?.color?.clone?.() ?? null,
      sky: skySettings
        ? Object.fromEntries(SKY_DRIVEN_KEYS.map((key) => [key, cloneJson(skySettings[key])]))
        : null,
      sunColor: sunLight?.color?.clone?.() ?? null,
      sunState: attachment.getSun ? cloneJson(attachment.getSun()) : null,
      sunDirection: attachment.getSunDirection
        ? cloneJson(attachment.getSunDirection())
        : null,
      sunIntensity: sunLight?.intensity ?? null,
      sunPosition: sunLight?.position?.clone?.() ?? null,
      sunRigState: captureSunRigState(attachment.sunRig),
      sunShadow: captureDirectionalShadowState(sunLight),
      water: waterSettings
        ? Object.fromEntries(WATER_DRIVEN_KEYS.map((key) => [key, cloneJson(waterSettings[key])]))
        : null,
      weatherSunBaseline: attachment.weather?.sunBaseline ?? null,
      weatherSunRigBaseline: attachment.weather?.sunRigBaseline ?? null,
    };
  }

  function restoreAttachedState() {
    const restore = attachment.restore;
    const weatherWasDisposed = Boolean(attachment.weather?.disposed);
    const sunStateToRestore = weatherWasDisposed && restore?.weatherSunBaseline
      ? restore.weatherSunBaseline
      : restore?.sunState;
    const sunRigStateToRestore = weatherWasDisposed && restore?.weatherSunRigBaseline
      ? restore.weatherSunRigBaseline
      : restore?.sunRigState;
    if (restore) {
      if (renderer && restore.exposure !== null) renderer.toneMappingExposure = restore.exposure;
      if (attachment.fog && restore.fogColor) attachment.fog.color.copy(restore.fogColor);
      const sunLight = attachment.sunRig?.light ?? null;
      if (sunLight) {
        restoreSunRigState(attachment.sunRig, sunRigStateToRestore);
        restoreDirectionalShadowState(sunLight, restore.sunShadow);
        if (restore.sunPosition && attachment.driveSunPosition) sunLight.position.copy(restore.sunPosition);
      }
      if (sunStateToRestore && attachment.setSun) attachment.setSun(sunStateToRestore);
    }
    if (attachment.weather?.setLightingSystem
      && attachment.weather.lightingSystem === api) {
      attachment.weather.setLightingSystem(attachment.weatherLighting);
    }
    // Resetting Weather modulation refreshes the Lighting frame once, so the
    // world-owned direction must be restored after that refresh.
    const directionToRestore = sunStateToRestore?.direction ?? restore?.sunDirection;
    if (directionToRestore && attachment.setSunDirection) {
      attachment.setSunDirection(directionToRestore);
    }
    // Unbinding Weather resets Lighting modulation, which refreshes its Sky
    // layer once. Remove our layer afterwards so only Weather remains.
    if (attachment.sky?.clearSceneOverrideLayer) {
      attachment.sky.clearSceneOverrideLayer(skyOverrideLayer);
    } else if (attachment.sky && restore?.sky) {
      attachment.sky.applySettings(restore.sky);
    }
    if (attachment.water?.clearSceneOverrideLayer) {
      attachment.water.clearSceneOverrideLayer(waterOverrideLayer);
    } else if (attachment.water?.clearSceneOverrides) {
      attachment.water.clearSceneOverrides();
    } else if (attachment.water && restore?.water) {
      attachment.water.applySettings?.(restore.water);
    }
    restoreEnvironmentLighting(restore?.environmentLighting);
    attachment.restore = null;
    attachment.weather = null;
    attachment.weatherLighting = null;
  }

  function overlayFactor(key) {
    let factor = 1;
    for (const overlay of overlays.values()) {
      const value = overlay.adjustments[key];
      factor *= 1 + (value - 1) * overlay.weight;
    }
    return factor;
  }

  function overlayFogColor() {
    let color = null;
    let weight = 0;
    for (const overlay of overlays.values()) {
      if (overlay.adjustments.fogColor && overlay.weight > weight) {
        color = overlay.adjustments.fogColor;
        weight = overlay.weight;
      }
    }
    return color ? { color, weight } : null;
  }

  const workColor = new THREE.Color();
  const shadowFocusDirection = new THREE.Vector3();
  const shadowFocusForward = new THREE.Vector3();
  const shadowFocusTarget = new THREE.Vector3();

  function effectiveSunSourceRatios() {
    if (!sunDirectionOverride) return frame.sunSourceRatios;
    return {
      x: sunDirectionOverride[0],
      y: sunDirectionOverride[1],
      z: sunDirectionOverride[2],
    };
  }

  function updateOwnSunShadowFocus(nextCamera) {
    const sun = attachment.ownSun;
    const contract = CALL_ME_SENSEI_LIGHTING_CONTRACT.sun.shadow;
    if (!sun || !contract.followCamera || !nextCamera?.getWorldDirection) return;
    nextCamera.getWorldDirection(shadowFocusForward);
    shadowFocusForward.y = 0;
    if (shadowFocusForward.lengthSq() < 1e-6) shadowFocusForward.set(0, 0, -1);
    else shadowFocusForward.normalize();
    shadowFocusTarget.copy(nextCamera.position)
      .addScaledVector(shadowFocusForward, contract.focusDistance);
    // The style runtime cannot infer terrain height. Preserve the host/world
    // target plane while following the camera horizontally.
    shadowFocusTarget.y = sun.target.position.y;
    const sourceRatios = effectiveSunSourceRatios();
    shadowFocusDirection.set(sourceRatios.x, sourceRatios.y, sourceRatios.z).normalize();
    sun.target.position.copy(shadowFocusTarget);
    sun.position.copy(shadowFocusTarget)
      .addScaledVector(shadowFocusDirection, attachment.sunDistance);
    sun.target.updateMatrixWorld();
    sun.updateMatrixWorld();
  }

  function ensureStyleSkyLightProbe() {
    const settings = styleSettings.skyProbe;
    const enabled = Boolean(settings?.enabled && settings?.threeCoefficients);
    if (!enabled) {
      if (skyLightProbe) skyLightProbe.visible = false;
      return null;
    }
    const signature = JSON.stringify(settings);
    if (!skyLightProbe || signature !== skyLightProbeSignature) {
      skyLightProbe?.removeFromParent();
      skyLightProbe = createCallMeSenseiSkyLightProbe({ contract: settings });
      manager.group.add(skyLightProbe);
      skyLightProbeSignature = signature;
    }
    skyLightProbe.visible = true;
    return skyLightProbe;
  }

  function configureActiveSunContract() {
    const sun = attachment.sunRig?.light ?? attachment.ownSun;
    if (!sun) return;
    restoreDirectionalShadowState(sun, attachment.restore?.sunShadow);
    if (styleSettings.skyProbe?.referenceContract === 'call-me-sensei-reference') {
      configureCallMeSenseiDirectionalLight(sun);
    }
  }

  function applyFrame() {
    const sunScale = modulation.sunIntensityScale * overlayFactor('sunIntensityScale');
    const sunColor = [...frame.sunColor];
    if (modulation.sunColorTint) {
      for (let i = 0; i < 3; i += 1) sunColor[i] = clamp(sunColor[i] * modulation.sunColorTint[i], 0, 4);
    }
    const sourceRatios = effectiveSunSourceRatios();
    const sunDirection = [sourceRatios.x, sourceRatios.y, sourceRatios.z];

    if (attachment.sunRig?.setState) {
      attachment.sunRig.setState({
        beamOpacity: 0.28 * frame.accentScale * sunScale,
        color: workColor.setRGB(sunColor[0], sunColor[1], sunColor[2]),
        diskOpacity: 0.62 * frame.accentScale * sunScale,
        intensity: frame.sunIntensity * sunScale,
        shaftOpacity: 0.1 * frame.accentScale * sunScale,
        spillOpacity: 0.3 * frame.accentScale * sunScale,
        ...(attachment.driveSunPosition ? { sourceRatios } : {}),
      });
    } else if (attachment.ownSun) {
      attachment.ownSun.color.setRGB(sunColor[0], sunColor[1], sunColor[2]);
      attachment.ownSun.intensity = frame.sunIntensity * sunScale;
      attachment.ownSun.position.set(
        sourceRatios.x,
        sourceRatios.y,
        sourceRatios.z,
      ).multiplyScalar(attachment.sunDistance);
      attachment.ownSun.target.position.set(0, 0, 0);
      attachment.ownSun.target.updateMatrixWorld();
    }
    const activeSun = attachment.sunRig?.light ?? attachment.ownSun;
    if (activeSun?.shadow?.toonLabLightDirectionToLight) {
      activeSun.shadow.toonLabLightDirectionToLight
        .copy(activeSun.position)
        .sub(activeSun.target.position)
        .normalize();
    }

    const style = styleSettings;
    ambientLight.visible = style.ambientLight.enabled;
    ambientLight.color.setRGB(...style.ambientLight.color);
    ambientLight.intensity = style.ambientLight.intensity
      * frame.ambientScale
      * modulation.ambientScale
      * overlayFactor('ambientScale');

    const probe = ensureStyleSkyLightProbe();
    if (probe) {
      updateCallMeSenseiSkyLightProbe(probe, {
        color: frame.skyProbeColor,
        energy: frame.skyProbeEnergy * modulation.ambientScale * overlayFactor('ambientScale'),
        intensity: style.skyProbe.intensity,
      });
    }

    const effectiveFogColor = [...frame.fogColor];
    if (modulation.fogColorTint) {
      for (let i = 0; i < 3; i += 1) effectiveFogColor[i] = clamp(effectiveFogColor[i] * modulation.fogColorTint[i], 0, 1);
    }
    if (modulation.fogColorOverride) {
      for (let i = 0; i < 3; i += 1) effectiveFogColor[i] = modulation.fogColorOverride[i];
    }
    const overlayFog = overlayFogColor();
    if (overlayFog) {
      for (let i = 0; i < 3; i += 1) {
        effectiveFogColor[i] += (overlayFog.color[i] - effectiveFogColor[i]) * overlayFog.weight;
      }
    }
    if (attachment.fog?.color) {
      attachment.fog.color.setRGB(...effectiveFogColor);
    }

    if (renderer && style.exposure.enabled) {
      renderer.toneMappingExposure = frame.exposure
        * modulation.exposureScale
        * overlayFactor('exposureScale');
    }

    attachment.lampRig?.setIntensity?.(frame.fixtureScale);

    // The house sky dome follows the style's day cycle: zenith/horizon
    // colors, star strength, and the sun disk color/direction all move with
    // the hour, so nights are actually dark and starry.
    if (attachment.sky) {
      const skyFrame = {
        horizonColor: frame.skyHorizonColor,
        starsStrength: frame.starsStrength,
        sunColor: sunColor,
        sunDirection,
        zenithColor: frame.skyZenithColor,
      };
      if (attachment.sky.setSceneOverrideLayer) {
        attachment.sky.setSceneOverrideLayer(skyOverrideLayer, skyFrame, {
          priority: SKY_SCENE_OVERRIDE_PRIORITIES.lighting,
        });
      } else if (attachment.sky.setSceneOverrides) {
        attachment.sky.setSceneOverrides(skyFrame);
      } else if (attachment.sky.applySettings) {
        attachment.sky.applySettings(skyFrame);
      }
    }

    const renderedSky = attachment.sky?.renderedSettings;
    const skyFillColor = renderedSky?.horizonColor ?? frame.skyHorizonColor;
    if (attachment.setSun) {
      attachment.setSun({ color: sunColor, direction: sunDirection, sky: skyFillColor });
    } else {
      attachment.setSunDirection?.(sunDirection);
    }

    // Rock material color remains geological; this transient input colors its
    // small readability floor from the same visible sky that drives the rest
    // of the world. Traverse only when the lighting frame changes, not per
    // render frame, and deduplicate shared materials.
    if (scene?.traverse) {
      const rockMaterials = new Set();
      scene.traverse((object) => {
        if (!object?.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (material?.userData?.toonLabRockSceneState?.setSkyColor) {
            rockMaterials.add(material);
          }
        }
      });
      for (const material of rockMaterials) {
        material.userData.toonLabRockSceneState.setSkyColor(skyFillColor);
      }
    }

    if (attachment.water) {
      const waterFrame = {
        skyHorizonColor: renderedSky?.horizonColor ?? frame.skyHorizonColor,
        skyZenithColor: renderedSky?.zenithColor ?? frame.skyZenithColor,
        sunColor,
        sunDirection,
      };
      if (attachment.water.setSceneOverrideLayer) {
        attachment.water.setSceneOverrideLayer(waterOverrideLayer, waterFrame, {
          priority: WATER_SCENE_OVERRIDE_PRIORITIES.lighting,
        });
      } else if (attachment.water.setSceneOverrides) {
        attachment.water.setSceneOverrides(waterFrame);
      } else if (attachment.water.applySettings) {
        attachment.water.applySettings(waterFrame);
      }
    }

    if (attachment.environmentRoot?.traverse) {
      attachment.environmentRoot.traverse((object) => {
        if (!object.isMesh || !object.material) return;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) {
          if (!material?.userData?.environmentMaterial || !material.uniforms) continue;
          material.uniforms.skyGroundTint?.value?.setRGB?.(...frame.skyGroundTint);
          material.uniforms.skyTopTint?.value?.setRGB?.(...frame.skyTopTint);
          material.uniforms.heightFogColor?.value?.setRGB?.(...effectiveFogColor);
        }
      });
    }
  }

  function applyPlacementIntensities() {
    if (placements.size === 0) return;
    const styleScale = styleSettings.fixtures.intensityScale
      * modulation.fixtureScale
      * overlayFactor('fixtureScale');
    for (const placement of placements.values()) {
      const light = manager.getLight(placement.lightId);
      if (!light) continue;
      let intensity = placement.baseIntensity * styleScale * scheduleScale(placement.schedule, frame);
      if (placement.flicker.amount > 0) {
        const t = clock * placement.flicker.speed * Math.PI * 2 + placement.flickerPhase;
        // Two detuned sines make organic, deterministic flicker without a
        // noise table; amplitude stays within ±amount.
        const wave = Math.sin(t) * 0.6 + Math.sin(t * 1.7 + placement.flickerPhase) * 0.4;
        intensity *= 1 + placement.flicker.amount * wave;
      }
      light.intensity = Math.max(intensity, 0);
    }
  }

  function refreshFrame() {
    frame = sampleLightingStyle(styleSettings, hour);
    applyFrame();
    applyPlacementIntensities();
  }

  const api = {
    /** Binds scene handles. Call with a stylized world or explicit targets. */
    attach({
      driveSunPosition = false,
      environmentRoot = null,
      fog = null,
      getSun = null,
      getSunDirection = null,
      lampRig = null,
      sky = null,
      sunDistance = 60,
      setSunDirection = null,
      setSun = null,
      sunRig = null,
      weather = null,
      water = null,
    } = {}) {
      if (disposed) throw new Error('Cannot attach a disposed lighting system.');
      restoreAttachedState();
      attachment.driveSunPosition = Boolean(driveSunPosition);
      attachment.environmentRoot = environmentRoot;
      attachment.fog = fog ?? null;
      attachment.getSun = typeof getSun === 'function' ? getSun : null;
      attachment.getSunDirection = typeof getSunDirection === 'function' ? getSunDirection : null;
      attachment.lampRig = lampRig ?? null;
      attachment.sky = sky?.setSceneOverrideLayer || sky?.setSceneOverrides || sky?.applySettings
        ? sky
        : null;
      attachment.sunDistance = Math.max(finite(sunDistance, 60), 1);
      attachment.setSunDirection = typeof setSunDirection === 'function' ? setSunDirection : null;
      attachment.setSun = typeof setSun === 'function' ? setSun : null;
      attachment.sunRig = sunRig?.light ? sunRig : null;
      attachment.weather = weather?.setLightingSystem ? weather : null;
      attachment.weatherLighting = attachment.weather?.lightingSystem ?? null;
      attachment.water = water?.setSceneOverrideLayer || water?.setSceneOverrides || water?.applySettings
        ? water
        : null;
      if (!attachment.sunRig && scene && !attachment.ownSun) {
        const sun = new THREE.DirectionalLight(0xffffff, 1);
        sun.name = 'Lighting System Sun';
        sun.castShadow = true;
        manager.group.add(sun);
        manager.group.add(sun.target);
        attachment.ownSun = sun;
      }
      captureRestoreState();
      configureActiveSunContract();
      refreshFrame();
      attachment.weather?.setLightingSystem(api);
      return api;
    },

    /** Convenience: binds the handles a createStylizedWorld result exposes. */
    attachWorld(world, options = {}) {
      return api.attach({
        environmentRoot: world?.environmentRoot ?? null,
        fog: world?.fog ?? null,
        getSun: world ? () => world.sunState : null,
        getSunDirection: world ? () => world.sunDirection : null,
        sky: world?.sky ?? null,
        sunRig: world?.sunRig ?? null,
        setSun: world?.setSun ?? null,
        setSunDirection: world?.setSunDirection ?? null,
        weather: world?.weather ?? null,
        water: world?.water ?? null,
        // Worlds translate the physical light every frame for shadow-follow;
        // the style drives its true direction, color, and intensity. Sky uses
        // a lower-priority Lighting layer so Weather composes above it without
        // either system mutating the authored Sky preset.
        driveSunPosition: false,
        ...options,
      });
    },

    detach() {
      restoreAttachedState();
      attachment.driveSunPosition = false;
      attachment.environmentRoot = null;
      attachment.fog = null;
      attachment.getSun = null;
      attachment.getSunDirection = null;
      attachment.lampRig = null;
      attachment.sky = null;
      attachment.sunRig = null;
      attachment.setSunDirection = null;
      attachment.setSun = null;
      attachment.weather = null;
      attachment.weatherLighting = null;
      attachment.water = null;
      if (skyLightProbe) skyLightProbe.visible = false;
      return api;
    },

    /** Swaps the whole lighting identity. Placements survive. */
    setStyle(nextStyle) {
      if (disposed) throw new Error('Cannot update a disposed lighting system.');
      styleSettings = resolveLightingStylePreset(nextStyle);
      if (!quality) manager.setQuality(styleSettings.quality);
      configureActiveSunContract();
      refreshFrame();
      return api;
    },

    setQuality(nextQuality) {
      quality = nextQuality;
      manager.setQuality(nextQuality);
      return api;
    },

    /** Sets the hour (0-24). The entire look follows the style's day cycle. */
    setTimeOfDay(nextHour) {
      hour = ((finite(nextHour, 12) % 24) + 24) % 24;
      refreshFrame();
      return frame;
    },

    /**
     * Overrides the scene-space direction toward the sun without replacing
     * the active time-of-day palette. Pass null to return direction ownership
     * to the day curve.
     */
    setSunDirection(direction = null) {
      if (direction == null) {
        sunDirectionOverride = null;
      } else {
        const values = Array.isArray(direction)
          ? direction.slice(0, 3).map(Number)
          : [Number(direction.x), Number(direction.y), Number(direction.z)];
        if (values.length < 3 || !values.every(Number.isFinite)) {
          throw new TypeError('Sun direction must contain three finite components.');
        }
        const length = Math.hypot(...values);
        if (length < 1e-6) throw new RangeError('Sun direction cannot be zero length.');
        sunDirectionOverride = values.map((value) => value / length);
      }
      applyFrame();
      return api.sunDirection;
    },

    /** Advances the day cycle; use from update loops for live cycles. */
    advanceTime(hoursDelta) {
      return api.setTimeOfDay(hour + finite(hoursDelta, 0));
    },

    /**
     * Weather integration point: one multiplicative layer instead of a second
     * writer on the same lights/fog/exposure.
     */
    setWeatherModulation(nextModulation) {
      modulation = normalizeModulation(nextModulation);
      refreshFrame();
      return api;
    },

    /** Places a fixture. Returns a handle: { id, descriptor, light, remove, set }. */
    place(fixture, position = null, { id = null, overrides = null, seed: placementSeed = null, target = null } = {}) {
      if (disposed) throw new Error('Cannot update a disposed lighting system.');
      const fixtureId = typeof fixture === 'string' ? fixture : slug(fixture?.id ?? 'fixture', 'fixture');
      const fixtureSettings = resolveLightFixture(fixture);
      placementCounter += 1;
      const resolvedSeed = placementSeed ?? deriveSeed(seed, `${fixtureId}:${placementCounter}`);
      const placement = resolveFixturePlacement(fixtureSettings, {
        id: id ?? `${fixtureId}-${placementCounter}`,
        overrides,
        position,
        seed: resolvedSeed,
        target,
      });
      const lightId = manager.addLight(placement.descriptor);
      const light = manager.getLight(lightId);
      const record = {
        baseIntensity: light?.intensity ?? 1,
        fixtureId,
        flicker: placement.flicker,
        flickerPhase: placement.flickerPhase,
        input: { fixture: fixtureId, id, overrides: cloneJson(overrides), position, seed: resolvedSeed, target },
        lightId,
        overlayId: null,
        schedule: placement.schedule,
      };
      placements.set(lightId, record);
      applyPlacementIntensities();
      return {
        descriptor: placement.descriptor,
        id: lightId,
        light,
        remove: () => api.removePlacement(lightId),
        set: (nextOverrides) => {
          const next = manager.updateLight(lightId, nextOverrides);
          if (next) record.baseIntensity = manager.getLight(lightId)?.intensity ?? record.baseIntensity;
          applyPlacementIntensities();
          return next;
        },
      };
    },

    removePlacement(idOrHandle) {
      const lightId = typeof idOrHandle === 'string' ? idOrHandle : idOrHandle?.id;
      if (!placements.has(lightId)) return false;
      placements.delete(lightId);
      return manager.removeLight(lightId);
    },

    /** Applies a scene overlay; adjustments blend in over blendSeconds. */
    applyOverlay(overlay, { blendSeconds = 0.4 } = {}) {
      if (disposed) throw new Error('Cannot update a disposed lighting system.');
      const normalized = normalizeOverlay(overlay);
      api.removeOverlay(normalized.id, { blendSeconds: 0 });
      const placementIds = [];
      for (const entry of normalized.fixtures) {
        if (!entry.fixture) continue;
        const handle = api.place(entry.fixture, entry.position, {
          overrides: entry.overrides,
          seed: entry.seed,
          target: entry.target,
        });
        placements.get(handle.id).overlayId = normalized.id;
        placementIds.push(handle.id);
      }
      overlays.set(normalized.id, {
        adjustments: normalized.adjustments,
        blendSeconds: Math.max(finite(blendSeconds, 0.4), 0),
        id: normalized.id,
        placementIds,
        target: 1,
        weight: blendSeconds > 0 ? 0 : 1,
      });
      refreshFrame();
      return normalized.id;
    },

    removeOverlay(id, { blendSeconds = 0.4 } = {}) {
      const overlay = overlays.get(id);
      if (!overlay) return false;
      overlay.target = 0;
      overlay.blendSeconds = Math.max(finite(blendSeconds, 0.4), 0);
      if (overlay.blendSeconds === 0) {
        for (const placementId of overlay.placementIds) api.removePlacement(placementId);
        overlays.delete(id);
        refreshFrame();
      }
      return true;
    },

    /** Per-frame: overlay blends, fixture flicker, light budget selection. */
    update(delta = 0.016, nextCamera = null) {
      if (disposed) return;
      const dt = clamp(finite(delta, 0.016), 0, 0.1);
      clock += dt;
      let overlaysChanged = false;
      for (const overlay of [...overlays.values()]) {
        if (overlay.weight !== overlay.target) {
          const step = overlay.blendSeconds > 0 ? dt / overlay.blendSeconds : 1;
          overlay.weight = overlay.target > overlay.weight
            ? Math.min(overlay.weight + step, overlay.target)
            : Math.max(overlay.weight - step, overlay.target);
          overlaysChanged = true;
          if (overlay.weight === 0 && overlay.target === 0) {
            for (const placementId of overlay.placementIds) api.removePlacement(placementId);
            overlays.delete(overlay.id);
          }
        }
      }
      if (overlaysChanged) applyFrame();
      updateOwnSunShadowFocus(nextCamera);
      applyPlacementIntensities();
      manager.update(nextCamera ? { camera: nextCamera } : {});
    },

    stats() {
      const diagnostics = manager.getDiagnostics();
      const byCategory = {};
      for (const placement of placements.values()) {
        byCategory[placement.fixtureId] = (byCategory[placement.fixtureId] ?? 0) + 1;
      }
      return {
        activeLightCount: diagnostics.activeLightCount,
        backend: diagnostics.backend,
        hour,
        overlayCount: overlays.size,
        placementCount: placements.size,
        placementsByFixture: byCategory,
        shadowedLightCount: diagnostics.shadowedLightCount,
        totalLightCount: diagnostics.totalLightCount,
        warnings: diagnostics.warnings,
      };
    },

    toJSON() {
      return {
        placements: [...placements.values()]
          .filter((placement) => placement.overlayId === null)
          .map((placement) => cloneJson(placement.input)),
        style: cloneJson(styleSettings),
        timeOfDay: hour,
      };
    },

    /** Removes placements/overlays/modulation and re-applies the style. */
    reset() {
      for (const id of [...placements.keys()]) api.removePlacement(id);
      overlays.clear();
      modulation = { ...DEFAULT_MODULATION };
      placementCounter = 0;
      refreshFrame();
      return api;
    },

    dispose() {
      if (disposed) return;
      api.reset();
      restoreAttachedState();
      attachment.ownSun?.shadow?.map?.dispose?.();
      skyLightProbe?.removeFromParent();
      skyLightProbe = null;
      manager.dispose();
      disposed = true;
    },

    get frame() { return frame; },
    get sunDirection() {
      const ratios = effectiveSunSourceRatios();
      return [ratios.x, ratios.y, ratios.z];
    },
    get manager() { return manager; },
    get quality() { return cloneJson(manager.quality); },
    get skyLightProbe() { return skyLightProbe; },
    get style() { return styleSettings; },
    get timeOfDay() { return hour; },
    getDiagnostics: () => manager.getDiagnostics(),
    /** Toon-response metadata for material adapters (band softness, tint). */
    getToonResponse: () => cloneJson(styleSettings.toonResponse),
  };

  refreshFrame();
  return api;
}
