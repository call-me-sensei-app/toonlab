// TSL port of src/shaders/chunks/water-common.glsl — shared procedural
// helpers for the stylized shaders (hashes, value noise, fbm, voronoi, toon
// step). Everything is generated in-shader so the systems ship with zero
// texture assets.
//
// Convention (docs/tsl-conventions.md): leaf helpers that map node→node are
// `Fn()` exports (compiled as real shader functions); helpers with
// compile-time-constant parameters (loop counts) are plain JS composition
// functions and unroll at node-build time.

import {
  dot,
  float,
  floor,
  Fn,
  fract,
  If,
  mat2,
  mix,
  normalize,
  smoothstep,
  sqrt,
  vec2,
  vec3,
  vec4,
} from 'three/tsl';

export const waterHash11 = /*@__PURE__*/ Fn(([p]) => {
  const x = fract(p.mul(0.1031)).toVar();
  x.mulAssign(x.add(33.33));
  x.mulAssign(x.add(x));
  return fract(x);
});

export const waterHash12 = /*@__PURE__*/ Fn(([p]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(0.1031)).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.x.add(p3.y).mul(p3.z));
});

export const waterHash22 = /*@__PURE__*/ Fn(([p]) => {
  const p3 = fract(vec3(p.x, p.y, p.x).mul(vec3(0.1031, 0.103, 0.0973))).toVar();
  p3.addAssign(dot(p3, p3.yzx.add(33.33)));
  return fract(p3.xx.add(p3.yz).mul(p3.zy));
});

export const waterValueNoise = /*@__PURE__*/ Fn(([p]) => {
  const i = floor(p);
  const f = fract(p);
  const u = f.mul(f).mul(f.mul(-2).add(3));
  const a = waterHash12(i);
  const b = waterHash12(i.add(vec2(1, 0)));
  const c = waterHash12(i.add(vec2(0, 1)));
  const d = waterHash12(i.add(vec2(1, 1)));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
});

// GLSL: waterFbm(vec2 p, int octaves) — every call site passes a literal, so
// the octave count is a JS number here and the loop unrolls at build time.
export function waterFbm(p, octaves) {
  const count = Math.min(Math.max(Math.trunc(octaves), 0), 5);
  let value = float(0);
  let amplitude = 0.5;
  let total = 0;
  let q = vec2(p);
  for (let i = 0; i < count; i += 1) {
    value = value.add(waterValueNoise(q).mul(amplitude));
    total += amplitude;
    // GLSL: p = mat2(0.8, 0.6, -0.6, 0.8) * p * 2.02 + vec2(17.13, 9.77),
    // written out component-wise (columns (0.8, 0.6) and (-0.6, 0.8)).
    q = vec2(
      q.x.mul(0.8).add(q.y.mul(-0.6)),
      q.x.mul(0.6).add(q.y.mul(0.8)),
    ).mul(2.02).add(vec2(17.13, 9.77));
    amplitude *= 0.5;
  }
  return value.div(Math.max(total, 1e-4));
}

// Voronoi F1/F2 distances plus the owning cell id: vec4(F1, F2, cellId.xy).
// The 3×3 neighbourhood walk unrolls at build time (matches the GLSL loop).
export const waterVoronoi2 = /*@__PURE__*/ Fn(([p]) => {
  const cell = floor(p).toVar();
  const local = fract(p).toVar();
  const f1 = float(8).toVar();
  const f2 = float(8).toVar();
  const bestId = vec2(0).toVar();
  for (let y = -1; y <= 1; y += 1) {
    for (let x = -1; x <= 1; x += 1) {
      const offset = vec2(x, y);
      const feature = waterHash22(cell.add(offset));
      const delta = offset.add(feature).sub(local);
      const distanceSq = dot(delta, delta).toVar();
      If(distanceSq.lessThan(f1), () => {
        f2.assign(f1);
        f1.assign(distanceSq);
        bestId.assign(cell.add(offset));
      }).ElseIf(distanceSq.lessThan(f2), () => {
        f2.assign(distanceSq);
      });
    }
  }
  return vec4(sqrt(f1), sqrt(f2), bestId);
});

// GLSL: mat2 waterRotate2d(angle) = mat2(c, -s, s, c) (column-major scalars).
// TSL's mat2() takes three.js ROW-major scalar order — the transpose of the
// GLSL constructor — so the argument order here is deliberately swapped.
// Verified vs WebGL cloud-pattern parity (docs/tsl-conventions.md).
export function waterRotate2d(angle) {
  const s = float(angle).sin();
  const c = float(angle).cos();
  return mat2(c, s, s.negate(), c);
}

// Crisp two-tone step with a controllable soft edge; the core toon primitive.
export const waterToonStep = /*@__PURE__*/ Fn(([edge, softness, value]) => {
  return smoothstep(edge.sub(softness), edge.add(softness), value);
});

// Tilts a surface normal by a heightfield gradient (dh/dx, dh/dz).
export const waterCombineNormal = /*@__PURE__*/ Fn(([baseNormal, gradient]) => {
  return normalize(vec3(baseNormal.x.sub(gradient.x), baseNormal.y, baseNormal.z.sub(gradient.y)));
});
