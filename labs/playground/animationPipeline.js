// Playground compatibility bindings for the package-owned character runtime.
// Scene/query choices are bound here; retargeting, fitting, clip resolution,
// and model preparation live in @call-me-sensei/toonlab/character.
import {
  bakeSolidBaseColorTextures,
  collectBones,
  computeModelBounds,
  createArmPoseState as createSharedArmPoseState,
  exposePoseDebug as exposeSharedPoseDebug,
  fitModelForController,
  loadAsync,
  loadIdleClipForTarget as loadSharedIdleClipForTarget,
  loadJumpClipForTarget as loadSharedJumpClipForTarget,
  loadPackagedLocomotionClipsForTarget as loadSharedPackagedLocomotionClipsForTarget,
  loadRetargetedMixamoClipForTarget as loadSharedRetargetedMixamoClipForTarget,
  loadRunningClipForTarget as loadSharedRunningClipForTarget,
  loadSitClipForTarget as loadSharedSitClipForTarget,
  loadSwimClipForTarget as loadSharedSwimClipForTarget,
  loadWalkingClipForTarget as loadSharedWalkingClipForTarget,
  NATIVE_LOCOMOTION_CLIP_NAMES,
  prepareModelForRealtime,
  resolveNativeLocomotionClips,
  snapshotSkeletonLocalPose,
} from '@call-me-sensei/toonlab/character';

import {
  ARM_POSE_MODE,
  ENABLE_POSE_DEBUG,
  ENABLE_ROOT_MOTION,
  IDLE_ANIMATION_URL,
  IDLE_BODY_MODE,
  JUMP_ANIMATION_URL,
  JUMP_BODY_MODE,
  RELAXED_ARM_Z_OFFSET,
  RETARGET_MODE,
  RUNNING_ANIMATION_URL,
  RUNNING_BODY_MODE,
  SIT_ANIMATION_URL,
  WALKING_ANIMATION_URL,
  WALKING_BODY_MODE,
} from './params.js';

const retargetOptions = () => ({
  retargetMode: RETARGET_MODE,
  rootMotion: ENABLE_ROOT_MOTION,
});

function exposePoseDebug(root, targetMesh, mixer, actions) {
  return exposeSharedPoseDebug(root, targetMesh, mixer, actions, {
    enabled: ENABLE_POSE_DEBUG,
    target: globalThis,
  });
}

function createArmPoseState(targetMesh) {
  return createSharedArmPoseState(targetMesh, {
    mode: ARM_POSE_MODE,
    zOffset: RELAXED_ARM_Z_OFFSET,
  });
}

function loadRetargetedMixamoClipForTarget(targetMesh, options) {
  return loadSharedRetargetedMixamoClipForTarget(targetMesh, {
    ...options,
    retargetOptions: {
      mode: RETARGET_MODE,
      rootMotion: ENABLE_ROOT_MOTION,
      ...(options?.retargetOptions ?? {}),
    },
  });
}

function loadPackagedLocomotionClipsForTarget(targetMesh, rig) {
  return loadSharedPackagedLocomotionClipsForTarget(targetMesh, rig, {
    bodyModes: {
      idle: IDLE_BODY_MODE,
      jump: JUMP_BODY_MODE,
      run: RUNNING_BODY_MODE,
      walk: WALKING_BODY_MODE,
    },
    ...retargetOptions(),
  });
}

function loadIdleClipForTarget(targetMesh, rig) {
  return loadSharedIdleClipForTarget(targetMesh, rig, {
    animationUrl: IDLE_ANIMATION_URL,
    bodyMode: IDLE_BODY_MODE,
    ...retargetOptions(),
  });
}

function loadWalkingClipForTarget(targetMesh, rig) {
  return loadSharedWalkingClipForTarget(targetMesh, rig, {
    animationUrl: WALKING_ANIMATION_URL,
    bodyMode: WALKING_BODY_MODE,
    ...retargetOptions(),
  });
}

function loadJumpClipForTarget(targetMesh, rig) {
  return loadSharedJumpClipForTarget(targetMesh, rig, {
    animationUrl: JUMP_ANIMATION_URL,
    bodyMode: JUMP_BODY_MODE,
    ...retargetOptions(),
  });
}

function loadRunningClipForTarget(targetMesh, rig) {
  return loadSharedRunningClipForTarget(targetMesh, rig, {
    animationUrl: RUNNING_ANIMATION_URL,
    bodyMode: RUNNING_BODY_MODE,
    ...retargetOptions(),
  });
}

function loadSwimClipForTarget(targetMesh, rig, animationUrl, clipName, options = {}) {
  return loadSharedSwimClipForTarget(targetMesh, rig, animationUrl, clipName, {
    mode: RETARGET_MODE,
    rootMotion: ENABLE_ROOT_MOTION,
    ...options,
  });
}

function loadSitClipForTarget(targetMesh, rig, options = {}) {
  return loadSharedSitClipForTarget(targetMesh, rig, SIT_ANIMATION_URL, {
    mode: RETARGET_MODE,
    rootMotion: ENABLE_ROOT_MOTION,
    ...options,
  });
}

export {
  bakeSolidBaseColorTextures,
  collectBones,
  computeModelBounds,
  createArmPoseState,
  exposePoseDebug,
  fitModelForController,
  loadAsync,
  loadIdleClipForTarget,
  loadJumpClipForTarget,
  loadPackagedLocomotionClipsForTarget,
  loadRetargetedMixamoClipForTarget,
  loadRunningClipForTarget,
  loadSitClipForTarget,
  loadSwimClipForTarget,
  loadWalkingClipForTarget,
  NATIVE_LOCOMOTION_CLIP_NAMES,
  prepareModelForRealtime,
  resolveNativeLocomotionClips,
  snapshotSkeletonLocalPose,
};
