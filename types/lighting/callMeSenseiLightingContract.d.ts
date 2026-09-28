export function createCallMeSenseiSkyLightProbe({ contract, name, }?: {
    contract?: any;
    name?: string;
}): LightProbe;
export function updateCallMeSenseiSkyLightProbe(probe: any, { color, energy, intensity, }?: {
    color?: number[];
    energy?: number;
    intensity?: any;
}): any;
export function configureCallMeSenseiDirectionalLight(light: any, { contract, }?: {
    contract?: any;
}): any;
export const CALL_ME_SENSEI_LIGHTING_CONTRACT: any;
import { LightProbe } from 'three';
