/**
 * Writes a validated canonical label to `root.userData.toonlab`.
 * Existing different labels require explicit replacement; repeating the same
 * label is idempotent.
 */
export function labelStyleTarget(root: any, label: any, { replace }?: {
    replace?: boolean;
}): {
    extensions?: any;
    materials?: any;
    collision?: any;
    domain: any;
    assetId?: string;
    targetId?: string;
    schemaVersion: number;
};
/** Returns a canonical migrated label, null when absent, and throws when invalid. */
export function readStyleTargetLabel(root: any): {
    extensions?: any;
    materials?: any;
    collision?: any;
    domain: any;
    assetId?: string;
    targetId?: string;
    schemaVersion: number;
};
/** Removes only ToonLab's label and preserves every other userData field. */
export function removeStyleTargetLabel(root: any): boolean;
/**
 * Discovers explicitly labeled roots. Unlabeled renderables are intentionally
 * left for the later scene audit rather than guessed here.
 */
export function collectStyleTargets(scene: any, { renderer }?: {
    renderer?: any;
}): {
    issues: any[];
    ok: boolean;
    targets: any[];
};
export class StyleTargetLabelError extends Error {
    constructor(errors: any, root?: any);
    errors: any[];
    root: any;
}
export class StyleTargetDiscoveryError extends Error {
    constructor(report: any);
    report: any;
}
