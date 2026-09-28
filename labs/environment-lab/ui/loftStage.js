// "Reading Loft" — the Environment Lab's realistic CC0 stage: photoscanned
// Poly Haven furniture (public/environments/cc0/polyhaven/models — Sofa 02,
// Modern Arm Chair 01, Round Wooden Table 01, Classic Console 01, Steel
// Frame Shelves 01, Potted Plant 04) plus two Smithsonian Open Access scans
// selected through the ToonLab Pro catalog (baluster vase, Colonoware pot).
// Same procedural room shell; the environment shader stylizes real PBR
// scans, which is exactly the workflow this stage demonstrates. See
// ATTRIBUTION.md for per-asset credits.

import * as THREE from 'three';

import { loadModelAsset } from '../../../src/character/modelLoader.js';
import { buildRoomShell } from './roomShell.js';

const BASE = '/environments/cc0';

/** [model url, x, z, rotationY, restOnName, scaleToMaxDimension, reorient]
 * — scans arrive at arbitrary scale and axis conventions, so pieces
 * normalize to a target max dimension and re-orient before placement
 * (last column: null | 'x' | 'z' re-orientation).
 * (Measured: the shelves scan is 10× oversized, the vase is Z-up, the round
 * table is dining height, the plant is a 27cm desk plant.) */
const LAYOUT = Object.freeze([
  [`${BASE}/polyhaven/models/sofa_02/sofa_02_1k.gltf`, -1.9, -3.35, 0, null, null, 0],
  [`${BASE}/polyhaven/models/round_wooden_table_01/round_wooden_table_01_1k.gltf`, -1.5, -1.1, 0, null, 0.86, 0],
  [`${BASE}/polyhaven/models/modern_arm_chair_01/modern_arm_chair_01_1k.gltf`, 1.7, -1.3, -0.95, null, null, 0],
  [`${BASE}/polyhaven/models/ClassicConsole_01/ClassicConsole_01_1k.gltf`, -4.15, 0.7, Math.PI / 2, null, null, 0],
  [`${BASE}/polyhaven/models/steel_frame_shelves_01/steel_frame_shelves_01_1k.gltf`, 3.7, -3.25, 0, null, 2.1, 0],
  [`${BASE}/polyhaven/models/potted_plant_04/potted_plant_04_1k.gltf`, 4.25, -1.5, 0.4, null, 1.15, 0],
  [`${BASE}/smithsonian/baluster-vase.glb`, -4.15, 0.7, 0.3, 'ClassicConsole_01_1k', 0.52, 'z'],
  [`${BASE}/smithsonian/colonoware-pot.glb`, -1.5, -1.1, -0.4, 'round_wooden_table_01_1k', 0.3, 'x'],
]);

function nameFromUrl(url) {
  const file = url.slice(url.lastIndexOf('/') + 1);
  return file.replace(/\.[^.]+$/, '');
}

export async function createLoftStage({ renderer }) {
  const root = new THREE.Group();
  root.name = 'Reading Loft (CC0)';

  const [shell, ...assets] = await Promise.all([
    buildRoomShell({
      floorTextureUrl: `${BASE}/polyhaven/wood-floor-diff-1k.jpg`,
      floorRepeat: [3.2, 2.6],
      room: { depth: 7.5, height: 3.6, width: 9.5 },
      wallTextureUrl: `${BASE}/polyhaven/painted-plaster-wall-diff-1k.jpg`,
      window: { bottom: 0.95, centerX: 0.4, height: 1.8, width: 3.2 },
    }),
    // Smithsonian scans are Draco-compressed — the bundled decoders unpack them.
    ...LAYOUT.map(([url]) => loadModelAsset(url, { decoderBasePath: '/', renderer })),
  ]);
  root.add(shell);

  const modelByName = new Map();
  const surfaceTop = (name) => {
    const surface = modelByName.get(name);
    if (!surface) return 0;
    return new THREE.Box3().setFromObject(surface).max.y;
  };

  LAYOUT.forEach(([url, x, z, rotationY, restOn, scaleTo, reorient], index) => {
    let model = assets[index].root;
    // Axis re-orientation happens on an inner node so the yaw/scale/rest
    // math below stays axis-aligned. 'x': the scan's +Z is its up axis;
    // 'z': the scan lies along +X (e.g. the baluster vase).
    if (reorient) {
      const inner = model;
      if (reorient === 'x') inner.rotation.x = -Math.PI / 2;
      if (reorient === 'z') inner.rotation.z = Math.PI / 2;
      inner.updateMatrixWorld(true);
      model = new THREE.Group();
      model.add(inner);
    }
    model.name = nameFromUrl(url);

    if (scaleTo) {
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const reference = Math.max(size.x, size.y, size.z);
      if (reference > 0) model.scale.multiplyScalar(scaleTo / reference);
      model.updateMatrixWorld(true);
    }
    // Scans rarely pivot at their base — rest the (re-oriented, scaled)
    // bounding box's bottom on the surface instead of trusting the origin.
    const box = new THREE.Box3().setFromObject(model);
    model.position.y -= box.min.y;
    model.rotation.y = rotationY;
    const y = restOn ? surfaceTop(restOn) : 0;
    model.position.x = x;
    model.position.z = z;
    model.position.y += y;
    modelByName.set(model.name, model);
    root.add(model);
  });

  return root;
}
