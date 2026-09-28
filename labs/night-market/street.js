// Night Market — street.js
//
// OWNER: street. Ground, kerbs, drainage, building shells both sides, the
// projecting eaves over the right walkway, background massing and the one pale
// lit tower. Stall dressing (frontage.js), lanterns (lanterns.js), seating
// (dressing.js) and lights (lighting.js) belong to other owners.
//
// SCOPE: plain Three.js. Nothing from src/ (ToonLab) is imported — see scene.js.
//
// The reference frame's ground is DAMP, not wet: it carries broad, heavily
// blurred, warm reflections that get stronger toward the vanishing point and
// almost vanish underfoot. That grazing-angle behaviour is Fresnel, so the
// reflection here is a real planar mirror pass weighted by a Fresnel term and a
// procedural damp mask, blurred through render-target mips and smeared along
// the view direction. A dry matte ground kills the frame; a sharp mirror reads
// as ice. This sits between the two.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/* ------------------------------------------------------------------ noise -- */

function valueNoise(rand) {
  const P = new Float32Array(256 * 256);
  for (let i = 0; i < P.length; i += 1) P[i] = rand();
  const at = (x, y) => P[((y & 255) << 8) | (x & 255)];
  const smooth = (t) => t * t * (3 - 2 * t);
  return (x, y) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const u = smooth(x - xi);
    const v = smooth(y - yi);
    const a = at(xi, yi);
    const b = at(xi + 1, yi);
    const c = at(xi, yi + 1);
    const d = at(xi + 1, yi + 1);
    const top = a + (b - a) * u;
    const bot = c + (d - c) * u;
    return top + (bot - top) * v;
  };
}

function fbm(noise, x, y, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i += 1) {
    sum += amp * noise(x * freq, y * freq);
    norm += amp;
    freq *= 2;
    amp *= 0.5;
  }
  return sum / norm;
}

/* --------------------------------------------------------------- canvases -- */

function makeCanvas(size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  return canvas;
}

/** Sobel a greyscale height canvas into a tangent-space normal canvas. */
function heightToNormal(heightCanvas, strength) {
  const size = heightCanvas.width;
  const src = heightCanvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size, size).data;
  const out = new ImageData(size, size);
  const h = (x, y) => src[((((y % size) + size) % size) * size + (((x % size) + size) % size)) * 4] / 255;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const len = Math.hypot(-dx, -dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  const canvas = makeCanvas(size);
  canvas.getContext('2d').putImageData(out, 0, 0);
  return canvas;
}

function texture(canvas, { srgb = false, anisotropy = 1 } = {}) {
  const map = new THREE.CanvasTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = anisotropy;
  if (srgb) map.colorSpace = THREE.SRGBColorSpace;
  return map;
}

/**
 * Running-bond (or stack-bond) paving tile. Returns seamless albedo, normal and
 * roughness canvases. `metres` is the world size the tile covers, so the caller
 * can compute repeats directly from street dimensions and the coursing scale
 * stays honest at 2–4 m from camera.
 */
function pavingTile({
  metres, unitW, unitH, joint, offsetBond, rgb, spread, jointRgb, roughUnit, roughJoint, seed, rand,
  albedoSize = 2048, detailSize = 512,
}) {
  const cols = Math.round(metres / unitW);
  const rows = Math.round(metres / unitH);
  const noise = valueNoise(rand);

  const albedo = makeCanvas(albedoSize);
  const height = makeCanvas(detailSize);
  const rough = makeCanvas(detailSize);
  const ca = albedo.getContext('2d');
  const ch = height.getContext('2d');
  const cr = rough.getContext('2d');

  ca.fillStyle = `rgb(${jointRgb.join(',')})`;
  ca.fillRect(0, 0, albedoSize, albedoSize);
  ch.fillStyle = '#000';
  ch.fillRect(0, 0, detailSize, detailSize);
  cr.fillStyle = `rgb(${Math.round(roughJoint * 255)},0,0)`;
  cr.fillRect(0, 0, detailSize, detailSize);

  for (let r = 0; r < rows; r += 1) {
    const bond = offsetBond && r % 2 === 1 ? 0.5 : 0;
    for (let c = -1; c <= cols; c += 1) {
      const u0 = (c + bond) / cols;
      const v0 = r / rows;
      const n = fbm(noise, (c + bond) * 3.1 + seed, r * 2.7, 3);
      const tint = (n - 0.5) * 2 * spread;
      const warm = (rand() - 0.5) * spread * 0.5;
      const col = [
        Math.max(0, Math.min(255, Math.round(rgb[0] + tint + warm))),
        Math.max(0, Math.min(255, Math.round(rgb[1] + tint * 0.75))),
        Math.max(0, Math.min(255, Math.round(rgb[2] + tint * 0.6 - warm * 0.5))),
      ];
      const lift = 178 + Math.round(n * 52);
      const rgh = Math.round(Math.max(0, Math.min(1, roughUnit + (n - 0.5) * 0.16)) * 255);

      for (const wrap of [-1, 0, 1]) {
        // albedo
        const ax = (u0 + wrap) * albedoSize + (joint / metres) * albedoSize * 0.5;
        const ay = v0 * albedoSize + (joint / metres) * albedoSize * 0.5;
        const aw = (unitW / metres) * albedoSize - (joint / metres) * albedoSize;
        const ah = (unitH / metres) * albedoSize - (joint / metres) * albedoSize;
        ca.fillStyle = `rgb(${col.join(',')})`;
        ca.fillRect(ax, ay, aw, ah);

        // detail maps
        const dx = (u0 + wrap) * detailSize + (joint / metres) * detailSize * 0.5;
        const dy = v0 * detailSize + (joint / metres) * detailSize * 0.5;
        const dw = (unitW / metres) * detailSize - (joint / metres) * detailSize;
        const dh = (unitH / metres) * detailSize - (joint / metres) * detailSize;
        ch.fillStyle = `rgb(${lift},${lift},${lift})`;
        ch.fillRect(dx, dy, dw, dh);
        ch.strokeStyle = `rgb(${Math.round(lift * 0.55)},${Math.round(lift * 0.55)},${Math.round(lift * 0.55)})`;
        ch.lineWidth = Math.max(1, detailSize / 320);
        ch.strokeRect(dx, dy, dw, dh);
        cr.fillStyle = `rgb(${rgh},0,0)`;
        cr.fillRect(dx, dy, dw, dh);
      }
    }
  }

  // Wear/grime across the whole tile — breaks the per-unit flatness. Authored
  // small and scaled up: this is large-scale variation, the unit-scale detail
  // is already in the coursing.
  const grimeSize = 128;
  const grime = makeCanvas(grimeSize);
  const cg = grime.getContext('2d');
  const gimg = new ImageData(grimeSize, grimeSize);
  for (let y = 0; y < grimeSize; y += 1) {
    for (let x = 0; x < grimeSize; x += 1) {
      const g = fbm(noise, (x / grimeSize) * 5 + 11, (y / grimeSize) * 5 + 7, 4);
      const v = Math.round(96 + g * 118);
      const i = (y * grimeSize + x) * 4;
      gimg.data[i] = v;
      gimg.data[i + 1] = v;
      gimg.data[i + 2] = v;
      gimg.data[i + 3] = 255;
    }
  }
  cg.putImageData(gimg, 0, 0);
  ca.save();
  ca.globalAlpha = 0.4;
  ca.globalCompositeOperation = 'overlay';
  ca.drawImage(grime, 0, 0, albedoSize, albedoSize);
  ca.restore();
  cr.save();
  cr.globalAlpha = 0.5;
  cr.globalCompositeOperation = 'overlay';
  cr.drawImage(grime, 0, 0, detailSize, detailSize);
  cr.restore();

  return { albedo, normal: heightToNormal(height, 2.6), rough };
}

/** Blobby damp/puddle mask in world space, plus a matching ripple normal. */
function dampMaps(rand) {
  const noise = valueNoise(rand);
  const size = 512;
  const wet = makeCanvas(size);
  const img = new ImageData(size, size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const u = x / size;
      const v = y / size;
      const broad = fbm(noise, u * 4 + 3, v * 4 + 9, 4);
      const patch = fbm(noise, u * 11 + 41, v * 11 + 17, 3);
      // Baseline dampness everywhere, with wetter pools where both agree.
      let w = 0.44 + 0.34 * broad + 0.34 * Math.max(0, patch - 0.46);
      w = Math.max(0, Math.min(1, w));
      const i = (y * size + x) * 4;
      img.data[i] = w * 255;
      img.data[i + 1] = w * 255;
      img.data[i + 2] = w * 255;
      img.data[i + 3] = 255;
    }
  }
  wet.getContext('2d').putImageData(img, 0, 0);

  const rsize = 256;
  const rh = makeCanvas(rsize);
  const rimg = new ImageData(rsize, rsize);
  for (let y = 0; y < rsize; y += 1) {
    for (let x = 0; x < rsize; x += 1) {
      const h = fbm(noise, (x / rsize) * 9 + 61, (y / rsize) * 9 + 23, 4) * 255;
      const i = (y * rsize + x) * 4;
      rimg.data[i] = h;
      rimg.data[i + 1] = h;
      rimg.data[i + 2] = h;
      rimg.data[i + 3] = 255;
    }
  }
  rh.getContext('2d').putImageData(rimg, 0, 0);
  return { wet, ripple: heightToNormal(rh, 1.4) };
}

/* --------------------------------------------------------------- geometry -- */

/** Extrude a 2D cross-section (world XY) along Z. Kerbs, channels, thresholds. */
function loft(points, length) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i += 1) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false, steps: 1 });
  geo.translate(0, 0, -length / 2);
  geo.computeVertexNormals();
  return geo;
}

const BOX = new THREE.BoxGeometry(1, 1, 1);

function box(material, sx, sy, sz, px, py, pz, ry = 0, rz = 0) {
  const mesh = new THREE.Mesh(BOX, material);
  mesh.scale.set(sx, sy, sz);
  mesh.position.set(px, py, pz);
  mesh.rotation.set(0, ry, rz);
  return mesh;
}

/**
 * Box batcher. The shell run is ~700 small boxes — masses, string courses,
 * eaves, brackets, parapets — and left as individual meshes they cost more in
 * draw calls than everything else in the scene put together. They are baked
 * into merged geometry keyed by material AND by a z-chunk, so the street still
 * frustum-culls in chunks instead of collapsing into one unclullable object.
 */
function createBatcher(chunkMetres = 16) {
  const groups = new Map();
  const pos = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const matrix = new THREE.Matrix4();
  const materials = [];

  return {
    add(material, sx, sy, sz, px, py, pz, ry = 0, rz = 0) {
      let mi = materials.indexOf(material);
      if (mi < 0) mi = materials.push(material) - 1;
      const key = `${mi}:${Math.floor(pz / chunkMetres)}`;
      let entry = groups.get(key);
      if (!entry) groups.set(key, (entry = { material, list: [] }));
      euler.set(0, ry, rz);
      quat.setFromEuler(euler);
      pos.set(px, py, pz);
      scale.set(sx, sy, sz);
      matrix.compose(pos, quat, scale);
      const geo = new THREE.BoxGeometry(1, 1, 1);
      geo.applyMatrix4(matrix);
      entry.list.push(geo);
    },
    flush(parent, { castShadow = false, receiveShadow = true } = {}) {
      for (const { material, list } of groups.values()) {
        const merged = mergeGeometries(list, false);
        for (const geo of list) geo.dispose();
        if (!merged) continue;
        const mesh = new THREE.Mesh(merged, material);
        mesh.castShadow = castShadow;
        mesh.receiveShadow = receiveShadow;
        parent.add(mesh);
      }
      groups.clear();
    },
  };
}

/* ------------------------------------------------------------------ build -- */

export function build(ctx) {
  const { scene, camera, renderer, MARKET, rng, emissives, onProgress = () => {} } = ctx;

  const root = new THREE.Group();
  root.name = 'street';
  scene.add(root);

  const ground = new THREE.Group();
  ground.name = 'street.ground';
  root.add(ground);

  const shells = new THREE.Group();
  shells.name = 'street.shells';
  root.add(shells);

  const anisotropy = renderer?.capabilities?.getMaxAnisotropy?.() ?? 8;

  // Longitudinal extent. The street runs along -Z; a little is kept behind the
  // camera so the hero shot never sees an edge.
  const Z_NEAR = 22;
  const Z_FAR = -MARKET.streetLength - 8;   // -68
  const Z_LEN = Z_NEAR - Z_FAR;             // 90
  const Z_MID = (Z_NEAR + Z_FAR) / 2;

  // Lateral zones. The drainage channel sits on the grey-band boundary at
  // MARKET.greyBandTo so the two paving formats read as footway + carriageway.
  const CH_MIN = MARKET.greyBandTo - 0.05;  // -1.25
  const CH_MAX = MARKET.greyBandTo + 0.30;  // -0.90
  const GREY_MIN = MARKET.greyBandFrom;     // -3.8
  const BRICK_MAX = MARKET.frontageRight;   // 3.8

  onProgress('street · paving');

  /* ---------------------------------------------------------- paving maps */

  const BRICK = { unitW: 0.21, unitH: 0.105, tile: 1.68 };
  const SLAB = { unit: 0.504, tile: 1.512 };

  const brickTile = pavingTile({
    metres: BRICK.tile,
    unitW: BRICK.unitW,
    unitH: BRICK.unitH,
    joint: 0.013,
    offsetBond: true,
    rgb: [122, 84, 75],
    spread: 20,
    jointRgb: [74, 54, 48],
    roughUnit: 0.42,
    roughJoint: 0.30,
    seed: 3.7,
    rand: rng(0x5719a3),
  });

  const slabTile = pavingTile({
    metres: SLAB.tile,
    unitW: SLAB.unit,
    unitH: SLAB.unit,
    joint: 0.016,
    offsetBond: false,
    rgb: [122, 118, 111],
    spread: 16,
    jointRgb: [80, 77, 73],
    roughUnit: 0.50,
    roughJoint: 0.34,
    seed: 8.2,
    rand: rng(0x2c88f1),
    albedoSize: 1024,
  });

  const { wet: wetCanvas, ripple: rippleCanvas } = dampMaps(rng(0x91d2c4));

  function pavingMaterial(tile, tileMetres, widthM) {
    const map = texture(tile.albedo, { srgb: true, anisotropy });
    const nrm = texture(tile.normal, { anisotropy });
    const rgh = texture(tile.rough, { anisotropy });
    for (const t of [map, nrm, rgh]) t.repeat.set(widthM / tileMetres, Z_LEN / tileMetres);
    return new THREE.MeshStandardMaterial({
      map,
      normalMap: nrm,
      // The reference's coursing is low-contrast worn brick, not a tiled
      // floor: relief soft enough to catch the wet sheen, not to draw lines.
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughnessMap: rgh,
      // Damp: the base surface is already well below "matte". The planar
      // reflection overlay adds the rest on top.
      roughness: 1.0,
      metalness: 0.0,
      color: 0xffffff,
    });
  }

  const brickWidth = BRICK_MAX - CH_MAX;   // 4.70
  const greyWidth = CH_MIN - GREY_MIN;     // 2.55

  const brickMat = pavingMaterial(brickTile, BRICK.tile, brickWidth);
  const greyMat = pavingMaterial(slabTile, SLAB.tile, greyWidth);

  const strip = (mat, width, centreX) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, Z_LEN, 1, 1), mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(centreX, 0, Z_MID);
    mesh.receiveShadow = true;
    return mesh;
  };

  ground.add(strip(brickMat, brickWidth, (CH_MAX + BRICK_MAX) / 2));
  ground.add(strip(greyMat, greyWidth, (GREY_MIN + CH_MIN) / 2));

  // Dark apron under everything so no gap ever shows sky.
  const apron = new THREE.Mesh(
    new THREE.PlaneGeometry(240, 320),
    new THREE.MeshStandardMaterial({ color: 0x1b1512, roughness: 0.85 }),
  );
  apron.rotation.x = -Math.PI / 2;
  apron.position.set(0, -0.22, -60);
  apron.receiveShadow = true;
  ground.add(apron);

  /* ------------------------------------------- real laid units, near field */

  // A tiling material alone flattens out underfoot. The hero foreground gets
  // genuine instanced pavers with per-unit colour and a few millimetres of
  // settlement, so the coursing has real silhouette and real joint shadow at
  // 2–4 m. Beyond ~14 m the textured plane takes over invisibly.
  const FIELD_NEAR = 14;
  const FIELD_FAR = -14;

  function paverField({ x0, x1, unitW, unitH, joint, bond, rgb, spread, seed, roughness }) {
    const rand = rng(seed);
    const cols = Math.floor((x1 - x0) / unitW);
    const rows = Math.floor((FIELD_NEAR - FIELD_FAR) / unitH);
    const count = cols * rows;
    const geo = new THREE.BoxGeometry(unitW - joint, 0.06, unitH - joint);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness, metalness: 0.0 });
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    const m = new THREE.Matrix4();
    const colour = new THREE.Color();
    let i = 0;
    for (let r = 0; r < rows; r += 1) {
      const off = bond && r % 2 === 1 ? unitW * 0.5 : 0;
      for (let c = 0; c < cols; c += 1) {
        const px = x0 + unitW * 0.5 + c * unitW + off;
        const pz = FIELD_NEAR - unitH * 0.5 - r * unitH;
        const settle = (rand() - 0.5) * 0.005;
        m.makeTranslation(px, 0.004 + settle - 0.03, pz);
        mesh.setMatrixAt(i, m);
        const j = (rand() - 0.5) * 2 * spread;
        const dark = rand() < 0.07 ? -0.13 : 0;
        colour.setRGB(
          Math.max(0, (rgb[0] + j) / 255 + dark),
          Math.max(0, (rgb[1] + j * 0.75) / 255 + dark),
          Math.max(0, (rgb[2] + j * 0.6) / 255 + dark),
          THREE.SRGBColorSpace,
        );
        mesh.setColorAt(i, colour);
        i += 1;
      }
    }
    mesh.count = i;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    return mesh;
  }

  ground.add(paverField({
    x0: CH_MAX + 0.02, x1: BRICK_MAX - 0.02,
    unitW: BRICK.unitW, unitH: BRICK.unitH, joint: 0.013, bond: true,
    rgb: [122, 84, 75], spread: 8, seed: 0x1f4a77, roughness: 0.40,
  }));
  ground.add(paverField({
    x0: GREY_MIN + 0.02, x1: CH_MIN - 0.02,
    unitW: SLAB.unit, unitH: SLAB.unit, joint: 0.016, bond: false,
    rgb: [122, 118, 111], spread: 8, seed: 0x66b1e0, roughness: 0.48,
  }));

  /* --------------------------------------------- kerbs, channel, manholes */

  onProgress('street · kerbs & drainage');

  const graniteMat = new THREE.MeshStandardMaterial({ color: 0x6d6862, roughness: 0.52, metalness: 0.0 });
  const channelMat = new THREE.MeshStandardMaterial({ color: 0x241f1c, roughness: 0.13, metalness: 0.0 });
  const ironMat = new THREE.MeshStandardMaterial({ color: 0x2a2724, roughness: 0.35, metalness: 0.55 });

  // Right-hand threshold kerb: the step the stall run sits behind. Low enough
  // that frontage.js crates at the kerb sit on top of it, not through it.
  const rightKerb = new THREE.Mesh(
    loft([[-0.14, 0], [0.14, 0], [0.14, 0.10], [0.10, 0.125], [-0.14, 0.125]], Z_LEN),
    graniteMat,
  );
  rightKerb.position.set(BRICK_MAX - 0.16, 0, Z_MID);
  rightKerb.receiveShadow = true;
  rightKerb.castShadow = true;
  ground.add(rightKerb);

  // Left-hand flush edging + recessed U-channel on the grey-band boundary.
  const channel = new THREE.Mesh(
    // Simple non-self-intersecting U: a block with a rectangular groove. The
    // groove floor is the wettest surface in the scene and runs the full length
    // of the street, so it doubles as the strongest perspective line on the
    // ground plane.
    loft([
      [-0.175, -0.20], [0.175, -0.20], [0.175, 0.035], [0.085, 0.035],
      [0.075, -0.055], [-0.075, -0.055], [-0.085, 0.035], [-0.175, 0.035],
    ], Z_LEN),
    channelMat,
  );
  channel.position.set((CH_MIN + CH_MAX) / 2, 0, Z_MID);
  channel.receiveShadow = true;
  ground.add(channel);

  for (const edgeX of [CH_MIN - 0.045, CH_MAX + 0.045]) {
    const edge = new THREE.Mesh(loft([[-0.05, 0], [0.05, 0], [0.05, 0.038], [-0.05, 0.038]], Z_LEN), graniteMat);
    edge.position.set(edgeX, 0, Z_MID);
    edge.receiveShadow = true;
    ground.add(edge);
  }

  // Gratings over the channel.
  const gratingGeo = new THREE.BoxGeometry(0.30, 0.05, 0.56);
  for (let z = 16; z > -60; z -= 7.5) {
    const g = new THREE.Mesh(gratingGeo, ironMat);
    g.position.set((CH_MIN + CH_MAX) / 2, -0.006, z);
    g.receiveShadow = true;
    ground.add(g);
  }

  // Manholes + a small inspection cover.
  const coverGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.035, 28);
  for (const [mx, mz, s] of [[1.15, -4.4, 1], [-2.35, -17.2, 0.92], [2.4, -25.5, 0.7]]) {
    const cover = new THREE.Mesh(coverGeo, ironMat);
    cover.position.set(mx, 0.014, mz);
    cover.scale.set(s, 1, s);
    cover.receiveShadow = true;
    ground.add(cover);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34 * s, 0.022, 6, 26), graniteMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(mx, 0.012, mz);
    ground.add(ring);
  }

  /* ------------------------------------------------------- building shells */

  onProgress('street · building shells');

  const palette = {
    plasterA: new THREE.MeshStandardMaterial({ color: 0xb0a08c, roughness: 0.86 }),
    plasterB: new THREE.MeshStandardMaterial({ color: 0x968b7c, roughness: 0.88 }),
    plasterC: new THREE.MeshStandardMaterial({ color: 0xc0b19a, roughness: 0.84 }),
    timber: new THREE.MeshStandardMaterial({ color: 0x54392a, roughness: 0.78 }),
    timberWarm: new THREE.MeshStandardMaterial({ color: 0x714c33, roughness: 0.74 }),
    tile: new THREE.MeshStandardMaterial({ color: 0x3a3b3f, roughness: 0.62 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x2a2420, roughness: 0.9 }),
    // `soffit` is defined just below, with the rest of the eave assembly.
    glassDark: new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.25, metalness: 0.2 }),
    concrete: new THREE.MeshStandardMaterial({ color: 0x6f6a63, roughness: 0.9 }),
  };

  // ---- the eave assembly, and why it is its own set of materials.
  //
  // The band x 78-98% / y 1-11% of the hero frame measured mean L 47.9 with 23.5%
  // near-black against the reference's L 90.9 with 0.0%: the near-right corner
  // read as a black ceiling where the reference's is the brightest thing in the
  // upper frame. Attributed by recolouring each element in turn and re-measuring,
  // the band is 35% eave-tip fascia board (L 19), 7% upper pent roof (L 10, 100%
  // near-black) and 1% eave slab (L 10, 100% near-black).
  //
  // Albedo alone cannot fix it. The soffit already carries a PALE 0xa8977f and
  // still renders at L≈13 in that band, because nothing in the scene lights the
  // underside of a projecting eave from below — lighting.js's stall pockets throw
  // sideways and the lantern spine is outboard of the eave tip.
  //
  // So the assembly carries a small warm emissive FILL, the same device
  // dressing.js uses on its figures: it stands in for the bounce off the lit
  // signage and stall run underneath, sits two decades under TUNE.bloomThreshold
  // (1.8, linear pre-tone-map) so it reads as bounced light and never as a
  // source, and is deliberately NOT registered on ctx.emissives — these are not
  // sources and must not take a bloom budget. Albedos are lifted alongside it so
  // the fill has something warm to sit on rather than tinting a near-black.
  const EAVE_FILL = new THREE.Color(MARKET.warmLight);
  const eaveMat = (color, fill, roughness) => new THREE.MeshStandardMaterial({
    color,
    emissive: EAVE_FILL.clone(),
    emissiveIntensity: fill,
    roughness,
  });
  palette.eaveTile = eaveMat(0x5f5a51, 0.35, 0.62);    // eave slab + upper pent roof
  palette.eaveTimber = eaveMat(0x7a5540, 0.35, 0.78);  // fascia board + brackets
  palette.soffit = eaveMat(0xa8977f, 0.35, 0.8);       // the pale under-face itself

  const facadeMats = [palette.plasterA, palette.plasterB, palette.plasterC, palette.timberWarm];

  function litPanel(colour, intensity, kind, w, h, x, y, z, ry = 0) {
    const mat = new THREE.MeshStandardMaterial({
      color: 0x111111,
      emissive: new THREE.Color(colour),
      emissiveIntensity: intensity,
      roughness: 0.6,
      toneMapped: true,
    });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    emissives.add(mesh, { color: colour, intensity, kind });
    return mesh;
  }

  // Two batchers: `shellMass` is everything that should cast (building masses,
  // eaves, eave lips), `shellTrim` is the rest. Emissive panels stay individual
  // meshes because the registry scales each one.
  const shellMass = createBatcher();
  const shellTrim = createBatcher();

  // ---- right side: the dominant 2–3 storey mass, hard on the frontage line.
  const rRand = rng(0xa11c3e);
  const rightGroup = new THREE.Group();
  rightGroup.name = 'street.right';
  shells.add(rightGroup);

  let z = Z_NEAR;
  let prevHeight = 0;
  let index = 0;
  while (z > Z_FAR) {
    const len = 3.2 + rRand() * 3.4;
    const zc = z - len / 2;
    const depth = 9 + rRand() * 5;

    // Varied storey counts so the run is not one extruded block.
    const storeys = rRand() < 0.34 ? 2 : 3;
    let h = storeys === 2 ? 7.0 + rRand() * 1.4 : 9.6 + rRand() * 2.6;
    if (Math.abs(h - prevHeight) < 0.9) h += 1.5;
    prevHeight = h;

    const face = MARKET.frontageRight;
    const mat = facadeMats[index % facadeMats.length];

    // Ground storey is a separate block so some segments can genuinely RECESS
    // behind the frontage line: the upper mass then overhangs, the eave springs
    // off the overhang and the stall run sits in a real pocket rather than
    // against a flat wall.
    const GROUND_STOREY = 3.4;
    const recess = rRand() < 0.5 ? 0.28 + rRand() * 0.24 : 0;

    shellMass.add(mat, depth, h - GROUND_STOREY, len, face + depth / 2, GROUND_STOREY + (h - GROUND_STOREY) / 2, zc);
    shellMass.add(
      recess > 0 ? palette.timber : mat,
      depth - recess, GROUND_STOREY, len,
      face + recess + (depth - recess) / 2, GROUND_STOREY / 2, zc,
    );

    // Storey string courses / cornices — the horizontal lines that stop the
    // facade reading as a slab.
    const bands = storeys === 2 ? [3.55, h - 0.35] : [3.55, 6.7, h - 0.35];
    for (const by of bands) {
      shellTrim.add(palette.dark, 0.42, 0.26, len, face - 0.05, by, zc);
    }

    // Lit fascia band above the eave — the bright cream signboard run that
    // carries the right side of the reference. Plain here; frontage.js dresses.
    if (rRand() < 0.85) {
      const fh = 0.75 + rRand() * 0.25;
      const fy = 3.05 + rRand() * 0.2 + fh / 2;
      shellTrim.add(palette.plasterC, 0.14, fh, len - 0.16, face - 0.14, fy, zc);
      const glow = 0.35 + rRand() * 0.3;
      rightGroup.add(litPanel(0xffd9a3, glow, 'fascia', len - 0.3, fh - 0.14, face - 0.22, fy, zc, -Math.PI / 2));
    }

    // Upper-storey windows; a fraction lit.
    const winRows = storeys === 2 ? [5.1] : [5.1, 8.2];
    for (const wy of winRows) {
      if (wy + 1.3 > h) continue;
      const nWin = Math.max(1, Math.round(len / 1.7));
      for (let i = 0; i < nWin; i += 1) {
        const wz = zc - len / 2 + (len / nWin) * (i + 0.5);
        const ww = Math.min(1.05, (len / nWin) * 0.62);
        shellTrim.add(palette.glassDark, 0.1, 1.25, ww, face - 0.05, wy, wz);
        if (rRand() < 0.42) {
          rightGroup.add(litPanel(
            rRand() < 0.15 ? 0xd8e4ff : 0xffbe7c,
            0.5 + rRand() * 0.5,
            'window',
            ww - 0.1, 1.1, face - 0.11, wy, wz, -Math.PI / 2,
          ));
        }
      }
    }

    // ---- projecting eave over the walkway. This makes the warm pocket the
    // frontage sits in, so it is the single most important shell element.
    const proj = 1.30 + rRand() * 0.42;
    const tipY = MARKET.awningHeight - 0.06 + rRand() * 0.14;
    const rise = 0.36;
    const eaveLen = Math.hypot(proj, rise);
    const eaveTilt = Math.atan2(rise, proj);
    shellMass.add(
      palette.eaveTile, eaveLen, 0.085, len + 0.06,
      face - proj / 2, tipY + rise / 2, zc, 0, eaveTilt,
    );

    // Pale soffit under the eave so the warm light has something to bounce off.
    shellTrim.add(
      palette.soffit, eaveLen - 0.05, 0.03, len - 0.02,
      face - proj / 2, tipY + rise / 2 - 0.07, zc, 0, eaveTilt,
    );

    // Warm downlight strip in the eave — registered so lighting owns the scale.
    // Plane faces +Z; rotateX(+90°) turns it to face straight down.
    rightGroup.add(litPanel(
      MARKET.warmLight, 0.42, 'soffit',
      Math.min(0.5, proj * 0.4), len - 0.25,
      face - proj * 0.55, tipY + rise * 0.45 - 0.09, zc,
    ).rotateX(Math.PI / 2));

    // Fascia board at the eave tip + brackets back to the wall.
    shellMass.add(palette.eaveTimber, 0.09, 0.24, len + 0.06, face - proj, tipY - 0.05, zc);
    const nBr = Math.max(2, Math.round(len / 1.9));
    for (let i = 0; i < nBr; i += 1) {
      const bz = zc - len / 2 + (len / nBr) * (i + 0.5);
      shellTrim.add(palette.eaveTimber, proj * 0.9, 0.09, 0.1, face - proj * 0.45, tipY + 0.02, bz, 0, eaveTilt * 0.7);
      shellTrim.add(palette.eaveTimber, 0.09, 0.5, 0.1, face - 0.12, tipY - 0.24, bz);
    }

    // A second, higher pent roof on some segments — vertical variety.
    if (storeys === 3 && rRand() < 0.5) {
      const p2 = 0.6 + rRand() * 0.35;
      const y2 = 6.45 + rRand() * 0.5;
      shellTrim.add(palette.eaveTile, p2, 0.07, len, face - p2 / 2, y2, zc, 0, 0.22);
    }

    // Parapet.
    shellTrim.add(palette.dark, 0.5, 0.5, len, face + 0.1, h + 0.25, zc);

    z -= len;
    index += 1;
  }

  // ---- left side: lower, more open. Near-camera it is boundary wall and low
  // sheds (dressing.js fills it with seating); further down it closes in.
  const lRand = rng(0x77e19b);
  const leftGroup = new THREE.Group();
  leftGroup.name = 'street.left';
  shells.add(leftGroup);

  // Low plinth the whole way — the left edge still needs a hard line.
  const plinth = new THREE.Mesh(
    loft([[-0.6, 0], [0.14, 0], [0.14, 0.17], [-0.6, 0.17]], Z_LEN),
    palette.concrete,
  );
  plinth.position.set(MARKET.frontageLeft - 0.14, 0, Z_MID);
  plinth.receiveShadow = true;
  leftGroup.add(plinth);

  const railMat = new THREE.MeshStandardMaterial({ color: 0x33463a, roughness: 0.6, metalness: 0.3 });

  z = Z_NEAR;
  index = 0;
  while (z > Z_FAR) {
    const len = 4.0 + lRand() * 4.0;
    const zc = z - len / 2;
    const face = MARKET.frontageLeft;

    // Open zone in front of the camera: railing + low wall only, so the left
    // reads as the open seating side of the reference.
    const open = zc > -5.5;
    const midZone = zc <= -5.5 && zc > -21;

    if (open) {
      // Low boundary wall with a rail above — the green railing note in §5.
      shellMass.add(palette.concrete, 0.35, 1.0, len, face - 0.2, 0.5, zc);
      shellTrim.add(railMat, 0.07, 0.07, len, face - 0.2, 1.12, zc);
      const nPosts = Math.max(2, Math.round(len / 1.6));
      for (let i = 0; i < nPosts; i += 1) {
        shellTrim.add(railMat, 0.06, 0.62, 0.06, face - 0.2, 1.3, zc - len / 2 + (len / nPosts) * (i + 0.5));
      }
      // Set-back dark mass so the sky is not open behind the seating.
      shellTrim.add(palette.dark, 8, 5.5 + lRand() * 2, len, face - 5.2, 2.9, zc);
    } else {
      const h = midZone ? 3.4 + lRand() * 1.6 : 6.0 + lRand() * 3.4;
      const depth = 8 + lRand() * 5;
      const mat = facadeMats[(index + 2) % facadeMats.length];
      shellMass.add(mat, depth, h, len, face - depth / 2, h / 2, zc);

      // Shallow canopy — the left side has awnings too, just lower and sparser.
      if (lRand() < 0.7) {
        const proj = 0.8 + lRand() * 0.5;
        const ty = 2.5 + lRand() * 0.4;
        shellMass.add(palette.tile, proj, 0.07, len, face + proj / 2, ty, zc, 0, -0.2);
        shellTrim.add(palette.timber, 0.08, 0.18, len, face + proj, ty - 0.06, zc);
      }
      shellTrim.add(palette.dark, 0.36, 0.22, len, face + 0.04, h - 0.2, zc);

      if (!midZone) {
        const nWin = Math.max(1, Math.round(len / 2.1));
        for (let i = 0; i < nWin; i += 1) {
          const wz = zc - len / 2 + (len / nWin) * (i + 0.5);
          shellTrim.add(palette.glassDark, 0.1, 1.15, 1.0, face + 0.04, 4.4, wz);
          if (lRand() < 0.32) {
            leftGroup.add(litPanel(0xffb877, 0.4 + lRand() * 0.4, 'window', 0.9, 1.0, face + 0.1, 4.4, wz, Math.PI / 2));
          }
        }
      }
    }
    z -= len;
    index += 1;
  }

  /* -------------------------------------------- background + the pale tower */

  onProgress('street · background');

  const bg = new THREE.Group();
  bg.name = 'street.background';
  root.add(bg);

  const bgMats = [
    new THREE.MeshStandardMaterial({ color: 0x3a3a42, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x2e2f38, roughness: 0.92 }),
    new THREE.MeshStandardMaterial({ color: 0x45424a, roughness: 0.9 }),
  ];

  const bRand = rng(0x40cd15);
  const bgBatch = createBatcher(60);

  // ---- the pale lit tower. Slightly left of the street axis, clear above the
  // near roofline, cool white/blue against an otherwise entirely warm frame.
  //
  // It sits at the REFERENCE-IMPLIED ~84 m. It did not always: lighting.js used
  // to run FogExp2 at density 0.017, where 84 m transmits only 13% and the tower
  // vanished into the lantern haze, so it was dragged in to ~53 m and scaled
  // down to hold its angular footprint. lighting.js thinned the fog to 0.0125
  // (and neutralised its colour) on 2026-08-16 — 84 m now transmits 32%, 53 m
  // 63% — so that compensation is no longer needed and has been reverted.
  //
  // What the composition depends on is the ANGULAR footprint, not the depth, so
  // the move out is a pure similarity transform of the 53 m solve: everything
  // horizontal scales by the distance ratio 84/53 = 1.585, and every HEIGHT
  // scales about the hero EYE (1.6 m) rather than about the ground — the camera
  // is not on the paving, so scaling the box about its base would have lifted
  // the top by 0.6°. Measured from SHOTS.hero (eye 0.6, 1.6, 9; the street's
  // vanishing point is the -Z direction) the tower is unchanged in frame:
  //   crown top   15.11° above the horizon   (body top 13.61°)
  //   centre       9.22° left of the vanishing point
  //   width        5.05°
  // — the same three numbers, to two decimals, as at 53 m. They sit a little
  // above the reference's own ≈12° / ≈8° / ≈4.8° on purpose, and the reason is
  // unchanged: dressing.js's tree mass and the lantern rows both cross this part
  // of frame, and at the exact reference height only ~2 m of the tower cleared
  // them. The base stays buried in the left roofline, as in the reference frame.
  //
  // Declared HERE, above the background field, because the field has to be able
  // to see it: see the bearing guard in the loop below.
  const TOWER_S = 84 / 53;                          // 1.585 — the distance ratio
  const EYE = { x: 0.6, y: 1.6, z: 9 };             // SHOTS.hero
  const towerUp = (y) => EYE.y + (y - EYE.y) * TOWER_S;
  const towerX = EYE.x - 8.6 * TOWER_S;             // -13.03
  const towerZ = EYE.z - 84;                        // -75
  const towerH = towerUp(14.6);                     // 22.20
  const towerW = 4.8 * TOWER_S;                     // 7.61

  /** Bearing of a world point from the hero eye, degrees LEFT of the -Z axis. */
  const bearing = (x, z) => (Math.atan2(EYE.x - x, EYE.z - z) * 180) / Math.PI;
  // The tower plus its crown band, padded a little for the facade wash panels.
  const TOWER_BEARING = [
    bearing(towerX + towerW * 0.6, towerZ),
    bearing(towerX - towerW * 0.6, towerZ),
  ];
  const TOWER_DIST = EYE.z - towerZ;

  // Blocks that close the far end without walling the street off: the axis
  // itself stays open, mass builds either side and recedes.
  //
  // Everything here has to sit BEHIND the pale tower so nothing occludes the
  // frame's one cool architectural note. A flat 60 m near limit guaranteed that
  // while the tower was dragged in to 53 m; with the tower back at 84 m it no
  // longer does, and whether any given block lands in the tower's 5° window is
  // then down to the seed rather than to the design. So the near limit is
  // bearing-aware: 60 m everywhere except inside that window, where the field
  // opens beyond the tower. On seed 0x40cd15 this changes nothing visible — it
  // is a guard on the invariant, not a fix for an observed defect.
  for (let i = 0; i < 44; i += 1) {
    let far = 60 + bRand() * 120;
    const side = bRand() < 0.5 ? -1 : 1;
    const lateral = side * (8 + bRand() * 52);
    const w = 8 + bRand() * 20;
    const d = 8 + bRand() * 20;
    const h = 5 + bRand() * (far > 130 ? 24 : 13);
    const b0 = bearing(lateral + w / 2, -far);
    const b1 = bearing(lateral - w / 2, -far);
    if (b1 > TOWER_BEARING[0] && b0 < TOWER_BEARING[1]) far = Math.max(far, TOWER_DIST + 8);
    bgBatch.add(bgMats[i % 3], w, h, d, lateral, h / 2, -far);

    // Dim lit window bands, low contrast — depth cues, not focal points.
    if (bRand() < 0.4) {
      const bandY = 2.5 + bRand() * Math.max(1, h - 4);
      bg.add(litPanel(
        bRand() < 0.25 ? 0xaec6f0 : 0xffc08a,
        0.12 + bRand() * 0.14,
        'distant',
        w * 0.7, 0.9,
        lateral, bandY, -far + d / 2 + 0.06,
      ));
    }
  }

  // Low roofline behind the street run so the vanishing point sits against
  // mass rather than sky. Low enough (7-13 m at 58-74 m out, i.e. under 9.5°)
  // that it passes below the tower's crown even now the tower is behind it; it
  // only ever buried the tower's base, which is what it is there to do.
  for (let i = 0; i < 7; i += 1) {
    const h = 7 + bRand() * 6;
    const lateral = (bRand() < 0.5 ? -1 : 1) * (16 + bRand() * 11);
    bgBatch.add(bgMats[(i + 1) % 3], 12 + bRand() * 8, h, 12, lateral, h / 2, -58 - bRand() * 16);
  }

  // ---- the pale lit tower itself. Placement and the reasoning behind it are
  // above, with the constants, because the background field depends on them.
  const towerBody = new THREE.MeshStandardMaterial({
    color: 0xa8b6c6,
    emissive: new THREE.Color(0x4a678c),
    emissiveIntensity: 1.0,
    roughness: 0.82,
  });
  bgBatch.add(towerBody, towerW, towerH, towerW, towerX, towerH / 2, towerZ);

  // Facade wash — the tower reads as lit, not merely pale. Registered at the
  // same intensity as the crown sign so both take the full `tower` budget.
  for (const [dx, dz, ry] of [[0, towerW / 2 + 0.06, 0], [towerW / 2 + 0.06, 0, Math.PI / 2]]) {
    bg.add(litPanel(
      MARKET.coolAccent, 1.0, 'tower',
      towerW - 0.7 * TOWER_S, 11.6 * TOWER_S,
      towerX + dx, towerUp(7.7), towerZ + dz, ry,
    ));
  }

  // Dark window slots break the slab up.
  for (let i = 0; i < 3; i += 1) {
    bgBatch.add(
      palette.glassDark, towerW - 1.5 * TOWER_S, 0.55 * TOWER_S, 0.2,
      towerX, towerUp(6.4 + i * 1.9), towerZ + towerW / 2 + 0.12,
    );
  }

  // Blue crown band with its lit sign — the reference's single cool sign note.
  // The sign stands proud of the CROWN box, not of the tower body: the crown
  // overhangs the body by 0.3·TOWER_S per side, so a stand-off measured off the
  // body buries the sign inside the crown the moment TOWER_S is anything but 1.
  // (It did exactly that on the move out to 84 m, and the crown band went from
  // the frame's one cool note to nothing at all — 30 points of blue in the band.)
  const crownH = 1.5 * TOWER_S;
  const crownW = towerW + 0.3 * TOWER_S;
  bgBatch.add(
    new THREE.MeshStandardMaterial({ color: 0x2c4a74, roughness: 0.75 }),
    crownW, crownH, crownW, towerX, towerH + crownH / 2, towerZ,
  );
  bg.add(litPanel(
    0x9ec8ff, 1.0, 'tower',
    towerW - 0.6 * TOWER_S, 0.6 * TOWER_S,
    towerX, towerH + crownH / 2 + 0.05 * TOWER_S, towerZ + crownW / 2 + 0.22,
  ));

  // A second, dimmer pale slab further left, plus one small warm distant
  // billboard. Both stay where they were solved; with the tower back at 84 m
  // they now sit in FRONT of it rather than behind, which costs nothing —
  // measured from the hero eye the slab spans 13-22° left, clear of the tower's
  // 6.6-11.9° window entirely, and the billboard clips only 0.6° of the tower's
  // lower body at an elevation the roofline already buries.
  bgBatch.add(
    new THREE.MeshStandardMaterial({ color: 0x8695a6, emissive: new THREE.Color(0x2c3a4c), roughness: 0.86 }),
    10, 11, 10, -18, 5.5, -58,
  );
  bg.add(litPanel(0xffd86a, 1.5, 'distant', 2.4, 1.1, -6.0, 8.0, -52));

  // Distant street lamps — small warm points down the far run.
  const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });
  for (let i = 0; i < 6; i += 1) {
    // Kept inside the street corridor, past the end of the lantern rows, so
    // they read as points receding to the vanishing point rather than being
    // buried inside the building masses either side.
    const lz = -46 - i * 8;
    const lx = (i % 2 === 0 ? -1 : 1) * (2.3 + bRand() * 0.5);
    bgBatch.add(lampMat, 0.12, 5.4, 0.12, lx, 2.7, lz);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), new THREE.MeshStandardMaterial({
      color: 0x111111, emissive: new THREE.Color(0xffcf9a), emissiveIntensity: 0.9, roughness: 0.5,
    }));
    head.position.set(lx, 5.5, lz);
    emissives.add(head, { color: 0xffcf9a, intensity: 0.9, kind: 'distant' });
    bg.add(head);
  }

  // Bake the shells down. ~700 boxes collapse to a couple of dozen merged
  // meshes; only the masses and eaves cast.
  shellMass.flush(shells, { castShadow: true, receiveShadow: true });
  shellTrim.flush(shells, { castShadow: false, receiveShadow: true });
  bgBatch.flush(bg, { castShadow: false, receiveShadow: false });

  /* ------------------------------------------------- damp: planar reflection */

  onProgress('street · damp ground');

  buildDampReflection({
    ctx, root, ground, camera, renderer,
    wetCanvas, rippleCanvas, anisotropy,
    extent: { xMin: GREY_MIN, xMax: BRICK_MAX, zNear: Z_NEAR, zFar: Z_FAR },
  });

  return root;
}

/* ---------------------------------------------------------- damp ground -- */

/**
 * Planar mirror pass + a damp overlay.
 *
 * The overlay is a MeshBasicMaterial patched through onBeforeCompile rather
 * than a bare ShaderMaterial, so three's own tone-mapping, colour-space and fog
 * chunks stay intact and lighting.js keeps control of exposure. Reflection
 * strength is Fresnel-weighted (nothing underfoot, strong toward the vanishing
 * point), masked by a procedural damp/puddle map, distorted by a ripple normal
 * and blurred through the render target's mip chain with a vertical smear —
 * which is what separates "damp paving" from "sheet of glass".
 */
function buildDampReflection({
  ctx, root, ground, camera, renderer, wetCanvas, rippleCanvas, anisotropy, extent,
}) {
  const size = renderer?.getSize?.(new THREE.Vector2()) ?? new THREE.Vector2(1280, 720);
  const rtW = 1024;
  const rtH = Math.max(256, Math.round((rtW * size.y) / Math.max(1, size.x)));

  const target = new THREE.WebGLRenderTarget(rtW, rtH, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: true,
    depthBuffer: true,
  });
  target.texture.generateMipmaps = true;

  const wetMap = texture(wetCanvas, { anisotropy });
  const rippleMap = texture(rippleCanvas, { anisotropy });

  const width = extent.xMax - extent.xMin;
  const length = extent.zNear - extent.zFar;

  const material = new THREE.MeshBasicMaterial({
    map: target.texture,
    transparent: true,
    depthWrite: false,
    side: THREE.FrontSide,
    fog: true,
  });

  const textureMatrix = new THREE.Matrix4();
  const uniforms = {
    textureMatrix: { value: textureMatrix },
    wetMap: { value: wetMap },
    rippleMap: { value: rippleMap },
    wetTint: { value: new THREE.Color(0xffd9b4) },
    wetGain: { value: 0.80 },
  };

  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform mat4 textureMatrix;
varying vec4 vReflCoord;
varying vec3 vWorldPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec4 nmWorld = modelMatrix * vec4( position, 1.0 );
vWorldPos = nmWorld.xyz;
vReflCoord = textureMatrix * nmWorld;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D wetMap;
uniform sampler2D rippleMap;
uniform vec3 wetTint;
uniform float wetGain;
varying vec4 vReflCoord;
varying vec3 vWorldPos;`,
      )
      .replace(
        '#include <map_fragment>',
        `
// --- damp ground -------------------------------------------------------
// Puddle/damp mask in world space. Two scales so pools have edges but the
// whole street still carries a baseline sheen.
float wetA = texture2D( wetMap, vWorldPos.xz * 0.052 ).r;
float wetB = texture2D( wetMap, vWorldPos.xz * 0.017 + vec2( 0.37, 0.11 ) ).r;
float wet = clamp( wetA * 0.55 + wetB * 0.62, 0.0, 1.0 );

// Ripple distortion — breaks the mirror without reading as water.
vec3 ripple = texture2D( rippleMap, vWorldPos.xz * 0.34 ).rgb * 2.0 - 1.0;

vec2 baseUv = vReflCoord.xy / max( vReflCoord.w, 1e-4 );
baseUv += ripple.xy * ( 0.004 + 0.012 * wet );

// Grazing-angle Fresnel. Underfoot the paving stays matte brick; the sheen
// builds toward the vanishing point exactly as it does in the reference.
vec3 viewDir = normalize( cameraPosition - vWorldPos );
float grazing = pow( clamp( 1.0 - viewDir.y, 0.0, 1.0 ), 3.0 );

// Blur: rough where merely damp, tighter in the pools.
float lod = mix( 4.8, 2.5, wet );

// Vertical smear. This is what separates damp paving from a mirror: a rough
// wet surface stretches every highlight along the view direction, which on a
// ground plane is vertical in screen space. Without a smear this long the
// lantern row reflects as a row of discrete dots.
float smear = 0.013 + 0.042 * ( 1.0 - wet );
vec3 refl = vec3( 0.0 );
refl += texture2D( map, baseUv,                                lod        ).rgb * 0.26;
refl += texture2D( map, baseUv + vec2(  0.009, smear * 0.42  ), lod + 0.5 ).rgb * 0.19;
refl += texture2D( map, baseUv + vec2( -0.009, smear * -0.42 ), lod + 0.5 ).rgb * 0.19;
refl += texture2D( map, baseUv + vec2(  0.019, smear         ), lod + 1.1 ).rgb * 0.14;
refl += texture2D( map, baseUv + vec2( -0.019, smear * -1.0  ), lod + 1.1 ).rgb * 0.14;
refl += texture2D( map, baseUv + vec2(  0.006, smear * 1.9   ), lod + 1.7 ).rgb * 0.04;
refl += texture2D( map, baseUv + vec2( -0.006, smear * -1.9  ), lod + 1.7 ).rgb * 0.04;

float strength = wetGain * wet * ( 0.06 + 0.94 * grazing );

// Fade out past the useful range of the mirror pass.
float far = 1.0 - smoothstep( 46.0, 74.0, length( vWorldPos.xz - cameraPosition.xz ) );
strength *= far;
strength = clamp( strength, 0.0, 0.66 );

diffuseColor = vec4( refl * wetTint, strength );
// -----------------------------------------------------------------------`,
      );
  };
  material.customProgramCacheKey = () => 'night-market-damp-ground';

  const overlay = new THREE.Mesh(new THREE.PlaneGeometry(width, length, 1, 1), material);
  overlay.rotation.x = -Math.PI / 2;
  overlay.position.set((extent.xMin + extent.xMax) / 2, 0.018, (extent.zNear + extent.zFar) / 2);
  overlay.renderOrder = 2;
  overlay.name = 'street.dampOverlay';
  ground.add(overlay);

  /* ---- mirror pass */

  const virtualCamera = new THREE.PerspectiveCamera();
  const bias = new THREE.Matrix4().set(
    0.5, 0.0, 0.0, 0.5,
    0.0, 0.5, 0.0, 0.5,
    0.0, 0.0, 0.5, 0.5,
    0.0, 0.0, 0.0, 1.0,
  );
  const camPos = new THREE.Vector3();
  const camDir = new THREE.Vector3();
  const camUp = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  // The mirror pass is a second full render of the scene, so it is throttled:
  // redrawn immediately whenever the camera moves (shot switches must be
  // instant) and otherwise only every REFRESH frames to pick up lantern sway.
  // main.js settles 900 frames before a capture, so a still frame is always
  // reflecting an up-to-date scene by the time it is recorded.
  const REFRESH = 6;
  const lastCam = new THREE.Matrix4();
  let tick = 0;

  const updater = () => {
    if (!camera || !renderer || !ctx.scene) return;

    camera.updateMatrixWorld();
    const moved = !lastCam.equals(camera.matrixWorld);
    if (!moved && tick % REFRESH !== 0) { tick += 1; return; }
    lastCam.copy(camera.matrixWorld);
    tick += 1;

    camera.getWorldPosition(camPos);
    camera.getWorldDirection(camDir);
    camUp.set(0, 1, 0).applyQuaternion(camera.quaternion);

    // Mirror about y = 0.
    virtualCamera.position.set(camPos.x, -camPos.y, camPos.z);
    virtualCamera.up.set(camUp.x, -camUp.y, camUp.z);
    lookTarget.set(camPos.x + camDir.x, -(camPos.y + camDir.y), camPos.z + camDir.z);
    virtualCamera.lookAt(lookTarget);
    virtualCamera.updateMatrixWorld(true);
    virtualCamera.projectionMatrix.copy(camera.projectionMatrix);
    virtualCamera.projectionMatrixInverse.copy(camera.projectionMatrixInverse);
    virtualCamera.matrixWorldInverse.copy(virtualCamera.matrixWorld).invert();

    textureMatrix
      .copy(bias)
      .multiply(virtualCamera.projectionMatrix)
      .multiply(virtualCamera.matrixWorldInverse);

    // The ground itself must not appear in its own reflection.
    const wasVisible = ground.visible;
    ground.visible = false;

    const previousTarget = renderer.getRenderTarget();
    const previousXR = renderer.xr.enabled;
    renderer.xr.enabled = false;
    renderer.setRenderTarget(target);
    renderer.clear();
    renderer.render(ctx.scene, virtualCamera);
    renderer.setRenderTarget(previousTarget);
    renderer.xr.enabled = previousXR;

    ground.visible = wasVisible;
  };

  (ctx.updaters ??= []).push(updater);

  root.userData.damp = { target, overlay, uniforms };
}

