export function createWaterSplashDropletsNodeMaterial(): NodeMaterial;
/**
 * options.waves     null | { wavesA, wavesB, waveCount } — the owning surface
 *                   material's wave uniform nodes (WATER_SHEET_WAVES analog).
 * options.previous  uniform-node map of a previous sheet material; uniforms
 *                   are reused so values persist across the rebuild.
 */
export function createWaterSplashSheetsNodeMaterial({ waves, previous }?: {
    waves?: any;
    previous?: any;
}): NodeMaterial;
import { NodeMaterial } from 'three/webgpu';
