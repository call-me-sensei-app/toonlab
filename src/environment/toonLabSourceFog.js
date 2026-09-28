// Pin-exact reconstruction of ToonLab's M_StylizedFogPP post material.
//
// Authority: material-audit SHA-256
// 46369127911617732b22b3d4fe1430ea63b647d8c23b25384310c62b9cd658dc
//
// This is deliberately separate from scene ExponentialHeightFog. The source
// material is a linear-color post process at BL_SCENE_COLOR_AFTER_DOF: it
// composites atmospheric color, then adds the authored 3D fog, sun glow, and
// moon glow before bloom/tonemapping.

import * as THREE from 'three';
import {
  abs,
  cameraPosition,
  cameraProjectionMatrixInverse,
  cameraWorldMatrix,
  clamp,
  cos,
  cross,
  dot,
  float,
  getViewPosition,
  mix,
  mod,
  normalize,
  pow,
  screenUV,
  sin,
  texture,
  texture3D,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export const TOONLAB_FOG_AUDIT_SHA256 =
  '46369127911617732b22b3d4fe1430ea63b647d8c23b25384310c62b9cd658dc';

export const TOONLAB_FOG_MASTER_PATH =
  '/Game/ToonLab/Environment/Sky/Materials/M_StylizedFogPP.M_StylizedFogPP';

export const DEFAULT_TOONLAB_FOG_VOLUME_BASE_URL = null;

const SUN_MOON_ATLAS =
  '/Game/ToonLab/Environment/Sky/Curves/Atlas_SunMoon.Atlas_SunMoon';

export const TOONLAB_FOG_SCALAR_DEFAULTS = Object.freeze({
  '3D Fog  Distribution': 0.25,
  '3D Fog Distance': 3000,
  '3D Fog Scale': 12000,
  '3D Fog Strength': 0.2,
  'Atmo Sunward Strength': 1,
  'Atmosphere Distance Falloff': 1.3,
  'Atmosphere Min Distance': 10,
  'Atmospheric Fog Hue Shift': 0,
  'Day Atmo Max Distance': 50000,
  'Day Atmosphere Height Falloff': 1,
  'Day Atmosphere Height Offset': 0,
  'Day Atmosphere Strength': 0.4,
  'Glow Overcast Multiplier': 0.12,
  'Moon Glow Curve': 3,
  'Moon Glow Falloff': 4,
  'Moon Glow Hue Shift': -0.02,
  'Moon Glow Max Distance': 50000,
  'Moon Glow Min Distance': 10,
  'Moon Glow Strength': 0.5,
  'Night Atmo Max Distance': 50000,
  'Night Atmosphere Height Falloff': 1,
  'Night Atmosphere Height Offset': 0,
  'Night Atmosphere Strength': 0.8,
  'Sun Glow Clamp': 5,
  'Sun Glow Curve': 2,
  'Sun Glow Distance Falloff': 1,
  'Sun Glow Falloff': 3,
  'Sun Glow Hue Shift': -0.02,
  'Sun Glow Max Distance': 50000,
  'Sun Glow Min Distance': 10,
  'Sun Glow Strength': 4,
  'Sunrise Atmo Max Distance': 50000,
  'Sunrise Atmosphere Height Falloff': 1,
  'Sunrise Atmosphere Height Offset': 0,
  'Sunrise Atmosphere Strength': 0.1,
  'Sunset Atmo Max Distance': 50000,
  'Sunset Atmosphere Height Falloff': 1,
  'Sunset Atmosphere Height Offset': 0,
  'Sunset Atmosphere Strength': 0.6,
  'Weather Atmosphere Height Falloff': 1,
  'Weather Atmosphere Max Distance': 30000,
  'Weather Atmosphere Strength': 1,
  'Weather Distance Falloff': 0.7,
});

export const TOONLAB_FOG_VECTOR_DEFAULTS = Object.freeze({
  '3D Fog Color': [0.119538, 0.198069, 0.3564, 1],
  'Day Atmosphere Color': [0.45670599, 0.57431698, 0.71875, 1],
  'Night Atmosphere Color': [0.24199215, 0.25181618, 0.48958334, 1],
  'Sunrise Atmosphere Color': [0.69270831, 0.66358155, 0.46180552, 1],
  'Sunset Atmosphere Color': [0.671875, 0.41000053, 0.31521598, 1],
  'Weather Atmosphere Color Day': [0.06301, 0.116971, 0.187821, 1],
  'Weather Atmosphere Color Night': [0.020425845, 0.04806095, 0.1, 1],
  'Weather Atmosphere Color Sunrise': [0.073187895, 0.083884396, 0.098958336, 1],
  'Weather Atmosphere Color Sunset': [0.060735997, 0.093861096, 0.14600001, 1],
});

export const TOONLAB_FOG_PORT_CONTRACT = Object.freeze({
  auditSha256: TOONLAB_FOG_AUDIT_SHA256,
  blendableLocation: 'BL_SCENE_COLOR_AFTER_DOF',
  graphSignature: 'b90be4332cb9d5af2f8c6b4cf4678f1f3f1ac94c03219742f968728632bbff67',
  masterPath: TOONLAB_FOG_MASTER_PATH,
  nodeCount: 272,
  profileCount: 9,
  sourceSceneActivation: 'disabled: BP_StylizedSky_Lite has no weighted blendable',
  stages: Object.freeze([
    'atmosphere-composite',
    'authored-volume-fog-add',
    'sun-glow-add',
    'moon-glow-add',
  ]),
  implemented: Object.freeze([
    'all active graph arithmetic and branch order',
    'all resolved scalar/vector/static-switch parameters',
    'MPC day-cycle, weather, wind, sun, and moon inputs',
    'PPI_POST_PROCESS_INPUT0 linear scene color',
    'PPI_SCENE_DEPTH and SceneDepth as CalcSceneDepth/view-Z centimeters',
    'post-process WorldPosition reconstruction from depth',
    '64x64x64 authored RGBA16F volume source and trilinear sampling',
  ]),
  remainingBridges: Object.freeze([
    'ToonLab-wide curve-atlas bake versus the exported 65-sample curve rows',
    'ToonLab volume-texture mip/compression selection versus an uncompressed base-level Data3DTexture',
    'ToonLab AfterDOF translucency composition and exact post-pass resolution scheduling',
  ]),
});

function finite(value, fallback) {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function scalar(profile, name) {
  return finite(
    profile?.parameters?.scalar?.[name],
    TOONLAB_FOG_SCALAR_DEFAULTS[name] ?? 0,
  );
}

function vector(profile, name) {
  const value = profile?.parameters?.vector?.[name];
  return Array.isArray(value) && value.length >= 3
    ? value
    : TOONLAB_FOG_VECTOR_DEFAULTS[name] ?? [0, 0, 0, 1];
}

function switchValue(profile, name, fallback = true) {
  const value = profile?.parameters?.static_switch?.[name];
  return typeof value === 'boolean' ? value : fallback;
}

function color4(profile, name) {
  const value = vector(profile, name);
  return vec4(value[0], value[1], value[2], value[3] ?? 1);
}

function remap(value, inputLow, inputHigh, targetLow = 0, targetHigh = 1) {
  return float(targetLow).add(
    value.sub(inputLow)
      .mul(float(targetHigh).sub(targetLow))
      .div(float(inputHigh).sub(inputLow)),
  );
}

function toonLabIf(a, b, greaterValue, equalValue, lessValue) {
  const equal = abs(a.sub(b)).lessThanEqual(0.00001);
  return equal.select(equalValue, a.greaterThan(b).select(greaterValue, lessValue));
}

function lerpFiveNode(values, alpha) {
  const scaled = mod(alpha, 1).mul(4);
  let result = mix(values[0], values[1], clamp(scaled, 0, 1));
  result = mix(result, values[2], clamp(scaled.sub(1), 0, 1));
  result = mix(result, values[3], clamp(scaled.sub(2), 0, 1));
  return mix(result, values[4], clamp(scaled.sub(3), 0, 1));
}

export function toonLabFogLerpFive(values, alpha) {
  if (!Array.isArray(values) || values.length !== 5) {
    throw new Error('toonLabFogLerpFive requires exactly five values.');
  }
  const scaled = (((finite(alpha, 0) % 1) + 1) % 1) * 4;
  let result = THREE.MathUtils.lerp(values[0], values[1], THREE.MathUtils.clamp(scaled, 0, 1));
  result = THREE.MathUtils.lerp(result, values[2], THREE.MathUtils.clamp(scaled - 1, 0, 1));
  result = THREE.MathUtils.lerp(result, values[3], THREE.MathUtils.clamp(scaled - 2, 0, 1));
  return THREE.MathUtils.lerp(result, values[4], THREE.MathUtils.clamp(scaled - 3, 0, 1));
}

function toonLabHueShift(colorNode, amountNode) {
  // Engine HueShift is RotateAboutAxis around normalize(1,1,1). The engine
  // function takes turns; RotateAboutAxis returns a delta which HueShift adds
  // back to the source, yielding Rodrigues rotation below.
  const axis = vec3(1 / Math.sqrt(3));
  const angle = amountNode.mul(Math.PI * 2);
  const cosine = cos(angle);
  const sine = sin(angle);
  return colorNode.mul(cosine)
    .add(cross(axis, colorNode).mul(sine))
    .add(axis.mul(dot(axis, colorNode)).mul(float(1).sub(cosine)));
}

function sourceCurveNode(library, row, timeNode) {
  const curve = library.createCurveAtlasRowTexture(SUN_MOON_ATLAS, row);
  return curve
    ? texture(curve).sample(vec2(timeNode, 0.5))
    : vec4(0, 0, 0, 1);
}

function resolveFogAlias(reference) {
  const text = String(reference ?? '').trim();
  if (!text) return null;
  if (/^m?i?_?stylizedfogpp_/i.test(text) || text.startsWith('/')) return text;
  const suffix = text[0].toUpperCase() + text.slice(1).toLowerCase();
  return `MI_StylizedFogPP_${suffix}`;
}

export function resolveToonLabSourceFogProfile(library, reference = 'Classic') {
  if (!library) throw new Error('resolveToonLabSourceFogProfile requires a source library.');
  const resolved = library.resolveMaterial(resolveFogAlias(reference));
  if (!resolved || resolved.family !== 'fog') {
    throw new Error(`Unknown ToonLab fog profile: ${reference}`);
  }
  return resolved;
}

export async function loadToonLabFogVolumeTexture({
  baseUrl = DEFAULT_TOONLAB_FOG_VOLUME_BASE_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('loadToonLabFogVolumeTexture requires fetch.');
  }
  const root = String(baseUrl ?? '').trim().replace(/\/$/, '');
  if (!root) {
    throw new Error('loadToonLabFogVolumeTexture requires an explicit public baseUrl.');
  }
  const response = await fetchImpl(`${root}/manifest.json`, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Fog-volume manifest is unavailable (${response.status}).`);
  const manifest = await response.json();
  if (manifest.schema !== 'toonlab.fog-volume-source' || manifest.version !== 1) {
    throw new Error('Invalid ToonLab fog-volume manifest.');
  }
  const layout = manifest.layout ?? {};
  if (layout.sourceWidth !== 4096 || layout.sourceHeight !== 64
    || layout.sliceWidth !== 64 || layout.sliceHeight !== 64 || layout.depth !== 64
    || layout.axis !== 'x') {
    throw new Error('The ToonLab fog-volume strip layout is not the authored 64x64x64 layout.');
  }

  const { EXRLoader } = await import('three/examples/jsm/loaders/EXRLoader.js');
  const strip = await new EXRLoader()
    .setDataType(THREE.FloatType)
    .loadAsync(`${root}/${manifest.sourceFile}`);
  const source = strip.image?.data;
  if (!(source instanceof Float32Array)
    || strip.image.width !== layout.sourceWidth
    || strip.image.height !== layout.sourceHeight) {
    strip.dispose();
    throw new Error('The authored fog EXR did not decode as a 4096x64 Float32 RGBA strip.');
  }
  const channels = source.length / (layout.sourceWidth * layout.sourceHeight);
  if (channels !== 4) {
    strip.dispose();
    throw new Error(`The authored fog EXR must have four channels, received ${channels}.`);
  }

  const data = new Float32Array(
    layout.sliceWidth * layout.sliceHeight * layout.depth * channels,
  );
  for (let z = 0; z < layout.depth; z += 1) {
    for (let y = 0; y < layout.sliceHeight; y += 1) {
      for (let x = 0; x < layout.sliceWidth; x += 1) {
        const sourcePixel = y * layout.sourceWidth + z * layout.sliceWidth + x;
        const volumePixel = (z * layout.sliceHeight + y) * layout.sliceWidth + x;
        for (let channel = 0; channel < channels; channel += 1) {
          data[volumePixel * channels + channel] = source[sourcePixel * channels + channel];
        }
      }
    }
  }
  strip.dispose();

  const volume = new THREE.Data3DTexture(
    data,
    layout.sliceWidth,
    layout.sliceHeight,
    layout.depth,
  );
  volume.name = 'Source::T_3DNoise';
  volume.format = THREE.RGBAFormat;
  volume.type = THREE.FloatType;
  volume.colorSpace = THREE.NoColorSpace;
  volume.wrapS = THREE.RepeatWrapping;
  volume.wrapT = THREE.RepeatWrapping;
  volume.wrapR = THREE.RepeatWrapping;
  volume.minFilter = THREE.LinearFilter;
  volume.magFilter = THREE.LinearFilter;
  volume.generateMipmaps = false;
  volume.unpackAlignment = 1;
  volume.needsUpdate = true;
  volume.userData.toonLabSource = {
    manifest,
    sourceAsset: manifest.sourceAsset,
    volumeAsset: manifest.volumeAsset,
  };
  return volume;
}

/**
 * Rebuild M_StylizedFogPP's Emissive output as a TSL post-process node.
 * `sceneDepth` must be the raw hardware depth attachment paired with
 * `sceneColor`; it is converted to ToonLab CalcSceneDepth (view-space W) in cm.
 */
export function createToonLabSourceFogPostNode({
  library,
  profile: profileReference = 'Classic',
  sceneColor,
  sceneDepth,
  state,
  volumeTexture = null,
} = {}) {
  if (!library || !sceneColor || !sceneDepth || !state?.uniforms) {
    throw new Error(
      'createToonLabSourceFogPostNode requires library, sceneColor, sceneDepth, and state.',
    );
  }
  const profile = typeof profileReference === 'object'
    ? profileReference
    : resolveToonLabSourceFogProfile(library, profileReference);
  const u = state.uniforms;
  const requiredUniforms = [
    'currentTime', 'dayCycleProgress', 'dayLength', 'moonDirection',
    'nightLength', 'overcast', 'sunDirection', 'time', 'weatherAtmosphereMix',
    'windAngle',
  ];
  for (const name of requiredUniforms) {
    if (!u[name]) throw new Error(`ToonLab fog state is missing ${name}.`);
  }

  // ToonLab CalcSceneDepth returns clip-space W: linear distance along view Z in
  // centimeters. It is not Euclidean camera range and not raw device depth.
  const viewPosition = getViewPosition(
    screenUV,
    sceneDepth,
    cameraProjectionMatrixInverse,
  ).toVar('sourceFogViewPosition');
  const worldPosition = cameraWorldMatrix
    .mul(vec4(viewPosition, 1))
    .xyz
    .toVar('sourceFogWorldPosition');
  const sceneDepthCm = viewPosition.z.negate().mul(100).toVar('sourceFogSceneDepthCm');
  const cameraToPixel = worldPosition.sub(cameraPosition).toVar('sourceFogCameraToPixel');
  const pixelToCamera = cameraToPixel.negate().toVar('sourceFogPixelToCamera');
  const viewDirection = normalize(cameraToPixel).toVar('sourceFogViewDirection');
  const dayProgress = u.dayCycleProgress;
  const weatherMix = u.weatherAtmosphereMix;

  const atmosphereMin = mix(
    scalar(profile, 'Atmosphere Min Distance'),
    10,
    weatherMix,
  );
  const atmosphereMax = mix(
    lerpFiveNode([
      scalar(profile, 'Day Atmo Max Distance'),
      scalar(profile, 'Sunset Atmo Max Distance'),
      scalar(profile, 'Night Atmo Max Distance'),
      scalar(profile, 'Sunrise Atmo Max Distance'),
      scalar(profile, 'Day Atmo Max Distance'),
    ], dayProgress),
    scalar(profile, 'Weather Atmosphere Max Distance'),
    weatherMix,
  );
  const atmosphereDistance = clamp(
    remap(sceneDepthCm, atmosphereMin, atmosphereMax),
    0,
    1,
  ).toVar('sourceFogAtmosphereDistance');
  const atmosphereDistanceFalloff = mix(
    scalar(profile, 'Atmosphere Distance Falloff'),
    scalar(profile, 'Weather Distance Falloff'),
    weatherMix,
  );
  const atmosphereStrength = mix(
    lerpFiveNode([
      scalar(profile, 'Day Atmosphere Strength'),
      scalar(profile, 'Sunset Atmosphere Strength'),
      scalar(profile, 'Night Atmosphere Strength'),
      scalar(profile, 'Sunrise Atmosphere Strength'),
      scalar(profile, 'Day Atmosphere Strength'),
    ], dayProgress),
    scalar(profile, 'Weather Atmosphere Strength'),
    weatherMix,
  );
  const distanceMask = clamp(
    pow(atmosphereDistance, atmosphereDistanceFalloff).mul(atmosphereStrength),
    0,
    1,
  );
  const heightOffset = lerpFiveNode([
    scalar(profile, 'Day Atmosphere Height Offset'),
    scalar(profile, 'Sunset Atmosphere Height Offset'),
    scalar(profile, 'Night Atmosphere Height Offset'),
    scalar(profile, 'Sunrise Atmosphere Height Offset'),
    scalar(profile, 'Day Atmosphere Height Offset'),
  ], dayProgress);
  const heightFalloff = mix(
    lerpFiveNode([
      scalar(profile, 'Day Atmosphere Height Falloff'),
      scalar(profile, 'Sunset Atmosphere Height Falloff'),
      scalar(profile, 'Night Atmosphere Height Falloff'),
      scalar(profile, 'Sunrise Atmosphere Height Falloff'),
      scalar(profile, 'Day Atmosphere Height Falloff'),
    ], dayProgress),
    scalar(profile, 'Weather Atmosphere Height Falloff'),
    weatherMix,
  );
  // ComponentMask_2 is the pin-exact ToonLab B/Z channel. ToonLab Z maps to Three Y.
  const heightBase = remap(viewDirection.y.add(heightOffset), 0, 1, 1, 0);
  const heightMask = clamp(pow(heightBase, heightFalloff), 0, 1);
  const sunwardTarget = mix(
    scalar(profile, 'Atmo Sunward Strength'),
    1,
    u.overcast,
  );
  const sunwardCap = clamp(remap(
    dot(u.sunDirection, normalize(pixelToCamera)),
    0.5,
    1,
    1,
    sunwardTarget,
  ), 0, 1);
  const atmosphereAlpha = clamp(distanceMask.mul(heightMask), 0, sunwardCap)
    .toVar('sourceFogAtmosphereAlpha');

  const dayAtmosphereColor = lerpFiveNode([
    color4(profile, 'Day Atmosphere Color'),
    color4(profile, 'Sunset Atmosphere Color'),
    color4(profile, 'Night Atmosphere Color'),
    color4(profile, 'Sunrise Atmosphere Color'),
    color4(profile, 'Day Atmosphere Color'),
  ], dayProgress);
  const weatherAtmosphereColor = lerpFiveNode([
    color4(profile, 'Weather Atmosphere Color Day'),
    color4(profile, 'Weather Atmosphere Color Sunset'),
    color4(profile, 'Weather Atmosphere Color Night'),
    color4(profile, 'Weather Atmosphere Color Sunrise'),
    color4(profile, 'Weather Atmosphere Color Day'),
  ], dayProgress);
  const atmosphereColor = mix(dayAtmosphereColor, weatherAtmosphereColor, weatherMix);
  const atmosphereHueAmount = remap(
    atmosphereDistance,
    0,
    1,
    scalar(profile, 'Atmospheric Fog Hue Shift'),
    0,
  );
  const shiftedAtmosphere = vec4(
    toonLabHueShift(atmosphereColor.rgb, atmosphereHueAmount),
    // MakeFloat4.A is disconnected in the source graph; the engine-function
    // default is zero. The post material ultimately consumes only RGB.
    0,
  );
  let outputNode = mix(sceneColor, shiftedAtmosphere, atmosphereAlpha)
    .toVar('sourceFogAtmosphereComposite');

  let volumeStatus = 'disabled-by-static-switch';
  if (switchValue(profile, '3DTexturedFog?', true)) {
    volumeStatus = volumeTexture ? 'authored-volume-bound' : 'missing-authored-volume';
    if (volumeTexture) {
      // Noise coordinates are authored in ToonLab axes/centimeters. Convert Three
      // (X,Y,Z) back to ToonLab (X,-Z,Y) before dividing by the cm parameters.
      const cameraToonLabCm = vec3(
        cameraPosition.x,
        cameraPosition.z.negate(),
        cameraPosition.y,
      ).mul(100);
      const pixelToonLabCm = vec3(
        worldPosition.x,
        worldPosition.z.negate(),
        worldPosition.y,
      ).mul(100);
      const towardPixelToonLab = normalize(pixelToonLabCm.sub(cameraToonLabCm));
      const angle = u.windAngle.mul(Math.PI * 2);
      const timeOffset = vec3(cos(angle), sin(angle).negate(), 1)
        .mul(u.time)
        .mul(0.03);
      const nearPoint = cameraToonLabCm.add(
        towardPixelToonLab.mul(scalar(profile, '3D Fog Distance')),
      );
      const nearUv = nearPoint
        .div(scalar(profile, '3D Fog Scale'))
        .add(timeOffset);
      let volumeSample = texture3D(volumeTexture).sample(nearUv);
      if (switchValue(profile, 'DualLayer3DFog?', true)) {
        const farPoint = cameraToonLabCm.add(
          towardPixelToonLab.mul(scalar(profile, '3D Fog Distance') * 1.9),
        );
        const farUv = farPoint
          .div(scalar(profile, '3D Fog Scale') / 1.9)
          .add(timeOffset);
        const farSample = texture3D(volumeTexture).sample(farUv);
        volumeSample = mix(
          volumeSample,
          farSample,
          scalar(profile, '3D Fog  Distribution'),
        );
      }
      const volumeDepth = clamp(remap(sceneDepthCm, 0, 2000), 0, 1);
      const volumeFog = volumeSample
        .mul(scalar(profile, '3D Fog Strength'))
        .mul(volumeDepth)
        .mul(color4(profile, '3D Fog Color'));
      outputNode = outputNode.add(volumeFog).toVar('sourceFogVolumeComposite');
    }
  }

  const dayLength = u.dayLength;
  const nightLength = u.nightLength;
  const currentTime = u.currentTime;
  const nightProgress = currentTime.sub(dayLength).div(nightLength);
  const dayTimeProgress = currentTime.div(dayLength);
  const sunCurveTime = toonLabIf(
    currentTime,
    dayLength,
    toonLabIf(nightProgress, 0.5, 0, 0, 1),
    0,
    dayTimeProgress,
  );
  const moonCurveTime = toonLabIf(
    currentTime,
    dayLength,
    nightProgress,
    0,
    toonLabIf(dayTimeProgress, 0.5, 0, 0, 1),
  );

  const sunOrientation = lerpFiveNode([
    vec3(1, 1, 1),
    vec3(1, 5, 1),
    vec3(1, 1, 1),
    vec3(1, 5, 1),
    vec3(1, 1, 1),
  ], dayProgress);
  const sunDirectionMask = clamp(remap(
    dot(u.sunDirection, normalize(pixelToCamera.mul(sunOrientation))),
    -0.3,
    1,
  ), 0, 1);
  const sunDistance = clamp(remap(
    sceneDepthCm,
    scalar(profile, 'Sun Glow Min Distance'),
    scalar(profile, 'Sun Glow Max Distance'),
  ), 0, 1);
  const sunCurve = sourceCurveNode(
    library,
    scalar(profile, 'Sun Glow Curve'),
    sunCurveTime,
  );
  const shiftedSun = vec4(
    toonLabHueShift(sunCurve.rgb, remap(
      sunDistance,
      0,
      1,
      scalar(profile, 'Sun Glow Hue Shift'),
      0,
    )),
    sunCurve.a,
  );
  const sunVisibility = abs(dayProgress.sub(0.5)).mul(2);
  const sunOvercast = mix(1, scalar(profile, 'Glow Overcast Multiplier'), u.overcast);
  const sunGlow = clamp(
    pow(sunDirectionMask, scalar(profile, 'Sun Glow Falloff'))
      .mul(pow(sunDistance, scalar(profile, 'Sun Glow Distance Falloff')))
      .mul(shiftedSun)
      .mul(sunVisibility)
      .mul(scalar(profile, 'Sun Glow Strength'))
      .mul(sunOvercast),
    0,
    scalar(profile, 'Sun Glow Clamp'),
  );
  outputNode = outputNode.add(sunGlow).toVar('sourceFogSunComposite');

  const moonOrientation = lerpFiveNode([
    vec3(1, 1, 1),
    vec3(1, 4, 1),
    vec3(1, 1, 1),
    vec3(1, 4, 1),
    vec3(1, 1, 1),
  ], dayProgress);
  const moonDirectionMask = clamp(
    dot(u.moonDirection, normalize(pixelToCamera.mul(moonOrientation))),
    0,
    1,
  );
  const moonDistance = clamp(remap(
    sceneDepthCm,
    scalar(profile, 'Moon Glow Min Distance'),
    scalar(profile, 'Moon Glow Max Distance'),
  ), 0, 1);
  const moonCurve = sourceCurveNode(
    library,
    scalar(profile, 'Moon Glow Curve'),
    moonCurveTime,
  );
  const shiftedMoon = vec4(
    toonLabHueShift(moonCurve.rgb, remap(
      moonDistance,
      0,
      1,
      scalar(profile, 'Moon Glow Hue Shift'),
      0,
    )),
    // As above, the disconnected MakeFloat4.A input is exactly zero.
    0,
  );
  const moonVisibility = float(1).sub(abs(dayProgress.sub(0.5)).mul(2));
  const moonOvercast = mix(1, scalar(profile, 'Glow Overcast Multiplier'), u.overcast);
  const moonGlow = pow(moonDirectionMask, scalar(profile, 'Moon Glow Falloff'))
    .mul(moonDistance)
    .mul(shiftedMoon)
    .mul(moonVisibility)
    .mul(scalar(profile, 'Moon Glow Strength'))
    .mul(moonOvercast);
  outputNode = outputNode.add(moonGlow).toVar('sourceFogFinal');

  return Object.freeze({
    bridges: Object.freeze([...TOONLAB_FOG_PORT_CONTRACT.remainingBridges]),
    contract: TOONLAB_FOG_PORT_CONTRACT,
    // ToonLab's material root consumes the graph as Emissive Color (float3). Give
    // the browser post pipeline an explicit opaque alpha without changing RGB.
    outputNode: vec4(outputNode.rgb, 1),
    profile,
    volumeStatus,
  });
}
