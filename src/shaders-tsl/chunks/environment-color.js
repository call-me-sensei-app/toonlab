// TSL port of src/shaders/chunks/environment-fragment-color.glsl — color
// helpers for the environment shader: Rec.709 luma, saturation remap, and the
// blue/cyan window-pane detector used by the open-windows cutout.
//
// Leaf node→node helpers, exported as Fn() per docs/tsl-conventions.md.

import {
  dot,
  Fn,
  max,
  min,
  mix,
  smoothstep,
  vec3,
} from 'three/tsl';

/** GLSL envLuma(color): Rec.709 luminance. */
export const envLuma = /*@__PURE__*/ Fn(([color]) => {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
});

/** GLSL applySaturation(color, amount): lerp from grayscale luma. */
export const applySaturation = /*@__PURE__*/ Fn(([color, amount]) => {
  const luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  return mix(vec3(luma), color, amount);
});

/**
 * GLSL windowPaneMask(color): 1 where the texel reads as a blue/cyan glass
 * pane, guarded against bright cloth/paper. Same smoothstep windows.
 */
export const windowPaneMask = /*@__PURE__*/ Fn(([color]) => {
  const maxChannel = max(color.r, max(color.g, color.b));
  const minChannel = min(color.r, min(color.g, color.b));
  const colorSpread = maxChannel.sub(minChannel);
  const bluePane = smoothstep(0.03, 0.16, color.b.sub(color.r))
    .mul(smoothstep(0.00, 0.10, color.g.sub(color.r)))
    .mul(smoothstep(0.24, 0.54, color.b))
    .mul(smoothstep(0.03, 0.22, colorSpread));
  const cyanPane = smoothstep(0.02, 0.14, color.g.sub(color.r))
    .mul(smoothstep(0.02, 0.14, color.b.sub(color.r)))
    .mul(smoothstep(0.24, 0.52, max(color.g, color.b)))
    .mul(smoothstep(0.02, 0.18, colorSpread));
  const clothOrPaperGuard = smoothstep(1.48, 2.15, color.r.add(color.g).add(color.b)).oneMinus();

  return max(bluePane, cyanPane).mul(clothOrPaperGuard);
});
