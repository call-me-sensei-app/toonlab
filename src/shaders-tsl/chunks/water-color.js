// TSL port of src/shaders/chunks/water-fragment-color.glsl — water body
// color: scene depth reads, refraction, absorption gradient, and procedural
// caustics. All uniforms come from the water material (`u` map, GLSL names).
//
// Scene depth on the node backends is a float COLOR texture holding linear
// [0,1] window depth (docs/tsl-conventions.md #5 — depth textures type
// differently per builder), written by the water grab pass's depth-color
// render. perspectiveDepthToViewZ works unchanged on both backends; world
// reconstruction happens through uInvViewProjMatrix, which the CPU composes
// with the backend's NDC adjustment (see updateWaterMaterialCamera).
//
// GLSL early returns become var + If; texture reads sample at .level(0).

import {
  abs,
  clamp,
  exp,
  float,
  If,
  length,
  max,
  min,
  mix,
  perspectiveDepthToViewZ,
  pow,
  sign,
  smoothstep,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

import { waterRotate2d, waterVoronoi2 } from './water-common.js';

export function createWaterColorChunk({ u, flags }) {
  const sceneRawDepth = (screenUv) => {
    // The pass texture is deliberately stored as canonical forward depth.
    // Three's perspectiveDepthToViewZ and the camera inverse projection both
    // follow the active renderer convention, so reverse the sampled value
    // for reversed-depth hosts before either consumer sees it.
    const stored = float(1.0).toVar();
    If(u.uUseSceneDepth.greaterThanEqual(0.5), () => {
      stored.assign(u.uSceneDepth.sample(screenUv).level(0).r);
    });
    return mix(
      stored,
      stored.oneMinus(),
      clamp(u.uDepthTargetNeedsReverse, 0.0, 1.0),
    ).toVar();
  };

  const storedDepthHasGeometry = (projectedDepth) => mix(
    projectedDepth,
    projectedDepth.oneMinus(),
    clamp(u.uDepthTargetNeedsReverse, 0.0, 1.0),
  ).lessThan(0.99999);

  const viewDistanceFromDepth = (rawDepth) => {
    // perspectiveDepthToViewZ is an Fn() in r185 — keep it out of select()
    // operands (docs/tsl-conventions.md #2), hence the If shape.
    const distance = float(u.uCameraFar).toVar();
    If(storedDepthHasGeometry(rawDepth), () => {
      distance.assign(perspectiveDepthToViewZ(rawDepth, u.uCameraNear, u.uCameraFar).negate());
    });
    return distance;
  };

  const worldFromDepth = (screenUv, rawDepth) => {
    const clipPosition = vec4(vec3(screenUv, rawDepth).mul(2.0).sub(1.0), 1.0);
    const worldPosition = u.uInvViewProjMatrix.mul(clipPosition).toVar();
    return worldPosition.xyz.div(max(abs(worldPosition.w), 1e-6)).mul(sign(worldPosition.w));
  };

  // Screen-space refraction with a validity check: if the refracted sample
  // lands on geometry in front of the water surface, fall back to the
  // unrefracted uv so above-water objects never smear into the water.
  const refractedUv = (screenUv, surfaceNormal, waterViewDistance, viewDepthDiff) => {
    const result = vec2(screenUv).toVar();
    If(u.uUseSceneColor.greaterThanEqual(0.5).and(u.uUseSceneDepth.greaterThanEqual(0.5)), () => {
      const offset = surfaceNormal.xz.mul(u.uRefractionStrength)
        .mul(clamp(viewDepthDiff, 0.0, 2.0))
        .div(max(waterViewDistance.mul(0.35), 1.0))
        .toVar();
      // Cap the displacement in screen space: large offsets re-sample
      // submerged objects from far away, drawing them twice as an animated
      // ghost copy. A few-pixel cap keeps the shimmer without the double image.
      const offsetLength = length(offset).toVar();
      offset.mulAssign(min(offsetLength, 0.018).div(max(offsetLength, 1e-5)));
      const candidate = clamp(screenUv.add(offset), vec2(0.001), vec2(0.999)).toVar();
      const refractedDistance = viewDistanceFromDepth(sceneRawDepth(candidate));
      If(refractedDistance.greaterThanEqual(waterViewDistance.sub(0.02)), () => {
        result.assign(candidate);
      });
    });
    return result;
  };

  const pierceSample = (sampleUv, surfaceHeight) => {
    const pierce = float(0.0).toVar();
    const rawDepth = sceneRawDepth(sampleUv).toVar();
    If(storedDepthHasGeometry(rawDepth), () => { // sky — nothing pierces here
      const neighborWorld = worldFromDepth(sampleUv, rawDepth);
      pierce.assign(smoothstep(0.01, 0.05, neighborWorld.y.sub(surfaceHeight)));
    });
    return pierce;
  };

  // Detects geometry piercing the water surface within a small world-space
  // radius of this pixel: shoreline sand, rocks, a wading character.
  const pierceProximity = (screenUv, waterViewDistance, surfaceHeight) => {
    const pierce = float(1.0).toVar();
    If(u.uUseSceneDepth.greaterThanEqual(0.5), () => {
      // ~0.4 m probe radius projected to screen space (approximate focal scale).
      const radiusUv = clamp(float(0.4).div(max(waterViewDistance, 1.0)), 0.004, 0.05);
      const radius = radiusUv.mul(vec2(u.uResolution.y.div(u.uResolution.x), 1.0)).toVar();
      const lo = vec2(0.001);
      const hi = vec2(0.999);
      const accumulated = pierceSample(clamp(screenUv.add(vec2(radius.x, 0.0)), lo, hi), surfaceHeight).toVar();
      accumulated.assign(max(accumulated, pierceSample(clamp(screenUv.sub(vec2(radius.x, 0.0)), lo, hi), surfaceHeight)));
      accumulated.assign(max(accumulated, pierceSample(clamp(screenUv.add(vec2(0.0, radius.y)), lo, hi), surfaceHeight)));
      accumulated.assign(max(accumulated, pierceSample(clamp(screenUv.sub(vec2(0.0, radius.y)), lo, hi), surfaceHeight)));
      pierce.assign(accumulated);
    });
    return pierce;
  };

  // Three-stop absorption gradient: bright shallow teal -> mid blue -> deep
  // blue. GLSL `out float absorb` → returned alongside the tint.
  const absorptionTint = (effectiveDepth) => {
    const absorb = exp(effectiveDepth.div(max(u.uDepthFadeDistance, 1e-3)).negate()).oneMinus().toVar();
    const deepMix = exp(
      max(effectiveDepth.sub(u.uDepthFadeDistance.mul(0.5)), 0.0)
        .div(max(u.uDeepFadeDistance, 1e-3)).negate(),
    ).oneMinus();
    const tint = mix(u.uShallowColor, u.uMidColor, clamp(absorb.mul(1.25), 0.0, 1.0));
    return { absorb, tint: mix(tint, u.uDeepColor, deepMix).toVar() };
  };

  // Stylized voronoi-web caustics anchored to the reconstructed underwater
  // ground position, offset along the sun direction so they feel projected.
  // flags.chromaticCaustics = the GLSL WATER_QUALITY >= 2 chroma-shift path.
  const caustics = (groundWorld, columnDepth, time) => {
    const result = vec3(0.0).toVar();
    If(u.uCausticsStrength.greaterThan(0.001), () => {
      const anchor = groundWorld.xz.sub(
        u.uSunDirection.xz.div(max(u.uSunDirection.y, 0.35)).mul(columnDepth).mul(0.55),
      ).toVar();
      const causticUv1 = anchor.mul(u.uCausticsScale)
        .add(vec2(0.131, 0.207).mul(time).mul(u.uCausticsSpeed)).toVar();
      const causticUv2 = waterRotate2d(0.72).mul(anchor).mul(u.uCausticsScale.mul(1.29))
        .sub(vec2(0.173, 0.114).mul(time).mul(u.uCausticsSpeed)).toVar();

      // Caustic reach is capped independently of the clarity distances: the
      // dappling belongs to the sub-2m shallows.
      const causticReach = min(u.uDepthFadeDistance, 1.5).toVar();
      const mask = smoothstep(0.015, 0.12, columnDepth)
        .mul(smoothstep(
          causticReach.mul(0.9),
          causticReach.mul(1.6).add(min(u.uDeepFadeDistance, 2.5)),
          columnDepth,
        ).oneMinus())
        .toVar();
      If(mask.greaterThan(0.002), () => {
        const strands = vec3(0.0).toVar();
        if (flags.chromaticCaustics) {
          // Kept subtle: wide shifts read as oil-slick rainbows instead of
          // light dispersion, especially on top-down camera angles.
          const chromaShift = vec2(0.011, 0.007);
          const voroRed = waterVoronoi2(causticUv1.sub(chromaShift)).toVar();
          const voroGreen = waterVoronoi2(causticUv1).toVar();
          const voroBlue = waterVoronoi2(causticUv1.add(chromaShift)).toVar();
          const voroLayer = waterVoronoi2(causticUv2).toVar();
          const layer = smoothstep(0.0, 0.22, voroLayer.y.sub(voroLayer.x)).oneMinus();
          const web = vec3(
            smoothstep(0.0, 0.16, voroRed.y.sub(voroRed.x)).oneMinus(),
            smoothstep(0.0, 0.16, voroGreen.y.sub(voroGreen.x)).oneMinus(),
            smoothstep(0.0, 0.16, voroBlue.y.sub(voroBlue.x)).oneMinus(),
          );
          strands.assign(web.mul(mix(0.45, 1.0, layer)));
        } else {
          const voroGreen = waterVoronoi2(causticUv1).toVar();
          const voroLayer = waterVoronoi2(causticUv2).toVar();
          const layer = smoothstep(0.0, 0.22, voroLayer.y.sub(voroLayer.x)).oneMinus();
          strands.assign(vec3(
            smoothstep(0.0, 0.16, voroGreen.y.sub(voroGreen.x)).oneMinus().mul(mix(0.45, 1.0, layer)),
          ));
        }
        strands.assign(pow(strands, vec3(1.6)));
        result.assign(u.uSunColor.mul(u.uCausticsStrength).mul(strands).mul(mask));
      });
    });
    return result;
  };

  return {
    absorptionTint,
    caustics,
    pierceProximity,
    refractedUv,
    sceneRawDepth,
    viewDistanceFromDepth,
    worldFromDepth,
  };
}
