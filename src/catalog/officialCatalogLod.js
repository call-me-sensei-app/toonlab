import { Box3, Sphere, Vector3 } from 'three';

const DEFAULT_LOD_NAME_PATTERN = /(?:^|[_\s.-])LOD[_\s.-]?(\d+)(?:$|[_\s.-])/iu;

function finiteLevel(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function authoredLevel(object, namePattern) {
  const metadataLevel = finiteLevel(object?.userData?.toonlabLodLevel);
  if (metadataLevel !== null) return metadataLevel;
  const match = String(object?.name ?? '').match(namePattern);
  return finiteLevel(match?.[1]);
}

/** Find meshes participating in an authored catalog LOD group. */
export function collectCatalogLodBindings(root, {
  namePattern = DEFAULT_LOD_NAME_PATTERN,
} = {}) {
  if (!root?.traverse) throw new TypeError('Catalog LOD root must be an Object3D.');
  const bindings = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const level = authoredLevel(object, namePattern);
    if (level === null) return;
    bindings.push(Object.freeze({
      level,
      mesh: object,
      originalVisible: object.visible,
    }));
  });
  return Object.freeze(bindings);
}

export function normalizeCatalogLodDistances(distances, levelCount = null) {
  const source = Array.isArray(distances) ? distances : [];
  const normalized = [];
  for (let index = 0; index < source.length; index += 1) {
    const value = Number(source[index]);
    if (!Number.isFinite(value) || value < 0) continue;
    normalized.push(index === 0 ? 0 : Math.max(value, normalized.at(-1) ?? 0));
  }
  if (normalized.length === 0) normalized.push(0);
  const wanted = Math.max(Number(levelCount) || normalized.length, 1);
  while (normalized.length < wanted) {
    const last = normalized.at(-1) ?? 0;
    const previous = normalized.at(-2) ?? 0;
    normalized.push(last + Math.max(last - previous, 40));
  }
  return Object.freeze(normalized);
}

/** Resolve the authored level with deterministic fallback for missing meshes. */
export function selectCatalogLodLevel({
  availableLevels,
  distance,
  distances,
  maxLevel = Number.POSITIVE_INFINITY,
  currentLevel = null,
  hysteresis = 0,
} = {}) {
  const available = [...new Set((availableLevels ?? []).map(finiteLevel).filter((v) => v !== null))]
    .sort((left, right) => left - right);
  if (available.length === 0) return null;
  const margin = Number(hysteresis);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 0.5) {
    throw new RangeError('Catalog LOD hysteresis must be a finite ratio in [0, 0.5).');
  }
  const thresholds = normalizeCatalogLodDistances(distances, available.at(-1) + 1);
  const finiteDistance = Math.max(Number(distance) || 0, 0);
  let requested = 0;
  for (let level = 1; level < thresholds.length; level += 1) {
    if (finiteDistance >= thresholds[level]) requested = level;
  }
  requested = Math.min(requested, Math.max(Number(maxLevel) || 0, 0));
  const lower = available.filter((level) => level <= requested).at(-1);
  const selected = lower ?? available[0];

  const current = finiteLevel(currentLevel);
  if (current === null || !available.includes(current) || margin === 0 || selected === current) {
    return selected;
  }

  if (selected > current) {
    // Do not leave the current LOD until the first available coarser level's
    // threshold plus its margin has been crossed. This also handles authored
    // groups with deliberately missing intermediate levels.
    const next = available.find((level) => level > current && level <= selected);
    if (next !== undefined && finiteDistance < thresholds[next] * (1 + margin)) return current;
  } else {
    // Hold the current LOD while the camera jitters inside the lower half of
    // the transition band. Crossing it permits the normal deterministic
    // selector to choose one or several finer levels.
    if (finiteDistance >= thresholds[current] * (1 - margin)) return current;
  }
  return selected;
}

function normalizePixelThresholds(thresholds, levelCount) {
  const count = Math.max(Math.round(Number(levelCount) || 1), 1);
  const source = Array.isArray(thresholds) ? thresholds : [];
  const normalized = [];
  for (let level = 0; level < count; level += 1) {
    const fallback = level === 0 ? 240 : Math.max((normalized[level - 1] ?? 240) * 0.45, 1);
    const value = Number(source[level]);
    normalized.push(Number.isFinite(value) && value > 0 ? value : fallback);
  }
  for (let level = 1; level < normalized.length; level += 1) {
    normalized[level] = Math.min(normalized[level], normalized[level - 1] - 0.001);
  }
  return Object.freeze(normalized);
}

/**
 * Resolve an authored LOD from its projected on-screen diameter. A null result
 * is an intentional cull decision, not a missing-asset failure.
 */
export function selectCatalogLodLevelByProjectedPixels({
  availableLevels,
  cullBelowPixels = 0,
  currentLevel = null,
  hysteresis = 0,
  pixelThresholds,
  projectedPixels,
} = {}) {
  const available = [...new Set((availableLevels ?? []).map(finiteLevel).filter((v) => v !== null))]
    .sort((left, right) => left - right);
  if (available.length === 0) return null;
  const pixels = Number(projectedPixels);
  if (!Number.isFinite(pixels) || pixels < 0) {
    throw new RangeError('Projected LOD pixels must be a finite non-negative number.');
  }
  const margin = Number(hysteresis);
  if (!Number.isFinite(margin) || margin < 0 || margin >= 0.5) {
    throw new RangeError('Catalog LOD hysteresis must be a finite ratio in [0, 0.5).');
  }
  const cull = Math.max(Number(cullBelowPixels) || 0, 0);
  const thresholds = normalizePixelThresholds(pixelThresholds, available.at(-1) + 1);
  const current = finiteLevel(currentLevel);

  if (pixels < cull) {
    if (current !== null && available.includes(current) && margin > 0
      && pixels >= cull * (1 - margin)) return current;
    return null;
  }

  let requested = thresholds.length - 1;
  for (let level = 0; level < thresholds.length; level += 1) {
    if (pixels >= thresholds[level]) {
      requested = level;
      break;
    }
  }
  const selected = available.filter((level) => level <= requested).at(-1) ?? available[0];
  if (current === null || !available.includes(current) || margin === 0 || selected === current) {
    return selected;
  }

  if (selected > current) {
    const boundary = thresholds[current] ?? cull;
    if (pixels >= boundary * (1 - margin)) return current;
  } else {
    const boundary = thresholds[selected] ?? thresholds[0];
    if (pixels <= boundary * (1 + margin)) return current;
  }
  return selected;
}

/** Estimate projected object diameter for perspective and orthographic cameras. */
export function estimateCatalogProjectedPixels({
  camera,
  distance,
  referenceDiameter,
  viewportHeight,
} = {}) {
  const pixelsHigh = Number(viewportHeight);
  const diameter = Number(referenceDiameter);
  if (!camera?.isCamera) throw new TypeError('Projected LOD estimation requires a Three.js camera.');
  if (!Number.isFinite(pixelsHigh) || pixelsHigh <= 0) {
    throw new RangeError('Projected LOD estimation requires a positive viewportHeight.');
  }
  if (!Number.isFinite(diameter) || diameter <= 0) {
    throw new RangeError('Projected LOD estimation requires a positive referenceDiameter.');
  }
  if (camera.isOrthographicCamera) {
    const span = Math.abs(Number(camera.top) - Number(camera.bottom)) / Math.max(Number(camera.zoom) || 1, 0.001);
    return span > 0 ? diameter / span * pixelsHigh : Number.POSITIVE_INFINITY;
  }
  if (!camera.isPerspectiveCamera) {
    throw new TypeError('Projected LOD estimation supports perspective and orthographic cameras.');
  }
  const range = Math.max(Number(distance) || 0, 0.0001);
  const zoom = Math.max(Number(camera.zoom) || 1, 0.001);
  const halfFov = Math.atan(Math.tan((Number(camera.fov) || 50) * Math.PI / 360) / zoom);
  return diameter / (2 * range * Math.tan(halfFov)) * pixelsHigh;
}

/**
 * Authored, renderer-independent LOD controller. The host calls update() with
 * either a direct distance or a camera. World scale is removed from camera
 * distance so a uniformly enlarged landmark changes LOD at proportional range.
 */
export function createCatalogLodRuntime(root, {
  cullBelowPixels = 0,
  distances = [0, 45, 120],
  hysteresis = 0,
  maxLevel = Number.POSITIVE_INFINITY,
  namePattern = DEFAULT_LOD_NAME_PATTERN,
  pixelThresholds = null,
  referenceDiameter = null,
} = {}) {
  const bindings = collectCatalogLodBindings(root, { namePattern });
  const availableLevels = Object.freeze(
    [...new Set(bindings.map((binding) => binding.level))].sort((a, b) => a - b),
  );
  const thresholds = normalizeCatalogLodDistances(distances, availableLevels.at(-1) + 1);
  const hysteresisRatio = Number(hysteresis);
  if (!Number.isFinite(hysteresisRatio) || hysteresisRatio < 0 || hysteresisRatio >= 0.5) {
    throw new RangeError('Catalog LOD hysteresis must be a finite ratio in [0, 0.5).');
  }
  const worldPosition = new Vector3();
  const worldScale = new Vector3();
  const bounds = new Box3();
  const sphere = new Sphere();
  const usesScreenSpace = Array.isArray(pixelThresholds);
  let localReferenceDiameter = Number(referenceDiameter);
  if (!Number.isFinite(localReferenceDiameter) || localReferenceDiameter <= 0) {
    root.updateWorldMatrix?.(true, true);
    bounds.setFromObject(root, true).getBoundingSphere(sphere);
    root.getWorldScale(worldScale);
    const scale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z), 0.001);
    localReferenceDiameter = Math.max(sphere.radius * 2 / scale, 0.001);
  }
  const normalizedPixelThresholds = usesScreenSpace
    ? normalizePixelThresholds(pixelThresholds, availableLevels.at(-1) + 1)
    : null;
  let currentLevel = null;
  let disposed = false;

  function setLevel(level) {
    if (disposed || (level !== null && !availableLevels.includes(level))) return false;
    if (currentLevel === level) return false;
    bindings.forEach((binding) => {
      binding.mesh.visible = level !== null && binding.level === level;
    });
    currentLevel = level;
    return true;
  }

  function resolveDistance({ camera = null, distance = null } = {}) {
    root.updateWorldMatrix?.(true, false);
    root.getWorldPosition(worldPosition);
    root.getWorldScale(worldScale);
    if (Number.isFinite(distance)) return Math.max(distance, 0);
    if (!camera?.getWorldPosition && !camera?.position) {
      throw new TypeError('Catalog LOD update requires distance or camera.');
    }
    const cameraPosition = camera.getWorldPosition
      ? camera.getWorldPosition(new Vector3())
      : camera.position;
    const scale = Math.max(Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z), 0.001);
    return worldPosition.distanceTo(cameraPosition) / scale;
  }

  function update(options = {}) {
    if (disposed || availableLevels.length === 0) return null;
    const hasDirectPixels = Number.isFinite(Number(options.projectedPixels));
    const distance = hasDirectPixels && !Number.isFinite(options.distance) && !options.camera
      ? null
      : resolveDistance(options);
    const projectedPixels = hasDirectPixels
      ? Math.max(Number(options.projectedPixels), 0)
      : usesScreenSpace
        ? estimateCatalogProjectedPixels({
          camera: options.camera,
          distance,
          referenceDiameter: localReferenceDiameter * Math.max(
            Math.abs(worldScale.x), Math.abs(worldScale.y), Math.abs(worldScale.z), 0.001,
          ),
          viewportHeight: options.viewportHeight,
        })
        : null;
    let level = usesScreenSpace
      ? selectCatalogLodLevelByProjectedPixels({
        availableLevels,
        cullBelowPixels,
        currentLevel,
        hysteresis: hysteresisRatio,
        pixelThresholds: normalizedPixelThresholds,
        projectedPixels,
      })
      : selectCatalogLodLevel({
        availableLevels,
        distance,
        distances: thresholds,
        currentLevel,
        hysteresis: hysteresisRatio,
        maxLevel,
      });
    if (level !== null) level = Math.min(level, Math.max(Number(maxLevel) || 0, 0));
    const changed = setLevel(level);
    return Object.freeze({ changed, culled: level === null, distance, level, projectedPixels });
  }

  if (availableLevels.length > 0) setLevel(availableLevels[0]);

  return Object.freeze({
    availableLevels,
    bindings,
    dispose() {
      if (disposed) return;
      disposed = true;
      bindings.forEach((binding) => { binding.mesh.visible = binding.originalVisible; });
      currentLevel = null;
    },
    get disposed() { return disposed; },
    get level() { return currentLevel; },
    setLevel,
    cullBelowPixels: Math.max(Number(cullBelowPixels) || 0, 0),
    pixelThresholds: normalizedPixelThresholds,
    referenceDiameter: localReferenceDiameter,
    thresholds,
    hysteresis: hysteresisRatio,
    update,
  });
}
