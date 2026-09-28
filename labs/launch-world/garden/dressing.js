// Stillwater Garden — the manufactured garden furniture (PROP-GDN-01 / -02).
//
// This is the first consumer of the generated prop set, so it is also where the
// generated-asset contract gets enforced. Three traps, all recorded, all of
// which produce a plausible-looking wrong result rather than an error:
//
//   D19-143  every image-to-3D output is ONE mesh, ONE material, ONE primitive,
//            normalised to a unit long axis. There is no metric scale in the
//            file at all, so a prop placed at its authored transform is either
//            a centimetre or a hundred metres tall, never 1.4 m.
//   D19-146  the proportions do not match the prompt either — PROP-GDN-02 was
//            specified 2.0 x 1.6 m and measures 2.0 x 0.92 m once scaled on the
//            stated width. So the SHORT axis cannot be trusted to derive scale.
//   D19-144  the albedo carries baked directional lighting from the generator's
//            own three-quarter key. Binding it under the Call Me Sensei rig
//            double-lights every prop and fights the scene's 128° sun.
//
// The answers, in order: measure the bounds at load and solve the scale from a
// DECLARED metric height; drive that height off the long axis we actually
// measured rather than the prompt; and discard the generated albedo entirely,
// re-surfacing every prop with the §9 material authored for its real material.
//
// Surfacing goes through the Manufactured Surface contract, not through a
// hand-built material: `applyManufacturedMaterialManifest` stamps the semantic
// classification, the scene label declares the style role, and the Call Me
// Sensei bundle converts it on apply. That is the shipped path for an imported
// asset (`quality/launch-world-materials/proof.js` is the worked reference) and
// D19-080's fix is what makes it actually reach the shader — before that every
// classification resolved to `paintedMetal` regardless of what was declared.

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  MANUFACTURED_MATERIAL_MANIFEST_VERSION,
  applyEnvironmentShader,
} from '@call-me-sensei/toonlab/environment';

import { BOUNDARY, gardenHeight } from './terrain.js';

const PROP_ROOT = '/assets-local/launch-world/props';
const MATERIAL_ROOT = '/assets-local/launch-world/materials';

// Seeded LCG — placement and jitter must be identical run to run, because the
// filler register's equivalence test and every A/B capture depend on it.
function rng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/**
 * The §9 materials these props are actually made of.
 *
 * `worldTile` is the metre period the map was authored at (material-set.json),
 * so the repeat is solved from the prop's own measured size rather than left at
 * 1 — a 0.55 m tsukubai and a 2.4 m kasuga lantern are cut from the same
 * granite and must show the same grain size.
 */
const PROP_MATERIALS = Object.freeze({
  bamboo: Object.freeze({
    classification: Object.freeze({
      baseMaterial: 'wood', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'secondaryStructure',
    }),
    id: 'MAT-GDN-08',
    worldTile: 1.0,
  }),
  granite: Object.freeze({
    // `primaryMass`, not `primaryStructure` — the contract's enum is
    // primaryMass | secondaryStructure | trim | fastener | cavity | window |
    // graphic | lightEmitter, and it validates, so a wrong value throws at
    // assembly rather than silently degrading.
    classification: Object.freeze({
      baseMaterial: 'mineral', finish: 'matte', renderMode: 'opaque',
      structuralRole: 'primaryMass',
    }),
    id: 'MAT-GDN-03',
    worldTile: 1.6,
  }),
});

/**
 * The prop set.
 *
 * `heightMetres` is the DECLARED real-world height the scale is solved from,
 * and it is the only scale authority — see D19-143. Values are the traditional
 * sizes for each form, which is what makes a garden read as a garden: a kasuga
 * lantern is a head taller than a person, a yukimi squats at knee height on the
 * water's edge, a tsukubai is low enough that you must crouch to use it.
 */
const PROPS = Object.freeze({
  fence: Object.freeze({
    dir: 'PROP-GDN-02-bamboo-fence',
    material: 'bamboo',
    // THE D19-146 CASE, and the reason `scaleFrom` exists.
    //
    // This asset was specified 2.0 x 1.6 m and generated at 2.0 x 0.92 m — the
    // capture aspect pushed the drawing to 2:1. Solving its scale from a
    // declared HEIGHT of 1.78 m (which is what a screening fence should be)
    // therefore multiplied the whole panel by 1.93 and produced 3.9 m wide
    // hoarding panels standing on the berm crest — industrial scaffolding, not
    // a bamboo screen.
    //
    // Its width is the dimension that survived generation, so the width is what
    // the scale is solved from. The panel lands at its true 2.05 x 0.94 m: a
    // low boundary screen rather than a tall one. The enclosure read is then
    // carried by the fence line plus the planted berm behind it, which is the
    // correct garden section anyway.
    scaleFrom: 'width',
    widthMetres: 2.05,
  }),
  kasuga: Object.freeze({
    dir: 'PROP-GDN-01-lantern-kasuga',
    heightMetres: 2.42,
    material: 'granite',
    upAxis: 'y',
  }),
  oribe: Object.freeze({
    dir: 'PROP-GDN-01-lantern-oribe',
    heightMetres: 1.52,
    material: 'granite',
    upAxis: 'y',
  }),
  tsukubai: Object.freeze({
    dir: 'PROP-GDN-01-tsukubai',
    heightMetres: 0.62,
    material: 'granite',
    upAxis: 'y',
  }),
  yukimi: Object.freeze({
    dir: 'PROP-GDN-01-lantern-yukimi',
    heightMetres: 1.22,
    material: 'granite',
    upAxis: 'y',
  }),
});

async function loadLodManifest(dir) {
  const response = await fetch(`${PROP_ROOT}/${dir}/lods.json`);
  if (!response.ok) throw new Error(`${dir}/lods.json failed (${response.status})`);
  return response.json();
}

function loadTexture(loader, url, { srgb }) {
  return new Promise((resolve, reject) => {
    loader.load(url, (texture) => {
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 8;
      resolve(texture);
    }, undefined, reject);
  });
}

/**
 * Loads a §9 material's full PBR set.
 *
 * The Ground Shader takes `map` only (D19-058), which is why the ground layers
 * bind albedo alone — but Manufactured Surface carries the whole set, so props
 * get the normal, roughness and AO the material was actually authored with.
 */
async function loadPropMaterialMaps(textureLoader, cache, materialId) {
  if (cache.has(materialId)) return cache.get(materialId);
  const base = `${MATERIAL_ROOT}/${materialId}/maps`;
  const [map, normalMap, roughnessMap, aoMap] = await Promise.all([
    loadTexture(textureLoader, `${base}/albedo.png`, { srgb: true }),
    loadTexture(textureLoader, `${base}/normal.png`, { srgb: false }),
    loadTexture(textureLoader, `${base}/roughness.png`, { srgb: false }),
    loadTexture(textureLoader, `${base}/ao.png`, { srgb: false }),
  ]);
  const maps = { aoMap, map, normalMap, roughnessMap };
  cache.set(materialId, maps);
  return maps;
}

/**
 * Measures a loaded prop and returns the uniform scale that lands it at its
 * declared metric height, plus the measured bounds at that scale.
 *
 * Deliberately measured rather than read from the file: there is no metric
 * scale in a generated GLB (D19-143), and the prompt's own dimensions do not
 * survive generation (D19-146).
 */
function solveMetricScale(root, spec) {
  root.updateWorldMatrix(true, true);
  const raw = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  // Which measured axis the declared dimension is solved against. Height is
  // right for anything whose height is its identity (a lantern is "waist" or
  // "head" high); width is right when generation is known to have distorted the
  // other axis, which D19-146 says to expect on any asset whose reference image
  // was not square.
  const scale = spec.scaleFrom === 'width'
    ? spec.widthMetres / Math.max(raw.x, raw.z, 1e-6)
    : spec.heightMetres / Math.max(raw.y, 1e-6);
  return { rawSize: raw, scale, size: raw.clone().multiplyScalar(scale) };
}

/**
 * Re-surfaces a generated prop with a §9 material.
 *
 * The generated albedo is DISCARDED, not blended (D19-144): it carries the
 * generator's own baked key light, and under a 128° sun that reads as a second
 * light source stuck to the object. Everything the prop keeps is its geometry.
 *
 * The UV repeat is solved from the prop's finished size against the material's
 * authored world tile, so grain size is constant across the whole prop set.
 */
function surfaceProp(root, { maps, name, size, worldTile }) {
  // The prop set ships a WORLD-SCALE `TEXCOORD_1`, so when it is present the
  // tiling material binds to uv1 at repeat 1 and the grain is already metric —
  // no repeat solving, and no dependence on however the generator laid out uv0.
  // The bounds-derived repeat below is the fallback for a prop that predates
  // that (and is still what keeps grain size constant across the set).
  let hasWorldUv = true;
  root.traverse((object) => {
    if (object.isMesh && !object.geometry?.attributes?.uv1) hasWorldUv = false;
  });
  const repeatU = hasWorldUv ? 1 : Math.max(size.x, size.z) / worldTile;
  const repeatV = hasWorldUv ? 1 : size.y / worldTile;
  const material = new THREE.MeshStandardMaterial({
    aoMap: maps.aoMap,
    map: maps.map,
    metalness: 0,
    name,
    normalMap: maps.normalMap,
    roughness: 1,
    roughnessMap: maps.roughnessMap,
  });
  material.userData = { toonlabMaterialId: name };
  // Per-prop texture clones: `repeat` lives on the Texture, so sharing one
  // instance across props of different sizes would make the last one written
  // win for all of them.
  for (const slot of ['aoMap', 'map', 'normalMap', 'roughnessMap']) {
    const texture = material[slot].clone();
    texture.needsUpdate = true;
    texture.repeat.set(repeatU, repeatV);
    // `channel` selects the UV attribute per map. Bound to the world-scale set
    // when the prop carries one, so a 0.62 m tsukubai and a 2.42 m kasuga cut
    // from the same granite show the same grain without any per-prop tuning.
    if (hasWorldUv) texture.channel = 1;
    material[slot] = texture;
  }
  root.traverse((object) => {
    if (!object.isMesh) return;
    // AO always reads uv1 in three.js. On a prop with no world-scale set,
    // alias it onto uv0 rather than dropping the map — these forms are convex
    // enough that uv1 == uv0 beats no occlusion at all.
    if (!hasWorldUv && object.geometry?.attributes?.uv && !object.geometry.attributes.uv1) {
      object.geometry.setAttribute('uv1', object.geometry.attributes.uv);
    }
    object.material = material;
    object.castShadow = true;
    object.receiveShadow = true;
  });
  return material;
}

/**
 * Hand-set garden furniture. `[x, z, prop, yawDegrees, lod]`.
 *
 * Every position is a compositional decision against the §2 layout, not a
 * scatter — a garden reads as designed because each object answers something.
 *
 *   yukimi    the snow-viewing lantern, squatting on the pond's south margin
 *             where its broad cap is read against the water. The classical
 *             siting, and the one that gives the pond a foreground subject.
 *   tsukubai  the water basin, set low beside the path just before the terrace,
 *             so the eye meets it at crouching height on the approach.
 *   oribe     the buried-post lantern that traditionally lights a tsukubai —
 *             placed as its pair, close enough to read as one arrangement.
 *   kasuga    the tall pedestal lantern, standing at the path bend as the
 *             vertical accent that stops the mid-band reading as all horizontal.
 */
const FURNITURE = Object.freeze([
  [-3.35, -1.05, 'yukimi', 152, 0],
  [6.15, -1.75, 'tsukubai', 214, 0],
  [7.35, -2.55, 'oribe', 198, 0],
  [-6.95, 6.15, 'kasuga', 128, 0],
]);

/**
 * Builds and grounds the manufactured garden furniture and the boundary fence.
 *
 * Called BEFORE the style bundle so scene-label discovery converts every prop
 * material in the same pass as the rest of the scene.
 *
 * @param {object} options
 * @param {{ place: Function }} options.surface
 * @param {boolean} [options.fence] build the boundary screen
 * @param {number} [options.shadowFill] the scene's authored shadow fill (D19-062)
 * @param {number[]} [options.shadowFillTint] its tint
 */
export async function createGardenDressing({
  fence = true,
  shadowFill = 0,
  shadowFillTint = [1, 1, 1],
  surface,
}) {
  const gltfLoader = new GLTFLoader();
  const textureLoader = new THREE.TextureLoader();
  const materialCache = new Map();

  const group = new THREE.Group();
  group.name = 'Stillwater Garden · Dressing';
  const contract = {};
  const census = {};
  let surfaceLightingMaterialCount = 0;

  // One load + one material per prop TYPE; instances clone the surfaced root.
  const loaded = new Map();
  const loadProp = async (key, lod) => {
    const cacheKey = `${key}:${lod}`;
    if (loaded.has(cacheKey)) return loaded.get(cacheKey);
    const spec = PROPS[key];
    const manifest = await loadLodManifest(spec.dir);
    const entry = manifest.lods.find((item) => item.lod === lod) ?? manifest.lods[0];
    const gltf = await new Promise((resolve, reject) => {
      gltfLoader.load(`${PROP_ROOT}/${spec.dir}/${entry.file}`, resolve, undefined, reject);
    });
    const root = gltf.scene;
    const solved = solveMetricScale(root, spec);
    const materialSpec = PROP_MATERIALS[spec.material];
    const maps = await loadPropMaterialMaps(textureLoader, materialCache, materialSpec.id);
    const name = `garden-prop-${key}-${lod}`;
    surfaceProp(root, {
      maps, name, size: solved.size, worldTile: materialSpec.worldTile,
    });

    // Convert the PROTOTYPE, before it is cloned or placed. Two reasons, both
    // learned the hard way here:
    //
    //   1. `surface.place` records the object's source texture ids and
    //      `surface.audit` reports `source-texture-lost` if styling later
    //      swaps them. Converting after placement therefore fails the audit on
    //      every prop — correctly, because at that point the placement record
    //      genuinely describes textures the object no longer has.
    //   2. Converting once per prop TYPE instead of once over ~50 placed
    //      instances. Clones share the converted material.
    //
    // D19-150: `surfaceLighting` enrols the converted material in the ToonLab
    // surface-lighting model. Without it the adapter reports the material as
    // converted while never setting `userData.toonLabSurfaceLighting`, so the
    // scene's `adoptShadowFill` guard skips every prop and the props drift
    // further from the scene the more fill the scene adopts.
    const report = await applyEnvironmentShader(root, {
      assetId: `PROP-GDN-${key}`,
      environmentBox: new THREE.Box3().setFromObject(root),
      hasSun: true,
      materialManifest: {
        assetId: `PROP-GDN-${key}`,
        assignments: [{
          classification: { ...materialSpec.classification },
          selector: { materialName: name },
        }],
        objectClass: 'prop',
        type: MANUFACTURED_MATERIAL_MANIFEST_TYPE,
        version: MANUFACTURED_MATERIAL_MANIFEST_VERSION,
      },
      objectClass: 'prop',
      shaderMode: 'anime',
      surfaceLighting: { shadowFill, shadowFillTint: [...shadowFillTint] },
    });
    surfaceLightingMaterialCount += report?.surfaceLightingMaterialCount ?? 0;
    contract[name] = { roles: [materialSpec.classification.structuralRole] };

    const record = { root, solved, spec, triangles: entry.triangles };
    loaded.set(cacheKey, record);
    return record;
  };

  const place = (record, { lod, x, yawDegrees, z, key }) => {
    const instance = record.root.clone(true);
    instance.name = `${key}-${lod}-${census[key] ?? 0}`;
    instance.scale.setScalar(record.solved.scale);
    instance.rotation.y = THREE.MathUtils.degToRad(yawDegrees);
    // `anchor: 'bounds'` grounds on Box3.min.y, then a 2 cm settle so the base
    // is bedded into the ground rather than resting on a visible seam. Garden
    // stone furniture is set into the earth, never placed on it.
    surface.place(instance, { anchor: 'bounds', offset: -0.02, x, z });
    group.add(instance);
    census[key] = (census[key] ?? 0) + 1;
    return instance;
  };

  for (const [x, z, key, yawDegrees, lod] of FURNITURE) {
    const record = await loadProp(key, lod);
    place(record, { key, lod, x, yawDegrees, z });
  }

  // The boundary screen — §2's "bamboo screen", and the single largest
  // contributor to the enclosure read. Stepped along the BOUNDARY curve frame
  // so each panel sits square to the run and the fence follows the garden's
  // own edge instead of a rectangle drawn around it (D19-066 / FILL-013).
  //
  // LOD1 throughout: the fence is never the subject, it is what stops the
  // sightline, and 50-odd LOD0 panels would spend the whole triangle budget on
  // background. The panels are placed OUTSIDE the pine set-back (2.4 m) so the
  // mass reads screen-then-planting from inside the garden.
  if (fence) {
    const record = await loadProp('fence', 1);
    const panelWidth = Math.max(record.solved.size.x, record.solved.size.z);
    const random = rng(9_140);
    const run = BOUNDARY.stepAlong({
      heightAt: gardenHeight,
      // Butted, with a hair of overlap so the run has no daylight gaps on the
      // curves — a fence with gaps in it is not an enclosure.
      jitterAlong: 0,
      jitterOffset: 0.04,
      // Positive offset is INSIDE the garden (the pine screen uses 2.4 the same
      // way). At 0.35 the fence stood on the perimeter berm's face, which put a
      // built line up on the skyline — the one thing §2 says this garden must
      // not have. At 1.4 it stands on the flat garden edge with the planted
      // berm rising behind it, which is the real section: screen, then bank,
      // then pine mass.
      offset: 1.4,
      seed: 9_140,
      spacing: panelWidth * 0.97,
    });
    for (const [index, panel] of run.entries()) {
      const instance = place(record, {
        key: 'fence',
        lod: 1,
        x: panel.x,
        // Square to the boundary run, plus a degree of slop so the line reads
        // as built rather than extruded.
        //
        // `heading` is a yaw with 0 == +Z (the frame's own convention, the same
        // one `YUA_MARK.facing` uses). A panel's LONG axis is its local +X, and
        // rotation.y carries +X to (cos y, -sin y); setting that equal to the
        // tangent (sin h, cos h) gives y = h - 90 degrees.
        yawDegrees: (panel.heading * 180) / Math.PI - 90 + (random() - 0.5) * 2.4,
        z: panel.z,
      });
      instance.name = `fence-${index}`;
    }
  }

  // Every prop type was converted at load, before it was cloned or placed —
  // see `loadProp`. Nothing is labelled for scene-label discovery, so the Call
  // Me Sensei bundle does NOT visit these materials: converting here and again
  // through the bundle would be a second conversion pass over already-converted
  // materials, which is the D19-087 failure mode.
  return {
    census,
    group,
    materialRoles: contract,
    // Asserted by the caller rather than eyeballed — an enrolment count of 0
    // means every prop is outside the lighting model again (D19-150).
    surfaceLightingMaterialCount,
  };
}

export { FURNITURE, PROPS };
