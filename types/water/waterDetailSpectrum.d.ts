export class WaterDetailSpectrum {
    size: number;
    signature: string;
    time: number;
    bands: {
        length: number;
        baseLength: number;
    }[];
    configure(settings: any): void;
    update(time: any): void;
    sample(x: any, z: any, out: any): any;
    dispose(): void;
}
