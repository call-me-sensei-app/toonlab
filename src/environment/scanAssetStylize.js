import * as THREE from 'three';

import { copyTextureTransform } from './environmentTextureResolver.js';

// Photoscan assets (photoscan/Fab exports) read as "posterized photos" under
// the toon environment shader: their albedo carries photographic micro-detail
// (grain, dirt, cracks, baked-in AO) that stylized stages never have, and
// their detail maps (normal/AO) respond too literally to light. This module
// is the opt-in stylization pass that pushes such assets toward an authored,
// hand-painted read without touching the geometry:
//
//   1. Albedo simplify — redraw the base map at a capped size through a blur
//      + saturation lift so photo grain collapses into painterly gradients.
//   2. Detail compression — reduce normal-map strength, soften AO and warm
//      its tint (roughness/metalness are already ignored by the toon path).
//   3. Painterly color response — raise saturation, cool the shade tint, and
//      add a subtle broad specular sheen so edges catch the sun.
//
// Applied per-material inside applyEnvironmentShader when scanStylize is
// 'auto' (detected scan assets only) or true; never applied when false or
// when material.userData.envScanStylize === false.

// Fab/photoscan catalogs exports name meshes `<assetId>_LOD0_TIER2_...` and materials
// `<Asset_Name>_<assetId>_<Quality>`; the LOD/TIER token is the reliable
// tell. Explicit 'photoscan'/'quixel' naming also qualifies.
const SCAN_NAME_PATTERN = /(_lod\d+_tier\d+)|photoscan|quixel/i;

export function isScanAssetMaterial(obj, mat) {
  if (mat?.userData?.envScanStylize === false) return false;
  if (mat?.userData?.envScanStylize === true) return true;
  return SCAN_NAME_PATTERN.test(`${obj?.name ?? ''} ${mat?.name ?? ''}`);
}

export const DEFAULT_SCAN_STYLIZE_PARAMS = {
  // Albedo simplification. Blur is in pixels at the capped size, so it scales
  // with however large the source texture was.
  albedoMaxSize: 512,
  albedoBlur: 1.6,
  albedoSaturate: 1.18,
  albedoBrightness: 1.04,
  // Detail-map response compression.
  normalMapStrength: 0.35,
  aoMapStrength: 0.65,
  aoWarmth: 0.7,
  // Painterly color response: saturated color, cool shade, sun-catch sheen.
  saturation: 1.2,
  shadowTintColor: [0.7, 0.76, 0.94],
  specularStrength: 0.1,
  specularShininess: 24,
  specularSoftness: 0.5,
};

const stylizedTextureCache = new WeakMap();

// Returns a simplified copy of a scan albedo texture (cached per source).
// The source draws twice: once sharp so canvas-edge blur transparency never
// shows at UV seams, once through the blur/saturate filter on top.
export function stylizeScanBaseMap(texture, params = DEFAULT_SCAN_STYLIZE_PARAMS) {
  const image = texture?.image;
  if (!image || !(image.width > 0) || !(image.height > 0)) return texture;
  if (stylizedTextureCache.has(texture)) return stylizedTextureCache.get(texture);

  const scale = Math.min(1, params.albedoMaxSize / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  ctx.filter = `blur(${params.albedoBlur}px) saturate(${params.albedoSaturate}) brightness(${params.albedoBrightness})`;
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

  const stylized = new THREE.CanvasTexture(canvas);
  copyTextureTransform(stylized, texture);
  stylized.colorSpace = texture.colorSpace ?? THREE.SRGBColorSpace;
  stylized.needsUpdate = true;
  stylizedTextureCache.set(texture, stylized);
  return stylized;
}

// Compresses the detail-map and color response of a converted environment
// ShaderMaterial. No-op for the basic/standard debug material modes.
export function applyScanStylizeToMaterial(material, params = DEFAULT_SCAN_STYLIZE_PARAMS) {
  const uniforms = material?.uniforms;
  if (!uniforms) return material;
  if (uniforms.normalMapStrength) uniforms.normalMapStrength.value = params.normalMapStrength;
  if (uniforms.aoMapStrength) {
    uniforms.aoMapStrength.value = Math.min(uniforms.aoMapStrength.value, params.aoMapStrength);
  }
  if (uniforms.aoWarmth) uniforms.aoWarmth.value = params.aoWarmth;
  if (uniforms.saturation) uniforms.saturation.value = params.saturation;
  if (uniforms.shadowTintColor && params.shadowTintColor) {
    uniforms.shadowTintColor.value.setRGB(...params.shadowTintColor);
  }
  if (uniforms.specularStrength && params.specularStrength > uniforms.specularStrength.value) {
    uniforms.specularStrength.value = params.specularStrength;
    uniforms.specularShininess.value = params.specularShininess;
    uniforms.specularSoftness.value = params.specularSoftness;
  }
  material.userData.scanStylized = true;
  return material;
}
