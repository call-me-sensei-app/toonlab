import * as THREE from 'three';

// Settings → character material inputs.
//
// The character material reads flat uniforms (src/shaders-tsl/character/).
// This module turns resolved settings plus what conversion learned about one
// material (its role, masks, authored data) into those uniform values, both
// when the material is built and on every live retune. Parameters that differ
// by kind of surface are resolved for the material's own role and — when the
// material carries per-pixel role weights (an atlased character) — for skin,
// face and hair as well, under the `Skin` / `Face` / `Hair` suffixes; the
// shader blends the parameters by weight and evaluates once.

export const CHARACTER_ROLE_KEYS = Object.freeze(['cloth', 'skin', 'face', 'hair', 'eye', 'metal']);
export const ROLE_WEIGHT_SUFFIXES = Object.freeze({ face: 'Face', hair: 'Hair', skin: 'Skin' });

/** The shading role of a classified material. */
export function characterRoleKey(roleInfo) {
  const role = roleInfo?.role ?? 'default';
  if (role === 'face' || role === 'blush') return 'face';
  if (role === 'skin') return 'skin';
  if (role === 'hair') return 'hair';
  if (['eye', 'iris', 'pupil', 'sclera', 'eyeHighlight', 'catchlight'].includes(role)) return 'eye';
  if (role === 'metal' || roleInfo?.isMetal) return 'metal';
  return 'cloth';
}

// Parameters that are resolved per role (and blended by role weights).
export const ROLE_PARAMETER_NAMES = Object.freeze([
  'terminator',
  'softness',
  'autoBiasStrength',
  'tone',
  'bandColor',
  'sceneShadowStrength',
  'characterShadowStrength',
  'screenShadowStrength',
  'rimIntensity',
  'rimSilhouette',
  'specularIntensity',
  'specularSize',
  'specularThreshold',
  'specularSoftness',
  'outlineWidth',
  'ink',
  'inkSaturation',
  'outlineLightingMix',
  'outlineMinBrightness',
  'outlineMaxBrightness',
]);

const NEUTRAL_TONE = [0.55, 0.55, 0.58];

function roleParameters(settings, role, { hasSpecularMask = false, paintedEyeHighlights = false } = {}) {
  const { face, highlights, outline, ramp, rim, shading, shadows } = settings;
  const shadingOn = shading.enabled;
  const terminator = role === 'face'
    ? face.terminator
    : role === 'hair'
      ? shading.terminator.hair
      : role === 'skin'
        ? shading.terminator.skin
        : shading.terminator.cloth;
  const softness = role === 'face' ? face.softness : shading.softness;
  const autoBias = !shadingOn || !shading.lightingMap.auto || role === 'face' || role === 'eye'
    ? 0
    : role === 'hair'
      ? shading.lightingMap.autoStrength.hair
      : shading.lightingMap.autoStrength.body;
  const tone = ramp.enabled ? ramp.tone[role] : NEUTRAL_TONE;
  const bandRole = role === 'metal' ? null : role;
  const bandColor = ramp.enabled && bandRole && ramp.band[bandRole] ? ramp.band[bandRole] : tone;
  const castOn = shadows.enabled;
  const sceneShadow = !castOn ? 0 : role === 'eye' ? 0 : role === 'face' ? face.sceneShadowStrength : shadows.scene.strength;
  const characterShadow = !castOn || !shadows.character.enabled
    ? 0
    : role === 'face' || role === 'eye'
      ? shadows.character.strength.face
      : shadows.character.strength.body;
  const screenShadow = !castOn
    ? 0
    : role === 'face' || role === 'eye'
      ? shadows.hairOnFace.strength.face
      : shadows.hairOnFace.strength.body;
  const rimRole = role === 'metal' ? 'cloth' : role;
  const specular = highlights.specular[role];
  let specularIntensity = highlights.enabled ? specular.intensity : 0;
  if (role === 'cloth' && highlights.specular.clothNeedsMask && !hasSpecularMask) specularIntensity = 0;
  if (role === 'eye') {
    specularIntensity = highlights.enabled && highlights.eye.enabled && !paintedEyeHighlights ? highlights.eye.intensity : 0;
  }
  const inkRole = role === 'eye' ? 'face' : role;
  const lighting = outline.lighting[inkRole];
  return {
    autoBiasStrength: autoBias,
    bandColor,
    characterShadowStrength: characterShadow,
    ink: outline.ink[inkRole],
    inkSaturation: outline.inkSaturation[inkRole],
    outlineLightingMix: lighting.mix,
    outlineMaxBrightness: Math.max(lighting.min, lighting.max),
    outlineMinBrightness: lighting.min,
    outlineWidth: outline.enabled ? outline.width[role] : 0,
    rimIntensity: rim.enabled ? rim.intensity[rimRole] : 0,
    rimSilhouette: role === 'hair' ? rim.silhouette.hair : role === 'eye' ? 0 : rim.silhouette.body,
    sceneShadowStrength: sceneShadow,
    screenShadowStrength: screenShadow,
    softness,
    specularIntensity,
    specularSize: role === 'eye' ? highlights.eye.size : specular.size,
    specularSoftness: specular.softness,
    specularThreshold: specular.threshold,
    terminator: shadingOn ? terminator : -1,
    tone,
  };
}

function channelSelector(channel) {
  const selector = [0, 0, 0, 0];
  if (channel >= 0 && channel <= 3) selector[channel] = 1;
  return selector;
}

// Camera-relative key light as a view-space direction toward the light.
function cameraKeyDirection(light) {
  const azimuth = THREE.MathUtils.degToRad(light.cameraLight.azimuth);
  const elevation = THREE.MathUtils.degToRad(light.cameraLight.elevation);
  return [
    Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    Math.cos(azimuth) * Math.cos(elevation),
  ];
}

// Camera-relative character-shadow direction (view space, toward the light),
// from the `shadows.character` settings.
export function cameraShadowDirection(character) {
  const pitch = THREE.MathUtils.degToRad(character.pitch);
  const yaw = THREE.MathUtils.degToRad(character.yaw);
  return new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).normalize();
}

/**
 * Uniform values for one material. `context` describes the material:
 * `{ role, roleWeights, hasSpecularMask, paintedEyeHighlights, isSclera,
 *    hasFaceMap, baseSaturation }`.
 */
export function resolveCharacterParameters(settings, context = {}) {
  const role = context.role ?? 'cloth';
  const { face, highlights, light, maps, outline, rim, shading, shadows } = settings;
  const params = {};
  const own = roleParameters(settings, role, context);
  Object.assign(params, own);
  if (context.roleWeights) {
    for (const [weightRole, suffix] of Object.entries(ROLE_WEIGHT_SUFFIXES)) {
      const values = roleParameters(settings, weightRole, context);
      for (const name of ROLE_PARAMETER_NAMES) params[`${name}${suffix}`] = values[name];
    }
  }

  // Light.
  params.lightEnabled = light.enabled ? 1 : 0;
  params.sunMax = light.sunMax;
  params.sunTint = light.sunTint;
  params.lightMaxTint = light.maxTint;
  params.skyFloor = light.skyFloor;
  params.skyMax = light.skyMax;
  params.shadeSkyTint = light.shadeSkyTint;
  params.shadowSkyTint = light.shadowSkyTint;
  params.cameraLightStrength = light.enabled ? light.cameraLight.strength : 1;
  params.cameraLightDirection = cameraKeyDirection(light);
  params.maxSunElevationSin = Math.sin(THREE.MathUtils.degToRad(Math.min(90, Math.max(0, light.maxSunElevation))));
  params.hemisphereByNormal = light.hemisphereByNormal ? 1 : 0;
  params.localLightIntensity = light.enabled ? light.localLights.intensity : 0;
  params.localLightMax = light.localLights.max;
  params.localLightSoftness = light.localLights.softness;
  params.highlightShadowFloor = light.highlightShadowFloor;

  // Terminator.
  params.antiAlias = shading.antiAlias;
  params.autoBiasStart = shading.lightingMap.autoStart;
  params.autoBiasEnd = Math.max(shading.lightingMap.autoStart + 1e-3, shading.lightingMap.autoEnd);
  params.lightingMapChannel = channelSelector(shading.lightingMap.channel);
  params.lightingMapScale = shading.enabled ? shading.lightingMap.scale : 0;
  params.lightingMapPivot = shading.lightingMap.pivot;

  // Tones.
  params.bandWidth = settings.ramp.enabled ? settings.ramp.band.width : 0;

  // Face.
  const faceOn = face.enabled;
  params.faceMapStrength = faceOn && context.hasFaceMap ? face.map.strength : 0;
  params.faceMapSoftness = face.map.softness;
  params.faceMapOffset = face.map.offset;
  params.faceMapMirror = face.map.mirror ? 1 : 0;
  params.faceMapMidU = face.map.midU;
  params.faceNormalAmount = faceOn ? face.normals.amount : 0;
  params.faceNormalRoundness = face.normals.roundness;
  params.faceHeadTracked = face.headSpace === 'static' ? 0 : 1;
  params.noseStrength = faceOn && face.nose.auto ? face.nose.strength : 0;
  params.noseSize = face.nose.size;
  params.noseTint = face.nose.tint;
  params.eyeWhiteStrength = faceOn ? face.eyeWhiteShade.strength : 0;
  params.eyeWhiteDepth = face.eyeWhiteShade.depth;
  params.eyeWhiteTint = face.eyeWhiteShade.tint;

  // Cast shadows.
  params.characterShadowNormalBias = shadows.character.normalBias;
  params.characterShadowDepthBias = shadows.character.depthBias;
  params.characterShadowSoftness = shadows.character.softness;
  params.screenShadowWidth = shadows.hairOnFace.width;

  // Rim.
  params.rimMode = rim.mode === 'view' ? 1 : 0;
  params.rimWidth = rim.width;
  params.rimThreshold = rim.threshold;
  params.rimSoftness = rim.softness;
  params.rimTint = rim.tint;
  params.rimAlbedoMix = rim.albedoMix;
  params.rimInShadow = rim.inShadow;
  params.rimFadeStart = rim.fadeStart;
  params.rimFadeEnd = Math.max(rim.fadeStart + 1e-3, rim.fadeEnd);

  // Highlights.
  params.specularInShadow = highlights.specular.inShadow;
  params.specularMaskChannel = channelSelector(highlights.specular.mask.channel);
  params.specularMaskStrength = highlights.specular.mask.strength;
  const ring = highlights.hair;
  params.hairRingIntensity = highlights.enabled && ring.enabled ? ring.intensity : 0;
  params.hairRingWidth = ring.width;
  params.hairRingOffset = ring.offset;
  params.hairRingStrands = ring.strands;
  params.hairRingJitter = ring.jitter;
  params.hairRingLean = ring.lean;
  params.hairRingShadowFloor = ring.shadowFloor;
  params.sheerColor = highlights.sheer.color;
  params.sheerIntensity = highlights.enabled && highlights.sheer.auto ? highlights.sheer.intensity : 0;
  params.sheerPower = highlights.sheer.power;

  // Outline.
  params.outlineMaxWidth = outline.maxWidth;
  params.outlineScreenSpace = outline.screenSpace;
  params.outlineReferenceUnits = outline.referenceDistance * Math.tan(THREE.MathUtils.degToRad(outline.referenceFov / 2));
  params.outlineFadeDistance = outline.fadeDistance;
  params.inkHueShift = outline.inkHueShift;
  params.outlineFaceDepthPush = outline.faceDepthPush;
  params.outlineWidthMapChannel = channelSelector(outline.widthMapChannel);
  params.outlineVertexColorChannel = channelSelector(outline.widthVertexColorChannel);

  // Material maps.
  const mapsOn = maps.enabled;
  params.normalStrength = mapsOn ? maps.normal.strength : 0;
  params.normalScale = maps.normal.scale;
  params.aoStrength = mapsOn ? maps.ao.strength : 0;
  params.emissiveTint = maps.emissive.color;
  params.emissiveStrength = mapsOn ? maps.emissive.strength : 0;
  params.matcapStrength = mapsOn ? maps.matcap.strength : 0;
  params.detailRepeat = maps.detail.repeat;
  params.detailStrength = mapsOn ? maps.detail.strength : 0;
  params.roughnessStrength = mapsOn ? maps.roughness.strength : 0;
  params.metalnessStrength = mapsOn ? maps.metalness.strength : 0;
  params.specularColorStrength = mapsOn ? maps.specularColor.strength : 0;

  // Albedo.
  params.baseSaturation = context.baseSaturation ?? 1;
  params.ditherOpacity = settings.alpha.ditherOpacity;
  params.overHairDepth = settings.alpha.featuresOverHairDepth;
  return params;
}
