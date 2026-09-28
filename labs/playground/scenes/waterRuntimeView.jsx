import React, { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';

import { WaterSurface } from '@call-me-sensei/toonlab/water';
import {
  BODY_CENTER_AT_REST,
  WATER_SURFACE_CENTER_Z,
  WATER_SURFACE_SIZE_X,
  WATER_SURFACE_SIZE_Z,
} from '../params.js';
import {
  WATER_ENVIRONMENT_PRESETS,
  cloudShadowSettingsFor,
  seaBedHeight,
} from './stage.js';

export function WaterSurfaceView({ controllerRef, debugMode, envPreset, onReady, settings, swimStateRef, waterApiRef }) {
  const { camera, gl, scene } = useThree();
  const water = useMemo(() => {
    const surface = new WaterSurface({
      width: WATER_SURFACE_SIZE_X,
      depth: WATER_SURFACE_SIZE_Z,
      segmentsPerMeter: 2.2,
      maxSegments: 420,
      simulation: { resolution: 320, worldSize: 30 },
      // Shoaling: waves flatten over the rising seabed instead of clipping
      // through the beach, islands, and grass line at high intensity.
      bedHeight: seaBedHeight,
      // Use the same public nearshore phase and persistent shore-state path as
      // Water Lab. The bay opens toward +Z, with its rest edge near z=-2.6.
      nearshorePhase: { incidentAxis: 'z', referenceX: 0, referenceZ: -2.6 },
      shoreState: {
        region: { centerX: 0, centerZ: -2.6, width: 80, depth: 32 },
        resolution: { x: 512, y: 192 },
      },
      ...settings,
    });
    // Draw the water early in the transparent pass: after the seabed splat
    // overlays (-2/-1) but before character materials (0+). The water writes
    // depth, so alpha-blended hair (depthWrite off) drawn later still wins
    // where it is closer — otherwise the shoreline swash film paints its foam
    // over heads that overlap the waterline — while submerged parts keep
    // failing the depth test and show through refraction instead.
    surface.renderOrder = -0.5;
    return surface;
  }, []);

  useEffect(() => () => water.dispose(), [water]);

  useEffect(() => {
    onReady?.(water);
    return () => onReady?.(null);
  }, [onReady, water]);

  useEffect(() => {
    water.applySettings(settings);
    water.position.set(0, settings.waterLevel, WATER_SURFACE_CENTER_Z);
    document.body.dataset.waterMode = settings.mode;
    document.body.dataset.waterLevel = settings.waterLevel.toFixed(3);
    document.body.dataset.waterNearshorePhase = String(water.nearshorePhaseEnabled);
    document.body.dataset.waterRunupDistance = String(settings.runupDistance);
    document.body.dataset.waterShoreState = String(Boolean(water.shoreState));
  }, [water, settings]);

  useEffect(() => {
    water.setDebugMode(debugMode);
  }, [water, debugMode]);

  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    water.setCloudShadow(cloudShadowSettingsFor(environment));
  }, [water, envPreset]);

  useEffect(() => {
    const interactorId = water.addInteractor((out) => {
      const body = controllerRef.current?.group;
      if (!body?.translation) return out.set(0, -1e6, 0);
      const position = body.translation();
      // Standing: track the shins. Swimming: the body is prone, track its
      // center so a diver's capsule head can't fake surface contact.
      const swimming = swimStateRef?.current?.swimming;
      // Never turn a jump landing on the dry meadow into a water splash just
      // because a wave crest briefly reaches up the bank. Surface interaction
      // starts only where the underlying terrain is genuinely submerged.
      if (!swimming && seaBedHeight(position.x, position.z) >= water.position.y - 0.03) {
        return out.set(0, -1e6, 0);
      }
      return out.set(
        position.x,
        swimming ? position.y : position.y - BODY_CENTER_AT_REST + 0.24,
        position.z,
      );
    }, {
      radius: 0.34,
      // Pose-dependent extent: shin-to-head while wading, a slim prone band
      // while swimming — wakes fire only when the waterline crosses the body.
      height: () => {
        const swim = swimStateRef?.current;
        if (!swim?.swimming) return 1.4;
        return swim.diving ? 0.18 : 0.35;
      },
      splashStrength: 0.85,
      onSplash: () => {
        document.body.dataset.waterSplashCount =
          String(Number(document.body.dataset.waterSplashCount || 0) + 1);
      },
    });
    water.setFollowTarget((out) => {
      const body = controllerRef.current?.group;
      if (!body?.translation) return null;
      const position = body.translation();
      return out.set(position.x, position.y, position.z);
    });
    return () => {
      water.removeInteractor(interactorId);
      water.setFollowTarget(null);
    };
  }, [controllerRef, water]);

  useEffect(() => {
    if (!waterApiRef) return undefined;
    waterApiRef.current = {
      contains: (worldX, worldZ) => water.containsPoint(worldX, worldZ),
      getHeightAt: (worldX, worldZ) => water.getHeightAt(worldX, worldZ),
      // Horizontal surf push (m/s): the surge of a breaking wave passing
      // this point. Applied to floating bodies and the swimmer.
      getFlowAt: (worldX, worldZ) => water.getFlowAt(worldX, worldZ, flowScratch),
      // Rest waterline (no wave motion) — mode decisions gate on this so surf
      // rolling over a depth threshold can't flap swim mode on and off.
      getLevel: () => water.position.y,
      injectWorld: (worldX, worldZ, options = {}) => {
        water.addRipple({ x: worldX, z: worldZ }, options);
      },
      splashWorld: (worldX, worldY, worldZ, options = {}) => {
        water.splash({ x: worldX, y: worldY, z: worldZ }, options);
      },
    };
    document.body.dataset.waterReady = 'true';
    return () => {
      if (waterApiRef.current) waterApiRef.current = null;
      document.body.dataset.waterReady = 'false';
    };
  }, [water, waterApiRef]);

  useFrame((_, delta) => {
    water.update(gl, scene, camera, delta);
    const passStats = water.passes?.stats;
    document.body.dataset.waterPasses = passStats?.lastFrame.passes.join(',') ?? '';
    document.body.dataset.waterSceneRenders = String(passStats?.lastFrame.sceneRenders ?? 0);
    document.body.dataset.waterReflectionScale = String(passStats?.quality.reflectionScale ?? 0);
  });

  return <primitive object={water} />;
}

const flowScratch = new THREE.Vector2();

export function WaterBall({ ball, settings, waterApiRef }) {
  const bodyRef = useRef(null);
  const hasImpactedWaterRef = useRef(false);
  const previousYRef = useRef(ball.position[1]);

  useFrame((_, delta) => {
    const body = bodyRef.current;
    if (!body) return;
    const position = body.translation();
    const velocity = body.linvel();
    // Follow the animated Gerstner height so balls bob on the swell.
    const waterSurfaceY = waterApiRef.current?.getHeightAt?.(position.x, position.z) ??
      settings.waterLevel;
    const impactHeight = waterSurfaceY + ball.radius * 0.32;
    const isSinker = ball.kind === 'sinker';

    if (previousYRef.current > impactHeight && position.y <= impactHeight && velocity.y < -0.2) {
      const impactStrength = isSinker
        ? Math.min(2.4, 0.95 + Math.abs(velocity.y) * 0.28)
        : Math.min(1.4, 0.35 + Math.abs(velocity.y) * 0.16);
      waterApiRef.current?.splashWorld?.(position.x, waterSurfaceY, position.z, {
        radius: ball.radius * (isSinker ? 2.6 : 1.6),
        strength: impactStrength * (isSinker ? 1 : 0.4),
      });
      if (isSinker && !hasImpactedWaterRef.current) {
        hasImpactedWaterRef.current = true;
      }
      document.body.dataset.waterSplashCount = String(Number(document.body.dataset.waterSplashCount || 0) + 1);
      document.body.dataset.waterLastBallImpact = `${position.x.toFixed(2)},${position.z.toFixed(2)}`;
    }

    // Surf push: drag steers the ball toward the local water flow (the surge
    // of a passing breaker) instead of plain zero, so waves carry floaters
    // shoreward and even shove dense sinkers along the bed a little.
    const flow = waterApiRef.current?.getFlowAt?.(position.x, position.z);
    const flowX = flow?.x ?? 0;
    const flowZ = flow?.y ?? 0;

    if (!isSinker && position.y < waterSurfaceY + ball.radius && typeof body.applyImpulse === 'function') {
      const depth = Math.min(1.2, waterSurfaceY + ball.radius - position.y);
      body.applyImpulse({
        x: (flowX - velocity.x) * 0.004,
        y: depth * 0.045 * delta * 60 - velocity.y * 0.003,
        z: (flowZ - velocity.z) * 0.004,
      }, true);
    }

    if (isSinker && position.y < waterSurfaceY + ball.radius && typeof body.applyImpulse === 'function') {
      body.applyImpulse({
        x: (flowX * 0.45 - velocity.x) * 0.0025,
        y: -0.012 * delta * 60,
        z: (flowZ * 0.45 - velocity.z) * 0.0025,
      }, true);
    }

    previousYRef.current = position.y;
  });

  return (
    <RigidBody
      ref={bodyRef}
      colliders="ball"
      ccd
      canSleep={false}
      position={ball.position}
      restitution={ball.kind === 'sinker' ? 0.06 : 0.28}
      friction={0.72}
      gravityScale={ball.kind === 'sinker' ? 1.65 : 1}
      linearDamping={ball.kind === 'sinker' ? 0.06 : 0.18}
      angularDamping={ball.kind === 'sinker' ? 0.16 : 0.08}
    >
      <mesh castShadow receiveShadow userData={{ skipWaterReflection: true }}>
        <sphereGeometry args={[ball.radius, 32, 16]} />
        <meshStandardMaterial
          color={ball.color}
          roughness={ball.kind === 'sinker' ? 0.34 : 0.54}
          metalness={ball.kind === 'sinker' ? 0.28 : 0.02}
        />
      </mesh>
    </RigidBody>
  );
}

