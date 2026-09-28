/** Writes parameter values into a character material's uniforms. */
export function applyCharacterParameters(material: any, params: any): number;
/**
 * Depth-as-colour variant for the depth prepass and the character shadow
 * map: r = window depth, offset by 2 on face pixels (so face receivers can
 * ignore face occluders), alpha-tested like the colour pass.
 */
export function createCharacterDepthVariant(material: any): {
    [x: string]: any;
    setupPosition(builder: any): any;
};
/** White coverage mask variant (character-aware post effects). */
export function createCharacterMaskVariant(material: any): {
    [x: string]: any;
    setupPosition(builder: any): any;
};
/**
 * Builds a character material.
 *
 * - `params`: uniform values (characterParameters.js plus per-material
 *   inputs such as `baseColor`); every key becomes a uniform.
 * - `features`: graph-build gates and textures — `role`, `outline`,
 *   `baseMap`, `roleWeights` ('attribute' | 'mask'), `roleMaskMap`,
 *   `bake` ({ any, faceUv, occlusion, detail }), `faceMap`,
 *   `faceMapCoords` ('bake' | 0 | 1), `noseMark`, `lightingMap`,
 *   `lightingMapUv`, `shadeOverride`, `shadeMap`, `toneOverride`,
 *   `rampMap`, `rampMapDecoded`, `specularMask`, `maps` (normalMap, aoMap,
 *   emissiveMap, matcapMap, detailMap, roughnessMap, metalnessMap,
 *   specularColorMap), `emissive`, `sticker` ({ map, uvChannel }),
 *   `vertexColors`, `outlineWidthMap`, `vertexColorWidth`,
 *   `outlineColorOverride`, `overHairFeature`, `materialRole`, `cutout`
 *   (alpha-tested), `dither` (screen-door fade compiled in).
 * - `state`: the character's shared state (characterState.js).
 */
export function createToonCharacterMaterial({ features, params, state, side }: {
    features: any;
    params: any;
    state: any;
    side?: 2;
}): ToonCharacterNodeMaterial;
declare const ToonCharacterNodeMaterial_base: {
    new (): {
        [x: string]: any;
        setupPosition(builder: any): any;
    };
    [x: string]: any;
};
/**
 * Node material class of converted characters. `viewOffset(positionView)`,
 * when set, displaces the view-space position after skinning (outline hulls,
 * features drawn over the bangs) on every backend.
 */
export class ToonCharacterNodeMaterial extends ToonCharacterNodeMaterial_base {
    static get type(): string;
    constructor(parameters: any);
    isToonCharacterMaterial: boolean;
    lights: boolean;
    viewOffset: any;
    setupPositionView(builder: any): any;
}
export {};
