import * as THREE from 'three';
import { MeshToonNodeMaterial } from 'three/webgpu';
import {
  abs,
  cameraPosition,
  clamp,
  dot,
  float,
  mix,
  normalMap as normalMapNode,
  normalWorld,
  normalize,
  positionWorld,
  pow,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';

import { sampleEnvironmentSunShadow } from '../shaders-tsl/chunks/environment-sun-shadow.js';
import { sampleEnvironmentCloudShadow } from '../sky/cloudShadow.js';

const LEGACY_SURFACE_PROFILES = Object.freeze({
  paintedMetal: Object.freeze({
    colorControl: 'bodyColor',
    colorLiftScale: 1,
    decalScale: 1,
    decalThreshold: 0.16,
    fallbackMetalness: 0.58,
    fresnelScale: 0.72,
    highlightScale: 0.26,
    lightValueCap: 1.25,
    materialResponseScale: 0.82,
    normalScale: 0.7,
    paintValue: 0.7,
    pastelScale: 1,
    planarSheenScale: 0.18,
    responseValueCap: 1.4,
    roleColorMix: 0,
    roughnessBreakupScale: 0.56,
    sharpRustBoost: 1.25,
    sourceAnchorAuthorityScale: 1,
    sourceHueAuthorityScale: 1,
    sourceValueAuthorityScale: 1,
    viewReflectionScale: 0.45,
    wearScale: 1,
  }),
  graphicPanel: Object.freeze({
    colorControl: 'bodyColor',
    colorLiftScale: 0.24,
    decalScale: 0,
    decalThreshold: 0.9,
    fallbackMetalness: 0.08,
    fresnelScale: 0.35,
    graphicSafeMacro: 1,
    highlightScale: 0.16,
    lightValueCap: 1.08,
    materialResponseScale: 0.34,
    normalScale: 0.45,
    paintExtractionScale: 0.12,
    paintValue: 0.7,
    pastelScale: 0.12,
    planarSheenScale: 0.16,
    responseValueCap: 1.15,
    roleColorMix: 0,
    roughnessBreakupScale: 0.34,
    sharpRustBoost: 0.2,
    sourceAnchorAuthorityScale: 0,
    sourceHueAuthorityScale: 1,
    sourceValueAuthorityScale: 1,
    viewReflectionScale: 0.22,
    wearScale: 0.08,
  }),
  technicalSurface: Object.freeze({
    colorControl: 'bodyColor',
    colorLiftScale: 0.08,
    decalScale: 0,
    decalThreshold: 0.9,
    fallbackMetalness: 0.42,
    fresnelScale: 0.48,
    graphicSafeMacro: 1,
    highlightScale: 0.3,
    lightValueCap: 0.92,
    materialResponseScale: 0.74,
    normalScale: 0.62,
    paintExtractionScale: 0,
    paintValue: 0.42,
    pastelScale: 0,
    planarSheenScale: 0.42,
    responseValueCap: 1.02,
    roleColorMix: 0,
    roughnessBreakupScale: 0.62,
    sharpRustBoost: 0.15,
    sourceAnchorAuthorityScale: 0,
    sourceHueAuthorityScale: 1,
    sourceValueAuthorityScale: 1,
    viewReflectionScale: 0.56,
    wearScale: 0.06,
  }),
  paintedTrim: Object.freeze({
    colorControl: 'trimColor',
    colorLiftScale: 1,
    decalScale: 0,
    decalThreshold: 0.38,
    fallbackMetalness: 0.72,
    fresnelScale: 0.9,
    highlightScale: 0.48,
    lightValueCap: 0.62,
    materialResponseScale: 1,
    normalScale: 0.8,
    paintValue: 0.28,
    pastelScale: 0.08,
    planarSheenScale: 0.22,
    responseValueCap: 0.92,
    roleColorMix: 0.86,
    roughnessBreakupScale: 0.7,
    sharpRustBoost: 1.8,
    sourceAnchorAuthorityScale: 0,
    sourceHueAuthorityScale: 1,
    sourceValueAuthorityScale: 0.2,
    viewReflectionScale: 0.55,
    wearScale: 0.22,
  }),
  rubber: Object.freeze({
    colorControl: 'rubberColor',
    colorLiftScale: 1,
    decalScale: 0,
    decalThreshold: 0.9,
    fallbackMetalness: 0,
    fresnelScale: 0.28,
    highlightScale: 0.04,
    lightValueCap: 0.42,
    materialResponseScale: 0.16,
    normalScale: 0.72,
    paintValue: 0.14,
    pastelScale: 0,
    planarSheenScale: 0.04,
    responseValueCap: 0.72,
    roleColorMix: 1,
    roughnessBreakupScale: 0.2,
    sharpRustBoost: 0.25,
    sourceAnchorAuthorityScale: 0,
    sourceHueAuthorityScale: 1,
    sourceValueAuthorityScale: 1,
    viewReflectionScale: 0.08,
    wearScale: 0.08,
  }),
  lid: Object.freeze({
    colorControl: 'lidColor',
    colorLiftScale: 1,
    decalScale: 0,
    decalThreshold: 0.28,
    fallbackMetalness: 0.18,
    fresnelScale: 0.82,
    highlightScale: 0.9,
    lightValueCap: 0.34,
    materialResponseScale: 1.12,
    normalScale: 0.62,
    paintValue: 0.3,
    pastelScale: 0.18,
    planarSheenScale: 1,
    responseValueCap: 0.82,
    roleColorMix: 0.72,
    roughnessBreakupScale: 1,
    sharpRustBoost: 0.55,
    sourceAnchorAuthorityScale: 0,
    sourceHueAuthorityScale: 1,
    sourceValueAuthorityScale: 1,
    viewReflectionScale: 1,
    wearScale: 0.12,
  }),
  bareMetal: Object.freeze({
    colorControl: 'bareMetalColor',
    colorLiftScale: 0,
    decalScale: 0,
    decalThreshold: 0.9,
    fallbackMetalness: 0.88,
    fresnelScale: 0.55,
    highlightScale: 0.08,
    lightValueCap: 0.32,
    materialResponseScale: 1.26,
    normalScale: 0.72,
    paintValue: 0.16,
    pastelScale: 0,
    planarSheenScale: 0.34,
    responseValueCap: 0.62,
    roleColorMix: 1,
    roughnessBreakupScale: 0.84,
    sharpRustBoost: 3.2,
    sourceAnchorAuthorityScale: 0,
    sourceHueAuthorityScale: 0,
    sourceValueAuthorityScale: 0,
    viewReflectionScale: 0.78,
    wearScale: 0.95,
  }),
});

function surfaceProfile(base, overrides) {
  return Object.freeze({ ...base, ...overrides });
}

const SURFACE_PROFILES = Object.freeze({
  ...LEGACY_SURFACE_PROFILES,
  // `bareMetal` is the weathered-scrap look: it discards the source albedo's
  // hue AND value (both authority scales 0) and paints the surface from
  // `bareMetalColor`, then piles on rust. That is right for an untextured or
  // scanned prop, and wrong for an authored brushed-stainless map — the
  // anisotropy an artist baked into the albedo simply never reached the frame,
  // so `metal`/`brushed` rendered as one flat panel. `brushed` is its own
  // finish in the contract and now gets its own profile: the metal response
  // (role hue, fresnel, planar sheen, low light cap) is kept, the authored
  // VALUE structure is honoured, and the scrapyard wear is dialled out.
  // `raw`/`polished`/`anodized`/`mirror` still resolve to `bareMetal`.
  brushedMetal: surfaceProfile(LEGACY_SURFACE_PROFILES.bareMetal, {
    highlightScale: 0.16,
    lightValueCap: 0.46,
    normalScale: 0.9,
    planarSheenScale: 0.5,
    responseValueCap: 0.78,
    sharpRustBoost: 0.5,
    sourceHueAuthorityScale: 0,
    sourceValueAuthorityScale: 1,
    wearScale: 0.45,
  }),
  coatedPanel: LEGACY_SURFACE_PROFILES.lid,
  genericDielectric: surfaceProfile(LEGACY_SURFACE_PROFILES.paintedMetal, {
    colorLiftScale: 0.42,
    fallbackMetalness: 0,
    fresnelScale: 0.34,
    highlightScale: 0.2,
    lightValueCap: 1.08,
    materialResponseScale: 0.42,
    normalScale: 0.82,
    paintExtractionScale: 0.35,
    pastelScale: 0.45,
    planarSheenScale: 0.08,
    responseValueCap: 1.15,
    roughnessBreakupScale: 0.72,
    sharpRustBoost: 0.2,
    viewReflectionScale: 0.2,
    wearScale: 0.3,
  }),
  masonry: surfaceProfile(LEGACY_SURFACE_PROFILES.paintedMetal, {
    colorLiftScale: 0.2,
    fallbackMetalness: 0,
    fresnelScale: 0.08,
    highlightScale: 0.08,
    lightValueCap: 1.05,
    materialResponseScale: 0.18,
    normalScale: 1,
    paintExtractionScale: 0.12,
    pastelScale: 0.18,
    planarSheenScale: 0.015,
    responseValueCap: 1.08,
    roughnessBreakupScale: 1,
    sharpRustBoost: 0,
    sourceAnchorAuthorityScale: 0,
    viewReflectionScale: 0.035,
    wearScale: 0.24,
  }),
  wood: surfaceProfile(LEGACY_SURFACE_PROFILES.paintedMetal, {
    colorLiftScale: 0.28,
    fallbackMetalness: 0,
    fresnelScale: 0.24,
    highlightScale: 0.15,
    lightValueCap: 1.08,
    materialResponseScale: 0.32,
    normalScale: 0.88,
    paintExtractionScale: 0.18,
    pastelScale: 0.28,
    planarSheenScale: 0.06,
    responseValueCap: 1.12,
    roughnessBreakupScale: 0.82,
    sharpRustBoost: 0,
    sourceAnchorAuthorityScale: 0,
    viewReflectionScale: 0.14,
    wearScale: 0.34,
  }),
  polymer: surfaceProfile(LEGACY_SURFACE_PROFILES.lid, {
    colorControl: 'bodyColor',
    colorLiftScale: 0.34,
    fallbackMetalness: 0,
    lightValueCap: 0.82,
    paintExtractionScale: 0.18,
    pastelScale: 0.24,
    responseValueCap: 1.02,
    roleColorMix: 0,
    sharpRustBoost: 0,
    sourceAnchorAuthorityScale: 0,
    viewReflectionScale: 0.62,
    wearScale: 0.14,
  }),
  glass: surfaceProfile(LEGACY_SURFACE_PROFILES.technicalSurface, {
    fallbackMetalness: 0,
    fresnelScale: 1.35,
    highlightScale: 1,
    lightValueCap: 1.05,
    materialResponseScale: 1.15,
    normalScale: 0.35,
    pastelScale: 0,
    planarSheenScale: 0.5,
    responseValueCap: 1.2,
    roughnessBreakupScale: 0.28,
    viewReflectionScale: 1.15,
    wearScale: 0.02,
  }),
  ceramic: surfaceProfile(LEGACY_SURFACE_PROFILES.paintedMetal, {
    colorLiftScale: 0.3,
    fallbackMetalness: 0,
    fresnelScale: 0.46,
    highlightScale: 0.54,
    materialResponseScale: 0.55,
    normalScale: 0.68,
    paintExtractionScale: 0.12,
    pastelScale: 0.32,
    planarSheenScale: 0.18,
    roughnessBreakupScale: 0.42,
    sharpRustBoost: 0,
    viewReflectionScale: 0.36,
    wearScale: 0.08,
  }),
  textile: surfaceProfile(LEGACY_SURFACE_PROFILES.paintedMetal, {
    colorLiftScale: 0.18,
    fallbackMetalness: 0,
    fresnelScale: 0.06,
    highlightScale: 0.035,
    lightValueCap: 1.02,
    materialResponseScale: 0.1,
    normalScale: 0.92,
    paintExtractionScale: 0.08,
    pastelScale: 0.2,
    planarSheenScale: 0,
    responseValueCap: 1.04,
    roughnessBreakupScale: 0.9,
    sharpRustBoost: 0,
    sourceAnchorAuthorityScale: 0,
    viewReflectionScale: 0.02,
    wearScale: 0.1,
  }),
  leather: surfaceProfile(LEGACY_SURFACE_PROFILES.paintedMetal, {
    colorLiftScale: 0.16,
    fallbackMetalness: 0,
    fresnelScale: 0.26,
    highlightScale: 0.18,
    lightValueCap: 0.9,
    materialResponseScale: 0.28,
    normalScale: 0.82,
    paintExtractionScale: 0.08,
    pastelScale: 0.08,
    planarSheenScale: 0.05,
    responseValueCap: 1,
    roughnessBreakupScale: 0.7,
    sharpRustBoost: 0,
    sourceAnchorAuthorityScale: 0,
    viewReflectionScale: 0.16,
    wearScale: 0.16,
  }),
  paper: surfaceProfile(LEGACY_SURFACE_PROFILES.graphicPanel, {
    fallbackMetalness: 0,
    fresnelScale: 0.04,
    highlightScale: 0.02,
    materialResponseScale: 0.08,
    normalScale: 0.3,
    planarSheenScale: 0,
    viewReflectionScale: 0.01,
  }),
  // A diffusing sheet — shoji paper, a paper lantern, a fabric shade — lit
  // from the far side. `MANUFACTURED_RENDER_MODES` has carried `translucent`
  // and `transmissive` since v1 and the manifest validates them, but nothing
  // downstream did anything with them: a paper screen converted to the same
  // opaque toon surface as a poster, and the single read that makes a teahouse
  // look like a teahouse — warm interior light through paper, with the lattice
  // dark against it — was not expressible. See D19-079.
  //
  // The response is deliberately NOT physical transmission. A diffuser is not
  // a window: you do not see through it, you see it lit. So the term is a
  // view-independent glow, tinted by `translucencyColor`, modulated by the
  // paper's own albedo (a stain or a fibre inclusion must read darker when
  // backlit, which is exactly what makes washi look like washi), softened
  // toward grazing angles, and NOT gated by the sun shadow, because the light
  // behind the screen is not the sun.
  paperTranslucent: surfaceProfile(LEGACY_SURFACE_PROFILES.graphicPanel, {
    fallbackMetalness: 0,
    fresnelScale: 0.04,
    highlightScale: 0.02,
    lightValueCap: 1.16,
    materialResponseScale: 0.08,
    normalScale: 0.3,
    planarSheenScale: 0,
    translucencyScale: 1,
    viewReflectionScale: 0.01,
    wearScale: 0.04,
  }),
  composite: surfaceProfile(LEGACY_SURFACE_PROFILES.technicalSurface, {
    fallbackMetalness: 0.08,
    fresnelScale: 0.58,
    highlightScale: 0.42,
    materialResponseScale: 0.62,
    normalScale: 0.72,
    pastelScale: 0.06,
    planarSheenScale: 0.2,
    viewReflectionScale: 0.44,
    wearScale: 0.1,
  }),
  fluid: surfaceProfile(LEGACY_SURFACE_PROFILES.technicalSurface, {
    fallbackMetalness: 0,
    fresnelScale: 1.2,
    highlightScale: 0.9,
    materialResponseScale: 1.08,
    normalScale: 0.55,
    pastelScale: 0,
    planarSheenScale: 0.62,
    viewReflectionScale: 1.1,
    wearScale: 0,
  }),
});

export { SURFACE_PROFILES as URBAN_PROP_SURFACE_PROFILES };

export const URBAN_MATERIAL_BASES = Object.freeze([
  'metal',
  'mineral',
  'wood',
  'polymer',
  'rubber',
  'glass',
  'ceramic',
  'textile',
  'leather',
  'paper',
  'composite',
  'fluid',
  'genericDielectric',
]);

export const URBAN_MATERIAL_FINISHES = Object.freeze([
  'raw',
  'painted',
  'varnished',
  'clearCoated',
  'polished',
  'brushed',
  'glazed',
  'anodized',
  'mirror',
  'matte',
]);

export const URBAN_RENDER_MODES = Object.freeze([
  'opaque',
  'alphaCutout',
  'translucent',
  'transmissive',
  'unlit',
]);

export const URBAN_STRUCTURAL_ROLES = Object.freeze([
  'primaryMass',
  'secondaryStructure',
  'trim',
  'fastener',
  'cavity',
  'window',
  'graphic',
  'lightEmitter',
]);

export const URBAN_CONTENT_FLAGS = Object.freeze([
  'graphic',
  'display',
  'emissive',
]);

export const URBAN_PROP_SURFACE_ROLES = Object.freeze([
  'paintedMetal',
  'graphicPanel',
  'technicalSurface',
  'paintedTrim',
  'rubber',
  'lid',
  'bareMetal',
]);

export const URBAN_PROP_PALETTES = Object.freeze({
  source: Object.freeze({
    accentColor: 0xeaf4ff,
    bodyColor: 0x16499b,
    label: 'Source',
    lidColor: 0x102d5d,
    overrideStrength: 0,
    rubberColor: 0x090c16,
    trimColor: 0x11162b,
  }),
  mint: Object.freeze({
    accentColor: 0x9a48ee,
    bodyColor: 0x36d3a2,
    label: 'Mint',
    lidColor: 0x9da7ab,
    overrideStrength: 1,
    rubberColor: 0x202831,
    trimColor: 0x164d5d,
  }),
  blue: Object.freeze({
    accentColor: 0xee4baa,
    bodyColor: 0x3f83df,
    label: 'Blue',
    lidColor: 0x9ba5af,
    overrideStrength: 1,
    rubberColor: 0x202831,
    trimColor: 0x203b58,
  }),
});

let lockedGradientMap;
let smoothGradientMap;
const textureAnchorCache = new WeakMap();

function createLockedGradientMap() {
  if (lockedGradientMap) return lockedGradientMap;
  // Duplicate the darkest texel to create three deliberate lighting bands.
  // This keeps midtones broad while making the lit-to-shadow transition read
  // like authored cel shading instead of a continuous PBR rolloff.
  const values = [92, 92, 92, 255, 92, 92, 92, 255, 205, 205, 205, 255, 255, 255, 255, 255];
  lockedGradientMap = new THREE.DataTexture(
    new Uint8Array(values),
    4,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  lockedGradientMap.colorSpace = THREE.NoColorSpace;
  lockedGradientMap.magFilter = THREE.NearestFilter;
  lockedGradientMap.minFilter = THREE.NearestFilter;
  lockedGradientMap.generateMipmaps = false;
  lockedGradientMap.needsUpdate = true;
  return lockedGradientMap;
}

function createSmoothGradientMap() {
  if (smoothGradientMap) return smoothGradientMap;
  const values = new Uint8Array(256 * 4);
  for (let index = 0; index < 256; index += 1) {
    const value = Math.round(72 + (index / 255) * 183);
    const offset = index * 4;
    values[offset] = value;
    values[offset + 1] = value;
    values[offset + 2] = value;
    values[offset + 3] = 255;
  }
  smoothGradientMap = new THREE.DataTexture(
    values,
    256,
    1,
    THREE.RGBAFormat,
    THREE.UnsignedByteType,
  );
  smoothGradientMap.colorSpace = THREE.NoColorSpace;
  smoothGradientMap.magFilter = THREE.LinearFilter;
  smoothGradientMap.minFilter = THREE.LinearFilter;
  smoothGradientMap.generateMipmaps = false;
  smoothGradientMap.needsUpdate = true;
  return smoothGradientMap;
}

function deriveTextureAnchor(texture) {
  if (!texture?.image || typeof document === 'undefined') {
    return { color: new THREE.Color(0xffffff), strength: 0 };
  }
  if (textureAnchorCache.has(texture)) return textureAnchorCache.get(texture);

  const fallback = { color: new THREE.Color(0xffffff), strength: 0 };
  try {
    const image = texture.image;
    const imageWidth = image.width ?? image.videoWidth ?? 0;
    const imageHeight = image.height ?? image.videoHeight ?? 0;
    if (!imageWidth || !imageHeight) return fallback;

    const sampleSize = 48;
    const canvas = document.createElement('canvas');
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(image, 0, 0, sampleSize, sampleSize);
    const pixels = context.getImageData(0, 0, sampleSize, sampleSize).data;
    const binCount = 24;
    const bins = Array.from({ length: binCount }, () => ({
      blue: 0,
      green: 0,
      red: 0,
      weight: 0,
    }));
    let chromaticPixelCount = 0;
    let eligiblePixelCount = 0;
    let totalWeight = 0;

    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] < 32) continue;
      const red = pixels[index] / 255;
      const green = pixels[index + 1] / 255;
      const blue = pixels[index + 2] / 255;
      const high = Math.max(red, green, blue);
      const low = Math.min(red, green, blue);
      const chroma = high - low;
      const saturation = chroma / Math.max(high, 0.001);
      if (high >= 0.07 && high <= 0.96) eligiblePixelCount += 1;
      const mutedNeutral = saturation < 0.22 && chroma < 0.055;
      if (
        saturation < 0.12
        || mutedNeutral
        || high < 0.07
        || high > 0.96
      ) continue;
      chromaticPixelCount += 1;

      let hue;
      if (high === red) hue = ((green - blue) / chroma) % 6;
      else if (high === green) hue = (blue - red) / chroma + 2;
      else hue = (red - green) / chroma + 4;
      hue = ((hue / 6) + 1) % 1;
      const weight = saturation * saturation * (0.4 + high * 0.6);
      const bin = bins[Math.floor(hue * binCount) % binCount];
      bin.red += red * weight;
      bin.green += green * weight;
      bin.blue += blue * weight;
      bin.weight += weight;
      totalWeight += weight;
    }

    if (totalWeight <= 0.001) return fallback;
    const clusterWeightAt = (index) => bins[index].weight
      + bins[(index + binCount - 1) % binCount].weight
      + bins[(index + 1) % binCount].weight;
    let winner = 0;
    let winnerWeight = 0;
    for (let index = 0; index < binCount; index += 1) {
      const clusterWeight = clusterWeightAt(index);
      if (clusterWeight > winnerWeight) {
        winner = index;
        winnerWeight = clusterWeight;
      }
    }

    // Dark warm-brown corrosion often covers more texels than the remaining
    // paint. When a substantial non-warm cluster also exists, treat that
    // second cluster as the paint identity instead of averaging paint + rust.
    const winnerIsWarmWear = winner <= 2 || winner >= binCount - 1;
    if (winnerIsWarmWear) {
      let paintWinner = winner;
      let paintWeight = 0;
      for (let index = 3; index < binCount - 1; index += 1) {
        const clusterWeight = clusterWeightAt(index);
        if (clusterWeight > paintWeight) {
          paintWinner = index;
          paintWeight = clusterWeight;
        }
      }
      if (paintWeight > totalWeight * 0.24 && paintWeight > winnerWeight * 0.5) {
        winner = paintWinner;
        winnerWeight = paintWeight;
      }
    }

    const clusterBins = [
      bins[(winner + binCount - 1) % binCount],
      bins[winner],
      bins[(winner + 1) % binCount],
    ];
    const sum = clusterBins.reduce((result, bin) => ({
      red: result.red + bin.red,
      green: result.green + bin.green,
      blue: result.blue + bin.blue,
      weight: result.weight + bin.weight,
    }), { red: 0, green: 0, blue: 0, weight: 0 });
    const red = sum.red / Math.max(sum.weight, 0.001);
    const green = sum.green / Math.max(sum.weight, 0.001);
    const blue = sum.blue / Math.max(sum.weight, 0.001);
    const high = Math.max(red, green, blue, 0.001);
    const normalized = {
      red: red / high,
      green: green / high,
      blue: blue / high,
    };
    const low = Math.min(normalized.red, normalized.green, normalized.blue);
    const chromaRange = Math.max(1 - low, 0.001);
    const pureHue = {
      red: (normalized.red - low) / chromaRange,
      green: (normalized.green - low) / chromaRange,
      blue: (normalized.blue - low) / chromaRange,
    };
    const saturationBoost = 0.62;
    const dominance = winnerWeight / totalWeight;
    const chromaticCoverage = chromaticPixelCount
      / Math.max(eligiblePixelCount, 1);
    const dominanceConfidence = THREE.MathUtils.clamp(
      (dominance - 0.2) / 0.25,
      0,
      1,
    );
    const coverageConfidence = THREE.MathUtils.clamp(
      (chromaticCoverage - 0.08) / 0.26,
      0,
      1,
    );
    const result = {
      color: new THREE.Color().setRGB(
        THREE.MathUtils.lerp(normalized.red, pureHue.red, saturationBoost),
        THREE.MathUtils.lerp(normalized.green, pureHue.green, saturationBoost),
        THREE.MathUtils.lerp(normalized.blue, pureHue.blue, saturationBoost),
        THREE.SRGBColorSpace,
      ),
      strength: dominanceConfidence * coverageConfidence,
    };
    textureAnchorCache.set(texture, result);
    return result;
  } catch {
    return fallback;
  }
}

function colorControl(hex) {
  return { value: new THREE.Color(hex) };
}

function numberControl(value) {
  return { value };
}

export function createUrbanPropShaderControls(palette = 'source') {
  const selected = URBAN_PROP_PALETTES[palette] ?? URBAN_PROP_PALETTES.source;
  return {
    accentColor: colorControl(selected.accentColor),
    bareMetalColor: colorControl(0x788087),
    celLightingEnabled: numberControl(1),
    colorLiftEnabled: numberControl(1),
    colorLiftStrength: numberControl(0.58),
    coolShadowColor: colorControl(0x173875),
    coolShadowsEnabled: numberControl(1),
    coolShadowStrength: numberControl(0.72),
    bodyColor: colorControl(selected.bodyColor),
    decalStrength: numberControl(0.95),
    dirtColor: colorControl(0x2d1b29),
    edgeInkEnabled: numberControl(1),
    fresnelColor: colorControl(0xb8d7e7),
    fresnelEnabled: numberControl(1),
    fresnelStrength: numberControl(0.22),
    graphicsEnabled: numberControl(1),
    highlightBandColor: colorControl(0xc5e7ff),
    highlightBandEnabled: numberControl(1),
    highlightBandStrength: numberControl(0.42),
    highlightStrength: numberControl(0.16),
    lidColor: colorControl(selected.lidColor),
    materialResponseColor: colorControl(0xaacbe0),
    materialResponseEnabled: numberControl(1),
    materialResponseStrength: numberControl(0.82),
    normalDetailEnabled: numberControl(1),
    normalStrength: numberControl(0.1),
    pastelBlueColor: colorControl(0x8faabd),
    pastelPaletteEnabled: numberControl(1),
    pastelStrength: numberControl(0.10),
    planarSheenEnabled: numberControl(1),
    planarSheenStrength: numberControl(0.25),
    paintBandsEnabled: numberControl(1),
    paintExtractionEnabled: numberControl(1),
    paintExtractionStrength: numberControl(1),
    paletteOverride: numberControl(selected.overrideStrength),
    rimLeftColor: colorControl(0xff43d1),
    rimRightColor: colorControl(0x44e8ff),
    rimEnabled: numberControl(0),
    reflectionNormalEnabled: numberControl(1),
    reflectionNormalStrength: numberControl(0.8),
    reflectionProbeAvailable: numberControl(0),
    reflectionProbeLayerEnabled: numberControl(1),
    reflectionProbeMap: { value: null },
    reflectionProbeStrength: numberControl(0.82),
    reflectionSelectivityEnabled: numberControl(1),
    reflectionSelectivityStrength: numberControl(0.82),
    roughnessBreakupEnabled: numberControl(1),
    roughnessBreakupStrength: numberControl(1.15),
    rubberColor: colorControl(selected.rubberColor),
    shadowPastelEnabled: numberControl(1),
    shadowPastelStrength: numberControl(0.80),
    silhouetteInkEnabled: numberControl(1),
    sourceAuthorityEnabled: numberControl(1),
    sourceAuthorityStrength: numberControl(1),
    trimColor: colorControl(selected.trimColor),
    // Diffusing-sheet response (shoji, paper lantern, fabric shade). Only
    // profiles that declare `translucencyScale` read these.
    translucencyColor: colorControl(0xffd7a0),
    translucencyEnabled: numberControl(1),
    translucencyStrength: numberControl(0.85),
    viewReflectionEnabled: numberControl(1),
    viewReflectionStrength: numberControl(0.62),
    wearEnabled: numberControl(1),
    wearAmount: numberControl(0.28),
  };
}

export const URBAN_PROP_SHADER_PROFILE_DOCUMENT_TYPE = 'toonlab/manufactured-surface-profile';
export const URBAN_PROP_SHADER_PROFILE_SCHEMA_VERSION = 1;

const URBAN_PROP_RUNTIME_ONLY_CONTROL_KEYS = new Set([
  'reflectionProbeAvailable',
  'reflectionProbeMap',
]);

function urbanPropProfileId(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'manufactured_surface';
}

function urbanPropControlDefaults() {
  return createUrbanPropShaderControls('source');
}

/** Portable, JSON-safe values accepted by createUrbanPropShaderControls(). */
export function createUrbanPropShaderProfileSettings(input = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const controls = urbanPropControlDefaults();
  const settings = {};
  for (const [key, control] of Object.entries(controls)) {
    if (URBAN_PROP_RUNTIME_ONLY_CONTROL_KEYS.has(key)) continue;
    const candidate = source[key];
    if (control.value?.isColor) {
      const color = control.value.clone();
      if (candidate !== undefined) {
        try { color.set(candidate); } catch { /* keep the runtime default */ }
      }
      settings[key] = `#${color.getHexString()}`;
      continue;
    }
    const number = candidate === undefined ? Number(control.value) : Number(candidate);
    settings[key] = Number.isFinite(number) ? number : Number(control.value);
  }
  return settings;
}

export function snapshotUrbanPropShaderControls(controls) {
  const values = {};
  const defaults = urbanPropControlDefaults();
  for (const [key, fallback] of Object.entries(defaults)) {
    if (URBAN_PROP_RUNTIME_ONLY_CONTROL_KEYS.has(key)) continue;
    const control = controls?.[key] ?? fallback;
    values[key] = fallback.value?.isColor
      ? `#${(control.value?.isColor ? control.value : fallback.value).getHexString()}`
      : Number(control.value);
  }
  return createUrbanPropShaderProfileSettings(values);
}

export function applyUrbanPropShaderProfile(controls, input) {
  if (!controls || typeof controls !== 'object') {
    throw new Error('Urban prop shader controls are required.');
  }
  const source = input?.type === URBAN_PROP_SHADER_PROFILE_DOCUMENT_TYPE
    ? parseUrbanPropShaderProfileDocument(input)
    : { ok: true, value: { settings: createUrbanPropShaderProfileSettings(input) } };
  if (!source.ok) throw new Error(source.errors.join(' '));
  for (const [key, value] of Object.entries(source.value.settings)) {
    const control = controls[key];
    if (!control) continue;
    if (control.value?.isColor) control.value.set(value);
    else control.value = value;
  }
  return controls;
}

export function createUrbanPropShaderProfileDocument(id, {
  description = '',
  label = id,
  settings = {},
} = {}) {
  return {
    description: String(description ?? ''),
    id: urbanPropProfileId(id),
    label: String(label ?? id).trim() || 'Manufactured surface',
    settings: createUrbanPropShaderProfileSettings(settings),
    type: URBAN_PROP_SHADER_PROFILE_DOCUMENT_TYPE,
    version: URBAN_PROP_SHADER_PROFILE_SCHEMA_VERSION,
  };
}

export function parseUrbanPropShaderProfileDocument(input) {
  let source = input;
  if (typeof source === 'string') {
    try { source = JSON.parse(source); } catch (error) {
      return { errors: [`Invalid manufactured-surface JSON: ${error.message}`], ok: false };
    }
  }
  const errors = [];
  const warnings = [];
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return { errors: ['Manufactured-surface profile must be a JSON object.'], ok: false };
  }
  if (source.type !== URBAN_PROP_SHADER_PROFILE_DOCUMENT_TYPE) {
    errors.push(`Profile type must be "${URBAN_PROP_SHADER_PROFILE_DOCUMENT_TYPE}".`);
  }
  const version = Number(source.version ?? URBAN_PROP_SHADER_PROFILE_SCHEMA_VERSION);
  if (version > URBAN_PROP_SHADER_PROFILE_SCHEMA_VERSION || version < 1) {
    errors.push(`Unsupported manufactured-surface profile version ${source.version}.`);
  }
  const id = urbanPropProfileId(source.id || source.label);
  const label = String(source.label ?? '').trim();
  if (!label) errors.push('Manufactured-surface profile needs a label.');
  const known = new Set(Object.keys(createUrbanPropShaderProfileSettings()));
  for (const key of Object.keys(source.settings ?? {})) {
    if (!known.has(key)) warnings.push(`Unknown manufactured-surface setting "${key}" was ignored.`);
  }
  if (errors.length) return { errors, ok: false, warnings };
  return {
    errors,
    ok: true,
    value: createUrbanPropShaderProfileDocument(id, {
      description: source.description,
      label,
      settings: source.settings,
    }),
    warnings,
  };
}

export function serializeUrbanPropShaderProfile(document, { pretty = true } = {}) {
  const result = parseUrbanPropShaderProfileDocument(document);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return JSON.stringify(result.value, null, pretty ? 2 : 0);
}

export function applyUrbanPropPalette(controls, palette) {
  const selected = URBAN_PROP_PALETTES[palette] ?? URBAN_PROP_PALETTES.source;
  for (const key of ['accentColor', 'bodyColor', 'lidColor', 'rubberColor', 'trimColor']) {
    controls[key].value.setHex(selected[key]);
  }
  controls.paletteOverride.value = selected.overrideStrength;
}

const LEGACY_SURFACE_CLASSIFICATIONS = Object.freeze({
  paintedMetal: Object.freeze({
    baseMaterial: 'metal',
    finish: 'painted',
    renderMode: 'opaque',
    structuralRole: 'primaryMass',
  }),
  paintedTrim: Object.freeze({
    baseMaterial: 'metal',
    finish: 'painted',
    renderMode: 'opaque',
    structuralRole: 'trim',
  }),
  bareMetal: Object.freeze({
    baseMaterial: 'metal',
    finish: 'raw',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  }),
  rubber: Object.freeze({
    baseMaterial: 'rubber',
    finish: 'matte',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  }),
  lid: Object.freeze({
    baseMaterial: 'metal',
    finish: 'painted',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  }),
  graphicPanel: Object.freeze({
    baseMaterial: 'genericDielectric',
    contentFlags: Object.freeze(['graphic']),
    finish: 'matte',
    renderMode: 'opaque',
    structuralRole: 'graphic',
  }),
  technicalSurface: Object.freeze({
    baseMaterial: 'genericDielectric',
    contentFlags: Object.freeze(['display']),
    finish: 'matte',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  }),
});

function includesEnum(values, value) {
  return values.includes(value);
}

function sourceRenderMode(sourceMaterial) {
  if (
    Number(sourceMaterial?.transmission ?? 0) > 0
    || Number(sourceMaterial?.transmissionNode?.value ?? 0) > 0
  ) {
    return 'transmissive';
  }
  if (sourceMaterial?.transparent || Number(sourceMaterial?.opacity ?? 1) < 0.999) {
    return 'translucent';
  }
  if (Number(sourceMaterial?.alphaTest ?? 0) > 0) return 'alphaCutout';
  return 'opaque';
}

function sourceHasEmission(sourceMaterial) {
  if (sourceMaterial?.emissiveMap || sourceMaterial?.emissiveNode) return true;
  const emissive = sourceMaterial?.emissive;
  return Boolean(emissive && (emissive.r > 0 || emissive.g > 0 || emissive.b > 0));
}

export function createUrbanMaterialClassification(options = {}) {
  const baseMaterial = includesEnum(URBAN_MATERIAL_BASES, options.baseMaterial)
    ? options.baseMaterial
    : 'genericDielectric';
  const finish = includesEnum(URBAN_MATERIAL_FINISHES, options.finish)
    ? options.finish
    : 'matte';
  const renderMode = includesEnum(URBAN_RENDER_MODES, options.renderMode)
    ? options.renderMode
    : 'opaque';
  const structuralRole = includesEnum(URBAN_STRUCTURAL_ROLES, options.structuralRole)
    ? options.structuralRole
    : 'primaryMass';
  const contentFlags = Object.freeze([
    ...new Set(
      (Array.isArray(options.contentFlags) ? options.contentFlags : [])
        .filter((flag) => includesEnum(URBAN_CONTENT_FLAGS, flag)),
    ),
  ]);
  return Object.freeze({
    version: 1,
    baseMaterial,
    finish,
    renderMode,
    structuralRole,
    contentFlags,
    classificationSource: options.classificationSource ?? 'explicit',
    confidence: THREE.MathUtils.clamp(Number(options.confidence ?? 1), 0, 1),
  });
}

function classificationFromMetadata(object, sourceMaterial) {
  const nodeData = object?.userData ?? {};
  const materialData = sourceMaterial?.userData ?? {};
  const nested = {
    ...(nodeData.urbanMaterial && typeof nodeData.urbanMaterial === 'object'
      ? nodeData.urbanMaterial
      : {}),
    ...(materialData.urbanMaterial && typeof materialData.urbanMaterial === 'object'
      ? materialData.urbanMaterial
      : {}),
  };
  const explicit = {
    baseMaterial: materialData.urbanBaseMaterial
      ?? nodeData.urbanBaseMaterial
      ?? nested.baseMaterial,
    finish: materialData.urbanFinish
      ?? nodeData.urbanFinish
      ?? nested.finish,
    renderMode: materialData.urbanRenderMode
      ?? nodeData.urbanRenderMode
      ?? nested.renderMode,
    structuralRole: materialData.urbanStructuralRole
      ?? nodeData.urbanStructuralRole
      ?? nested.structuralRole,
    contentFlags: materialData.urbanContentFlags
      ?? nodeData.urbanContentFlags
      ?? nested.contentFlags,
  };
  if (!includesEnum(URBAN_MATERIAL_BASES, explicit.baseMaterial)) return null;
  return createUrbanMaterialClassification({
    ...explicit,
    classificationSource: 'explicit',
    confidence: 1,
  });
}

function classificationText(object, materialOverride) {
  return `${object?.name ?? ''} ${object?.parent?.name ?? ''} ${
    materialOverride
      ? materialOverride?.name ?? ''
      : Array.isArray(object?.material)
        ? object.material.map((material) => material?.name ?? '').join(' ')
        : object?.material?.name ?? ''
  }`.toLowerCase();
}

export function resolveUrbanMaterialProfile(classification) {
  const flags = classification?.contentFlags ?? [];
  if (flags.includes('graphic') || classification?.structuralRole === 'graphic') {
    return 'graphicPanel';
  }
  if (flags.includes('display') || flags.includes('emissive')) {
    return 'technicalSurface';
  }
  switch (classification?.baseMaterial) {
    case 'metal':
      // Brushed is the one bare-metal finish that normally arrives with an
      // authored anisotropic map; it keeps that map's value structure.
      if (classification.finish === 'brushed') return 'brushedMetal';
      if (['raw', 'polished', 'anodized', 'mirror'].includes(
        classification.finish,
      )) {
        return 'bareMetal';
      }
      if (classification.structuralRole === 'trim') return 'paintedTrim';
      if (classification.structuralRole === 'secondaryStructure') {
        return 'coatedPanel';
      }
      return 'paintedMetal';
    case 'mineral':
      return 'masonry';
    case 'wood':
      return 'wood';
    case 'polymer':
      return 'polymer';
    case 'rubber':
      return 'rubber';
    case 'glass':
      return 'glass';
    case 'ceramic':
      return 'ceramic';
    case 'textile':
      return 'textile';
    case 'leather':
      return 'leather';
    case 'paper':
      // A backlit diffusing sheet is a different surface from a poster, and
      // renderMode is where the contract already says so.
      return classification.renderMode === 'translucent'
        || classification.renderMode === 'transmissive'
        ? 'paperTranslucent'
        : 'paper';
    case 'composite':
      return 'composite';
    case 'fluid':
      return 'fluid';
    default:
      return 'genericDielectric';
  }
}

export function classifyUrbanMaterial(object, materialOverride = null) {
  const sourceMaterial = materialOverride ?? (
    Array.isArray(object?.material)
      ? object.material[0]
      : object?.material
  );
  const explicitClassification = classificationFromMetadata(object, sourceMaterial);
  if (explicitClassification) return explicitClassification;

  const explicitRole = sourceMaterial?.userData?.urbanSurface
    ?? object?.userData?.urbanSurface;
  if (URBAN_PROP_SURFACE_ROLES.includes(explicitRole)) {
    return createUrbanMaterialClassification({
      ...LEGACY_SURFACE_CLASSIFICATIONS[explicitRole],
      renderMode: sourceRenderMode(sourceMaterial),
      contentFlags: [
        ...(LEGACY_SURFACE_CLASSIFICATIONS[explicitRole]?.contentFlags ?? []),
        ...(sourceHasEmission(sourceMaterial) ? ['emissive'] : []),
      ],
      classificationSource: 'legacy',
      confidence: 1,
    });
  }

  const text = classificationText(object, materialOverride);
  const canonicalRole = URBAN_PROP_SURFACE_ROLES.find((role) => (
    new RegExp(`(?:^|[^a-z0-9])${role.toLowerCase()}(?:$|[^a-z0-9])`).test(text)
  ));
  if (canonicalRole) {
    return createUrbanMaterialClassification({
      ...LEGACY_SURFACE_CLASSIFICATIONS[canonicalRole],
      renderMode: sourceRenderMode(sourceMaterial),
      contentFlags: [
        ...(LEGACY_SURFACE_CLASSIFICATIONS[canonicalRole]?.contentFlags ?? []),
        ...(sourceHasEmission(sourceMaterial) ? ['emissive'] : []),
      ],
      classificationSource: 'nameToken',
      confidence: 0.95,
    });
  }

  let baseMaterial = 'genericDielectric';
  let finish = 'matte';
  let structuralRole = 'primaryMass';
  const renderMode = sourceRenderMode(sourceMaterial);
  const contentFlags = [];
  let confidence = 0.46;

  if (/(sign|poster|billboard|advert|label|decal|graphic|print)/.test(text)) {
    contentFlags.push('graphic');
    structuralRole = 'graphic';
    confidence = Math.max(confidence, 0.9);
  }
  if (/(electrical|electronic|solar|photovoltaic|circuit|control.?panel|screen|display)/.test(text)) {
    contentFlags.push('display');
    structuralRole = structuralRole === 'graphic' ? structuralRole : 'secondaryStructure';
    confidence = Math.max(confidence, 0.86);
  }
  if (sourceHasEmission(sourceMaterial) || /(emissive|lamp|light|neon|led)/.test(text)) {
    contentFlags.push('emissive');
    if (structuralRole === 'primaryMass') structuralRole = 'lightEmitter';
    confidence = Math.max(confidence, 0.82);
  }

  if (/(glass|window|windshield|windscreen|mirror)/.test(text)) {
    baseMaterial = 'glass';
    finish = /mirror/.test(text) ? 'mirror' : 'polished';
    structuralRole = /window|windshield|windscreen/.test(text) ? 'window' : structuralRole;
    confidence = 0.96;
  } else if (/(rubber|tire|tyre)/.test(text)) {
    baseMaterial = 'rubber';
    finish = 'matte';
    structuralRole = 'secondaryStructure';
    confidence = 0.96;
  } else if (/(fabric|textile|cloth|upholstery|curtain|canvas|carpet|rug)/.test(text)) {
    baseMaterial = 'textile';
    finish = 'matte';
    confidence = 0.92;
  } else if (/(leather|suede)/.test(text)) {
    baseMaterial = 'leather';
    finish = 'matte';
    confidence = 0.96;
  } else if (/(paper|cardboard|carton|poster)/.test(text)) {
    baseMaterial = 'paper';
    finish = 'matte';
    confidence = 0.92;
  } else if (/(ceramic|porcelain|earthenware)/.test(text)) {
    baseMaterial = 'ceramic';
    finish = /glaz/.test(text) ? 'glazed' : 'matte';
    confidence = 0.94;
  } else if (/(wood|timber|plank|plywood|veneer)/.test(text)) {
    baseMaterial = 'wood';
    finish = /(varnish|lacquer)/.test(text) ? 'varnished' : 'raw';
    confidence = 0.94;
  } else if (/(plastic|polymer|acrylic|vinyl|resin|foam)/.test(text)) {
    baseMaterial = 'polymer';
    finish = 'matte';
    confidence = 0.9;
  } else if (/(carbon.?fiber|fiberglass|fibre.?glass|laminate|composite)/.test(text)) {
    baseMaterial = 'composite';
    finish = /clear.?coat/.test(text) ? 'clearCoated' : 'matte';
    confidence = 0.92;
  } else if (/(liquid|fluid|water|oil)/.test(text)) {
    baseMaterial = 'fluid';
    finish = 'polished';
    confidence = 0.88;
  } else if (
    /(brick|concrete|cement|plaster|stucco|masonry|stone|marble|granite|asphalt|pavement|drywall|wall|floor|roof|gable|building)/.test(text)
  ) {
    baseMaterial = 'mineral';
    finish = /(marble|granite|polish)/.test(text) ? 'polished' : 'raw';
    confidence = 0.9;
  } else if (
    /(metal|steel|iron|alum|chrome|copper|brass|handle|hinge|rod|bar|rail|pipe)/.test(text)
    || Number(sourceMaterial?.metalness ?? 0) > 0.45
  ) {
    baseMaterial = 'metal';
    finish = /(chrome|polish|mirror)/.test(text)
      ? 'polished'
      : /(brush)/.test(text)
        ? 'brushed'
        : /(handle|hinge|rod|bar|rail|pipe|bare)/.test(text)
          ? 'raw'
          : 'painted';
    confidence = /(metal|steel|iron|alum|chrome|copper|brass)/.test(text) ? 0.94 : 0.72;
  }

  if (/(top|lid|cover|roof|gable)/.test(text) && structuralRole === 'primaryMass') {
    structuralRole = 'secondaryStructure';
  }
  if (/(trim|frame|grate|extra)/.test(text) && structuralRole === 'primaryMass') {
    structuralRole = 'trim';
  }
  if (/(handle|hinge|fastener|bolt|screw|rod|bar|rail|pipe)/.test(text)) {
    structuralRole = 'fastener';
  }
  if (/(cavity|interior|inside|recess|void)/.test(text)) {
    structuralRole = 'cavity';
  }

  return createUrbanMaterialClassification({
    baseMaterial,
    finish,
    renderMode,
    structuralRole,
    contentFlags,
    classificationSource: baseMaterial === 'genericDielectric' ? 'fallback' : 'inferred',
    confidence,
  });
}

export function classifyUrbanPropSurface(object, materialOverride = null) {
  return resolveUrbanMaterialProfile(
    classifyUrbanMaterial(object, materialOverride),
  );
}

function installLockedLookShader(
  material,
  source,
  profile,
  controls,
  { isMirror = false } = {},
) {
  const sourceAnchor = deriveTextureAnchor(source?.map);
  const sourceResponseMap = source?.roughnessMap ?? source?.metalnessMap ?? null;
  const sourceImage = source?.map?.image;
  const sourceWidth = sourceImage?.width ?? sourceImage?.videoWidth ?? 1024;
  const sourceHeight = sourceImage?.height ?? sourceImage?.videoHeight ?? 1024;
  const sourceResponseImage = sourceResponseMap?.image ?? sourceImage;
  const sourceResponseWidth = sourceResponseImage?.width
    ?? sourceResponseImage?.videoWidth
    ?? sourceWidth;
  const sourceResponseHeight = sourceResponseImage?.height
    ?? sourceResponseImage?.videoHeight
    ?? sourceHeight;
  const sourceTexelSize = {
    value: new THREE.Vector2(1 / sourceWidth, 1 / sourceHeight),
  };
  const sourceBaseColor = {
    value: source?.color?.clone?.() ?? new THREE.Color(0xffffff),
  };
  const sourceMetalness = {
    value: Number.isFinite(source?.metalness)
      ? source.metalness
      : profile.fallbackMetalness,
  };
  const sourceRoughness = {
    value: Number.isFinite(source?.roughness) ? source.roughness : 0.72,
  };
  material.onBeforeCompile = (shader) => {
    shader.uniforms.urbanAccentColor = controls.accentColor;
    shader.uniforms.urbanCoolShadowColor = controls.coolShadowColor;
    shader.uniforms.urbanCoolShadowsEnabled = controls.coolShadowsEnabled;
    shader.uniforms.urbanCoolShadowStrength = controls.coolShadowStrength;
    shader.uniforms.urbanColorLiftEnabled = controls.colorLiftEnabled;
    shader.uniforms.urbanColorLiftStrength = controls.colorLiftStrength;
    shader.uniforms.urbanDecalStrength = controls.decalStrength;
    shader.uniforms.urbanDirtColor = controls.dirtColor;
    shader.uniforms.urbanFresnelColor = controls.fresnelColor;
    shader.uniforms.urbanFresnelEnabled = controls.fresnelEnabled;
    shader.uniforms.urbanFresnelStrength = controls.fresnelStrength;
    shader.uniforms.urbanGraphicsEnabled = controls.graphicsEnabled;
    shader.uniforms.urbanHighlightBandColor = controls.highlightBandColor;
    shader.uniforms.urbanHighlightBandEnabled = controls.highlightBandEnabled;
    shader.uniforms.urbanHighlightBandStrength = controls.highlightBandStrength;
    shader.uniforms.urbanHighlightStrength = controls.highlightStrength;
    shader.uniforms.urbanMapTexelSize = sourceTexelSize;
    shader.uniforms.urbanMaterialResponseColor = controls.materialResponseColor;
    shader.uniforms.urbanMaterialResponseEnabled = controls.materialResponseEnabled;
    shader.uniforms.urbanMaterialResponseMap = {
      value: sourceResponseMap ?? source?.map ?? null,
    };
    shader.uniforms.urbanMaterialResponseMapEnabled = {
      value: sourceResponseMap ? 1 : 0,
    };
    shader.uniforms.urbanMaterialResponseStrength = controls.materialResponseStrength;
    shader.uniforms.urbanMaterialResponseTexelSize = {
      value: new THREE.Vector2(
        1 / sourceResponseWidth,
        1 / sourceResponseHeight,
      ),
    };
    shader.uniforms.urbanPaintBandsEnabled = controls.paintBandsEnabled;
    shader.uniforms.urbanPaintExtractionEnabled = controls.paintExtractionEnabled;
    shader.uniforms.urbanPaintExtractionStrength = controls.paintExtractionStrength;
    shader.uniforms.urbanPastelBlueColor = controls.pastelBlueColor;
    shader.uniforms.urbanPastelPaletteEnabled = controls.pastelPaletteEnabled;
    shader.uniforms.urbanPastelStrength = controls.pastelStrength;
    shader.uniforms.urbanPlanarSheenEnabled = controls.planarSheenEnabled;
    shader.uniforms.urbanPlanarSheenStrength = controls.planarSheenStrength;
    shader.uniforms.urbanPaletteOverride = controls.paletteOverride;
    shader.uniforms.urbanRimLeftColor = controls.rimLeftColor;
    shader.uniforms.urbanRimRightColor = controls.rimRightColor;
    shader.uniforms.urbanRimEnabled = controls.rimEnabled;
    shader.uniforms.urbanReflectionNormalEnabled =
      controls.reflectionNormalEnabled;
    shader.uniforms.urbanReflectionNormalStrength =
      controls.reflectionNormalStrength;
    if (isMirror) {
      shader.uniforms.urbanReflectionProbeAvailable =
        controls.reflectionProbeAvailable;
      shader.uniforms.urbanReflectionProbeLayerEnabled =
        controls.reflectionProbeLayerEnabled;
      shader.uniforms.urbanReflectionProbeMap = controls.reflectionProbeMap;
      shader.uniforms.urbanReflectionProbeStrength =
        controls.reflectionProbeStrength;
    }
    shader.uniforms.urbanReflectionSelectivityEnabled =
      controls.reflectionSelectivityEnabled;
    shader.uniforms.urbanReflectionSelectivityStrength =
      controls.reflectionSelectivityStrength;
    shader.uniforms.urbanRoleColor = controls[profile.colorControl];
    shader.uniforms.urbanRoughnessBreakupEnabled =
      controls.roughnessBreakupEnabled;
    shader.uniforms.urbanRoughnessBreakupStrength =
      controls.roughnessBreakupStrength;
    shader.uniforms.urbanShadowPastelEnabled = controls.shadowPastelEnabled;
    shader.uniforms.urbanShadowPastelStrength = controls.shadowPastelStrength;
    shader.uniforms.urbanSourceAnchorColor = { value: sourceAnchor.color };
    shader.uniforms.urbanSourceAnchorStrength = { value: sourceAnchor.strength };
    shader.uniforms.urbanSourceAuthorityEnabled = controls.sourceAuthorityEnabled;
    shader.uniforms.urbanSourceAuthorityStrength = controls.sourceAuthorityStrength;
    shader.uniforms.urbanSourceBaseColor = sourceBaseColor;
    shader.uniforms.urbanSourceMetalness = sourceMetalness;
    shader.uniforms.urbanSourceRoughness = sourceRoughness;
    shader.uniforms.urbanViewReflectionEnabled = controls.viewReflectionEnabled;
    shader.uniforms.urbanViewReflectionStrength = controls.viewReflectionStrength;
    shader.uniforms.urbanWearAmount = controls.wearAmount;
    shader.uniforms.urbanWearEnabled = controls.wearEnabled;

    shader.fragmentShader = `
      uniform vec3 urbanAccentColor;
      uniform vec3 urbanCoolShadowColor;
      uniform float urbanCoolShadowsEnabled;
      uniform float urbanCoolShadowStrength;
      uniform float urbanColorLiftEnabled;
      uniform float urbanColorLiftStrength;
      uniform float urbanDecalStrength;
      uniform vec3 urbanDirtColor;
      uniform vec3 urbanFresnelColor;
      uniform float urbanFresnelEnabled;
      uniform float urbanFresnelStrength;
      uniform float urbanGraphicsEnabled;
      uniform vec3 urbanHighlightBandColor;
      uniform float urbanHighlightBandEnabled;
      uniform float urbanHighlightBandStrength;
      uniform float urbanHighlightStrength;
      uniform vec2 urbanMapTexelSize;
      uniform vec3 urbanMaterialResponseColor;
      uniform float urbanMaterialResponseEnabled;
      uniform sampler2D urbanMaterialResponseMap;
      uniform float urbanMaterialResponseMapEnabled;
      uniform float urbanMaterialResponseStrength;
      uniform vec2 urbanMaterialResponseTexelSize;
      uniform float urbanPaintBandsEnabled;
      uniform float urbanPaintExtractionEnabled;
      uniform float urbanPaintExtractionStrength;
      uniform vec3 urbanPastelBlueColor;
      uniform float urbanPastelPaletteEnabled;
      uniform float urbanPastelStrength;
      uniform float urbanPlanarSheenEnabled;
      uniform float urbanPlanarSheenStrength;
      uniform float urbanPaletteOverride;
      uniform vec3 urbanRimLeftColor;
      uniform vec3 urbanRimRightColor;
      uniform float urbanRimEnabled;
      uniform float urbanReflectionNormalEnabled;
      uniform float urbanReflectionNormalStrength;
      ${isMirror ? `
      uniform float urbanReflectionProbeAvailable;
      uniform float urbanReflectionProbeLayerEnabled;
      uniform samplerCube urbanReflectionProbeMap;
      uniform float urbanReflectionProbeStrength;
      ` : ''}
      uniform float urbanReflectionSelectivityEnabled;
      uniform float urbanReflectionSelectivityStrength;
      uniform vec3 urbanRoleColor;
      uniform float urbanRoughnessBreakupEnabled;
      uniform float urbanRoughnessBreakupStrength;
      uniform float urbanShadowPastelEnabled;
      uniform float urbanShadowPastelStrength;
      uniform vec3 urbanSourceAnchorColor;
      uniform float urbanSourceAnchorStrength;
      uniform float urbanSourceAuthorityEnabled;
      uniform float urbanSourceAuthorityStrength;
      uniform vec3 urbanSourceBaseColor;
      uniform float urbanSourceMetalness;
      uniform float urbanSourceRoughness;
      uniform float urbanViewReflectionEnabled;
      uniform float urbanViewReflectionStrength;
      uniform float urbanWearAmount;
      uniform float urbanWearEnabled;
    ${shader.fragmentShader}`;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <map_fragment>',
      source?.map
        ? `
          vec4 urbanSourceSample = texture2D(map, vMapUv);
          vec2 urbanMacroRadius = urbanMapTexelSize
            * mix(
              1.0,
              34.0,
              urbanPaintExtractionStrength * urbanPaintExtractionEnabled
            );
          vec4 urbanBlurredMacroSample = urbanSourceSample * 0.20;
          urbanBlurredMacroSample += texture2D(
            map,
            vMapUv + vec2(urbanMacroRadius.x, 0.0)
          ) * 0.10;
          urbanBlurredMacroSample += texture2D(
            map,
            vMapUv - vec2(urbanMacroRadius.x, 0.0)
          ) * 0.10;
          urbanBlurredMacroSample += texture2D(
            map,
            vMapUv + vec2(0.0, urbanMacroRadius.y)
          ) * 0.10;
          urbanBlurredMacroSample += texture2D(
            map,
            vMapUv - vec2(0.0, urbanMacroRadius.y)
          ) * 0.10;
          urbanBlurredMacroSample += texture2D(
            map,
            vMapUv + urbanMacroRadius
          ) * 0.10;
          urbanBlurredMacroSample += texture2D(
            map,
            vMapUv - urbanMacroRadius
          ) * 0.10;
          urbanBlurredMacroSample += texture2D(
            map,
            vMapUv + vec2(urbanMacroRadius.x, -urbanMacroRadius.y)
          ) * 0.10;
          urbanBlurredMacroSample += texture2D(
            map,
            vMapUv + vec2(-urbanMacroRadius.x, urbanMacroRadius.y)
          ) * 0.10;

          vec2 urbanUltraRadius = urbanMapTexelSize * 96.0;
          vec4 urbanBlurredUltraMacroSample = texture2D(
            map,
            vMapUv + vec2(urbanUltraRadius.x, 0.0)
          ) * 0.25;
          urbanBlurredUltraMacroSample += texture2D(
            map,
            vMapUv - vec2(urbanUltraRadius.x, 0.0)
          ) * 0.25;
          urbanBlurredUltraMacroSample += texture2D(
            map,
            vMapUv + vec2(0.0, urbanUltraRadius.y)
          ) * 0.25;
          urbanBlurredUltraMacroSample += texture2D(
            map,
            vMapUv - vec2(0.0, urbanUltraRadius.y)
          ) * 0.25;
          float urbanGraphicSafeMacro =
            ${(profile.graphicSafeMacro ?? 0).toFixed(4)};
          vec4 urbanMacroSample = mix(
            urbanBlurredMacroSample,
            urbanSourceSample,
            urbanGraphicSafeMacro
          );
          vec4 urbanUltraMacroSample = mix(
            urbanBlurredUltraMacroSample,
            urbanSourceSample,
            urbanGraphicSafeMacro
          );
          vec3 urbanSharpColor = urbanSourceSample.rgb * urbanSourceBaseColor;
          vec3 urbanMacroColor = urbanMacroSample.rgb * urbanSourceBaseColor;
          vec3 urbanUltraMacroColor = urbanUltraMacroSample.rgb
            * urbanSourceBaseColor;

          float urbanSharpLuma = dot(
            urbanSharpColor,
            vec3(0.2126, 0.7152, 0.0722)
          );
          float urbanMacroLuma = dot(
            urbanMacroColor,
            vec3(0.2126, 0.7152, 0.0722)
          );
          float urbanSharpHigh = max(
            max(urbanSharpColor.r, urbanSharpColor.g),
            urbanSharpColor.b
          );
          float urbanSharpLow = min(
            min(urbanSharpColor.r, urbanSharpColor.g),
            urbanSharpColor.b
          );
          float urbanSharpChroma = urbanSharpHigh - urbanSharpLow;
          float urbanSharpRelativeChroma = urbanSharpChroma
            / max(urbanSharpHigh, 0.06);
          float urbanLocalNeutralMask = 1.0 - smoothstep(
            0.055,
            0.18,
            urbanSharpRelativeChroma
          );
          // Black is a local source property, not a material-wide class. A
          // mixed atlas can contain rust-red paint and a neutral black bike;
          // the colored texels must not grant their hue to the black texels.
          float urbanLocalBlackMask = (
            1.0 - smoothstep(0.10, 0.34, urbanSharpHigh)
          ) * (
            1.0 - smoothstep(0.06, 0.20, urbanSharpRelativeChroma)
          );
          float urbanMacroHigh = max(
            max(urbanMacroColor.r, urbanMacroColor.g),
            urbanMacroColor.b
          );
          float urbanMacroLow = min(
            min(urbanMacroColor.r, urbanMacroColor.g),
            urbanMacroColor.b
          );
          float urbanLocalContrast = smoothstep(
            0.04,
            0.22,
            length(urbanSharpColor - urbanMacroColor)
          );

          vec3 urbanSharpHue = urbanSharpColor / max(urbanSharpHigh, 0.035);
          vec3 urbanMacroHue = urbanMacroColor / max(urbanMacroHigh, 0.035);
          float urbanAnchorHigh = max(
            max(urbanSourceAnchorColor.r, urbanSourceAnchorColor.g),
            urbanSourceAnchorColor.b
          );
          float urbanAnchorLow = min(
            min(urbanSourceAnchorColor.r, urbanSourceAnchorColor.g),
            urbanSourceAnchorColor.b
          );
          vec3 urbanAnchorHue = urbanSourceAnchorColor
            / max(urbanAnchorHigh, 0.035);
          vec3 urbanPaintHue = mix(
            urbanMacroHue,
            urbanAnchorHue,
            urbanSourceAnchorStrength
          );
          float urbanRoleHigh = max(
            max(urbanRoleColor.r, urbanRoleColor.g),
            urbanRoleColor.b
          );
          vec3 urbanRoleHue = urbanRoleColor / max(urbanRoleHigh, 0.035);
          vec3 urbanWearReferenceHue = mix(
            urbanRoleHue,
            urbanAnchorHue,
            urbanSourceAnchorStrength
          );
          urbanPaintHue = mix(
            urbanPaintHue,
            urbanRoleHue,
            ${profile.roleColorMix.toFixed(4)}
          );
          float urbanPaletteHigh = max(
            max(diffuseColor.r, diffuseColor.g),
            diffuseColor.b
          );
          vec3 urbanPaletteHue = diffuseColor.rgb / max(urbanPaletteHigh, 0.035);
          urbanPaintHue = mix(
            urbanPaintHue,
            urbanPaletteHue,
            urbanPaletteOverride
          );

          float urbanSharpNeutral = 1.0 - smoothstep(
            0.08,
            0.34,
            urbanSharpChroma
          );
          float urbanGraphicMask = smoothstep(
            ${(profile.decalThreshold * 0.45).toFixed(4)},
            0.46,
            urbanSharpLuma
          ) * urbanSharpNeutral
            * smoothstep(
              0.06,
              0.24,
              urbanSharpLuma - urbanMacroLuma
            )
            * smoothstep(
              0.018,
              0.14,
              length(urbanSharpColor - urbanMacroColor)
            )
            * ${profile.decalScale.toFixed(4)};

          float urbanMacroValue = pow(
            clamp(urbanMacroHigh, 0.0, 1.0),
            0.72
          );
          float urbanSmoothPaintValue = ${profile.paintValue.toFixed(4)}
            * mix(0.74, 1.18, smoothstep(0.16, 0.78, urbanMacroValue));
          float urbanPaintBandValue = ${profile.paintValue.toFixed(4)} * 0.72;
          urbanPaintBandValue = mix(
            urbanPaintBandValue,
            ${profile.paintValue.toFixed(4)},
            step(0.31, urbanMacroValue)
          );
          urbanPaintBandValue = mix(
            urbanPaintBandValue,
            min(0.96, ${profile.paintValue.toFixed(4)} * 1.18),
            step(0.68, urbanMacroValue)
          );
          float urbanPaintValue = mix(
            urbanSmoothPaintValue,
            urbanPaintBandValue,
            urbanPaintBandsEnabled
          );

          float urbanPaintLift = urbanColorLiftEnabled
            * urbanColorLiftStrength
            * ${profile.colorLiftScale.toFixed(4)};
          urbanPaintValue = min(
            0.98,
            urbanPaintValue + 0.24 * urbanPaintLift
          );
          float urbanPaintHueLuma = dot(
            urbanPaintHue,
            vec3(0.2126, 0.7152, 0.0722)
          );
          urbanPaintHue = clamp(
            mix(
              vec3(urbanPaintHueLuma),
              urbanPaintHue,
              1.0 + 0.88 * urbanPaintLift
            ),
            0.0,
            1.36
          );
          float urbanLocalSourceChroma = urbanMacroHigh - urbanMacroLow;
          float urbanLocalRelativeChroma = urbanLocalSourceChroma
            / max(urbanMacroHigh, 0.08);
          float urbanMacroColorPresence = max(
            smoothstep(
              0.035,
              0.10,
              urbanLocalSourceChroma
            ),
            smoothstep(
              0.30,
              0.52,
              urbanLocalRelativeChroma
            ) * smoothstep(
              0.008,
              0.035,
              urbanMacroHigh
            )
          );
          // Macro evidence defines a material's local color class. Sharp
          // scratches are detail/wear and cannot reclassify neutral structure.
          float urbanLocalColorPresence = urbanMacroColorPresence;
          vec3 urbanLocalSourceHue = urbanMacroHue;
          float urbanAnchorColorPresence = smoothstep(
            0.035,
            0.14,
            urbanAnchorHigh - urbanAnchorLow
          );
          float urbanAnchorAgreement = 1.0 - smoothstep(
            0.18,
            0.62,
            distance(urbanLocalSourceHue, urbanAnchorHue)
          );
          float urbanAnchorConfidence = smoothstep(
            0.08,
            0.32,
            urbanSourceAnchorStrength
          );
          float urbanAnchorAuthority = urbanAnchorConfidence
            * ${profile.sourceAnchorAuthorityScale.toFixed(4)};
          float urbanSourceColorPresence = max(
            urbanLocalColorPresence,
            urbanAnchorColorPresence
              * urbanAnchorAuthority
          );
          float urbanAnchorTrust = urbanAnchorAuthority * mix(
            1.0,
            urbanAnchorAgreement,
            urbanLocalColorPresence
          );
          vec3 urbanStableSourceHue = mix(
            vec3(1.0),
            mix(
              urbanLocalSourceHue,
              urbanAnchorHue,
              urbanAnchorTrust
            ),
            urbanSourceColorPresence
          );
          float urbanSourceAuthority = urbanSourceAuthorityEnabled
            * urbanSourceAuthorityStrength
            * (1.0 - urbanPaletteOverride);
          urbanPaintHue = mix(
            urbanPaintHue,
            urbanStableSourceHue,
            urbanSourceAuthority
              * ${profile.sourceHueAuthorityScale.toFixed(4)}
          );
          // A credible saturated texture anchor identifies weathering inside
          // one painted material (the dumpster). A muted neutral atlas has no
          // such anchor, so its dark structure remains neutral (the station).
          float urbanSourceNeutralClass = 1.0 - urbanSourceColorPresence;
          float urbanDarkNeutralMask = urbanSourceNeutralClass * (
            1.0 - smoothstep(0.16, 0.48, urbanMacroHigh)
          );
          float urbanSourceBlackMask = urbanSourceNeutralClass * (
            1.0 - smoothstep(0.10, 0.34, urbanMacroHigh)
          );
          urbanDarkNeutralMask = max(
            urbanDarkNeutralMask,
            urbanLocalBlackMask
          );
          urbanSourceBlackMask = max(
            urbanSourceBlackMask,
            urbanLocalBlackMask
          );
          float urbanRawStableSourceValue = clamp(
            mix(
              urbanMacroHigh,
              urbanAnchorHigh,
              urbanAnchorConfidence
            ),
            0.015,
            1.0
          );
          float urbanStableSourceValue = mix(
            pow(urbanRawStableSourceValue, 0.82),
            max(0.012, urbanRawStableSourceValue * 0.52),
            urbanSourceBlackMask
          );
          urbanPaintValue = mix(
            urbanPaintValue,
            urbanStableSourceValue,
            urbanSourceAuthority
              * max(urbanSourceNeutralClass, urbanLocalBlackMask)
              * ${Math.max(
                profile.sourceValueAuthorityScale,
                profile.sourceHueAuthorityScale,
              ).toFixed(4)}
          );
          float urbanCoolBlueGate = smoothstep(
            0.025,
            0.14,
            urbanPaintHue.b - max(urbanPaintHue.r, urbanPaintHue.g)
          ) * urbanPastelPaletteEnabled * ${profile.pastelScale.toFixed(4)};
          float urbanPastelMix = urbanCoolBlueGate
            * urbanPastelStrength;
          float urbanPastelHigh = max(
            max(urbanPastelBlueColor.r, urbanPastelBlueColor.g),
            urbanPastelBlueColor.b
          );
          vec3 urbanPastelHue = urbanPastelBlueColor
            / max(urbanPastelHigh, 0.035);
          urbanPaintHue = mix(
            urbanPaintHue,
            urbanPastelHue,
            urbanPastelMix
          );
          urbanPaintValue = mix(
            urbanPaintValue,
            0.68,
            urbanPastelMix
          );
          vec3 urbanCleanPaint = clamp(
            urbanPaintHue * urbanPaintValue,
            0.0,
            1.0
          );
          float urbanLocalBlackValue = clamp(
            urbanSharpLuma * 0.72 + 0.008,
            0.008,
            0.12
          );
          urbanCleanPaint = mix(
            urbanCleanPaint,
            vec3(urbanLocalBlackValue),
            urbanLocalBlackMask * urbanSourceAuthority
          );

          float urbanSharpWarmRust = smoothstep(
            0.002,
            0.035,
            urbanSharpColor.r
              - max(urbanSharpColor.g, urbanSharpColor.b * 0.88)
          ) * (
            1.0 - smoothstep(0.72, 0.94, urbanSharpHigh)
          );
          float urbanMacroWarmWear = smoothstep(
            0.002,
            0.065,
            urbanMacroColor.r
              - max(urbanMacroColor.g, urbanMacroColor.b * 0.88)
          );
          float urbanWearStructure = smoothstep(
            0.035,
            0.22,
            length(urbanMacroColor - urbanUltraMacroColor)
          );
          float urbanDarkDamage = smoothstep(
            0.12,
            0.46,
            urbanMacroHigh - urbanSharpHigh
          ) * urbanLocalContrast;
          float urbanMacroHueWear = smoothstep(
            0.16,
            0.78,
            distance(urbanMacroHue, urbanWearReferenceHue)
          ) * urbanLocalColorPresence;
          float urbanRawWear = max(
            urbanMacroWarmWear * 1.4,
            urbanMacroHueWear * urbanWearStructure * 1.8
          );
          urbanRawWear = max(urbanRawWear, urbanDarkDamage * 0.30);
          urbanRawWear = max(
            urbanRawWear,
            urbanSharpWarmRust * ${profile.sharpRustBoost.toFixed(4)}
          );
          urbanRawWear = clamp(urbanRawWear, 0.0, 1.0);
          urbanRawWear *= 1.0 - urbanGraphicMask;
          float urbanWearThreshold = mix(
            0.90,
            0.40,
            urbanWearAmount
          );
          float urbanWearMask = smoothstep(
            urbanWearThreshold,
            min(0.98, urbanWearThreshold + 0.10),
            urbanRawWear
          ) * ${profile.wearScale.toFixed(4)};
          float urbanWearValue = mix(
            0.10,
            0.24,
            step(0.46, urbanSharpHigh)
          );
          vec3 urbanWearHue = mix(
            urbanDirtColor,
            urbanSharpHue,
            mix(0.08, 0.82, urbanSharpWarmRust)
          );
          float urbanWearHueHigh = max(
            max(urbanWearHue.r, urbanWearHue.g),
            urbanWearHue.b
          );
          urbanWearHue /= max(urbanWearHueHigh, 0.035);
          vec3 urbanStylizedWear = clamp(
            urbanWearHue * mix(
              urbanWearValue,
              min(0.34, max(0.17, urbanSharpHigh * 0.72)),
              urbanSharpWarmRust
            ),
            0.0,
            1.0
          );

          float urbanExtractionMix = urbanPaintExtractionEnabled
            * urbanPaintExtractionStrength
            * ${(profile.paintExtractionScale ?? 1).toFixed(4)}
            * (1.0 - 0.92 * urbanGraphicMask);
          vec3 urbanReconstructed = mix(
            urbanSharpColor,
            urbanCleanPaint,
            clamp(urbanExtractionMix, 0.0, 1.0)
          );
          urbanReconstructed = mix(
            urbanReconstructed,
            urbanStylizedWear,
            urbanWearMask * urbanWearEnabled
          );

          vec3 urbanGraphicColor = urbanAccentColor * mix(
            0.78,
            1.10,
            smoothstep(0.24, 0.82, urbanSharpLuma)
          );
          float urbanGraphicStrength = urbanGraphicMask
            * urbanGraphicsEnabled
            * urbanDecalStrength;
          diffuseColor.rgb = mix(
            urbanReconstructed,
            urbanGraphicColor,
            clamp(urbanGraphicStrength, 0.0, 1.0)
          );
          // Neutral metal inside a colored mixed atlas keeps its own value.
          // This prevents a red paint anchor from recoloring rims, spokes,
          // chainrings, handles, and other gray hardware.
          float urbanLocalNeutralValue = clamp(
            pow(max(urbanSharpLuma, 0.0), 0.88),
            0.008,
            0.82
          );
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            vec3(urbanLocalNeutralValue),
            urbanLocalNeutralMask
              * urbanSourceAuthority
              * (1.0 - urbanGraphicStrength)
          );
          // Final albedo authority for actual black texels. This must occur
          // after wear and graphics reconstruction because a mixed atlas can
          // place a red panel close enough for the macro samples to bleed into
          // a black bicycle frame. Light and reflection response remain later.
          diffuseColor.rgb = mix(
            diffuseColor.rgb,
            vec3(urbanLocalBlackValue),
            urbanLocalBlackMask
              * urbanSourceAuthority
              * (1.0 - urbanGraphicStrength)
          );
          diffuseColor.a *= urbanSourceSample.a;
        `
        : '',
    );

    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;',
      `
        vec3 outgoingLight = reflectedLight.directDiffuse
          + reflectedLight.indirectDiffuse
          + totalEmissiveRadiance;

        float urbanAlbedoEnergy = max(
          dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722)),
          0.06
        );
        float urbanDirectEnergy = dot(
          reflectedLight.directDiffuse,
          vec3(0.2126, 0.7152, 0.0722)
        ) / urbanAlbedoEnergy;
        float urbanShadowMask = 1.0 - smoothstep(
          0.12,
          0.55,
          urbanDirectEnergy
        );
        vec3 urbanCoolShadow = outgoingLight * vec3(0.68, 0.76, 1.12)
          + urbanCoolShadowColor * urbanAlbedoEnergy * 0.18;
        outgoingLight = mix(
          outgoingLight,
          urbanCoolShadow,
          urbanShadowMask
            * urbanCoolShadowsEnabled
            * urbanCoolShadowStrength
        );

        float urbanShadowColorLuma = dot(
          outgoingLight,
          vec3(0.2126, 0.7152, 0.0722)
        );
        vec3 urbanShadowPastel = mix(
          outgoingLight,
          vec3(urbanShadowColorLuma),
          0.48
        ) * 1.18;
        outgoingLight = mix(
          outgoingLight,
          urbanShadowPastel,
          urbanShadowMask
            * urbanShadowPastelEnabled
            * urbanShadowPastelStrength
        );
        ${source?.map
    ? `
        // Keep black/charcoal albedo from being lifted into a pastel body
        // color. Reflection layers are added later and remain fully colored.
        float urbanNeutralBaseLuma = dot(
          outgoingLight,
          vec3(0.2126, 0.7152, 0.0722)
        );
        vec3 urbanNeutralBase = mix(
          vec3(urbanNeutralBaseLuma),
          outgoingLight,
          0.16
        );
        float urbanNeutralBaseHigh = max(
          max(urbanNeutralBase.r, urbanNeutralBase.g),
          urbanNeutralBase.b
        );
        float urbanNeutralBaseCap = mix(
          0.15,
          0.065,
          urbanSourceBlackMask
        );
        urbanNeutralBase *= min(
          1.0,
          urbanNeutralBaseCap / max(urbanNeutralBaseHigh, 0.0001)
        );
        outgoingLight = mix(
          outgoingLight,
          urbanNeutralBase,
          max(urbanDarkNeutralMask, urbanSourceBlackMask)
            * urbanSourceAuthority
        );
        `
    : ''}

        vec3 urbanViewNormal = normalize(normal);
        vec3 urbanReflectionNormal = urbanViewNormal;
        #ifdef USE_NORMALMAP_TANGENTSPACE
          vec3 urbanReflectionMapNormal = texture2D(
            normalMap,
            vNormalMapUv
          ).xyz * 2.0 - 1.0;
          #if defined(USE_PACKED_NORMALMAP)
            urbanReflectionMapNormal = vec3(
              urbanReflectionMapNormal.xy,
              sqrt(
                saturate(
                  1.0 - dot(
                    urbanReflectionMapNormal.xy,
                    urbanReflectionMapNormal.xy
                  )
                )
              )
            );
          #endif
          urbanReflectionMapNormal.xy *=
            urbanReflectionNormalEnabled
            * urbanReflectionNormalStrength;
          urbanReflectionNormal = normalize(
            tbn * urbanReflectionMapNormal
          );
        #endif
        float urbanNeutralResponseMask =
          ${source?.map ? 'urbanLocalNeutralMask' : '0.0'};
        vec3 urbanGraphicLight = normalize(vec3(-0.25, 0.78, 0.57));
        float urbanHighlightBand = smoothstep(
          0.62,
          0.74,
          dot(urbanViewNormal, urbanGraphicLight)
        ) * (1.0 - urbanShadowMask);
        float urbanHighlightBandLuma = dot(
          urbanHighlightBandColor,
          vec3(0.2126, 0.7152, 0.0722)
        );
        vec3 urbanAppliedHighlightBandColor = mix(
          urbanHighlightBandColor,
          vec3(urbanHighlightBandLuma),
          urbanNeutralResponseMask
        );
        outgoingLight += urbanAppliedHighlightBandColor
          * urbanHighlightBand
          * urbanHighlightBandEnabled
          * urbanHighlightBandStrength
          * ${profile.highlightScale.toFixed(4)}
          * 0.32;

        float urbanFacing = saturate(
          dot(urbanViewNormal, normalize(vViewPosition))
        );
        float urbanRim = smoothstep(0.42, 0.88, 1.0 - urbanFacing);
        float urbanFresnelEdge = smoothstep(
          0.52,
          0.82,
          1.0 - urbanFacing
        ) * (
          1.0 - smoothstep(0.94, 1.0, 1.0 - urbanFacing)
        );
        float urbanFresnelColorLuma = dot(
          urbanFresnelColor,
          vec3(0.2126, 0.7152, 0.0722)
        );
        vec3 urbanAppliedFresnelColor = mix(
          urbanFresnelColor,
          vec3(urbanFresnelColorLuma),
          urbanNeutralResponseMask
        );
        outgoingLight += urbanAppliedFresnelColor
          * urbanFresnelEdge
          * urbanFresnelStrength
          * urbanFresnelEnabled
          * ${profile.fresnelScale.toFixed(4)}
          * 0.18;
        vec3 urbanRimColor = mix(
          urbanRimLeftColor,
          urbanRimRightColor,
          smoothstep(-0.42, 0.42, urbanViewNormal.x)
        );
        float urbanRimColorLuma = dot(
          urbanRimColor,
          vec3(0.2126, 0.7152, 0.0722)
        );
        urbanRimColor = mix(
          urbanRimColor,
          vec3(urbanRimColorLuma),
          urbanNeutralResponseMask
        );
        outgoingLight += urbanRimColor
          * urbanRim
          * urbanHighlightStrength
          * urbanRimEnabled
          * 0.20;

        float urbanBaseOutputHigh = max(
          max(outgoingLight.r, outgoingLight.g),
          outgoingLight.b
        );
        outgoingLight *= min(
          1.0,
          ${profile.lightValueCap.toFixed(4)}
            / max(urbanBaseOutputHigh, 0.0001)
        );

        float urbanMaterialMetalness = clamp(
          urbanSourceMetalness,
          0.0,
          1.0
        );
        float urbanMaterialRoughness = clamp(
          urbanSourceRoughness,
          0.04,
          1.0
        );
        float urbanMaterialMacroRoughness = urbanMaterialRoughness;
        #ifdef USE_MAP
          if (urbanMaterialResponseMapEnabled > 0.5) {
            vec4 urbanMaterialResponseSample = texture2D(
              urbanMaterialResponseMap,
              vMapUv
            );
            vec2 urbanRoughnessRadius =
              urbanMaterialResponseTexelSize * 18.0;
            float urbanMacroRoughnessSample =
              urbanMaterialResponseSample.g * 0.36;
            urbanMacroRoughnessSample += texture2D(
              urbanMaterialResponseMap,
              vMapUv + vec2(urbanRoughnessRadius.x, 0.0)
            ).g * 0.16;
            urbanMacroRoughnessSample += texture2D(
              urbanMaterialResponseMap,
              vMapUv - vec2(urbanRoughnessRadius.x, 0.0)
            ).g * 0.16;
            urbanMacroRoughnessSample += texture2D(
              urbanMaterialResponseMap,
              vMapUv + vec2(0.0, urbanRoughnessRadius.y)
            ).g * 0.16;
            urbanMacroRoughnessSample += texture2D(
              urbanMaterialResponseMap,
              vMapUv - vec2(0.0, urbanRoughnessRadius.y)
            ).g * 0.16;
            urbanMaterialRoughness = clamp(
              urbanMaterialRoughness * urbanMaterialResponseSample.g,
              0.04,
              1.0
            );
            urbanMaterialMacroRoughness = clamp(
              urbanSourceRoughness * urbanMacroRoughnessSample,
              0.04,
              1.0
            );
            urbanMaterialMetalness = clamp(
              urbanMaterialMetalness * urbanMaterialResponseSample.b,
              0.0,
              1.0
            );
          }
        #endif
        float urbanLocalSmoothness = 1.0 - smoothstep(
          0.36,
          0.74,
          urbanMaterialRoughness
        );
        float urbanMacroSmoothness = 1.0 - smoothstep(
          0.36,
          0.74,
          urbanMaterialMacroRoughness
        );
        float urbanLocalRoughnessBand = floor(
          clamp(urbanLocalSmoothness, 0.0, 0.999) * 3.0
        ) * 0.5;
        float urbanMacroRoughnessBand = floor(
          clamp(urbanMacroSmoothness, 0.0, 0.999) * 3.0
        ) * 0.5;
        float urbanStylizedSmoothness = clamp(
          urbanLocalRoughnessBand * 0.72
            + urbanMacroRoughnessBand * 0.28,
          0.0,
          1.0
        );
        #ifdef USE_MAP
          vec2 urbanSourceBreakupRadius = urbanMapTexelSize * 12.0;
          vec3 urbanSourceBreakupSharp = texture2D(
            map,
            vMapUv
          ).rgb;
          vec3 urbanSourceBreakupMacro = urbanSourceBreakupSharp * 0.36;
          urbanSourceBreakupMacro += texture2D(
            map,
            vMapUv + vec2(urbanSourceBreakupRadius.x, 0.0)
          ).rgb * 0.16;
          urbanSourceBreakupMacro += texture2D(
            map,
            vMapUv - vec2(urbanSourceBreakupRadius.x, 0.0)
          ).rgb * 0.16;
          urbanSourceBreakupMacro += texture2D(
            map,
            vMapUv + vec2(0.0, urbanSourceBreakupRadius.y)
          ).rgb * 0.16;
          urbanSourceBreakupMacro += texture2D(
            map,
            vMapUv - vec2(0.0, urbanSourceBreakupRadius.y)
          ).rgb * 0.16;
          float urbanSourceBreakupSharpLuma = dot(
            urbanSourceBreakupSharp,
            vec3(0.2126, 0.7152, 0.0722)
          );
          float urbanSourceBreakupMacroLuma = dot(
            urbanSourceBreakupMacro,
            vec3(0.2126, 0.7152, 0.0722)
          );
          float urbanSourceBreakupDelta =
            urbanSourceBreakupSharpLuma
            - urbanSourceBreakupMacroLuma;
          float urbanSourceBreakupMask = smoothstep(
            0.018,
            0.15,
            abs(urbanSourceBreakupDelta)
          );
          float urbanSourceWearSmoothness = smoothstep(
            -0.08,
            0.12,
            urbanSourceBreakupDelta
          );
          urbanStylizedSmoothness = mix(
            urbanStylizedSmoothness,
            urbanSourceWearSmoothness,
            urbanSourceBreakupMask * 0.72
          );
        #endif
        float urbanReflectionSoftClass = smoothstep(
          0.18,
          0.48,
          urbanStylizedSmoothness
        );
        float urbanReflectionGlossClass = smoothstep(
          0.58,
          0.82,
          urbanStylizedSmoothness
        );
        float urbanReflectionClass = clamp(
          urbanReflectionSoftClass * 0.34
            + urbanReflectionGlossClass * 0.66,
          0.0,
          1.0
        );
        float urbanReflectionSelectivityAmount =
          urbanReflectionSelectivityEnabled
          * urbanReflectionSelectivityStrength;
        float urbanReflectionCoverage = mix(
          1.0,
          mix(0.06, 1.0, urbanReflectionClass),
          urbanReflectionSelectivityAmount
        );
        float urbanRoughnessBreakupAmount =
          urbanRoughnessBreakupEnabled
          * urbanRoughnessBreakupStrength
          * urbanMaterialResponseMapEnabled
          * ${profile.roughnessBreakupScale.toFixed(4)};
        float urbanRoughnessSheen = mix(
          1.0,
          mix(0.42, 1.48, urbanStylizedSmoothness),
          urbanRoughnessBreakupAmount
        );

        vec3 urbanResponseView = normalize(vViewPosition);
        vec3 urbanReflectedView = reflect(
          -urbanResponseView,
          urbanReflectionNormal
        );
        vec3 urbanColoredLightResponse = vec3(0.0);
        vec3 urbanPlanarLightResponse = vec3(0.0);
        vec3 urbanViewLightResponse = vec3(0.0);
        #if NUM_DIR_LIGHTS > 0
          for (int urbanLightIndex = 0;
            urbanLightIndex < NUM_DIR_LIGHTS;
            urbanLightIndex++
          ) {
            vec3 urbanResponseLight = normalize(
              directionalLights[urbanLightIndex].direction
            );
            vec3 urbanResponseHalf = normalize(
              urbanResponseLight + urbanResponseView
            );
            float urbanResponseNdotH = max(
              dot(urbanReflectionNormal, urbanResponseHalf),
              0.0
            );
            float urbanResponseNdotL = max(
              dot(urbanViewNormal, urbanResponseLight),
              0.0
            );
            float urbanBroadSpecular = pow(
              urbanResponseNdotH,
              mix(3.0, 18.0, 1.0 - urbanMaterialRoughness)
            );
            float urbanTightSpecular = pow(
              urbanResponseNdotH,
              mix(18.0, 88.0, 1.0 - urbanMaterialRoughness)
            );
            float urbanLightLobe = (
              urbanBroadSpecular * 0.18
              + urbanTightSpecular * 0.34
            ) * smoothstep(0.0, 0.34, urbanResponseNdotL);
            urbanColoredLightResponse +=
              directionalLights[urbanLightIndex].color
              * urbanLightLobe;
            vec3 urbanReflectedLight = reflect(
              -urbanResponseLight,
              urbanReflectionNormal
            );
            float urbanPlanarLightLobe = pow(
              max(dot(urbanReflectedLight, urbanResponseView), 0.0),
              mix(2.0, 7.0, 1.0 - urbanMaterialRoughness)
            );
            urbanPlanarLightResponse +=
              directionalLights[urbanLightIndex].color
              * urbanPlanarLightLobe;
            float urbanViewReflectionLobe =
              urbanBroadSpecular * 0.58
              + urbanTightSpecular * 0.42;
            float urbanViewReflectionSoftBand = smoothstep(
              0.025,
              0.22,
              urbanViewReflectionLobe
            );
            float urbanViewReflectionCoreBand = smoothstep(
              0.28,
              0.68,
              urbanViewReflectionLobe
            );
            float urbanViewReflectionBand =
              urbanViewReflectionSoftBand * 0.34
              + urbanViewReflectionCoreBand * 0.66;
            urbanViewLightResponse +=
              directionalLights[urbanLightIndex].color
              * urbanViewReflectionBand
              * smoothstep(0.0, 0.3, urbanResponseNdotL);
          }
        #endif
        float urbanSkyReflection = smoothstep(
          -0.22,
          0.68,
          urbanReflectedView.y
        );
        float urbanHorizonReflection = 1.0 - smoothstep(
          0.08,
          0.52,
          abs(urbanReflectedView.y - 0.06)
        );
        float urbanEnvironmentReflection =
          urbanSkyReflection * mix(0.18, 0.34, 1.0 - urbanMaterialRoughness)
          + urbanHorizonReflection * 0.13;
        float urbanDiffuseHigh = max(
          max(diffuseColor.r, diffuseColor.g),
          diffuseColor.b
        );
        vec3 urbanDiffuseHue = diffuseColor.rgb
          / max(urbanDiffuseHigh, 0.04);
        vec3 urbanResponseTint = mix(
          urbanMaterialResponseColor,
          mix(
            urbanMaterialResponseColor,
            urbanDiffuseHue,
            0.46
          ),
          urbanMaterialMetalness
        );
        float urbanResponseTintLuma = dot(
          urbanResponseTint,
          vec3(0.2126, 0.7152, 0.0722)
        );
        urbanResponseTint = mix(
          urbanResponseTint,
          vec3(urbanResponseTintLuma),
          urbanNeutralResponseMask
        );
        float urbanResponseAmount = urbanMaterialResponseEnabled
          * urbanMaterialResponseStrength
          * ${profile.materialResponseScale.toFixed(4)}
          * mix(0.24, 1.0, urbanMaterialMetalness);
        vec3 urbanMetalLightTint = mix(
          vec3(1.0),
          urbanDiffuseHue,
          urbanMaterialMetalness * 0.42
        );
        outgoingLight += (
          urbanResponseTint
            * urbanEnvironmentReflection
            * mix(0.20, 0.44, urbanMaterialMetalness)
          + urbanColoredLightResponse
            * urbanMetalLightTint
            * mix(0.18, 0.34, urbanMaterialMetalness)
        ) * urbanResponseAmount
          * urbanRoughnessSheen
          * mix(0.34, 1.0, urbanReflectionCoverage);

        float urbanPlanarFacing = smoothstep(
          0.34,
          0.78,
          urbanViewNormal.y
        );
        float urbanPlanarRoughnessGain = mix(
          0.72,
          1.18,
          1.0 - urbanMaterialRoughness
        );
        vec3 urbanPlanarSheenColor =
          urbanMaterialResponseColor
            * (
              urbanSkyReflection * 0.04
              + urbanHorizonReflection * 0.03
            )
          + urbanPlanarLightResponse * 0.85;
        float urbanPlanarSheenLuma = dot(
          urbanPlanarSheenColor,
          vec3(0.2126, 0.7152, 0.0722)
        );
        urbanPlanarSheenColor = mix(
          urbanPlanarSheenColor,
          vec3(urbanPlanarSheenLuma),
          urbanNeutralResponseMask
        );
        outgoingLight += urbanPlanarSheenColor
          * urbanPlanarFacing
          * urbanPlanarRoughnessGain
          * urbanPlanarSheenEnabled
          * urbanPlanarSheenStrength
          * urbanReflectionCoverage
          * urbanRoughnessSheen
          * ${profile.planarSheenScale.toFixed(4)};
        float urbanRoughnessSurfaceResponse = mix(
          0.72,
          1.18,
          urbanStylizedSmoothness
        );
        outgoingLight *= mix(
          1.0,
          urbanRoughnessSurfaceResponse,
          urbanRoughnessBreakupAmount
            * mix(0.24, 1.0, urbanPlanarFacing)
        );

        float urbanOutputHigh = max(
          max(outgoingLight.r, outgoingLight.g),
          outgoingLight.b
        );
        outgoingLight *= min(
          1.0,
          ${profile.responseValueCap.toFixed(4)}
            / max(urbanOutputHigh, 0.0001)
        );
        float urbanViewReflectionAmount =
          urbanViewReflectionEnabled
          * urbanViewReflectionStrength
          * ${profile.viewReflectionScale.toFixed(4)}
          * mix(0.42, 1.0, urbanMaterialMetalness)
          * mix(0.34, 1.0, urbanPlanarFacing);
        vec3 urbanViewReflectionTint = mix(
          urbanViewLightResponse,
          urbanViewLightResponse * urbanDiffuseHue,
          urbanMaterialMetalness * 0.32
        );
        outgoingLight += urbanViewReflectionTint
          * urbanViewReflectionAmount
          * urbanReflectionCoverage
          * mix(0.38, 1.16, urbanStylizedSmoothness)
          * mix(0.72, 1.0, urbanRoughnessSheen);
        ${isMirror ? `
        vec3 urbanProbeDirection = inverseTransformDirection(
          urbanReflectedView,
          viewMatrix
        );
        urbanProbeDirection.x *= -1.0;
        vec3 urbanProbeColor = textureCube(
          urbanReflectionProbeMap,
          urbanProbeDirection
        ).rgb;
        float urbanProbeHigh = max(
          max(urbanProbeColor.r, urbanProbeColor.g),
          urbanProbeColor.b
        );
        vec3 urbanProbeHue = urbanProbeColor
          / max(urbanProbeHigh, 0.025);
        float urbanProbeBand = floor(
          clamp(urbanProbeHigh, 0.0, 0.999) * 5.0
        ) * 0.25;
        vec3 urbanStylizedProbe = urbanProbeHue * mix(
          urbanProbeHigh,
          urbanProbeBand,
          0.28
        );
        float urbanProbeFresnel = pow(
          clamp(1.0 - urbanFacing, 0.0, 1.0),
          3.0
        );
        float urbanProbeAmount =
          urbanReflectionProbeAvailable
          * urbanReflectionProbeLayerEnabled
          * urbanReflectionProbeStrength
          * mix(0.74, 0.94, urbanProbeFresnel);
        outgoingLight = mix(
          outgoingLight,
          urbanStylizedProbe,
          clamp(urbanProbeAmount, 0.0, 0.96)
        );
        ` : ''}
      `,
    );
  };

  material.customProgramCacheKey = () => [
    'locked-urban-v72-local-neutral-authority',
    isMirror,
    Boolean(source?.map),
    Boolean(sourceResponseMap),
    profile.colorControl,
    profile.colorLiftScale,
    profile.decalScale,
    profile.fresnelScale,
    profile.fallbackMetalness,
    profile.decalThreshold,
    profile.graphicSafeMacro ?? 0,
    profile.highlightScale,
    profile.lightValueCap,
    profile.materialResponseScale,
    profile.normalScale,
    profile.paintExtractionScale ?? 1,
    profile.paintValue,
    profile.planarSheenScale,
    profile.responseValueCap,
    profile.roleColorMix,
    profile.roughnessBreakupScale,
    profile.sharpRustBoost,
    profile.sourceAnchorAuthorityScale,
    profile.sourceHueAuthorityScale,
    profile.sourceValueAuthorityScale,
    profile.viewReflectionScale,
    profile.wearScale,
  ].join(':');
}

function classificationForAdapter(source, classification, legacySurface) {
  if (classification && typeof classification === 'object') {
    return createUrbanMaterialClassification(classification);
  }
  const legacy = LEGACY_SURFACE_CLASSIFICATIONS[legacySurface]
    ?? LEGACY_SURFACE_CLASSIFICATIONS.paintedMetal;
  return createUrbanMaterialClassification({
    ...legacy,
    renderMode: sourceRenderMode(source),
    contentFlags: [
      ...(legacy.contentFlags ?? []),
      ...(sourceHasEmission(source) ? ['emissive'] : []),
    ],
    classificationSource: legacySurface ? 'legacyAdapter' : 'defaultAdapter',
    confidence: legacySurface ? 1 : 0.5,
  });
}

function legacySurfaceForProfile(profileId) {
  if (URBAN_PROP_SURFACE_ROLES.includes(profileId)) return profileId;
  if (profileId === 'coatedPanel' || profileId === 'polymer') return 'lid';
  if (profileId === 'glass' || profileId === 'composite' || profileId === 'fluid') {
    return 'technicalSurface';
  }
  if (profileId === 'rubber') return 'rubber';
  return 'paintedMetal';
}

export function createUrbanAnimePropMaterial(sourceMaterial, {
  classification = null,
  controls,
  surface = null,
} = {}) {
  const source = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
  const materialClassification = classificationForAdapter(source, classification, surface);
  const profileId = surface && SURFACE_PROFILES[surface]
    ? surface
    : resolveUrbanMaterialProfile(materialClassification);
  const profile = SURFACE_PROFILES[profileId] ?? SURFACE_PROFILES.genericDielectric;
  const shared = controls ?? createUrbanPropShaderControls();

  const material = new THREE.MeshToonMaterial({
    color: shared[profile.colorControl].value,
    emissive: 0x020508,
    gradientMap: createLockedGradientMap(),
  });
  // WebGL counterpart of the WebGPU diffusing-sheet term. Without a node graph
  // the view easing is not available, so this is the flat form: the sheet's own
  // colour tinted by translucencyColor, added as emission.
  const translucencyScale = Number(profile.translucencyScale ?? 0);
  const applyTranslucency = () => {
    if (!(translucencyScale > 0)) return;
    const amount = THREE.MathUtils.clamp(
      Number(shared.translucencyEnabled?.value ?? 0)
        * Number(shared.translucencyStrength?.value ?? 0)
        * translucencyScale,
      0,
      2,
    );
    material.emissive
      .copy(shared.translucencyColor?.value ?? new THREE.Color(0xffd7a0))
      .multiply(material.color)
      .multiplyScalar(amount);
  };
  material.name = `Locked urban · ${profileId} · ${source?.name ?? 'material'}`;
  material.map = source?.map ?? null;
  material.normalMap = source?.normalMap ?? null;
  material.side = source?.side ?? THREE.FrontSide;
  material.transparent = source?.transparent ?? false;
  material.opacity = source?.opacity ?? 1;
  material.alphaTest = source?.alphaTest ?? 0;
  material.fog = true;

  const sourceScale = source?.normalScale?.clone?.() ?? new THREE.Vector2(1, 1);
  const sourceColor = source?.color?.clone?.() ?? new THREE.Color(0xffffff);
  const syncLookControls = () => {
    material.color
      .copy(sourceColor)
      .lerp(
        shared[profile.colorControl].value,
        THREE.MathUtils.clamp(shared.paletteOverride.value, 0, 1),
      );
    const extractedNormalScale = 1 - THREE.MathUtils.clamp(
      shared.paintExtractionEnabled.value
        * shared.paintExtractionStrength.value
        * 0.62,
      0,
      0.62,
    );
    const normalEnabled = shared.normalDetailEnabled.value > 0.5 ? 1 : 0;
    material.normalScale.set(
      sourceScale.x * profile.normalScale * shared.normalStrength.value
        * extractedNormalScale * normalEnabled,
      sourceScale.y * profile.normalScale * shared.normalStrength.value
        * extractedNormalScale * normalEnabled,
    );
    material.gradientMap = shared.celLightingEnabled.value > 0.5
      ? createLockedGradientMap()
      : createSmoothGradientMap();
    applyTranslucency();
  };
  syncLookControls();
  material.onBeforeRender = syncLookControls;

  installLockedLookShader(material, source, profile, shared, {
    isMirror: materialClassification.finish === 'mirror',
  });
  material.userData.environmentShaderExclude = true;
  material.userData.urbanMaterial = {
    ...materialClassification,
    contentFlags: [...materialClassification.contentFlags],
  };
  material.userData.urbanSurfaceProfile = profileId;
  material.userData.urbanSurface = legacySurfaceForProfile(profileId);
  material.userData.urbanPropSurface = material.userData.urbanSurface;
  material.userData.urbanLookVersion = 5;
  return material;
}

/**
 * WebGPU/TSL presentation adapter for the locked urban look.
 *
 * The standalone benchmark uses `onBeforeCompile`, which WebGPURenderer does
 * not execute. This adapter consumes the same controls and role profiles while
 * retaining source texture/node authority, toon bands, normal detail, source
 * emission, roughness-selective sheen, and the canonical urbanSurface role.
 */
export function createUrbanAnimePropNodeMaterial(sourceMaterial, {
  classification = null,
  controls,
  surface = null,
} = {}) {
  const source = Array.isArray(sourceMaterial) ? sourceMaterial[0] : sourceMaterial;
  const materialClassification = classificationForAdapter(source, classification, surface);
  const profileId = surface && SURFACE_PROFILES[surface]
    ? surface
    : resolveUrbanMaterialProfile(materialClassification);
  const profile = SURFACE_PROFILES[profileId] ?? SURFACE_PROFILES.genericDielectric;
  const shared = controls ?? createUrbanPropShaderControls();
  const scalarBindings = [];
  const scalarControl = (control) => {
    const node = uniform(Number(control?.value ?? 0));
    scalarBindings.push([node, control]);
    return node;
  };
  const colorControlNode = (control, fallback = 0xffffff) => (
    uniform(control?.value ?? new THREE.Color(fallback))
  );

  const sourceColor = source?.color?.clone?.() ?? new THREE.Color(0xffffff);
  let sourceColorNode = source?.colorNode ?? vec3(
    sourceColor.r,
    sourceColor.g,
    sourceColor.b,
  );
  if (!source?.colorNode && source?.map) {
    sourceColorNode = texture(source.map).rgb.mul(sourceColorNode);
  }

  const roleColor = colorControlNode(shared[profile.colorControl]);
  const paletteAmount = scalarControl(shared.paletteOverride)
    .mul(profile.roleColorMix);
  let urbanColor = mix(sourceColorNode, roleColor, paletteAmount);
  const pastelAmount = scalarControl(shared.pastelPaletteEnabled)
    .mul(scalarControl(shared.pastelStrength))
    .mul(profile.pastelScale);
  const pastelTarget = urbanColor
    .mul(0.9)
    .add(colorControlNode(shared.pastelBlueColor, 0x8faabd).mul(0.1));
  urbanColor = mix(urbanColor, pastelTarget, pastelAmount);
  urbanColor = urbanColor.add(
    scalarControl(shared.colorLiftEnabled)
      .mul(scalarControl(shared.colorLiftStrength))
      .mul(profile.colorLiftScale * 0.035),
  );

  let sourceRoughnessNode = float(
    Number.isFinite(source?.roughness) ? source.roughness : 0.72,
  );
  if (source?.roughnessNode) {
    sourceRoughnessNode = source.roughnessNode;
  } else if (source?.roughnessMap) {
    sourceRoughnessNode = texture(source.roughnessMap).g.mul(
      Number.isFinite(source.roughness) ? source.roughness : 1,
    );
  }
  const roughnessNode = clamp(sourceRoughnessNode, 0, 1);

  let sourceMetalnessNode = float(
    Number.isFinite(source?.metalness)
      ? source.metalness
      : profile.fallbackMetalness,
  );
  if (source?.metalnessNode) {
    sourceMetalnessNode = source.metalnessNode;
  } else if (source?.metalnessMap) {
    sourceMetalnessNode = texture(source.metalnessMap).b.mul(
      Number.isFinite(source.metalness) ? source.metalness : 1,
    );
  }
  const metalnessNode = clamp(sourceMetalnessNode, 0, 1);

  let sourceNormalNode = source?.normalNode ?? null;
  if (!sourceNormalNode && source?.normalMap) {
    const sourceNormalScale = source.normalScale ?? new THREE.Vector2(1, 1);
    const detailAmount = scalarControl(shared.normalDetailEnabled)
      .mul(scalarControl(shared.normalStrength))
      .mul(profile.normalScale);
    sourceNormalNode = normalMapNode(
      texture(source.normalMap).rgb,
      vec2(sourceNormalScale.x, sourceNormalScale.y).mul(detailAmount),
    );
  }

  let sourceEmissionNode = source?.emissiveNode ?? vec3(0);
  if (!source?.emissiveNode) {
    const sourceEmissive = source?.emissive?.clone?.() ?? new THREE.Color(0x000000);
    sourceEmissionNode = vec3(
      sourceEmissive.r,
      sourceEmissive.g,
      sourceEmissive.b,
    ).mul(Number(source?.emissiveIntensity ?? 1));
    if (source?.emissiveMap) {
      sourceEmissionNode = texture(source.emissiveMap).rgb.mul(sourceEmissionNode);
    }
  }

  const viewDirection = normalize(cameraPosition.sub(positionWorld));
  const facing = clamp(abs(dot(normalWorld, viewDirection)), 0, 1);
  const fresnel = pow(facing.oneMinus(), 3);
  const planarFacing = smoothstep(0.38, 0.94, normalWorld.y);
  const smoothResponse = mix(0.38, 1.18, roughnessNode.oneMinus());
  const metalResponse = mix(0.42, 1, metalnessNode);
  const materialResponseAmount = scalarControl(shared.materialResponseEnabled)
    .mul(scalarControl(shared.materialResponseStrength))
    .mul(profile.materialResponseScale);
  const fresnelResponse = fresnel
    .mul(scalarControl(shared.fresnelEnabled))
    .mul(scalarControl(shared.fresnelStrength))
    .mul(profile.fresnelScale * 0.34);
  const planarResponse = planarFacing
    .mul(scalarControl(shared.planarSheenEnabled))
    .mul(scalarControl(shared.planarSheenStrength))
    .mul(profile.planarSheenScale * 0.18);
  const highlightBand = smoothstep(0.28, 0.54, fresnel)
    .sub(smoothstep(0.62, 0.82, fresnel))
    .mul(scalarControl(shared.highlightBandEnabled))
    .mul(scalarControl(shared.highlightBandStrength))
    .mul(profile.highlightScale * 0.12);
  const stylizedResponse = colorControlNode(
    shared.materialResponseColor,
    0xaacbe0,
  ).mul(
    fresnelResponse
      .add(planarResponse)
      .add(highlightBand)
      .mul(smoothResponse)
      .mul(metalResponse)
      .mul(materialResponseAmount),
  );

  const sceneShadow = sampleEnvironmentSunShadow(positionWorld)
    .mul(sampleEnvironmentCloudShadow(positionWorld, 1))
    .toVar();
  const castShadowAmount = sceneShadow.oneMinus()
    .mul(scalarControl(shared.coolShadowsEnabled))
    .mul(scalarControl(shared.coolShadowStrength));
  const castShadowTint = mix(
    vec3(1),
    colorControlNode(shared.coolShadowColor, 0x173875),
    castShadowAmount.mul(0.72),
  );

  // Diffusing-sheet response. A backlit paper screen is not a window: the read
  // is the sheet GLOWING, not the room behind it, so this is a view-independent
  // lift rather than a transmission sample. It is modulated by the sheet's own
  // albedo so a fibre inclusion or a stain darkens when backlit — the thing
  // that makes washi read as washi — and eased off toward grazing angles,
  // where a real sheet presents more thickness and goes opaque. It is NOT
  // multiplied by `sceneShadow`, because the light behind a shoji is the
  // interior, not the sun, and a screen that stopped glowing when a cloud
  // crossed would be exactly wrong.
  const translucencyScale = Number(profile.translucencyScale ?? 0);
  const translucency = translucencyScale > 0
    ? colorControlNode(shared.translucencyColor, 0xffd7a0)
      .mul(urbanColor)
      .mul(
        scalarControl(shared.translucencyEnabled)
          .mul(scalarControl(shared.translucencyStrength))
          .mul(translucencyScale)
          .mul(mix(0.35, 1, facing)),
      )
    : null;

  const material = new MeshToonNodeMaterial();
  material.name = `Locked urban WebGPU · ${profileId} · ${
    source?.name ?? 'material'
  }`;
  material.colorNode = clamp(urbanColor, 0, profile.lightValueCap)
    .mul(castShadowTint);
  // Authored emission remains visible in shade; view-dependent manufactured
  // highlights are direct-light cues and must disappear with the sun.
  material.emissiveNode = sourceEmissionNode.add(stylizedResponse.mul(sceneShadow));
  if (translucency) material.emissiveNode = material.emissiveNode.add(translucency);
  material.normalNode = sourceNormalNode;
  material.gradientMap = createLockedGradientMap();
  material.side = source?.side ?? THREE.FrontSide;
  material.transparent = source?.transparent ?? false;
  material.opacity = source?.opacity ?? 1;
  material.alphaTest = source?.alphaTest ?? 0;
  if (source?.opacityNode) {
    material.opacityNode = source.opacityNode;
  } else if (source?.map && material.transparent) {
    material.opacityNode = texture(source.map).a.mul(material.opacity);
  }
  material.fog = true;
  material.onBeforeRender = () => {
    for (const [node, control] of scalarBindings) {
      node.value = Number(control?.value ?? 0);
    }
    material.gradientMap = shared.celLightingEnabled.value > 0.5
      ? createLockedGradientMap()
      : createSmoothGradientMap();
  };
  material.userData.environmentShaderExclude = true;
  material.userData.urbanMaterial = {
    ...materialClassification,
    contentFlags: [...materialClassification.contentFlags],
  };
  material.userData.urbanSurfaceProfile = profileId;
  material.userData.urbanSurface = legacySurfaceForProfile(profileId);
  material.userData.urbanPropSurface = material.userData.urbanSurface;
  material.userData.urbanLookVersion = 5;
  material.userData.urbanRendererAdapter = 'WebGPU/TSL';
  material.userData.urbanSourceMaterial = source?.name ?? null;
  material.userData.toonlabSourceTextureCount = [
    source?.map,
    source?.normalMap,
    source?.roughnessMap,
    source?.metalnessMap,
    source?.aoMap,
    source?.emissiveMap,
    source?.alphaMap,
  ].filter((value) => value?.isTexture).length;
  material.userData.toonlabSourceTextureIds = [
    source?.map,
    source?.normalMap,
    source?.roughnessMap,
    source?.metalnessMap,
    source?.aoMap,
    source?.emissiveMap,
    source?.alphaMap,
  ].filter((value) => value?.isTexture).map((value) => value.uuid);
  material.userData.toonlabSourceTexturesPreserved = true;
  material.needsUpdate = true;
  return material;
}
