export function normalizeCloudStyleParams(path: any, input: any, fallback: any, report: any): {};
export function cloudStyleParamsToLive(params: any): any;
export function toSerializableCloudStyleParams(params: any): {
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
export function createCloudStyleParams(params?: any): CloudStyleParams;
export const CLOUD_STYLE_MODULE_IDS: readonly string[];
export const CLOUD_STYLE_FIELD_SCHEMA: Readonly<{
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
export const DEFAULT_CLOUD_STYLE_PARAMS: any;
/** Live uniform-backed style state consumed by the cloud shader. */
export class CloudStyleParams {
    constructor(params?: any);
    master: CloudStyleBlock;
    tone: CloudStyleBlock;
    blueShadow: CloudStyleBlock;
    shadowWash: CloudStyleBlock;
    innerPaint: CloudStyleBlock;
    whiteTop: CloudStyleBlock;
    topLight: CloudStyleBlock;
    surfaceLight: CloudStyleBlock;
    lightBlend: CloudStyleBlock;
    timePalette: CloudStyleBlock;
    get enabled(): any;
    get amount(): any;
    applyParams(params?: {}): this;
    toParams(): {
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
}
declare class CloudStyleBlock {
    constructor(fields: any, params: any);
    setNormalized(params: any): this;
    toParams(): {
        [k: string]: any;
    };
}
export {};
