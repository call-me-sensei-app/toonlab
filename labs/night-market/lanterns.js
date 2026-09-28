// Night Market — lanterns.js
//
// OWNS: the overhead lantern rows, the wires they hang from, the street-spanning
// signage and the banner strings. Spec §4.
//
// SCOPE: plain Three.js. Nothing from src/ (ToonLab) is imported here — see the
// note at the top of scene.js for why.
//
// This module owns the signature element of the frame. Two rows of chochin on
// sagging catenary wires run the street's length and converge on the vanishing
// point; that convergence, plus the sag, is what produces the depth the
// reference has. Everything else in this file is in service of those two rows.
//
// ORIGINALITY: every mark drawn here is invented. No shop name, logo or glyph
// from the reference is reproduced. Density, colour and contrast carry the read.

import * as THREE from 'three';

import { MARKET, rng } from './scene.js';

/* ------------------------------------------------------------------ *
 * Geometry constants
 * ------------------------------------------------------------------ */

const R = MARKET.lanternRadius;          // 0.175 → 0.35 m diameter, spec §4
const LANTERN_H = R * 2.30;              // measured h/w ≈ 1.15 off the reference
const HOOPS = 11;                        // visible horizontal bamboo hoops
const CORD = 0.15;                       // wire → lantern top
const HANG = CORD + LANTERN_H / 2;       // wire → lantern centre

// The wire hangs from anchor "poles" every SPAN_LANTERNS lanterns and sags
// between them. Row Y in MARKET is the *average* lantern centre, so the anchor
// height is derived from it rather than used as the anchor directly.
const SPAN_LANTERNS = 6;
const ROW_SAG = 0.55;
const ROW_ANCHOR_Y = MARKET.lanternRowY + HANG + ROW_SAG * 0.63;

// The rows begin level with the camera and run away down -Z, so the nearest
// lanterns are huge and clipped by the frame edge exactly as in the reference.
const ROW_Z0 = 9.0;

const WARM_CORE = 0xfff0d2;   // lantern paper, lit
const WARM_EMIT = 0xffc079;   // ~2700 K
const RED_PAPER = 0xff5a30;
const RED_EMIT = 0xff3a14;
const DARK_FITTING = 0x2a1d16;

/* ------------------------------------------------------------------ *
 * Catenary
 * ------------------------------------------------------------------ */

/**
 * Solve the catenary parameter `a` for a wire of horizontal span `L` hung
 * between equal-height anchors with mid-span sag `s`:  s = a·(cosh(L/2a) − 1).
 * Bisection — monotone in `a`, and cheap enough to not care.
 */
function catenaryParam(L, s) {
  const f = (a) => a * (Math.cosh(L / (2 * a)) - 1) - s;
  let lo = L / 400;
  let hi = L * 400;
  for (let i = 0; i < 80; i += 1) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Height drop below the anchors at horizontal position `u` ∈ [0, L]. */
function catenaryDrop(a, L, u) {
  return a * (Math.cosh(L / (2 * a)) - Math.cosh((u - L / 2) / a));
}

/* ------------------------------------------------------------------ *
 * Paper textures — invented marks only
 * ------------------------------------------------------------------ */

function paperTexture({ mark = 0, red = false } = {}) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 256;
  const g = c.getContext('2d');

  // This map is also the emissiveMap, and lighting.js sets a single flat
  // emissiveIntensity per kind — so this gradient is the ONLY thing that keeps
  // a lantern from tone-mapping to a featureless white disc. It therefore has
  // to carry a real value range: a hot belly where the bulb is, falling to
  // roughly a third of that at both caps. A near-white paper texture reads
  // correctly in isolation and blows out completely under the frame's bloom.
  const grad = g.createLinearGradient(0, 0, 0, 256);
  if (red) {
    grad.addColorStop(0.00, '#2a0c04');
    grad.addColorStop(0.11, '#a02c0c');
    grad.addColorStop(0.34, '#ff5e26');
    grad.addColorStop(0.60, '#f04a17');
    grad.addColorStop(0.82, '#8e2606');
    grad.addColorStop(1.00, '#240a02');
  } else {
    grad.addColorStop(0.00, '#2e2620');
    grad.addColorStop(0.10, '#a8977e');
    grad.addColorStop(0.30, '#fff6e0');
    grad.addColorStop(0.55, '#ffeec8');
    grad.addColorStop(0.74, '#f0b968');
    grad.addColorStop(0.88, '#a05e22');
    grad.addColorStop(1.00, '#2a1a0c');
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 256);

  // Bamboo hoops, drawn as well as modelled — the shading line reads at
  // distances where the silhouette scallop has already fallen below a pixel.
  g.strokeStyle = red ? 'rgba(40,4,0,0.60)' : 'rgba(70,34,6,0.55)';
  g.lineWidth = 3;
  for (let i = 1; i < HOOPS; i += 1) {
    const y = (i / HOOPS) * 256;
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(128, y);
    g.stroke();
  }

  // Two faint vertical struts.
  g.strokeStyle = red ? 'rgba(60,8,0,0.22)' : 'rgba(104,58,16,0.20)';
  g.lineWidth = 3;
  for (const x of [26, 96]) {
    g.beginPath();
    g.moveTo(x, 14);
    g.lineTo(x, 242);
    g.stroke();
  }

  // Invented marks. Abstract strokes at the size, weight and contrast a shop
  // mark would occupy — nothing transcribed from the reference.
  if (mark > 0) {
    g.fillStyle = red ? 'rgba(60,8,0,0.72)' : 'rgba(74,40,14,0.66)';
    if (mark === 1) {
      g.fillRect(38, 96, 52, 9);
      g.fillRect(46, 122, 36, 9);
      g.fillRect(30, 148, 68, 9);
      g.fillRect(60, 96, 9, 60);
    } else {
      g.beginPath();
      g.arc(64, 122, 26, 0, Math.PI * 2);
      g.lineWidth = 9;
      g.strokeStyle = g.fillStyle;
      g.stroke();
      g.fillRect(34, 162, 60, 9);
      g.fillRect(48, 100, 32, 9);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function signTexture(seed) {
  const rand = rng(seed);
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 96;
  const g = c.getContext('2d');
  g.fillStyle = '#160d08';
  g.fillRect(0, 0, 512, 96);

  // Blocks of warm/red/teal panel, then invented strokes inside them. Density
  // and colour do the work; no legible text of any kind.
  const palette = ['#ffb347', '#ff5b2e', '#ffe08a', '#e8452c', '#2fa8a0', '#ffd166'];
  let x = 6;
  while (x < 500) {
    const w = 34 + Math.floor(rand() * 58);
    g.fillStyle = palette[Math.floor(rand() * palette.length)];
    g.fillRect(x, 8, Math.min(w, 504 - x), 80);
    g.fillStyle = 'rgba(30,12,4,0.78)';
    const marks = 1 + Math.floor(rand() * 3);
    for (let m = 0; m < marks; m += 1) {
      const mx = x + 8 + m * 20;
      if (mx > x + w - 12) break;
      g.fillRect(mx, 20 + Math.floor(rand() * 10), 12, 6);
      g.fillRect(mx + 2, 36, 7, 30);
      g.fillRect(mx - 2, 52 + Math.floor(rand() * 8), 16, 6);
    }
    x += w + 5;
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/* ------------------------------------------------------------------ *
 * The chochin itself
 * ------------------------------------------------------------------ */

/**
 * Vertical ellipsoid, widest a little below the middle, pinched at each bamboo
 * hoop so the ribs break the silhouette. A smooth sphere does not read as paper
 * at this size — the scalloped profile is the whole point.
 */
function chochinGeometry(radius, height) {
  const steps = HOOPS * 4;
  const points = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;                       // 0 = bottom, 1 = top
    // Envelope: sin lobe, biased so the belly sits just under mid-height.
    const biased = Math.pow(t, 1.06);
    const env = Math.pow(Math.sin(Math.PI * (0.085 + 0.83 * biased)), 0.58);
    // Hoop pinch.
    const pinch = 1 - 0.090 * (0.5 + 0.5 * Math.cos(2 * Math.PI * HOOPS * t));
    const r = Math.max(0.012, radius * env * pinch);
    points.push(new THREE.Vector2(r, (t - 0.5) * height));
  }
  const geo = new THREE.LatheGeometry(points, 22);
  geo.computeVertexNormals();
  return geo;
}

/* ------------------------------------------------------------------ *
 * build
 * ------------------------------------------------------------------ */

export function build(ctx) {
  const { scene, emissives, onProgress = () => {} } = ctx;
  onProgress('Stringing lanterns…');

  const root = new THREE.Group();
  root.name = 'lanterns';
  scene.add(root);

  const rand = rng(0x10ADCE);
  if (!Array.isArray(ctx.updaters)) ctx.updaters = [];

  /* ---- shared assets ---- */

  // One geometry for every lantern in the frame. Size variation is applied as a
  // uniform group scale in hangLantern so the caps, the cord and the hang
  // offset all scale with the body — pre-scaling a second geometry and then
  // also passing a scale silently squares the two.
  const geoWhite = chochinGeometry(R, LANTERN_H);

  const whiteMats = [0, 1, 2].map((mark) => {
    const tex = paperTexture({ mark });
    return new THREE.MeshStandardMaterial({
      map: tex,
      color: WARM_CORE,
      emissive: new THREE.Color(WARM_EMIT),
      emissiveMap: tex,
      emissiveIntensity: 1.35,
      roughness: 0.92,
      metalness: 0,
    });
  });
  const redTex = paperTexture({ mark: 1, red: true });
  const redMat = new THREE.MeshStandardMaterial({
    map: redTex,
    color: RED_PAPER,
    emissive: new THREE.Color(RED_EMIT),
    emissiveMap: redTex,
    emissiveIntensity: 1.15,
    roughness: 0.9,
    metalness: 0,
  });

  const fittingMat = new THREE.MeshStandardMaterial({ color: DARK_FITTING, roughness: 0.8, metalness: 0.1 });
  const wireMat = new THREE.MeshStandardMaterial({ color: 0x14100d, roughness: 0.95, metalness: 0.2 });

  // Both caps sit against a surface that is deliberately blown out, so they are
  // sized to survive bloom bleed — an undersized cap simply disappears and the
  // lantern stops reading as an object.
  const capTop = new THREE.CylinderGeometry(R * 0.34, R * 0.40, LANTERN_H * 0.11, 12);
  const capBot = new THREE.CylinderGeometry(R * 0.46, R * 0.38, LANTERN_H * 0.15, 12);
  const cordGeo = new THREE.CylinderGeometry(0.006, 0.006, 1, 5);

  const swayers = [];
  let whiteCount = 0;
  let redCount = 0;

  /**
   * One lantern, hung from `point` on the wire. Returns the pivot group so the
   * sway rotates about the attachment, which is where a real one pivots.
   */
  function hangLantern(parent, point, {
    geo, mat, emitColor, emitIntensity, kind, scale = 1, cord = CORD,
  }) {
    const pivot = new THREE.Group();
    pivot.position.copy(point);
    parent.add(pivot);

    const drop = new THREE.Mesh(cordGeo, fittingMat);
    drop.scale.set(1, cord, 1);
    drop.position.y = -cord / 2;
    pivot.add(drop);

    const body = new THREE.Group();
    body.position.y = -(cord + (LANTERN_H * scale) / 2);
    body.scale.setScalar(scale);
    pivot.add(body);

    const shell = new THREE.Mesh(geo, mat);
    body.add(shell);

    const top = new THREE.Mesh(capTop, fittingMat);
    top.position.y = LANTERN_H * 0.5;
    body.add(top);
    const bot = new THREE.Mesh(capBot, fittingMat);
    bot.position.y = -LANTERN_H * 0.5;
    body.add(bot);

    // One emissive scale for the whole frame — lighting.js owns it, this module
    // only declares what it lit and how warm.
    emissives.add(shell, { color: emitColor, intensity: emitIntensity, kind });

    swayers.push({
      node: pivot,
      ax: 0.020 + rand() * 0.030,
      az: 0.014 + rand() * 0.024,
      wx: 0.42 + rand() * 0.34,
      wz: 0.31 + rand() * 0.29,
      px: rand() * Math.PI * 2,
      pz: rand() * Math.PI * 2,
      ay: 0.05 + rand() * 0.09,
      wy: 0.19 + rand() * 0.16,
      py: rand() * Math.PI * 2,
    });
    return pivot;
  }

  /** Tube along one catenary span, plus the pole-head fitting at each end. */
  function addWireSpan(parent, ax, az, bx, bz, anchorY, sag) {
    const L = Math.hypot(bx - ax, bz - az);
    const a = catenaryParam(L, sag);
    const pts = [];
    for (let i = 0; i <= 26; i += 1) {
      const u = (i / 26) * L;
      pts.push(new THREE.Vector3(
        ax + ((bx - ax) * u) / L,
        anchorY - catenaryDrop(a, L, u),
        az + ((bz - az) * u) / L,
      ));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 30, 0.013, 4, false), wireMat);
    parent.add(tube);
    return { a, L };
  }

  /* ---- §4 the two converging rows ---- */

  const rowGroup = new THREE.Group();
  rowGroup.name = 'lantern-rows';
  root.add(rowGroup);

  const spacing = MARKET.lanternSpacing;
  const count = MARKET.lanternCount;
  const rowSpans = Math.ceil(count / SPAN_LANTERNS);

  for (const rowX of MARKET.lanternRowX) {
    // Anchors sit half a spacing outside the first and last lantern of each
    // group of six, so no lantern hangs exactly on a pole.
    for (let s = 0; s < rowSpans; s += 1) {
      const z0 = ROW_Z0 - (s * SPAN_LANTERNS - 0.5) * spacing;
      const z1 = ROW_Z0 - ((s + 1) * SPAN_LANTERNS - 0.5) * spacing;
      addWireSpan(rowGroup, rowX, z0, rowX, z1, ROW_ANCHOR_Y, ROW_SAG);
    }

    for (let i = 0; i < count; i += 1) {
      const s = Math.floor(i / SPAN_LANTERNS);
      const local = i - s * SPAN_LANTERNS;             // 0..5 within the span
      const spanL = SPAN_LANTERNS * spacing;
      const a = catenaryParam(spanL, ROW_SAG);
      const u = (local + 0.5) * spacing;               // distance from span start
      // A few centimetres of deterministic jitter. Hung by hand, no two cords
      // are the same length, and a perfectly regular row reads as a light
      // string rather than as paper lanterns.
      const y = ROW_ANCHOR_Y - catenaryDrop(a, spanL, u) - rand() * 0.075;
      const z = ROW_Z0 - i * spacing + (rand() - 0.5) * 0.16;
      const mat = whiteMats[i % 3 === 1 ? (i % 6 === 1 ? 1 : 2) : 0];
      hangLantern(rowGroup, new THREE.Vector3(rowX + (rand() - 0.5) * 0.10, y, z), {
        geo: geoWhite,
        mat,
        emitColor: MARKET.warmLight,
        emitIntensity: 1.0,
        kind: 'chochin',
      });
      whiteCount += 1;
    }
  }

  /* ---- cross-street strands ----
   * The reference's far field is a lattice, not two clean lines: strands run
   * across the street as well as along it, and the crossings are what fill the
   * cluster at the vanishing point. Hung a tier above the rows so the two
   * longitudinal lines stay legible as the spine.
   */
  const crossZ = [];
  for (let z = -4; z >= -40; z -= 4) crossZ.push(z);
  const crossSag = 0.40;
  const crossHalf = 2.6;
  for (const z of crossZ) {
    // Jittered a little strand to strand so the lattice never reads as a grid.
    const crossAnchorY = 5.46 + rand() * 0.22;
    addWireSpan(root, -crossHalf, z, crossHalf, z, crossAnchorY, crossSag);
    const spanL = crossHalf * 2;
    const a = catenaryParam(spanL, crossSag);
    const jitter = (rand() - 0.5) * 0.34;
    for (const cx of [-1.30 + jitter, jitter * 0.5, 1.30 + jitter]) {
      const u = cx + crossHalf;
      const y = crossAnchorY - catenaryDrop(a, spanL, u);
      hangLantern(root, new THREE.Vector3(cx, y, z), {
        geo: geoWhite,
        mat: whiteMats[(Math.abs(cx) > 0 ? 2 : 0)],
        emitColor: MARKET.warmLight,
        emitIntensity: 0.9,
        kind: 'chochin',
        scale: 0.86,
        cord: 0.12,
      });
      whiteCount += 1;
    }
  }

  /* ---- oversized eaves lanterns, near camera ----
   * The reference's two biggest shapes are the lanterns clipped by the top
   * corners of the frame — they are hung off the buildings, not off the street
   * rows, which is why they sit both lower and much larger than anything in the
   * rows. Without them the near field has no large warm mass at all and the
   * frame loses its foreground anchor. Kept at 3.9-4.3 m, well clear of the
   * frontage lanterns at 2.4 m.
   */
  const BIG = 1.72; // ~0.60 m diameter — a shopfront lantern, not a row one
  const bigChochin = [
    [-3.20, 4.10, 3.0],
    [3.30, 4.05, 4.2],
    [3.25, 4.22, -2.4],
    [-3.15, 4.18, -6.0],
    [3.30, 4.00, -9.5],
    [-3.20, 4.08, -14.0],
  ];
  let bigCount = 0;
  for (const [bx, by, bz] of bigChochin) {
    // Short bracket back to the building line, so they read as hung off the
    // eaves rather than floating.
    const bracket = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(MARKET.frontageRight - Math.abs(bx)) + 0.3, 0.07, 0.07), fittingMat);
    bracket.position.set((bx < 0 ? -1 : 1) * (Math.abs(bx) + 0.28), by + 0.62, bz);
    root.add(bracket);

    hangLantern(root, new THREE.Vector3(bx, by + 0.60, bz), {
      geo: geoWhite,
      mat: whiteMats[bigCount % 3],
      emitColor: MARKET.warmLight,
      emitIntensity: 1.0,
      kind: 'chochin',
      scale: BIG,
      cord: 0.16,
    });
    whiteCount += 1;
    bigCount += 1;
  }

  /* ---- §4 the lower red set, right frontage side ----
   * frontage.js hangs its own red lanterns tight to the stalls at 2.4 m; these
   * are the street-spanning tier and stay above 3.5 m so the two never meet.
   */
  const redX = 3.15;
  const redAnchorY = 4.20;
  const redSag = 0.30;
  const redSpacing = 4.0;
  const redCountTarget = 11;
  const redSpanLanterns = 3;
  for (let s = 0; s * redSpanLanterns < redCountTarget; s += 1) {
    const z0 = ROW_Z0 - 2 - (s * redSpanLanterns - 0.5) * redSpacing;
    const z1 = ROW_Z0 - 2 - ((s + 1) * redSpanLanterns - 0.5) * redSpacing;
    addWireSpan(root, redX, z0, redX, z1, redAnchorY, redSag);
  }
  for (let i = 0; i < redCountTarget; i += 1) {
    const local = i % redSpanLanterns;
    const spanL = redSpanLanterns * redSpacing;
    const a = catenaryParam(spanL, redSag);
    const y = redAnchorY - catenaryDrop(a, spanL, (local + 0.5) * redSpacing);
    hangLantern(root, new THREE.Vector3(redX, y, ROW_Z0 - 2 - i * redSpacing), {
      geo: geoWhite,
      mat: redMat,
      emitColor: MARKET.redLight,
      emitIntensity: 1.0,
      // Distinct kind: lighting.js buckets emissive budgets by kind substring
      // and treats anything with "red" in it as an accent rather than as part
      // of the primary row source. Registering these as plain `chochin` would
      // put them on the row budget and let them be picked as row light anchors.
      kind: 'chochin-red',
      scale: 0.92,
      cord: 0.13,
    });
    redCount += 1;
  }

  /* ---- street-spanning signage ---- */

  const signMat = (seed) => new THREE.MeshStandardMaterial({
    map: signTexture(seed),
    emissive: new THREE.Color(0xffd7a0),
    emissiveMap: signTexture(seed),
    emissiveIntensity: 0.65,
    roughness: 0.85,
    metalness: 0,
  });
  const signFrameMat = new THREE.MeshStandardMaterial({ color: 0x1d1410, roughness: 0.9 });
  let signCount = 0;

  // Kept down the street and narrow. A wide sign near the camera lays a hard
  // horizontal band straight across the converging cone and flattens the depth
  // the rows are there to produce — the signage has to sit inside the
  // perspective, not across it.
  for (const [z, width, seed] of [[-16, 4.2, 0x51A1], [-30, 3.4, 0x51A2]]) {
    const y = 5.78;
    const panel = new THREE.Mesh(new THREE.BoxGeometry(width, 0.82, 0.10), signMat(seed));
    panel.position.set(0.15, y, z);
    root.add(panel);
    emissives.add(panel, { color: 0xffc98a, intensity: 0.55, kind: 'sign' });
    signCount += 1;

    const rail = new THREE.Mesh(new THREE.BoxGeometry(width + 1.4, 0.05, 0.05), signFrameMat);
    rail.position.set(0.15, y + 0.50, z);
    root.add(rail);
    for (const sx of [-1, 1]) {
      const hanger = new THREE.Mesh(cordGeo, fittingMat);
      hanger.scale.set(1, 0.48, 1);
      hanger.position.set(0.15 + sx * width * 0.42, y + 0.25, z);
      root.add(hanger);
    }
  }

  /* ---- banner strings ---- */

  const pennantColors = [0xf2e2c4, 0xe8452c, 0xffb347, 0xf2e2c4, 0xd8452c];
  const pennantMats = pennantColors.map((c) => new THREE.MeshStandardMaterial({
    color: c, roughness: 0.95, metalness: 0, side: THREE.DoubleSide,
    emissive: new THREE.Color(c), emissiveIntensity: 0.12,
  }));
  const pennantGeo = new THREE.PlaneGeometry(0.26, 0.34);
  let pennantCount = 0;

  // Kept well down the street: the reference's overhead is lanterns, not
  // bunting, so these read as background texture near the vanishing point
  // rather than as a foreground festoon.
  for (const z of [-23]) {
    const anchorY = 5.30;
    const sag = 0.34;
    const half = 3.2;
    addWireSpan(root, -half, z, half, z, anchorY, sag);
    const spanL = half * 2;
    const a = catenaryParam(spanL, sag);
    for (let i = 0; i < 17; i += 1) {
      const u = ((i + 0.5) / 17) * spanL;
      const y = anchorY - catenaryDrop(a, spanL, u);
      const flag = new THREE.Mesh(pennantGeo, pennantMats[i % pennantMats.length]);
      flag.position.set(-half + u, y - 0.19, z);
      flag.rotation.y = (rand() - 0.5) * 0.5;
      root.add(flag);
      pennantCount += 1;
    }
  }

  /* ---- gentle, deterministic sway ---- */

  // Driven off a fixed-step frame counter, NOT the wall clock `t` the loop
  // hands in. main.js flags the frame as capturable at a frame COUNT, so a
  // clock-driven sway puts every lantern at a slightly different angle in every
  // capture and no two runs of the same build match. A fixed step makes frame
  // 900 identical every time, which is the whole point of seeding the phases.
  const STEP = 1 / 60;
  let phase = 0;
  ctx.updaters.push(() => {
    phase += STEP;
    for (let i = 0; i < swayers.length; i += 1) {
      const s = swayers[i];
      s.node.rotation.x = Math.sin(phase * s.wx + s.px) * s.ax;
      s.node.rotation.z = Math.sin(phase * s.wz + s.pz) * s.az;
      s.node.rotation.y = Math.sin(phase * s.wy + s.py) * s.ay;
    }
  });

  const summary = {
    whiteChochin: whiteCount,
    redChochin: redCount,
    rows: MARKET.lanternRowX.length,
    perRow: MARKET.lanternCount,
    crossStrands: crossZ.length,
    signs: signCount,
    pennants: pennantCount,
  };
  ctx.lanternSummary = summary;
  document.body.dataset.marketLanterns = String(whiteCount + redCount);
  console.info('[night-market] lanterns', summary);

  return root;
}
