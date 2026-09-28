// Per-material scene depth-as-color pass for post effects.
//
// A scene.overrideMaterial depth pass cannot preserve a source NodeMaterial's
// color-depth output, alpha mask, WPO, and cull state at the same time: Three
// treats an isShadowPassMaterial override as a native ShadowCaster material,
// replaces its color node, and flips one-sided culling. Material swaps avoid
// that renderer ambiguity and let exact sources provide one coupled variant.

import * as THREE from 'three';

import { createPassDepthColorMaterial } from './pass-depth-color.js';

const normalizeMaterials = (material) => (
  Array.isArray(material) ? material : [material]
);

function sourceCutoff(material) {
  const value = material?.uniforms?.aCutoff?.value
    ?? material?.uniforms?.alphaCutoff?.value
    ?? (material?.alphaTest > 0 ? material.alphaTest : -1);
  const result = Number(value);
  return Number.isFinite(result) && result > 0 ? result : 0;
}

function sourceMap(material) {
  return material?.uniforms?.base?.value
    ?? material?.uniforms?.baseMap?.value
    ?? material?.map
    ?? null;
}

/**
 * Create a reusable camera-depth pass. Exact NodeMaterials should expose
 * `userData.createDepthColorVariant`; generic materials retain any directly
 * available position/mask nodes and report that fallback explicitly.
 */
export function createSceneDepthColorPass({ scene } = {}) {
  if (!scene?.traverse) throw new TypeError('createSceneDepthColorPass requires a Three Scene.');

  const materialCache = new WeakMap();
  const materialVariants = new Set();
  const meshSwapCache = new WeakMap();
  const materialRestores = [];
  const visibilityRestores = [];
  const clearColor = new THREE.Color();
  const emptyMaterial = createPassDepthColorMaterial();
  emptyMaterial.name = 'SceneDepthColor:Empty';
  emptyMaterial.visible = false;
  materialVariants.add(emptyMaterial);
  let disposed = false;

  const counters = {
    coupledVariantCreateCount: 0,
    genericMaskNodeCount: 0,
    genericPositionNodeCount: 0,
    genericVariantCreateCount: 0,
    hiddenDerivedMeshCount: 0,
    hiddenNonDepthMeshCount: 0,
    renderCount: 0,
    swappedMeshCount: 0,
  };

  function createVariant(material) {
    let depthMaterial;
    const coupledFactory = material?.userData?.createDepthColorVariant;
    if (typeof coupledFactory === 'function') {
      depthMaterial = coupledFactory();
      counters.coupledVariantCreateCount += 1;
    } else {
      const alphaTest = sourceCutoff(material);
      depthMaterial = createPassDepthColorMaterial({
        alphaTest,
        map: alphaTest > 0 ? sourceMap(material) : null,
        side: material?.side ?? THREE.FrontSide,
      });
      counters.genericVariantCreateCount += 1;
      // Preserve the subset the renderer can prove from a generic
      // NodeMaterial. A family with custom vertexNode/fragmentNode logic must
      // expose createDepthColorVariant to be classified exact.
      if (material?.positionNode?.isNode) {
        depthMaterial.positionNode = material.positionNode;
        counters.genericPositionNodeCount += 1;
      }
      const maskNode = material?.maskNode?.isNode ? material.maskNode : null;
      if (maskNode) {
        depthMaterial.maskNode = maskNode;
        depthMaterial.maskShadowNode = material.maskShadowNode?.isNode
          ? material.maskShadowNode
          : maskNode;
        counters.genericMaskNodeCount += 1;
      }
    }
    if (!depthMaterial?.isMaterial) {
      throw new TypeError(
        `${material?.name || 'Material'}.createDepthColorVariant() must return a Three Material.`,
      );
    }
    depthMaterial.name ||= `${material?.name || 'Material'}:SceneDepthColor`;
    depthMaterial.fog = false;
    depthMaterial.side = material?.side ?? depthMaterial.side;
    depthMaterial.shadowSide = depthMaterial.side;
    depthMaterial.forceSinglePass = material?.forceSinglePass ?? depthMaterial.forceSinglePass;
    depthMaterial.depthTest = material?.depthTest !== false;
    depthMaterial.depthWrite = true;
    depthMaterial.transparent = false;
    depthMaterial.userData.sceneDepthColorPass = {
      coupled: typeof coupledFactory === 'function',
      exact: Boolean(
        depthMaterial.userData?.toonLabPassCoupling?.exact
        || material?.userData?.toonLabPassCoupling?.exact,
      ),
      maskSource: depthMaterial.maskNode?.isNode ? 'source-node' : 'opaque-or-alpha-test',
      positionSource: depthMaterial.positionNode?.isNode ? 'source-node' : 'authored-position',
      sourceMaterialName: material?.name || null,
      sourceMaterialUuid: material?.uuid ?? null,
      sourceSide: material?.side ?? THREE.FrontSide,
      sourceVersion: material?.version ?? 0,
    };
    materialVariants.add(depthMaterial);
    return depthMaterial;
  }

  function depthMaterialFor(material) {
    if (!material?.isMaterial) return emptyMaterial;
    let cached = materialCache.get(material);
    if (!cached || cached.version !== material.version) {
      if (cached) {
        cached.material.dispose();
        materialVariants.delete(cached.material);
      }
      cached = {
        material: createVariant(material),
        version: material.version,
      };
      materialCache.set(material, cached);
    }
    cached.material.visible = material.visible !== false && material.depthWrite !== false;
    return cached.material;
  }

  function swappedMaterials(source) {
    return Array.isArray(source)
      ? source.map((material) => depthMaterialFor(material))
      : depthMaterialFor(source);
  }

  function refreshSwap(mesh) {
    const source = mesh.material;
    let swap = meshSwapCache.get(mesh);
    if (!swap || swap.source !== source) {
      swap = { source, swapped: swappedMaterials(source) };
      meshSwapCache.set(mesh, swap);
    } else if (Array.isArray(source)) {
      for (let index = 0; index < source.length; index += 1) {
        swap.swapped[index] = depthMaterialFor(source[index]);
      }
    } else {
      swap.swapped = depthMaterialFor(source);
    }
    return swap.swapped;
  }

  function restoreScene() {
    for (const { material, mesh } of materialRestores) mesh.material = material;
    for (const object of visibilityRestores) object.visible = true;
    materialRestores.length = 0;
    visibilityRestores.length = 0;
  }

  function render(renderer, camera, target) {
    if (disposed) throw new Error('Scene depth-color pass is disposed.');
    if (!renderer?.render || !renderer?.setRenderTarget) {
      throw new TypeError('A Three renderer is required.');
    }
    if (!camera?.isCamera) throw new TypeError('A Three Camera is required.');
    if (!target?.isRenderTarget) throw new TypeError('A Three RenderTarget is required.');

    materialRestores.length = 0;
    visibilityRestores.length = 0;
    let hiddenDerivedMeshCount = 0;
    let hiddenNonDepthMeshCount = 0;
    let swappedMeshCount = 0;

    const previousTarget = renderer.getRenderTarget();
    const previousBackground = scene.background;
    const previousFog = scene.fog;
    const previousOverrideMaterial = scene.overrideMaterial;
    renderer.getClearColor(clearColor);
    const previousClearAlpha = renderer.getClearAlpha();
    const previousShadowEnabled = renderer.shadowMap?.enabled;
    try {
      scene.traverseVisible((object) => {
        const renderable = object.isMesh || object.isPoints || object.isLine || object.isSprite;
        if (!renderable) return;
        if (!object.isMesh || object.userData?.isToonOutline || object.userData?.isToonFurShell) {
          object.visible = false;
          visibilityRestores.push(object);
          hiddenDerivedMeshCount += 1;
          return;
        }
        const sourceMaterials = normalizeMaterials(object.material);
        const participates = sourceMaterials.some((material) => (
          material?.visible !== false && material?.depthWrite !== false
        ));
        if (!participates) {
          object.visible = false;
          visibilityRestores.push(object);
          hiddenNonDepthMeshCount += 1;
          return;
        }
        materialRestores.push({ material: object.material, mesh: object });
        object.material = refreshSwap(object);
        swappedMeshCount += 1;
      });

      scene.background = null;
      scene.fog = null;
      scene.overrideMaterial = null;
      if (renderer.shadowMap) renderer.shadowMap.enabled = false;
      renderer.setRenderTarget(target);
      renderer.setClearColor(0xffffff, 1);
      renderer.clear();
      renderer.render(scene, camera);
    } finally {
      restoreScene();
      scene.background = previousBackground;
      scene.fog = previousFog;
      scene.overrideMaterial = previousOverrideMaterial;
      renderer.setRenderTarget(previousTarget);
      renderer.setClearColor(clearColor, previousClearAlpha);
      if (renderer.shadowMap) renderer.shadowMap.enabled = previousShadowEnabled;
    }

    counters.hiddenDerivedMeshCount = hiddenDerivedMeshCount;
    counters.hiddenNonDepthMeshCount = hiddenNonDepthMeshCount;
    counters.renderCount += 1;
    counters.swappedMeshCount = swappedMeshCount;
    return report();
  }

  function report() {
    const liveVariants = [...materialVariants].filter((material) => material !== emptyMaterial);
    const coupledVariantCount = liveVariants.filter((material) => (
      material.userData?.sceneDepthColorPass?.coupled === true
    )).length;
    const genericVariantCount = liveVariants.length - coupledVariantCount;
    return Object.freeze({
      ...counters,
      coupledVariantCount,
      exactVariantCount: liveVariants.filter((material) => (
        material.userData?.sceneDepthColorPass?.exact === true
      )).length,
      genericVariantCount,
      materialVariantCount: liveVariants.length,
      remainingGenericVariantCount: genericVariantCount,
    });
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    restoreScene();
    for (const material of materialVariants) material.dispose();
    materialVariants.clear();
  }

  return Object.freeze({
    depthMaterialFor,
    dispose,
    render,
    report,
  });
}
