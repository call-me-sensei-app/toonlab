/**
 * Fullscreen update material for WaterShoreStateField.
 *
 * `uRegion = (centerX, centerZ, halfWidth, halfDepth)` in world metres.
 * Swash progress/distance are supplied by the CPU so this pass and the visible
 * water can share one event rather than reconstructing separate loop state.
 */
export function createWaterShoreStateSimulationNodeMaterial({ resolutionX, resolutionY, }?: {
    resolutionX?: number;
    resolutionY?: number;
}): NodeMaterial;
import { NodeMaterial } from 'three/webgpu';
