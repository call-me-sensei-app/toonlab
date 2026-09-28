/**
 * Registers an inert presentation mode without attaching comparison-only TSL
 * nodes to the compiled authored material.
 */
export function registerSurfaceMaterialMode(material: any, mode: any, descriptor?: {}): any;
export function resolveSurfaceMaterialMode(material: any, mode: any): any;
export function copySurfaceMaterialModes(source: any, target: any): any;
export function resolveSurfaceMaterialFamily(material: any): any;
export function listSurfaceMaterialModes(material: any): any[];
export const SURFACE_MATERIAL_MODE: Readonly<{
    authored: "authored";
    neutralLit: "neutral-lit";
    rawTexture: "raw-texture";
}>;
