// Mixamo-to-target bone retargeting for the Boxing.fbx demo animation.

import * as THREE from 'three';
import { retargetClip } from 'three/examples/jsm/utils/SkeletonUtils.js';

import { URL_PARAMS } from './params.js';

const ENABLE_ROOT_MOTION = URL_PARAMS.get('rootMotion') === '1';
export const RETARGET_MODE = URL_PARAMS.get('retarget') || 'delta';

const TARGET_TO_MIXAMO_BONE = {
  下半身: 'mixamorigHips',
  上半身: 'mixamorigSpine',
  上半身3: 'mixamorigSpine1',
  上半身2: 'mixamorigSpine2',
  首: 'mixamorigNeck',
  頭: 'mixamorigHead',

  左肩: 'mixamorigLeftShoulder',
  左腕: 'mixamorigLeftArm',
  左ひじ: 'mixamorigLeftForeArm',
  左手首: 'mixamorigLeftHand',
  右肩: 'mixamorigRightShoulder',
  右腕: 'mixamorigRightArm',
  右ひじ: 'mixamorigRightForeArm',
  右手首: 'mixamorigRightHand',

  左親指０: 'mixamorigLeftHandThumb1',
  左親指１: 'mixamorigLeftHandThumb2',
  左親指２: 'mixamorigLeftHandThumb3',
  左人指１: 'mixamorigLeftHandIndex1',
  左人指２: 'mixamorigLeftHandIndex2',
  左人指３: 'mixamorigLeftHandIndex3',
  左中指１: 'mixamorigLeftHandMiddle1',
  左中指２: 'mixamorigLeftHandMiddle2',
  左中指３: 'mixamorigLeftHandMiddle3',
  左薬指１: 'mixamorigLeftHandRing1',
  左薬指２: 'mixamorigLeftHandRing2',
  左薬指３: 'mixamorigLeftHandRing3',
  左小指１: 'mixamorigLeftHandPinky1',
  左小指２: 'mixamorigLeftHandPinky2',
  左小指３: 'mixamorigLeftHandPinky3',

  右親指０: 'mixamorigRightHandThumb1',
  右親指１: 'mixamorigRightHandThumb2',
  右親指２: 'mixamorigRightHandThumb3',
  右人指１: 'mixamorigRightHandIndex1',
  右人指２: 'mixamorigRightHandIndex2',
  右人指３: 'mixamorigRightHandIndex3',
  右中指１: 'mixamorigRightHandMiddle1',
  右中指２: 'mixamorigRightHandMiddle2',
  右中指３: 'mixamorigRightHandMiddle3',
  右薬指１: 'mixamorigRightHandRing1',
  右薬指２: 'mixamorigRightHandRing2',
  右薬指３: 'mixamorigRightHandRing3',
  右小指１: 'mixamorigRightHandPinky1',
  右小指２: 'mixamorigRightHandPinky2',
  右小指３: 'mixamorigRightHandPinky3',

  左足: 'mixamorigLeftUpLeg',
  左ひざ: 'mixamorigLeftLeg',
  左足首: 'mixamorigLeftFoot',
  左つま先: 'mixamorigLeftToeBase',
  右足: 'mixamorigRightUpLeg',
  右ひざ: 'mixamorigRightLeg',
  右足首: 'mixamorigRightFoot',
  右つま先: 'mixamorigRightToeBase',
};

const MIXAMO_TO_TARGET_BONE = Object.entries(TARGET_TO_MIXAMO_BONE)
  .reduce((result, [targetName, mixamoName]) => {
    result[mixamoName] = targetName;
    return result;
  }, {});

export function collectBones(root) {
  const bones = [];
  root.traverse((obj) => {
    if (obj.isBone) bones.push(obj);
  });
  return bones;
}

function remapMixamoClipTrackNames(sourceClip) {
  const tracks = [];

  for (const track of sourceClip.tracks) {
    const separatorIndex = track.name.lastIndexOf('.');
    if (separatorIndex === -1) continue;

    const sourceBoneName = track.name.slice(0, separatorIndex);
    const propertyName = track.name.slice(separatorIndex + 1);
    const targetBoneName = MIXAMO_TO_TARGET_BONE[sourceBoneName];

    if (!targetBoneName) continue;

    if (propertyName === 'quaternion') {
      const clonedTrack = track.clone();
      clonedTrack.name = `.bones[${targetBoneName}].quaternion`;
      tracks.push(clonedTrack);
    }

    if (ENABLE_ROOT_MOTION && propertyName === 'position' && sourceBoneName === 'mixamorigHips') {
      const clonedTrack = track.clone();
      clonedTrack.name = '.bones[センター].position';
      tracks.push(clonedTrack);
    }
  }

  return new THREE.AnimationClip('Boxing direct retarget', sourceClip.duration, tracks).optimize();
}

function remapMixamoClipWithRestDeltas(sourceClip, sourceBones, targetMesh) {
  const sourceRestByName = new Map(sourceBones.map((bone) => [bone.name, bone.quaternion.clone()]));
  const targetRestByName = new Map(targetMesh.skeleton.bones.map((bone) => [bone.name, bone.quaternion.clone()]));
  const tracks = [];
  const sourceRestInverse = new THREE.Quaternion();
  const sourceQuat = new THREE.Quaternion();
  const targetRest = new THREE.Quaternion();
  const targetQuat = new THREE.Quaternion();

  for (const track of sourceClip.tracks) {
    const separatorIndex = track.name.lastIndexOf('.');
    if (separatorIndex === -1) continue;

    const sourceBoneName = track.name.slice(0, separatorIndex);
    const propertyName = track.name.slice(separatorIndex + 1);
    const targetBoneName = MIXAMO_TO_TARGET_BONE[sourceBoneName];

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

    if (ENABLE_ROOT_MOTION && propertyName === 'position' && sourceBoneName === 'mixamorigHips') {
      const clonedTrack = track.clone();
      clonedTrack.name = '.bones[センター].position';
      tracks.push(clonedTrack);
    }
  }

  return new THREE.AnimationClip('Boxing delta retarget', sourceClip.duration, tracks).optimize();
}

function bakeSkeletonRetargetClip(targetMesh, sourceClip, sourceBones) {
  const sourceSkeleton = new THREE.Skeleton(sourceBones);
  const retargeted = retargetClip(targetMesh, sourceSkeleton, sourceClip, {
    names: TARGET_TO_MIXAMO_BONE,
    hip: 'mixamorigHips',
    fps: 30,
    useFirstFramePosition: true,
    preserveMatrix: URL_PARAMS.get('preserveMatrix') === '0' ? false : undefined,
    preservePosition: URL_PARAMS.get('preservePosition') === '0' ? false : true,
    preserveHipPosition: URL_PARAMS.get('preserveHipPosition') === '1',
    useTargetMatrix: URL_PARAMS.get('useTargetMatrix') === '1',
  });

  const tracks = ENABLE_ROOT_MOTION
    ? retargeted.tracks
    : retargeted.tracks.filter((track) => !track.name.endsWith('.position'));

  return new THREE.AnimationClip('Boxing skeleton retarget', retargeted.duration, tracks).optimize();
}

function createSameNameSkeletonClip(targetMesh, sourceClip) {
  const targetBoneNames = new Set(targetMesh.skeleton.bones.map((bone) => bone.name));
  const tracks = sourceClip.tracks
    .filter((track) => {
      const separatorIndex = track.name.lastIndexOf('.');
      if (separatorIndex === -1) return false;

      const boneName = track.name.slice(0, separatorIndex);
      const propertyName = track.name.slice(separatorIndex + 1);
      if (!targetBoneNames.has(boneName)) return false;
      return ENABLE_ROOT_MOTION || propertyName !== 'position';
    })
    .map((track) => track.clone());

  return new THREE.AnimationClip('Boxing same-name skeleton', sourceClip.duration, tracks).optimize();
}

export function createBoxingClipForTarget(targetMesh, sourceClip, sourceBones) {
  const sameNameClip = createSameNameSkeletonClip(targetMesh, sourceClip);
  if (sameNameClip.tracks.length > 0) return sameNameClip;

  if (RETARGET_MODE === 'skeleton') {
    return bakeSkeletonRetargetClip(targetMesh, sourceClip, sourceBones);
  }

  if (RETARGET_MODE === 'direct') {
    return remapMixamoClipTrackNames(sourceClip);
  }

  return remapMixamoClipWithRestDeltas(sourceClip, sourceBones, targetMesh);
}
