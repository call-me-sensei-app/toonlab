import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';

import { createSceneStyleRuntime } from '../styles/sceneStyleRuntime.js';
import { resolveStyleBundleSelection } from '../styles/styleBundleProvider.js';

export function useToonLabScene({
  bundle = 'call-me-sensei',
  enabled = true,
  environmentRoot = null,
  post = null,
  quality = 'balanced',
  sky = null,
  timeOfDay = 13,
  water = null,
} = {}) {
  const { camera, gl, scene } = useThree();
  const runtime = useMemo(() => createSceneStyleRuntime({
    environmentRoot,
    post,
    quality,
    renderer: gl,
    scene,
    sky,
    timeOfDay,
    water,
  }), [environmentRoot, gl, post, quality, scene, sky, timeOfDay, water]);

  useEffect(() => {
    let active = true;
    if (enabled) {
      runtime.apply(bundle, { discovery: 'scene-labels', watch: true }).catch((error) => {
        if (active) console.error('ToonLab scene style application failed.', error);
      });
    }
    return () => {
      active = false;
      runtime.dispose();
    };
  }, [bundle, enabled, runtime]);

  useFrame((_state, delta) => {
    if (enabled) runtime.update(delta, camera);
  });
  return runtime;
}

export function ToonLabScene(props) {
  useToonLabScene(props);
  return null;
}

export function useStyleBundles(provider, { requestedId = null, user = null } = {}) {
  const [state, setState] = useState({ error: null, loading: true, options: [], selected: null });
  useEffect(() => {
    let active = true;
    setState((current) => ({ ...current, error: null, loading: true }));
    resolveStyleBundleSelection(provider, requestedId, { user }).then((selection) => {
      if (active) setState({ error: null, loading: false, ...selection });
    }).catch((error) => {
      if (active) setState({ error, loading: false, options: [], selected: null });
    });
    return () => { active = false; };
  }, [provider, requestedId, user]);
  return state;
}
