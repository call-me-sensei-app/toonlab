// Shared vegetation style nodes. These uniforms describe the IP's rendering
// treatment; current sun, wind, weather amounts, albedo, and interaction stay
// in their own namespaces so applying a style cannot overwrite world state.

import * as THREE from 'three';
import {
  abs,
  cameraPosition,
  clamp,
  dot,
  faceDirection,
  mix,
  normalize,
  pow,
  smoothstep,
  uniform,
  vec3,
} from 'three/tsl';

const FALLBACK = Object.freeze({
  lighting: Object.freeze({
    rimPower: 3,
    rimStrength: 0.12,
    shadowTint: Object.freeze([0.36, 0.4, 0.58]),
    shadowTintStrength: 1,
    skyFillStrength: 0.08,
    sunTintStrength: 0.25,
  }),
  thinSurface: Object.freeze({
    diffuseWrap: 0.5,
    normalUpBias: 0,
    transmissionPower: 3.5,
    transmissionShadowFloor: 0.35,
    transmissionStrength: 0.35,
    twoSidedLighting: 1,
  }),
  weatherResponse: Object.freeze({
    snowEdgeSoftness: 0.2,
    snowShadowStrength: 0.65,
    snowTint: Object.freeze([0.92, 0.96, 1]),
    wetDarkening: 0.15,
    wetDesaturation: 0.05,
    wetHighlightStrength: 0.2,
  }),
  grass: Object.freeze({
    backlitStrength: 0.4,
    baseColor: Object.freeze([0.172518, 0.317708, 0.052621]),
    bandSoftness: 0.1,
    bandThreshold: 0.49,
    bendExponent: 2,
    cloudShadowResponse: 0.35,
    colorVariationStrength: 0.2,
    emissiveStrength: 0,
    gustSheenStrength: 0.22,
    gustSheenThreshold: 0.78,
    interactionResponse: 1,
    roughness: 0.5,
    rootOcclusionHeight: 0.62,
    rootOcclusionStrength: 0.36,
    sceneShadowResponse: 0.7,
    shadowFloor: 0.35,
    specularStrength: 0.04,
    styleColorStrength: 0,
    tipBrightness: 0.1,
    tipDesaturation: -0.5,
    tipGradientEnd: 0.95,
    tipGradientStart: 0.1,
    tipHueShift: -0.06,
  }),
  foliage: Object.freeze({
    backlitStrength: 0.35,
    bandSoftness: 0.18,
    bandThreshold: 0.47,
    cardVariationStrength: 0.16,
    cloudShadowResponse: 0,
    crestSoftness: 0.12,
    crestThreshold: 0.72,
    crownOcclusionStrength: 0.2,
    emissiveStrength: 0.25,
    gradientColor: Object.freeze([0.076185, 0.198069, 0.016807]),
    gradientContrast: 0.821665,
    gradientOffset: 0.088,
    hueShift: 0,
    hueVariation: 0.1,
    mainColor: Object.freeze([0.040915, 0.135633, 0.015209]),
    roughness: 0.75,
    sceneShadowResponse: 0.55,
    specularStrength: 0.1,
    spriteLuminanceStrength: 0.36,
    styleColorStrength: 0,
    subsurfaceOpacity: 0.3,
    subsurfaceStrength: 0.8,
    transmissionPowerMultiplier: 1,
  }),
  flower: Object.freeze({
    backlitStrength: 0.35,
    bandSoftness: 0.1,
    bandThreshold: 0.5,
    centerLightResponse: 0.8,
    centerShadowResponse: 1,
    cupDarkeningStrength: 0.1,
    emissiveStrength: 0,
    petalTransmissionMultiplier: 1,
    roughness: 0.5,
    sceneShadowResponse: 0.85,
    specularStrength: 0.05,
    subsurfaceOpacity: 0.08,
    subsurfaceStrength: 0.3,
    textureTint: Object.freeze([1, 1, 1]),
    tintStrength: 1,
    unlitPetalLift: 0.35,
  }),
  bark: Object.freeze({
    bandCount: 3,
    bandSoftness: 0,
    emissiveStrength: 0,
    normalFlatness: 0,
    rimStrength: 0,
    roughness: 1,
    shadowFloor: 0.35,
    skyFillStrength: 0.04,
    specularStrength: 0,
    sunTintStrength: 0.15,
    tint: Object.freeze([0.938, 0.3752, 0]),
    tintStrength: 0,
    verticalShadeStrength: 0,
  }),
  stem: Object.freeze({
    bandCount: 3,
    bandSoftness: 0.08,
    color: Object.freeze([0.155926, 0.332452, 0.066626]),
    colorStrength: 0,
    emissiveStrength: 0,
    roughness: 0.5,
    shadowFloor: 0.42,
    skyFillStrength: 0.06,
    specularStrength: 0.05,
    transmissionStrength: 0.08,
    rimStrength: 0.02,
  }),
});

function sourceSettings(profile) {
  return profile?.settings && typeof profile.settings === 'object' ? profile.settings : (profile ?? {});
}

function value(settings, group, key) {
  return settings?.[group]?.[key] ?? FALLBACK[group][key];
}

function color(settings, group, key) {
  const rgb = value(settings, group, key);
  return new THREE.Color().setRGB(rgb[0], rgb[1], rgb[2], THREE.SRGBColorSpace);
}

/** Uniform contract shared by every vegetation material role. */
export function createVegetationStyleUniforms(profile = {}, role = null) {
  const settings = sourceSettings(profile);
  const roles = new Set((Array.isArray(role) ? role : [role]).filter(Boolean));
  const hasRole = (...candidates) => candidates.some((candidate) => roles.has(candidate));
  const u = {
    uSnowCover: uniform(0),
    uSnowRetention: uniform(1),
    // Transient world illumination. These are deliberately outside the
    // portable style schema: time of day changes them without modifying a
    // Tree, Grass, or Flower profile.
    uSkyIntensity: uniform(1),
    uSunIntensity: uniform(1),
    uStyleLightingRimPower: uniform(value(settings, 'lighting', 'rimPower')),
    uStyleLightingRimStrength: uniform(value(settings, 'lighting', 'rimStrength')),
    uStyleLightingShadowTint: uniform(color(settings, 'lighting', 'shadowTint')),
    uStyleLightingShadowTintStrength: uniform(value(settings, 'lighting', 'shadowTintStrength')),
    uStyleLightingSkyFillStrength: uniform(value(settings, 'lighting', 'skyFillStrength')),
    uStyleLightingSunTintStrength: uniform(value(settings, 'lighting', 'sunTintStrength')),
    uStyleWeatherResponseSnowEdgeSoftness: uniform(value(settings, 'weatherResponse', 'snowEdgeSoftness')),
    uStyleWeatherResponseSnowShadowStrength: uniform(value(settings, 'weatherResponse', 'snowShadowStrength')),
    uStyleWeatherResponseSnowTint: uniform(color(settings, 'weatherResponse', 'snowTint')),
    uStyleWeatherResponseWetDarkening: uniform(value(settings, 'weatherResponse', 'wetDarkening')),
    uStyleWeatherResponseWetDesaturation: uniform(value(settings, 'weatherResponse', 'wetDesaturation')),
    uStyleWeatherResponseWetHighlightStrength: uniform(value(settings, 'weatherResponse', 'wetHighlightStrength')),
    uWetness: uniform(0),
    uWetnessResponse: uniform(1),
  };

  if (hasRole('grassBlade', 'foliageCard', 'flowerPetal')) Object.assign(u, {
    uStyleThinSurfaceDiffuseWrap: uniform(value(settings, 'thinSurface', 'diffuseWrap')),
    uStyleThinSurfaceNormalUpBias: uniform(value(settings, 'thinSurface', 'normalUpBias')),
    uStyleThinSurfaceTransmissionPower: uniform(value(settings, 'thinSurface', 'transmissionPower')),
    uStyleThinSurfaceTransmissionShadowFloor: uniform(value(settings, 'thinSurface', 'transmissionShadowFloor')),
    uStyleThinSurfaceTransmissionStrength: uniform(value(settings, 'thinSurface', 'transmissionStrength')),
    uStyleThinSurfaceTwoSidedLighting: uniform(value(settings, 'thinSurface', 'twoSidedLighting')),
  });
  if (hasRole('grassBlade')) Object.assign(u, {
    uStyleGrassBacklitStrength: uniform(value(settings, 'grass', 'backlitStrength')),
    uStyleGrassBaseColor: uniform(color(settings, 'grass', 'baseColor')),
    uStyleGrassBandSoftness: uniform(value(settings, 'grass', 'bandSoftness')),
    uStyleGrassBandThreshold: uniform(value(settings, 'grass', 'bandThreshold')),
    uStyleGrassBendExponent: uniform(value(settings, 'grass', 'bendExponent')),
    uStyleGrassCloudShadowResponse: uniform(value(settings, 'grass', 'cloudShadowResponse')),
    uStyleGrassColorVariationStrength: uniform(value(settings, 'grass', 'colorVariationStrength')),
    uStyleGrassEmissiveStrength: uniform(value(settings, 'grass', 'emissiveStrength')),
    uStyleGrassGustSheenStrength: uniform(value(settings, 'grass', 'gustSheenStrength')),
    uStyleGrassGustSheenThreshold: uniform(value(settings, 'grass', 'gustSheenThreshold')),
    uStyleGrassInteractionResponse: uniform(value(settings, 'grass', 'interactionResponse')),
    uStyleGrassRoughness: uniform(value(settings, 'grass', 'roughness')),
    uStyleGrassRootOcclusionHeight: uniform(value(settings, 'grass', 'rootOcclusionHeight')),
    uStyleGrassRootOcclusionStrength: uniform(value(settings, 'grass', 'rootOcclusionStrength')),
    uStyleGrassSceneShadowResponse: uniform(value(settings, 'grass', 'sceneShadowResponse')),
    uStyleGrassShadowFloor: uniform(value(settings, 'grass', 'shadowFloor')),
    uStyleGrassSpecularStrength: uniform(value(settings, 'grass', 'specularStrength')),
    uStyleGrassStyleColorStrength: uniform(value(settings, 'grass', 'styleColorStrength')),
    uStyleGrassTipBrightness: uniform(value(settings, 'grass', 'tipBrightness')),
    uStyleGrassTipDesaturation: uniform(value(settings, 'grass', 'tipDesaturation')),
    uStyleGrassTipGradientEnd: uniform(value(settings, 'grass', 'tipGradientEnd')),
    uStyleGrassTipGradientStart: uniform(value(settings, 'grass', 'tipGradientStart')),
    uStyleGrassTipHueShift: uniform(value(settings, 'grass', 'tipHueShift')),
  });
  if (hasRole('foliageCard')) Object.assign(u, {
    uStyleFoliageBacklitStrength: uniform(value(settings, 'foliage', 'backlitStrength')),
    uStyleFoliageBandSoftness: uniform(value(settings, 'foliage', 'bandSoftness')),
    uStyleFoliageBandThreshold: uniform(value(settings, 'foliage', 'bandThreshold')),
    uStyleFoliageCardVariationStrength: uniform(value(settings, 'foliage', 'cardVariationStrength')),
    uStyleFoliageCloudShadowResponse: uniform(value(settings, 'foliage', 'cloudShadowResponse')),
    uStyleFoliageCrestSoftness: uniform(value(settings, 'foliage', 'crestSoftness')),
    uStyleFoliageCrestThreshold: uniform(value(settings, 'foliage', 'crestThreshold')),
    uStyleFoliageCrownOcclusionStrength: uniform(value(settings, 'foliage', 'crownOcclusionStrength')),
    uStyleFoliageEmissiveStrength: uniform(value(settings, 'foliage', 'emissiveStrength')),
    uStyleFoliageGradientColor: uniform(color(settings, 'foliage', 'gradientColor')),
    uStyleFoliageGradientContrast: uniform(value(settings, 'foliage', 'gradientContrast')),
    uStyleFoliageGradientOffset: uniform(value(settings, 'foliage', 'gradientOffset')),
    uStyleFoliageHueShift: uniform(value(settings, 'foliage', 'hueShift')),
    uStyleFoliageHueVariation: uniform(value(settings, 'foliage', 'hueVariation')),
    uStyleFoliageMainColor: uniform(color(settings, 'foliage', 'mainColor')),
    uStyleFoliageRoughness: uniform(value(settings, 'foliage', 'roughness')),
    uStyleFoliageSceneShadowResponse: uniform(value(settings, 'foliage', 'sceneShadowResponse')),
    uStyleFoliageSpecularStrength: uniform(value(settings, 'foliage', 'specularStrength')),
    uStyleFoliageSpriteLuminanceStrength: uniform(value(settings, 'foliage', 'spriteLuminanceStrength')),
    uStyleFoliageStyleColorStrength: uniform(value(settings, 'foliage', 'styleColorStrength')),
    uStyleFoliageSubsurfaceOpacity: uniform(value(settings, 'foliage', 'subsurfaceOpacity')),
    uStyleFoliageSubsurfaceStrength: uniform(value(settings, 'foliage', 'subsurfaceStrength')),
    uStyleFoliageTransmissionPowerMultiplier: uniform(value(settings, 'foliage', 'transmissionPowerMultiplier')),
  });
  if (hasRole('flowerPetal', 'flowerCenter')) Object.assign(u, {
    uStyleFlowerBandSoftness: uniform(value(settings, 'flower', 'bandSoftness')),
    uStyleFlowerBandThreshold: uniform(value(settings, 'flower', 'bandThreshold')),
    uStyleFlowerEmissiveStrength: uniform(value(settings, 'flower', 'emissiveStrength')),
    uStyleFlowerRoughness: uniform(value(settings, 'flower', 'roughness')),
    uStyleFlowerSceneShadowResponse: uniform(value(settings, 'flower', 'sceneShadowResponse')),
    uStyleFlowerSpecularStrength: uniform(value(settings, 'flower', 'specularStrength')),
    uStyleFlowerTextureTint: uniform(color(settings, 'flower', 'textureTint')),
    uStyleFlowerTintStrength: uniform(value(settings, 'flower', 'tintStrength')),
  });
  if (hasRole('flowerPetal')) Object.assign(u, {
    uStyleFlowerBacklitStrength: uniform(value(settings, 'flower', 'backlitStrength')),
    uStyleFlowerCupDarkeningStrength: uniform(value(settings, 'flower', 'cupDarkeningStrength')),
    uStyleFlowerPetalTransmissionMultiplier: uniform(value(settings, 'flower', 'petalTransmissionMultiplier')),
    uStyleFlowerSubsurfaceOpacity: uniform(value(settings, 'flower', 'subsurfaceOpacity')),
    uStyleFlowerSubsurfaceStrength: uniform(value(settings, 'flower', 'subsurfaceStrength')),
    uStyleFlowerUnlitPetalLift: uniform(value(settings, 'flower', 'unlitPetalLift')),
  });
  if (hasRole('flowerCenter')) Object.assign(u, {
    uStyleFlowerCenterLightResponse: uniform(value(settings, 'flower', 'centerLightResponse')),
    uStyleFlowerCenterShadowResponse: uniform(value(settings, 'flower', 'centerShadowResponse')),
  });
  if (hasRole('herbaceousStem')) Object.assign(u, {
    uStyleStemBandCount: uniform(value(settings, 'stem', 'bandCount')),
    uStyleStemBandSoftness: uniform(value(settings, 'stem', 'bandSoftness')),
    uStyleStemColor: uniform(color(settings, 'stem', 'color')),
    uStyleStemColorStrength: uniform(value(settings, 'stem', 'colorStrength')),
    uStyleStemEmissiveStrength: uniform(value(settings, 'stem', 'emissiveStrength')),
    uStyleStemRoughness: uniform(value(settings, 'stem', 'roughness')),
    uStyleStemShadowFloor: uniform(value(settings, 'stem', 'shadowFloor')),
    uStyleStemRimStrength: uniform(value(settings, 'stem', 'rimStrength')),
    uStyleStemSkyFillStrength: uniform(value(settings, 'stem', 'skyFillStrength')),
    uStyleStemSpecularStrength: uniform(value(settings, 'stem', 'specularStrength')),
    uStyleStemTransmissionStrength: uniform(value(settings, 'stem', 'transmissionStrength')),
  });
  if (hasRole('woodySurface')) Object.assign(u, {
    uStyleBarkBandCount: uniform(value(settings, 'bark', 'bandCount')),
    uStyleBarkBandSoftness: uniform(value(settings, 'bark', 'bandSoftness')),
    uStyleBarkEmissiveStrength: uniform(value(settings, 'bark', 'emissiveStrength')),
    uStyleBarkNormalFlatness: uniform(value(settings, 'bark', 'normalFlatness')),
    uStyleBarkRimStrength: uniform(value(settings, 'bark', 'rimStrength')),
    uStyleBarkRoughness: uniform(value(settings, 'bark', 'roughness')),
    uStyleBarkShadowFloor: uniform(value(settings, 'bark', 'shadowFloor')),
    uStyleBarkSkyFillStrength: uniform(value(settings, 'bark', 'skyFillStrength')),
    uStyleBarkSpecularStrength: uniform(value(settings, 'bark', 'specularStrength')),
    uStyleBarkSunTintStrength: uniform(value(settings, 'bark', 'sunTintStrength')),
    uStyleBarkTint: uniform(color(settings, 'bark', 'tint')),
    uStyleBarkTintStrength: uniform(value(settings, 'bark', 'tintStrength')),
    uStyleBarkVerticalShadeStrength: uniform(value(settings, 'bark', 'verticalShadeStrength')),
  });
  return u;
}

export function vegetationBand(wrap, threshold, softness) {
  const half = softness.mul(0.5);
  return smoothstep(threshold.sub(half), threshold.add(half), wrap);
}

export function vegetationVisibility(
  sceneShadow,
  cloudShadow,
  sceneShadowResponse,
  cloudShadowResponse = 1,
) {
  const scene = mix(1.0, sceneShadow, sceneShadowResponse);
  const cloud = mix(1.0, cloudShadow, cloudShadowResponse);
  return scene.mul(cloud);
}

/** Common thin-surface lighting. Family shaders can layer role bands on top. */
export function shadeVegetationSurface({
  baseColor,
  bandShadowColor = null,
  bandOverride = null,
  bandSoftness,
  bandThreshold,
  cloudShadow,
  u,
  diffuseWrap = u.uStyleThinSurfaceDiffuseWrap,
  normal,
  normalUpBias = u.uStyleThinSurfaceNormalUpBias,
  materialShadowColor = null,
  sceneShadow,
  sceneShadowResponse,
  cloudShadowResponse = 1,
  shadowFloor,
  skyColor,
  sunColor,
  sunDirection,
  rimStrength = u.uStyleLightingRimStrength,
  transmissionMultiplier = 1,
  transmissionPower = u.uStyleThinSurfaceTransmissionPower,
  transmissionShadowFloor = u.uStyleThinSurfaceTransmissionShadowFloor,
  transmissionStrength = u.uStyleThinSurfaceTransmissionStrength,
  twoSidedLighting = u.uStyleThinSurfaceTwoSidedLighting,
  skyFillStrength = u.uStyleLightingSkyFillStrength,
  worldPosition,
}) {
  const doubleSidedNormal = normal.mul(faceDirection);
  const faceAwareNormal = mix(normal, doubleSidedNormal, twoSidedLighting);
  const styledNormal = normalize(mix(
    faceAwareNormal,
    vec3(0, 1, 0),
    normalUpBias,
  ));
  const sun = normalize(sunDirection);
  const wrap = dot(styledNormal, sun)
    .mul(diffuseWrap.oneMinus())
    .add(diffuseWrap);
  const visibility = vegetationVisibility(
    sceneShadow,
    cloudShadow,
    sceneShadowResponse,
    cloudShadowResponse,
  ).toVar();
  const band = (bandOverride ?? vegetationBand(wrap, bandThreshold, bandSoftness))
    .mul(visibility).toVar();
  // Most materials use a scalar floor. Foliage assets already author a
  // semantic shadow palette, so they can supply it directly and let this one
  // canonical band—not a second private band—control their full value range.
  const colorNode = (
    bandShadowColor
      ? mix(bandShadowColor, baseColor, band)
      : baseColor.mul(mix(shadowFloor, 1.0, band))
  ).toVar();

  // An asset palette may carry its own shadow tone (grass and tree foliage
  // are the common cases). It establishes the material identity in shadow;
  // the IP-wide treatment tint below still layers over every material.
  const materialShadowAmount = visibility.oneMinus();
  if (materialShadowColor) {
    colorNode.assign(mix(
      colorNode,
      materialShadowColor,
      clamp(materialShadowAmount, 0, 1),
    ));
  }
  const shadowAmount = materialShadowAmount.mul(u.uStyleLightingShadowTintStrength);
  colorNode.mulAssign(mix(
    vec3(1),
    u.uStyleLightingShadowTint,
    clamp(shadowAmount, 0, 1),
  ));
  colorNode.mulAssign(mix(vec3(1), sunColor, band.mul(u.uStyleLightingSunTintStrength)));
  // Vegetation fill is reflected light from the authored surface, not a
  // screen-space blue/white veil. Adding the sky color directly can exceed
  // the albedo several times over once rim and transmission are also active,
  // clipping saturated procedural palettes to pastel white.
  colorNode.addAssign(
    baseColor.mul(skyColor).mul(band.oneMinus()).mul(skyFillStrength),
  );

  const viewDirection = normalize(cameraPosition.sub(worldPosition));
  const rim = pow(
    clamp(abs(dot(styledNormal, viewDirection)).oneMinus(), 0, 1),
    u.uStyleLightingRimPower,
  );
  colorNode.addAssign(
    baseColor.mul(skyColor).mul(rim).mul(rimStrength),
  );
  const transmission = pow(
    clamp(dot(viewDirection, sun.negate()), 0, 1),
    transmissionPower,
  ).mul(transmissionStrength).mul(transmissionMultiplier);
  colorNode.addAssign(
    baseColor.mul(sunColor).mul(transmission).mul(
      mix(
        transmissionShadowFloor,
        1,
        visibility,
      ),
    ),
  );

  const wet = clamp(u.uWetness.mul(u.uWetnessResponse), 0, 1).toVar();
  colorNode.mulAssign(wet.mul(u.uStyleWeatherResponseWetDarkening).oneMinus());
  const luminance = dot(colorNode, vec3(0.299, 0.587, 0.114));
  colorNode.assign(mix(
    colorNode,
    vec3(luminance),
    wet.mul(u.uStyleWeatherResponseWetDesaturation),
  ));
  colorNode.addAssign(
    sunColor.mul(wet).mul(u.uStyleWeatherResponseWetHighlightStrength)
      .mul(rim.mul(0.5).add(0.08)),
  );

  const snowSoftness = u.uStyleWeatherResponseSnowEdgeSoftness.max(0.001);
  const snowEdge = snowSoftness.mul(0.5);
  const snowFacing = smoothstep(
    snowSoftness.mul(0.25).sub(snowEdge),
    snowSoftness.mul(0.25).add(snowEdge),
    styledNormal.y,
  );
  const snow = clamp(u.uSnowCover.mul(u.uSnowRetention).mul(snowFacing), 0, 1);
  const snowTint = u.uStyleWeatherResponseSnowTint.mul(mix(
    u.uStyleWeatherResponseSnowShadowStrength,
    1,
    visibility,
  ));
  colorNode.assign(mix(colorNode, snowTint, snow));
  // The custom vegetation graph is intentionally self-shaded, so it does not
  // receive renderer light intensity automatically. Combine the transient
  // ambient and direct energies here; day remains the calibrated 1.0
  // baseline, while night can actually fall into silhouette.
  const sceneLight = clamp(
    u.uSkyIntensity.mul(0.5)
      .add(u.uSunIntensity.mul(0.5).mul(band)),
    0,
    1.5,
  );
  colorNode.mulAssign(sceneLight);

  return { band, color: colorNode, normal: styledNormal, visibility, viewDirection };
}

export function tagVegetationRole(material, role, variant) {
  const roles = Object.freeze([...new Set((Array.isArray(role) ? role : [role]).filter(Boolean))]);
  material.userData.toonlabVegetation = Object.freeze({
    role: roles[0] ?? '',
    roles,
    variant,
    version: 1,
  });
  return material;
}
