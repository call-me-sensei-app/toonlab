// TSL port of src/shaders/chunks/environment-fragment-debug.glsl —
// environment debug views. Mode ids must match ENVIRONMENT_DEBUG_MODES in
// environmentSettings.js.
//
// On the node backends the debug table is always compiled in (it adds zero
// bindings — every input is already in the graph), so the GLSL
// ENV_DEBUG_VIEWS define flip becomes a pure write of the shared envDebugMode
// uniform (docs/tsl-conventions.md, debug-views precedent). The GLSL if-chain
// becomes a masked arithmetic sum: deep nested select() chains trip the GLSL
// builder's detached type-resolution fallback, and the fragment root must not
// be a ConditionalNode.

import {
  float,
  floor,
  select,
  vec3,
  vec4,
} from 'three/tsl';

/**
 * environmentDebugColor(...) — returns finalColor when mode matches no table
 * entry (including mode 0 / off), else the selected debug view.
 */
export function environmentDebugColor({
  mode,
  albedo,
  litColor,
  ambient,
  directLight,
  pointLight,
  spotLight,
  sunlightVisibility,
  aoMul,
  bakedGi,
  normal,
  vertexAo,
  specular,
  emissiveMask,
  windowMask,
  roomOcclusion,
  alpha,
  finalColor,
}) {
  const m = floor(mode.add(0.5)); // GLSL: int m = int(mode + 0.5)

  const entries = [
    [1, vec4(albedo, 1.0)],
    [2, vec4(litColor, 1.0)],
    [3, vec4(ambient, 1.0)],
    [4, vec4(directLight, 1.0)],
    [5, vec4(vec3(sunlightVisibility), 1.0)],
    [6, vec4(pointLight, 1.0)],
    [7, vec4(spotLight, 1.0)],
    [8, vec4(aoMul, 1.0)],
    [9, vec4(bakedGi, 1.0)],
    [10, vec4(normal.mul(0.5).add(0.5), 1.0)],
    [11, vec4(vec3(vertexAo), 1.0)],
    [12, vec4(specular, 1.0)],
    [13, vec4(vec3(emissiveMask), 1.0)],
    [14, vec4(vec3(windowMask), 1.0)],
    [15, vec4(vec3(roomOcclusion.oneMinus()), 1.0)],
    [16, vec4(vec3(alpha), 1.0)],
  ];

  // 1 when the mode matches any table entry, else 0 — keeps the finalColor
  // fallback for off/unknown modes without a conditional chain.
  let knownMask = float(0.0);
  for (const [id] of entries) {
    knownMask = knownMask.add(select(m.equal(float(id)), float(1.0), float(0.0)));
  }
  knownMask = knownMask.min(1.0);

  let result = vec4(finalColor).mul(knownMask.oneMinus());
  for (const [id, value] of entries) {
    result = result.add(vec4(value).mul(select(m.equal(float(id)), float(1.0), float(0.0))));
  }
  return result;
}
