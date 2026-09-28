/**
 * Resolves the authored shading inputs of one source material against the
 * resolved toon settings.
 */
export function resolveSourceShading(mat: any, { settings }?: {
    settings?: any;
}): {
    faceShadowMap: any;
    isMToon: boolean;
    lightingMap: any;
    matcapMap: any;
    mmdToonFile: string;
    mmdTone: number[];
    outlineOff: boolean;
    outlineWidthMap: any;
    parameterOverrides: {
        terminator?: number;
        softness?: number;
        outlineColorOverride?: any[];
        outlineOverrideLightingMix?: any;
        rimTint?: any[];
        rimIntensity?: number;
        rimMode?: number;
        rimAlbedoMix?: number;
        lightingMapChannel?: number[];
        lightingMapPivot?: number;
        lightingMapScale?: any;
        matcapStrength?: number;
    };
    rampMap: any;
    roleMaskMap: any;
    shadeOverride: {
        color: any;
        map: any;
    };
};
