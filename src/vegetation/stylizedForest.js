import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyVegetationShader } from './vegetationShaders.js';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  clamp, dot, exp, length, max, mix, positionView, positionWorld, smoothstep, texture, uniform,
  vec3, vec4, vertexColor,
} from 'three/tsl';

import { StylizedTree } from './stylizedTree.js';
import { disposeExportGroup, prepareTreeForExport } from './treeExport.js';
import {
  projectedTreeScreenCoverage,
  TREE_RUNTIME_QUALITY_PROFILES,
} from './compiledTree.js';
import {
  attachFactoryStyleTarget,
  markFactoryStyleMaterial,
} from '../styles/styleMetadata.js';

export const STYLIZED_FOREST_IMPOSTOR_QUALITY = Object.freeze({
  colorFloor: Object.freeze([0.16, 0.3, 0.14]),
  maxTrianglesPerTree: 140,
  microdetail: 'volumetric-crown',
  representation: 'instanced-low-poly',
});

const FOREST_STYLE_MATERIAL_ID = 'ForestSurface';
const FOREST_STYLE_EXEMPTION_ID = 'ForestAggregateAdapter';

function markForestMaterial(material) {
  return markFactoryStyleMaterial(material, FOREST_STYLE_MATERIAL_ID);
}

function attachForestStyleTarget(root, styleTarget = {}) {
  attachFactoryStyleTarget(root, 'vegetation.tree', {
    targetId: 'toonlab/forest',
    ...styleTarget,
    materials: {
      assignments: {
        [FOREST_STYLE_MATERIAL_ID]: {
          exemptionId: FOREST_STYLE_EXEMPTION_ID,
          roles: ['foliageCard', 'woodySurface'],
        },
      },
      exemptions: {
        [FOREST_STYLE_EXEMPTION_ID]: {
          adapterId: 'toonlab/stylized-forest',
          approved: true,
          reason: 'The forest owns shared near/far materials and applies tree style atomically across its LOD pool.',
          strategy: 'custom-adapter',
        },
      },
      ...(styleTarget.materials ?? {}),
    },
  });
}

function averageGeometryColor(geometry, materialColor = new THREE.Color(0xffffff)) {
  const colors = geometry?.attributes?.color;
  const average = new THREE.Color(1, 1, 1);
  if (colors?.count) {
    average.setRGB(0, 0, 0);
    // Sampling is sufficient here: the value is a broad LOD tone, not data
    // used for geometry or simulation.
    const stride = Math.max(1, Math.floor(colors.count / 4096));
    let samples = 0;
    for (let index = 0; index < colors.count; index += stride) {
      average.r += colors.getX(index);
      average.g += colors.getY(index);
      average.b += colors.getZ(index);
      samples += 1;
    }
    average.multiplyScalar(1 / Math.max(samples, 1));
  }
  return average.multiply(materialColor);
}

function stableVariant(seed, index, count) {
  let value = ((Number(seed) >>> 0) ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d) >>> 0;
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b) >>> 0;
  return ((value ^ (value >>> 16)) >>> 0) % count;
}

function setFlatGeometryColor(geometry, color, tone = 1) {
  const positions = geometry.attributes.position;
  const normals = geometry.attributes.normal;
  const colors = new Float32Array(positions.count * 3);
  for (let index = 0; index < positions.count; index += 1) {
    // One broad top/side value shift gives the proxy volume without bringing
    // back the near foliage's high-frequency per-card lighting.
    const ny = normals ? normals.getY(index) : 0;
    const nx = normals ? normals.getX(index) : 0;
    const light = THREE.MathUtils.clamp(tone * (0.9 + ny * 0.1 + nx * 0.025), 0.78, 1.08);
    colors[index * 3] = THREE.MathUtils.clamp(color.r * light, 0, 1);
    colors[index * 3 + 1] = THREE.MathUtils.clamp(color.g * light, 0, 1);
    colors[index * 3 + 2] = THREE.MathUtils.clamp(color.b * light, 0, 1);
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function installInstancedTreeDither(material, mode, materialSet) {
  const frame = { value: 0 };
  material.userData.treeDitherMode = mode;
  material.userData.treeDitherFrameUniform = frame;
  material.alphaHash = true;
  material.transparent = false;
  const previous = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    previous?.(shader, renderer);
    shader.uniforms.uTreeDitherFrame = frame;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float treeLodFade;\nvarying float vTreeLodFade;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvTreeLodFade = treeLodFade;');
    const threshold = mode === 'temporal'
      ? 'fract(dot(floor(gl_FragCoord.xy), vec2(0.754877666, 0.569840296)) + uTreeDitherFrame * 0.618033989)'
      : 'fract(dot(mod(floor(gl_FragCoord.xy), 4.0), vec2(0.754877666, 0.569840296)))';
    shader.fragmentShader = `uniform float uTreeDitherFrame;\nvarying float vTreeLodFade;\n${shader.fragmentShader}`
      .replace(
        '#include <alphatest_fragment>',
        `#include <alphatest_fragment>\nif (vTreeLodFade < ${threshold}) discard;`,
      );
  };
  material.customProgramCacheKey = () => `toonlab-instanced-tree-dither:${mode}`;
  material.needsUpdate = true;
  materialSet.add(material);
  return material;
}

function asNonIndexed(geometry) {
  if (!geometry.index) return geometry;
  const expanded = geometry.toNonIndexed();
  geometry.dispose();
  return expanded;
}

// A far tree is real low-poly volume, not a screen-facing painting. Five
// overlapping icosahedral crown masses preserve a tree silhouette from ground,
// flyover, and top-down cameras. The far proxy deliberately omits its trunk:
// once a tree is small enough for this LOD, a trunk collapses into the dirty
// one-pixel black/pale ticks that ruin aerial forests. Near live trees retain
// their warm trunks and the contact pool anchors the distant crown mass.
// The whole proxy merges to one instanced draw per variant.
function createVolumetricTreeProxy(baked, variant) {
  const foliage = baked.children.find((child) => child.name === 'Foliage');
  const foliageBounds = foliage
    ? new THREE.Box3().setFromObject(foliage)
    : new THREE.Box3().setFromObject(baked);
  const extent = foliageBounds.getSize(new THREE.Vector3());
  const center = foliageBounds.getCenter(new THREE.Vector3());
  const crown = averageGeometryColor(foliage?.geometry, foliage?.material?.color);
  const parts = [];
  const lobes = [
    [0, 0.58, 0, 0.43, 0.35, 0.41, 0.98],
    [-0.27, 0.55, 0.05, 0.3, 0.27, 0.3, 0.94],
    [0.27, 0.57, -0.06, 0.3, 0.28, 0.3, 1.04],
    [-0.04, 0.8, -0.08, 0.27, 0.24, 0.27, 1.07],
    [0.02, 0.38, 0.02, 0.36, 0.3, 0.36, 0.9],
  ];
  for (let index = 0; index < lobes.length; index += 1) {
    const [x, y, z, sx, sy, sz, tone] = lobes[index];
    let geometry = new THREE.IcosahedronGeometry(1, 0);
    geometry.rotateY((variant * 1.37 + index * 0.91) % Math.PI);
    geometry.rotateZ(((variant + index * 3) % 7 - 3) * 0.035);
    geometry.scale(
      Math.max(extent.x * sx, 0.2),
      Math.max(extent.y * sy, 0.2),
      Math.max(extent.z * sz, 0.2),
    );
    geometry.translate(
      center.x + extent.x * x,
      foliageBounds.min.y + extent.y * y,
      center.z + extent.z * z,
    );
    geometry.computeVertexNormals();
    geometry = asNonIndexed(geometry);
    setFlatGeometryColor(geometry, crown, tone);
    parts.push(geometry);
  }

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) throw new Error('StylizedForest could not build the far-tree proxy.');
  merged.computeBoundingSphere();
  merged.userData.lodRepresentation = STYLIZED_FOREST_IMPOSTOR_QUALITY.representation;
  merged.userData.trianglesPerTree = merged.attributes.position.count / 3;
  return merged;
}

// LOD forest. Import from '@call-me-sensei/toonlab/vegetation'.
//
// A real stylized world needs thousands of trees, but a full StylizedTree
// (live foliage shader, wind, per-puff cards) is a near-field asset. The
// forest splits the work the way anime open worlds do:
//
//  - FAR (default, pass `renderer`): every placement renders as one instanced
//    low-poly volumetric crown proxy. It stays tree-shaped from
//    ground, flyover, and top-down cameras without texture noise or cap blobs.
//    The proxy is <= 140 triangles/tree instead of the ~12k-vertex export.
//  - FAR (no renderer): legacy merged-geometry instancing — correct but
//    expensive; only for hosts that cannot hand the forest a renderer.
//  - NEAR: a budgeted pool of live detailed trees (mesh clones of the
//    variants, animated wind through shared materials) swaps in around the
//    camera; the matching far instances collapse to zero scale.
//
// Reassignment runs on an interval, not per frame, and is hysteresis-free by
// budget: the `detailCount` nearest placements inside `detailDistance` win.
//
//   const forest = new StylizedForest({
//     placements: scatterForest({ ... }),      // [{ x, y, z, seed }]
//     preset: 'call_me_sensei',
//     settings: { tree: { size: 3.2 } },
//     variants: 8,
//   });
//   scene.add(forest);
//   forest.update(delta, camera);              // per frame
export class StylizedForest extends THREE.Group {
  constructor({
    placements = [],
    preset = null,
    settings = {},
    canopyColors = null,        // optional color-spec list; variant i picks canopyColors[i % length]
    variants = 8,
    detailDistance = 150,
    detailCount = 110,
    updateInterval = 0.3,
    castShadow = true,          // near live clones cast; anchors the forest to the ground
    renderer = null,            // enables the bounded volumetric far proxy (strongly recommended)
    vegetationShader = null,
    compiledAssets = null,      // loaded CompiledTreeAsset[]; enables four-level instanced runtime
    quality = 'high',
    styleTarget = {},
  } = {}) {
    super();
    this.name = 'StylizedForest';
    if (Array.isArray(compiledAssets) && compiledAssets.length) {
      this._initCompiledForest({
        assets: compiledAssets,
        castShadow,
        detailCount,
        placements,
        quality,
        updateInterval,
      });
      attachForestStyleTarget(this, styleTarget);
      return;
    }
    this.detailDistance = detailDistance;
    this.detailCount = detailCount;
    this.updateInterval = updateInterval;
    this.hasBakedImpostors = Boolean(renderer);
    this._timer = updateInterval; // force an assignment on the first update

    const variantCount = Math.max(1, Math.min(variants, Math.max(placements.length, 1)));

    // Unique silhouettes. The variant trees never enter the scene directly —
    // they are geometry/material sources, and their update() drives the wind
    // uniforms shared by every near clone.
    this.variantTrees = [];
    this._bakedVariants = [];
    for (let i = 0; i < variantCount; i += 1) {
      const seed = placements[i]?.seed ?? i * 7919 + 1;
      // Shallow-merge (settings may hold textures/THREE objects that don't
      // survive structuredClone); only the tree group is overridden.
      const variantSettings = { ...settings, tree: { ...settings?.tree } };
      if (Array.isArray(canopyColors) && canopyColors.length > 0) {
        variantSettings.tree.canopyColor = canopyColors[i % canopyColors.length];
      }
      const tree = new StylizedTree({ preset, seed, ...variantSettings, vegetationShader });
      tree.traverse((object) => {
        const materials = Array.isArray(object.material)
          ? object.material
          : object.material
            ? [object.material]
            : [];
        materials.forEach(markForestMaterial);
      });
      this.variantTrees.push(tree);
      this._bakedVariants.push(prepareTreeForExport(tree));
    }

    // Per-placement bookkeeping + far instancing (one draw per variant).
    this._placements = placements.map((p, index) => ({
      detailed: null,
      index,
      matrix: null,
      seed: p.seed ?? index,
      // Scatter seeds can have spatially correlated low bits. Hash before
      // choosing a palette/silhouette variant so accent colors do not form
      // giant contiguous bands in the distance.
      variant: stableVariant(p.seed ?? index, index, variantCount),
      x: p.x, y: p.y, z: p.z,
    }));
    const perVariant = Array.from({ length: variantCount }, () => []);
    for (const entry of this._placements) perVariant[entry.variant].push(entry);

    this._instanced = [];
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    const compose = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    // Far-proxy materials are unlit (MeshBasic): broad lighting is encoded
    // into the proxy's vertex colors, and unlit flat color is exactly how
    // distant anime trees should read — no scene-light dependency, no
    // near-black shadow sides.
    //
    // They also carry the environment shader's height fog (same formula,
    // shared uniforms — see setDistanceFog). scene.fog alone is the linear
    // layer; at 700 m+ the terrain is mostly height-fog haze while a
    // scene.fog-only proxy is still ~20% fogged, so far canopies float
    // on the mountains as saturated dots. Density 0 disables the layer.
    this._fogUniforms = {
      color: uniform(new THREE.Color(0.66, 0.8, 0.94)),
      density: uniform(0),
      falloff: uniform(400),
      floorY: uniform(0),
    };
    const fogU = this._fogUniforms;
    const impostorMaterial = (source) => {
      const material = new MeshBasicNodeMaterial({
        alphaTest: source.alphaTest ?? 0,
        fog: true,
        name: `${source.name ?? 'Impostor'}Unlit`,
        side: source.side ?? THREE.FrontSide,
      });
      let rgba = vec4(uniform(source.color?.clone() ?? new THREE.Color(0xffffff)), 1.0);
      if (source.map) rgba = rgba.mul(texture(source.map));
      if (source.vertexColors) rgba = rgba.mul(vec4(vertexColor().rgb, 1.0));
      // Never let tiny shaded leaf clusters turn cyan-black after the bake.
      // A dark green floor preserves the canopy identity through minification.
      const luminance = dot(rgba.rgb, vec3(0.299, 0.587, 0.114));
      const liftedRgb = mix(
        vec3(...STYLIZED_FOREST_IMPOSTOR_QUALITY.colorFloor),
        rgba.rgb,
        smoothstep(0.035, 0.26, luminance),
      );
      // Mirror of environment.js world-height fog: dense near the world
      // floor, thinning with altitude, exponential in view distance.
      const heightFalloff = exp(
        max(positionWorld.y.sub(fogU.floorY), 0.0).div(max(fogU.falloff, 0.001)).negate(),
      );
      const depthTerm = exp(length(positionView).mul(fogU.density).negate()).oneMinus();
      material.colorNode = vec4(
        mix(liftedRgb, fogU.color, clamp(depthTerm.mul(heightFalloff), 0.0, 1.0)),
        rgba.a,
      );
      return markForestMaterial(material);
    };
    this._impostorMaterials = new Map();
    for (let v = 0; v < variantCount; v += 1) {
      const entries = perVariant[v];
      const meshes = [];
      if (renderer) {
        const geometry = createVolumetricTreeProxy(this._bakedVariants[v], v);
        const instanced = new THREE.InstancedMesh(
          geometry,
          impostorMaterial({
            name: 'TreeVolumeProxy',
            side: THREE.FrontSide,
            vertexColors: true,
          }),
          Math.max(entries.length, 1),
        );
        instanced.castShadow = false;
        instanced.receiveShadow = false;
        instanced.frustumCulled = false; // instances span the whole map
        this.add(instanced);
        meshes.push(instanced);
      } else {
        for (const source of this._bakedVariants[v].children) {
          let material = this._impostorMaterials.get(source.material);
          if (!material) {
            material = impostorMaterial(source.material);
            this._impostorMaterials.set(source.material, material);
          }
          const instanced = new THREE.InstancedMesh(source.geometry, material, Math.max(entries.length, 1));
          instanced.castShadow = castShadow;
          instanced.receiveShadow = false;
          instanced.frustumCulled = false; // instances span the whole map
          this.add(instanced);
          meshes.push(instanced);
        }
      }
      entries.forEach((entry, slot) => {
        entry.instanceSlot = slot;
        entry.meshes = meshes;
        quaternion.setFromAxisAngle(up, ((entry.seed >>> 4) % 628) / 100);
        const jitter = 0.9 + (((entry.seed >>> 12) % 21) / 100);
        compose.compose(
          new THREE.Vector3(entry.x, entry.y, entry.z),
          quaternion,
          new THREE.Vector3(jitter, jitter, jitter),
        );
        entry.matrix = compose.clone();
        for (const mesh of meshes) mesh.setMatrixAt(slot, entry.matrix);
      });
      for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
      this._instanced.push(meshes);
    }
    this._zeroMatrix = zero;
    if (renderer) {
      // The merged export geometry only existed to derive proxy bounds/colors.
      for (const baked of this._bakedVariants) disposeExportGroup(baked);
      this._bakedVariants = [];
    }

    // Near pool: lazily-built clone groups, recycled between placements.
    this._pool = [];
    this._detailed = new Set();
    attachForestStyleTarget(this, styleTarget);
  }

  _initCompiledForest({ assets, castShadow, detailCount, placements, quality, updateInterval }) {
    const profile = TREE_RUNTIME_QUALITY_PROFILES[quality] ?? TREE_RUNTIME_QUALITY_PROFILES.high;
    const activeAssets = assets.slice(0, Math.max(1, profile.variants));
    this._compiledMode = true;
    this.detailCount = Math.min(Math.max(0, detailCount), profile.detailedCount);
    this.updateInterval = updateInterval;
    this._timer = updateInterval;
    this.variantTrees = [];
    this._bakedVariants = [];
    this._pool = [];
    this._detailed = new Set();
    this._instanced = [];
    this._compiledTransitions = new Set();
    this._compiledDitherMaterials = new Set();
    this._compiledDitherFrame = 0;
    this._compiledTransitionSeconds = 0.18;
    this._compiledHysteresis = 0.1;
    this._impostorMaterials = new Map();
    this._fogUniforms = null;
    this.hasBakedImpostors = true;
    const cappedPlacements = placements.slice(0, profile.maxPlacements);
    this._placements = cappedPlacements.map((placement, index) => ({
      index,
      seed: placement.seed ?? index,
      variant: stableVariant(placement.seed ?? index, index, activeAssets.length),
      x: placement.x,
      y: placement.y,
      z: placement.z,
      currentLod: 3,
      matrix: null,
      lodMeshes: [],
    }));
    const byVariant = Array.from({ length: activeAssets.length }, () => []);
    this._placements.forEach((entry) => byVariant[entry.variant].push(entry));
    const up = new THREE.Vector3(0, 1, 0);
    const quaternion = new THREE.Quaternion();
    const compose = new THREE.Matrix4();
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    this._zeroMatrix = zero;

    activeAssets.forEach((asset, variant) => {
      const entries = byVariant[variant];
      if (!entries.length) return;
      const variantBatches = asset.levels.map((levelRoot, lod) => {
        const sources = [];
        levelRoot.traverse((object) => { if (object.isMesh) sources.push(object); });
        return sources.map((source) => {
          const geometry = source.geometry.clone();
          geometry.setAttribute(
            'treeLodFade',
            new THREE.InstancedBufferAttribute(new Float32Array(Math.max(entries.length, 1)), 1),
          );
          const material = installInstancedTreeDither(
            source.material.clone(),
            asset.ditherMode ?? 'bayer',
            this._compiledDitherMaterials,
          );
          markForestMaterial(material);
          const mesh = new THREE.InstancedMesh(
            geometry,
            material,
            Math.max(entries.length, 1),
          );
          mesh.name = `${asset.manifest.catalogId}:LOD${lod}:${source.name || 'mesh'}`;
          mesh.castShadow = Boolean(castShadow && lod <= 1);
          mesh.receiveShadow = false;
          mesh.frustumCulled = false;
          mesh.customDepthMaterial = installInstancedTreeDither(new THREE.MeshDepthMaterial({
            alphaMap: material.alphaMap ?? null,
            alphaTest: material.alphaTest ?? 0,
            depthPacking: THREE.RGBADepthPacking,
            map: material.map ?? null,
            side: material.side,
          }), asset.ditherMode ?? 'bayer', this._compiledDitherMaterials);
          mesh.customDistanceMaterial = installInstancedTreeDither(new THREE.MeshDistanceMaterial({
            alphaMap: material.alphaMap ?? null,
            alphaTest: material.alphaTest ?? 0,
            map: material.map ?? null,
            side: material.side,
          }), asset.ditherMode ?? 'bayer', this._compiledDitherMaterials);
          this.add(mesh);
          return mesh;
        });
      });
      entries.forEach((entry, slot) => {
        entry.instanceSlot = slot;
        entry.asset = asset;
        entry.lodMeshes = variantBatches;
        quaternion.setFromAxisAngle(up, ((entry.seed >>> 4) % 628) / 100);
        const jitter = 0.9 + (((entry.seed >>> 12) % 21) / 100);
        compose.compose(
          new THREE.Vector3(entry.x, entry.y, entry.z),
          quaternion,
          new THREE.Vector3(jitter, jitter, jitter),
        );
        entry.matrix = compose.clone();
        variantBatches.forEach((meshes, lod) => {
          for (const mesh of meshes) {
            mesh.setMatrixAt(slot, lod === 3 ? entry.matrix : zero);
            const fade = mesh.geometry.getAttribute('treeLodFade');
            fade.setX(slot, lod === 3 ? 1 : 0);
            fade.needsUpdate = true;
          }
        });
      });
      variantBatches.flat().forEach((mesh) => { mesh.instanceMatrix.needsUpdate = true; });
      this._instanced.push(...variantBatches);
    });
  }

  _assignCompiled(camera) {
    const focus = camera.getWorldPosition(new THREE.Vector3());
    const ranked = this._placements.map((entry) => {
      const dx = entry.x - focus.x;
      const dy = entry.y - focus.y;
      const dz = entry.z - focus.z;
      return [dx * dx + dy * dy + dz * dz, entry];
    }).sort((a, b) => a[0] - b[0]);
    const detailed = new Set(ranked.slice(0, this.detailCount).map(([, entry]) => entry));
    const center = new THREE.Vector3();
    for (const [, entry] of ranked) {
      center.set(...entry.asset.manifest.bounds.center).add(
        new THREE.Vector3(entry.x, entry.y, entry.z));
      const coverage = projectedTreeScreenCoverage(
        camera,
        center,
        entry.asset.manifest.bounds.radius,
      );
      let nextLod = entry.asset.manifest.lods.find(
        (lod) => coverage >= lod.minScreenCoverage,
      )?.level ?? 3;
      if (nextLod === 0 && !detailed.has(entry)) nextLod = 1;
      if (entry.transitionTo !== undefined) continue;
      if (nextLod > entry.currentLod) {
        const threshold = entry.asset.manifest.lods[entry.currentLod].minScreenCoverage;
        if (coverage > threshold * (1 - this._compiledHysteresis)) nextLod = entry.currentLod;
      } else if (nextLod < entry.currentLod) {
        const threshold = entry.asset.manifest.lods[nextLod].minScreenCoverage;
        if (coverage < threshold * (1 + this._compiledHysteresis)) nextLod = entry.currentLod;
      }
      if (nextLod === entry.currentLod) continue;
      for (const mesh of entry.lodMeshes[nextLod]) {
        mesh.setMatrixAt(entry.instanceSlot, entry.matrix);
        mesh.instanceMatrix.needsUpdate = true;
        const fade = mesh.geometry.getAttribute('treeLodFade');
        fade.setX(entry.instanceSlot, 0);
        fade.needsUpdate = true;
      }
      entry.transitionFrom = entry.currentLod;
      entry.transitionTo = nextLod;
      entry.transitionElapsed = 0;
      this._compiledTransitions.add(entry);
    }
  }

  _advanceCompiledTransitions(delta) {
    this._compiledDitherFrame += 1;
    for (const material of this._compiledDitherMaterials) {
      if (material.userData.treeDitherMode === 'temporal') {
        material.userData.treeDitherFrameUniform.value = this._compiledDitherFrame;
      }
    }
    for (const entry of this._compiledTransitions) {
      entry.transitionElapsed += Math.max(Number(delta) || 0, 0);
      const progress = Math.min(1, entry.transitionElapsed / this._compiledTransitionSeconds);
      for (const mesh of entry.lodMeshes[entry.transitionFrom]) {
        const fade = mesh.geometry.getAttribute('treeLodFade');
        fade.setX(entry.instanceSlot, 1 - progress);
        fade.needsUpdate = true;
      }
      for (const mesh of entry.lodMeshes[entry.transitionTo]) {
        const fade = mesh.geometry.getAttribute('treeLodFade');
        fade.setX(entry.instanceSlot, progress);
        fade.needsUpdate = true;
      }
      if (progress < 1) continue;
      for (const mesh of entry.lodMeshes[entry.transitionFrom]) {
        mesh.setMatrixAt(entry.instanceSlot, this._zeroMatrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
      entry.currentLod = entry.transitionTo;
      delete entry.transitionFrom;
      delete entry.transitionTo;
      delete entry.transitionElapsed;
      this._compiledTransitions.delete(entry);
    }
  }

  _acquireClone(variant) {
    const idle = this._pool.find((entry) => entry.placement === null && entry.variant === variant);
    if (idle) return idle;
    const source = this.variantTrees[variant];
    const group = new THREE.Group();
    for (const child of source.children) {
      const clone = child.clone();
      // Mesh.clone() drops customDepthMaterial — without it the canopy
      // casts no shadow on the WebGL fallback path.
      if (child.customDepthMaterial) clone.customDepthMaterial = child.customDepthMaterial;
      group.add(clone);
    }
    const entry = { group, placement: null, variant };
    this._pool.push(entry);
    this.add(group);
    return entry;
  }

  /** Reassign near/far LOD around a world-space point (usually the camera). */
  _assign(focus) {
    const nearSq = this.detailDistance * this.detailDistance;
    const candidates = [];
    for (const entry of this._placements) {
      const dx = entry.x - focus.x;
      // True 3D distance: a top-down or flyover camera hundreds of meters up
      // is NOT near the trees under it — horizontal-only distance promotes
      // them to saturated live clones that pop against the fogged far proxies.
      const dy = entry.y - focus.y;
      const dz = entry.z - focus.z;
      const distanceSq = dx * dx + dy * dy + dz * dz;
      if (distanceSq <= nearSq) candidates.push([distanceSq, entry]);
    }
    candidates.sort((a, b) => a[0] - b[0]);
    const next = new Set(candidates.slice(0, this.detailCount).map(([, entry]) => entry));

    for (const entry of this._detailed) {
      if (next.has(entry)) continue;
      // demote: restore far instance, release the clone
      for (const mesh of entry.meshes) {
        mesh.setMatrixAt(entry.instanceSlot, entry.matrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
      entry.detailed.placement = null;
      entry.detailed.group.visible = false;
      entry.detailed = null;
    }
    for (const entry of next) {
      if (entry.detailed) continue;
      // promote: hide far instance, place a live clone
      const clone = this._acquireClone(entry.variant);
      clone.placement = entry;
      clone.group.visible = true;
      clone.group.position.set(entry.x, entry.y, entry.z);
      clone.group.rotation.y = ((entry.seed >>> 4) % 628) / 100;
      const jitter = 0.9 + (((entry.seed >>> 12) % 21) / 100);
      clone.group.scale.setScalar(jitter);
      entry.detailed = clone;
      for (const mesh of entry.meshes) {
        mesh.setMatrixAt(entry.instanceSlot, this._zeroMatrix);
        mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this._detailed = next;
  }

  /**
   * Per frame. Ticks wind on the variant materials (shared by every near
   * clone) and periodically re-picks which trees deserve full detail.
   */
  update(delta, camera) {
    if (this._compiledMode) {
      this._advanceCompiledTransitions(delta);
      this._timer += delta;
      if (camera && this._timer >= this.updateInterval) {
        this._timer = 0;
        this._assignCompiled(camera);
      }
      return;
    }
    for (const tree of this.variantTrees) tree.update(delta);
    this._timer += delta;
    if (camera && this._timer >= this.updateInterval) {
      this._timer = 0;
      this._assign(camera.getWorldPosition(new THREE.Vector3()));
    }
  }

  /** Re-tune live foliage uniforms on every variant (near clones share them). */
  applySettings(options = {}) {
    if (this._compiledMode) return this;
    for (const tree of this.variantTrees) tree.applySettings(options);
    return this;
  }

  setCloudShadow(options) {
    if (this._compiledMode) return this;
    for (const tree of this.variantTrees) tree.setCloudShadow?.(options);
    return this;
  }

  setWind(options) {
    if (this._compiledMode) return this;
    for (const tree of this.variantTrees) tree.setWind?.(options);
    return this;
  }

  /** Keeps every live near-LOD tree on the current scene sun/sky inputs. */
  setSun(options) {
    if (this._compiledMode) return this;
    for (const tree of this.variantTrees) tree.setSun?.(options);
    return this;
  }

  setSurfaceWeather(options) {
    if (this._compiledMode) return this;
    for (const tree of this.variantTrees) tree.setSurfaceWeather?.(options);
    return this;
  }

  setVegetationShader(profile) {
    if (this._compiledMode) return { applied: 0, compiled: true, requiresImpostorRebake: false };
    const report = applyVegetationShader(this.variantTrees, profile);
    // Far proxy colors are derived from variant trees at construction time.
    // Live materials update immediately; hosts exposing runtime style editing
    // should rebuild the forest to derive matching proxy colors.
    report.requiresImpostorRebake = this.hasBakedImpostors;
    return report;
  }

  /**
   * Matches the far proxies' fog to the environment shader's height fog so far
   * canopies haze with the terrain they stand on. Pass the same
   * `heightFogColor` / `heightFogDensity` / `heightFogFalloff` the
   * environment uses, plus the world floor height (environment box bottom).
   * Density 0 disables the layer. createStylizedWorld wires this by default.
   */
  setDistanceFog({ color, density, falloff, floorY } = {}) {
    if (this._compiledMode) return this;
    const u = this._fogUniforms;
    if (density !== undefined) u.density.value = Math.max(Number(density) || 0, 0);
    if (falloff !== undefined) u.falloff.value = Math.max(Number(falloff) || 0, 0.001);
    if (floorY !== undefined) u.floorY.value = Number(floorY) || 0;
    if (color !== undefined) {
      const next = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color);
      u.color.value.copy(next);
    }
    return this;
  }

  get count() {
    return this._placements.length;
  }

  /** Read-only `[{ x, y, z, seed }]` of every tree (for collision, minimaps, ...). */
  get placements() {
    return this._placements.map(({ seed, x, y, z }) => ({ seed, x, y, z }));
  }

  dispose() {
    if (this._compiledMode) {
      for (const meshes of this._instanced) {
        for (const mesh of meshes) {
          mesh.geometry.dispose();
          mesh.material.dispose();
          mesh.customDepthMaterial?.dispose();
          mesh.customDistanceMaterial?.dispose();
          mesh.dispose();
        }
      }
      this.parent?.remove(this);
      return;
    }
    for (const meshes of this._instanced) {
      for (const mesh of meshes) {
        mesh.geometry?.dispose?.();
        mesh.dispose();
      }
    }
    for (const baked of this._bakedVariants) disposeExportGroup(baked);
    this.parent?.remove(this);
  }
}
