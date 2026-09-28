/**
 * Snapshot of everything the §11 contract requires to be equal across both
 * halves: camera matrices, light transforms, exposure and render state, plus
 * the animation clock of any registered mixer. Compared before and after a
 * composite render — if the wipe moved any of them, the A/B is not honest.
 */
export function captureComparisonFrameState({ camera, mixers, renderer, scene }: {
    camera: any;
    mixers?: any[];
    renderer: any;
    scene: any;
}): {
    camera: {
        far: number;
        fov: number;
        matrixWorld: any;
        matrixWorldInverse: any;
        near: number;
        projectionMatrix: any;
        zoom: number;
    };
    lights: any[];
    mixers: {
        time: number;
    }[];
    renderState: {
        outputColorSpace: any;
        shadowMapEnabled: boolean;
        shadowMapType: any;
        toneMapping: any;
        toneMappingExposure: number;
    };
    scene: {
        backgroundIntensity: number;
        environmentIntensity: number;
    };
};
/**
 * Creates a single-load A/B comparison over one scene and one camera.
 *
 * @param {object} options
 * @param {StyleComparisonRenderer} options.renderer
 * @param {THREE.Scene} options.scene
 * @param {THREE.Camera} options.camera
 * @param {'vertical'|'horizontal'} [options.axis='vertical'] Divider orientation.
 *   `vertical` puts the `before` variant on the left; `horizontal` puts it on
 *   the bottom.
 * @param {number} [options.split=0.5] Fraction of the frame showing `before`.
 * @param {{after: string, before: string}} [options.variants]
 * @param {boolean} [options.refreshRenderPasses=true] Call each tracked root's
 *   `userData.toonlabCharacterStyleIntegration.refresh()` after a swap so the
 *   depth prepass / self-shadow target binds the live materials.
 */
export function createStyleComparison({ axis, camera, refreshRenderPasses, renderer, scene, split, variants, }?: {
    renderer: StyleComparisonRenderer;
    scene: THREE.Scene;
    camera: THREE.Camera;
    axis?: "vertical" | "horizontal";
    split?: number;
    variants?: {
        after: string;
        before: string;
    };
    refreshRenderPasses?: boolean;
}): {
    activate: (variantId: string, { force }?: {
        force?: boolean;
    }) => object;
    auditIdentity: () => {
        axis: "vertical" | "horizontal";
        exposureDrift: any;
        frameState: {
            camera: {
                far: number;
                fov: number;
                matrixWorld: any;
                matrixWorldInverse: any;
                near: number;
                projectionMatrix: any;
                zoom: number;
            };
            lights: any[];
            mixers: {
                time: number;
            }[];
            renderState: {
                outputColorSpace: any;
                shadowMapEnabled: boolean;
                shadowMapType: any;
                toneMapping: any;
                toneMappingExposure: number;
            };
            scene: {
                backgroundIntensity: number;
                environmentIntensity: number;
            };
        };
        issues: string[];
        mixerCount: number;
        ok: boolean;
        sharedGeometryNodes: number;
        split: number;
        trackedNodes: number;
        trackedRoots: number;
        variants: any[];
        variantsWithDivergentMaterials: number;
    };
    capture: (variantId: string, { label }?: {
        label?: string;
    }) => {
        id: string;
        label: string;
        materialCount: number;
        nodeCount: number;
    };
    readonly activeVariant: any;
    /** Non-null when exposure or tone mapping moved during the last composite. */
    readonly exposureDrift: any;
    readonly axis: "vertical" | "horizontal";
    readonly camera: THREE.Camera;
    readonly mixers: any[];
    readonly renderer: StyleComparisonRenderer;
    readonly roots: THREE.Object3D<THREE.Object3DEventMap>[];
    readonly scene: THREE.Scene<THREE.Object3DEventMap>;
    readonly split: number;
    readonly variantIds: any[];
    readonly variants: {
        after: string;
        before: string;
    };
    dispose(): void;
    render: ({ split: splitOverride, target }?: StyleComparisonRenderOptions) => StyleComparisonRenderResult;
    renderVariant: (variantId: string, { target }?: StyleComparisonVariantRenderOptions) => void;
    /** @type {(fraction: number, size?: StyleComparisonSize) => StyleComparisonRect} */
    scissorRectFor: (fraction: number, size?: StyleComparisonSize) => StyleComparisonRect;
    /** @param {StyleComparisonAxis} next @returns {StyleComparisonAxis} */
    setAxis(next: StyleComparisonAxis): StyleComparisonAxis;
    /** @param {number} next @returns {number} */
    setSplit(next: number): number;
    /**
     * @param {Partial<StyleComparisonVariantPair>} [pair]
     * @returns {StyleComparisonVariantPair}
     */
    setVariants({ after, before }?: Partial<StyleComparisonVariantPair>): StyleComparisonVariantPair;
    track: (root: THREE.Object3D, { mixer }?: {
        mixer?: THREE.AnimationMixer | null;
    }) => () => void;
    trackState: (id: string, { apply, capture }: {
        apply: (value: unknown) => void;
        capture: () => unknown;
    }) => () => void;
};
/**
 * Proves that a comparison is a true renderer split of one framing, not two
 * separately framed images — and that everything outside the treated subject
 * is bit-identical between the halves.
 *
 * The five assertions:
 *
 *  1. `split = 0` is bit-identical to a full-frame render of the `after`
 *     variant.
 *  2. `split = 1` is bit-identical to a full-frame render of the `before`
 *     variant.
 *  3. At any intermediate split, the region inside the scissor is bit-identical
 *     to the SAME region of the `before` full frame, and the region outside it
 *     is bit-identical to the same region of the `after` full frame. A pixel at
 *     (x, y) in the wipe therefore equals that pixel in a full-frame render of
 *     its own variant — which is only possible if both halves share one camera.
 *  4. Camera matrices, light transforms, exposure, tone mapping, shadow state
 *     and every registered animation clock are unchanged by the composite
 *     render.
 *  5. Pixels that differ between the two variants lie inside the region the
 *     tracked subject affects (measured by rendering with the subject hidden),
 *     so nothing outside the intended material treatment moved.
 *
 * Deterministic and reusable: it renders into its own render target, so it does
 * not depend on canvas size, page compositing or screenshot timing. This is the
 * routine the filler register's equivalence test calls.
 */
export function verifyStyleComparisonIdentity(comparison: any, { height, onStage, splits, tolerance, width, }?: {
    height?: number;
    onStage?: any;
    splits?: number[];
    tolerance?: number;
    width?: number;
}): Promise<{
    checks: ({
        changedPixels: number;
        description: string;
        differingPixels: number;
        id: string;
        ok: boolean;
        totalPixels: number;
        treatedPixels: number;
        differences?: undefined;
    } | {
        description: string;
        differences: any;
        id: string;
        ok: any;
        changedPixels?: undefined;
        differingPixels?: undefined;
        totalPixels?: undefined;
        treatedPixels?: undefined;
    })[];
    ok: boolean;
    resolution: {
        height: number;
        width: number;
    };
    structural: any;
    variants: {
        after: any;
        before: any;
    };
}>;
/** Split axes. `vertical` is a vertical divider; `horizontal` is a horizontal one. */
export const STYLE_COMPARISON_AXES: readonly string[];
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 *
 * @typedef {object} StyleComparisonRenderer
 * @property {(scene: THREE.Object3D, camera: THREE.Camera) => unknown} render
 * @property {(x: number, y: number, width: number, height: number) => void} setScissor
 * @property {(enabled: boolean) => void} setScissorTest
 * @property {(target: THREE.Vector4) => THREE.Vector4} getScissor
 * @property {() => boolean} getScissorTest
 * @property {(target: THREE.RenderTarget|null) => void} setRenderTarget
 * @property {() => THREE.RenderTarget|null} getRenderTarget
 * @property {(target: THREE.Vector2|THREE.Vector4) => unknown} getSize
 * @property {(color: THREE.Color) => THREE.Color} getClearColor
 * @property {boolean} autoClear
 * @property {boolean} autoClearColor
 * @property {boolean} autoClearDepth
 * @property {boolean} autoClearStencil
 * @property {number} toneMappingExposure
 *
 * @typedef {'horizontal'|'vertical'} StyleComparisonAxis
 *
 * @typedef {THREE.RenderTarget|null} StyleComparisonTarget
 *
 * @typedef {object} StyleComparisonRect
 * @property {number} height
 * @property {number} width
 * @property {number} x
 * @property {number} y
 *
 * @typedef {object} StyleComparisonSize
 * @property {number} height
 * @property {number} width
 *
 * @typedef {object} StyleComparisonVariantPair
 * @property {string} after Variant rendered full-frame.
 * @property {string} before Variant rendered into the scissored region.
 *
 * @typedef {object} StyleComparisonRenderOptions
 * @property {number} [split] Fraction of the frame showing `before`, 0..1.
 *   Defaults to the comparison's current split.
 * @property {StyleComparisonTarget} [target] Render into this target instead of
 *   the canvas. Omit for the canvas.
 *
 * @typedef {object} StyleComparisonVariantRenderOptions
 * @property {StyleComparisonTarget} [target]
 *
 * @typedef {object} StyleComparisonRenderResult
 * @property {number} fraction
 * @property {StyleComparisonSize} size
 */
/**
 * Child meshes a style treatment generates on top of the subject. They exist
 * only in the styled variant, so a variant captured before the style was
 * applied does not know them and must hide — never remove — them.
 */
export const STYLE_COMPARISON_GENERATED_NODE_FLAGS: readonly string[];
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonRenderer = {
    render: (scene: THREE.Object3D, camera: THREE.Camera) => unknown;
    setScissor: (x: number, y: number, width: number, height: number) => void;
    setScissorTest: (enabled: boolean) => void;
    getScissor: (target: THREE.Vector4) => THREE.Vector4;
    getScissorTest: () => boolean;
    setRenderTarget: (target: THREE.RenderTarget | null) => void;
    getRenderTarget: () => THREE.RenderTarget | null;
    getSize: (target: THREE.Vector2 | THREE.Vector4) => unknown;
    getClearColor: (color: THREE.Color) => THREE.Color;
    autoClear: boolean;
    autoClearColor: boolean;
    autoClearDepth: boolean;
    autoClearStencil: boolean;
    toneMappingExposure: number;
};
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonAxis = "horizontal" | "vertical";
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonTarget = THREE.RenderTarget | null;
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonRect = {
    height: number;
    width: number;
    x: number;
    y: number;
};
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonSize = {
    height: number;
    width: number;
};
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonVariantPair = {
    /**
     * Variant rendered full-frame.
     */
    after: string;
    /**
     * Variant rendered into the scissored region.
     */
    before: string;
};
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonRenderOptions = {
    /**
     * Fraction of the frame showing `before`, 0..1.
     * Defaults to the comparison's current split.
     */
    split?: number;
    /**
     * Render into this target instead of
     * the canvas. Omit for the canvas.
     */
    target?: StyleComparisonTarget;
};
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonVariantRenderOptions = {
    target?: StyleComparisonTarget;
};
/**
 * The renderer surface this module needs. Declared structurally rather than as
 * `WebGPURenderer`, because that class lives in the `three/webgpu` entry point
 * and is not exported from `three` — naming it here would make the generated
 * declaration unresolvable and silently demote this module to a permissive
 * `any` contract. WebGPURenderer (either backend) and WebGLRenderer both
 * satisfy it.
 */
export type StyleComparisonRenderResult = {
    fraction: number;
    size: StyleComparisonSize;
};
import * as THREE from 'three';
