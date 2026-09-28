/**
 * Resolves layer precedence without mutating or flattening away ownership.
 * Content stays beside the effective visual settings; style, scenario,
 * quality, and explicit overrides compose in that order for each system.
 */
export function resolveSceneLook({ bundle: bundleInput, content: contentInput, overrides: overrideInput, quality: qualityInput, scenario: scenarioInput, }?: {
    overrides?: any;
}): {
    type: string;
    version: number;
    inputs: {
        bundle: {
            id: any;
            type: any;
            version: any;
        };
        content: {
            id: any;
            type: any;
            version: any;
        };
        scenario: {
            id: any;
            type: any;
            version: any;
        };
        quality: {
            id: any;
            type: any;
            version: any;
        };
        overrides: {
            id: any;
            type: any;
            version: any;
        };
    };
    content: any;
    scenario: any;
    quality: any;
    overrides: any;
    systems: {};
    targets: any;
};
export function serializeResolvedSceneLook(result: any, { pretty }?: {
    pretty?: boolean;
}): string;
export const RESOLVED_SCENE_LOOK_DOCUMENT_TYPE: "toonlab/resolved-scene-look";
export const RESOLVED_SCENE_LOOK_DOCUMENT_VERSION: 1;
export class SceneLookCompositionError extends Error {
    constructor(errors: any);
    errors: any[];
}
