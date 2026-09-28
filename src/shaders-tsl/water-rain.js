// TSL port of src/shaders/waterRain.vert.glsl + waterRain.frag.glsl —
// GPU-looping rain streak particles. Each particle owns a static seed; its
// full trajectory is derived from time, so rain runs forever with zero
// per-frame buffer writes.
//
// WGSL has no gl_PointSize, so the streak POINTS become instanced billboard
// quads with the exact pixel-size math in clip space (dust-motes pattern,
// docs/tsl-conventions.md). The quad uv is flipped to gl_PointCoord
// orientation for the bar shape (symmetric here, kept for exactness).

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraProjectionMatrix,
  cameraViewMatrix,
  Discard,
  float,
  Fn,
  max,
  mod,
  positionGeometry,
  smoothstep,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  viewportSize,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

export function createWaterRainNodeMaterial({
  areaSize = 30,
  fallHeight = 16,
  speed = 16,
  streakLength = 0.42,
  wind = [2.2, 0.8],
  color = [0.8, 0.88, 0.95],
  opacity = 0.34,
} = {}) {
  const u = {
    uTime: uniform(0),
    uCenter: uniform(new THREE.Vector3()),
    uArea: uniform(new THREE.Vector2(areaSize * 0.5, areaSize * 0.5)),
    uFallHeight: uniform(fallHeight),
    uSpeed: uniform(speed),
    uWind: uniform(new THREE.Vector2(wind[0], wind[1])),
    uStreakLength: uniform(streakLength),
    uPointScale: uniform(540),
    uPixelRatio: uniform(1),
    uColor: uniform(new THREE.Color().setRGB(color[0], color[1], color[2], THREE.SRGBColorSpace)),
    uOpacity: uniform(opacity),
  };

  const material = new NodeMaterial();
  material.name = 'WaterRain';
  material.lights = false;
  material.fog = false;
  material.transparent = true;
  material.depthWrite = false;

  const vFade = varying(float(), 'vRainFade');

  material.vertexNode = Fn(() => {
    // aSeed = (unitX, unitZ, phase, jitter)
    const aSeed = attribute('aSeed', 'vec4');

    const speedValue = u.uSpeed.mul(aSeed.w.mul(0.5).add(0.75)).toVar();
    const cycle = u.uFallHeight.div(speedValue).toVar();
    const t = mod(u.uTime.add(aSeed.z.mul(cycle)), cycle).toVar();
    const y = u.uFallHeight.sub(speedValue.mul(t)).toVar();

    const xz = aSeed.xy.mul(2.0).sub(1.0).mul(u.uArea).add(u.uWind.mul(t)).toVar();
    xz.assign(mod(xz.add(u.uArea), u.uArea.mul(2.0)).sub(u.uArea));

    const worldPosition = u.uCenter.add(vec3(xz.x, y, xz.y)).toVar();
    const mvPosition = cameraViewMatrix.mul(vec4(worldPosition, 1.0)).toVar();

    vFade.assign(smoothstep(0.0, 0.5, y)
      .mul(smoothstep(u.uFallHeight.mul(0.85), u.uFallHeight, y).oneMinus()));

    // gl_PointSize equivalent, in device pixels.
    const pixels = u.uStreakLength.mul(u.uPointScale).mul(u.uPixelRatio)
      .div(max(mvPosition.z.negate(), 0.5)).toVar();
    const clipPosition = cameraProjectionMatrix.mul(mvPosition).toVar();
    clipPosition.xy.addAssign(
      positionGeometry.xy.mul(pixels).mul(float(2.0).div(viewportSize)).mul(clipPosition.w),
    );
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    // gl_PointCoord replacement (y flipped), remapped to [-1, 1].
    const point = vec2(uv().x, uv().y.oneMinus()).mul(2.0).sub(1.0).toVar();
    const bar = smoothstep(0.05, 0.18, abs(point.x)).oneMinus()
      .mul(smoothstep(0.65, 1.0, abs(point.y)).oneMinus());
    const alpha = bar.mul(u.uOpacity).mul(vFade).toVar();
    Discard(alpha.lessThan(0.02));
    return vec4(u.uColor, alpha);
  })();

  material.uniforms = u;
  material.userData.isToonNodeMaterial = true;
  return material;
}
