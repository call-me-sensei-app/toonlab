// TSL port of src/shaders/waterSplashDroplets.*.glsl + waterSplashSheets.*.glsl
// — the splash droplet points and the spray-crown / foam-ring sheets.
//
// WGSL has no gl_PointSize, so the droplet POINTS become instanced billboard
// quads whose clip-space offset reproduces the GLSL pixel math exactly — the
// dust-motes pattern from environmentRigs (docs/tsl-conventions.md). The quad
// uv is flipped to gl_PointCoord orientation (y grows downward) so the
// off-center highlight lands identically.
//
// Sheets keep their instanced-quad geometry; the material factory can adopt
// the owning surface material's uWavesA/uWavesB uniform NODES (`waves`
// option) — the TSL equivalent of WaterSplashSystem.attachWaveUniforms's
// by-reference sharing, which rebuilds this material before first render.

import * as THREE from 'three';
import {
  abs,
  atan,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  Discard,
  float,
  Fn,
  fract,
  If,
  length,
  max,
  min,
  mix,
  modelWorldMatrix,
  normalize,
  positionGeometry,
  pow,
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

import { waterFbm, waterToonStep, waterValueNoise } from './chunks/water-common.js';
import { createWaterWavesChunk } from './chunks/water-waves.js';
import { resolveWaterArrayUniformNode } from './water.js';

// ---------------------------------------------------------------------------
// Droplets — ballistic particles, billboard quads standing in for points.
// ---------------------------------------------------------------------------

export function createWaterSplashDropletsNodeMaterial() {
  const u = {
    uTime: uniform(0),
    uPixelRatio: uniform(1),
    uPointScale: uniform(540),
    uDropletColor: uniform(new THREE.Color(1, 1, 1)),
    uHighlightColor: uniform(new THREE.Color(1, 1, 1)),
  };

  const material = new NodeMaterial();
  material.name = 'WaterSplashDroplets';
  material.lights = false;
  material.fog = false;
  material.transparent = true;
  material.depthWrite = false;

  const vLife = varying(float(), 'vDropletLife');
  const vSeed = varying(float(), 'vDropletSeed');

  material.vertexNode = Fn(() => {
    const aSpawnOrigin = attribute('aSpawnOrigin', 'vec3');
    const aVelocity = attribute('aVelocity', 'vec3');
    // aInfo = (spawnTime, life, size, seed)
    const aInfo = attribute('aInfo', 'vec4');

    const age = u.uTime.sub(aInfo.x).toVar();
    const life = max(aInfo.y, 1e-3).toVar();
    const t = age.div(life).toVar();
    vLife.assign(t);
    vSeed.assign(aInfo.w);

    // Dead particles collapse off-clip exactly like the GLSL early return.
    const clipPosition = vec4(8.0, 8.0, 8.0, 1.0).toVar();
    If(t.greaterThan(0.0).and(t.lessThan(1.0)), () => {
      const localPosition = aSpawnOrigin.add(aVelocity.mul(age)).toVar();
      localPosition.y.subAssign(age.mul(age).mul(4.905));

      // Sink out once a droplet falls back through the surface (local y = 0).
      const submergeFade = smoothstep(-0.3, -0.06, localPosition.y);

      const mvPosition = cameraViewMatrix.mul(modelWorldMatrix).mul(vec4(localPosition, 1.0)).toVar();
      const sizeCurve = smoothstep(0.0, 0.1, t).mul(smoothstep(0.5, 1.0, t).mul(0.55).oneMinus());
      // gl_PointSize equivalent, in device pixels.
      const pixels = aInfo.z.mul(sizeCurve).mul(submergeFade).mul(u.uPointScale).mul(u.uPixelRatio)
        .div(max(mvPosition.z.negate(), 0.1)).toVar();
      clipPosition.assign(cameraProjectionMatrix.mul(mvPosition));
      // plane(1,1) local xy spans [-0.5, 0.5] → full quad = `pixels` px, the
      // same square gl_PointSize would rasterize (dust-motes pattern).
      clipPosition.xy.addAssign(
        positionGeometry.xy.mul(pixels).mul(float(2.0).div(viewportSize)).mul(clipPosition.w),
      );
    });
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    // gl_PointCoord replacement: quad uv with y flipped (PointCoord y grows
    // downward), remapped to [-1, 1].
    const point = vec2(uv().x, uv().y.oneMinus()).mul(2.0).sub(1.0).toVar();
    const radius = length(point).toVar();
    Discard(radius.greaterThan(1.0));

    const body = smoothstep(0.72, 1.0, radius).oneMinus();
    // Bright white core with a cool tinted edge; highlight spot sits up-left.
    const color = mix(u.uHighlightColor, u.uDropletColor, smoothstep(0.3, 0.95, radius)).toVar();
    const highlight = smoothstep(0.1, 0.5, length(point.sub(vec2(-0.32, -0.34)))).oneMinus();
    color.assign(mix(color, vec3(1.0), step(0.5, highlight).mul(0.6)));

    const fade = smoothstep(0.58, 1.0, vLife).oneMinus();
    const alpha = body.mul(fade).mul(fract(vSeed.mul(7.31)).mul(0.18).add(0.82)).toVar();
    Discard(alpha.lessThan(0.02));

    return vec4(color, alpha);
  })();

  material.uniforms = u;
  material.userData.isToonNodeMaterial = true;
  return material;
}

// ---------------------------------------------------------------------------
// Sheets — spray crown (kind 0, cylindrically billboarded) and foam ring
// (kind 1, hugging the surface).
// ---------------------------------------------------------------------------

/**
 * options.waves     null | { wavesA, wavesB, waveCount } — the owning surface
 *                   material's wave uniform nodes (WATER_SHEET_WAVES analog).
 * options.previous  uniform-node map of a previous sheet material; uniforms
 *                   are reused so values persist across the rebuild.
 */
export function createWaterSplashSheetsNodeMaterial({ waves = null, previous = null } = {}) {
  const u = {
    uTime: uniform(0),
    uSprayColor: uniform(new THREE.Color(1, 1, 1)),
    uSprayShadeColor: uniform(new THREE.Color(0.7, 0.9, 1)),
  };
  if (previous) {
    for (const name of Object.keys(u)) {
      if (previous[name]) u[name] = previous[name];
    }
  }

  const waveChunk = waves
    ? createWaterWavesChunk({
      wavesA: resolveWaterArrayUniformNode(waves.wavesA),
      wavesB: resolveWaterArrayUniformNode(waves.wavesB),
      waveCount: waves.waveCount,
    })
    : null;

  const material = new NodeMaterial();
  material.name = 'WaterSplashSheets';
  material.lights = false;
  material.fog = false;
  material.transparent = true;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;

  const vLocal = varying(vec2(), 'vSheetLocal');
  const vLife = varying(float(), 'vSheetLife');
  const vSeed = varying(float(), 'vSheetSeed');
  const vKind = varying(float(), 'vSheetKind');

  material.vertexNode = Fn(() => {
    const iOrigin = attribute('iOrigin', 'vec3');
    // iInfo = (spawnTime, life, scale, seed)
    const iInfo = attribute('iInfo', 'vec4');
    const iKind = attribute('iKind', 'float');
    const iSurface = attribute('iSurface', 'float');

    const age = u.uTime.sub(iInfo.x).toVar();
    const life = max(iInfo.y, 1e-3).toVar();
    const t = age.div(life).toVar();
    vLife.assign(t);
    vSeed.assign(iInfo.w);
    vKind.assign(iKind);
    vLocal.assign(vec2(0.0));

    const clipPosition = vec4(8.0, 8.0, 8.0, 1.0).toVar();
    If(t.greaterThan(0.0).and(t.lessThan(1.0)), () => {
      const scale = iInfo.z.toVar();
      const originWorld = modelWorldMatrix.mul(vec4(iOrigin, 1.0)).toVar();
      const worldOffset = vec3(0.0).toVar();

      If(iKind.lessThan(0.5), () => {
        // Spray crown: anchored at the waterline, cylindrically billboarded.
        vLocal.assign(vec2(positionGeometry.x.mul(2.0), positionGeometry.y.add(0.5)));
        const toCamera = cameraPosition.sub(originWorld.xyz);
        const right = normalize(vec3(toCamera.z.negate(), 0.0, toCamera.x).add(vec3(1e-5, 0.0, 0.0)));
        const pop = sin(min(t.mul(1.25), 1.0).mul(3.14159265));
        const width = scale.mul(smoothstep(0.0, 0.7, t).mul(0.66).add(0.58));
        const height = scale.mul(pop.mul(0.92).add(0.38));
        worldOffset.assign(right.mul(vLocal.x.mul(0.5).mul(width)).add(vec3(0.0, vLocal.y.mul(height), 0.0)));
      }).Else(() => {
        // Foam ring: hugs the surface; the ring radius animates in the fragment.
        vLocal.assign(vec2(positionGeometry.x, positionGeometry.y).mul(2.0));
        worldOffset.assign(vec3(vLocal.x, 0.0, vLocal.y.negate()).mul(scale).mul(1.25).add(vec3(0.0, 0.02, 0.0)));
      });

      const worldPosition = vec4(originWorld).toVar();
      worldPosition.xyz.addAssign(worldOffset);

      if (waveChunk) {
        If(iKind.greaterThan(0.5), () => {
          // Drape the ring over the swell: offset each vertex by the wave
          // height difference from the (CPU-anchored) center, scaled by the
          // local wave motion so rings flatten in the surf zone.
          const waveDelta = waveChunk.gerstnerDisplacement(worldPosition.xz, u.uTime).y
            .sub(waveChunk.gerstnerDisplacement(originWorld.xz, u.uTime).y);
          worldPosition.y.addAssign(waveDelta.mul(iSurface));
        });
      }

      clipPosition.assign(cameraProjectionMatrix.mul(cameraViewMatrix).mul(worldPosition));
    });
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    const alpha = float(0.0).toVar();
    const color = vec3(u.uSprayColor).toVar();

    If(vKind.lessThan(0.5), () => {
      // Spray crown: a fan of noisy vertical streaks that erode away upward.
      const x = vLocal.x.toVar();
      const y = vLocal.y.toVar();
      const noise = waterFbm(vec2(x.mul(3.1).add(vSeed.mul(17.0)), y.mul(2.2).sub(vLife.mul(3.4))), 3).toVar();
      const streaks = waterValueNoise(vec2(x.mul(7.5).add(vSeed.mul(29.0)), y.mul(1.1).sub(vLife.mul(2.2)))).toVar();
      const profile = x.mul(x).mul(0.72).oneMinus().mul(noise.sub(0.35).mul(0.62).add(0.5)).toVar();
      const body = smoothstep(profile, profile.sub(0.3), y)
        .mul(smoothstep(1.0, 0.55, abs(x)))
        .mul(smoothstep(0.28, 0.62, streaks.add(y.oneMinus().mul(0.25))));

      const speckle = step(0.84, waterValueNoise(
        vec2(x.mul(10.0), y.mul(8.0).sub(vLife.mul(7.0))).add(vSeed.mul(23.0)),
      ));
      const crownEdge = smoothstep(profile.sub(0.34), profile.sub(0.06), y);

      const fadeIn = smoothstep(0.0, 0.08, vLife);
      const fadeOut = smoothstep(0.45, 0.95, vLife).oneMinus();
      alpha.assign(clamp01(max(body, speckle.mul(crownEdge))).mul(fadeIn).mul(fadeOut));

      const shade = waterToonStep(0.5, 0.12, noise.add(y.mul(0.5)));
      color.assign(mix(u.uSprayShadeColor, u.uSprayColor, shade));
    }).Else(() => {
      // Foam ring: expanding annulus that thins and dissolves into dashes.
      const radius = length(vLocal).toVar();
      const angle = atan(vLocal.y, vLocal.x).toVar();
      const ringRadius = mix(0.14, 0.94, pow(vLife.oneMinus(), 2.3).oneMinus()).toVar();
      const ringWidth = mix(0.3, 0.05, vLife).toVar();
      const band = smoothstep(0.0, ringWidth, abs(radius.sub(ringRadius))).oneMinus().toVar();

      const breakup = waterValueNoise(
        vec2(angle.mul(2.4), radius.mul(2.0)).mul(2.2).add(vSeed.mul(11.0)).add(vLife.mul(1.2)),
      );
      band.mulAssign(smoothstep(0.28, 0.5, breakup.add(vLife.oneMinus().mul(0.4))));

      alpha.assign(waterToonStep(0.3, 0.18, band).mul(smoothstep(0.55, 1.0, vLife).oneMinus()).mul(0.85));
      color.assign(mix(u.uSprayShadeColor, u.uSprayColor, waterToonStep(0.5, 0.2, band)));
    });

    Discard(alpha.lessThan(0.02));
    return vec4(color, alpha);
  })();

  material.uniforms = u;
  material.userData.isToonNodeMaterial = true;
  if (waves) {
    // Mirror the classic post-attach uniform surface: the shared wave entries
    // appear under their GLSL names (same objects as the owning surface).
    u.uWavesA = waves.wavesA;
    u.uWavesB = waves.wavesB;
    material.defines = { WATER_WAVE_COUNT: waves.waveCount, WATER_SHEET_WAVES: 1 };
  }
  return material;
}

// clamp(x, 0, 1) helper local to the crown body (keeps the GLSL clamp shape).
function clamp01(node) {
  return node.clamp(0.0, 1.0);
}
