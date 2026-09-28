// The playground water scene (labs/playground SCENE_MODE 'water' — the scene
// the Water Lab's walk preview opens), ported verbatim for the Lighting Lab:
// the same seabed geometry/height function, splat overlays, sea rocks, beach
// and island broadleaf trees, showcase tree row, eroded-mesa rockgen outcrop,
// Photoscan props (with the same fallback cluster), fish school, kelp, dense
// grass/flower carpet, layered horizon silhouettes, stylized sky, and the
// same src/water WaterSurface construction. Every constant, preset name,
// color, and geometry function comes from the playground modules themselves
// (labs/playground/scenes/stage.js + waterScenes.jsx + vegetation.jsx) —
// only the React/R3F wrapper is adapted away.
//
// The ONLY replaced piece is light-driving: the playground's ambient/
// hemisphere/directional lights are gone — the lighting SYSTEM's sun/ambient
// light this stage (main.js attaches with { fog, driveSunPosition: true }),
// so the style's day cycle actually moves the light. Everything else is the
// playground look.
//
// Browser-only module (bundler texture imports): scenes.js loads it with a
// dynamic import inside build(), so the Node-side verify scripts can keep
// importing scenes.js.

import * as THREE from 'three';

import { loadModelAsset } from '../../src/character/modelLoader.js';
import { applyEnvironmentShader } from '../../src/environment/environmentMaterialAdapter.js';
import {
  advanceEnvironmentShaderTime,
  setEnvironmentCloudShadow,
} from '../../src/environment/environmentMaterialAdapter.js';
import { createEnvironmentSunShadowPass } from '../../src/environment/environmentSunShadowPass.js';
import { createRockDocument, meshDocument } from '../../src/rockgen/index.js';
import { syncFoliageFog } from '../../src/shaders-tsl/chunks/foliage-fog.js';
import { StylizedSky } from '../../src/sky/stylizedSky.js';
import {
  setObjectTextureColorSpaces,
  waitForObjectTextures,
} from '../../src/toon/toonMaterialAdapter.js';
import { StylizedFlowerField } from '../../src/vegetation/stylizedFlowers.js';
import { StylizedGrassField } from '../../src/vegetation/stylizedGrass.js';
import { createAmbientFx } from '../../src/ambientfx/index.js';
import { createWaterSettings } from '../../src/water/waterSettings.js';
import { WaterSurface } from '../../src/water/waterSurface.js';
import { WaterKelpField } from '../../src/water/waterVegetation.js';

import {
  GRASSY_LAND_TEXTURE,
  LAND_TEXTURE,
  MOUNTAIN_TEXTURE,
  ROCK_TEXTURE,
  SAND_TEXTURE,
  TOON_GRADIENT_MAP,
  WATER_ENVIRONMENT_PRESETS,
  cloudShadowSettingsFor,
  createSeaBedGeometry,
  createSeaBedOverlayGeometry,
  seaBedHeight,
  toonMaterial,
} from '../playground/scenes/stage.js';
import {
  applyBroadleafEnvironment,
  createBroadleafTreeInstance,
} from '../playground/scenes/toonlabBroadleaf.js';
import {
  SEA_BED_CENTER_Z,
  WATER_SURFACE_CENTER_Z,
  WATER_SURFACE_SIZE_X,
  WATER_SURFACE_SIZE_Z,
} from '../playground/params.js';

export { seaBedHeight, WATER_ENVIRONMENT_PRESETS };

// Fab-licensed props live in the gitignored assets-local/ tree (runtime
// URLs, never bundler imports) — a clone without them falls back below.
const nordicBeachRocksUrl = '/assets-local/environments/assets/nordic_beach_rocks_ulznddxva_mid.glb';
const woodenTableUrl = '/assets-local/environments/assets/wooden_table_ulzrcgoaw_mid.glb';

// Same sun-shadow footprint the playground's water scene directional uses.
export const WATER_SUN_SHADOW = Object.freeze({
  bias: -0.00035,
  bottom: -120,
  far: 360,
  left: -120,
  mapSize: 4096,
  near: 0.1,
  normalBias: 0.02,
  right: 120,
  top: 120,
});

const ENV_SHADER_OPTIONS = Object.freeze({
  hasSun: true,
  // Same rationale as the playground: no alpha-card foliage in the stage, so
  // texture-name classification must not cutout trunks or splat overlays.
  features: { alphaCutout: false, foliageCutout: false },
  parameters: {
    ambientStrength: 0.42,
    shadowTintColor: [0.74, 0.78, 0.88],
  },
});

function environmentFor(name) {
  return WATER_ENVIRONMENT_PRESETS[name] ?? WATER_ENVIRONMENT_PRESETS.noon;
}

// ---------------------------------------------------------------------------
// Horizon silhouettes (verbatim: waterScenes.jsx buildHorizonRidgeGeometry).

function buildHorizonRidgeGeometry({ radius = 200, amplitude = 18, seed = 1, segments = 240 }) {
  const vertices = [];
  const uvs = [];
  const indices = [];
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const base = 0.16 +
      0.34 * Math.sin(angle * 3 + seed) +
      0.24 * Math.sin(angle * 7 + seed * 2.1) +
      0.18 * Math.sin(angle * 12 + seed * 4.7) +
      0.09 * Math.sin(angle * 23 + seed * 9.3);
    const height = Math.max(0.03, base) * amplitude;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    vertices.push(x, height, z, x, -5, z);
    uvs.push(i / segments, 1, i / segments, 0);
    if (i < segments) {
      const a = i * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

const HORIZON_LAYERS = [
  { radius: 150, amplitude: 26, seed: 3.7, haze: 0.42 },
  { radius: 200, amplitude: 34, seed: 1.2, haze: 0.62 },
  { radius: 255, amplitude: 44, seed: 8.4, haze: 0.78 },
];

function addHorizonSilhouettes(root, environment) {
  const group = new THREE.Group();
  group.name = 'Horizon silhouettes';
  group.position.set(0, 0, 40);
  const ridgeTone = new THREE.Color('#48708c');
  const hazeTone = new THREE.Color(environment.fog.color);
  HORIZON_LAYERS.forEach((layer, index) => {
    const surface = new THREE.Mesh(
      buildHorizonRidgeGeometry(layer),
      new THREE.MeshBasicMaterial({
        map: MOUNTAIN_TEXTURE,
        side: THREE.DoubleSide,
        fog: false,
        toneMapped: false,
      }),
    );
    surface.material.color.copy(ridgeTone).lerp(hazeTone, layer.haze);
    surface.renderOrder = -40 + index;
    group.add(surface);
  });
  root.add(group);
}

// ---------------------------------------------------------------------------
// Sea rocks (verbatim SEA_ROCKS) + walker blockers for the emergent ones.

const SEA_ROCKS = [
  { position: [2.9, 0.14, 4.6], scale: [0.85, 0.72, 0.7], color: 0x8fa3ad, collider: 0.7 },
  { position: [-3.6, 0.02, 3.6], scale: [0.62, 0.58, 0.54], color: 0x97a8b0, collider: 0.5 },
  { position: [5.8, -0.08, 7.4], scale: [1.15, 0.9, 0.95], color: 0x8a9ca6, collider: 0.9 },
  { position: [1.3, -0.3, 5.8], scale: [0.66, 0.46, 0.56], color: 0x86979f },
  { position: [-1.6, -0.5, 7.0], scale: [0.9, 0.6, 0.76], color: 0x7d8e96 },
  { position: [-5.2, -0.35, 5.6], scale: [0.72, 0.48, 0.58], color: 0x87989f },
];

const RIM_ROCK_A_POSITION = [8.6, seaBedHeight(8.6, -2.6) + 0.16, -2.6];
const RIM_ROCK_B_POSITION = [-9.8, seaBedHeight(-9.8, -3.8) + 0.2, -3.8];

function buildSeaRocks(blockers) {
  const group = new THREE.Group();
  group.name = 'Sea rocks';
  SEA_ROCKS.forEach((rock, index) => {
    const surface = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1, 1),
      toonMaterial(rock.color, { map: ROCK_TEXTURE }),
    );
    surface.position.fromArray(rock.position);
    surface.scale.fromArray(rock.scale);
    surface.rotation.set(0.2 + index * 0.7, index * 1.3, 0.1 + index * 0.4);
    surface.castShadow = true;
    surface.receiveShadow = true;
    group.add(surface);
    if (rock.collider) {
      blockers.push({ radius: rock.collider, x: rock.position[0], z: rock.position[2] });
    }
  });
  return group;
}

// ---------------------------------------------------------------------------
// Fish school (verbatim FISH_VARIANTS/FISH_PATHS).

const FISH_VARIANTS = [
  { body: 0xff8c42, tail: 0xffb37a },
  { body: 0xf4f0e4, tail: 0xff9d5c },
  { body: 0x5c7f9e, tail: 0x7ba3c4 },
];

const FISH_PATHS = Array.from({ length: 7 }, (_, index) => ({
  centerX: [2.2, -1.8, 0.6, -3.0, 3.6, -0.4, 1.2][index],
  centerZ: [4.6, 5.0, 6.2, 5.4, 5.6, 7.2, 3.8][index],
  radiusX: 1.1 + (index % 3) * 0.6,
  radiusZ: 0.8 + ((index + 1) % 3) * 0.55,
  depth: -0.26 - (index % 3) * 0.14,
  speed: 0.45 + (index % 3) * 0.18,
  phase: index * 1.7,
  direction: index % 2 === 0 ? 1 : -1,
  scale: 0.8 + (index % 3) * 0.24,
  variant: FISH_VARIANTS[index % FISH_VARIANTS.length],
}));

function buildFishSchool() {
  const group = new THREE.Group();
  group.name = 'Fish school';
  const fish = FISH_PATHS.map((path) => {
    const holder = new THREE.Group();
    holder.scale.setScalar(path.scale);
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), toonMaterial(path.variant.body));
    body.castShadow = true;
    body.receiveShadow = true;
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 6), toonMaterial(path.variant.tail));
    tail.position.set(0, 0, -0.13);
    tail.rotation.set(Math.PI / 2, 0, 0);
    const fin = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 5), toonMaterial(path.variant.tail));
    fin.position.set(0, 0.055, 0.02);
    fin.rotation.set(Math.PI * 0.42, 0, 0);
    holder.add(body, tail, fin);
    group.add(holder);
    return holder;
  });
  return {
    group,
    update(time) {
      FISH_PATHS.forEach((path, index) => {
        const holder = fish[index];
        const angle = (time * path.speed + path.phase) * path.direction;
        const x = path.centerX + Math.cos(angle) * path.radiusX;
        const z = path.centerZ + Math.sin(angle) * path.radiusZ;
        const y = path.depth + Math.sin(time * 1.3 + path.phase) * 0.05;
        holder.position.set(x, y, z);
        const tangentX = -Math.sin(angle) * path.radiusX * path.direction;
        const tangentZ = Math.cos(angle) * path.radiusZ * path.direction;
        holder.rotation.y = Math.atan2(tangentX, tangentZ) + Math.sin(time * 7 + path.phase) * 0.14;
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Broadleaf trees (verbatim tree configs from SeaStage / DistantIsland /
// ShowcaseTreeRow, via the same createBroadleafTreeInstance helper).

function placeBroadleafTree(trees, blockers, options, [x, y, z], rotation = 0) {
  const instance = createBroadleafTreeInstance(options);
  const { tree } = instance;
  tree.position.set(x, y, z);
  tree.rotation.y = rotation;
  const size = tree.settings?.tree?.size ?? instance.recipe.options?.size ?? 1;
  blockers.push({ radius: 0.28 * size, x, z });
  trees.push(tree);
  return tree;
}

const BEACH_TREES = [
  [{
    presetId: 'example_branching', canopyColor: '#5fae57', barkTextureId: 'beech', leafShape: 'teardrop',
    animationPreset: 'falling', animationIntensity: 0.32, seedOffset: 3,
    windSpeedScale: 0.9, windStrengthScale: 0.95, woodDetails: { knots: 0.22, scars: 0.12 },
  }, [6.8, seaBedHeight(6.8, -4.4) - 0.1, -4.4], 0],
  [{
    presetId: 'species_ash', canopyColor: '#7cc45f', barkTextureId: 'ash', leafShape: 'round',
    animationPreset: 'drifting', animationIntensity: 0.26, seedOffset: 11,
    windSpeedScale: 1.12, windStrengthScale: 1.05, woodDetails: { knots: 0.18, scars: 0.2 },
  }, [-7.4, seaBedHeight(-7.4, -5.4) - 0.1, -5.4], 1.4],
  [{
    presetId: 'species_oak_large', canopyColor: '#c86b32', barkTextureId: 'oak', leafShape: 'maple',
    animationPreset: 'falling', animationIntensity: 0.38, seedOffset: 17,
    windSpeedScale: 0.76, windStrengthScale: 1.22, woodDetails: { knots: 0.45, scars: 0.25 },
  }, [10.6, seaBedHeight(10.6, -7.8) - 0.1, -7.8], 2.6],
  [{
    presetId: 'species_aspen', canopyColor: '#f0c437', barkTextureId: 'birch', leafShape: 'gingko',
    animationPreset: 'fluttering', animationIntensity: 0.42, seedOffset: 23,
    windSpeedScale: 1.32, windStrengthScale: 0.72,
  }, [-12.2, seaBedHeight(-12.2, -9.0) - 0.1, -9.0], 4.1],
];

const SHOWCASE_ROW_Z = -16;
const SHOWCASE_TREES = [
  {
    presetId: 'example_branching', animationIntensity: 0.24, animationPreset: 'falling', barkTextureId: 'beech',
    canopyColor: '#5fae57', leafShape: 'teardrop', seedOffset: 0, sizeScale: 0.98, rotation: 0.35,
    windSpeedScale: 0.9, windStrengthScale: 0.95, woodDetails: { knots: 0.16, scars: 0.08 },
  },
  {
    presetId: 'species_oak_small', animationIntensity: 0.18, animationPreset: 'drifting', barkTextureId: 'oak',
    canopyColor: '#4d8f47', leafShape: 'round', seedOffset: 8, sizeScale: 1.05, rotation: 5.65,
    windSpeedScale: 1.1, windStrengthScale: 0.86, woodDetails: { knots: 0.4, scars: 0.16 },
  },
  {
    presetId: 'species_ash', animationIntensity: 0.28, animationPreset: 'falling', barkTextureId: 'ash',
    canopyColor: '#7ac05e', leafShape: 'maple', seedOffset: 14, sizeScale: 0.96, rotation: 1.2,
    windSpeedScale: 0.78, windStrengthScale: 1.15, woodDetails: { knots: 0.18, scars: 0.22 },
  },
  {
    presetId: 'species_aspen', animationIntensity: 0.36, animationPreset: 'fluttering', barkTextureId: 'birch',
    canopyColor: '#e5c947', leafShape: 'gingko', seedOffset: 22, sizeScale: 0.95, rotation: 2.45,
    windSpeedScale: 1.28, windStrengthScale: 0.72,
  },
  {
    presetId: 'species_oak_large', animationIntensity: 0.22, animationPreset: 'drifting', barkTextureId: 'oak',
    canopyColor: '#c87332', leafShape: 'maple', seedOffset: 31, sizeScale: 0.86, rotation: 3.6,
    windSpeedScale: 0.84, windStrengthScale: 1.22, woodDetails: { knots: 0.5, scars: 0.28 },
  },
];

function addShowcaseTreeRow(root, trees, blockers) {
  const spacing = 6.2;
  const center = (SHOWCASE_TREES.length - 1) * spacing * 0.5;
  SHOWCASE_TREES.forEach((config, index) => {
    const { rotation, ...options } = config;
    const x = index * spacing - center;
    const tree = placeBroadleafTree(
      trees, blockers, options,
      [x, seaBedHeight(x, SHOWCASE_ROW_Z) - 0.05, SHOWCASE_ROW_Z], rotation,
    );
    root.add(tree);
  });
}

function addDistantIsland(root, trees, blockers, { x, z, scale = 1, mirror = false }) {
  const flip = mirror ? -1 : 1;
  const place = (offsetX, offsetZ) => {
    const worldX = x + offsetX * flip * scale;
    const worldZ = z + offsetZ * scale;
    return [worldX, seaBedHeight(worldX, worldZ) - 0.12, worldZ];
  };
  const rock = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1, 1),
    toonMaterial(0xa8b6bd, { map: ROCK_TEXTURE }),
  );
  rock.position.fromArray(place(1.7, -0.6));
  rock.scale.set(1.15 * scale, 0.8 * scale, 0.95 * scale);
  rock.castShadow = true;
  rock.receiveShadow = true;
  root.add(rock);
  root.add(placeBroadleafTree(trees, blockers, {
    presetId: 'species_oak_small', canopyColor: '#6aa85c', barkTextureId: 'oak', leafShape: 'round',
    animationPreset: 'falling', animationIntensity: 0.18, seedOffset: Math.round(scale * 10),
    sizeScale: scale, windSpeedScale: 0.85, windStrengthScale: 0.9,
    woodDetails: { knots: 0.35, scars: 0.18 },
  }, place(-0.9, 0.2)));
  root.add(placeBroadleafTree(trees, blockers, {
    presetId: 'species_aspen', canopyColor: '#9fc65b', barkTextureId: 'birch', leafShape: 'gingko',
    animationPreset: 'drifting', animationIntensity: 0.16, seedOffset: Math.round(scale * 13),
    sizeScale: scale, windSpeedScale: 1.15, windStrengthScale: 0.8,
  }, place(0.6, 0.75), 2.1));
}

// ---------------------------------------------------------------------------
// Eroded mesa (verbatim rockgen showcase piece).

function scaleVector3(scale) {
  if (Array.isArray(scale)) return [scale[0] ?? 1, scale[1] ?? 1, scale[2] ?? 1];
  return [scale, scale, scale];
}

function buildErodedMesa() {
  const geometry = meshDocument(createRockDocument({ preset: 'eroded-mesa', seed: 11671 }));
  if (!geometry.boundingBox) geometry.computeBoundingBox();
  const scale = [1.55, 1.18, 1.35];
  const group = new THREE.Group();
  group.name = 'Eroded mesa';
  group.position.set(13.8, seaBedHeight(13.8, -11.2) + 0.02, -11.2);
  group.rotation.y = 0.55;
  const surface = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors: true }));
  surface.name = 'Eroded Mesa';
  surface.position.y = -(geometry.boundingBox?.min.y ?? 0) * scaleVector3(scale)[1];
  surface.scale.fromArray(scale);
  surface.castShadow = true;
  surface.receiveShadow = true;
  group.add(surface);
  return group;
}

// ---------------------------------------------------------------------------
// Photoscan props with the playground's exact placements + fallback cluster.

function buildFallbackRockCluster({ position, rotation = 0, scale = 1 }) {
  const cluster = new THREE.Group();
  cluster.name = 'Fallback rock cluster';
  const rocks = [
    { pos: [0, 0.25, 0], r: 0.85, squash: 0.62, seed: 1 },
    { pos: [0.9, 0.16, 0.35], r: 0.55, squash: 0.58, seed: 2 },
    { pos: [-0.75, 0.12, 0.5], r: 0.45, squash: 0.55, seed: 3 },
    { pos: [0.25, 0.1, -0.7], r: 0.4, squash: 0.6, seed: 4 },
    { pos: [-0.3, 0.08, -0.35], r: 0.3, squash: 0.5, seed: 5 },
  ];
  for (const rock of rocks) {
    const geometry = new THREE.IcosahedronGeometry(rock.r, 1);
    const positions = geometry.attributes.position;
    for (let i = 0; i < positions.count; i += 1) {
      const n = Math.sin(rock.seed * 91.7 + i * 12.9898) * 43758.5453;
      const bump = 1 + ((n - Math.floor(n)) - 0.5) * 0.36;
      positions.setXYZ(
        i,
        positions.getX(i) * bump,
        positions.getY(i) * bump * rock.squash,
        positions.getZ(i) * bump,
      );
    }
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, new THREE.MeshToonMaterial({ color: 0x8b8a94 }));
    surface.position.set(...rock.pos);
    surface.castShadow = true;
    surface.receiveShadow = true;
    cluster.add(surface);
  }
  cluster.position.fromArray(position);
  cluster.rotation.y = rotation;
  cluster.scale.setScalar(scale);
  return cluster;
}

const SCAN_PROPS = [
  {
    url: nordicBeachRocksUrl,
    label: 'nordicRocks',
    position: [-6.2, seaBedHeight(-6.2, 1.4) - 0.05, 1.4],
    rotation: 0.6,
    scale: 1.6,
    blocker: { radius: 2.0, x: -6.2, z: 1.4 },
    fallback: true,
  },
  {
    url: woodenTableUrl,
    label: 'woodenTable',
    position: [3.0, seaBedHeight(3.0, -5.6) - 0.03, -5.6],
    rotation: -0.4,
    scale: 1,
    blocker: { radius: 1.1, x: 3.0, z: -5.6 },
    fallback: false,
  },
];

function loadScanProps(root, renderer, blockers) {
  for (const prop of SCAN_PROPS) {
    blockers.push(prop.blocker);
    (async () => {
      try {
        const asset = await loadModelAsset(prop.url, { renderer });
        await waitForObjectTextures(asset.root);
        setObjectTextureColorSpaces(asset.root);
        await applyEnvironmentShader(asset.root, {
          hasSun: true,
          parameters: {
            ambientStrength: 0.42,
            shadowTintColor: [0.74, 0.78, 0.88],
          },
        });
        asset.root.position.fromArray(prop.position);
        asset.root.rotation.y = prop.rotation;
        asset.root.scale.setScalar(prop.scale);
        root.add(asset.root);
      } catch (error) {
        console.warn(`Scan prop ${prop.label} failed to load:`, error?.message ?? error);
        if (prop.fallback) {
          root.add(buildFallbackRockCluster({
            position: prop.position,
            rotation: prop.rotation,
            scale: prop.scale,
          }));
        }
      }
    })();
  }
}

// ---------------------------------------------------------------------------
// Kelp + grass/flower carpet (verbatim placement loops from waterScenes.jsx
// and vegetation.jsx — session dressing, so Math.random is fine here just as
// it is in the playground).

function buildKelp(settings) {
  const placements = [];
  let attempts = 0;
  while (placements.length < 46 && attempts < 400) {
    attempts += 1;
    const x = (Math.random() * 2 - 1) * 7.5;
    const z = 3.4 + Math.random() * 5.8;
    const y = seaBedHeight(x, z);
    if (y > -0.35 || y < -2.0) continue;
    placements.push({
      x,
      y: y - 0.04,
      z,
      height: Math.min(0.5 + Math.random() * 1.1, 0.36 - y - 0.16),
    });
  }
  const kelp = new WaterKelpField({
    placements,
    kelpColor: [0.2, 0.55, 0.36],
    kelpShadeColor: [0.07, 0.28, 0.22],
  });
  kelp.setFlow(settings.flowDirection, settings.flowSpeed);
  return kelp;
}

function buildGrassCarpet(environment, clearings = []) {
  const clearOf = (x, z) => clearings.every(
    (circle) => (x - circle.x) * (x - circle.x) + (z - circle.z) * (z - circle.z) > circle.radius * circle.radius,
  );
  const placements = [];
  const flowerPlacements = [];
  const clumpSpacing = 0.46;
  const maxBlades = 560000;
  for (let gx = -48; gx <= 48 && placements.length < maxBlades; gx += clumpSpacing) {
    for (let gz = -34; gz <= 58 && placements.length < maxBlades; gz += clumpSpacing) {
      const clumpX = gx + (Math.random() - 0.5) * clumpSpacing;
      const clumpZ = gz + (Math.random() - 0.5) * clumpSpacing;
      const clumpY = seaBedHeight(clumpX, clumpZ);
      const edge = THREE.MathUtils.smoothstep(clumpY, 0.42, 0.56) *
        (1 - THREE.MathUtils.smoothstep(clumpY, 1.02, 1.14));
      if (edge <= 0 || Math.random() > edge) continue;
      const clumpPhase = Math.random();
      const clumpHeight = 0.26 + Math.random() * 0.3;
      const clumpRadius = clumpSpacing * 1.35;
      const blades = 22 + Math.floor(Math.random() * 11);
      for (let blade = 0; blade < blades; blade += 1) {
        const x = clumpX + (Math.random() - 0.5) * clumpRadius;
        const z = clumpZ + (Math.random() - 0.5) * clumpRadius;
        const y = seaBedHeight(x, z);
        if (y < 0.4 || y > 1.2 || !clearOf(x, z)) continue;
        placements.push({
          x,
          y: y - 0.03,
          z,
          height: clumpHeight * (0.78 + Math.random() * 0.44),
          phase: (clumpPhase + Math.random() * 0.12) % 1,
        });
      }
      if (Math.random() < 0.05) {
        const heads = 1 + Math.floor(Math.random() * 3);
        for (let head = 0; head < heads; head += 1) {
          const x = clumpX + (Math.random() - 0.5) * clumpRadius;
          const z = clumpZ + (Math.random() - 0.5) * clumpRadius;
          const y = seaBedHeight(x, z);
          if (y < 0.4 || y > 1.2 || !clearOf(x, z)) continue;
          flowerPlacements.push({
            x,
            y: y - 0.03,
            z,
            headHeight: clumpHeight * (1.0 + Math.random() * 0.25),
          });
        }
      }
    }
  }
  const grass = new StylizedGrassField({ placements });
  grass.userData.waterReflectionExclude = true;
  const flowers = new StylizedFlowerField({ placements: flowerPlacements });
  flowers.userData.waterReflectionExclude = true;

  const wind = environment.wind ?? { speed: 1, strength: 0.16 };
  grass.setWind({
    direction: [1, 0.3],
    speed: wind.speed,
    strength: wind.strength,
    gustSpeed: 1.0 + wind.speed * 0.8,
  });
  grass.setSun({
    direction: environment.water.sunDirection,
    color: environment.water.sunColor,
    sky: environment.sky.horizonColor,
  });
  grass.setCloudShadow(cloudShadowSettingsFor(environment));
  grass.setDistanceFade({
    start: environment.fog.far * 0.8,
    end: environment.fog.far * 1.05,
  });
  flowers.setWind({
    direction: [1, 0.3],
    speed: wind.speed,
    strength: wind.strength,
  });
  return { flowers, grass };
}

// ---------------------------------------------------------------------------
// The composed stage.

/**
 * Builds the ported water playground stage into a fresh group.
 *
 * @param {Object} options
 * @param {THREE.Camera} options.camera Lab camera (sky/water updates).
 * @param {THREE.Renderer} options.renderer Lab renderer (water passes).
 * @param {THREE.Scene} options.scene The REAL lab scene — the water's
 *   reflection/refraction passes and the node-backend sun-shadow pass render
 *   it (the stage root alone would miss the system's sun light).
 * @param {string} [options.envPreset] WATER_ENVIRONMENT_PRESETS name
 *   ('noon' for the outdoor scene, 'moonlit' for the night camp).
 * @param {Object|false} [options.ambientfx] createAmbientFx options
 *   (night camp fireflies), or false.
 */
export async function buildWaterStage({
  camera,
  renderer,
  scene,
  envPreset = 'noon',
  ambientfx = false,
  clearings = [],
}) {
  const environment = environmentFor(envPreset);
  const root = new THREE.Group();
  root.name = `Water playground stage (${envPreset})`;
  const blockers = [];
  const trees = [];

  // Water settings exactly as the playground boots them: the 'lake' preset,
  // re-tinted by the active environment preset (noon applies no overrides).
  const settings = createWaterSettings({
    mode: 'lake',
    ...(envPreset === 'noon' ? {} : (environment.water ?? {})),
  });

  // --- Sky + horizon + fog ---------------------------------------------------
  const sky = new StylizedSky({ radius: 96 });
  sky.applySettings(environment.sky ?? {});
  root.add(sky);
  addHorizonSilhouettes(root, environment);
  const fog = new THREE.Fog(environment.fog.color, environment.fog.near, environment.fog.far);

  // --- Sea stage: bed + splat overlays + fish + trees + rockgen mesa ---------
  const stageGroup = new THREE.Group();
  stageGroup.name = 'Sea stage';

  const bedGeometry = createSeaBedGeometry();
  const bed = new THREE.Mesh(bedGeometry, new THREE.MeshToonMaterial({
    vertexColors: true,
    map: SAND_TEXTURE,
    gradientMap: TOON_GRADIENT_MAP,
  }));
  bed.position.set(0, 0, SEA_BED_CENTER_Z);
  bed.receiveShadow = true;
  stageGroup.add(bed);

  const landOverlayGeometry = createSeaBedOverlayGeometry(
    (y) => THREE.MathUtils.smoothstep(y, 0.26, 0.46) * (1 - THREE.MathUtils.smoothstep(y, 0.54, 0.74)),
    0.008,
  );
  const landOverlay = new THREE.Mesh(landOverlayGeometry, new THREE.MeshToonMaterial({
    map: LAND_TEXTURE,
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    gradientMap: TOON_GRADIENT_MAP,
  }));
  landOverlay.position.set(0, 0, SEA_BED_CENTER_Z);
  landOverlay.receiveShadow = true;
  landOverlay.renderOrder = -2;
  stageGroup.add(landOverlay);

  const grassOverlayGeometry = createSeaBedOverlayGeometry(
    (y) => THREE.MathUtils.smoothstep(y, 0.48, 0.74),
    0.014,
  );
  const grassOverlay = new THREE.Mesh(grassOverlayGeometry, new THREE.MeshToonMaterial({
    map: GRASSY_LAND_TEXTURE,
    color: new THREE.Color('#a4dc66'),
    vertexColors: true,
    transparent: true,
    opacity: 0.98,
    gradientMap: TOON_GRADIENT_MAP,
  }));
  grassOverlay.position.set(0, 0, SEA_BED_CENTER_Z);
  grassOverlay.receiveShadow = true;
  grassOverlay.renderOrder = -1;
  stageGroup.add(grassOverlay);

  const fishSchool = buildFishSchool();
  stageGroup.add(fishSchool.group);

  for (const [options, position, rotation] of BEACH_TREES) {
    stageGroup.add(placeBroadleafTree(trees, blockers, options, position, rotation));
  }
  stageGroup.add(buildErodedMesa());

  const rimRockA = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), toonMaterial(0xa9b8bf, { map: ROCK_TEXTURE }));
  rimRockA.position.fromArray(RIM_ROCK_A_POSITION);
  rimRockA.scale.set(0.9, 0.55, 0.7);
  rimRockA.castShadow = true;
  rimRockA.receiveShadow = true;
  stageGroup.add(rimRockA);
  blockers.push({ radius: 0.85, x: RIM_ROCK_A_POSITION[0], z: RIM_ROCK_A_POSITION[2] });
  const rimRockB = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 1), toonMaterial(0xa5b3ba, { map: ROCK_TEXTURE }));
  rimRockB.position.fromArray(RIM_ROCK_B_POSITION);
  rimRockB.scale.set(1.2, 0.7, 0.9);
  rimRockB.castShadow = true;
  rimRockB.receiveShadow = true;
  stageGroup.add(rimRockB);
  blockers.push({ radius: 1.1, x: RIM_ROCK_B_POSITION[0], z: RIM_ROCK_B_POSITION[2] });

  addDistantIsland(stageGroup, trees, blockers, { x: -15, z: 26, scale: 1.15 });
  addDistantIsland(stageGroup, trees, blockers, { x: 16, z: 32, scale: 1.45, mirror: true });
  addDistantIsland(stageGroup, trees, blockers, { x: -7, z: 44, scale: 2.0 });
  root.add(stageGroup);

  const seaRocks = buildSeaRocks(blockers);
  root.add(seaRocks);
  addShowcaseTreeRow(root, trees, blockers);

  // Same anime-style environment shader the playground runs over its stage.
  await applyEnvironmentShader(stageGroup, { ...ENV_SHADER_OPTIONS });
  await applyEnvironmentShader(seaRocks, { ...ENV_SHADER_OPTIONS });
  for (const tree of trees) {
    applyBroadleafEnvironment(tree, environment, {
      cloudShadow: cloudShadowSettingsFor(environment),
    });
  }
  setEnvironmentCloudShadow(cloudShadowSettingsFor(environment));

  // Fab scan props (async, graceful fallback — never blocks the scene).
  loadScanProps(root, renderer, blockers);

  // --- Grass/flower carpet + kelp --------------------------------------------
  const { flowers, grass } = buildGrassCarpet(environment, clearings);
  root.add(grass);
  root.add(flowers);
  const kelp = buildKelp(settings);
  root.add(kelp);

  // --- Water surface (verbatim WaterSurfaceView construction) ----------------
  const water = new WaterSurface({
    width: WATER_SURFACE_SIZE_X,
    depth: WATER_SURFACE_SIZE_Z,
    segmentsPerMeter: 2.2,
    maxSegments: 420,
    simulation: { resolution: 320, worldSize: 30 },
    bedHeight: seaBedHeight,
    ...settings,
  });
  water.renderOrder = -0.5;
  water.applySettings(settings);
  water.position.set(0, settings.waterLevel, WATER_SURFACE_CENTER_Z);
  water.setCloudShadow(cloudShadowSettingsFor(environment));
  root.add(water);

  // --- Ambient fx (night camp fireflies) --------------------------------------
  let ambientFx = null;
  if (ambientfx) {
    ambientFx = createAmbientFx({
      heightAt: seaBedHeight,
      waterLevel: settings.waterLevel,
      ...ambientfx,
    });
    root.add(ambientFx.root);
  }

  // Node-backend sun shadows for the TSL grass/canopies: same hybrid as the
  // playground's NodeSunShadowDriver (native three shadows cover the toon
  // ground; this pass feeds the custom fragmentNode materials).
  const sunShadowPass = renderer?.isWebGPURenderer
    ? createEnvironmentSunShadowPass({ renderer, scene })
    : null;

  // --- Walker wiring -----------------------------------------------------------
  let walkerObject = null;
  const interactorScratch = { radius: 0.34, height: 1.4, splashStrength: 0.85 };
  let interactorId = null;
  function setWalker(object) {
    walkerObject = object;
    grass.setPushTarget((out) => {
      if (!walkerObject) return null;
      return out.set(walkerObject.position.x, walkerObject.position.y + 0.3, walkerObject.position.z);
    });
    interactorId = water.addInteractor((out) => {
      if (!walkerObject) return out.set(0, -1e6, 0);
      // Track the shins while wading, like the playground's controller hook.
      return out.set(walkerObject.position.x, walkerObject.position.y + 0.24, walkerObject.position.z);
    }, { ...interactorScratch });
    water.setFollowTarget((out) => {
      if (!walkerObject) return null;
      return out.set(walkerObject.position.x, walkerObject.position.y, walkerObject.position.z);
    });
  }

  // Wading is allowed, swimming is not: past thigh depth the bed stops
  // dropping under the walk preview.
  const groundHeightAt = (x, z) => Math.max(seaBedHeight(x, z), settings.waterLevel - 0.5);
  const moveHorizontal = (step, { walker }) => {
    walker.position.x = THREE.MathUtils.clamp(walker.position.x + step.x, -48, 48);
    walker.position.z = THREE.MathUtils.clamp(walker.position.z + step.z, -32, 58);
    for (const circle of blockers) {
      const dx = walker.position.x - circle.x;
      const dz = walker.position.z - circle.z;
      const minDistance = circle.radius + 0.32;
      const distanceSq = dx * dx + dz * dz;
      if (distanceSq >= minDistance * minDistance) continue;
      const distance = Math.sqrt(distanceSq) || 1e-4;
      walker.position.x = circle.x + (dx / distance) * minDistance;
      walker.position.z = circle.z + (dz / distance) * minDistance;
    }
  };

  let disposed = false;
  let clock = 0;
  return {
    ambientFx,
    blockers,
    environment,
    fog,
    groundHeightAt,
    heightAt: seaBedHeight,
    moveHorizontal,
    root,
    setWalker,
    settings,
    sky,
    sunShadow: WATER_SUN_SHADOW,
    water,
    update(delta) {
      if (disposed) return;
      clock += delta;
      advanceEnvironmentShaderTime(delta);
      fishSchool.update(clock);
      for (const tree of trees) {
        tree.update(delta);
        tree.userData.leafParticles?.update(delta);
        syncFoliageFog(tree.canopyMesh?.material, fog);
      }
      grass.update(delta);
      flowers.update(delta);
      kelp.update(delta);
      ambientFx?.update(delta, camera);
      water.update(renderer, scene, camera, delta);
      sky.update(delta, camera);
      sunShadowPass?.update({ dynamic: true });
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (interactorId !== null) water.removeInteractor(interactorId);
      water.setFollowTarget(null);
      sunShadowPass?.dispose();
      ambientFx?.dispose();
      for (const tree of trees) tree.dispose();
      grass.dispose();
      flowers.dispose();
      kelp.dispose();
      water.dispose();
      sky.dispose();
    },
  };
}
