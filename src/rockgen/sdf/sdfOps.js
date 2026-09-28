// CSG combine operators for SDF values. The smooth variants use Quilez's
// polynomial smooth-min; `k` is the blend radius in world units (k <= 0
// degenerates to the hard operator).

export function opUnion(a, b) {
  return Math.min(a, b);
}

export function opIntersect(a, b) {
  return Math.max(a, b);
}

export function opSubtract(a, b) {
  return Math.max(a, -b);
}

export function opSmoothUnion(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = Math.min(Math.max(0.5 + (0.5 * (b - a)) / k, 0), 1);
  return b + (a - b) * h - k * h * (1 - h);
}

export function opSmoothIntersect(a, b, k) {
  return -opSmoothUnion(-a, -b, k);
}

export function opSmoothSubtract(a, b, k) {
  return -opSmoothUnion(-a, b, k);
}

/** Applies a named combine op ('union'|'smoothUnion'|'subtract'|'intersect'). */
export function combine(op, a, b, blend) {
  if (op === 'smoothUnion') return opSmoothUnion(a, b, blend);
  if (op === 'subtract') return blend > 0 ? opSmoothSubtract(a, b, blend) : opSubtract(a, b);
  if (op === 'intersect') return blend > 0 ? opSmoothIntersect(a, b, blend) : opIntersect(a, b);
  return opUnion(a, b);
}
