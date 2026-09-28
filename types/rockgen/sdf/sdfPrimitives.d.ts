export function sdSphere(x: any, y: any, z: any, radius: any): number;
/**
 * Ellipsoid distance bound (Quilez approximation): exact sign, distance
 * accurate near the surface, which is all grid sampling needs.
 */
export function sdEllipsoid(x: any, y: any, z: any, rx: any, ry: any, rz: any): number;
/** Box with half-extents (bx, by, bz) and rounded corner radius r. */
export function sdRoundBox(x: any, y: any, z: any, bx: any, by: any, bz: any, r: any): number;
/** Vertical (Y-axis) capsule: segment half-length plus cap radius. */
export function sdCapsule(x: any, y: any, z: any, halfLength: any, radius: any): number;
/**
 * Signed distance to a 2D polygon (Quilez winding variant). `points` is a
 * flat [x0, y0, x1, y1, ...] array; the polygon closes implicitly and may
 * be concave. Negative inside, exact everywhere.
 */
export function sdPolygon2(points: any, x: any, y: any): number;
/**
 * Doodle slab: a 2D polygon in the local XY plane extruded to ±halfDepth
 * along Z, with edge rounding r (clamped so the slab never inverts). This
 * is the base shape a drawn rock outline compiles to.
 */
export function sdExtrudedPolygon(points: any, x: any, y: any, z: any, halfDepth: any, r: any): number;
