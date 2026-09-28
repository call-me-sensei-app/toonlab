export class WaterHydrodynamics {
    constructor({ columns, rows, width, depth, centerX, centerZ, waterLevel, bedHeight, boundary, friction }?: {
        columns?: number;
        rows?: number;
        width?: number;
        depth?: number;
        centerX?: number;
        centerZ?: number;
        waterLevel?: number;
        bedHeight?: () => number;
        boundary?: any;
        friction?: number;
    });
    dx: number;
    dz: number;
    minX: number;
    minZ: number;
    length: number;
    time: number;
    boundaryVolume: number;
    roundoffVolume: number;
    initialVolume: number;
    steps: number;
    foamLifetime: number;
    foamResidueLifetime: number;
    ghost: {
        h: number;
        qx: number;
        qz: number;
        bed: number;
    };
    volume(): number;
    diagnostics(): {
        time: number;
        steps: number;
        volume: number;
        boundaryVolume: number;
        massError: number;
        roundoffVolume: number;
        minDepth: any;
    };
    impulse(x: any, z: any, strength?: number, radius?: number, direction?: any): void;
    face(left: any, right: any, axis: any, dt: any): void;
    boundaryFace(i: any, side: any, axis: any, low: any, dt: any): void;
    advance(duration: any): void;
    step(dt: any): void;
    sampleArray(array: any, x: any, z: any): number;
    sample(x: any, z: any, out?: {}): {};
}
