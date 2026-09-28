// Compatibility low-level emitter retained for existing direct consumers.
// First-party WeatherSystem and lab previews use WeatherFieldRenderer, whose
// separate rain, flake/pellet/dust, mist, wind, splash, and electrical fields
// preserve the complete ToonLab weather topology.

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  Discard,
  float,
  Fn,
  fract,
  length,
  max,
  mix,
  mod,
  positionGeometry,
  sin,
  smoothstep,
  step,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  viewportSize,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { createWeatherSettings } from './weatherSettings.js';

export const WEATHER_PRECIPITATION_KIND = Object.freeze({
  rain: 0,
  snow: 1,
  sleet: 2,
  hail: 3,
  dust: 4,
  none: 0,
});

function mulberry32(seed) {
  let state = (Math.trunc(seed) || 1) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function createWeatherPrecipitationMaterial(settings = {}) {
  const normalized = createWeatherSettings({ precipitation: settings }).precipitation;
  const u = {
    uArea: uniform(new THREE.Vector2(normalized.areaSize * 0.5, normalized.areaSize * 0.5)),
    uCenter: uniform(new THREE.Vector3()),
    uColor: uniform(new THREE.Color().setRGB(...normalized.color, THREE.SRGBColorSpace)),
    uFallHeight: uniform(normalized.fallHeight),
    uKind: uniform(WEATHER_PRECIPITATION_KIND[normalized.type] ?? 0),
    uOpacity: uniform(normalized.opacity),
    uPixelRatio: uniform(1),
    uPointScale: uniform(540),
    uSize: uniform(normalized.size),
    uSpeed: uniform(normalized.speed),
    uStreakLength: uniform(normalized.streakLength),
    uTime: uniform(0),
    uWind: uniform(new THREE.Vector2()),
    uWindStrength: uniform(0),
  };

  const material = new NodeMaterial();
  material.name = 'WeatherPrecipitation';
  material.transparent = true;
  material.depthWrite = false;
  material.fog = false;
  material.lights = false;
  material.side = THREE.DoubleSide;

  const vFade = varying(float(), 'vWeatherFade');
  const vKind = varying(float(), 'vWeatherKind');

  material.vertexNode = Fn(() => {
    const seed = attribute('aWeatherSeed', 'vec4');
    const kind = u.uKind.toVar();
    const isSnow = step(0.5, kind).mul(step(kind, 1.49)).toVar();
    const isSleet = step(1.5, kind).mul(step(kind, 2.49)).toVar();
    const isHail = step(2.5, kind).mul(step(kind, 3.49)).toVar();
    const isDust = step(3.5, kind).toVar();
    const fallSpeed = u.uSpeed.mul(seed.w.mul(0.45).add(0.78)).toVar();
    const cycle = u.uFallHeight.div(max(fallSpeed, 0.01)).toVar();
    const time = mod(u.uTime.add(seed.z.mul(cycle)), cycle).toVar();
    const fallingY = u.uFallHeight.sub(fallSpeed.mul(time)).toVar();
    const risingY = mod(seed.z.mul(u.uFallHeight).add(time.mul(fallSpeed).mul(0.35)), u.uFallHeight);
    const y = mix(fallingY, risingY, isDust).toVar();

    const wind = u.uWind.mul(u.uWindStrength).toVar();
    const xz = seed.xy.mul(2).sub(1).mul(u.uArea).add(wind.mul(time)).toVar();
    const swirlPhase = u.uTime.mul(mix(0.5, 2.2, seed.w)).add(seed.z.mul(41)).toVar();
    const snowSway = vec2(sin(swirlPhase), sin(swirlPhase.mul(0.73).add(2.1)))
      .mul(u.uSize.mul(5)).mul(isSnow.add(isDust.mul(1.7)));
    xz.addAssign(snowSway);
    xz.assign(mod(xz.add(u.uArea), u.uArea.mul(2)).sub(u.uArea));

    const worldPosition = u.uCenter.add(vec3(xz.x, y, xz.y)).toVar();
    const mvPosition = cameraViewMatrix.mul(vec4(worldPosition, 1)).toVar();
    vFade.assign(smoothstep(0, 0.7, y)
      .mul(smoothstep(u.uFallHeight.mul(0.82), u.uFallHeight, y).oneMinus()));
    vKind.assign(kind);

    const streakKind = clamp(isSleet.add(step(kind, 0.49)), 0, 1);
    const visibleSize = mix(u.uSize, u.uStreakLength, streakKind).toVar();
    const pixels = visibleSize.mul(u.uPointScale).mul(u.uPixelRatio)
      .div(max(mvPosition.z.negate(), 0.5)).toVar();
    const clipPosition = cameraProjectionMatrix.mul(mvPosition).toVar();
    clipPosition.xy.addAssign(
      positionGeometry.xy.mul(pixels).mul(float(2).div(viewportSize)).mul(clipPosition.w),
    );
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    const point = uv().mul(2).sub(1).toVar();
    const radius = length(point).toVar();
    const bar = smoothstep(0.06, 0.2, abs(point.x)).oneMinus()
      .mul(smoothstep(0.66, 1, abs(point.y)).oneMinus());
    const circle = smoothstep(0.62, 1, radius).oneMinus();
    const axisA = smoothstep(0.05, 0.16, abs(point.x)).oneMinus();
    const axisB = smoothstep(0.05, 0.16, abs(point.y)).oneMinus();
    const diagonal = smoothstep(0.04, 0.14, abs(abs(point.x).sub(abs(point.y)))).oneMinus();
    const flake = clamp(axisA.add(axisB).add(diagonal).mul(circle), 0, 1);
    const dust = smoothstep(0.25, 1, radius).oneMinus().mul(0.5);

    const isSnow = step(0.5, vKind).mul(step(vKind, 1.49));
    const isSleet = step(1.5, vKind).mul(step(vKind, 2.49));
    const isHail = step(2.5, vKind).mul(step(vKind, 3.49));
    const isDust = step(3.5, vKind);
    let mask = bar.toVar();
    mask.assign(mix(mask, flake, isSnow));
    mask.assign(mix(mask, mix(bar, circle, 0.42), isSleet));
    mask.assign(mix(mask, circle, isHail));
    mask.assign(mix(mask, dust, isDust));
    const alpha = mask.mul(u.uOpacity).mul(vFade).toVar();
    Discard(alpha.lessThan(0.015));
    return vec4(u.uColor, alpha);
  })();

  material.uniforms = u;
  material.userData.isToonNodeMaterial = true;
  return material;
}

export class WeatherPrecipitation extends THREE.Mesh {
  constructor({ maxParticles = 8000, seed = 1, settings = {} } = {}) {
    const normalized = createWeatherSettings({ precipitation: { ...settings, maxParticles } }).precipitation;
    const capacity = Math.max(100, Math.round(normalized.maxParticles));
    const quad = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.index = quad.index;
    geometry.setAttribute('position', quad.attributes.position);
    geometry.setAttribute('uv', quad.attributes.uv);
    const seeds = new Float32Array(capacity * 4);
    const random = mulberry32(seed);
    for (let index = 0; index < capacity * 4; index += 1) seeds[index] = random();
    geometry.setAttribute('aWeatherSeed', new THREE.InstancedBufferAttribute(seeds, 4));
    geometry.instanceCount = 0;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    quad.dispose();

    super(geometry, createWeatherPrecipitationMaterial(normalized));
    this.name = 'WeatherPrecipitation';
    this.capacity = capacity;
    this.frustumCulled = false;
    this.renderOrder = 50;
    this.userData.environmentShaderExclude = true;
    this.userData.waterExclude = true;
    this.settings = normalized;
    this.applySettings(normalized);
  }

  applySettings(settings = {}, wind = {}) {
    const normalized = createWeatherSettings({ precipitation: { ...this.settings, ...settings } }).precipitation;
    this.settings = normalized;
    const u = this.material.uniforms;
    u.uArea.value.setScalar(normalized.areaSize * 0.5);
    u.uColor.value.setRGB(...normalized.color, THREE.SRGBColorSpace);
    u.uFallHeight.value = normalized.fallHeight;
    u.uKind.value = WEATHER_PRECIPITATION_KIND[normalized.type] ?? 0;
    u.uOpacity.value = normalized.opacity * (0.35 + normalized.intensity * 0.65);
    u.uSize.value = normalized.size;
    u.uSpeed.value = normalized.speed;
    u.uStreakLength.value = normalized.streakLength;
    if (Array.isArray(wind.direction)) u.uWind.value.set(wind.direction[0], wind.direction[1]);
    if (Number.isFinite(wind.strength)) u.uWindStrength.value = wind.strength;
    this.geometry.instanceCount = normalized.type === 'none'
      ? 0
      : Math.min(this.capacity, Math.round(this.capacity * normalized.intensity));
    this.visible = this.geometry.instanceCount > 0;
    return this;
  }

  update(delta, { center, renderer } = {}) {
    const u = this.material.uniforms;
    u.uTime.value += Math.min(Math.max(Number(delta) || 0.016, 0), 0.1);
    if (center) u.uCenter.value.copy(center);
    if (renderer) {
      u.uPixelRatio.value = renderer.getPixelRatio?.() ?? 1;
      u.uPointScale.value = (renderer.domElement?.clientHeight || 540) * 0.9;
    }
    return this;
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
