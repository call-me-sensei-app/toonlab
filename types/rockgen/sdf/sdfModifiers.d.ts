/**
 * Strata groove profile. `v` is in band units (1 = one stratum); returns
 * [0, 1] with 1 in the groove carved at each band boundary. `sharpness`
 * narrows the groove from broad terracing (0) to thin score lines (1).
 */
export function strataProfile(v: any, sharpness: any): number;
/**
 * Worst-case surface displacement (world units, before piece scale) that the
 * enabled modifier stages can apply. fbm3/ridgedFbm3 are amplitude-sum
 * normalized to [-1, 1], so each stage's bound is simply its strength.
 * Planar cuts contribute nothing: they intersect (remove volume only), so
 * the surface can only move inward.
 */
export function maxPieceDisplacement(piece: any): number;
/**
 * Domain warp moves sample positions rather than distances, so it pads
 * bounds by its full strength instead of contributing to displacement.
 */
export function warpBoundsPad(piece: any): number;
