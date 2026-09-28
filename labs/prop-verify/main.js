// Styled-scene verification for the generated garden props (doc 19 D-018).
//
// A turntable in a neutral rig proves geometry. It does NOT prove the prop
// survives the scene it ships into, and two things landed after these props
// were generated that change exactly that:
//
//   - `installToonLabSurfaceLighting({ shadowFill })` is now adopted scene-side
//     at 0.35 with a warm tint. Without it an occluded ToonLab surface receives
//     only the SH sky probe, whose radiance is roughly R:G:B = 1 : 2.24 : 5.33 —
//     the "arrives navy" failure.
//   - D19-080 was fixed: semantic material roles were resolving to
//     `paintedMetal` for everything through the documented style-bundle path.
//     Every prop here is surfaced through role resolution, so this lab is the
//     first real exposure to that fix.
//
// This lab therefore reproduces the Stillwater Garden lighting rig EXACTLY —
// same shadow fill, same tint, same sun azimuth offset, same time of day, same
// exposure — and renders a prop under it. The constants are duplicated
// deliberately rather than imported from the garden scene: the garden lab is
// another owner's file and this must not reach into it. They are marked so a
// post-merge pass can collapse them to a shared export.
//
// Usage:  /labs/prop-verify/?prop=lantern-yukimi&shadowFill=0.35&roles=on

import * as THREE from 'three/webgpu';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

import { installToonLabSurfaceLighting } from '@call-me-sensei/toonlab/environment';
import { resolveLightingStylePreset } from '@call-me-sensei/toonlab/lighting';
import { applyEnvironmentShader } from '../../src/environment/environmentMaterialAdapter.js';
// GARDEN_MOSS_STOPS from the shared palette module rather than from the garden owner's scene
// files, which this lab must not reach into. Same five stops, one source.
import { GARDEN_MOSS_STOPS } from '../../scripts/launch-world-material-set.mjs';

// ---------------------------------------------------------------------------
// Stillwater Garden rig constants. MUST track labs/launch-world/garden/scene.js.
// Duplicated, not imported — see header. Collapse to a shared export post-merge.
// ---------------------------------------------------------------------------
const SHADOW_FILL = 0.35;
const SHADOW_FILL_TINT = Object.freeze([1.16, 1.0, 0.86]);
const GARDEN_SUN_AZIMUTH_OFFSET = 2.653;
const TIME_OF_DAY = 10;
const EXPOSURE = 1.04;
const GARDEN_STONE_TINT = Object.freeze([0.78, 0.80, 0.82]);

// §9 material set. Every prop slot maps to a shipped recipe that clears the
// §8 hero bar (10.24 px/cm) with margin — see doc 19 D-018.
const MATERIAL_ROOT = '/assets-local/launch-world/materials';
const SLOT_MATERIALS = Object.freeze({
  // id, world tile in metres, and the semantic roles the §9 set already carries.
  granite: { id: 'MAT-GDN-03', tile: 1.6, roles: { baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque', structuralRole: 'primaryMass', objectClass: 'infrastructure' } },
  timber: { id: 'MAT-GDN-05', tile: 1.2, roles: { baseMaterial: 'wood', finish: 'raw', renderMode: 'opaque', structuralRole: 'primaryMass', objectClass: 'buildingExterior' } },
  bamboo: { id: 'MAT-GDN-08', tile: 1.0, roles: { baseMaterial: 'wood', finish: 'raw', renderMode: 'opaque', structuralRole: 'secondaryStructure', objectClass: 'infrastructure' } },
  // Street slots, added for the Stillwater Lane architecture (doc 19 D-019).
  render: { id: 'MAT-CITY-01', tile: 1.2, roles: { baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque', structuralRole: 'primaryMass', objectClass: 'buildingExterior' } },
  concrete: { id: 'MAT-CITY-01-graphite', tile: 1.2, roles: { baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque', structuralRole: 'primaryMass', objectClass: 'buildingExterior' } },
  plaster: { id: 'MAT-GDN-06', tile: 1.5, roles: { baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque', structuralRole: 'primaryMass', objectClass: 'buildingExterior' } },
  // Prop slots for PROP-LANE-01/02/03 and PROP-GDN-03. These mirror
  // labs/shared/stillwaterPropSurfacing.js exactly — that module is the one the scene owners
  // mount, and this table is the lab's local copy of the same records, kept in step by hand for
  // the same reason the rig constants above are.
  cityMetal: { id: 'MAT-CITY-02', tile: 0.6, roles: { baseMaterial: 'metal', finish: 'painted', renderMode: 'opaque', structuralRole: 'secondaryStructure', objectClass: 'infrastructure' } },
  cityStone: { id: 'MAT-CITY-01', tile: 1.2, roles: { baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque', structuralRole: 'primaryMass', objectClass: 'infrastructure' } },
  gardenCeramic: { id: 'MAT-GDN-07-plain', tile: 0.5, roles: { baseMaterial: 'ceramic', finish: 'glazed', renderMode: 'opaque', structuralRole: 'trim', objectClass: 'prop' } },
});

// Prop registry. `metres` is the MEASURED long-axis size, re-derived from the
// GLB bounds per the D19-146 standing rule — never taken from the prompt.
const PROPS = Object.freeze({
  'lantern-yukimi': { dir: 'PROP-GDN-01-lantern-yukimi', file: 'lantern-lod0.glb', metres: 1.20, slot: 'granite' },
  'lantern-kasuga': { dir: 'PROP-GDN-01-lantern-kasuga', file: 'm-kasuga-lod0.glb', metres: 2.40, slot: 'granite' },
  'lantern-oribe': { dir: 'PROP-GDN-01-lantern-oribe', file: 'm-oribe-lod0.glb', metres: 1.50, slot: 'granite' },
  tsukubai: { dir: 'PROP-GDN-01-tsukubai', file: 'm-tsukubai-lod0.glb', metres: 1.30, slot: 'granite' },
  stones: { dir: 'GAP-GDN-STEPPING-STONE-01-stones', file: 'm-stones-lod0.glb', metres: 3.50, slot: 'granite' },
  fence: { dir: 'PROP-GDN-02-bamboo-fence', file: 'fence-lod0.glb', metres: 2.00, slot: 'bamboo' },

  // Stillwater Lane architecture (doc 19 D-019). `root: 'lane'` and
  // `preScaled: true` because these GLBs are authored AT metres by
  // author-prop-lods.py — the width solve is already baked in, so re-solving on
  // the longest axis here would REPLACE a measured frontage with a guess (and
  // for a tall building the longest axis is height, not frontage). `metres`
  // below is the measured FRONTAGE width, recorded for the readout only.
  'lane-01': { root: 'lane', dir: 'ARCH-LANE-01', file: 'ARCH-LANE-01-lod0.glb', metres: 7.00, slot: 'render', preScaled: true },
  'lane-02': { root: 'lane', dir: 'ARCH-LANE-02', file: 'ARCH-LANE-02-lod0.glb', metres: 8.00, slot: 'render', preScaled: true },
  'lane-03': { root: 'lane', dir: 'ARCH-LANE-03', file: 'ARCH-LANE-03-lod0.glb', metres: 6.00, slot: 'concrete', preScaled: true },
  'lane-04': { root: 'lane', dir: 'ARCH-LANE-04', file: 'ARCH-LANE-04-lod0.glb', metres: 9.50, slot: 'concrete', preScaled: true },
  'lane-gate': { root: 'lane', dir: 'ARCH-GDN-02', file: 'ARCH-GDN-02-lod0.glb', metres: 6.00, slot: 'plaster', preScaled: true },

  // PROP-LANE-01/02/03 and PROP-GDN-03 (doc 19 D-020). Every one of these is authored AT
  // metres by author-prop-group.py — each object was scaled independently from its own real
  // dimension, because the D-018a group recipe's coherent-size claim did not survive
  // measurement. So `preScaled: true` throughout: re-solving the longest axis here would throw
  // away a measured dimension and replace it with a guess. `metres` is the recorded solve axis
  // value, for the readout.
  'lane-signal-pole': { root: 'props/lane', dir: 'PROP-LANE-01/signal-pole', file: 'signal-pole-lod0.glb', metres: 5.00, slot: 'cityMetal', preScaled: true },
  'lane-wall-lamp': { root: 'props/lane', dir: 'PROP-LANE-01/wall-lamp', file: 'wall-lamp-lod0.glb', metres: 3.40, slot: 'cityStone', preScaled: true },
  'lane-guard-rail': { root: 'props/lane', dir: 'PROP-LANE-01/guard-rail', file: 'guard-rail-lod0.glb', metres: 1.10, slot: 'cityMetal', preScaled: true },
  'lane-bollard': { root: 'props/lane', dir: 'PROP-LANE-01/bollard', file: 'bollard-lod0.glb', metres: 0.90, slot: 'cityStone', preScaled: true },
  'lane-drain-grates': { root: 'props/lane', dir: 'PROP-LANE-01/drain-grates', file: 'drain-grates-lod0.glb', metres: 1.20, slot: 'cityMetal', preScaled: true },
  'lane-manhole': { root: 'props/lane', dir: 'PROP-LANE-01/manhole', file: 'manhole-lod0.glb', metres: 0.90, slot: 'cityMetal', preScaled: true },
  'lane-utility-cabinet': { root: 'props/lane', dir: 'PROP-LANE-01/utility-cabinet', file: 'utility-cabinet-lod0.glb', metres: 1.35, slot: 'cityMetal', preScaled: true },
  'lane-standpipe': { root: 'props/lane', dir: 'PROP-LANE-01/standpipe', file: 'standpipe-lod0.glb', metres: 1.00, slot: 'cityMetal', preScaled: true },
  'lane-vending': { root: 'props/lane', dir: 'PROP-LANE-02/vending-machine', file: 'vending-machine-lod0.glb', metres: 1.95, slot: 'cityMetal', preScaled: true },
  'lane-crates': { root: 'props/lane', dir: 'PROP-LANE-02/crates', file: 'crates-lod0.glb', metres: 0.90, slot: 'cityMetal', preScaled: true },
  'lane-barrel': { root: 'props/lane', dir: 'PROP-LANE-02/barrel', file: 'barrel-lod0.glb', metres: 0.88, slot: 'cityMetal', preScaled: true },
  'lane-cone': { root: 'props/lane', dir: 'PROP-LANE-02/cones', file: 'cones-lod0.glb', metres: 0.70, slot: 'cityMetal', preScaled: true },
  'lane-waste-bin': { root: 'props/lane', dir: 'PROP-LANE-02/waste-bin', file: 'waste-bin-lod0.glb', metres: 0.95, slot: 'cityMetal', preScaled: true },
  'lane-street-planter': { root: 'props/lane', dir: 'PROP-LANE-02/street-planter', file: 'street-planter-lod0.glb', metres: 0.55, slot: 'gardenCeramic', preScaled: true },
  'lane-pole-crossarm': { root: 'props/lane', dir: 'PROP-LANE-03/pole-crossarm', file: 'pole-crossarm-lod0.glb', metres: 10.00, slot: 'cityStone', preScaled: true },
  'lane-pole-transformer': { root: 'props/lane', dir: 'PROP-LANE-03/pole-transformer', file: 'pole-transformer-lod0.glb', metres: 10.00, slot: 'cityStone', preScaled: true },
  'lane-pole-stay': { root: 'props/lane', dir: 'PROP-LANE-03/pole-stay', file: 'pole-stay-lod0.glb', metres: 10.00, slot: 'cityStone', preScaled: true },
  'lane-pole-junction': { root: 'props/lane', dir: 'PROP-LANE-03/pole-junction', file: 'pole-junction-lod0.glb', metres: 10.00, slot: 'cityStone', preScaled: true },
  'lane-pole-short': { root: 'props/lane', dir: 'PROP-LANE-03/pole-short', file: 'pole-short-lod0.glb', metres: 6.50, slot: 'cityStone', preScaled: true },
  kerb: { dir: 'PROP-GDN-03-kerb/kerb-01', file: 'kerb-01-lod0.glb', metres: 0.90, slot: 'granite', preScaled: true },
  'planter-bowl': { dir: 'PROP-GDN-03-planters/planter-bowl', file: 'planter-bowl-lod0.glb', metres: 0.55, slot: 'gardenCeramic', preScaled: true },
  'planter-cylinder': { dir: 'PROP-GDN-03-planters/planter-cylinder', file: 'planter-cylinder-lod0.glb', metres: 0.75, slot: 'gardenCeramic', preScaled: true },
  'planter-pot': { dir: 'PROP-GDN-03-planters/planter-pot', file: 'planter-pot-lod0.glb', metres: 0.45, slot: 'gardenCeramic', preScaled: true },
  'planter-box': { dir: 'PROP-GDN-03-planters/planter-box', file: 'planter-box-lod0.glb', metres: 0.50, slot: 'timber', preScaled: true },
  'planter-trough': { dir: 'PROP-GDN-03-planters/planter-trough', file: 'planter-trough-lod0.glb', metres: 0.90, slot: 'granite', preScaled: true },
  'shishi-odoshi': { dir: 'PROP-GDN-03-shishi-odoshi', file: 'PROP-GDN-03-shishi-seg-lod0.glb', metres: 1.35, slot: 'bamboo', preScaled: true },
  bridge: { dir: 'PROP-GDN-03-bridge', file: 'PROP-GDN-03-bridge-seg-lod0.glb', metres: 3.20, slot: 'timber', preScaled: true },
});

const params = new URLSearchParams(location.search);
const propKey = params.get('prop') ?? 'lantern-yukimi';
const shadowFill = Number(params.get('shadowFill') ?? SHADOW_FILL);
const useRoles = (params.get('roles') ?? 'on') !== 'off';
const prop = PROPS[propKey];
const readout = document.getElementById('readout');

function log(line) {
  readout.textContent += `\n${line}`;
  console.info('[prop-verify]', line);
}

// ---------------------------------------------------------------------------
// Renderer, camera, scene
// ---------------------------------------------------------------------------
const stage = document.getElementById('stage');
const renderer = new THREE.WebGPURenderer({ antialias: true });
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio ?? 1, 2));
renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = EXPOSURE;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, stage.clientWidth / stage.clientHeight, 0.05, 200);

// The garden's own sun keyframe: hour 10, azimuth offset 2.653 rad, measured
// via az = azimuthOffset + (hour/24 - 0.5) x azimuthArc, azimuthArc = PI * 1.6.
const azimuth = GARDEN_SUN_AZIMUTH_OFFSET + (TIME_OF_DAY / 24 - 0.5) * Math.PI * 1.6;
const elevation = THREE.MathUtils.degToRad(42);
const sun = new THREE.DirectionalLight(0xfff2dc, 7.4 / Math.PI);
sun.position.set(
  Math.cos(elevation) * Math.sin(azimuth),
  Math.sin(elevation),
  Math.cos(elevation) * Math.cos(azimuth),
).multiplyScalar(24);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 0.5;
sun.shadow.camera.far = 80;
Object.assign(sun.shadow.camera, { top: 6, bottom: -6, left: -6, right: 6 });
scene.add(sun, sun.target);

// A ground plane so the prop has real contact shadow and a bounce surface,
// tinted to the garden's moss mid stop so the prop is judged against the
// colour it will actually sit on.
const groundColour = new THREE.Color(...GARDEN_MOSS_STOPS[2]);
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(40, 40),
  new THREE.MeshStandardMaterial({ color: groundColour, roughness: 0.95, metalness: 0 }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------------------
// §9 surfacing
// ---------------------------------------------------------------------------
const textureLoader = new THREE.TextureLoader();
function loadMap(id, name, srgb) {
  return new Promise((resolve, reject) => {
    textureLoader.load(`${MATERIAL_ROOT}/${id}/maps/${name}.png`, (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 8;
      resolve(texture);
    }, undefined, reject);
  });
}

/**
 * Replaces the generated atlas with a §9 recipe. The generated albedo carries
 * baked lighting and reads as glossy porcelain (doc 19 D-003 / D-018), so it is
 * discarded outright rather than blended — that discard is the whole point of
 * the D-003 pipeline.
 *
 * Returns the roles the slot carries, so the caller can hand them to
 * applyEnvironmentShader as explicit overrides.
 */
async function surface(root, slotName, longestAxisMetres) {
  const slot = SLOT_MATERIALS[slotName];
  const [albedo, normal, orm] = await Promise.all([
    loadMap(slot.id, 'albedo', true),
    loadMap(slot.id, 'normal', false),
    loadMap(slot.id, 'orm', false),
  ]);
  // Bind to the WORLD-SCALE UV set (TEXCOORD_1 -> `uv1`), authored by
  // author-prop-lods.py at one UV unit per metre. The generator's own
  // TEXCOORD_0 is an atlas unwrap with no world relationship: a tiling material
  // mapped over it stretches per island, seams at island borders, and makes the
  // authored texel density untrue. With the world set, `repeat = 1 / tile`
  // lands the recipe at exactly its authored world tile — so MAT-GDN-03's
  // 25.60 px/cm is the density actually on the surface.
  const repeat = 1 / slot.tile;
  for (const map of [albedo, normal, orm]) {
    map.repeat.setScalar(repeat);
    map.channel = 1;
  }
  void longestAxisMetres;

  let converted = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const material = new THREE.MeshStandardMaterial({
      map: albedo,
      normalMap: normal,
      roughnessMap: orm,
      aoMap: orm,
      color: new THREE.Color(...GARDEN_STONE_TINT),
      roughness: 1,
      metalness: 0,
    });
    material.userData.toonLabSemanticRoles = { ...slot.roles };
    material.userData.toonLabMaterialId = slot.id;
    object.material = material;
    converted += 1;
  });
  return { converted, roles: slot.roles, materialId: slot.id };
}

// ---------------------------------------------------------------------------
// Load, surface, style, verify
// ---------------------------------------------------------------------------
async function main() {
  if (!prop) throw new Error(`Unknown prop "${propKey}". Known: ${Object.keys(PROPS).join(', ')}`);
  readout.textContent = `prop=${propKey} shadowFill=${shadowFill} roles=${useRoles ? 'on' : 'off'}`;

  const url = `/assets-local/launch-world/${prop.root ?? 'props'}/${prop.dir}/${prop.file}`;
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;

  // D19-146 STANDING RULE: re-derive every dimension from measured bounds.
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  if (!prop.preScaled) {
    const longest = Math.max(size.x, size.y, size.z);
    const scale = prop.metres / longest;
    root.scale.setScalar(scale);
  }
  root.updateMatrixWorld(true);

  const grounded = new THREE.Box3().setFromObject(root);
  root.position.y -= grounded.min.y;
  root.updateMatrixWorld(true);
  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  log(`measured ${finalSize.x.toFixed(2)} x ${finalSize.y.toFixed(2)} x ${finalSize.z.toFixed(2)} m`);

  const surfaced = await surface(root, prop.slot, prop.metres);
  log(`surfaced ${surfaced.converted} mesh(es) with ${surfaced.materialId}`);

  const environmentRoot = new THREE.Group();
  environmentRoot.name = `Prop verify · ${propKey}`;
  environmentRoot.add(root);
  scene.add(environmentRoot);

  // applyEnvironmentShader BEFORE add is the documented order; the group is
  // parented first only so the adapter sees final world matrices.
  const environmentBox = new THREE.Box3().setFromObject(environmentRoot);
  const state = await applyEnvironmentShader(environmentRoot, {
    assetId: `launch-world/${prop.dir}`,
    environmentBox,
    hasSun: true,
    objectClass: surfaced.roles.objectClass,
    roleOverrides: useRoles ? { '*': surfaced.roles } : null,
    shaderMode: 'anime',
    // D19-150 fix: the scene's shadow fill is handed to the adapter, so every
    // material it converts joins the lighting model already carrying it. No
    // post-hoc install and no guard to miss.
    surfaceLighting: { shadowFill, shadowFillTint: [...SHADOW_FILL_TINT] },
  });
  log(`applyEnvironmentShader converted ${state?.convertedMeshCount ?? '?'} material(s)`);

  // Report what role resolution actually decided — the D19-080 exposure.
  const decided = new Set();
  for (const entry of state?.classification ?? []) decided.add(entry.role ?? 'unknown');
  log(`resolved roles: ${[...decided].join(', ') || 'none reported'}`);
  if (decided.has('paintedMetal')) log('WARNING: paintedMetal resolved — D19-080 regression?');

  // Adopt the garden's shadow fill AFTER the style bundle, per scene.js.
  // The garden scene guards on `userData.toonLabSurfaceLighting` because every
  // material it touches has already been through the style bundle. A dropped-in
  // generated prop has not, so the guard silently matches nothing and the fill
  // is inert — measured here as "adopted on 0 material(s)". Install
  // unconditionally on the prop's own materials instead, and report both counts
  // so the difference stays visible rather than looking like a pass.
  // The garden's own adoption loop, reproduced verbatim. Before the D19-150 fix
  // this matched ZERO materials on a dropped-in prop; it is kept here exactly as
  // scene code writes it, so the lab keeps proving the fix rather than papering
  // over a regression with an unconditional install.
  let filled = 0;
  environmentRoot.traverse((object) => {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!material?.userData?.toonLabSurfaceLighting) continue;
      installToonLabSurfaceLighting(material, {
        shadowFill,
        shadowFillTint: [...SHADOW_FILL_TINT],
      });
      material.needsUpdate = true;
      filled += 1;
    }
  });
  const preinstalled = state?.surfaceLightingMaterialCount ?? 0;
  // `installToonLabSurfaceLighting` silently returns on a non-NodeMaterial, so
  // counting loop iterations would report a success that never happened. Count
  // the flag AFTER the call — that is the only honest measure of an install.
  let confirmed = 0;
  const types = new Set();
  environmentRoot.traverse((object) => {
    for (const material of (Array.isArray(object.material) ? object.material : [object.material])) {
      if (!material) continue;
      types.add(`${material.type}${material.isNodeMaterial ? '(node)' : ''}`);
      if (material.userData?.toonLabSurfaceLighting) confirmed += 1;
    }
  });
  log(`shadowFill ${shadowFill}: attempted ${filled}, pre-existing ${preinstalled}, CONFIRMED ${confirmed}`);
  log(`material types: ${[...types].join(', ')}`);
  globalThis.__propVerify = { environmentRoot, scene, state };

  // Frame: a garden camera, not a turntable — eye height, close enough that the
  // §8 hero texel bar is the one actually being judged.
  const radius = finalSize.length() / 2;
  const target = finalBox.getCenter(new THREE.Vector3());
  camera.position.copy(target).add(new THREE.Vector3(radius * 2.1, radius * 0.9, radius * 2.4));
  camera.lookAt(target);
  sun.target.position.copy(target);
  sun.target.updateMatrixWorld();

  document.body.dataset.propReady = 'true';
  log('ready');
}

function resize() {
  const { clientWidth: w, clientHeight: h } = stage;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
globalThis.addEventListener('resize', resize);

renderer.setAnimationLoop(() => {
  renderer.toneMappingExposure = EXPOSURE; // D19-043: re-applied every frame.
  renderer.render(scene, camera);
});

main().catch((error) => {
  console.error(error);
  document.body.dataset.propReady = 'error';
  log(`ERROR ${error.message}`);
});
