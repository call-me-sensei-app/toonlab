// Shared water-scene stage foundations: the environment lighting presets, the
// toon stage materials/textures, and the procedural seabed terrain functions
// that the water scenes, vegetation, and the swim controller all sample.
import * as THREE from 'three';

import mountainTextureUrl from '../../shared/textures/mountain-texture.jpg';
import rockTextureUrl from '../../shared/textures/rock-texture.jpg';
import sandTextureUrl from '../../shared/textures/sand-texture.jpg';
import treeTrunkTextureUrl from '../../shared/textures/tree-trunk-texture.jpg';
import landTextureUrl from '../../shared/textures/land-texture.jpg';
import grassyLandTextureUrl from '../../shared/textures/grassy-land-texture.jpg';
import { SEA_BED_CENTER_Z, URL_PARAMS } from '../params.js';

// --- Environment lighting presets --------------------------------------------
// Co-tunes the procedural sky, scene lights, fog, and the water's sun/sky
// uniforms, in the spirit of commercial water demos (Noon / Sunset / Moonlit /
// Overcast / Storm).

const WATER_ENVIRONMENT_PRESETS = Object.freeze({
  noon: {
    label: 'Noon',
    sky: {
      zenithColor: [0.18, 0.5, 0.94],
      horizonColor: [0.74, 0.9, 1.0],
      groundColor: [0.5, 0.55, 0.6],
      sunDirection: [0.35, 0.72, 0.42],
      sunColor: [1.0, 0.96, 0.84],
      cloudCoverage: 0.46,
      cloudScale: 1.5,
      cloudSpeed: 1.0,
      cloudColor: [1.0, 1.0, 1.0],
      cloudShadeColor: [0.64, 0.76, 0.94],
      starsStrength: 0,
    },
    wind: { speed: 1.0, strength: 0.16 },
    cloudShadow: { strength: 0.3 },
    fog: { color: '#a9d7ea', near: 26, far: 90 },
    lights: {
      sun: { intensity: 1.5, color: 0xfff2dd },
      ambient: { intensity: 0.45, color: 0xe8f5ff },
      hemisphere: { intensity: 0.5, sky: 0xeaf6ff, ground: 0xd4b678 },
    },
    water: {
      sunDirection: [0.35, 0.72, 0.42],
      sunColor: [1.0, 0.96, 0.84],
      skyZenithColor: [0.4, 0.68, 0.98],
      skyHorizonColor: [0.8, 0.92, 1.0],
      fresnelColor: [0.75, 0.94, 1.05],
    },
  },
  sunset: {
    label: 'Sunset',
    sky: {
      zenithColor: [0.22, 0.26, 0.54],
      horizonColor: [1.0, 0.6, 0.4],
      groundColor: [0.42, 0.32, 0.34],
      sunDirection: [-0.72, 0.16, 0.36],
      sunColor: [1.0, 0.6, 0.34],
      sunSize: 0.045,
      cloudCoverage: 0.52,
      cloudScale: 1.6,
      cloudSpeed: 0.8,
      cloudColor: [1.0, 0.82, 0.7],
      cloudShadeColor: [0.56, 0.4, 0.52],
      starsStrength: 0.12,
    },
    wind: { speed: 0.8, strength: 0.13 },
    cloudShadow: { strength: 0.22 },
    fog: { color: '#e3a887', near: 20, far: 75 },
    lights: {
      sun: { intensity: 1.1, color: 0xffb37a },
      ambient: { intensity: 0.36, color: 0xffd9c0 },
      hemisphere: { intensity: 0.4, sky: 0xffcfae, ground: 0x8a6a58 },
    },
    water: {
      sunDirection: [-0.72, 0.16, 0.36],
      sunColor: [1.0, 0.64, 0.38],
      skyZenithColor: [0.28, 0.32, 0.58],
      skyHorizonColor: [1.0, 0.64, 0.44],
      fresnelColor: [1.05, 0.78, 0.62],
      specularStretch: 0.6,
      sparkleStrength: 0.7,
    },
  },
  moonlit: {
    label: 'Moonlit',
    sky: {
      zenithColor: [0.02, 0.05, 0.14],
      horizonColor: [0.1, 0.18, 0.33],
      groundColor: [0.05, 0.07, 0.1],
      sunDirection: [0.3, 0.6, -0.4],
      sunColor: [0.8, 0.88, 1.0],
      sunSize: 0.02,
      sunGlowStrength: 0.5,
      cloudCoverage: 0.26,
      cloudScale: 1.7,
      cloudSpeed: 0.7,
      cloudColor: [0.3, 0.38, 0.55],
      cloudShadeColor: [0.1, 0.14, 0.26],
      starsStrength: 1.0,
    },
    wind: { speed: 0.7, strength: 0.11 },
    cloudShadow: { strength: 0.14 },
    fog: { color: '#101d30', near: 18, far: 70 },
    lights: {
      sun: { intensity: 0.6, color: 0xa8c4ff },
      ambient: { intensity: 0.22, color: 0x33507a },
      hemisphere: { intensity: 0.24, sky: 0x2b4a74, ground: 0x0d1624 },
    },
    water: {
      sunDirection: [0.3, 0.6, -0.4],
      sunColor: [0.72, 0.84, 1.0],
      skyZenithColor: [0.04, 0.08, 0.18],
      skyHorizonColor: [0.14, 0.24, 0.42],
      fresnelColor: [0.5, 0.68, 0.95],
      shallowColor: [0.12, 0.4, 0.52],
      midColor: [0.05, 0.24, 0.44],
      deepColor: [0.015, 0.1, 0.26],
      causticsStrength: 0.32,
      sparkleStrength: 0.85,
      specularStrength: 1.0,
      specularStretch: 0.55,
    },
  },
  overcast: {
    label: 'Overcast',
    sky: {
      zenithColor: [0.52, 0.6, 0.68],
      horizonColor: [0.76, 0.8, 0.84],
      groundColor: [0.45, 0.48, 0.5],
      sunDirection: [0.3, 0.8, 0.3],
      sunColor: [0.92, 0.94, 0.96],
      sunGlowStrength: 0.2,
      cloudCoverage: 0.9,
      cloudScale: 1.9,
      cloudSpeed: 1.5,
      cloudColor: [0.8, 0.84, 0.88],
      cloudShadeColor: [0.58, 0.64, 0.7],
      starsStrength: 0,
    },
    rain: 0.28,
    wind: { speed: 1.6, strength: 0.22 },
    cloudShadow: { strength: 0.3 },
    fog: { color: '#b3bfc8', near: 14, far: 58 },
    lights: {
      sun: { intensity: 0.75, color: 0xdfe6ec },
      ambient: { intensity: 0.5, color: 0xcdd8de },
      hemisphere: { intensity: 0.42, sky: 0xd6dee4, ground: 0x9aa5a3 },
    },
    water: {
      sunDirection: [0.3, 0.8, 0.3],
      sunColor: [0.9, 0.93, 0.96],
      skyZenithColor: [0.56, 0.63, 0.7],
      skyHorizonColor: [0.76, 0.8, 0.84],
      fresnelColor: [0.72, 0.78, 0.85],
      shallowColor: [0.32, 0.62, 0.66],
      midColor: [0.16, 0.42, 0.52],
      deepColor: [0.06, 0.24, 0.34],
      sparkleStrength: 0.08,
      specularStrength: 0.3,
      causticsStrength: 0.25,
      reflectionStrength: 0.4,
    },
  },
  storm: {
    label: 'Storm',
    sky: {
      zenithColor: [0.16, 0.21, 0.28],
      horizonColor: [0.4, 0.46, 0.52],
      groundColor: [0.2, 0.23, 0.26],
      sunDirection: [0.25, 0.75, 0.3],
      sunColor: [0.75, 0.8, 0.86],
      sunGlowStrength: 0.12,
      cloudCoverage: 0.97,
      cloudScale: 2.1,
      cloudSpeed: 3.4,
      cloudColor: [0.46, 0.52, 0.6],
      cloudShadeColor: [0.24, 0.28, 0.35],
      starsStrength: 0,
    },
    rain: 1.0,
    wind: { speed: 2.6, strength: 0.3 },
    cloudShadow: { strength: 0.34 },
    fog: { color: '#5d6b77', near: 11, far: 50 },
    lights: {
      sun: { intensity: 0.55, color: 0xaebdc9 },
      ambient: { intensity: 0.34, color: 0x8d9aa6 },
      hemisphere: { intensity: 0.3, sky: 0x93a2ae, ground: 0x525b62 },
    },
    water: {
      sunDirection: [0.25, 0.75, 0.3],
      sunColor: [0.78, 0.83, 0.89],
      skyZenithColor: [0.2, 0.26, 0.33],
      skyHorizonColor: [0.42, 0.48, 0.54],
      fresnelColor: [0.6, 0.68, 0.76],
      sparkleStrength: 0.12,
      specularStrength: 0.35,
      causticsStrength: 0.15,
    },
  },
});

// One cloud-shadow parameter set shared by grass, tree canopies, and the
// environment-shader terrain, derived from the preset's sky so the shadow
// field reads as the same weather as the visible clouds. Velocity is uv-space
// drift per second; with scale 0.012 the shadows cross the bay at a few
// meters per second, matching the sky's cloud drift feel.
function cloudShadowSettingsFor(environment) {
  const sky = environment.sky ?? {};
  const drift = 0.012 * (1.2 + (sky.cloudSpeed ?? 1) * 0.9);
  return {
    strength: environment.cloudShadow?.strength ?? 0,
    coverage: sky.cloudCoverage ?? 0.45,
    scale: 0.012,
    velocity: [0.9578 * drift, 0.2873 * drift], // normalized wind [1, 0.3]
  };
}

const WATER_ENVIRONMENT_PRESET_NAMES = Object.keys(WATER_ENVIRONMENT_PRESETS);
const INITIAL_WATER_ENVIRONMENT = WATER_ENVIRONMENT_PRESETS[URL_PARAMS.get('waterEnv')]
  ? URL_PARAMS.get('waterEnv')
  : 'noon';

// --- Stylized sea stage -------------------------------------------------------
// A beach opening onto a sea that runs past the fog line, so the water reads
// as a real body of water instead of a pond: curved shoreline with foam at the
// waterline, wading shallows with fish and rocks, mid-distance islands for
// reflections, and far mountain silhouettes fading into the horizon haze.

function createToonGradientMap(steps = [110, 180, 235, 255]) {
  const data = new Uint8Array(steps.length * 4);
  steps.forEach((value, index) => {
    data[index * 4] = value;
    data[index * 4 + 1] = value;
    data[index * 4 + 2] = value;
    data[index * 4 + 3] = 255;
  });
  const texture = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.needsUpdate = true;
  return texture;
}

const TOON_GRADIENT_MAP = createToonGradientMap();

const stageTextureLoader = new THREE.TextureLoader();
function loadStageTexture(url, repeatX = 1, repeatY = repeatX) {
  const texture = stageTextureLoader.load(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  return texture;
}

const SAND_TEXTURE = loadStageTexture(sandTextureUrl, 220, 220);
const ROCK_TEXTURE = loadStageTexture(rockTextureUrl, 1.5, 1.5);
const MOUNTAIN_TEXTURE = loadStageTexture(mountainTextureUrl, 10, 1);
const SAND_TEXTURE_ISLAND = loadStageTexture(sandTextureUrl, 3, 3);
const TREE_TRUNK_TEXTURE = loadStageTexture(treeTrunkTextureUrl, 1, 1.6);
const LAND_TEXTURE = loadStageTexture(landTextureUrl, 190, 190);
// Large tiles (340m / 64 ≈ 5.3m) so the dirt patches painted into the
// texture don't repeat as a visible checker under the grass blades.
const GRASSY_LAND_TEXTURE = loadStageTexture(grassyLandTextureUrl, 64, 64);

function toonMaterial(color, extra = {}) {
  return new THREE.MeshToonMaterial({
    color,
    gradientMap: TOON_GRADIENT_MAP,
    ...extra,
  });
}

// Shoreline z for a given x: a gently curved bay that arcs away at the sides.
function seaShoreZ(x) {
  return -2.6 + Math.sin(x * 0.12) * 0.4 + x * x * 0.004;
}

// Mid-distance islands are part of the terrain function, so the seabed mesh,
// the physics trimesh, swim enter/exit checks, and climbing all agree.
const SEA_ISLANDS = [
  { x: -15, z: 26, scale: 1.15 },
  { x: 16, z: 32, scale: 1.45 },
  { x: -7, z: 44, scale: 2.0 },
];

function seaBedHeight(x, z) {
  const shoreDistance = z - seaShoreZ(x);
  // Dry dunes behind the waterline, sloping seabed in front.
  let y = THREE.MathUtils.clamp(0.55 - shoreDistance * 0.16, -3.4, 0.9);
  // Outer bay drops toward open-ocean depth so storm swells (up to 10 m
  // crest-to-trough) have the water column to exist before shoaling trims
  // them: a wave survives only where its crest stays under 0.72x depth.
  y -= 12.0 * THREE.MathUtils.smoothstep(shoreDistance, 30, 90);
  // Flat wading shelf around the character spawn.
  const shelf = (1 - THREE.MathUtils.smoothstep(Math.abs(x), 2.2, 4.2)) *
    (1 - THREE.MathUtils.smoothstep(Math.abs(z - 1.2), 2.4, 4.4));
  y = THREE.MathUtils.lerp(y, -0.12, Math.min(1, shelf * 1.25));
  // Island mounds rising from the seabed through the waterline.
  for (const island of SEA_ISLANDS) {
    const distance = Math.hypot(x - island.x, z - island.z);
    const radius = 6.5 * island.scale;
    const peak = 0.8 + 0.18 * island.scale;
    const mound = peak - (peak + 4.2) * THREE.MathUtils.smoothstep(distance, radius * 0.05, radius);
    y = Math.max(y, mound);
  }
  // Gentle dune noise.
  y += Math.sin(x * 0.7 + z * 0.5) * 0.05 + Math.sin(x * 1.1 - z * 0.8) * 0.02;
  return y;
}

const BED_COLOR_STOPS = [
  { height: -15.5, color: new THREE.Color('#5f7264') },
  { height: -3.4, color: new THREE.Color('#9aa887') },
  { height: -1.4, color: new THREE.Color('#c3b98a') },
  { height: -0.5, color: new THREE.Color('#d8c892') },
  { height: 0.12, color: new THREE.Color('#e6d296') },
  { height: 0.26, color: new THREE.Color('#c9a86c') },
  { height: 0.46, color: new THREE.Color('#ead79d') },
  { height: 0.62, color: new THREE.Color('#8dbb5c') },
  { height: 0.95, color: new THREE.Color('#59a34c') },
];

function seaBedColor(height, out) {
  for (let i = 0; i < BED_COLOR_STOPS.length - 1; i += 1) {
    const current = BED_COLOR_STOPS[i];
    const next = BED_COLOR_STOPS[i + 1];
    if (height <= next.height) {
      const t = THREE.MathUtils.clamp(
        (height - current.height) / Math.max(next.height - current.height, 1e-4), 0, 1);
      return out.copy(current.color).lerp(next.color, t);
    }
  }
  return out.copy(BED_COLOR_STOPS[BED_COLOR_STOPS.length - 1].color);
}

function createSeaBedGeometry() {
  const geometry = new THREE.PlaneGeometry(340, 340, 300, 300);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i) + SEA_BED_CENTER_Z;
    const y = seaBedHeight(x, z);
    positions.setY(i, y);
    seaBedColor(y, color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

// Ground Shader consumes a compact RGBA splat field instead of stacked
// translucent terrain meshes. Channels are Grass, Dirt, Rock, Sand. The
// 320² field is close to the terrain grid's metre-scale sampling density and
// keeps one authoritative blend for the visible ground and meadow adoption.
function createSeaBedGroundField(size = 320) {
  const splat = new Uint8Array(size * size * 4);
  for (let row = 0; row < size; row += 1) {
    const v = row / Math.max(size - 1, 1);
    // PlaneGeometry.rotateX(-PI/2) maps increasing UV.y toward -Z.
    const localZ = (0.5 - v) * 340;
    const z = localZ + SEA_BED_CENTER_Z;
    for (let column = 0; column < size; column += 1) {
      const u = column / Math.max(size - 1, 1);
      const x = (u - 0.5) * 340;
      const y = seaBedHeight(x, z) + splatEdgeWiggle(x, z);
      const grass = THREE.MathUtils.smoothstep(y, 0.48, 0.74);
      const dirt = THREE.MathUtils.smoothstep(y, 0.26, 0.46)
        * (1 - THREE.MathUtils.smoothstep(y, 0.54, 0.74));
      const sand = 1 - THREE.MathUtils.smoothstep(y, 0.2, 0.58);
      const total = Math.max(grass + dirt + sand, 0.0001);
      const index = (row * size + column) * 4;
      splat[index] = Math.round((grass / total) * 255);
      splat[index + 1] = Math.round((dirt / total) * 255);
      splat[index + 2] = 0;
      splat[index + 3] = Math.round((sand / total) * 255);
    }
  }
  return { splat, splatD: size, splatW: size };
}

// Meandering offset added to the splat thresholds so texture boundaries
// wander instead of tracing clean height contours. Wavelengths stay well
// above the ~1.13m vertex spacing so the grid can represent them.
function splatEdgeWiggle(x, z) {
  return Math.sin(x * 0.53 + z * 0.31) * 0.05 +
    Math.sin(x * 0.17 - z * 0.41) * 0.06 +
    Math.sin(x * 1.21 + z * 0.83) * 0.025;
}

// Retained for the Lighting Lab's legacy comparison scene. The walkable
// sample does not mount these overlays; it uses one Ground Shader mesh.
function createSeaBedOverlayGeometry(maskForHeight, lift) {
  const geometry = new THREE.PlaneGeometry(340, 340, 300, 300);
  geometry.rotateX(-Math.PI / 2);
  const positions = geometry.attributes.position;
  const colors = new Float32Array(positions.count * 4);
  for (let i = 0; i < positions.count; i += 1) {
    const x = positions.getX(i);
    const z = positions.getZ(i) + SEA_BED_CENTER_Z;
    const y = seaBedHeight(x, z);
    positions.setY(i, y + lift);
    colors[i * 4] = 1;
    colors[i * 4 + 1] = 1;
    colors[i * 4 + 2] = 1;
    colors[i * 4 + 3] = maskForHeight(y + splatEdgeWiggle(x, z));
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.computeVertexNormals();
  return geometry;
}

export {
  WATER_ENVIRONMENT_PRESETS,
  cloudShadowSettingsFor,
  WATER_ENVIRONMENT_PRESET_NAMES,
  INITIAL_WATER_ENVIRONMENT,
  TOON_GRADIENT_MAP,
  loadStageTexture,
  SAND_TEXTURE,
  ROCK_TEXTURE,
  MOUNTAIN_TEXTURE,
  SAND_TEXTURE_ISLAND,
  TREE_TRUNK_TEXTURE,
  LAND_TEXTURE,
  GRASSY_LAND_TEXTURE,
  toonMaterial,
  seaShoreZ,
  SEA_ISLANDS,
  seaBedHeight,
  seaBedColor,
  createSeaBedGeometry,
  createSeaBedGroundField,
  splatEdgeWiggle,
  createSeaBedOverlayGeometry,
};
