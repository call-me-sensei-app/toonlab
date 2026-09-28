import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';

import { WaterKelpField, WaterRain } from '@call-me-sensei/toonlab/water';
import { WATER_ENVIRONMENT_PRESETS, seaBedHeight } from './stage.js';

export function RainView({ controllerRef, envPreset, waterApiRef, waterLevel }) {
  const { camera, gl } = useThree();
  const rain = useMemo(() => new WaterRain({ count: 2600 }), []);
  const intensity = WATER_ENVIRONMENT_PRESETS[envPreset]?.rain ?? 0;

  useEffect(() => () => rain.dispose(), [rain]);
  useEffect(() => {
    rain.setIntensity(intensity);
  }, [rain, intensity]);

  useFrame((_, delta) => {
    if (!rain.visible) return;
    rain.update(delta, camera, gl, waterLevel);
    // Raindrop dimples on the water around the character.
    const api = waterApiRef.current;
    if (!api) return;
    const body = controllerRef.current?.group;
    const centerX = body?.translation ? body.translation().x : camera.position.x;
    const centerZ = body?.translation ? body.translation().z : camera.position.z;
    const drops = Math.floor(intensity * 4 + Math.random() * 2 * intensity);
    for (let i = 0; i < drops; i += 1) {
      api.injectWorld(
        centerX + (Math.random() * 2 - 1) * 9,
        centerZ + (Math.random() * 2 - 1) * 9,
        { radius: 0.1 + Math.random() * 0.12, strength: 0.28 + Math.random() * 0.35 },
      );
    }
  });

  return <primitive object={rain} />;
}

export function KelpField({ settings }) {
  const kelp = useMemo(() => {
    const placements = [];
    let attempts = 0;
    while (placements.length < 46 && attempts < 400) {
      attempts += 1;
      const x = (Math.random() * 2 - 1) * 7.5;
      const z = 3.4 + Math.random() * 5.8;
      const y = seaBedHeight(x, z);
      if (y > -0.35 || y < -2.0) continue;
      placements.push({
        x,
        y: y - 0.04,
        z,
        height: Math.min(0.5 + Math.random() * 1.1, 0.36 - y - 0.16),
      });
    }
    return new WaterKelpField({
      placements,
      kelpColor: [0.2, 0.55, 0.36],
      kelpShadeColor: [0.07, 0.28, 0.22],
    });
  }, []);

  useEffect(() => () => kelp.dispose(), [kelp]);
  useEffect(() => {
    kelp.setFlow(settings.flowDirection, settings.flowSpeed);
  }, [kelp, settings]);
  useFrame((_, delta) => kelp.update(delta));

  return <primitive object={kelp} />;
}

// SkySystem owns above-water aerial perspective. A separate native fog exists
// only while submerged; retaining the old Water Lab's 26–90 m scene fog above
// water turned every catalog mountain into a flat blue silhouette.
export function UnderwaterAtmosphere({ settings }) {
  const { camera, scene } = useThree();
  const underwaterColor = useMemo(() => new THREE.Color(), []);
  const underwaterFog = useMemo(() => new THREE.Fog(0x204d66, 0.5, 32), []);

  useEffect(() => () => {
    if (scene.fog === underwaterFog) scene.fog = null;
  }, [scene, underwaterFog]);

  useFrame(() => {
    if (camera.position.y < settings.waterLevel) {
      underwaterColor.setRGB(
        settings.midColor[0] * 0.8,
        settings.midColor[1] * 0.85,
        settings.midColor[2] * 0.9,
      );
      underwaterFog.color.copy(underwaterColor);
      scene.fog = underwaterFog;
    } else if (scene.fog === underwaterFog) {
      scene.fog = null;
    }
  });

  return null;
}


