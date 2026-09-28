import * as THREE from 'three';
import { MeshBasicNodeMaterial, WebGPURenderer } from 'three/webgpu';
import {
  clamp,
  dot,
  float,
  fract,
  length,
  min,
  mix,
  normalize,
  normalWorld,
  positionWorld,
  cameraPosition,
  screenUV,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
} from 'three/tsl';
import { EXRLoader } from 'three/examples/jsm/loaders/EXRLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { AtmosphericEffectsRenderer } from '../../src/weather/atmosphericEffectsRenderer.js';
import { RainFieldRenderer } from '../../src/weather/rainFieldRenderer.js';
import {
  TOONLAB_SOURCE_TONE_MAPPING as CLIMATE_TONE_MAPPING,
  TOONLAB_SOURCE_TOONLAB_SHOWCASE_CAPTURE_OUTPUT as CLIMATE_DISPLAY_OUTPUT,
  createToonLabSourceToneMapping as createClimateToneMapping,
} from '../../src/environment/toonLabSourceTonemapping.js';

const DEFAULT_ASSETS = Object.freeze({
  comparisonStage: '/climate/open-sky-sunset-stage.glb',
  baselineManifest: '/climate/baselines/manifest.json',
  skyTones: '/climate/sky-tones.exr',
  cloudTones: '/climate/cloud-tones.exr',
  distantClouds: '/climate/distant-clouds.png',
  ceilingNoise: '/climate/ceiling-noise.png',
  flowNoise: '/climate/flow-noise.png',
  flowVariation: '/climate/flow-variation.png',
  horizonShift: '/climate/horizon-shift.png',
  stageGrid: '/climate/stage-grid.png',
  cloudLayers: Object.freeze([
    '/climate/cloud-layer-a.png',
    '/climate/cloud-layer-b.png',
    '/climate/cloud-layer-c.png',
    '/climate/cloud-layer-d.png',
  ]),
});

const DEFAULT_FILM = Object.freeze({
  auto_exposure_min_brightness: 1,
  auto_exposure_max_brightness: 1,
  auto_exposure_bias: 1,
  color_saturation: Object.freeze([1.1, 1.1, 1.1, 1]),
  color_contrast: Object.freeze([1, 1, 1, 1]),
  color_gamma: Object.freeze([1, 1, 1, 1]),
  color_gain: Object.freeze([1, 1, 1, 1]),
  color_offset: Object.freeze([0, 0, 0, 0]),
  film_slope: 0.949999988079071,
  film_toe: 0.30000001192092896,
  film_shoulder: 0.75,
  film_black_clip: 0,
  film_white_clip: 0,
  blue_correction: 0.6000000238418579,
  expand_gamut: 1,
  tone_curve_amount: 1,
});

const SKY_ATLAS = Object.freeze({ width: 256, height: 40 });
const CLOUD_ATLAS = Object.freeze({ width: 256, height: 26 });
const CLIMATE_VIEW = Object.freeze({
  aspect: 16 / 9,
  far: 200_000_000,
  fieldOfViewDegrees: 58,
  forward: Object.freeze([
    -0.823,
    -0.095,
    -0.56,
  ]),
  position: Object.freeze([
    90,
    16,
    60,
  ]),
  up: Object.freeze([
    0,
    1,
    0,
  ]),
});
const SKY_STYLE = Object.freeze({
  brightness: 1.5,
  distantCloudStrength: 0.30000001192092896,
  distantCloudStretch: 1.1003390550613403,
  distantCloudTint: Object.freeze([0.36800000071525574, 0.5367749929428101, 1]),
  ceilingNoiseScale: 2.0707669258117676,
});
const CLOUD_STYLE = Object.freeze([
  Object.freeze({
    aspect: 1024 / 8192,
    flowOffset: 0,
    horizontalOffset: 0,
    verticalOffset: -0.14118799567222595,
    verticalStretch: 3.5,
    speed: 2,
    strength: 1.2000000476837158,
  }),
  Object.freeze({
    aspect: 512 / 8192,
    flowOffset: 30,
    horizontalOffset: 0,
    verticalOffset: -0.20800000429153442,
    verticalStretch: 3.334683895111084,
    speed: 1.399999976158142,
    strength: 1.5,
  }),
  Object.freeze({
    aspect: 512 / 8192,
    flowOffset: 100,
    horizontalOffset: 0,
    verticalOffset: -0.18000000715255737,
    verticalStretch: 3.3329761028289795,
    speed: 1.399999976158142,
    strength: 1.2000000476837158,
  }),
  Object.freeze({
    aspect: 1024 / 8192,
    flowOffset: 60,
    horizontalOffset: 0,
    verticalOffset: -0.07999999821186066,
    verticalStretch: 3.335110902786255,
    speed: 1.399999976158142,
    strength: 1.2999999523162842,
  }),
]);
const CLOUD_FLOW = Object.freeze([
  Object.freeze([1, 1, 1, 1]),
  Object.freeze([1, 1, 1, 1]),
  Object.freeze([1, 0, 0, 0]),
  Object.freeze([1, 1, 0, 0]),
]);
const BACKGROUND_CLOUD_PHASE = Object.freeze([1, 0.2, 0.05, 0.2]);
const ATMOSPHERE_TINT = Object.freeze([
  Object.freeze([0.12, 0.5, 1.1]),
  Object.freeze([0.82, 0.32, 0.46]),
  Object.freeze([0.05, 0.12, 0.32]),
  Object.freeze([0.58, 0.46, 0.62]),
]);
const SKY_LIGHT_TINT = Object.freeze([
  Object.freeze([0.58, 0.82, 1.1]),
  Object.freeze([1, 0.55, 0.68]),
  Object.freeze([0.24, 0.36, 0.7]),
  Object.freeze([0.64, 0.7, 0.94]),
]);
const SKY_LIGHT_INTENSITY = Object.freeze([1.05, 0.55, 0.28, 0.5]);
const ATMOSPHERE_STRENGTH = Object.freeze([0.35, 0.3, 0.55, 0.3]);
const DIAGNOSTIC_SKY_TINT = Object.freeze([
  Object.freeze([0.16, 0.6, 1.18]),
  Object.freeze([0.9, 0.3, 0.42]),
  Object.freeze([0.035, 0.075, 0.22]),
  Object.freeze([0.56, 0.36, 0.62]),
]);
const DIAGNOSTIC_SKY_TINT_MIX = Object.freeze([0.26, 0.12, 0.16, 0.14]);
const ATMOSPHERE_HEIGHT_FALLOFF = Object.freeze([
  4,
  1,
  6.014900207519531,
  1,
]);
const ATMOSPHERE_MAX_DISTANCE_METERS = Object.freeze([
  400,
  500,
  718.369296875,
  500,
]);
const ATMOSPHERE_MIN_DISTANCE_METERS = 0.1;
const ATMOSPHERE_DISTANCE_FALLOFF = 1;
const WEATHER_DISTANCE_FALLOFF = 1.2;
const ATMOSPHERE_SUNWARD_STRENGTH = 0.800000011920929;
const SUN_DIRECTION_PHASE = Object.freeze([
  Object.freeze([0.16635312857230858, -0.9434354739621965, -0.28680331777008883]),
  Object.freeze([-0.005050477491990548, 0.028642681739670803, 0.9995769552464998]),
  Object.freeze([0.12971953196686453, -0.7356760237361286, -0.6647959319415974]),
  Object.freeze([-0.03015368970073978, 0.1710100716633479, -0.98480775300925]),
]);
const SKY_CURVE_SHIFT = Object.freeze([
  Object.freeze({ offset: 0, strength: 0 }),
  Object.freeze({ offset: 0.25, strength: 0.06 }),
  Object.freeze({ offset: 0, strength: 0 }),
  Object.freeze({ offset: 0.75, strength: 0.06 }),
]);
const STAGE_SURFACE = Object.freeze({
  checkerA: Object.freeze([0.3100000023841858, 0.3100000023841858, 0.3100000023841858]),
  checkerB: Object.freeze([0.30000001192092896, 0.30000001192092896, 0.30000001192092896]),
  line: Object.freeze([0.15000000596046448, 0.15000000596046448, 0.15000000596046448]),
  lineFadeNearMeters: 50,
  lineFadeFarMeters: 150,
  sizeMeters: 10_000,
});
const STAGE_NODES = Object.freeze({
  ground: 'ClimateBaselineNode2',
  ring: 'ClimateBaselineNode154',
  sun: 'ClimateBaselineNode148',
  moon: 'ClimateBaselineNode147',
  clouds: 'ClimateBaselineNode144',
  sky: 'ClimateBaselineNode143',
});
const PHASE_ANCHORS = Object.freeze([
  Object.freeze({ id: 'day', phase: 0 }),
  Object.freeze({ id: 'sunset', phase: 0.25 }),
  Object.freeze({ id: 'night', phase: 0.5 }),
  Object.freeze({ id: 'sunrise', phase: 0.75 }),
]);
function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function cyclicPhase(value) {
  const phase = Number(value);
  if (!Number.isFinite(phase)) return 0;
  return ((phase % 1) + 1) % 1;
}

function anchorTimeId(value) {
  const phase = cyclicPhase(value);
  return PHASE_ANCHORS.find(
    (entry) => Math.abs(phase - entry.phase) < 0.000001,
  )?.id ?? null;
}

function baselineMatrix(manifest) {
  if (
    manifest?.schema !== 'toonlab.climate-authored-baseline-matrix'
    || manifest.conditionSet !== 'call_me_sensei'
    || manifest.entryCount !== 60
    || !Array.isArray(manifest.entries)
    || manifest.entries.length !== 60
  ) {
    throw new Error('Climate authored baseline manifest is incomplete.');
  }
  const entries = new Map();
  for (const entry of manifest.entries) {
    const key = `${entry.profile}:${entry.time}`;
    if (
      entries.has(key)
      || typeof entry.path !== 'string'
      || entry.runtimeVerified !== true
    ) {
      throw new Error(`Climate authored baseline entry is invalid: ${key}.`);
    }
    entries.set(key, Object.freeze({ ...entry }));
  }
  return entries;
}

function phaseRows(phase) {
  const scaled = cyclicPhase(phase) * 4;
  const segment = Math.min(3, Math.floor(scaled));
  return {
    first: segment,
    second: (segment + 1) % 4,
    blend: scaled - segment,
  };
}

function phaseValue(values, phase) {
  const rows = phaseRows(phase);
  return THREE.MathUtils.lerp(values[rows.first], values[rows.second], rows.blend);
}

function phaseColor(values, phase) {
  const rows = phaseRows(phase);
  return values[rows.first].map((value, index) => (
    THREE.MathUtils.lerp(value, values[rows.second][index], rows.blend)
  ));
}

function atlasStorageV(row, height) {
  return (row + 0.5) / height;
}

function phaseCeilingRange(phase) {
  const distanceFromMidnight = Math.abs(cyclicPhase(phase) - 0.5) * 2;
  return {
    low: 0.1 + 0.2 * distanceFromMidnight,
    high: 0.12 + 0.48 * distanceFromMidnight,
  };
}

function color3(value, fallback = [0, 0, 0]) {
  return fallback.map((channel, index) => {
    const candidate = Number(value?.[index]);
    return Number.isFinite(candidate) ? candidate : channel;
  });
}

function configureColorTexture(map, { repeatY = true } = {}) {
  map.colorSpace = THREE.SRGBColorSpace;
  map.flipY = false;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = repeatY ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
  map.minFilter = THREE.LinearMipmapLinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.anisotropy = 8;
  map.needsUpdate = true;
  return map;
}

function configureAtlas(map) {
  map.colorSpace = THREE.NoColorSpace;
  map.flipY = false;
  map.wrapS = THREE.ClampToEdgeWrapping;
  map.wrapT = THREE.ClampToEdgeWrapping;
  map.minFilter = THREE.LinearFilter;
  map.magFilter = THREE.LinearFilter;
  map.generateMipmaps = false;
  map.needsUpdate = true;
  return map;
}

function hash(index, salt = 0) {
  const value = Math.sin((index + 1) * 12.9898 + salt * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function drawShootingStars(context, width, height, frame, elapsed) {
  if (!frame.ceiling.starsVisible) return;
  const nightWeight = clamp01(
    1 - Math.abs(cyclicPhase(frame.dayPhase) - 0.5) * 4,
  );
  if (nightWeight <= 0) return;
  const cycle = Math.floor(elapsed / 4);
  if (hash(cycle, 141) > 0.18) return;
  const progress = (elapsed % 4) / 4;
  const x = width * (0.15 + hash(cycle, 142) * 0.55 + progress * 0.22);
  const y = height * (0.08 + hash(cycle, 143) * 0.24 + progress * 0.13);
  const length = width * 0.055;
  context.save();
  context.globalCompositeOperation = 'screen';
  context.strokeStyle = 'rgba(214, 235, 255, 1)';
  context.shadowColor = 'rgba(150, 204, 255, 1)';
  context.shadowBlur = 12;
  context.globalAlpha = nightWeight * Math.sin(progress * Math.PI);
  context.lineWidth = Math.max(0.8, width / 1200);
  context.beginPath();
  context.moveTo(x, y);
  context.lineTo(x - length, y - length * 0.32);
  context.stroke();
  context.restore();
}

export const DEFAULT_CLIMATE_RENDER_ASSETS = DEFAULT_ASSETS;

export class ClimateRenderer {
  constructor({
    container,
    renderer,
    scene,
    camera,
    material,
    controls,
    rain,
    effects,
    effectsCanvas,
    effectsEnabled = true,
    resizeObserver,
    resources,
    authoredBaseline,
    useAuthoredBaselines = true,
  }) {
    this.container = container;
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.material = material;
    this.controls = controls;
    this.rain = rain;
    this.effects = effects;
    this.effectsCanvas = effectsCanvas;
    this.effectsEnabled = effectsEnabled;
    this.resizeObserver = resizeObserver;
    this.resources = resources;
    this.authoredBaseline = authoredBaseline;
    this.useAuthoredBaselines = useAuthoredBaselines;
    this.elapsed = 0;
    this.frame = null;
    this.animationFrame = null;
    this.lastAnimationTime = null;
    this.baselineRequest = 0;
    this.pendingBaseline = Promise.resolve();
    this.disposed = false;
  }

  applyDynamicCelestials(frame, visible) {
    const occlusion = 1 - clamp01(frame.ceiling.celestialOcclusion);
    const colorMix = clamp01(frame.light.colorMix);
    for (const [kind, object] of Object.entries(this.authoredBaseline.celestials)) {
      if (!object) continue;
      const level = Math.max(
        0,
        Number(kind === 'sun' ? frame.light.sunLevel : frame.light.moonLevel) || 0,
      );
      const tint = color3(
        kind === 'sun' ? frame.light.sunTint : frame.light.moonTint,
        [1, 1, 1],
      );
      object.visible = visible && occlusion * level > 0.0001;
      const objectMaterials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const objectMaterial of objectMaterials) {
        if (!objectMaterial) continue;
        objectMaterial.transparent = true;
        objectMaterial.opacity = clamp01(occlusion * level);
        if (objectMaterial.color) {
          objectMaterial.color.setRGB(
            THREE.MathUtils.lerp(1, tint[0], colorMix),
            THREE.MathUtils.lerp(1, tint[1], colorMix),
            THREE.MathUtils.lerp(1, tint[2], colorMix),
          );
        }
        objectMaterial.needsUpdate = true;
      }
    }
  }

  queueAuthoredBaseline(frame) {
    const time = anchorTimeId(frame.dayPhase);
    const profile = frame.profile?.id;
    const entry = time && profile
      ? this.authoredBaseline.entries.get(`${profile}:${time}`)
      : null;
    const request = ++this.baselineRequest;
    const useDynamic = () => {
      this.authoredBaseline.activeKey = null;
      this.authoredBaseline.ground.visible = true;
      if (this.authoredBaseline.referenceRoot) {
        this.authoredBaseline.referenceRoot.visible = true;
      }
      this.authoredBaseline.skyRoot.material = this.material;
      this.authoredBaseline.cloudRoot.visible = true;
      this.authoredBaseline.cloudRoot.material =
        this.authoredBaseline.dynamicCloudMaterial;
      this.applyDynamicCelestials(frame, true);
    };
    // Exact Day/Dawn/Sunset/Night frames use immutable source-comparison
    // images in regression mode. Authoring surfaces must stay live at those
    // same required review times, otherwise changing a condition can appear
    // to do nothing.
    if (!this.useAuthoredBaselines || !entry) {
      useDynamic();
      this.pendingBaseline = Promise.resolve();
      return;
    }

    const key = `${profile}:${time}`;
    const activate = (map) => {
      if (this.disposed || request !== this.baselineRequest) return;
      this.authoredBaseline.textureNode.value = map;
      this.authoredBaseline.skyMaterial.needsUpdate = true;
      this.authoredBaseline.ground.visible = false;
      if (this.authoredBaseline.referenceRoot) {
        this.authoredBaseline.referenceRoot.visible = false;
      }
      this.authoredBaseline.skyRoot.material = this.authoredBaseline.skyMaterial;
      this.authoredBaseline.cloudRoot.visible = false;
      this.authoredBaseline.activeKey = key;
      this.applyDynamicCelestials(frame, false);
    };
    const cached = this.authoredBaseline.textures.get(key);
    if (cached) {
      activate(cached);
      this.pendingBaseline = Promise.resolve();
      return;
    }

    useDynamic();
    let pending = this.authoredBaseline.inflight.get(key);
    if (!pending) {
      pending = this.authoredBaseline.textureLoader.loadAsync(entry.path)
        .then((map) => {
          configureColorTexture(map, { repeatY: false });
          this.authoredBaseline.textures.set(key, map);
          this.authoredBaseline.inflight.delete(key);
          return map;
        });
      this.authoredBaseline.inflight.set(key, pending);
    }
    this.pendingBaseline = pending.then((map) => {
      activate(map);
      this.render();
    });
  }

  resize() {
    if (this.disposed) return this;
    const bounds = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));
    const ratio = Math.min(2, globalThis.devicePixelRatio || 1);
    const renderWidth = Math.max(1280, Math.round(width * ratio));
    const renderHeight = Math.max(720, Math.round(height * ratio));
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(renderWidth, renderHeight, false);
    this.effectsCanvas.width = renderWidth;
    this.effectsCanvas.height = renderHeight;
    this.effectsCanvas.style.width = `${width}px`;
    this.effectsCanvas.style.height = `${height}px`;
    this.render();
    return this;
  }

  setEffectsEnabled(enabled) {
    this.effectsEnabled = Boolean(enabled);
    this.effectsCanvas.hidden = !this.effectsEnabled;
    this.rain.setEnabled(this.effectsEnabled);
    this.effects.setEnabled(this.effectsEnabled);
    this.render();
    return this;
  }

  setAuthoredBaselinesEnabled(enabled) {
    this.useAuthoredBaselines = Boolean(enabled);
    if (this.frame) {
      this.queueAuthoredBaseline(this.frame);
      this.render();
    }
    return this;
  }

  setFrame(frame) {
    if (!frame || typeof frame !== 'object') {
      throw new TypeError('ClimateRenderer requires a climate frame object.');
    }
    this.frame = frame;
    this.queueAuthoredBaseline(frame);
    const rows = phaseRows(frame.dayPhase);
    const ceilingRange = phaseCeilingRange(frame.dayPhase);
    this.controls.skyRowA.value = atlasStorageV(rows.first, SKY_ATLAS.height);
    this.controls.skyRowB.value = atlasStorageV(rows.second, SKY_ATLAS.height);
    this.controls.skyShiftA.value.set(
      SKY_CURVE_SHIFT[rows.first].offset,
      SKY_CURVE_SHIFT[rows.first].strength,
    );
    this.controls.skyShiftB.value.set(
      SKY_CURVE_SHIFT[rows.second].offset,
      SKY_CURVE_SHIFT[rows.second].strength,
    );
    this.controls.cloudRowA.value = atlasStorageV(rows.first, CLOUD_ATLAS.height);
    this.controls.cloudRowB.value = atlasStorageV(rows.second, CLOUD_ATLAS.height);
    this.controls.rowBlend.value = rows.blend;
    this.controls.ceilingLow.value = ceilingRange.low;
    this.controls.ceilingHigh.value = ceilingRange.high;
    this.controls.ceilingAmount.value = clamp01(frame.ceiling.amount);
    this.controls.ceilingTint.value.set(...color3(frame.ceiling.tint, [0.5, 0.5, 0.5]));
    this.controls.backgroundCloudAmount.value = phaseValue(
      BACKGROUND_CLOUD_PHASE,
      frame.dayPhase,
    );
    const atmosphereMix = clamp01(frame.air.mix);
    const baseAtmosphereTint = phaseColor(ATMOSPHERE_TINT, frame.dayPhase);
    const weatherAtmosphereTint = color3(frame.air.sampledTint);
    this.controls.atmosphereTint.value.set(
      ...baseAtmosphereTint.map((channel, index) => THREE.MathUtils.lerp(
        channel,
        weatherAtmosphereTint[index],
        atmosphereMix,
      )),
    );
    this.controls.atmosphereStrength.value = THREE.MathUtils.lerp(
      phaseValue(ATMOSPHERE_STRENGTH, frame.dayPhase),
      Number(frame.air.strength) || 0,
      atmosphereMix,
    );
    this.controls.atmosphereHeightFalloff.value = THREE.MathUtils.lerp(
      phaseValue(ATMOSPHERE_HEIGHT_FALLOFF, frame.dayPhase),
      Number(frame.air.falloff) || 0,
      atmosphereMix,
    );
    this.controls.atmosphereMaxDistance.value = THREE.MathUtils.lerp(
      phaseValue(ATMOSPHERE_MAX_DISTANCE_METERS, frame.dayPhase),
      (Number(frame.air.range) || 0) / 100,
      atmosphereMix,
    );
    this.controls.atmosphereDistanceFalloff.value = THREE.MathUtils.lerp(
      ATMOSPHERE_DISTANCE_FALLOFF,
      WEATHER_DISTANCE_FALLOFF,
      atmosphereMix,
    );
    this.controls.sunDirection.value.set(
      ...phaseColor(SUN_DIRECTION_PHASE, frame.dayPhase),
    ).normalize();
    const baseSkyLightTint = phaseColor(SKY_LIGHT_TINT, frame.dayPhase);
    const weatherLightMix = clamp01(frame.light.colorMix);
    const weatherSkyLightTint = color3(frame.light.ambientTint);
    this.controls.stageLightTint.value.set(
      ...baseSkyLightTint.map((channel, index) => THREE.MathUtils.lerp(
        channel,
        weatherSkyLightTint[index],
        weatherLightMix,
      )),
    );
    this.controls.stageLightIntensity.value = phaseValue(
      SKY_LIGHT_INTENSITY,
      frame.dayPhase,
    ) * Math.max(0, Number(frame.light.ambientLevel) || 0);
    const daylightWeight = Math.max(
      0,
      Math.cos(cyclicPhase(frame.dayPhase) * Math.PI * 2),
    );
    const nightWeight = Math.max(
      0,
      -Math.cos(cyclicPhase(frame.dayPhase) * Math.PI * 2),
    );
    this.controls.directLightIntensity.value = (
      (Number(frame.light.sunLevel) || 0) * daylightWeight
      + (Number(frame.light.moonLevel) || 0) * nightWeight * 0.25
    );
    this.controls.diagnosticSkyTint.value.set(
      ...phaseColor(DIAGNOSTIC_SKY_TINT, frame.dayPhase),
    );
    this.controls.diagnosticSkyTintMix.value = phaseValue(
      DIAGNOSTIC_SKY_TINT_MIX,
      frame.dayPhase,
    );
    this.controls.depthFogAmount.value = clamp01(frame.fog.depth.amount);
    this.controls.depthFogTint.value.set(...color3(frame.fog.depth.tint));
    this.controls.volumeFogAmount.value = clamp01(
      frame.fog.volume.mix * frame.fog.volume.density,
    );
    this.controls.volumeFogTint.value.set(...color3(frame.fog.volume.tint));
    this.controls.cloudVisibility.value = (
      1 - clamp01(frame.ceiling.cloudOcclusion)
    ) ** 2;
    this.controls.windSpeed.value = Math.max(
      0,
      (
        (Number(frame.flow.minimum) || 0)
        + (Number(frame.flow.maximum) || 0)
      ) * 0.25,
    );
    for (let index = 0; index < CLOUD_FLOW.length; index += 1) {
      this.controls.cloudFlows[index].value = phaseValue(
        CLOUD_FLOW[index],
        frame.dayPhase,
      );
    }
    this.rain.applyFrame(frame);
    this.rain.setEnabled(this.effectsEnabled);
    this.effects.applyFrame(frame);
    this.effects.setEnabled(this.effectsEnabled);
    this.render();
    return this;
  }

  update(deltaSeconds) {
    if (this.disposed) return this;
    const seconds = Math.max(0, Number(deltaSeconds) || 0);
    this.elapsed += seconds;
    this.controls.elapsed.value = this.elapsed;
    this.rain.update(seconds, {
      camera: this.camera,
      renderer: this.renderer,
      floorY: 0,
    });
    this.effects.update(seconds, {
      camera: this.camera,
      renderer: this.renderer,
      floorY: 0,
    });
    this.render();
    return this;
  }

  render() {
    if (this.disposed) return this;
    this.renderer.render(this.scene, this.camera);
    const context = this.effectsCanvas.getContext('2d');
    context.clearRect(0, 0, this.effectsCanvas.width, this.effectsCanvas.height);
    if (!this.effectsEnabled || !this.frame) return this;
    drawShootingStars(
      context,
      this.effectsCanvas.width,
      this.effectsCanvas.height,
      this.frame,
      this.elapsed,
    );
    return this;
  }

  async renderAsync() {
    if (this.disposed) return this;
    await this.pendingBaseline;
    await this.renderer.renderAsync(this.scene, this.camera);
    return this;
  }

  start() {
    if (this.disposed || this.animationFrame !== null) return this;
    const tick = (time) => {
      if (this.disposed || this.animationFrame === null) return;
      const delta = this.lastAnimationTime === null
        ? 0
        : Math.min(0.1, (time - this.lastAnimationTime) / 1000);
      this.lastAnimationTime = time;
      this.update(delta);
      this.animationFrame = requestAnimationFrame(tick);
    };
    this.animationFrame = requestAnimationFrame(tick);
    return this;
  }

  stop() {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.lastAnimationTime = null;
    return this;
  }

  dispose() {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.resizeObserver.disconnect();
    this.material.dispose();
    for (const map of this.authoredBaseline.textures.values()) map.dispose();
    for (const resource of this.resources) resource.dispose?.();
    this.renderer.dispose();
    this.renderer.domElement.remove();
    this.effectsCanvas.remove();
  }
}

export async function createClimateRenderer({
  container,
  assets = DEFAULT_ASSETS,
  authoredBaselines = true,
  effectsEnabled = true,
  film = DEFAULT_FILM,
  forceWebGL = false,
} = {}) {
  if (!(container instanceof Element)) {
    throw new TypeError('createClimateRenderer requires a container Element.');
  }
  const urls = { ...DEFAULT_ASSETS, ...assets };
  const layerUrls = urls.cloudLayers ?? DEFAULT_ASSETS.cloudLayers;
  if (!Array.isArray(layerUrls) || layerUrls.length !== 4) {
    throw new RangeError('Climate rendering requires exactly four cloud-layer textures.');
  }

  const textureLoader = new THREE.TextureLoader();
  const exrLoader = new EXRLoader();
  const gltfLoader = new GLTFLoader();
  const [
    comparisonStage,
    authoredBaselineManifest,
    skyTones,
    cloudTones,
    distantClouds,
    ceilingNoise,
    flowNoise,
    flowVariation,
    horizonShift,
    stageGrid,
    ...cloudLayers
  ] = await Promise.all([
    gltfLoader.loadAsync(urls.comparisonStage),
    fetch(urls.baselineManifest, { cache: 'no-store' }).then((response) => {
      if (!response.ok) {
        throw new Error(
          `Climate authored baseline manifest failed with ${response.status}.`,
        );
      }
      return response.json();
    }),
    exrLoader.loadAsync(urls.skyTones),
    exrLoader.loadAsync(urls.cloudTones),
    textureLoader.loadAsync(urls.distantClouds),
    textureLoader.loadAsync(urls.ceilingNoise),
    textureLoader.loadAsync(urls.flowNoise),
    textureLoader.loadAsync(urls.flowVariation),
    textureLoader.loadAsync(urls.horizonShift),
    textureLoader.loadAsync(urls.stageGrid),
    ...layerUrls.map((url) => textureLoader.loadAsync(url)),
  ]);
  const authoredBaselineEntries = baselineMatrix(authoredBaselineManifest);
  configureAtlas(skyTones);
  configureAtlas(cloudTones);
  configureColorTexture(distantClouds, { repeatY: false });
  configureColorTexture(ceilingNoise);
  configureColorTexture(flowNoise);
  configureColorTexture(flowVariation);
  configureColorTexture(horizonShift);
  configureColorTexture(stageGrid);
  cloudLayers.forEach((map) => configureColorTexture(map, { repeatY: false }));

  const controls = {
    elapsed: uniform(0),
    rowBlend: uniform(0),
    skyRowA: uniform(atlasStorageV(0, SKY_ATLAS.height)),
    skyRowB: uniform(atlasStorageV(1, SKY_ATLAS.height)),
    skyShiftA: uniform(new THREE.Vector2()),
    skyShiftB: uniform(new THREE.Vector2(0.25, 0.06)),
    cloudRowA: uniform(atlasStorageV(0, CLOUD_ATLAS.height)),
    cloudRowB: uniform(atlasStorageV(1, CLOUD_ATLAS.height)),
    ceilingLow: uniform(0.3),
    ceilingHigh: uniform(0.6),
    ceilingAmount: uniform(0),
    ceilingTint: uniform(new THREE.Vector3(0.5, 0.5, 0.5)),
    backgroundCloudAmount: uniform(1),
    cloudVisibility: uniform(1),
    cloudFlows: CLOUD_FLOW.map(() => uniform(1)),
    windSpeed: uniform(1),
    atmosphereTint: uniform(new THREE.Vector3()),
    atmosphereStrength: uniform(0),
    atmosphereHeightFalloff: uniform(1),
    atmosphereMaxDistance: uniform(ATMOSPHERE_MAX_DISTANCE_METERS[0]),
    atmosphereDistanceFalloff: uniform(ATMOSPHERE_DISTANCE_FALLOFF),
    atmosphereSunwardLimit: uniform(ATMOSPHERE_SUNWARD_STRENGTH),
    sunDirection: uniform(new THREE.Vector3(...SUN_DIRECTION_PHASE[0])),
    stageLightTint: uniform(new THREE.Vector3(...SKY_LIGHT_TINT[0])),
    stageLightIntensity: uniform(SKY_LIGHT_INTENSITY[0]),
    directLightIntensity: uniform(1),
    diagnosticSkyTint: uniform(new THREE.Vector3(...DIAGNOSTIC_SKY_TINT[0])),
    diagnosticSkyTintMix: uniform(DIAGNOSTIC_SKY_TINT_MIX[0]),
    depthFogAmount: uniform(0),
    depthFogTint: uniform(new THREE.Vector3()),
    volumeFogAmount: uniform(0),
    volumeFogTint: uniform(new THREE.Vector3()),
  };

  const surfaceUv = uv(0);
  const viewDirection = normalize(positionWorld.sub(cameraPosition));
  const atmosphereDistance = length(positionWorld.sub(cameraPosition));
  const atmosphereDistanceAlpha = clamp(
    atmosphereDistance
      .sub(ATMOSPHERE_MIN_DISTANCE_METERS)
      .div(controls.atmosphereMaxDistance.sub(ATMOSPHERE_MIN_DISTANCE_METERS)),
    0,
    1,
  )
    .pow(controls.atmosphereDistanceFalloff)
    .mul(controls.atmosphereStrength);
  const atmosphereHeightAlpha = clamp(
    float(1).sub(viewDirection.y),
    0,
    1,
  ).pow(controls.atmosphereHeightFalloff);
  const pixelToCamera = viewDirection.negate();
  const sunwardCap = clamp(
    float(1).add(
      dot(controls.sunDirection, pixelToCamera)
        .sub(0.5)
        .mul(controls.atmosphereSunwardLimit.sub(1).div(0.5)),
    ),
    0,
    1,
  );
  const atmosphereAlpha = clamp(
    atmosphereDistanceAlpha.mul(atmosphereHeightAlpha),
    0,
    sunwardCap,
  );
  const heightNoise = texture(flowNoise)
    .sample(surfaceUv.mul(vec2(2, 8)))
    .r
    .mul(0.1)
    .mul(clamp(surfaceUv.y.sub(0.6).div(0.3), 0, 1));
  const skyBaseCurveU = float(1).sub(surfaceUv.y.add(heightNoise));
  const skyCurveUA = clamp(
    skyBaseCurveU.sub(
      texture(horizonShift)
        .sample(surfaceUv.add(vec2(controls.skyShiftA.x, 0)))
        .r
        .mul(controls.skyShiftA.y),
    ),
    0,
    1,
  )
    .mul(SKY_ATLAS.width - 1)
    .add(0.5)
    .div(SKY_ATLAS.width);
  const skyCurveUB = clamp(
    skyBaseCurveU.sub(
      texture(horizonShift)
        .sample(surfaceUv.add(vec2(controls.skyShiftB.x, 0)))
        .r
        .mul(controls.skyShiftB.y),
    ),
    0,
    1,
  )
    .mul(SKY_ATLAS.width - 1)
    .add(0.5)
    .div(SKY_ATLAS.width);
  const skyA = texture(skyTones)
    .sample(vec2(skyCurveUA, controls.skyRowA))
    .rgb;
  const skyB = texture(skyTones)
    .sample(vec2(skyCurveUB, controls.skyRowB))
    .rgb;
  let output = mix(skyA, skyB, controls.rowBlend)
    .mul(SKY_STYLE.brightness);
  output = mix(
    output,
    controls.diagnosticSkyTint,
    controls.diagnosticSkyTintMix,
  );

  const distantUv = surfaceUv
    .sub(vec2(0.5, 0.5))
    .div(vec2(1, SKY_STYLE.distantCloudStretch))
    .add(vec2(0.5, 0.5))
    .add(vec2(controls.elapsed.mul(controls.windSpeed).mul(-0.0004), 0));
  const distant = clamp(
    texture(distantClouds)
      .sample(distantUv)
      .rgb
      .mul(vec3(...SKY_STYLE.distantCloudTint))
      .mul(controls.backgroundCloudAmount)
      .mul(SKY_STYLE.distantCloudStrength),
    0,
    1,
  );
  output = output.add(distant);

  const ceilingSample = texture(ceilingNoise)
    .sample(surfaceUv.mul(SKY_STYLE.ceilingNoiseScale))
    .r;
  const ceilingDetail = texture(flowNoise)
    .sample(
      surfaceUv
        .mul(vec2(4.7, 2.3))
        .add(vec2(controls.elapsed.mul(controls.windSpeed).mul(-0.002), 0)),
    )
    .r;
  const ceilingShape = mix(ceilingSample, ceilingDetail, 0.38);
  const ceilingValue = mix(
    controls.ceilingLow,
    controls.ceilingHigh,
    ceilingShape,
  );
  const ceilingColor = vec3(ceilingValue).mul(controls.ceilingTint);
  const ceilingThreshold = float(1)
    .sub(controls.ceilingAmount)
    .mul(0.72);
  const ceilingAlpha = clamp(
    ceilingShape
      .sub(ceilingThreshold)
      .div(0.26)
      .mul(controls.ceilingAmount),
    0,
    1,
  );
  output = mix(output, ceilingColor, ceilingAlpha);
  // A sky-only diagnostic becomes a featureless color card when the full
  // world-distance fog result is applied to the dome itself. Keep enough of
  // the live ceiling/sky structure to author it; exact source captures remain
  // available through authored-baseline mode.
  const skyAtmosphereAlpha = min(atmosphereAlpha, 0.5);
  output = mix(output, controls.atmosphereTint, skyAtmosphereAlpha);
  output = mix(
    output,
    controls.depthFogTint,
    controls.depthFogAmount.mul(0.35),
  );
  output = mix(
    output,
    controls.volumeFogTint,
    controls.volumeFogAmount.mul(0.35),
  );

  const material = new MeshBasicNodeMaterial();
  material.name = 'ToonLab production climate sky';
  material.colorNode = output;
  material.side = THREE.FrontSide;
  material.depthTest = true;
  material.depthWrite = true;
  material.toneMapped = true;

  const cloudUv = uv(0);
  let cloudOutput = vec3(0);
  let cloudOpacity = float(0);
  for (let index = 0; index < CLOUD_STYLE.length; index += 1) {
    const style = CLOUD_STYLE[index];
    const layerUv = cloudUv
      .add(vec2(
        controls.elapsed.mul(controls.windSpeed).mul(-0.0005 * style.speed)
          .add(style.flowOffset * 0.0005 - style.horizontalOffset),
        style.verticalOffset,
      ))
      .sub(vec2(0.5, 0.5))
      .div(vec2(1, style.verticalStretch * style.aspect))
      .add(vec2(0.5, 0.5))
      .add(
        texture(flowNoise)
          .sample(
            cloudUv
              .mul(vec2(5, 3))
              .add(vec2(
                controls.elapsed.mul(controls.windSpeed).mul(0.0024 * 0.7),
                controls.elapsed.mul(controls.windSpeed).mul(0.009 * 0.7),
              )),
          )
          .r
          .sub(0.2)
          .mul(0.009),
      );
    const layerSample = texture(cloudLayers[index]).sample(layerUv);
    const cloudCurveU = layerSample.r
      .mul(CLOUD_ATLAS.width - 1)
      .add(0.5)
      .div(CLOUD_ATLAS.width);
    const cloudA = texture(cloudTones)
      .sample(vec2(cloudCurveU, controls.cloudRowA))
      .rgb;
    const cloudB = texture(cloudTones)
      .sample(vec2(cloudCurveU, controls.cloudRowB))
      .rgb;
    let layerColor = mix(cloudA, cloudB, controls.rowBlend).mul(style.strength);
    if (index === 0) {
      const horizonBlend = clamp(
        cloudUv.y.sub(0.75).div(0.05),
        0,
        1,
      );
      layerColor = mix(layerColor, output, horizonBlend);
    }
    const flowCurveU = fract(
      controls.elapsed
        .mul(controls.windSpeed)
        .mul(0.003)
        .add(style.flowOffset * 0.003),
    );
    const flowCurve = texture(cloudTones)
      .sample(vec2(flowCurveU, atlasStorageV(4, CLOUD_ATLAS.height)))
      .r;
    const randomFlow = min(controls.cloudFlows[index], flowCurve);
    const variedFlow = layerSample.b.sub(
      texture(flowVariation)
        .sample(layerUv.div(0.25))
        .r
        .mul(0.4)
        .mul(randomFlow),
    );
    const flowMask = float(1).sub(clamp(
      variedFlow
        .sub(randomFlow.mul(1.15).sub(0.15))
        .div(0.15),
      0,
      1,
    ));
    const layerOpacity = clamp(
      layerSample.a.mul(flowMask),
      0,
      1,
    );
    cloudOutput = index === 0
      ? layerColor
      : mix(cloudOutput, layerColor, layerOpacity);
    cloudOpacity = cloudOpacity.add(layerOpacity);
  }
  const cloudMaterial = new MeshBasicNodeMaterial();
  cloudMaterial.name = 'ToonLab production climate clouds';
  const cloudAtmosphereColor = mix(
    cloudOutput,
    controls.atmosphereTint,
    min(atmosphereAlpha, 0.75),
  );
  cloudMaterial.colorNode = mix(
    mix(
      cloudAtmosphereColor,
      controls.depthFogTint,
      controls.depthFogAmount,
    ),
    controls.volumeFogTint,
    controls.volumeFogAmount,
  );
  cloudMaterial.opacityNode = clamp(
    cloudOpacity.mul(controls.cloudVisibility),
    0,
    1,
  );
  cloudMaterial.transparent = true;
  cloudMaterial.depthTest = true;
  cloudMaterial.depthWrite = false;
  cloudMaterial.side = THREE.FrontSide;
  cloudMaterial.toneMapped = true;

  const stageSample = texture(stageGrid).sample(positionWorld.xz);
  const stageChecker = mix(
    vec3(...STAGE_SURFACE.checkerA),
    vec3(...STAGE_SURFACE.checkerB),
    float(1).sub(stageSample.g),
  );
  const stageWithLines = mix(
    vec3(...STAGE_SURFACE.line),
    stageChecker,
    float(1).sub(stageSample.r),
  );
  const stageLineFade = clamp(
    atmosphereDistance
      .sub(STAGE_SURFACE.lineFadeNearMeters)
      .div(STAGE_SURFACE.lineFadeFarMeters - STAGE_SURFACE.lineFadeNearMeters),
    0,
    1,
  );
  const stageBaseColor = mix(stageWithLines, stageChecker, stageLineFade);
  const stageDirectLight = clamp(
    dot(normalWorld, controls.sunDirection.negate()),
    0,
    1,
  ).mul(controls.directLightIntensity);
  const stageLitColor = stageBaseColor
    .mul(controls.stageLightTint)
    .mul(controls.stageLightIntensity.add(stageDirectLight.mul(0.55)));
  const stageMaterial = new MeshBasicNodeMaterial();
  stageMaterial.name = 'ToonLab production climate stage';
  const stageAtmosphereColor = mix(
    stageLitColor,
    controls.atmosphereTint,
    atmosphereAlpha,
  );
  stageMaterial.colorNode = mix(
    mix(
      stageAtmosphereColor,
      controls.depthFogTint,
      controls.depthFogAmount,
    ),
    controls.volumeFogTint,
    controls.volumeFogAmount,
  );
  stageMaterial.side = THREE.DoubleSide;
  stageMaterial.depthTest = true;
  stageMaterial.depthWrite = true;
  stageMaterial.toneMapped = true;

  const diagnosticFixtureMaterials = [
    [0.72, 0.58, 0.42],
    [0.28, 0.52, 0.4],
    [0.4, 0.48, 0.66],
  ].map((baseColor, index) => {
    const fixtureMaterial = new MeshBasicNodeMaterial();
    fixtureMaterial.name = `ToonLab atmospheric diagnostic fixture ${index + 1}`;
    const fixtureLight = controls.stageLightIntensity
      .add(stageDirectLight.mul(0.7))
      .add(0.16);
    let fixtureOutput = vec3(...baseColor)
      .mul(controls.stageLightTint)
      .mul(fixtureLight);
    fixtureOutput = mix(
      fixtureOutput,
      controls.atmosphereTint,
      atmosphereAlpha,
    );
    fixtureOutput = mix(
      fixtureOutput,
      controls.depthFogTint,
      controls.depthFogAmount,
    );
    fixtureOutput = mix(
      fixtureOutput,
      controls.volumeFogTint,
      controls.volumeFogAmount,
    );
    fixtureMaterial.colorNode = fixtureOutput;
    fixtureMaterial.depthTest = true;
    fixtureMaterial.depthWrite = true;
    fixtureMaterial.toneMapped = true;
    return fixtureMaterial;
  });

  const renderer = new WebGPURenderer({
    antialias: true,
    alpha: false,
    forceWebGL,
    preserveDrawingBuffer: true,
  });
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.toneMapping = CLIMATE_TONE_MAPPING;
  renderer.toneMappingExposure = 1;
  await renderer.init();
  renderer.library.addToneMapping(
    createClimateToneMapping(film, { outputTransfer: CLIMATE_DISPLAY_OUTPUT }),
    CLIMATE_TONE_MAPPING,
  );

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CLIMATE_VIEW.fieldOfViewDegrees,
    CLIMATE_VIEW.aspect,
    0.05,
    CLIMATE_VIEW.far,
  );
  camera.position.fromArray(CLIMATE_VIEW.position);
  camera.up.fromArray(CLIMATE_VIEW.up);
  camera.lookAt(camera.position.clone().add(
    new THREE.Vector3().fromArray(CLIMATE_VIEW.forward),
  ));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);

  const stageRoot = comparisonStage.scene;
  const ground = stageRoot.getObjectByName(STAGE_NODES.ground);
  const skyRoot = stageRoot.getObjectByName(STAGE_NODES.sky);
  const cloudRoot = stageRoot.getObjectByName(STAGE_NODES.clouds);
  if (!ground?.isMesh || !skyRoot?.isMesh || !cloudRoot?.isMesh) {
    throw new Error('The authored climate comparison stage is incomplete.');
  }
  const baselinePlaceholder = new THREE.DataTexture(
    new Uint8Array([0, 0, 0, 255]),
    1,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  configureColorTexture(baselinePlaceholder, { repeatY: false });
  const baselineTextureNode = texture(baselinePlaceholder);
  const baselineSkyMaterial = new MeshBasicNodeMaterial();
  baselineSkyMaterial.name = 'ToonLab authored climate view baseline';
  baselineSkyMaterial.colorNode = baselineTextureNode.sample(screenUV).rgb;
  baselineSkyMaterial.side = THREE.FrontSide;
  baselineSkyMaterial.depthTest = true;
  baselineSkyMaterial.depthWrite = true;
  baselineSkyMaterial.toneMapped = false;

  const ringRoot = stageRoot.getObjectByName(STAGE_NODES.ring);
  const celestials = {
    moon: stageRoot.getObjectByName(STAGE_NODES.moon),
    sun: stageRoot.getObjectByName(STAGE_NODES.sun),
  };
  const visibleStageMeshes = new Set([
    ground,
    skyRoot,
    cloudRoot,
    ...Object.values(celestials).filter(Boolean),
  ]);
  const stageResources = new Set();
  stageRoot.traverse((object) => {
    if (object.isLight) object.visible = false;
    if (!object.isMesh) return;
    if (!visibleStageMeshes.has(object)) object.visible = false;
    stageResources.add(object.geometry);
    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    for (const objectMaterial of objectMaterials) {
      if (!objectMaterial) continue;
      stageResources.add(objectMaterial);
      for (const value of Object.values(objectMaterial)) {
        if (value?.isTexture) stageResources.add(value);
      }
    }
    object.castShadow = false;
    object.receiveShadow = false;
    object.frustumCulled = false;
  });

  ground.material = stageMaterial;
  ground.renderOrder = 0;

  skyRoot.material = material;
  skyRoot.renderOrder = -1000;

  cloudRoot.material = cloudMaterial;
  cloudRoot.renderOrder = -999;

  if (ringRoot) ringRoot.visible = false;
  for (const object of Object.values(celestials)) {
    if (!object) continue;
    const sourceMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];
    const clonedMaterials = sourceMaterials.map((sourceMaterial) => {
      const cloned = sourceMaterial.clone();
      cloned.transparent = true;
      stageResources.add(cloned);
      return cloned;
    });
    object.material = Array.isArray(object.material)
      ? clonedMaterials
      : clonedMaterials[0];
    object.visible = false;
  }
  scene.add(stageRoot);

  // The licensed sky-overview camera contains no nearby subject, so full
  // overcast and volumetric-fog conditions legitimately collapse its native
  // capture to a flat field. These neutral forms make the live authoring mode
  // useful by exposing near/mid/far visibility without entering the portable
  // condition document or the immutable native reference frames.
  const referenceRoot = new THREE.Group();
  referenceRoot.name = 'ToonLab atmospheric diagnostic depth stage';
  const referenceFixtures = [
    new THREE.Mesh(
      new THREE.BoxGeometry(8, 14, 8),
      diagnosticFixtureMaterials[0],
    ),
    new THREE.Mesh(
      new THREE.SphereGeometry(9, 32, 18),
      diagnosticFixtureMaterials[1],
    ),
    new THREE.Mesh(
      new THREE.ConeGeometry(11, 24, 8),
      diagnosticFixtureMaterials[2],
    ),
  ];
  referenceFixtures[0].position.set(60, 7, 54);
  referenceFixtures[1].position.set(43, 9, 14);
  referenceFixtures[2].position.set(-27, 12, 2);
  for (const fixture of referenceFixtures) {
    fixture.castShadow = false;
    fixture.receiveShadow = false;
    fixture.frustumCulled = false;
    fixture.renderOrder = 2;
    referenceRoot.add(fixture);
    stageResources.add(fixture.geometry);
  }
  scene.add(referenceRoot);

  const rain = new RainFieldRenderer();
  rain.setEnabled(effectsEnabled);
  scene.add(rain);
  const effects = new AtmosphericEffectsRenderer();
  effects.setEnabled(effectsEnabled);
  scene.add(effects);

  container.style.position = 'relative';
  renderer.domElement.className = 'climate-render-surface';
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  container.append(renderer.domElement);

  const effectsCanvas = document.createElement('canvas');
  effectsCanvas.className = 'climate-effects-surface';
  effectsCanvas.hidden = !effectsEnabled;
  effectsCanvas.style.position = 'absolute';
  effectsCanvas.style.inset = '0';
  effectsCanvas.style.pointerEvents = 'none';
  container.append(effectsCanvas);

  let instance;
  const resizeObserver = new ResizeObserver(() => instance?.resize());
  instance = new ClimateRenderer({
    container,
    renderer,
    scene,
    camera,
    material,
    controls,
    rain,
    effects,
    effectsCanvas,
    effectsEnabled,
    resizeObserver,
    authoredBaseline: {
      activeKey: null,
      celestials,
      entries: authoredBaselineEntries,
      ground,
      inflight: new Map(),
      referenceRoot,
      skyRoot,
      cloudRoot,
      skyMaterial: baselineSkyMaterial,
      dynamicCloudMaterial: cloudMaterial,
      textureLoader,
      textureNode: baselineTextureNode,
      textures: new Map(),
    },
    useAuthoredBaselines: authoredBaselines,
    resources: [
      ...stageResources,
      rain,
      effects,
      cloudMaterial,
      ...diagnosticFixtureMaterials,
      baselinePlaceholder,
      baselineSkyMaterial,
      stageMaterial,
      skyTones,
      cloudTones,
      distantClouds,
      ceilingNoise,
      flowNoise,
      flowVariation,
      horizonShift,
      stageGrid,
      ...cloudLayers,
    ],
  });
  resizeObserver.observe(container);
  instance.resize();
  return instance;
}
