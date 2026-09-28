/**
 * Approximates a black-body color in authoring-space sRGB.
 * The useful range is deliberately clamped to 1,000-40,000 kelvin.
 */
export function colorTemperatureToRgb(temperatureKelvin: any, { clampOutput }?: {
    clampOutput?: boolean;
}): number[];
/** Converts an RGB array, hex color, or temperature/tint object to sRGB. */
export function resolveLightColor(value?: number[]): any;
/** Normalizes author-facing light color metadata into a serializable object. */
export function createLightColor(value?: any): {
    rgb: any;
    temperatureKelvin: number;
    tint: number[];
};
/** Converts luminous flux to intensity for an isotropic point source. */
export function lumensToCandela(lumens: any, solidAngleSteradians?: number): number;
/** Converts candela to luminous flux for a supplied solid angle. */
export function candelaToLumens(candela: any, solidAngleSteradians?: number): number;
/** Solid angle of a cone whose half-angle is `angleRadians`. */
export function coneSolidAngle(angleRadians: any): number;
/** Illuminance in lux from a candela value at a distance in meters. */
export function luxAtDistance(candela: any, distanceMeters: any): number;
/** Approximate luminance for a diffuse rectangular emitter. */
export function lumensToNits(lumens: any, widthMeters?: number, heightMeters?: number): number;
/**
 * Normalizes physical intensity metadata. `artisticMultiplier` remains
 * separate so a look can be tuned without destroying authored units.
 */
export function createLightIntensity(type: any, value?: any): {
    artisticMultiplier: number;
    referenceDistance: number;
    unit: any;
    value: number;
};
/**
 * Resolves portable intensity metadata to the value expected by Three.js.
 * Directional lux, local-light candela, and rect-area nits pass through.
 * Conversions from lumens are geometric approximations, not photometry.
 */
export function resolveThreeLightIntensity(type: any, intensity: any, geometry?: {}): number;
/** Returns the preferred authoring unit for a descriptor type. */
export function getDefaultIntensityUnit(type: any): any;
export const LIGHT_INTENSITY_UNITS: readonly string[];
