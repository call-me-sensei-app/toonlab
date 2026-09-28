// Display-space colour helpers for the character material.
//
// Tones, tints and inks are display-space (sRGB-encoded) multipliers — the way
// an artist picks them off a reference — so they are applied to the encoded
// colour and the result converted back to linear for lighting.

import {
  abs,
  clamp,
  dot,
  float,
  Fn,
  fract,
  max,
  min,
  mix,
  sRGBTransferEOTF,
  sRGBTransferOETF,
  vec3,
  vec4,
} from 'three/tsl';

const LUMA = vec3(0.2126, 0.7152, 0.0722);

export function luma(color) {
  return dot(color, LUMA);
}

export function maxComponent(color) {
  return max(color.x, max(color.y, color.z));
}

export function minComponent(color) {
  return min(color.x, min(color.y, color.z));
}

/** Linear → display (sRGB-encoded), clamped to the representable range. */
export function toDisplay(linear) {
  return sRGBTransferOETF(clamp(linear, 0, 1));
}

/** Display (sRGB-encoded) → linear. */
export function toLinear(display) {
  return sRGBTransferEOTF(clamp(display, 0, 1));
}

/** Multiplies a linear colour by a display-space multiplier. */
export function displayMultiply(linear, multiplier) {
  return toLinear(toDisplay(linear).mul(multiplier));
}

/** Display chroma (max − min channel) of a linear colour. */
export function displayChroma(linear) {
  const display = toDisplay(linear);
  return maxComponent(display).sub(minComponent(display));
}

// Hue / saturation / value on display-space colours. Hue in turns (0–1).
export const rgbToHsv = /*@__PURE__*/ Fn(([rgb]) => {
  const k = vec4(0, -1 / 3, 2 / 3, -1);
  const p = mix(vec4(rgb.z, rgb.y, k.w, k.z), vec4(rgb.y, rgb.z, k.x, k.y), rgb.y.greaterThanEqual(rgb.z).select(1, 0));
  const q = mix(vec4(p.x, p.y, p.w, rgb.x), vec4(rgb.x, p.y, p.z, p.x), rgb.x.greaterThanEqual(p.x).select(1, 0));
  const d = q.x.sub(min(q.w, q.y));
  const e = float(1e-6);
  return vec3(abs(q.z.add(q.w.sub(q.y).div(d.mul(6).add(e)))), d.div(q.x.add(e)), q.x);
}).setLayout({ inputs: [{ name: 'rgb', type: 'vec3' }], name: 'toonRgbToHsv', type: 'vec3' });

export const hsvToRgb = /*@__PURE__*/ Fn(([hsv]) => {
  const p = abs(fract(vec3(hsv.x).add(vec3(1, 2 / 3, 1 / 3))).mul(6).sub(3));
  return hsv.z.mul(mix(vec3(1), clamp(p.sub(1), 0, 1), hsv.y));
}).setLayout({ inputs: [{ name: 'hsv', type: 'vec3' }], name: 'toonHsvToRgb', type: 'vec3' });
