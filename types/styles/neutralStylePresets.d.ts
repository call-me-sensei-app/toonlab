/**
 * Registers `neutral` into every domain registry that has one. Idempotent and
 * safe to call from any entry point; returns the per-registrar result.
 */
export function registerNeutralStylePresets({ force }?: {
    force?: boolean;
}): {
    alreadyRegistered: boolean;
    registrars: ({
        id: string;
        ok: boolean;
        result: string | {
            description: any;
            id: any;
            label: any;
        };
        error?: undefined;
    } | {
        error: string;
        id: string;
        ok: boolean;
        result?: undefined;
    })[];
};
/**
 * Reports neutral coverage per slot against the Call Me Sensei slot list, so a
 * gap is visible instead of implied.
 */
export function describeNeutralStyleCoverage(): {
    abSafe: any;
    coverage: any;
    inBundle: boolean;
    note: any;
    slot: string;
}[];
/**
 * Proves that `neutral` differs from `call_me_sensei` in SHADING ONLY.
 *
 * Two questions, deliberately separated, because they have different answers
 * and only one of them is a defect:
 *
 *  - **issues (must be empty).** When a host supplies the same explicit
 *    recipe to both presets — which is what a scene always does — do the
 *    geometry / mask / tiling / motion keys resolve identically? If not, the
 *    neutral preset is overriding something it has no business owning, and the
 *    two halves of a wipe would not share geometry.
 *  - **warnings (informational).** With NO host recipe, do the bare
 *    resolutions differ? Some do, and that is correct: `bladesPerClump` is a
 *    property of the field the host authored, not of the style, so `neutral`
 *    does not declare it and it falls through to the schema default rather
 *    than to the styled preset's value. Each key listed here is one the host
 *    must pass identically to both halves. The ground shader takes the other
 *    policy — it PINS its mask keys to the styled values so an un-parameterised
 *    neutral still paints the same masks — and reports no warnings as a result.
 */
export function auditNeutralStyleShadingOnly(): {
    domains: any[];
    issues: any[];
    ok: boolean;
    warnings: any[];
};
/** The reserved id every domain uses for its un-stylized baseline. */
export const NEUTRAL_STYLE_PRESET_ID: "neutral";
/**
 * Character toon shading. Disables every graphic feature (face maps and face
 * normals, painted tones and the terminator band, outlines, rim, highlights,
 * the automatic lighting map) and softens the terminator into a broad
 * Lambert-like falloff with a neutral grey shadow. Cast shadows, material maps
 * and alpha stay ON — that is the PBR half of the comparison.
 */
export const NEUTRAL_TOON_SETTINGS: Readonly<{
    face: {
        enabled: boolean;
    };
    fur: {
        enabled: boolean;
    };
    highlights: {
        enabled: boolean;
    };
    light: {
        skyFloor: number;
    };
    outline: {
        enabled: boolean;
    };
    ramp: {
        enabled: boolean;
    };
    rim: {
        enabled: boolean;
    };
    shading: {
        lightingMap: {
            auto: boolean;
        };
        softness: number;
    };
    shadows: {
        character: {
            enabled: boolean;
        };
        enabled: boolean;
    };
    sticker: {
        enabled: boolean;
    };
}>;
/**
 * Vegetation shader — one registration serves the `treeShader`, `grassShader`
 * and `flowerShader` scopes, which share a registry. Bands go to their
 * smoothest admissible form (`bandCount` is clamped to `[2, 6]`, so 6 with full
 * softness is the closest the schema gets to continuous), tints and rim fills
 * go to zero, and physical transmission (`thinSurface`) and weather response
 * are left exactly as authored because they are PBR, not stylization.
 */
export const NEUTRAL_VEGETATION_SHADER_SETTINGS: Readonly<{
    bark: {
        bandCount: number;
        bandSoftness: number;
        emissiveStrength: number;
        normalFlatness: number;
        rimStrength: number;
        roughness: number;
        shadowFloor: number;
        skyFillStrength: number;
        specularStrength: number;
        sunTintStrength: number;
        tintStrength: number;
        verticalShadeStrength: number;
    };
    flower: {
        backlitStrength: number;
        bandSoftness: number;
        emissiveStrength: number;
        tintStrength: number;
        unlitPetalLift: number;
    };
    foliage: {
        backlitStrength: number;
        bandSoftness: number;
        cardVariationStrength: number;
        crestSoftness: number;
        crownOcclusionStrength: number;
        emissiveStrength: number;
        gradientContrast: number;
        gradientOffset: number;
        hueShift: number;
        hueVariation: number;
        spriteLuminanceStrength: number;
        styleColorStrength: number;
    };
    grass: {
        backlitStrength: number;
        bandSoftness: number;
        colorVariationStrength: number;
        emissiveStrength: number;
        gustSheenStrength: number;
        rootOcclusionStrength: number;
        shadowFloor: number;
        styleColorStrength: number;
        tipDesaturation: number;
        tipHueShift: number;
    };
    lighting: {
        rimStrength: number;
        shadowTintStrength: number;
        skyFillStrength: number;
        sunTintStrength: number;
    };
    stem: {
        bandCount: number;
        bandSoftness: number;
        colorStrength: number;
        emissiveStrength: number;
        rimStrength: number;
        shadowFloor: number;
        skyFillStrength: number;
    };
}>;
/**
 * Grass field. SHADING KEYS ONLY — `bladesPerClump`, `clumpRadius`,
 * `bladeHeightRange`, `bladeWidthRange`, `leanStrength`, every wind/gust key
 * and `pushRadius` are intentionally absent so the neutral and styled halves
 * grow the identical blades in the identical places with the identical motion.
 */
export const NEUTRAL_GRASS_SETTINGS: Readonly<{
    backlitStrength: 0;
    baseColor: readonly number[];
    cloudShadowStrength: 0;
    groundAdoptStrength: 0;
    groundAdoptTint: readonly number[];
    shadowStrength: 0.5;
    shadowTint: readonly number[];
    tipColor: readonly number[];
    washLift: 0;
    washOpacity: 1;
}>;
/**
 * Ground shader. Projection scales, slope thresholds and shoreline widths are
 * copied from the `call_me_sensei` preset ON PURPOSE: those decide WHICH layer
 * is painted WHERE and at what tiling. Keeping them equal means the neutral
 * half paints the identical mask at the identical scale, and only the treatment
 * differs — layer tints go neutral, macro variation and edge highlight go to
 * zero, shadows lose their tint and lift, and the aerial distance tint is off.
 */
export const NEUTRAL_GROUND_SHADER_SETTINGS: Readonly<{
    distance: {
        detailFade: number;
        strength: number;
    };
    layers: {
        brightness: number;
        contrast: number;
        dirtTint: number[];
        grassTint: number[];
        rockTint: number[];
        sandTint: number[];
        saturation: number;
        textureStrength: number;
    };
    lighting: {
        backShadowStrength: number;
        shadowLift: number;
        shadowTint: number[];
        shadowTintStrength: number;
        skyFillStrength: number;
        sunIntensity: number;
    };
    macro: {
        amount: number;
        secondaryAmount: number;
        tintStrength: number;
    };
    material: {
        emissiveStrength: number;
        metalness: number;
        roughness: number;
    };
    projection: {
        dirtScale: number;
        grassScale: number;
        rockScale: number;
        sandScale: number;
        triplanarSharpness: number;
        triplanarStrength: number;
    };
    printResponse: {
        rimLightening: number;
    };
    shoreline: {
        autoSandStrength: number;
        bandWidth: number;
        softness: number;
        wetBandWidth: number;
    };
    slope: {
        autoRockStrength: number;
        edgeHighlight: number;
        fade: number;
        noiseScale: number;
        noiseStrength: number;
        start: number;
    };
}>;
/**
 * Environment. Keeps every map-consuming and light-consuming feature on and
 * turns off the five graphic ones (AO overlay, the authored left-side shade,
 * sky tinting, sun boost and the untextured gradient), then flattens the
 * grading parameters to unity.
 */
export const NEUTRAL_ENVIRONMENT_PRESET: Readonly<{
    features: Readonly<{
        aoOverlay: false;
        leftSideShadow: false;
        skyTint: false;
        sunBoost: false;
        untexturedGradient: false;
    }>;
    parameters: Readonly<{
        aoWarmth: 0;
        cloudShadowStrength: 0;
        directLightStrength: 1;
        exposure: 1;
        lightingInfluence: 1;
        saturation: 1;
        shadowLift: 0;
        shadowTintColor: number[];
        skyTintStrength: 0;
        triplanarDetail: 0;
        triplanarEdgeHighlight: 0;
        untexturedGradientStrength: 0;
    }>;
}>;
/**
 * Manufactured surface. Every `*Enabled` control that adds a graphic layer goes
 * to 0; source authority, normal detail, reflection probes, decals and graphics
 * stay at 1 so the surface still reads as the material it actually is.
 */
export const NEUTRAL_MANUFACTURED_SURFACE_SETTINGS: Readonly<{
    celLightingEnabled: 0;
    colorLiftEnabled: 0;
    colorLiftStrength: 0;
    coolShadowsEnabled: 0;
    coolShadowStrength: 0;
    decalStrength: 1;
    edgeInkEnabled: 0;
    fresnelEnabled: 0;
    fresnelStrength: 0;
    graphicsEnabled: 1;
    highlightBandEnabled: 0;
    highlightBandStrength: 0;
    materialResponseEnabled: 0;
    materialResponseStrength: 0;
    normalDetailEnabled: 1;
    paintBandsEnabled: 0;
    paintExtractionEnabled: 1;
    paintExtractionStrength: 1;
    pastelPaletteEnabled: 0;
    pastelStrength: 0;
    planarSheenEnabled: 0;
    planarSheenStrength: 0;
    reflectionNormalEnabled: 1;
    reflectionProbeLayerEnabled: 1;
    reflectionSelectivityEnabled: 0;
    rimEnabled: 0;
    roughnessBreakupEnabled: 0;
    shadowPastelEnabled: 0;
    shadowPastelStrength: 0;
    silhouetteInkEnabled: 0;
    sourceAuthorityEnabled: 1;
    sourceAuthorityStrength: 1;
    viewReflectionEnabled: 1;
    wearEnabled: 0;
}>;
/**
 * Water. `colorTone: 'classic'` is the schema's own "palette untouched" tone —
 * it hands colour back to the preset instead of force-applying the `anime`
 * palette over it (see D19-005). Motion identity stays owned by the preset, so
 * both halves run the same waves.
 */
export const NEUTRAL_WATER_STYLE: Readonly<{
    settings: Readonly<{
        colorTone: "classic";
        sceneShadowStrength: 1;
    }>;
}>;
/**
 * Sky. A restrained physical-looking gradient with the signature glow and
 * saturation pulled back. Cloud coverage, scale, speed, direction and seed are
 * NOT set — cloud shape is geometry, and both halves must see the same clouds.
 */
export const NEUTRAL_SKY_SETTINGS: Readonly<{
    cloudSeed: 7;
    horizonColor: number[];
    horizonScattering: 0.5;
    sunGlowStrength: 0.6;
    zenithColor: number[];
}>;
/** Post. Pipeline stays enabled at zero strength — same cost, no grade. */
export const NEUTRAL_POST_SETTINGS: Readonly<{
    features: Readonly<{
        bloom: false;
        colorGrade: false;
        enabled: true;
        verticalGrade: false;
        vignette: false;
    }>;
    parameters: Readonly<{
        bloomStrength: 0;
        bottomDark: 0;
        contrast: 1;
        exposure: 1;
        saturation: 1;
        strength: 0;
        topLight: 0;
        vignetteStrength: 0;
        warmth: 0;
    }>;
}>;
/** Portable manufactured-surface document, for the bundle's `{ document }` payload. */
export const NEUTRAL_MANUFACTURED_SURFACE_DOCUMENT: Readonly<{
    description: string;
    id: string;
    label: string;
    settings: {};
    type: string;
    version: number;
}>;
/**
 * Per-slot coverage. `authored` slots gained a neutral counterpart here;
 * `shipped` already had one; `inherited` resolves to schema defaults because
 * the domain has no style registry; `excluded` has no usable neutral and says
 * why. Nothing is silently missing.
 */
export const NEUTRAL_STYLE_SLOT_COVERAGE: Readonly<{
    cloud: Readonly<{
        abSafe: true;
        coverage: "inherited";
        note: "There is no cloud style registry — the slot resolves to SkyParams schema defaults for every style, neutral included (see D19-006). Schema defaults ARE the un-stylized cloud.";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    environment: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "environment";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    flowerShader: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "vegetationShader";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    grass: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "grass";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    grassShader: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "vegetationShader";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    groundShader: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "groundShader";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    lighting: Readonly<{
        abSafe: false;
        coverage: "excluded";
        note: "Deliberately unpaired. A lighting style owns sun intensity, sun path and the day cycle, so a neutral lighting style changes LIGHT TRANSFORMS — which §11 requires both halves of a comparison to share. Neutral lighting would be unusable in the only construction it exists for.";
    }>;
    manufacturedSurface: Readonly<{
        abSafe: true;
        coverage: "authored";
        note: "Carried as an inline document: the manufactured-surface slot has no style registry, so a { style } payload resolves to defaults regardless of the id.";
        payload: Readonly<{
            document: Readonly<{
                description: string;
                id: string;
                label: string;
                settings: {};
                type: string;
                version: number;
            }>;
        }>;
        registrar: any;
    }>;
    post: Readonly<{
        abSafe: false;
        coverage: "authored";
        note: "Registered and usable, but not part of an A/B: post runs over the composited frame, after both scissored renders, so it cannot differ per half. Both halves must share it — which §11 also requires (\"stable exposure\").";
        payload: Readonly<{
            style: "neutral";
        }>;
        registrar: "post";
    }>;
    rock: Readonly<{
        abSafe: true;
        coverage: "shipped";
        note: "Pre-existing — registered by src/rock-shader/rockShaderSettings.js. The only domain that already had a neutral preset.";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    sky: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "sky";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    toon: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "toon";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    treeShader: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "vegetationShader";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
    water: Readonly<{
        abSafe: true;
        coverage: "authored";
        registrar: "water";
        payload: Readonly<{
            style: "neutral";
        }>;
    }>;
}>;
/**
 * The neutral counterpart of `CALL_ME_SENSEI_STYLE_BUNDLE`. Same slot ids,
 * minus the two that cannot honestly carry a neutral half — so applying this
 * bundle and then the Call Me Sensei bundle to the same scene produces a
 * symmetric A/B in which only material treatment changed.
 */
export const NEUTRAL_STYLE_BUNDLE: any;
/** The slot ids `NEUTRAL_STYLE_BUNDLE` actually carries. */
export const NEUTRAL_STYLE_SLOT_IDS: readonly string[];
/**
 * Keys per domain that control geometry, density, placement, tiling, masking or
 * motion. A neutral preset that touched one of these would make the two halves
 * structurally different, which is the failure this whole pass exists to
 * prevent. Used by {@link auditNeutralStyleShadingOnly}.
 */
export const NEUTRAL_STYLE_NON_SHADING_KEYS: Readonly<{
    grass: readonly string[];
    groundShader: readonly string[];
    sky: readonly string[];
}>;
/**
 * Resolved neutral toon settings — handy for `applyToonShader(root, { settings })`
 * when a host wants the neutral half without going through a bundle.
 */
export const NEUTRAL_TOON_RESOLVED_SETTINGS: Readonly<{
    preset: string;
    presetDescription: string;
    presetLabel: string;
}>;
/** Resolved neutral environment settings, for direct `applyEnvironmentShader` use. */
export const NEUTRAL_ENVIRONMENT_RESOLVED_SETTINGS: Readonly<{
    features: any;
    parameters: any;
}>;
/** Resolved neutral manufactured-surface settings. */
export const NEUTRAL_MANUFACTURED_SURFACE_RESOLVED_SETTINGS: Readonly<{}>;
