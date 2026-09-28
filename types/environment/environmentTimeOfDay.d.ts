export function sampleEnvironmentTimeOfDay(hour: any): {
    accentScale: number;
    ambientScale: number;
    backdropPeriod: string;
    fogColor: THREE.Color;
    hour: number;
    lampScale: number;
    skyGroundTint: THREE.Color;
    skyTopTint: THREE.Color;
    sunColor: THREE.Color;
    sunIntensity: number;
    sunSourceRatios: {
        x: number;
        y: number;
        z: number;
    };
};
export function applyEnvironmentTimeOfDay(state: any, { backdrop, environmentRoot, lampRig, sunRig, sunIntensityScale, }?: {
    backdrop?: any;
    environmentRoot?: any;
    lampRig?: any;
    sunRig?: any;
    sunIntensityScale?: number;
}): void;
import * as THREE from 'three';
