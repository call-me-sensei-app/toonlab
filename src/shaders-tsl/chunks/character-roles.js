// TSL port of src/shaders/chunks/character-fragment-roles.glsl — material
// role ids and the role debug view color.

import { mix, select, vec3 } from 'three/tsl';

export const MATERIAL_ROLE_DEFAULT = 0;
export const MATERIAL_ROLE_COSTUME = 1;
export const MATERIAL_ROLE_SKIN = 2;
export const MATERIAL_ROLE_FACE = 3;
export const MATERIAL_ROLE_HAIR = 4;
export const MATERIAL_ROLE_EYE = 5;
export const MATERIAL_ROLE_EYE_HIGHLIGHT = 6;
export const MATERIAL_ROLE_BLUSH = 7;
export const MATERIAL_ROLE_TRANSPARENT_OVERLAY = 8;
export const MATERIAL_ROLE_METAL = 9;
export const MATERIAL_ROLE_OUTLINE = 10;
export const MATERIAL_ROLE_IRIS = 11;
export const MATERIAL_ROLE_PUPIL = 12;
export const MATERIAL_ROLE_SCLERA = 13;
export const MATERIAL_ROLE_CATCHLIGHT = 14;

const ROLE_DEBUG_COLORS = [
  [MATERIAL_ROLE_OUTLINE, [0.02, 0.02, 0.024]],
  [MATERIAL_ROLE_CATCHLIGHT, [1.0, 0.96, 0.64]],
  [MATERIAL_ROLE_EYE_HIGHLIGHT, [1.0, 1.0, 1.0]],
  [MATERIAL_ROLE_PUPIL, [0.08, 0.08, 0.11]],
  [MATERIAL_ROLE_IRIS, [0.52, 0.28, 1.0]],
  [MATERIAL_ROLE_SCLERA, [0.7, 0.92, 1.0]],
  [MATERIAL_ROLE_EYE, [0.18, 0.55, 1.0]],
  [MATERIAL_ROLE_FACE, [1.0, 0.42, 0.58]],
  [MATERIAL_ROLE_SKIN, [1.0, 0.73, 0.42]],
  [MATERIAL_ROLE_HAIR, [0.28, 0.68, 1.0]],
  [MATERIAL_ROLE_BLUSH, [1.0, 0.32, 0.48]],
  [MATERIAL_ROLE_TRANSPARENT_OVERLAY, [0.74, 0.45, 1.0]],
  [MATERIAL_ROLE_METAL, [1.0, 0.77, 0.23]],
  [MATERIAL_ROLE_COSTUME, [0.44, 0.5, 0.62]],
];

const roleColor = (role) => vec3(...ROLE_DEBUG_COLORS.find(([id]) => id === role)[1]);

export function createRolesChunk({ u, flags, w }) {
  const debugMaterialRoleColor = () => {
    if (flags.isOutlinePass) return vec3(0.02, 0.02, 0.024);
    let color = vec3(0.56, 0.58, 0.62);
    // Build the GLSL if-chain back-to-front so earlier entries win.
    for (let i = ROLE_DEBUG_COLORS.length - 1; i >= 0; i -= 1) {
      const [role, rgb] = ROLE_DEBUG_COLORS[i];
      color = select(u.materialRole.equal(role), vec3(...rgb), color);
    }
    // Per-pixel role weights (role masks / per-vertex roles) paint over the
    // material colour so a single atlased material shows its regions.
    if (!w) return color;
    const skin = mix(color, roleColor(MATERIAL_ROLE_SKIN), w.skin);
    const hair = mix(skin, roleColor(MATERIAL_ROLE_HAIR), w.hair);
    return mix(hair, roleColor(MATERIAL_ROLE_FACE), w.face);
  };

  return { debugMaterialRoleColor };
}
