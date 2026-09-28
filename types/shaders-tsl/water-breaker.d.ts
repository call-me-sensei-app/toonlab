/**
 * options.waveCount    WATER_WAVE_COUNT (must match the shared wave arrays)
 * options.foamOctaves  WATER_FOAM_OCTAVES
 * options.shared       uniform-node map of the owning surface material; the
 *                      SHARABLE subset is adopted by reference.
 * options.previous     uniform-node map of a previous breaker material; own
 *                      (non-shared) uniforms are reused so values persist
 *                      across the attachWaveUniforms rebuild.
 */
export function createWaterBreakerNodeMaterial({ waveCount, foamOctaves, shared, previous, }?: {
    foamOctaves?: number;
    shared?: any;
    previous?: any;
}): NodeMaterial;
import { NodeMaterial } from 'three/webgpu';
