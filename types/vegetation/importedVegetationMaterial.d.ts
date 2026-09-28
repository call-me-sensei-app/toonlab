/**
 * WebGL compatibility material for vegetation embedded in imported GLBs.
 *
 * The canonical procedural tree materials are TSL/WebGPU NodeMaterials. This
 * adapter consumes the same VegetationShaderProfile and semantic roles while
 * retaining an imported mesh's authored albedo, alpha cutout, UVs, and normal
 * detail, so a WebGL scene can route foliage and wood through the nature
 * treatment without rebuilding the source geometry.
 */
export function createImportedVegetationMaterial(source: any, { profile, role, }?: {
    profile?: {};
    role?: "foliageCard";
}): any;
