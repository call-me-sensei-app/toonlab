import * as THREE from 'three';

import { createStylizedTerrain } from '../stylizedTerrain.js';
import { createStylizedWorld } from '../stylizedWorld.js';
import {
  applyBiomeQualityBudget,
  resolveBiomeGeneratorRecipe,
} from './biomeGenerator.js';

function colorValue(value) {
  if (!Array.isArray(value)) return value;
  return new THREE.Color().setRGB(
    Number(value[0]) || 0,
    Number(value[1]) || 0,
    Number(value[2]) || 0,
  );
}

function terrainOptionsFromSettings(settings, seed) {
  const terrain = settings.terrain;
  const morphology = terrain.morphology;
  const aspectRoot = Math.sqrt(terrain.aspect);
  return {
    archetype: terrain.archetype,
    depth: terrain.depth,
    detailTexture: true,
    floatingIslands: settings.features.floatingIslands
      ? { count: terrain.floatingIslandCount }
      : false,
    morphology: {
      continent: { ...morphology.continent },
      mountains: {
        amp: morphology.mountains.amp,
        freq: morphology.mountains.freq,
        mask: [morphology.mountains.maskLow, morphology.mountains.maskHigh],
        ridgeExp: morphology.mountains.ridgeExp,
        ridgeFreq: morphology.mountains.ridgeFreq,
      },
      rim: { ...morphology.rim },
      rolling: { ...morphology.rolling },
      terraces: morphology.terraces.enabled
        ? {
          blendOff: [morphology.terraces.blendLow, morphology.terraces.blendHigh],
          sharpness: morphology.terraces.sharpness,
          step: morphology.terraces.step,
        }
        : false,
    },
    palette: Object.fromEntries(
      Object.entries(terrain.palette).map(([key, value]) => [key, colorValue(value)]),
    ),
    seed,
    segments: settings.runtime.terrainSegments,
    sinkholes: settings.features.sinkholes ? { count: terrain.sinkholeCount } : false,
    size: {
      x: terrain.size * aspectRoot,
      z: terrain.size / aspectRoot,
    },
    waterCoverage: settings.features.water ? terrain.waterCoverage : 0,
  };
}

function resolveRuntimeSettings(source, quality) {
  if (source?.type === 'toonlab/biome-generator') {
    return resolveBiomeGeneratorRecipe(source, { quality });
  }
  if (source?.type === 'toonlab/biome-preset') {
    return applyBiomeQualityBudget(source.settings, quality);
  }
  return applyBiomeQualityBudget(source?.settings ?? source, quality);
}

function countRuntimeGeometry(roots) {
  const seen = new Set();
  let drawables = 0;
  let instances = 0;
  let triangles = 0;
  let vertices = 0;
  for (const root of roots) {
    root?.traverse?.((object) => {
      if (seen.has(object.uuid) || !object.geometry) return;
      seen.add(object.uuid);
      const multiplier = object.isInstancedMesh ? Math.max(Number(object.count) || 0, 1) : 1;
      const positionCount = Number(object.geometry.attributes?.position?.count) || 0;
      const triangleCount = object.geometry.index
        ? object.geometry.index.count / 3
        : positionCount / 3;
      drawables += 1;
      instances += multiplier;
      triangles += triangleCount * multiplier;
      vertices += positionCount * multiplier;
    });
  }
  return {
    drawables,
    instances,
    triangles: Math.round(triangles),
    vertices: Math.round(vertices),
  };
}

/**
 * Builds and owns a complete generated biome. The async runtime mirrors an
 * editor's Generate button but is safe to ship: it applies a named quality
 * budget, owns every allocation, and exposes update/regenerate/dispose.
 * Pass a generator as `recipe`, a resolved document as `preset`, or legacy
 * flat settings as `settings`; resolved presets retain their seed and world
 * base so design-time and runtime builds stay identical.
 */
export async function createBiomeRuntime({
  camera = null,
  followTarget = null,
  quality = 'balanced',
  preset = null,
  recipe = null,
  renderer,
  scene,
  seed = null,
  settings = null,
  weather = false,
  worldOptions = {},
} = {}) {
  if (!renderer || !scene) throw new Error('createBiomeRuntime needs { renderer, scene }.');

  let disposed = false;
  let generation = 0;
  let terrain = null;
  let world = null;
  let resolvedSettings = null;
  let source = recipe ?? preset ?? settings ?? {};
  let activeQuality = quality;
  let activeSeed = Number(seed ?? source?.seed ?? 1) >>> 0 || 1;

  async function build(nextSource = source, options = {}) {
    if (disposed) throw new Error('Cannot regenerate a disposed biome runtime.');
    const buildId = ++generation;
    const nextQuality = options.quality ?? activeQuality;
    const nextSeed = Number(options.seed ?? nextSource?.seed ?? activeSeed) >>> 0 || 1;
    const nextSettings = resolveRuntimeSettings(nextSource, nextQuality);
    const nextTerrain = createStylizedTerrain(terrainOptionsFromSettings(nextSettings, nextSeed));
    scene.add(nextTerrain.root);

    let nextWorld;
    try {
      const vegetation = nextSettings.vegetation;
      nextWorld = await createStylizedWorld({
        ...worldOptions,
        applyCamera: worldOptions.applyCamera ?? true,
        camera,
        environment: {
          ...(worldOptions.environment ?? {}),
          parameters: {
            heightFogDensity: nextSettings.atmosphere.fogDensity,
            heightFogFalloff: nextSettings.atmosphere.fogFalloff,
            ...(worldOptions.environment?.parameters ?? {}),
          },
        },
        flowers: nextSettings.features.flowers
          ? {
            ...(worldOptions.flowers ?? {}),
            scatter: {
              density: vegetation.flowerDensity,
              radius: vegetation.flowerRadius,
              seed: nextSeed + 307,
              ...(worldOptions.flowers?.scatter ?? {}),
            },
          }
          : false,
        followTarget,
        grass: nextSettings.features.grass
          ? {
            ...(worldOptions.grass ?? {}),
            scatter: {
              density: vegetation.grassDensity,
              radius: vegetation.grassRadius,
              seed: nextSeed + 211,
              ...(worldOptions.grass?.scatter ?? {}),
            },
            settings: {
              baseColor: vegetation.grassBaseColor,
              tipColor: vegetation.grassTipColor,
              windStrength: vegetation.windStrength,
              ...(worldOptions.grass?.settings ?? {}),
            },
          }
          : false,
        preset: nextSource?.basePreset ?? worldOptions.preset ?? 'outdoorGameplay',
        renderer,
        scene,
        shadows: {
          interval: nextQuality === 'cinematic' ? 1 : nextQuality === 'mobile' ? 3 : 2,
          ...(worldOptions.shadows ?? {}),
        },
        sky: {
          radius: nextSettings.atmosphere.skyRadius,
          ...(worldOptions.sky ?? {}),
        },
        terrain: {
          heightAt: nextTerrain.heightAt,
          root: nextTerrain.root,
          size: nextTerrain.meshExtent,
        },
        trees: nextSettings.features.trees
          ? {
            ...(worldOptions.trees ?? {}),
            canopyColors: [vegetation.treeCanopyColor],
            lod: {
              detailCount: nextQuality === 'mobile' ? 30 : nextQuality === 'cinematic' ? 120 : 72,
              variants: nextQuality === 'mobile' ? 3 : nextQuality === 'cinematic' ? 8 : 5,
              ...(worldOptions.trees?.lod ?? {}),
            },
            scatter: {
              keepChance: vegetation.treeKeepChance,
              radius: vegetation.treeRadius,
              seed: nextSeed + 101,
              spacing: vegetation.treeSpacing,
              ...(worldOptions.trees?.scatter ?? {}),
            },
            settings: {
              size: vegetation.treeSize,
              ...(worldOptions.trees?.settings ?? {}),
            },
          }
          : false,
        water: nextSettings.features.water
          ? {
            ...(worldOptions.water ?? {}),
            level: nextTerrain.waterLevel,
            settings: {
              deepColor: nextSettings.water.deepColor,
              shallowColor: nextSettings.water.shallowColor,
              ...(worldOptions.water?.settings ?? {}),
            },
          }
          : false,
        weather: worldOptions.weather ?? weather,
      });
    } catch (error) {
      nextTerrain.dispose();
      throw error;
    }

    if (disposed || buildId !== generation) {
      nextWorld.dispose();
      nextTerrain.dispose();
      return false;
    }

    world?.dispose();
    terrain?.dispose();
    world = nextWorld;
    terrain = nextTerrain;
    resolvedSettings = nextSettings;
    source = nextSource;
    activeQuality = nextQuality;
    activeSeed = nextSeed;
    return true;
  }

  const api = {
    dispose() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      world?.dispose();
      terrain?.dispose();
      world = null;
      terrain = null;
    },
    get settings() { return resolvedSettings; },
    get terrain() { return terrain; },
    get world() { return world; },
    regenerate: build,
    stats() {
      const geometry = countRuntimeGeometry([
        terrain?.root,
        world?.sky,
        world?.water,
        world?.forest,
        world?.grass,
        world?.flowerField,
      ]);
      return {
        disposed,
        quality: activeQuality,
        seed: activeSeed,
        terrainAttempts: terrain?.stats?.attempts ?? 0,
        treePlacements: world?.forest?._placements?.length ?? 0,
        ...geometry,
      };
    },
    update(delta = 0.016) {
      if (!disposed) world?.update(delta);
    },
  };

  await build(source, { quality: activeQuality, seed: activeSeed });
  return api;
}
