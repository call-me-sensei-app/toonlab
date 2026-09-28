import * as THREE from 'three';

import { createCameraRig } from './cameraRig.js';

const clamp01 = (value) => Math.min(Math.max(value, 0), 1);

function smoothstep(value) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

/**
 * Selects the highest-priority enabled rig (or an explicit rig) and blends
 * camera states. The director is optional: a CameraRig can be used directly.
 */
export function createCameraDirector(camera, { defaultBlendDuration = 0.45 } = {}) {
  if (!camera?.isCamera) throw new Error('createCameraDirector requires a Three.js Camera.');
  const entries = new Map();
  const fromPosition = new THREE.Vector3();
  const fromQuaternion = new THREE.Quaternion();
  const toPosition = new THREE.Vector3();
  const toQuaternion = new THREE.Quaternion();
  const mixedPosition = new THREE.Vector3();
  const mixedQuaternion = new THREE.Quaternion();
  let disposed = false;
  let requestedId = null;
  let activeId = null;
  let transitionElapsed = 0;
  let transitionDuration = 0;
  let fromFov = camera.fov ?? 50;
  let fromNear = camera.near ?? 0.1;
  let fromFar = camera.far ?? 1000;
  let switches = 0;
  let updates = 0;

  function selectedEntry() {
    if (requestedId && entries.get(requestedId)?.enabled) return entries.get(requestedId);
    return [...entries.values()]
      .filter((entry) => entry.enabled)
      .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
  }

  function beginTransition(next, duration = defaultBlendDuration) {
    if (next?.id === activeId) return;
    fromPosition.copy(camera.position);
    fromQuaternion.copy(camera.quaternion);
    fromFov = camera.fov ?? fromFov;
    fromNear = camera.near ?? fromNear;
    fromFar = camera.far ?? fromFar;
    activeId = next?.id ?? null;
    transitionElapsed = 0;
    transitionDuration = Math.max(0, Number(duration) || 0);
    next?.rig.syncFromCamera();
    switches += 1;
  }

  function applySample(sample, amount) {
    toPosition.fromArray(sample.position);
    toQuaternion.fromArray(sample.quaternion);
    mixedPosition.lerpVectors(fromPosition, toPosition, amount);
    mixedQuaternion.slerpQuaternions(fromQuaternion, toQuaternion, amount);
    camera.position.copy(mixedPosition);
    camera.quaternion.copy(mixedQuaternion);
    if (camera.isPerspectiveCamera) {
      camera.fov = fromFov + (sample.fov - fromFov) * amount;
      camera.near = fromNear + (sample.near - fromNear) * amount;
      camera.far = fromFar + (sample.far - fromFar) * amount;
      camera.updateProjectionMatrix();
    }
    camera.updateMatrixWorld();
  }

  const director = {
    addRig(id, rigOrOptions, { enabled = true, owned = false, priority = 0 } = {}) {
      if (disposed) throw new Error('Camera director is disposed.');
      const cleanId = String(id ?? '').trim();
      if (!cleanId) throw new Error('Camera director rig id is required.');
      if (entries.has(cleanId)) throw new Error(`Camera director already has rig "${cleanId}".`);
      const rig = rigOrOptions?.update && rigOrOptions?.setTarget
        ? rigOrOptions
        : createCameraRig({ camera, ...(rigOrOptions ?? {}) });
      entries.set(cleanId, { enabled: Boolean(enabled), id: cleanId, owned: owned || rig !== rigOrOptions, priority: Number(priority) || 0, rig });
      return rig;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const entry of entries.values()) if (entry.owned) entry.rig.dispose();
      entries.clear();
      activeId = null;
      requestedId = null;
    },
    getRig(id) {
      return entries.get(String(id))?.rig ?? null;
    },
    removeRig(id, { dispose = null } = {}) {
      const entry = entries.get(String(id));
      if (!entry) return false;
      if (dispose ?? entry.owned) entry.rig.dispose();
      entries.delete(entry.id);
      if (activeId === entry.id) activeId = null;
      if (requestedId === entry.id) requestedId = null;
      return true;
    },
    setActive(id, { duration = defaultBlendDuration } = {}) {
      requestedId = id == null ? null : String(id);
      if (requestedId && !entries.has(requestedId)) throw new Error(`Unknown camera rig "${requestedId}".`);
      beginTransition(selectedEntry(), duration);
      return director;
    },
    setEnabled(id, enabled, { duration = defaultBlendDuration } = {}) {
      const entry = entries.get(String(id));
      if (!entry) return false;
      entry.enabled = Boolean(enabled);
      beginTransition(selectedEntry(), duration);
      return true;
    },
    setPriority(id, priority, { duration = defaultBlendDuration } = {}) {
      const entry = entries.get(String(id));
      if (!entry) return false;
      entry.priority = Number(priority) || 0;
      beginTransition(selectedEntry(), duration);
      return true;
    },
    update(delta = 0) {
      if (disposed) return null;
      const selected = selectedEntry();
      if (selected?.id !== activeId) beginTransition(selected);
      if (!selected) return null;
      const dt = Math.min(Math.max(Number(delta) || 0, 0), 0.25);
      const sample = selected.rig.update(dt, { apply: false });
      transitionElapsed += dt;
      const amount = transitionDuration <= 0 ? 1 : smoothstep(transitionElapsed / transitionDuration);
      applySample(sample, amount);
      updates += 1;
      return sample;
    },
  };

  Object.defineProperties(director, {
    activeId: { get: () => activeId },
    disposed: { get: () => disposed },
    stats: {
      get: () => ({
        activeId,
        disposed,
        rigCount: entries.size,
        switches,
        transitionProgress: transitionDuration <= 0 ? 1 : clamp01(transitionElapsed / transitionDuration),
        updates,
      }),
    },
  });

  return director;
}

