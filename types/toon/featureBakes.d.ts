/**
 * Bakes the lid coordinate onto every eye-white material's vertices.
 * @returns {{ meshes: number, eyes: number, painted: string[] } | null}
 */
export function bakeEyeWhiteLid(root: any, { isScleraMaterial }: {
    isScleraMaterial: any;
}): {
    meshes: number;
    eyes: number;
    painted: string[];
} | null;
/**
 * Bakes a sheer-fabric weight onto stockings and tights.
 * @returns {{ materials: string[] } | null}
 */
export function bakeSheerFabric(root: any, { isEligibleMaterial }: {
    isEligibleMaterial: any;
}): {
    materials: string[];
} | null;
