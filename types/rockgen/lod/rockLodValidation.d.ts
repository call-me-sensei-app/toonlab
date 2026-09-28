/**
 * Validates a planned LOD set. Equal topology is legal only when explicitly
 * marked as minimum-resolution/topology limited, or while the preceding mesh
 * is below the policy's tiny-mesh threshold.
 */
export function validateRockLodLevels(levels: any, { policy: policyOption, }?: {
    policy?: string;
}): {
    comparisons: any[];
    errors: {
        level: any;
        text: any;
    }[];
    valid: boolean;
    warnings: any[];
};
