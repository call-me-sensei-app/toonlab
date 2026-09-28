// FBXLoader wrapper: parses an ArrayBuffer, tolerates missing external
// texture files (typical for a bare .fbx dragged out of a project), and
// reports what the editor cannot round-trip (animation, skinning).

import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';

let blankTextureUri = null;

// Missing texture references resolve to a 1×1 white PNG so materials keep
// their diffuse color instead of erroring or rendering black.
function getBlankTextureUri() {
  if (!blankTextureUri) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, 1, 1);
    blankTextureUri = canvas.toDataURL('image/png');
  }
  return blankTextureUri;
}

/**
 * @param {ArrayBuffer} buffer raw .fbx bytes
 * @param {string} fileName original file name (for warnings only)
 * @returns {{ root: THREE.Group, warnings: string[] }}
 */
export function parseFBX(buffer, fileName = 'model.fbx') {
  const missingTextures = new Set();
  const manager = new THREE.LoadingManager();
  manager.setURLModifier((url) => {
    // Embedded textures arrive as blob:/data: URLs created by the loader.
    if (url.startsWith('blob:') || url.startsWith('data:')) return url;
    missingTextures.add(url.split('/').pop());
    return getBlankTextureUri();
  });

  const loader = new FBXLoader(manager);
  const root = loader.parse(buffer, '');

  let skinnedMeshes = 0;
  let nonMeshRenderables = 0;
  root.traverse((object) => {
    if (object.isSkinnedMesh) skinnedMeshes += 1;
    else if (object.isPoints || object.isLine) nonMeshRenderables += 1;
    if (object.isMesh && !object.geometry.getAttribute('normal')) {
      object.geometry.computeVertexNormals();
    }
  });

  const warnings = [];
  if (root.animations?.length) {
    warnings.push(`${root.animations.length} animation clip${root.animations.length === 1 ? '' : 's'} in "${fileName}" will not survive export — this editor saves static meshes only.`);
  }
  if (skinnedMeshes > 0) {
    warnings.push(`${skinnedMeshes} skinned mesh${skinnedMeshes === 1 ? '' : 'es'} will export as static geometry (bind pose, no skin weights).`);
  }
  if (nonMeshRenderables > 0) {
    warnings.push(`${nonMeshRenderables} line/point object${nonMeshRenderables === 1 ? '' : 's'} will be skipped on export.`);
  }
  if (missingTextures.size > 0) {
    const names = [...missingTextures].slice(0, 4).join(', ');
    warnings.push(`External textures not found next to the file (${names}${missingTextures.size > 4 ? ', …' : ''}) — showing material colors instead.`);
  }

  return { root, warnings };
}
