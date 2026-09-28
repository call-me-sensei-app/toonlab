// Night Market street — replica study.
//
// SCOPE: plain Three.js. ToonLab is deliberately NOT used here. See
// launch-plan/22-night-market-replica-spec.md. The point of this build is to
// reach the reference frame first and work out afterwards what ToonLab can
// supply; importing ToonLab systems now would re-introduce the coupling this
// study exists to sidestep.
//
// OWNERSHIP — one module per owner, so four agents can build one scene:
//   street.js     ground, kerbs, building shells, the street section itself
//   frontage.js   the right-side stall run: counters, noren, crates, posters
//   lanterns.js   overhead lantern rows, hanging signage, banners
//   dressing.js   left side: umbrellas, tables, barrels, litter, mannequins
//   lighting.js   lights, emissive registry, bloom, fog, steam, tone mapping
//
// Each module exports `build(ctx)` and may export `SHOTS`. Nothing outside a
// module's own file is edited. All of them share the contract below.

import * as THREE from 'three';

/**
 * The shared world contract. Every module places geometry against these, so a
 * kerb authored by street.js and a crate authored by frontage.js land on the
 * same line without either owner reading the other's source.
 *
 * Coordinate convention: the street runs along -Z away from camera. +X is the
 * RIGHT side of frame (the dense stall frontage). Y is up, 0 = paving level.
 */
export const MARKET = Object.freeze({
  // Street section. Spec §2: 7-8 m face to face.
  streetWidth: 7.6,
  streetLength: 60,
  // Walkable paving runs the full width; there is no carriageway. The lighter
  // grey paver band runs down the LEFT third (spec §2).
  greyBandFrom: -3.8,
  greyBandTo: -1.2,

  // Frontage lines. Buildings sit hard against the walkway on both sides.
  frontageRight: 3.8,
  frontageLeft: -3.8,

  // Heights that multiple owners key off.
  norenHeight: 2.0,       // §3 half-height split curtains
  counterHeight: 0.9,     // §3 stall counters
  awningHeight: 2.8,      // §3 projecting eaves
  redLanternHeight: 2.4,  // §3 frontage lanterns
  bannerHeight: 2.2,      // §3 vertical hanging banners

  // §4 the signature element: two converging rows of chochin.
  lanternRowY: 4.7,
  lanternRowX: [-2.1, 2.1],
  lanternSpacing: 2.0,
  lanternCount: 24,
  lanternRadius: 0.175,

  // §7 colour temperature of the dominant source.
  warmLight: 0xffb46b,
  redLight: 0xff4a2a,
  coolAccent: 0xbcd4ff,
});

/**
 * SEMANTIC MATERIAL ROLES — the vocabulary a swap layer targets.
 *
 * The replica's 51 material constructions are plain Three.js and carry no
 * identity: no `.name`, no role, nothing but colour and roughness. That is
 * fine for reaching the frame, and useless for the comparison this study
 * exists to enable — "put ToonLab's rock shader on the stone" cannot be
 * expressed against anonymous materials.
 *
 * These roles are deliberately the DOMAINS ToonLab ships shaders for, so a
 * swap is a per-domain question rather than an all-or-nothing one.
 */
export const ROLES = Object.freeze({
  ground: 'ground',       // paving, kerbs, drainage — ToonLab ground shader
  stone: 'stone',         // kerbstone, plinths, setts — rock shader
  timber: 'timber',       // beams, benches, tables, crates, barrels
  plaster: 'plaster',     // building render, walls
  tile: 'tile',           // roof tile, coping
  cloth: 'cloth',         // noren, banners, umbrella canopy, awnings
  paper: 'paper',         // lantern skins — translucent/diffusing
  metal: 'metal',         // railings, fittings, poles, hardware
  foliage: 'foliage',     // tree mass, hedge — vegetation shaders
  produce: 'produce',     // goods, food
  signage: 'signage',     // poster/menu/board faces
  glass: 'glass',
  skin: 'skin',           // mannequins — toon shader
  water: 'water',
});

/**
 * Tag a mesh (or every mesh under a group) with a semantic role.
 *
 * Writes to BOTH `mesh.userData.role` and `material.userData.role`, because a
 * swap layer may walk either — and materials are frequently shared across
 * meshes, so the material tag is the one that survives instancing and merging.
 *
 * Idempotent, and never overwrites an existing tag: an owner's explicit call
 * always beats a later inference pass.
 */
export function tagRole(object, role, { overwrite = false } = {}) {
  if (!object || !role) return object;
  object.traverse?.((node) => {
    if (!node.isMesh) return;
    if (overwrite || !node.userData.role) node.userData.role = role;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (!material) continue;
      material.userData ??= {};
      if (overwrite || !material.userData.role) material.userData.role = role;
    }
  });
  if (object.isMesh && (overwrite || !object.userData.role)) object.userData.role = role;
  return object;
}

/** Count tagged vs untagged meshes, so coverage is measurable rather than assumed. */
export function roleCoverage(scene) {
  const byRole = {};
  let tagged = 0;
  let untagged = 0;
  scene.traverse((node) => {
    if (!node.isMesh) return;
    const role = node.userData?.role;
    if (role) { tagged += 1; byRole[role] = (byRole[role] ?? 0) + 1; }
    else untagged += 1;
  });
  return { tagged, untagged, coverage: tagged / Math.max(1, tagged + untagged), byRole };
}

/** Deterministic RNG — every capture must be reproducible. */
export function rng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1_664_525) + 1_013_904_223) >>> 0;
    return s / 4_294_967_296;
  };
}

/**
 * Emissive registry. Lighting owns bloom and tone mapping, but every other
 * owner creates emissive surfaces (lanterns, signs, stall interiors). Register
 * them here rather than each owner inventing its own intensity, so the frame
 * has ONE emissive scale. Spec §7: bloom is not subtle in the reference.
 */
export function createEmissiveRegistry() {
  const entries = [];
  return {
    entries,
    /** @param {THREE.Mesh} mesh @param {{color:number,intensity:number,kind:string}} spec */
    add(mesh, spec) {
      entries.push({ mesh, ...spec });
      return mesh;
    },
    stats() {
      const byKind = {};
      for (const e of entries) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
      return { total: entries.length, byKind };
    },
  };
}

/**
 * Shot list. Spec §1: eye level ~1.6 m, looking down the street, ~5 degrees
 * down, 35-40 mm equivalent, vanishing point slightly right of centre.
 */
export const SHOTS = Object.freeze({
  hero: { position: [0.6, 1.6, 9], target: [-0.4, 1.35, -14], fov: 52 },
  wide: { position: [1.1, 1.7, 14], target: [-0.6, 1.3, -18], fov: 62 },
  stalls: { position: [1.4, 1.55, 2], target: [3.6, 1.5, -6], fov: 44 },
  lanterns: { position: [0, 1.6, 6], target: [0, 3.6, -16], fov: 50 },
});

/**
 * The five modules, in build order. `street` must precede the owners that key
 * off its surfaces; `lighting` must be last so it can consume the completed
 * emissive registry.
 */
export const MODULE_ORDER = Object.freeze(['street', 'frontage', 'lanterns', 'dressing', 'lighting']);

const MODULE_LOADERS = Object.freeze({
  street: () => import('./street.js'),
  frontage: () => import('./frontage.js'),
  lanterns: () => import('./lanterns.js'),
  dressing: () => import('./dressing.js'),
  lighting: () => import('./lighting.js'),
});

/**
 * A/B SEAM — the point of this whole study.
 *
 * The replica is deliberately plain Three.js so the target frame could be
 * reached without fighting a style bundle. The next question is which parts
 * ToonLab can supply at equal quality, and that is only answerable if a single
 * subsystem can be swapped while everything else is held fixed.
 *
 * Two independent switches, both driven from the query string:
 *
 *   ?off=lighting,dressing     omit modules entirely
 *   ?only=street,lanterns      build ONLY these (overrides ?off)
 *   ?swap=toon                 run registered swap layers after the build
 *
 * `?off=lighting` deliberately leaves a usable frame rather than a black one:
 * without a tone-mapped composer the scene would be unreadable and the
 * comparison worthless, so a neutral fallback is installed in its place. That
 * fallback is NOT an attempt at the look — it exists so the geometry is
 * legible while its lighting owner is absent.
 *
 * Swap layers are registered by a comparison harness (see `swaps.js` when it
 * exists) and receive the built context. A layer walks the scene graph by
 * `material.userData.role` / `mesh.name`, so it can retarget materials without
 * any module needing to know a swap is possible. Modules therefore stay pure
 * Three.js and nothing here imports ToonLab.
 */
export function parseSceneOptions(search = globalThis.location?.search ?? '') {
  const params = new URLSearchParams(search);
  const list = (key) => (params.get(key) ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);

  const only = list('only');
  const off = new Set(list('off'));
  const modules = (only.length ? only : MODULE_ORDER).filter((name) => {
    if (!MODULE_ORDER.includes(name)) {
      console.warn(`[night-market] unknown module "${name}" ignored`);
      return false;
    }
    return !off.has(name);
  });

  return { modules, swaps: list('swap'), off: [...off] };
}

/** Neutral stand-in so `?off=lighting` yields a legible frame, not a black one. */
function installFallbackLighting(scene, renderer) {
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const key = new THREE.DirectionalLight(0xffffff, 1.6);
  key.position.set(4, 9, 6);
  scene.add(key);
  scene.background = new THREE.Color(0x20242e);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  console.info('[night-market] lighting omitted — neutral fallback installed (NOT the target look)');
}

export async function buildNightMarket({
  renderer,
  camera,
  onProgress = () => {},
  options = parseSceneOptions(),
} = {}) {
  const scene = new THREE.Scene();
  const emissives = createEmissiveRegistry();
  const updaters = [];
  const swapLayers = [];
  const ctx = {
    scene, camera, renderer, emissives, updaters, MARKET, rng, onProgress,
    options, ROLES,
    /** Tag geometry with a semantic role so a swap layer can target it. */
    tag: tagRole,
    /** Register an A/B swap layer: `(ctx) => void`, run after all modules build. */
    registerSwap(name, apply) { swapLayers.push({ name, apply }); },
  };

  const built = [];
  const skipped = [];
  for (const name of MODULE_ORDER) {
    if (!options.modules.includes(name)) { skipped.push(name); continue; }
    onProgress(`Building ${name}…`);
    try {
      const mod = await MODULE_LOADERS[name]();
      if (typeof mod.build === 'function') {
        await mod.build(ctx);
        built.push(name);
      }
    } catch (error) {
      // A missing or failing module must not blank the frame — the other
      // owners' work still has to be visible and capturable.
      skipped.push(name);
      console.warn(`[night-market] module "${name}" unavailable:`, error?.message ?? error);
    }
  }

  if (!built.includes('lighting')) installFallbackLighting(scene, renderer);

  // Fallback role inference. Owners tagging their own geometry via `ctx.tag`
  // is always better — they know what a mesh IS. This pass exists so a swap
  // layer has usable coverage TODAY, before five modules have been revisited,
  // and it deliberately never overwrites an explicit tag.
  //
  // It infers from the two signals the scene already carries: the registered
  // emissive `kind`, and the named group a mesh sits under.
  const KIND_ROLE = {
    chochin: ROLES.paper, 'chochin-red': ROLES.paper, bulb: ROLES.glass,
    sign: ROLES.signage, fascia: ROLES.signage, 'aframe-pale': ROLES.signage,
    'stall-interior': ROLES.signage, distant: ROLES.plaster,
  };
  for (const entry of emissives.entries) {
    const role = KIND_ROLE[entry.kind]
      ?? (entry.kind?.includes('noren') ? ROLES.cloth : null)
      ?? (entry.kind?.includes('crate') ? ROLES.timber : null)
      ?? ROLES.signage;
    tagRole(entry.mesh, role);
  }
  const GROUP_ROLE = {
    'street.ground': ROLES.ground, 'street.dampOverlay': ROLES.ground,
    'street.shells': ROLES.plaster, 'street.background': ROLES.plaster,
    'lantern-rows': ROLES.paper, lanterns: ROLES.paper,
    frontage: ROLES.signage, dressing: ROLES.timber,
  };
  for (const [name, role] of Object.entries(GROUP_ROLE)) {
    const group = scene.getObjectByName(name);
    if (group) tagRole(group, role);
  }

  const coverage = roleCoverage(scene);
  console.info('[night-market] role coverage', `${(coverage.coverage * 100).toFixed(1)}%`, coverage.byRole);

  for (const layerName of options.swaps) {
    try {
      const mod = await import(`./swaps/${layerName}.js`);
      if (typeof mod.apply === 'function') { await mod.apply(ctx); ctx.registerSwap(layerName, mod.apply); }
    } catch (error) {
      console.warn(`[night-market] swap layer "${layerName}" unavailable:`, error?.message ?? error);
    }
  }

  return { scene, ctx, built, skipped, swaps: swapLayers.map((s) => s.name), emissives, updaters, coverage };
}
