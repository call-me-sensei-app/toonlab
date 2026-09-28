export function normalizeSkyColorParams(path: any, input: any, fallback: any, report: any): {};
export function skyColorParamsToLive(params: any): any;
export function toSerializableSkyColorParams(params: any): {
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
export function createSkyColorParams(params?: any): SkyColorParams;
/** Applies the optional palettes to physical sky radiance, leaving the sun separate. */
export function applySkyColorNode(radiance: any, viewDirection: any, style?: any, timeOfDay?: any): import("three/webgpu").Node<"vec3">;
export const SKY_COLOR_MODULE_IDS: readonly string[];
export const SKY_COLOR_FIELD_SCHEMA: Readonly<{
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
export const DEFAULT_SKY_COLOR_PARAMS: any;
/** Live uniform-backed state consumed by the atmosphere shader. */
export class SkyColorParams {
    constructor(params?: any);
    master: SkyColorBlock;
    palette: SkyColorBlock;
    timePalette: SkyColorBlock;
    starField: SkyColorBlock;
    get enabled(): any;
    get amount(): any;
    applyParams(params?: {}): this;
    toParams(): {
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
}
declare class SkyColorBlock {
    constructor(fields: any, params: any);
    setNormalized(params: any): this;
    toParams(): {
        [k: string]: any;
    };
}
export {};
