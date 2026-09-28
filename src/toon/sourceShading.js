import * as THREE from 'three';

import { readTexturePixels } from './texturePixels.js';

// Authored shading data carried by a source material, gathered once per
// material at conversion time:
//
// - ToonLab userData conventions an artist or pipeline can attach:
//     toonRoleMask        RGBA role mask (R skin, G face, B hair)
//     toonShadingGradeMap per-texel shadow bias (the lighting map)
//     toonShadeColor / toonShadeMap   authored (absolute) shadow colour
//     toonRampMap         1D shadow-tone ramp (u = 0 at the terminator)
//     toonFaceShadowMap   face map (per-texel light-swing threshold)
//     toonOutlineWidthMap per-texel outline width
// - VRM MToon parameters (three-vrm MToonMaterial), so a VRM keeps the look
//   its author set up instead of being re-guessed from names.
// - An MMD model's own toon ramp (three's MMDLoader: material.gradientMap).
//
// Per-material values are returned as `parameterOverrides` (character
// material parameter → value, characterParameters.js). The adapter applies
// them after resolving the settings, at conversion and on every live retune,
// so they win over preset-wide values. Role-dependent overrides name the
// material's own role (the unsuffixed parameter).

function textureOrNull(value) {
  return value?.isTexture ? value : null;
}

function colorFrom(value) {
  if (value?.isColor) return value.clone();
  if (Array.isArray(value) && value.length >= 3) return new THREE.Color(value[0], value[1], value[2]);
  return null;
}

function maxComponent(color) {
  return Math.max(color.r, color.g, color.b);
}

// MToon 1.0 shading: linearstep(-1 + toony, 1 - toony, NdotL + shift).
// Its midpoint sits at NdotL = -shift with half-width 1 - toony.
function mtoonTerminator(mat) {
  const shift = Number.isFinite(mat.shadingShiftFactor) ? mat.shadingShiftFactor : 0;
  const toony = Number.isFinite(mat.shadingToonyFactor) ? mat.shadingToonyFactor : 0.9;
  return {
    softness: THREE.MathUtils.clamp(1 - toony, 0.005, 1),
    terminator: THREE.MathUtils.clamp(-shift, -1, 1),
  };
}

// Outline width stays with the preset's role widths: MToon widths are authored
// for MToon's own outline (VRoid exports 0.8 mm on the body and none on hair),
// so importing them would leave a VRM nearly unoutlined beside the rest of a
// cast. The author's outline colour and width texture are still imported.
function mtoonDrawsOutline(mat) {
  const mode = String(mat.outlineWidthMode ?? 'none');
  return mode !== 'none' && Number.isFinite(mat.outlineWidthFactor) && mat.outlineWidthFactor > 0;
}

function readMToon(mat) {
  const overrides = {};
  const band = mtoonTerminator(mat);
  overrides.terminator = band.terminator;
  overrides.softness = band.softness;

  let outlineColor = null;
  const authoredOutline = colorFrom(mat.outlineColorFactor);
  if (authoredOutline && mtoonDrawsOutline(mat)) {
    outlineColor = authoredOutline;
    overrides.outlineColorOverride = [authoredOutline.r, authoredOutline.g, authoredOutline.b, 1];
    overrides.outlineOverrideLightingMix = Number.isFinite(mat.outlineLightingMixFactor) ? mat.outlineLightingMixFactor : 1;
  }

  // MToon's parametric rim is a view-angle rim in the author's colour.
  const rimColor = colorFrom(mat.parametricRimColorFactor);
  if (rimColor && maxComponent(rimColor) > 0.001) {
    overrides.rimTint = [rimColor.r, rimColor.g, rimColor.b];
    overrides.rimIntensity = 1;
    overrides.rimMode = 1;
    overrides.rimAlbedoMix = 0;
  }

  const shadeColor = colorFrom(mat.shadeColorFactor);
  const shade = shadeColor ? { color: shadeColor, map: textureOrNull(mat.shadeMultiplyTexture) } : null;

  const shiftTexture = textureOrNull(mat.shadingShiftTexture);
  if (shiftTexture) {
    overrides.lightingMapChannel = [1, 0, 0, 0];
    overrides.lightingMapPivot = 0;
    overrides.lightingMapScale = Number.isFinite(mat.shadingShiftTextureScale) ? mat.shadingShiftTextureScale : 1;
  }

  const matcapColor = colorFrom(mat.matcapFactor);
  const matcapMap = textureOrNull(mat.matcapTexture);
  const matcap = matcapMap && matcapColor && maxComponent(matcapColor) > 0.001 ? matcapMap : null;
  if (matcap) overrides.matcapStrength = maxComponent(matcapColor);

  return {
    lightingMap: shiftTexture,
    matcapMap: matcap,
    outlineColor,
    outlineWidthMap: textureOrNull(mat.outlineWidthMultiplyTexture),
    overrides,
    shade,
  };
}

// MMD toon ramp (three's MMDLoader puts it on material.gradientMap): MMD
// multiplies the albedo by the ramp in display (sRGB) space, so the ramp's
// shadow end over its lit end is the author's shadow tone — a display-space
// multiplier, exactly what the material's tones are. The shared toon01–10
// ramps are MMD defaults, not authored, and are skipped.
const LUMA_WEIGHTS = [0.2126, 0.7152, 0.0722];

function readMmdToonRamp(mat) {
  const ramp = mat?.gradientMap;
  if (!ramp?.isTexture || !mat.userData?.outlineParameters) return null;
  if (ramp.userData?.mmdToon?.shared !== false) return null;
  const pixels = readTexturePixels(ramp, { maxSize: 64 });
  if (!pixels) return null;
  let dark = null;
  let lit = null;
  for (let index = 0; index < pixels.width * pixels.height; index += 1) {
    const offset = index * pixels.channels;
    const texel = [pixels.data[offset], pixels.data[offset + 1], pixels.data[offset + 2]];
    const luma = texel.reduce((sum, value, channel) => sum + value * LUMA_WEIGHTS[channel], 0);
    if (!dark || luma < dark.luma) dark = { luma, texel };
    if (!lit || luma > lit.luma) lit = { luma, texel };
  }
  if (!dark || !lit || lit.luma <= 0) return null;
  return dark.texel.map((value, channel) => Math.min(1, value / Math.max(lit.texel[channel], 1)));
}

/**
 * Resolves the authored shading inputs of one source material against the
 * resolved toon settings.
 */
export function resolveSourceShading(mat, { settings = null } = {}) {
  const userData = mat?.userData ?? {};
  const ramp = settings?.ramp;
  const mtoon = mat?.isMToonMaterial && ramp?.importMToon !== false ? readMToon(mat) : null;
  const mmdTone = !mtoon && ramp?.importMmdRamp === true ? readMmdToonRamp(mat) : null;

  const userShadeColor = colorFrom(userData.toonShadeColor);
  const userShadeMap = textureOrNull(userData.toonShadeMap);
  const userShade = userShadeColor || userShadeMap
    ? { color: userShadeColor ?? new THREE.Color(1, 1, 1), map: userShadeMap }
    : null;

  const lightingSettings = settings?.shading?.lightingMap;
  const userLightingMap = textureOrNull(userData.toonShadingGradeMap ?? userData.toonGradeMap ?? lightingSettings?.map);
  const overrides = { ...(mtoon?.overrides ?? {}) };
  if (userLightingMap) {
    // An explicitly authored map uses the settings' channel/scale/pivot.
    delete overrides.lightingMapChannel;
    delete overrides.lightingMapPivot;
    delete overrides.lightingMapScale;
  }
  if (mmdTone) overrides.toneOverride = [mmdTone[0], mmdTone[1], mmdTone[2], 1];

  return {
    faceShadowMap: textureOrNull(userData.toonFaceShadowMap ?? settings?.face?.map?.texture),
    isMToon: Boolean(mtoon),
    lightingMap: userLightingMap ?? mtoon?.lightingMap ?? null,
    matcapMap: mtoon?.matcapMap ?? null,
    mmdToonFile: mmdTone ? String(mat.gradientMap.userData.mmdToon.file) : null,
    mmdTone,
    // MMD (three's MMDLoader) records each material's edge flag; authors turn
    // it off on eyes, lashes, mouths and blush.
    outlineOff: mat?.userData?.outlineParameters?.visible === false,
    outlineWidthMap: textureOrNull(userData.toonOutlineWidthMap ?? settings?.outline?.widthMap) ?? mtoon?.outlineWidthMap ?? null,
    parameterOverrides: overrides,
    rampMap: textureOrNull(userData.toonRampMap),
    roleMaskMap: textureOrNull(userData.toonRoleMask ?? userData.toonRoleMaskMap),
    shadeOverride: userShade ?? mtoon?.shade ?? null,
  };
}
