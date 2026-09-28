// Per-character shared shading state.
//
// Everything that is a property of one character (not of one material) lives
// in uniform and texture nodes shared by all of that character's materials:
// its head frame (for the face map, face normals and the hair ring), and the
// screen-space depth prepass and character shadow map its render passes
// produce. The materials are built against these nodes; the render passes
// (src/toon/characterRenderPasses.js) write their values each frame.
//
// Kept out of userData (uniform nodes do not serialise): roots and materials
// map to their state through WeakMaps.

import * as THREE from 'three';
import { texture, uniform } from 'three/tsl';

// Render-target reads must bind a texture of the same kind the passes write:
// one single-channel float texel, cleared to the far value.
function createFarTexture() {
  const data = new Float32Array([1]);
  const map = new THREE.DataTexture(data, 1, 1, THREE.RedFormat, THREE.FloatType);
  map.magFilter = THREE.NearestFilter;
  map.minFilter = THREE.NearestFilter;
  map.generateMipmaps = false;
  map.colorSpace = THREE.NoColorSpace;
  map.needsUpdate = true;
  return map;
}

let sharedFarTexture = null;

/** The float texture bound until a render pass supplies its own. */
export function characterPassFallbackTexture() {
  if (!sharedFarTexture) sharedFarTexture = createFarTexture();
  return sharedFarTexture;
}

const stateByRoot = new WeakMap();
const stateByMaterial = new WeakMap();

export function createCharacterShadingState() {
  const fallback = characterPassFallbackTexture();
  return {
    // Head frame, world space. `tracked*` follows the head bone; `rest*` is
    // the character root's frame with the head's position (static mode).
    headForward: uniform(new THREE.Vector3(0, 0, 1)),
    headPosition: uniform(new THREE.Vector3(0, 1.5, 0)),
    headRestForward: uniform(new THREE.Vector3(0, 0, 1)),
    headRestUp: uniform(new THREE.Vector3(0, 1, 0)),
    headSphereCenter: uniform(new THREE.Vector3(0, 1.55, 0)),
    headUp: uniform(new THREE.Vector3(0, 1, 0)),
    headReady: uniform(0),
    // Depth prepass: r = window depth of the nearest surface, plus 2 where
    // that surface is a face (face pixels ignore face occluders).
    depthMap: texture(fallback),
    depthReady: uniform(0),
    // Character shadow map: orthographic, linear depth in r (plus 2 on faces).
    shadowMap: texture(fallback),
    shadowMatrix: uniform(new THREE.Matrix4()),
    shadowDepthRange: uniform(1),
    shadowMapSize: uniform(2048),
    shadowDirection: uniform(new THREE.Vector3(0, 1, 0)),
    shadowReady: uniform(0),
    // Bookkeeping for the passes (plain values).
    faceFrame: null,
    materials: new Set(),
  };
}

/** The state shared by `root`'s materials, created on first use. */
export function characterShadingStateFor(root) {
  let state = stateByRoot.get(root);
  if (!state) {
    state = createCharacterShadingState();
    stateByRoot.set(root, state);
  }
  return state;
}

export function peekCharacterShadingState(root) {
  return stateByRoot.get(root) ?? null;
}

export function bindMaterialToCharacterState(material, state) {
  stateByMaterial.set(material, state);
  state.materials.add(material);
}

export function characterStateOfMaterial(material) {
  return stateByMaterial.get(material) ?? null;
}
