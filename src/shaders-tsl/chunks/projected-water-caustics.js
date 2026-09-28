// Shared stylized caustic receiver for ToonLab environment/shore materials.
//
// The water surface already composites caustics into its above-water view.
// This receiver is enabled only while the camera is submerged, when the
// seabed is rendered directly. It samples a seamless precomputed Voronoi
// field twice with independent motion and combines the samples by minimum.
// The texture is generated deterministically at runtime, so the library keeps
// its no-external-water-assets contract and avoids running a Voronoi search in
// every environment fragment.

import * as THREE from 'three';
import {
  abs,
  clamp,
  exp,
  float,
  max,
  min,
  mix,
  sin,
  smoothstep,
  texture,
  uniform,
  vec2,
  vec3,
} from 'three/tsl';

const TEXTURE_SIZE = 96;
const SITE_GRID = 7;

function hash01(x, y, salt) {
  const value = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123;
  return value - Math.floor(value);
}

function smooth01(value) {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
}

function createCausticCellTexture() {
  const sites = [];
  for (let y = 0; y < SITE_GRID; y += 1) {
    for (let x = 0; x < SITE_GRID; x += 1) {
      sites.push({
        x: (x + 0.18 + hash01(x, y, 1) * 0.64) / SITE_GRID,
        y: (y + 0.18 + hash01(x, y, 2) * 0.64) / SITE_GRID,
      });
    }
  }

  const data = new Uint8Array(TEXTURE_SIZE * TEXTURE_SIZE * 4);
  for (let py = 0; py < TEXTURE_SIZE; py += 1) {
    const v = (py + 0.5) / TEXTURE_SIZE;
    for (let px = 0; px < TEXTURE_SIZE; px += 1) {
      const u = (px + 0.5) / TEXTURE_SIZE;
      let nearest = Infinity;
      let second = Infinity;
      for (const site of sites) {
        let dx = Math.abs(u - site.x);
        let dy = Math.abs(v - site.y);
        dx = Math.min(dx, 1 - dx);
        dy = Math.min(dy, 1 - dy);
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared < nearest) {
          second = nearest;
          nearest = distanceSquared;
        } else if (distanceSquared < second) {
          second = distanceSquared;
        }
      }
      // Store bright cell interiors and dark borders. The shader's
      // 1 - min(layerA, layerB) turns either layer's borders into light.
      const edgeDistance = Math.sqrt(second) - Math.sqrt(nearest);
      const cellInterior = smooth01((edgeDistance - 0.0015) / 0.014);
      const value = Math.round(cellInterior * 255);
      const index = (py * TEXTURE_SIZE + px) * 4;
      data[index] = value;
      data[index + 1] = value;
      data[index + 2] = value;
      data[index + 3] = 255;
    }
  }

  const result = new THREE.DataTexture(
    data,
    TEXTURE_SIZE,
    TEXTURE_SIZE,
    THREE.RGBAFormat,
  );
  result.name = 'ToonLab.ProjectedWaterCaustics';
  result.colorSpace = THREE.NoColorSpace;
  result.wrapS = THREE.RepeatWrapping;
  result.wrapT = THREE.RepeatWrapping;
  result.minFilter = THREE.LinearFilter;
  result.magFilter = THREE.LinearFilter;
  result.generateMipmaps = false;
  result.needsUpdate = true;
  return result;
}

const causticTexture = createCausticCellTexture();

export const projectedWaterCausticUniforms = {
  map: texture(causticTexture),
  surfaceMap: texture(causticTexture),
  useSurfaceMap: uniform(0),
  surfaceRegion: uniform(new THREE.Vector4(0,0,1,1)),
  enabled: uniform(0.0),
  time: uniform(0.0),
  waterLevel: uniform(0.0),
  // centerX, centerZ, halfWidth, halfDepth
  region: uniform(new THREE.Vector4(0, 0, 0.5, 0.5)),
  color: uniform(new THREE.Color(0.75, 0.98, 1.0)),
  intensity: uniform(0.35),
  scale: uniform(0.8),
  speed: uniform(0.6),
  flowDirection: uniform(new THREE.Vector2(0.72, -0.18)),
  waveDistortion: uniform(0.06),
  depthAttenuation: uniform(0.32),
};

function setSrgbColor(target, value) {
  if (value?.isColor) {
    target.copy(value);
  } else if (Array.isArray(value)) {
    target.setRGB(
      value[0] ?? 1,
      value[1] ?? 1,
      value[2] ?? 1,
      THREE.SRGBColorSpace,
    );
  }
}

/** Refresh the shared receiver from the active WaterSurface once per frame. */
export function updateProjectedWaterCaustics({
  enabled,
  time,
  waterLevel,
  centerX,
  centerZ,
  halfWidth,
  halfDepth,
  color,
  intensity,
  scale,
  speed,
  flowDirection,
  waveDistortion,
  depthAttenuation,
  surfaceMap = null,
  surfaceRegion = null,
} = {}) {
  const u = projectedWaterCausticUniforms;
  u.enabled.value = enabled ? 1 : 0;
  u.useSurfaceMap.value = surfaceMap ? 1 : 0;
  if (surfaceMap) u.surfaceMap.value = surfaceMap;
  if (surfaceRegion) u.surfaceRegion.value.copy(surfaceRegion);
  if (Number.isFinite(time)) u.time.value = time;
  if (Number.isFinite(waterLevel)) u.waterLevel.value = waterLevel;
  if ([centerX, centerZ, halfWidth, halfDepth].every(Number.isFinite)) {
    u.region.value.set(
      centerX,
      centerZ,
      Math.max(halfWidth, 0.001),
      Math.max(halfDepth, 0.001),
    );
  }
  setSrgbColor(u.color.value, color);
  if (Number.isFinite(intensity)) u.intensity.value = THREE.MathUtils.clamp(intensity, 0, 4);
  if (Number.isFinite(scale)) u.scale.value = THREE.MathUtils.clamp(scale, 0.02, 12);
  if (Number.isFinite(speed)) u.speed.value = THREE.MathUtils.clamp(speed, 0, 8);
  if (Array.isArray(flowDirection)) {
    u.flowDirection.value.set(flowDirection[0] ?? 1, flowDirection[1] ?? 0);
  } else if (flowDirection?.isVector2) {
    u.flowDirection.value.copy(flowDirection);
  }
  if (Number.isFinite(waveDistortion)) {
    u.waveDistortion.value = THREE.MathUtils.clamp(waveDistortion, 0, 1);
  }
  if (Number.isFinite(depthAttenuation)) {
    u.depthAttenuation.value = THREE.MathUtils.clamp(depthAttenuation, 0.001, 8);
  }
}

/**
 * Returns additive underwater caustic light for a world position/normal.
 * This deliberately stays branchless. A previous TSL `If`-wrapped version
 * compiled as a zeroed material branch on some WebGPU/WebGL node backends,
 * darkening the receiver whenever caustics were disabled above water.
 */
export function projectedWaterCaustics(worldPosition, worldNormal) {
  const u = projectedWaterCausticUniforms;
  const depth = max(u.waterLevel.sub(worldPosition.y), 0.0);
  const local = abs(worldPosition.xz.sub(u.region.xy));
  const feather = max(min(u.region.z, u.region.w).mul(0.025), 0.04);
  const inside = smoothstep(
    u.region.z.sub(feather),
    u.region.z,
    local.x,
  ).oneMinus().mul(smoothstep(
    u.region.w.sub(feather),
    u.region.w,
    local.y,
  ).oneMinus());
  const submerged = smoothstep(0.012, 0.08, depth);
  const depthFade = exp(depth.mul(u.depthAttenuation).negate());
  const receivingFace = mix(
    0.22,
    1.0,
    smoothstep(0.04, 0.72, clamp(worldNormal.y, 0.0, 1.0)),
  );

  const phase = u.time.mul(u.speed);
  const waveWarp = vec2(
    sin(worldPosition.z.mul(0.38).add(phase.mul(0.7))),
    sin(worldPosition.x.mul(0.31).sub(phase.mul(0.57))),
  ).mul(u.waveDistortion);
  const flow = u.flowDirection.mul(phase).mul(0.07);
  // The generated tile contains SITE_GRID cells per axis. Normalize that
  // baked frequency so the public causticsScale keeps its existing meaning
  // (roughly cells per metre) instead of becoming seven times too dense and
  // averaging into a flat cyan wash at gameplay camera distances.
  const anchor = worldPosition.xz.mul(u.scale.div(float(SITE_GRID)));
  const uvA = anchor.add(flow).add(waveWarp);
  const rotated = vec2(
    anchor.x.mul(0.752).sub(anchor.y.mul(0.659)),
    anchor.x.mul(0.659).add(anchor.y.mul(0.752)),
  );
  const uvB = rotated.mul(1.31)
    .sub(flow.mul(0.82))
    .sub(waveWarp.yx.mul(0.73));
  const cellA = u.map.sample(uvA).level(0).r;
  const cellB = u.map.sample(uvB).level(0).r;
  const web = min(cellA, cellB).oneMinus();
  const fieldUv = worldPosition.xz.sub(u.surfaceRegion.xy).div(u.surfaceRegion.zw.mul(2.0)).add(0.5);
  const edge = smoothstep(vec2(0.0), vec2(0.08), fieldUv)
    .mul(smoothstep(vec2(0.92), vec2(1.0), fieldUv).oneMinus());
  const solvedLight = u.surfaceMap.sample(clamp(fieldUv, vec2(0.0), vec2(1.0))).level(0).r.mul(edge.x).mul(edge.y);
  const strands = mix(smoothstep(0.2, 0.9, web).pow(1.7), solvedLight, u.useSurfaceMap);
  const pulse = sin(phase.mul(0.9).add(worldPosition.x.mul(0.11)))
    .mul(0.5).add(0.5);
  return u.color
    .mul(u.intensity)
    .mul(strands)
    .mul(mix(mix(0.76, 1.0, pulse), 1.0, u.useSurfaceMap))
    .mul(submerged)
    .mul(depthFade)
    .mul(receivingFace)
    .mul(inside)
    .mul(clamp(u.enabled, 0.0, 1.0));
}
