// TSL port of src/shaders/sky.vert.glsl + sky.frag.glsl — stylized procedural
// sky dome. Vertical gradient, sun disc with glow, painterly two-tone fbm
// clouds, and twinkling stars. Fully procedural; pairs with the water's
// procedural sky fallback.
//
// Parity notes vs the GLSL ShaderMaterial:
// - The dome renders at the far plane via a custom vertexNode
//   (gl_Position.z = w * 0.99995 in the GLSL vertex stage).
// - GLSL ends with tonemapping_fragment + colorspace_fragment; the node
//   renderer applies the same output transforms automatically.
// - The material exposes `.uniforms` (node objects keyed by the GLSL uniform
//   names, each with a `.value`) so applySkySettingsToMaterial and
//   StylizedSky.update write the same slots on both backends.

import * as THREE from 'three';
import {
  acos,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  dot,
  float,
  Fn,
  If,
  max,
  mix,
  modelWorldMatrix,
  normalize,
  positionLocal,
  pow,
  select,
  smoothstep,
  step,
  uniform,
  vec2,
  vec4,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

import { waterFbm, waterHash12, waterToonStep, waterVoronoi2 } from './chunks/water-common.js';
import { resolveSkyQuality } from '../sky/skyQuality.js';

export function createSkyNodeMaterial({ quality = 'high' } = {}) {
  const qualitySettings = resolveSkyQuality(quality);
  const uniforms = {
    uCloudColor: uniform(new THREE.Color()),
    uCloudCoverage: uniform(0),
    uCloudDirection: uniform(new THREE.Vector2(1, 0.2857142857)),
    uCloudEdgeOpacity: uniform(0),
    uCloudHorizonFade: uniform(0),
    uCloudLightOffset: uniform(0),
    uCloudOpacity: uniform(0),
    uCloudProjection: uniform(0),
    uCloudScale: uniform(0),
    uCloudSeed: uniform(0),
    uCloudShadeColor: uniform(new THREE.Color()),
    uCloudShadeSoftness: uniform(0),
    uCloudShadeStrength: uniform(0),
    uCloudShadeThreshold: uniform(0),
    uCloudSilverLiningStrength: uniform(0),
    uCloudSoftness: uniform(0),
    uCloudSpeed: uniform(0),
    uCloudSunPower: uniform(0),
    uGroundColor: uniform(new THREE.Color()),
    uGroundExponent: uniform(0),
    uHorizonBandSize: uniform(0),
    uHorizonColor: uniform(new THREE.Color()),
    uHorizonScattering: uniform(0),
    uHorizonSunPower: uniform(0),
    uStarsColor: uniform(new THREE.Color()),
    uStarsDensity: uniform(0),
    uStarsHorizonFade: uniform(0),
    uStarsScale: uniform(0),
    uStarsSeed: uniform(0),
    uStarsSize: uniform(0),
    uStarsStrength: uniform(0),
    uStarsTwinkleSpeed: uniform(0),
    uStarsTwinkleStrength: uniform(0),
    uSunCloudOcclusionStrength: uniform(0),
    uSunColor: uniform(new THREE.Color()),
    uSunDiscSoftness: uniform(0),
    uSunDiscIntensity: uniform(0),
    uSunDirection: uniform(new THREE.Vector3(0, 1, 0)),
    uSunGlowBroadStrength: uniform(0),
    uSunGlowCoreSharpness: uniform(0),
    uSunGlowCoreStrength: uniform(0),
    uSunGlowSpread: uniform(0),
    uSunGlowStrength: uniform(0),
    uSunSize: uniform(0),
    uTime: uniform(0),
    uZenithColor: uniform(new THREE.Color()),
    uZenithExponent: uniform(0),
  };

  const material = new MeshBasicNodeMaterial({
    depthWrite: false,
    side: THREE.BackSide,
  });
  material.name = 'StylizedSky';
  material.fog = false;
  material.lights = false;
  material.userData.skyQuality = { ...qualitySettings };

  // Vertex stage: dome pinned to the far plane regardless of sphere radius,
  // so it never clips scene geometry and works inside reflection passes.
  const clipPosition = cameraProjectionMatrix
    .mul(cameraViewMatrix)
    .mul(modelWorldMatrix)
    .mul(vec4(positionLocal, 1.0));
  material.vertexNode = vec4(
    clipPosition.x,
    clipPosition.y,
    clipPosition.w.mul(0.99995),
    clipPosition.w,
  );

  material.colorNode = Fn(() => {
    const direction = normalize(positionLocal).toVar();
    const up = direction.y.toVar();

    // Base vertical gradient with a mirrored ground fade below the horizon.
    const zenithMix = pow(clamp(up, 0.0, 1.0), uniforms.uZenithExponent);
    const color = select(
      up.greaterThanEqual(0.0),
      mix(uniforms.uHorizonColor, uniforms.uZenithColor, zenithMix),
      mix(
        uniforms.uHorizonColor,
        uniforms.uGroundColor,
        pow(clamp(up.negate(), 0.0, 1.0), uniforms.uGroundExponent),
      ),
    ).toVar();

    // Sun disc and glow.
    const cosAngle = dot(direction, uniforms.uSunDirection).toVar();
    const angle = acos(clamp(cosAngle, -1.0, 1.0));
    const sunCloudVisibility = smoothstep(0.55, 0.82, uniforms.uCloudCoverage).oneMinus();
    const sunVisibility = mix(1.0, sunCloudVisibility, uniforms.uSunCloudOcclusionStrength);
    const safeSunSize = max(uniforms.uSunSize, 0.00001);
    const sunDisc = smoothstep(
      safeSunSize.mul(uniforms.uSunDiscSoftness.oneMinus()),
      safeSunSize,
      angle,
    )
      .oneMinus()
      .mul(sunVisibility)
      .mul(step(0.00001, uniforms.uSunSize));
    const sunGlow = pow(max(cosAngle, 0.0), uniforms.uSunGlowSpread)
      .mul(uniforms.uSunGlowBroadStrength)
      .add(
        pow(max(cosAngle, 0.0), uniforms.uSunGlowCoreSharpness)
          .mul(uniforms.uSunGlowCoreStrength),
      )
      .toVar();
    color.addAssign(
      uniforms.uSunColor.mul(
        sunDisc.mul(uniforms.uSunDiscIntensity)
          .add(sunGlow.mul(uniforms.uSunGlowStrength)),
      ),
    );

    // Atmospheric scattering hint: a warm wedge along the sun-side horizon
    // that fades with altitude.
    const horizonBand = smoothstep(0.0, uniforms.uHorizonBandSize, up.abs()).oneMinus();
    const sunward = pow(
      clamp(cosAngle.mul(0.5).add(0.5), 0.0, 1.0),
      uniforms.uHorizonSunPower,
    );
    color.addAssign(
      uniforms.uSunColor
        .mul(horizonBand)
        .mul(sunward)
        .mul(uniforms.uHorizonScattering)
        .mul(0.35),
    );

    // Stars: sparse grid glints, hidden below the horizon and near the sun.
    // The If guard matches the GLSL branch — it also keeps the projected UV
    // division (up + 0.28 crosses zero below the horizon) out of reach.
    If(uniforms.uStarsStrength.greaterThan(0.001).and(up.greaterThan(0.02)), () => {
      const starUv = direction.xz
        .div(up.add(0.28))
        .mul(uniforms.uStarsScale)
        .add(vec2(uniforms.uStarsSeed.mul(1.37), uniforms.uStarsSeed.mul(2.11)));
      const starVoro = waterVoronoi2(starUv);
      const starRandom = waterHash12(starVoro.zw);
      const twinkleWave = uniforms.uTime
        .mul(uniforms.uStarsTwinkleSpeed)
        .mul(starRandom.mul(2.4).add(1.2))
        .add(starRandom.mul(31.0))
        .sin();
      const twinkleAmount = uniforms.uStarsTwinkleStrength.mul(0.5);
      const twinkle = twinkleWave.mul(twinkleAmount).add(float(1.0).sub(twinkleAmount));
      const star = smoothstep(0.0, uniforms.uStarsSize, starVoro.x)
        .oneMinus()
        .mul(step(uniforms.uStarsDensity.oneMinus(), starRandom));
      color.addAssign(
        uniforms.uStarsColor
          .mul(star)
          .mul(twinkle)
          .mul(uniforms.uStarsStrength)
          .mul(smoothstep(0.03, uniforms.uStarsHorizonFade, up))
          .mul(clamp(sunGlow, 0.0, 1.0).oneMinus()),
      );
    });

    // Painterly clouds: fbm silhouettes with a toon-stepped shadow side and a
    // silver lining toward the sun, projected onto a virtual cloud plane.
    If(uniforms.uCloudCoverage.greaterThan(0.001).and(up.greaterThan(0.015)), () => {
      const cloudUv = direction.xz
        .div(up.add(uniforms.uCloudProjection))
        .mul(uniforms.uCloudScale)
        .add(
          uniforms.uTime
            .mul(uniforms.uCloudSpeed)
            .mul(uniforms.uCloudDirection)
            .mul(0.0218403297),
        )
        .add(vec2(uniforms.uCloudSeed.mul(1.37), uniforms.uCloudSeed.mul(2.11)))
        .toVar();
      const cloudBase = waterFbm(cloudUv, qualitySettings.cloudOctaves).toVar();
      const threshold = mix(0.74, 0.34, clamp(uniforms.uCloudCoverage, 0.0, 1.0));
      const cloudCore = smoothstep(
        threshold.add(uniforms.uCloudSoftness),
        threshold.add(uniforms.uCloudSoftness.mul(2.4)),
        cloudBase,
      );
      const cloudEdge = smoothstep(
        threshold,
        threshold.add(uniforms.uCloudSoftness),
        cloudBase,
      );
      const cloudMask = max(
        cloudCore,
        cloudEdge.mul(uniforms.uCloudEdgeOpacity),
      ).mul(uniforms.uCloudOpacity);

      const litSample = waterFbm(
        cloudUv.sub(uniforms.uSunDirection.xz.mul(uniforms.uCloudLightOffset)),
        qualitySettings.cloudOctaves,
      );
      const shade = waterToonStep(
        uniforms.uCloudShadeThreshold,
        uniforms.uCloudShadeSoftness,
        cloudBase.sub(litSample),
      );
      const cloudColor = mix(
        uniforms.uCloudColor,
        uniforms.uCloudShadeColor,
        shade.mul(uniforms.uCloudShadeStrength),
      )
        .add(
          uniforms.uSunColor
            .mul(pow(max(cosAngle, 0.0), uniforms.uCloudSunPower))
            .mul(uniforms.uCloudSilverLiningStrength),
        )
        .toVar();

      const horizonFade = smoothstep(0.015, uniforms.uCloudHorizonFade, up);
      color.assign(mix(color, cloudColor, cloudMask.mul(horizonFade)));
    });

    return vec4(color, 1.0);
  })();

  // Same-name uniform slots as the ShaderMaterial (UniformNodes expose
  // `.value` just like ShaderMaterial uniform entries).
  material.uniforms = uniforms;
  return material;
}
