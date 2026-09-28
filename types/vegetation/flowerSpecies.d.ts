/**
 * Builds a real 3D head mesh for a species (EZ-Tree ships small flower
 * MODELS; ours are procedural): curved petal planes arranged in rings —
 * `lift` degrees above flat per layer (a daisy ring lies almost flat, a
 * tulip's petals stand up into a cup), species `curl` bowing each petal
 * toward the axis — plus a center dome. Unit size (head diameter ≈ 1,
 * axis = +Z), vertex-colored, ready for a vertexColors toon material.
 *
 * @param {Object} [options] `species` (FLOWER_SPECIES id) and optional
 *   `color` petal override (sRGB triplet or hex).
 * @returns {THREE.BufferGeometry} merged head geometry.
 */
export function createFlowerHeadGeometry({ species, color }?: any): THREE.BufferGeometry;
/**
 * Builds a 128×128 head sprite for a species (or a hand-drawn petal
 * outline). `petal.preset` is a FLOWER_SPECIES id or 'custom' (with
 * `petal.outline`); `color` overrides the species petal color (sRGB triplet
 * or hex — falls back to the species default when null).
 */
export function createFlowerHeadTexture({ color, petal }: {
    color: any;
    petal: any;
}): THREE.CanvasTexture<HTMLCanvasElement>;
export const FLOWER_SPECIES: readonly ({
    color: number[];
    height: number;
    icon: string;
    headDiameter: number;
    curl: number;
    faceUp: number;
    id: string;
    label: string;
    layers: ({
        count: number;
        lift: number;
        shape: string;
        width: number;
        offset?: undefined;
        shade?: undefined;
    } | {
        count: number;
        lift: number;
        offset: number;
        shade: number;
        shape: string;
        width: number;
    })[];
    center?: undefined;
} | {
    center: {
        color: string;
        radius: number;
    };
    color: number[];
    height: number;
    icon: string;
    headDiameter: number;
    curl: number;
    faceUp: number;
    id: string;
    label: string;
    layers: ({
        count: number;
        lift: number;
        shape: string;
        width: number;
        offset?: undefined;
        scale?: undefined;
        shade?: undefined;
    } | {
        count: number;
        lift: number;
        offset: number;
        scale: number;
        shade: number;
        shape: string;
        width: number;
    })[];
} | {
    color: number[];
    height: number;
    icon: string;
    headDiameter: number;
    curl: number;
    faceUp: number;
    id: string;
    label: string;
    layers: ({
        count: number;
        lift: number;
        shape: string;
        width: number;
        offset?: undefined;
        scale?: undefined;
        shade?: undefined;
    } | {
        count: number;
        lift: number;
        offset: number;
        scale: number;
        shade: number;
        shape: string;
        width: number;
    })[];
    center?: undefined;
})[];
import * as THREE from 'three';
