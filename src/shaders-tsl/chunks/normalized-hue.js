import {
  abs,
  clamp,
  float,
  Fn,
  fract,
  min,
  mix,
  select,
  vec3,
  vec4,
} from 'three/tsl';

// Backend-neutral RGB -> HSV -> RGB hue rotation. Several early TSL ports
// embedded this operation with wgslFn(), which native WebGPU accepted but the
// WebGPURenderer's WebGL2 backend attempted to parse as GLSL. Keeping the graph
// in TSL gives both builders the same arithmetic and preserves the authored
// normalized hue-turn semantics.
export const shiftNormalizedHue = /*@__PURE__*/ Fn(([sourceColor, offset]) => {
  const p = select(
    sourceColor.g.greaterThanEqual(sourceColor.b),
    vec4(sourceColor.g, sourceColor.b, 0.0, -1.0 / 3.0),
    vec4(sourceColor.b, sourceColor.g, -1.0, 2.0 / 3.0),
  );
  const q = select(
    sourceColor.r.greaterThanEqual(p.x),
    vec4(sourceColor.r, p.y, p.z, p.x),
    vec4(p.x, p.y, p.w, sourceColor.r),
  );
  const difference = q.x.sub(min(q.w, q.y));
  const epsilon = float(1e-4);
  const value = select(difference.equal(0.0), q.x, q.x.add(epsilon));
  const hue = fract(abs(q.z.add(q.w.sub(q.y).div(difference.mul(6.0).add(epsilon)))).add(offset));
  const saturation = difference.div(q.x.add(epsilon));
  const hueRgb = abs(fract(vec3(hue).add(vec3(1.0, 2.0 / 3.0, 1.0 / 3.0))).mul(6.0).sub(3.0));
  return value.mul(mix(
    vec3(1.0),
    clamp(hueRgb.sub(1.0), vec3(0.0), vec3(1.0)),
    saturation,
  ));
});
