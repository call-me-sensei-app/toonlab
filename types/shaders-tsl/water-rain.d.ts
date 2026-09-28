export function createWaterRainNodeMaterial({ areaSize, fallHeight, speed, streakLength, wind, color, opacity, }?: {
    areaSize?: number;
    fallHeight?: number;
    speed?: number;
    streakLength?: number;
    wind?: number[];
    color?: number[];
    opacity?: number;
}): NodeMaterial;
import { NodeMaterial } from 'three/webgpu';
