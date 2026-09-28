import * as THREE from 'three';
import { cameraPosition, clamp, exp, Fn, length, max, mix, output, positionWorld, uniform, vec3, vec4 } from 'three/tsl';

export const DEFAULT_WATER_UNDERWATER_ATMOSPHERE = Object.freeze({
  enabled: true,
  fogNear: 0.5,
  fogFar: 32,
  colorScale: Object.freeze([0.8, 0.85, 0.9]),
  overlayOpacity: 0.22,
  clipToSurfaceBounds: true,
  boundsMargin: 0,
  clearFogNode: true,
});

const sceneAtmosphereStates = new WeakMap();

function finiteOr(value, fallback) {
  return Number.isFinite(value) ? value : fallback;
}

function colorArray(value, fallback) {
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  return [
    finiteOr(value[0], fallback[0]),
    finiteOr(value[1], fallback[1]),
    finiteOr(value[2], fallback[2]),
  ];
}

export function createWaterUnderwaterAtmosphereOptions(options = true) {
  if (options === false) {
    return { ...DEFAULT_WATER_UNDERWATER_ATMOSPHERE, enabled: false };
  }
  const source = options && typeof options === 'object' ? options : {};
  const fogNear = Math.max(0, finiteOr(
    source.fogNear,
    DEFAULT_WATER_UNDERWATER_ATMOSPHERE.fogNear,
  ));
  const fogFar = Math.max(
    fogNear + 0.01,
    finiteOr(source.fogFar, DEFAULT_WATER_UNDERWATER_ATMOSPHERE.fogFar),
  );
  return {
    enabled: source.enabled ?? true,
    fogNear,
    fogFar,
    colorScale: colorArray(
      source.colorScale,
      DEFAULT_WATER_UNDERWATER_ATMOSPHERE.colorScale,
    ),
    color: Array.isArray(source.color) ? colorArray(source.color, [0, 0.25, 0.35]) : null,
    overlayOpacity: THREE.MathUtils.clamp(finiteOr(
      source.overlayOpacity,
      DEFAULT_WATER_UNDERWATER_ATMOSPHERE.overlayOpacity,
    ), 0, 0.6),
    clipToSurfaceBounds: source.clipToSurfaceBounds ?? true,
    boundsMargin: Math.max(0, finiteOr(source.boundsMargin, 0)),
    clearFogNode: source.clearFogNode ?? true,
    waterPathFog: source.waterPathFog ?? false,
  };
}

export function resolveWaterUnderwaterAtmosphereState({
  cameraX = 0,
  cameraY = 0,
  cameraZ = 0,
  waterX = 0,
  waterY = 0,
  waterZ = 0,
  surfaceY = waterY,
  bedY = -Infinity,
  width = Infinity,
  depth = Infinity,
  settings = {},
  options = true,
} = {}) {
  const resolvedOptions = createWaterUnderwaterAtmosphereOptions(options);
  const boundsMargin = resolvedOptions.boundsMargin;
  const insideBounds = !resolvedOptions.clipToSurfaceBounds || (
    Math.abs(cameraX - waterX) <= Math.max(0, width * 0.5) + boundsMargin
    && Math.abs(cameraZ - waterZ) <= Math.max(0, depth * 0.5) + boundsMargin
  );
  const submergedDepth = Math.max(surfaceY - cameraY, 0);
  const active = Boolean(
    resolvedOptions.enabled
    && cameraY < surfaceY
    && cameraY > bedY
    && surfaceY > bedY
    && insideBounds
  );
  const midColor = colorArray(
    settings.midColor,
    colorArray(settings.deepColor, [0.02, 0.28, 0.38]),
  );
  const color = resolvedOptions.color ?? midColor.map((channel, index) => (
    THREE.MathUtils.clamp(channel * resolvedOptions.colorScale[index], 0, 1)
  ));
  return {
    active,
    insideBounds,
    submergedDepth,
    color,
    fogNear: resolvedOptions.fogNear,
    fogFar: resolvedOptions.fogFar,
    overlayOpacity: resolvedOptions.overlayOpacity,
    clearFogNode: resolvedOptions.clearFogNode,
    waterPathFog: resolvedOptions.waterPathFog ?? false,
    waterY,
    surfaceY,
    bedY,
  };
}

function getSceneAtmosphereState(scene) {
  let state = sceneAtmosphereStates.get(scene);
  if (!state) {
    state = {
      applied: false,
      base: null,
      candidates: new Map(),
      ownedBackground: new THREE.Color(),
      ownedFog: new THREE.Fog(0x000000, 0.5, 32),
      overlay: null,
    };
    sceneAtmosphereStates.set(scene, state);
  }
  return state;
}

function captureBaseSceneState(scene) {
  return {
    background: scene.background,
    fog: scene.fog,
    fogNode: scene.fogNode,
    hadFogNode: 'fogNode' in scene,
  };
}

function restoreBaseSceneState(scene, state) {
  if (state.overlay) state.overlay.visible = false;
  if (!state.applied || !state.base) return;
  scene.background = state.base.background;
  scene.fog = state.base.fog;
  if (state.base.hadFogNode) scene.fogNode = state.base.fogNode;
  else delete scene.fogNode;
  state.applied = false;
}

function ensureAtmosphereOverlay(scene, state) {
  if (!state.overlay) {
    const material = new THREE.MeshBasicMaterial({
      color: 0x007c99,
      depthTest: false,
      depthWrite: false,
      opacity: DEFAULT_WATER_UNDERWATER_ATMOSPHERE.overlayOpacity,
      toneMapped: false,
      transparent: true,
    });
    const overlay = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    overlay.name = 'ToonLab Underwater Atmosphere Veil';
    overlay.frustumCulled = false;
    overlay.renderOrder = Number.MAX_SAFE_INTEGER;
    overlay.userData.waterExclude = true;
    overlay.userData.waterGrabExclude = true;
    overlay.userData.waterReflectionExclude = true;
    state.overlay = overlay;
  }
  if (state.overlay.parent !== scene) scene.add(state.overlay);
  return state.overlay;
}

function placeAtmosphereOverlay(overlay, camera, selected) {
  if (!camera?.isCamera) {
    overlay.visible = false;
    return;
  }
  camera.updateWorldMatrix(true, false);
  const distance = Math.max(finiteOr(camera.near, 0.1) * 1.35, 0.12);
  camera.getWorldPosition(overlay.position);
  camera.getWorldQuaternion(overlay.quaternion);
  overlay.translateZ(-distance);
  let height;
  let width;
  if (camera.isPerspectiveCamera) {
    height = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) * 0.5) * distance;
    width = height * finiteOr(camera.aspect, 1);
  } else if (camera.isOrthographicCamera) {
    height = Math.abs(camera.top - camera.bottom) / Math.max(camera.zoom, 0.001);
    width = Math.abs(camera.right - camera.left) / Math.max(camera.zoom, 0.001);
  } else {
    height = 2;
    width = 2;
  }
  overlay.scale.set(width * 1.08, height * 1.08, 1);
  overlay.material.color.setRGB(...selected.color);
  const depthBlend = THREE.MathUtils.clamp(0.45 + selected.submergedDepth * 0.18, 0.45, 1);
  overlay.material.opacity = selected.overlayOpacity * depthBlend;
  overlay.visible = overlay.material.opacity > 0.001;
}

function selectAtmosphereCandidate(state) {
  let selected = null;
  for (const candidate of state.candidates.values()) {
    if (!candidate.active) continue;
    if (!selected || candidate.submergedDepth < selected.submergedDepth) {
      selected = candidate;
    }
  }
  return selected;
}

function applySelectedAtmosphere(scene, state) {
  const selected = selectAtmosphereCandidate(state);
  if (!selected) {
    restoreBaseSceneState(scene, state);
    if (state.overlay) {
      state.overlay.removeFromParent();
      state.overlay.geometry.dispose();
      state.overlay.material.dispose();
      state.overlay = null;
    }
    state.base = null;
    return;
  }
  if (!state.base) state.base = captureBaseSceneState(scene);
  state.ownedBackground.setRGB(...selected.color);
  state.ownedFog.color.copy(state.ownedBackground);
  state.ownedFog.near = selected.fogNear;
  state.ownedFog.far = selected.fogFar;
  scene.background = state.ownedBackground;
  scene.fog = state.ownedFog;
  if (selected.waterPathFog) {
    if (!state.opticalFog) {
      const color = uniform(new THREE.Color()), level = uniform(0), density = uniform(1);
      const node = Fn(() => {
        const ray = positionWorld.sub(cameraPosition);
        // Main camera is submerged. Above-water geometry only accumulates
        // attenuation up to the interface, never over its segment in air.
        const fraction = clamp(level.sub(cameraPosition.y).div(max(ray.y, 1e-5)), 0.0, 1.0);
        const waterDistance = length(ray).mul(fraction);
        const transmission = exp(vec3(0.18,0.065,0.04).mul(waterDistance).mul(density).negate());
        return vec4(output.rgb.mul(transmission).add(color.mul(transmission.oneMinus())), output.a);
      })();
      state.opticalFog = { color, level, density, node };
    }
    state.opticalFog.color.value.setRGB(...selected.color, THREE.SRGBColorSpace);
    state.opticalFog.level.value = selected.surfaceY ?? selected.waterY;
    state.opticalFog.density.value = 32 / Math.max(selected.fogFar, 1);
    scene.fogNode = state.opticalFog.node;
  } else if (selected.clearFogNode) scene.fogNode = null;
  placeAtmosphereOverlay(
    ensureAtmosphereOverlay(scene, state),
    selected.camera,
    selected,
  );
  state.applied = true;
}

// Scene adapter used by WaterSurface. It temporarily restores the host's air
// scene before water capture passes, then applies the proven Water Lab
// body-color atmosphere for the host's main render. Shared scene state keeps
// multiple water surfaces from saving one another's temporary fog as a base.
export class WaterUnderwaterAtmosphere {
  constructor(options = true) {
    this.options = createWaterUnderwaterAtmosphereOptions(options);
    this.scene = null;
    this.state = resolveWaterUnderwaterAtmosphereState({ options: false });
  }

  detach() {
    if (!this.scene) return;
    const scene = this.scene;
    const shared = getSceneAtmosphereState(scene);
    restoreBaseSceneState(scene, shared);
    shared.candidates.delete(this);
    applySelectedAtmosphere(scene, shared);
    this.scene = null;
  }

  beginFrame(scene) {
    if (!scene || !this.options.enabled) return;
    if (this.scene && this.scene !== scene) this.detach();
    this.scene = scene;
    restoreBaseSceneState(scene, getSceneAtmosphereState(scene));
  }

  update(scene, inputs = {}) {
    if (!scene || !this.options.enabled) {
      this.detach();
      this.state = resolveWaterUnderwaterAtmosphereState({
        ...inputs,
        options: false,
      });
      return this.state;
    }
    if (this.scene !== scene) this.beginFrame(scene);
    const shared = getSceneAtmosphereState(scene);
    this.state = resolveWaterUnderwaterAtmosphereState({
      ...inputs,
      options: this.options,
    });
    if (this.state.active) shared.candidates.set(this, {
      ...this.state,
      camera: inputs.camera,
    });
    else shared.candidates.delete(this);
    applySelectedAtmosphere(scene, shared);
    return this.state;
  }

  dispose() {
    this.detach();
    this.state = resolveWaterUnderwaterAtmosphereState({ options: false });
  }
}
