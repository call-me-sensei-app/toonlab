export function waterArrayUniformEntry(node: any): {
    node: any;
    value: any;
};
export function resolveWaterArrayUniformNode(entry: any): any;
/**
 * Creates the water surface NodeMaterial.
 *
 * flags:
 * - waveCount        WATER_WAVE_COUNT
 * - qualityLevel     WATER_QUALITY (0/1/2)
 * - detailOctaves    WATER_DETAIL_OCTAVES
 * - foamOctaves      WATER_FOAM_OCTAVES
 * - shoaling         WATER_SHOALING (aBedHeight attribute present)
 */
export function createWaterNodeMaterial({ waveCount, qualityLevel, detailOctaves, foamOctaves, shoaling, dynamics, }?: {
    qualityLevel?: number;
    detailOctaves?: number;
    foamOctaves?: number;
    shoaling?: boolean;
    dynamics?: boolean;
}): NodeMaterial;
import { NodeMaterial } from 'three/webgpu';
