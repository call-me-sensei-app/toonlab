import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';

import {
  PRESETS as SKY_SYSTEM_PRESETS,
  SkySystem,
  createSkyParams,
  resolveSkyStyleSnapshot,
} from '@call-me-sensei/toonlab/sky';

const WALKABLE_SKY_QUALITY = 'medium';
const WALKABLE_SKY_STYLE_SNAPSHOT = '2.10';
const WALKABLE_SKY_PRESETS = Object.freeze({
  moonlit: 'moonlitNight',
  noon: 'partlyCloudy',
  overcast: 'hazy',
  storm: 'thunderstorm',
  sunset: 'stunningSunset',
});

function createWalkableSkyParams(envPreset) {
  const presetName = WALKABLE_SKY_PRESETS[envPreset] ?? WALKABLE_SKY_PRESETS.noon;
  const base = SKY_SYSTEM_PRESETS[presetName] ?? SKY_SYSTEM_PRESETS.partlyCloudy;
  const style = resolveSkyStyleSnapshot(WALKABLE_SKY_STYLE_SNAPSHOT);
  return createSkyParams({
    ...base,
    atmosphere: {
      ...base.atmosphere,
      style: style.skyColor,
    },
    cloud: {
      ...base.cloud,
      style: style.cloudStyle,
    },
  });
}

function publishWalkableSkyState(sky, envPreset) {
  document.body.dataset.skyApi = 'SkySystem';
  document.body.dataset.skyCloudApi = 'raymarched-volumetric-deck';
  document.body.dataset.skyPreset = WALKABLE_SKY_PRESETS[envPreset] ?? WALKABLE_SKY_PRESETS.noon;
  document.body.dataset.skyQuality = sky.qualityLevel;
  document.body.dataset.skyStyleSnapshot = WALKABLE_SKY_STYLE_SNAPSHOT;
  document.body.dataset.skySystemReady = 'true';
}

export function ToonLabSkyView({ envPreset, onReady, onSunDirectionChange }) {
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const scene = useThree((state) => state.scene);
  const size = useThree((state) => state.size);
  const [sky, setSky] = useState(null);
  const params = useMemo(() => createWalkableSkyParams(envPreset), [envPreset]);
  const appliedParamsRef = useRef(null);
  const envPresetRef = useRef(envPreset);
  const onSunDirectionChangeRef = useRef(onSunDirectionChange);
  const onReadyRef = useRef(onReady);
  const paramsRef = useRef(params);
  envPresetRef.current = envPreset;
  onSunDirectionChangeRef.current = onSunDirectionChange;
  onReadyRef.current = onReady;
  paramsRef.current = params;

  useEffect(() => {
    let cancelled = false;
    let system = null;
    document.body.dataset.skySystemReady = 'loading';
    SkySystem.create({
      camera,
      // Passing the option without a panorama keeps the generated package moon
      // while avoiding a sample-local star texture dependency.
      nightSky: {},
      quality: WALKABLE_SKY_QUALITY,
      renderer: gl,
      scene,
    }).then(async (nextSystem) => {
      system = nextSystem;
      if (cancelled) {
        system.dispose();
        return;
      }
      system.groundLevel = 0;
      system.resize(size.width, size.height);
      // Apply the authored look before exposing the system to the frame loop so
      // the first package render is already the approved Call Me Sensei sky.
      const initialParams = paramsRef.current;
      await system.applyPreset(initialParams);
      system.clouds.wind.reset();
      if (cancelled) {
        system.dispose();
        return;
      }
      appliedParamsRef.current = initialParams;
      onSunDirectionChangeRef.current?.(system.sun.direction.value.toArray());
      publishWalkableSkyState(system, envPresetRef.current);
      setSky(system);
      onReadyRef.current?.(system);
    }).catch((error) => {
      if (cancelled) return;
      document.body.dataset.skySystemReady = 'error';
      console.error('ToonLab SkySystem failed to initialize:', error);
    });

    return () => {
      cancelled = true;
      appliedParamsRef.current = null;
      onReadyRef.current?.(null);
      system?.dispose();
    };
  }, [camera, gl, scene]);

  useEffect(() => {
    if (!sky || appliedParamsRef.current === params) return undefined;
    let cancelled = false;
    sky.applyPreset(params).then(() => {
      if (cancelled) return;
      appliedParamsRef.current = params;
      sky.clouds.wind.reset();
      onSunDirectionChange?.(sky.sun.direction.value.toArray());
      publishWalkableSkyState(sky, envPreset);
    }).catch((error) => {
      if (cancelled) return;
      document.body.dataset.skySystemReady = 'error';
      console.error('ToonLab SkySystem preset failed to apply:', error);
    });
    return () => { cancelled = true; };
  }, [envPreset, onSunDirectionChange, params, sky]);

  useEffect(() => {
    if (!sky) return;
    sky.resize(size.width, size.height);
  }, [size.height, size.width, sky]);

  useFrame((_, delta) => {
    sky?.update(delta);
  }, -100);

  return null;
}


