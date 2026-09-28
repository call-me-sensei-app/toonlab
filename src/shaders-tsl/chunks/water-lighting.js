// TSL port of src/shaders/chunks/water-fragment-lighting.glsl — stylized
// fresnel, toon-banded sun glints, twinkling sparkles, and reflections
// (planar render target with a procedural sky fallback).
//
// The reflection map is a render-target texture (.level(0) samples); the
// projective uReflectionMatrix is CPU-composed with the node backends' RT
// y-flip (docs/tsl-conventions.md #6 — see WaterScenePasses), so the shader
// math stays the literal GLSL port. GLSL early returns become var + If, which
// also keeps the uniform-dependent divisions guarded (conventions #8).

import {
  clamp,
  float,
  dot,
  If,
  fract,
  max,
  mix,
  normalize,
  pow,
  reflect,
  smoothstep,
  step,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import { waterHash12, waterToonStep, waterVoronoi2 } from './water-common.js';

export function createWaterLightingChunk({ u, physicalSurface = false }) {
  const reference = u.uReferenceView ?? float(0.0);
  // Schlick-style fresnel with a stylized floor: uFresnelBias keeps some sky
  // reflection alive even looking straight down.
  const fresnelFactor = (viewDir, surfaceNormal) => {
    const facing = clamp(dot(viewDir, surfaceNormal), 0.0, 1.0);
    const stylized = clamp(
      u.uFresnelBias.add(pow(facing.oneMinus(), u.uFresnelPower).mul(u.uFresnelStrength)),
      0.0,
      1.0,
    );
    const eta = u.uIndexOfRefraction ?? float(1.333);
    const f0 = eta.sub(1.0).div(eta.add(1.0)).pow2();
    const physical = f0.add(f0.oneMinus().mul(pow(facing.oneMinus(), 5.0)));
    return physicalSurface ? physical : mix(stylized, physical, reference);
  };

  // Toon-banded Blinn-Phong glint. The normal is anisotropically squashed
  // along the sun azimuth so low sun angles draw the long sparkling sun path.
  const specular = (viewDir, surfaceNormal, shadowFactor) => {
    if (physicalSurface) {
      const half = normalize(viewDir.add(u.uSunDirection));
      const nv = max(dot(surfaceNormal, viewDir), 0.001);
      const nl = max(dot(surfaceNormal, u.uSunDirection), 0.0);
      const nh = max(dot(surfaceNormal, half), 0.0);
      const vh = max(dot(viewDir, half), 0.0);
      const roughness = clamp(float(2.0).div(u.uSpecularShininess.add(2.0)).sqrt(), 0.055, 0.35);
      const alpha2 = roughness.mul(roughness).toVar();
      const denominator = nh.mul(nh).mul(alpha2.sub(1.0)).add(1.0);
      const distribution = alpha2.div(max(denominator.mul(denominator).mul(Math.PI), 1e-5));
      const masking = (cosine) => cosine.mul(2.0).div(max(cosine.add(alpha2.add(alpha2.oneMinus().mul(cosine.mul(cosine))).sqrt()), 1e-4));
      const eta = u.uIndexOfRefraction ?? float(1.333);
      const f0 = eta.sub(1.0).div(eta.add(1.0)).pow2();
      const fresnel = f0.add(f0.oneMinus().mul(vh.oneMinus().pow(5)));
      const specularBRDF = distribution.mul(masking(nv)).mul(masking(nl)).mul(fresnel).div(max(nv.mul(4.0), 1e-4));
      return u.uSunColor.mul(specularBRDF).mul(u.uSpecularStrength).mul(shadowFactor);
    }
    const sunAzimuth = normalize(u.uSunDirection.xz.add(vec2(1e-5, 0.0))).toVar();
    const sunPerp = vec2(sunAzimuth.y.negate(), sunAzimuth.x).toVar();
    const stretched = sunAzimuth.mul(dot(surfaceNormal.xz, sunAzimuth))
      .add(sunPerp.mul(dot(surfaceNormal.xz, sunPerp)).mul(clamp(u.uSpecularStretch, 0.0, 0.95).oneMinus()))
      .toVar();
    const glintNormal = normalize(vec3(stretched.x, surfaceNormal.y, stretched.y));
    const halfDir = normalize(viewDir.add(u.uSunDirection));
    const alignment = pow(max(dot(glintNormal, halfDir), 0.0), u.uSpecularShininess).toVar();
    const core = waterToonStep(0.5, 0.1, alignment);
    const halo = waterToonStep(0.18, 0.16, alignment).mul(0.3);
    return u.uSunColor.mul(u.uSpecularStrength).mul(mix(core.add(halo), alignment, reference)).mul(shadowFactor);
  };

  // Twinkling star glints: sparse voronoi feature points with per-cell phase.
  const sparkles = (restXZ, surfaceNormal, viewDir, viewDistance, time) => {
    const result = vec3(0.0).toVar();
    If(u.uSparkleStrength.greaterThan(0.001), () => {
      const sparkleUv = restXZ.mul(u.uSparkleScale)
        .add(u.uFlowDirection.mul(time).mul(u.uFlowSpeed).mul(0.4));
      const voro = waterVoronoi2(sparkleUv).toVar();
      const cellRandom = waterHash12(voro.zw).toVar();
      const activeCell = step(0.5, cellRandom);
      const twinklePhase = fract(
        cellRandom.mul(7.13).add(time.mul(u.uSparkleSpeed).mul(cellRandom.mul(0.3).add(0.16))),
      ).toVar();
      const twinkle = smoothstep(0.88, 0.965, twinklePhase)
        .mul(smoothstep(0.965, 1.0, twinklePhase).oneMinus());
      const point = smoothstep(0.02, 0.12, voro.x).oneMinus();
      const halfDir = normalize(viewDir.add(u.uSunDirection));
      const alignment = smoothstep(0.4, 0.92, dot(surfaceNormal, halfDir));
      const distanceFade = smoothstep(18.0, 55.0, viewDistance).oneMinus();
      result.assign(
        u.uSunColor.mul(u.uSparkleStrength).mul(point).mul(twinkle).mul(activeCell)
          .mul(alignment).mul(distanceFade).mul(3.2),
      );
    });
    return result.mul(reference.oneMinus());
  };

  // Procedural sky used when no planar reflection target is bound: a vertical
  // gradient plus a soft sun glow, cheap and asset-free.
  const proceduralSky = (reflectDir) => {
    const horizon = pow(clamp(reflectDir.y, 0.0, 1.0), 0.55);
    const sky = mix(u.uSkyHorizonColor, u.uSkyZenithColor, horizon);
    const sunGlow = pow(max(dot(reflectDir, u.uSunDirection), 0.0), 180.0);
    return sky.add(u.uSunColor.mul(sunGlow).mul(u.uSunGlowStrength));
  };

  const reflectionColor = (worldPosition, surfaceNormal, viewDir) => {
    const reflectDir = reflect(viewDir.negate(), surfaceNormal).toVar();
    const fallback = proceduralSky(reflectDir).toVar();
    const result = vec3(fallback).toVar();
    If(u.uUseReflectionMap.greaterThanEqual(0.5), () => {
      const projected = u.uReflectionMatrix.mul(vec4(worldPosition, 1.0)).toVar();
      If(projected.w.greaterThan(0.0), () => {
        const reflectionUv = projected.xy.div(projected.w)
          .add(surfaceNormal.xz.mul(u.uReflectionDistortion)).toVar();
        const inRange = reflectionUv.x.greaterThanEqual(0.0).and(reflectionUv.x.lessThanEqual(1.0))
          .and(reflectionUv.y.greaterThanEqual(0.0)).and(reflectionUv.y.lessThanEqual(1.0));
        If(inRange, () => {
          const planar = u.uReflectionMap.sample(reflectionUv).level(0).rgb;
          // Milky painterly reflections: soften the mirror image toward the
          // smooth procedural sky instead of showing a sharp flipped scene.
          result.assign(mix(planar, fallback, clamp(u.uReflectionSoftness, 0.0, 1.0).mul(reference.oneMinus()).mul(physicalSurface ? 0.25 : 1.0)));
        });
      });
    });
    return result;
  };

  return { fresnelFactor, proceduralSky, reflectionColor, sparkles, specular };
}
