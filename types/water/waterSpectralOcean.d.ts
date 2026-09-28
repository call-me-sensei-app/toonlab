export function inverseFFT2D(real: any, imaginary: any, size: any): void;
export class WaterSpectralOcean {
    constructor({ resolution, seed }?: {
        resolution?: number;
        seed?: number;
    });
    resolution: number;
    seed: number;
    bands: any[];
    signature: string;
    time: number;
    configure(settings: any, depth?: number, minWavelength?: number): void;
    peakLength: number;
    rms: number;
    update(time: any): void;
    sample(x: any, z: any, minWavelength?: number): number;
}
