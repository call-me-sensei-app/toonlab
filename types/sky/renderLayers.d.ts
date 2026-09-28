export function getRenderLayer(name: any): any;
/**
 * Assigns `object` to a layer. `offset` fans several meshes across one layer; a
 * higher offset draws later. Keep it in [0, 10) so the mesh stays in the band.
 */
export function placeInLayer(object: any, layer: any, offset?: number): void;
/**
 * The named layers, in draw order — each layer draws over the ones above it.
 *
 * `list` is the draw list the layer belongs to. `material.transparent` is what
 * actually decides an object's list, and the opaque and transparent lists never
 * interleave, so `order` only sorts within one list. That is why a background
 * mesh left `transparent: true` cannot be pulled back by any order value, and
 * why `placeInLayer` warns about the mismatch instead of silently misplacing it.
 *
 * Orders are spaced 10 apart so `offset` can fan several meshes across one
 * layer without leaking into the next. `sceneTransparent` sits at 0 because
 * that is three.js' default renderOrder — unplaced host content lands there,
 * which is where it belongs.
 */
export const RenderLayer: Readonly<{
    background: Readonly<{
        list: "opaque";
        order: -1000;
    }>;
    backgroundOverlay: Readonly<{
        list: "transparent";
        order: -990;
    }>;
    worldSurface: Readonly<{
        list: "transparent";
        order: -980;
    }>;
    atmosphereOverlay: Readonly<{
        list: "transparent";
        order: -970;
    }>;
    sceneTransparent: Readonly<{
        list: "transparent";
        order: 0;
    }>;
    foreground: Readonly<{
        list: "transparent";
        order: 1000;
    }>;
}>;
/** Layer names in draw order. */
export const RENDER_LAYER_NAMES: readonly string[];
export const RENDER_LISTS: readonly string[];
/** Width of one layer's sort band; `offset` must stay inside it. */
export const RENDER_LAYER_BAND: 10;
export const RENDER_LAYER_USAGE: Readonly<{
    atmosphereOverlay: "An overlay that depth-tests against worldSurface.";
    background: "A full-screen backdrop. Nothing draws behind it.";
    backgroundOverlay: "A blended backdrop that writes no depth.";
    foreground: "Always-on-top overlays — HUD, gizmos.";
    sceneTransparent: "Host glass, particles, and decals.";
    worldSurface: "A transparent surface that writes depth, such as water.";
}>;
