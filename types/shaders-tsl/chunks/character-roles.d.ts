export function createRolesChunk({ u, flags, w }: {
    u: any;
    flags: any;
    w: any;
}): {
    debugMaterialRoleColor: () => import("three/webgpu").Node<"vec3">;
};
export const MATERIAL_ROLE_DEFAULT: 0;
export const MATERIAL_ROLE_COSTUME: 1;
export const MATERIAL_ROLE_SKIN: 2;
export const MATERIAL_ROLE_FACE: 3;
export const MATERIAL_ROLE_HAIR: 4;
export const MATERIAL_ROLE_EYE: 5;
export const MATERIAL_ROLE_EYE_HIGHLIGHT: 6;
export const MATERIAL_ROLE_BLUSH: 7;
export const MATERIAL_ROLE_TRANSPARENT_OVERLAY: 8;
export const MATERIAL_ROLE_METAL: 9;
export const MATERIAL_ROLE_OUTLINE: 10;
export const MATERIAL_ROLE_IRIS: 11;
export const MATERIAL_ROLE_PUPIL: 12;
export const MATERIAL_ROLE_SCLERA: 13;
export const MATERIAL_ROLE_CATCHLIGHT: 14;
