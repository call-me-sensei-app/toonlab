// Vegetation dressing for the water scenes: the environment foliage clock and
// the dense grass/flower meadow carpet.
import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody } from '@react-three/rapier';

import {
  advanceEnvironmentShaderTime,
  setEnvironmentCloudShadow,
} from '@call-me-sensei/toonlab/environment';
import { CALL_ME_SENSEI_GROUND_SHADER_SETTINGS } from '@call-me-sensei/toonlab/ground-shader';
import {
  createCallMeSenseiGrassField,
  StylizedFlowerField,
  syncFoliageFog,
} from '@call-me-sensei/toonlab/vegetation';
import { WALKABLE_QUALITY_PROFILE } from '../quality.js';
import { BODY_CENTER_AT_REST, SEA_BED_CENTER_Z } from '../params.js';
import {
  WATER_ENVIRONMENT_PRESETS,
  cloudShadowSettingsFor,
  seaBedHeight,
} from './stage.js';
import {
  applyBroadleafEnvironment,
  createBroadleafTreeInstance,
  WALKABLE_CALL_ME_SENSEI_TREE_COLORS,
} from './toonlabBroadleaf.js';

function TreeFoliageRig({ envPreset }) {
  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    const cloudShadow = cloudShadowSettingsFor(environment);
    setEnvironmentCloudShadow(cloudShadow);
  }, [envPreset]);

  useFrame((_, delta) => {
    advanceEnvironmentShaderTime(delta);
  });

  return null;
}

const SHOWCASE_ROW_Z = -16;
const BROADLEAF_SHOWCASE_TREES = Object.freeze([
  Object.freeze({
    canopyColor: WALKABLE_CALL_ME_SENSEI_TREE_COLORS.meadow,
    id: 'example_branching',
    leafShape: 'teardrop',
    seedOffset: 0,
    sizeScale: 0.98,
    rotation: 0.35,
    windSpeedScale: 0.9,
    windStrengthScale: 0.95,
  }),
  Object.freeze({
    canopyColor: WALKABLE_CALL_ME_SENSEI_TREE_COLORS.deep,
    id: 'species_oak_small',
    leafShape: 'round',
    seedOffset: 8,
    sizeScale: 1.05,
    rotation: 5.65,
    windSpeedScale: 1.1,
    windStrengthScale: 0.86,
  }),
  Object.freeze({
    canopyColor: WALKABLE_CALL_ME_SENSEI_TREE_COLORS.spring,
    id: 'species_ash',
    leafShape: 'maple',
    seedOffset: 14,
    sizeScale: 0.96,
    rotation: 1.2,
    windSpeedScale: 0.78,
    windStrengthScale: 1.15,
  }),
  Object.freeze({
    canopyColor: WALKABLE_CALL_ME_SENSEI_TREE_COLORS.olive,
    id: 'species_aspen',
    leafShape: 'gingko',
    seedOffset: 22,
    sizeScale: 0.95,
    rotation: 2.45,
    windSpeedScale: 1.28,
    windStrengthScale: 0.72,
  }),
  Object.freeze({
    canopyColor: WALKABLE_CALL_ME_SENSEI_TREE_COLORS.amber,
    id: 'species_oak_large',
    leafShape: 'maple',
    seedOffset: 31,
    sizeScale: 0.86,
    rotation: 3.6,
    windSpeedScale: 0.84,
    windStrengthScale: 1.22,
  }),
]);

function ShowcaseTreeRow({ envPreset }) {
  const scene = useThree((state) => state.scene);
  const instances = useMemo(() => {
    const spacing = 6.2;
    const center = (BROADLEAF_SHOWCASE_TREES.length - 1) * spacing * 0.5;
    return BROADLEAF_SHOWCASE_TREES.map((config, index) => {
      const instance = createBroadleafTreeInstance({
        canopyColor: config.canopyColor,
        leafShape: config.leafShape,
        presetId: config.id,
        seedOffset: config.seedOffset,
        sizeScale: config.sizeScale,
        styleTarget: { targetId: `walkable/tree/showcase-${index}-${config.id}` },
        windSpeedScale: config.windSpeedScale,
        windStrengthScale: config.windStrengthScale,
      });
      const { tree } = instance;
      const x = index * spacing - center;
      tree.position.set(x, seaBedHeight(x, SHOWCASE_ROW_Z) - 0.05, SHOWCASE_ROW_Z);
      tree.rotation.y = config.rotation;
      return instance;
    });
  }, []);
  const trees = useMemo(() => instances.map((instance) => instance.tree), [instances]);

  useEffect(() => () => trees.forEach((tree) => tree.dispose()), [trees]);

  useEffect(() => {
    const colors = instances.map((instance) => instance.recipe.options.canopyColor);
    document.body.dataset.treeCanopyColors = colors.join(',');
    document.body.dataset.treeCanopyUniqueColors = String(new Set(colors).size);
  }, [instances]);

  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    trees.forEach((tree) => {
      applyBroadleafEnvironment(tree, environment, {
        cloudShadow: cloudShadowSettingsFor(environment),
      });
    });
  }, [trees, envPreset]);

  useFrame((_, delta) => trees.forEach((tree) => {
    tree.update(delta);
    syncFoliageFog(tree.canopyMesh?.material, scene.fog);
  }));

  return (
    <group>
      {trees.map((tree, index) => {
        const size = tree.settings?.tree?.size ?? 1;
        return (
          <group key={`broadleaf-showcase-${BROADLEAF_SHOWCASE_TREES[index].id}`}>
            <primitive object={tree} />
            <RigidBody type="fixed" colliders={false}>
              <CapsuleCollider
                args={[0.72 * size, 0.22 * size]}
                position={[tree.position.x, tree.position.y + 0.86 * size, tree.position.z]}
              />
            </RigidBody>
          </group>
        );
      })}
    </group>
  );
}

function createSeededRandom(seed = 0x5e115e1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// The Grass Lab's canonical Meadow view places 420 untouched Call Me Sensei
// clumps over an 8.4 m radius. Reuse that construction density here while the
// asset itself stays exactly on the packaged primary-clump defaults.
const CALL_ME_SENSEI_MEADOW_DENSITY = 420 / (Math.PI * 8.4 * 8.4);
const CALL_ME_SENSEI_MEADOW_SPACING = 1 / Math.sqrt(CALL_ME_SENSEI_MEADOW_DENSITY);
const GRASS_LOD_DISTANCES = Object.freeze([
  WALKABLE_QUALITY_PROFILE.quality.vegetation.lodNear,
  WALKABLE_QUALITY_PROFILE.quality.vegetation.lodMid,
  WALKABLE_QUALITY_PROFILE.quality.vegetation.lodFar,
]);

function GrassField({ controllerRef, envPreset }) {
  const camera = useThree((state) => state.camera);
  const [grass, setGrass] = useState(null);
  const { placements, flowers } = useMemo(() => {
    const random = createSeededRandom();
    const placements = [];
    const flowerPlacements = [];
    // Cover the complete 340 m terrain. LOD reduces blade geometry per clump;
    // it must not also thin the authored meadow into visibly bare terrain.
    const focusX = 0;
    const focusZ = -4;
    const terrainHalfExtent = 168;
    const tiers = [
      { min: 0, max: GRASS_LOD_DISTANCES[1], spacing: CALL_ME_SENSEI_MEADOW_SPACING },
      { min: GRASS_LOD_DISTANCES[1], max: GRASS_LOD_DISTANCES[2], spacing: CALL_ME_SENSEI_MEADOW_SPACING },
      { min: GRASS_LOD_DISTANCES[2], max: Infinity, spacing: CALL_ME_SENSEI_MEADOW_SPACING },
    ];
    const addTier = ({ min, max, spacing }) => {
      for (let gx = -terrainHalfExtent; gx <= terrainHalfExtent; gx += spacing) {
        for (let gz = SEA_BED_CENTER_Z - terrainHalfExtent;
          gz <= SEA_BED_CENTER_Z + terrainHalfExtent;
          gz += spacing) {
          const distance = Math.hypot(gx - focusX, gz - focusZ);
          if (distance < min || distance >= max) continue;
          const clumpX = gx + (random() - 0.5) * spacing * 0.62;
          const clumpZ = gz + (random() - 0.5) * spacing * 0.62;
          const clumpY = seaBedHeight(clumpX, clumpZ);
          const edge = THREE.MathUtils.smoothstep(clumpY, 0.42, 0.56) *
            (1 - THREE.MathUtils.smoothstep(clumpY, 1.02, 1.14));
          if (edge <= 0 || random() > edge) continue;
          placements.push({
            x: clumpX,
            y: clumpY - 0.03,
            z: clumpZ,
            phase: random(),
            scale: 0.94 + random() * 0.14,
            yaw: random() * Math.PI * 2,
          });

          // Flowers remain concentrated in the readable near/mid meadow;
          // billboard flowers across the fogged terrain add cost, not detail.
          if (distance < 65 && random() < 0.055) {
            const heads = 1 + Math.floor(random() * 3);
            for (let head = 0; head < heads; head += 1) {
              const x = clumpX + (random() - 0.5) * spacing;
              const z = clumpZ + (random() - 0.5) * spacing;
              const y = seaBedHeight(x, z);
              if (y < 0.4 || y > 1.2) continue;
              flowerPlacements.push({
                x,
                y: y - 0.03,
                z,
                headHeight: 0.48 + random() * 0.2,
              });
            }
          }
        }
      }
    };
    tiers.forEach(addTier);
    const flowerField = new StylizedFlowerField({ placements: flowerPlacements });
    flowerField.userData.waterReflectionExclude = true;
    return { placements, flowers: flowerField };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let field = null;
    createCallMeSenseiGrassField({
      groundField: true,
      lodUpdateInterval: 0.25,
      placements,
      preset: 'call_me_sensei_clump',
      variant: 'primary',
    }).then((nextField) => {
      field = nextField;
      if (cancelled) {
        field.dispose();
        return;
      }
      field.userData.waterReflectionExclude = true;
      field.updateLods(camera);
      const budget = field.bladeBudget();
      document.body.dataset.grassApi = 'createCallMeSenseiGrassField';
      document.body.dataset.grassClumpCount = String(field.instanceCount);
      document.body.dataset.grassDrawnBlades = String(budget.drawn);
      document.body.dataset.grassLodInstances = budget.perLod.map((lod) => lod.instances).join(',');
      document.body.dataset.grassLodDistances = field.lodProfiles.map((lod) => lod.distance).join(',');
      document.body.dataset.grassFirstParty = String(field.userData.callMeSenseiGrass?.firstParty === true);
      document.body.dataset.grassBladeHeightRange = field.settings.bladeHeightRange.join(',');
      document.body.dataset.grassBladeWidthRange = field.settings.bladeWidthRange.join(',');
      document.body.dataset.grassBladesPerClump = String(field.settings.bladesPerClump);
      document.body.dataset.grassClumpRadius = String(field.settings.clumpRadius);
      document.body.dataset.grassComposition = 'call_me_sensei_clump:primary';
      document.body.dataset.grassPreset = field.userData.callMeSenseiGrass?.preset ?? '';
      document.body.dataset.grassProcedural = String(field.userData.callMeSenseiGrass?.procedural === true);
      document.body.dataset.grassStaticLean = String(field.settings.leanStrength);
      setGrass(field);
    }).catch((error) => {
      if (cancelled) return;
      document.body.dataset.grassApi = 'error';
      console.error('Call Me Sensei meadow failed to initialize:', error);
    });
    return () => {
      cancelled = true;
      field?.dispose();
    };
  }, [placements]);

  useEffect(() => () => flowers.dispose(), [flowers]);

  useEffect(() => {
    if (!grass) return;
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
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
      intensity: CALL_ME_SENSEI_GROUND_SHADER_SETTINGS.lighting.sunIntensity,
      sky: environment.sky.horizonColor,
      skyIntensity: 1,
    });
    grass.setCloudShadow(cloudShadowSettingsFor(environment));
    // Blades past the fog line are invisible anyway; collapse them so the
    // Fully fogged clumps stop paying fill rate beyond the visible meadow.
    grass.setDistanceFade({
      start: environment.fog.far * 0.8,
      end: environment.fog.far * 1.05,
    });
    flowers.setWind({
      direction: [1, 0.3],
      speed: wind.speed,
      strength: wind.strength,
    });
  }, [grass, flowers, envPreset]);

  useEffect(() => {
    if (!grass) return undefined;
    grass.setPushTarget((out) => {
      const body = controllerRef.current?.group;
      if (!body?.translation) return null;
      const position = body.translation();
      return out.set(position.x, position.y - BODY_CENTER_AT_REST + 0.3, position.z);
    });
    return () => grass.setPushTarget(null);
  }, [controllerRef, grass]);

  useFrame((_, delta) => {
    grass?.update(delta, camera);
    if (grass) {
      const culling = grass.cullingStats;
      document.body.dataset.grassVisibleClumps = String(culling.visibleInstances);
      document.body.dataset.grassCulledClumps = String(culling.culledInstances);
      document.body.dataset.grassVisibleChunks = String(culling.visibleChunks);
      document.body.dataset.grassTotalChunks = String(culling.totalChunks);
      document.body.dataset.grassBudgetCulledClumps = String(culling.budgetCulledInstances);
      document.body.dataset.grassDistanceCulledClumps = String(culling.distanceCulledInstances);
      const bladeBudget = grass.bladeBudget();
      document.body.dataset.grassDrawnBlades = String(bladeBudget.drawn);
      document.body.dataset.grassLodInstances = bladeBudget.perLod
        .map((lod) => lod.instances)
        .join(',');
      document.body.dataset.grassTestedClumps = String(culling.testedInstances);
    }
    flowers.update(delta);
  });

  return (
    <>
      {grass && <primitive object={grass} />}
      <primitive object={flowers} />
    </>
  );
}

export {
  TreeFoliageRig,
  ShowcaseTreeRow,
  GrassField,
};
