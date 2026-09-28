// A production-safe objective/checkpoint ring: geometry is always an open
// torus, never a filled billboard or disc. The restrained outer torus and
// bounded point light provide glow without washing a screen-sized veil over
// the world behind it.

import * as THREE from 'three';

export const DEFAULT_GLOW_RING_SETTINGS = Object.freeze({
  color: Object.freeze([0.38, 0.96, 0.82]),
  coreOpacity: 0.9,
  haloOpacity: 0.12,
  haloScale: 2.4,
  lightDistanceRatio: 1.35,
  lightIntensity: 0.35,
  maxScreenFraction: 0.22,
  nearScreenOpacity: 0.08,
  pulseAmount: 0.06,
  pulseSpeed: 1.4,
  radialSegments: 12,
  radius: 3,
  tubeRatio: 0.022,
  tubularSegments: 96,
});

function finite(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function colorArray(value, fallback) {
  if (value?.isColor) return [value.r, value.g, value.b];
  if (!Array.isArray(value) || value.length < 3) return [...fallback];
  const channels = value.slice(0, 3).map(Number);
  return channels.every(Number.isFinite) ? channels : [...fallback];
}

export function createGlowRingSettings(options = {}) {
  const source = options && typeof options === 'object' ? options : {};
  return {
    color: colorArray(source.color, DEFAULT_GLOW_RING_SETTINGS.color),
    coreOpacity: THREE.MathUtils.clamp(
      finite(source.coreOpacity, DEFAULT_GLOW_RING_SETTINGS.coreOpacity), 0.25, 1),
    haloOpacity: THREE.MathUtils.clamp(
      finite(source.haloOpacity, DEFAULT_GLOW_RING_SETTINGS.haloOpacity), 0, 0.2),
    haloScale: THREE.MathUtils.clamp(
      finite(source.haloScale, DEFAULT_GLOW_RING_SETTINGS.haloScale), 1.2, 3),
    lightDistanceRatio: THREE.MathUtils.clamp(
      finite(source.lightDistanceRatio, DEFAULT_GLOW_RING_SETTINGS.lightDistanceRatio), 0, 2),
    lightIntensity: THREE.MathUtils.clamp(
      finite(source.lightIntensity, DEFAULT_GLOW_RING_SETTINGS.lightIntensity), 0, 2),
    maxScreenFraction: THREE.MathUtils.clamp(
      finite(source.maxScreenFraction, DEFAULT_GLOW_RING_SETTINGS.maxScreenFraction), 0.08, 0.5),
    nearScreenOpacity: THREE.MathUtils.clamp(
      finite(source.nearScreenOpacity, DEFAULT_GLOW_RING_SETTINGS.nearScreenOpacity), 0, 0.35),
    pulseAmount: THREE.MathUtils.clamp(
      finite(source.pulseAmount, DEFAULT_GLOW_RING_SETTINGS.pulseAmount), 0, 0.15),
    pulseSpeed: THREE.MathUtils.clamp(
      finite(source.pulseSpeed, DEFAULT_GLOW_RING_SETTINGS.pulseSpeed), 0, 4),
    radialSegments: Math.round(THREE.MathUtils.clamp(
      finite(source.radialSegments, DEFAULT_GLOW_RING_SETTINGS.radialSegments), 6, 24)),
    radius: Math.max(finite(source.radius, DEFAULT_GLOW_RING_SETTINGS.radius), 0.05),
    // A bounded ratio makes a misconfigured checkpoint remain a hoop. Even
    // the translucent shell cannot approach a filled-disc silhouette.
    tubeRatio: THREE.MathUtils.clamp(
      finite(source.tubeRatio, DEFAULT_GLOW_RING_SETTINGS.tubeRatio), 0.006, 0.045),
    tubularSegments: Math.round(THREE.MathUtils.clamp(
      finite(source.tubularSegments, DEFAULT_GLOW_RING_SETTINGS.tubularSegments), 24, 192)),
  };
}

function ringMaterial(color, opacity, name) {
  const material = new THREE.MeshBasicMaterial({
    blending: THREE.AdditiveBlending,
    color,
    depthWrite: false,
    opacity,
    side: THREE.DoubleSide,
    toneMapped: false,
    transparent: true,
  });
  material.name = name;
  return material;
}

/**
 * Creates a crisp open hoop with a restrained line halo and local point glow.
 * The torus starts in the XY plane (normal +Z); pass `normal` to orient it.
 */
export function createGlowRing({
  camera = null,
  normal = [0, 0, 1],
  position = [0, 0, 0],
  settings: settingsInput = {},
  ...directSettings
} = {}) {
  const settings = createGlowRingSettings({ ...directSettings, ...settingsInput });
  const color = new THREE.Color().setRGB(...settings.color, THREE.SRGBColorSpace);
  const tubeRadius = settings.radius * settings.tubeRatio;
  const root = new THREE.Group();
  root.name = 'ToonLabGlowRing';
  root.position.fromArray(position);
  const facing = new THREE.Vector3().fromArray(normal).normalize();
  if (facing.lengthSq() === 0) facing.set(0, 0, 1);
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), facing);
  root.userData.waterExclude = true;

  const coreGeometry = new THREE.TorusGeometry(
    settings.radius, tubeRadius, settings.radialSegments, settings.tubularSegments,
  );
  const haloGeometry = new THREE.TorusGeometry(
    settings.radius, tubeRadius * settings.haloScale,
    settings.radialSegments, settings.tubularSegments,
  );
  const coreMaterial = ringMaterial(color, settings.coreOpacity, 'ToonLabGlowRingCore');
  const haloMaterial = ringMaterial(color, settings.haloOpacity, 'ToonLabGlowRingHalo');
  const core = new THREE.Mesh(coreGeometry, coreMaterial);
  const halo = new THREE.Mesh(haloGeometry, haloMaterial);
  core.name = 'ToonLabGlowRingCore';
  halo.name = 'ToonLabGlowRingHalo';
  core.renderOrder = 6;
  halo.renderOrder = 5;

  const pointGlow = new THREE.PointLight(
    color,
    settings.lightIntensity,
    settings.radius * settings.lightDistanceRatio,
    2,
  );
  pointGlow.name = 'ToonLabGlowRingPointGlow';
  pointGlow.castShadow = false;
  root.add(halo, core, pointGlow);

  let time = 0;
  const cameraWorldPosition = new THREE.Vector3();
  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3();
  return {
    core,
    halo,
    pointGlow,
    root,
    settings,
    dispose() {
      coreGeometry.dispose();
      haloGeometry.dispose();
      coreMaterial.dispose();
      haloMaterial.dispose();
      root.parent?.remove(root);
    },
    update(delta = 1 / 60, activeCamera = camera) {
      time += Math.max(finite(delta, 1 / 60), 0);
      const pulse = 1 + Math.sin(time * settings.pulseSpeed * Math.PI * 2) * settings.pulseAmount;
      let screenVisibility = 1;
      if (activeCamera?.isPerspectiveCamera) {
        root.getWorldPosition(worldPosition);
        root.getWorldScale(worldScale);
        activeCamera.getWorldPosition(cameraWorldPosition);
        const distance = Math.max(cameraWorldPosition.distanceTo(worldPosition), 0.001);
        const fov = THREE.MathUtils.degToRad(activeCamera.getEffectiveFOV?.() ?? activeCamera.fov ?? 50);
        const projectedRadius = settings.radius * Math.max(worldScale.x, worldScale.y, worldScale.z)
          / Math.max(distance * Math.tan(fov / 2), 0.001);
        const overload = THREE.MathUtils.smoothstep(
          projectedRadius,
          settings.maxScreenFraction,
          settings.maxScreenFraction * 1.9,
        );
        screenVisibility = THREE.MathUtils.lerp(1, settings.nearScreenOpacity, overload);
      }
      halo.scale.setScalar(pulse);
      coreMaterial.opacity = settings.coreOpacity * screenVisibility;
      haloMaterial.opacity = settings.haloOpacity * (0.88 + (pulse - 1) * 2) * screenVisibility;
      pointGlow.intensity = settings.lightIntensity * (0.94 + (pulse - 1)) * screenVisibility;
      root.userData.screenVisibility = screenVisibility;
      return root;
    },
  };
}
