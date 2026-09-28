// TSL port of src/shaders/waterBreaker.vert.glsl + waterBreaker.frag.glsl —
// the dedicated plunging-breaker shells that ride the dominant Gerstner crest.
//
// The shell must read as the SAME water as the open sea, so the fragment runs
// the surface's shading stack through the shared water chunks, and the
// factory can adopt the surface material's uniform NODES for the shared
// lighting/wave uniforms (`shared` option). Sharing node objects across
// materials is the TSL equivalent of the classic uniforms-by-reference wiring
// in WaterBreakerSystem.attachWaveUniforms — swapping entries in `.uniforms`
// after the graph is built would NOT rewire it, so attachWaveUniforms rebuilds
// the material through this factory instead (before first render).
//
// TODO(tsl Phase 7): fog ordering — GLSL fogs after colorspace; scene fog is
// disabled here until the fog phase resolves the ordering.

import * as THREE from 'three';
import {
  clamp,
  cos,
  cross,
  Discard,
  dot,
  float,
  Fn,
  If,
  length,
  max,
  min,
  mix,
  modelWorldMatrix,
  normalize,
  positionGeometry,
  select,
  sin,
  smoothstep,
  sqrt,
  step,
  texture,
  uniform,
  uniformArray,
  varying,
  vec2,
  vec3,
  vec4,
  attribute,
  cameraPosition,
  cameraProjectionMatrix,
  cameraViewMatrix,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';

import { waterCombineNormal, waterFbm } from './chunks/water-common.js';
import { createWaterFoamChunk } from './chunks/water-foam.js';
import { createWaterLightingChunk } from './chunks/water-lighting.js';
import { createWaterWavesChunk } from './chunks/water-waves.js';
import { resolveWaterArrayUniformNode, waterArrayUniformEntry } from './water.js';
import { sampleEnvironmentSunShadow } from './chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';

const PI = Math.PI;
const PI2 = Math.PI * 2;

let placeholderReflection = null;
function getPlaceholderReflection() {
  if (!placeholderReflection) {
    placeholderReflection = new THREE.DataTexture(
      new Uint8Array([126, 190, 218, 255]), 1, 1, THREE.RGBAFormat);
    placeholderReflection.needsUpdate = true;
  }
  return placeholderReflection;
}

// Uniform names adopted from the owning surface material when `shared` is
// given — must stay in sync with SHARED_SURFACE_UNIFORMS in
// waterBreakerSystem.js (which drives the classic by-reference sharing).
const SHARABLE = [
  'uWavesA', 'uWavesB',
  'uShallowColor', 'uMidColor', 'uDeepColor', 'uFoamColor', 'uFoamNoiseScale',
  'uFoamContactDistance', 'uFoamLineSpacing', 'uWhitecapAmount',
  'uSunDirection', 'uSunColor',
  'uFlowDirection', 'uFlowSpeed', 'uDetailScale', 'uDetailNormalStrength',
  'uSpecularStrength', 'uSpecularShininess', 'uSpecularStretch',
  'uSparkleStrength', 'uSparkleScale', 'uSparkleSpeed', 'uSunGlowStrength',
  'uFresnelStrength', 'uFresnelPower', 'uFresnelBias', 'uFresnelColor',
  'uSkyZenithColor', 'uSkyHorizonColor',
  'uReflectionMap', 'uReflectionMatrix', 'uUseReflectionMap',
  'uReflectionStrength', 'uReflectionDistortion', 'uReflectionSoftness',
];

/**
 * options.waveCount    WATER_WAVE_COUNT (must match the shared wave arrays)
 * options.foamOctaves  WATER_FOAM_OCTAVES
 * options.shared       uniform-node map of the owning surface material; the
 *                      SHARABLE subset is adopted by reference.
 * options.previous     uniform-node map of a previous breaker material; own
 *                      (non-shared) uniforms are reused so values persist
 *                      across the attachWaveUniforms rebuild.
 */
export function createWaterBreakerNodeMaterial({
  waveCount,
  foamOctaves = 3,
  shared = null,
  previous = null,
} = {}) {
  const own = {
    uTime: uniform(0),
    uBreakerAmount: uniform(0),
    uBreakerCurl: uniform(0.8),
    uBreakerScale: uniform(1),
    uBreakerPeel: uniform(1),
    uShoalingDepth: uniform(1.4),
    uShorelineWaves: uniform(0.35),
    uWaveEnergy: uniform(0.3),
    uSetPair: uniform(0),
    uShallowColor: uniform(new THREE.Color()),
    uMidColor: uniform(new THREE.Color()),
    uDeepColor: uniform(new THREE.Color()),
    uFoamColor: uniform(new THREE.Color()),
    uSunDirection: uniform(new THREE.Vector3(0, 1, 0)),
    uSunColor: uniform(new THREE.Color()),
    uFoamNoiseScale: uniform(0.6),
    // The shared foam chunk needs these declared; scene depth is never
    // available on the shell, so the shoreline-foam path stays off.
    uUseSceneDepth: uniform(0),
    uFoamContactDistance: uniform(1),
    uFoamLineSpacing: uniform(1.4),
    uWhitecapAmount: uniform(0.3),
    uFlowDirection: uniform(new THREE.Vector2(1, 0)),
    uFlowSpeed: uniform(0.35),
    uDetailScale: uniform(0.5),
    uDetailNormalStrength: uniform(0.5),
    uSpecularStrength: uniform(0.8),
    uSpecularShininess: uniform(120),
    uSpecularStretch: uniform(0.5),
    uSparkleStrength: uniform(0.5),
    uSparkleScale: uniform(1.2),
    uSparkleSpeed: uniform(1),
    uSunGlowStrength: uniform(0.6),
    uFresnelStrength: uniform(0.6),
    uFresnelPower: uniform(3),
    uFresnelBias: uniform(0.12),
    uFresnelColor: uniform(new THREE.Color(1, 1, 1)),
    uSkyZenithColor: uniform(new THREE.Color(0.35, 0.58, 0.85)),
    uSkyHorizonColor: uniform(new THREE.Color(0.85, 0.92, 1.0)),
    uReflectionMap: texture(getPlaceholderReflection()),
    uReflectionMatrix: uniform(new THREE.Matrix4()),
    uUseReflectionMap: uniform(0),
    uReflectionStrength: uniform(0.55),
    uReflectionDistortion: uniform(0.04),
    uReflectionSoftness: uniform(0.4),
    uWavesA: waterArrayUniformEntry(
      uniformArray(Array.from({ length: waveCount }, () => new THREE.Vector4()), 'vec4'),
    ),
    uWavesB: waterArrayUniformEntry(
      uniformArray(Array.from({ length: waveCount }, () => new THREE.Vector4()), 'vec4'),
    ),
  };
  if (previous) {
    for (const name of Object.keys(own)) {
      if (previous[name]) own[name] = previous[name];
    }
  }
  const u = { ...own };
  if (shared) {
    for (const name of SHARABLE) {
      if (shared[name]) u[name] = shared[name];
    }
  }

  const wavesANode = resolveWaterArrayUniformNode(u.uWavesA);
  const wavesBNode = resolveWaterArrayUniformNode(u.uWavesB);
  const waves = createWaterWavesChunk({ wavesA: wavesANode, wavesB: wavesBNode, waveCount });
  const foam = createWaterFoamChunk({ u, foamOctaves });
  const lighting = createWaterLightingChunk({ u });

  const material = new NodeMaterial();
  material.name = 'WaterBreakers';
  material.lights = false;
  // TODO(tsl Phase 7): fog ordering (see module header).
  material.fog = false;
  material.transparent = true;
  material.depthWrite = true;
  material.side = THREE.DoubleSide;

  // ---- Varyings ----
  const vWorldPosition = varying(vec3(), 'vBreakerWorldPosition');
  const vNormal = varying(vec3(), 'vBreakerNormal');
  const vRestXZ = varying(vec2(), 'vBreakerRestXZ');
  const vSteep = varying(float(), 'vBreakerSteep');
  const vChop = varying(float(), 'vBreakerChop');
  const vProfile = varying(float(), 'vBreakerProfile');
  const vAlong = varying(float(), 'vBreakerAlong');
  const vPulse = varying(float(), 'vBreakerPulse');
  const vPost = varying(float(), 'vBreakerPost');
  const vCurl = varying(float(), 'vBreakerCurl');
  const vFade = varying(float(), 'vBreakerFade');
  const vFaceHeight = varying(float(), 'vBreakerFaceHeight');

  // ---- Vertex stage (waterBreaker.vert.glsl) ----
  material.vertexNode = Fn(() => {
    const aDir = attribute('aDir', 'vec2');
    const aInfo = attribute('aInfo', 'vec4');
    const aSlope = attribute('aSlope', 'float');

    const baseWorld = modelWorldMatrix.mul(vec4(positionGeometry, 1.0)).toVar();
    const along = aInfo.x.toVar();
    const t = aInfo.y.toVar();
    // Depth at the break line, where the collapse criterion is met.
    const lineDepth = max(aInfo.z, 0.05).toVar();
    const endFade = aInfo.w.toVar();

    const up = vec3(0.0, 1.0, 0.0);
    const dir = normalize(vec3(aDir.x, 1e-5, aDir.y).mul(vec3(1.0, 0.0, 1.0))).toVar();

    // --- Ride the dominant crest -------------------------------------------
    const wave0A = wavesANode.element(0).toVar();
    const wave0B = wavesBNode.element(0).toVar();
    const k0 = max(wave0A.w, 1e-4).toVar();
    const waveLen = float(PI2).div(k0).toVar();
    const theta = k0.mul(dot(wave0A.xy, baseWorld.xz)).sub(wave0A.z.mul(u.uTime))
      .add(wave0B.y).sub(u.uBreakerPeel.mul(0.4).mul(k0).mul(along)).toVar();

    // delta: signed progress (in wave cycles, -0.5..0.5) of the nearest
    // dominant crest relative to the break line.
    const delta = float(PI * 0.5).sub(theta).div(PI2).add(0.5).fract().sub(0.5).toVar();
    const facing = clamp(dot(wave0A.xy, dir.xz), 0.3, 1.0).toVar();
    const ride = delta.mul(waveLen).div(facing).toVar();
    const crestBase = baseWorld.xyz.add(dir.mul(ride)).toVar();
    // Water depth under the ridden crest: deeper offshore, shoaling inshore.
    const localDepth = clamp(lineDepth.sub(aSlope.mul(ride)), 0.05, lineDepth.mul(3.0)).toVar();

    // Set envelope: interference of the beat pair in slots 0/1.
    const wave1A = wavesANode.element(1).toVar();
    const wave1B = wavesBNode.element(1).toVar();
    const thetaBeat = wave1A.w.mul(dot(wave1A.xy, crestBase.xz))
      .sub(wave1A.z.mul(u.uTime)).add(wave1B.y).toVar();
    const pairA = wave0B.x.toVar();
    const pairB = wave1B.x.toVar();
    const interference = sqrt(max(
      pairA.mul(pairA).add(pairB.mul(pairB))
        .add(pairA.mul(pairB).mul(2.0).mul(cos(float(PI * 0.5).sub(thetaBeat)))),
      0.0,
    )).div(max(pairA.add(pairB), 1e-4)).toVar();
    const setEnvelope = mix(1.0, interference, u.uSetPair).toVar();
    const setGate = smoothstep(0.5, 0.78, setEnvelope).toVar();

    // --- Lifecycle, keyed to WHERE the ridden crest is ----------------------
    const approach = smoothstep(-0.3, -0.03, delta);
    const pulse = approach.mul(smoothstep(0.03, 0.3, delta).oneMinus()).mul(setGate).toVar();
    const curl = u.uBreakerCurl.mul(endFade).mul(setGate)
      .mul(smoothstep(-0.14, -0.02, delta))
      .mul(smoothstep(0.05, 0.16, delta).oneMinus()).toVar();
    const post = smoothstep(0.02, 0.12, delta)
      .mul(smoothstep(0.28, 0.46, delta).oneMinus()).mul(setGate).toVar();
    // Hide the wrap seam where the shell jumps back out to the next crest.
    const travelFade = smoothstep(-0.48, -0.4, delta)
      .mul(smoothstep(0.38, 0.47, delta).oneMinus()).toVar();

    // --- Shell shaping ----------------------------------------------------
    const amount = clamp(u.uBreakerAmount, 0.0, 1.0).toVar();
    const capDepth = min(lineDepth, localDepth);
    // Crest elevation is roughly half the depth-limited wave height. Using
    // 0.9*d here treated the entire breaker height as elevation above rest
    // water and made Ocean-on-Beach shells hover like layered ice shelves.
    const breakHeight = capDepth.mul(0.48).mul(u.uBreakerScale).mul(amount).mul(endFade).mul(setEnvelope).toVar();
    const H = breakHeight.mul(mix(0.12, 1.0, pulse)).mul(post.mul(0.55).oneMinus()).toVar();
    const R = H.mul(0.52).toVar();

    // The crest leans shoreward as it steepens and the bore noses forward.
    const crestTop = crestBase.add(up.mul(H)).add(dir.mul(H.mul(pulse.mul(0.3).add(post.mul(0.45))))).toVar();
    const barrelCenter = crestTop.sub(up.mul(R)).toVar();
    const backFoot = crestBase.sub(dir.mul(H.mul(2.1).add(0.35))).toVar();

    // Shell profile as a pure function of t so the shading normal can come
    // from an exact profile tangent (screen-space derivatives facet the shell).
    const shellPoint = (tParam) => {
      const backT = clamp(tParam.div(0.42), 0.0, 1.0);
      const backEase = backT.mul(backT).mul(backT.mul(-2.0).add(3.0));
      const facePos = mix(backFoot, crestTop, backEase);
      const spiralT = clamp(tParam.sub(0.42).div(0.58), 0.0, 1.0);
      const ang = spiralT.mul(PI).mul(curl.mul(1.18).add(0.5));
      const rad = R.mul(spiralT.mul(0.4).mul(curl).oneMinus());
      const spiralPos = barrelCenter
        .add(up.mul(rad.mul(cos(ang))))
        .add(dir.mul(rad.mul(sin(ang))))
        .add(dir.mul(spiralT.mul(H).mul(0.22).mul(pulse)));
      return mix(facePos, spiralPos, step(0.42, tParam));
    };

    const shellPos = shellPoint(t).toVar();

    // Smooth analytic normal: profile tangent x along-crest direction.
    const profileTangent = shellPoint(min(t.add(0.02), 1.0)).sub(shellPoint(max(t.sub(0.02), 0.0))).toVar();
    const side = normalize(cross(up, dir));
    const shellNormal = cross(profileTangent, side).toVar();
    vNormal.assign(select(length(shellNormal).greaterThan(1e-6), normalize(shellNormal), up));
    vSteep.assign(smoothstep(0.15, 0.55, pulse.add(post)).mul(smoothstep(0.0, 0.22, t)));

    // --- Blend into the heightfield ----------------------------------------
    // Same shoaling/cap displacement the water surface applies at the ridden
    // position — including its shallow-water chop filter.
    const range = max(max(u.uShoalingDepth, u.uWaveEnergy.mul(2.2)), 1e-3).toVar();
    const chopWeight = mix(0.15, 1.0, smoothstep(range.mul(0.3), range.mul(1.4), localDepth)).toVar();
    const raw = waves.gerstnerDisplacementFiltered(crestBase.xz, u.uTime, chopWeight).y.toVar();
    const deepFactor = smoothstep(0.0, range, localDepth);
    const rearUp = smoothstep(range.mul(0.45), range.mul(1.5), localDepth).oneMinus()
      .mul(smoothstep(0.05, 0.35, localDepth));
    const shoal = mix(u.uShorelineWaves, 1.0, deepFactor).mul(rearUp.mul(0.3).add(1.0)).toVar();
    const skirtTarget = raw.mul(shoal).toVar();
    const skirtCap = localDepth.mul(0.72).toVar();
    const surfaceY = baseWorld.y.add(max(
      min(skirtTarget, skirtCap).add(max(skirtTarget.sub(skirtCap), 0.0).mul(0.1)),
      localDepth.negate().add(0.04),
    )).toVar();

    // At full pulse the shell IS the crest, so it anchors at the rest level;
    // while still swelling it rides on top of the rendered crest instead.
    const skirt = smoothstep(0.0, 0.3, t).oneMinus().toVar();
    shellPos.y.addAssign(surfaceY.sub(baseWorld.y).mul(pulse.mul(0.85).oneMinus()).mul(skirt.oneMinus()));
    shellPos.y.assign(mix(shellPos.y, surfaceY, skirt));

    vProfile.assign(t);
    vAlong.assign(along);
    vPulse.assign(pulse);
    vPost.assign(post);
    vCurl.assign(curl);
    // Appear only once the face has genuinely developed.
    vFade.assign(amount.mul(endFade).mul(travelFade).mul(setGate)
      .mul(smoothstep(0.12, 0.35, pulse.add(post)))
      .mul(smoothstep(0.05, 0.15, H)));
    vFaceHeight.assign(clamp(shellPos.y.sub(surfaceY).div(max(breakHeight, 1e-3)).add(0.15), 0.0, 1.0));
    vWorldPosition.assign(shellPos);
    vRestXZ.assign(crestBase.xz);
    vChop.assign(chopWeight);

    return cameraProjectionMatrix.mul(cameraViewMatrix).mul(vec4(shellPos, 1.0));
  })();

  // ---- Fragment stage (waterBreaker.frag.glsl) ----
  material.fragmentNode = Fn(() => {
    Discard(vFade.lessThan(0.01));

    const toCamera = cameraPosition.sub(vWorldPosition).toVar();
    const viewDir = normalize(toCamera).toVar();
    const viewDistance = length(toCamera).toVar();

    // Cross-fade from the sea's own per-pixel Gerstner normal to the smooth
    // analytic shell normal by vSteep, so there is no lighting seam.
    const sea = waves.gerstnerNormalFiltered(vRestXZ, u.uTime, vChop);
    const seaNormal = vec3(sea.normal).toVar();
    const crest = float(sea.crest).toVar();
    const normal = normalize(mix(seaNormal, normalize(vNormal), clamp(vSteep, 0.0, 1.0))).toVar();
    // Flip camera-ward so the tunnel interior lights too (DoubleSide mesh).
    If(dot(normal, viewDir).lessThan(0.0), () => {
      normal.assign(normal.negate());
    });

    // Same fbm micro-ripple detail as the open surface, same flow drift.
    const detailFade = smoothstep(16.0, 60.0, viewDistance).oneMinus();
    const detailStrength = u.uDetailNormalStrength.mul(mix(0.2, 1.0, detailFade)).toVar();
    const flowOffset = u.uFlowDirection.mul(u.uTime).mul(u.uFlowSpeed);
    const detailUv = vWorldPosition.xz.mul(u.uDetailScale).add(flowOffset.mul(0.55)).toVar();
    const detailCenter = waterFbm(detailUv, 3).toVar();
    const detailGradient = vec2(
      waterFbm(detailUv.add(vec2(0.11, 0.0)), 3).sub(detailCenter),
      waterFbm(detailUv.add(vec2(0.0, 0.11)), 3).sub(detailCenter),
    ).div(0.11).mul(detailStrength).toVar();
    const surfaceNormal = waterCombineNormal(normal, detailGradient).toVar();

    // Body: a breaking face is a thick massed column of water — it reads
    // DARKER than the flat sea, not lighter.
    const faceH = clamp(vFaceHeight, 0.0, 1.0).toVar();
    const bodyColor = mix(u.uDeepColor, u.uMidColor, smoothstep(0.1, 0.9, faceH).mul(0.65)).toVar();
    bodyColor.mulAssign(mix(1.0, 0.78, vSteep));
    // Sun-through tint only when the camera actually looks at the lip against
    // the sun; squared so a side-lit lip stays in the water palette.
    const lip = smoothstep(0.72, 0.95, vProfile).toVar();
    const backlit = clamp(dot(viewDir.negate(), u.uSunDirection).mul(0.5).add(0.5), 0.0, 1.0).toVar();
    bodyColor.assign(mix(bodyColor, u.uShallowColor, lip.mul(vCurl).mul(backlit).mul(backlit).mul(0.3)));

    // Identical reflection/fresnel treatment to the open water.
    const fresnel = lighting.fresnelFactor(viewDir, surfaceNormal).toVar();
    const reflection = lighting.reflectionColor(vWorldPosition, surfaceNormal, viewDir).toVar();
    const reflectionMix = clamp(fresnel.mul(u.uReflectionStrength), 0.0, 0.92);
    const color = mix(bodyColor, reflection, reflectionMix).toVar();
    color.addAssign(u.uFresnelColor.mul(fresnel).mul(fresnel).mul(0.35));

    // Foam layers: tumbling lip edge, face streaks, whitewater, apron, plus
    // the sea's own whitecaps while the shell still lies flat.
    const noiseScale = max(u.uFoamNoiseScale, 0.05).toVar();
    const faceNoise = waterFbm(
      vec2(vAlong.mul(1.7), vProfile.mul(4.0).sub(u.uTime.mul(1.6))).mul(noiseScale), 3,
    ).toVar();
    const lipFoam = smoothstep(faceNoise.mul(-0.08).add(0.82), 0.96, vProfile.add(faceNoise.mul(0.04)))
      .mul(vPulse).mul(1.1).toVar();
    const streaks = smoothstep(0.62, 0.85, faceNoise)
      .mul(smoothstep(0.38, 0.76, vProfile)).mul(vPulse).mul(0.45);
    const whitewater = vPost.mul(
      waterFbm(vec2(vAlong.mul(2.3), vProfile.mul(3.0).add(u.uTime.mul(2.2))), 3).mul(0.6).add(0.7),
    );
    const apron = smoothstep(0.88, 0.98, vProfile).mul(faceNoise.mul(0.5).add(0.5)).mul(vPulse);
    const ambientCaps = foam.whitecaps(crest, seaNormal.y, vRestXZ, u.uTime).mul(vSteep.oneMinus());
    const foamRaw = clamp(lipFoam.add(streaks).add(whitewater).add(apron).add(ambientCaps), 0.0, 1.0);
    const foamValue = foam.foamShape(foamRaw, vWorldPosition.xz, u.uTime).toVar();

    const receiverVisibility = sampleEnvironmentSunShadow(vWorldPosition)
      .mul(sampleEnvironmentCloudShadow(vWorldPosition, 1))
      .toVar();

    // Same toon glints and sparkles as the open water. These are direct-sun
    // cues, so the shared receiver visibility suppresses them in shade.
    color.addAssign(lighting.specular(viewDir, surfaceNormal, foamValue.mul(0.75).oneMinus())
      .mul(receiverVisibility));
    color.addAssign(
      lighting.sparkles(vWorldPosition.xz, surfaceNormal, viewDir, viewDistance, u.uTime)
        .mul(foamValue.oneMinus()).mul(receiverVisibility),
    );
    color.mulAssign(mix(vec3(0.34, 0.46, 0.72), vec3(1.0), receiverVisibility));

    // Foam overlay, sun-shaded two-tone like the surface foam.
    const foamLight = clamp(dot(surfaceNormal, u.uSunDirection), 0.0, 1.0).mul(0.18).add(0.82);
    const foamTint = u.uFoamColor.mul(foamLight).mul(mix(
      vec3(0.44, 0.62, 0.76),
      vec3(1.0),
      receiverVisibility,
    ));
    color.assign(mix(color, foamTint, foamValue));

    // Solid water, not glass: only the trailing skirt dissolves into the
    // heightfield it sits on.
    const alpha = vFade.mul(mix(0.97, 1.0, foamValue)).mul(smoothstep(0.02, 0.16, vProfile));

    return vec4(color, alpha);
  })();

  material.uniforms = u;
  material.defines = { WATER_WAVE_COUNT: waveCount, WATER_FOAM_OCTAVES: foamOctaves };
  material.userData.isToonNodeMaterial = true;
  return material;
}
