// Stillwater Lane — the launch street's architecture.
//
// Spec: launch-plan/21-stillwater-lane-street-addendum.md (the street addendum
// to doc 20). Production record: doc 19 D-019. Construction bar: doc 18 §8.
//
// WHAT THIS FILE IS
//
// The five manufactured volumes that make Stillwater Lane a street rather than
// a corridor: four non-repeating frontages on the south side, and the garden
// gate + boundary wall that hinges the street to the garden on the north.
// It is a DESCRIPTION plus a loader. It mounts nothing on its own — the scene
// owner calls `loadLaneBuilding` and places the result. Nothing here reaches
// into labs/launch-world/garden/.
//
// THREE RULES THIS FILE EXISTS TO ENFORCE
//
//   1. D19-146 — never trust generated proportions. Every dimension below was
//      RE-DERIVED from measured glTF bounds after generation, never read off
//      the prompt. The generator's fixed 1.83:1 letterbox biases the drawn
//      aspect (D19-141), and a fence specified 2.0 x 1.6 m arrived 2.0 x 0.92 m
//      because the model faithfully reproduced the DRAWN proportion. The
//      `metres` field is therefore a solve on FRONTAGE WIDTH, not height:
//      width is the dimension the street has to fit, and solving height against
//      a letterbox-squashed model multiplies the distortion through the asset.
//
//   2. D-003 — the generated atlas is DISCARDED, not blended. A single 2048²
//      atlas over a building's surface area cannot reach §8's 10.24 px/cm bar
//      by any arithmetic (measured at 1.22 px/cm on the teahouse, 8.4x short).
//      Surfacing is by §9 recipe at a declared world tile, per semantic slot.
//
//   3. D-018b — a §9 tiling recipe must bind to the WORLD-SCALE UV set, not to
//      the generator's atlas unwrap. `author-prop-lods.py` writes `TEXCOORD_1`
//      at one UV unit per metre; bind at `repeat = 1 / tile` and `channel = 1`.
//      Bound to TEXCOORD_0 instead, the recipe stretches per island and the
//      quoted px/cm is simply untrue — which is exactly how the first prop pass
//      shipped a density claim that was not on the surface anywhere.
//
// WHY FOUR DIFFERENT FRONTAGES AND NOT ONE REPEATED
//
// §13 rejects obvious repetition, and a 40 m street carrying one façade is the
// most visible possible failure. These four vary on every axis available:
// storey count (2 / 4 / 3 / none), bay rhythm, material mix (render / concrete
// + steel / ribbed metal / raw concrete), setback, and roof treatment (parapet /
// water tank + antenna / roof handrail / overpass deck).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { rootedAssetUrl } from './assetUrls.js';

const LANE_ROOT = 'assets-local/launch-world/lane';
const MATERIAL_ROOT = 'assets-local/launch-world/materials';

/**
 * §9 material slots these buildings are surfaced from, with the world tile size
 * each recipe was authored at. The px/cm figure is `sourceResolution / (tile *
 * 100)` and is only true when the map is bound to the world-scale UV set — see
 * rule 3 above. Every entry clears §8's 10.24 px/cm hero bar.
 *
 * MAT-CITY-03 (sidewalk stone) and MAT-CITY-04 (asphalt) are deliberately NOT
 * referenced here: they are retired in scripts/launch-world-material-set.mjs
 * and doc 21 §3 asks for them to be un-retired for the lane's GROUND, which is
 * the scene owner's and texture owner's surface, not the buildings'.
 */
export const LANE_MATERIAL_SLOTS = Object.freeze({
  // Pale dressed architectural render/concrete — the primary wall mass.
  render: Object.freeze({
    id: 'MAT-CITY-01', tile: 1.2, pxPerCm: 34.13,
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'buildingExterior',
    }),
  }),
  // Graphite variant — used to separate a second masonry mass from the first so
  // two adjacent buildings do not read as one continuous wall.
  concrete: Object.freeze({
    id: 'MAT-CITY-01-graphite', tile: 1.2, pxPerCm: 34.13,
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'buildingExterior',
    }),
  }),
  // Charcoal powder-coated metal — railings, stairs, shutter housings, mullions,
  // condenser cases, downpipes. §9 declares `trim` as an alternate role for
  // exactly this use.
  metal: Object.freeze({
    id: 'MAT-CITY-02', tile: 0.6, pxPerCm: 34.13,
    roles: Object.freeze({
      baseMaterial: 'metal', finish: 'painted', renderMode: 'opaque',
      structuralRole: 'secondaryStructure', objectClass: 'buildingExterior',
    }),
  }),
  // Garden-side materials. The gate and wall are the hinge asset, so they carry
  // the GARDEN's material family, not the street's — that shared surface is
  // what makes street -> gate -> garden read as one walk rather than a cut.
  plaster: Object.freeze({
    id: 'MAT-GDN-06', tile: 1.5, pxPerCm: 27.31,
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'buildingExterior',
    }),
  }),
  roofTile: Object.freeze({
    id: 'MAT-GDN-07', tile: 1.0, pxPerCm: 40.96,
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'trim', objectClass: 'buildingExterior',
    }),
  }),
  timber: Object.freeze({
    id: 'MAT-GDN-05', tile: 1.2, pxPerCm: 34.13,
    roles: Object.freeze({
      baseMaterial: 'wood', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'secondaryStructure', objectClass: 'buildingExterior',
    }),
  }),
  // Granite — wall base courses, plinths, kerbs, the gate's threshold slab.
  stone: Object.freeze({
    id: 'MAT-GDN-03', tile: 1.6, pxPerCm: 25.60,
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'buildingExterior',
    }),
  }),
});

/**
 * The five volumes.
 *
 * `metres` is the FRONTAGE WIDTH in metres and `scaleAxis` names the measured
 * axis it applies to — always solve from this pair, never from `height`.
 * `measured` records the full re-derived size at that solve, so a scene can
 * lay the street out without loading anything.
 *
 * `sign` records where a blank panel sits, so the signage owner can find them.
 * §8 requires every sign panel to ship BLANK: no text, no kanji, no crest, no
 * brand mark. All four blank panels below survived generation blank.
 */
export const STILLWATER_LANE_BUILDINGS = Object.freeze([
  Object.freeze({
    id: 'ARCH-LANE-01',
    dir: 'ARCH-LANE-01',
    label: 'Two-storey shopfront',
    side: 'south',
    storeys: 2,
    scaleAxis: 'width',
    metres: 7.0,
    measured: Object.freeze({ width: 7.00, height: 7.12, depth: 6.36 }),
    // The asset doc 21 §4 singles out: "a 2 m interior read in at least one
    // shopfront — this is what the earlier city attempt never had". This one
    // has it as real geometry: the glazing is set back behind mullions and the
    // interior carries a counter, shelving and a back wall at depth.
    interiorRead: true,
    sign: 'blank fascia band above the awning, plus a blank stallriser panel',
    slots: Object.freeze({
      primary: 'render', trim: 'metal', ground: 'stone',
    }),
    notes: 'Awning has a modelled underside and a scalloped valance with real '
      + 'thickness. Rear is a closed, plain party wall — correct for a terraced '
      + 'back-street shop, and NOT the collapsed rear that rejected D-001.',
  }),
  Object.freeze({
    id: 'ARCH-LANE-02',
    dir: 'ARCH-LANE-02',
    label: 'Four-storey mixed-use',
    side: 'south',
    storeys: 4,
    scaleAxis: 'width',
    metres: 8.0,
    measured: Object.freeze({ width: 8.00, height: 11.92, depth: 8.82 }),
    // 11.92 / 4 = 2.98 m per storey, which is why the width solve was taken at
    // 8.0 m: it lands the storey height in the real range without forcing it.
    storeyHeight: 2.98,
    interiorRead: true,
    sign: 'blank board over the ground-floor entrance',
    slots: Object.freeze({
      primary: 'render', trim: 'metal', ground: 'stone',
    }),
    notes: 'Balconies, railings, external stair, condensers, meter boxes, '
      + 'downpipes, roof water tank and antenna all arrive as real geometry. '
      + 'Ships with a modelled pavement plinth at its base — the scene owner '
      + 'should drop that slot rather than sink it, or it will fight the lane\'s '
      + 'own ground surface.',
  }),
  Object.freeze({
    id: 'ARCH-LANE-03',
    dir: 'ARCH-LANE-03',
    label: 'Narrow infill with exposed stair core',
    side: 'south',
    storeys: 3,
    scaleAxis: 'width',
    metres: 6.0,
    measured: Object.freeze({ width: 6.00, height: 8.67, depth: 4.76 }),
    storeyHeight: 2.89,
    interiorRead: false,
    sign: 'blank panel at parapet level',
    slots: Object.freeze({
      primary: 'concrete', trim: 'metal', ground: 'stone',
    }),
    notes: 'The rhythm break in the row: ribbed metal cladding and narrow slot '
      + 'windows on a DIFFERENT rhythm per floor, against the regular bays of '
      + '01 and 02. The stair core is a real open volume — landings and railings '
      + 'read through it — not a recessed face.',
  }),
  Object.freeze({
    id: 'ARCH-LANE-04',
    dir: 'ARCH-LANE-04',
    label: 'Sightline closer — overpass beam on a blank flank',
    side: 'east-end',
    storeys: 0,
    scaleAxis: 'width',
    // Solved so the beam SPANS the 9 m lane with an abutment margin.
    metres: 9.5,
    measured: Object.freeze({ width: 9.50, height: 8.62, depth: 9.27 }),
    interiorRead: false,
    sign: null,
    slots: Object.freeze({
      primary: 'concrete', trim: 'metal', ground: 'stone',
    }),
    notes: 'This is what ends the street honestly — no skyline, no cards, per '
      + 'doc 21 §2. Arrived as a blank flank wall running along the street end '
      + 'with the overpass beam crossing above it, chain-link deck fence '
      + 'included. Segmented so the beam and the wall place independently: the '
      + 'beam must span the carriageway, the wall must sit on the kerb line.',
  }),
  Object.freeze({
    id: 'ARCH-GDN-02',
    dir: 'ARCH-GDN-02',
    label: 'Garden gate + boundary wall section',
    side: 'north',
    storeys: 0,
    scaleAxis: 'width',
    metres: 6.0,
    measured: Object.freeze({ width: 6.00, height: 2.81, depth: 2.00 }),
    interiorRead: false,
    sign: null,
    // The hinge. It is the only asset in the launch world seen from BOTH
    // scenes, so both faces were inspected rather than one: street side and
    // garden side are each fully modelled and correctly different, the garden
    // side being the plainer of the two.
    twoSided: true,
    slots: Object.freeze({
      primary: 'plaster', roof: 'roofTile', joinery: 'timber',
      base: 'stone', trim: 'metal',
    }),
    notes: 'Gate ridge at 2.81 m, wall coping at ~1.74 m, door opening ~2.02 m '
      + '— inside §8\'s 2.0-2.4 m door band. Real barrel tiles with ridge and '
      + 'eave courses, planked doors with iron strap hinges and ring pulls, '
      + 'rubble base course, stone threshold slab. The wall sections are short: '
      + 'segment slots are provided so ONE section tiles along the 40 m boundary '
      + 'while the gate is placed once. '
      + 'DEVICE CHECK (D-018 precedent): the concept drew tomoe-style roundels on '
      + 'the eave tile ends. Those are standard eave-tile construction rather '
      + 'than a crest, and in any case they did not survive into geometry — the '
      + 'modelled eave ends are plain barrels. No §13 counterfeit-device risk.',
  }),
]);

const BY_ID = Object.freeze(Object.fromEntries(
  STILLWATER_LANE_BUILDINGS.map((b) => [b.id, b]),
));

export function laneBuilding(id) {
  return BY_ID[id] ?? null;
}

const textureLoader = new THREE.TextureLoader();
const mapCache = new Map();

function loadMap(materialId, name, srgb) {
  const key = `${materialId}/${name}`;
  if (mapCache.has(key)) return mapCache.get(key);
  const promise = new Promise((resolve, reject) => {
    textureLoader.load(
      rootedAssetUrl(`${MATERIAL_ROOT}/${materialId}/maps/${name}.png`),
      (texture) => {
        texture.wrapS = THREE.RepeatWrapping;
        texture.wrapT = THREE.RepeatWrapping;
        texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      reject,
    );
  });
  mapCache.set(key, promise);
  return promise;
}

/**
 * Builds a MeshStandardMaterial from a §9 slot, bound to the world-scale UV set.
 *
 * The maps are shared across every caller of the same slot, but `.repeat` lives
 * on the texture rather than the material — so a slot is cloned per use to keep
 * one building's tile from rewriting another's.
 */
async function slotMaterial(slotName) {
  const slot = LANE_MATERIAL_SLOTS[slotName];
  if (!slot) throw new Error(`Unknown lane material slot "${slotName}"`);
  const [albedo, normal, orm] = await Promise.all([
    loadMap(slot.id, 'albedo', true),
    loadMap(slot.id, 'normal', false),
    loadMap(slot.id, 'orm', false),
  ]);
  const repeat = 1 / slot.tile;
  const maps = [albedo, normal, orm].map((map) => {
    const copy = map.clone();
    copy.needsUpdate = true;
    copy.repeat.setScalar(repeat);
    // TEXCOORD_1 — the world-scale set author-prop-lods.py writes at one UV
    // unit per metre. Without this the §9 recipe lands on the generator's
    // atlas UVs and the px/cm above is not the density on the surface (D-018b).
    copy.channel = 1;
    return copy;
  });
  const [map, normalMap, ormMap] = maps;
  const material = new THREE.MeshStandardMaterial({
    map, normalMap, roughnessMap: ormMap, aoMap: ormMap,
    roughness: 1, metalness: 0,
  });
  material.userData.toonLabSemanticRoles = { ...slot.roles };
  material.userData.toonLabMaterialId = slot.id;
  return material;
}

/**
 * Loads one lane building, at real-world scale, surfaced from §9.
 *
 * Returns `{ root, measured, building, materials }`. The caller owns placement:
 * the root is grounded so its base sits at y = 0 and centred on x/z, so a scene
 * positions it by its kerb-line footprint rather than by an arbitrary origin.
 *
 * IMPORTANT — this does NOT call `applyEnvironmentShader`. The scene owner must,
 * because the shadow-fill value belongs to the scene, not to the asset:
 *
 *   const state = await applyEnvironmentShader(environmentRoot, {
 *     surfaceLighting: { shadowFill: 0.35, shadowFillTint: [1.16, 1.0, 0.86] },
 *   });
 *   assert(state.surfaceLightingMaterialCount > 0);
 *
 * That assertion is the D-018c contract: `surfaceLightingMaterialCount` exists
 * so a caller can PROVE enrolment in the surface-lighting model instead of
 * discovering the gap by eye when the prop reads navy beside first-party stone.
 */
export async function loadLaneBuilding(id, { lod = 0 } = {}) {
  const building = laneBuilding(id);
  if (!building) {
    throw new Error(`Unknown lane building "${id}". Known: ${Object.keys(BY_ID).join(', ')}`);
  }

  const url = rootedAssetUrl(`${LANE_ROOT}/${building.dir}/${building.dir}-lod${lod}.glb`);
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;

  // These GLBs are authored AT real-world metres by author-prop-lods.py, which
  // solved the frontage width from measured bounds per D19-146 and baked it in.
  // So this does NOT rescale — re-solving here would mean guessing which axis is
  // the frontage, and the guess is wrong as often as it is right (LANE-02's
  // depth exceeds its width, so a "widest horizontal axis" heuristic would
  // shrink a correct asset by 0.907).
  //
  // It verifies instead. A mismatch means the asset and the manifest have
  // drifted apart, which is exactly the failure D19-222 produced silently.
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const expected = building.measured;
  // AXIS-EXPLICIT, and the fix for a false positive this check produced for
  // three passes (D19-222b). It read
  //
  //     const widthOnDisk = Math.max(size.x, size.z);
  //
  // and then reported ARCH-LANE-02 as 10.2% drifted "on disk", which sent two
  // owners looking for a bad asset and a re-authoring run. The asset is
  // correct. Every one of these GLBs carries its frontage along local +Z with
  // the normal on +X — stated in the manifest's own comment above, measured by
  // scripts/.probe-lane-orient.mjs, and confirmed by re-reading all five files'
  // POSITION accessor bounds, which match their declared triples exactly.
  // LANE-02 is simply the one building DEEPER than it is wide (8.81 depth vs
  // 8.00 frontage), so `max()` silently switched to the depth axis for it and
  // for it alone. That is precisely the "widest horizontal axis" heuristic the
  // comment eight lines up warns against, and 8.00 / 8.8148 = 0.9076 is the
  // 0.907 shrink it predicts.
  //
  // Re-running author-prop-lods.py could not have fixed this and would have
  // done harm: it is a full re-authoring pass — factory reset, re-import,
  // rescale to PROP_LOD_METRES, collapse-decimate, cube-project the UVs and
  // overwrite every LOD GLB — so "re-authoring to 8.81" would have rescaled a
  // correct building 10% wider and pushed it into its neighbour in the
  // frontage row.
  //
  // Verifying all three axes rather than one makes this a STRONGER check than
  // before, not a weaker one: a rotated or rescaled export now fails on
  // whichever axis moved instead of hiding behind a max().
  const AXES = [['width', size.z], ['height', size.y], ['depth', size.x]];
  for (const [axis, onDisk] of AXES) {
    const declared = expected[axis];
    if (!(declared > 0)) continue;
    const drift = Math.abs(onDisk - declared) / declared;
    if (drift <= 0.02) continue;
    console.warn(
      `[stillwaterLane] ${building.id} ${axis} measures ${onDisk.toFixed(2)} m on disk `
      + `but the manifest declares ${declared.toFixed(2)} m (${(drift * 100).toFixed(1)}% drift). `
      + 'The GLB and its manifest have genuinely diverged — re-measure before re-authoring, '
      + 'because author-prop-lods.py rescales and re-exports rather than measuring (D19-222).',
    );
  }

  // Ground it and centre the footprint, so the scene places by kerb line.
  root.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(root);
  const centre = scaled.getCenter(new THREE.Vector3());
  root.position.x -= centre.x;
  root.position.z -= centre.z;
  root.position.y -= scaled.min.y;
  root.updateMatrixWorld(true);

  // D-003: discard the generated atlas outright rather than blending it. It
  // carries baked directional lighting and highlight streaks in the albedo
  // (a §8 rejection category on its own) and cannot reach the texel bar.
  const primary = await slotMaterial(building.slots.primary);
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = true;
    object.material = primary;
    materials.add(primary);
  });

  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());

  return {
    root,
    building,
    materials: [...materials],
    measured: {
      width: finalSize.x, height: finalSize.y, depth: finalSize.z,
    },
  };
}
