export function inferDenseFieldRockClass({ scaleClass, targetHeightMetres }?: {
    scaleClass?: any;
    targetHeightMetres?: any;
}): "landmark" | "formation" | "ordinary";
export function validateDenseFieldRockLodTargets(targets: any, { assetClass, }?: {
    assetClass?: string;
}): Readonly<{
    assetClass: string;
    ceilings: any;
    errors: readonly string[];
    valid: boolean;
    values: readonly number[];
}>;
/**
 * Install the mandatory dense-field rock behavior on an authored LOD0-LOD4
 * root. The final tier is geometry-only silhouette support; it never casts a
 * shadow and the root is culled once its projected diameter drops below the
 * production pixel threshold.
 */
export function createDenseFieldRockLodRuntime(root: any, { cullBelowPixels, hysteresis, maxLevel, pixelThresholds, referenceDiameter, requireComplete, }?: {
    cullBelowPixels?: number;
    hysteresis?: number;
    maxLevel?: number;
    pixelThresholds?: readonly number[];
    referenceDiameter?: any;
    requireComplete?: boolean;
}): Readonly<{
    policy: Readonly<{
        cullBelowPixels: 5;
        farShadowLastLevel: 2;
        levelCount: 5;
        levels: readonly (Readonly<{
            id: "LOD0";
            level: 0;
            purpose: "hero-close";
        }> | Readonly<{
            id: "LOD1";
            level: 1;
            purpose: "near-gameplay";
        }> | Readonly<{
            id: "LOD2";
            level: 2;
            purpose: "mid-gameplay";
        }> | Readonly<{
            id: "LOD3";
            level: 3;
            purpose: "far-simplified";
        }> | Readonly<{
            id: "LOD4";
            level: 4;
            purpose: "very-far-silhouette";
        }>)[];
        pixelThresholds: readonly number[];
        selectionBasis: "projected-object-diameter-pixels";
        triangleCeilings: Readonly<{
            ordinary: Readonly<{
                LOD3: 1200;
                LOD4: 350;
            }>;
            formation: Readonly<{
                LOD3: 1800;
                LOD4: 600;
            }>;
            landmark: Readonly<{
                LOD3: 2500;
                LOD4: 800;
            }>;
        }>;
        veryFar: Readonly<{
            allowedSurfaceChannels: readonly string[];
            castShadow: false;
            preserve: readonly string[];
            remove: readonly string[];
            silhouetteOnly: true;
        }>;
    }>;
    dispose(): void;
    availableLevels: readonly any[];
    bindings: readonly any[];
    disposed: boolean;
    level: any;
    setLevel: (level: any) => boolean;
    cullBelowPixels: number;
    pixelThresholds: readonly any[];
    referenceDiameter: number;
    thresholds: readonly any[];
    hysteresis: number;
    update: (options?: {}) => Readonly<{
        changed: boolean;
        culled: boolean;
        distance: number;
        level: any;
        projectedPixels: number;
    }>;
}>;
export const DENSE_FIELD_ROCK_LOD_LEVELS: readonly (Readonly<{
    id: "LOD0";
    level: 0;
    purpose: "hero-close";
}> | Readonly<{
    id: "LOD1";
    level: 1;
    purpose: "near-gameplay";
}> | Readonly<{
    id: "LOD2";
    level: 2;
    purpose: "mid-gameplay";
}> | Readonly<{
    id: "LOD3";
    level: 3;
    purpose: "far-simplified";
}> | Readonly<{
    id: "LOD4";
    level: 4;
    purpose: "very-far-silhouette";
}>)[];
export const DENSE_FIELD_ROCK_PIXEL_THRESHOLDS: readonly number[];
export const DENSE_FIELD_ROCK_CULL_BELOW_PIXELS: 5;
export const DENSE_FIELD_ROCK_TRIANGLE_CEILINGS: Readonly<{
    ordinary: Readonly<{
        LOD3: 1200;
        LOD4: 350;
    }>;
    formation: Readonly<{
        LOD3: 1800;
        LOD4: 600;
    }>;
    landmark: Readonly<{
        LOD3: 2500;
        LOD4: 800;
    }>;
}>;
export const DENSE_FIELD_ROCK_PRODUCTION_RULE: Readonly<{
    cullBelowPixels: 5;
    farShadowLastLevel: 2;
    levelCount: 5;
    levels: readonly (Readonly<{
        id: "LOD0";
        level: 0;
        purpose: "hero-close";
    }> | Readonly<{
        id: "LOD1";
        level: 1;
        purpose: "near-gameplay";
    }> | Readonly<{
        id: "LOD2";
        level: 2;
        purpose: "mid-gameplay";
    }> | Readonly<{
        id: "LOD3";
        level: 3;
        purpose: "far-simplified";
    }> | Readonly<{
        id: "LOD4";
        level: 4;
        purpose: "very-far-silhouette";
    }>)[];
    pixelThresholds: readonly number[];
    selectionBasis: "projected-object-diameter-pixels";
    triangleCeilings: Readonly<{
        ordinary: Readonly<{
            LOD3: 1200;
            LOD4: 350;
        }>;
        formation: Readonly<{
            LOD3: 1800;
            LOD4: 600;
        }>;
        landmark: Readonly<{
            LOD3: 2500;
            LOD4: 800;
        }>;
    }>;
    veryFar: Readonly<{
        allowedSurfaceChannels: readonly string[];
        castShadow: false;
        preserve: readonly string[];
        remove: readonly string[];
        silhouetteOnly: true;
    }>;
}>;
