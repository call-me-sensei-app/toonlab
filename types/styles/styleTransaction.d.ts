/**
 * Captures one runtime target before mutation. Custom adapters may implement
 * `capture(subject, context)` and `restore(subject, snapshot, context)`;
 * package Object3D and system targets use the built-in snapshot paths.
 */
export function captureStyleTargetSnapshot(entry: any): Promise<{
    restore: () => any;
    targetId: any;
}>;
export function restoreStyleTargetSnapshot(snapshot: any): Promise<any>;
