const LEGACY_GROUND_SUPPORT_NAME = /\b(?:Ground Support|Gap(?: Cut)? \d+)\b/;

/** Construction pieces used by the lab for authoring helpers, not final rock surface. */
export function isRockHelperPiece(piece) {
  if (!piece || typeof piece !== 'object') return false;
  if (piece.helper?.kind === 'groundSupport') return true;
  return LEGACY_GROUND_SUPPORT_NAME.test(String(piece.name ?? ''));
}
