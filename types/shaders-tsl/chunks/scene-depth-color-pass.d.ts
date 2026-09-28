/**
 * Create a reusable camera-depth pass. Exact NodeMaterials should expose
 * `userData.createDepthColorVariant`; generic materials retain any directly
 * available position/mask nodes and report that fallback explicitly.
 */
export function createSceneDepthColorPass({ scene }?: {}): Readonly<{
    depthMaterialFor: (material: any) => any;
    dispose: () => void;
    render: (renderer: any, camera: any, target: any) => Readonly<{
        coupledVariantCount: number;
        exactVariantCount: number;
        genericVariantCount: number;
        materialVariantCount: number;
        remainingGenericVariantCount: number;
        coupledVariantCreateCount: number;
        genericMaskNodeCount: number;
        genericPositionNodeCount: number;
        genericVariantCreateCount: number;
        hiddenDerivedMeshCount: number;
        hiddenNonDepthMeshCount: number;
        renderCount: number;
        swappedMeshCount: number;
    }>;
    report: () => Readonly<{
        coupledVariantCount: number;
        exactVariantCount: number;
        genericVariantCount: number;
        materialVariantCount: number;
        remainingGenericVariantCount: number;
        coupledVariantCreateCount: number;
        genericMaskNodeCount: number;
        genericPositionNodeCount: number;
        genericVariantCreateCount: number;
        hiddenDerivedMeshCount: number;
        hiddenNonDepthMeshCount: number;
        renderCount: number;
        swappedMeshCount: number;
    }>;
}>;
