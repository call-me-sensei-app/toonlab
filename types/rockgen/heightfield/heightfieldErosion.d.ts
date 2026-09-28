export function erodeHeightfield(options: any): {
    eroded: Float32Array;
    flow: Float32Array;
    erosionMask: Float32Array;
    depositionMask: Float32Array;
    sedimentMap: Float32Array;
    slopeMap: Float32Array;
};
export { erodeHeightfieldStylized };
import { erodeHeightfieldStylized } from './stylizedErosionSim.js';
