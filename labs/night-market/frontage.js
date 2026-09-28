// frontage.js — the right-side food-stall run. The dominant mass of the frame.
//
// SCOPE: plain Three.js. No ToonLab imports (see scene.js for why).
// OWNERSHIP: this file only. street.js / lanterns.js / dressing.js /
// lighting.js belong to other owners and are never touched from here.
//
// TARGET: launch-plan/ananta-refererence/11-night-market-street.png, and §3 of
// launch-plan/22-night-market-replica-spec.md.
//
// What the reference actually shows, and what this module therefore builds:
//
//  - The signage wall is WALL-TO-WALL. From roughly counter height up to the
//    eaves there is no bare surface: portrait poster panels butted edge to
//    edge, horizontal signboard bands above them, vertical banner strips above
//    those. Density is the whole reason the frame reads as a real place.
//  - It LAYERS in depth: lit interior -> counter and goods -> noren hanging in
//    front of the counter -> crates and boards spilling forward into the
//    walkway. Nothing sits on a tidy frontage line; the clutter comes out
//    roughly a metre past the building face.
//  - The crate stacks at the kerb are the only large cool mass in the frame —
//    teal, slate-blue and yellow plastic against an otherwise wholly warm
//    field. They carry most of spec §9's 5% teal budget by themselves.
//
// ORIGINALITY (spec §0, non-negotiable): full visual density, invented marks
// only. Every glyph here is procedurally assembled from bars, boxes, dots and
// strokes by `drawGlyph`. Nothing reproduces a shop name, logo or poster text
// from the reference. Matching size, spacing, colour and contrast gives the
// same read at frame scale, which is all the frame needs.
//
// PERFORMANCE NOTE: the poster wall is built from a small pool of wide "strip"
// canvas textures — each strip is a packed collage of ~14 individual posters —
// applied one plane per bay per band. That is what makes genuine wall-to-wall
// density affordable. Real three-dimensional boards are then layered on top in
// smaller numbers, because those are what sell parallax and silhouette.

import * as THREE from 'three';

/* ------------------------------------------------------------------ shared */
/* One unit primitive of each kind, scaled per instance, so geometry count
   stays flat however many hundred boards end up on the wall. */
const G_BOX = new THREE.BoxGeometry(1, 1, 1);
const G_PLANE = new THREE.PlaneGeometry(1, 1);
const G_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 16);
const G_CYL_LO = new THREE.CylinderGeometry(0.5, 0.5, 1, 10);
const G_SPHERE = new THREE.SphereGeometry(0.5, 12, 9);

/** Plane rotation that puts the face normal at -X, i.e. looking into the street. */
const FACE_STREET = -Math.PI / 2;

const pick = (arr, rand) => arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))];
const between = (rand, a, b) => a + rand() * (b - a);

/* -------------------------------------------------------------- 2D helpers */

function canvas2d(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

function texture(canvas, { repeatX = 1, offsetX = 0 } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.wrapS = THREE.RepeatWrapping;
  t.repeat.x = repeatX;
  t.offset.x = offsetX;
  return t;
}

/**
 * An invented glyph-like mark. Strokes are assembled from primitives that share
 * the visual grammar of dense shop signage — dominant horizontals, a couple of
 * verticals, an enclosing box, an occasional diagonal or dot — without forming,
 * or attempting to form, any real character. This is the whole of the signage
 * "text" in the module.
 */
function drawGlyph(g, cx, cy, s, rand) {
  const half = s * 0.5;
  g.lineWidth = Math.max(1.4, s * 0.13);
  g.lineCap = 'butt';
  const strokes = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < strokes; i += 1) {
    const k = rand();
    if (k < 0.32) {
      const y = cy - half + s * between(rand, 0.12, 0.88);
      const w = s * between(rand, 0.45, 0.95);
      g.beginPath();
      g.moveTo(cx - w / 2, y);
      g.lineTo(cx + w / 2, y);
      g.stroke();
    } else if (k < 0.58) {
      const x = cx - half + s * between(rand, 0.14, 0.86);
      const h = s * between(rand, 0.4, 0.95);
      g.beginPath();
      g.moveTo(x, cy - h / 2);
      g.lineTo(x, cy + h / 2);
      g.stroke();
    } else if (k < 0.74) {
      const w = s * between(rand, 0.5, 0.86);
      const h = s * between(rand, 0.45, 0.86);
      g.strokeRect(cx - w / 2, cy - h / 2, w, h);
    } else if (k < 0.88) {
      const d = s * between(rand, 0.28, 0.5);
      const sx = cx + (rand() - 0.5) * s * 0.4;
      const sy = cy + (rand() - 0.5) * s * 0.4;
      g.beginPath();
      g.moveTo(sx - d / 2, sy - d / 2);
      g.lineTo(sx + d / 2, sy + d / 2);
      g.stroke();
    } else {
      g.beginPath();
      g.arc(cx + (rand() - 0.5) * s * 0.4, cy + (rand() - 0.5) * s * 0.4, s * 0.11, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/** A vertical run of glyphs — the dominant layout on the reference's panels. */
function glyphColumn(g, cx, top, bottom, s, rand, ink) {
  g.strokeStyle = ink;
  g.fillStyle = ink;
  const step = s * 1.18;
  for (let y = top + s * 0.6; y < bottom - s * 0.3; y += step) drawGlyph(g, cx, y, s, rand);
}

function glyphRow(g, left, right, cy, s, rand, ink) {
  g.strokeStyle = ink;
  g.fillStyle = ink;
  const step = s * 1.18;
  for (let x = left + s * 0.6; x < right - s * 0.3; x += step) drawGlyph(g, x, cy, s, rand);
}

/** A stand-in for the reference's food photography: a warm abstract colour field. */
function foodPhoto(g, x, y, w, h, rand) {
  g.fillStyle = pick(['#4a2a18', '#3a2418', '#53301a'], rand);
  g.fillRect(x, y, w, h);
  const blobs = 5 + Math.floor(rand() * 6);
  for (let i = 0; i < blobs; i += 1) {
    const r = Math.min(w, h) * between(rand, 0.14, 0.36);
    const bx = x + between(rand, 0.18, 0.82) * w;
    const by = y + between(rand, 0.2, 0.82) * h;
    const hot = pick(['#ffb457', '#f4762c', '#e8dc9a', '#d9452a', '#f0a06a', '#c8d68a'], rand);
    const grad = g.createRadialGradient(bx, by, r * 0.1, bx, by, r);
    grad.addColorStop(0, hot);
    grad.addColorStop(1, `${hot}00`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(bx, by, r, 0, Math.PI * 2);
    g.fill();
  }
  // Plate rim, so the field reads as a photographed dish rather than noise.
  if (rand() < 0.7) {
    g.strokeStyle = '#f6e9c8';
    g.lineWidth = Math.max(2, h * 0.02);
    g.beginPath();
    g.ellipse(x + w * 0.5, y + h * 0.62, w * 0.34, h * 0.2, 0, 0, Math.PI * 2);
    g.stroke();
  }
}

/* --------------------------------------------------------- poster palettes */
/* bg, ink, accent. Read off the reference: cream grounds with red and
   near-black marks dominate, punctuated by saturated orange, yellow and red
   fields. Spec §9 wants ~45% warm amber/orange and ~8% red across the frame. */
const POSTER_SETS = [
  ['#f3e7cf', '#c3211a', '#241812'],
  ['#f6efdd', '#241812', '#d2461c'],
  ['#ff8420', '#2a1408', '#ffe7b4'],
  ['#ffc51f', '#26160a', '#c3211a'],
  ['#cf2418', '#ffe7b4', '#ffc51f'],
  ['#eee0c2', '#8c1410', '#e07a1e'],
  ['#1e1610', '#ffc51f', '#ff8420'],
  ['#e8541c', '#fff2d4', '#ffc51f'],
  ['#f7f1e2', '#1d4f6e', '#c3211a'],
  ['#b5150f', '#ffe7b4', '#f6efdd'],
  ['#d81f14', '#fff2d4', '#ffc51f'],
  ['#fdf6e6', '#d81f14', '#ff8420'],
];

/* ------------------------------------------------- non-warm panel palette */
/* AUDIT D2 — the module's largest colour defect, and a spec bug rather than a
 * build bug. §9's colour table omitted the reference's multi-hue panel strips
 * entirely, so the first pass built to a warm-only budget: 72% of this file's
 * colour landed inside a single 15-degree hue slice and non-warm pixels came
 * out at 1.31% against the reference's 16.6%.
 *
 * The reference's poster walls, upper storeys and banner runs are shot through
 * with green, cyan, blue, violet, magenta, pure yellow, plain white and
 * navy-black faces, interleaved with the red and orange rather than replacing
 * it. These sets restore that. Same [bg, ink, accent] grammar as POSTER_SETS,
 * same invented marks, non-warm faces — roughly one panel in four is drawn from
 * here, weighted toward the upper storeys where the reference concentrates them.
 *
 * These MUST be registered with CHROMA_TINT rather than the warm registration
 * colour used elsewhere: lighting.js copies the registered colour straight onto
 * the material's emissive, so a warm tint multiplies the green and blue back
 * out of the face and the monoculture survives the change. */
/* Set counts are the hue mix, so they are the tuning dial. Measured against the
 * reference after the first pass: green came out 2.3% against its 0.9% and
 * violet 0.7% against its 4.7%, so green loses a set and violet/magenta gain
 * three between them. The violets are also pulled deliberately BLUE-ward —
 * 2700 K light on a violet albedo adds red faster than blue and walks the hue
 * out of the 260-345 band into the reds, which is where the first pass lost
 * most of them. */
const CHROMA_SETS = [
  ['#17843f', '#f2f6e8', '#ffd21a'],   // green ~145
  ['#2fa050', '#12210f', '#fff2c0'],
  ['#0f8ba6', '#f0fbff', '#ffd21a'],   // cyan ~190
  ['#1d4fb0', '#f4f7ff', '#ffd21a'],   // blue ~220
  ['#2a63c8', '#0d1424', '#fff2c0'],
  ['#5a2fc0', '#f6eeff', '#ffd21a'],   // violet ~262
  ['#6b3ad8', '#f2e8ff', '#f2f2ee'],
  ['#7d46e0', '#160c28', '#fff2c0'],
  ['#5836b0', '#f6eeff', '#f2f2ee'],
  ['#a8248a', '#fff0f8', '#ffd21a'],   // magenta ~312
  ['#cf3f9e', '#fff2fa', '#f2f2ee'],
  ['#b62c9e', '#1a0a16', '#ffd21a'],
  ['#f2d21a', '#16200c', '#1d4fb0'],   // pure yellow ~52 — the reference runs
  ['#ffe23a', '#1a1608', '#17843f'],   // 2.2% of its upper storeys at this hue
  ['#f5cf10', '#1a1206', '#c3211a'],
  ['#ffd830', '#16200c', '#5a2fc0'],
  ['#f2f2ee', '#16203a', '#1d4fb0'],   // plain white
  ['#eef1f2', '#101a30', '#17843f'],
  ['#111b32', '#f2f2ee', '#ffd21a'],   // navy-black hanging banner
  ['#16203a', '#eef1f2', '#2fa050'],
];

/**
 * Pick a panel colour set. `chroma` is the probability that this one face comes
 * out non-warm. Every sheet maker takes it, so the mix is set once per texture
 * pool rather than being scattered through the build.
 */
const pickSet = (rand, chroma = 0) =>
  (chroma > 0 && rand() < chroma ? pick(CHROMA_SETS, rand) : pick(POSTER_SETS, rand));

/**
 * One packed poster-wall strip: a collage of portrait panels butted edge to
 * edge across the full canvas width with only a dark hairline between them.
 * This is the texture that makes the wall read wall-to-wall.
 */
function makePosterStrip(rand, { w = 2048, h = 560, chroma = 0 } = {}) {
  const [c, g] = canvas2d(w, h);
  // Dark substrate — the slivers that show between panels read as shadowed wall.
  g.fillStyle = '#150e09';
  g.fillRect(0, 0, w, h);

  let x = 0;
  while (x < w) {
    // ~0.085–0.16 of a bay wide, which at a 3.6 m bay is a 0.3–0.6 m board:
    // the size the reference's panels actually are.
    const pw = Math.round(between(rand, w * 0.085, w * 0.16));
    const pad = Math.round(between(rand, 1, 4));
    const top = Math.round(between(rand, 0, h * 0.1));
    const bot = Math.round(h - between(rand, 0, h * 0.12));
    const ph = bot - top;
    const [bg, ink, accent] = pickSet(rand, chroma);

    g.fillStyle = bg;
    g.fillRect(x + pad, top, pw - pad * 2, ph);

    const ix = x + pad;
    const iw = pw - pad * 2;
    const kind = rand();

    if (kind < 0.26) {
      // Photo-led panel: image plate above, glyph block below.
      const imgH = ph * between(rand, 0.42, 0.62);
      foodPhoto(g, ix + iw * 0.06, top + ph * 0.06, iw * 0.88, imgH, rand);
      glyphColumn(g, ix + iw * 0.5, top + ph * 0.08 + imgH, bot, iw * 0.3, rand, ink);
    } else if (kind < 0.5) {
      // Header band over a dense glyph column — the commonest panel.
      g.fillStyle = accent;
      g.fillRect(ix, top, iw, ph * between(rand, 0.1, 0.19));
      glyphRow(g, ix, ix + iw, top + ph * 0.08, iw * 0.2, rand, bg);
      glyphColumn(g, ix + iw * 0.34, top + ph * 0.2, bot, iw * 0.36, rand, ink);
      glyphColumn(g, ix + iw * 0.74, top + ph * 0.24, bot - ph * 0.06, iw * 0.22, rand, accent);
    } else if (kind < 0.68) {
      // Two glyph columns with a price-block cluster low down.
      glyphColumn(g, ix + iw * 0.28, top + ph * 0.04, bot - ph * 0.24, iw * 0.34, rand, ink);
      glyphColumn(g, ix + iw * 0.7, top + ph * 0.08, bot - ph * 0.24, iw * 0.28, rand, accent);
      const blocks = 2 + Math.floor(rand() * 3);
      for (let b = 0; b < blocks; b += 1) {
        g.fillStyle = b % 2 ? accent : ink;
        g.fillRect(ix + iw * 0.08, bot - ph * 0.22 + b * ph * 0.06,
          iw * between(rand, 0.4, 0.84), ph * 0.045);
      }
    } else if (kind < 0.84) {
      // One big mark over a colour field — high contrast at distance.
      g.fillStyle = accent;
      g.fillRect(ix + iw * 0.1, top + ph * 0.08, iw * 0.8, ph * 0.5);
      g.strokeStyle = bg;
      g.fillStyle = bg;
      drawGlyph(g, ix + iw * 0.5, top + ph * 0.33, iw * 0.56, rand);
      glyphColumn(g, ix + iw * 0.5, top + ph * 0.6, bot, iw * 0.3, rand, ink);
    } else {
      // Menu-strip panel: stacked rules with paired marks.
      const rows = 5 + Math.floor(rand() * 5);
      for (let r = 0; r < rows; r += 1) {
        const ry = top + ph * (0.08 + (r * 0.86) / rows);
        g.strokeStyle = ink;
        g.fillStyle = ink;
        drawGlyph(g, ix + iw * 0.26, ry, iw * 0.2, rand);
        drawGlyph(g, ix + iw * 0.5, ry, iw * 0.2, rand);
        g.fillStyle = accent;
        g.fillRect(ix + iw * 0.68, ry - ph * 0.012, iw * between(rand, 0.1, 0.24), ph * 0.024);
      }
    }

    // Panel edge — the hairline that makes the packing read as separate boards.
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 2;
    g.strokeRect(ix + 1, top + 1, iw - 2, ph - 2);
    x += pw;
  }
  return c;
}

/**
 * Eave fascia band: horizontal signboards in a continuous run — the layer
 * between the poster wall and the upper storeys.
 */
function makeFasciaStrip(rand, { w = 2048, h = 256, chroma = 0 } = {}) {
  const [c, g] = canvas2d(w, h);
  g.fillStyle = '#1b1209';
  g.fillRect(0, 0, w, h);
  let x = 0;
  while (x < w) {
    const bw = Math.round(between(rand, w * 0.1, w * 0.24));
    const [bg, ink, accent] = pickSet(rand, chroma);
    const inset = Math.round(h * between(rand, 0.05, 0.16));
    g.fillStyle = bg;
    g.fillRect(x + 3, inset, bw - 6, h - inset * 2);
    if (rand() < 0.55) {
      g.fillStyle = accent;
      g.fillRect(x + 3, inset, bw - 6, (h - inset * 2) * 0.18);
    }
    glyphRow(g, x + bw * 0.08, x + bw * 0.94, h * 0.55, (h - inset * 2) * 0.5, rand, ink);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 3;
    g.strokeRect(x + 4, inset + 1, bw - 8, h - inset * 2 - 2);
    x += bw;
  }
  return c;
}

/**
 * Upper-storey band: tall vertical banner boards and window-sized sign panels
 * over a dark facade. Unlike the eye-level band the reference does let the
 * building breathe a little up here, so bare stretches are allowed.
 */
function makeUpperStrip(rand, { w = 2048, h = 768, chroma = 0 } = {}) {
  const [c, g] = canvas2d(w, h);
  g.fillStyle = '#241812';
  g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(255,190,130,0.05)';
  g.lineWidth = 2;
  for (let y = 0; y < h; y += 46) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  let x = 0;
  // Slot-type odds. The original 0.78 / 0.14 / 0.08 split is preserved exactly
  // when chroma is off; the slat run takes its share off the top so the warm
  // pool renders identically to before.
  const slatChance = chroma * 0.5;
  const rest = 1 - slatChance;
  while (x < w) {
    const slot = Math.round(between(rand, w * 0.05, w * 0.13));
    const roll = rand();
    if (roll < slatChance) {
      /* THE COLOUR-SLAT RUN — audit D2. The reference's upper storeys are not
         scattered boards on a dark wall; they are continuous runs of tall,
         narrow, fully saturated slats butted edge to edge in green, blue,
         violet, magenta, yellow, white and red. That run is the single largest
         non-warm area in the reference frame and this build had no equivalent
         at all. It is also the cheapest one to carry, because it is flat colour
         on a texture already being drawn. */
      const slats = 3 + Math.floor(rand() * 5);
      const sw = slot / slats;
      const runTop = h * between(rand, 0, 0.07);
      const runBot = h * between(rand, 0.66, 0.99);
      for (let s = 0; s < slats; s += 1) {
        // A minority stay warm, so the run interleaves rather than reading as
        // a separate rainbow band pasted over the frontage.
        const [bg, ink] = rand() < 0.78 ? pick(CHROMA_SETS, rand) : pick(POSTER_SETS, rand);
        const sx = x + s * sw;
        const st = runTop + h * between(rand, 0, 0.07);
        const sb = runBot - h * between(rand, 0, 0.12);
        if (sb - st < h * 0.2) continue;
        g.fillStyle = bg;
        g.fillRect(sx + 1, st, sw - 2, sb - st);
        glyphColumn(g, sx + sw * 0.5, st, sb, sw * 0.6, rand, ink);
        g.strokeStyle = 'rgba(0,0,0,0.45)';
        g.lineWidth = 2;
        g.strokeRect(sx + 1, st, sw - 2, sb - st);
      }
    } else if (roll < slatChance + 0.78 * rest) {
      const [bg, ink, accent] = pickSet(rand, chroma);
      const tall = rand() < 0.55;
      const bw = tall ? slot * between(rand, 0.3, 0.5) : slot * between(rand, 0.72, 0.94);
      const bh = tall ? h * between(rand, 0.5, 0.86) : h * between(rand, 0.16, 0.34);
      const bx = x + (slot - bw) * 0.5;
      const by = h * between(rand, 0.02, 0.14);
      g.fillStyle = bg;
      g.fillRect(bx, by, bw, bh);
      if (tall) glyphColumn(g, bx + bw * 0.5, by, by + bh, bw * 0.66, rand, ink);
      else glyphRow(g, bx, bx + bw, by + bh * 0.5, bh * 0.55, rand, ink);
      g.fillStyle = accent;
      g.fillRect(bx, by, bw, Math.max(3, bh * 0.06));
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 3;
      g.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      // Vertical stacking of boards is constant in the reference's upper storeys.
      if (rand() < 0.55) {
        const [b2, i2] = pickSet(rand, chroma);
        const y2 = by + bh + h * 0.03;
        const h2 = Math.min(h - y2 - 4, h * 0.22);
        if (h2 > h * 0.07) {
          g.fillStyle = b2;
          g.fillRect(bx - bw * 0.2, y2, bw * 1.4, h2);
          glyphRow(g, bx - bw * 0.2, bx + bw * 1.2, y2 + h2 * 0.5, h2 * 0.6, rand, i2);
        }
      }
    } else if (roll < slatChance + 0.92 * rest) {
      // Warm interior window.
      const ww = slot * 0.6;
      const wh = h * between(rand, 0.2, 0.36);
      const wx = x + (slot - ww) * 0.5;
      const wy = h * between(rand, 0.1, 0.45);
      const grad = g.createLinearGradient(0, wy, 0, wy + wh);
      grad.addColorStop(0, '#ffcf8a');
      grad.addColorStop(1, '#c07526');
      g.fillStyle = grad;
      g.fillRect(wx, wy, ww, wh);
      g.strokeStyle = '#191009';
      g.lineWidth = 5;
      g.strokeRect(wx, wy, ww, wh);
    }
    x += slot;
  }
  return c;
}

/** Noren ground with one large invented motif per curtain. */
function makeNorenSheet(rand, { w = 1024, h = 384 } = {}) {
  const [c, g] = canvas2d(w, h);
  const ground = pick(['#cdba93', '#d8c8a4', '#c3ae87', '#e0d4b6', '#b9a37c'], rand);
  g.fillStyle = ground;
  g.fillRect(0, 0, w, h);
  // Woven weft, so the cloth is not a flat colour chip close up.
  g.strokeStyle = 'rgba(0,0,0,0.05)';
  g.lineWidth = 1;
  for (let y = 0; y < h; y += 5) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  g.fillStyle = 'rgba(0,0,0,0.14)';
  g.fillRect(0, 0, w, h * 0.07);

  const ink = rand() < 0.7 ? '#f4ecd8' : '#2b2118';
  const motifs = 2 + Math.floor(rand() * 2);
  for (let i = 0; i < motifs; i += 1) {
    const s = Math.min(w / motifs, h) * 0.62;
    drawMotif(g, w * ((i + 0.5) / motifs), h * 0.55, s, rand, ink, -1, ground);
  }
  if (rand() < 0.6) glyphColumn(g, w * 0.05, h * 0.2, h * 0.9, h * 0.14, rand, ink);
  return c;
}

/**
 * Large simple silhouette for a noren. Deliberately generic natural forms — a
 * fish, a wave, a leaf, a bowl of steam, a fan — none of which is a mark taken
 * from the reference.
 */
function drawMotif(g, cx, cy, s, rand, ink, forceKind = -1, ground = '#c8bfa4') {
  g.fillStyle = ink;
  g.strokeStyle = ink;
  g.lineWidth = Math.max(2, s * 0.05);
  /* The internal cut marks — a fish's eye and gills, a leaf's midrib, a fan's
     ribs — are painted in the CLOTH's own colour rather than composited out.
     `destination-out` punches real transparency into the canvas, and a
     CanvasTexture used as map + emissiveMap on an opaque material carries zero
     RGB wherever alpha is zero: every cut mark rendered as a solid BLACK line.
     On the far noren that read as ink; at a metre from camera on the big near
     noren it read as holes in the middle of the one pale mass the frame is
     leaning on. `ground` is that cloth colour. */
  const cut = () => { g.fillStyle = ground; g.strokeStyle = ground; };
  const mark = () => { g.fillStyle = ink; g.strokeStyle = ink; };
  // `forceKind` exists for the big near noren, which needs the SOLID forms:
  // kind 1 is a stroked-arc mark and at a metre from camera it reads as a
  // scratch rather than as the bold white shape the reference carries.
  const kind = forceKind >= 0 ? forceKind : Math.floor(rand() * 5);
  if (kind === 0) {
    g.beginPath();
    g.ellipse(cx, cy, s * 0.4, s * 0.21, 0, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(cx - s * 0.34, cy);
    g.lineTo(cx - s * 0.56, cy - s * 0.2);
    g.lineTo(cx - s * 0.56, cy + s * 0.2);
    g.closePath();
    g.fill();
    cut();
    g.beginPath();
    g.arc(cx + s * 0.24, cy - s * 0.04, s * 0.045, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = s * 0.035;
    for (let i = 0; i < 4; i += 1) {
      g.beginPath();
      g.arc(cx + s * (0.02 - i * 0.1), cy + s * 0.02, s * 0.1, -0.9, 0.9);
      g.stroke();
    }
    mark();
  } else if (kind === 1) {
    for (let i = 0; i < 3; i += 1) {
      g.lineWidth = s * 0.06;
      g.beginPath();
      g.arc(cx, cy + s * 0.2, s * (0.18 + i * 0.14), Math.PI * 1.08, Math.PI * 1.92);
      g.stroke();
    }
  } else if (kind === 2) {
    g.beginPath();
    g.moveTo(cx, cy - s * 0.42);
    g.quadraticCurveTo(cx + s * 0.36, cy, cx, cy + s * 0.42);
    g.quadraticCurveTo(cx - s * 0.36, cy, cx, cy - s * 0.42);
    g.fill();
    cut();
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.moveTo(cx, cy - s * 0.36);
    g.lineTo(cx, cy + s * 0.36);
    g.stroke();
    mark();
  } else if (kind === 3) {
    g.beginPath();
    g.arc(cx, cy + s * 0.05, s * 0.36, 0, Math.PI);
    g.fill();
    g.fillRect(cx - s * 0.42, cy + s * 0.02, s * 0.84, s * 0.06);
    g.lineWidth = s * 0.05;
    for (let i = -1; i <= 1; i += 1) {
      g.beginPath();
      g.moveTo(cx + i * s * 0.17, cy - s * 0.14);
      g.quadraticCurveTo(cx + i * s * 0.17 + s * 0.1, cy - s * 0.3, cx + i * s * 0.17, cy - s * 0.44);
      g.stroke();
    }
  } else {
    g.beginPath();
    g.moveTo(cx, cy + s * 0.34);
    g.arc(cx, cy + s * 0.34, s * 0.46, Math.PI * 1.18, Math.PI * 1.82);
    g.closePath();
    g.fill();
    cut();
    g.lineWidth = s * 0.03;
    for (let i = -2; i <= 2; i += 1) {
      g.beginPath();
      g.moveTo(cx, cy + s * 0.34);
      g.lineTo(cx + i * s * 0.16, cy - s * 0.1);
      g.stroke();
    }
    mark();
  }
}

/**
 * Narrow vertical hanging banner, ~0.4 x 1.8 m. White / red / yellow warm, or
 * — audit D2 — green, blue, violet, plain white and the navy-black type the
 * reference hangs off its upper storeys, which this module had none of.
 */
function makeBannerSheet(rand, { w = 128, h = 576, chroma = 0 } = {}) {
  const [c, g] = canvas2d(w, h);
  const [bg, ink, accent] = chroma > 0 && rand() < chroma ? pick(CHROMA_SETS, rand) : pick([
    ['#f3ead6', '#c3211a', '#241812'],
    ['#f6efdd', '#241812', '#c3211a'],
    ['#cf2418', '#ffe7b4', '#ffc51f'],
    ['#ffc51f', '#26160a', '#cf2418'],
    ['#f7f1e2', '#8c1410', '#e07a1e'],
    ['#fbf4e4', '#b5150f', '#ff8420'],
  ], rand);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(0, 0, w, h * 0.055);
  g.fillRect(0, h * 0.945, w, h * 0.055);
  if (rand() < 0.5) {
    g.fillRect(0, 0, w * 0.1, h);
    g.fillRect(w * 0.9, 0, w * 0.1, h);
  }
  glyphColumn(g, w * 0.5, h * 0.08, h * 0.92, w * 0.62, rand, ink);
  return c;
}

/** Menu board / lightbox face: rows of paired marks with price blocks. */
function makeMenuSheet(rand, { w = 512, h = 320, chroma = 0 } = {}) {
  const [c, g] = canvas2d(w, h);
  const [bg, ink, accent] = pickSet(rand, chroma);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(0, 0, w, h * 0.16);
  glyphRow(g, w * 0.04, w * 0.96, h * 0.08, h * 0.13, rand, bg);
  const rows = 4 + Math.floor(rand() * 4);
  for (let r = 0; r < rows; r += 1) {
    const y = h * (0.26 + (r * 0.7) / rows);
    g.strokeStyle = ink;
    g.fillStyle = ink;
    drawGlyph(g, w * 0.12, y, h * 0.11, rand);
    drawGlyph(g, w * 0.26, y, h * 0.11, rand);
    drawGlyph(g, w * 0.4, y, h * 0.11, rand);
    g.fillStyle = accent;
    g.fillRect(w * 0.62, y - h * 0.03, w * between(rand, 0.1, 0.3), h * 0.06);
  }
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 6;
  g.strokeRect(3, 3, w - 6, h - 6);
  return c;
}

/** Tall projecting blade sign face — a single column of large marks. */
function makeBladeSheet(rand, { w = 160, h = 640, chroma = 0 } = {}) {
  const [c, g] = canvas2d(w, h);
  const [bg, ink, accent] = pickSet(rand, chroma);
  g.fillStyle = bg;
  g.fillRect(0, 0, w, h);
  g.fillStyle = accent;
  g.fillRect(0, 0, w * 0.09, h);
  g.fillRect(w * 0.91, 0, w * 0.09, h);
  glyphColumn(g, w * 0.5, h * 0.04, h * 0.96, w * 0.66, rand, ink);
  return c;
}

/** A-frame sandwich-board face — warm orange ground, illustration, glyph block. */
function makeAframeSheet(rand, { w = 448, h = 640 } = {}) {
  const [c, g] = canvas2d(w, h);
  g.fillStyle = '#f6ead0';
  g.fillRect(0, 0, w, h);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ffa63a');
  grad.addColorStop(1, '#ef6d21');
  g.fillStyle = grad;
  g.fillRect(w * 0.05, h * 0.04, w * 0.9, h * 0.92);
  g.strokeStyle = '#8a3c10';
  g.lineWidth = 6;
  g.strokeRect(w * 0.05, h * 0.04, w * 0.9, h * 0.92);
  glyphRow(g, w * 0.12, w * 0.88, h * 0.14, h * 0.075, rand, '#3a1808');
  foodPhoto(g, w * 0.12, h * 0.26, w * 0.76, h * 0.42, rand);
  glyphRow(g, w * 0.12, w * 0.88, h * 0.76, h * 0.07, rand, '#3a1808');
  g.fillStyle = '#c3211a';
  g.fillRect(w * 0.2, h * 0.84, w * 0.6, h * 0.06);
  glyphRow(g, w * 0.22, w * 0.78, h * 0.87, h * 0.045, rand, '#ffe7b4');
  return c;
}

/* ------------------------------------------- the near-right pale mass (D1) */
/* The audit's highest-impact defect. Across x 88–100% of frame the reference
 * holds a median of L 103.9 with 2.5% near-black; this build measured median
 * L 7.0 with 61.1% near-black — a hole in the most-looked-at corner of the
 * composition. The reference does it with ONE large pale shape a metre from
 * camera, not with more small ones, and the density audit is explicit that the
 * right frontage is already 1.18–1.31x busier than the target. So these two
 * sheets are large, simple and pale by construction: the cloth carries three
 * big white motifs on a desaturated olive-grey ground, the board a cream field
 * inside a gold frame. Both are authored light because they sit in a part of
 * frame with no practical light of its own. */

/** The big near-camera noren: olive-grey ground, three large white motifs. */
function makeBigNorenSheet(rand, { w = 1536, h = 576 } = {}) {
  const [c, g] = canvas2d(w, h);
  // Measured off the reference's lit part (~R120 G120 B105) and lifted, since
  // this cloth's job is to HOLD a midtone in a column that currently collapses.
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#ddd2b2');
  grad.addColorStop(0.55, '#cabf9e');
  grad.addColorStop(1, '#a49a7c');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // Weave, so a mass this close to camera is not a flat colour chip.
  g.strokeStyle = 'rgba(60,58,48,0.05)';
  g.lineWidth = 1;
  for (let y = 0; y < h; y += 4) {
    g.beginPath();
    g.moveTo(0, y);
    g.lineTo(w, y);
    g.stroke();
  }
  // Rod pocket at the head.
  g.fillStyle = 'rgba(40,38,30,0.16)';
  g.fillRect(0, 0, w, h * 0.09);
  // Three large motifs, big enough to read as shapes at ~18% of frame width.
  // Solid forms only — see drawMotif's forceKind note.
  const ink = '#f7f6ef';
  const solid = [0, 2, 3, 4];
  for (let i = 0; i < 3; i += 1) {
    drawMotif(g, w * ((i + 0.5) / 3), h * (0.5 + (i % 2 ? -0.04 : 0.04)),
      Math.min(w / 3, h) * 0.66, rand, ink, solid[Math.floor(rand() * solid.length)], '#cabf9e');
  }
  // Faint seams where the cloth panels are stitched together.
  g.strokeStyle = 'rgba(50,48,38,0.18)';
  g.lineWidth = 3;
  for (let i = 1; i < 3; i += 1) {
    g.beginPath();
    g.moveTo((w * i) / 3, h * 0.02);
    g.lineTo((w * i) / 3, h);
    g.stroke();
  }
  return c;
}

/** The big near-camera A-frame face: pale cream field in a gold frame. */
function makeBigAframeSheet(rand, { w = 640, h = 900 } = {}) {
  const [c, g] = canvas2d(w, h);
  g.fillStyle = '#4a3a24';
  g.fillRect(0, 0, w, h);
  // Gold frame, wide enough to read as a frame at a metre and a half.
  const frame = g.createLinearGradient(0, 0, w, h);
  frame.addColorStop(0, '#ffd487');
  frame.addColorStop(0.5, '#e8a83f');
  frame.addColorStop(1, '#b8791f');
  g.fillStyle = frame;
  g.fillRect(w * 0.03, h * 0.02, w * 0.94, h * 0.96);
  // Warm illuminated field — this is the part that has to hold the frame edge.
  const field = g.createLinearGradient(0, h * 0.08, 0, h * 0.92);
  field.addColorStop(0, '#ffedbe');
  field.addColorStop(0.45, '#fbd88f');
  field.addColorStop(1, '#eeb964');
  g.fillStyle = field;
  g.fillRect(w * 0.09, h * 0.08, w * 0.82, h * 0.84);
  // Invented illustration: a ribboned box under a burst of confetti, in the
  // reference's pink-and-gold register. No mark is taken from the reference.
  const cx = w * 0.5;
  const cy = h * 0.58;
  const s = w * 0.48;
  for (let i = 0; i < 34; i += 1) {
    g.fillStyle = pick(['#f6c463', '#d8607f', '#fff2cc', '#e8a6bc', '#c98a2c', '#ffffff'], rand);
    const a = rand() * Math.PI * 2;
    const d = s * between(rand, 0.5, 1.25);
    g.beginPath();
    g.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.95, s * between(rand, 0.02, 0.06),
      0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = '#fff4e2';
  g.beginPath();
  g.ellipse(cx, cy - s * 0.02, s * 0.66, s * 0.62, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#d4526f';
  g.fillRect(cx - s * 0.44, cy - s * 0.18, s * 0.88, s * 0.66);
  g.fillStyle = '#e87f97';
  g.fillRect(cx - s * 0.44, cy - s * 0.36, s * 0.88, s * 0.2);
  g.fillStyle = '#fbe3a8';
  g.fillRect(cx - s * 0.08, cy - s * 0.36, s * 0.16, s * 0.84);
  g.fillRect(cx - s * 0.44, cy - s * 0.02, s * 0.88, s * 0.09);
  g.strokeStyle = '#fbe3a8';
  g.lineWidth = s * 0.06;
  g.beginPath();
  g.arc(cx - s * 0.15, cy - s * 0.46, s * 0.14, 0.2, Math.PI * 1.6);
  g.stroke();
  g.beginPath();
  g.arc(cx + s * 0.15, cy - s * 0.46, s * 0.14, Math.PI * 1.4, Math.PI * 2.8);
  g.stroke();
  // Header block and footer rule, so the board carries the same signage
  // grammar as the rest of the run rather than reading as a bare picture.
  g.fillStyle = '#c3211a';
  g.fillRect(w * 0.13, h * 0.105, w * 0.74, h * 0.085);
  glyphRow(g, w * 0.16, w * 0.84, h * 0.148, h * 0.06, rand, '#ffeeca');
  glyphRow(g, w * 0.18, w * 0.82, h * 0.885, h * 0.032, rand, '#7a4a12');
  return c;
}

/* --------------------------------------------------------------- materials */

const standard = (opts) =>
  new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02, ...opts });

/** Textured, self-lit board. Always registered with the shared emissive registry. */
const litBoard = (tex, { intensity = 0.9, tint = 0xffffff, side = THREE.FrontSide } = {}) =>
  standard({
    map: tex,
    emissive: new THREE.Color(tint),
    emissiveMap: tex,
    emissiveIntensity: intensity,
    roughness: 0.86,
    side,
  });

/* ------------------------------------------------------------- mesh makers */

function box(parent, mat, w, h, d, x, y, z) {
  const m = new THREE.Mesh(G_BOX, mat);
  m.scale.set(w, h, d);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A plane on the frontage facing into the street. Its width runs along Z. */
function wallPanel(parent, mat, w, h, x, y, z) {
  const m = new THREE.Mesh(G_PLANE, mat);
  m.scale.set(w, h, 1);
  m.rotation.y = FACE_STREET;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/** A plane facing down the street toward camera (+Z), or away when flipped. */
function bladePanel(parent, mat, w, h, x, y, z, flip = false) {
  const m = new THREE.Mesh(G_PLANE, mat);
  m.scale.set(w, h, 1);
  m.rotation.y = flip ? Math.PI : 0;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function cyl(parent, mat, r, h, x, y, z, lo = false) {
  const m = new THREE.Mesh(lo ? G_CYL_LO : G_CYL, mat);
  m.scale.set(r * 2, h, r * 2);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

function sphere(parent, mat, r, x, y, z, sy = 1) {
  const m = new THREE.Mesh(G_SPHERE, mat);
  m.scale.set(r * 2, r * 2 * sy, r * 2);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

/* =========================================================================
   BUILD
   ========================================================================= */

export function build(ctx) {
  const { scene, MARKET, rng, emissives, onProgress } = ctx;
  const rand = rng(0x5eed_2f11);

  const root = new THREE.Group();
  root.name = 'frontage';

  const counts = Object.create(null);
  const tally = (key, n = 1) => { counts[key] = (counts[key] ?? 0) + n; };

  const emit = (mesh, color, intensity, kind) => {
    emissives.add(mesh, { color, intensity, kind });
    tally(`emissive.${kind}`);
    return mesh;
  };

  /* World anchors. Everything is measured off the shared contract so the run
     meets street.js's kerb without either owner reading the other's source. */
  const FR = MARKET.frontageRight;            // 3.8 — the building line
  const WALL_X = FR - 0.01;                   // signage wall face, 1 cm proud
  const EAVE_Y = MARKET.awningHeight;         // 2.8 — projecting eave underside
  const EAVE_X = 2.42;                        // eave outer edge, 1.37 m of reach
  const COUNTER_Y = MARKET.counterHeight;     // 0.9
  const COUNTER_FRONT = 3.0;
  const NOREN_Y = MARKET.norenHeight;         // 2.0 — split-curtain rod
  const Z0 = 16;                              // near end of the run, behind camera
  const Z1 = -34;                             // far end, past the vanishing point

  /* The near-camera pale mass — audit D1. Declared here rather than beside the
     geometry in section 7 because three earlier sections have to keep OUT of
     its way: the whole point of it is that the reference reads the near-right
     out of one big simple shape, and a tall narrow banner hung across it puts
     the frame straight back into the flat wall of similar tickets the audit
     names. See section 7 for the measurements. */
  const BIG_NOREN = {
    x: 2.62,        // forward of the counters, hard at the walkway edge
    rodY: 2.86,
    drop: 0.95,
    zFar: 4.25,     // ~78% of frame width in the hero shot
    zNear: 7.75,    // past the right frame edge
    panels: 3,
  };
  /** True for anything that would hang in front of the big near noren. */
  const inNearMass = (z) => z > BIG_NOREN.zFar - 0.4;

  /* THE NEAR STRUCTURE STAND-IN LIGHT.
   *
   * lighting.js's stall pockets sit at z = 2.4, -1.6, -5.6, -9.8, so the last
   * four metres of the run — the part that fills the top-right corner of the
   * hero frame — has no practical light of its own at all. Measured against the
   * reference over the eave band directly above the noren (x 78-98%, y 1-11%):
   *
   *     reference   mean L 90.9   median 66.7    0.0% below L16
   *     this build  mean L 44.4   median 18.5   29.3% below L16
   *
   * Everything in that band is timber I own — the eave slab, its rafter tails,
   * the fascia frame, the backers behind the projecting boards — and raising
   * their albedo does nothing, because they are sitting on the ambient floor at
   * L 10-14 with no light to reflect. In the reference this timber is plainly
   * lit, warm and mid-valued: it catches the stall pockets and the lanterns.
   *
   * So the near run's structure carries a low warm self-value standing in for
   * the pocket light that is not there. It goes through the shared registry
   * under a `facade` kind (budget 0.35, far below the bloom threshold) so
   * lighting.js still owns the scale, and it applies ONLY to bays past z = 2 —
   * the far run is genuinely lit and the audit measured its falloff as correct.
   */
  const NEAR_LIT_Z = 2.0;
  const NEAR_LIT_TINT = 0xc79a70;
  const litStructure = (mesh, z) => {
    if (z > NEAR_LIT_Z) emit(mesh, NEAR_LIT_TINT, 1.0, 'facade-neartimber');
    return mesh;
  };

  /* Depth stack on the wall, street-ward (smaller X) = nearer the viewer.
     Kept explicit because five layers land inside 5 cm of each other and any
     mix-up silently buries the poster wall behind the paint. */
  const X_PAINT = WALL_X - 0.004;   // ochre shopfront paint, hard against the shell
  const X_BAND = WALL_X - 0.02;     // every signage band
  const X_INNER = WALL_X - 0.02;    // open-stall interior (bands are absent there)

  /* The eave at 2.8 m caps the visible wall, so the whole eye-level poster
     wall lives between counter height and 2.78 — exactly the band the
     reference packs solid. */
  const BAND_LOW = { y: 1.435, h: 1.03 };   // 0.92 – 1.95
  const BAND_MAIN = { y: 2.39, h: 0.78 };   // 2.00 – 2.78
  const BAND_INNER = { y: 1.42, h: 1.12 };  // 0.86 – 1.98, open bays only

  onProgress?.('Frontage — signage textures…');

  /* ---------------------------------------------------- texture pools ---- */
  /* Two pools of everything: a warm pool, unchanged, and a CHROMA pool whose
     faces are drawn from CHROMA_SETS. Every placement site rolls between them,
     so the non-warm share is a set of probabilities in one place rather than a
     colour decision scattered over four hundred boards. See CHROMA_SETS and
     audit D2. Weighted toward the upper storeys, which is where the reference
     concentrates its green/blue/violet strips. */
  const posterStrips = Array.from({ length: 6 }, () => makePosterStrip(rand));
  const posterChromaStrips = Array.from({ length: 5 }, () => makePosterStrip(rand, { chroma: 0.5 }));
  const lowerStrips = Array.from({ length: 4 }, () => makePosterStrip(rand, { h: 448 }));
  const lowerChromaStrips = Array.from({ length: 3 },
    () => makePosterStrip(rand, { h: 448, chroma: 0.46 }));
  const fasciaStrips = Array.from({ length: 4 }, () => makeFasciaStrip(rand));
  const fasciaChromaStrips = Array.from({ length: 3 }, () => makeFasciaStrip(rand, { chroma: 0.62 }));
  const upperStrips = Array.from({ length: 3 }, () => makeUpperStrip(rand));
  const upperChromaStrips = Array.from({ length: 6 }, () => makeUpperStrip(rand, { chroma: 0.78 }));
  const norenSheets = Array.from({ length: 6 }, () => makeNorenSheet(rand));
  const bannerSheets = Array.from({ length: 6 }, () => makeBannerSheet(rand));
  const bannerChromaSheets = Array.from({ length: 5 }, () => makeBannerSheet(rand, { chroma: 0.9 }));
  const menuSheets = Array.from({ length: 6 }, () => makeMenuSheet(rand));
  const menuChromaSheets = Array.from({ length: 5 }, () => makeMenuSheet(rand, { chroma: 0.85 }));
  const bladeSheets = Array.from({ length: 4 }, () => makeBladeSheet(rand));
  const bladeChromaSheets = Array.from({ length: 4 }, () => makeBladeSheet(rand, { chroma: 0.85 }));

  const mats = (canvases, intensity, opts) =>
    canvases.map((c) => litBoard(texture(c), { intensity, ...opts }));

  // The eye-level poster wall carries the most emission: in the reference these
  // are backlit boards and are among the brightest surfaces in frame.
  const posterMats = mats(posterStrips, 0.95);
  // Mirrored variants, so a seven-strip pool does not read as a repeat.
  const posterMatsFlip = posterStrips.map((c) =>
    litBoard(texture(c, { repeatX: -1, offsetX: 1 }), { intensity: 0.95 }));
  const lowerMats = mats(lowerStrips, 0.85);
  const fasciaMats = mats(fasciaStrips, 1.2);
  const upperMats = mats(upperStrips, 0.75);
  const menuMats = mats(menuSheets, 1.05);
  const bladeMats = mats(bladeSheets, 1.25, { side: THREE.DoubleSide });
  const bannerMats = bannerSheets.map((c) =>
    litBoard(texture(c), { intensity: 0.55, side: THREE.DoubleSide }));
  const aframeMat = litBoard(texture(makeAframeSheet(rand)), {
    intensity: 0.55, side: THREE.DoubleSide,
  });

  /* THE NON-WARM REGISTRATION COLOUR. lighting.js copies whatever colour an
     owner registers straight onto the material's emissive, and these boards
     carry an emissiveMap, so emission = map x registered colour. Register a
     green face with the warm 0xffc07a used everywhere else and the multiply
     takes the green back out: the face renders warm and the monoculture
     survives the palette change untouched. Near-neutral, very slightly cool,
     so the map's own hue is what reaches the frame.

     NOTE ALSO: normaliseEmissives computes budget x (0.25 + 0.75 x raw/peak
     WITHIN kind), so when every mesh of a kind registers the same intensity the
     ratio pins to 1 and the level is the kind's budget regardless. The colour
     is the only lever here, which is exactly why it has to be right. */
  const CHROMA_TINT = 0xeff0f2;
  const chromaMats = (canvases, intensity, opts) =>
    canvases.map((c) => litBoard(texture(c), { intensity, tint: CHROMA_TINT, ...opts }));

  const posterChromaMats = chromaMats(posterChromaStrips, 0.95);
  const lowerChromaMats = chromaMats(lowerChromaStrips, 0.85);
  const fasciaChromaMats = chromaMats(fasciaChromaStrips, 1.2);
  const upperChromaMats = chromaMats(upperChromaStrips, 0.75);
  const menuChromaMats = chromaMats(menuChromaSheets, 1.05);
  const bladeChromaMats = chromaMats(bladeChromaSheets, 1.25, { side: THREE.DoubleSide });
  const bannerChromaMats = chromaMats(bannerChromaSheets, 0.55, { side: THREE.DoubleSide });

  /* Non-warm placement odds, gathered here so the mix is one table. The audit
     asks for roughly one panel in four non-warm overall, weighted to the upper
     storeys and the mid-depth run. Boards that fall in the near foreground are
     kept mostly warm, because the reference's own near field is warm. */
  /* Measured after the first chroma pass and re-weighted UPWARD. The reference
     puts 89% of its non-warm colour in the top 42% of frame and only 0.6% in
     the lower right; the first pass put 67% up top and 3.0% low, i.e. it was
     colouring the eye-level boards as hard as the upper storeys. The reference
     keeps counter level, stall fronts and menu cards almost wholly warm — the
     colour lives on the storeys above the eave and on the hanging strips. */
  const CHROMA_P = {
    poster: 0.24,     // main eye-level wall band
    lower: 0.16,
    upper: 0.72,      // upper storeys — where the reference concentrates them
    fascia: 0.4,
    banner: 0.44,     // hangs at eave height and above
    menu: 0.14,
    blade: 0.5,       // blades sit at 3.9–6.0 m, well up the facade
    front: 0.12,      // stall-front boards at the walkway edge — stay warm
    pilaster: 0.3,
  };
  let warmPanels = 0;
  let chromaPanels = 0;
  /**
   * Roll one board between the warm and non-warm pools and return everything
   * the placement site needs: material, registration colour and kind. The kind
   * gains a `-chroma` suffix so lighting.js's substring buckets still land it
   * on the same budget while keeping its within-kind peak separate.
   */
  const board = (warmPool, chromaPool, p, warmTint, warmKind) => {
    const useChroma = rand() < p;
    if (useChroma) chromaPanels += 1; else warmPanels += 1;
    return {
      mat: pick(useChroma ? chromaPool : warmPool, rand),
      tint: useChroma ? CHROMA_TINT : warmTint,
      kind: useChroma ? `${warmKind}-chroma` : warmKind,
    };
  };

  // Noren: each sheet is split into four hanging panels by re-mapping the same
  // canvas into four sub-regions, so one motif reads continuously across the
  // split curtain. Texture clones share the underlying canvas image.
  const NOREN_PANELS = 4;
  const norenMats = norenSheets.map((c) =>
    Array.from({ length: NOREN_PANELS }, (_, i) =>
      litBoard(texture(c, { repeatX: 1 / NOREN_PANELS, offsetX: i / NOREN_PANELS }),
        { intensity: 0.32, tint: 0xffd7a4, side: THREE.DoubleSide })));

  /* ---------------------------------------------------- flat materials --- */
  const M = {
    // The dark structural set. Raised across the board for the D1 pass: at the
    // near end of the run these are a metre from camera with no practical light
    // on them, and the board backers, the eave and the fascia frames were
    // rendering at literal L 0 — hard black notches punched through the top of
    // the one pale mass the near-right column is built around. Same reading,
    // off the floor.
    facadeDark: standard({ color: 0x33241a, roughness: 0.96 }),
    facadeWarm: standard({ color: 0x8a5628, roughness: 0.9 }),
    timber: standard({ color: 0x543720, roughness: 0.92 }),
    timberLight: standard({ color: 0x8a6440, roughness: 0.88 }),
    eave: standard({ color: 0x462d15, roughness: 0.94 }),
    counter: standard({ color: 0x5f3e22, roughness: 0.74 }),
    counterTop: standard({ color: 0x8f6b44, roughness: 0.44 }),
    steel: standard({ color: 0x6d7478, roughness: 0.45, metalness: 0.55 }),
    steelDark: standard({ color: 0x3a4045, roughness: 0.5, metalness: 0.5 }),
    rope: standard({ color: 0x241c14, roughness: 1 }),
    cordSlim: standard({ color: 0x1a140e, roughness: 1 }),
    // Mid-slate, not black: a near-black mouth turned every top crate into a
    // hole and punched dark rectangles through the one cool mass in the frame.
    // Lifted again for the D1 pass — the near stacks are now waist-high and a
    // metre from camera, so their mouths were the largest single contributor of
    // near-black pixels left in the lower-right quadrant.
    // ...and NEUTRAL, not slate-blue. At 0x44606e this sat at hue 195, and the
    // near stacks' mouths are large enough in the bottom-right corner to put
    // 1.3% of the whole frame's colour into the cyan band on their own, against
    // the reference's 0.28%. A crate interior is a shadow, not a colour.
    crateVoid: standard({ color: 0x5a5349, roughness: 1 }),
  };

  /* Separate material instances for the near run's structure. normaliseEmissives
     writes the emissive onto the MATERIAL, so if the near eave shared M.eave
     with the far bays the stand-in light would flood the whole sixty-metre run
     — including the mid-distance falloff the audit measured as already correct.
     Same colours, different instances. See the NEAR_LIT_* note above. */
  const MN = {
    eave: standard({ color: 0x462d15, roughness: 0.94 }),
    timber: standard({ color: 0x543720, roughness: 0.92 }),
    facadeDark: standard({ color: 0x33241a, roughness: 0.96 }),
  };
  /** Structure material for a given depth: the near instance past NEAR_LIT_Z. */
  const struct = (key, z) => (z > NEAR_LIT_Z ? MN[key] : M[key]);

  // Crate palette. Weighted so teal / slate-blue dominates: in the reference
  // this stack is the single largest cool mass in an otherwise warm frame.
  //
  // Deliberately blue-leaning rather than true teal. Multiplied by 2700 K
  // lantern light a green-leaning teal (say 0x2f7f8c) lands as flat olive; the
  // crates only survive as a COOL accent if the albedo starts well round on the
  // blue side and bright enough not to sink into the shadow field.
  // `cool: true` marks the blue/teal plastic. Those get a small self-lit fill
  // (see crateMat) so the accent survives; the timber and grey crates do not.
  const CRATE_COLOURS = [
    { hex: 0x2f6f9e, cool: true }, { hex: 0x2d63a4, cool: true },
    { hex: 0x27618a, cool: true }, { hex: 0x2b6bb0, cool: true },
    { hex: 0x2f8090, cool: true }, { hex: 0x3a94a0, cool: true },
    { hex: 0x224e78, cool: true }, { hex: 0x2a6a94, cool: true },
    { hex: 0xd8a41e }, { hex: 0xc79018 }, { hex: 0xe0b634 },
    { hex: 0x6f7a76 }, { hex: 0x7a5c38 }, { hex: 0x62492e },
  ];

  // PALE crate colours, for the near stacks only. The reference's near-right
  // pile is not all dark plastic — a good half of it is bare light timber and
  // pale grey trays, and that is a large part of why its lower-right quadrant
  // sits at 5.5% near-black where this build's sat at 62%. Same crates, lighter
  // albedo; no elements added.
  // Mostly bare timber and grey trays, as the reference's near pile is, with
  // two plastics kept firmly in the BLUE band (~208 deg) rather than teal. The
  // near stacks are the biggest crates in frame, so their hue is worth a full
  // point of the frame's colour budget on its own: a teal here reads as cyan,
  // where the reference runs 0.28% cyan against 9.46% blue.
  const CRATE_PALE = [
    { hex: 0xc4a87a }, { hex: 0xb59768 }, { hex: 0xd2bb90 },
    { hex: 0xa9b0ac }, { hex: 0xbfc4bd }, { hex: 0xd8c49a },
    { hex: 0x4478b4, cool: true }, { hex: 0x3d6ea6, cool: true },
  ];

  const crateMats = new Map();
  /**
   * Crate material. The cool ones carry a low emissive of their own hue.
   *
   * This is the one place the module departs from "just albedo", and it is
   * deliberate. Spec §9 budgets ~5% of the frame to teal and the reference
   * carries essentially all of it on these stacks — but the frame's only
   * meaningful light is ~2700 K, and amber light times a blue albedo is grey
   * whatever the albedo. Without a small cool self-fill the crates sink into
   * the shadow field and the frame loses its only cool note below roof level.
   * It goes through the shared registry, so lighting.js still owns the scale.
   *
   * How much lift you get is set by CRATE_FILL_COLOUR, not by the intensity
   * passed to `add`. lighting.js normalises intensity WITHIN each kind — every
   * crate registers the same number, so the ratio is always 1 and the level is
   * pinned to the kind's budget whatever is passed. It then copies the
   * registered COLOUR onto the material's emissive. So the colour is the only
   * lever, and it has to be a dark, near-black blue: registering the crate's own
   * hex sent the stacks back as glowing cyan, brighter than the paving and
   * reading as light sources. This is a floor under the shadow, not a lamp.
   */
  // Lifted once for the D1 pass. The near stacks are now waist-high a metre
  // from camera, and at the old value they were the darkest large mass left in
  // the lower-right quadrant. Still a floor under the shadow, not a lamp — the
  // previous owner's note above about registering the crate's own hex stands.
  //
  // Bluer than it looks like it needs to be, on purpose. The shadow faces of
  // the cool crates are the only place this fill is the dominant term, and warm
  // light on a blue albedo drags the result green-ward: at 0x18344a (hue 206)
  // those faces landed at hue 198 and counted as CYAN, a band the reference
  // barely uses (0.28%) while it runs 9.46% blue. Eight degrees of hue on one
  // dark colour, worth a point of the frame's colour budget.
  const CRATE_FILL_COLOUR = 0x142e50;
  const CRATE_FILL = 0.3;
  const crateMat = (hex, cool = false) => {
    const key = `${hex}:${cool}`;
    if (!crateMats.has(key)) {
      crateMats.set(key, standard({
        color: hex,
        roughness: 0.62,
        metalness: 0.04,
        // Matches what lighting.js will overwrite these with, so the module
        // looks the same built standalone as it does in the full scene.
        ...(cool ? { emissive: CRATE_FILL_COLOUR, emissiveIntensity: 0.6 } : {}),
      }));
    }
    return crateMats.get(key);
  };

  const PRODUCE = [0xd8541f, 0xe8a51c, 0xb8321c, 0x8fa63a, 0xe2c36a, 0xc9612a, 0x76913a];
  const produceMats = new Map();
  const produceMat = (hex) => {
    if (!produceMats.has(hex)) produceMats.set(hex, standard({ color: hex, roughness: 0.6 }));
    return produceMats.get(hex);
  };

  /* Emissive flats. One material per role, so lighting.js's single scale lands
     on a small, predictable set rather than hundreds of one-offs. */
  const E = {
    interior: standard({
      color: 0x2a1a0e, emissive: 0xff9f45, emissiveIntensity: 1.35, roughness: 0.95,
    }),
    soffit: standard({ color: 0x1a1208, emissive: 0xffc07a, emissiveIntensity: 1.05, roughness: 0.9 }),
    lamp: standard({ color: 0xfff0d0, emissive: 0xffd9a0, emissiveIntensity: 3.2, roughness: 0.4 }),
    redLantern: standard({ color: 0xe03a18, emissive: 0xff3a18, emissiveIntensity: 3.0, roughness: 0.7 }),
    creamLantern: standard({ color: 0xf6e6c4, emissive: 0xffcf90, emissiveIntensity: 2.4, roughness: 0.65 }),
    ice: standard({ color: 0xcfe3ee, emissive: 0xbcd4ff, emissiveIntensity: 0.55, roughness: 0.35 }),
    tube: standard({ color: 0xffe9c0, emissive: 0xffb46b, emissiveIntensity: 2.1, roughness: 0.4 }),
  };

  /* ==================================================== 1. facade shell === */
  onProgress?.('Frontage — facade…');
  const runLen = Z0 - Z1;
  const runMid = (Z0 + Z1) / 2;

  // Backing mass. Front face lands at WALL_X so nothing street.js puts on the
  // 3.8 line can z-fight with it.
  const shell = box(root, M.facadeDark, 1.6, 9.0, runLen, WALL_X + 0.8, 4.5, runMid);
  shell.receiveShadow = true;
  tally('facade');

  // Warm painted ground behind the stall run — the ochre the reference's
  // shopfronts are painted, showing wherever the signage does not quite meet.
  // Sits BEHIND every band (larger X); see the depth-stack note above.
  wallPanel(root, M.facadeWarm, runLen, 3.0, X_PAINT, 1.5, runMid);
  tally('facade');

  /* ==================================================== 2. the bay run ==== */
  onProgress?.('Frontage — stall bays…');

  const bays = [];
  for (let z = Z0; z > Z1;) {
    const w = between(rand, 2.9, 4.3);
    const end = Math.max(Z1, z - w);
    bays.push({ zNear: z, zFar: end, mid: (z + end) / 2, width: z - end });
    z = end;
  }

  for (const bay of bays) {
    const { mid, width } = bay;
    const open = rand() < 0.55;
    bay.open = open;

    /* -- 2a. the wall-to-wall signage bands ------------------------------- */
    // Main poster band, 2.00–2.78. Continuous over EVERY bay: this unbroken
    // line of packed boards above the noren is the reference's signature.
    const posterPool = rand() < 0.5 ? posterMats : posterMatsFlip;
    const mb = board(posterPool, posterChromaMats, CHROMA_P.poster, 0xffc07a, 'poster-band');
    const mp = wallPanel(root, mb.mat, width, BAND_MAIN.h, X_BAND, BAND_MAIN.y, mid);
    emit(mp, mb.tint, 0.95, mb.kind);
    tally('poster-band');

    // Lower band, 0.92–1.95. Present where the frontage is a shopfront rather
    // than an open stall; open bays put a lit interior and counter here instead.
    if (!open) {
      const lb = board(lowerMats, lowerChromaMats, CHROMA_P.lower, 0xffb46b, 'poster-band');
      const lp = wallPanel(root, lb.mat, width, BAND_LOW.h, X_BAND, BAND_LOW.y, mid);
      emit(lp, lb.tint, 0.85, lb.kind);
      tally('poster-band');
      // Shutter / stall base below the boards, so the wall does not float.
      box(root, M.timber, 0.1, 0.95, width, WALL_X - 0.05, 0.475, mid);
      tally('stall-base');
    }

    // Upper storeys, 3.55–5.75 and a second course 5.75–7.6.
    const ub = board(upperMats, upperChromaMats, CHROMA_P.upper, 0xffb46b, 'upper-sign');
    const up = wallPanel(root, ub.mat, width, 2.2, X_BAND, 4.65, mid);
    emit(up, ub.tint, 0.75, ub.kind);
    tally('upper-band');
    if (rand() < 0.72) {
      const ub2 = board(upperMats, upperChromaMats, CHROMA_P.upper, 0xffb46b, 'upper-sign');
      const up2 = wallPanel(root, ub2.mat, width, 1.85, X_BAND, 6.7, mid);
      emit(up2, ub2.tint, 0.5, ub2.kind);
      tally('upper-band');
    }

    /* -- 2b. open stall: lit interior, counter, goods --------------------- */
    if (open) {
      // Recessed interior: the warm pocket every open stall glows out of. It
      // stops at 1.98 so the main poster band above it is never interrupted.
      const inner = wallPanel(root, E.interior, width - 0.34, BAND_INNER.h, X_INNER, BAND_INNER.y, mid);
      emit(inner, 0xff9f45, 1.35, 'stall-interior');
      tally('stall-interior');
      // Side returns, so the recess has depth rather than reading as a decal.
      box(root, M.timber, 0.72, BAND_INNER.h, 0.06, 3.42, BAND_INNER.y, mid + (width - 0.34) / 2);
      box(root, M.timber, 0.72, BAND_INNER.h, 0.06, 3.42, BAND_INNER.y, mid - (width - 0.34) / 2);
      tally('stall-return', 2);
      // Fluorescent tube over the interior — the hard practical light source.
      const tube = cyl(root, E.tube, 0.035, width - 0.6, 3.34, 1.92, mid, true);
      tube.rotation.x = Math.PI / 2;
      emit(tube, 0xffb46b, 2.1, 'strip-light');
      tally('strip-light');

      // Counter at MARKET.counterHeight.
      const cw = width - 0.42;
      const body = box(root, M.counter, 0.74, COUNTER_Y - 0.06, cw, 3.38, (COUNTER_Y - 0.06) / 2, mid);
      body.castShadow = true;
      const top = box(root, M.counterTop, 0.82, 0.07, cw + 0.05, 3.36, COUNTER_Y - 0.02, mid);
      top.receiveShadow = true;
      tally('counter');
      // Price boards taped along the counter fascia. Without these the front of
      // every counter is a metre-wide slab of flat brown at exactly the height
      // the reference fills with signage.
      const fascias = 1 + Math.floor(rand() * 3);
      for (let f = 0; f < fascias; f += 1) {
        const fw = between(rand, 0.4, 0.75);
        const cb = board(menuMats, menuChromaMats, CHROMA_P.menu, 0xffb46b, 'counter-card');
        const fb = wallPanel(root, cb.mat, fw, fw * between(rand, 0.45, 0.7),
          3.005, between(rand, 0.36, 0.66), mid - cw / 2 + cw * ((f + 0.5) / fascias));
        emit(fb, cb.tint, 0.9, cb.kind);
        tally('counter-card');
      }

      // Goods displayed forward — tilted trays on the street edge of the top,
      // pots and stacked stock behind them.
      const trays = 2 + Math.floor(rand() * 3);
      for (let t = 0; t < trays; t += 1) {
        const tz = mid - cw / 2 + cw * ((t + 0.5) / trays) + (rand() - 0.5) * 0.1;
        const tray = box(root, M.timberLight, 0.34, 0.05, 0.42, 3.14, COUNTER_Y + 0.07, tz);
        tray.rotation.z = 0.34;   // tips the face toward the street
        tally('goods');
        for (let p = 0; p < 4; p += 1) {
          sphere(root, produceMat(pick(PRODUCE, rand)), between(rand, 0.034, 0.055),
            3.1 + (rand() - 0.5) * 0.16, COUNTER_Y + between(rand, 0.12, 0.19),
            tz + (rand() - 0.5) * 0.3, 0.82);
          tally('goods');
        }
      }
      const pots = 2 + Math.floor(rand() * 3);
      for (let p = 0; p < pots; p += 1) {
        const h = between(rand, 0.14, 0.26);
        cyl(root, rand() < 0.5 ? M.steel : M.steelDark, between(rand, 0.09, 0.15), h,
          between(rand, 3.4, 3.66), COUNTER_Y + 0.02 + h / 2,
          mid - cw / 2 + cw * rand(), true);
        tally('goods');
      }
      // Skewer / stock rack against the back of the counter.
      if (rand() < 0.6) {
        box(root, M.timberLight, 0.26, 0.34, cw * 0.5, 3.6, COUNTER_Y + 0.19, mid + cw * 0.2);
        tally('goods');
      }
    }

    /* -- 2b2. stall-front boards ------------------------------------------ */
    // The wall bands sit 1.4 m back under the eave, so on their own they read
    // as a dim pocket from street level — in the reference the brightest
    // signage is right AT the walkway edge, on the stall fronts and columns.
    // These boards put bright, high-contrast marks back at eye level.
    const frontBoards = 2 + Math.floor(rand() * 3);
    for (let f = 0; f < frontBoards; f += 1) {
      // Tall-narrow boards take a banner sheet, wide ones a menu sheet. A
      // poster STRIP would squeeze fourteen panels into 0.8 m and read as noise.
      const tall = rand() < 0.45;
      const bw = tall ? between(rand, 0.24, 0.36) : between(rand, 0.5, 0.85);
      const bh = tall ? bw * between(rand, 2.6, 4.0) : bw * between(rand, 0.55, 0.9);
      const bz = mid - width / 2 + width * ((f + 0.5) / frontBoards) + (rand() - 0.5) * 0.25;
      // Forward of the noren plane, hard at the walkway edge — the depth the
      // reference's brightest eye-level signage actually sits at.
      const bx = between(rand, 2.84, 2.96);
      const by = tall ? between(rand, 1.35, 1.75) : between(rand, 1.1, 1.85);
      if (inNearMass(bz)) continue;   // keep the near noren one clean silhouette
      litStructure(box(root, struct('timber', bz), 0.05, bh + 0.05, bw + 0.05,
        bx + 0.04, by, bz), bz);
      const fb = tall
        ? board(bannerMats, bannerChromaMats, CHROMA_P.front, 0xffc07a, 'stall-front-board')
        : board(menuMats, menuChromaMats, CHROMA_P.front, 0xffc07a, 'stall-front-board');
      const face = wallPanel(root, fb.mat, bw, bh, bx, by, bz);
      emit(face, fb.tint, 1.1, fb.kind);
      tally('stall-front-board');
    }

    /* -- 2c. noren, hung at MARKET.norenHeight ---------------------------- */
    // Layering: about half the bays hang the curtain in FRONT of the counter
    // (the reference's near-right stall does exactly this), the rest hang it
    // back over the interior so goods stack in front of the cloth.
    if (rand() < 0.82) {
      const forward = rand() < 0.5;
      const nx = forward ? COUNTER_FRONT - 0.06 : 3.34;
      const drop = between(rand, 0.62, 0.95);
      const opening = width - 0.5;
      const panelW = (opening / NOREN_PANELS) * 0.95;
      const sheet = pick(norenMats, rand);
      // Rod.
      const rod = cyl(root, M.rope, 0.022, opening + 0.12, nx, NOREN_Y + 0.02, mid, true);
      rod.rotation.x = Math.PI / 2;
      tally('noren-rod');
      for (let i = 0; i < NOREN_PANELS; i += 1) {
        // i = 0 at the far (small Z) end so the motif runs the right way round.
        const pz = mid - opening / 2 + (opening / NOREN_PANELS) * (i + 0.5);
        const p = wallPanel(root, sheet[i], panelW, drop, nx, NOREN_Y - drop / 2, pz);
        p.rotation.z = (rand() - 0.5) * 0.03;
        emit(p, 0xffd7a4, 0.32, 'noren');
        tally('noren-panel');
      }
    }

    /* -- 2d. eave, fascia signboard, soffit lamps ------------------------- */
    const eaveDepth = WALL_X - EAVE_X;
    const eaveSlab = box(root, struct('eave', mid), eaveDepth, 0.14, width + 0.02,
      (WALL_X + EAVE_X) / 2, EAVE_Y + 0.07, mid);
    eaveSlab.castShadow = true;
    litStructure(eaveSlab, mid);
    tally('eave');
    // Lit underside — the warm pocket the frontage sits in.
    const soffit = new THREE.Mesh(G_PLANE, E.soffit);
    soffit.scale.set(width, eaveDepth, 1);
    soffit.rotation.x = Math.PI / 2;
    soffit.rotation.z = Math.PI / 2;
    soffit.position.set((WALL_X + EAVE_X) / 2, EAVE_Y - 0.005, mid);
    root.add(soffit);
    emit(soffit, 0xffc07a, 1.05, 'soffit');
    tally('soffit');
    // Rafter tails.
    for (let r = 0; r < 3; r += 1) {
      litStructure(box(root, struct('timber', mid), eaveDepth * 0.9, 0.09, 0.07,
        (WALL_X + EAVE_X) / 2, EAVE_Y - 0.06,
        mid - width / 2 + width * ((r + 0.5) / 3)), mid);
      tally('eave-rafter');
    }
    // Downlights under the eave.
    const lamps = 2 + Math.floor(rand() * 2);
    for (let l = 0; l < lamps; l += 1) {
      const lm = cyl(root, E.lamp, 0.055, 0.06, EAVE_X + 0.4,
        EAVE_Y - 0.06, mid - width / 2 + width * ((l + 0.5) / lamps), true);
      emit(lm, 0xffd9a0, 3.2, 'soffit-lamp');
      tally('soffit-lamp');
    }
    // Fascia signboard band on the eave's outer edge, 2.88–3.32. Kept low so it
    // does not swallow the upper storeys on the near bays.
    const fsb = board(fasciaMats, fasciaChromaMats, CHROMA_P.fascia, 0xffc07a, 'fascia-sign');
    const fascia = wallPanel(root, fsb.mat, width, 0.44, EAVE_X - 0.012, 3.10, mid);
    emit(fascia, fsb.tint, 1.2, fsb.kind);
    tally('fascia-sign');
    litStructure(box(root, struct('timber', mid), 0.12, 0.5, width, EAVE_X + 0.05, 3.10, mid), mid);
    tally('fascia-frame');

    /* -- 2e. pilaster between bays --------------------------------------- */
    const pz = bay.zFar;
    if (pz > Z1 + 0.5) {
      const pil = box(root, struct('timber', pz), WALL_X - 2.86, EAVE_Y, 0.24,
        (WALL_X + 2.86) / 2, EAVE_Y / 2, pz);
      pil.castShadow = true;
      litStructure(pil, pz);
      tally('pilaster');
      // Vertical sign on the pilaster's street-facing edge, and a menu board on
      // the face that looks straight back at camera.
      const pb = board(bannerMats, bannerChromaMats, CHROMA_P.pilaster, 0xffb46b, 'pilaster-sign');
      const vs = wallPanel(root, pb.mat, 0.2, between(rand, 1.1, 1.8),
        2.845, between(rand, 1.5, 2.0), pz);
      emit(vs, pb.tint, 0.55, pb.kind);
      tally('pilaster-sign');
      if (rand() < 0.7) {
        const mw = between(rand, 0.55, 0.8);
        const mnb = board(menuMats, menuChromaMats, CHROMA_P.menu, 0xffc07a, 'menu-board');
        const mb = bladePanel(root, mnb.mat, mw, mw * 0.62,
          3.3, between(rand, 1.35, 1.95), pz + 0.125);
        emit(mb, mnb.tint, 1.05, mnb.kind);
        tally('menu-board');
      }
    }
  }

  /* ============================ 3. projecting boards, blades, banners ==== */
  onProgress?.('Frontage — projecting signage…');

  // Real 3D boards standing off the wall. The strip textures give the density;
  // these give the parallax and the broken silhouette that sells it as depth.
  for (let z = Z0 - 0.6; z > Z1; z -= between(rand, 0.75, 1.6)) {
    const w = between(rand, 0.45, 0.95);
    const h = w * between(rand, 1.15, 1.9);
    const y = between(rand, 1.35, 2.6);
    const x = between(rand, 3.1, 3.6);
    litStructure(box(root, struct('facadeDark', z), 0.05, h + 0.04, w + 0.04, x + 0.03, y, z), z);
    const pb = board(menuMats, menuChromaMats, CHROMA_P.menu, 0xffc07a, 'menu-board');
    const face = wallPanel(root, pb.mat, w, h, x, y, z);
    emit(face, pb.tint, 1.05, pb.kind);
    tally('projecting-board');
  }

  // Blade signs projecting square out of the wall, faces looking up and down
  // the street. These read hardest from the hero camera.
  for (let z = Z0 - 1.5; z > Z1; z -= between(rand, 3.4, 5.6)) {
    const h = between(rand, 1.1, 2.1);
    const y = between(rand, 3.9, 6.0);   // clear of the eave fascia at 3.32
    const depth = between(rand, 0.7, 1.15);
    const x = WALL_X - depth / 2;
    litStructure(box(root, struct('facadeDark', z), depth, h, 0.07, x, y, z), z);
    // Blades sit high, in the upper-storey band the reference colours hardest.
    const sb = board(bladeMats, bladeChromaMats, CHROMA_P.blade, 0xffc07a, 'blade-sign');
    const a = bladePanel(root, sb.mat, depth * 0.94, h * 0.94, x, y, z + 0.04);
    const b = bladePanel(root, sb.mat, depth * 0.94, h * 0.94, x, y, z - 0.04, true);
    emit(a, sb.tint, 1.25, sb.kind);
    emit(b, sb.tint, 1.25, sb.kind);
    tally('blade-sign');
    // Bracket back to the wall.
    box(root, M.steelDark, depth, 0.05, 0.05, x, y + h / 2 + 0.06, z);
    tally('sign-bracket');
  }

  // Vertical hanging banners, ~0.4 x 1.8 m, centred on MARKET.bannerHeight,
  // hung off the eave edge so they swing clear in front of the fascia.
  for (let z = Z0 - 1.0; z > Z1; z -= between(rand, 2.3, 3.6)) {
    const w = between(rand, 0.34, 0.46);
    const h = between(rand, 1.5, 1.9);
    const x = EAVE_X - between(rand, 0.06, 0.2);
    const y = MARKET.bannerHeight;
    if (inNearMass(z)) continue;    // the near noren owns this span
    const bb = board(bannerMats, bannerChromaMats, CHROMA_P.banner, 0xffb46b, 'banner');
    const b = wallPanel(root, bb.mat, w, h, x, y, z);
    b.rotation.z = (rand() - 0.5) * 0.035;
    emit(b, bb.tint, 0.55, bb.kind);
    tally('banner');
    // Head rail and hanger cords up to the eave.
    const rail = cyl(root, M.rope, 0.016, w + 0.06, x, y + h / 2 + 0.02, z, true);
    rail.rotation.x = Math.PI / 2;
    const cordLen = EAVE_Y + 0.14 - (y + h / 2);
    if (cordLen > 0.02) {
      cyl(root, M.cordSlim, 0.006, cordLen, x, y + h / 2 + cordLen / 2, z - w * 0.3, true);
      cyl(root, M.cordSlim, 0.006, cordLen, x, y + h / 2 + cordLen / 2, z + w * 0.3, true);
    }
    tally('banner-rig');
  }

  /* ==================================================== 4. lanterns ======= */
  onProgress?.('Frontage — lanterns…');

  // Red paper lanterns along the frontage, every 3–4 m at MARKET.redLanternHeight.
  for (let z = Z0 - 2.2; z > Z1; z -= between(rand, 3.0, 4.0)) {
    // Forward of the noren and the stall-front boards so they read as discrete
    // hot points rather than dissolving into the lit wall behind them.
    const x = between(rand, 2.36, 2.6);
    const y = MARKET.redLanternHeight;
    const r = between(rand, 0.19, 0.25);
    const body = sphere(root, E.redLantern, r, x, y, z, 1.32);
    emit(body, 0xff4a2a, 2.6, 'red-lantern');
    // Cap and base rings.
    cyl(root, M.timber, r * 0.42, 0.035, x, y + r * 1.32, z, true);
    cyl(root, M.timber, r * 0.42, 0.03, x, y - r * 1.32, z, true);
    // Cord to the eave.
    const cl = EAVE_Y - (y + r * 1.32);
    if (cl > 0.02) cyl(root, M.cordSlim, 0.006, cl, x, y + r * 1.32 + cl / 2, z, true);
    tally('red-lantern');
  }

  // The big cream frontage lanterns hung at the eave line. In the reference
  // these are much larger than the overhead strung rows and sit nearer camera.
  for (let z = Z0 - 3.4; z > Z1 + 4; z -= between(rand, 6.5, 9.5)) {
    const r = between(rand, 0.24, 0.34);
    const x = between(rand, 2.2, 2.5);
    const y = EAVE_Y + between(rand, 0.35, 0.7);
    const body = sphere(root, E.creamLantern, r, x, y, z, 0.92);
    emit(body, 0xffcf90, 2.4, 'frontage-lantern');
    cyl(root, M.timber, r * 0.36, 0.04, x, y + r * 0.92, z, true);
    cyl(root, M.timber, r * 0.36, 0.04, x, y - r * 0.92, z, true);
    tally('frontage-lantern');
  }

  /* ================================== 5. crates at the kerb (cool accent) = */
  onProgress?.('Frontage — crates and coolers…');

  /** One stackable plastic crate: body plus the lip that makes it read plastic. */
  function crate(x, y, z, spec, w = 0.44, h = 0.32, d = 0.6, yaw = 0, mouth = false) {
    const g = new THREE.Group();
    const m = crateMat(spec.hex, spec.cool);
    const b = box(g, m, w, h, d, 0, h / 2, 0);
    b.castShadow = true;
    b.receiveShadow = true;
    if (spec.cool) emit(b, CRATE_FILL_COLOUR, CRATE_FILL, 'crate-fill');
    box(g, m, w * 1.06, h * 0.13, d * 1.04, 0, h * 0.94, 0);
    // Only the crate at the top of a stack shows a mouth. Giving every crate one
    // turned the stacks into rows of black slots and ate the cool accent.
    if (mouth) box(g, M.crateVoid, w * 0.78, h * 0.05, d * 0.8, 0, h * 0.985, 0);
    g.position.set(x, y, z);
    g.rotation.y = yaw;
    root.add(g);
    tally('crate');
    return h;
  }

  // Clusters that genuinely spill into the walkway. The audit's remaining note
  // on this module is that the spill is still smaller than the reference's,
  // which piles nearly to waist height and further out into the walkway — so
  // the stacks are taller (up to four crates, ~1.2 m) and reach out to x ≈ 1.5,
  // more than two metres proud of the building line. Crate COUNT per cluster is
  // unchanged: the audit is equally clear that this side is already denser than
  // the target and must not gain elements. Bigger, not more.
  for (let z = Z0 - 0.4; z > Z1 + 2; z -= between(rand, 1.5, 3.2)) {
    const stacks = 2 + Math.floor(rand() * 4);
    for (let s = 0; s < stacks; s += 1) {
      // Near clusters spill furthest and stack highest; the far ones stay tight
      // to the kerb so the run still converges.
      const near = z > -6;
      const sx = near ? between(rand, 1.5, 2.95) : between(rand, 1.9, 3.0);
      const sz = z - between(rand, -0.6, 1.6);
      const yaw = (rand() - 0.5) * 0.45;
      const high = near ? 2 + Math.floor(rand() * 3) : 1 + Math.floor(rand() * 3);
      let y = 0;
      for (let i = 0; i < high; i += 1) {
        const w = between(rand, 0.46, 0.58);
        const h = between(rand, 0.28, 0.38);
        const d = between(rand, 0.6, 0.78);
        // Near stacks lean pale; the far run keeps the cool plastic that is the
        // frame's only large cool mass below roof level.
        const pool = near && rand() < 0.68 ? CRATE_PALE : CRATE_COLOURS;
        crate(sx, y, sz, pick(pool, rand), w, h, d,
          yaw + (rand() - 0.5) * 0.12, i === high - 1);
        y += h;
      }
      // Produce heaped in the top crate.
      if (rand() < 0.8) {
        const n = 5 + Math.floor(rand() * 7);
        for (let p = 0; p < n; p += 1) {
          sphere(root, produceMat(pick(PRODUCE, rand)), between(rand, 0.036, 0.058),
            sx + (rand() - 0.5) * 0.3, y + between(rand, 0.0, 0.06),
            sz + (rand() - 0.5) * 0.42, 0.85);
          tally('produce');
        }
      }
    }
  }

  // Coolers / ice display boxes, with a pale ice bed and stock laid on it.
  for (let z = Z0 - 3.0; z > Z1 + 3; z -= between(rand, 7.5, 12)) {
    const x = between(rand, 2.6, 3.05);
    const w = 0.78;
    const h = 0.6;
    const d = between(rand, 1.0, 1.4);
    const chilled = rand() < 0.5;
    const b = box(root, chilled ? crateMat(0x2f6f9e, true) : M.steelDark, w, h, d, x, h / 2, z);
    b.castShadow = true;
    if (chilled) emit(b, CRATE_FILL_COLOUR, CRATE_FILL, 'crate-fill');
    box(root, M.steel, w * 1.05, 0.05, d * 1.03, x, h + 0.02, z);
    // Ice bed, tipped toward the street so it catches the eye.
    const ice = box(root, E.ice, w * 0.86, 0.09, d * 0.9, x - 0.02, h + 0.07, z);
    ice.rotation.z = 0.16;
    emit(ice, 0xbcd4ff, 0.55, 'ice-display');
    tally('cooler');
    const n = 4 + Math.floor(rand() * 5);
    for (let i = 0; i < n; i += 1) {
      const f = box(root, produceMat(pick(PRODUCE, rand)), 0.1, 0.06, between(rand, 0.16, 0.26),
        x - between(rand, 0.0, 0.22), h + between(rand, 0.11, 0.15),
        z + (rand() - 0.5) * d * 0.8);
      f.rotation.y = (rand() - 0.5) * 0.9;
      tally('goods');
    }
    // Price card wedged on the lid.
    const cb = board(menuMats, menuChromaMats, CHROMA_P.menu, 0xffc07a, 'menu-board');
    const card = bladePanel(root, cb.mat, 0.4, 0.26, x - 0.1, h + 0.28, z + d * 0.42);
    card.rotation.x = -0.2;
    emit(card, cb.tint, 1.0, cb.kind);
    tally('menu-board');
  }

  // Stacked flat trays and loose timber crates between the clusters — the
  // low-level clutter that stops the kerb line reading as a tidy edge.
  for (let z = Z0 - 1.6; z > Z1 + 2; z -= between(rand, 3.5, 6.5)) {
    const x = between(rand, 2.1, 2.9);
    const n = 2 + Math.floor(rand() * 4);
    for (let i = 0; i < n; i += 1) {
      const t = box(root, crateMat(pick([0xb59768, 0x9c8256, 0xa9b0ac, 0xd9a41e], rand), false),
        0.5, 0.09, 0.72, x, 0.05 + i * 0.1, z);
      t.rotation.y = (rand() - 0.5) * 0.5;
      t.receiveShadow = true;
      tally('tray-stack');
    }
  }

  /* ============================== 6. A-frame sandwich boards ============== */
  onProgress?.('Frontage — sandwich boards…');

  function aframe(x, z, yaw, height = 1.1, opts = {}) {
    const { mat = aframeMat, tint = 0xffb46b, kind = 'a-frame', width = 0.68 } = opts;
    const g = new THREE.Group();
    const w = height * width;
    const lean = 0.2;                     // radians of splay per leaf
    const half = Math.sin(lean) * height * 0.5;  // half the foot separation
    for (const dir of [1, -1]) {
      // Each leaf's top must tip TOWARD the apex, so the pair meets at z = 0.
      // Euler order is XYZ, so for the flipped leaf the X tilt is applied after
      // the Y flip and its sign inverts with it.
      const leaf = new THREE.Mesh(G_PLANE, mat);
      leaf.scale.set(w, height, 1);
      leaf.rotation.y = dir > 0 ? 0 : Math.PI;
      leaf.rotation.x = dir > 0 ? -lean : lean;
      leaf.position.set(0, height / 2, dir * half);
      g.add(leaf);
      emit(leaf, tint, 0.55, kind);
      // Foot rail at the splayed base of each leaf.
      box(g, M.timberLight, w + 0.09, 0.05, 0.05, 0, 0.03, dir * half * 2);
    }
    // Apex batten where the two leaves meet.
    box(g, M.timberLight, w + 0.09, 0.06, 0.1, 0, height * 0.99, 0);
    g.position.set(x, 0, z);
    g.rotation.y = yaw;
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    root.add(g);
    tally('a-frame');
  }

  // Near foreground right — the reference puts one squarely in the walkway at
  // the right edge of frame. Angled to catch the hero camera, and kept out
  // toward the stall line so it frames the run rather than blocking it.
  aframe(2.5, -0.4, -0.24, 1.05);
  aframe(2.2, -6.2, 0.34, 1.1);
  aframe(2.7, -12.0, -0.5, 1.0);
  aframe(2.35, -20.5, 0.2, 1.05);

  /* ================= 7. the near-right pale mass — audit D1 =============== */
  onProgress?.('Frontage — near-camera pale mass…');

  /* THE HIGHEST-IMPACT DEFECT IN THE FRAME, and the one this module owns
   * outright. Measured across x 88–100% of frame, y 15–100%:
   *
   *     reference   mean L 96.4   median L 103.9   2.5% below L16
   *     this build  mean L 43.6   median L   7.0  61.1% below L16
   *
   * The instinct that produced that column was to answer density with more
   * elements. It is the wrong instinct here and the audit measured why: this
   * side is ALREADY 1.18–1.31x denser than the reference. The reference gets
   * more read out of one big shape. Its near-right is a single large olive-grey
   * noren at roughly a metre from camera plus one cream A-frame just behind,
   * and those two shapes do three things a wall of small tickets cannot —
   * they set the near end of the scale ladder, they hold the frame edge at a
   * midtone instead of a hole, and a big simple silhouette is what makes the
   * busy mid-ground read as busy.
   *
   * So: two objects, no extra clutter, both authored pale. Both are self-lit
   * because there is no practical light on the right past z ≈ 4 — they are lit
   * SURFACES, well under the bloom threshold, not sources. lighting.js owns
   * lifting the shadow floor around them and has been briefed; this is the mass
   * that floor has to have something to land on.
   *
   * Distinct kinds (`noren-nearpale`, `aframe-pale`) so lighting.js's substring
   * buckets keep their within-kind peaks separate from the warm noren and
   * A-frame runs — they still resolve to the same 0.55 budget, but a shared
   * kind would have let the ordinary boards set these two's level. */

  const bigNorenSheet = makeBigNorenSheet(rand);
  const bigNorenMats = Array.from({ length: BIG_NOREN.panels }, (_, i) =>
    litBoard(texture(bigNorenSheet, {
      repeatX: 1 / BIG_NOREN.panels, offsetX: i / BIG_NOREN.panels,
    }), { intensity: 1.0, tint: 0xf0e3c6, side: THREE.DoubleSide }));

  {
    const { x, rodY, drop, zFar, zNear, panels } = BIG_NOREN;
    const span = zNear - zFar;
    const rod = cyl(root, M.timberLight, 0.035, span + 0.2, x, rodY + 0.04, (zNear + zFar) / 2, true);
    rod.rotation.x = Math.PI / 2;
    tally('near-noren-rod');
    for (let i = 0; i < panels; i += 1) {
      // i = 0 at the FAR end so the motif run reads left-to-right in frame.
      const pw = (span / panels) * 0.985;
      const pz = zFar + (span / panels) * (i + 0.5);
      const p = wallPanel(root, bigNorenMats[i], pw, drop, x, rodY - drop / 2, pz);
      // A touch of sag, so a mass this close does not read as a flat card.
      p.rotation.z = 0.012 - i * 0.008;
      emit(p, 0xf0e3c6, 1.0, 'noren-nearpale');
      tally('near-noren-panel');
    }
    // Short return at the far end, facing camera, so the mass has an L-shaped
    // silhouette rather than reading as a single flat plane.
    const ret = bladePanel(root, bigNorenMats[0], 0.5, drop, x - 0.25, rodY - drop / 2, zFar - 0.01);
    emit(ret, 0xf0e3c6, 1.0, 'noren-nearpale');
    tally('near-noren-panel');
    cyl(root, M.timberLight, 0.03, 0.56, x - 0.25, rodY + 0.04, zFar, true).rotation.z = Math.PI / 2;
  }

  // The A-frame just behind it, on the walkway. Large, cream-in-gold, and set
  // low so it carries the bottom half of the same column the noren holds up.
  const bigAframeMat = litBoard(texture(makeBigAframeSheet(rand)), {
    intensity: 1.0, tint: 0xffeccd, side: THREE.DoubleSide,
  });
  aframe(2.44, 6.15, -0.62, 1.52, {
    mat: bigAframeMat, tint: 0xffeccd, kind: 'aframe-pale', width: 0.74,
  });

  /* ============================================================ finish ==== */
  scene.add(root);

  const totals = {
    ...counts,
    // Audit D2's acceptance number, reported at build time so a capture never
    // has to be measured to know whether the mix drifted.
    warmPanels,
    chromaPanels,
    nonWarmPanelShare: Number((chromaPanels / Math.max(1, warmPanels + chromaPanels)).toFixed(3)),
    meshes: (() => { let n = 0; root.traverse((o) => { if (o.isMesh) n += 1; }); return n; })(),
  };
  ctx.frontageStats = totals;
  console.info('[night-market] frontage built', totals);
  return totals;
}
