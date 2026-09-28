// The living layer — instanced, GPU-animated ambient creatures. Import from
// '@call-me-sensei/toonlab/fauna'.
//
//   const fauna = createFauna({
//     seed, heightAt, waterLevel, bounds,
//     followTarget,                                        // flush/degrade reference
//     species: { birds: 40, butterflies: 60, fish: 80 },   // budgets, not guesses
//   });
//   scene.add(fauna.root);
//   fauna.update(delta);                                   // each frame
//   fauna.addPerchPoints(points);                          // rooftops, rocks, posts
//   fauna.setDistanceFog({ color, density, falloff, floorY });
//
// Rendering discipline (mirrors the grass/forest clusters):
//  - One InstancedMesh per species-variant. Steering runs on staggered CPU
//    ticks (boids.js); every frame only integrates positions and rewrites
//    the instance matrices — wing flap, wing fold, hover bob, and fish tail
//    sway all happen in the TSL vertex stage from per-instance
//    (phase, speed, amplitude, heading) attributes, so a flock costs one
//    matrix compose per bird, never per feather.
//  - Materials are UNLIT with the anime shading baked into vertex colors
//    (see faunaBodies.js) — the same reasoning as the forest billboard
//    impostors: distant creatures must never depend on scene lights, and
//    they join the environment height fog through setDistanceFog so they
//    haze out with the terrain instead of floating on it.
//  - Nothing casts or receives shadows (plan budget: birds cast NO shadows;
//    the toon style reads fine without, and fauna crossing the shadow
//    cascade would be pure cost).
//  - Water pass flags: fish are excluded from the REFLECTION pass only
//    (userData.waterReflectionExclude) — the mirror render clips at the
//    water plane anyway, so drawing fish there is waste, while the grab
//    (refraction) pass MUST keep them: that is exactly how they are seen
//    from above. Airborne species get userData.waterGrabExclude — their
//    refracted contribution is invisible (the documented above-water
//    dressing rule in waterScenePasses.js) but their reflection over a lake
//    is kept, which is the whole point of dragonflies.

import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import {
  abs, attribute, clamp, cos, exp, float, Fn, length, max, mix, positionLocal, positionView,
  positionWorld, sin, uniform, vec3, vec4, vertexColor,
} from 'three/tsl';

import { stylizedCloudShadow } from '../shaders-tsl/chunks/stylized-cloud-shadow.js';
import { createFaunaSimulation, FAUNA_STATE, hashCombine } from './boids.js';
import { buildFaunaGeometry, getFaunaVariantCount } from './faunaBodies.js';
import { createFaunaSettings, FAUNA_SPECIES, normalizeFaunaPopulations } from './faunaSettings.js';
import { resolveFaunaPreset } from './faunaPresets.js';

// Per-species GPU animation constants (radians / meters at scale 1). These
// are look constants, not settings: they are tuned against the body
// geometry proportions in faunaBodies.js.
const MOTION = Object.freeze({
  birds: { flapAmp: 0.9, flapBias: 0.1, bobAmp: 0, bobHz: 0, kind: 'flap', fold: true },
  // Bias keeps butterfly wings raised through the whole stroke — a flat or
  // drooped pose reads as a disc, not an insect.
  butterflies: { flapAmp: 0.85, flapBias: 0.55, bobAmp: 0.05, bobHz: 4.2, kind: 'flap', fold: false },
  dragonflies: { flapAmp: 0.24, flapBias: 0.16, bobAmp: 0.028, bobHz: 2.1, kind: 'flap', fold: false },
  fish: { swayAmp: 0.05, kind: 'sway' },
});

const matrixScratch = new THREE.Matrix4();
const quaternionScratch = new THREE.Quaternion();
const eulerScratch = new THREE.Euler();
const positionScratch = new THREE.Vector3();
const scaleScratch = new THREE.Vector3();
const followScratch = new THREE.Vector3();

function resolveFollow(target) {
  if (!target) return null;
  if (typeof target === 'function') {
    const value = target(followScratch);
    return value && Number.isFinite(value.x) ? { x: value.x, y: value.y ?? 0, z: value.z ?? 0 } : null;
  }
  if (target.isObject3D) {
    target.getWorldPosition(followScratch);
    return { x: followScratch.x, y: followScratch.y, z: followScratch.z };
  }
  if (Number.isFinite(target.x)) return { x: target.x, y: target.y ?? 0, z: target.z ?? 0 };
  return null;
}

/**
 * Builds the fauna system. `heightAt(x, z) → meters` is the only terrain
 * contract (same as everything else in the kit); `waterLevel` is the world-y
 * of the water surface. Species counts are hard budgets — see
 * FAUNA_POPULATION_CAPS.
 */
export function createFauna({
  seed = 1,
  heightAt = null,
  waterLevel = 0,
  bounds = 240,
  followTarget = null,
  species = {},
  masks = {},
  settings = {},
  preset = null,
  perchPoints = [],
} = {}) {
  const presetEntry = resolveFaunaPreset(preset ?? settings?.preset);
  const mergedSettings = presetEntry
    ? mergeGrouped(presetEntry.settings, settings)
    : settings;
  const cfg = createFaunaSettings(mergedSettings);
  const populations = normalizeFaunaPopulations(
    presetEntry ? { ...presetEntry.species, ...cleanObject(species) } : species,
  );

  const variantCounts = Object.fromEntries(FAUNA_SPECIES.map((name) => [
    name, getFaunaVariantCount(name, cfg[name].palette),
  ]));

  const sim = createFaunaSimulation({
    bounds,
    heightAt,
    masks,
    perchPoints,
    seed,
    settings: cfg,
    species: populations,
    variantCounts,
    waterLevel,
  });

  const root = new THREE.Group();
  root.name = 'StylizedFauna';

  // Shared uniforms: one clock, one height-fog mirror, one cloud-shadow rig
  // across every fauna material (same contract as StylizedForest).
  const uTime = uniform(0);
  const fogUniforms = {
    color: uniform(new THREE.Color(0.66, 0.8, 0.94)),
    density: uniform(0),
    falloff: uniform(400),
    floorY: uniform(0),
  };
  const cloudUniforms = {
    coverage: uniform(0.45),
    scale: uniform(0.012),
    strength: uniform(0),
    velocity: uniform(new THREE.Vector2(0.02, 0.006)),
  };

  function finishColor(material, base) {
    // Drifting cloud shadows tie creatures to the same light field as the
    // grass/terrain (strength 0 skips the fbm entirely).
    const cloud = stylizedCloudShadow(
      positionWorld.xz, uTime,
      cloudUniforms.strength, cloudUniforms.coverage, cloudUniforms.scale, cloudUniforms.velocity,
    );
    const shaded = base.mul(mix(vec3(0.6, 0.66, 0.82), vec3(1.0), cloud));
    // Mirror of environment.js world-height fog (see stylizedForest.js):
    // without it, birds stay sharp saturated specks on hazed mountains.
    const heightFalloff = exp(
      max(positionWorld.y.sub(fogUniforms.floorY), 0.0).div(max(fogUniforms.falloff, 0.001)).negate(),
    );
    const depthTerm = exp(length(positionView).mul(fogUniforms.density).negate()).oneMinus();
    material.colorNode = vec4(
      mix(shaded, fogUniforms.color, clamp(depthTerm.mul(heightFalloff), 0.0, 1.0)),
      1.0,
    );
  }

  // Vertex-stage animation. Instanced attributes (written per frame):
  //   iFauna  = (phase, speed rad/s, amplitude, heading)
  //   iFauna2 = (scale, fold, bobAmp, bobHz)
  // positionLocal here is already instance-transformed; the flap is a
  // pseudo-rotation of wing vertices about the spine reconstructed from the
  // heading attribute (yaw-only — bank error on a turning bird is a few
  // degrees at wingtip scale, invisible for ambient creatures).
  function makeMaterial(name, motion) {
    const material = new MeshBasicNodeMaterial({
      fog: true,
      name: `StylizedFauna${name}`,
      side: THREE.DoubleSide, // wings/fins are single-surface sheets
      vertexColors: true,
    });
    material.positionNode = Fn(() => {
      const iA = attribute('iFauna', 'vec4');
      const iB = attribute('iFauna2', 'vec4');
      const side = vec3(cos(iA.w), 0.0, sin(iA.w).negate());
      const animated = positionLocal.toVar();
      if (motion.kind === 'flap') {
        const ext = attribute('aWing', 'float').mul(iB.x);
        const extAbs = abs(ext);
        const flap = sin(uTime.mul(iA.y).add(iA.x)).mul(iA.z).add(float(motion.flapBias));
        animated.addAssign(side.mul(ext.mul(cos(flap).sub(1.0))));
        animated.y.addAssign(extAbs.mul(sin(flap)));
        if (motion.fold) {
          // Perched wings hug the body: tips pulled inward and swept to the
          // tail, barely lifted — a raised fold reads as a butterfly.
          const forward = vec3(sin(iA.w), 0.0, cos(iA.w));
          animated.addAssign(side.mul(ext.mul(iB.y.mul(-0.85))));
          animated.addAssign(forward.mul(extAbs.mul(iB.y.mul(-0.62))));
          animated.y.addAssign(extAbs.mul(iB.y.mul(0.03)));
        }
        if (motion.bobAmp > 0) {
          animated.y.addAssign(sin(uTime.mul(iB.w).add(iA.x.mul(1.7))).mul(iB.z));
        }
      } else {
        // Fish: traveling lateral wave, nose barely, tail fully.
        const tail = attribute('aTail', 'float');
        const wave = sin(uTime.mul(iA.y).add(iA.x).sub(tail.mul(2.4)));
        animated.addAssign(side.mul(wave.mul(iA.z).mul(tail.mul(0.85).add(0.15)).mul(iB.x)));
      }
      return animated;
    })();
    finishColor(material, vertexColor().rgb);
    return material;
  }

  // --- meshes: one InstancedMesh per species-variant -------------------------

  const materials = {};
  const meshes = [];
  const perSpecies = {};
  let triangles = 0;

  for (const name of FAUNA_SPECIES) {
    const state = sim.species[name];
    if (state.count === 0) continue;
    materials[name] = makeMaterial(name, MOTION[name]);

    // Stable agent → (mesh, slot) assignment from the deterministic variant
    // array the simulation already produced.
    const groups = Array.from({ length: variantCounts[name] }, () => []);
    for (let i = 0; i < state.count; i += 1) groups[state.arrays.variant[i] % groups.length].push(i);

    const speciesMeshes = [];
    for (let v = 0; v < groups.length; v += 1) {
      const agents = groups[v];
      if (agents.length === 0) continue;
      const geometry = buildFaunaGeometry(name, {
        palette: cfg[name].palette,
        seed: hashCombine(seed, 0x5eed + v),
        variant: v,
      });
      const iA = new THREE.InstancedBufferAttribute(new Float32Array(agents.length * 4), 4);
      const iB = new THREE.InstancedBufferAttribute(new Float32Array(agents.length * 4), 4);
      iA.setUsage(THREE.DynamicDrawUsage);
      iB.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('iFauna', iA);
      geometry.setAttribute('iFauna2', iB);
      const mesh = new THREE.InstancedMesh(geometry, materials[name], agents.length);
      mesh.name = `${geometry.name}Instances`;
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false; // instances roam the whole bounds
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (name === 'fish') {
        mesh.userData.waterReflectionExclude = true; // keep the grab pass: refraction IS fish visibility
      } else {
        mesh.userData.waterGrabExclude = true; // invisible refracted, reflection kept
      }
      root.add(mesh);
      meshes.push(mesh);
      speciesMeshes.push({ agents, iA, iB, mesh });
      triangles += (geometry.index.count / 3) * agents.length;
    }
    perSpecies[name] = speciesMeshes;
  }

  // --- per-frame write-back ---------------------------------------------------

  const TWO_PI = Math.PI * 2;
  function writeSpecies(name) {
    const entries = perSpecies[name];
    if (!entries) return;
    const state = sim.species[name];
    const a = state.arrays;
    const motion = MOTION[name];
    const flapHz = motion.kind === 'sway' ? cfg.fish.swayHz : cfg[name].flapHz;
    const isFish = motion.kind === 'sway';
    const isBird = name === 'birds';
    for (const entry of entries) {
      const { agents, iA, iB, mesh } = entry;
      const arrA = iA.array;
      const arrB = iB.array;
      for (let slot = 0; slot < agents.length; slot += 1) {
        const i = agents[slot];
        const hSpeed = Math.hypot(a.vx[i], a.vz[i]);
        let pitch = 0;
        if (isFish) {
          pitch = Math.min(Math.max(Math.atan2(-a.vy[i], Math.max(hSpeed, 0.2)), -0.7), 0.7);
        } else if (isBird && a.state[i] !== FAUNA_STATE.PERCHED) {
          pitch = Math.min(Math.max(Math.atan2(-a.vy[i], Math.max(hSpeed, 0.5)) * 0.55, -0.55), 0.55);
        }
        positionScratch.set(a.px[i], a.py[i], a.pz[i]);
        eulerScratch.set(pitch, a.heading[i], a.bank[i], 'YXZ');
        quaternionScratch.setFromEuler(eulerScratch);
        scaleScratch.setScalar(a.scale[i]);
        matrixScratch.compose(positionScratch, quaternionScratch, scaleScratch);
        mesh.setMatrixAt(slot, matrixScratch);

        const o = slot * 4;
        arrA[o] = a.phase[i];
        arrA[o + 1] = TWO_PI * flapHz * a.speedMul[i]
          * (isFish ? 0.55 + (hSpeed / Math.max(cfg.fish.cruiseSpeed, 0.1)) * 0.6 : 1);
        arrA[o + 2] = (motion.kind === 'sway' ? motion.swayAmp : motion.flapAmp)
          * a.amp[i] * (motion.fold ? 1 - a.fold[i] : 1);
        arrA[o + 3] = a.heading[i];
        arrB[o] = a.scale[i];
        arrB[o + 1] = a.fold[i];
        arrB[o + 2] = motion.bobAmp ?? 0;
        arrB[o + 3] = motion.bobHz ?? 0;
      }
      mesh.instanceMatrix.needsUpdate = true;
      iA.needsUpdate = true;
      iB.needsUpdate = true;
    }
  }

  const fauna = {
    root,
    settings: cfg,
    simulation: sim,

    update(delta) {
      const dt = Math.min(Math.max(Number(delta) || 0.016, 0), 0.1);
      uTime.value += dt;
      sim.update(dt, resolveFollow(followTarget));
      for (const name of FAUNA_SPECIES) writeSpecies(name);
      return fauna;
    },

    /** Registers roost points `[{ x, y, z }]` (rooftops, rocks, posts). */
    addPerchPoints(points) {
      sim.addPerchPoints(points);
      return fauna;
    },

    /**
     * Matches the fauna to the environment shader's height fog — pass the
     * same heightFogColor/Density/Falloff the terrain uses plus the world
     * floor height. Density 0 disables the layer.
     */
    setDistanceFog({ color, density, falloff, floorY } = {}) {
      if (density !== undefined) fogUniforms.density.value = Math.max(Number(density) || 0, 0);
      if (falloff !== undefined) fogUniforms.falloff.value = Math.max(Number(falloff) || 0, 0.001);
      if (floorY !== undefined) fogUniforms.floorY.value = Number(floorY) || 0;
      if (color !== undefined) {
        const next = Array.isArray(color) ? new THREE.Color(...color) : new THREE.Color(color);
        fogUniforms.color.value.copy(next);
      }
      return fauna;
    },

    /** Drifting procedural cloud shadows (same knobs as grass). strength 0 disables. */
    setCloudShadow({ strength, coverage, scale, velocity } = {}) {
      if (strength !== undefined) cloudUniforms.strength.value = Math.min(Math.max(Number(strength) || 0, 0), 1);
      if (coverage !== undefined) cloudUniforms.coverage.value = Math.min(Math.max(Number(coverage) || 0, 0), 1);
      if (scale !== undefined) cloudUniforms.scale.value = Math.max(Number(scale) || 0.012, 0.0001);
      if (velocity !== undefined && Array.isArray(velocity)) {
        cloudUniforms.velocity.value.set(Number(velocity[0]) || 0, Number(velocity[1]) || 0);
      }
      return fauna;
    },

    get stats() {
      return {
        ...sim.stats,
        drawCalls: meshes.length,
        triangles: Math.round(triangles),
      };
    },

    dispose() {
      for (const mesh of meshes) {
        mesh.geometry.dispose();
        mesh.dispose();
      }
      for (const material of Object.values(materials)) material.dispose();
      root.parent?.remove(root);
    },
  };

  return fauna;
}

function cleanObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

// Grouped settings merge: preset values under host overrides, group by group.
function mergeGrouped(base, overrides) {
  const result = {};
  const groups = new Set([...Object.keys(cleanObject(base)), ...Object.keys(cleanObject(overrides))]);
  for (const group of groups) {
    if (group === 'preset') continue;
    result[group] = { ...cleanObject(base)[group], ...cleanObject(overrides)[group] };
  }
  return result;
}
