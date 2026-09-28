import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { useBeforePhysicsStep } from '@react-three/rapier';

import {
  createWalkableCharacterRuntime,
  targetBoneNameForRole,
} from '@call-me-sensei/toonlab/character';
import { mountCharacterToonHud } from './characterHud.js';
import { updateAnimationToggle, updateModeLabel } from './hud.js';
import {
  BODY_CENTER_AT_REST,
  ENABLE_NATIVE_ANIMATION,
  ENABLE_IDLE_ANIMATION,
  ENABLE_JUMP_ANIMATION,
  ENABLE_LOCOMOTION_ANIMATION,
  ENABLE_ROOT_MOTION,
  ENABLE_RUNNING_ANIMATION,
  ENABLE_SWIM_ANIMATION,
  ENABLE_WALKING_ANIMATION,
  IDLE_BODY_MODE,
  MODEL_URL,
  RETARGET_MODE,
  RUNNING_BODY_MODE,
  SIT_VISUAL_DROP,
  SWIM_DIVE_SPEED,
  SWIM_ENTER_DEPTH,
  SWIM_EXIT_DEPTH,
  SWIM_SPEED,
  SWIM_SPRINT_SPEED,
  SWIM_SURFACE_OFFSET,
  SWIM_VERTICAL_SPEED,
  SWIM_VISUAL_LIFT,
  SWIM_VISUAL_PIVOT_SHIFT,
  TARGET_MODEL_HEIGHT,
  URL_PARAMS,
  WALKING_BODY_MODE,
  JUMP_BODY_MODE,
} from './params.js';

const MOVE_CODES = new Set([
  'KeyW', 'KeyA', 'KeyS', 'KeyD',
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
]);
const SIT_QUATERNION = new THREE.Quaternion();
const SIT_EULER = new THREE.Euler();
const HEAD_POSITION = new THREE.Vector3();
const HIPS_POSITION = new THREE.Vector3();
const DEFAULT_GROUND = () => 0;

function LoadingLabel({ children }) {
  return (
    <Html center>
      <div className="scene-status">{children}</div>
    </Html>
  );
}

function runtimeActionsArray(actions) {
  return Object.entries(actions ?? {})
    .filter(([key, action]) => key !== 'clips' && typeof action?.play === 'function')
    .map(([, action]) => action);
}

export function ShowcaseCharacter({
  controllerRef,
  ground = DEFAULT_GROUND,
  sitStateRef = null,
  swimStateRef = null,
  visualYOffset = 0,
  waterApiRef = null,
}) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const runtimeRef = useRef(null);
  const walkableRuntimeRef = useRef(null);
  const visualGroupRef = useRef(null);
  const facingBonesRef = useRef(null);
  const inputRef = useRef({ diving: false, jump: false, jumpHeld: false, moving: false, sprint: false });
  const jumpReleaseUntilRef = useRef(0);
  const heldMoves = useMemo(() => new Set(), []);
  const moveForward = useMemo(() => new THREE.Vector3(), []);
  const moveRight = useMemo(() => new THREE.Vector3(), []);
  const worldUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const [state, setState] = useState({ error: null, runtime: null });

  useEffect(() => {
    let cancelled = false;
    let cleanupButton = updateAnimationToggle({ label: 'Controller Loading' });
    let cleanupHud = () => {};
    const abort = new AbortController();

    createWalkableCharacterRuntime({
      camera,
      character: {
        animation: {
          bodyModes: {
            idle: IDLE_BODY_MODE,
            jump: JUMP_BODY_MODE,
            run: RUNNING_BODY_MODE,
            walk: WALKING_BODY_MODE,
          },
          enabled: ENABLE_NATIVE_ANIMATION || ENABLE_IDLE_ANIMATION || ENABLE_WALKING_ANIMATION,
          freestyle: ENABLE_SWIM_ANIMATION && URL_PARAMS.get('freestyleAnim') !== 'none',
          retargetMode: RETARGET_MODE,
          roles: [
            'idle',
            ...(ENABLE_LOCOMOTION_ANIMATION ? ['walk'] : []),
            ...(ENABLE_RUNNING_ANIMATION ? ['run'] : []),
            ...(ENABLE_JUMP_ANIMATION ? ['jump'] : []),
            ...(ENABLE_SWIM_ANIMATION ? ['swim', 'tread', 'dive'] : []),
            'sit',
          ],
          rootMotion: ENABLE_ROOT_MOTION,
        },
        onStage({ stage }) {
          document.body.dataset.characterLoadStage = stage;
        },
        renderer: gl,
        signal: abort.signal,
        targetHeight: TARGET_MODEL_HEIGHT,
        // The Walkable Sample demonstrates bundle routing, so preserve the
        // imported source materials until the scene style runtime discovers
        // this labeled character. Pre-applying the toon preset here would
        // make the inspector apply it a second time and "off" would no longer
        // mean the exact imported source state.
        styleTarget: { targetId: 'walkable/character' },
        toon: false,
        url: MODEL_URL,
      },
      controller: { targetHeight: TARGET_MODEL_HEIGHT },
      ground,
      renderer: gl,
      scene,
      // Ecctrl already owns suspension, contact locking, and upright balance.
      // Keep fall-through recovery, but do not teleport or rotate the same
      // rigid body every render frame in competition with that controller.
      groundStabilizer: { lockGrounded: false },
      waterInteraction: {
        diveSpeed: SWIM_DIVE_SPEED,
        enterDepth: SWIM_ENTER_DEPTH,
        exitDepth: SWIM_EXIT_DEPTH,
        speed: SWIM_SPEED,
        sprintSpeed: SWIM_SPRINT_SPEED,
        surfaceOffset: SWIM_SURFACE_OFFSET,
        verticalSpeed: SWIM_VERTICAL_SPEED,
      },
    }).then((walkableRuntime) => {
      if (cancelled) {
        walkableRuntime.dispose();
        return;
      }
      const runtime = walkableRuntime.character;
      walkableRuntimeRef.current = walkableRuntime;
      runtimeRef.current = runtime;
      const boneByRole = (role) => {
        const name = runtime.rig ? targetBoneNameForRole(runtime.rig, role) : null;
        return runtime.targetMesh?.skeleton?.bones.find((bone) => bone.name === name) ?? null;
      };
      facingBonesRef.current = { head: boneByRole('head'), hips: boneByRole('hips') };
      cleanupHud = mountCharacterToonHud({
        initialSettings: runtime.toonState?.settings,
        modelRoot: runtime.modelRoot,
      });
      cleanupButton();
      const actionList = runtimeActionsArray(runtime.actions);
      cleanupButton = updateAnimationToggle({
        actions: actionList,
        enabled: actionList.length > 0,
        label: 'Controller On',
      });
      document.body.dataset.animationReady = actionList.length ? 'true' : 'none';
      document.body.dataset.animationSource = runtime.animationSource;
      document.body.dataset.rigType = runtime.rig?.type ?? 'none';
      document.body.dataset.modelFormat = runtime.format;
      document.body.dataset.modelUrl = MODEL_URL;
      document.body.dataset.convertedMeshCount = String(runtime.toonState?.convertedMeshCount ?? 0);
      document.body.dataset.modelBoundsHeight = runtime.bounds
        ? runtime.bounds.getSize(new THREE.Vector3()).y.toFixed(3)
        : '0';
      document.body.dataset.modelReady = 'true';
      updateModeLabel('ready');
      setState({ error: null, runtime });
    }).catch((error) => {
      if (cancelled || error?.name === 'AbortError') return;
      console.error('Failed to create showcase character runtime:', error);
      document.body.dataset.modelReady = 'error';
      document.body.dataset.animationReady = 'error';
      document.body.dataset.characterLoadError = error?.message || String(error);
      updateModeLabel('error');
      setState({ error, runtime: null });
    });

    return () => {
      cancelled = true;
      abort.abort();
      cleanupButton();
      cleanupHud();
      walkableRuntimeRef.current?.dispose();
      walkableRuntimeRef.current = null;
      runtimeRef.current = null;
      facingBonesRef.current = null;
    };
  }, [camera, gl, ground, scene]);

  useEffect(() => {
    const input = inputRef.current;
    const down = (event) => {
      if (event.key === 'Shift') input.sprint = true;
      if (event.code === 'Space') {
        if (!input.jumpHeld) input.jump = true;
        input.jumpHeld = true;
        jumpReleaseUntilRef.current = performance.now() + 450;
      }
      if (event.code === 'KeyC' || event.code === 'ControlLeft' || event.code === 'ControlRight') {
        input.diving = true;
      }
      if (MOVE_CODES.has(event.code)) {
        heldMoves.add(event.code);
        input.moving = true;
      }
    };
    const up = (event) => {
      if (event.key === 'Shift') input.sprint = false;
      if (event.code === 'Space') input.jumpHeld = false;
      if (event.code === 'KeyC' || event.code === 'ControlLeft' || event.code === 'ControlRight') {
        input.diving = false;
      }
      if (MOVE_CODES.has(event.code)) {
        heldMoves.delete(event.code);
        input.moving = heldMoves.size > 0;
      }
    };
    const blur = () => {
      heldMoves.clear();
      Object.assign(input, {
        diving: false,
        jump: false,
        jumpHeld: false,
        moving: false,
        sprint: false,
      });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, [heldMoves]);

  useBeforePhysicsStep(() => {
    walkableRuntimeRef.current?.enforce(controllerRef.current?.group);
  });

  useFrame((_, delta) => {
    const walkableRuntime = walkableRuntimeRef.current;
    const body = controllerRef.current?.group;
    if (!walkableRuntime || !body) return;
    const input = inputRef.current;
    camera.getWorldDirection(moveForward);
    moveForward.y = 0;
    if (moveForward.lengthSq() < 1e-6) moveForward.set(0, 0, -1);
    moveForward.normalize();
    moveRight.crossVectors(moveForward, worldUp);
    let moveX = 0;
    let moveZ = 0;
    if (heldMoves.has('KeyW') || heldMoves.has('ArrowUp')) {
      moveX += moveForward.x; moveZ += moveForward.z;
    }
    if (heldMoves.has('KeyS') || heldMoves.has('ArrowDown')) {
      moveX -= moveForward.x; moveZ -= moveForward.z;
    }
    if (heldMoves.has('KeyD') || heldMoves.has('ArrowRight')) {
      moveX += moveRight.x; moveZ += moveRight.z;
    }
    if (heldMoves.has('KeyA') || heldMoves.has('ArrowLeft')) {
      moveX -= moveRight.x; moveZ -= moveRight.z;
    }
    const runtimeFrame = walkableRuntime.update({
      body,
      diving: input.diving,
      facingYaw: swimStateRef?.current?.facingYaw,
      jumpPressed: input.jump,
      jumpReleased: performance.now() < jumpReleaseUntilRef.current,
      move: { x: moveX, z: moveZ },
      moving: input.moving,
      rising: input.jumpHeld,
      sitting: Boolean(sitStateRef?.current?.sitting),
      sprinting: input.sprint,
      swimSprinting: input.sprint,
      upright: false,
      water: waterApiRef?.current,
    }, delta);
    input.jump = false;
    if (!runtimeFrame) return;
    const weights = runtimeFrame.locomotion.weights;
    const swimWeight = THREE.MathUtils.clamp(
      weights.swim + weights.tread + weights.dive + weights.freestyle,
      0,
      1,
    );
    const sitWeight = weights.sit;
    if (visualGroupRef.current) {
      visualGroupRef.current.position.z = swimWeight * SWIM_VISUAL_PIVOT_SHIFT;
      visualGroupRef.current.position.y = -BODY_CENTER_AT_REST + visualYOffset
        + swimWeight * SWIM_VISUAL_LIFT
        - sitWeight * SIT_VISUAL_DROP;
      const seatYaw = sitStateRef?.current?.seatYaw;
      if (sitWeight > 0.005 && Number.isFinite(seatYaw) && visualGroupRef.current.parent) {
        visualGroupRef.current.parent.getWorldQuaternion(SIT_QUATERNION);
        SIT_EULER.setFromQuaternion(SIT_QUATERNION, 'YXZ');
        const turn = THREE.MathUtils.euclideanModulo(seatYaw - SIT_EULER.y + Math.PI, Math.PI * 2) - Math.PI;
        visualGroupRef.current.rotation.y = turn * sitWeight;
      } else visualGroupRef.current.rotation.y = 0;
    }

    const facing = facingBonesRef.current;
    if (swimStateRef?.current && facing?.head && facing?.hips) {
      HEAD_POSITION.setFromMatrixPosition(facing.head.matrixWorld);
      HIPS_POSITION.setFromMatrixPosition(facing.hips.matrixWorld);
      HEAD_POSITION.sub(HIPS_POSITION);
      HEAD_POSITION.y = 0;
      swimStateRef.current.facingYaw = HEAD_POSITION.lengthSq() > 0.09
        ? Math.atan2(HEAD_POSITION.x, HEAD_POSITION.z)
        : NaN;
    }
    if (swimStateRef?.current) {
      Object.assign(swimStateRef.current, {
        diving: runtimeFrame.water.diving,
        planarSpeed: runtimeFrame.water.planarSpeed,
        sprinting: runtimeFrame.water.sprinting,
        surfaced: runtimeFrame.water.surfaced,
        swimming: runtimeFrame.water.swimming,
      });
    }
    document.body.dataset.swimMode = runtimeFrame.water.active
      ? runtimeFrame.water.state
      : 'off';
    document.body.dataset.swimDepth = runtimeFrame.water.active
      ? (runtimeFrame.water.waterHeight - runtimeFrame.position.y).toFixed(2)
      : '0.00';
    document.body.dataset.waterGroundHeight = Number(runtimeFrame.ground.groundHeight).toFixed(3);
    document.body.dataset.waterControllerStabilized = String(runtimeFrame.ground.correction === 'recover');
    document.body.dataset.waterGroundLocked = String(runtimeFrame.ground.correction === 'lock');
    document.body.dataset.idleAnimationWeight = weights.idle.toFixed(3);
    document.body.dataset.walkingAnimationWeight = weights.walk.toFixed(3);
    document.body.dataset.runningAnimationWeight = weights.run.toFixed(3);
    document.body.dataset.jumpAnimationWeight = weights.jump.toFixed(3);
    document.body.dataset.swimAnimationWeight = weights.swim.toFixed(3);
    document.body.dataset.treadAnimationWeight = weights.tread.toFixed(3);
    document.body.dataset.diveAnimationWeight = weights.dive.toFixed(3);
    document.body.dataset.freestyleAnimationWeight = weights.freestyle.toFixed(3);
    document.body.dataset.sitAnimationWeight = weights.sit.toFixed(3);
    document.body.dataset.planarSpeed = Math.hypot(
      runtimeFrame.velocity.x,
      runtimeFrame.velocity.z,
    ).toFixed(3);
  });

  if (state.error) return <LoadingLabel>Failed to load character</LoadingLabel>;
  if (!state.runtime) return <LoadingLabel>Loading character</LoadingLabel>;
  return (
    <group
      ref={visualGroupRef}
      position={[0, -BODY_CENTER_AT_REST + visualYOffset, 0]}
      userData={{ skipWaterReflection: true }}
    >
      <primitive object={state.runtime.carrier} />
    </group>
  );
}
