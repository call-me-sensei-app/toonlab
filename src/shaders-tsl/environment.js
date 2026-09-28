// TSL port of src/shaders/environment.vert.glsl + environment.frag.glsl — the
// stitched environment surface shader. Consumed by environmentShaderMaterials'
// createEnvironmentMaterial on the TSL backend; receives the same resolved
// role/texture decisions the GLSL ShaderMaterial uniform block is built from,
// and exposes `.uniforms` under the exact GLSL uniform names so every
// adapter/HUD/settings write-through works unchanged on both backends.
//
// Porting notes (docs/tsl-conventions.md):
// - Optional samplers are gated by the same conditions as the GLSL defines
//   (JS guards instead of #ifdef), so unused maps never join the graph and
//   ANGLE's 16-sampler budget is respected on the fallback backend. The
//   texture *uniform slots* still exist for every map (fallback-backed), so
//   `.value` write-throughs keep working exactly like the classic uniforms.
// - GLSL float-uniform "bools" (enableX > 0.5) stay float uniforms with the
//   same comparisons.
// - vWorldNormal is ported faithfully as three's VIEW-space normal
//   (normalize(transformedNormal) in the GLSL vertex stage) — the mixed-space
//   lighting quirk is part of the approved baseline look.
// - Scene lights come from character/sceneLights.js (shared uniforms
//   mirrored from the scene each frame by the converted meshes'
//   onBeforeRender) instead of <lights_pars_begin>.
// - getShadowMask() maps to sampleEnvironmentSunShadow(vWorldPosition)
//   (chunks/environment-sun-shadow.js) — inert (mask = 1) until the dedicated
//   sun-shadow pass fills the shared uniforms.
// - Debug views are always compiled in (they add zero bindings); the GLSL
//   ENV_DEBUG_VIEWS define flip becomes a pure envDebugMode uniform write.
// - Scene-wide state (clock, cloud shadows, openings, probe, debug mode,
//   planar reflection pass output) lives in module-level shared uniform nodes
//   mirroring environmentShaderMaterials' environmentSharedUniforms.

import * as THREE from 'three';
import {
  abs,
  attribute,
  cameraFar,
  cameraNear,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
  clamp,
  Discard,
  distance,
  dot,
  exp,
  float,
  Fn,
  frontFacing,
  If,
  length,
  max,
  mix,
  normalize,
  normalLocal,
  normalWorld,
  positionWorld,
  pow,
  select,
  smoothstep,
  step,
  texture,
  transformNormalToView,
  uniform,
  uniformArray,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  vertexColor,
  viewZToOrthographicDepth,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import {
  fallbackEnvironmentBlackTexture,
  fallbackEnvironmentNormalTexture,
  fallbackEnvironmentWhiteTexture,
} from '../environment/environmentTextureResolver.js';
import { applySaturation, envLuma, windowPaneMask } from './chunks/environment-color.js';
import { environmentDebugColor } from './chunks/environment-debug.js';
import { createEnvironmentLightingChunk } from './chunks/environment-lighting.js';
import { groundBlendFactor, sampleGroundColor } from './chunks/environment-ground-field.js';
import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';
import { worldFbm2 } from './chunks/world-noise.js';
import { projectedWaterCaustics } from './chunks/projected-water-caustics.js';
import { stylizedCloudShadow } from './chunks/stylized-cloud-shadow.js';
import { toonSceneLights } from './character/sceneLights.js';

// Scene-wide uniform nodes shared by reference across every environment node
// material — the TSL mirror of environmentSharedUniforms (same names, same
// defaults). environmentShaderMaterials' setters write both stores; the
// per-material `.uniforms` maps register these shared nodes so material-walk
// writes (applyEnvironmentSettingsToMaterial cloudShadow* etc.) hit the
// scene-wide values exactly like the classic shared-by-reference uniforms.
export const environmentSharedUniformNodes = {
  time: uniform(0.0),
  cloudShadowStrength: uniform(0.0),
  cloudShadowCoverage: uniform(0.45),
  cloudShadowScale: uniform(0.012),
  cloudShadowVelocity: uniform(new THREE.Vector2(0.02, 0.006)),
  envDebugMode: uniform(0.0),
  environmentOpenings: uniformArray(
    Array.from({ length: 4 }, () => new THREE.Vector4()),
    'vec4',
  ),
  environmentOpeningCount: uniform(0.0),
  ambientProbe: uniformArray(
    Array.from({ length: 6 }, () => new THREE.Color(1, 1, 1)),
    'color',
  ),
  planarReflectionMap: texture(fallbackEnvironmentBlackTexture),
  planarReflectionMatrix: uniform(new THREE.Matrix4()),
};

function max3(color) {
  return max(color.r, max(color.g, color.b));
}

/**
 * Builds the environment NodeMaterial. Value defaults mirror the classic
 * ShaderMaterial uniform block in environmentShaderMaterials.js line for
 * line; `flags` mirrors the USE_ENV_* defines the classic factory sets.
 */
export function createEnvironmentNodeMaterial({
  alphaBlend = false,
  alphaCutoff = -1.0,
  baseColor = new THREE.Color(1, 1, 1),
  environmentBox = null,
  flags,
  hasSun = false,
  isEmissive = false,
  isFoliage = false,
  isGlossFloor = false,
  opacity = 1,
  side = THREE.DoubleSide,
  textureSet,
}) {
  const shared = environmentSharedUniformNodes;

  // ---- Uniforms (GLSL names; UniformNodes expose `.value` like
  //      ShaderMaterial uniform entries). Values mirror the classic block. ----
  const u = {
    baseMap: texture(textureSet.baseMap ?? fallbackEnvironmentWhiteTexture),
    // Applies the base map's repeat/offset/rotation (THREE.Texture.matrix)
    // like the built-in materials' mapTransform; identity when unset.
    baseMapTransform: uniform(new THREE.Matrix3()),
    alphaMap: texture(textureSet.alphaMap ?? fallbackEnvironmentWhiteTexture),
    packedMap: texture(textureSet.packedMap ?? fallbackEnvironmentBlackTexture),
    baseColor: uniform(baseColor.clone?.() ?? new THREE.Color(baseColor)),
    opacity: uniform(opacity),
    alphaCutoff: uniform(alphaCutoff),
    useAlphaMap: uniform(textureSet.alphaMap ? 1.0 : 0.0),
    alphaFromLuminance: uniform(textureSet.alphaFromLuminance ? 1.0 : 0.0),
    foliageCutout: uniform(isFoliage ? 1.0 : 0.0),
    usePackedMap: uniform(textureSet.packedMap ? 1.0 : 0.0),
    windowCutout: uniform(0.0),
    shadeStrength: uniform(hasSun ? 0.95 : 0.42),
    shadeSoftness: uniform(hasSun ? 0.18 : 0.38),
    ambientStrength: uniform(hasSun ? 0.0 : 0.98),
    ambientLightInfluence: uniform(0.22),
    directLightStrength: uniform(hasSun ? 1.35 : 0.42),
    pointLightStrength: uniform(hasSun ? 0.72 : 0.18),
    spotLightStrength: uniform(0.0),
    exposure: uniform(hasSun ? 0.9 : 1.0),
    lightingInfluence: uniform(hasSun ? 1.0 : 0.36),
    saturation: uniform(1.12),
    shadowLift: uniform(hasSun ? 0.0 : 0.66),
    // How much of the CAST sun shadow applies to direct light. 1 = classic
    // full-depth shadows. Worlds whose look runs near-zero ambient (the
    // vivid outdoor presets) crush building-scale shadow masses to black at
    // 1.0 — ~0.7 keeps them as painted mid-tones instead.
    sunShadowStrength: uniform(1.0),
    skyTintStrength: uniform(0.24),
    emissiveStrength: uniform(hasSun ? 0.0 : isEmissive ? 0.55 : 0.0),
    sunBoost: uniform(hasSun ? 0.08 : 0.0),
    environmentCenter: uniform(environmentBox?.getCenter(new THREE.Vector3()) ?? new THREE.Vector3()),
    environmentSize: uniform(environmentBox?.getSize(new THREE.Vector3()) ?? new THREE.Vector3(1, 1, 1)),
    leftSideShadow: uniform(hasSun ? 0.92 : 0.0),
    leftSideShadowColor: uniform(new THREE.Color(0.34, 0.29, 0.25)),
    packedOcclusionStrength: uniform(0.22),
    bakedGlowStrength: uniform(0.05),
    shadowTintColor: uniform(new THREE.Color(0.86, 0.82, 0.78)),
    skyGroundTint: uniform(new THREE.Color(1.05, 0.97, 0.9)),
    skyTopTint: uniform(new THREE.Color(0.86, 0.96, 1.08)),
    sunBoostColor: uniform(new THREE.Color(1.0, 0.78, 0.42)),

    triplanarMapTex: texture(textureSet.triplanarMap ?? fallbackEnvironmentWhiteTexture),
    normalMapTex: texture(textureSet.normalMap ?? fallbackEnvironmentNormalTexture),
    normalMapStrength: uniform(0.8),
    normalMapScale: uniform(textureSet.normalScale ?? new THREE.Vector2(1, 1)),
    aoMapTex: texture(textureSet.aoMap ?? fallbackEnvironmentWhiteTexture),
    aoMapStrength: uniform(THREE.MathUtils.clamp(textureSet.aoMapIntensity ?? 1, 0, 2)),
    aoWarmth: uniform(0.55),
    lightMapTex: texture(textureSet.lightMap ?? fallbackEnvironmentBlackTexture),
    lightMapStrength: uniform(THREE.MathUtils.clamp(textureSet.lightMapIntensity ?? 1, 0, 2)),
    lightMapLift: uniform(0.1),
    emissiveMapTex: texture(textureSet.emissiveMap ?? fallbackEnvironmentBlackTexture),
    emissiveMapColor: uniform(textureSet.emissiveColor ?? new THREE.Color(1, 1, 1)),
    // Sunlight dominates emissives by day; lamps carry the room at night.
    emissiveMapStrength: uniform(hasSun ? 0.25 : 1.0),
    vertexAoStrength: uniform(0.85),
    untexturedGradientStrength: uniform(0.4),
    specularStrength: uniform(isGlossFloor ? 0.35 : 0.0),
    specularShininess: uniform(isGlossFloor ? 48 : 32),
    specularSoftness: uniform(0.22),
    specularColor: uniform(new THREE.Color(1, 1, 1)),
    interiorOcclusionStrength: uniform(0.0),
    interiorOcclusionColor: uniform(new THREE.Color(0.34, 0.29, 0.25)),
    ambientProbeBlend: uniform(0.0),
    heightFogDensity: uniform(0.0),
    heightFogFalloff: uniform(6.0),
    heightFogColor: uniform(new THREE.Color(0.75, 0.82, 0.92)),
    triplanarDetail: uniform(0.0),
    triplanarDetailScale: uniform(8.0),
    triplanarEdgeHighlight: uniform(0.6),
    // Slope band for the triplanar stone takeover. cliffNoiseStrength > 0
    // breaks the band edge with world-space fbm — flat, perfectly smooth
    // grass↔cliff transitions are the single strongest "procedural" tell.
    cliffStart: uniform(0.12),
    cliffFade: uniform(0.18),
    cliffNoiseScale: uniform(0.045),
    cliffNoiseStrength: uniform(0.0),
    // Second ground-detail sample at a coarser tiling, blended in to hide
    // the base map's repeat. 0 = off (default, back-compat).
    dualDetailMix: uniform(0.0),
    dualDetailScale: uniform(0.21),
    // World-space macro colormap: low-frequency biome tint multiplied over
    // flat ground (texels encode a multiplier around mid-gray; ×2 decodes).
    colormapTex: texture(textureSet.colormapMap ?? fallbackEnvironmentWhiteTexture),
    colormapStrength: uniform(0.0),
    // Texel decode factor: 2 for our mid-gray-neutral generated maps,
    // 1 for hand-painted direct-color maps (the reference pack's).
    colormapDecode: uniform(2.0),
    // 0 = tint-multiply (our generated maps). 1 = the reference landscape
    // formula: DESATURATE the ground texture to luminance, then OVERLAY the
    // colormap — all hue comes from the painted map, so a green ground
    // texture can never double-saturate it.
    colormapMode: uniform(0.0),
    // (offsetX, offsetZ, 1/sizeX, 1/sizeZ): worldXZ → colormap UV.
    colormapRegion: uniform(textureSet.colormapRegion ?? new THREE.Vector4(0, 0, 0.001, 0.001)),
    // Ground-field contact melt: fragments within vtBlendHeight of the
    // terrain surface adopt its albedo, so rock and trunk bases sit IN the
    // meadow instead of on it. 0 = off; never enable on ground-field
    // WRITERS (the terrain would resample its own blurred output).
    vtBlendStrength: uniform(0.0),
    vtBlendHeight: uniform(0.6),
    planarReflectionStrength: uniform(isGlossFloor ? 0.3 : 0.0),
    planarReflectionFresnel: uniform(2.4),

    enableAlphaMap: uniform(1.0),
    enableAlphaCutout: uniform(1.0),
    enableFoliageCutout: uniform(1.0),
    enablePackedMap: uniform(1.0),
    enableWindowCutout: uniform(1.0),
    enableDirectionalLights: uniform(1.0),
    enablePointLights: uniform(1.0),
    enableSpotLights: uniform(1.0),
    enableShadowMask: uniform(1.0),
    enableAmbientLight: uniform(1.0),
    enableSkyTint: uniform(1.0),
    enableLeftSideShadow: uniform(1.0),
    enableEmissive: uniform(1.0),
    enableSunBoost: uniform(1.0),
    enableNormalMap: uniform(1.0),
    enableAoMap: uniform(1.0),
    enableLightMap: uniform(1.0),
    enableVertexAo: uniform(1.0),
    enableUntexturedGradient: uniform(1.0),
    enableSpecular: uniform(1.0),
    enableInteriorOcclusion: uniform(1.0),
    enableAmbientProbe: uniform(1.0),
    enableHeightFog: uniform(1.0),
    enablePlanarReflection: uniform(1.0),

    // Scene-wide state, shared by reference (the classic factory swaps these
    // slots for the shared uniform objects the same way).
    time: shared.time,
    cloudShadowStrength: shared.cloudShadowStrength,
    cloudShadowCoverage: shared.cloudShadowCoverage,
    cloudShadowScale: shared.cloudShadowScale,
    cloudShadowVelocity: shared.cloudShadowVelocity,
    envDebugMode: shared.envDebugMode,
    environmentOpenings: shared.environmentOpenings,
    environmentOpeningCount: shared.environmentOpeningCount,
    ambientProbe: shared.ambientProbe,
    planarReflectionMap: shared.planarReflectionMap,
    planarReflectionMatrix: shared.planarReflectionMatrix,
  };

  // Texture nodes referenced by the graph — only flag-gated maps are ever
  // sampled, so absent maps never claim a texture unit.
  const tex = {
    alphaMap: u.alphaMap,
    aoMapTex: u.aoMapTex,
    baseMap: u.baseMap,
    emissiveMapTex: u.emissiveMapTex,
    lightMapTex: u.lightMapTex,
    normalMapTex: u.normalMapTex,
    packedMap: u.packedMap,
    colormapTex: u.colormapTex,
    planarReflectionMap: shared.planarReflectionMap,
    triplanarMapTex: u.triplanarMapTex,
  };

  const material = new NodeMaterial();
  material.name = 'ToonEnvironmentNode';
  material.lights = false;
  // TODO(tsl Phase 7): fog ordering — the GLSL applies scene fog AFTER the
  // colorspace conversion (fog_fragment follows colorspace_fragment); the
  // node pipeline would apply it before. Scene fog is disabled here until the
  // fog phase resolves the ordering (the Phase 3 gate scene has no scene.fog).
  material.fog = false;
  material.side = side;
  material.transparent = alphaBlend;
  material.depthWrite = !alphaBlend;
  material.alphaTest = 0; // alpha cutout is in-graph (alphaCutoff), like the GLSL
  material.vertexColors = Boolean(flags.useVertexColors);
  // Debug views are compiled in on this backend; the marker keeps
  // setEnvironmentDebugOutput's define-flip loop from forcing a recompile.
  material.defines = { ENV_DEBUG_VIEWS: 1 };

  // ---- Vertex stage ----
  // Varyings are declared up front and assigned imperatively inside the
  // single vertexNode Fn (docs/tsl-conventions.md gotcha 4).
  const vUv = varying(vec2(), 'vEnvUv');
  const vUv2 = flags.useUv2 ? varying(vec2(), 'vEnvUv2') : null;
  const vEnvVertexAo = flags.hasVertexAo ? varying(float(), 'vEnvVertexAo') : null;
  const vWorldNormal = varying(vec3(), 'vEnvWorldNormal');
  const vWorldPosition = varying(vec3(), 'vEnvWorldPosition');
  const vViewPosition = varying(vec3(), 'vEnvViewPosition');
  const vRoomUv = varying(vec2(), 'vEnvRoomUv');

  material.vertexNode = Fn(() => {
    vUv.assign(u.baseMapTransform.mul(vec3(uv(), 1.0)).xy);
    if (flags.useUv2) vUv2.assign(attribute('uv1', 'vec2'));
    if (flags.hasVertexAo) vEnvVertexAo.assign(attribute('envVertexAo', 'float'));

    // GLSL: vWorldNormal = normalize(transformedNormal) — three's VIEW-space
    // normal (see the quirk note in the header).
    vWorldNormal.assign(normalize(transformNormalToView(normalLocal)));

    const worldPosition = positionWorld.toVar();
    vWorldPosition.assign(worldPosition);
    // Room-normalized position for the side-shadow gradient; linear in world
    // space, so interpolating it is exact and the fragment stage skips the
    // per-pixel divide.
    vRoomUv.assign(
      worldPosition.sub(u.environmentCenter)
        .div(max(u.environmentSize, vec3(0.001))).xy.add(0.5),
    );

    const mvPosition = cameraViewMatrix.mul(vec4(worldPosition, 1.0));
    vViewPosition.assign(mvPosition.xyz.negate());
    return cameraProjectionMatrix.mul(mvPosition);
  })();

  const shadowSideFor = {
    [THREE.FrontSide]: THREE.BackSide,
    [THREE.BackSide]: THREE.FrontSide,
    [THREE.DoubleSide]: THREE.DoubleSide,
  };

  material.userData.createDepthColorVariant = () => {
    const depthMaterial = new NodeMaterial();
    depthMaterial.name = `${material.name || 'ToonEnvironmentNode'}Depth`;
    depthMaterial.lights = false;
    depthMaterial.fog = false;
    depthMaterial.side = material.shadowSide ?? shadowSideFor[material.side] ?? THREE.DoubleSide;
    depthMaterial.transparent = false;
    depthMaterial.depthWrite = true;
    depthMaterial.depthTest = material.depthTest;
    depthMaterial.vertexColors = material.vertexColors;
    depthMaterial.isShadowPassMaterial = true;
    depthMaterial.vertexNode = material.vertexNode;
    depthMaterial.fragmentNode = Fn(() => {
      const texel = tex.baseMap.sample(vUv).toVar();
      if (flags.useVertexColors) {
        const vColor = vertexColor();
        texel.a.mulAssign(vColor.a);
      }

      Discard(
        u.enableFoliageCutout.greaterThan(0.5)
          .and(u.foliageCutout.greaterThan(0.5))
          .and(max3(texel.rgb).lessThan(0.11)),
      );
      const paneMask = windowPaneMask(texel.rgb).toVar();
      Discard(
        u.enableWindowCutout.greaterThan(0.5)
          .and(u.windowCutout.greaterThan(0.5))
          .and(paneMask.greaterThan(0.44)),
      );

      const alpha = texel.a.mul(u.opacity).toVar();
      if (flags.hasAlphaMap) {
        If(u.enableAlphaMap.greaterThan(0.5).and(u.useAlphaMap.greaterThan(0.5)), () => {
          const alphaTexel = tex.alphaMap.sample(vUv).toVar();
          const textureAlpha = select(
            u.alphaFromLuminance.greaterThan(0.5),
            max3(alphaTexel.rgb),
            alphaTexel.a,
          );
          alpha.mulAssign(textureAlpha);
        });
      }
      Discard(
        u.enableAlphaCutout.greaterThan(0.5)
          .and(u.alphaCutoff.greaterThanEqual(0.0))
          .and(alpha.lessThan(u.alphaCutoff)),
      );

      const orthographic = cameraProjectionMatrix.element(3).w.equal(1.0);
      const viewZ = vViewPosition.z.negate();
      const depth01 = select(
        orthographic,
        viewZToOrthographicDepth(viewZ, cameraNear, cameraFar),
        viewZToPerspectiveDepth(viewZ, cameraNear, cameraFar),
      );
      return vec4(vec3(depth01), 1.0);
    })();
    return depthMaterial;
  };

  // ---- Fragment stage ----
  const lighting = createEnvironmentLightingChunk({
    cameraViewMatrixNode: cameraViewMatrix,
    flags,
    tex,
    u,
  });

  // #ifdef ENV_AO_UV2 / ENV_LIGHT_UV2 — compile-time uv channel selection.
  const envAoUv = flags.aoUsesUv2 && vUv2 ? vUv2 : vUv;
  const envLightUv = flags.lightUsesUv2 && vUv2 ? vUv2 : vUv;

  material.fragmentNode = Fn(() => {
    const texel = tex.baseMap.sample(vUv).toVar();
    // Dual-scale detail: the same ground map re-sampled at a coarser tiling
    // and blended in breaks the visible repeat of the base tile — the
    // classic anti-tiling move for big open meadows. Compile-gated to
    // materials with a real diffuse map: on the untextured class the
    // white-fallback math would read as a flat ×2 brightness lift.
    if (!textureSet.untextured) {
      If(u.dualDetailMix.greaterThan(0.0), () => {
        const coarse = tex.baseMap.sample(vUv.mul(u.dualDetailScale)).rgb;
        texel.rgb.assign(mix(texel.rgb, texel.rgb.mul(coarse).mul(2.0), clamp(u.dualDetailMix, 0.0, 1.0)));
      });
    }
    // Triplanar detail: re-sample the base map projected in world space and
    // blended by the surface normal, so steep faces (cliff walls, terrace
    // sides) keep the same texture density as the ground. A heightfield's
    // planar UVs compress an entire wall into a sliver of the map — up
    // close the wall reads as untextured flat paint. Opt-in: 0 disables.
    // A dedicated cliff map owns steep-face texel density. Re-projecting the
    // already highly tiled ground map underneath it creates competing axes at
    // grazing angles — the close-range herringbone/moire failure. Only use the
    // base-map fallback when the asset has no authored triplanar cliff map.
    if (!textureSet.triplanarMap) {
      If(u.triplanarDetail.greaterThan(0.0), () => {
        const scale = max(u.triplanarDetailScale, 0.001);
        const weights = pow(abs(normalWorld), vec3(4.0)).toVar();
        const weightSum = max(weights.x.add(weights.y).add(weights.z), 0.0001);
        const tri = tex.baseMap.sample(vWorldPosition.zy.div(scale)).rgb
          .mul(weights.x)
          .add(tex.baseMap.sample(vWorldPosition.xz.div(scale)).rgb.mul(weights.y))
          .add(tex.baseMap.sample(vWorldPosition.xy.div(scale)).rgb.mul(weights.z))
          .div(weightSum);
        texel.rgb.assign(mix(texel.rgb, tri, clamp(u.triplanarDetail, 0.0, 1.0)));
      });
    }
    if (flags.useVertexColors) {
      // USE_COLOR / USE_COLOR_ALPHA: vertexColor() yields w = 1 for vec3
      // color attributes, so the alpha multiply is a no-op exactly when the
      // classic pipeline compiled without USE_COLOR_ALPHA.
      const vColor = vertexColor();
      texel.rgb.mulAssign(vColor.rgb);
      texel.a.mulAssign(vColor.a);
    }
    // Shared slope classification: the stone takeover and the macro colormap
    // both key off it. cliffNoiseStrength > 0 offsets the threshold with
    // world-space fbm so the grass↔stone edge wanders organically instead of
    // tracing a perfectly smooth analytic contour.
    const slope01 = abs(normalWorld.y).oneMinus().toVar();
    If(u.cliffNoiseStrength.greaterThan(0.0), () => {
      const wander = worldFbm2(vWorldPosition.xz.mul(max(u.cliffNoiseScale, 0.0001)))
        .sub(0.5).mul(2.0).mul(u.cliffNoiseStrength);
      slope01.addAssign(wander);
    });
    const steepMask = smoothstep(u.cliffStart, u.cliffStart.add(max(u.cliffFade, 0.001)), slope01).toVar();

    if (textureSet.colormapMap) {
      // World-space macro colormap: a low-frequency biome tint (the
      // hand-painted grass colormap of the reference pack, generated seeded
      // here) multiplied over flat ground. Texels encode a multiplier
      // around mid-gray; cliffs keep their stone color.
      If(u.colormapStrength.greaterThan(0.0), () => {
        const mapUv = vWorldPosition.xz.sub(u.colormapRegion.xy).mul(u.colormapRegion.zw);
        const colormap = tex.colormapTex.sample(mapUv).rgb;
        const flatWeight = steepMask.oneMinus().mul(clamp(u.colormapStrength, 0.0, 1.0));
        const tinted = vec3(0.0).toVar();
        If(u.colormapMode.greaterThan(0.5), () => {
          // Reference formula: Overlay(luminance(ground), colormap).
          const grey = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
          const lo = colormap.mul(grey.mul(2.0));
          const hi = vec3(1.0).sub(vec3(1.0).sub(colormap).mul(grey.oneMinus().mul(2.0)));
          tinted.assign(mix(lo, hi, step(0.5, grey)));
        }).Else(() => {
          tinted.assign(texel.rgb.mul(colormap.mul(u.colormapDecode)));
        });
        texel.rgb.assign(mix(texel.rgb, tinted, flatWeight));
      });
    }

    if (textureSet.triplanarMap) {
      // Dedicated steep-face material (userData.envTriplanarMap): a painted
      // stone/cliff diffuse sampled triplanar in world space and blended in
      // by slope. Flats keep the ground detail; a share of the painted
      // vertex tint bleeds through so strata bands and baked haze still
      // modulate the stone at range.
      If(u.triplanarDetail.greaterThan(0.0), () => {
        const scale = max(u.triplanarDetailScale, 0.001);
        const weights = pow(abs(normalWorld), vec3(4.0)).toVar();
        const weightSum = max(weights.x.add(weights.y).add(weights.z), 0.0001);
        const stone = tex.triplanarMapTex.sample(vWorldPosition.zy.div(scale)).rgb
          .mul(weights.x)
          .add(tex.triplanarMapTex.sample(vWorldPosition.xz.div(scale)).rgb.mul(weights.y))
          .add(tex.triplanarMapTex.sample(vWorldPosition.xy.div(scale)).rgb.mul(weights.z))
          .div(weightSum).toVar();
        // Early stone takeover (default cliffStart 0.12 ≈ 29°): the
        // grass↔stone transition band is where the terrain triangulation
        // shows — per-vertex meadow/gold paint interpolating across wall
        // triangles reads as green sawtooth wedges, so the band must be
        // narrow and mostly stone.
        const steep = steepMask;
        // Tint by the vertex paint's LUMINANCE only: brightness variation
        // (strata, haze) carries through, but its hue never does — green
        // tread color bleeding into wall stone is the sawtooth's other half.
        const paintLum = dot(texel.rgb, vec3(0.299, 0.587, 0.114));
        const tinted = stone.mul(mix(vec3(1.0), vec3(paintLum).mul(1.7), 0.35));
        texel.rgb.assign(mix(texel.rgb, tinted, clamp(u.triplanarDetail, 0.0, 1.0).mul(steep)));
        // Edge highlighting: hand-painted rock brightens its convex lips.
        // steep·(1−steep) peaks exactly on the wall↔flat transition band —
        // the rounded top edge of a cliff or terrace — with no baked
        // curvature data and no per-vertex aliasing. Warm, slightly
        // saturated lift like a painted highlight.
        const lip = steep.mul(steep.oneMinus()).mul(4.0)
          .mul(clamp(normalWorld.y, 0.0, 1.0))
          .mul(clamp(u.triplanarEdgeHighlight, 0.0, 2.0));
        texel.rgb.mulAssign(mix(vec3(1.0), vec3(1.26, 1.19, 1.04), lip));
      });
    }

    Discard(
      u.enableFoliageCutout.greaterThan(0.5)
        .and(u.foliageCutout.greaterThan(0.5))
        .and(max3(texel.rgb).lessThan(0.11)),
    );
    const paneMask = windowPaneMask(texel.rgb).toVar();
    Discard(
      u.enableWindowCutout.greaterThan(0.5)
        .and(u.windowCutout.greaterThan(0.5))
        .and(paneMask.greaterThan(0.44)),
    );

    const alpha = texel.a.mul(u.opacity).toVar();
    if (flags.hasAlphaMap) {
      If(u.enableAlphaMap.greaterThan(0.5).and(u.useAlphaMap.greaterThan(0.5)), () => {
        const alphaTexel = tex.alphaMap.sample(vUv).toVar();
        const textureAlpha = select(
          u.alphaFromLuminance.greaterThan(0.5),
          max3(alphaTexel.rgb),
          alphaTexel.a,
        );
        alpha.mulAssign(textureAlpha);
      });
    }
    Discard(
      u.enableAlphaCutout.greaterThan(0.5)
        .and(u.alphaCutoff.greaterThanEqual(0.0))
        .and(alpha.lessThan(u.alphaCutoff)),
    );

    const albedo = pow(max(texel.rgb.mul(u.baseColor), vec3(0.0)), vec3(0.92)).toVar();

    // Ground-field contact melt (the reference pack's VT blend): the base of
    // a rock or trunk takes the terrain albedo where it meets the ground.
    If(u.vtBlendStrength.greaterThan(0.0), () => {
      const ground = sampleGroundColor(vWorldPosition).toVar();
      const melt = groundBlendFactor(vWorldPosition, u.vtBlendHeight)
        .mul(clamp(u.vtBlendStrength, 0.0, 1.0)).mul(ground.a);
      albedo.assign(mix(albedo, ground.rgb, melt));
    });

    const N = normalize(vWorldNormal)
      .mul(select(frontFacing, float(1.0), float(-1.0)))
      .toVar();
    if (flags.hasNormalMap) {
      If(u.enableNormalMap.greaterThan(0.5).and(u.normalMapStrength.greaterThan(0.0)), () => {
        N.assign(lighting.perturbEnvironmentNormal(N, vWorldPosition, vUv));
      });
    }

    const upward = N.y.mul(0.5).add(0.5);
    const coolSkyTint = mix(u.skyGroundTint, u.skyTopTint, upward);

    if (flags.hasUntextured) {
      // Designed flat-color response: walls fall off gently toward the floor
      // and up-facing surfaces pick up a hint of sky.
      If(u.enableUntexturedGradient.greaterThan(0.5), () => {
        const heightT = clamp(vRoomUv.y, 0.0, 1.0);
        const floorDarkening = u.untexturedGradientStrength.mul(0.5)
          .mul(smoothstep(0.0, 0.55, heightT).oneMinus())
          .oneMinus();
        albedo.mulAssign(floorDarkening);
        albedo.mulAssign(mix(vec3(1.0), coolSkyTint, u.untexturedGradientStrength.mul(0.35)));
      });
    }

    const directional = lighting.evaluateDirectionalLight(N);
    const directLight = directional.light.mul(u.directLightStrength).toVar();
    const strongestLight = directional.strongest;

    // getShadowMask() → shared sun-shadow sampler, fed by
    // environmentSunShadowPass on the node backends (mask = 1 until it runs).
    // The Fn call is hoisted to statement level per the conventions doc's
    // hoisting guidance (docs/tsl-conventions.md, select()/If call hazards);
    // the enableShadowMask ternary becomes an If()-assigned var.
    const sampledSunShadow = sampleEnvironmentSunShadow(vWorldPosition).toVar();
    const sunlightVisibility = float(1.0).toVar();
    If(u.enableShadowMask.greaterThan(0.5), () => {
      sunlightVisibility.assign(mix(1.0, sampledSunShadow, u.sunShadowStrength));
    });
    // Drifting procedural cloud shadows over outdoor terrain; strength
    // defaults to 0 so indoor scenes are untouched.
    const proceduralCloudShadow = stylizedCloudShadow(
      vWorldPosition.xz, u.time,
      u.cloudShadowStrength, u.cloudShadowCoverage, u.cloudShadowScale, u.cloudShadowVelocity,
    );
    sunlightVisibility.mulAssign(sampleEnvironmentCloudShadow(
      vWorldPosition,
      proceduralCloudShadow,
    ));
    directLight.mulAssign(sunlightVisibility);
    strongestLight.mulAssign(sunlightVisibility);

    const geometryPosition = vViewPosition.negate(); // GLSL passes -vViewPosition
    const point = lighting.evaluatePointLights(N, geometryPosition);
    const pointLight = point.light.mul(u.pointLightStrength).toVar();
    const spot = lighting.evaluateSpotLights(N, geometryPosition);
    const spotLight = spot.light.mul(u.spotLightStrength).toVar();
    strongestLight.assign(max(strongestLight, point.strongest.mul(0.35)));
    strongestLight.assign(max(strongestLight, spot.strongest.mul(0.35)));

    const ambientBase = mix(vec3(1.0), toonSceneLights.ambientLightColor, u.ambientLightInfluence).toVar();
    // Ambient probe reshapes ambient color toward the room's own palette;
    // ambientStrength still owns the magnitude.
    If(u.enableAmbientProbe.greaterThan(0.5).and(u.ambientProbeBlend.greaterThan(0.0)), () => {
      ambientBase.assign(mix(ambientBase, lighting.environmentProbeIrradiance(N), u.ambientProbeBlend));
    });
    const ambient = ambientBase.mul(u.ambientStrength).mul(u.enableAmbientLight).toVar();
    ambient.mulAssign(mix(vec3(1.0), coolSkyTint, u.skyTintStrength.mul(u.enableSkyTint)));

    const dbgBakedGi = vec3(0.0).toVar();
    if (flags.hasLightMap) {
      // Baked GI replaces the flat ambient where a lightmap exists.
      If(u.enableLightMap.greaterThan(0.5).and(u.lightMapStrength.greaterThan(0.0)), () => {
        const baked = tex.lightMapTex.sample(envLightUv).rgb.mul(u.lightMapStrength).toVar();
        baked.assign(mix(u.shadowTintColor.mul(baked), baked, smoothstep(0.0, 0.62, envLuma(baked))));
        baked.assign(max(baked, vec3(u.lightMapLift)));
        dbgBakedGi.assign(baked);
        ambient.assign(mix(ambient, baked, clamp(u.lightMapStrength, 0.0, 1.0)));
        strongestLight.assign(max(strongestLight, smoothstep(0.55, 1.0, envLuma(baked))));
      });
    }

    // Baked occlusion multiplies indirect light only, tinted warm so shade
    // reads painted rather than gray.
    const aoMul = vec3(1.0).toVar();
    const warmOcclusionFloor = mix(vec3(0.0), u.shadowTintColor, u.aoWarmth);
    const dbgVertexAo = float(1.0).toVar();
    if (flags.hasAoMap) {
      If(u.enableAoMap.greaterThan(0.5).and(u.aoMapStrength.greaterThan(0.0)), () => {
        const aoSample = tex.aoMapTex.sample(envAoUv).r;
        const ao = mix(1.0, aoSample, u.aoMapStrength);
        aoMul.mulAssign(mix(warmOcclusionFloor, vec3(1.0), ao));
      });
    }
    if (flags.hasVertexAo) {
      If(u.enableVertexAo.greaterThan(0.5).and(u.vertexAoStrength.greaterThan(0.0)), () => {
        dbgVertexAo.assign(vEnvVertexAo);
        const vao = mix(1.0, vEnvVertexAo, u.vertexAoStrength);
        aoMul.mulAssign(mix(warmOcclusionFloor, vec3(1.0), vao));
      });
    }
    ambient.mulAssign(aoMul);

    const litColor = albedo.mul(ambient.add(directLight).add(pointLight).add(spotLight)).toVar();

    const dbgSpecular = vec3(0.0).toVar();
    If(u.enableSpecular.greaterThan(0.5).and(u.specularStrength.greaterThan(0.0)), () => {
      dbgSpecular.assign(
        lighting.evaluateEnvironmentSpecular(N, geometryPosition, sunlightVisibility)
          .mul(u.specularStrength).mul(u.specularColor),
      );
      litColor.addAssign(dbgSpecular);
    });

    const color = mix(albedo, litColor, u.lightingInfluence).toVar();
    const sunBand = smoothstep(0.45, 0.9, strongestLight);
    color.addAssign(albedo.mul(u.sunBoostColor).mul(sunBand).mul(u.sunBoost).mul(u.enableSunBoost));

    // Legacy Liyue-tuned left-edge gradient; superseded by openings-based
    // interior occlusion but preserved for the approved room look.
    const leftDarkness = smoothstep(0.16, 0.72, vRoomUv.x).oneMinus()
      .mul(smoothstep(0.78, 1.08, vRoomUv.y).oneMinus())
      .toVar();
    color.mulAssign(mix(
      vec3(1.0),
      u.leftSideShadowColor,
      leftDarkness.mul(u.leftSideShadow).mul(u.enableLeftSideShadow),
    ));

    // Interiors darken away from registered openings; inert with no openings.
    const dbgInteriorDark = float(0.0).toVar();
    If(
      u.enableInteriorOcclusion.greaterThan(0.5)
        .and(u.interiorOcclusionStrength.greaterThan(0.0))
        .and(u.environmentOpeningCount.greaterThan(0.5)),
      () => {
        const openingLight = float(0.0).toVar();
        for (let i = 0; i < 4; i += 1) {
          If(float(i).lessThan(u.environmentOpeningCount), () => {
            const opening = u.environmentOpenings.element(i);
            const reach = max(opening.w, 0.001);
            const dist = distance(vWorldPosition, opening.xyz);
            openingLight.assign(max(
              openingLight,
              smoothstep(reach.mul(0.35), reach.mul(1.45), dist).oneMinus(),
            ));
          });
        }
        dbgInteriorDark.assign(openingLight.oneMinus().mul(u.interiorOcclusionStrength));
        color.mulAssign(mix(vec3(1.0), u.interiorOcclusionColor, dbgInteriorDark));
      },
    );

    if (flags.hasPackedMap) {
      If(u.enablePackedMap.greaterThan(0.5).and(u.usePackedMap.greaterThan(0.5)), () => {
        const packed = tex.packedMap.sample(vUv).rgb.toVar();
        const packedBrightness = max3(packed);
        const materialOcclusion = mix(1.0, clamp(packed.r.mul(1.18), 0.62, 1.08), u.packedOcclusionStrength);
        const bakedGlow = smoothstep(0.62, 0.96, max(packed.r, packed.g));
        color.mulAssign(materialOcclusion);
        color.addAssign(albedo.mul(bakedGlow).mul(u.bakedGlowStrength));
        strongestLight.assign(max(strongestLight, smoothstep(0.58, 1.0, packedBrightness).mul(0.58)));
      });
    }

    // Tint alone cannot rescue a zero-valued shaded surface: zero multiplied
    // by a blue tint is still a black hole. Enforce an albedo-relative sky-lit
    // floor first, then tint the remaining shade.
    color.assign(max(color, albedo.mul(u.shadowLift).mul(0.58)));
    const liftedShadow = max(strongestLight, u.shadowLift);
    color.mulAssign(mix(u.shadowTintColor, vec3(1.0), liftedShadow));

    const emissiveMask = float(0.0).toVar();
    if (flags.hasEmissiveMap) {
      // A real emissive map replaces the bright-albedo luminance guess.
      const emissiveTexel = tex.emissiveMapTex.sample(vUv).rgb
        .mul(u.emissiveMapColor).mul(u.emissiveMapStrength);
      color.addAssign(emissiveTexel.mul(u.enableEmissive));
      emissiveMask.assign(envLuma(emissiveTexel));
    } else {
      emissiveMask.assign(smoothstep(0.68, 1.0, max3(albedo)));
      color.addAssign(albedo.mul(emissiveMask).mul(u.emissiveStrength).mul(u.enableEmissive));
      emissiveMask.mulAssign(u.emissiveStrength);
    }

    if (flags.hasPlanarReflection) {
      // Mirrored-scene reflection for glossy floors; fresnel keeps it
      // strongest at grazing angles like lacquer.
      If(u.enablePlanarReflection.greaterThan(0.5).and(u.planarReflectionStrength.greaterThan(0.0)), () => {
        const reflectionUv = u.planarReflectionMatrix.mul(vec4(vWorldPosition, 1.0));
        // texture2DProj(map, uv4) — divide by w; RT-fed textures sample at
        // explicit level 0 (docs/tsl-conventions.md gotcha 9).
        const reflection = tex.planarReflectionMap
          .sample(reflectionUv.xy.div(reflectionUv.w)).level(0).rgb;
        const toCamera = normalize(cameraPosition.sub(vWorldPosition));
        const fresnel = pow(
          clamp(dot(N, toCamera), 0.0, 1.0).oneMinus(),
          max(u.planarReflectionFresnel, 0.001),
        );
        color.assign(mix(
          color,
          reflection,
          clamp(u.planarReflectionStrength.mul(mix(0.16, 1.0, fresnel)), 0.0, 1.0),
        ));
      });
    }

    // When the camera is below an active WaterSurface, the seabed is drawn
    // directly instead of being seen through the water material. Receive the
    // same moving sunlight here; the shared updater keeps this inert above
    // water, where the surface shader already composites its own caustics.
    color.addAssign(
      projectedWaterCaustics(vWorldPosition, normalWorld).mul(sunlightVisibility),
    );

    color.assign(applySaturation(color.mul(u.exposure), u.saturation));

    // World-height fog: dense near the environment floor, fading with height.
    If(u.enableHeightFog.greaterThan(0.5).and(u.heightFogDensity.greaterThan(0.0)), () => {
      const floorY = u.environmentCenter.y.sub(u.environmentSize.y.mul(0.5));
      const heightFalloff = exp(
        max(vWorldPosition.y.sub(floorY), 0.0).div(max(u.heightFogFalloff, 0.001)).negate(),
      );
      const depthTerm = exp(length(vViewPosition).mul(u.heightFogDensity).negate()).oneMinus();
      color.assign(mix(color, u.heightFogColor, clamp(depthTerm.mul(heightFalloff), 0.0, 1.0)));
    });

    const finalColor = vec4(max(color, vec3(0.0)), alpha);

    // Debug table (masked sum). envDebugMode 0 matches no entry, so the
    // result is exactly finalColor during normal rendering — the ENV_DEBUG_VIEWS
    // define flip becomes a pure uniform write on this backend.
    return environmentDebugColor({
      albedo,
      alpha,
      ambient,
      aoMul,
      bakedGi: dbgBakedGi,
      directLight,
      emissiveMask,
      finalColor,
      litColor,
      mode: u.envDebugMode,
      normal: N,
      pointLight,
      roomOcclusion: clamp(
        dbgInteriorDark.add(leftDarkness.mul(u.leftSideShadow).mul(u.enableLeftSideShadow)),
        0.0,
        1.0,
      ),
      specular: dbgSpecular,
      spotLight,
      sunlightVisibility,
      vertexAo: dbgVertexAo,
      windowMask: paneMask,
    });
  })();

  // Same-name uniform slots (ShaderMaterial-compatible `.value` access).
  material.uniforms = u;
  material.userData.isEnvironmentNodeMaterial = true;
  material.userData.environmentTslFlags = { ...flags };

  return material;
}
