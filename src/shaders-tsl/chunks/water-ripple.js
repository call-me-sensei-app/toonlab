// TSL port of src/shaders/chunks/water-ripple.glsl — interactive ripple
// heightfield sampling, shared by the water vertex and fragment stages.
// The simulation texture stores: R = height, G = velocity, B = foam energy.
// uRippleRegion = (centerX, centerZ, halfSizeX, halfSizeZ) in world space.
//
// The ripple map is a render-target texture, so every sample is `.level(0)`
// (docs/tsl-conventions.md: RT-fed textures have no mips and WGSL forbids
// implicit-derivative sampling in non-uniform control flow). The GLSL early
// returns become var + If — the mask guard keeps the texture reads out of
// the disabled path exactly like the GLSL branch.

import {
  float,
  If,
  max,
  smoothstep,
  vec2,
  vec3,
} from 'three/tsl';

export function createWaterRippleChunk({ u }) {
  const rippleUv = (restXZ) =>
    restXZ.sub(u.uRippleRegion.xy).div(u.uRippleRegion.zw.mul(2.0)).add(0.5);

  // Smoothly fades ripple influence to zero at the simulation region border so
  // a moving region never shows a hard seam on large water bodies.
  const rippleMask = (uv) => {
    const border = smoothstep(vec2(0.0), vec2(0.06), uv)
      .mul(smoothstep(vec2(0.94), vec2(1.0), uv).oneMinus());
    return border.x.mul(border.y).mul(u.uUseRippleMap);
  };

  const rippleSample = (restXZ) => {
    const result = vec3(0.0).toVar();
    const uv = rippleUv(restXZ).toVar();
    const mask = rippleMask(uv).toVar();
    If(mask.greaterThan(0.0), () => {
      const state = u.uRippleMap.sample(uv).level(0).rgb;
      result.assign(state.mul(mask));
    });
    return result;
  };

  // Central-difference normal contribution from the ripple heightfield.
  const rippleGradient = (restXZ) => {
    const result = vec2(0.0).toVar();
    const uv = rippleUv(restXZ).toVar();
    const mask = rippleMask(uv).toVar();
    If(mask.greaterThan(0.0), () => {
      const left = u.uRippleMap.sample(uv.sub(vec2(u.uRippleTexel.x, 0.0))).level(0).r;
      const right = u.uRippleMap.sample(uv.add(vec2(u.uRippleTexel.x, 0.0))).level(0).r;
      const down = u.uRippleMap.sample(uv.sub(vec2(0.0, u.uRippleTexel.y))).level(0).r;
      const up = u.uRippleMap.sample(uv.add(vec2(0.0, u.uRippleTexel.y))).level(0).r;
      const worldStep = u.uRippleTexel.mul(2.0).mul(u.uRippleRegion.zw.mul(2.0)).toVar();
      result.assign(vec2(
        right.sub(left).div(max(worldStep.x, 1e-5)),
        up.sub(down).div(max(worldStep.y, 1e-5)),
      ).mul(u.uRippleHeightScale).mul(mask));
    });
    return result;
  };

  return { rippleGradient, rippleMask, rippleSample, rippleUv };
}
