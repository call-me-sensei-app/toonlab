/** Creates the portable profile consumed by the transparent-material lab. */
export function createTransparentProfile(input?: {}): {
    type: string;
    version: number;
    id: string;
    label: string;
    settings: {
        attenuationColor: any;
        attenuationDistance: any;
        clearcoat: any;
        clearcoatRoughness: any;
        color: any;
        depthWrite: boolean;
        envMapIntensity: any;
        ior: any;
        metalness: any;
        opacity: any;
        roughness: any;
        thickness: any;
        transmission: any;
    };
};
/** Parses JSON or an object without accepting future schema versions. */
export function parseTransparentProfile(input: any): {
    errors: string[];
    ok: boolean;
    value?: undefined;
} | {
    errors: any[];
    ok: boolean;
    value: {
        type: string;
        version: number;
        id: string;
        label: string;
        settings: {
            attenuationColor: any;
            attenuationDistance: any;
            clearcoat: any;
            clearcoatRoughness: any;
            color: any;
            depthWrite: boolean;
            envMapIntensity: any;
            ior: any;
            metalness: any;
            opacity: any;
            roughness: any;
            thickness: any;
            transmission: any;
        };
    };
};
export function serializeTransparentProfile(input: any): string;
export const TRANSPARENT_PROFILE_TYPE: "toonlab/transparent-material-profile";
export const TRANSPARENT_PROFILE_VERSION: 1;
export const DEFAULT_TRANSPARENT_PROFILE: Readonly<{
    type: "toonlab/transparent-material-profile";
    version: 1;
    id: "clear_stylized_glass";
    label: "Clear Stylized Glass";
    settings: Readonly<{
        attenuationColor: "#78c7d8";
        attenuationDistance: 3.5;
        clearcoat: 0.72;
        clearcoatRoughness: 0.12;
        color: "#bdebf2";
        depthWrite: false;
        envMapIntensity: 1.15;
        ior: 1.45;
        metalness: 0;
        opacity: 0.58;
        roughness: 0.12;
        thickness: 0.75;
        transmission: 0.92;
    }>;
}>;
