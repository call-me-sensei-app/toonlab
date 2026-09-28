import * as THREE from 'three';

import { resolveBaseMaterialColor } from './settings/baseTextureSettings.js';
import { readTexturePixels, sampleSurfaceUvs, sampleTexturePixel } from './texturePixels.js';

// Whether a colour, or a material's visible surface, reads as skin. A name
// cannot tell a robot's `arm_mat` or a visor's `robo_face` from a human arm or
// face; colour can. Skin — pale anime skin through dark skin — is a warm
// red–orange–yellow hue. Only bright skin may be nearly neutral: as skin gets
// darker it is always clearly saturated, so a mid-grey or beige plastic with
// a faint warm cast is not skin, while pale (255, 240, 230) and dark brown
// (110, 70, 50) both are.

const WARM_HUE_MAX = 55;
const WARM_HUE_WRAP = 340;
// Maximum saturation: stylised mid-tone skin runs very saturated (the 100
// Avatars orange-brown (180, 95, 38) is 0.79–0.81), while vivid orange cloth
// is also bright. Mid tones may reach MID_MAX_SATURATION; from MID_VALUE to
// BRIGHT_VALUE_FOR_MAX it tightens to BRIGHT_MAX_SATURATION.
const MID_MAX_SATURATION = 0.88;
const BRIGHT_MAX_SATURATION = 0.8;
const MID_VALUE = 0.75;
const BRIGHT_VALUE_FOR_MAX = 0.88;
const MIN_VALUE = 0.12;
// Minimum saturation falls from DARK_MIN_SATURATION at or below DARK_VALUE to
// BRIGHT_MIN_SATURATION at or above BRIGHT_VALUE.
const DARK_VALUE = 0.45;
const BRIGHT_VALUE = 0.9;
const DARK_MIN_SATURATION = 0.3;
const BRIGHT_MIN_SATURATION = 0.04;

function maximumSkinSaturation(value) {
  const t = THREE.MathUtils.clamp((value - MID_VALUE) / (BRIGHT_VALUE_FOR_MAX - MID_VALUE), 0, 1);
  return THREE.MathUtils.lerp(MID_MAX_SATURATION, BRIGHT_MAX_SATURATION, t * t * (3 - 2 * t));
}

function minimumSkinSaturation(value) {
  const t = THREE.MathUtils.clamp((value - DARK_VALUE) / (BRIGHT_VALUE - DARK_VALUE), 0, 1);
  return THREE.MathUtils.lerp(DARK_MIN_SATURATION, BRIGHT_MIN_SATURATION, t * t * (3 - 2 * t));
}

/** sRGB components in 0–1. */
export function isSkinLikeColor(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max < MIN_VALUE) return false;
  const chroma = max - min;
  const saturation = chroma / max;
  if (saturation < minimumSkinSaturation(max) || saturation > maximumSkinSaturation(max)) return false;
  let hue;
  if (max === r) hue = 60 * (((g - b) / chroma) % 6);
  else if (max === g) hue = 60 * ((b - r) / chroma + 2);
  else hue = 60 * ((r - g) / chroma + 4);
  if (hue < 0) hue += 360;
  return hue <= WARM_HUE_MAX || hue >= WARM_HUE_WRAP;
}

const scratch = new THREE.Color();
const texel = [0, 0, 0, 255];

function vertexColorAt(geometry, triangle, target) {
  const color = geometry.attributes.color;
  const index = geometry.index;
  const vertex = index ? index.getX(triangle * 3) : triangle * 3;
  return target.setRGB(color.getX(vertex), color.getY(vertex), color.getZ(vertex));
}

/**
 * Fraction of the material's visible surface (resolved base colour × texture ×
 * vertex colour) that reads as skin. An unreadable texture counts as absent,
 * as it does when the material is converted.
 */
export function measureSkinEvidence(mat, geometry, { materialIndex = null, samples = 2048 } = {}) {
  const factor = resolveBaseMaterialColor(mat);
  const useVertexColors = Boolean(mat?.vertexColors && geometry?.attributes?.color);
  const pixels = mat?.map?.isTexture ? readTexturePixels(mat.map) : null;
  const map = pixels ? mat.map : null;

  if (!map && !useVertexColors) {
    scratch.copy(factor).convertLinearToSRGB();
    return { fraction: isSkinLikeColor(scratch.r, scratch.g, scratch.b) ? 1 : 0, sampleCount: 1 };
  }

  const uvs = sampleSurfaceUvs(geometry, { count: samples, materialIndex });
  if (uvs.length === 0) return null;
  const vertexColor = new THREE.Color();
  let skin = 0;
  let counted = 0;
  for (let i = 0; i < uvs.length; i += 3) {
    scratch.copy(factor);
    if (pixels) {
      sampleTexturePixel(pixels, map, uvs[i], uvs[i + 1], texel);
      if (texel[3] < 128) continue;
      scratch.multiply(vertexColor.setRGB(texel[0] / 255, texel[1] / 255, texel[2] / 255, THREE.SRGBColorSpace));
    }
    if (useVertexColors) scratch.multiply(vertexColorAt(geometry, uvs[i + 2], vertexColor));
    scratch.convertLinearToSRGB();
    counted += 1;
    if (isSkinLikeColor(scratch.r, scratch.g, scratch.b)) skin += 1;
  }
  return counted ? { fraction: skin / counted, sampleCount: counted } : null;
}
