/**
 * Applies one package scene-quality document to every supported live system.
 * The mapping lives here so scene files only choose a profile; they do not
 * carry subsystem tier tables or translate field names themselves.
 */
export function applySceneQualityProfile(input?: string, { lighting, post, sky, vegetation, water, }?: {
    lighting?: any;
    post?: any;
    sky?: any;
    vegetation?: any[];
    water?: any;
}): Promise<Readonly<{
    applied: readonly any[];
    profile: any;
    revert(): Promise<{
        reason: string;
        reverted: boolean;
        systems?: undefined;
    } | {
        reverted: boolean;
        systems: any[];
        reason?: undefined;
    }>;
    skipped: readonly {
        reason: string;
        system: string;
    }[];
}>>;
export class SceneQualityApplicationError extends Error {
    constructor(cause: any, rollbackErrors?: any[]);
    cause: any;
    rollbackErrors: any[];
    rolledBack: boolean;
}
