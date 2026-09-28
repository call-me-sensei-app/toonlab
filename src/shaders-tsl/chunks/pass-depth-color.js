// Depth-as-color pass material for the node backends, shared by the
// character passes (scene depth prepass, self-shadow map) and the
// environment sun-shadow pass.
//
// The node renderer's WGSL and GLSL builders type depth-texture samples
// differently (float vs vec4 — docs/tsl-conventions.md), so passes write
// linear window depth into a float COLOR attachment instead: [0,1] window
// depth is numerically identical on both coordinate systems for perspective
// and orthographic cameras alike. The select keys off the active camera, so
// one material serves both projections.
//
// Manual samplers of these targets need the GL-convention matrix pre-adjust
// exported below. TextureNode normalizes render-target samples to top-left UVs
// on both node backends (it injects the physical framebuffer flip on WebGL),
// so both matrices flip projected y. Native WebGPU clip z is additionally
// already [0,1].

import * as THREE from 'three';
import {
  cameraFar,
  cameraNear,
  cameraProjectionMatrix,
  positionView,
  select,
  texture as textureNode,
  vec3,
  vec4,
  viewZToOrthographicDepth,
  viewZToPerspectiveDepth,
} from 'three/tsl';
import { MeshBasicNodeMaterial } from 'three/webgpu';

import { withToonStorageSkinning } from './character-skinning.js';

// Skinned meshes (MMD-scale skeletons included) skin through the storage/PBO
// path on the WebGL2 backend — see character-skinning.js.
export const PassBasicNodeMaterial = withToonStorageSkinning(MeshBasicNodeMaterial);

export function createPassDepthColorMaterial({
  alphaTest = 0,
  map = null,
  side = THREE.DoubleSide,
  // The classic sun shadow map stored packed-RGBA8 depth; its ~1/255
  // quantization produces the dithered self-shadowing the environment look
  // was tuned around. The sun pass opts in to reproduce that exact
  // mechanism; the character passes keep full float precision (classic used
  // 24-bit depth textures there).
  quantize256 = false,
  // Writes the surface this far (metres, view space) behind where it is,
  // scaled by `pushWeight` (a TSL float node, e.g. a face role weight). The
  // character depth prepass pushes faces back so screen-space contact shadows
  // see the bangs in front of a face but not the face's own nose and cheeks.
  viewDepthPush = 0,
  pushWeight = null,
} = {}) {
  const material = new PassBasicNodeMaterial({ side });
  // three's shadow-pass exemption: keeps the render-object cache key free of
  // per-frame scene state (background/environment toggled around the pass),
  // which otherwise disposes+recreates every depth render object each frame —
  // destroying object uniform buffers that in-flight submits still reference.
  material.isShadowPassMaterial = true;
  const orthographic = cameraProjectionMatrix.element(3).w.equal(1.0);
  const viewZ = viewDepthPush > 0 && pushWeight
    ? positionView.z.sub(pushWeight.mul(viewDepthPush))
    : positionView.z;
  let depth01 = select(
    orthographic,
    viewZToOrthographicDepth(viewZ, cameraNear, cameraFar),
    viewZToPerspectiveDepth(viewZ, cameraNear, cameraFar),
  );
  if (quantize256) depth01 = depth01.mul(255.0).floor().div(255.0);
  const alpha = map && alphaTest > 0 ? textureNode(map).a : 1.0;
  material.colorNode = vec4(vec3(depth01), alpha);
  if (alphaTest > 0) material.alphaTest = alphaTest;
  return material;
}

// Pre-multiply onto proj * viewInverse so a shader using the GL-convention
// `clip.xyz * 0.5 + 0.5` remap samples the right texel and compares the right
// depth on each backend.
export const shadowClipAdjustWebGPU = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, -1, 0, 0,
  0, 0, 2, -1,
  0, 0, 0, 1,
);
export const shadowClipAdjustGL = new THREE.Matrix4().set(
  1, 0, 0, 0,
  0, -1, 0, 0,
  0, 0, 1, 0,
  0, 0, 0, 1,
);

export function applyShadowClipAdjust(matrix, renderer) {
  return matrix.premultiply(
    renderer.coordinateSystem === THREE.WebGPUCoordinateSystem
      ? shadowClipAdjustWebGPU
      : shadowClipAdjustGL,
  );
}
