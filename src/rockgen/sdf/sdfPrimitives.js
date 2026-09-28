// Signed-distance primitives for rockgen base shapes, evaluated in piece
// local space. Negative inside. Displacement modifiers turn these into
// implicit functions rather than true distance fields — fine for rockgen,
// which only dense-grid samples (never sphere-traces); see fieldCompiler.js
// for the bounds-padding contract that keeps that safe.

export function sdSphere(x, y, z, radius) {
  return Math.sqrt(x * x + y * y + z * z) - radius;
}

/**
 * Ellipsoid distance bound (Quilez approximation): exact sign, distance
 * accurate near the surface, which is all grid sampling needs.
 */
export function sdEllipsoid(x, y, z, rx, ry, rz) {
  const kx = x / rx;
  const ky = y / ry;
  const kz = z / rz;
  const k0 = Math.sqrt(kx * kx + ky * ky + kz * kz);
  const k1x = kx / rx;
  const k1y = ky / ry;
  const k1z = kz / rz;
  const k1 = Math.sqrt(k1x * k1x + k1y * k1y + k1z * k1z);
  if (k1 === 0) return -Math.min(rx, ry, rz);
  return (k0 * (k0 - 1)) / k1;
}

/** Box with half-extents (bx, by, bz) and rounded corner radius r. */
export function sdRoundBox(x, y, z, bx, by, bz, r) {
  const qx = Math.abs(x) - bx + r;
  const qy = Math.abs(y) - by + r;
  const qz = Math.abs(z) - bz + r;
  const ox = Math.max(qx, 0);
  const oy = Math.max(qy, 0);
  const oz = Math.max(qz, 0);
  const outside = Math.sqrt(ox * ox + oy * oy + oz * oz);
  const inside = Math.min(Math.max(qx, Math.max(qy, qz)), 0);
  return outside + inside - r;
}

/** Vertical (Y-axis) capsule: segment half-length plus cap radius. */
export function sdCapsule(x, y, z, halfLength, radius) {
  const cy = y - Math.min(Math.max(y, -halfLength), halfLength);
  return Math.sqrt(x * x + cy * cy + z * z) - radius;
}

/**
 * Signed distance to a 2D polygon (Quilez winding variant). `points` is a
 * flat [x0, y0, x1, y1, ...] array; the polygon closes implicitly and may
 * be concave. Negative inside, exact everywhere.
 */
export function sdPolygon2(points, x, y) {
  const count = points.length / 2;
  let dx = x - points[0];
  let dy = y - points[1];
  let d = dx * dx + dy * dy;
  let s = 1;
  for (let i = 0, j = count - 1; i < count; j = i, i += 1) {
    const vix = points[i * 2];
    const viy = points[i * 2 + 1];
    const ex = points[j * 2] - vix;
    const ey = points[j * 2 + 1] - viy;
    const wx = x - vix;
    const wy = y - viy;
    const t = Math.min(Math.max((wx * ex + wy * ey) / (ex * ex + ey * ey), 0), 1);
    const bx = wx - ex * t;
    const by = wy - ey * t;
    d = Math.min(d, bx * bx + by * by);
    const c0 = y >= viy;
    const c1 = y < points[j * 2 + 1];
    const c2 = ex * wy > ey * wx;
    if ((c0 && c1 && c2) || (!c0 && !c1 && !c2)) s = -s;
  }
  return s * Math.sqrt(d);
}

/**
 * Doodle slab: a 2D polygon in the local XY plane extruded to ±halfDepth
 * along Z, with edge rounding r (clamped so the slab never inverts). This
 * is the base shape a drawn rock outline compiles to.
 */
export function sdExtrudedPolygon(points, x, y, z, halfDepth, r) {
  const rounding = Math.min(Math.max(r, 0), halfDepth * 0.9);
  const d2 = sdPolygon2(points, x, y) + rounding;
  const w = Math.abs(z) - (halfDepth - rounding);
  const outside = Math.sqrt(Math.max(d2, 0) ** 2 + Math.max(w, 0) ** 2);
  return Math.min(Math.max(d2, w), 0) + outside - rounding;
}
