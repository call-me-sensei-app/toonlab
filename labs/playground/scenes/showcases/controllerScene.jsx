import React, { useRef } from 'react';
import { CuboidCollider, RigidBody } from '@react-three/rapier';

import {
  BODY_CENTER_AT_REST,
} from '../../params.js';
import { WalkableSceneHost } from './WalkableSceneHost.jsx';

export const CONTROLLER_SCENE = Object.freeze({
  aliases: Object.freeze(['controller']),
  id: 'controller',
  label: 'Controller Stage',
});

const FLAT_GROUND = () => 0;

export function ControllerScene({ cameraMode = 'follow', services, visualYOffset = 0 }) {
  const controllerRef = useRef(null);
  return (
    <>
      <color attach="background" args={['#1a1a1a']} />
      <ambientLight intensity={0.42} color={0xa8b7d4} />
      <hemisphereLight intensity={0.36} color={0xe8f0ff} groundColor={0x2b2630} />
      <directionalLight castShadow intensity={1.25} position={[3.5, 5.2, 4.2]} shadow-mapSize={[2048, 2048]} />
      <WalkableSceneHost
        cameraMode={cameraMode}
        controllerRef={controllerRef}
        ground={FLAT_GROUND}
        services={services}
        visualYOffset={visualYOffset}
        controllerProps={{
          autoBalanceDampingC: 0.045,
          autoBalanceSpringK: 0.35,
          camInitDir: { x: 0.1, y: 0 },
          camInitDis: -3.6,
          camMaxDis: -7,
          camMinDis: -2.6,
          camTargetPos: { x: 0, y: -0.75, z: 0 },
          jumpVel: 4.2,
          maxVelLimit: 2.6,
          position: [0, BODY_CENTER_AT_REST, 0],
          rayHitForgiveness: 0.18,
          sprintMult: 1.85,
          turnSpeed: 13,
        }}
        physicsAfter={(
          <RigidBody type="fixed" colliders={false}>
            <CuboidCollider args={[24, 1, 24]} position={[0, -1, 0]} friction={1.2} />
          </RigidBody>
        )}
      />
      <mesh receiveShadow rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.002, 0]}>
        <planeGeometry args={[48, 48]} />
        <meshStandardMaterial color={0x2d2f31} roughness={0.92} />
      </mesh>
    </>
  );
}
