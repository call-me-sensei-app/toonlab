// "Cozy Study" — the Environment Lab's bundled CC0 showcase interior. Built
// entirely from assets that ship with the repo: KayKit Furniture Bits models
// (public/props/cc0/kaykit-furniture, CC0 by Kay Lousberg) and Poly Haven
// texture sets (public/environments/cc0/polyhaven — Wood Floor by Dimitrios
// Savva, Painted Plaster Wall by Amal Kumar). See ATTRIBUTION.md. The room
// shell is procedural; the environment shader stylizes everything.

import * as THREE from 'three';

import { loadModelAsset } from '../../../src/character/modelLoader.js';
import { buildRoomShell } from './roomShell.js';

const FURNITURE_BASE = '/props/cc0/kaykit-furniture';
const TEXTURE_BASE = '/environments/cc0/polyhaven';

/** [model file, x, z, rotationY, restOnName] — y resolves from the surface
 * named restOnName (its bounding-box top) or the floor. */
const FURNITURE_LAYOUT = Object.freeze([
  ['rug_rectangle_A', 0.1, -0.4, 0.04, null],
  ['couch_pillows', -1.7, -2.85, 0, null],
  ['table_medium', -1.55, -1.15, 0, null],
  ['book_set', -1.55, -1.15, 0.6, 'table_medium'],
  ['armchair_pillows', 1.9, -1.35, -0.85, null],
  ['shelf_B_large_decorated', -4.1, 0.9, Math.PI / 2, null],
  ['cabinet_medium_decorated', 3.35, -3.05, 0, null],
  ['lamp_standing', -3.85, -2.9, 0.6, null],
  ['pictureframe_medium', -1.7, -3.36, 0, 'wall'],
  ['table_small', 3.6, 1.7, -0.4, null],
  ['lamp_table', 3.6, 1.7, -0.35, 'table_small'],
  ['chair_A_wood', 2.75, 2.25, -2.2, null],
  ['rug_oval_A', -3.4, -0.9, Math.PI / 2, null],
]);

const PICTURE_FRAME_HEIGHT = 1.85;

export async function createStudyStage({ renderer }) {
  const root = new THREE.Group();
  root.name = 'Cozy Study (CC0)';

  const [shell, ...assets] = await Promise.all([
    buildRoomShell({
      floorTextureUrl: `${TEXTURE_BASE}/wood-floor-diff-1k.jpg`,
      wallTextureUrl: `${TEXTURE_BASE}/painted-plaster-wall-diff-1k.jpg`,
    }),
    ...FURNITURE_LAYOUT.map(([file]) => loadModelAsset(`${FURNITURE_BASE}/${file}.gltf`, { renderer })),
  ]);
  root.add(shell);

  const modelByName = new Map();
  const surfaceTop = (name) => {
    const surface = modelByName.get(name);
    if (!surface) return 0;
    return new THREE.Box3().setFromObject(surface).max.y;
  };

  FURNITURE_LAYOUT.forEach(([file, x, z, rotationY, restOn], index) => {
    const model = assets[index].root;
    model.name = file;
    model.rotation.y = rotationY;
    let y = 0;
    if (restOn === 'wall') y = PICTURE_FRAME_HEIGHT;
    else if (restOn) y = surfaceTop(restOn);
    model.position.set(x, y, z);
    modelByName.set(file, model);
    root.add(model);
  });

  return root;
}
