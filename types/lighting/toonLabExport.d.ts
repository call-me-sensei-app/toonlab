/** Converts Three.js Y-up meters to ToonLab Z-up centimeters. */
export function threePositionToToonLab(position: any, worldScale?: number): number[];
/**
 * Exports a data-only ToonLab handoff manifest.
 *
 * It does not generate native project files or implement renderer features.
 * A ToonLab host adapter must validate and realize the intent.
 */
export function exportLightingRecipeToToonLab(recipeOptions: any, exportOptions?: {}): {
    coordinateSystem: {
        handedness: string;
        mapping: string;
        sourceUnits: string;
        worldScale: number;
    };
    platform: {
        name: string;
    };
    lights: any;
    rendererIntent: {
        globalIllumination: {
            intent: any;
            scope: string;
        };
        manyLights: {
            implementation: string;
            intent: any;
            scope: string;
        };
    };
    schemaVersion: number;
    source: {
        recipeId: string;
        recipeName: string;
        recipeSchemaVersion: number;
        shadowPolicy: any;
    };
    type: string;
    warnings: string[];
};
/** Serializes a previously generated ToonLab lighting manifest. */
export function serializeToonLabLightingManifest(manifest: any, { pretty }?: {
    pretty?: boolean;
}): string;
export const TOONLAB_LIGHTING_MANIFEST_TYPE: "toonlab/lighting-manifest";
export const TOONLAB_LIGHTING_MANIFEST_SCHEMA_VERSION: 1;
