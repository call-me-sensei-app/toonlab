// Modifier math shared by the field compiler: displacement profiles plus the
// per-stage maximum-displacement report that fieldCompiler.js uses to pad
// piece bounds (the contract that keeps displaced implicit surfaces inside
// the sampled grid — see the Lipschitz note there).

/**
 * Strata groove profile. `v` is in band units (1 = one stratum); returns
 * [0, 1] with 1 in the groove carved at each band boundary. `sharpness`
 * narrows the groove from broad terracing (0) to thin score lines (1).
 */
export function strataProfile(v, sharpness) {
  const t = v - Math.floor(v);
  const q = Math.min(t, 1 - t) * 2; // 0 at band boundary, 1 mid-band
  const width = 0.15 + (1 - sharpness) * 0.45;
  const edge = q / width;
  if (edge >= 1) return 0;
  const u = 1 - edge;
  return u * u * (3 - 2 * u);
}

/**
 * Worst-case surface displacement (world units, before piece scale) that the
 * enabled modifier stages can apply. fbm3/ridgedFbm3 are amplitude-sum
 * normalized to [-1, 1], so each stage's bound is simply its strength.
 * Planar cuts contribute nothing: they intersect (remove volume only), so
 * the surface can only move inward.
 */
export function maxPieceDisplacement(piece) {
  let total = 0;
  if (piece.noise?.enabled) total += Math.abs(piece.noise.amplitude);
  if (piece.facet?.enabled) total += Math.abs(piece.facet.strength);
  if (piece.cracks?.enabled) total += Math.abs(piece.cracks.depth);
  if (piece.strata?.enabled) total += Math.abs(piece.strata.strength);
  // Column height steps lift the surface by up to half the variation.
  if (piece.columns?.enabled) total += Math.abs(piece.columns.heightVariation) * 0.5;
  return total;
}

/**
 * Domain warp moves sample positions rather than distances, so it pads
 * bounds by its full strength instead of contributing to displacement.
 */
export function warpBoundsPad(piece) {
  return piece.warp?.enabled ? Math.abs(piece.warp.strength) : 0;
}
