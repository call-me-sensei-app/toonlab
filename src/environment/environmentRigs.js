import * as THREE from 'three';
import {
  cameraProjectionMatrix,
  cameraViewMatrix,
  Discard,
  float,
  Fn,
  If,
  instancedBufferAttribute,
  length,
  max,
  mix,
  modelWorldMatrix,
  positionLocal,
  sin,
  smoothstep,
  uniform,
  uv,
  varying,
  vec2,
  vec3,
  vec4,
  viewportSize,
} from 'three/tsl';
import { NodeMaterial } from 'three/webgpu';
import { markFactorySystemOwned } from '../styles/styleMetadata.js';

// Scene-level environment rigs as reusable library modules: the sun rig
// (directional light + shadow + painterly disk/spill/beam/shaft accents),
// the lamp rig (warm point+spot pairs with optional spot shadows), the
// window backdrop billboard, and drifting dust motes. Together with
// applyEnvironmentShader these are the out-of-the-box recipe:
//
//   await applyEnvironmentShader(root, { environmentBox, hasSun: true });
//   const sun = createEnvironmentSunRig({ scene, environmentBox });
//   const lamps = createEnvironmentLampRig({ scene, environmentBox, root });
//   const backdrop = createEnvironmentBackdrop({ scene, environmentBox, textures });

const backdropTextureLoader = new THREE.TextureLoader();
const backdropTextureCache = new Map();

// ToonLab's surface-light adapter normalizes directional irradiance by PI.
// Keep the public rig input in intuitive "suns" while converting once at the
// Three light boundary.
export const ENVIRONMENT_SUN_INTENSITY_SCALE = Math.PI;

export function environmentRelativePoint(environmentBox, ratios, target = new THREE.Vector3()) {
  const center = environmentBox.getCenter(new THREE.Vector3());
  const size = environmentBox.getSize(new THREE.Vector3());
  return target.set(
    center.x + (ratios.x ?? 0) * size.x * 0.5,
    center.y + (ratios.y ?? 0) * size.y * 0.5,
    center.z + (ratios.z ?? 0) * size.z * 0.5,
  );
}

function additiveQuadMaterial({ color, opacity, tslAlpha, tslDiscardBelow = 0 }) {
  const uniforms = {
    color: uniform(new THREE.Color(color)),
    opacity: uniform(opacity),
  };
  const material = new NodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;
  material.fragmentNode = Fn(() => {
    const alpha = tslAlpha(uv(), uniforms).toVar();
    if (tslDiscardBelow > 0) Discard(alpha.lessThan(tslDiscardBelow));
    return vec4(uniforms.color, alpha);
  })();
  material.uniforms = uniforms;
  return material;
}

export function createSunDiskMaterial({ color = new THREE.Color(1.0, 0.78, 0.38), opacity = 0.62 } = {}) {
  return additiveQuadMaterial({
    color,
    opacity,
    tslAlpha: (uvNode, uniforms) => {
      const radius = length(uvNode.mul(2.0).sub(1.0));
      const core = smoothstep(0.0, 0.34, radius).oneMinus();
      const halo = smoothstep(0.26, 1.0, radius).oneMinus();
      return core.mul(0.72).add(halo.mul(0.42)).mul(uniforms.opacity);
    },
    tslDiscardBelow: 0.01,
  });
}

export function createSunSpillMaterial({ color = new THREE.Color(1.0, 0.7, 0.34), opacity = 0.3 } = {}) {
  const material = additiveQuadMaterial({
    color,
    opacity,
    tslAlpha: (uvNode, uniforms) => {
      const sideFade = smoothstep(0.0, 0.18, uvNode.x).mul(smoothstep(0.0, 0.18, uvNode.x.oneMinus()));
      const startFade = smoothstep(0.0, 0.12, uvNode.y);
      const endFade = smoothstep(0.72, 1.0, uvNode.y).oneMinus();
      const streak = sin(uvNode.x.mul(7.0).add(uvNode.y.mul(2.5)).mul(3.14159)).mul(0.22).add(0.78);
      return sideFade.mul(startFade).mul(endFade).mul(streak).mul(uniforms.opacity);
    },
  });
  return material;
}

export function createSunBeamMaterial({ color = new THREE.Color(1.0, 0.72, 0.34), opacity = 0.28 } = {}) {
  const material = additiveQuadMaterial({
    color,
    opacity,
    tslAlpha: (uvNode, uniforms) => {
      const sideFade = smoothstep(0.0, 0.2, uvNode.x).mul(smoothstep(0.0, 0.2, uvNode.x.oneMinus()));
      const lengthFade = smoothstep(0.0, 0.16, uvNode.y).mul(smoothstep(0.72, 1.0, uvNode.y).oneMinus());
      const rib = sin(uvNode.x.mul(5.0).add(uvNode.y.mul(1.5)).mul(3.14159)).mul(0.14).add(0.86);
      return sideFade.mul(lengthFade).mul(rib).mul(uniforms.opacity);
    },
    tslDiscardBelow: 0.01,
  });
  material.side = THREE.DoubleSide;
  return material;
}

export function createSunShaftMaterial({ color = new THREE.Color(1.0, 0.82, 0.52), opacity = 0.1 } = {}) {
  return additiveQuadMaterial({
    color,
    opacity,
    tslAlpha: (uvNode, uniforms) => {
      const sideFade = smoothstep(0.0, 0.22, uvNode.x).mul(smoothstep(0.0, 0.22, uvNode.x.oneMinus()));
      const verticalFade = smoothstep(0.0, 0.16, uvNode.y).mul(smoothstep(0.0, 0.18, uvNode.y.oneMinus()));
      const diagonalCoord = uvNode.x.add(uvNode.y.oneMinus().mul(0.42));
      const diagonal = smoothstep(0.08, 0.62, diagonalCoord)
        .mul(smoothstep(0.72, 1.22, diagonalCoord).oneMinus());
      return sideFade.mul(verticalFade).mul(diagonal).mul(uniforms.opacity);
    },
  });
}

// Directional sun with a tuned shadow map plus optional painterly accents:
// visible sun disk, floor light pool, angled beam, and volumetric-looking
// shaft quad. Every accent has an enabled flag and an opacity.
export function createEnvironmentSunRig({
  scene,
  environmentBox,
  color = new THREE.Color(1.0, 0.94, 0.85),
  intensity = 1,
  sourceRatios = { x: -0.46, y: 0.98, z: -0.42 },
  targetRatios = { x: 0.08, y: 0.12, z: 0.42 },
  shadow = {},
  accents = {},
} = {}) {
  if (!scene || !environmentBox) return null;

  const center = environmentBox.getCenter(new THREE.Vector3());
  const size = environmentBox.getSize(new THREE.Vector3());
  const {
    bias = -0.00004,
    extentRatio = 0.78,
    mapSize = 4096,
    normalBias = 0.004,
    radius = 2.0,
  } = shadow;

  const group = new THREE.Group();
  group.name = 'Environment sun rig';
  markFactorySystemOwned(group, 'lighting', 'toonlab/environment-sun-rig');

  const light = new THREE.DirectionalLight(
    color,
    intensity * ENVIRONMENT_SUN_INTENSITY_SCALE,
  );
  light.name = 'Environment sun key';
  light.castShadow = shadow.enabled !== false;
  light.shadow.mapSize.set(mapSize, mapSize);
  light.shadow.bias = bias;
  light.shadow.normalBias = normalBias;
  light.shadow.radius = radius;
  const shadowExtent = Math.max(size.x, size.z) * extentRatio;
  light.shadow.camera.near = 0.1;
  light.shadow.camera.far = size.length() * 3.2;
  light.shadow.camera.left = -shadowExtent;
  light.shadow.camera.right = shadowExtent;
  light.shadow.camera.top = shadowExtent;
  light.shadow.camera.bottom = -shadowExtent;
  light.position.copy(environmentRelativePoint(environmentBox, sourceRatios));
  light.target.position.copy(environmentRelativePoint(environmentBox, targetRatios));
  const sourceDistance = Math.max(light.position.distanceTo(light.target.position), 1);
  light.shadow.camera.updateProjectionMatrix();
  group.add(light);
  group.add(light.target);

  const diskOptions = { enabled: true, sizeRatio: 0.22, opacity: 0.62, ...accents.disk };
  const spillOptions = { enabled: true, widthRatio: 0.5, depthRatio: 0.48, opacity: 0.3, ...accents.spill };
  const beamOptions = { enabled: true, opacity: 0.28, ...accents.beam };
  const shaftOptions = { enabled: true, opacity: 0.1, ...accents.shaft };

  let disk = null;
  if (diskOptions.enabled) {
    const diskSize = size.y * diskOptions.sizeRatio;
    disk = new THREE.Mesh(
      new THREE.PlaneGeometry(diskSize, diskSize),
      createSunDiskMaterial({ opacity: diskOptions.opacity }),
    );
    disk.name = 'Environment sun disk';
    disk.renderOrder = -8;
    disk.frustumCulled = false;
    disk.position.copy(light.position).multiplyScalar(1.15);
    group.add(disk);
  }

  let spill = null;
  if (spillOptions.enabled) {
    spill = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * spillOptions.widthRatio, size.z * spillOptions.depthRatio),
      createSunSpillMaterial({ opacity: spillOptions.opacity }),
    );
    spill.name = 'Environment sun floor spill';
    spill.rotation.x = -Math.PI / 2;
    spill.rotation.z = -0.08;
    spill.position.set(center.x, environmentBox.min.y + 0.018, environmentBox.min.z + size.z * 0.38);
    spill.renderOrder = 12;
    spill.frustumCulled = false;
    group.add(spill);
  }

  let beam = null;
  if (beamOptions.enabled) {
    beam = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 0.38, size.z * 0.72),
      createSunBeamMaterial({ opacity: beamOptions.opacity }),
    );
    beam.name = 'Environment sun beam';
    beam.rotation.x = -Math.PI / 2;
    beam.rotation.z = -0.34;
    beam.position.set(center.x - size.x * 0.08, environmentBox.min.y + 0.028, environmentBox.min.z + size.z * 0.35);
    beam.renderOrder = 11;
    beam.frustumCulled = false;
    group.add(beam);
  }

  let shaft = null;
  if (shaftOptions.enabled) {
    shaft = new THREE.Mesh(
      new THREE.PlaneGeometry(size.x * 0.92, size.y * 0.7),
      createSunShaftMaterial({ opacity: shaftOptions.opacity }),
    );
    shaft.name = 'Environment sun shaft';
    shaft.position.set(center.x, environmentBox.min.y + size.y * 0.5, environmentBox.min.z + size.z * 0.22);
    shaft.renderOrder = 9;
    shaft.frustumCulled = false;
    group.add(shaft);
  }

  scene.add(group);

  // Applies a time-of-day style state in one call: light color/intensity,
  // sun position ratios, and accent opacities.
  function setState({
    color: nextColor,
    intensity: nextIntensity,
    sourceRatios: nextSource,
    targetRatios: nextTarget,
    diskOpacity,
    spillOpacity,
    beamOpacity,
    shaftOpacity,
  } = {}) {
    if (nextColor) light.color.set(nextColor);
    if (Number.isFinite(nextIntensity)) {
      light.intensity = nextIntensity * ENVIRONMENT_SUN_INTENSITY_SCALE;
    }
    if (nextSource) {
      light.position.copy(environmentRelativePoint(environmentBox, nextSource));
      disk?.position.copy(light.position).multiplyScalar(1.15);
    }
    if (nextTarget) light.target.position.copy(environmentRelativePoint(environmentBox, nextTarget));
    if (disk && Number.isFinite(diskOpacity)) disk.material.uniforms.opacity.value = diskOpacity;
    if (spill && Number.isFinite(spillOpacity)) spill.material.uniforms.opacity.value = spillOpacity;
    if (beam && Number.isFinite(beamOpacity)) beam.material.uniforms.opacity.value = beamOpacity;
    if (shaft && Number.isFinite(shaftOpacity)) shaft.material.uniforms.opacity.value = shaftOpacity;
    if (nextColor && disk) disk.material.uniforms.color.value.set(nextColor);
  }

  // Places the directional light from a real world-space direction instead
  // of interpreting direction components as environment-box ratios. The two
  // are only equivalent in a cube centered at the origin; wide worlds would
  // otherwise skew low-elevation sun paths badly when shadows are disabled.
  function setDirection(value, { distance = sourceDistance } = {}) {
    const direction = value?.isVector3
      ? value.clone()
      : new THREE.Vector3(...(Array.isArray(value) ? value.slice(0, 3) : []));
    if (![direction.x, direction.y, direction.z].every(Number.isFinite)) return null;
    if (direction.lengthSq() < 1e-8) direction.set(0.35, 0.8, 0.45);
    direction.normalize();
    light.position.copy(light.target.position).addScaledVector(
      direction,
      Math.max(Number(distance) || sourceDistance, 1),
    );
    disk?.position.copy(light.position);
    return direction;
  }

  function setEnabled(value) {
    group.visible = Boolean(value);
    light.visible = Boolean(value);
  }

  function dispose() {
    scene.remove(group);
    [disk, spill, beam, shaft].forEach((mesh) => {
      mesh?.geometry.dispose();
      mesh?.material.dispose();
    });
  }

  return { beam, disk, dispose, group, light, setDirection, setEnabled, setState, shaft, spill };
}

function detectLampPositions(root, environmentBox, pattern) {
  if (!root || !environmentBox) return [];
  const fixtureBox = new THREE.Box3();
  const fixtureSize = new THREE.Vector3();
  const fixtureCenter = new THREE.Vector3();
  const found = [];
  root.updateMatrixWorld(true);
  root.traverse((obj) => {
    if (!obj.isMesh || !obj.geometry) return;
    if (!pattern.test(obj.name || '')) return;
    fixtureBox.setFromObject(obj);
    if (fixtureBox.isEmpty()) return;
    fixtureBox.getSize(fixtureSize);
    fixtureBox.getCenter(fixtureCenter);
    found.push(new THREE.Vector3(
      fixtureCenter.x,
      fixtureBox.min.y + fixtureSize.y * 0.22,
      fixtureCenter.z,
    ));
  });
  return found.sort((a, b) => a.x - b.x);
}

function fallbackLampPositions(environmentBox, { xOffsetRatio = 0.28, zOffsetRatio = 0.03, heightRatio = 0.14 } = {}) {
  const center = environmentBox.getCenter(new THREE.Vector3());
  const size = environmentBox.getSize(new THREE.Vector3());
  const lampY = environmentBox.max.y - size.y * heightRatio;
  return [
    new THREE.Vector3(center.x - size.x * xOffsetRatio, lampY, center.z + size.z * zOffsetRatio),
    new THREE.Vector3(center.x + size.x * xOffsetRatio, lampY, center.z + size.z * zOffsetRatio),
  ];
}

// Warm interior lamps: one fill point light + one shadowed downlight spot per
// fixture, plus an additive glow sphere. Positions are detected from fixture
// mesh names when possible and fall back to a symmetric ceiling pair.
export function createEnvironmentLampRig({
  scene,
  environmentBox,
  root = null,
  detectPattern = /lamp|light/i,
  positions = null,
  maxLamps = 4,
  color = 0xffc27a,
  intensity = 2.2,
  distance = null,
  decay = 1.8,
  spot = {},
  glow = {},
  fallback = {},
} = {}) {
  if (!scene || !environmentBox) return null;

  const center = environmentBox.getCenter(new THREE.Vector3());
  const size = environmentBox.getSize(new THREE.Vector3());
  const {
    enabled: spotEnabled = true,
    intensityScale: spotIntensityScale = 1.45,
    angle: spotAngle = 0.74,
    penumbra: spotPenumbra = 0.82,
    decay: spotDecay = 1.35,
    castShadow: spotCastShadow = false,
    shadowMapSize = 1024,
    shadowBias = -0.0002,
    shadowNormalBias = 0.01,
    shadowCasterLimit = 2,
  } = spot;
  const {
    enabled: glowEnabled = true,
    sizeRatio: glowSizeRatio = 0.025,
    opacity: glowOpacity = 0.12,
    color: glowColor = 0xffc56f,
  } = glow;

  const lightDistance = distance ?? Math.max(2.2, size.y * 1.02);
  const spotDistance = spot.distance ?? Math.max(lightDistance, size.y * 1.38);
  const detected = positions ?? detectLampPositions(root, environmentBox, detectPattern);
  const lampPositions = (detected.length >= 2 ? detected : fallbackLampPositions(environmentBox, fallback))
    .slice(0, maxLamps);

  const group = new THREE.Group();
  group.name = 'Environment lamp rig';
  markFactorySystemOwned(group, 'lighting', 'toonlab/environment-lamp-rig');
  const lamps = [];

  lampPositions.forEach((position, index) => {
    const point = new THREE.PointLight(color, intensity, lightDistance, decay);
    point.name = `Environment lamp ${index + 1} fill`;
    point.castShadow = false;
    point.userData.ceilingLightBaseIntensity = intensity;
    point.userData.ceilingLightIntensity = intensity;
    point.position.copy(position);
    group.add(point);

    let spotLight = null;
    if (spotEnabled) {
      const spotIntensity = intensity * spotIntensityScale;
      spotLight = new THREE.SpotLight(color, spotIntensity, spotDistance, spotAngle, spotPenumbra, spotDecay);
      spotLight.name = `Environment lamp ${index + 1} downlight`;
      // Shadowed downlights ground furniture under each lamp; budgeted to the
      // first few fixtures because every casting spot adds a shadow pass.
      spotLight.castShadow = Boolean(spotCastShadow) && index < shadowCasterLimit;
      if (spotLight.castShadow) {
        spotLight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
        spotLight.shadow.bias = shadowBias;
        spotLight.shadow.normalBias = shadowNormalBias;
        spotLight.shadow.camera.near = 0.1;
        spotLight.shadow.camera.far = spotDistance;
      }
      spotLight.userData.ceilingLightBaseIntensity = spotIntensity;
      spotLight.userData.ceilingLightIntensity = spotIntensity;
      spotLight.position.copy(position);
      spotLight.target.position.set(
        THREE.MathUtils.lerp(position.x, center.x, 0.62),
        environmentBox.min.y + size.y * 0.12,
        center.z - size.z * 0.08,
      );
      group.add(spotLight);
      group.add(spotLight.target);
    }

    let glowMesh = null;
    if (glowEnabled) {
      glowMesh = new THREE.Mesh(
        new THREE.SphereGeometry(size.y * glowSizeRatio, 16, 8),
        new THREE.MeshBasicMaterial({
          color: glowColor,
          transparent: true,
          opacity: glowOpacity,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
        }),
      );
      glowMesh.name = `Environment lamp ${index + 1} glow`;
      glowMesh.userData.ceilingLightBaseOpacity = glowOpacity;
      glowMesh.userData.ceilingLightOpacity = glowOpacity;
      glowMesh.position.copy(position);
      glowMesh.renderOrder = 18;
      glowMesh.frustumCulled = false;
      group.add(glowMesh);
    }

    lamps.push({ glow: glowMesh, point, position: position.clone(), spot: spotLight });
  });

  scene.add(group);

  function setIntensity(multiplier) {
    const scale = Number.isFinite(multiplier) ? Math.max(multiplier, 0) : 1;
    for (const lamp of lamps) {
      lamp.point.intensity = lamp.point.userData.ceilingLightBaseIntensity * scale;
      lamp.point.userData.ceilingLightIntensity = lamp.point.intensity;
      if (lamp.spot) {
        lamp.spot.intensity = lamp.spot.userData.ceilingLightBaseIntensity * scale;
        lamp.spot.userData.ceilingLightIntensity = lamp.spot.intensity;
      }
      if (lamp.glow) {
        lamp.glow.material.opacity = Math.min(lamp.glow.userData.ceilingLightBaseOpacity * scale, 0.6);
        lamp.glow.userData.ceilingLightOpacity = lamp.glow.material.opacity;
      }
    }
  }

  function setEnabled(value) {
    group.visible = Boolean(value);
    for (const lamp of lamps) {
      lamp.point.visible = Boolean(value);
      if (lamp.spot) lamp.spot.visible = Boolean(value);
      if (lamp.glow) lamp.glow.visible = Boolean(value);
    }
  }

  function dispose() {
    scene.remove(group);
    for (const lamp of lamps) {
      lamp.glow?.geometry.dispose();
      lamp.glow?.material.dispose();
    }
  }

  return { dispose, group, lamps, setEnabled, setIntensity };
}

// Keeps fixture emissive materials in step with lamp intensity so a dimmed
// or extinguished lamp does not leave its shade glowing. Base strengths come
// from the per-material settings snapshot taken at conversion.
export function applyEnvironmentLampEmissive(root, multiplier) {
  const scale = Number.isFinite(multiplier) ? Math.max(multiplier, 0) : 1;
  root?.traverse?.((obj) => {
    if (!obj.isMesh || !obj.material) return;
    const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const mat of materials) {
      if (mat?.userData?.environmentRole !== 'emissive') continue;
      const uniform = mat.uniforms?.emissiveStrength;
      if (!uniform) continue;
      const base = mat.userData.environmentBaseUniformValues?.emissiveStrength ?? uniform.value;
      uniform.value = base * scale;
    }
  });
}

export function environmentBackdropPeriodForHour(hour) {
  const normalized = ((hour % 24) + 24) % 24;
  if (normalized >= 5 && normalized < 9) return 'morning';
  if (normalized >= 9 && normalized < 17) return 'day';
  if (normalized >= 17 && normalized < 20) return 'evening';
  return 'night';
}

// Window backdrop billboard with time-of-day texture switching. textures can
// be a single url/Texture or a { day, morning, evening, night } map.
export function createEnvironmentBackdrop({
  scene,
  environmentBox,
  textures,
  distance = null,
  scale = null,
  yOffset = null,
} = {}) {
  if (!scene || !environmentBox || !textures) return null;

  const center = environmentBox.getCenter(new THREE.Vector3());
  const size = environmentBox.getSize(new THREE.Vector3());
  const textureMap = typeof textures === 'string' || textures?.isTexture
    ? { day: textures }
    : { ...textures };
  const backdropDistance = THREE.MathUtils.clamp(
    distance ?? size.z * 0.65,
    Math.max(2, size.z * 0.65),
    Math.max(30, size.z * 7.5),
  );
  const backdropScale = scale ?? (size.z / Math.max(backdropDistance, 0.001)) * 0.14 * backdropDistance;

  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ toneMapped: false }),
  );
  mesh.name = 'Environment backdrop';
  markFactorySystemOwned(mesh, 'sky', 'toonlab/environment-backdrop');
  mesh.position.set(
    center.x,
    yOffset ?? environmentBox.min.y + size.y * 0.57,
    environmentBox.min.z - backdropDistance,
  );
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  scene.add(mesh);

  function applyTexture(texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    mesh.material.map = texture;
    mesh.material.needsUpdate = true;
    const image = texture.image;
    const aspect = image?.width && image?.height ? image.width / image.height : 16 / 9;
    mesh.scale.set(backdropScale * aspect, backdropScale, 1);
  }

  function setTexture(source) {
    if (source?.isTexture) {
      applyTexture(source);
      return Promise.resolve(source);
    }
    const url = String(source);
    if (!backdropTextureCache.has(url)) {
      backdropTextureCache.set(url, new Promise((resolve, reject) => {
        backdropTextureLoader.load(url, resolve, undefined, reject);
      }));
    }
    return backdropTextureCache.get(url).then((texture) => {
      applyTexture(texture);
      return texture;
    });
  }

  function setPeriod(period) {
    const source = textureMap[period] ?? textureMap.day ?? Object.values(textureMap)[0];
    return source ? setTexture(source) : Promise.resolve(null);
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }

  setPeriod('day');
  return { dispose, mesh, setPeriod, setTexture };
}

// Slow-drifting dust motes for sun shafts — the classic anime-interior touch.
// Deterministic layout (index-hashed, no Math.random) so captures repeat.
export function createEnvironmentDustMotes({
  scene,
  bounds,
  count = 140,
  color = 0xffe9c4,
  size = 0.02,
  opacity = 0.4,
  driftSpeed = 0.05,
} = {}) {
  if (!scene || !bounds) return null;

  const min = bounds.min;
  const boundsSize = bounds.getSize(new THREE.Vector3());
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const hash = (i, salt) => {
    const value = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
    return value - Math.floor(value);
  };
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = min.x + hash(i, 1) * boundsSize.x;
    positions[i * 3 + 1] = min.y + hash(i, 2) * boundsSize.y;
    positions[i * 3 + 2] = min.z + hash(i, 3) * boundsSize.z;
    phases[i] = hash(i, 4) * Math.PI * 2;
  }

  // WGSL has no point size, so the motes become one InstancedMesh of
  // billboarded quads whose clip-space offset reproduces the GLSL
  // gl_PointSize pixel math exactly (docs/tsl-conventions.md).
  const uniforms = {
    boundsHeight: uniform(boundsSize.y),
    boundsMinY: uniform(min.y),
    color: uniform(new THREE.Color(color)),
    driftSpeed: uniform(driftSpeed),
    opacity: uniform(opacity),
    pointSize: uniform(size),
    time: uniform(0),
  };

  const quad = new THREE.PlaneGeometry(1, 1);
  const positionAttribute = new THREE.InstancedBufferAttribute(positions, 3);
  const phaseAttribute = new THREE.InstancedBufferAttribute(phases, 1);

  const material = new NodeMaterial();
  material.transparent = true;
  material.depthWrite = false;
  material.blending = THREE.AdditiveBlending;
  material.fog = false;

  const vFade = varying(float(), 'vMoteFade');
  material.vertexNode = Fn(() => {
    const motePosition = instancedBufferAttribute(positionAttribute, 'vec3');
    const motePhase = instancedBufferAttribute(phaseAttribute, 'float');

    const driftedY = uniforms.boundsMinY.add(
      motePosition.y.sub(uniforms.boundsMinY)
        .add(uniforms.time.mul(uniforms.driftSpeed))
        .mod(uniforms.boundsHeight),
    );
    const drifted = vec3(
      motePosition.x.add(sin(uniforms.time.mul(0.31).add(motePhase)).mul(0.06)),
      driftedY,
      motePosition.z.add(uniforms.time.mul(0.23).add(motePhase.mul(1.7)).cos().mul(0.06)),
    );
    vFade.assign(sin(uniforms.time.mul(0.8).add(motePhase.mul(3.1))).mul(0.45).add(0.55));

    const mvPosition = cameraViewMatrix.mul(modelWorldMatrix).mul(vec4(drifted, 1.0)).toVar();
    const pixels = uniforms.pointSize.mul(320.0).div(max(mvPosition.z.negate(), 0.1));
    const clipPosition = cameraProjectionMatrix.mul(mvPosition).toVar();
    // plane(1,1) local xy spans [-0.5, 0.5] → full quad = `pixels` px, the
    // same square gl_PointSize would rasterize.
    clipPosition.xy.addAssign(
      positionLocal.xy.mul(pixels).mul(float(2.0).div(viewportSize)).mul(clipPosition.w),
    );
    return clipPosition;
  })();

  material.fragmentNode = Fn(() => {
    const p = uv().mul(2.0).sub(1.0);
    const alpha = smoothstep(0.3, 1.0, length(p)).oneMinus()
      .mul(uniforms.opacity)
      .mul(vFade)
      .toVar();
    Discard(alpha.lessThan(0.01));
    return vec4(uniforms.color, alpha);
  })();
  material.uniforms = uniforms;

  const instances = new THREE.InstancedMesh(quad, material, count);
  const identity = new THREE.Matrix4();
  for (let i = 0; i < count; i += 1) instances.setMatrixAt(i, identity);
  instances.instanceMatrix.needsUpdate = true;
  instances.name = 'Environment dust motes';
  markFactorySystemOwned(instances, 'lighting', 'toonlab/environment-dust-motes');
  instances.frustumCulled = false;
  instances.renderOrder = 16;
  scene.add(instances);

  return {
    dispose() {
      scene.remove(instances);
      quad.dispose();
      material.dispose();
    },
    points: instances,
    setOpacity(value) {
      if (Number.isFinite(value)) uniforms.opacity.value = value;
    },
    update(delta) {
      uniforms.time.value += Math.min(Math.max(delta ?? 0, 0), 0.1);
    },
  };
}
