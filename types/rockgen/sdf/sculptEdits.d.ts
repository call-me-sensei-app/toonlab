/** Distance to a sculpt edit's brush volume (sphere, or capsule segment). */
export function evaluateSculptEdit(edit: any, x: any, y: any, z: any): number;
/** Applies one edit to the folded field value. */
export function applySculptEditToField(edit: any, d: any, editDistance: any): number;
/** World-space AABB of an edit, padded by its blend radius. */
export function sculptEditBounds(edit: any): {
    max: any[];
    min: number[];
};
/**
 * Builds one capsule edit for a pointer-drag segment (from -> to). The lab
 * emits one of these per stroke sample instead of a sphere per pointermove,
 * keeping documents at ~10-30 edits per stroke. The id is assigned by
 * applySculptEdit (rockDocument.js) so ids stay unique per document.
 */
export function createStrokeEdit({ blend, from, to, radius, tool }: {
    blend?: number;
    from: any;
    to?: any;
    radius: any;
    tool?: string;
}): {
    blend: number;
    center: any[];
    end: any[];
    id: any;
    radius: number;
    shape: string;
    tool: string;
};
