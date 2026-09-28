// ToonLab outdoor-world example — a 1×1 km stylized anime open world built
// entirely from the public library API, the way a game project would:
//
//   1. Generate terrain (any heightfield works — here it's seeded value
//      noise: a continent, a ridged mountain band, carved lake basins).
//   2. Mesh a few rockgen presets and scatter boulders, shore stones, and
//      karst spires.
//   3. createStylizedWorld() — environment shader, sun rig, sky, water,
//      LOD forests (instanced volumetric proxies far / live trees near), a grass
//      window that follows the player, shared cloud shadows.
//   4. Load the bundled mannequin, toon-shade it, walk around.
//
// Views: 1 Explore (third-person) · 2 Flyover · 3 Top-down.
// World units are meters. Same seed → same world.

import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';

import { createStylizedTerrain } from '../../src/stylizedTerrain.js';
import { createWorldMinimap } from '../../src/worldMinimap.js';
import { createStylizedWorld } from '../../src/stylizedWorld.js';
import { applyToonShader, createCharacterRenderPasses, createToonSettings } from '@call-me-sensei/toonlab/toon';
import { createPostProcessingPipeline } from '@call-me-sensei/toonlab/post';
import { loadModelAsset } from '@call-me-sensei/toonlab/loaders';
import { createFreestyleSwimClip, resolveCharacterRig } from '@call-me-sensei/toonlab/character';
import { createRockDocument, meshDocument, resolveRockgenQuality } from '@call-me-sensei/toonlab/rockgen';
import {
  combineMasks,
  createNoisePatchMask,
  createSlopeMask,
  createWaterMask,
  scatterInRect,
  StylizedTree,
} from '@call-me-sensei/toonlab/vegetation';

// Populated in main() by createStylizedTerrain — URL params drive it:
//   ?seed=42 &archetype=lakeland &water=0.4 &h=250 &d=80 &sx=1400 &sz=800
//   &islands=4
// Same seed → same world; every value below is derived, never hand-tuned.
const WORLD = {
  bounds: { x: 480, z: 480 }, // walkable clamp (playable half-extent − margin)
  depth: 1000,
  seed: 20260712,
  spawn: { x: 0, y: 0, z: 0 },
  waterLevel: 0,
  width: 1000,
};
let heightAt = () => 0; // assigned from the generator in main()

// ---------------------------------------------------------------- terrain

function hashCell(ix, iz) {
  let h = (ix * 374761393 + iz * 668265263 + WORLD.seed * 971) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// (Morphology, waterline, spawn probing, and biome painting all live in
// createStylizedTerrain now — see src/stylizedTerrain.js.)

// ------------------------------------------------------------------ rocks

// Rockgen variants meshed once at gameplay quality, scattered as clones
// (shared geometry). Baked vertex colors + SDF AO come out of meshDocument;
// the environment shader re-lights them with the scene.
//
// Every rock is distance-LOD'd: each variant meshes at two resolutions and
// clones swap geometry as the camera crosses ~200 m (rocks.updateLod runs
// on an interval from the frame loop). Full-res rocks in the water passes
// were a measurable chunk of the frame.
const ROCK_LOD_DISTANCE = 200;
function addNeutralUv(geometry) {
  if (!geometry.attributes.uv) {
    geometry.setAttribute('uv', new THREE.BufferAttribute(
      new Float32Array(geometry.attributes.position.count * 2), 2,
    ));
  }
  return geometry;
}

function buildRocks() {
  const quality = resolveRockgenQuality('gameplayHigh');
  const rockGeometry = (preset, seed, resolution) => addNeutralUv(meshDocument(
    createRockDocument({ preset, seed, style: 'call_me_sensei' }),
    { normals: quality.normalsMode, resolution },
  ));
  const rockPair = (preset, seed) => ({
    hi: rockGeometry(preset, seed, quality.previewResolution),
    lo: rockGeometry(preset, seed, Math.min(quality.previewResolution, 20)),
  });
  const boulders = [rockPair('boulder', 41), rockPair('granite-boulder', 42), rockPair('river-boulder', 43)];
  const spire = rockPair('karst-spire', 44);
  const rockMaterial = new THREE.MeshStandardMaterial({ vertexColors: true });

  const group = new THREE.Group();
  group.name = 'rocks';
  const blockers = [];
  const lodEntries = [];
  const bounds = {
    max: { x: WORLD.bounds.x - 10, z: WORLD.bounds.z - 10 },
    min: { x: -WORLD.bounds.x + 10, z: -WORLD.bounds.z + 10 },
  };
  const place = (pair, p, scale, sink, spin) => {
    const rock = new THREE.Mesh(pair.lo, rockMaterial);
    rock.castShadow = true;
    rock.receiveShadow = true;
    rock.frustumCulled = false; // scaled clones: keep landmarks from vanishing at frame edges
    rock.scale.setScalar(scale);
    rock.position.set(p.x, p.y - scale * sink, p.z);
    rock.rotation.y = spin;
    group.add(rock);
    lodEntries.push({ pair, rock, x: p.x, y: p.y, z: p.z });
    blockers.push({ radius: scale * 0.85, x: p.x, z: p.z });
  };

  // Meadow boulders — off cliffs and out of the water.
  const dry = combineMasks(
    createWaterMask({ heightAt, margin: 0.3, waterLevel: WORLD.waterLevel }),
    createSlopeMask({ heightAt, maxSlope: 0.9 }),
  );
  scatterInRect({ ...bounds, count: 45, heightAt, mask: dry, minSpacing: 34, seed: 5 })
    .forEach((p, i) => place(boulders[i % boulders.length], p, 1.2 + ((i * 2654435761) % 100) / 50, 0.25, i * 2.39996));

  // Shore stones — the waterline detail that sells lake edges.
  scatterInRect({
    ...bounds, count: 84, heightAt, minSpacing: 12, seed: 6,
    mask: (x, z) => Math.abs(heightAt(x, z) - WORLD.waterLevel) < 2.4,
  }).forEach((p, i) => place(boulders[(i + 1) % boulders.length], p, 0.55 + ((i * 40503) % 100) / 70, 0.3, i * 1.61803));

  // Karst spires — only in the mountain band, Guilin-style.
  scatterInRect({
    ...bounds, count: 7, heightAt, minSpacing: 95, seed: 9,
    mask: (x, z) => heightAt(x, z) > 60,
  }).forEach((p, i) => place(spire, p, 9 + ((i * 7919) % 100) / 15, 0.32, i * 1.7));

  const slabLod = new URLSearchParams(location.search).has('noslabs')
    ? null
    : buildCliffSlabs(group, blockers);

  // Interval LOD reassignment: near rocks get the high-res geometry, far
  // rocks the low; slab instances swap between their hi/lo InstancedMesh
  // pair the same way the forest swaps live trees for volumetric proxies.
  const nearSq = ROCK_LOD_DISTANCE * ROCK_LOD_DISTANCE;
  const updateLod = (focus) => {
    for (const entry of lodEntries) {
      const dx = entry.x - focus.x;
      // True 3D distance — an aerial camera is far from everything below it.
      const dy = entry.y - focus.y;
      const dz = entry.z - focus.z;
      const target = (dx * dx + dy * dy + dz * dz) < nearSq ? entry.pair.hi : entry.pair.lo;
      if (entry.rock.geometry !== target) entry.rock.geometry = target;
    }
    slabLod?.(focus);
  };
  return { blockers, group, updateLod };
}

// Sculpted cliff slabs along every terrace wall — the reference cliffs are
// big rounded rock forms a climber can read routes on, not painted
// heightfield planes. Slab meshes also bury the wall triangulation
// entirely. Low-res meshing on purpose: silhouettes come from the mesh,
// surface detail from the triplanar stone texture + edge highlights.
function buildCliffSlabs(group, blockers) {
  const quality = resolveRockgenQuality('mobile');
  // Hi/lo LOD pair per variant: near slabs keep silhouette detail, far
  // slabs (the vast majority) drop to a quarter of the vertices — they all
  // ride through every water pass, so distance LOD is where the frame goes.
  const slabGeometry = (seed, resolution) => addNeutralUv(meshDocument(
    createRockDocument({ preset: 'boulder', seed, style: 'call_me_sensei' }),
    { normals: quality.normalsMode, resolution },
  ));
  const variants = [51, 52, 53, 54].map((seed) => ({
    hi: slabGeometry(seed, Math.min(quality.previewResolution, 40)),
    lo: slabGeometry(seed, 18),
  }));
  // Brightened + cooled over the baked rock palette: reference cliffs are
  // pale blue-white, not granite brown.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true });
  material.color.setRGB(1.18, 1.26, 1.36);

  // Wall sites: sample the map, keep steep cells, one slab per 22 m cell,
  // deterministic thinning. The outward (downhill) direction orients the
  // slab face; the local wall height sets its scale.
  const sites = [];
  const seen = new Set();
  const scanX = WORLD.width * 0.56;
  const scanZ = WORLD.depth * 0.56;
  for (let x = -scanX; x <= scanX; x += 10) {
    for (let z = -scanZ; z <= scanZ; z += 10) {
      const e = 5;
      const gx = (heightAt(x + e, z) - heightAt(x - e, z)) / (2 * e);
      const gz = (heightAt(x, z + e) - heightAt(x, z - e)) / (2 * e);
      const grade = Math.hypot(gx, gz);
      if (grade < 0.8) continue;
      const key = `${Math.round(x / 22)},${Math.round(z / 22)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const r = hashCell(x * 3 + 11, z * 3 + 7);
      if (r < 0.3) continue; // thin out: walls stay varied, budget stays sane
      const out = { x: -gx / grade, z: -gz / grade };
      const baseY = heightAt(x + out.x * 5, z + out.z * 5);
      const topY = heightAt(x - out.x * 7, z - out.z * 7);
      const wallHeight = topY - baseY;
      if (wallHeight < 7) continue;
      sites.push({ baseY, out, r, wallHeight: Math.min(wallHeight, 42), x, z });
    }
  }

  const perVariant = Array.from({ length: variants.length }, () => []);
  sites.forEach((site, i) => perVariant[i % variants.length].push(site));
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  const lodSets = [];
  perVariant.forEach((list, v) => {
    if (list.length === 0) return;
    const pair = {};
    for (const tier of ['hi', 'lo']) {
      const instanced = new THREE.InstancedMesh(variants[v][tier], material, list.length);
      // No cast: mostly outside the follow shadow window; edge highlights
      // and baked AO carry the form. Reflection stays; refraction skipped.
      instanced.castShadow = false;
      instanced.receiveShadow = true;
      instanced.userData.waterGrabExclude = true;
      instanced.frustumCulled = false; // spans the whole map
      group.add(instanced);
      pair[tier] = instanced;
    }
    const entries = list.map((site, slot) => {
      // Tall slab, wide face, shallow depth; face turned outward with a
      // little jitter so neighboring slabs never read as copies.
      const sy = site.wallHeight * (0.75 + site.r * 0.4);
      const sx = sy * (0.75 + ((site.r * 7919) % 1) * 0.55);
      const sz = sy * 0.5;
      const yaw = Math.atan2(site.out.x, site.out.z) + (site.r - 0.5) * 0.6;
      quaternion.setFromAxisAngle(up, yaw);
      matrix.compose(
        new THREE.Vector3(
          // embed the back of the slab into the wall
          site.x - site.out.x * sz * 0.3,
          site.baseY + sy * 0.02,
          site.z - site.out.z * sz * 0.3,
        ),
        quaternion,
        new THREE.Vector3(sx, sy, sz),
      );
      pair.lo.setMatrixAt(slot, matrix); // everything starts far
      pair.hi.setMatrixAt(slot, zeroMatrix);
      // Small blocker only: the slab base sits in unwalkable steep ground; a
      // full-width circle would wall off legitimate meadow at the cliff foot.
      blockers.push({ radius: Math.min(sx * 0.25, 5), x: site.x, z: site.z });
      return { matrix: matrix.clone(), near: false, slot, x: site.x, y: site.baseY, z: site.z };
    });
    pair.hi.instanceMatrix.needsUpdate = true;
    pair.lo.instanceMatrix.needsUpdate = true;
    lodSets.push({ entries, pair });
  });
  console.info(`cliff slabs: ${sites.length} instanced (hi/lo LOD)`);

  // Same swap the forest uses: near sites live in the hi mesh, far in lo.
  const nearSq = ROCK_LOD_DISTANCE * ROCK_LOD_DISTANCE;
  return (focus) => {
    for (const { entries, pair } of lodSets) {
      let dirty = false;
      for (const entry of entries) {
        const dx = entry.x - focus.x;
        const dy = entry.y - focus.y;
        const dz = entry.z - focus.z;
        const near = (dx * dx + dy * dy + dz * dz) < nearSq;
        if (near === entry.near) continue;
        entry.near = near;
        pair.hi.setMatrixAt(entry.slot, near ? entry.matrix : zeroMatrix);
        pair.lo.setMatrixAt(entry.slot, near ? zeroMatrix : entry.matrix);
        dirty = true;
      }
      if (dirty) {
        pair.hi.instanceMatrix.needsUpdate = true;
        pair.lo.instanceMatrix.needsUpdate = true;
      }
    }
  };
}

// -------------------------------------------------------------- character

const CLIP_NAMES = {
  idle: ['Idle_Loop', 'Idle'],
  jump: ['Jump_Start', 'Jump_Loop', 'Jump'],
  run: ['Sprint_Loop', 'Jog_Fwd_Loop', 'Running', 'Run'],
  swim: ['Swim_Fwd_Loop', 'Swimming', 'Swim'],
  tread: ['Swim_Idle_Loop', 'Treading_Water', 'TreadingWater'],
  walk: ['Walk_Loop', 'Walking', 'Walk'],
};

async function loadCharacter() {
  const asset = await loadModelAsset('/characters/mannequin.glb');
  applyToonShader(asset.root, {
    settings: createToonSettings({ preset: 'call_me_sensei' }),
  });
  const character = new THREE.Group();
  character.add(asset.root);
  character.position.set(WORLD.spawn.x, heightAt(WORLD.spawn.x, WORLD.spawn.z), WORLD.spawn.z);
  character.rotation.y = -Math.PI / 2; // face the map interior (the rim looms to the east)

  const mixer = new THREE.AnimationMixer(asset.root);
  const actions = {};
  for (const [role, names] of Object.entries(CLIP_NAMES)) {
    const clip = names.map((name) => THREE.AnimationClip.findByName(asset.clips, name)).find(Boolean);
    if (clip) actions[role] = mixer.clipAction(clip);
  }
  // Prefer the procedural freestyle crawl (windmill strokes, flutter kick,
  // breathing) over the canned Swim_Fwd_Loop. Must run while the skeleton
  // is still in bind pose — i.e. before any action plays.
  let skinnedMesh = null;
  asset.root.traverse((object) => { skinnedMesh ??= object.isSkinnedMesh ? object : null; });
  if (skinnedMesh) {
    const rig = resolveCharacterRig(skinnedMesh, {});
    if (rig) {
      try {
        actions.freestyle = mixer.clipAction(createFreestyleSwimClip(skinnedMesh, rig, {
          clipName: 'FreestyleSwim',
          trackNameStyle: 'node',
        }));
      } catch (error) {
        console.warn('freestyle swim unavailable, using native clip:', error.message);
      }
    }
  }
  actions.idle?.play();
  return { actions, character, mixer };
}

// ------------------------------------------------------------------- app

const keys = new Set();
window.addEventListener('keydown', (event) => keys.add(event.code));
window.addEventListener('keyup', (event) => keys.delete(event.code));

async function main() {
  const params = new URLSearchParams(location.search);
  const renderer = new WebGPURenderer({
    antialias: true,
    forceWebGL: params.get('renderer') === 'webgl',
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  // ?dpr=1 caps the render resolution — the single biggest perf lever on
  // retina displays (dpr 2 = 4× the pixels of dpr 1).
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, Number(params.get('dpr')) || 2));
  renderer.shadowMap.enabled = true;
  (window.__toonlabHostMount ?? document.body).appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 600);

  // Generated terrain: URL params pick the world, the generator guarantees
  // it's valid (waterline solved from coverage, spawn probed, biome paint
  // in relief-relative bands). ?seed=… re-rolls everything downstream too —
  // rocks, cliffs, forests, and reeds all derive from heightAt/waterLevel.
  const terrain = createStylizedTerrain({
    archetype: params.get('archetype') ?? 'lushKarst',
    depth: params.has('d') ? Number(params.get('d')) : undefined,
    floatingIslands: params.has('islands')
      ? { count: Number(params.get('islands')) || 3 }
      : false,
    height: params.has('h') ? Number(params.get('h')) : undefined,
    seed: Number(params.get('seed')) || 20260712,
    // Karst dolines by default (?holes=0 disables, ?holes=N re-rolls) —
    // sheer-walled pits; one carved below the waterline becomes a cenote.
    sinkholes: (() => {
      const n = params.has('holes') ? Number(params.get('holes')) : 2;
      return n > 0 ? { count: n } : false;
    })(),
    size: { x: Number(params.get('sx')) || 1000, z: Number(params.get('sz')) || 1000 },
    waterCoverage: params.has('water') ? Number(params.get('water')) : undefined,
  });
  heightAt = terrain.heightAt;
  WORLD.seed = terrain.resolvedSeed;
  WORLD.spawn = terrain.spawn;
  WORLD.waterLevel = terrain.waterLevel;
  WORLD.width = terrain.size.x;
  WORLD.depth = terrain.size.z;
  WORLD.bounds = { x: terrain.size.x / 2 - 20, z: terrain.size.z / 2 - 20 };
  console.info(`terrain: ${terrain.archetype} seed ${terrain.resolvedSeed} `
    + `wl ${terrain.waterLevel.toFixed(1)} spawn (${Math.round(terrain.spawn.x)}, ${Math.round(terrain.spawn.z)})`);

  // Terrain + rocks under one root: createStylizedWorld shades everything
  // parented there with the environment shader in one pass.
  const terrainRoot = new THREE.Group();
  terrainRoot.add(terrain.root);
  const rocks = buildRocks();
  terrainRoot.add(rocks.group);
  scene.add(terrainRoot);

  // Generated terrain already carries ToonLab's warm banded-limestone
  // triplanar map. Hosts can replace `material.userData.envTriplanarMap`
  // for bespoke art direction; the golden path needs no missing asset or
  // private texture to produce geological cliff faces.

  const { actions, character, mixer } = await loadCharacter();
  scene.add(character);

  // Forests cluster in noise patches instead of uniform sprinkling —
  // uniform scatter reads as confetti from any aerial camera.
  const forestPatches = createNoisePatchMask({ scale: 0.0048, seed: 77, threshold: 0.43 });

  const world = await createStylizedWorld({
    camera,
    environment: {
      // Terrain and rockgen assets already ship generation-time vertex/SDF
      // AO. Skip the scene ray bake: the result is present without a long
      // boot stall, and soft object contact is a bounded instanced layer.
      bakeVertexAo: false,
      // No look overrides here: this example is the visual regression target
      // for the production-grade outdoorGameplay / Call Me Sensei defaults.
      // Games can still override them, but the golden path must look finished
      // without copying a private pile of lighting and atmosphere numbers.
    },
    // Perf-triage toggles (?nograss=1 &notrees=1 &noshadow=1 &noflowers=1
    // &nowater=1): isolate each system's frame cost under the FPS meter.
    flowers: params.has('noflowers') ? false : { scatter: { density: 0.8, radius: 30, seed: 11 } },
    followTarget: character,
    grass: params.has('nograss') ? false : {},
    // The living layer (?birds=0&butterflies=0&dragonflies=0&fish=0 for
    // per-species perf triage; ?nofauna kills the cluster).
    fauna: params.has('nofauna') ? false : {
      seed: Number(params.get('seed')) || 20260712,
      species: {
        birds: params.has('birds') ? Number(params.get('birds')) || 0 : 40,
        butterflies: params.has('butterflies') ? Number(params.get('butterflies')) || 0 : 60,
        dragonflies: params.has('dragonflies') ? Number(params.get('dragonflies')) || 0 : 12,
        fish: params.has('fish') ? Number(params.get('fish')) || 0 : 80,
      },
    },
    // Ambient atmosphere (?nofx=1 disables; ?fireflies=2&petals=0 etc.
    // scale or kill individual effects for perf triage).
    ambientfx: params.has('nofx') ? false : {
      effects: Object.fromEntries(['petals', 'leaves', 'fireflies', 'pollen', 'mist']
        .map((id) => [id, params.has(id)
          ? (Number(params.get(id)) > 0 ? { density: Number(params.get(id)) } : false)
          : true])),
      seed: Number(params.get('seed')) || 20260712,
      timeOfDay: 14, // matches the 2 PM sun; swap for a game clock when one exists
    },
    // Civilization layer: ?villages=2&shrines=1 grows named settlements
    // connected by roads (the M4 beat). POI street routes merge into the
    // path network automatically.
    pois: params.has('villages') || params.has('shrines') || params.has('hamlets') ? {
      pierHamlets: Number(params.get('hamlets')) || 0,
      seed: Number(params.get('seed')) || 20260712,
      shrines: Number(params.get('shrines')) || 0,
      // keep settlements inside the walkable clamp, off the decorative rim
      size: { x: WORLD.bounds.x * 2, z: WORLD.bounds.z * 2 },
      villages: Number(params.get('villages')) || 0,
    } : false,
    // Path network: seeded routes between probed points of interest, with
    // bridges over water. ?paths=N sets the destination count, ?nopaths=1
    // (or ?paths=0) removes the network for perf triage.
    paths: params.has('nopaths') || params.get('paths') === '0' ? false : {
      auto: {
        count: Number(params.get('paths')) || 4,
        styles: ['dirt', 'dirt', 'stone'],
      },
      seed: Number(params.get('seed')) || 20260712,
      // Cheaper water crossings than the library default: this lake-heavy
      // terrain should grow a bridge or two instead of always detouring.
      settings: { routing: { waterCost: 6 } },
    },
    shadows: params.has('noshadow') ? false : undefined,
    renderer,
    scene,
    sky: {
      settings: {
        // Big puffy cumulus with blue-shaded bottoms against a saturated
        // cerulean — the reference sky IS the vividness of the scene: it
        // tints the fog, the water, and every shadow.
        cloudCoverage: 0.46,
        cloudScale: 1.05, // lower = larger, calmer puffs
        cloudColor: [1.0, 1.0, 1.0],
        cloudShadeColor: [0.6, 0.74, 0.96],
        horizonColor: [0.6, 0.87, 1.0],
        horizonScattering: 0.55,
        sunColor: [1.0, 0.97, 0.88],
        sunDirection: [-0.4, 0.82, -0.3], // 2 PM summer sun: high, warm-white, crisp short shadows
        sunGlowStrength: 1.15,
        sunSize: 0.028,
        zenithColor: [0.09, 0.47, 0.93], // saturated cerulean — the reference sky
      },
    },
    // size = water extent; the rim terrain beyond it sits above the waterline
    terrain: {
      heightAt,
      root: terrainRoot,
      // Water extent: playable area + margin, short of the rim.
      size: { depth: terrain.meshExtent.z * 0.8, width: terrain.meshExtent.x * 0.8 },
    },
    trees: params.has('notrees') ? false : {
      center: { x: 0, z: 0 },
      // Deliberately use the world preset palette here: this example is the
      // visual regression target for the public default, not a hidden fix.
      settings: { leafShape: { preset: 'round' } },
      mask: forestPatches,
      scatter: { radius: Math.max(WORLD.bounds.x, WORLD.bounds.z) },
    },
    water: params.has('nowater') ? false : {
      level: WORLD.waterLevel,
      settings: {
        // The water re-renders the scene for refraction/reflection; at
        // open-world scene sizes those passes must not run full-res.
        passes: { reflectionScale: 0.4, sceneColorScale: 0.6 },
        quality: 'medium',
      },
    },
  });
  console.info(`forest: ${world.forest?.count ?? 0} trees (LOD instanced)`);

  // Static reed band along every shoreline — the waterline never sits bare.
  const { StylizedGrassField } = await import('@call-me-sensei/toonlab/vegetation');
  const reedPlacements = scatterInRect({
    count: 5200,
    heightAt,
    mask: (x, z) => {
      const y = heightAt(x, z);
      return y > WORLD.waterLevel + 0.05 && y < WORLD.waterLevel + 2.2;
    },
    max: { x: WORLD.bounds.x, z: WORLD.bounds.z },
    min: { x: -WORLD.bounds.x, z: -WORLD.bounds.z },
    seed: 23,
  });
  if (!params.has('noreeds') && reedPlacements.length > 0) {
    const reeds = new StylizedGrassField({
      baseColor: [0.4, 0.58, 0.24],
      bladeHeightRange: [0.55, 1.05],
      bladeWidthRange: [0.05, 0.09],
      placements: reedPlacements,
      tipColor: [0.7, 0.82, 0.38],
      windStrength: 0.22,
    });
    reeds.userData.waterExclude = true; // skip all water scene passes
    scene.add(reeds);
    window.toonReeds = reeds;
  }
  // Rocks are solid: register their blocker circles with the world's
  // collision service (tree trunks are pre-registered by createStylizedWorld).
  world.collision.addCircles(rocks.blockers);
  if (params.get('envDebug')) {
    const { setEnvironmentDebugOutput } = await import('@call-me-sensei/toonlab/environment');
    setEnvironmentDebugOutput(terrainRoot, params.get('envDebug'));
  }

  // Hero tree beside the spawn: a live StylizedTree whose canopy shadow
  // falls across the meadow toward the character — the visual check that
  // the follow-the-player shadow window is working.
  const heroTree = new StylizedTree({
    canopyColor: 0x5fb54c,
    leafShape: { preset: 'round' }, // broad leaf
    preset: 'call_me_sensei',
    seed: 5,
    size: 2.7,
  });
  const heroX = WORLD.spawn.x - 6;
  const heroZ = WORLD.spawn.z - 5;
  heroTree.position.set(heroX, heightAt(heroX, heroZ), heroZ);
  heroTree.traverse((object) => { if (object.isMesh) object.castShadow = true; });
  scene.add(heroTree);

  // Floating islands get their own live trees, planted on the island's
  // topAt() surface sampler — sky gardens, not bare rocks.
  const islandTrees = [];
  terrain.islands.forEach((island, i) => {
    const count = 2 + (i % 2);
    for (let t = 0; t < count; t += 1) {
      const angle = i * 2.4 + t * 2.1;
      const r = island.radius * (0.15 + 0.09 * ((i * 29 + t * 53) % 5));
      const x = island.x + Math.cos(angle) * r;
      const z = island.z + Math.sin(angle) * r;
      const tree = new StylizedTree({
        canopyColor: [0x5fb54c, 0x6cc258, 0xe8bb4f][(i + t) % 3],
        leafShape: { preset: 'round' },
        preset: 'call_me_sensei',
        seed: i * 31 + t * 7 + 2,
        size: 1.5 + ((i + t) % 3) * 0.3,
      });
      tree.position.set(x, island.topAt(x, z) - 0.15, z);
      tree.traverse((object) => { if (object.isMesh) object.castShadow = true; });
      scene.add(tree);
      islandTrees.push(tree);
    }
  });
  world.collision.addCircle(heroX, heroZ, 0.45); // hand-placed objects need blockers too

  // Character render passes (self shadow, rim depth, bloom mask) + post.
  const passes = createCharacterRenderPasses({ camera, renderer, scene });
  passes.registerCharacterRoot(character);
  const post = createPostProcessingPipeline({
    camera, renderer, scene,
    settings: { preset: 'call_me_sensei' },
  });
  if (passes.characterMaskTexture) post.setCharacterMask(passes.characterMaskTexture);

  // Distance haze on top of height fog: blue depth cue + a touch of bloom.
  const setAtmosphere = (near, far, strength) => post.setSettings({
    features: { bloom: true, depthCue: true, vignette: true },
    parameters: {
      bloomStrength: 0.18,
      bloomThreshold: 0.92,
      depthCueColor: [0.64, 0.79, 0.95],
      depthCueFar: far,
      depthCueNear: near,
      depthCueStrength: strength,
    },
  });

  // ------------------------------------------------------------- views

  const forward = new THREE.Vector3();
  const movement = new THREE.Vector3();
  let currentAction = actions.idle ?? null;
  const play = (action) => {
    if (!action || action === currentAction) return;
    currentAction?.fadeOut(0.2);
    action.reset().fadeIn(0.2).play();
    currentAction = action;
  };

  // Third-person orbit camera: drag rotates, wheel zooms, movement is
  // camera-relative.
  const orbit = { dist: 7, pitch: 0.3, yaw: Math.PI / 2 };
  const vertical = { grounded: true, velocity: 0 };
  renderer.domElement.addEventListener('pointerdown', (event) => {
    renderer.domElement.setPointerCapture(event.pointerId);
    orbit.dragging = true;
  });
  window.addEventListener('pointerup', () => { orbit.dragging = false; });
  window.addEventListener('pointermove', (event) => {
    if (!orbit.dragging) return;
    orbit.yaw -= event.movementX * 0.005;
    orbit.pitch = Math.min(Math.max(orbit.pitch + event.movementY * 0.004, -0.15), 1.15);
  });
  renderer.domElement.addEventListener('wheel', (event) => {
    event.preventDefault();
    orbit.dist = Math.min(Math.max(orbit.dist + event.deltaY * 0.01, 3), 16);
  }, { passive: false });

  const explore = {
    atmosphere: [160, 1250, 0.4],
    camera: { far: 4000, fov: 45, near: 0.4 },
    fog: [180, 2500],
    heightFogDensity: 0.00055,
    update(delta) {
      camera.getWorldDirection(forward);
      forward.y = 0;
      forward.normalize();
      const right = new THREE.Vector3(forward.z, 0, -forward.x);
      movement.set(0, 0, 0);
      if (keys.has('KeyW') || keys.has('ArrowUp')) movement.add(forward);
      if (keys.has('KeyS') || keys.has('ArrowDown')) movement.sub(forward);
      if (keys.has('KeyA') || keys.has('ArrowLeft')) movement.add(right);
      if (keys.has('KeyD') || keys.has('ArrowRight')) movement.sub(right);
      const moving = movement.lengthSq() > 0;
      const running = moving && (keys.has('ShiftLeft') || keys.has('ShiftRight'));
      // Ground through the collision service, not raw heightAt: on a path
      // the flattened ribbon profile wins, and on a bridge the deck carries
      // the character over the water instead of dropping them into a swim.
      const ground = world.collision.groundHeight(character.position.x, character.position.z);
      // Deep water → swim: float on the actual wave surface (CPU-mirrored
      // Gerstner heights), slower movement, swim/tread clips.
      const swimming = ground < WORLD.waterLevel - 1.1;
      const fastSwim = swimming && running && Boolean(actions.freestyle);
      if (moving) {
        movement.normalize();
        const speed = swimming ? (fastSwim ? 3.0 : 1.7) : running ? 5.2 : 2.1;
        character.position.addScaledVector(movement, speed * delta);
        character.position.x = Math.min(Math.max(character.position.x, -WORLD.bounds.x), WORLD.bounds.x);
        character.position.z = Math.min(Math.max(character.position.z, -WORLD.bounds.z), WORLD.bounds.z);
        const targetYaw = Math.atan2(movement.x, movement.z);
        let yawDelta = targetYaw - character.rotation.y;
        yawDelta = Math.atan2(Math.sin(yawDelta), Math.cos(yawDelta));
        character.rotation.y += yawDelta * Math.min(delta * 10, 1);
        world.collision.resolve(character.position, 0.35); // solid trunks/rocks
      }
      if (swimming) {
        vertical.velocity = 0;
        const surface = world.water?.getHeightAt(character.position.x, character.position.z)
          ?? WORLD.waterLevel;
        character.position.y = surface - 1.45 + 0.18; // chest at the waterline
        // Water Lab convention: calm native swim by default, procedural
        // freestyle on Shift, stroke cadence driven by actual speed.
        const swimAction = moving
          ? (fastSwim ? actions.freestyle : (actions.swim ?? actions.freestyle ?? actions.walk))
          : (actions.tread ?? actions.swim ?? actions.idle);
        play(swimAction);
        if (moving && swimAction) {
          swimAction.timeScale = THREE.MathUtils.clamp((fastSwim ? 3.0 : 1.7) / 1.7, 0.75, 1.35);
        }
      } else {
        if ((keys.has('Space')) && vertical.grounded) {
          vertical.velocity = 5.4;
          vertical.grounded = false;
          if (actions.jump) play(actions.jump);
        }
        vertical.velocity -= 15 * delta;
        const floor = Math.max(ground, WORLD.waterLevel - 0.8); // wade in shallows
        character.position.y = Math.max(character.position.y + vertical.velocity * delta, floor);
        vertical.grounded = character.position.y <= floor + 0.01;
        if (vertical.grounded) {
          vertical.velocity = 0;
          const groundAction = running ? (actions.run ?? actions.walk) : moving ? actions.walk : actions.idle;
          play(groundAction);
          if (moving && groundAction) {
            groundAction.timeScale = running
              ? THREE.MathUtils.clamp(5.2 / 3.0, 0.75, 1.35)
              : THREE.MathUtils.clamp(2.1 / 1.45, 0.65, 1.45);
          }
        }
      }

      const horizontal = Math.cos(orbit.pitch) * orbit.dist;
      const desired = new THREE.Vector3(
        character.position.x - Math.sin(orbit.yaw) * horizontal,
        character.position.y + Math.sin(orbit.pitch) * orbit.dist + 1.6,
        character.position.z - Math.cos(orbit.yaw) * horizontal,
      );
      // never sink the camera into the terrain
      desired.y = Math.max(desired.y, heightAt(desired.x, desired.z) + 1.2);
      camera.position.lerp(desired, 1 - Math.exp(-8 * delta));
      camera.lookAt(character.position.x, character.position.y + 1.4, character.position.z);
    },
  };

  let flyTime = 0;
  const flyover = {
    // Light haze only: the aerial view is where the palette has to sing —
    // heavy depth cue at altitude grays the entire frame.
    atmosphere: [420, 1900, 0.14],
    camera: { far: 4000, fov: 52, near: 0.5 },
    fog: [420, 3000],
    heightFogDensity: 0.00035,
    update(delta) {
      flyTime += delta * 0.05;
      const radius = 330 + Math.sin(flyTime * 0.7) * 90;
      camera.position.set(
        Math.cos(flyTime) * radius,
        170 + Math.sin(flyTime * 1.3) * 35,
        Math.sin(flyTime) * radius,
      );
      const ahead = flyTime + 0.25;
      camera.lookAt(Math.cos(ahead) * radius * 0.35, 15, Math.sin(ahead) * radius * 0.35);
    },
  };

  const pan = new THREE.Vector3(0, 0, 0);
  const topdown = {
    atmosphere: [700, 2400, 0.1],
    camera: { far: 4000, fov: 40, near: 1 },
    fog: [650, 3000],
    heightFogDensity: 0.00022,
    update(delta) {
      const speed = 180 * delta;
      if (keys.has('KeyW')) pan.z -= speed;
      if (keys.has('KeyS')) pan.z += speed;
      if (keys.has('KeyA')) pan.x -= speed;
      if (keys.has('KeyD')) pan.x += speed;
      camera.position.set(pan.x, 520, pan.z + 1); // +1 keeps lookAt stable
      camera.lookAt(pan.x, 0, pan.z);
    },
  };

  const views = { explore, flyover, topdown };
  let activeView = 'explore';
  // Height fog is authored for the ground-level camera; from altitude the
  // same density washes the whole frame gray. Each view sets its own density
  // — terrain, water, and tree far proxies together, or they visibly split.
  const setHeightFogDensity = (density) => {
    terrainRoot.traverse((object) => {
      const uniform = object.material?.uniforms?.heightFogDensity;
      if (uniform) uniform.value = density;
    });
    world.water?.setDistanceFog?.({ density });
    world.forest?.setDistanceFog?.({ density });
  };
  function setView(name) {
    activeView = name;
    const spec = views[name].camera;
    camera.fov = spec.fov;
    camera.near = spec.near;
    camera.far = spec.far;
    camera.updateProjectionMatrix();
    if (world.fog && views[name].fog) {
      [world.fog.near, world.fog.far] = views[name].fog;
    }
    setHeightFogDensity(views[name].heightFogDensity ?? 0.00055);
    setAtmosphere(...views[name].atmosphere);
    for (const button of document.querySelectorAll('#hud button')) {
      button.dataset.active = String(button.id === `view-${name}`);
    }
  }
  for (const name of Object.keys(views)) {
    document.getElementById(`view-${name}`).addEventListener('click', () => setView(name));
  }
  window.addEventListener('keydown', (event) => {
    if (event.code === 'Digit1') setView('explore');
    if (event.code === 'Digit2') setView('flyover');
    if (event.code === 'Digit3') setView('topdown');
  });
  setAtmosphere(...explore.atmosphere);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.setSize(window.innerWidth, window.innerHeight, Math.min(window.devicePixelRatio, 2));
  });

  // Minimap: click anywhere on it to travel there. Fast travel lands the
  // mannequin on the ground (or wading depth over water) and switches to
  // explore so the jump is visible from any view.
  const travelTo = (x, z) => {
    character.position.x = Math.min(Math.max(x, -WORLD.bounds.x), WORLD.bounds.x);
    character.position.z = Math.min(Math.max(z, -WORLD.bounds.z), WORLD.bounds.z);
    const ground = world.collision.groundHeight(character.position.x, character.position.z);
    character.position.y = Math.max(ground, WORLD.waterLevel - 0.8);
    vertical.velocity = 0;
    vertical.grounded = true;
    world.collision.resolve(character.position, 0.35);
    setView('explore');
  };
  // POI markers: named places on both maps (click to travel).
  const poiMarkers = (world.pois ?? []).map((poi) => ({
    color: poi.archetype === 'shrine' ? '#f4c96b' : '#f4e9c8',
    label: poi.name,
    x: poi.center.x,
    z: poi.center.z,
  }));
  const minimap = createWorldMinimap({
    heightAt,
    markers: poiMarkers,
    onPick: travelTo,
    paths: world.paths, // network overlay baked into the base layer
    size: Math.max(WORLD.width, WORLD.depth), // minimap is square; rect worlds letterbox
    waterLevel: WORLD.waterLevel,
  });
  document.getElementById('minimap').appendChild(minimap.canvas);

  // Full map: same renderer at higher resolution, as a click-to-travel
  // overlay. ⤢ button, M toggles, Esc closes.
  const bigmapEl = document.getElementById('bigmap');
  const bigmap = createWorldMinimap({
    displaySize: Math.min(window.innerHeight - 120, 720),
    heightAt,
    markers: poiMarkers,
    onPick: (x, z) => { travelTo(x, z); bigmapEl.hidden = true; },
    paths: world.paths,
    resolution: 512,
    size: Math.max(WORLD.width, WORLD.depth), // minimap is square; rect worlds letterbox
    waterLevel: WORLD.waterLevel,
  });
  bigmapEl.appendChild(bigmap.canvas);
  const toggleBigmap = (open = bigmapEl.hidden) => { bigmapEl.hidden = !open; };
  document.getElementById('map-expand').addEventListener('click', () => toggleBigmap(true));
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') toggleBigmap();
    if (event.code === 'Escape') toggleBigmap(false);
  });

  // Set dressing along the road network: ranch fences line the first route,
  // stone tōrō lanterns pace every route. One placeAlongSpline call each —
  // the placement pipeline grounds, collides, instances, and LODs them.
  // (?noprops=1 removes the dressing for perf triage.)
  const propUpdaters = [];
  if (!params.has('noprops') && world.paths?.splines?.length) {
    const {
      createPropAsset, placeAlongSpline,
    } = await import('@call-me-sensei/toonlab/propgen');
    const {
      applyEnvironmentShader,
      resolveEnvironmentPreset,
    } = await import('@call-me-sensei/toonlab/environment');
    const propsRoot = new THREE.Group();
    propsRoot.name = 'PathDressing';
    const worldSeed = Number(params.get('seed')) || 20260712;
    const fence = createPropAsset({ asset: { seed: worldSeed, type: 'fence', variant: 'ranch' } });
    const lantern = createPropAsset({ asset: { seed: worldSeed + 1, type: 'lantern', variant: 'stoneToro' } });
    // Dressing stays on dry land — the road may bridge water, its fences
    // and lanterns must not march into it.
    const dryLand = (x, z) => heightAt(x, z) > WORLD.waterLevel + 0.25;
    world.paths.splines.forEach((spline, index) => {
      if (index === 0) {
        placeAlongSpline({
          asset: fence,
          collision: world.collision,
          heightAt: world.paths.heightAt,
          mask: dryLand,
          offset: 2.7,
          parent: propsRoot,
          seed: worldSeed + 11 + index,
          sides: [1],
          spacing: 2.2,
          spline,
        });
      }
      const lanterns = placeAlongSpline({
        asset: lantern,
        collision: world.collision,
        heightAt: world.paths.heightAt,
        mask: dryLand,
        offset: 2.5,
        parent: propsRoot,
        seed: worldSeed + 31 + index,
        sides: [-1],
        spacing: 28,
        spline,
      });
      propUpdaters.push(lanterns.update);
    });
    // The world's environment conversion ran at creation; dressing added
    // afterwards converts itself with the same fog/palette parameters.
    await applyEnvironmentShader(
      propsRoot,
      resolveEnvironmentPreset('call_me_sensei', 'exteriorDay'),
    );
    terrainRoot.add(propsRoot);
  }

  window.toonWorld = world; // console access for debugging
  window.toonTerrain = terrain;
  window.toonOrbit = orbit; // headless probes aim the explore camera
  window.toonTravel = travelTo;
  window.toonCharacter = character;
  document.getElementById('loading').remove();
  document.body.dataset.worldReady = 'true'; // headless smoke checks key off this
  // Path network stats for headless probes (screenshot/perf harnesses).
  document.body.dataset.pathRoutes = String(world.paths?.routes?.length ?? 0);
  document.body.dataset.pathBridges = String(world.paths?.bridges?.length ?? 0);
  document.body.dataset.pathTriangles = String(world.paths?.stats?.triangles ?? 0);
  document.body.dataset.poiCount = String(world.pois?.length ?? 0);
  document.body.dataset.poiNames = (world.pois ?? []).map((poi) => poi.name).join('|');

  const fpsLabel = document.getElementById('fps');
  // Which backend actually won: WebGPURenderer silently falls back to
  // WebGL2 where WebGPU is unavailable, and the two perform differently —
  // show it next to the frame rate so perf reports are unambiguous.
  const backendName = renderer.backend?.isWebGPUBackend ? 'WebGPU' : 'WebGL2';
  let fpsFrames = 0;
  let fpsTime = 0;
  const clock = new THREE.Clock();
  let rockLodTimer = 0.4; // assign LOD on the first frame
  const rockLodFocus = new THREE.Vector3();
  renderer.setAnimationLoop(() => {
    const delta = Math.min(clock.getDelta(), 0.05);
    fpsFrames += 1;
    fpsTime += delta;
    if (fpsTime >= 0.5) {
      fpsLabel.textContent = `${Math.round(fpsFrames / fpsTime)} fps · ${backendName}`;
      fpsFrames = 0;
      fpsTime = 0;
    }
    views[activeView].update(delta);
    minimap.setPlayer(character.position.x, character.position.z, character.rotation.y);
    if (!bigmapEl.hidden) bigmap.setPlayer(character.position.x, character.position.z, character.rotation.y);
    heroTree.update(delta);
    for (const tree of islandTrees) tree.update(delta);
    rockLodTimer += delta;
    if (rockLodTimer >= 0.4) {
      rockLodTimer = 0;
      rocks.updateLod(camera.getWorldPosition(rockLodFocus));
    }
    window.toonReeds?.update(delta);
    for (const update of propUpdaters) update(delta, camera); // prop LOD swaps
    mixer.update(delta);
    if (!params.has('nochar')) passes.update();
    world.update(delta);
    if (params.has('nopost')) renderer.render(scene, camera);
    else post.render(delta);
  });
}

main().catch((error) => {
  console.error(error);
  const loading = document.getElementById('loading');
  if (loading) loading.textContent = `Failed to start: ${error.message}`;
});
