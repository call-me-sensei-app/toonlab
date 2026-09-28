// Shared material boundary for deterministic environment-parity scenes.
//
// Scene-content modules own geometry, source textures, and authored graph
// records. This module owns how every surface consumes the active environment
// contract, so changing sun/skylight/profile inputs affects rocks, terrain,
// grass, bark, and leaves through one code path.

import { float } from 'three/tsl';

import { installToonLabSurfaceLighting } from './toonLabSurfaceLighting.js';
import { installToonLabSourceDefaultLitLighting } from './toonLabSourceDefaultLit.js';

export const PARITY_ENVIRONMENT_INPUT_ADAPTERS = Object.freeze({
  toonLabStage: 'toonlab-stage',
  toonLabCapturedScene: 'toonlab-captured-scene-sh',
});

function canonicalizeEnvironmentInputAdapter(value) {
  if (
    typeof value === 'string'
    && value !== PARITY_ENVIRONMENT_INPUT_ADAPTERS.toonLabStage
    && value.endsWith('-captured-scene-sh')
  ) {
    return PARITY_ENVIRONMENT_INPUT_ADAPTERS.toonLabCapturedScene;
  }

  return value;
}

export function resolveParityEnvironmentInputAdapter(contract) {
  const requestedAdapter = contract.sun?.toonlabInputAdapter
    ?? PARITY_ENVIRONMENT_INPUT_ADAPTERS.toonLabStage;
  const adapter = canonicalizeEnvironmentInputAdapter(requestedAdapter);
  if (!Object.values(PARITY_ENVIRONMENT_INPUT_ADAPTERS).includes(adapter)) {
    throw new RangeError(
      `Unsupported parity lighting input adapter: ${requestedAdapter}`,
    );
  }
  return adapter;
}

function sourceWorkflow(material) {
  const sourceShader = material.userData?.toonLabMaterial?.sourceShader ?? '';
  return material.userData?.toonLabSceneTree
    || /Foliage|Leaves|Bark/.test(sourceShader)
    ? 'specular'
    : 'metallic';
}

function authoredLightingModel(material) {
  if (material.userData?.toonLabSourceSubsurfaceLighting) {
    return 'toonlab-legacy-subsurface';
  }
  if (material.userData?.toonLabSourceDefaultLitLighting) {
    return 'toonlab-legacy-default-lit';
  }
  if (material.userData?.toonLabSurfaceLighting) {
    return 'toonlab-surface';
  }
  return null;
}

export function bindParityEnvironmentToMaterial(material, contract, {
  installToonLabStage = true,
} = {}) {
  const inputAdapter = resolveParityEnvironmentInputAdapter(contract);
  const materialLightingModel = authoredLightingModel(material);
  const contractLightingModel = contract.engineAdapters?.toonlab?.surfaceLightingModel;
  const workflow = sourceWorkflow(material);

  // Family-specific source materials already own the correct shading model.
  // In particular, M_Leaves and M_Foliage use ToonLab's subsurface model; replacing
  // it with the rock contract's Default Lit model removes their transmitted
  // light and makes vegetation unnaturally dark. The shared boundary supplies
  // environment inputs without changing that authored material decision.
  if (materialLightingModel === 'toonlab-legacy-subsurface') {
    // The source material builder has already installed and clone-rehydrated
    // the ToonLab subsurface adapter.
  } else if (materialLightingModel === 'toonlab-legacy-default-lit') {
    installToonLabSourceDefaultLitLighting(material, {
      specularNode: material.toonLabSourceSpecularNode
        ?? float(contract.engineAdapters.toonlab.specularInput),
    });
  } else if (contractLightingModel === 'toonlab-legacy-default-lit') {
    installToonLabSourceDefaultLitLighting(material, {
      specularNode: material.toonLabSourceSpecularNode
        ?? float(contract.engineAdapters.toonlab.specularInput),
    });
  } else if (inputAdapter === PARITY_ENVIRONMENT_INPUT_ADAPTERS.toonLabCapturedScene) {
    installToonLabSurfaceLighting(material, { inputAdapter, workflow });
  } else if (installToonLabStage) {
    installToonLabSurfaceLighting(material, { workflow });
  }

  material.userData.sharedParityEnvironment = {
    authoredLightingModel: materialLightingModel,
    inputAdapter,
    profileId: contract.profileId,
    surfaceLightingModel: materialLightingModel
      ?? contractLightingModel
      ?? 'toonlab-surface',
    workflow,
  };
  material.needsUpdate = true;
  return material;
}

export function bindParityEnvironmentToObject(root, contract) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const source = Array.isArray(object.material) ? object.material : [object.material];
    source.forEach((material) => materials.add(material));
  });
  materials.forEach((material) => bindParityEnvironmentToMaterial(material, contract));
  return materials;
}
