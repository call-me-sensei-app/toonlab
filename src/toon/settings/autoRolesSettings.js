// Automatic per-vertex roles (autoRoles.js) for characters whose material
// names identify no face — typically one atlased material from a generator.
// 'auto' runs the inference only in that case; 'off' never runs it.
export const AUTO_ROLE_MODES = Object.freeze({
  auto: 'auto',
  off: 'off',
});

export const DEFAULT_AUTO_ROLES_SETTINGS = Object.freeze({
  mode: AUTO_ROLE_MODES.auto,
  // Chromaticity distance from the model's own sampled skin tone that still
  // counts as skin.
  skinTolerance: 0.07,
});

export function createAutoRolesSettings(options = null) {
  const source = typeof options === 'string' ? { mode: options } : options || {};
  const mode = Object.values(AUTO_ROLE_MODES).includes(source.mode) ? source.mode : DEFAULT_AUTO_ROLES_SETTINGS.mode;
  const tolerance = Number(source.skinTolerance);
  return {
    mode,
    skinTolerance: Number.isFinite(tolerance) ? Math.min(0.3, Math.max(0.01, tolerance)) : DEFAULT_AUTO_ROLES_SETTINGS.skinTolerance,
  };
}
