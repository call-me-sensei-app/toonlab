import * as THREE from 'three';

import { applyEnvironmentShader } from '../../src/environment/environmentMaterialAdapter.js';
import { attachFactoryStyleTarget, markFactoryStyleMaterial } from '../../src/styles/styleMetadata.js';

const CITY_ATLAS_URL = '/assets-local/launch-world/textures/anime-city-facade-atlas.png';
const COAST_ATLAS_URL = '/assets-local/launch-world/textures/anime-coastal-park-atlas.png';

export const LAUNCH_WORLD_ID = 'launch-world/anime-coastal-city/v1';
export const LAUNCH_WORLD_BOUNDS = Object.freeze({ minX: -42, maxX: 42, minZ: -64, maxZ: 30 });

const palette = Object.freeze({
  asphalt: '#334b59',
  charcoal: '#173646',
  coral: '#ed7868',
  cream: '#f4ead5',
  gold: '#f8bd43',
  lawn: '#73b869',
  navy: '#294d78',
  paleBlue: '#c6edf2',
  turquoise: '#36c2c1',
  white: '#fffaf0',
});

function material(name, color, options = {}) {
  const value = new THREE.MeshStandardMaterial({ color, metalness: 0, roughness: 0.72, ...options });
  value.name = name;
  markFactoryStyleMaterial(value, name.replaceAll('_', '-'), { managed: false });
  return value;
}

function box(name, size, position, sourceMaterial, parent, options = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), sourceMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = options.castShadow !== false;
  mesh.receiveShadow = options.receiveShadow !== false;
  parent.add(mesh);
  return mesh;
}

function cylinder(name, radiusTop, radiusBottom, height, position, sourceMaterial, parent, segments = 12) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments), sourceMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function plane(name, size, position, rotation, sourceMaterial, parent) {
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(...size), sourceMaterial);
  mesh.name = name;
  mesh.position.set(...position);
  mesh.rotation.set(...rotation);
  mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function atlasTile(base, index, name, { emissive = null, roughness = 0.78 } = {}) {
  const texture = base.clone();
  texture.needsUpdate = true;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  const column = index % 4;
  const row = Math.floor(index / 4);
  const gutter = 0.009;
  texture.repeat.set(0.25 - gutter * 2, 0.25 - gutter * 2);
  texture.offset.set(column * 0.25 + gutter, 1 - (row + 1) * 0.25 + gutter);
  const result = material(name, '#ffffff', { map: texture, roughness });
  if (emissive) {
    result.emissive = new THREE.Color(emissive);
    result.emissiveMap = texture;
    result.emissiveIntensity = 0.65;
  }
  return result;
}

function repeatTextureMaterial(source, name, {
  repeat = [1, 1],
  roughness = 0.85,
  transparent = false,
  opacity = 1,
} = {}) {
  source.colorSpace = THREE.SRGBColorSpace;
  source.wrapS = THREE.RepeatWrapping;
  source.wrapT = THREE.RepeatWrapping;
  source.repeat.set(...repeat);
  return material(name, '#ffffff', { map: source, opacity, roughness, transparent });
}

function addWindows(group, { columns, floors, origin, spacing, width, litSeed = 0, streetFacing = false }) {
  const glassDark = material('window_glass', '#7eb4c5', { metalness: 0.12, roughness: 0.2 });
  const glassLit = material('window_glass_lit', '#ffd889', { emissive: '#ffc15c', emissiveIntensity: 0.35, roughness: 0.32 });
  for (let floor = 0; floor < floors; floor += 1) {
    for (let column = 0; column < columns; column += 1) {
      const lit = ((floor * 11 + column * 7 + litSeed) % 9) < 2;
      const columnOffset = column * spacing;
      box(
        `Window ${floor + 1}.${column + 1}`,
        streetFacing ? [0.08, 1.12, width] : [width, 1.12, 0.08],
        streetFacing
          ? [origin[0], origin[1] + floor * 1.72, origin[2] + columnOffset]
          : [origin[0] + columnOffset, origin[1] + floor * 1.72, origin[2]],
        lit ? glassLit : glassDark,
        group,
        { castShadow: false },
      );
      box(
        'Window sill',
        streetFacing ? [0.16, 0.07, width + 0.18] : [width + 0.18, 0.07, 0.16],
        streetFacing
          ? [origin[0], origin[1] - 0.63 + floor * 1.72, origin[2] + columnOffset]
          : [origin[0] + columnOffset, origin[1] - 0.63 + floor * 1.72, origin[2] + 0.04],
        material('painted_trim', palette.cream, { roughness: 0.6 }),
        group,
        { castShadow: false },
      );
    }
  }
}

function makeBuilding({ atlas, facadeIndex, height, position, width, depth, accent, side = 'left', seed = 1 }) {
  const group = new THREE.Group();
  group.name = `City building ${seed}`;
  group.position.set(...position);
  const body = material('painted_concrete', accent, { roughness: 0.88 });
  box('Building mass', [width, height, depth], [0, height / 2, 0], body, group);
  const streetSign = atlasTile(atlas, facadeIndex, 'graphic_panel');
  const faceX = side === 'left' ? width / 2 + 0.012 : -width / 2 - 0.012;
  const rotationY = side === 'left' ? Math.PI / 2 : -Math.PI / 2;
  plane('Hero facade panel', [depth - 0.5, 4.65], [faceX, 2.42, 0], [0, rotationY, 0], streetSign, group);
  const floors = Math.max(2, Math.floor((height - 5.2) / 1.72));
  const columns = Math.max(2, Math.floor(depth / 1.7));
  addWindows(group, {
    columns,
    floors,
    origin: [faceX + (side === 'left' ? 0.02 : -0.02), 6.1, -(columns - 1) * 0.72],
    spacing: 1.44,
    streetFacing: true,
    width: 0.92,
    litSeed: seed,
  });
  const roof = material('painted_metal', seed % 2 ? palette.turquoise : palette.coral, { metalness: 0.18, roughness: 0.45 });
  box('Roof cap', [width + 0.36, 0.28, depth + 0.34], [0, height + 0.14, 0], roof, group);
  cylinder('Roof tank', 0.58, 0.64, 1.25, [width * 0.22, height + 0.78, 0], material('painted_metal', palette.cream, { metalness: 0.2 }), group, 16);
  group.traverse((object) => { if (object.isMesh) object.userData.launchWorldSolid = true; });
  attachFactoryStyleTarget(group, 'manufacturedEnvironment', {
    assetId: `${LAUNCH_WORLD_ID}/building-${seed}`,
    collision: 'bounds',
    targetId: `launch-world/building-${seed}`,
  });
  return group;
}

function makeStreetLamp(parent, x, z, side = 1, evening = false) {
  const dark = material('painted_metal', palette.charcoal, { metalness: 0.42, roughness: 0.38 });
  const glow = material('light_glass', '#fff3c2', { emissive: '#ffd468', emissiveIntensity: evening ? 2.6 : 0.28, roughness: 0.2 });
  const group = new THREE.Group();
  group.name = 'Coastal city street lamp';
  group.position.set(x, 0, z);
  cylinder('Lamp post', 0.07, 0.1, 4.7, [0, 2.35, 0], dark, group, 14);
  box('Lamp arm', [0.82, 0.08, 0.08], [side * 0.34, 4.52, 0], dark, group);
  cylinder('Lamp shade', 0.26, 0.14, 0.28, [side * 0.72, 4.34, 0], dark, group, 16);
  const bulb = cylinder('Lamp glow', 0.12, 0.18, 0.28, [side * 0.72, 4.17, 0], glow, group, 16);
  bulb.castShadow = false;
  if (evening) {
    const light = new THREE.PointLight('#ffd082', 17, 11, 2.1);
    light.position.set(side * 0.72, 4.05, 0);
    group.add(light);
  }
  parent.add(group);
  return group;
}

function makeBench(parent, x, z, rotation = 0) {
  const group = new THREE.Group();
  group.name = 'Painted coastal bench';
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const wood = material('wood_surface', '#d98f55', { roughness: 0.72 });
  const metal = material('painted_metal', palette.navy, { metalness: 0.3, roughness: 0.48 });
  for (let index = 0; index < 5; index += 1) {
    box('Bench slat', [2.15, 0.11, 0.23], [0, 0.72 + index * 0.24, index < 2 ? 0 : -0.34], wood, group);
  }
  [-0.78, 0.78].forEach((offset) => {
    box('Bench leg', [0.1, 0.72, 0.1], [offset, 0.36, 0], metal, group);
    box('Bench support', [0.1, 1.25, 0.1], [offset, 0.72, -0.36], metal, group);
  });
  parent.add(group);
  attachFactoryStyleTarget(group, 'manufactured.surface', {
    assetId: `${LAUNCH_WORLD_ID}/bench`, collision: 'bounds', targetId: `launch-world/bench-${x}-${z}`,
  });
  return group;
}

function makeTree(parent, x, z, scale = 1, seed = 1) {
  const group = new THREE.Group();
  group.name = 'Coastal broadleaf tree';
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const bark = material('woody_surface', '#795a48', { roughness: 0.94 });
  const greens = ['#4f9c65', '#65b968', '#83c56f'].map((color, index) => material(`foliage_card_${index}`, color, { roughness: 0.9 }));
  cylinder('Tree trunk', 0.28, 0.46, 4.4, [0, 2.2, 0], bark, group, 10);
  const clusters = [
    [-1.15, 4.7, 0.15, 1.25], [0.1, 5.35, 0, 1.48], [1.12, 4.72, -0.12, 1.2],
    [-0.45, 4.42, 1.0, 1.08], [0.62, 4.6, 0.88, 1.08], [0, 4.35, -1.02, 1.16],
  ];
  clusters.forEach(([cx, cy, cz, radius], index) => {
    const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(radius, 2), greens[(index + seed) % greens.length]);
    mesh.name = 'Tree leaf crown';
    mesh.position.set(cx, cy, cz);
    mesh.scale.y = 0.72 + ((index + seed) % 3) * 0.09;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData.environmentShaderExclude = true;
    group.add(mesh);
  });
  parent.add(group);
  attachFactoryStyleTarget(group, 'vegetation.tree', {
    assetId: `${LAUNCH_WORLD_ID}/broadleaf-${seed}`,
    collision: { type: 'cylinder', radius: 0.55 * scale, height: 4.4 * scale },
    targetId: `launch-world/tree-${seed}`,
  });
  return group;
}

function makePalm(parent, x, z, scale = 1, seed = 1) {
  const group = new THREE.Group();
  group.name = 'Coastal palm';
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  const bark = material('woody_surface', '#a87b54', { roughness: 0.9 });
  const leaf = material('foliage_card', '#4fb66f', {
    emissive: '#173c24', emissiveIntensity: 0.22, roughness: 0.88, side: THREE.DoubleSide,
  });
  for (let segment = 0; segment < 7; segment += 1) {
    const trunk = cylinder('Palm trunk segment', 0.19 - segment * 0.012, 0.25 - segment * 0.012, 0.8, [segment * 0.035, 0.42 + segment * 0.72, 0], bark, group, 9);
    trunk.rotation.z = -0.05;
  }
  const leafGeometry = new THREE.SphereGeometry(0.55, 10, 6);
  for (let index = 0; index < 11; index += 1) {
    const angle = index / 11 * Math.PI * 2 + seed * 0.17;
    const frond = new THREE.Group();
    frond.name = 'Segmented palm frond';
    for (let segment = 0; segment < 5; segment += 1) {
      const distance = 0.48 + segment * 0.58;
      const leaflet = new THREE.Mesh(leafGeometry, leaf);
      leaflet.name = 'Palm leaflet';
      leaflet.position.set(Math.cos(angle) * distance, -segment * segment * 0.025, Math.sin(angle) * distance);
      leaflet.scale.set(1.05 - segment * 0.09, 0.14, 0.42 - segment * 0.045);
      leaflet.rotation.y = -angle;
      leaflet.castShadow = true;
      leaflet.userData.environmentShaderExclude = true;
      frond.add(leaflet);
    }
    frond.position.set(0, 5.55 + (index % 3) * 0.04, 0);
    group.add(frond);
  }
  const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), leaf);
  crown.name = 'Palm crown';
  crown.position.set(0, 5.5, 0);
  crown.userData.environmentShaderExclude = true;
  group.add(crown);
  parent.add(group);
  attachFactoryStyleTarget(group, 'vegetation.tree', {
    assetId: `${LAUNCH_WORLD_ID}/palm-${seed}`,
    collision: { type: 'cylinder', radius: 0.42 * scale, height: 5.2 * scale },
    targetId: `launch-world/palm-${seed}`,
  });
  return group;
}

function makePlanter(parent, x, z, color, seed) {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  const pot = material('painted_concrete', color, { roughness: 0.82 });
  box('Planter', [1.25, 0.72, 1.25], [0, 0.36, 0], pot, group);
  const leaf = material('foliage_card', seed % 2 ? '#4e9a63' : '#6cb669', { roughness: 0.9 });
  for (let index = 0; index < 9; index += 1) {
    const angle = index * 2.3999;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.38, 10, 7), leaf);
    mesh.name = 'Planter foliage';
    mesh.position.set(Math.cos(angle) * 0.38, 0.9 + (index % 3) * 0.13, Math.sin(angle) * 0.38);
    mesh.scale.set(0.8, 1.35, 0.8);
    mesh.castShadow = true;
    mesh.userData.environmentShaderExclude = true;
    group.add(mesh);
  }
  parent.add(group);
  return group;
}

function makeVehicle(parent, {
  color = palette.coral,
  position = [0, 0, 0],
  rotation = 0,
  scale = 1,
  seed = 1,
} = {}) {
  const group = new THREE.Group();
  group.name = `Stylized city vehicle ${seed}`;
  group.position.set(...position);
  group.rotation.y = rotation;
  group.scale.setScalar(scale);
  const paint = material('painted_metal', color, { metalness: 0.34, roughness: 0.34 });
  const trim = material('painted_trim', seed % 2 ? palette.cream : palette.charcoal, { metalness: 0.28, roughness: 0.42 });
  const glass = material('window_glass', '#4c879f', { metalness: 0.2, roughness: 0.18 });
  const rubber = material('rubber', '#18242b', { roughness: 0.88 });
  const light = material('light_glass', '#ffe0a1', { emissive: '#ffb85c', emissiveIntensity: 0.55, roughness: 0.24 });
  box('Vehicle lower body', [1.9, 0.58, 3.75], [0, 0.66, 0], paint, group);
  box('Vehicle shoulder', [1.78, 0.46, 3.18], [0, 1.1, -0.04], paint, group);
  const cabin = box('Vehicle cabin', [1.53, 0.7, 1.92], [0, 1.58, -0.22], glass, group);
  cabin.rotation.x = -0.045;
  box('Vehicle roof', [1.58, 0.1, 1.82], [0, 1.97, -0.3], trim, group);
  box('Front bumper', [1.82, 0.16, 0.18], [0, 0.58, 1.93], trim, group);
  box('Rear bumper', [1.82, 0.16, 0.18], [0, 0.58, -1.93], trim, group);
  [-0.59, 0.59].forEach((x) => {
    const headlamp = box('Vehicle headlamp', [0.36, 0.22, 0.07], [x, 0.94, 1.92], light, group, { castShadow: false });
    headlamp.userData.environmentShaderExclude = true;
  });
  for (const x of [-0.96, 0.96]) {
    for (const z of [-1.18, 1.18]) {
      const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.2, 18), rubber);
      wheel.name = 'Vehicle wheel';
      wheel.position.set(x, 0.48, z);
      wheel.rotation.z = Math.PI / 2;
      wheel.castShadow = true;
      group.add(wheel);
      const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.205, 14), trim);
      hub.name = 'Vehicle wheel hub';
      hub.position.copy(wheel.position);
      hub.rotation.z = Math.PI / 2;
      group.add(hub);
    }
  }
  parent.add(group);
  attachFactoryStyleTarget(group, 'manufactured.surface', {
    assetId: `${LAUNCH_WORLD_ID}/vehicle-${seed}`,
    collision: 'bounds',
    targetId: `launch-world/vehicle-${seed}`,
  });
  return group;
}

function makeCafeSet(parent, x, z, color, rotation = 0) {
  const group = new THREE.Group();
  group.name = 'Sidewalk cafe set';
  group.position.set(x, 0, z);
  group.rotation.y = rotation;
  const metal = material('painted_metal', palette.charcoal, { metalness: 0.38, roughness: 0.48 });
  const fabric = material('fabric', color, { roughness: 0.92, side: THREE.DoubleSide });
  cylinder('Cafe table pedestal', 0.08, 0.13, 0.72, [0, 0.36, 0], metal, group, 12);
  cylinder('Cafe tabletop', 0.63, 0.63, 0.09, [0, 0.76, 0], fabric, group, 24);
  cylinder('Umbrella pole', 0.035, 0.035, 2.35, [0, 1.55, 0], metal, group, 10);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.2, 0.42, 18, 1, true), fabric);
  canopy.name = 'Cafe umbrella canopy';
  canopy.position.set(0, 2.55, 0);
  canopy.castShadow = true;
  group.add(canopy);
  [-1.0, 1.0].forEach((offset, index) => {
    box('Cafe chair seat', [0.48, 0.09, 0.46], [offset, 0.47, 0], fabric, group);
    box('Cafe chair back', [0.48, 0.7, 0.08], [offset, 0.77, index ? 0.19 : -0.19], fabric, group);
    [-0.18, 0.18].forEach((zOffset) => box('Cafe chair leg', [0.05, 0.47, 0.05], [offset, 0.235, zOffset], metal, group));
  });
  parent.add(group);
  return group;
}

function makeStreetBanner(parent, x, z, facing, color, cityAtlas, tile) {
  const group = new THREE.Group();
  group.name = 'Street banner';
  group.position.set(x, 0, z);
  const frame = material('painted_metal', palette.charcoal, { metalness: 0.38, roughness: 0.42 });
  cylinder('Banner mast', 0.045, 0.06, 4.1, [0, 2.05, 0], frame, group, 10);
  box('Banner bracket', [0.65, 0.05, 0.05], [facing * 0.3, 3.55, 0], frame, group);
  const panel = plane('Graphic street banner', [0.72, 1.42], [facing * 0.66, 3.0, 0], [0, facing > 0 ? Math.PI / 2 : -Math.PI / 2, 0], atlasTile(cityAtlas, tile, 'graphic_panel'), group);
  panel.material.color.set(color);
  parent.add(group);
  return group;
}

function makeTrafficSignal(parent, z) {
  const group = new THREE.Group();
  group.name = 'City traffic signal';
  const dark = material('painted_metal', palette.charcoal, { metalness: 0.44, roughness: 0.36 });
  [-7.2, 7.2].forEach((x) => cylinder('Traffic signal mast', 0.09, 0.13, 5.5, [x, 2.75, z], dark, group, 14));
  box('Traffic signal crossbar', [14.6, 0.12, 0.12], [0, 5.28, z], dark, group);
  [-3.6, 0, 3.6].forEach((x, index) => {
    box('Traffic light housing', [0.42, 0.86, 0.34], [x, 4.9, z + 0.02], dark, group);
    const signalColor = index === 1 ? '#65e69b' : '#ffd661';
    const signal = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), material('light_glass', signalColor, { emissive: signalColor, emissiveIntensity: 1.5, roughness: 0.2 }));
    signal.name = 'Traffic signal light';
    signal.position.set(x, 4.92, z + 0.2);
    group.add(signal);
  });
  parent.add(group);
  return group;
}

function makeSkyline(parent) {
  const colors = ['#b8d8e4', '#9ac6d7', '#d4e4e7', '#88b4c8', '#bed9df'];
  for (let index = 0; index < 18; index += 1) {
    const x = -48 + index * 5.8;
    const height = 16 + ((index * 17) % 19);
    const depth = 6 + (index % 4);
    const centerZ = -128 - (index % 3) * 6;
    const building = box('Distant skyline tower', [4.2, height, depth], [x, height / 2 - 0.8, centerZ], material('distant_architecture', colors[index % colors.length], { roughness: 0.76 }), parent, { castShadow: false });
    building.userData.environmentShaderExclude = true;
    for (let floor = 2.2; floor < height - 1; floor += 2.1) {
      const line = box('Skyline window ribbon', [3.7, 0.16, 0.06], [x, floor, centerZ + depth / 2 + 0.04], material('window_glass', '#5e91a8', { roughness: 0.3 }), parent, { castShadow: false });
      line.userData.environmentShaderExclude = true;
    }
  }
}

function makeCloud(parent, x, y, z, scale, opacity = 0.9) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  group.scale.setScalar(scale);
  const cloud = material('cloud', '#ffffff', { transparent: true, opacity, roughness: 1, depthWrite: false });
  [[0, 0, 0, 2.2], [1.8, 0.1, 0, 1.5], [-1.8, -0.1, 0, 1.45], [0.6, 0.9, 0, 1.55], [-0.8, 0.75, 0, 1.35]].forEach(([cx, cy, cz, radius]) => {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 9), cloud);
    puff.position.set(cx, cy, cz);
    puff.scale.z = 0.45;
    puff.castShadow = false;
    puff.userData.environmentShaderExclude = true;
    group.add(puff);
  });
  parent.add(group);
}

function makeRoadMarkings(parent) {
  const white = material('road_marking', '#f8f3df', { roughness: 0.78 });
  const gold = material('road_marking', '#f6c351', { roughness: 0.78 });
  for (let z = 25; z > -55; z -= 6) {
    box('Lane dash', [0.15, 0.025, 3.1], [0, 0.028, z], white, parent, { castShadow: false });
  }
  box('Center gold line', [0.07, 0.028, 86], [-0.36, 0.03, -15], gold, parent, { castShadow: false });
  box('Center gold line', [0.07, 0.028, 86], [0.36, 0.03, -15], gold, parent, { castShadow: false });
  for (let index = 0; index < 11; index += 1) {
    box('Crosswalk stripe', [0.52, 0.03, 5.7], [-5.25 + index * 1.05, 0.035, 6.8], white, parent, { castShadow: false });
  }
}

function makeCoast(parent, coastAtlas, coastTiles) {
  const group = new THREE.Group();
  group.name = 'Connected coastal park';
  const lawn = repeatTextureMaterial(coastTiles.lawn, 'ground_lawn', { repeat: [2.3, 3.5], roughness: 0.98 });
  plane('Coastal lawn', [31, 34], [-24, 0.018, -32], [-Math.PI / 2, 0, 0], lawn, group);
  const path = repeatTextureMaterial(coastTiles.limestone, 'ground_limestone', { repeat: [1.3, 8], roughness: 0.88 });
  plane('Park promenade', [7.5, 43], [-7.7, 0.032, -35], [-Math.PI / 2, 0, 0], path, group);
  const boardwalk = repeatTextureMaterial(coastTiles.boardwalk, 'ground_boardwalk', { repeat: [1.8, 8], roughness: 0.82 });
  plane('Waterfront boardwalk', [35, 8], [-12, 0.045, -58], [-Math.PI / 2, 0, 0], boardwalk, group);
  const sand = repeatTextureMaterial(coastTiles.sand, 'ground_sand', { repeat: [5, 1.6], roughness: 0.95 });
  plane('Pocket beach', [38, 12], [10, -0.06, -67], [-Math.PI / 2, 0, 0], sand, group);
  const retaining = atlasTile(coastAtlas, 5, 'retaining_tile', { roughness: 0.9 });
  plane('Coastal retaining wall', [34, 2.3], [-12, -0.75, -62.1], [0, 0, 0], retaining, group);
  const waterMaterial = material('water_surface', '#4cbfd3', { transparent: true, opacity: 0.82, metalness: 0.06, roughness: 0.18 });
  const water = plane('Coastal water', [120, 75], [7, -0.16, -96], [-Math.PI / 2, 0, 0], waterMaterial, group);
  water.receiveShadow = false;
  water.userData.environmentShaderExclude = true;
  const caustics = repeatTextureMaterial(coastTiles.caustics, 'water_caustics', {
    opacity: 0.32, repeat: [7, 4], roughness: 0.25, transparent: true,
  });
  const waterDetail = plane('Shallow water caustics', [55, 18], [10, -0.135, -74], [-Math.PI / 2, 0, 0], caustics, group);
  waterDetail.userData.environmentShaderExclude = true;
  [-35, -26, -17].forEach((x, index) => makeTree(group, x, -30 - index * 7, 1.05 + index * 0.08, 40 + index));
  [-16, -7, 3, 14].forEach((x, index) => makePalm(group, x, -57 + (index % 2) * 1.3, 1 + index * 0.05, 60 + index));
  makePalm(group, 1.8, -71.5, 0.96, 81);
  makePalm(group, 15.2, -73.0, 1.04, 82);
  makeBench(group, -13.5, -42, Math.PI * 0.05);
  makeBench(group, -29, -22, -Math.PI * 0.42);
  makeCafeSet(group, 6.5, -66.2, palette.coral, 0.12);
  makeCafeSet(group, 13.5, -68.5, palette.turquoise, -0.18);
  for (let index = 0; index < 7; index += 1) makePlanter(group, -18 - index * 3.1, -16 - (index % 2) * 2.5, index % 2 ? palette.coral : palette.turquoise, 70 + index);
  parent.add(group);
  attachFactoryStyleTarget(group, 'terrain.ground', { assetId: `${LAUNCH_WORLD_ID}/coastal-park`, targetId: 'launch-world/coastal-park' });
  return { group, water, waterDetail };
}

function makeFoodAlley(parent, cityAtlas, coastTiles, evening) {
  const group = new THREE.Group();
  group.name = 'Evening food alley';
  group.position.set(14, 0, 8);
  group.rotation.y = -Math.PI / 2;
  const pavement = repeatTextureMaterial(coastTiles.limestone.clone(), 'sidewalk_concrete', { repeat: [2.2, 6.5], roughness: 0.94 });
  plane('Alley floor', [9, 26], [0, 0.025, -8], [-Math.PI / 2, 0, 0], pavement, group);
  [
    [-4.3, -5, 2], [4.3, -5, 0], [-4.3, -12, 3], [4.3, -12, 6],
  ].forEach(([x, z, tile], index) => {
    const wall = box('Alley shop mass', [3.2, 7.4, 6.4], [x, 3.7, z], material('painted_concrete', index % 2 ? '#546779' : '#3b4d60', { roughness: 0.86 }), group);
    wall.userData.launchWorldSolid = true;
    const facing = x < 0 ? Math.PI / 2 : -Math.PI / 2;
    plane('Food alley frontage', [3.05, 4.7], [x + (x < 0 ? 1.61 : -1.61), 2.45, z], [0, facing, 0], atlasTile(cityAtlas, tile, 'graphic_panel'), group);
  });
  const endWall = box('Alley end wall', [8.8, 6.8, 0.45], [0, 3.4, -18.2], material('painted_concrete', '#263c57', { roughness: 0.84 }), group);
  endWall.userData.launchWorldSolid = true;
  plane('Alley end mural', [6.9, 4.8], [0, 2.7, -17.96], [0, 0, 0], atlasTile(cityAtlas, 12, 'graphic_panel', { emissive: evening ? '#4855b8' : null }), group);
  const counterWood = material('wood_surface', '#8a4f35', { roughness: 0.74 });
  const stoolMetal = material('painted_metal', '#172839', { metalness: 0.32, roughness: 0.5 });
  [-3.15, 3.15].forEach((x, sideIndex) => {
    box('Food counter', [0.62, 1.08, 4.6], [x, 0.54, -8.6], counterWood, group);
    for (let index = 0; index < 4; index += 1) {
      cylinder('Counter stool', 0.25, 0.25, 0.08, [x + (sideIndex ? -0.56 : 0.56), 0.64, -7.15 - index * 1.05], counterWood, group, 16);
      cylinder('Counter stool leg', 0.04, 0.06, 0.62, [x + (sideIndex ? -0.56 : 0.56), 0.31, -7.15 - index * 1.05], stoolMetal, group, 10);
    }
  });
  for (let index = 0; index < 8; index += 1) {
    const lantern = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), material('light_glass', index % 2 ? '#ffab75' : '#ffe3a1', { emissive: index % 2 ? '#ff6f45' : '#ffc15c', emissiveIntensity: evening ? 2.4 : 0.4 }));
    lantern.name = 'Alley lantern';
    lantern.scale.y = 1.35;
    lantern.position.set(index % 2 ? -2.55 : 2.55, 3.05 + (index % 3) * 0.12, -2.0 - index * 2.02);
    lantern.castShadow = false;
    group.add(lantern);
    if (evening && index < 4) {
      const light = new THREE.PointLight(index % 2 ? '#ff8d65' : '#ffd08a', 10, 7, 2);
      light.position.copy(lantern.position);
      group.add(light);
    }
  }
  const cable = material('technical_surface', '#172839', { metalness: 0.25, roughness: 0.65 });
  for (let index = 0; index < 4; index += 1) {
    box('Lantern cable', [5.4, 0.025, 0.025], [0, 3.22 + (index % 2) * 0.12, -3.0 - index * 4.0], cable, group, { castShadow: false });
  }
  parent.add(group);
  attachFactoryStyleTarget(group, 'manufacturedEnvironment', {
    assetId: `${LAUNCH_WORLD_ID}/food-alley`, collision: 'bounds', targetId: 'launch-world/food-alley',
  });
  return group;
}

export function launchGroundHeight(x, z) {
  if (z < -62) return -0.06;
  if (x < -9 && z < -12) return 0.018;
  return 0;
}

export function resolveLaunchShot(id = 'city') {
  const shots = {
    city: {
      label: 'SUNLIT CITY AVENUE',
      position: [3.45, 2.72, 13.7],
      target: [-0.35, 1.42, -7.5],
      character: [0.25, 0, 4.9],
      yaw: -0.12,
    },
    coast: {
      label: 'CITY-TO-COAST PARK',
      position: [8.5, 2.8, -52.0],
      target: [8.5, 0.62, -92],
      character: [8.5, -0.02, -64.2],
      yaw: 0.18,
    },
    alley: {
      label: 'EVENING FOOD ALLEY',
      position: [12.5, 3.2, 8.0],
      target: [26.5, 1.5, 8.0],
      character: [19.2, 0, 8.0],
      yaw: Math.PI / 2,
    },
    face: {
      label: 'CHARACTER MATERIAL DETAIL',
      position: [0.2, 1.57, 7.05],
      target: [0.2, 1.43, 4.9],
      character: [0.2, 0, 4.9],
      yaw: -0.12,
    },
  };
  return shots[id] ?? shots.city;
}

export async function createLaunchWorld({ evening = false, onProgress = null } = {}) {
  const loader = new THREE.TextureLoader();
  onProgress?.('Loading original anime texture atlases…');
  const [cityAtlas, coastAtlas, boardwalk, sand, caustics, limestone, lawn] = await Promise.all([
    loader.loadAsync(CITY_ATLAS_URL),
    loader.loadAsync(COAST_ATLAS_URL),
    loader.loadAsync('/assets-local/launch-world/textures/tiles/anime-coastal/pale-boardwalk.png'),
    loader.loadAsync('/assets-local/launch-world/textures/tiles/anime-coastal/warm-dry-sand.png'),
    loader.loadAsync('/assets-local/launch-world/textures/tiles/anime-coastal/turquoise-caustics.png'),
    loader.loadAsync('/assets-local/launch-world/textures/tiles/anime-coastal/pale-limestone.png'),
    loader.loadAsync('/assets-local/launch-world/textures/tiles/anime-coastal/clipped-lawn.png'),
  ]);
  cityAtlas.colorSpace = THREE.SRGBColorSpace;
  coastAtlas.colorSpace = THREE.SRGBColorSpace;

  const root = new THREE.Group();
  root.name = 'ToonLab Pro Launch World';
  root.userData.launchWorld = {
    bounds: LAUNCH_WORLD_BOUNDS,
    generatedAssets: [CITY_ATLAS_URL, COAST_ATLAS_URL],
    groundHeight: 'launchGroundHeight(x,z)',
    id: LAUNCH_WORLD_ID,
    readyForWalkableIntegration: true,
  };

  const manufactured = new THREE.Group();
  manufactured.name = 'Manufactured city surfaces';
  root.add(manufactured);
  const asphalt = material('road_asphalt', palette.asphalt, { roughness: 0.92 });
  plane('Main avenue', [15.5, 91], [0, 0, -14.5], [-Math.PI / 2, 0, 0], asphalt, manufactured);
  const sidewalk = material('sidewalk_concrete', '#c9c3b5', { roughness: 0.93 });
  plane('Left sidewalk', [5.5, 91], [-10.5, 0.018, -14.5], [-Math.PI / 2, 0, 0], sidewalk, manufactured);
  plane('Right sidewalk', [5.5, 91], [10.5, 0.018, -14.5], [-Math.PI / 2, 0, 0], sidewalk, manufactured);
  const curb = material('painted_concrete', palette.cream, { roughness: 0.86 });
  box('Left curb', [0.25, 0.22, 91], [-7.75, 0.11, -14.5], curb, manufactured);
  box('Right curb', [0.25, 0.22, 91], [7.75, 0.11, -14.5], curb, manufactured);
  makeRoadMarkings(manufactured);

  const buildingSpecs = [
    { side: 'left', x: -16.4, z: 18, w: 10, h: 13, d: 10, tile: 0, accent: '#e7dfce' },
    { side: 'left', x: -16.8, z: 6.2, w: 9, h: 18, d: 10, tile: 2, accent: '#d9c6a9' },
    { side: 'left', x: -17.1, z: -7, w: 10.5, h: 22, d: 11, tile: 1, accent: '#b8ccd0' },
    { side: 'right', x: 16.2, z: 17, w: 9.8, h: 18, d: 10, tile: 6, accent: '#d0c6b8' },
    { side: 'right', x: 16.8, z: 3.3, w: 10.4, h: 14, d: 11, tile: 10, accent: '#d7d0bf' },
    { side: 'right', x: 17.2, z: -10.5, w: 11, h: 25, d: 11, tile: 14, accent: '#c4c8ca' },
    { side: 'right', x: 17.4, z: -25, w: 10.6, h: 16, d: 10.5, tile: 7, accent: '#cbd8cf' },
  ];
  buildingSpecs.forEach((spec, index) => {
    const building = makeBuilding({
      accent: spec.accent,
      atlas: cityAtlas,
      depth: spec.d,
      facadeIndex: spec.tile,
      height: spec.h,
      position: [spec.x, 0, spec.z],
      seed: index + 1,
      side: spec.side,
      width: spec.w,
    });
    manufactured.add(building);
  });

  for (let z = 22; z >= -43; z -= 10.8) {
    makeStreetLamp(manufactured, -7.05, z, 1, evening);
    makeStreetLamp(manufactured, 7.05, z - 4.8, -1, evening);
  }
  [-1.9, -14.5, -29.5].forEach((z, index) => {
    makeStreetBanner(manufactured, -7.25, z, 1, index % 2 ? '#ffffff' : '#d8ffff', cityAtlas, 12 + index);
    makeStreetBanner(manufactured, 7.25, z - 5.1, -1, '#ffffff', cityAtlas, 10 + index);
  });
  makeTrafficSignal(manufactured, -17.8);
  makeVehicle(manufactured, { color: palette.coral, position: [-2.75, 0, -4.5], rotation: Math.PI, scale: 0.92, seed: 1 });
  makeVehicle(manufactured, { color: palette.turquoise, position: [2.85, 0, -23.5], rotation: 0, scale: 0.86, seed: 2 });
  makeVehicle(manufactured, { color: palette.gold, position: [5.85, 0.02, 22.8], rotation: 0, scale: 0.8, seed: 3 });
  makeCafeSet(manufactured, -10.35, -11.2, palette.coral, Math.PI / 2);
  makeCafeSet(manufactured, -10.25, -15.0, palette.turquoise, Math.PI / 2);
  makeBench(manufactured, -9.6, 11.7, Math.PI);
  makeBench(manufactured, 9.5, -16, 0);
  [
    [-9.6, 18.5, palette.turquoise], [9.6, 12.2, palette.coral], [-9.7, -2.3, palette.gold],
    [9.7, -7.2, palette.turquoise], [-9.5, -24, palette.coral],
  ].forEach(([x, z, color], index) => makePlanter(manufactured, x, z, color, index));

  onProgress?.('Composing the coastal park and waterfront…');
  const coast = makeCoast(root, coastAtlas, { boardwalk, caustics, lawn, limestone, sand });
  const alley = makeFoodAlley(root, cityAtlas, { limestone }, evening);
  makeSkyline(root);

  makeCloud(root, -29, 27, -94, 2.1, 0.86);
  makeCloud(root, 12, 34, -112, 2.9, 0.78);
  makeCloud(root, 40, 25, -88, 1.65, 0.72);

  attachFactoryStyleTarget(manufactured, 'manufacturedEnvironment', {
    assetId: `${LAUNCH_WORLD_ID}/city`, collision: 'bounds', targetId: 'launch-world/city',
  });

  onProgress?.('Applying ToonLab environment treatment…');
  const environmentReport = await applyEnvironmentShader(manufactured, {
    assetId: `${LAUNCH_WORLD_ID}/city`,
    bakeVertexAo: false,
    hasSun: true,
    objectClass: 'architecturalEnvironment',
    preset: 'call_me_sensei',
    scenario: evening ? 'exteriorNight' : 'exteriorDay',
    shaderMode: 'standard',
  });

  return {
    alley,
    atlas: { city: cityAtlas, coast: coastAtlas },
    bounds: LAUNCH_WORLD_BOUNDS,
    coast,
    environmentReport,
    groundHeight: launchGroundHeight,
    root,
  };
}
