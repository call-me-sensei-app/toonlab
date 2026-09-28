// Shared procedural room shell for the Environment Lab's bundled stages:
// textured floor, plaster walls, a window opening with a warm emissive
// daylight panel. Geometry only — the environment shader stylizes it.

import * as THREE from 'three';

async function loadRepeatingTexture(url, repeatX, repeatY) {
  const texture = await new THREE.TextureLoader().loadAsync(url);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}

function wallSegment(material, width, height, depth, x, y, z, name) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.name = name;
  return mesh;
}

export async function buildRoomShell({
  floorRepeat = [3, 2.4],
  floorTextureUrl,
  room = { depth: 7, height: 3.4, width: 9 },
  wallRepeat = [2.4, 1],
  wallTextureUrl,
  window: windowSpec = { bottom: 1.0, centerX: 1.1, height: 1.6, width: 2.4 },
} = {}) {
  const shell = new THREE.Group();
  shell.name = 'Room shell';

  const [floorTexture, wallTexture] = await Promise.all([
    loadRepeatingTexture(floorTextureUrl, ...floorRepeat),
    loadRepeatingTexture(wallTextureUrl, ...wallRepeat),
  ]);
  const floorMaterial = new THREE.MeshStandardMaterial({ map: floorTexture, roughness: 0.85 });
  const wallMaterial = new THREE.MeshStandardMaterial({ map: wallTexture, roughness: 0.95 });

  const floor = new THREE.Mesh(new THREE.BoxGeometry(room.width, 0.2, room.depth), floorMaterial);
  floor.position.y = -0.1;
  floor.name = 'Floor';
  shell.add(floor);

  // Back wall with the window opening composed from four segments.
  const backZ = -room.depth / 2 - 0.1;
  const leftEdge = windowSpec.centerX - windowSpec.width / 2;
  const rightEdge = windowSpec.centerX + windowSpec.width / 2;
  const leftWidth = leftEdge - (-room.width / 2);
  const rightWidth = room.width / 2 - rightEdge;
  const topHeight = room.height - (windowSpec.bottom + windowSpec.height);
  shell.add(
    wallSegment(wallMaterial, leftWidth, room.height, 0.24, -room.width / 2 + leftWidth / 2, room.height / 2, backZ, 'Back wall · left'),
    wallSegment(wallMaterial, rightWidth, room.height, 0.24, rightEdge + rightWidth / 2, room.height / 2, backZ, 'Back wall · right'),
    wallSegment(wallMaterial, windowSpec.width, windowSpec.bottom, 0.24, windowSpec.centerX, windowSpec.bottom / 2, backZ, 'Back wall · sill'),
    wallSegment(wallMaterial, windowSpec.width, topHeight, 0.24, windowSpec.centerX, windowSpec.bottom + windowSpec.height + topHeight / 2, backZ, 'Back wall · lintel'),
  );

  // Side wall along -x.
  shell.add(wallSegment(
    wallMaterial, 0.24, room.height, room.depth,
    -room.width / 2 - 0.1, room.height / 2, 0, 'Side wall',
  ));

  // Daylight panel just behind the window opening.
  const daylight = new THREE.Mesh(
    new THREE.PlaneGeometry(windowSpec.width + 0.6, windowSpec.height + 0.6),
    new THREE.MeshStandardMaterial({
      color: 0xfff4de,
      emissive: 0xffe9bf,
      emissiveIntensity: 2.2,
    }),
  );
  daylight.position.set(windowSpec.centerX, windowSpec.bottom + windowSpec.height / 2, backZ - 0.3);
  daylight.name = 'Window daylight';
  shell.add(daylight);

  return shell;
}
