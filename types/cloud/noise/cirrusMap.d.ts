/** Analytic cirrus density in tile coordinates; periodic over u/v + integer. */
export function sampleCloudCirrusDensity(fieldSeed: any, u: any, v: any): number;
/** Bakes a seamlessly tiling single-channel cirrus mask into RGBA8 data. */
export function createCloudCirrusMapData({ width, height, seed, }?: {
    width?: number;
    height?: number;
    seed?: number;
}): {
    data: Uint8Array<ArrayBuffer>;
    fieldSeed: number;
    height: number;
    mean: number;
    seed: number;
    width: number;
};
/** Creates an uncached, filterable cirrus mask. Callers own dispose(). */
export function createCloudCirrusMap(options?: {}): THREE.DataTexture;
/** Cached procedural cirrus mask, shared by systems using the same seed. */
export function getCloudCirrusMap(options?: {}): any;
export function disposeCloudCirrusMaps(): void;
export const CLOUD_CIRRUS_MAP_WIDTH: 1024;
export const CLOUD_CIRRUS_MAP_HEIGHT: 512;
export const CLOUD_CIRRUS_SEED_NAMESPACE: "cloud-cirrus";
import * as THREE from 'three';
