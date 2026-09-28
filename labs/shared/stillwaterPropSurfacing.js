// Stillwater props — the shared surfacing path for every GENERATED prop, garden and lane.
//
// Spec: doc 18 §8 (texel density, materials contract) and §9 (Texture Lab discipline);
// launch-plan/19-launch-production-decision-log.md D-003 (discard the baked atlas, re-slot by
// semantic role, surface with tiling §9 materials), D-018b (the world-scale UV set and the three
// causes of the surfacing failure), D-018c (surfaceLighting handed to the adapter).
//
// This module exists so the garden owner and the lane owner mount props through ONE path. The
// prop-verify lab proved the path; leaving it there would have meant every consumer
// reimplementing it, and the D-018b failure was precisely a consumer reimplementing part of it.
//
// THE THREE THINGS THAT MUST NOT BE REIMPLEMENTED
//
//   1. The generated atlas is DISCARDED (D-003). It carries baked directional lighting and reads
//      as glossy porcelain; it is not blended, faded or used as a detail layer.
//   2. The §9 material binds to TEXCOORD_1 (`uv1`), the world-scale UV set written by
//      author-prop-lods.py / author-prop-group.py at one UV unit per metre, at
//      `repeat = 1 / worldTileMetres`. Bound to the generator's TEXCOORD_0 atlas unwrap instead,
//      the quoted px/cm is simply untrue (D-018b cause 1).
//   3. `applyEnvironmentShader` is given `surfaceLighting` so every converted material joins the
//      lighting model already carrying the scene's fill (D-018c). A caller that installs
//      afterwards behind the garden's `userData.toonLabSurfaceLighting` guard matches nothing.

import * as THREE from 'three/webgpu';
import { applyEnvironmentShader } from '../../src/environment/environmentMaterialAdapter.js';
import { GARDEN_MOSS_STOPS } from '../../scripts/launch-world-material-set.mjs';

export { GARDEN_MOSS_STOPS };

const MATERIAL_ROOT = '/assets-local/launch-world/materials';

/**
 * The §9 slots the generated props resolve to.
 *
 * `tile` is the material's authored world tile in metres and `pxPerCm` is
 * `sourceResolution / (tile * 100)` — the §9 owner's formula, not a re-derivation. Both are
 * properties of the map/tile PAIRING: bind a different repeat and the density claim is void,
 * which is why the two travel together in one record and the loader binds from this table
 * rather than from a number typed at the call site.
 *
 * `heroMargin` is against §8's 10.24 px/cm hero bar. Every slot below clears it.
 */
export const PROP_MATERIAL_SLOTS = Object.freeze({
  granite: Object.freeze({
    id: 'MAT-GDN-03', tile: 1.6, sourceResolution: 4096, pxPerCm: 25.6, heroMargin: 2.5,
    label: 'Irregular granite paving and stepping stones',
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'prop',
    }),
  }),
  timber: Object.freeze({
    id: 'MAT-GDN-05', tile: 1.2, sourceResolution: 4096, pxPerCm: 34.13, heroMargin: 3.33,
    label: 'Aged cedar timber',
    roles: Object.freeze({
      baseMaterial: 'wood', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'prop',
    }),
  }),
  bamboo: Object.freeze({
    id: 'MAT-GDN-08', tile: 1.0, sourceResolution: 4096, pxPerCm: 40.96, heroMargin: 4.0,
    label: 'Bamboo culm',
    roles: Object.freeze({
      baseMaterial: 'wood', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'secondaryStructure', objectClass: 'infrastructure',
    }),
  }),
  gardenCeramic: Object.freeze({
    id: 'MAT-GDN-07-plain', tile: 0.5, sourceResolution: 4096, pxPerCm: 81.92, heroMargin: 8.0,
    label: 'Plain glazed ceramic',
    roles: Object.freeze({
      baseMaterial: 'ceramic', finish: 'glazed', renderMode: 'opaque',
      structuralRole: 'trim', objectClass: 'prop',
    }),
  }),

  // --- lane slots ---------------------------------------------------------
  //
  // MAT-CITY-03 and MAT-CITY-04 are UN-RETIRED here, on doc 21 §3's explicit instruction ("The
  // retired MAT-CITY-03 sidewalk stone and MAT-CITY-04 asphalt should be un-retired — they are
  // on disk and were built for exactly this"). Their maps are on disk at 4096²; their recipes
  // carry no tile field, so the tile is DECLARED here and the density follows from the §9
  // formula rather than being inherited from a record that never had one. MAT-CITY-05 and
  // MAT-CITY-06 come back on the same basis — a contemporary back-street is the scene both were
  // authored for.
  cityStone: Object.freeze({
    id: 'MAT-CITY-01', tile: 1.2, sourceResolution: 4096, pxPerCm: 34.13, heroMargin: 3.33,
    label: 'Pale dressed stone / concrete',
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'infrastructure',
    }),
  }),
  cityMetal: Object.freeze({
    id: 'MAT-CITY-02', tile: 0.6, sourceResolution: 2048, pxPerCm: 34.13, heroMargin: 3.33,
    label: 'Charcoal powder-coated / blackened metal',
    roles: Object.freeze({
      baseMaterial: 'metal', finish: 'painted', renderMode: 'opaque',
      structuralRole: 'secondaryStructure', objectClass: 'infrastructure',
    }),
  }),
  citySidewalk: Object.freeze({
    id: 'MAT-CITY-03', tile: 1.2, sourceResolution: 4096, pxPerCm: 34.13, heroMargin: 3.33,
    label: 'Cool sidewalk stone (un-retired, doc 21 §3)',
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'infrastructure',
    }),
  }),
  cityAsphalt: Object.freeze({
    id: 'MAT-CITY-04', tile: 2.0, sourceResolution: 4096, pxPerCm: 20.48, heroMargin: 2.0,
    label: 'Fine urban asphalt (un-retired, doc 21 §3)',
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'matte', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'infrastructure',
    }),
  }),
  cityStainless: Object.freeze({
    id: 'MAT-CITY-06', tile: 0.6, sourceResolution: 1024, pxPerCm: 17.07, heroMargin: 1.67,
    label: 'Brushed stainless service metal (un-retired)',
    roles: Object.freeze({
      baseMaterial: 'metal', finish: 'brushed', renderMode: 'opaque',
      structuralRole: 'secondaryStructure', objectClass: 'infrastructure',
    }),
  }),
});

/**
 * Damp-margin moss tint, from the shared palette.
 *
 * Doc 21 §5 requires moss in the street's wall-base joints to be the SAME SPECIES as the
 * garden's — that shared green across the wall is one of the few things tying the two spaces
 * together. `GARDEN_MOSS_STOPS` is imported and indexed rather than eyeballed, exactly as
 * stillwaterGardenStones.js does for stone and the ground splat does for the bed.
 *
 * `low` is stop 1 and `high` is stop 3, per the brief. Stop 0 is nearly black and stop 4 is the
 * dry sunlit highlight; a damp base joint sits between them.
 */
export const PROP_MOSS = Object.freeze({
  low: GARDEN_MOSS_STOPS[1],
  high: GARDEN_MOSS_STOPS[3],
  stops: GARDEN_MOSS_STOPS,
});

const textureLoader = new THREE.TextureLoader();
const mapCache = new Map();

function loadMap(id, name, srgb) {
  const key = `${id}/${name}`;
  if (mapCache.has(key)) return mapCache.get(key);
  const promise = new Promise((resolve, reject) => {
    textureLoader.load(`${MATERIAL_ROOT}/${id}/maps/${name}.png`, (texture) => {
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      texture.anisotropy = 8;
      resolve(texture);
    }, undefined, reject);
  });
  mapCache.set(key, promise);
  return promise;
}

/**
 * Replaces a loaded prop's generated atlas with its §9 recipe.
 *
 * @param {THREE.Object3D} root
 * @param {string} slotName  Key into PROP_MATERIAL_SLOTS.
 * @param {object} [options]
 * @param {number[]} [options.tint]  Multiplied into the albedo. Defaults to neutral.
 * @param {number} [options.moss]    0..1 damp-margin moss weight; tints toward PROP_MOSS.high.
 * @returns {Promise<{converted: number, slot: object}>}
 */
export async function surfaceProp(root, slotName, { tint = null, moss = 0 } = {}) {
  const slot = PROP_MATERIAL_SLOTS[slotName];
  if (!slot) throw new Error(`Unknown prop material slot "${slotName}"`);
  const [albedo, normal, orm] = await Promise.all([
    loadMap(slot.id, 'albedo', true),
    loadMap(slot.id, 'normal', false),
    loadMap(slot.id, 'orm', false),
  ]);

  // Clone per slot so two slots at different tiles do not fight over one texture's repeat.
  const maps = [albedo, normal, orm].map((map) => {
    const copy = map.clone();
    copy.needsUpdate = true;
    copy.repeat.setScalar(1 / slot.tile);
    // channel 1 == TEXCOORD_1 == the world-scale set. This single line is what makes
    // slot.pxPerCm the density actually on the surface (D-018b cause 1).
    copy.channel = 1;
    return copy;
  });

  // Damp-margin moss as a base tint.
  //
  // This is NOT the cavity-masked moss bake D-018b asked for and it is not presented as one — a
  // uniform tint puts moss on crowns as well as in crevices, which is the difference between
  // moss that grew and moss that was printed. It is a colour-correct placeholder from the shared
  // palette so a wall base is not bright clean concrete, and it is deliberately weak. The bake
  // is recorded as outstanding rather than quietly approximated away.
  const base = new THREE.Color(...(tint ?? [1, 1, 1]));
  if (moss > 0) {
    base.lerp(new THREE.Color(...PROP_MOSS.high), THREE.MathUtils.clamp(moss, 0, 1) * 0.55);
  }

  let converted = 0;
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    const material = new THREE.MeshStandardMaterial({
      map: maps[0],
      normalMap: maps[1],
      roughnessMap: maps[2],
      aoMap: maps[2],
      color: base,
      roughness: 1,
      metalness: 0,
    });
    material.userData.toonLabSemanticRoles = { ...slot.roles };
    material.userData.toonLabMaterialId = slot.id;
    object.material = material;
    converted += 1;
  });
  return { converted, slot };
}

/**
 * Puts a surfaced prop through the environment shader with the scene's fill already attached.
 *
 * Returns `surfaceLightingMaterialCount` alongside the adapter state so a caller can ASSERT
 * enrolment instead of discovering the gap by eye — which is the whole point of the D-018c fix.
 * A caller should treat `surfaceLightingMaterialCount === 0` as a failure, not a warning.
 *
 * @param {THREE.Object3D} environmentRoot
 * @param {object} options
 * @param {string} options.assetId
 * @param {object} options.roles
 * @param {number} [options.shadowFill]
 * @param {number[]} [options.shadowFillTint]
 */
export async function styleProp(environmentRoot, {
  assetId,
  roles,
  shadowFill = 0.35,
  shadowFillTint = [1.16, 1.0, 0.86],
} = {}) {
  const environmentBox = new THREE.Box3().setFromObject(environmentRoot);
  const state = await applyEnvironmentShader(environmentRoot, {
    assetId,
    environmentBox,
    hasSun: true,
    objectClass: roles?.objectClass,
    roleOverrides: roles ? { '*': roles } : null,
    shaderMode: 'anime',
    surfaceLighting: { shadowFill, shadowFillTint: [...shadowFillTint] },
  });
  return {
    state,
    convertedMeshCount: state?.convertedMeshCount ?? 0,
    surfaceLightingMaterialCount: state?.surfaceLightingMaterialCount ?? 0,
  };
}

/**
 * Re-derives a loaded prop's real size from MEASURED bounds and scales it to its record.
 *
 * D19-146 is a standing rule and this is the only sanctioned way to satisfy it: the record's
 * `metres` came out of author-prop-group.py's measurement pass, and this re-measures at load so
 * a re-authored GLB cannot silently drift from the number a scene was placed against.
 *
 * `scaleFrom` names the axis the record solved: 'x' | 'y' | 'z' | 'longest'.
 */
export function fitPropToRecord(root, { metres, scaleFrom = 'longest' } = {}) {
  root.updateMatrixWorld(true);
  const size = new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3());
  const reference = scaleFrom === 'longest'
    ? Math.max(size.x, size.y, size.z)
    : size[scaleFrom];
  if (!(reference > 0) || !(metres > 0)) return { scale: 1, size };
  const scale = metres / reference;
  root.scale.multiplyScalar(scale);
  root.updateMatrixWorld(true);
  const grounded = new THREE.Box3().setFromObject(root);
  root.position.y -= grounded.min.y;
  root.updateMatrixWorld(true);
  return { scale, size: new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()) };
}
