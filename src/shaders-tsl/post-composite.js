// TSL port of the post-processing final composite pass and the pyramid
// (dual-filter mip chain) bloom passes from src/post/postProcessing.js.
// Consumed by postProcessing.js's createFinalCompositeMaterial /
// createBloomPassMaterial call sites on the TSL backend; every material here
// exposes `.uniforms` under the exact GLSL uniform names so the shared,
// backend-agnostic settings code (applyCompositeSettings, renderBloomPyramid,
// setCharacterMask) keeps working unchanged on both backends
// (docs/tsl-conventions.md, "The .uniforms compatibility surface").
//
// ---------------------------------------------------------------------------
// Color-space audit
// ---------------------------------------------------------------------------
// This is the one place in the post stack where the node renderer's implicit
// output encode structurally differs from the classic pipeline's explicit
// encode, so read this before touching any texture read below.
//
// Classic: anime.frag.glsl / environment.frag.glsl / grass.frag.glsl each
// end with `#include <colorspace_fragment>` — but linearToOutputTexel is
// compiled PER RENDER TARGET: three picks the transfer function from the
// bound target's texture.colorSpace, not from renderer.outputColorSpace.
// The post pipeline's offscreen `target.texture` is explicitly NoColorSpace,
// so when classic renders the scene into it the baked include is an
// IDENTITY and the buffer holds LINEAR color; the one real sRGB encode
// happens in this composite's own trailing include when it draws to the
// sRGB canvas. Net classic behavior: encode(composite-math(linearScene)) —
// a SINGLE encode. (An earlier revision of this port assumed the include
// was unconditional and double-encoded; measured on the live pipeline,
// post-on classic differs from post-off classic only by the composite math
// itself, proving the single-encode reading.)
//
// Node renderer: color-space conversion is not baked into materials at all;
// it happens exactly once, automatically, as the renderer's terminal output
// pass when drawing to the default framebuffer (renderer/common/Renderer.js
// `_renderOutput`), and never when rendering into our own offscreen target.
// So the node chain ALREADY matches classic with no compensation: scene ->
// target holds linear color (same as classic's identity-encoded buffer),
// the composite math runs in linear (same domain as classic), and the
// terminal canvas pass supplies the single encode (same as classic's
// trailing include). Therefore: NO manual sRGBTransfer* call anywhere in
// this file — adding one washes the whole frame out by a spare encode
// (measured: +191/255 mean vs classic). renderer.toneMapping is
// NoToneMapping project-wide, so the tone-mapping half of the terminal pass
// is a no-op either way.
//
// tBloom / bloom-chain intermediate textures (downsample/upsample) are NOT
// re-encoded — they're already downstream of the prefilter's one manual
// encode, exactly like classic never re-encodes mid-chain either. tDepth is
// a linear window-depth value (never color-space encoded in either
// pipeline). tCharacterMask is a binary 0/1 mask (encode-invariant at both
// endpoints) so it is read raw.

import * as THREE from 'three';
import {
  abs,
  clamp,
  distance,
  dot,
  float,
  exp,
  floor,
  fract,
  Fn,
  If,
  length,
  max,
  min,
  mix,
  pow,
  positionLocal,
  screenCoordinate,
  sign,
  smoothstep,
  texture,
  uniform,
  uv,
  vec2,
  vec3,
  vec4,
  viewZToOrthographicDepth,
  perspectiveDepthToViewZ,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { environmentStateUniformNodes } from './chunks/environment-state.js';

// Shared 1x1 placeholder so every optional texture uniform (tLut,
// tCharacterMask, tBloom, and the not-yet-wired tDepth/tDiffuse at
// construction time) always has a real bound texture. Classic tolerates a
// `null` sampler uniform because it is only ever read inside an `if` guard
// that is false whenever the uniform is unset; the node backends bind every
// declared texture unconditionally regardless of runtime branching, so a
// `null` TextureNode.value is unsafe even inside a runtime-gated `If()`
// (docs/tsl-conventions.md gotcha 9 territory — same "always keep a valid
// fallback bound" rule as the character material's fallback texture).
let sharedFallbackTexture = null;
export function fallbackPostTexture() {
  if (!sharedFallbackTexture) {
    sharedFallbackTexture = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);
    sharedFallbackTexture.needsUpdate = true;
  }
  return sharedFallbackTexture;
}

function luma(color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

function applySaturationHelper(color, amount) {
  return mix(vec3(luma(color)), color, amount);
}

// Raw NDC passthrough matching the classic bloom passes' vertex shader
// (`gl_Position = vec4(position.xy, 0.0, 1.0)`), which ignores the camera
// entirely — the bloom quad mesh's own [-1,1] geometry IS clip space.
// Assigning `material.vertexNode` directly (rather than `positionNode`)
// bypasses NodeMaterial's default MVP transform, mirroring GLSL exactly.
const bloomQuadVertexNode = vec4(positionLocal.xy, 0.0, 1.0);

function createBloomPassMaterialBase(name) {
  const material = new NodeMaterial();
  material.name = name;
  material.depthTest = false;
  material.depthWrite = false;
  material.fog = false;
  material.lights = false;
  material.vertexNode = bloomQuadVertexNode;
  return material;
}

/**
 * Bloom prefilter: thresholds target.texture (character-mask aware) into the
 * first mip of the pyramid chain. TSL port of bloomPrefilterFragmentShader.
 */
// Scales the saturation of bloom from character pixels (mask = 1), keeping its
// luminance, so warm skin blooms warm instead of washing to white.
function saturateCharacterBloom(excess, mask, saturation) {
  const grey = vec3(luma(excess));
  const amount = mix(float(1.0), saturation, mask);
  return max(mix(grey, excess, amount), vec3(0.0));
}

export function createBloomPrefilterNodeMaterial() {
  const u = {
    bloomBackgroundSuppress: uniform(1),
    bloomCharacterBoost: uniform(1),
    bloomCharacterSaturation: uniform(1),
    bloomThreshold: uniform(0.9),
    tCharacterMask: texture(fallbackPostTexture()),
    tInput: texture(fallbackPostTexture()),
    useCharacterMask: uniform(0),
  };

  const material = createBloomPassMaterialBase('PostProcessing.BloomPrefilterNode');
  material.fragmentNode = Fn(() => {
    const sampleUv = uv();
    // Raw linear read — see the file header color-space audit: the scene
    // buffer is linear on both pipelines, exactly like classic's prefilter
    // input; no transfer function anywhere in the chain.
    const color = u.tInput.sample(sampleUv).level(0).rgb;
    const brightness = luma(color);
    const bright = smoothstep(u.bloomThreshold, 1.0, brightness);
    const excess = max(color.sub(u.bloomThreshold), vec3(0.0));
    const mask = u.tCharacterMask.sample(sampleUv).level(0).r;
    // mix()-based equivalent of `if (useCharacterMask > 0.5) { ... }`: safe
    // because useCharacterMask is always exactly 0.0 or 1.0 (never
    // fractional), and tCharacterMask always has a valid fallback bound, so
    // unconditionally sampling it changes nothing observable while avoiding
    // an extra If() purely for a cheap scalar blend.
    const maskWeight = mix(1.0, mix(u.bloomBackgroundSuppress, u.bloomCharacterBoost, mask), u.useCharacterMask);
    return vec4(saturateCharacterBloom(excess, mask.mul(u.useCharacterMask), u.bloomCharacterSaturation).mul(bright).mul(maskWeight), 1.0);
  })();
  material.uniforms = u;
  return material;
}

/**
 * Bloom downsample: 5-tap box filter, one pyramid level narrower. TSL port
 * of bloomDownsampleFragmentShader.
 */
export function createBloomDownsampleNodeMaterial() {
  const u = {
    tInput: texture(fallbackPostTexture()),
    texelSize: uniform(new THREE.Vector2()),
  };

  const material = createBloomPassMaterialBase('PostProcessing.BloomDownsampleNode');
  material.fragmentNode = Fn(() => {
    const sampleUv = uv();
    const halfTexel = u.texelSize.mul(0.5);
    const sum = u.tInput.sample(sampleUv).level(0).rgb.mul(4.0).toVar();
    sum.addAssign(u.tInput.sample(sampleUv.sub(halfTexel)).level(0).rgb);
    sum.addAssign(u.tInput.sample(sampleUv.add(halfTexel)).level(0).rgb);
    sum.addAssign(u.tInput.sample(sampleUv.add(vec2(halfTexel.x, halfTexel.y.negate()))).level(0).rgb);
    sum.addAssign(u.tInput.sample(sampleUv.sub(vec2(halfTexel.x, halfTexel.y.negate()))).level(0).rgb);
    return vec4(sum.div(8.0), 1.0);
  })();
  material.uniforms = u;
  return material;
}

/**
 * Bloom upsample: 8-tap tent filter, accumulating the narrower level back
 * onto the wider one. TSL port of bloomUpsampleFragmentShader.
 */
export function createBloomUpsampleNodeMaterial() {
  const u = {
    bloomSpread: uniform(1),
    tAccumulate: texture(fallbackPostTexture()),
    tInput: texture(fallbackPostTexture()),
    texelSize: uniform(new THREE.Vector2()),
  };

  const material = createBloomPassMaterialBase('PostProcessing.BloomUpsampleNode');
  material.fragmentNode = Fn(() => {
    const sampleUv = uv();
    const t = u.texelSize.mul(u.bloomSpread);
    const sum = u.tInput.sample(sampleUv.add(vec2(t.x.mul(-2.0), 0.0))).level(0).rgb.toVar();
    sum.addAssign(u.tInput.sample(sampleUv.add(vec2(t.x.negate(), t.y))).level(0).rgb.mul(2.0));
    sum.addAssign(u.tInput.sample(sampleUv.add(vec2(0.0, t.y.mul(2.0)))).level(0).rgb);
    sum.addAssign(u.tInput.sample(sampleUv.add(vec2(t.x, t.y))).level(0).rgb.mul(2.0));
    sum.addAssign(u.tInput.sample(sampleUv.add(vec2(t.x.mul(2.0), 0.0))).level(0).rgb);
    sum.addAssign(u.tInput.sample(sampleUv.add(vec2(t.x, t.y.negate()))).level(0).rgb.mul(2.0));
    sum.addAssign(u.tInput.sample(sampleUv.add(vec2(0.0, t.y.mul(-2.0)))).level(0).rgb);
    sum.addAssign(u.tInput.sample(sampleUv.add(vec2(t.x.negate(), t.y.negate()))).level(0).rgb.mul(2.0));
    return vec4(sum.div(12.0).add(u.tAccumulate.sample(sampleUv).level(0).rgb), 1.0);
  })();
  material.uniforms = u;
  return material;
}

/**
 * Final composite: motion blur, single-pass or pyramid bloom add, depth cue,
 * color grade, LUT, vertical grade, screen outline, vignette, strength
 * blend, dither. TSL port of FinalCompositeShader. `.uniforms` exposes every
 * GLSL uniform name so applyCompositeSettings() in postProcessing.js works
 * unchanged.
 */
export function createPostCompositeNodeMaterial() {
  const u = {
    bloomBackgroundSuppress: uniform(1.0),
    bloomCharacterBoost: uniform(1.0),
    bloomCharacterSaturation: uniform(1.0),
    bloomRadius: uniform(0.28),
    bloomStrength: uniform(0.0),
    bloomThreshold: uniform(0.84),
    tBloom: texture(fallbackPostTexture()),
    useBloomTexture: uniform(0.0),
    tCharacterMask: texture(fallbackPostTexture()),
    useCharacterMask: uniform(0.0),
    useMotionBlur: uniform(0.0),
    motionBlurStrength: uniform(0.0),
    motionBlurInverseViewProjection: uniform(new THREE.Matrix4()),
    motionBlurPreviousViewProjection: uniform(new THREE.Matrix4()),
    bottomDark: uniform(0.0),
    cameraFar: uniform(100.0),
    cameraNear: uniform(0.1),
    contrast: uniform(1.0),
    depthCueColor: uniform(new THREE.Color(0x9db7d8)),
    depthCueFar: uniform(24.0),
    depthCueNear: uniform(1.0),
    depthCueStrength: uniform(0.0),
    // Two-layer stylized atmosphere (the reference sky system's signature
    // fog): a scene-color mix fog with height falloff + an additive glow fog
    // centered on the sun/moon. Colors and glow parameters come from the
    // shared environment state so the day cycle drives them scene-wide.
    useAtmosphere: uniform(0.0),
    atmosphereStrength: uniform(0.55),
    atmosphereNear: uniform(60.0),
    atmosphereFar: uniform(900.0),
    atmosphereHeightFalloff: uniform(0.012),
    atmosphereBaseHeight: uniform(0.0),
    atmosphereGlowStrength: uniform(1.0),
    atmosphereInverseViewProjection: uniform(new THREE.Matrix4()),
    atmosphereViewProjection: uniform(new THREE.Matrix4()),
    atmosphereCameraPosition: uniform(new THREE.Vector3()),
    atmosphereAspect: uniform(16 / 9),
    exposure: uniform(1.0),
    tLut: texture(fallbackPostTexture()),
    lutSize: uniform(0.0),
    lutStrength: uniform(0.0),
    outlineColor: uniform(new THREE.Color(0x10131a)),
    outlineDepthStrength: uniform(0.0),
    outlineLumaStrength: uniform(0.0),
    outlineStrength: uniform(0.0),
    resolution: uniform(new THREE.Vector2(1, 1)),
    saturation: uniform(1.0),
    strength: uniform(1.0),
    // Float-color scene depth (docs/tsl-conventions.md gotcha 5) written by
    // the auto-gated prepass in postProcessing.js — NOT a classic
    // THREE.DepthTexture. Same [0,1] window-depth convention, so
    // perspectiveDepthToViewZ below is unchanged from the classic formula.
    tDepth: texture(fallbackPostTexture()),
    tDiffuse: texture(fallbackPostTexture()),
    topLight: uniform(0.0),
    useColorGrade: uniform(0.0),
    useDepthCue: uniform(0.0),
    useScreenOutline: uniform(0.0),
    useVignette: uniform(0.0),
    useVerticalGrade: uniform(0.0),
    vignetteRadius: uniform(0.72),
    vignetteSoftness: uniform(0.34),
    vignetteStrength: uniform(0.0),
    warmth: uniform(0.0),
  };

  // ---- Helpers (closures over u; docs/tsl-conventions.md "leaf helpers
  //      that map nodes->nodes are Fn() exports") ----

  // RT-orientation gap (docs/tsl-conventions.md gotcha 6, projective-sample
  // form): this material is the one RT->canvas pass in the chain, and the
  // node backends store render-target rows top-down relative to the canvas
  // quad's uv — every fetch from an offscreen target must flip v. Screen-
  // anchored math (vignette, bottom/top gradients, NDC reconstruction) keeps
  // the raw quad uv; RT->RT bloom passes are self-consistent and don't flip.
  const rtUv = Fn(([sampleUv]) => vec2(sampleUv.x, sampleUv.y.oneMinus()));

  // Raw linear read — see the file header color-space audit: the offscreen
  // buffer holds linear color on BOTH pipelines (classic's baked include is
  // identity for a NoColorSpace target), so no transfer function here.
  const sampleSceneColor = Fn(([sampleUv]) => {
    return u.tDiffuse.sample(rtUv(sampleUv)).level(0).rgb;
  });

  const readLinearDepth = Fn(([sampleUv]) => {
    const fragCoordZ = u.tDepth.sample(rtUv(sampleUv)).level(0).x;
    const viewZ = perspectiveDepthToViewZ(fragCoordZ, u.cameraNear, u.cameraFar);
    return viewZToOrthographicDepth(viewZ, u.cameraNear, u.cameraFar);
  });

  // View distance in METERS — depthCue/atmosphere parameters are authored in
  // world units (depthCueFar: 1250 means 1250 m), so comparing them against
  // the [0,1] normalized depth above silently disabled the whole stage.
  const readViewDistance = Fn(([sampleUv]) => {
    const fragCoordZ = u.tDepth.sample(rtUv(sampleUv)).level(0).x;
    return perspectiveDepthToViewZ(fragCoordZ, u.cameraNear, u.cameraFar).negate();
  });

  // World-position reconstruction from the depth prepass (same NDC math the
  // motion-blur stage uses).
  const reconstructWorldPosition = Fn(([sampleUv]) => {
    const fragDepth = u.tDepth.sample(rtUv(sampleUv)).level(0).x;
    const ndc = vec4(sampleUv.mul(2.0).sub(1.0), fragDepth.mul(2.0).sub(1.0), 1.0);
    const world = u.atmosphereInverseViewProjection.mul(ndc).toVar();
    return world.xyz.div(world.w);
  });

  const sampleLutSlice = Fn(([color, slice]) => {
    const uCoord = slice.mul(u.lutSize).add(0.5).add(color.r.mul(u.lutSize.sub(1.0))).div(u.lutSize.mul(u.lutSize));
    const vCoord = float(0.5).add(color.g.mul(u.lutSize.sub(1.0))).div(u.lutSize);
    return u.tLut.sample(vec2(uCoord, vCoord)).level(0).rgb;
  });

  const applyLut = Fn(([color]) => {
    const clamped = clamp(color, 0.0, 1.0).toVar();
    const blue = clamped.b.mul(u.lutSize.sub(1.0));
    const slice0 = floor(blue);
    const slice1 = min(slice0.add(1.0), u.lutSize.sub(1.0));
    return mix(sampleLutSlice(clamped, slice0), sampleLutSlice(clamped, slice1), blue.sub(slice0));
  });

  const brightSample = Fn(([sampleUv]) => {
    const color = sampleSceneColor(sampleUv);
    const bright = smoothstep(u.bloomThreshold, 1.0, luma(color));
    const excess = max(color.sub(u.bloomThreshold), vec3(0.0));
    const mask = u.tCharacterMask.sample(rtUv(sampleUv)).level(0).r;
    const maskWeight = mix(1.0, mix(u.bloomBackgroundSuppress, u.bloomCharacterBoost, mask), u.useCharacterMask);
    return saturateCharacterBloom(excess, mask.mul(u.useCharacterMask), u.bloomCharacterSaturation).mul(bright).mul(maskWeight);
  });

  const bloomSample = Fn(([texel, centerUv]) => {
    const radius = max(u.bloomRadius, 0.001).mul(8.0);
    const offsetX = vec2(texel.x.mul(radius), 0.0);
    const offsetY = vec2(0.0, texel.y.mul(radius));
    const offsetD = vec2(texel.x.mul(radius).mul(0.7071), texel.y.mul(radius).mul(0.7071));

    const bloom = brightSample(centerUv).mul(0.2).toVar();
    bloom.addAssign(brightSample(centerUv.add(offsetX)).mul(0.1));
    bloom.addAssign(brightSample(centerUv.sub(offsetX)).mul(0.1));
    bloom.addAssign(brightSample(centerUv.add(offsetY)).mul(0.1));
    bloom.addAssign(brightSample(centerUv.sub(offsetY)).mul(0.1));
    bloom.addAssign(brightSample(centerUv.add(offsetD)).mul(0.075));
    bloom.addAssign(brightSample(centerUv.sub(offsetD)).mul(0.075));
    bloom.addAssign(brightSample(centerUv.add(vec2(offsetD.x, offsetD.y.negate()))).mul(0.075));
    bloom.addAssign(brightSample(centerUv.add(vec2(offsetD.x.negate(), offsetD.y))).mul(0.075));
    return bloom;
  });

  const lumaEdge = Fn(([texel, centerUv]) => {
    const lumaAt = (offsetUv) => luma(sampleSceneColor(offsetUv));
    const center = lumaAt(centerUv);
    const horizontal = abs(lumaAt(centerUv.add(vec2(texel.x, 0.0))).sub(center))
      .add(abs(lumaAt(centerUv.sub(vec2(texel.x, 0.0))).sub(center)));
    const vertical = abs(lumaAt(centerUv.add(vec2(0.0, texel.y))).sub(center))
      .add(abs(lumaAt(centerUv.sub(vec2(0.0, texel.y))).sub(center)));
    return horizontal.add(vertical);
  });

  const depthEdge = Fn(([texel, centerUv]) => {
    const center = readLinearDepth(centerUv);
    const horizontal = abs(readLinearDepth(centerUv.add(vec2(texel.x, 0.0))).sub(center))
      .add(abs(readLinearDepth(centerUv.sub(vec2(texel.x, 0.0))).sub(center)));
    const vertical = abs(readLinearDepth(centerUv.add(vec2(0.0, texel.y))).sub(center))
      .add(abs(readLinearDepth(centerUv.sub(vec2(0.0, texel.y))).sub(center)));
    return horizontal.add(vertical);
  });

  const material = new NodeMaterial();
  material.name = 'PostProcessing.FinalCompositeNode';
  material.depthTest = false;
  material.depthWrite = false;
  material.fog = false;
  material.lights = false;

  material.fragmentNode = Fn(() => {
    const vUv = uv();

    const rawSource = u.tDiffuse.sample(rtUv(vUv)).level(0).toVar();
    const sourceAlpha = rawSource.a;
    const originalColor = rawSource.rgb.toVar();

    If(u.useMotionBlur.greaterThan(0.5), () => {
      const fragDepth = u.tDepth.sample(rtUv(vUv)).level(0).x;
      const ndc = vec4(vUv.mul(2.0).sub(1.0), fragDepth.mul(2.0).sub(1.0), 1.0);
      const worldPos = u.motionBlurInverseViewProjection.mul(ndc).toVar();
      worldPos.assign(worldPos.div(worldPos.w));
      const prevClip = u.motionBlurPreviousViewProjection.mul(worldPos);
      const prevUv = prevClip.xy.div(max(abs(prevClip.w), 1e-6)).mul(sign(prevClip.w)).mul(0.5).add(0.5);
      const velocity = vUv.sub(prevUv).mul(u.motionBlurStrength).toVar();
      const speed = length(velocity);
      If(speed.greaterThan(0.0001), () => {
        velocity.assign(velocity.mul(min(1.0, float(0.05).div(speed))));
        const blurSum = originalColor.toVar();
        for (let i = 1; i < 8; i += 1) {
          blurSum.addAssign(sampleSceneColor(vUv.add(velocity.mul(float(i).div(7.0).sub(0.5)))));
        }
        originalColor.assign(blurSum.div(8.0));
      });
    });

    const color = originalColor.toVar();
    const texel = vec2(1.0).div(max(u.resolution, vec2(1.0)));

    If(u.useBloomTexture.greaterThan(0.5), () => {
      color.addAssign(u.tBloom.sample(rtUv(vUv)).level(0).rgb.mul(u.bloomStrength));
    }).ElseIf(u.bloomStrength.greaterThan(0.0), () => {
      color.addAssign(bloomSample(texel, vUv).mul(u.bloomStrength));
    });

    If(u.useDepthCue.greaterThan(0.5), () => {
      const viewDistance = readViewDistance(vUv);
      const cue = smoothstep(u.depthCueNear, u.depthCueFar, viewDistance).mul(u.depthCueStrength);
      color.assign(mix(color, u.depthCueColor, cue));
    });

    If(u.useAtmosphere.greaterThan(0.5), () => {
      const env = environmentStateUniformNodes;
      const viewDistance = readViewDistance(vUv).toVar();
      const worldPosition = reconstructWorldPosition(vUv).toVar();

      // Layer 1 — atmospheric mix fog: fades the world toward the state fog
      // color with distance, thinning with altitude so peaks stay clear.
      const heightAbove = max(worldPosition.y.sub(u.atmosphereBaseHeight), 0.0);
      const heightWeight = exp(heightAbove.mul(u.atmosphereHeightFalloff).negate());
      const fogAmount = smoothstep(u.atmosphereNear, max(u.atmosphereFar, u.atmosphereNear.add(1.0)), viewDistance)
        .mul(clamp(u.atmosphereStrength, 0.0, 1.0))
        .mul(heightWeight)
        .toVar();
      color.assign(mix(color, env.atmosphereFogColor, clamp(fogAmount, 0.0, 0.97)));

      // Layer 2 — additive celestial glow fog: a depth-aware halo around the
      // screen-projected sun/moon. This is what builds the multi-colored
      // sunrise/sunset gradients over the far landscape.
      const glowTotal = env.atmosphereGlowIntensity.mul(u.atmosphereGlowStrength);
      If(glowTotal.greaterThan(0.001), () => {
        const addGlow = (direction, bodyColor, visibility) => {
          const clip = u.atmosphereViewProjection.mul(
            vec4(u.atmosphereCameraPosition.add(direction.mul(1000.0)), 1.0),
          ).toVar();
          If(clip.w.greaterThan(0.0), () => {
            const bodyUv = clip.xy.div(clip.w).mul(0.5).add(0.5);
            const offset = vUv.sub(bodyUv).mul(vec2(u.atmosphereAspect, 1.0));
            const halo = pow(
              clamp(length(offset).div(max(env.atmosphereGlowSpread, 0.01)).oneMinus(), 0.0, 1.0),
              2.2,
            );
            // Far pixels only: the glow is fog lit by the body, not a lens
            // flare — nearby geometry keeps its own color.
            const depthWeight = smoothstep(u.atmosphereNear.mul(0.4), u.atmosphereFar.mul(0.8), viewDistance);
            color.addAssign(
              env.atmosphereGlowColor.mul(bodyColor)
                .mul(halo).mul(depthWeight).mul(glowTotal).mul(visibility),
            );
          });
        };
        addGlow(env.sunDirection, vec3(1.0), env.sunVisibility);
        addGlow(env.moonDirection, env.moonColor, env.moonVisibility.mul(env.moonIntensity));
      });
    });

    If(u.useColorGrade.greaterThan(0.5), () => {
      color.mulAssign(u.exposure);
      color.assign(color.sub(0.5).mul(u.contrast).add(0.5));
      color.assign(applySaturationHelper(color, u.saturation));
      color.mulAssign(vec3(
        u.warmth.add(1.0),
        u.warmth.mul(0.35).add(1.0),
        u.warmth.mul(-0.55).add(1.0),
      ));
    });

    If(u.lutStrength.greaterThan(0.0).and(u.lutSize.greaterThan(1.5)), () => {
      color.assign(mix(color, applyLut(color), clamp(u.lutStrength, 0.0, 1.0)));
    });

    If(u.useVerticalGrade.greaterThan(0.5), () => {
      const top = smoothstep(0.36, 1.0, vUv.y).mul(u.topLight);
      const bottom = smoothstep(0.0, 0.72, vUv.y).oneMinus().mul(u.bottomDark);
      color.addAssign(vec3(1.0, 0.92, 0.78).mul(top));
      color.mulAssign(bottom.oneMinus());
    });

    If(u.useScreenOutline.greaterThan(0.5), () => {
      const edge = lumaEdge(texel, vUv).mul(u.outlineLumaStrength).add(depthEdge(texel, vUv).mul(u.outlineDepthStrength));
      const edgeMask = smoothstep(0.02, 0.18, edge).mul(u.outlineStrength);
      color.assign(mix(color, u.outlineColor, clamp(edgeMask, 0.0, 1.0)));
    });

    If(u.useVignette.greaterThan(0.5), () => {
      const dist = distance(vUv, vec2(0.5));
      const vignetteMask = smoothstep(u.vignetteRadius, u.vignetteRadius.add(u.vignetteSoftness), dist);
      color.mulAssign(vignetteMask.mul(u.vignetteStrength).oneMinus());
    });

    color.assign(mix(originalColor, color, clamp(u.strength, 0.0, 1.0)));

    // Interleaved-gradient dither (see FinalCompositeShader) — pixel
    // coordinates via screenCoordinate, the TSL equivalent of gl_FragCoord.xy
    // already used the same way in the character material's Bayer dither.
    const gradientNoise = fract(dot(screenCoordinate.xy, vec2(0.06711056, 0.00583715)));
    const dither = fract(gradientNoise.mul(52.9829189));
    color.addAssign(dither.sub(0.5).mul(1.5 / 255.0));

    // No manual tone-mapping/color-space re-encode here — see the file
    // header color-space audit. The renderer's automatic terminal-canvas
    // output pass supplies the second encode (matching classic's own second
    // `colorspace_fragment` include); adding one here would double-apply it.
    return vec4(max(color, vec3(0.0)), sourceAlpha);
  })();

  material.uniforms = u;
  return material;
}
