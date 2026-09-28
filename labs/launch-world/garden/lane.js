// Stillwater Lane — the contemporary back-street on the garden's south boundary.
//
// Spec: launch-plan/21-stillwater-lane-street-addendum.md. Production record:
// doc 19 D-019 (architecture), D-020 (props). Construction bar: doc 18 §8.
//
// WHAT THIS FILE IS
//
// The scene-side assembly of the street: the four non-repeating frontages, the
// garden's boundary wall and gate, the carriageway and footway surfaces, the
// utility poles and their overhead wire network, and the street furniture. It
// mounts into the SAME scene and the SAME height field as the garden — doc 21
// §5's "one continuous terrain surface … the lane is authored in the same
// height field, not a separate scene". `terrain.js` owns the section and the
// levels (`LANE`); nothing here invents a height.
//
// THREE RULES THIS FILE ENFORCES
//
//   1. NO SKYLINE (doc 21 §2). The world ends on the buildings. The frontages
//      close the south, ARCH-LANE-04's blank flank closes the west, a party
//      flank closes the east, and the garden's own wall plus its tree mass
//      close the north. There are no cards, no distant towers and no horizon
//      geometry anywhere in the street.
//
//   2. FOUR FRONTAGES, NONE REPEATED (doc 21 §3 / §13). ARCH-LANE-01, -02, -03
//      and -04 each appear exactly once. The only repeated built element is the
//      procedural boundary wall, which is a wall and is supposed to repeat.
//
//   3. D-018c — every imported asset is ASSERTED into the surface-lighting
//      model. `styleProp` returns `surfaceLightingMaterialCount` so a caller can
//      prove enrolment; a zero means the object is outside the scene's shadow
//      fill and will read navy beside first-party stone. This module counts
//      across the whole street and the scene throws on zero.
//
// WHAT IS NOT PLACED, DELIBERATELY
//
// The bicycle and the folding barrier (`LANE_REJECTED`). Both are thin open
// structures that welded into blobs at 1K image-to-3D; doc 19 D-020 records the
// rule. They are not "placed far away" — they are not placed.

import * as THREE from 'three/webgpu';

import { loadLaneBuilding } from '../../shared/stillwaterLaneArchitecture.js';
import {
  buildLaneOverheadWires,
  laneProp,
  loadLaneProp,
} from '../../shared/stillwaterLaneProps.js';
import {
  GARDEN_PATH_EDGING,
  loadGardenProp,
} from '../../shared/stillwaterGardenProps.js';
import { styleProp } from '../../shared/stillwaterPropSurfacing.js';

import { LANE, gardenHeight } from './terrain.js';

const MATERIAL_ROOT = '/assets-local/launch-world/materials';

// Seeded LCG. Placement must be identical run to run — every A/B capture and
// the filler register's equivalence test depend on it.
function rng(seed) {
  let state = (seed >>> 0) || 1;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

// ---------------------------------------------------------------------------
// §9 surfacing for the procedural street geometry
// ---------------------------------------------------------------------------
//
// The carriageway, the footways, the boundary wall and the east flank are
// first-party geometry, not generated assets — so they are built here and
// surfaced from the same §9 recipes the props use. `tile` is the recipe's
// authored world period and the map is bound to the WORLD-SCALE UV set, which
// is what makes the quoted density the density actually on the surface
// (D-018b). `worldUv1` below writes that set.

const LANE_SURFACES = Object.freeze({
  asphalt: Object.freeze({
    id: 'MAT-CITY-04', tile: 2.0, pxPerCm: 20.48, tint: [0.72, 0.72, 0.74],
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'matte', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'infrastructure',
    }),
  }),
  sidewalk: Object.freeze({
    id: 'MAT-CITY-03', tile: 1.2, pxPerCm: 34.13, tint: [0.92, 0.92, 0.93],
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'infrastructure',
    }),
  }),
  plaster: Object.freeze({
    id: 'MAT-GDN-06', tile: 1.5, pxPerCm: 27.31, tint: [1, 1, 1],
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'buildingExterior',
    }),
  }),
  roofTile: Object.freeze({
    id: 'MAT-GDN-07', tile: 1.0, pxPerCm: 40.96, tint: [0.86, 0.86, 0.88],
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'trim', objectClass: 'buildingExterior',
    }),
  }),
  concrete: Object.freeze({
    id: 'MAT-CITY-01-graphite', tile: 1.2, pxPerCm: 34.13, tint: [1, 1, 1],
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'buildingExterior',
    }),
  }),
  metal: Object.freeze({
    id: 'MAT-CITY-02', tile: 0.6, pxPerCm: 34.13, tint: [0.78, 0.78, 0.8],
    roles: Object.freeze({
      baseMaterial: 'metal', finish: 'painted', renderMode: 'opaque',
      structuralRole: 'secondaryStructure', objectClass: 'buildingExterior',
    }),
  }),
  granite: Object.freeze({
    id: 'MAT-GDN-03', tile: 1.6, pxPerCm: 25.6, tint: [0.9, 0.9, 0.91],
    roles: Object.freeze({
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'infrastructure',
    }),
  }),
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

const surfaceMaterialCache = new Map();

/**
 * A MeshStandardMaterial from a §9 recipe, bound to the world-scale UV set.
 *
 * `roughness` is authored per surface rather than left at 1 across the board.
 * That is deliberate and it is the street's half of the gloss-variation work:
 * asphalt is near-matte, dressed sidewalk stone is slightly less so, plaster is
 * flat, and painted metal is genuinely glossy — so the materials separate by
 * HIGHLIGHT BEHAVIOUR and not only by colour.
 */
async function surfaceMaterial(key, { roughness = 1, metalness = 0 } = {}) {
  const cached = surfaceMaterialCache.get(key);
  if (cached) return cached;
  const recipe = LANE_SURFACES[key];
  if (!recipe) throw new Error(`Unknown lane surface "${key}"`);
  const [albedo, normal, orm] = await Promise.all([
    loadMap(recipe.id, 'albedo', true),
    loadMap(recipe.id, 'normal', false),
    loadMap(recipe.id, 'orm', false),
  ]);
  const maps = [albedo, normal, orm].map((map) => {
    const copy = map.clone();
    copy.needsUpdate = true;
    copy.repeat.setScalar(1 / recipe.tile);
    // TEXCOORD_1 — the world-scale set `worldUv1` writes below (D-018b).
    copy.channel = 1;
    return copy;
  });
  const material = new THREE.MeshStandardMaterial({
    map: maps[0],
    normalMap: maps[1],
    roughnessMap: maps[2],
    aoMap: maps[2],
    color: new THREE.Color(...recipe.tint),
    roughness,
    metalness,
  });
  material.name = `lane-${key}`;
  material.userData.toonLabSemanticRoles = { ...recipe.roles };
  material.userData.toonLabMaterialId = recipe.id;
  surfaceMaterialCache.set(key, material);
  return material;
}

/**
 * Writes the WORLD-SCALE UV set (`uv1`, one unit per metre) onto an
 * axis-aligned geometry by planar projection along each face's dominant normal.
 *
 * Without this the §9 recipe lands on the primitive's own 0..1 unwrap and the
 * quoted px/cm is simply untrue — the D-018b failure, restated for first-party
 * geometry. Every box and plane below is axis-aligned, so a dominant-axis
 * projection is exact rather than an approximation.
 */
function worldUv1(geometry) {
  const position = geometry.attributes.position;
  const normal = geometry.attributes.normal;
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const nx = Math.abs(normal.getX(i));
    const ny = Math.abs(normal.getY(i));
    const nz = Math.abs(normal.getZ(i));
    let u = x;
    let v = z;
    if (ny >= nx && ny >= nz) { u = x; v = z; }
    else if (nx >= nz) { u = z; v = y; }
    else { u = x; v = y; }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2));
  return geometry;
}

function slab({ x, y, z, width, height, depth }) {
  const geometry = worldUv1(new THREE.BoxGeometry(width, height, depth));
  geometry.translate(x, y, z);
  return geometry;
}

// ---------------------------------------------------------------------------
// The street layout
// ---------------------------------------------------------------------------
//
// THE SIGHTLINE IS AUTHORED AGAINST THE SUN AND AGAINST THE CAMERA.
//
// The garden's sun is at azimuth 128 deg / elevation 42 deg (south-east). The
// street cameras therefore look WEST: the sun falls over the camera's right
// shoulder, the frontages are front-lit and the garden wall opposite is raked.
// Looking east would put the sun disc in frame and flatten the whole row.
//
// So the SIGHTLINE CLOSER goes at the WEST end, where the camera actually looks
// — ARCH-LANE-04, its blank flank across the carriageway and its overpass beam
// crossing above. The east end is behind camera in every authored shot and is
// closed by a plain party flank, which is what a back-street's other end is.
//
// `metres` in the manifest is the FRONTAGE WIDTH and the buildings are authored
// AT metres, so nothing here rescales anything (D19-146). All five arrive with
// their frontage normal on local +X — measured, not assumed: the four-view
// orientation probe is `scripts/.probe-lane-orient.mjs`, and the manifest's own
// `measured` triples agree (ARCH-LANE-01 is 6.36 x 7.12 x 7.00 in x/y/z, so the
// 7.00 m frontage runs along Z and its normal is X).
//
// A yaw of +90 deg carries local +X to world -Z, i.e. faces the frontage NORTH
// into the lane. LANE-04's flank instead faces EAST down the street at yaw 0.
const FRONTAGES = Object.freeze([
  Object.freeze({ id: 'ARCH-LANE-03', x: -10.8, yaw: 90, frontage: 6.0, depth: 4.76 }),
  Object.freeze({ id: 'ARCH-LANE-01', x: -3.5, yaw: 90, frontage: 7.0, depth: 6.36 }),
  Object.freeze({ id: 'ARCH-LANE-02', x: 4.6, yaw: 90, frontage: 8.0, depth: 8.82 }),
]);

// The closer. Placed so its blank flank stands across the carriageway with the
// beam crossing above, and so the wall's own footprint clears the frontage row.
const CLOSER = Object.freeze({
  id: 'ARCH-LANE-04', x: -18.6, z: 24.4, yaw: 0,
});

// The gate. Sited on the garden's own path head — `PATH` leaves the garden at
// (-1.0, 16.6), so the gate opening lands on the walking line rather than
// beside it, and street -> gate -> garden is one continuous move.
const GATE = Object.freeze({ x: -1.2, yaw: 270, width: 6.0 });

// ---------------------------------------------------------------------------

/**
 * Builds Stillwater Lane.
 *
 * Everything grounds through `gardenHeight` directly rather than through
 * `surface.place`: the street's objects stand on BUILT levels — a footway slab,
 * a wall coping, a kerb line — and `surface.place` grounds on the terrain, which
 * is 0.15 m below the pavement everywhere the street furniture actually stands.
 *
 * @param {object} options
 * @param {number} options.shadowFill            the scene's authored fill (D19-062)
 * @param {number[]} options.shadowFillTint
 * @param {(stage: string) => void} [options.onProgress]
 * @param {number} [options.lod]
 */
export async function createStillwaterLane({
  shadowFill = 0.35,
  shadowFillTint = [1.16, 1.0, 0.86],
  onProgress = () => {},
  lod = 0,
}) {
  const group = new THREE.Group();
  group.name = 'Stillwater Lane';
  const census = {
    buildings: 0, poles: 0, props: 0, wireSpans: 0, wireTriangles: 0, kerbBars: 0,
  };
  let surfaceLightingMaterialCount = 0;

  const enrol = async (root, assetId, roles) => {
    const styled = await styleProp(root, {
      assetId, roles, shadowFill, shadowFillTint,
    });
    surfaceLightingMaterialCount += styled.surfaceLightingMaterialCount;
    return styled;
  };

  // --- 1. The ground surfaces ----------------------------------------------
  //
  // Doc 21 §4's "ground detail": kerb, channel, footway, carriageway. Built as
  // real geometry rather than painted into the splat, because the Ground
  // Shader's four channels are all spoken for by the garden and because a kerb
  // is a 0.15 m STEP — a height the splat cannot express at all.
  onProgress('Laying the carriageway');
  const surfaces = new THREE.Group();
  surfaces.name = 'Stillwater Lane · Ground surfaces';

  const runLength = LANE.xMax - LANE.xMin;
  const runCentre = (LANE.xMin + LANE.xMax) / 2;

  // Carriageway. Draped as a segmented plane so it carries the crown the height
  // field authored rather than lying flat across it.
  {
    const segmentsX = Math.max(Math.round(runLength / 0.5), 8);
    const segmentsZ = 18;
    const geometry = new THREE.PlaneGeometry(
      runLength, LANE.kerbSouthZ - LANE.kerbNorthZ, segmentsX, segmentsZ,
    );
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(runCentre, 0, (LANE.kerbNorthZ + LANE.kerbSouthZ) / 2);
    const position = geometry.attributes.position;
    for (let i = 0; i < position.count; i += 1) {
      // +6 mm: the carriageway sits ON the height field, not in it. Any less and
      // the terrain z-fights through it at grazing angles, which at a street
      // camera is most of the frame.
      position.setY(i, gardenHeight(position.getX(i), position.getZ(i)) + 0.006);
    }
    position.needsUpdate = true;
    geometry.computeVertexNormals();
    worldUv1(geometry);
    const mesh = new THREE.Mesh(geometry, await surfaceMaterial('asphalt', { roughness: 0.94 }));
    mesh.name = 'lane-carriageway';
    mesh.receiveShadow = true;
    surfaces.add(mesh);
  }

  // The two footways, as slabs with a real kerb face. `LANE.footway` is the top
  // and `LANE.channel` the gutter invert, so the exposed face IS the 0.15 m
  // upstand — doc 21 §4's human-scale construction, measured rather than drawn.
  const kerbHeight = LANE.footway - LANE.channel;
  for (const [label, z0, z1] of [
    ['north', LANE.wallZ - 0.3, LANE.kerbNorthZ],
    ['south', LANE.kerbSouthZ, LANE.frontageZ + 0.6],
  ]) {
    const geometry = slab({
      width: runLength,
      height: kerbHeight + 0.5,
      depth: z1 - z0,
      x: runCentre,
      y: LANE.footway - (kerbHeight + 0.5) / 2,
      z: (z0 + z1) / 2,
    });
    const mesh = new THREE.Mesh(geometry, await surfaceMaterial('sidewalk', { roughness: 0.86 }));
    mesh.name = `lane-footway-${label}`;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    surfaces.add(mesh);
  }

  await enrol(surfaces, 'launch-world/lane/ground', LANE_SURFACES.asphalt.roles);
  group.add(surfaces);

  // --- 2. The garden boundary wall -----------------------------------------
  //
  // ARCH-GDN-02 ships a 6 m section WITH the gate in it, so tiling it along the
  // whole boundary would put a gate every six metres. The gate is therefore
  // placed once, from the asset, and the wall either side is first-party
  // geometry in the asset's own materials and at its own measured heights —
  // coping at 1.74 m, plaster over a granite rubble base course, capped with a
  // MAT-GDN-07 tile course. That is the same wall, continued.
  onProgress('Building the boundary wall');
  const wall = new THREE.Group();
  wall.name = 'Stillwater Lane · Boundary wall';
  const WALL = { top: 1.74, thickness: 0.42, base: 0.34, coping: 0.14 };
  const gateHalf = GATE.width / 2;
  const wallRuns = [
    [LANE.xMin - 1.0, GATE.x - gateHalf],
    [GATE.x + gateHalf, LANE.xMax + 1.0],
  ];
  const plaster = await surfaceMaterial('plaster', { roughness: 0.92 });
  const granite = await surfaceMaterial('granite', { roughness: 0.8 });
  const roofTile = await surfaceMaterial('roofTile', { roughness: 0.66 });
  for (const [index, [x0, x1]] of wallRuns.entries()) {
    if (x1 - x0 <= 0.2) continue;
    const width = x1 - x0;
    const centre = (x0 + x1) / 2;
    const groundY = gardenHeight(centre, LANE.wallZ);
    const body = new THREE.Mesh(slab({
      width, height: WALL.top - WALL.base, depth: WALL.thickness,
      x: centre, y: groundY + WALL.base + (WALL.top - WALL.base) / 2, z: LANE.wallZ,
    }), plaster);
    body.name = `boundary-wall-${index}`;
    const plinth = new THREE.Mesh(slab({
      width, height: WALL.base + 0.16, depth: WALL.thickness + 0.1,
      x: centre, y: groundY + (WALL.base + 0.16) / 2 - 0.16, z: LANE.wallZ,
    }), granite);
    plinth.name = `boundary-wall-base-${index}`;
    const cap = new THREE.Mesh(slab({
      width, height: WALL.coping, depth: WALL.thickness + 0.22,
      x: centre, y: groundY + WALL.top + WALL.coping / 2, z: LANE.wallZ,
    }), roofTile);
    cap.name = `boundary-wall-coping-${index}`;
    for (const mesh of [body, plinth, cap]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wall.add(mesh);
    }
  }

  // The west return — the wall turns south across the lane's west end and dies
  // into ARCH-LANE-04's abutment. Without it the corner between the boundary
  // and the closer is an open gap straight out of the world.
  {
    const x = LANE.xMin + 1.2;
    const z0 = LANE.wallZ;
    const z1 = LANE.kerbNorthZ + 0.4;
    const groundY = gardenHeight(x, (z0 + z1) / 2);
    const body = new THREE.Mesh(slab({
      width: WALL.thickness, height: WALL.top - WALL.base, depth: z1 - z0,
      x, y: groundY + WALL.base + (WALL.top - WALL.base) / 2, z: (z0 + z1) / 2,
    }), plaster);
    const cap = new THREE.Mesh(slab({
      width: WALL.thickness + 0.22, height: WALL.coping, depth: z1 - z0,
      x, y: groundY + WALL.top + WALL.coping / 2, z: (z0 + z1) / 2,
    }), roofTile);
    for (const mesh of [body, cap]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wall.add(mesh);
    }
  }

  // The east party flank. The other end of a back-street is the side of the
  // next building, and that is what this is: a blank concrete flank with a
  // parapet, closing the sightline honestly at 6.4 m. No cards, no skyline.
  {
    const concrete = await surfaceMaterial('concrete', { roughness: 0.9 });
    const x = LANE.xMax - 0.6;
    const groundY = gardenHeight(x, LANE.kerbNorthZ);
    const flank = new THREE.Mesh(slab({
      width: 3.2, height: 6.4, depth: LANE.frontageZ + 1.2 - LANE.wallZ,
      x, y: groundY + 3.2, z: (LANE.wallZ + LANE.frontageZ + 1.2) / 2,
    }), concrete);
    flank.name = 'lane-east-flank';
    const parapet = new THREE.Mesh(slab({
      width: 3.5, height: 0.42, depth: LANE.frontageZ + 1.4 - LANE.wallZ,
      x, y: groundY + 6.4 + 0.21, z: (LANE.wallZ + LANE.frontageZ + 1.4) / 2,
    }), concrete);
    for (const mesh of [flank, parapet]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      wall.add(mesh);
    }
  }

  await enrol(wall, 'launch-world/lane/boundary-wall', LANE_SURFACES.plaster.roles);
  group.add(wall);

  // --- 3. The architecture --------------------------------------------------
  onProgress('Raising the frontages');
  const placeBuilding = async (id, { x, z, yaw }) => {
    const loaded = await loadLaneBuilding(id, { lod });
    const root = new THREE.Group();
    root.name = `Stillwater Lane · ${id}`;
    root.add(loaded.root);
    loaded.root.rotation.y = THREE.MathUtils.degToRad(yaw);
    root.position.set(x, gardenHeight(x, z), z);
    await enrol(root, `launch-world/lane/${id}`, {
      baseMaterial: 'mineral', finish: 'raw', renderMode: 'opaque',
      structuralRole: 'primaryMass', objectClass: 'buildingExterior',
    });
    group.add(root);
    census.buildings += 1;
    return loaded;
  };

  for (const frontage of FRONTAGES) {
    // Front face on the frontage line, so the row is flush and the gaps between
    // the volumes read as party-wall joints rather than as random setback.
    await placeBuilding(frontage.id, {
      x: frontage.x,
      z: LANE.frontageZ + frontage.depth / 2,
      yaw: frontage.yaw,
    });
  }
  await placeBuilding(CLOSER.id, { x: CLOSER.x, z: CLOSER.z, yaw: CLOSER.yaw });

  // The gate — the hinge. Sits on the wall line, on the garden's path head.
  {
    const loaded = await loadLaneBuilding('ARCH-GDN-02', { lod });
    const root = new THREE.Group();
    root.name = 'Stillwater Lane · ARCH-GDN-02 gate';
    root.add(loaded.root);
    loaded.root.rotation.y = THREE.MathUtils.degToRad(GATE.yaw);
    // Grounded on the GARDEN side of the threshold, which is the higher of the
    // two — a gate's sill is level with the space it encloses and the step down
    // to the street is on the outside. That is what makes the step read.
    root.position.set(GATE.x, gardenHeight(GATE.x, LANE.wallZ - 1.6), LANE.wallZ - 0.2);
    await enrol(root, 'launch-world/lane/ARCH-GDN-02', LANE_SURFACES.plaster.roles);
    group.add(root);
    census.buildings += 1;
  }

  // --- 4. Kerb bars along the gate approach --------------------------------
  //
  // Doc 21 §3: the garden's own split-granite path edging IS the street kerb.
  // All six bars alternate along the run so no two neighbours repeat (§13).
  onProgress('Setting the kerb');
  {
    const random = rng(4_477);
    let index = 0;
    for (let x = GATE.x - 4.2; x <= GATE.x + 4.2; x += 0.94) {
      const record = GARDEN_PATH_EDGING[index % GARDEN_PATH_EDGING.length];
      const loaded = await loadGardenProp(record, { lod: 1, shadowFill, shadowFillTint });
      surfaceLightingMaterialCount += loaded.surfaceLightingMaterialCount;
      loaded.root.rotation.y = (random() - 0.5) * 0.14;
      loaded.root.position.set(
        x, gardenHeight(x, LANE.kerbNorthZ - 0.22) + 0.02, LANE.kerbNorthZ - 0.22,
      );
      group.add(loaded.root);
      census.kerbBars += 1;
      index += 1;
    }
  }

  // --- 5. Utility poles and the overhead wire network ----------------------
  //
  // Doc 21 §3 singles the wires out: "a defining feature of Japanese urban
  // streets … they appear in every reference plate. Cheap geometry, enormous
  // density return, and they break the sky exactly where §4 wants silhouette
  // variety." They are procedural and cost no credits — the generated asset is
  // the pole HARDWARE, and the spans are solved against where the poles
  // actually ended up.
  onProgress('Stringing the overhead wires');
  const poleRun = [];
  const POLES = Object.freeze([
    ['pole-crossarm', -16.4],
    ['pole-transformer', -8.6],
    ['pole-junction', -1.0],
    ['pole-stay', 6.4],
    ['pole-short', 13.8],
  ]);
  for (const [id, x] of POLES) {
    const record = laneProp(id);
    if (!record) continue;
    const z = LANE.kerbSouthZ + 0.55;
    const loaded = await loadLaneProp(record, { lod: 1, shadowFill, shadowFillTint });
    surfaceLightingMaterialCount += loaded.surfaceLightingMaterialCount;
    const y = gardenHeight(x, z);
    loaded.root.position.set(x, y, z);
    loaded.root.rotation.y = Math.PI / 2;
    group.add(loaded.root);
    census.poles += 1;
    // Service drops onto the frontage opposite, so the network reads as
    // connected to something rather than as an abstract grid.
    const drops = [];
    const frontage = FRONTAGES.find((f) => Math.abs(f.x - x) < f.frontage / 2 + 1.6);
    if (frontage) {
      drops.push(new THREE.Vector3(
        frontage.x + (x < frontage.x ? -1.4 : 1.4), y + 4.1, LANE.frontageZ - 0.15,
      ));
    }
    poleRun.push({
      position: new THREE.Vector3(x, y, z),
      attachments: record.attachments ? [...record.attachments] : undefined,
      drops,
    });
  }
  if (poleRun.length >= 2) {
    const wires = buildLaneOverheadWires(poleRun, {
      // The short bracket pole at the east end carries its conductors 2.2 m
      // lower than the run, so a single set of heights would either float the
      // spans off its crossarms or drag the whole run down. The run's own
      // heights are used and the short pole's drop is absorbed by the sag.
      primaryHeight: 7.4, secondaryHeight: 6.6, commsHeight: 4.9,
    });
    census.wireSpans = wires.userData?.spans ?? 0;
    census.wireTriangles = wires.userData?.triangles ?? 0;
    group.add(wires);
  }

  // --- 6. Street furniture --------------------------------------------------
  //
  // Doc 21 §2's depth bands, in order: a foreground occluder at the near end,
  // the near play space along the kerb, the wall base against the boundary, and
  // the shopfront service clutter opposite.
  //
  // `LANE_REJECTED` is honoured: no bicycle, no folding barrier.
  onProgress('Dressing the street');
  const STREET = Object.freeze([
    // [id, x, z, yawDegrees, lod, sink] — `sink` buries a prop that ships with the
    // mounting hardware it was drawn against.
    // Foreground occluder — the signal pole's mast arm reaches into frame at
    // the camera end without blocking the subject (doc 21 §2 band 1).
    ['signal-pole', 14.6, 26.3, 196, 0],
    // The street's one warm pool, against the garden wall where the camera
    // passes it. Doc 21 §2 band 1's alternative occluder.
    ['vending-machine', 10.4, 21.35, 178, 0],
    ['utility-cabinet', 2.6, 21.3, 174, 0],
    ['standpipe', 1.4, 21.28, 168, 0],
    ['waste-bin', -6.2, 21.32, 192, 0],
    // The lamp ships WITH the mounting pier it was drawn against, and the record
    // says to bury that pier in a wall face. Grounded on the footway it stands
    // 3.4 m proud of a 1.74 m wall and reads as a lamp-post in the middle of the
    // pavement; sunk 1.15 m the pier disappears into the wall and only the
    // bracket and the head are street-side, which is what it is for.
    ['wall-lamp', -9.4, 20.4, 180, 1, -1.15],
    ['wall-lamp', 6.8, 20.4, 180, 1, -1.15],
    // Kerb line, garden side — the rail band doc 21 §4 asks for.
    ['guard-rail', 10.2, 21.72, 90, 1],
    ['guard-rail', 11.3, 21.72, 90, 1],
    ['guard-rail', 12.4, 21.72, 90, 1],
    ['bollard', -3.9, 21.6, 0, 1],
    ['bollard', 1.6, 21.6, 0, 1],
    // Ground detail set into the surfaces themselves.
    ['drain-grates', -12.4, 21.98, 0, 1],
    ['drain-grates', 3.2, 26.82, 0, 1],
    ['manhole', -6.8, 24.2, 22, 1],
    ['manhole', 9.4, 24.9, 74, 1],
    // Shopfront service side, south footway.
    ['crates', -12.2, 28.3, 24, 1],
    ['crates', -11.5, 28.5, 108, 1],
    ['barrel', -13.4, 28.4, 0, 1],
    ['waste-bin', -0.8, 28.35, 12, 1],
    ['street-planter', -6.4, 28.2, 0, 1],
    ['street-planter', -1.9, 28.2, 0, 1],
    ['cones', 5.6, 26.2, 40, 1],
    ['cones', 6.4, 26.6, 210, 1],
    ['cones', 7.1, 26.1, 118, 1],
  ]);
  for (const [id, x, z, yaw, propLod, sink = 0] of STREET) {
    const record = laneProp(id);
    if (!record) continue;
    const loaded = await loadLaneProp(record, { lod: propLod, shadowFill, shadowFillTint });
    surfaceLightingMaterialCount += loaded.surfaceLightingMaterialCount;
    // Everything on a footway stands on the SLAB, not on the height field — the
    // footway is 0.15 m of built kerb above the terrain and a prop grounded on
    // the terrain would sink to its ankles in it.
    const onFootway = z < LANE.kerbNorthZ || z > LANE.kerbSouthZ;
    const y = onFootway ? LANE.footway : gardenHeight(x, z);
    loaded.root.position.set(x, y - 0.01 + sink, z);
    loaded.root.rotation.y = THREE.MathUtils.degToRad(yaw);
    group.add(loaded.root);
    census.props += 1;
  }

  return {
    group,
    census: Object.freeze({ ...census }),
    // ASSERTED by the caller, never eyeballed. A zero means the whole street is
    // outside the scene's surface-lighting model (D19-150 / D-018c).
    surfaceLightingMaterialCount,
  };
}

export { FRONTAGES, GATE, CLOSER };
