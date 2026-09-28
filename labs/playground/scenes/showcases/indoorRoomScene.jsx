import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { CuboidCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';

import {
  BODY_CENTER_AT_REST,
  INDOOR_ENVIRONMENT_SIZE,
} from '../../params.js';
import {
  IndoorBackdrop,
  IndoorSceneDebugProbe,
  useIndoorEnvironment,
} from '../indoorScene.jsx';
import { WalkableSceneHost } from './WalkableSceneHost.jsx';

export const INDOOR_ROOM_SCENE = Object.freeze({
  aliases: Object.freeze(['indoor', 'liyue']),
  id: 'indoor-room',
  label: 'Indoor Room',
});

export function IndoorRoomScene({ cameraMode = 'follow', services, visualYOffset = 0 }) {
  const controllerRef = useRef(null);
  const environment = useIndoorEnvironment();
  const roomSize = environment?.box?.getSize(new THREE.Vector3()) ?? null;
  const spawnPosition = environment
    ? [0, environment.floorY + BODY_CENTER_AT_REST + 0.25, 0]
    : [0, BODY_CENTER_AT_REST, 0];
  const ground = useMemo(() => () => environment?.floorY ?? 0, [environment?.floorY]);

  return (
    <>
      <IndoorSceneDebugProbe />
      <color attach="background" args={['#101216']} />
      <ambientLight intensity={0.5} color={0xbfc8dd} />
      <hemisphereLight intensity={0.32} color={0xf4e9d4} groundColor={0x3a3128} />
      <directionalLight
        castShadow
        intensity={1.35}
        color={0xffe3b8}
        position={roomSize ? [roomSize.x * 0.32, roomSize.y * 1.7, -roomSize.z * 1.4] : [2.5, 8, -9]}
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={9}
        shadow-camera-bottom={-8}
        shadow-camera-far={40}
        shadow-bias={-0.0001}
        shadow-normalBias={0.01}
      />
      {roomSize && (
        <>
          <pointLight color={0xffc27a} intensity={1.9} distance={Math.max(3.5, roomSize.y * 1.6)} decay={1.6} position={[-roomSize.x * 0.2, roomSize.y * 0.82, 0]} />
          <pointLight color={0xffc27a} intensity={1.9} distance={Math.max(3.5, roomSize.y * 1.6)} decay={1.6} position={[roomSize.x * 0.2, roomSize.y * 0.82, -roomSize.z * 0.14]} />
        </>
      )}
      {environment && <primitive object={environment.root} />}
      {environment && <IndoorBackdrop box={environment.box} />}
      <WalkableSceneHost
        cameraMode={cameraMode}
        controllerRef={controllerRef}
        enabled={Boolean(environment)}
        ground={ground}
        services={services}
        visualYOffset={visualYOffset}
        controllerProps={{
          autoBalanceDampingC: 0.045,
          autoBalanceSpringK: 0.35,
          camInitDir: { x: 0.12, y: 0 },
          camInitDis: -2.9,
          camMaxDis: -4.2,
          camMinDis: -1.6,
          camTargetPos: { x: 0, y: -0.75, z: 0 },
          ccd: true,
          jumpVel: 4.0,
          maxVelLimit: 2.35,
          position: spawnPosition,
          rayHitForgiveness: 0.18,
          sprintMult: 1.55,
          turnSpeed: 13,
        }}
        physicsBefore={environment && (
          <RigidBody type="fixed" colliders={false}>
            {environment.trimesh && <TrimeshCollider args={[environment.trimesh.vertices, environment.trimesh.indices]} friction={1.1} />}
            <CuboidCollider args={[INDOOR_ENVIRONMENT_SIZE * 2, 1, INDOOR_ENVIRONMENT_SIZE * 2]} position={[0, environment.floorY - 1.4, 0]} friction={1.2} />
          </RigidBody>
        )}
      />
    </>
  );
}
