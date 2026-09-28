import * as THREE from 'three';

// Head lookup shared by the render passes (face head-space tracking) and the
// toon adapter (automatic roles, conversion report).

function looseName(name) {
  return String(name ?? '').replace(/[^a-z0-9぀-ヿ一-鿿]/gi, '').toLowerCase();
}

export function findHeadBone(root) {
  const candidates = [];
  root.traverse((obj) => {
    if (!obj.isBone && !(obj.isObject3D && /bone/i.test(obj.type))) return;
    const name = looseName(obj.name);
    if (!name) return;
    // Exact conventions first: VRM/Mixamo 'head', Rigify 'DEF-head'/'defhead',
    // MMD '頭'. Reject end/tip/top helper bones.
    if (name === 'head' || name === 'defhead' || name === 'mixamorighead' || name === '頭') {
      candidates.push({ obj, score: 0 });
    } else if (/head/.test(name) && !/(end|tip|top|band|phone|wear|acc)/.test(name)) {
      candidates.push({ obj, score: 1 });
    }
  });
  candidates.sort((a, b) => a.score - b.score);
  return candidates[0]?.obj ?? null;
}

const HEAD_ANCHOR_NAME = 'ToonHeadAnchor';
const DEFAULT_FORWARD = new THREE.Vector3(0, 0, 1);
const Y_AXIS = new THREE.Vector3(0, 1, 0);

/**
 * The character's forward direction in its root's own frame: +Z by
 * convention, or `root.userData.toonForward` where the importer says
 * otherwise (three-vrm turns VRM 0.x models 180° on the root).
 */
export function characterForward(root) {
  const stored = root?.userData?.toonForward;
  const forward = Array.isArray(stored) ? new THREE.Vector3().fromArray(stored) : DEFAULT_FORWARD.clone();
  forward.y = 0;
  return forward.lengthSq() > 1e-8 ? forward.normalize() : DEFAULT_FORWARD.clone();
}

/**
 * World → character frame: the root's frame turned about +Y so the character
 * faces +Z (the frame head-space bakes and classifiers work in).
 */
export function characterFrameInverse(root) {
  root.updateMatrixWorld(true);
  const turn = new THREE.Quaternion().setFromUnitVectors(characterForward(root), DEFAULT_FORWARD);
  if (Math.abs(characterForward(root).dot(DEFAULT_FORWARD) + 1) < 1e-6) turn.setFromAxisAngle(Y_AXIS, Math.PI);
  return new THREE.Matrix4().makeRotationFromQuaternion(turn).multiply(new THREE.Matrix4().copy(root.matrixWorld).invert());
}

/** Character frame → root's own frame (for positions stored on the root). */
export function characterFrameToRoot(root) {
  const turn = new THREE.Quaternion().setFromUnitVectors(characterForward(root), DEFAULT_FORWARD);
  if (Math.abs(characterForward(root).dot(DEFAULT_FORWARD) + 1) < 1e-6) turn.setFromAxisAngle(Y_AXIS, Math.PI);
  return new THREE.Matrix4().makeRotationFromQuaternion(turn.invert());
}

/**
 * The head bone, or — for an unrigged model whose head was located by
 * automatic roles (`root.userData.toonHeadEstimate`) — a rigid anchor object
 * placed at the estimated head centre under the root, so head-space face
 * lighting has a frame to follow.
 */
export function findOrCreateHeadAnchor(root) {
  const bone = findHeadBone(root);
  if (bone) return bone;
  const estimate = root?.userData?.toonHeadEstimate;
  if (!estimate?.center) return null;
  let anchor = root.getObjectByName(HEAD_ANCHOR_NAME);
  if (!anchor) {
    anchor = new THREE.Object3D();
    anchor.name = HEAD_ANCHOR_NAME;
    anchor.userData.isToonHeadAnchor = true;
    root.add(anchor);
  }
  anchor.position.fromArray(estimate.center);
  anchor.quaternion.identity();
  anchor.updateMatrixWorld(true);
  return anchor;
}

// Most rigs author the head bone with its axes aligned to the face. Snapping a
// calibrated direction to the nearest bone axis when it is within ~20° removes
// the error of registering while the head is slightly posed; rigs with oblique
// head axes keep the measured vector.
const HEAD_AXIS_SNAP_COS = Math.cos(THREE.MathUtils.degToRad(20));

function snapToBoneAxis(direction) {
  const components = [Math.abs(direction.x), Math.abs(direction.y), Math.abs(direction.z)];
  const largest = Math.max(...components);
  if (largest < HEAD_AXIS_SNAP_COS) return direction;
  const axis = components.indexOf(largest);
  const sign = Math.sign(direction.getComponent(axis));
  return direction.set(0, 0, 0).setComponent(axis, sign);
}

export function createHeadTracker(root, { forward = characterForward(root), up = new THREE.Vector3(0, 1, 0) } = {}) {
  // A real head bone, or the head estimated by automatic roles on an unrigged
  // model (a rigid anchor under the root).
  const headBone = findOrCreateHeadAnchor(root);
  if (!headBone) return null;

  // `forward` and `up` are in the character root's own frame (glTF, VRM and
  // MMD models face +Z with +Y up), not world space, so a character that is
  // already turned when it registers still calibrates to its face. Converting
  // them into head-bone-local directions lets animated bone rotations carry
  // them afterwards.
  root.updateMatrixWorld(true);
  const rootQuat = root.getWorldQuaternion(new THREE.Quaternion());
  const boneQuatInverse = headBone.getWorldQuaternion(new THREE.Quaternion()).invert();
  const toBoneLocal = (direction) => snapToBoneAxis(
    direction.clone().applyQuaternion(rootQuat).applyQuaternion(boneQuatInverse).normalize(),
  );
  const upLocal = toBoneLocal(up);
  const forwardLocal = toBoneLocal(forward);
  forwardLocal.addScaledVector(upLocal, -forwardLocal.dot(upLocal)).normalize();

  const worldQuat = new THREE.Quaternion();
  const state = {
    forward: new THREE.Vector3(0, 0, 1),
    position: new THREE.Vector3(),
    up: new THREE.Vector3(0, 1, 0),
  };

  return {
    headBone,
    state,
    update() {
      headBone.getWorldQuaternion(worldQuat);
      headBone.getWorldPosition(state.position);
      state.forward.copy(forwardLocal).applyQuaternion(worldQuat).normalize();
      state.up.copy(upLocal).applyQuaternion(worldQuat).normalize();
    },
  };
}
