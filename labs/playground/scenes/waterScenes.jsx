// The stylized water-scene stage pieces: the Water Lab HUD, the water surface
// wiring, floaters/sinkers, sky/horizon backdrops, the sea stage (seabed,
// rocks, islands, fish, scan props, bench sit), rain, kelp, and the
// underwater atmosphere swap.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, TrimeshCollider } from '@react-three/rapier';

import { loadModelAsset } from '@call-me-sensei/toonlab/loaders';
import {
  createGroundShaderMesh,
  disposeGroundShaderMaterial,
  setGroundShaderSceneState,
} from '@call-me-sensei/toonlab/ground-shader';
import { syncFoliageFog } from '@call-me-sensei/toonlab/vegetation';
import {
  setObjectTextureColorSpaces,
  waitForObjectTextures,
} from '@call-me-sensei/toonlab/toon';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createStyleMaterialContract,
  createStyleTargetLabel,
  labelStyleTarget,
  resolveStyleBundleSettings,
} from '@call-me-sensei/toonlab/styles';
import {
  BODY_CENTER_AT_REST,
  SEA_BED_CENTER_Z,
} from '../params.js';
import { collectEnvironmentTrimesh } from './indoorScene.jsx';
import {
  GRASSY_LAND_TEXTURE,
  LAND_TEXTURE,
  ROCK_TEXTURE,
  SAND_TEXTURE,
  TOON_GRADIENT_MAP,
  WATER_ENVIRONMENT_PRESETS,
  WATER_ENVIRONMENT_PRESET_NAMES,
  cloudShadowSettingsFor,
  createSeaBedGeometry,
  createSeaBedGroundField,
  seaBedHeight,
  toonMaterial,
} from './stage.js';
import {
  applyBroadleafEnvironment,
  createBroadleafTreeInstance,
  WALKABLE_CALL_ME_SENSEI_CANOPY_COLOR,
  WALKABLE_CALL_ME_SENSEI_TREE_COLORS,
} from './toonlabBroadleaf.js';
import { OfficialCatalogRock } from './officialCatalogRock.jsx';
import { useWalkablePhysicsReadiness } from './showcases/walkablePhysicsReadiness.jsx';
import { formatWaterValue, WalkableSampleHud, WaterHud } from './waterHud.jsx';
import { ToonLabSkyView } from './walkableSky.jsx';
import { KelpField, RainView, UnderwaterAtmosphere } from './waterAtmosphere.jsx';
import { WaterBall, WaterSurfaceView } from './waterRuntimeView.jsx';

const quaterniusBenchUrl = '/props/cc0/quaternius/fantasy-props-megakit/bench.glb';
const QUATERNIUS_BENCH_ASSET_ID = 'quaternius:fantasy-props-megakit-bench';
const CALL_ME_SENSEI_SETTINGS = resolveStyleBundleSettings(CALL_ME_SENSEI_STYLE_BUNDLE);

// Each horizon landmark is an authored formation made from several released
// cliff-family entries. A lone mountain mesh enlarged into a backdrop exposes
// its simple footprint; overlapping silhouettes, stepped depths and modest
// scale changes preserve the catalog geometry while reading as one landmass.
const HORIZON_CLIFF_FORMATIONS = Object.freeze([
  Object.freeze({
    id: 'west-cliffs',
    parts: Object.freeze([
      Object.freeze({ assetId: 'rock-0303', position: [-53, -4.8, 112], rotation: 0.05, scale: 3.4 }),
      Object.freeze({ assetId: 'rock-0118', position: [-54, -5.2, 120], rotation: -0.2, scale: 2.6 }),
      Object.freeze({ assetId: 'rock-0024', position: [-32, -3.3, 115], rotation: 0.25, scale: 3.2 }),
      Object.freeze({ assetId: 'rock-0093', position: [-22, -3.5, 124], rotation: -0.1, scale: 3.1 }),
    ]),
  }),
  Object.freeze({
    id: 'mountain-spine',
    parts: Object.freeze([
      Object.freeze({ assetId: 'rock-0024', position: [-7, -3.7, 121], rotation: -0.28, scale: 3.4 }),
      Object.freeze({ assetId: 'rock-0275', position: [10, -3.6, 112], rotation: -0.22, scale: 3.4 }),
      Object.freeze({ assetId: 'rock-0117', position: [23, -4, 119], rotation: 0.16, scale: 3.2 }),
    ]),
  }),
  Object.freeze({
    id: 'east-cliffs',
    parts: Object.freeze([
      Object.freeze({ assetId: 'rock-0019', position: [37, -3.5, 116], rotation: -0.08, scale: 3.2 }),
      Object.freeze({ assetId: 'rock-0303', position: [53, -4.8, 112], rotation: -0.25, scale: 3.4 }),
      Object.freeze({ assetId: 'rock-0118', position: [58, -5.5, 122], rotation: 0.32, scale: 2.5 }),
      Object.freeze({ assetId: 'rock-0093', position: [70, -3.8, 125], rotation: -0.35, scale: 3.2 }),
    ]),
  }),
]);

const HORIZON_CLIFF_PARTS = Object.freeze(HORIZON_CLIFF_FORMATIONS.flatMap(
  ({ id: formationId, parts }) => parts.map((part, index) => Object.freeze({
    ...part,
    collidable: false,
    key: `${formationId}-${index}-${part.assetId}`,
  })),
));

function HorizonSilhouettes({ inspector }) {
  useEffect(() => {
    document.body.dataset.horizonFormationCount = String(HORIZON_CLIFF_FORMATIONS.length);
    document.body.dataset.horizonCliffPartCount = String(HORIZON_CLIFF_PARTS.length);
    document.body.dataset.horizonCliffAssetIds = HORIZON_CLIFF_PARTS
      .map(({ assetId }) => assetId)
      .join(',');
    document.body.dataset.horizonMountainConstruction = 'catalog-cliff-composition';
    return () => {
      delete document.body.dataset.horizonFormationCount;
      delete document.body.dataset.horizonCliffPartCount;
      delete document.body.dataset.horizonCliffAssetIds;
      delete document.body.dataset.horizonMountainConstruction;
    };
  }, []);

  return (
    <>
      {HORIZON_CLIFF_PARTS.map(({ key, ...rock }) => (
        <OfficialCatalogRock
          key={key}
          {...rock}
          inspector={inspector}
          targetId={`walkable/horizon/${key}`}
        />
      ))}
    </>
  );
}

const RIM_ROCK_A_POSITION = [8.6, seaBedHeight(8.6, -2.6) + 0.16, -2.6];
const RIM_ROCK_B_POSITION = [-9.8, seaBedHeight(-9.8, -3.8) + 0.2, -3.8];

const SEA_ROCKS = Object.freeze([
  // Emergent rocks near the shallows: foam rings form around their waterline.
  Object.freeze({ assetId: 'rock-0002', position: [2.9, 0.14, 4.6], rotation: [0.2, 0, 0.1], scale: [0.85, 0.72, 0.7], collidable: true }),
  Object.freeze({ assetId: 'rock-0007', position: [-3.6, 0.02, 3.6], rotation: [0.35, 1.3, 0.18], scale: [0.72, 0.68, 0.66], collidable: true }),
  Object.freeze({ assetId: 'rock-0061', position: [5.8, -0.08, 7.4], rotation: [0.12, 2.6, 0.24], scale: [1.15, 0.9, 0.95], collidable: true }),
  // Submerged rocks at increasing depth: clarity / refraction reference.
  Object.freeze({ assetId: 'rock-0065', position: [1.3, -0.3, 5.8], rotation: [0.1, 3.9, 0.08], scale: [0.76, 0.58, 0.68] }),
  Object.freeze({ assetId: 'rock-0068', position: [-1.6, -0.5, 7.0], rotation: [0.22, 5.2, 0.12], scale: [0.9, 0.72, 0.82] }),
  Object.freeze({ assetId: 'rock-0073', position: [-5.2, -0.35, 5.6], rotation: [0.16, 0.7, 0.2], scale: [0.82, 0.62, 0.7] }),
]);

function WaterBroadleafTree({
  canopyColor = null,
  collidable = true,
  envPreset,
  leafShape = 'teardrop',
  position,
  presetId = 'example_branching',
  rotation = 0,
  seedOffset = 0,
  sizeScale = 1,
  windSpeedScale = 1,
  windStrengthScale = 1,
}) {
  const scene = useThree((state) => state.scene);
  const px = position?.[0] ?? 0;
  const py = position?.[1] ?? 0;
  const pz = position?.[2] ?? 0;
  const instance = useMemo(
    () => createBroadleafTreeInstance({
      canopyColor,
      leafShape,
      presetId,
      seedOffset,
      sizeScale,
      styleTarget: {
        targetId: `walkable/tree/${presetId}-${seedOffset}-${Math.round((px + 200) * 10)}-${Math.round((pz + 200) * 10)}`,
      },
      windSpeedScale,
      windStrengthScale,
    }),
    [
      canopyColor,
      leafShape,
      presetId,
      seedOffset,
      sizeScale,
      windSpeedScale,
      windStrengthScale,
      px,
      pz,
    ],
  );
  const { recipe } = instance;
  const tree = useMemo(() => {
    instance.tree.position.set(px, py, pz);
    instance.tree.rotation.y = rotation;
    return instance.tree;
  }, [instance, px, py, pz, rotation]);
  const colliderSize = tree.settings?.tree?.size ?? recipe.options?.size ?? 1;

  useEffect(() => () => tree.dispose(), [tree]);

  useEffect(() => {
    const uniforms = tree.canopyMesh?.material?.uniforms;
    document.body.dataset.treeCanopyColor = recipe.options.canopyColor ?? WALKABLE_CALL_ME_SENSEI_CANOPY_COLOR;
    document.body.dataset.treeCanopyMode = tree.userData.walkableCanopy?.mode ?? '';
    document.body.dataset.treeCanopyPalette = [
      uniforms?.uLitColor?.value?.getHexString?.() ?? '',
      uniforms?.uShadowColor?.value?.getHexString?.() ?? '',
      uniforms?.uCrownColor?.value?.getHexString?.() ?? '',
    ].join(',');
    document.body.dataset.treeCanopyVariation = [
      uniforms?.uStyleFoliageHueVariation?.value ?? '',
      uniforms?.uStyleFoliageCardVariationStrength?.value ?? '',
      uniforms?.uStyleFoliageSpriteLuminanceStrength?.value ?? '',
    ].join(',');
    document.body.dataset.treeCanopyVertices = String(
      tree.canopyMesh?.geometry?.getAttribute('position')?.count ?? 0,
    );
    document.body.dataset.treeFoliageAttachments = String(tree.foliageAttachments?.length ?? 0);
  }, [tree]);

  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    applyBroadleafEnvironment(tree, environment, {
      cloudShadow: cloudShadowSettingsFor(environment),
    });
  }, [envPreset, tree]);

  useFrame((_, delta) => {
    tree.update(delta);
    syncFoliageFog(tree.canopyMesh?.material, scene.fog);
  });

  return (
    <>
      <primitive object={tree} />
      {collidable && (
        <RigidBody type="fixed" colliders={false} position={[px, py, pz]} rotation={[0, rotation, 0]}>
          <CapsuleCollider args={[0.55 * colliderSize, 0.22 * colliderSize]} position={[0, 0.78 * colliderSize, 0]} />
        </RigidBody>
      )}
    </>
  );
}

function SeaRocks({ inspector }) {
  return SEA_ROCKS.map((rock) => (
    <OfficialCatalogRock key={rock.assetId} {...rock} inspector={inspector} />
  ));
}

function labelManufacturedFurniture(root, { assetId, targetId }) {
  const assignments = {};
  const seen = new Map();
  root.userData.urbanObjectClass = 'furniture';
  root.traverse((object) => {
    if (!object.isMesh || !object.material) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      let materialId = seen.get(material);
      if (!materialId) {
        materialId = `BenchSurface${seen.size + 1}`;
        seen.set(material, materialId);
        material.userData.toonlabMaterialId = materialId;
        material.userData.urbanMaterial = {
          baseMaterial: 'wood',
          finish: 'varnished',
          renderMode: 'opaque',
          structuralRole: 'primaryMass',
          classificationSource: 'quaternius-bench-import-manifest',
          confidence: 1,
        };
        assignments[materialId] = { roles: ['primaryMass'] };
      }
    });
  });
  labelStyleTarget(root, createStyleTargetLabel('manufactured.surface', {
    assetId,
    materials: createStyleMaterialContract('manufactured.surface', { assignments }),
    targetId,
  }));
  return { materials: seen.size };
}

function disposeManufacturedAsset(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root?.traverse((object) => {
    if (!object.isMesh) return;
    if (object.geometry) geometries.add(object.geometry);
    const entries = Array.isArray(object.material) ? object.material : [object.material];
    entries.forEach((material) => {
      if (!material) return;
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}

function ManufacturedProp({ url, label, assetId = null, position, rotation = 0, scale = 1 }) {
  const { gl } = useThree();
  const [model, setModel] = useState(null);
  const [trimesh, setTrimesh] = useState(null);
  const completePhysicsReadiness = useWalkablePhysicsReadiness(
    true,
    `manufactured:${assetId ?? url}:${label}`,
  );

  // World-space trimesh collider, built after the primitive mounts so the
  // placement transforms are baked into obj.matrixWorld.
  useEffect(() => {
    if (!model) return;
    setTrimesh(collectEnvironmentTrimesh(model));
    completePhysicsReadiness();
  }, [completePhysicsReadiness, model]);

  useEffect(() => {
    let cancelled = false;
    let ownedRoot = null;
    (async () => {
      try {
        const asset = await loadModelAsset(url, { renderer: gl });
        ownedRoot = asset.root;
        await waitForObjectTextures(asset.root);
        setObjectTextureColorSpaces(asset.root);
        const manufactured = labelManufacturedFurniture(asset.root, {
          assetId,
          targetId: `walkable/manufactured/${label}`,
        });
        if (cancelled) {
          disposeManufacturedAsset(ownedRoot);
          ownedRoot = null;
          return;
        }
        document.body.dataset[label + 'Shader'] = 'manufacturedSurface';
        document.body.dataset[label + 'ManufacturedMaterials'] = String(manufactured.materials);
        if (assetId) document.body.dataset[label + 'AssetId'] = assetId;
        setModel(asset.root);
      } catch (error) {
        if (cancelled) return;
        completePhysicsReadiness();
        console.warn('Manufactured prop ' + label + ' failed to load:', error);
        document.body.dataset[label + 'Shader'] = 'error';
      }
    })();
    return () => {
      cancelled = true;
      disposeManufacturedAsset(ownedRoot);
      ownedRoot = null;
    };
  }, [assetId, completePhysicsReadiness, gl, url, label]);

  if (!model) return null;
  return (
    <>
      <primitive
        object={model}
        position={position}
        rotation={[0, rotation, 0]}
        scale={scale}
      />
      {trimesh && (
        <RigidBody type="fixed" colliders={false}>
          <TrimeshCollider args={[trimesh.vertices, trimesh.indices]} friction={0.9} />
        </RigidBody>
      )}
    </>
  );
}

// Quaternius bench placement is shared with the sit interaction below.
const BENCH_POSITION = [3.0, seaBedHeight(3.0, -5.6) - 0.03, -5.6];
const BENCH_ROTATION = -0.4;
// The catalog model is authored in metres and its seat is 0.5 m above the
// base. The interaction point faces the water from the center of the seat.
const BENCH_SEAT = (() => {
  const yaw = BENCH_ROTATION;
  const x = BENCH_POSITION[0];
  const z = BENCH_POSITION[2];
  // Dismount point on the ground in front of the seat, clear of the bench.
  const standX = x + Math.sin(yaw) * 0.85;
  const standZ = z + Math.cos(yaw) * 0.85;
  return {
    x,
    z,
    top: BENCH_POSITION[1] + 0.5,
    yaw,
    radius: 2.0,
    standX,
    standZ,
    standY: seaBedHeight(standX, standZ) + BODY_CENTER_AT_REST + 0.02,
  };
})();

function ManufacturedProps({ inspector }) {
  return (
    <>
      {/* Released 480-catalog formation straddling the waterline so foam and
          underwater tint are demonstrated against the shipped rock asset. */}
      <OfficialCatalogRock
        assetId="rock-0035"
        collidable
        position={[-6.2, seaBedHeight(-6.2, 1.4) - 0.05, 1.4]}
        rotation={0.6}
        scale={0.72}
        inspector={inspector}
      />
      {/* Exact CC0 Quaternius catalog bench, at authored metre scale on the
          flat dune shelf so its feet and sit interaction share one surface. */}
      <ManufacturedProp
        url={quaterniusBenchUrl}
        label="quaterniusBench"
        assetId={QUATERNIUS_BENCH_ASSET_ID}
        position={BENCH_POSITION}
        rotation={BENCH_ROTATION}
      />
    </>
  );
}

// Sit/stand toggle for the catalog bench: F near the seat sits the character
// facing the water; F again (or any move/jump key) stands up. While seated the
// capsule is pinned above the seat —
// the seated pose comes from the sit clip plus the visual drop in
// ControlledPmxModel, so the physics never fights the bench collider.
function BenchSitController({ controllerRef, sitStateRef }) {
  const toggleRef = useRef(false);
  const standRef = useRef(false);

  useEffect(() => {
    const STAND_CODES = new Set([
      'KeyW', 'KeyA', 'KeyS', 'KeyD',
      'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
    ]);
    const onKeyDown = (event) => {
      if (event.code === 'KeyF') toggleRef.current = true;
      else if (STAND_CODES.has(event.code)) standRef.current = true;
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useFrame(() => {
    const body = controllerRef.current?.group;
    const state = sitStateRef.current;
    const toggle = toggleRef.current;
    const stand = standRef.current;
    toggleRef.current = false;
    standRef.current = false;
    if (!body || !state) return;

    const position = body.translation();
    const pinY = BENCH_SEAT.top + BODY_CENTER_AT_REST + 0.02;

    if (!state.sitting) {
      const near = Math.hypot(position.x - BENCH_SEAT.x, position.z - BENCH_SEAT.z) < BENCH_SEAT.radius
        && Math.abs(position.y - pinY) < 2.5;
      document.body.dataset.benchSitAvailable = String(near);
      document.body.dataset.benchSitDistance = [
        Math.hypot(position.x - BENCH_SEAT.x, position.z - BENCH_SEAT.z).toFixed(2),
        position.x.toFixed(2), position.y.toFixed(2), position.z.toFixed(2),
      ].join(',');
      if (near && toggle) {
        state.sitting = true;
        state.seatYaw = BENCH_SEAT.yaw;
        body.setTranslation({ x: BENCH_SEAT.x, y: pinY, z: BENCH_SEAT.z }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        document.body.dataset.benchSitting = 'true';
      }
      return;
    }

    if (toggle || stand) {
      state.sitting = false;
      document.body.dataset.benchSitting = 'false';
      // Dismount beside the bench, not standing on the tabletop.
      body.setTranslation({ x: BENCH_SEAT.standX, y: BENCH_SEAT.standY, z: BENCH_SEAT.standZ }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    body.setTranslation({ x: BENCH_SEAT.x, y: pinY, z: BENCH_SEAT.z }, true);
    body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  });

  return null;
}

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

function FishSchool() {
  const fishRefs = useRef([]);

  useFrame(({ clock }) => {
    const time = clock.elapsedTime;
    FISH_PATHS.forEach((path, index) => {
      const fish = fishRefs.current[index];
      if (!fish) return;
      const angle = (time * path.speed + path.phase) * path.direction;
      const x = path.centerX + Math.cos(angle) * path.radiusX;
      const z = path.centerZ + Math.sin(angle) * path.radiusZ;
      const y = path.depth + Math.sin(time * 1.3 + path.phase) * 0.05;
      fish.position.set(x, y, z);
      // Heading along the ellipse tangent plus a tail-wag yaw wiggle.
      const tangentX = -Math.sin(angle) * path.radiusX * path.direction;
      const tangentZ = Math.cos(angle) * path.radiusZ * path.direction;
      fish.rotation.y = Math.atan2(tangentX, tangentZ) +
        Math.sin(time * 7 + path.phase) * 0.14;
    });
  });

  return (
    <>
      {FISH_PATHS.map((path, index) => (
        <group
          key={`fish-${index}`}
          ref={(node) => { fishRefs.current[index] = node; }}
          scale={path.scale}
        >
          <mesh material={toonMaterial(path.variant.body)} castShadow receiveShadow>
            <sphereGeometry args={[0.11, 10, 8]} />
          </mesh>
          <mesh position={[0, 0, -0.13]} material={toonMaterial(path.variant.tail)} rotation={[Math.PI / 2, 0, 0]} castShadow receiveShadow>
            <coneGeometry args={[0.055, 0.14, 6]} />
          </mesh>
          <mesh position={[0, 0.055, 0.02]} material={toonMaterial(path.variant.tail)} rotation={[Math.PI * 0.42, 0, 0]} castShadow receiveShadow>
            <coneGeometry args={[0.03, 0.09, 5]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

// Physics terrain sampled from the same seaBedHeight() function that builds
// the visual seabed, so the character walks dunes and wades slopes with no
// visual/physics mismatch.
function SeaBedCollider() {
  const [vertices, indices] = useMemo(() => {
    const size = 200;
    const segments = 200;
    const verts = new Float32Array((segments + 1) * (segments + 1) * 3);
    let write = 0;
    for (let i = 0; i <= segments; i += 1) {
      for (let j = 0; j <= segments; j += 1) {
        const x = (j / segments - 0.5) * size;
        const z = (i / segments - 0.5) * size + 6;
        verts[write] = x;
        verts[write + 1] = seaBedHeight(x, z);
        verts[write + 2] = z;
        write += 3;
      }
    }
    const idx = [];
    for (let i = 0; i < segments; i += 1) {
      for (let j = 0; j < segments; j += 1) {
        const a = i * (segments + 1) + j;
        const b = a + 1;
        const c = a + segments + 1;
        const d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    return [verts, new Uint32Array(idx)];
  }, []);

  return (
    <RigidBody type="fixed" colliders={false}>
      <TrimeshCollider args={[vertices, indices]} friction={0.7} />
    </RigidBody>
  );
}

function DistantIsland({ assetId, envPreset, inspector, x, z, scale = 1, mirror = false }) {
  const flip = mirror ? -1 : 1;
  const dress = useMemo(() => {
    const place = (offsetX, offsetZ) => {
      const worldX = x + offsetX * flip * scale;
      const worldZ = z + offsetZ * scale;
      return [worldX, seaBedHeight(worldX, worldZ) - 0.12, worldZ];
    };
    return {
      rock: place(1.7, -0.6),
      treeA: place(-0.9, 0.2),
      treeB: place(0.6, 0.75),
    };
  }, [flip, scale, x, z]);

  return (
    <group>
      <OfficialCatalogRock
        assetId={assetId}
        inspector={inspector}
        position={dress.rock}
        rotation={mirror ? -0.7 : 0.45}
        scale={[1.15 * scale, 0.9 * scale, 1.0 * scale]}
      />
      <WaterBroadleafTree
        canopyColor={mirror
          ? WALKABLE_CALL_ME_SENSEI_TREE_COLORS.olive
          : WALKABLE_CALL_ME_SENSEI_TREE_COLORS.deep}
        envPreset={envPreset}
        position={dress.treeA}
        presetId="species_oak_small"
        leafShape="round"
        seedOffset={Math.round(scale * 10)}
        sizeScale={scale}
        windSpeedScale={0.85}
        windStrengthScale={0.9}
      />
      <WaterBroadleafTree
        canopyColor={mirror
          ? WALKABLE_CALL_ME_SENSEI_TREE_COLORS.spring
          : WALKABLE_CALL_ME_SENSEI_TREE_COLORS.meadow}
        envPreset={envPreset}
        position={dress.treeB}
        rotation={2.1}
        presetId="species_aspen"
        leafShape="gingko"
        seedOffset={Math.round(scale * 13)}
        sizeScale={scale}
        windSpeedScale={1.15}
        windStrengthScale={0.8}
      />
    </group>
  );
}

function SeaStage({ envPreset, inspector }) {
  const ground = useMemo(() => {
    const mesh = createGroundShaderMesh({
      geometry: createSeaBedGeometry(),
      field: createSeaBedGroundField(),
      layers: [
        { texture: GRASSY_LAND_TEXTURE },
        { texture: LAND_TEXTURE },
        { texture: ROCK_TEXTURE },
        { texture: SAND_TEXTURE },
      ],
      name: 'Walkable Sample · Ground Shader Terrain',
      settings: CALL_ME_SENSEI_SETTINGS.groundShader,
    });
    mesh.position.set(0, 0, SEA_BED_CENTER_Z);
    return mesh;
  }, []);

  useEffect(() => {
    const environment = WATER_ENVIRONMENT_PRESETS[envPreset] ?? WATER_ENVIRONMENT_PRESETS.noon;
    const skyColor = new THREE.Color().setRGB(...environment.sky.horizonColor);
    setGroundShaderSceneState(ground, {
      skyColor,
      sunColor: new THREE.Color(environment.lights.sun.color),
      sunDirection: environment.sky.sunDirection,
      // This sample deliberately keeps the bank dry; water owns shoreline
      // foam and the Ground Shader still owns every terrain pixel.
      waterLevel: -10000,
      wetness: 0,
    });
    document.body.dataset.groundShader = 'call_me_sensei';
    document.body.dataset.groundShaderDomain = 'terrain.ground';
  }, [envPreset, ground]);

  useEffect(() => () => {
    ground.geometry.dispose();
    disposeGroundShaderMaterial(ground.material);
  }, [ground]);

  return (
    <group>
      <primitive object={ground} />
      <FishSchool />
      {/* Beach dressing behind the shoreline. */}
      <WaterBroadleafTree
        canopyColor={WALKABLE_CALL_ME_SENSEI_TREE_COLORS.meadow}
        envPreset={envPreset}
        position={[6.8, seaBedHeight(6.8, -4.4) - 0.1, -4.4]}
        presetId="example_branching"
        leafShape="teardrop"
        seedOffset={3}
        windSpeedScale={0.9}
        windStrengthScale={0.95}
      />
      <WaterBroadleafTree
        canopyColor={WALKABLE_CALL_ME_SENSEI_TREE_COLORS.deep}
        envPreset={envPreset}
        position={[-7.4, seaBedHeight(-7.4, -5.4) - 0.1, -5.4]}
        rotation={1.4}
        presetId="species_ash"
        leafShape="round"
        seedOffset={11}
        windSpeedScale={1.12}
        windStrengthScale={1.05}
      />
      <WaterBroadleafTree
        canopyColor={WALKABLE_CALL_ME_SENSEI_TREE_COLORS.amber}
        envPreset={envPreset}
        position={[10.6, seaBedHeight(10.6, -7.8) - 0.1, -7.8]}
        rotation={2.6}
        presetId="species_oak_large"
        leafShape="maple"
        seedOffset={17}
        windSpeedScale={0.76}
        windStrengthScale={1.22}
      />
      <WaterBroadleafTree
        canopyColor={WALKABLE_CALL_ME_SENSEI_TREE_COLORS.olive}
        envPreset={envPreset}
        position={[-12.2, seaBedHeight(-12.2, -9.0) - 0.1, -9.0]}
        rotation={4.1}
        presetId="species_aspen"
        leafShape="gingko"
        seedOffset={23}
        windSpeedScale={1.32}
        windStrengthScale={0.72}
      />
      <OfficialCatalogRock
        assetId="rock-0398"
        collidable
        position={[13.8, seaBedHeight(13.8, -11.2) + 0.02, -11.2]}
        rotation={0.55}
        scale={[0.34, 0.28, 0.32]}
        inspector={inspector}
      />
      <OfficialCatalogRock
        assetId="rock-0084"
        collidable
        position={RIM_ROCK_A_POSITION}
        rotation={0.35}
        scale={[0.74, 0.58, 0.66]}
        inspector={inspector}
      />
      <OfficialCatalogRock
        assetId="rock-0092"
        collidable
        position={RIM_ROCK_B_POSITION}
        rotation={-0.62}
        scale={[0.92, 0.78, 0.86]}
        inspector={inspector}
      />
      {/* Mid-distance islands: reflection and scale reference on the water. */}
      <DistantIsland assetId="rock-0182" envPreset={envPreset} inspector={inspector} x={-15} z={26} scale={1.15} />
      <DistantIsland assetId="rock-0198" envPreset={envPreset} inspector={inspector} x={16} z={32} scale={1.45} mirror />
      <DistantIsland assetId="rock-0206" envPreset={envPreset} inspector={inspector} x={-7} z={44} scale={2.0} />
    </group>
  );
}

// --- Rain, kelp, and underwater atmosphere -----------------------------------

export {
  formatWaterValue,
  WaterHud,
  WalkableSampleHud,
  WaterSurfaceView,
  WaterBall,
  ToonLabSkyView,
  HorizonSilhouettes,
  SeaRocks,
  ManufacturedProp,
  BENCH_SEAT,
  ManufacturedProps,
  BenchSitController,
  FishSchool,
  SeaBedCollider,
  DistantIsland,
  SeaStage,
  RainView,
  KelpField,
  UnderwaterAtmosphere,
};
