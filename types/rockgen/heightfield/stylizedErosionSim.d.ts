/**
 * Erodes a row-major heightfield with a deterministic drainage/weathering
 * model. Heights are mutated on a copy; the master `strength` blends eroded
 * vs base.
 *
 * @returns {{eroded: Float32Array, flow: Float32Array,
 *   erosionMask: Float32Array, depositionMask: Float32Array,
 *   sedimentMap: Float32Array, slopeMap: Float32Array}}
 */
export function erodeHeightfieldStylized({ width, height, heightmap, params }: {
    width: any;
    height: any;
    heightmap: any;
    params?: {};
}): {
    eroded: Float32Array;
    flow: Float32Array;
    erosionMask: Float32Array;
    depositionMask: Float32Array;
    sedimentMap: Float32Array;
    slopeMap: Float32Array;
};
export const DEFAULT_STYLIZED_EROSION_PARAMS: Readonly<{
    bankDeposition: 0.5;
    depositionRate: 0.26;
    droplets: 40000;
    erosionRadius: 2;
    erosionRate: 0.24;
    evaporation: 0.02;
    flowSharpness: 1.45;
    maxPasses: 14;
    minSlope: 0.01;
    seed: 1;
    sedimentCapacity: 3.2;
    smoothing: 0.05;
    strength: 1;
    talus: 0.6;
    thermalIterations: 28;
    thermalStrength: 0.36;
    valleyWidening: 0.55;
}>;
