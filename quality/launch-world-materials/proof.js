// Applied-surface proof stage for the §9 launch-world material set.
//
//   /quality/launch-world-materials/proof.html?id=MAT-CITY-01&w=1920&h=1080
//
// Renders one material on the surface type it is specified for, at the §11 shot
// distance where it will actually be seen, through the real ToonLab stack: Call
// Me Sensei style bundle -> scene style runtime -> Manufactured Surface / Ground
// Shader. No hand-tuned look and no scene-local shader.
//
// Three things this stage is built to expose, because each is a §13 rejection:
//
//  1. TILING SCALE. Every texture's `repeat` is computed from the material's
//     documented world tile size, so the frame shows the documented texel
//     density, not a flattering arbitrary UV. A 1.745 m post (Yua's source
//     height, §5) stands in frame so the scale claim is checkable by eye.
//  2. GRAZING INCIDENCE. A flat frontal plane flatters a normal map. The stage
//     is a corner with a returning pilaster, so the material is seen frontal,
//     raking and in shadow in one frame — "muddy, stretched, or inconsistent
//     texture scale" has nowhere to hide.
//  3. VALUE STRUCTURE. The stage is yawed after the sun resolves so the lit
//     plane sits near 45 degrees to the sun and the return plane falls into the
//     shadow family. That is what §4's material separation is judged on.
//
// Sets document.title to `proof-ready` when the frame is settled.

import * as THREE from 'three/webgpu';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createSceneStyleRuntime,
  createSkySystem,
  createStyleMaterialContract,
  createStyleTargetLabel,
  labelStyleTarget,
} from '@call-me-sensei/toonlab';
import {
  MANUFACTURED_MATERIAL_MANIFEST_TYPE,
  MANUFACTURED_MATERIAL_MANIFEST_VERSION,
  applyManufacturedMaterialManifest,
} from '@call-me-sensei/toonlab/environment';

const params = new URLSearchParams(location.search);
const id = params.get('id') ?? 'MAT-CITY-01';
const width = Number(params.get('w') ?? 1920);
const height = Number(params.get('h') ?? 1080);

// The §11 shot each material is judged at, and the surface it is specified for.
// `lens` in mm on a 36 mm sensor; `distance` in metres to the nearest face.
// Stillwater Garden framing (`launch-plan/20-stillwater-garden-scene-brief.md`):
// the hero camera space is ~24 x 18 m and there is no distant band at all, so
// every distance here is between 1.4 m and 3.5 m. Nothing in this scene is ever
// seen from where a city façade was.
const VIEWS = Object.freeze({
  'MAT-GDN-01-straight': { shot: 'G01', lens: 35, distance: 3.0, surface: 'ground' },
  'MAT-GDN-01-curved': { shot: 'G01', lens: 35, distance: 3.0, surface: 'ground' },
  'MAT-GDN-02': { shot: 'G02', lens: 50, distance: 1.4, surface: 'ground' },
  'MAT-GDN-03': { shot: 'G01', lens: 35, distance: 2.2, surface: 'ground' },
  'MAT-GDN-04': { shot: 'G01', lens: 35, distance: 2.6, surface: 'ground' },
  'MAT-GDN-05': { shot: 'G03', lens: 70, distance: 1.8, surface: 'wall' },
  'MAT-GDN-06': { shot: 'G05', lens: 35, distance: 3.0, surface: 'wall' },
  'MAT-GDN-06-ochre': { shot: 'G03', lens: 70, distance: 1.8, surface: 'wall' },
  'MAT-GDN-07': { shot: 'G05', lens: 50, distance: 3.5, surface: 'wall' },
  'MAT-GDN-07-plain': { shot: 'G05', lens: 70, distance: 2.4, surface: 'wall' },
  'MAT-GDN-08': { shot: 'G04', lens: 70, distance: 1.6, surface: 'wall' },
  'MAT-GDN-09': { shot: 'G02', lens: 35, distance: 2.4, surface: 'ground' },
  'MAT-GDN-10': { shot: 'G03', lens: 70, distance: 2.0, surface: 'wall' },
  'MAT-GDN-11-mat': { shot: 'G03', lens: 50, distance: 2.2, surface: 'ground' },
  'MAT-GDN-11-heri': { shot: 'G03', lens: 85, distance: 1.6, surface: 'ground' },
  'MAT-CITY-01': { shot: 'G05', lens: 35, distance: 2.6, surface: 'wall' },
  'MAT-CITY-01-graphite': { shot: 'G05', lens: 35, distance: 2.6, surface: 'wall' },
  'MAT-CITY-02': { shot: 'G03', lens: 85, distance: 1.5, surface: 'wall' },
});

const STRUCTURAL_ROLE_TO_STYLE_ROLE = Object.freeze({
  primaryMass: 'primaryMass',
  secondaryStructure: 'secondaryStructure',
  trim: 'trim',
  cavity: 'cavity',
  window: 'window',
});

const setJson = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url} -> ${response.status}`);
  return response.json();
};

async function loadMap(url, { srgb }) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  texture.anisotropy = 16;
  texture.needsUpdate = true;
  return texture;
}

/** aoMap reads uv1 in three r15x+; mirror uv so the AO channel is not ignored. */
function withAoUv(geometry) {
  const uv = geometry.getAttribute('uv');
  if (uv && !geometry.getAttribute('uv1')) geometry.setAttribute('uv1', uv.clone());
  return geometry;
}

/**
 * Rewrites UVs so one texture tile covers exactly `tile` metres of world space
 * on the named plane, independent of the mesh's own UV layout. This is the
 * whole proof: texel density is `resolution / (tile * 100)` px/cm only if the
 * surface is genuinely tiled at `tile` metres.
 */
function worldScaleUv(geometry, tile, plane) {
  const position = geometry.getAttribute('position');
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const [u, v] = plane === 'xz' ? [x, z] : plane === 'yz' ? [z, y] : [x, y];
    uv[i * 2] = u / tile;
    uv[i * 2 + 1] = v / tile;
  }
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('uv1', new THREE.BufferAttribute(uv.slice(), 2));
  return geometry;
}

/** Horizontal bearing of the scene's strongest directional light. */
function sunAzimuth(scene) {
  let best = null;
  scene.traverse((object) => {
    if (!object.isDirectionalLight) return;
    if (!best || object.intensity > best.intensity) best = object;
  });
  if (!best) return null;
  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  best.getWorldPosition(from);
  best.target.getWorldPosition(to);
  const direction = to.sub(from);
  if (direction.lengthSq() < 1e-8) return null;
  return Math.atan2(direction.x, direction.z);
}

async function main() {
  const set = await setJson('/assets-local/launch-world/materials/material-set.json');
  const entry = set.materials.find((row) => row.id === id);
  if (!entry) throw new Error(`unknown material ${id}`);
  const view = VIEWS[id];
  if (!view) throw new Error(`no §11 view for ${id}`);
  const tile = entry.worldTileMetres;
  const base = `/assets-local/launch-world/materials/${id}/maps`;

  const [albedo, normal, roughness, metalness, ao] = await Promise.all([
    loadMap(`${base}/albedo.png`, { srgb: true }),
    loadMap(`${base}/normal.png`, { srgb: false }),
    loadMap(`${base}/roughness.png`, { srgb: false }),
    loadMap(`${base}/metalness.png`, { srgb: false }),
    loadMap(`${base}/ao.png`, { srgb: false }),
  ]);

  const renderer = new THREE.WebGPURenderer({ antialias: true });
  renderer.setPixelRatio(1);
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  document.body.append(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  const sensorHeight = 36 / (width / height);
  const fov = 2 * Math.atan(sensorHeight / (2 * view.lens)) * (180 / Math.PI);
  const camera = new THREE.PerspectiveCamera(fov, width / height, 0.05, 400);

  const transmissive = entry.roles.renderMode === 'transmissive';
  const testMaterial = new THREE.MeshStandardMaterial({
    aoMap: ao,
    color: 0xffffff,
    map: albedo,
    metalness: 1,
    metalnessMap: metalness,
    normalMap: normal,
    opacity: transmissive ? 0.34 : 1,
    roughness: 1,
    roughnessMap: roughness,
    transparent: transmissive,
  });
  testMaterial.name = `${id}-surface`;
  testMaterial.userData = { toonlabMaterialId: `${id}-surface` };

  // Anything not under test reads as one plain matte surface, so the eye judges
  // a material rather than a composition.
  const contextMaterial = new THREE.MeshStandardMaterial({
    color: 0x9298a0, metalness: 0, roughness: 0.94,
  });
  contextMaterial.name = 'proof-context';
  contextMaterial.userData = { toonlabMaterialId: 'proof-context' };

  const postMaterial = new THREE.MeshStandardMaterial({
    color: 0x23272d, metalness: 0, roughness: 0.68,
  });
  postMaterial.name = 'proof-scale-post';
  postMaterial.userData = { toonlabMaterialId: 'proof-scale-post' };

  const isGround = view.surface === 'ground';
  const stage = new THREE.Group();
  stage.name = `${id} proof stage`;

  const mesh = (geometry, material, { cast = true, receive = true } = {}) => {
    const object = new THREE.Mesh(geometry, material);
    object.castShadow = cast;
    object.receiveShadow = receive;
    stage.add(object);
    return object;
  };

  // --- ground: 40 x 40 m, world-scaled so one tile is exactly `tile` metres
  const groundGeometry = new THREE.PlaneGeometry(40, 40, 1, 1);
  groundGeometry.rotateX(-Math.PI / 2);
  mesh(
    isGround ? worldScaleUv(groundGeometry, tile, 'xz') : withAoUv(groundGeometry),
    isGround ? testMaterial : contextMaterial,
    { cast: false },
  );

  // --- back wall: faces +Z, 20 x 10 m
  const wallGeometry = new THREE.PlaneGeometry(20, 10, 1, 1);
  wallGeometry.translate(0, 5, -6);
  mesh(
    isGround ? withAoUv(wallGeometry) : worldScaleUv(wallGeometry, tile, 'xy'),
    isGround ? contextMaterial : testMaterial,
  );

  // --- return wall: faces +X, gives the shadow-family plane
  const returnGeometry = new THREE.PlaneGeometry(12, 10, 1, 1);
  returnGeometry.rotateY(Math.PI / 2);
  returnGeometry.translate(-4.2, 5, 0);
  mesh(
    isGround ? withAoUv(returnGeometry) : worldScaleUv(returnGeometry, tile, 'yz'),
    isGround ? contextMaterial : testMaterial,
  );

  // --- pilaster: catches the sun edge-on and casts onto the back wall
  const pilasterGeometry = new THREE.BoxGeometry(0.85, 10, 0.85);
  pilasterGeometry.translate(-3.3, 5, -5.15);
  mesh(
    isGround ? withAoUv(pilasterGeometry) : worldScaleUv(pilasterGeometry, tile, 'xy'),
    isGround ? contextMaterial : testMaterial,
  );

  // --- a 0.17 m step (§8's 0.15-0.19 m rise) so ground materials are also seen
  //     at a grazing angle and over an edge, not only face-on
  if (isGround) {
    const stepGeometry = new THREE.BoxGeometry(9, 0.17, 2.2);
    stepGeometry.translate(0, 0.085, -3.4);
    mesh(worldScaleUv(stepGeometry, tile, 'xz'), testMaterial);
  }

  // --- 1.745 m scale post: Yua's source height (§5)
  const postGeometry = new THREE.BoxGeometry(0.085, 1.745, 0.085);
  postGeometry.translate(-0.25, 1.745 / 2, -5.45);
  mesh(withAoUv(postGeometry), postMaterial, { receive: false });

  const styleRole = STRUCTURAL_ROLE_TO_STYLE_ROLE[entry.roles.structuralRole] ?? 'primaryMass';
  // Every §9 material routes through Manufactured Surface: it is the only
  // ToonLab shader that carries the full PBR set. The Ground Shader takes
  // `map` only and throws on normal/roughness/metalness/AO (D19-039), which
  // would silently delete most of what these materials are.
  const useGroundDomain = entry.styleDomain === 'terrain.ground';
  const domain = useGroundDomain ? 'terrain.ground' : 'manufactured.surface';
  labelStyleTarget(stage, createStyleTargetLabel(domain, {
    materials: createStyleMaterialContract(domain, {
      assignments: {
        [`${id}-surface`]: { roles: [useGroundDomain ? 'ground' : styleRole] },
        'proof-context': { roles: [useGroundDomain ? 'ground' : 'secondaryStructure'] },
        'proof-scale-post': { roles: [useGroundDomain ? 'ground' : 'trim'] },
      },
    }),
    targetId: `launch-world-materials/${id}`,
  }));

  // §8: "Every material receives semantic ToonLab roles before the Manufactured
  // Surface shader is applied." The style bundle's scene-label contract and the
  // manufactured material classification are DIFFERENT vocabularies — a label
  // role of 'secondaryStructure' says nothing about baseMaterial or finish, so
  // without this manifest a metalness-1 brushed-steel map converts to a diffuse
  // grey wall. Stamp the classification first, then convert.
  const manifestReport = applyManufacturedMaterialManifest(stage, {
    type: MANUFACTURED_MATERIAL_MANIFEST_TYPE,
    version: MANUFACTURED_MATERIAL_MANIFEST_VERSION,
    assetId: id,
    objectClass: entry.roles.objectClass,
    assignments: [
      {
        selector: { materialName: `${id}-surface` },
        classification: {
          baseMaterial: entry.roles.baseMaterial,
          finish: entry.roles.finish,
          renderMode: entry.roles.renderMode,
          structuralRole: entry.roles.structuralRole,
        },
      },
      {
        selector: { materialName: 'proof-context' },
        classification: {
          baseMaterial: 'mineral', finish: 'matte',
          renderMode: 'opaque', structuralRole: 'secondaryStructure',
        },
      },
      {
        selector: { materialName: 'proof-scale-post' },
        classification: {
          baseMaterial: 'metal', finish: 'painted',
          renderMode: 'opaque', structuralRole: 'trim',
        },
      },
    ],
  });

  scene.add(stage);

  // Camera sits at the §11 distance from the nearest test face and is yawed so
  // the surface both faces the lens and recedes — near-field texel density and
  // context in one honest frame.
  if (isGround) {
    camera.position.set(view.distance * 0.5, 1.58, view.distance * 0.75);
    camera.lookAt(-view.distance * 0.35, 0.06, -view.distance * 0.85);
  } else {
    // Stand off the wall by exactly the §11 shot distance, then step sideways
    // so the surface both faces the lens and recedes. Aim low enough that the
    // ground line and the 1.745 m scale post stay in frame at wide lenses.
    camera.position.set(view.distance * 0.55, 1.55, -6 + view.distance);
    camera.lookAt(-view.distance * 0.32, Math.min(1.15, view.distance * 0.42), -5.98);
  }
  scene.add(camera);

  const sky = await createSkySystem({ camera, quality: 'medium', renderer, scene });
  const runtime = createSceneStyleRuntime({
    quality: 'balanced', renderer, scene, sky, timeOfDay: 10,
  });
  await runtime.apply(CALL_ME_SENSEI_STYLE_BUNDLE, {
    discovery: 'scene-labels', mode: 'strict', watch: false,
  });

  // Yaw the stage (not the sun) so the lit plane sits near 45 degrees to the
  // key. Rotating the stage keeps the camera framing fixed across materials, so
  // the only variable between proof frames is the material.
  const world = new THREE.Group();
  world.name = 'proof-world';
  scene.remove(stage);
  scene.remove(camera);
  world.add(stage, camera);
  scene.add(world);
  const alignToSun = () => {
    const azimuth = sunAzimuth(scene);
    if (azimuth === null) return;
    // The back wall's normal is +Z in stage space. Yaw the whole stage (never
    // the sun) so the key lands ~40 degrees off that normal: the wall stays
    // sunlit, the return wall drops into the shadow family, and the pilaster
    // rakes. Rotating the stage rather than the light keeps the camera framing
    // identical across every material, so the only variable is the material.
    world.rotation.y = azimuth + Math.PI + (Math.PI * 40) / 180;
  };
  alignToSun();

  document.body.dataset.toonlabMaterial = id;
  document.body.dataset.toonlabTile = String(tile);
  document.body.dataset.toonlabDensity = String(entry.texelDensityPxPerCm);
  document.body.dataset.toonlabShot = view.shot;
  document.body.dataset.toonlabDomain = domain;
  document.body.dataset.toonlabRole = useGroundDomain ? 'ground' : styleRole;
  document.body.dataset.toonlabClassification =
    `${entry.roles.baseMaterial}/${entry.roles.finish}/${entry.roles.renderMode}/${entry.roles.structuralRole}`;
  document.body.dataset.toonlabManifestAssignments =
    String(manifestReport.appliedAssignmentCount);

  // Which Manufactured Surface profile the classification actually selected.
  // The role tuple is an input; this is the shader's answer, and the two have
  // silently disagreed before (D19-075 sent `brushed` to a profile that
  // discarded the authored albedo, D19-079 dropped `translucent` entirely).
  // Reporting it turns "the roles are applied" into "the roles are honoured".
  const surfaceProfiles = new Set();
  stage.traverse((object) => {
    for (const material of (Array.isArray(object.material)
      ? object.material
      : object.material ? [object.material] : [])) {
      if (material?.name?.includes(id) || material?.userData?.urbanSourceMaterial?.includes(id)) {
        if (material.userData?.urbanSurfaceProfile) {
          surfaceProfiles.add(material.userData.urbanSurfaceProfile);
        }
      }
    }
  });
  document.body.dataset.toonlabSurfaceProfile = [...surfaceProfiles].join(',') || 'none';

  // The runtime drives lighting, sun placement and shadow updates from its own
  // scheduler; without update() the stage renders under ambient only and every
  // normal map looks flat. Step a fixed 1/60 s so the frame is deterministic.
  let frames = 0;
  renderer.setAnimationLoop(() => {
    sky.update?.(1 / 60);
    runtime.update(1 / 60, camera);
    renderer.render(scene, camera);
    frames += 1;
    if (frames === 90) document.title = 'proof-ready';
  });
}

main().catch((error) => {
  document.title = `proof-error: ${error.message}`;
  console.error(error);
});
