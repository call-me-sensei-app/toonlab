// ToonLab-authoritative coupling for visible, depth-as-color, and ShadowCaster
// evaluation of reconstructed ToonLab graph materials.
//
// Three's native node shadow path already falls back from
// castShadowPositionNode to positionNode and from maskShadowNode to maskNode.
// ToonLab also owns depth-as-color passes (water scene depth and the node
// environment sun shadow), which replace the visible material entirely. This
// module makes that replacement explicit so alpha-cut cards never become
// opaque rectangles and wind/WPO never falls back to authored vertices.

import * as THREE from 'three';
import {
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  float,
  positionLocal,
  positionView,
  select,
  vec3,
  vec4,
  viewZToOrthographicDepth,
  viewZToPerspectiveDepth,
} from 'three/tsl';

import { PassBasicNodeMaterial } from '../shaders-tsl/chunks/pass-depth-color.js';

export const TOONLAB_PASS_COUPLING_SCHEMA_VERSION = 1;

const freezeContract = (contract) => Object.freeze({
  ...contract,
  generatedPasses: Object.freeze(['ForwardLit', 'DepthOnly', 'ShadowCaster']),
});

/**
 * Render-state and graph-output facts read from the supplied ToonLab Graphs and
 * their ToonLab reference renderer generated passes. `renderFace=0` is Cull Off;
 * `renderFace=2` is Cull Back (front faces survive).
 */
export const TOONLAB_MATERIAL_PASS_CONTRACTS = Object.freeze({
  'ToonLab Graphs/S_FoliageShader': freezeContract({
    alphaChannel: 'UseTexture ? FoliageTexture.a : 1; camera dither; distance dither',
    alphaClip: true,
    cull: 'Off',
    renderFace: 0,
    side: THREE.DoubleSide,
    vertexPosition: 'S_Foliage wind/lift/distance-fade graph',
  }),
  'ToonLab Graphs/S_Leaves': freezeContract({
    alphaChannel: 'LeafTexture.r; camera dither; SingleMaterialLOD vertex-color mix',
    alphaClip: true,
    cull: 'Off',
    renderFace: 0,
    side: THREE.DoubleSide,
    vertexPosition: 'S_Leaves world-space wind graph or its authored-position branch',
  }),
  'ToonLab Graphs/S_Bark': freezeContract({
    alphaChannel: 'opaque',
    alphaClip: false,
    cull: 'Back',
    renderFace: 2,
    side: THREE.FrontSide,
    vertexPosition: 'authored Position',
  }),
  'ToonLab Graphs/S_Snow': freezeContract({
    alphaChannel: 'opaque',
    alphaClip: false,
    cull: 'Back',
    renderFace: 2,
    side: THREE.FrontSide,
    vertexPosition: 'authored Position',
  }),
  'ToonLab Graphs/S_StylizedBasic': freezeContract({
    alphaChannel: 'opaque',
    alphaClip: false,
    cull: 'Back',
    renderFace: 2,
    side: THREE.FrontSide,
    vertexPosition: 'authored Position',
  }),
  'ToonLab Surface/Lit': freezeContract({
    alphaChannel: 'opaque',
    alphaClip: false,
    cull: 'Back',
    renderFace: 2,
    side: THREE.FrontSide,
    vertexPosition: 'authored Position',
  }),
});

export function resolveToonLabMaterialPassContract(shaderName) {
  return TOONLAB_MATERIAL_PASS_CONTRACTS[String(shaderName ?? '')] ?? null;
}

/** CPU boundary oracle for ToonLab graph's `clip(alpha - threshold)`. */
export function evaluateToonLabAlphaClip(alpha, threshold) {
  const resolvedAlpha = Number(alpha);
  const resolvedThreshold = Number(threshold);
  if (!Number.isFinite(resolvedAlpha) || !Number.isFinite(resolvedThreshold)) {
    throw new TypeError('ToonLab alpha clip evaluation requires finite numbers.');
  }
  return resolvedAlpha >= resolvedThreshold;
}

function sideLabel(side) {
  if (side === THREE.DoubleSide) return 'DoubleSide';
  if (side === THREE.BackSide) return 'BackSide';
  return 'FrontSide';
}

function alphaThresholdMetadata(alphaThreshold) {
  if (alphaThreshold?.isNode) return 'node';
  const value = Number(alphaThreshold);
  return Number.isFinite(value) ? value : null;
}

function makeDepthColorNode() {
  const orthographic = cameraProjectionMatrix.element(3).w.equal(1);
  const depth = select(
    orthographic,
    viewZToOrthographicDepth(positionView.z, cameraNear, cameraFar),
    viewZToPerspectiveDepth(positionView.z, cameraNear, cameraFar),
  );
  return vec4(vec3(depth), 1);
}

function createCoupledDepthColorMaterial(source, coupling) {
  const depthMaterial = new PassBasicNodeMaterial();
  depthMaterial.name = `${source.name || 'ToonLab'}:CoupledDepth`;
  depthMaterial.lights = false;
  depthMaterial.fog = false;
  depthMaterial.side = coupling.side;
  // ToonLab's generated DepthOnly and ShadowCaster passes use the same Cull
  // state as ForwardLit. Pin shadowSide as well because Three otherwise flips
  // FrontSide during its native shadow override.
  depthMaterial.shadowSide = coupling.side;
  depthMaterial.forceSinglePass = source.forceSinglePass;
  depthMaterial.transparent = false;
  depthMaterial.depthWrite = true;
  depthMaterial.depthTest = source.depthTest;
  depthMaterial.vertexColors = source.vertexColors;
  depthMaterial.isShadowPassMaterial = true;
  depthMaterial.positionNode = coupling.positionNode;
  if (coupling.alphaMaskNode) {
    depthMaterial.maskNode = coupling.alphaMaskNode;
    depthMaterial.maskShadowNode = coupling.alphaMaskNode;
  }
  depthMaterial.colorNode = makeDepthColorNode();
  depthMaterial.userData.toonLabPassCoupling = {
    ...coupling.metadataSnapshot,
    depthVariant: true,
    sourceMaterialUuid: source.uuid,
  };
  return depthMaterial;
}

/**
 * Install one node identity across all material passes.
 *
 * For alpha-cut families, `alphaNode` is the complete connected ToonLab graph
 * Alpha output (texture channel plus every dither/fade multiplier), not merely
 * the source texture. ToonLab uses `clip(alpha - threshold)`, so equality must
 * survive; a shared `>=` boolean mask is used instead of Three's alphaTest.
 */
export function installToonLabMaterialPassCoupling(material, {
  alphaChannel = null,
  alphaNode = null,
  alphaThreshold = null,
  positionMode = 'authored',
  positionNode = positionLocal,
  shaderName,
} = {}) {
  if (!material?.isNodeMaterial) {
    throw new TypeError('ToonLab material pass coupling requires a Three NodeMaterial.');
  }
  const contract = resolveToonLabMaterialPassContract(shaderName);
  if (!contract) {
    throw new TypeError(`No audited ToonLab pass contract exists for ${shaderName ?? 'missing shader'}.`);
  }
  if (!positionNode?.isNode) {
    throw new TypeError(`${shaderName} requires one shared TSL positionNode.`);
  }
  if (contract.alphaClip && (!alphaNode?.isNode || alphaThreshold === null)) {
    throw new TypeError(`${shaderName} requires its connected Alpha node and clip threshold.`);
  }

  const prior = material.userData?.toonLabPassCoupling;
  const priorIsLive = prior?.exact
    && prior.shaderName === shaderName
    && typeof material.userData.createDepthColorVariant === 'function'
    && material.positionNode?.isNode
    && (contract.alphaClip ? (
      material.maskNode?.isNode
      && material.maskNode === material.maskShadowNode
    ) : (
      material.maskNode === null
      && material.maskShadowNode === null
      && material.alphaTest === 0
      && material.alphaTestNode === null
    ));
  if (priorIsLive) return material;

  const resolvedAlphaNode = contract.alphaClip ? float(alphaNode) : null;
  const alphaMaskNode = contract.alphaClip
    ? resolvedAlphaNode.greaterThanEqual(float(alphaThreshold))
    : null;
  const resolvedChannel = alphaChannel ?? contract.alphaChannel;

  material.side = contract.side;
  material.shadowSide = contract.side;
  material.forceSinglePass = contract.side === THREE.DoubleSide;
  material.positionNode = positionNode;
  if (contract.alphaClip) {
    material.opacityNode = resolvedAlphaNode;
    material.maskNode = alphaMaskNode;
    material.maskShadowNode = alphaMaskNode;
    material.alphaTest = 0;
    material.alphaTestNode = null;
    material.alphaToCoverage = false;
  } else {
    material.opacity = 1;
    material.opacityNode = null;
    material.maskNode = null;
    material.maskShadowNode = null;
    material.alphaTest = 0;
    material.alphaTestNode = null;
    material.alphaToCoverage = false;
  }

  const runtime = {
    depthVariantCreateCount: 0,
  };
  const metadataSnapshot = {
    alphaChannel: resolvedChannel,
    alphaClip: contract.alphaClip,
    alphaComparison: contract.alphaClip ? '>=' : null,
    alphaEqualitySurvives: contract.alphaClip,
    alphaThreshold: contract.alphaClip
      ? alphaThresholdMetadata(alphaThreshold)
      : null,
    cull: contract.cull,
    depthAlphaSource: contract.alphaClip ? 'shared alpha mask node' : 'opaque',
    depthPositionSource: 'shared positionNode',
    exact: true,
    forwardAlphaSource: contract.alphaClip ? 'shared alpha mask node' : 'opaque',
    forwardPositionSource: 'shared positionNode',
    generatedPasses: [...contract.generatedPasses],
    positionMode,
    schemaVersion: TOONLAB_PASS_COUPLING_SCHEMA_VERSION,
    shaderName,
    shadowAlphaSource: contract.alphaClip ? 'shared maskShadowNode' : 'opaque',
    shadowPositionSource: 'positionNode; castShadowPositionNode may wrap it with source bias',
    shadowSide: sideLabel(contract.side),
    side: sideLabel(contract.side),
  };
  const coupling = {
    alphaMaskNode,
    metadataSnapshot,
    positionNode,
    side: contract.side,
  };
  material.userData.toonLabPassCoupling = {
    ...metadataSnapshot,
    runtime,
  };
  material.userData.createDepthColorVariant = () => {
    runtime.depthVariantCreateCount += 1;
    return createCoupledDepthColorMaterial(material, coupling);
  };
  material.needsUpdate = true;
  return material;
}

function materialsOf(object) {
  if (!object?.material) return [];
  return Array.isArray(object.material) ? object.material : [object.material];
}

/** Deterministic runtime inventory for stage/test diagnostics. */
export function createToonLabPassCouplingReport(root) {
  if (!root?.traverse) throw new TypeError('A Three Object3D root is required.');
  const knownMaterials = new Set();
  const coupledMaterials = new Set();
  const uncoupledMaterials = new Set();
  let casterMeshCount = 0;
  let coupledMeshCount = 0;
  let meshCount = 0;
  let receiverMeshCount = 0;

  root.traverse((object) => {
    if (!object.isMesh) return;
    meshCount += 1;
    if (object.castShadow === true) casterMeshCount += 1;
    if (object.receiveShadow === true) receiverMeshCount += 1;
    let coupled = false;
    for (const material of materialsOf(object)) {
      const shaderName = material?.userData?.toonLabPassCoupling?.shaderName
        ?? material?.userData?.toonLabMaterial?.sourceShader
        ?? material?.userData?.toonLabSceneTree?.shaderName
        ?? null;
      if (!resolveToonLabMaterialPassContract(shaderName)) continue;
      knownMaterials.add(material);
      if (material.userData?.toonLabPassCoupling?.exact) {
        coupledMaterials.add(material);
        coupled = true;
      } else {
        uncoupledMaterials.add(material);
      }
    }
    if (coupled) coupledMeshCount += 1;
  });

  const coupled = [...coupledMaterials];
  const report = {
    alphaClipMaterialCount: coupled.filter((material) => (
      material.userData.toonLabPassCoupling.alphaClip
    )).length,
    casterMeshCount,
    coupledMaterialCount: coupledMaterials.size,
    coupledMeshCount,
    depthVariantCreateCount: coupled.reduce((sum, material) => (
      sum + material.userData.toonLabPassCoupling.runtime.depthVariantCreateCount
    ), 0),
    depthVariantFactoryCount: coupled.filter((material) => (
      typeof material.userData.createDepthColorVariant === 'function'
    )).length,
    exact: uncoupledMaterials.size === 0,
    knownMaterialCount: knownMaterials.size,
    meshCount,
    opaqueMaterialCount: coupled.filter((material) => (
      !material.userData.toonLabPassCoupling.alphaClip
    )).length,
    receiverMeshCount,
    twoSidedMaterialCount: coupled.filter((material) => (
      material.side === THREE.DoubleSide
    )).length,
    uncoupledMaterialCount: uncoupledMaterials.size,
    uncoupledMaterials: [...uncoupledMaterials]
      .map((material) => material.name || material.uuid)
      .sort(),
    wpoMaterialCount: coupled.filter((material) => (
      material.userData.toonLabPassCoupling.positionMode === 'deformed'
    )).length,
  };
  root.userData.toonLabPassCoupling = { ...report };
  return report;
}
