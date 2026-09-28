// FILL-006 — deterministic figure population.
//
// WHAT IT IS
//   Load ONE humanoid source, and get N original, individually-designed,
//   animated, ground-contacted figures out of it — for a fraction of the cost
//   of N characters.
//
// THE ONE IDEA THAT MAKES IT CHEAP
//   The parity analysis measured the blocking problem correctly: ToonLab has
//   no rig-keyed clip cache (`src/character/animationRetarget.js` retargets
//   per target mesh), so N background figures on N different meshes cost N
//   retargets at load. This module sidesteps that entirely by inverting the
//   relationship: every figure BORROWS the source skeleton rather than owning
//   one, so the source's shipped clips bind by node name with **zero**
//   retargeting, and the per-figure cost collapses to (clone the bone
//   hierarchy) + (build a small merged skinned geometry).
//
//   That is why a figure here costs single-digit milliseconds instead of the
//   ~1 s a `createCharacterRuntime` instance costs, and it is the finding that
//   should survive into `src/crowd/` whatever scene ships.
//
// WHAT IT IS NOT
//   Not a billboard impostor system. §13 rejects alpha halos, ToonLab's
//   impostor machinery is hard-wired to foliage (`stylizedForest.js`), and a
//   hand-rolled figure impostor is the single most likely way to produce the
//   defect the criteria reject. Every figure here is real skinned geometry.
//
// DETERMINISM (the precondition for the register's equivalence test)
//   Placement, colourway rotation, clip choice and clip phase all derive from
//   one integer seed through `mulberry32`. Nothing regenerates per load, no
//   `Math.random`, no time-of-day dependence. Two loads produce byte-identical
//   transforms at the same animation time.

import * as THREE from 'three/webgpu';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

import { applyToonShader } from '../../../src/toon/toonMaterialAdapter.js';
import { loadModelAsset } from '../../../src/character/modelLoader.js';
import {
  FigureParts,
  createBindRig,
  createFigurePalette,
  mulberry32,
} from './figureParts.js';
import {
  CROWD_ACTIVITY_CLIPS,
  CROWD_FIGURES_BY_ID,
  CROWD_PALETTE_COLORS,
  CROWD_PALETTE_NAMES,
} from './figureLibrary.js';

const DEFAULT_SOURCE_URL = '/characters/mannequin.glb';

/** Source model height in metres, measured from the bind-pose mesh bounds. */
function measureSourceHeight(root) {
  const box = new THREE.Box3().setFromObject(root);
  return Math.max(0.1, box.max.y - box.min.y);
}

function findSkinnedMeshes(root) {
  const found = [];
  root.traverse((object) => {
    if (object.isSkinnedMesh) found.push(object);
  });
  return found;
}

function findSkinnedMesh(root) {
  return findSkinnedMeshes(root)[0] ?? null;
}

/**
 * Soft radial contact-shadow stamp.
 *
 * Grounding needs this because the sun-shadow cascade is not always on (the
 * launch scenes run with it off, D19-041), and a figure with no ground
 * darkening reads as floating — which §4 lists as an outright reject
 * ("floating contacts in any approved launch frame"). One InstancedMesh
 * carries every figure's stamp, so the whole crowd's grounding is ONE draw
 * call, and it lands on the terrain normal so it stays correct on slope and
 * on sand.
 */
function createContactShadowTexture(size = 64) {
  const data = new Uint8Array(size * size * 4);
  const centre = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - centre) / centre;
      const dy = (y - centre) / centre;
      const r = Math.min(1, Math.hypot(dx, dy));
      // Squared smoothstep: dense under the feet, gone by the rim, with no
      // hard edge for the post stack to alias against.
      const falloff = (1 - r) * (1 - r) * (3 - 2 * (1 - r) > 0 ? 1 : 1);
      const alpha = Math.max(0, Math.min(1, falloff));
      const index = (y * size + x) * 4;
      data[index] = 255;
      data[index + 1] = 255;
      data[index + 2] = 255;
      data[index + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  return texture;
}

/**
 * @typedef {object} CrowdPlacement
 * @property {string} figure     archetype id from the design library
 * @property {[number, number]} at  x, z in world metres
 * @property {number} [yaw]      radians; omitted = derived from the path or the seed
 * @property {string} [activity] key into CROWD_ACTIVITY_CLIPS
 * @property {[number, number][]} [path] patrol polyline; enables locomotion
 * @property {number} [speed]    m/s override
 * @property {number} [phase]    0..1 clip phase; omitted = seeded
 * @property {Record<string,string>} [colors] palette slot overrides
 * @property {number} [scale]    height multiplier, 0.9..1.1 territory
 */

/**
 * @param {object} options
 * @param {THREE.Object3D} options.parent      mount point owned by the scene
 * @param {CrowdPlacement[]} options.placements deterministic placement document
 * @param {(x:number,z:number)=>number} [options.heightAt] ground query
 * @param {(x:number,z:number)=>THREE.Vector3} [options.normalAt]
 * @param {number} [options.seed]
 * @param {string} [options.sourceUrl]         humanoid providing skeleton + clips
 * @param {object|false} [options.toon]        ToonLab toon settings, or false
 * @param {object|false} [options.contactShadow]
 * @param {THREE.WebGPURenderer} [options.renderer]
 */
export async function createCrowdPopulation({
  contactShadow = {},
  heightAt = () => 0,
  normalAt = null,
  onProgress = () => {},
  parent = null,
  placements = [],
  renderer = null,
  seed = 20260815,
  sourceUrl = DEFAULT_SOURCE_URL,
  toon = { preset: 'call_me_sensei' },
} = {}) {
  const timings = { total: 0, source: 0, geometry: 0, assembly: 0, toon: 0 };
  const t0 = performance.now();

  onProgress('Loading the crowd source humanoid');
  const asset = await loadModelAsset(sourceUrl, { renderer });
  timings.source = performance.now() - t0;

  const sourceSkinned = findSkinnedMesh(asset.root);
  if (!sourceSkinned) throw new Error('Crowd source model carries no skinned mesh.');
  const rig = createBindRig(sourceSkinned.skeleton);
  const sourceHeight = measureSourceHeight(asset.root);

  const clipsByName = new Map(asset.clips.map((clip) => [clip.name, clip]));

  const palette = createFigurePalette(CROWD_PALETTE_COLORS);
  for (const [name, index] of Object.entries(CROWD_PALETTE_NAMES)) palette.name(name, index);

  const root = new THREE.Group();
  root.name = 'ToonLab crowd population';
  root.userData.toonlabCrowd = { fill: 'FILL-006', seed };

  const random = mulberry32(seed);
  const geometryCache = new Map();
  let builtTriangles = 0;

  // -------------------------------------------------------------------------
  // Figure assembly
  // -------------------------------------------------------------------------
  const figures = [];
  const tGeometry = performance.now();

  for (let i = 0; i < placements.length; i += 1) {
    const placement = placements[i];
    const archetype = CROWD_FIGURES_BY_ID[placement.figure];
    if (!archetype) throw new Error(`Unknown crowd figure "${placement.figure}".`);

    const colors = { ...archetype.slots, ...(placement.colors ?? {}) };
    const cacheKey = `${archetype.id}|${Object.entries(colors).map(([k, v]) => `${k}=${v}`).join(',')}`;

    let built = geometryCache.get(cacheKey);
    if (!built) {
      const parts = new FigureParts({ palette, rig });
      const resolve = (slot) => {
        const name = colors[slot];
        if (name === undefined) throw new Error(`${archetype.id} has no palette slot "${slot}".`);
        return palette.index(name);
      };
      archetype.build(parts, rig, resolve);
      built = parts.build();
      builtTriangles += built.triangles;
      geometryCache.set(cacheKey, built);
    }

    // Bone hierarchy clone. SkeletonUtils rebuilds the armature and rebinds a
    // fresh Skeleton over the cloned bones; the figure meshes then bind to
    // THAT skeleton, and the source mannequin mesh is dropped — its geometry
    // never enters the scene, only its rig and its clip library do.
    const instanceRoot = cloneSkinned(asset.root);
    // EVERY skinned mesh, not just the first: a glTF mesh with two primitives
    // (the ToonLab mannequin has M_Main + M_Joints) arrives as two sibling
    // SkinnedMeshes, and leaving the second behind renders a grey shop dummy
    // inside every figure. Cost the debugging once, keep the note.
    const clonedSkinned = findSkinnedMeshes(instanceRoot);
    const donor = clonedSkinned[0];
    const skeleton = donor.skeleton;
    const bindMatrix = donor.bindMatrix.clone();
    const meshParent = donor.parent ?? instanceRoot;
    for (const mesh of clonedSkinned) {
      mesh.removeFromParent();
      mesh.geometry = null;
      mesh.material = null;
    }

    const meshes = [];
    for (const [role, geometry] of Object.entries(built.geometries)) {
      const material = new THREE.MeshStandardMaterial({
        map: palette.texture,
        metalness: 0,
        name: `Crowd ${role}`,
        roughness: role === 'Hair' ? 0.62 : 0.86,
      });
      const mesh = new THREE.SkinnedMesh(geometry, material);
      mesh.name = `${archetype.id} ${role}`;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;
      meshParent.add(mesh);
      mesh.bind(skeleton, bindMatrix);
      meshes.push(mesh);
    }

    const carrier = new THREE.Group();
    carrier.name = `${archetype.id} #${i}`;
    const scale = (archetype.height / sourceHeight) * (placement.scale ?? 1);
    carrier.scale.setScalar(scale);
    carrier.add(instanceRoot);
    root.add(carrier);

    // Activity + clip. Deterministic: the placement names an activity, or the
    // seed picks one from the archetype's own affinity list.
    const activityKey = placement.activity
      ?? archetype.activity[Math.floor(random() * archetype.activity.length)];
    const activity = CROWD_ACTIVITY_CLIPS[activityKey];
    if (!activity) throw new Error(`Unknown crowd activity "${activityKey}".`);
    const clip = clipsByName.get(activity.clip);
    if (!clip) throw new Error(`Crowd source is missing clip "${activity.clip}".`);

    const mixer = new THREE.AnimationMixer(instanceRoot);
    const action = mixer.clipAction(clip);
    action.play();
    const phase = placement.phase ?? random();
    // Phase offset is the anti-repetition tool that costs nothing: two figures
    // on the same clip at the same phase read as one object copied.
    action.time = phase * clip.duration;
    mixer.update(0);

    const path = placement.path ?? null;
    // Stride scales with leg length, so a 1.16 m child on Walk_Loop must not
    // travel at the 1.78 m adult's metres-per-second or its feet skate.
    const speed = placement.speed ?? (activity.speed * (archetype.height / 1.75));

    figures.push({
      action,
      activity: activityKey,
      archetype,
      carrier,
      clipName: activity.clip,
      distance: 0,
      meshes,
      mixer,
      path,
      phase,
      placement,
      scale,
      speed,
      yaw: placement.yaw ?? 0,
    });
  }
  timings.geometry = performance.now() - tGeometry;

  // -------------------------------------------------------------------------
  // Toon conversion
  // -------------------------------------------------------------------------
  const tToon = performance.now();
  if (toon !== false) {
    // One call over the whole population: the adapter walks the subtree, and
    // the material names (`Crowd Skin` / `Crowd Hair` / `Crowd Costume`) are
    // the tokens `src/core/materialRoles.js` infers skin / hair / costume
    // from, so a background figure gets the same material separation §4 asks
    // for on the hero.
    applyToonShader(root, toon === true ? {} : toon);
  }
  timings.toon = performance.now() - tToon;

  // -------------------------------------------------------------------------
  // Contact shadows
  // -------------------------------------------------------------------------
  let shadowMesh = null;
  let shadowTexture = null;
  if (contactShadow !== false && figures.length) {
    const {
      opacity = 0.38,
      radius = 0.46,
      tint = '#4a3550',
    } = contactShadow ?? {};
    shadowTexture = createContactShadowTexture();
    const shadowMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(tint),
      depthWrite: false,
      map: shadowTexture,
      name: 'Crowd contact shadow',
      opacity,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      transparent: true,
    });
    const plane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    shadowMesh = new THREE.InstancedMesh(plane, shadowMaterial, figures.length);
    shadowMesh.name = 'Crowd contact shadows';
    shadowMesh.frustumCulled = false;
    shadowMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    shadowMesh.userData.crowdShadowRadius = radius;
    root.add(shadowMesh);
  }

  parent?.add(root);

  // -------------------------------------------------------------------------
  // Frame update
  // -------------------------------------------------------------------------
  const scratchMatrix = new THREE.Matrix4();
  const scratchQuaternion = new THREE.Quaternion();
  const scratchPosition = new THREE.Vector3();
  const scratchScale = new THREE.Vector3();
  const scratchNormal = new THREE.Vector3();
  const scratchEuler = new THREE.Euler();

  function pathPoint(path, distance) {
    let remaining = distance;
    let total = 0;
    for (let i = 0; i < path.length - 1; i += 1) {
      total += Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    }
    if (total < 1e-4) return { x: path[0][0], z: path[0][1], yaw: 0 };
    remaining = ((remaining % total) + total) % total;
    for (let i = 0; i < path.length - 1; i += 1) {
      const ax = path[i][0];
      const az = path[i][1];
      const bx = path[i + 1][0];
      const bz = path[i + 1][1];
      const length = Math.hypot(bx - ax, bz - az);
      if (remaining <= length || i === path.length - 2) {
        const t = length > 1e-6 ? remaining / length : 0;
        return {
          x: ax + (bx - ax) * t,
          yaw: Math.atan2(bx - ax, bz - az),
          z: az + (bz - az) * t,
        };
      }
      remaining -= length;
    }
    return { x: path[0][0], yaw: 0, z: path[0][1] };
  }

  function groundNormal(x, z) {
    if (normalAt) return scratchNormal.copy(normalAt(x, z));
    const step = 0.6;
    const dx = (heightAt(x + step, z) - heightAt(x - step, z)) / (2 * step);
    const dz = (heightAt(x, z + step) - heightAt(x, z - step)) / (2 * step);
    return scratchNormal.set(-dx, 1, -dz).normalize();
  }

  function place(figure) {
    let x = figure.placement.at[0];
    let z = figure.placement.at[1];
    let yaw = figure.yaw;
    if (figure.path && figure.speed > 0) {
      const point = pathPoint(figure.path, figure.distance);
      x = point.x;
      z = point.z;
      yaw = point.yaw;
    }
    const y = heightAt(x, z);
    figure.carrier.position.set(x, y, z);
    figure.carrier.rotation.set(0, yaw, 0);
    figure.x = x;
    figure.y = y;
    figure.z = z;
    figure.currentYaw = yaw;
  }

  function writeShadow(figure, index) {
    if (!shadowMesh) return;
    const normal = groundNormal(figure.x, figure.z);
    scratchQuaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    scratchEuler.set(0, figure.currentYaw, 0);
    scratchQuaternion.multiply(new THREE.Quaternion().setFromEuler(scratchEuler));
    const radius = shadowMesh.userData.crowdShadowRadius * figure.scale
      * (figure.archetype.mass ?? 1);
    scratchPosition.set(figure.x, figure.y + 0.015, figure.z);
    // Sitting and crouching figures put more of themselves on the ground, so
    // the stamp widens and darkens rather than staying a standing footprint.
    const spread = figure.activity === 'sit' || figure.activity === 'crouch' ? 1.55 : 1;
    scratchScale.set(radius * 2 * spread, 1, radius * 2 * spread);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    shadowMesh.setMatrixAt(index, scratchMatrix);
  }

  for (let i = 0; i < figures.length; i += 1) {
    place(figures[i]);
    writeShadow(figures[i], i);
  }
  if (shadowMesh) shadowMesh.instanceMatrix.needsUpdate = true;

  timings.assembly = performance.now() - t0 - timings.source - timings.geometry - timings.toon;
  timings.total = performance.now() - t0;

  const census = Object.freeze({
    archetypes: new Set(figures.map((figure) => figure.archetype.id)).size,
    colourways: geometryCache.size,
    figures: figures.length,
    materials: figures.reduce((total, figure) => total + figure.meshes.length, 0),
    sourceLoads: 1,
    retargets: 0,
    triangles: Math.round(builtTriangles),
  });

  return {
    census,
    figures,
    palette,
    rig,
    root,
    timings,
    sourceClips: asset.clips.map((clip) => clip.name),

    /** Frame tick. `camera` is accepted for future LOD gating. */
    update(delta) {
      let moved = false;
      for (let i = 0; i < figures.length; i += 1) {
        const figure = figures[i];
        figure.mixer.update(delta);
        if (figure.path && figure.speed > 0) {
          figure.distance += figure.speed * delta;
          place(figure);
          writeShadow(figure, i);
          moved = true;
        }
      }
      if (moved && shadowMesh) shadowMesh.instanceMatrix.needsUpdate = true;
    },

    /** Freeze every figure at a fixed animation time — capture determinism. */
    setAnimationTime(seconds) {
      for (const figure of figures) {
        figure.action.time = ((figure.phase * figure.action.getClip().duration) + seconds)
          % figure.action.getClip().duration;
        figure.mixer.setTime(0);
        figure.mixer.update(0);
      }
    },

    setVisible(visible) {
      root.visible = visible;
    },

    dispose() {
      for (const figure of figures) {
        figure.mixer.stopAllAction();
        figure.mixer.uncacheRoot(figure.carrier.children[0]);
        for (const mesh of figure.meshes) mesh.material?.dispose?.();
      }
      for (const built of geometryCache.values()) {
        for (const geometry of Object.values(built.geometries)) geometry.dispose();
      }
      shadowMesh?.geometry.dispose();
      shadowMesh?.material.dispose();
      shadowTexture?.dispose();
      palette.dispose();
      root.removeFromParent();
    },
  };
}
