// TSL port of src/shaders/chunks/stylized-cloud-shadow.glsl — scrolling
// procedural cloud shadows for outdoor stylized scenes. A cheap 3-octave
// value-noise fbm (same rotation/lacunarity family as the sky's cloud fbm)
// sampled in world XZ and drifted by a velocity. Pure functions — callers
// pass their own uniforms, so grass, tree canopies, terrain, and any future
// surface share one implementation without colliding uniform names.

import {
  clamp,
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  mix,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';

export const cloudShadowHash = /*@__PURE__*/ Fn(([p]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

export const cloudShadowNoise = /*@__PURE__*/ Fn(([p]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2.0).add(3.0));
  const a = cloudShadowHash(i);
  const b = cloudShadowHash(i.add(vec2(1.0, 0.0)));
  const c = cloudShadowHash(i.add(vec2(0.0, 1.0)));
  const d = cloudShadowHash(i.add(vec2(1.0, 1.0)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

/**
 * GLSL stylizedCloudShadow(worldXZ, time, strength, coverage, scale,
 * velocity): sunlight visibility factor in [1 - strength, 1]. strength below
 * 0.001 short-circuits to fully lit (same If shape as the GLSL early return,
 * so the fbm costs nothing while disabled).
 */
export const stylizedCloudShadow = /*@__PURE__*/ Fn(([worldXZ, time, strength, coverage, scale, velocity]) => {
  const visibility = float(1.0).toVar();
  If(strength.greaterThanEqual(0.001), () => {
    const uv = worldXZ.mul(scale).add(velocity.mul(time)).toVar();
    const value = float(0.0).toVar();
    let amplitude = 0.5;
    let total = 0.0;
    for (let i = 0; i < 3; i += 1) {
      value.addAssign(cloudShadowNoise(uv).mul(amplitude));
      total += amplitude;
      // GLSL: uv = mat2(0.8, 0.6, -0.6, 0.8) * uv * 2.02 + vec2(17.13, 9.77),
      // written out component-wise (columns (0.8, 0.6) and (-0.6, 0.8)) —
      // TSL matN() scalar constructors are row-major (docs/tsl-conventions.md).
      uv.assign(vec2(
        uv.x.mul(0.8).add(uv.y.mul(-0.6)),
        uv.x.mul(0.6).add(uv.y.mul(0.8)),
      ).mul(2.02).add(vec2(17.13, 9.77)));
      amplitude *= 0.5;
    }
    value.divAssign(Math.max(total, 1e-4));
    const threshold = mix(0.72, 0.4, clamp(coverage, 0.0, 1.0));
    const cloud = smoothstep(threshold, threshold.add(0.17), value);
    visibility.assign(cloud.mul(clamp(strength, 0.0, 1.0)).oneMinus());
  });
  return visibility;
});
