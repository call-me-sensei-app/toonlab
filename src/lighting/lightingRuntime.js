import * as THREE from 'three';
import { resolveLightColor, resolveThreeLightIntensity } from './colorIntensity.js';
import { createLightingCapabilityReport } from './lightingCapabilities.js';
import { createLightingLook, createLightingRecipe } from './lightingDocuments.js';
import { createLightDescriptor, mergeLightDescriptor } from './lightDescriptors.js';
import {
  createLightingQualityProfile,
  resolveLightingLookPreset,
  resolveLightingQualityPreset,
  resolveLightingRigPreset,
} from './lightingPresets.js';
import { cloneJson, finite, isPlainObject, uniqueId } from './utils.js';

const LOCAL_LIGHT_TYPES = new Set(['point', 'spot', 'rectArea', 'discArea', 'tubeArea']);
const AREA_LIGHT_TYPES = new Set(['rectArea', 'discArea', 'tubeArea']);
const AREA_FALLBACKS = Object.freeze({
  discArea: 'Disc area light approximated by a square Three.RectAreaLight.',
  tubeArea: 'Tube area light approximated by a thin Three.RectAreaLight.',
});

// three's node backends (WebGPU and forced-WebGL) crash on the first visible
// RectAreaLight unless the LTC lookup textures were installed via
// RectAreaLightNode.setLTC. The classic WebGL path needs the parallel
// RectAreaLightUniformsLib. Both are loaded lazily the first time a manager
// realizes an area light; until then area entries stay culled as
// 'area-ltc-pending' instead of crashing the render loop.
let ltcState = 'uninitialized';
let ltcPromise = null;

export function ensureAreaLightSupport() {
  if (ltcPromise) return ltcPromise;
  ltcState = 'loading';
  ltcPromise = Promise.all([
    import('three/webgpu'),
    import('three/addons/lights/RectAreaLightTexturesLib.js'),
    import('three/addons/lights/RectAreaLightUniformsLib.js'),
  ]).then(([webgpu, texturesLib, uniformsLib]) => {
    webgpu.RectAreaLightNode.setLTC(texturesLib.RectAreaLightTexturesLib.init());
    uniformsLib.RectAreaLightUniformsLib.init();
    ltcState = 'ready';
    return true;
  }).catch(() => {
    ltcState = 'unavailable';
    return false;
  });
  return ltcPromise;
}

export function getAreaLightSupportState() {
  return ltcState;
}

function threeColor(value) {
  const [red, green, blue] = resolveLightColor(value);
  const color = new THREE.Color();
  color.setRGB(red, green, blue, THREE.SRGBColorSpace);
  return color;
}

function setLayers(object, layers) {
  if (!object?.layers || !Array.isArray(layers)) return;
  object.layers.disableAll();
  for (const layer of layers) object.layers.enable(layer);
}

function scaledShadowMapSize(descriptor, quality) {
  const raw = descriptor.shadow.mapSize * quality.shadowMapSizeScale;
  return 2 ** Math.round(Math.log2(Math.min(Math.max(raw, 128), 8192)));
}

function configureShadow(light, descriptor, quality, updateMode) {
  if (!light.shadow) return 0;
  const mapSize = scaledShadowMapSize(descriptor, quality);
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.bias = descriptor.shadow.bias;
  light.shadow.normalBias = descriptor.shadow.normalBias;
  light.shadow.radius = descriptor.shadow.radius;
  light.shadow.camera.near = descriptor.shadow.near;
  light.shadow.camera.far = Math.max(descriptor.shadow.far, descriptor.shadow.near + 0.001);
  if (descriptor.type === 'directional') {
    const extent = descriptor.shadow.extent;
    light.shadow.camera.left = -extent;
    light.shadow.camera.right = extent;
    light.shadow.camera.top = extent;
    light.shadow.camera.bottom = -extent;
  }
  light.shadow.camera.updateProjectionMatrix();
  if ('autoUpdate' in light.shadow) light.shadow.autoUpdate = updateMode !== 'manual';
  return mapSize * mapSize * (descriptor.type === 'point' ? 6 : 1);
}

function createThreeLight(descriptor) {
  const intensity = resolveThreeLightIntensity(descriptor.type, descriptor.intensity, descriptor);
  const color = threeColor(descriptor.color);
  let light;
  let fallback = null;

  switch (descriptor.type) {
    case 'ambient':
      light = new THREE.AmbientLight(color, intensity);
      break;
    case 'hemisphere':
      light = new THREE.HemisphereLight(color, threeColor(descriptor.groundColor), intensity);
      break;
    case 'directional':
      light = new THREE.DirectionalLight(color, intensity);
      break;
    case 'point':
      light = new THREE.PointLight(color, intensity, descriptor.distance, descriptor.decay);
      break;
    case 'spot':
      light = new THREE.SpotLight(
        color,
        intensity,
        descriptor.distance,
        descriptor.angle,
        descriptor.penumbra,
        descriptor.decay,
      );
      break;
    case 'discArea':
      light = new THREE.RectAreaLight(color, intensity, descriptor.width, descriptor.width);
      fallback = AREA_FALLBACKS.discArea;
      break;
    case 'tubeArea':
      light = new THREE.RectAreaLight(color, intensity, descriptor.width, descriptor.height);
      fallback = AREA_FALLBACKS.tubeArea;
      break;
    case 'rectArea':
    default:
      light = new THREE.RectAreaLight(color, intensity, descriptor.width, descriptor.height);
      break;
  }

  light.name = descriptor.name;
  light.position.fromArray(descriptor.position);
  light.visible = false;
  setLayers(light, descriptor.layers);
  light.userData.toonlabLighting = {
    artistic: cloneJson(descriptor.artistic),
    cookie: cloneJson(descriptor.cookie),
    fallback,
    ies: cloneJson(descriptor.ies),
    id: descriptor.id,
    linking: cloneJson(descriptor.linking),
    type: descriptor.type,
    userData: cloneJson(descriptor.userData),
  };

  let target = null;
  if (descriptor.type === 'directional' || descriptor.type === 'spot') {
    target = light.target;
    target.name = `${descriptor.name} Target`;
    target.position.fromArray(descriptor.target);
  } else if (AREA_LIGHT_TYPES.has(descriptor.type)) {
    light.lookAt(new THREE.Vector3().fromArray(descriptor.target));
  }
  return { fallback, light, target };
}

function focusPosition(options, camera, target) {
  const source = options?.focus ?? camera;
  if (Array.isArray(source)) {
    return target.set(finite(source[0], 0), finite(source[1], 0), finite(source[2], 0));
  }
  if (source?.isObject3D) return source.getWorldPosition(target);
  if (source && Number.isFinite(source.x) && Number.isFinite(source.y) && Number.isFinite(source.z)) {
    return target.copy(source);
  }
  return target.set(0, 0, 0);
}

function recipeSource(value) {
  if (typeof value === 'string') return resolveLightingRigPreset(value);
  return createLightingRecipe(value);
}

function qualitySource(value) {
  if (typeof value === 'string' || value === null || value === undefined) {
    return resolveLightingQualityPreset(value ?? 'balanced');
  }
  return createLightingQualityProfile(value);
}

function selectionSignature(entries) {
  return entries.map((entry) => `${entry.descriptor.id}:${entry.active ? 1 : 0}:${entry.shadowed ? 1 : 0}`).join('|');
}

/**
 * Realizes a LightingRecipe as Three.js lights and manages runtime budgets.
 * The manager does not replace the renderer's lighting algorithm: it selects,
 * configures, and diagnoses ordinary Three.js lights.
 */
export function createLightingManager({
  capabilities = null,
  camera: initialCamera = null,
  disposeCookieTextures = false,
  onDiagnostics = null,
  quality: initialQuality = 'balanced',
  recipe: initialRecipe = null,
  renderer = null,
  scene: initialScene = null,
  textureResolver = null,
} = {}) {
  const group = new THREE.Group();
  group.name = 'ToonLab Lighting Rig';
  const listeners = new Set();
  if (typeof onDiagnostics === 'function') listeners.add(onDiagnostics);
  const worldPosition = new THREE.Vector3();
  const selectionPoint = new THREE.Vector3();
  let camera = initialCamera;
  let scene = null;
  let recipe = initialRecipe ? recipeSource(initialRecipe) : resolveLightingRigPreset('outdoor_sun');
  let quality = qualitySource(initialQuality);
  const detectedCapabilities = createLightingCapabilityReport({ renderer });
  const capabilityReport = capabilities && isPlainObject(capabilities)
    ? {
        ...detectedCapabilities,
        ...capabilities,
        features: { ...detectedCapabilities.features, ...capabilities.features },
        limits: { ...detectedCapabilities.limits, ...capabilities.limits },
        warnings: Array.isArray(capabilities.warnings) ? capabilities.warnings : detectedCapabilities.warnings,
      }
    : detectedCapabilities;
  let entries = [];
  let disposed = false;
  let lastSignature = '';
  let lastDiagnostics = null;

  function emit(type) {
    if (listeners.size === 0) return;
    const event = Object.freeze({ diagnostics: getDiagnostics(), manager: api, type });
    for (const listener of listeners) listener(event);
  }

  function resolveCookie(entry) {
    const cookie = entry.descriptor.cookie;
    if (!cookie) {
      entry.cookieStatus = 'none';
      return;
    }
    if (!quality.allowCookies) {
      entry.cookieStatus = 'quality-disabled';
      return;
    }
    if (entry.descriptor.type !== 'spot') {
      entry.cookieStatus = 'unsupported';
      return;
    }
    if (typeof textureResolver !== 'function') {
      entry.cookieStatus = 'unresolved';
      return;
    }
    entry.cookieStatus = 'loading';
    let resolved;
    try {
      resolved = textureResolver(cookie, entry.descriptor);
    } catch (error) {
      entry.cookieStatus = 'error';
      entry.cookieError = error.message;
      return;
    }
    Promise.resolve(resolved).then((texture) => {
      if (disposed || !entries.includes(entry)) return;
      if (!texture?.isTexture) {
        entry.cookieStatus = 'invalid';
        emit('cookie');
        return;
      }
      entry.cookieTexture = texture;
      if (quality.allowCookies) {
        entry.light.map = texture;
        entry.cookieStatus = 'ready';
      } else {
        entry.light.map = null;
        entry.cookieStatus = 'quality-disabled';
      }
      emit('cookie');
    }).catch((error) => {
      if (disposed || !entries.includes(entry)) return;
      entry.cookieStatus = 'error';
      entry.cookieError = error.message;
      emit('cookie');
    });
  }

  function releaseEntry(entry) {
    entry.light.removeFromParent();
    entry.target?.removeFromParent();
    entry.light.shadow?.map?.dispose?.();
    if (disposeCookieTextures) entry.cookieTexture?.dispose?.();
  }

  function buildEntry(descriptor, index) {
    const { fallback, light, target } = createThreeLight(descriptor);
    group.add(light);
    if (target) group.add(target);
    if (AREA_LIGHT_TYPES.has(descriptor.type) && ltcState !== 'ready') {
      ensureAreaLightSupport().then((ready) => {
        if (ready && !disposed) update();
      });
    }
    const entry = {
      active: false,
      cookieError: null,
      cookieStatus: 'none',
      cookieTexture: null,
      cullReason: 'not-updated',
      descriptor,
      distance: 0,
      fallback,
      index,
      light,
      score: 0,
      shadowPixels: configureShadow(light, descriptor, quality, recipe.shadowPolicy.updateMode),
      shadowed: false,
      target,
    };
    resolveCookie(entry);
    return entry;
  }

  function rebuild() {
    for (const entry of entries) releaseEntry(entry);
    entries = recipe.lights.map((descriptor, index) => buildEntry(descriptor, index));
    lastSignature = '';
    update();
  }

  /** Applies a same-type descriptor change to a realized light in place. */
  function applyDescriptorToEntry(entry, descriptor) {
    entry.descriptor = descriptor;
    const light = entry.light;
    light.name = descriptor.name;
    light.position.fromArray(descriptor.position);
    setLayers(light, descriptor.layers);
    light.color.copy(threeColor(descriptor.color));
    light.intensity = resolveThreeLightIntensity(descriptor.type, descriptor.intensity, descriptor);
    if (light.isHemisphereLight) light.groundColor.copy(threeColor(descriptor.groundColor));
    if (light.isPointLight || light.isSpotLight) {
      light.distance = descriptor.distance;
      light.decay = descriptor.decay;
    }
    if (light.isSpotLight) {
      light.angle = descriptor.angle;
      light.penumbra = descriptor.penumbra;
    }
    if (light.isRectAreaLight) {
      light.width = descriptor.width;
      light.height = descriptor.type === 'discArea' ? descriptor.width : descriptor.height;
    }
    if (entry.target) {
      entry.target.position.fromArray(descriptor.target);
    } else if (AREA_LIGHT_TYPES.has(descriptor.type)) {
      light.lookAt(new THREE.Vector3().fromArray(descriptor.target));
    }
    const previousMapSize = light.shadow?.mapSize?.x ?? 0;
    entry.shadowPixels = configureShadow(light, descriptor, quality, recipe.shadowPolicy.updateMode);
    if (light.shadow && light.shadow.mapSize.x !== previousMapSize) {
      light.shadow.map?.dispose?.();
      light.shadow.map = null;
    }
    light.userData.toonlabLighting = {
      artistic: cloneJson(descriptor.artistic),
      cookie: cloneJson(descriptor.cookie),
      fallback: entry.fallback,
      ies: cloneJson(descriptor.ies),
      id: descriptor.id,
      linking: cloneJson(descriptor.linking),
      type: descriptor.type,
      userData: cloneJson(descriptor.userData),
    };
  }

  function selectLights(point) {
    const candidates = [];
    group.updateMatrixWorld(true);
    for (const entry of entries) {
      const descriptor = entry.descriptor;
      entry.active = false;
      entry.shadowed = false;
      entry.light.castShadow = false;
      entry.light.visible = false;
      entry.cullReason = null;

      if (!descriptor.enabled) {
        entry.cullReason = 'disabled';
        continue;
      }
      if (AREA_LIGHT_TYPES.has(descriptor.type)) {
        if (!quality.allowAreaLights) {
          entry.cullReason = 'area-lights-disabled';
          continue;
        }
        if (ltcState !== 'ready') {
          entry.cullReason = ltcState === 'unavailable' ? 'area-ltc-unavailable' : 'area-ltc-pending';
          continue;
        }
      }
      entry.distance = LOCAL_LIGHT_TYPES.has(descriptor.type)
        ? entry.light.getWorldPosition(worldPosition).distanceTo(point)
        : 0;
      const descriptorLimit = descriptor.maxDistance > 0 ? descriptor.maxDistance : quality.maxDistance;
      const distanceLimit = Math.min(
        descriptorLimit > 0 ? descriptorLimit : Number.POSITIVE_INFINITY,
        quality.maxDistance > 0 ? quality.maxDistance : Number.POSITIVE_INFINITY,
      );
      if (LOCAL_LIGHT_TYPES.has(descriptor.type) && entry.distance > distanceLimit) {
        entry.cullReason = 'distance';
        continue;
      }
      const globalBonus = LOCAL_LIGHT_TYPES.has(descriptor.type) ? 0 : 1_000_000;
      entry.score = globalBonus + descriptor.priority * 1000 - entry.distance;
      candidates.push(entry);
    }

    candidates.sort((a, b) => b.score - a.score || a.index - b.index);
    const typeCounts = Object.create(null);
    let selectedCount = 0;
    for (const entry of candidates) {
      const type = entry.descriptor.type;
      const typeCap = quality.maxLightsByType[type] ?? quality.maxLights;
      const typeCount = typeCounts[type] ?? 0;
      if (typeCount >= typeCap) {
        entry.cullReason = 'type-budget';
        continue;
      }
      if (selectedCount >= quality.maxLights) {
        entry.cullReason = 'total-budget';
        continue;
      }
      entry.active = true;
      entry.cullReason = null;
      entry.light.visible = true;
      typeCounts[type] = typeCount + 1;
      selectedCount += 1;
    }
  }

  function selectShadows() {
    const policy = recipe.shadowPolicy;
    if (policy.mode === 'disabled') return;
    const maxCount = Math.min(policy.maxShadowedLights, quality.maxShadowedLights);
    const maxPixels = Math.min(policy.maxShadowMapPixels, quality.maxShadowMapPixels);
    const candidates = entries.filter((entry) => entry.active
      && entry.descriptor.castShadow
      && entry.descriptor.shadow.enabled
      && policy.allowedTypes.includes(entry.descriptor.type)
      && entry.light.shadow);
    candidates.sort((a, b) => {
      const scoreA = a.descriptor.shadow.priority + a.descriptor.priority;
      const scoreB = b.descriptor.shadow.priority + b.descriptor.priority;
      return scoreB - scoreA || a.distance - b.distance || a.index - b.index;
    });

    let count = 0;
    let pixels = 0;
    for (const entry of candidates) {
      if (count >= maxCount) continue;
      if (pixels + entry.shadowPixels > maxPixels) continue;
      entry.shadowed = true;
      entry.light.castShadow = true;
      count += 1;
      pixels += entry.shadowPixels;
    }
  }

  function buildDiagnostics() {
    const active = entries.filter((entry) => entry.active);
    const shadowed = entries.filter((entry) => entry.shadowed);
    const countsByType = {};
    for (const entry of entries) {
      countsByType[entry.descriptor.type] ??= { active: 0, authored: 0, shadowed: 0 };
      countsByType[entry.descriptor.type].authored += 1;
      if (entry.active) countsByType[entry.descriptor.type].active += 1;
      if (entry.shadowed) countsByType[entry.descriptor.type].shadowed += 1;
    }
    const warnings = [...capabilityReport.warnings];
    if (entries.some((entry) => entry.descriptor.ies)) {
      warnings.push('IES profiles are preserved as metadata; the core Three.js runtime does not evaluate them.');
    }
    if (entries.some((entry) => entry.descriptor.linking.includeTags.length > 0
      || entry.descriptor.linking.excludeTags.length > 0)) {
      warnings.push('Tag-based light linking requires a host material/object adapter; Three.js layers are applied directly.');
    }
    for (const fallback of [...new Set(entries.map((entry) => entry.fallback).filter(Boolean))]) warnings.push(fallback);
    if (entries.some((entry) => entry.cullReason === 'area-ltc-pending')) {
      warnings.push('Area lights are initializing their LTC lookup textures and will activate shortly.');
    }
    if (entries.some((entry) => entry.cullReason === 'area-ltc-unavailable')) {
      warnings.push('Area lights are unavailable: the LTC lookup textures failed to load.');
    }
    if (entries.some((entry) => entry.cookieStatus === 'unresolved')) {
      warnings.push('One or more spot cookies need a textureResolver to be realized.');
    }
    if (active.length < entries.filter((entry) => entry.descriptor.enabled).length) {
      warnings.push('One or more enabled lights were culled by distance, type, or total-light budgets.');
    }

    return {
      activeLightCount: active.length,
      backend: capabilityReport.backend,
      countsByType,
      entries: entries.map((entry) => ({
        active: entry.active,
        cookieStatus: entry.cookieStatus,
        cullReason: entry.cullReason,
        distance: entry.distance,
        fallback: entry.fallback,
        id: entry.descriptor.id,
        iesStatus: entry.descriptor.ies ? 'metadata-only' : 'none',
        score: entry.score,
        shadowPixels: entry.shadowed ? entry.shadowPixels : 0,
        shadowed: entry.shadowed,
        type: entry.descriptor.type,
      })),
      qualityId: quality.id,
      recipeId: recipe.id,
      selectedIds: active.map((entry) => entry.descriptor.id),
      shadowedIds: shadowed.map((entry) => entry.descriptor.id),
      shadowedLightCount: shadowed.length,
      totalLightCount: entries.length,
      warnings: [...new Set(warnings)],
    };
  }

  /** Re-runs distance, priority, type-cap, total-cap, and shadow selection. */
  function update(options = {}, maybeCamera = null) {
    if (disposed) return lastDiagnostics;
    let updateOptions = isPlainObject(options) ? options : {};
    if (options?.isCamera) updateOptions = { camera: options };
    if (typeof options === 'number' && maybeCamera?.isCamera) updateOptions = { camera: maybeCamera };
    if (updateOptions.camera) camera = updateOptions.camera;
    focusPosition(updateOptions, camera, selectionPoint);
    selectLights(selectionPoint);
    selectShadows();
    lastDiagnostics = buildDiagnostics();
    const signature = selectionSignature(entries);
    if (signature !== lastSignature) {
      lastSignature = signature;
      emit('selection');
    }
    return getDiagnostics();
  }

  function setRecipe(nextRecipe) {
    if (disposed) throw new Error('Cannot update a disposed lighting manager.');
    recipe = recipeSource(nextRecipe);
    rebuild();
    emit('recipe');
    return api;
  }

  function setQuality(nextQuality) {
    if (disposed) throw new Error('Cannot update a disposed lighting manager.');
    quality = qualitySource(nextQuality);
    for (const entry of entries) {
      entry.shadowPixels = configureShadow(entry.light, entry.descriptor, quality, recipe.shadowPolicy.updateMode);
      if (entry.descriptor.cookie && !quality.allowCookies) {
        entry.light.map = null;
        entry.cookieStatus = 'quality-disabled';
      } else if (entry.descriptor.cookie && entry.cookieTexture) {
        entry.light.map = entry.cookieTexture;
        entry.cookieStatus = 'ready';
      } else if (entry.descriptor.cookie && entry.cookieStatus === 'quality-disabled') {
        resolveCookie(entry);
      }
    }
    update();
    emit('quality');
    return api;
  }

  function updateLight(id, overrides) {
    const index = recipe.lights.findIndex((light) => light.id === id);
    if (index === -1) return null;
    const next = mergeLightDescriptor(recipe.lights[index], overrides);
    next.id = id;
    recipe.lights[index] = next;
    const entry = entries.find((candidate) => candidate.descriptor.id === id);
    if (!entry || entry.descriptor.type !== next.type) {
      // Only a light-type change requires recreating the THREE object.
      rebuild();
    } else {
      const previousCookie = JSON.stringify(entry.descriptor.cookie ?? null);
      applyDescriptorToEntry(entry, next);
      if (JSON.stringify(next.cookie ?? null) !== previousCookie) resolveCookie(entry);
      update();
    }
    emit('light');
    return next;
  }

  /** Realizes one additional descriptor without touching existing lights. */
  function addLight(descriptorSource) {
    if (disposed) throw new Error('Cannot update a disposed lighting manager.');
    const descriptor = createLightDescriptor(descriptorSource);
    descriptor.id = uniqueId(descriptor.id, new Set(recipe.lights.map((light) => light.id)), descriptor.type);
    recipe.lights.push(descriptor);
    entries.push(buildEntry(descriptor, entries.length));
    update();
    emit('light');
    return descriptor.id;
  }

  /** Releases one realized light without touching the others. */
  function removeLight(id) {
    const recipeIndex = recipe.lights.findIndex((light) => light.id === id);
    if (recipeIndex !== -1) recipe.lights.splice(recipeIndex, 1);
    const entryIndex = entries.findIndex((entry) => entry.descriptor.id === id);
    if (entryIndex === -1) return false;
    releaseEntry(entries[entryIndex]);
    entries.splice(entryIndex, 1);
    update();
    emit('light');
    return true;
  }

  function setLightEnabled(id, enabled) {
    const descriptor = recipe.lights.find((light) => light.id === id);
    if (!descriptor) return false;
    descriptor.enabled = Boolean(enabled);
    update();
    emit('light');
    return true;
  }

  function addToScene(nextScene) {
    if (!nextScene?.isScene && !nextScene?.isObject3D) throw new Error('addToScene requires a Three.js scene or Object3D.');
    if (scene === nextScene && group.parent === nextScene) return api;
    group.removeFromParent();
    scene = nextScene;
    scene.add(group);
    update();
    return api;
  }

  function removeFromScene() {
    group.removeFromParent();
    scene = null;
    return api;
  }

  function getDiagnostics() {
    return cloneJson(buildDiagnostics());
  }

  function getLight(id) {
    return entries.find((entry) => entry.descriptor.id === id)?.light ?? null;
  }

  function requestShadowUpdate(id = null) {
    let count = 0;
    for (const entry of entries) {
      if (id !== null && entry.descriptor.id !== id) continue;
      if (!entry.light.shadow) continue;
      entry.light.shadow.needsUpdate = true;
      count += 1;
    }
    return count;
  }

  function applyLook(lookOptions) {
    const look = typeof lookOptions === 'string'
      ? resolveLightingLookPreset(lookOptions)
      : createLightingLook(lookOptions);
    setRecipe(look.recipe);
    setQuality(look.quality);
    return { environment: cloneJson(look.environment), post: cloneJson(look.post) };
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new TypeError('Lighting listener must be a function.');
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  function dispose() {
    if (disposed) return;
    removeFromScene();
    for (const entry of entries) releaseEntry(entry);
    entries = [];
    listeners.clear();
    disposed = true;
  }

  const api = {
    addLight,
    addToScene,
    applyLook,
    removeLight,
    capabilities: capabilityReport,
    dispose,
    getDiagnostics,
    getLight,
    group,
    removeFromScene,
    requestShadowUpdate,
    setLightEnabled,
    setQuality,
    setRecipe,
    subscribe,
    update,
    updateLight,
    get quality() { return quality; },
    get recipe() { return recipe; },
    get scene() { return scene; },
  };

  if (initialScene) addToScene(initialScene);
  rebuild();
  return api;
}

/** Alias emphasizing that a manager owns one realized rig. */
export function createLightingRig(options = {}) {
  return createLightingManager(options);
}

/** Convenience recipe-first entry point for Three.js realization. */
export function realizeLightingRecipe(recipe, options = {}) {
  return createLightingManager({ ...options, recipe });
}
