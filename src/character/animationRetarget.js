// Reusable character retarget/bake pipeline. This module deliberately has no
// Lab, URL-query, React, controller, or scene dependency: callers provide the
// source clips and presentation options, and every character-aware surface
// consumes the same implementation.
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';

import {
  MIXAMO_CHAIN_CHILD,
  normalizeMixamoBoneName,
  resolveCharacterRig,
} from './characterRig.js';
import { loadModelAsset } from './modelLoader.js';
import { TOONLAB_MANNEQUIN_ASSET_URL } from './mannequinAsset.js';

const NATIVE_LOCOMOTION_CLIP_NAMES = Object.freeze({
  idle: ['Idle_Loop', 'Idle'],
  walk: ['Walk_Loop', 'Walking', 'Walk'],
  run: ['Sprint_Loop', 'Jog_Fwd_Loop', 'Running', 'Run'],
  jump: ['Jump_Start', 'Jump_Loop', 'Jump'],
  swim: ['Swim_Fwd_Loop', 'Swimming', 'Swim'],
  dive: ['Swim_Fwd_Loop', 'Swimming', 'Swim'],
  tread: ['Swim_Idle_Loop', 'Treading_Water', 'TreadingWater'],
  sit: ['Sitting_Idle_Loop', 'SittingIdle', 'Sit'],
});

function resolveNativeLocomotionClips(clips) {
  if (!clips?.length) return null;
  // FBX exporters commonly namespace animation-stack names (`Rig|Walk_Loop`)
  // while glTF preserves the authored `Walk_Loop` name. Resolve both through
  // the same native path so format changes do not silently force a retarget.
  const clipsByName = new Map();
  for (const clip of clips) {
    clipsByName.set(clip.name, clip);
    const basename = clip.name.split('|').at(-1);
    if (!clipsByName.has(basename)) clipsByName.set(basename, clip);
  }
  const resolved = {};
  for (const [role, candidateNames] of Object.entries(NATIVE_LOCOMOTION_CLIP_NAMES)) {
    const name = candidateNames.find((candidate) => clipsByName.has(candidate));
    if (name) resolved[role] = clipsByName.get(name);
  }
  return resolved.idle && resolved.walk ? resolved : null;
}

// Bone-name knowledge lives in characterRig.js (canonical humanoid roles +
// per-convention adapters); a resolved `rig` for the loaded model threads
// through the retarget pipeline below. The body-mode debug filters here are
// MMD-specific by design (they only matter for the PMX test flows).
const LOWER_BODY_WALK_BONES = new Set([
  '下半身',
  '左足',
  '左ひざ',
  '左足首',
  '左つま先',
  '右足',
  '右ひざ',
  '右足首',
  '右つま先',
  '左足D',
  '左ひざD',
  '左足首D',
  '左足先EX',
  '右足D',
  '右ひざD',
  '右足首D',
  '右足先EX',
]);

const TORSO_IDLE_BONES = new Set([
  '上半身',
  '上半身2',
  '上半身3',
  '首',
  '頭',
]);

const UPPER_BODY_IDLE_BONES = new Set([
  ...TORSO_IDLE_BONES,
  '左肩',
  '左腕',
  '左ひじ',
  '左手首',
  '右肩',
  '右腕',
  '右ひじ',
  '右手首',
  '左親指０',
  '左親指１',
  '左親指２',
  '左人指１',
  '左人指２',
  '左人指３',
  '左中指１',
  '左中指２',
  '左中指３',
  '左薬指１',
  '左薬指２',
  '左薬指３',
  '左小指１',
  '左小指２',
  '左小指３',
  '右親指０',
  '右親指１',
  '右親指２',
  '右人指１',
  '右人指２',
  '右人指３',
  '右中指１',
  '右中指２',
  '右中指３',
  '右薬指１',
  '右薬指２',
  '右薬指３',
  '右小指１',
  '右小指２',
  '右小指３',
]);

function targetBoneNameFromAnimationTrack(trackName) {
  const boneMatch = trackName.match(/^\.bones\[([^\]]+)\]\./);
  if (boneMatch) return boneMatch[1];

  const separatorIndex = trackName.lastIndexOf('.');
  return separatorIndex > 0 ? trackName.slice(0, separatorIndex) : null;
}

function filterClipForBoneSet(clip, boneNames, clipName, { rootMotion = false } = {}) {
  const tracks = clip.tracks.filter((track) => {
    if (track.name.endsWith('.position')) {
      // センター carries the detrended hip sway, which keeps any stance balanced.
      return rootMotion || targetBoneNameFromAnimationTrack(track.name) === 'センター';
    }

    const boneName = targetBoneNameFromAnimationTrack(track.name);
    return boneName ? boneNames.has(boneName) : false;
  });

  return new THREE.AnimationClip(clipName, clip.duration, tracks).optimize();
}

function filterIdleClipForBodyMode(clip, { bodyMode = 'full', rootMotion = false } = {}) {
  if (bodyMode === 'full') return clip;
  if (bodyMode === 'none') {
    return new THREE.AnimationClip(`${clip.name} no-idle-bones`, clip.duration, []);
  }
  if (bodyMode === 'upper') {
    return filterClipForBoneSet(clip, UPPER_BODY_IDLE_BONES, `${clip.name} ${bodyMode}`, { rootMotion });
  }

  return filterClipForBoneSet(clip, TORSO_IDLE_BONES, `${clip.name} ${bodyMode}`, { rootMotion });
}

function filterWalkingClipForBodyMode(clip, { bodyMode = 'full', rootMotion = false } = {}) {
  if (bodyMode === 'full') return clip;

  return filterClipForBoneSet(clip, LOWER_BODY_WALK_BONES, `${clip.name} ${bodyMode}`, { rootMotion });
}

function filterJumpClipForBodyMode(clip, { bodyMode = 'full', rootMotion = false } = {}) {
  if (bodyMode === 'full') return clip;

  return filterClipForBoneSet(clip, LOWER_BODY_WALK_BONES, `${clip.name} ${bodyMode}`, { rootMotion });
}

function filterRunningClipForBodyMode(clip, { bodyMode = 'full', rootMotion = false } = {}) {
  if (bodyMode === 'full') return clip;

  return filterClipForBoneSet(clip, LOWER_BODY_WALK_BONES, `${clip.name} ${bodyMode}`, { rootMotion });
}

function computeModelBounds(root) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const meshBox = new THREE.Box3();
  let hasBounds = false;

  root.traverse((obj) => {
    if (obj.userData?.isToonOutline || !obj.isMesh || !obj.geometry) return;
    if (!obj.geometry.boundingBox) obj.geometry.computeBoundingBox();
    if (!obj.geometry.boundingBox) return;

    meshBox.copy(obj.geometry.boundingBox).applyMatrix4(obj.matrixWorld);
    if (!Number.isFinite(meshBox.min.x) || !Number.isFinite(meshBox.max.x)) return;
    box.union(meshBox);
    hasBounds = true;
  });

  return hasBounds ? box : null;
}

function fitModelForController(root, targetHeight) {
  const box = computeModelBounds(root);
  if (!box) return null;

  const size = box.getSize(new THREE.Vector3());
  if (size.y > 0 && targetHeight > 0) {
    root.scale.multiplyScalar(targetHeight / size.y);
  }

  root.updateMatrixWorld(true);
  const fittedBox = computeModelBounds(root);
  if (!fittedBox) return null;

  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());
  root.position.x -= fittedCenter.x;
  root.position.z -= fittedCenter.z;
  root.position.y -= fittedBox.min.y;
  root.updateMatrixWorld(true);

  return computeModelBounds(root);
}

// Untextured materials (e.g. the bundled mannequin's flat-color GLB materials)
// get their base color baked into a 1x1 sRGB texture so the anime shader runs
// its normal textured path — cel bands, rim, outline — instead of the
// no-base-map fallback. The color moves into the texture, so the material
// color resets to white to avoid tinting twice.
function bakeSolidBaseColorTextures(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (!mat || mat.map?.isTexture || !mat.color) continue;
      const srgb = mat.color.clone().convertLinearToSRGB();
      const texel = new Uint8Array([
        Math.round(THREE.MathUtils.clamp(srgb.r, 0, 1) * 255),
        Math.round(THREE.MathUtils.clamp(srgb.g, 0, 1) * 255),
        Math.round(THREE.MathUtils.clamp(srgb.b, 0, 1) * 255),
        255,
      ]);
      const texture = new THREE.DataTexture(texel, 1, 1);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
      mat.map = texture;
      mat.color.setRGB(1, 1, 1);
      mat.needsUpdate = true;
    }
  });
}

function prepareModelForRealtime(root) {
  root.traverse((obj) => {
    if (!obj.isMesh) return;
    if (obj.userData?.isToonOutline || obj.userData?.isToonFurShell) {
      obj.castShadow = false;
      obj.receiveShadow = false;
      obj.frustumCulled = false;
      return;
    }
    obj.castShadow = true;
    obj.receiveShadow = true;
    obj.frustumCulled = false;
  });
}

function loadAsync(loader, url) {
  return new Promise((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });
}

function collectBones(root) {
  const bones = [];
  root.traverse((obj) => {
    if (obj.isBone) bones.push(obj);
  });
  return bones;
}

function exposePoseDebug(root, targetMesh, mixer, actions, {
  enabled = false,
  target = globalThis,
} = {}) {
  if (!enabled || !targetMesh || !target) return;

  target.__toonCharacterPoseDebug = {
    root,
    targetMesh,
    mixer,
    actions,
    getBone(name) {
      return targetMesh.skeleton.bones.find((bone) => bone.name === name) || null;
    },
  };
}

function createArmPoseState(targetMesh, {
  mode = 'relaxed',
  zOffset = 0.7,
} = {}) {
  if (mode !== 'relaxed') return null;

  const arms = [
    { bone: targetMesh.skeleton.bones.find((candidate) => candidate.name === '左腕'), zOffset: -zOffset },
    { bone: targetMesh.skeleton.bones.find((candidate) => candidate.name === '右腕'), zOffset },
  ].filter(({ bone }) => bone);

  if (arms.length === 0) return null;

  const restRotations = arms.map(({ bone, zOffset }) => ({
    bone,
    x: bone.rotation.x,
    y: bone.rotation.y,
    z: bone.rotation.z,
    zOffset,
  }));

  return {
    apply() {
      for (const { bone, x, y, z, zOffset } of restRotations) {
        bone.rotation.set(x, y, z + zOffset);
        bone.updateMatrix();
      }

      targetMesh.updateMatrixWorld(true);
      targetMesh.skeleton.update();
    },
  };
}

function snapshotSkeletonLocalPose(targetMesh) {
  const boneStates = targetMesh.skeleton.bones.map((bone) => ({
    bone,
    position: bone.position.clone(),
    quaternion: bone.quaternion.clone(),
    scale: bone.scale.clone(),
  }));

  return () => {
    for (const { bone, position, quaternion, scale } of boneStates) {
      bone.position.copy(position);
      bone.quaternion.copy(quaternion);
      bone.scale.copy(scale);
      bone.updateMatrix();
    }

    targetMesh.updateMatrixWorld(true);
    targetMesh.skeleton.update();
  };
}

function remapMixamoClipTrackNames(
  sourceClip,
  rig,
  clipName = 'Mixamo direct retarget',
  { rootMotion = false } = {},
) {
  const tracks = [];

  for (const track of sourceClip.tracks) {
    const separatorIndex = track.name.lastIndexOf('.');
    if (separatorIndex === -1) continue;

    const sourceBoneName = normalizeMixamoBoneName(track.name.slice(0, separatorIndex));
    const propertyName = track.name.slice(separatorIndex + 1);
    const targetBoneName = rig.mixamoToTarget.get(sourceBoneName);

    if (!targetBoneName) continue;

    if (propertyName === 'quaternion') {
      const clonedTrack = track.clone();
      clonedTrack.name = `.bones[${targetBoneName}].quaternion`;
      tracks.push(clonedTrack);
    }

    if (rootMotion && propertyName === 'position' && sourceBoneName === 'mixamorigHips' && rig.hipCarrierName) {
      const clonedTrack = track.clone();
      clonedTrack.name = `.bones[${rig.hipCarrierName}].position`;
      tracks.push(clonedTrack);
    }
  }

  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks).optimize();
}

function remapMixamoClipWithRestDeltas(
  sourceClip,
  sourceBones,
  targetMesh,
  rig,
  clipName = 'Mixamo delta retarget',
  { rootMotion = false } = {},
) {
  const sourceRestByName = new Map(sourceBones.map((bone) => [
    normalizeMixamoBoneName(bone.name),
    bone.quaternion.clone(),
  ]));
  const targetRestByName = new Map(targetMesh.skeleton.bones.map((bone) => [bone.name, bone.quaternion.clone()]));
  const tracks = [];
  const sourceRestInverse = new THREE.Quaternion();
  const sourceQuat = new THREE.Quaternion();
  const targetRest = new THREE.Quaternion();
  const targetQuat = new THREE.Quaternion();

  for (const track of sourceClip.tracks) {
    const separatorIndex = track.name.lastIndexOf('.');
    if (separatorIndex === -1) continue;

    const sourceBoneName = normalizeMixamoBoneName(track.name.slice(0, separatorIndex));
    const propertyName = track.name.slice(separatorIndex + 1);
    const targetBoneName = rig.mixamoToTarget.get(sourceBoneName);

    if (!targetBoneName) continue;

    if (propertyName === 'quaternion') {
      const sourceRest = sourceRestByName.get(sourceBoneName);
      const targetRestValue = targetRestByName.get(targetBoneName);
      if (!sourceRest || !targetRestValue) continue;

      sourceRestInverse.copy(sourceRest).invert();
      targetRest.copy(targetRestValue);

      const values = new Float32Array(track.values.length);
      for (let i = 0; i < track.values.length; i += 4) {
        sourceQuat.fromArray(track.values, i);
        targetQuat.copy(targetRest)
          .multiply(sourceRestInverse)
          .multiply(sourceQuat)
          .normalize();
        targetQuat.toArray(values, i);
      }

      tracks.push(new THREE.QuaternionKeyframeTrack(
        `.bones[${targetBoneName}].quaternion`,
        track.times,
        values,
      ));
    }

    if (rootMotion && propertyName === 'position' && sourceBoneName === 'mixamorigHips' && rig.hipCarrierName) {
      const clonedTrack = track.clone();
      clonedTrack.name = `.bones[${rig.hipCarrierName}].position`;
      tracks.push(clonedTrack);
    }
  }

  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks).optimize();
}

function createSameNameSkeletonClip(
  targetMesh,
  sourceClip,
  clipName = 'Same-name skeleton retarget',
  { rootMotion = false } = {},
) {
  const targetBoneNames = new Set(targetMesh.skeleton.bones.map((bone) => bone.name));
  const tracks = sourceClip.tracks
    .filter((track) => {
      const separatorIndex = track.name.lastIndexOf('.');
      if (separatorIndex === -1) return false;

      const boneName = track.name.slice(0, separatorIndex);
      const propertyName = track.name.slice(separatorIndex + 1);
      if (!targetBoneNames.has(boneName)) return false;
      return rootMotion || propertyName !== 'position';
    })
    .map((track) => track.clone());

  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks).optimize();
}

function bakeSkeletonRetargetClip(
  targetMesh,
  sourceClip,
  sourceBones,
  rig,
  clipName = 'Mixamo skeleton retarget',
  { rootMotion = false } = {},
) {
  const sourceSkeleton = new THREE.Skeleton(sourceBones);
  const retargeted = retargetClip(targetMesh, sourceSkeleton, sourceClip, {
    names: Object.fromEntries(rig.targetToMixamo),
    hip: 'mixamorigHips',
    fps: 30,
    useFirstFramePosition: true,
    preserveBoneMatrix: true,
    preserveBonePositions: true,
    useTargetMatrix: false,
  });

  const tracks = rootMotion
    ? retargeted.tracks
    : retargeted.tracks.filter((track) => !track.name.endsWith('.position'));

  return new THREE.AnimationClip(clipName, retargeted.duration, tracks).optimize();
}

function buildTargetBoneNodes(targetMesh) {
  const targetBones = targetMesh.skeleton.bones;
  const targetBoneSet = new Set(targetBones);
  const nodes = [];

  const visit = (bone, parentIndex) => {
    const index = nodes.length;
    nodes.push({
      bone,
      parentIndex,
      restLocalQuat: bone.quaternion.clone(),
      restWorldQuat: bone.getWorldQuaternion(new THREE.Quaternion()),
      restWorldPos: bone.getWorldPosition(new THREE.Vector3()),
      parentRestWorldQuat: parentIndex === -1 && bone.parent
        ? bone.parent.getWorldQuaternion(new THREE.Quaternion())
        : null,
      source: null,
      correction: null,
      resolvedCorrection: null,
      values: null,
    });
    for (const child of bone.children) {
      if (child.isBone) visit(child, index);
    }
  };

  for (const bone of targetBones) {
    if (!targetBoneSet.has(bone.parent)) visit(bone, -1);
  }

  return nodes;
}

// Bakes the Mixamo clip by sampling it and matching each mapped target bone's
// world-space rotation delta to its Mixamo counterpart. Works regardless of
// rest-pose differences (T-pose vs A-pose) or hierarchy mismatches, because
// every mapped bone is solved in world space against the target rest pose.
// Which target bone plays which role comes from the resolved `rig`.
function bakeWorldSpaceMixamoClip(targetMesh, fbx, sourceClip, sourceBones, rig, clipName = 'Mixamo world retarget', {
  // 'full': keep the (detrended, centered) XZ sway — right for stationary
  // stance clips like idle, where the weight shift over a leg is the pose.
  // 'horizontal': keep only centered XZ weight shift — right for stationary
  // clips whose soles must remain planted on the controller's terrain.
  // 'vertical': keep only the Y bob — right for traveling clips (walk/run/
  // jump), whose XZ wander is real travel that the physics body provides.
  hipTranslationMode = 'full',
  // 'skeleton' emits ".bones[name].prop" for mixers rooted at the skinned
  // mesh; 'node' emits "name.prop" for mixers rooted at the model scene
  // (the native-clip path retargets its swim layer through here).
  trackNameStyle = 'skeleton',
  rootMotion = false,
  // Optional adapter for non-Mixamo source skeletons. The bundled ToonLab
  // mannequin is Rigify, but its resolved rig maps every source bone onto the
  // same canonical Mixamo role names used by the target adapters.
  sourceRig = null,
} = {}) {
  const fps = 30;
  const bakedTrackName = (boneName, property) => (trackNameStyle === 'node'
    ? `${boneName}.${property}`
    : `.bones[${boneName}].${property}`);

  fbx.updateMatrixWorld(true);
  const sourceByName = new Map();
  for (const bone of sourceBones) {
    const name = sourceRig?.targetToMixamo?.get(bone.name)
      ?? normalizeMixamoBoneName(bone.name);
    if (!sourceByName.has(name)) {
      sourceByName.set(name, {
        bone,
        restWorldQuat: bone.getWorldQuaternion(new THREE.Quaternion()),
        restWorldPos: bone.getWorldPosition(new THREE.Vector3()),
      });
    }
  }
  const findSource = (mixamoName) =>
    sourceByName.get(mixamoName) || sourceByName.get(mixamoName.replace(/^mixamorig/, ''));

  targetMesh.updateMatrixWorld(true);
  const nodes = buildTargetBoneNodes(targetMesh);
  const targetNodeByName = new Map();
  for (const node of nodes) {
    if (!targetNodeByName.has(node.bone.name)) targetNodeByName.set(node.bone.name, node);
  }

  for (const [targetName, mixamoName] of rig.targetToMixamo) {
    const node = targetNodeByName.get(targetName);
    const source = node ? findSource(mixamoName) : null;
    if (!node || !source) continue;
    node.source = source;

    const chainMixamoName = MIXAMO_CHAIN_CHILD[mixamoName];
    const chainSource = chainMixamoName ? findSource(chainMixamoName) : null;
    const chainTargetName = chainMixamoName ? rig.mixamoToTarget.get(chainMixamoName) : null;
    const chainNode = chainTargetName ? targetNodeByName.get(chainTargetName) : null;
    if (!chainSource || !chainNode) continue;

    const sourceDir = chainSource.restWorldPos.clone().sub(source.restWorldPos);
    const targetDir = chainNode.restWorldPos.clone().sub(node.restWorldPos);
    if (sourceDir.lengthSq() < 1e-10 || targetDir.lengthSq() < 1e-10) continue;
    node.correction = new THREE.Quaternion().setFromUnitVectors(
      targetDir.normalize(),
      sourceDir.normalize(),
    );
  }

  // Nodes are ordered parent-before-child, so corrections cascade down the
  // chain (fingers reuse the hand correction, the head reuses the neck's, ...).
  for (const node of nodes) {
    const inherited = node.parentIndex === -1 ? null : nodes[node.parentIndex].resolvedCorrection;
    node.resolvedCorrection = node.correction || inherited;
  }

  const frameCount = Math.max(2, Math.ceil(sourceClip.duration * fps) + 1);
  const times = new Float32Array(frameCount);
  const mappedNodes = nodes.filter((node) => node.source);
  for (const node of mappedNodes) node.values = new Float32Array(frameCount * 4);

  // Hip translation matters even without root motion: Mixamo clips shift the
  // hips over the supporting leg (idle) and bob them (walk/run/jump). Applying
  // only the rotations leaves the stance unbalanced — the body reads as leaning.
  // Bake the hips position onto センター, scaled to the target's hip height;
  // net travel is removed later unless root motion is requested.
  const hipsSource = findSource('mixamorigHips');
  const hipsTargetNode = targetNodeByName.get(rig.mixamoToTarget.get('mixamorigHips')) || null;
  const centerNode = (rig.hipCarrierName ? targetNodeByName.get(rig.hipCarrierName) : null) || hipsTargetNode;
  const hipSwayState = centerNode && hipsSource && hipsTargetNode ? {
    values: new Float32Array(frameCount * 3),
    restLocalPos: centerNode.bone.position.clone(),
    hipsRestWorldPos: hipsSource.restWorldPos,
    parentRestWorldQuatInverse: centerNode.bone.parent
      ? centerNode.bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
      : new THREE.Quaternion(),
    parentWorldScale: centerNode.bone.parent
      ? centerNode.bone.parent.getWorldScale(new THREE.Vector3())
      : new THREE.Vector3(1, 1, 1),
    heightScale: Math.abs(hipsSource.restWorldPos.y) > 1e-6
      ? hipsTargetNode.restWorldPos.y / hipsSource.restWorldPos.y
      : 1,
  } : null;

  const mixer = new THREE.AnimationMixer(fbx);
  mixer.clipAction(sourceClip).play();

  const worldQuats = nodes.map(() => new THREE.Quaternion());
  const sourceWorldQuat = new THREE.Quaternion();
  const deltaQuat = new THREE.Quaternion();
  const localQuat = new THREE.Quaternion();
  const hipsWorldPos = new THREE.Vector3();

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = Math.min(frame / fps, sourceClip.duration);
    times[frame] = time;
    mixer.setTime(time);
    fbx.updateMatrixWorld(true);

    for (let i = 0; i < nodes.length; i += 1) {
      const node = nodes[i];
      const parentQuat = node.parentIndex === -1
        ? node.parentRestWorldQuat
        : worldQuats[node.parentIndex];
      const worldQuat = worldQuats[i];

      if (node.source) {
        node.source.bone.getWorldQuaternion(sourceWorldQuat);
        // world delta relative to the source rest pose: D = animated * restInverse
        deltaQuat.copy(node.source.restWorldQuat).invert().premultiply(sourceWorldQuat);
        worldQuat.copy(node.restWorldQuat);
        if (node.resolvedCorrection) worldQuat.premultiply(node.resolvedCorrection);
        worldQuat.premultiply(deltaQuat);

        localQuat.copy(parentQuat ?? worldQuat).invert().multiply(worldQuat).normalize();
        localQuat.toArray(node.values, frame * 4);
      } else {
        worldQuat.copy(node.restLocalQuat);
        if (parentQuat) worldQuat.premultiply(parentQuat);
      }
    }

    if (hipSwayState) {
      // Store the raw WORLD-space delta; mode filtering must happen on world
      // axes before mapping into the carrier's parent-local frame. Rigs whose
      // carrier parent has a rest rotation (Rigify's root bone is -90° about
      // X) would otherwise get the "vertical" bob pinned on LOCAL x/z — which
      // is horizontal in the world, shoving the whole body sideways with the
      // clip's hip motion.
      hipsSource.bone.getWorldPosition(hipsWorldPos);
      hipsWorldPos.sub(hipSwayState.hipsRestWorldPos)
        .multiplyScalar(hipSwayState.heightScale);
      hipsWorldPos.toArray(hipSwayState.values, frame * 3);
    }
  }

  mixer.stopAllAction();
  mixer.uncacheRoot(fbx);

  if (hipSwayState) {
    const { values } = hipSwayState;

    if (!rootMotion && frameCount > 1) {
      if (hipTranslationMode === 'vertical') {
        // Traveling clip: its XZ path is locomotion, which the physics body
        // already provides. Keep only the vertical bob.
        for (let frame = 0; frame < frameCount; frame += 1) {
          values[frame * 3] = 0;
          values[frame * 3 + 2] = 0;
        }
      } else {
        if (hipTranslationMode === 'horizontal') {
          for (let frame = 0; frame < frameCount; frame += 1) {
            values[frame * 3 + 1] = 0;
          }
        }
        // Stationary clip: physics keeps the character in place, so the sway
        // must stay centered on the capsule. Remove the linear XZ drift, then
        // the mean, so only the oscillation is left — a constant offset would
        // hang the model outside the collider.
        const last = frameCount - 1;
        const trendX = (values[last * 3] - values[0]) / last;
        const trendZ = (values[last * 3 + 2] - values[2]) / last;
        let sumX = 0;
        let sumZ = 0;
        for (let frame = 0; frame < frameCount; frame += 1) {
          values[frame * 3] -= trendX * frame;
          values[frame * 3 + 2] -= trendZ * frame;
          sumX += values[frame * 3];
          sumZ += values[frame * 3 + 2];
        }
        const meanX = sumX / frameCount;
        const meanZ = sumZ / frameCount;
        for (let frame = 0; frame < frameCount; frame += 1) {
          values[frame * 3] -= meanX;
          values[frame * 3 + 2] -= meanZ;
        }
      }
    }

    // Map the filtered world deltas into the carrier's parent-local frame.
    for (let frame = 0; frame < frameCount; frame += 1) {
      hipsWorldPos.fromArray(values, frame * 3)
        .applyQuaternion(hipSwayState.parentRestWorldQuatInverse)
        .divide(hipSwayState.parentWorldScale)
        .add(hipSwayState.restLocalPos);
      hipsWorldPos.toArray(values, frame * 3);
    }
  }

  const tracks = mappedNodes.map((node) => new THREE.QuaternionKeyframeTrack(
    bakedTrackName(node.bone.name, 'quaternion'),
    times.slice(),
    node.values,
  ));

  if (hipSwayState) {
    tracks.push(new THREE.VectorKeyframeTrack(
      bakedTrackName(centerNode.bone.name, 'position'),
      times.slice(),
      hipSwayState.values,
    ));
  }

  return new THREE.AnimationClip(clipName, sourceClip.duration, tracks).optimize();
}

function createMixamoClipForTarget(targetMesh, fbx, sourceClip, sourceBones, rig, clipName = 'Walking retarget', retargetOptions = {}) {
  const { mode = 'world', rootMotion = false } = retargetOptions;
  const sameNameClip = createSameNameSkeletonClip(
    targetMesh,
    sourceClip,
    `${clipName} same-name`,
    { rootMotion },
  );
  if (sameNameClip.tracks.length > 0) return sameNameClip;

  if (mode === 'direct') {
    return remapMixamoClipTrackNames(sourceClip, rig, `${clipName} direct`, { rootMotion });
  }

  if (mode === 'delta') {
    return remapMixamoClipWithRestDeltas(
      sourceClip,
      sourceBones,
      targetMesh,
      rig,
      `${clipName} delta`,
      { rootMotion },
    );
  }

  if (mode === 'skeleton') {
    return bakeSkeletonRetargetClip(
      targetMesh,
      sourceClip,
      sourceBones,
      rig,
      `${clipName} skeleton`,
      { rootMotion },
    );
  }

  return bakeWorldSpaceMixamoClip(
    targetMesh,
    fbx,
    sourceClip,
    sourceBones,
    rig,
    `${clipName} world`,
    { ...retargetOptions, rootMotion },
  );
}

async function loadRetargetedMixamoClipForTarget(targetMesh, {
  animationUrl,
  clipName,
  filterClip,
  retargetOptions = {},
  rig,
}) {
  const loader = new FBXLoader();
  const fbx = await loadAsync(loader, animationUrl);
  const sourceClip = fbx.animations[0];
  const sourceBones = collectBones(fbx);

  if (!sourceClip || sourceBones.length === 0) {
    throw new Error(`${animationUrl} has no usable Mixamo skeleton animation.`);
  }

  const restoreTargetPose = snapshotSkeletonLocalPose(targetMesh);
  targetMesh.updateMatrixWorld(true);
  fbx.updateMatrixWorld(true);

  try {
    const retargetedClip = createMixamoClipForTarget(targetMesh, fbx, sourceClip, sourceBones, rig, clipName, retargetOptions);
    const filteredClip = filterClip(retargetedClip);
    if (filteredClip.tracks.length === 0) {
      throw new Error(`${animationUrl} did not retarget to any compatible bones (rig: ${rig?.type ?? 'none'}).`);
    }

    return {
      clip: filteredClip,
      sourceTrackCount: sourceClip.tracks.length,
    };
  } finally {
    restoreTargetPose();
  }
}

async function loadPackagedLocomotionClipsForTarget(targetMesh, rig, {
  bodyModes = {},
  retargetMode = 'world',
  rootMotion = false,
  sourceUrl = TOONLAB_MANNEQUIN_ASSET_URL,
  trackNameStyle = 'skeleton',
} = {}) {
  const sourceAsset = await loadModelAsset(sourceUrl);
  let sourceMesh = null;
  sourceAsset.root.traverse((object) => {
    if (!sourceMesh && object.isSkinnedMesh) sourceMesh = object;
  });
  if (!sourceMesh) {
    throw new Error('The ToonLab mannequin locomotion source has no skinned mesh.');
  }

  const sourceRig = resolveCharacterRig(sourceMesh, { vrm: sourceAsset.vrm });
  const sourceBones = collectBones(sourceAsset.root);
  if (!sourceRig || sourceBones.length === 0) {
    throw new Error('The ToonLab mannequin locomotion source has no supported humanoid rig.');
  }

  const clipsByName = new Map((sourceAsset.clips ?? []).map((clip) => [clip.name, clip]));
  const restoreSourcePose = snapshotSkeletonLocalPose(sourceMesh);
  const restoreTargetPose = snapshotSkeletonLocalPose(targetMesh);
  const specs = {
    idle: {
      clipName: 'Idle_Loop',
      filter: (clip) => filterIdleClipForBodyMode(clip, {
        bodyMode: bodyModes.idle ?? 'full',
        rootMotion,
      }),
      hipTranslationMode: 'horizontal',
      outputName: 'Idle',
    },
    walk: {
      clipName: 'Walk_Loop',
      filter: (clip) => filterWalkingClipForBodyMode(clip, {
        bodyMode: bodyModes.walk ?? 'full',
        rootMotion,
      }),
      hipTranslationMode: 'vertical',
      outputName: 'Walking',
    },
    run: {
      clipName: 'Sprint_Loop',
      filter: (clip) => filterRunningClipForBodyMode(clip, {
        bodyMode: bodyModes.run ?? 'full',
        rootMotion,
      }),
      hipTranslationMode: 'vertical',
      outputName: 'Running',
    },
    jump: {
      clipName: 'Jump_Start',
      filter: (clip) => filterJumpClipForBodyMode(clip, {
        bodyMode: bodyModes.jump ?? 'full',
        rootMotion,
      }),
      hipTranslationMode: 'vertical',
      outputName: 'Jump',
    },
    swim: {
      clipName: 'Swim_Fwd_Loop',
      filter: (clip) => clip,
      hipTranslationMode: 'vertical',
      outputName: 'Swimming',
    },
    tread: {
      clipName: 'Swim_Idle_Loop',
      filter: (clip) => clip,
      hipTranslationMode: 'vertical',
      outputName: 'TreadingWater',
    },
    dive: {
      clipName: 'Swim_Fwd_Loop',
      filter: (clip) => clip,
      hipTranslationMode: 'vertical',
      outputName: 'DiveSwim',
    },
    sit: {
      clipName: 'Sitting_Idle_Loop',
      filter: (clip) => clip,
      hipTranslationMode: 'vertical',
      outputName: 'SittingIdle',
    },
  };
  const result = {};

  try {
    for (const [role, spec] of Object.entries(specs)) {
      const sourceClip = clipsByName.get(spec.clipName);
      if (!sourceClip) continue;

      restoreSourcePose();
      restoreTargetPose();
      sourceAsset.root.updateMatrixWorld(true);
      targetMesh.updateMatrixWorld(true);
      const retargeted = createMixamoClipForTarget(
        targetMesh,
        sourceAsset.root,
        sourceClip,
        sourceBones,
        rig,
        spec.outputName,
        {
          hipTranslationMode: spec.hipTranslationMode,
          mode: retargetMode,
          rootMotion,
          sourceRig,
          trackNameStyle,
        },
      );
      const clip = spec.filter(retargeted);
      if (clip.tracks.length === 0) continue;
      result[role] = {
        clip,
        sourceTrackCount: sourceClip.tracks.length,
      };
    }
  } finally {
    restoreSourcePose();
    restoreTargetPose();
  }

  if (!result.idle || !result.walk) {
    throw new Error('The ToonLab mannequin did not retarget usable idle and walk clips.');
  }

  return {
    ...result,
    sourceUrl,
  };
}

async function loadIdleClipForTarget(targetMesh, rig, {
  animationUrl,
  bodyMode = 'full',
  retargetMode = 'world',
  rootMotion = false,
} = {}) {
  if (!animationUrl) throw new TypeError('loadIdleClipForTarget requires animationUrl.');
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl,
    clipName: 'Idle',
    filterClip: (clip) => filterIdleClipForBodyMode(clip, { bodyMode, rootMotion }),
    retargetOptions: {
      hipTranslationMode: 'horizontal',
      mode: retargetMode,
      rootMotion,
    },
    rig,
  });
}

async function loadWalkingClipForTarget(targetMesh, rig, {
  animationUrl,
  bodyMode = 'full',
  retargetMode = 'world',
  rootMotion = false,
} = {}) {
  if (!animationUrl) throw new TypeError('loadWalkingClipForTarget requires animationUrl.');
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl,
    clipName: 'Walking',
    filterClip: (clip) => filterWalkingClipForBodyMode(clip, { bodyMode, rootMotion }),
    retargetOptions: { hipTranslationMode: 'vertical', mode: retargetMode, rootMotion },
    rig,
  });
}

async function loadJumpClipForTarget(targetMesh, rig, {
  animationUrl,
  bodyMode = 'full',
  retargetMode = 'world',
  rootMotion = false,
} = {}) {
  if (!animationUrl) throw new TypeError('loadJumpClipForTarget requires animationUrl.');
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl,
    clipName: 'Jump',
    filterClip: (clip) => filterJumpClipForBodyMode(clip, { bodyMode, rootMotion }),
    retargetOptions: { hipTranslationMode: 'vertical', mode: retargetMode, rootMotion },
    rig,
  });
}

async function loadRunningClipForTarget(targetMesh, rig, {
  animationUrl,
  bodyMode = 'full',
  retargetMode = 'world',
  rootMotion = false,
} = {}) {
  if (!animationUrl) throw new TypeError('loadRunningClipForTarget requires animationUrl.');
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl,
    clipName: 'Running',
    filterClip: (clip) => filterRunningClipForBodyMode(clip, { bodyMode, rootMotion }),
    retargetOptions: { hipTranslationMode: 'vertical', mode: retargetMode, rootMotion },
    rig,
  });
}

async function loadSwimClipForTarget(targetMesh, rig, animationUrl, clipName, retargetOptions = {}) {
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl,
    clipName,
    // Swim strokes animate the whole body; keep every retargeted track.
    filterClip: (clip) => clip,
    retargetOptions: { hipTranslationMode: 'vertical', ...retargetOptions },
    rig,
  });
}

async function loadSitClipForTarget(targetMesh, rig, animationUrl, retargetOptions = {}) {
  if (!animationUrl) throw new TypeError('loadSitClipForTarget requires animationUrl.');
  return loadRetargetedMixamoClipForTarget(targetMesh, {
    animationUrl,
    clipName: 'SittingIdle',
    // Seated pose animates the whole body; keep every retargeted track.
    filterClip: (clip) => clip,
    // 'vertical' pins horizontal hip drift but keeps the chair-height hip
    // drop that makes the pose read as sitting.
    retargetOptions: { hipTranslationMode: 'vertical', ...retargetOptions },
    rig,
  });
}

export {
  computeModelBounds,
  fitModelForController,
  bakeSolidBaseColorTextures,
  prepareModelForRealtime,
  loadAsync,
  collectBones,
  exposePoseDebug,
  createArmPoseState,
  snapshotSkeletonLocalPose,
  loadRetargetedMixamoClipForTarget,
  loadPackagedLocomotionClipsForTarget,
  loadIdleClipForTarget,
  loadWalkingClipForTarget,
  loadJumpClipForTarget,
  loadRunningClipForTarget,
  loadSwimClipForTarget,
  loadSitClipForTarget,
  NATIVE_LOCOMOTION_CLIP_NAMES,
  resolveNativeLocomotionClips,
};
