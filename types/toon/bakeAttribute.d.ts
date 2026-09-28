/** Writes planar face coordinates (2 per vertex) into the bake attribute. */
export function writeBakedFaceUv(geometry: any, faceUv: any): void;
/** Writes local occlusion (1 per vertex) into the bake attribute. */
export function writeBakedOcclusion(geometry: any, occlusion: any): void;
/**
 * Writes a per-material detail value into w for the given vertices only
 * (`values` is indexed by vertex; NaN leaves a vertex untouched). `kind`
 * names what the materials on those vertices read ('lid' or 'sheer').
 */
export function writeBakedDetail(geometry: any, values: any, kind: any): void;
export function hasBakedFaceUv(geometry: any): boolean;
export function hasBakedOcclusion(geometry: any): boolean;
export function hasBakedDetail(geometry: any, kind: any): boolean;
/** Baked occlusion of one vertex (tests, tooling). */
export function bakedOcclusionAt(geometry: any, index: any): any;
/** Baked detail value (w) of one vertex (tests, tooling). */
export function bakedDetailAt(geometry: any, index: any): any;
export const BAKE_ATTRIBUTE: "toonBake";
