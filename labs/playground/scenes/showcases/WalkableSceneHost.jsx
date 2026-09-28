import React, { useCallback, useState } from 'react';
import { KeyboardControls } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import Ecctrl from 'ecctrl';

import {
  CAPSULE_HALF_HEIGHT,
  CAPSULE_RADIUS,
  ECCTRL_MODE,
  FLOAT_HEIGHT,
  keyboardMap,
} from '../../params.js';
import { WalkablePhysicsReadinessProvider } from './walkablePhysicsReadiness.jsx';

/**
 * Playground-only composition host for the package character runtime. A
 * showcase scene supplies layout/colliders and controller tuning; character
 * loading, rigging, animation, controls, telemetry, and free-camera plumbing
 * stay identical across every scene file.
 */
export function WalkableSceneHost({
  cameraMode = 'follow',
  characterProps = {},
  controllerProps = {},
  controllerRef,
  enabled = true,
  ground,
  keyboardChildren = null,
  physicsAfter = null,
  physicsBefore = null,
  physicsProps = {},
  services,
  visualYOffset = 0,
}) {
  const { Character, FreeCamera, Telemetry } = services;
  const [pendingPhysicsAssets, setPendingPhysicsAssets] = useState(0);
  const updatePendingPhysicsAssets = useCallback((count) => {
    setPendingPhysicsAssets(count);
    document.body.dataset.walkablePhysicsPending = String(count);
    document.body.dataset.walkablePhysicsReady = String(count === 0);
  }, []);
  return (
    <>
      <WalkablePhysicsReadinessProvider onPendingChange={updatePendingPhysicsAssets}>
        <Physics
          gravity={[0, -9.81, 0]}
          timeStep="vary"
          {...physicsProps}
          paused={physicsProps.paused === true || pendingPhysicsAssets > 0}
        >
          {physicsBefore}
          {enabled && (
            <KeyboardControls map={keyboardMap}>
              <Ecctrl
                ref={controllerRef}
                mode={ECCTRL_MODE}
                capsuleHalfHeight={CAPSULE_HALF_HEIGHT}
                capsuleRadius={CAPSULE_RADIUS}
                floatHeight={FLOAT_HEIGHT}
                disableFollowCam={cameraMode === 'free'}
                {...controllerProps}
              >
                <Character
                  controllerRef={controllerRef}
                  ground={ground}
                  visualYOffset={visualYOffset}
                  {...characterProps}
                />
              </Ecctrl>
              <Telemetry controllerRef={controllerRef} />
              {keyboardChildren}
            </KeyboardControls>
          )}
          {physicsAfter}
        </Physics>
      </WalkablePhysicsReadinessProvider>
      {cameraMode === 'free' && <FreeCamera controllerRef={controllerRef} />}
    </>
  );
}
