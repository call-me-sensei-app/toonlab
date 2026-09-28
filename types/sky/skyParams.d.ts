/**
 * Fills a partial SkyParams out to a complete, clamped one. Anything absent
 * falls back to `base` when given, otherwise to the schema defaults.
 */
export function createSkyParams(input?: {}, base?: any): {
    atmosphere: any;
    cloud: any;
    godRays: {};
    nightSky: {};
    noise: {
        weather: {};
    };
    sun: any;
    time: {};
};
/** Validates and normalizes a SkyParams object or JSON string. */
export function validateSkyParams(input: any, base?: any): {
    errors: any[];
    ok: boolean;
    value: {
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    };
    warnings: any[];
};
/** Validates and normalizes a portable SkyParams document or JSON string. */
export function validateSkyParamsDocument(input: any): {
    errors: any[];
    ok: boolean;
    value: {
        description: string;
        id: string;
        label: string;
        params: any;
        type: string;
        version: number;
    };
    warnings: any[];
};
/**
 * Builds a canonical document, throwing on anything the validator rejects. The
 * raw definition is what gets validated — a hex colour, a non-finite number, or
 * a structurally wrong block reaches the validator and raises.
 */
export function createSkyParamsDocument(id: any, definition?: {}): {
    description: string;
    id: string;
    label: string;
    params: any;
    type: string;
    version: number;
};
/**
 * Deep-copies params into a JSON-safe shape. Colors become `[r, g, b]` triples
 * so linear values above 1 survive the trip; `JSON.stringify` on a THREE.Color
 * would collapse it to an sRGB hex integer.
 *
 * Derived fields are written too, so a document is readable without recomputing
 * them. Reloading one is warning-clean because the validator only reports a
 * supplied derived value that *disagrees* with the rule.
 */
export function toSerializableSkyParams(params: any): {
    atmosphere: {
        style: {
            enabled: any;
            amount: any;
            palette: {
                [k: string]: any;
            };
            timePalette: {
                [k: string]: any;
            };
            starField: {
                [k: string]: any;
            };
        };
    };
    cloud: {
        style: {
            enabled: any;
            amount: any;
            tone: {
                [k: string]: any;
            };
            blueShadow: {
                [k: string]: any;
            };
            shadowWash: {
                [k: string]: any;
            };
            innerPaint: {
                [k: string]: any;
            };
            whiteTop: {
                [k: string]: any;
            };
            topLight: {
                [k: string]: any;
            };
            surfaceLight: {
                [k: string]: any;
            };
            lightBlend: {
                [k: string]: any;
            };
            timePalette: {
                [k: string]: any;
            };
        };
    };
    godRays: {
        [k: string]: any;
    };
    nightSky: {
        [k: string]: any;
    };
    noise: {
        weather: {
            profile: {
                [k: string]: any;
            };
        };
    };
    sun: {
        [k: string]: any;
    };
    time: {
        moon: {
            [k: string]: any;
        };
    };
};
export function serializeSkyParams(params: any, { pretty }?: {
    pretty?: boolean;
}): string;
export function serializeSkyParamsDocument(idOrDocument: any, definition?: {}, { pretty }?: {
    pretty?: boolean;
}): string;
export const SKY_PARAMS_DOCUMENT_TYPE: "toonlab/sky-params";
export const SKY_PARAMS_SCHEMA_VERSION: 9;
/**
 * Field metadata for the whole SkyParams document. A node is a field descriptor
 * when it carries a `type`; otherwise it is a nested block of descriptors.
 */
export const SKY_PARAMS_FIELD_SCHEMA: Readonly<{
    atmosphere: Readonly<{
        style: Readonly<{
            palette: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                zenithColor: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                horizonColor: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                horizonBlend: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                saturation: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                contrast: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                brightness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            timePalette: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                morningEnabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                morningZenith: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                morningHorizon: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                morningAmount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                morningFill: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                eveningEnabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                eveningZenith: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                eveningHorizon: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                eveningAmount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                eveningFill: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                nightEnabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                nightZenith: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                nightHorizon: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                nightAmount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                nightFill: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                nightStars: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            starField: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                amount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                pointThreshold: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                pointSoftness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                diffuseStrength: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                pointBrightness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            enabled: Readonly<{
                derived: false;
                derive: any;
                description: any;
                fold: any;
                integer: false;
                label: any;
                limit: Readonly<{
                    max: 1;
                    min: 0;
                }>;
                type: "boolean";
                unit: "";
                uniform: false;
                value: any;
                wrap: any;
            }>;
            amount: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
    }>;
    cloud: Readonly<{
        style: Readonly<{
            tone: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                shadowColor: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                midColor: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                lightColor: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                shadowPoint: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                lightPoint: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                softness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                shadowLift: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                highlightCompression: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                brightness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            blueShadow: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                color: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                amount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                range: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                softness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            shadowWash: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                lift: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                detail: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                blend: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            innerPaint: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                amount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                edgeKeep: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                edgeBlend: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            whiteTop: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                color: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                amount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                area: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                softness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                detail: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            topLight: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                amount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            surfaceLight: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                amount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            lightBlend: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                bottomColor: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                middleColor: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                amount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                balance: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                softness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                detail: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            timePalette: Readonly<{
                enabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                morningEnabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                morningTop: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                morningBottom: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                morningAmount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                morningDetail: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                morningBrightness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                eveningEnabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                eveningTop: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                eveningBottom: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                eveningAmount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                eveningDetail: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                eveningBrightness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                nightEnabled: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: 1;
                        min: 0;
                    }>;
                    type: "boolean";
                    unit: "";
                    uniform: false;
                    value: any;
                    wrap: any;
                }>;
                nightTop: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                nightBottom: Readonly<{
                    derived: false;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: false;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: 0;
                    }>;
                    type: "color";
                    unit: "linear RGB";
                    uniform: boolean;
                    value: readonly any[];
                    wrap: any;
                }>;
                nightAmount: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                nightDetail: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                nightContrast: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
                nightBrightness: Readonly<{
                    options: readonly any[];
                    derived: boolean;
                    derive: any;
                    description: any;
                    fold: any;
                    integer: boolean;
                    label: any;
                    limit: Readonly<{
                        max: any;
                        min: any;
                    }>;
                    range: Readonly<{
                        max: any;
                        min: any;
                        step: any;
                    }>;
                    type: "number";
                    unit: any;
                    uniform: boolean;
                    value: any;
                    wrap: readonly any[];
                }>;
            }>;
            enabled: Readonly<{
                derived: false;
                derive: any;
                description: any;
                fold: any;
                integer: false;
                label: any;
                limit: Readonly<{
                    max: 1;
                    min: 0;
                }>;
                type: "boolean";
                unit: "";
                uniform: false;
                value: any;
                wrap: any;
            }>;
            amount: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
        cirrus: Readonly<{
            scale: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            strength: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
        fade: Readonly<{
            hazeDensityScale: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            horizonMeltStart: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            horizonMeltEnd: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            maxMarchDist: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
        haze: Readonly<{
            density: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            scale: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
        lighting: Readonly<{
            scatteringAlbedo: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            powderStrength: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            ambientIntensity: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            groundBounceAlbedo: Readonly<{
                derived: false;
                derive: any;
                description: any;
                fold: any;
                integer: false;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: 0;
                }>;
                type: "color";
                unit: "linear RGB";
                uniform: boolean;
                value: readonly any[];
                wrap: any;
            }>;
            baseShadowStrength: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            baseShadowHeight: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            moonGain: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
        shape: Readonly<{
            altitude: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            thickness: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            coverage: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            density: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            baseScale: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            baseStrength: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            weatherScale: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            erosionScaleBaseMultiplier: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            erosionShape: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            erosionStrengthBase: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            erosionStrengthPeak: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            edgeSoftness: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            edgeSoftnessFalloff: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            baseWeatherStrength: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            baseWeatherHeightStart: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            baseWeatherHeightEnd: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            horizonCoverageAmount: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            horizonCoverageStart: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            horizonCoverageRamp: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
        wind: Readonly<{
            heading: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            speed: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            evolutionSpeed: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            skew: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
    }>;
    godRays: Readonly<{}>;
    nightSky: Readonly<{}>;
    noise: Readonly<{
        weather: Readonly<{
            profile: Readonly<{}>;
            resolution: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            seed: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
    }>;
    sun: Readonly<{
        elevation: Readonly<{
            options: readonly any[];
            derived: boolean;
            derive: any;
            description: any;
            fold: any;
            integer: boolean;
            label: any;
            limit: Readonly<{
                max: any;
                min: any;
            }>;
            range: Readonly<{
                max: any;
                min: any;
                step: any;
            }>;
            type: "number";
            unit: any;
            uniform: boolean;
            value: any;
            wrap: readonly any[];
        }>;
        azimuth: Readonly<{
            options: readonly any[];
            derived: boolean;
            derive: any;
            description: any;
            fold: any;
            integer: boolean;
            label: any;
            limit: Readonly<{
                max: any;
                min: any;
            }>;
            range: Readonly<{
                max: any;
                min: any;
                step: any;
            }>;
            type: "number";
            unit: any;
            uniform: boolean;
            value: any;
            wrap: readonly any[];
        }>;
        intensity: Readonly<{
            options: readonly any[];
            derived: boolean;
            derive: any;
            description: any;
            fold: any;
            integer: boolean;
            label: any;
            limit: Readonly<{
                max: any;
                min: any;
            }>;
            range: Readonly<{
                max: any;
                min: any;
                step: any;
            }>;
            type: "number";
            unit: any;
            uniform: boolean;
            value: any;
            wrap: readonly any[];
        }>;
        color: Readonly<{
            derived: false;
            derive: any;
            description: any;
            fold: any;
            integer: false;
            label: any;
            limit: Readonly<{
                max: any;
                min: 0;
            }>;
            type: "color";
            unit: "linear RGB";
            uniform: boolean;
            value: readonly any[];
            wrap: any;
        }>;
        discSize: Readonly<{
            options: readonly any[];
            derived: boolean;
            derive: any;
            description: any;
            fold: any;
            integer: boolean;
            label: any;
            limit: Readonly<{
                max: any;
                min: any;
            }>;
            range: Readonly<{
                max: any;
                min: any;
                step: any;
            }>;
            type: "number";
            unit: any;
            uniform: boolean;
            value: any;
            wrap: readonly any[];
        }>;
    }>;
    time: Readonly<{
        moon: Readonly<{
            phase: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            intensity: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            discBrightness: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            angularSize: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
            color: Readonly<{
                derived: false;
                derive: any;
                description: any;
                fold: any;
                integer: false;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: 0;
                }>;
                type: "color";
                unit: "linear RGB";
                uniform: boolean;
                value: readonly any[];
                wrap: any;
            }>;
            ambient: Readonly<{
                options: readonly any[];
                derived: boolean;
                derive: any;
                description: any;
                fold: any;
                integer: boolean;
                label: any;
                limit: Readonly<{
                    max: any;
                    min: any;
                }>;
                range: Readonly<{
                    max: any;
                    min: any;
                    step: any;
                }>;
                type: "number";
                unit: any;
                uniform: boolean;
                value: any;
                wrap: readonly any[];
            }>;
        }>;
        time: Readonly<{
            options: readonly any[];
            derived: boolean;
            derive: any;
            description: any;
            fold: any;
            integer: boolean;
            label: any;
            limit: Readonly<{
                max: any;
                min: any;
            }>;
            range: Readonly<{
                max: any;
                min: any;
                step: any;
            }>;
            type: "number";
            unit: any;
            uniform: boolean;
            value: any;
            wrap: readonly any[];
        }>;
        autoAdvanceSecondsPerDay: Readonly<{
            options: readonly any[];
            derived: boolean;
            derive: any;
            description: any;
            fold: any;
            integer: boolean;
            label: any;
            limit: Readonly<{
                max: any;
                min: any;
            }>;
            range: Readonly<{
                max: any;
                min: any;
                step: any;
            }>;
            type: "number";
            unit: any;
            uniform: boolean;
            value: any;
            wrap: readonly any[];
        }>;
        latitude: Readonly<{
            options: readonly any[];
            derived: boolean;
            derive: any;
            description: any;
            fold: any;
            integer: boolean;
            label: any;
            limit: Readonly<{
                max: any;
                min: any;
            }>;
            range: Readonly<{
                max: any;
                min: any;
                step: any;
            }>;
            type: "number";
            unit: any;
            uniform: boolean;
            value: any;
            wrap: readonly any[];
        }>;
        azimuth: Readonly<{
            options: readonly any[];
            derived: boolean;
            derive: any;
            description: any;
            fold: any;
            integer: boolean;
            label: any;
            limit: Readonly<{
                max: any;
                min: any;
            }>;
            range: Readonly<{
                max: any;
                min: any;
                step: any;
            }>;
            type: "number";
            unit: any;
            uniform: boolean;
            value: any;
            wrap: readonly any[];
        }>;
    }>;
}>;
export const SKY_PARAMS_BLOCK_IDS: readonly string[];
export const DEFAULT_SKY_PARAMS: any;
export const DEFAULT_NOISE_PARAMS: any;
/** Validates and normalizes a SkyParams object or JSON string. */
export function parseSkyParams(input: any, base?: any): {
    errors: any[];
    ok: boolean;
    value: {
        atmosphere: any;
        cloud: any;
        godRays: {};
        nightSky: {};
        noise: {
            weather: {};
        };
        sun: any;
        time: {};
    };
    warnings: any[];
};
/** Validates and normalizes a portable SkyParams document or JSON string. */
export function parseSkyParamsDocument(input: any): {
    errors: any[];
    ok: boolean;
    value: {
        description: string;
        id: string;
        label: string;
        params: any;
        type: string;
        version: number;
    };
    warnings: any[];
};
