/**
 * Reports the portable Three.js lighting features available to this module.
 * This is a capability description, not a GPU benchmark or shader-limit test.
 */
export function createLightingCapabilityReport(options?: {}): Readonly<{
    backend: any;
    features: Readonly<{
        areaLights: Readonly<{
            discArea: "rect-area-approximation";
            rectArea: true;
            tubeArea: "rect-area-approximation";
        }>;
        cookies: Readonly<{
            spot: true;
        }>;
        iesProfiles: "metadata-only";
        lightLinking: "three-layers-plus-metadata";
        globalIllumination: false;
        manyLights: false;
        manyLightRenderer: false;
        shadows: Readonly<{
            ambient: false;
            directional: true;
            discArea: false;
            hemisphere: false;
            point: true;
            rectArea: false;
            spot: true;
            tubeArea: false;
        }>;
    }>;
    limits: Readonly<{
        maxTextureSize: number;
        maxTextureUnits: number;
        recipeLightCount: 1024;
    }>;
    renderer: any;
    supportedLightTypes: readonly string[];
    warnings: readonly string[];
}>;
/** Returns one type-specific view of a capability report. */
export function getLightingTypeCapability(type: any, report?: Readonly<{
    backend: any;
    features: Readonly<{
        areaLights: Readonly<{
            discArea: "rect-area-approximation";
            rectArea: true;
            tubeArea: "rect-area-approximation";
        }>;
        cookies: Readonly<{
            spot: true;
        }>;
        iesProfiles: "metadata-only";
        lightLinking: "three-layers-plus-metadata";
        globalIllumination: false;
        manyLights: false;
        manyLightRenderer: false;
        shadows: Readonly<{
            ambient: false;
            directional: true;
            discArea: false;
            hemisphere: false;
            point: true;
            rectArea: false;
            spot: true;
            tubeArea: false;
        }>;
    }>;
    limits: Readonly<{
        maxTextureSize: number;
        maxTextureUnits: number;
        recipeLightCount: 1024;
    }>;
    renderer: any;
    supportedLightTypes: readonly string[];
    warnings: readonly string[];
}>): {
    areaRealization: any;
    cookies: boolean;
    iesProfiles: boolean | "metadata-only";
    shadows: boolean;
    type: any;
};
/** Creates a mutable JSON-safe snapshot suitable for logs and diagnostics UIs. */
export function snapshotLightingCapabilities(report: any): any;
