// Gameplay-VFX verification — no browser needed. Mirrors verify-ambientfx.mjs:
// determinism (same seed + same spawn/update cadence → bit-identical emission),
// ring-buffer budgets (overflow wraps, never grows), lifecycle (bursts expire,
// ribbons pool, projectiles detonate on ground with onHit), per-spawn look
// overrides, disabled effects, hit-stop (timeScale 0), and the pure builders'
// geometry contracts (hemisphere spark spray, radial landing ring).
// Run with: node scripts/verify-vfxgen.mjs

import process from 'node:process';
import { readFileSync } from 'node:fs';

import * as THREE from 'three';

import {
  collectMoveEvents,
  createGlowRing,
  createMotionTrails,
  createVfxAxialProfile,
  createChargedShotDefaultSources,
  createFileVfxSource,
  createVfxEffectFromTemplate,
  createVfxSystem,
  compileVfxEffectDocument,
  emitImpact,
  emitLanding,
  getVfxEffectParameterValues,
  getVfxEffectTemplate,
  getVfxEnergyMotionThemeOptions,
  getVfxIntentOptions,
  getMove,
  MOVE_IDS,
  moveDuration,
  normalizeVfxSilhouetteProfile,
  resolveVfxEnergyMotionSettings,
  parseVfxEffectDocument,
  parseVfxSourceDocument,
  sampleMovePose,
  serializeVfxEffectDocument,
  serializeVfxSourceDocument,
  setVfxEffectParameterValues,
  validateVfxEffectDocument,
  validateVfxSourceDocument,
} from '../src/vfxgen/index.js';
import { createVfxLabStore } from '../labs/vfx-lab/store/vfxStore.js';

let failures = 0;
function check(label, condition, detail = '') {
  if (condition) {
    console.log(`ok   ${label}`);
  } else {
    failures += 1;
    console.error(`FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

const vfxLabSource = readFileSync(
  new URL('../labs/vfx-lab/ui/App.jsx', import.meta.url),
  'utf8',
);
const vfxShowcaseSource = readFileSync(
  new URL('../labs/home/labsShowcase.js', import.meta.url),
  'utf8',
);
check('one VFX Lab hosts the Effect and Renderer Profile workspaces',
  vfxLabSource.includes('labName="VFX Lab"')
    && vfxLabSource.includes("id: 'renderers'")
    && vfxLabSource.includes('renderer-profiles-workspace')
    && vfxShowcaseSource.includes("href: '/vfx-lab/?workspace=renderers'"));

const camera = new THREE.PerspectiveCamera();
camera.position.set(0, 2, 6);
camera.updateMatrixWorld();

const DT = 1 / 60;
const heightAt = () => 0;

const styleStore = createVfxLabStore({ urlParams: new URLSearchParams() });
styleStore.actions.setField('impact', 'sparkCount', 99);
styleStore.actions.applyStyle('default');
check('VFX style changes retain authored overrides across every effect',
  styleStore.getState().styleId === 'default'
    && styleStore.getState().overrides.impact.sparkCount === 99
    && styleStore.effectiveSettings().impact.sparkCount === 99);

// --- portable effect documents + guided template contract ----------------------
const chargedTemplate = getVfxEffectTemplate('charged-energy-shot');
const chargedDocument = createVfxEffectFromTemplate('charged-energy-shot', {
  id: 'test.player.charged-shot',
  parameters: { particleRate: 195, radius: 0.58 },
  style: 'call_me_sensei',
});
const chargedValues = getVfxEffectParameterValues(chargedDocument);
check('intent catalog is extensive and reports availability truthfully',
  getVfxIntentOptions().length >= 150
    && getVfxIntentOptions().some((entry) => entry.id === 'charged-projectile' && entry.status === 'available')
    && getVfxIntentOptions().some((entry) => entry.status === 'planned'));
check('charged template exposes guided questions and macro parameters',
  chargedTemplate.questions.length >= 6 && chargedDocument.parameters.length >= 12);
check('charged template exposes independent front/rear shaping and a portable mirrored profile',
  chargedValues.frontTaper !== chargedValues.backTaper
    && chargedValues.widestPoint > 0
    && chargedValues.silhouetteProfile.length === 32);
const energyMotionThemes = getVfxEnergyMotionThemeOptions();
check('charged template exposes themed and fully editable circulating energy',
  energyMotionThemes.length >= 6
    && new Set(energyMotionThemes.map((theme) => theme.id)).size === energyMotionThemes.length
    && chargedValues.circulationEnabled === true
    && chargedValues.energyMotionTheme === 'electric-orbit'
    && chargedDocument.parameters.filter((parameter) => parameter.group === 'energy-motion').length >= 10);
const authoredReleaseLayer = chargedDocument.layers
  .find((layer) => layer.id === 'leading-compression');
check('charged template authors release as an editable warped 3D ring',
  chargedDocument.template.version === 7
    && chargedDocument.parameters.filter((parameter) => parameter.group === 'release').length === 3
    && authoredReleaseLayer.source.asset === 'toonlab.procedural.warped-ring'
    && authoredReleaseLayer.settings.depth > 0.05
    && authoredReleaseLayer.settings.depth < 0.65
    && authoredReleaseLayer.settings.irregularity > 0);
const stormTheme = energyMotionThemes.find((theme) => theme.id === 'storm-crawl');
const resolvedStorm = resolveVfxEnergyMotionSettings({
  energyMotionTheme: stormTheme.id,
  ...stormTheme.settings,
});
check('energy motion themes resolve to bounded deterministic runtime settings',
  resolvedStorm.circulationCount === 9
    && resolvedStorm.circulationDirection === 'alternating'
    && resolvedStorm.circulationIrregularity <= 1
    && resolvedStorm.circulationThickness >= 0.006);
const customMotionDocument = setVfxEffectParameterValues(chargedDocument, {
  circulationBranching: 0.91,
  circulationCount: 11,
  circulationDirection: 'counter-clockwise',
  energyMotionTheme: 'custom',
});
const customMotionCompiled = compileVfxEffectDocument(customMotionDocument);
check('custom circulation remains portable ordinary Effect Document data',
  customMotionCompiled.settings.energyMotionTheme === 'custom'
    && customMotionCompiled.settings.circulationCount === 11
    && customMotionCompiled.settings.circulationBranching === 0.91
    && customMotionCompiled.settings.circulationDirection === 'counter-clockwise');
const handDrawnProfile = normalizeVfxSilhouetteProfile([0, 0.12, 0.7, 1, 0.42, 0.08, 0]);
const handDrawnDocument = setVfxEffectParameterValues(chargedDocument, {
  customProfileEnabled: true,
  silhouetteProfile: handDrawnProfile,
});
const handDrawnCompiled = compileVfxEffectDocument(handDrawnDocument);
check('mirrored profile values validate, compile, and remain normalized effect data',
  handDrawnCompiled.settings.customProfileEnabled === true
    && handDrawnCompiled.settings.silhouetteProfile[0] === 0
    && handDrawnCompiled.settings.silhouetteProfile.at(-1) === 0
    && Math.max(...handDrawnCompiled.settings.silhouetteProfile) <= 1);
const guidedProfile = createVfxAxialProfile({
  backTaper: chargedValues.backTaper,
  frontTaper: chargedValues.frontTaper,
  widestPoint: chargedValues.widestPoint,
});
check('guided profile is intentionally asymmetric instead of an elongated sphere',
  guidedProfile[8] < guidedProfile[24]);
check('charged template declares effect-specific animated source slots',
  chargedTemplate.sourceSlots.length === 2
    && chargedTemplate.sourceSlots.every((slot) => slot.acceptedMimeTypes.includes('image/gif')));
check('template answers are normalized into portable provenance',
  chargedDocument.template.answers.motion === 'straight'
    && chargedDocument.template.answers.contact === 'detonate');
check('charged document owns a phase-aware layered composition',
  chargedDocument.phases.some((phase) => phase.id === 'travel')
    && chargedDocument.phases.some((phase) => phase.id === 'impact')
    && chargedDocument.layers.length >= 10
    && chargedDocument.layers.every((layer) => layer.phases.length > 0));
check('charged macro overrides are validated and retained',
  chargedValues.particleRate === 195 && chargedValues.radius === 0.58);
check('charged document carries quality tiers and explicit budgets',
  chargedDocument.quality.tiers.length === 4
    && chargedDocument.quality.tiers.every((tier) => tier.budgets.projectiles > 0));

const chargedJson = serializeVfxEffectDocument(chargedDocument);
const chargedRoundTrip = parseVfxEffectDocument(chargedJson);
check('effect document JSON round-trips canonically',
  chargedRoundTrip.ok
    && serializeVfxEffectDocument(chargedRoundTrip.value) === chargedJson);
const futureDocument = { ...chargedDocument, version: 999 };
check('future effect schema versions fail with an actionable error',
  !validateVfxEffectDocument(futureDocument).ok
    && validateVfxEffectDocument(futureDocument).errors.some((error) => error.includes('newer')));
const brokenDocument = JSON.parse(chargedJson);
brokenDocument.layers[1].id = brokenDocument.layers[0].id;
brokenDocument.layers[0].phases = ['missing-phase'];
const brokenResult = validateVfxEffectDocument(brokenDocument);
check('duplicate ids and broken phase references are rejected',
  !brokenResult.ok
    && brokenResult.errors.some((error) => error.includes('Duplicate layer'))
    && brokenResult.errors.some((error) => error.includes('unknown phase')));
let unsupportedAnswerRejected = false;
try {
  createVfxEffectFromTemplate('charged-energy-shot', {
    answers: { motion: 'homing' },
  });
} catch (error) {
  unsupportedAnswerRejected = error.message.includes('planned but not implemented');
}
check('planned structural variants are rejected instead of approximated',
  unsupportedAnswerRejected);
const compiledCharged = compileVfxEffectDocument(chargedDocument);
check('template compilation resolves a project id to the charged runtime',
  compiledCharged.effectId === 'test.player.charged-shot'
    && compiledCharged.spawnType === 'chargedShot'
    && compiledCharged.settings.particleRate === 195
    && compiledCharged.sourceAssets.shell === 'test.player.charged-shot.shell-pattern'
    && compiledCharged.sourceAssets.filaments === 'test.player.charged-shot.filament-pattern');

const defaultSources = createChargedShotDefaultSources(chargedDocument.id, 91);
check('procedural visual sources are deterministic portable sibling assets',
  defaultSources.length === 2
    && defaultSources.every((source) => validateVfxSourceDocument(source).ok)
    && parseVfxSourceDocument(serializeVfxSourceDocument(defaultSources[0])).ok);
const fileSource = createFileVfxSource('test.uploaded-mask', {
  file: {
    byteLength: 4096,
    duration: 1.5,
    height: 256,
    mimeType: 'image/gif',
    name: 'mask.gif',
    sha256: 'a'.repeat(64),
    uri: 'project://vfx-sources/mask.gif',
    width: 256,
  },
});
check('uploaded animated sources retain content identity without embedding binary data',
  fileSource.mode === 'file'
    && fileSource.file.mimeType === 'image/gif'
    && !JSON.stringify(fileSource).includes('data:'));

const authoredStore = createVfxLabStore({ urlParams: new URLSearchParams() });
check('missing URL preview parameters retain authored defaults',
  authoredStore.getState().chargePreview === 1
    && authoredStore.getState().previewHour === 13);
authoredStore.actions.setEffectParameter('particleRate', 215);
authoredStore.actions.setChargePreview(0.35);
authoredStore.actions.applyStyle('default');
check('style changes preserve authored effect macro overrides',
  getVfxEffectParameterValues(authoredStore.getState().effectDocument).particleRate === 215);
check('preview charge is not serialized into the effect asset',
  !JSON.stringify(authoredStore.actions.getEffectDocument()).includes('chargePreview'));
const sharedStore = createVfxLabStore({
  urlParams: new URLSearchParams({
    charge: '0.42',
    vfxEffect: JSON.stringify(authoredStore.actions.getEffectDocument()),
  }),
});
check('shared effect URLs restore the canonical document and preview input separately',
  sharedStore.getState().effectDocument.type === 'toonlab.vfx.effect'
    && sharedStore.getState().chargePreview === 0.42);
const legacyClearanceDocument = setVfxEffectParameterValues(chargedDocument, {
  circulationSurfaceOffset: 1.1,
});
legacyClearanceDocument.template.version = 5;
legacyClearanceDocument.parameters = legacyClearanceDocument.parameters
  .filter((parameter) => parameter.group !== 'release');
const migratedClearanceStore = createVfxLabStore({
  urlParams: new URLSearchParams({
    vfxEffect: JSON.stringify(legacyClearanceDocument),
  }),
});
const migratedClearanceValues = getVfxEffectParameterValues(
  migratedClearanceStore.getState().effectDocument,
);
check('template v7 migrates legacy surface offset into visible orbit clearance',
  migratedClearanceStore.getState().effectDocument.template.version === 7
    && migratedClearanceValues.circulationSurfaceOffset > 1.58
    && migratedClearanceValues.releaseDepth >= 0.28
    && migratedClearanceValues.releaseDepth <= 0.3,
  JSON.stringify(migratedClearanceValues));
const legacyWaveDocument = JSON.parse(JSON.stringify(chargedDocument));
legacyWaveDocument.template.version = 6;
Object.assign(
  legacyWaveDocument.parameters.find((parameter) => parameter.id === 'releaseDepth'),
  { default: 0.82, max: 1.4, min: 0.35, value: 0.82 },
);
Object.assign(
  legacyWaveDocument.parameters.find((parameter) => parameter.id === 'releaseIrregularity'),
  { default: 0.72, max: 1, min: 0, value: 0.72 },
);
Object.assign(
  legacyWaveDocument.parameters.find((parameter) => parameter.id === 'releaseLobes'),
  { default: 5, max: 9, min: 2, value: 5 },
);
const migratedRingStore = createVfxLabStore({
  urlParams: new URLSearchParams({
    vfxEffect: JSON.stringify(legacyWaveDocument),
  }),
});
const migratedRingValues = getVfxEffectParameterValues(
  migratedRingStore.getState().effectDocument,
);
check('template v7 retracts legacy release wavefront values into a compact ring',
  migratedRingStore.getState().effectDocument.template.version === 7
    && migratedRingValues.releaseDepth > 0.31
    && migratedRingValues.releaseDepth < 0.33
    && migratedRingValues.releaseIrregularity > 0.39
    && migratedRingValues.releaseIrregularity < 0.4
    && migratedRingValues.releaseLobes === 4,
  JSON.stringify(migratedRingValues));
const projectStore = createVfxLabStore({ urlParams: new URLSearchParams() });
const originalProjectId = projectStore.getState().activeProjectId;
const copiedProjectId = projectStore.actions.duplicateActiveProject();
projectStore.actions.setEffectParameter('radius', 0.91);
const originalProject = projectStore.getState().effectProjects
  .find((entry) => entry.id === originalProjectId);
const copiedProject = projectStore.getState().effectProjects
  .find((entry) => entry.id === copiedProjectId);
check('effect projects are edited independently',
  projectStore.getState().effectProjects.length === 2
    && getVfxEffectParameterValues(originalProject).radius !== 0.91
    && getVfxEffectParameterValues(copiedProject).radius === 0.91);
projectStore.actions.setSourceGenerator('shell-pattern', 'radial-shards');
const activeShellAsset = projectStore.getState().effectDocument.layers
  .find((layer) => layer.id === 'energy-shell').settings.maskAsset;
check('procedural source generation is scoped to the active effect and layer slot',
  activeShellAsset.startsWith(`${copiedProjectId}.`)
    && projectStore.getState().sourceAssets[activeShellAsset].procedural.generator === 'radial-shards');

// Deterministic mulberry32 clone for driving the pure builders directly.
function rngFor(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Plays one fixed combat script against a fresh system: an impact, a slash
 * across eight frames, a fireball lobbed into the ground, a footstep and a
 * landing — every effect category exercised on a fixed clock.
 */
function playScript(seed) {
  const vfx = createVfxSystem({ heightAt, seed });
  const sword = new THREE.Object3D();
  vfx.update(DT, camera);

  let hits = 0;
  vfx.spawn('impact', { at: [0, 1, 0], normal: [0, 1, 0], power: 1 });
  const trail = vfx.spawn('slash', { follow: sword, base: [0, 0.2, 0], tip: [0, 1.2, 0] });
  const bolt = vfx.spawn('fireball', {
    from: [0, 1.4, 0], velocity: [5, 2.5, 0], onHit: () => { hits += 1; },
  });
  for (let frame = 0; frame < 8; frame += 1) {
    sword.position.set(Math.sin(frame * 0.4) * 1.5, 1, Math.cos(frame * 0.4) * 0.5);
    sword.updateMatrixWorld();
    vfx.update(DT, camera);
  }
  trail.stop();
  vfx.spawn('footstep', { at: [1, 0, 1], dir: [1, 0, 0] });
  vfx.spawn('landing', { at: [0, 0, 0], power: 1.5 });
  for (let frame = 0; frame < 8; frame += 1) vfx.update(DT, camera);
  return { bolt, hits: () => hits, sword, trail, vfx };
}

function emissionHash(vfx) {
  let hash = 0x811c9dc5;
  const feed = (value) => {
    const quantized = Math.round(value * 1000); // mm quantization, like pathgen
    for (const shift of [0, 8, 16]) {
      hash ^= (quantized >> shift) & 0xff;
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const meshes = [];
  vfx.root.traverse((node) => { if (node.isMesh) meshes.push(node); });
  for (const mesh of meshes.sort((a, b) => a.name.localeCompare(b.name))) {
    for (const name of ['iSpawn', 'iVel', 'iData', 'position', 'aTrail']) {
      const attribute = mesh.geometry.attributes[name];
      if (!attribute) continue;
      for (const value of attribute.array) feed(value);
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function playChargedScript(seed) {
  const document = createVfxEffectFromTemplate('charged-energy-shot', {
    id: 'test.charged.deterministic',
    parameters: { particleRate: 240 },
  });
  const vfx = createVfxSystem({ effectDocuments: [document], heightAt: null, seed });
  vfx.update(DT, camera);
  const shot = vfx.spawn(document.id, {
    charge: 0.82,
    from: [0, 1.2, 0],
    maxLife: 1,
    velocity: [7, 0.25, -0.5],
  });
  for (let frame = 0; frame < 20; frame += 1) vfx.update(DT, camera);
  return { shot, vfx };
}

// --- determinism ---------------------------------------------------------------
const runA = playScript(42);
const runB = playScript(42);
const runC = playScript(43);
check('same seed + same script → identical emission', emissionHash(runA.vfx) === emissionHash(runB.vfx));
check('different seed → different emission', emissionHash(runA.vfx) !== emissionHash(runC.vfx));
const chargedRunA = playChargedScript(81);
const chargedRunB = playChargedScript(81);
const chargedRunC = playChargedScript(82);
check('charged shot emission is deterministic for a fixed seed and cadence',
  emissionHash(chargedRunA.vfx) === emissionHash(chargedRunB.vfx));
check('charged shot emission changes with the seed',
  emissionHash(chargedRunA.vfx) !== emissionHash(chargedRunC.vfx));

// --- lifecycle -------------------------------------------------------------------
const statsMid = runA.vfx.stats;
check('script leaves live particles', statsMid.live.glow > 0 || statsMid.live.puff > 0,
  JSON.stringify(statsMid.live));
check('slash ribbon recorded the swing', runA.trail !== null && statsMid.live.trails >= 0);
for (let frame = 0; frame < 300; frame += 1) runA.vfx.update(DT, camera);
const statsLate = runA.vfx.stats;
check('all bursts expire', statsLate.live.glow === 0 && statsLate.live.puff === 0,
  JSON.stringify(statsLate.live));
check('stopped ribbon returns to the pool', statsLate.live.trails === 0);
check('no draws once everything is dead', statsLate.drawCalls === 0, `drawCalls ${statsLate.drawCalls}`);

// --- speed-gated vehicle/glider trails ------------------------------------------
{
  const target = new THREE.Object3D();
  const trails = createMotionTrails({
    anchors: [[-0.5, 0, 0], [0.5, 0, 0]],
    target,
  });
  trails.update(DT, camera);
  target.position.x += 0.02; // 1.2 m/s: below the 10 m/s default threshold
  trails.update(DT, camera);
  check('motion trails stay hidden at low speed', trails.active === false);
  target.position.x += 1;
  trails.update(DT, camera);
  target.position.x += 1;
  trails.update(DT, camera);
  check('motion trails appear only at speed', trails.active === true);
  check('motion trails use short bounded histories',
    trails.settings.lifetime <= 0.25 && trails.settings.maxPoints <= 24);
  for (let frame = 0; frame < 20; frame += 1) trails.update(DT, camera);
  check('motion trails taper away after the target slows', trails.active === false);
  trails.dispose();
}

// --- objective ring: open hoop, never a filled screen veil -----------------------
{
  const ring = createGlowRing();
  const meshes = ring.root.children.filter((child) => child.isMesh);
  check('glow ring uses only open torus geometry',
    meshes.length === 2 && meshes.every((mesh) => mesh.geometry.type === 'TorusGeometry'));
  check('glow ring keeps line halo restrained',
    ring.settings.haloOpacity <= 0.2
      && ring.settings.tubeRatio * ring.settings.haloScale <= 0.14);
  check('glow ring point light is local and shadow-free',
    ring.pointGlow.distance <= ring.settings.radius * 2 && ring.pointGlow.castShadow === false);
  const ringCamera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  ringCamera.position.set(0, 0, 3.4);
  ring.update(DT, ringCamera);
  check('glow ring fades before becoming a screen-sized obstruction',
    ring.settings.maxScreenFraction <= 0.25
      && ring.root.userData.screenVisibility < 0.35
      && ring.core.material.opacity < ring.settings.coreOpacity * 0.35);
  ring.dispose();
}

// --- fireball flight + detonation ------------------------------------------------
{
  let hitAt = null;
  const vfx = createVfxSystem({ heightAt, seed: 7 });
  vfx.update(DT, camera);
  const bolt = vfx.spawn('fireball', {
    from: [0, 1.2, 0], velocity: [6, 2, 0], onHit: (at) => { hitAt = at; },
  });
  const x0 = bolt.position.x;
  vfx.update(DT, camera);
  check('fireball integrates forward', bolt.position.x > x0);
  check('fireball sheds embers in flight', vfx.stats.live.glow > 0);
  for (let frame = 0; frame < 240 && bolt.alive; frame += 1) vfx.update(DT, camera);
  check('fireball detonates on the ground', !bolt.alive && hitAt !== null);
  check('detonation lands near ground level', hitAt !== null && Math.abs(hitAt[1]) < 0.3,
    hitAt ? `y=${hitAt[1].toFixed(3)}` : 'no hit');
  check('explosion leaves smoke puffs', vfx.stats.live.puff > 0);
}

// --- layered charged projectile: registration, travel, impact, expiry, pooling --
{
  const document = createVfxEffectFromTemplate('charged-energy-shot', {
    id: 'player.arm-cannon.charged',
    parameters: { impactPower: 2.8, particleRate: 220 },
  });
  const vfx = createVfxSystem({
    effectDocuments: [document],
    heightAt: null,
    seed: 27,
    settings: { shared: { maxLayeredProjectiles: 2 } },
  });
  check('constructor registers portable effect documents',
    vfx.registeredEffectIds.includes(document.id)
      && vfx.stats.registeredEffects === 1
      && vfx.getEffectDefinition(document.id).spawnType === 'chargedShot');
  let missingInputRejected = false;
  try {
    vfx.spawn(document.id, { velocity: [8, 0, 0] });
  } catch (error) {
    missingInputRejected = error.message.includes('requires spawn input "from"');
  }
  check('registered effects fail fast on missing required runtime inputs',
    missingInputRejected);
  let invalidTierRejected = false;
  try {
    vfx.spawn(document.id, {
      from: [0, 1, 0],
      qualityTier: 'potato',
      velocity: [8, 0, 0],
    });
  } catch (error) {
    invalidTierRejected = error.message.includes('qualityTier');
  }
  check('registered effects reject unknown runtime enum values',
    invalidTierRejected);
  let hitAt = null;
  const shot = vfx.spawn(document.id, {
    charge: 0.9,
    from: [0, 1.2, 0],
    maxLife: 2,
    onHit: (at) => { hitAt = at; },
    velocity: [8, 0, 0],
  });
  const x0 = shot.position.x;
  const chargedVisual = vfx.root.getObjectByName('VfxChargedShot');
  const circulationVisual = chargedVisual.getObjectByName('VfxChargedShotCirculatingEnergy');
  const circulationCore = circulationVisual.getObjectByName('VfxChargedShotCirculationCore');
  const circulationStart = Float32Array.from(
    circulationCore.geometry.getAttribute('position').array,
  );
  const releaseRing = vfx.root.getObjectByName('VfxChargedShotReleaseRing');
  const releaseRingCore = releaseRing.getObjectByName('VfxChargedShotReleaseRingCore');
  const releaseRingGlow = releaseRing.getObjectByName('VfxChargedShotReleaseRingGlow');
  const releaseRingStart = new THREE.Vector3();
  vfx.root.updateMatrixWorld(true);
  releaseRing.getWorldPosition(releaseRingStart);
  const visualForward = new THREE.Vector3(-1, 0, 0)
    .applyQuaternion(chargedVisual.quaternion)
    .normalize();
  check('charged shot authored nose is aligned with runtime velocity',
    visualForward.dot(shot.velocity.clone().normalize()) > 0.999);
  check('release ring starts behind the projectile nose',
    releaseRingStart.x < shot.position.x);
  const releaseBounds = releaseRingCore.geometry.boundingBox;
  const releaseSpans = ['x', 'y', 'z'].map(
    (axis) => releaseBounds.max[axis] - releaseBounds.min[axis],
  );
  check('release remains a compact ring while retaining authored firing-axis depth',
    releaseRing.userData.spatialType === 'warped-ring'
      && releaseRing.children.filter((child) => child.isMesh).length === 2
      && releaseRing.children.every((child) => child.geometry.type !== 'TorusGeometry')
      && releaseRingCore.geometry.drawRange.count > 0
      && releaseRingGlow.geometry.drawRange.count > 0
      && releaseSpans[0] > 0.12
      && releaseSpans[0] < releaseSpans[1] * 0.85
      && releaseSpans[1] > 0.8
      && releaseSpans[2] > 0.8,
    JSON.stringify(releaseSpans));
  const releaseRingPositions = releaseRingCore.geometry.getAttribute('position');
  const releaseRingRanges = ['x', 'y', 'z'].map((axis) => {
    let min = Infinity;
    let max = -Infinity;
    for (
      let index = 0;
      index < (releaseRingCore.geometry.userData.segments + 1) * 2;
      index += 1
    ) {
      const value = releaseRingPositions[`get${axis.toUpperCase()}`](index);
      min = Math.min(min, value);
      max = Math.max(max, value);
    }
    return max - min;
  });
  check('release ring centerline is non-flat across all three local axes',
    releaseRingRanges.every((range) => range > 0.08),
    JSON.stringify(releaseRingRanges));
  for (let frame = 0; frame < 8; frame += 1) vfx.update(DT, camera);
  vfx.root.updateMatrixWorld(true);
  const releaseRingDuringTravel = new THREE.Vector3();
  releaseRing.getWorldPosition(releaseRingDuringTravel);
  check('release ring stays anchored to the source while the projectile travels',
    Math.abs(releaseRingDuringTravel.x - releaseRingStart.x) < 1e-5);
  check('registered charged shot integrates forward', shot.position.x > x0 && shot.alive);
  check('circulating energy uses one bounded glow/core ribbon pair',
    circulationVisual.visible
      && circulationVisual.children.filter((child) => child.isMesh).length === 2
      && circulationVisual.userData.configuredArcs <= 8
      && circulationCore.geometry.drawRange.count > 0);
  const mainBody = chargedVisual.getObjectByName('VfxChargedShotDirectionalCore');
  const outerShell = chargedVisual.getObjectByName('VfxChargedShotEnergyShell');
  check('circulating energy is transformed against the main body, not the outer shell',
    circulationVisual.scale.distanceTo(mainBody.scale) < 1e-8
      && circulationVisual.scale.y < outerShell.scale.y * 0.6);
  const circulationPositions = circulationCore.geometry.getAttribute('position');
  const centerAt = (segment) => {
    const left = new THREE.Vector3().fromBufferAttribute(circulationPositions, segment * 2);
    const right = new THREE.Vector3().fromBufferAttribute(circulationPositions, segment * 2 + 1);
    return left.add(right).multiplyScalar(0.5);
  };
  const planeA = centerAt(0);
  const planeB = centerAt(5);
  const planeC = centerAt(10);
  const planeD = centerAt(15);
  let circulationRadialExtent = 0;
  for (let segment = 0; segment <= 18; segment += 1) {
    const center = centerAt(segment);
    circulationRadialExtent = Math.max(
      circulationRadialExtent,
      Math.hypot(center.y, center.z),
    );
  }
  check('circulating lightning keeps a visible authored clearance from the main body',
    circulationRadialExtent > 0.62,
    `local radial extent ${circulationRadialExtent}`);
  const nonPlanarVolume = Math.abs(
    planeB.clone().sub(planeA).dot(
      planeC.clone().sub(planeA).cross(planeD.clone().sub(planeA)),
    ),
  );
  check('each seeded circulation path is uneven across all three local axes',
    nonPlanarVolume > 1e-5,
    `signed-volume ${nonPlanarVolume}`);
  check('seeded circulating paths actually move over the projectile volume',
    circulationStart.some((
      value,
      index,
    ) => Math.abs(value - circulationCore.geometry.getAttribute('position').array[index]) > 1e-5));
  check('layered charged shot reports its mesh-led draw cost',
    vfx.stats.live.chargedShots === 1 && vfx.stats.drawCalls >= 5,
    JSON.stringify(vfx.stats));
  check('charged shot sheds deterministic travel particles',
    vfx.stats.live.glow > 0);
  vfx.update(0.1, camera);
  vfx.update(0.1, camera);
  check('release ring retires after its one-shot release segment',
    !releaseRing.visible && chargedVisual.userData.phase === 'travel');
  shot.explode([1.4, 1.2, 0], [-1, 0, 0]);
  vfx.update(DT, camera);
  check('external collision resolves impact and host callback exactly once',
    !shot.alive && hitAt?.[0] === 1.4);
  check('charged impact emits a layered burst',
    vfx.stats.live.glow > 0 && vfx.stats.live.puff > 0);

  const mobile = vfx.spawn(document.id, {
    from: [0, 3, 0],
    qualityTier: 'mobile',
    velocity: [3, 0, 0],
  });
  vfx.update(DT, camera);
  const mobileVisual = vfx.root.children.find((child) => (
    child.name === 'VfxChargedShot' && child.visible
  ));
  check('quality tier applies documented layer fallbacks and streak budget',
    mobile.alive
      && vfx.stats.drawCalls <= 7
      && mobileVisual?.getObjectByName('VfxChargedShotCirculatingEnergy')?.visible === false,
    JSON.stringify(vfx.stats));
  mobile.cancel();

  const drawnDocument = setVfxEffectParameterValues(document, {
    customProfileEnabled: true,
    silhouetteProfile: handDrawnProfile,
  });
  vfx.registerEffectDocument(drawnDocument, { overwrite: true });
  const drawnShot = vfx.spawn(document.id, {
    from: [0, 3.25, 0],
    velocity: [3, 0, 0],
  });
  const drawnVisual = vfx.root.children.find((child) => (
    child.name === 'VfxChargedShot' && child.visible
  ));
  const drawnCore = drawnVisual?.getObjectByName('VfxChargedShotDirectionalCore');
  check('runtime revolves the authored half-profile through core, shell, and filaments',
    drawnVisual?.userData.silhouetteMode === 'drawn-mirrored'
      && drawnCore?.geometry === drawnVisual.getObjectByName('VfxChargedShotEnergyShell')?.geometry
      && drawnCore?.geometry.userData.axialProfile.length === handDrawnProfile.length);
  drawnShot.cancel();
  vfx.registerEffectDocument(document, { overwrite: true });

  const sequenced = vfx.spawn(document.id, {
    chargeDuration: 0.1,
    from: [0, 3.5, 0],
    velocity: [3, 0, 0],
  });
  const sequenceX = sequenced.position.x;
  vfx.update(0.05, camera);
  check('full-flow spawn holds at the source during charge',
    sequenced.phase === 'charge' && sequenced.position.x === sequenceX);
  vfx.update(0.06, camera);
  check('charge transitions explicitly into release before travel integration',
    sequenced.phase === 'release' && sequenced.position.x === sequenceX);
  vfx.update(DT, camera);
  check('sequenced projectile travels only after release begins',
    sequenced.position.x > sequenceX);
  sequenced.cancel();

  const expiring = vfx.spawn(document.id, {
    from: [0, 4, 0],
    maxLife: 0.05,
    velocity: [1, 0, 0],
  });
  for (let frame = 0; frame < 5; frame += 1) vfx.update(DT, camera);
  check('charged shot expiry is graceful and does not call impact collision',
    !expiring.alive);

  for (let index = 0; index < 7; index += 1) {
    vfx.spawn(document.id, {
      from: [0, 2 + index * 0.1, 0],
      maxLife: 3,
      velocity: [2, 0, 0],
    });
  }
  check('layered projectile pool remains within its hard budget',
    vfx.stats.pooled.chargedShots <= 2 && vfx.stats.live.chargedShots <= 2,
    JSON.stringify(vfx.stats));

  const retuned = setVfxEffectParameterValues(document, { coreIntensity: 4.2 });
  const registered = vfx.registerEffectDocument(retuned, { overwrite: true });
  check('live runtime can atomically replace a compiled effect definition',
    registered.settings.coreIntensity === 4.2
      && vfx.getEffectDefinition(document.id).settings.coreIntensity === 4.2);
  check('registered definition snapshots cannot mutate runtime state', (() => {
    const snapshot = vfx.getEffectDefinition(document.id);
    snapshot.settings.coreIntensity = 0;
    return vfx.getEffectDefinition(document.id).settings.coreIntensity === 4.2;
  })());
  vfx.clear();
  check('clear returns all charged instances to warm pools',
    vfx.stats.live.chargedShots === 0 && vfx.stats.drawCalls === 0);
}

// --- circulating-energy determinism -----------------------------------------------
function circulationGeometrySnapshot(seed) {
  const document = setVfxEffectParameterValues(chargedDocument, {
    energyMotionTheme: stormTheme.id,
    ...stormTheme.settings,
  });
  const vfx = createVfxSystem({
    effectDocuments: [document],
    heightAt: null,
    seed,
  });
  vfx.spawn(document.id, {
    from: [0, 1, 0],
    velocity: [2, 0, 0],
  });
  vfx.update(0.117, camera);
  const geometry = vfx.root
    .getObjectByName('VfxChargedShotCirculationCore')
    .geometry;
  const snapshot = Array.from(
    geometry.getAttribute('position').array.slice(0, 240),
  );
  vfx.dispose();
  return snapshot;
}

const circulationA = circulationGeometrySnapshot(901);
const circulationB = circulationGeometrySnapshot(901);
const circulationC = circulationGeometrySnapshot(902);
check('same seed and cadence reproduce circulating-energy geometry',
  JSON.stringify(circulationA) === JSON.stringify(circulationB));
check('a different seed changes circulating-energy geometry',
  circulationA.some((value, index) => Math.abs(value - circulationC[index]) > 1e-6));

// --- budgets: ring buffer wraps, never grows ---------------------------------------
{
  const vfx = createVfxSystem({ heightAt, seed: 5, settings: { shared: { maxParticles: 256 } } });
  vfx.update(DT, camera);
  for (let i = 0; i < 60; i += 1) vfx.spawn('impact', { at: [0, 1, 0], power: 2 });
  const stats = vfx.stats;
  check('overflow stays within capacity', stats.live.glow <= stats.capacity,
    `live ${stats.live.glow} vs capacity ${stats.capacity}`);
  const glowMesh = vfx.root.children.find((m) => m.name === 'VfxBurstGlow');
  check('instanceCount capped at ring capacity', glowMesh.geometry.instanceCount <= Math.ceil(256 * 0.75));
}

// --- trail pool bound ---------------------------------------------------------------
{
  const vfx = createVfxSystem({ heightAt, seed: 9, settings: { shared: { maxTrails: 3 } } });
  const anchors = Array.from({ length: 6 }, () => new THREE.Object3D());
  vfx.update(DT, camera);
  for (const anchor of anchors) vfx.spawn('slash', { follow: anchor });
  check('trail pool never exceeds maxTrails', vfx.stats.pooled.trails <= 3,
    `pooled ${vfx.stats.pooled.trails}`);
}

// --- per-spawn overrides + disabled effects ------------------------------------------
{
  const built = emitImpact({
    at: [0, 0, 0], now: 0, overrides: { sparkCount: 3 }, rng: rngFor(1),
    settings: createVfxSystem({ seed: 1 }).settings,
  });
  check('look override rescales the burst (3 sparks + flash + shockwave)', built.glow.length === 5,
    `${built.glow.length} records`);
  check('shockwave off removes the ring record', emitImpact({
    at: [0, 0, 0], now: 0, overrides: { shockwave: false, sparkCount: 3 }, rng: rngFor(1),
    settings: createVfxSystem({ seed: 1 }).settings,
  }).glow.length === 4);

  const disabled = createVfxSystem({ seed: 1, effects: { impact: false } });
  disabled.update(DT, camera);
  disabled.spawn('impact', { at: [0, 0, 0] });
  check('disabled effect emits nothing', disabled.stats.live.glow === 0);
}

// --- hit-stop --------------------------------------------------------------------
{
  const vfx = createVfxSystem({ heightAt, seed: 3 });
  vfx.update(DT, camera);
  vfx.setTimeScale(0);
  const before = vfx.stats.time;
  for (let frame = 0; frame < 10; frame += 1) vfx.update(DT, camera);
  check('timeScale 0 freezes the VFX clock', vfx.stats.time === before);
}

// --- pure-builder geometry contracts ----------------------------------------------
{
  const settings = createVfxSystem({ seed: 1 }).settings;
  const impact = emitImpact({ at: [0, 0, 0], normal: [0, 1, 0], now: 0, rng: rngFor(2), settings });
  const sparks = impact.glow.filter((r) => r.kind === 0);
  check('impact sparks spray off the +Y surface (vy ≥ 0)', sparks.every((r) => r.vy >= 0));
  check('impact includes exactly one star flash', impact.glow.filter((r) => r.kind === 2).length === 1);
  check('impact includes exactly one shockwave ring', impact.glow.filter((r) => r.kind === 5).length === 1);

  const landing = emitLanding({ at: [0, 0, 0], now: 0, power: 1, rng: rngFor(3), settings });
  const radial = landing.puff.every((r) => {
    const outward = (r.x - 0) * r.vx + (r.z - 0) * r.vz;
    return outward >= 0;
  });
  check('landing puffs move radially outward', radial);
  const doubled = emitLanding({ at: [0, 0, 0], now: 0, power: 2, rng: rngFor(3), settings });
  check('landing power scales the ring count', doubled.puff.length > landing.puff.length);
}

// --- weapon-move library (pure — poses, events, weight scaling) ------------------
{
  for (const id of MOVE_IDS) {
    const move = getMove(id);
    const total = moveDuration(move, 1);
    check(`move "${id}" has a positive duration`, total > 0);
    check(`move "${id}" is slower for heavy weapons`, moveDuration(move, 1.6) > total);

    const events = collectMoveEvents(move, 0, total + 1e-6, 1);
    const starts = events.filter((e) => e.do === 'trailStart');
    const stops = events.filter((e) => e.do === 'trailStop');
    check(`move "${id}" balances trail start/stop`, starts.length === stops.length && starts.length > 0,
      `${starts.length} starts / ${stops.length} stops`);
    check(`move "${id}" lands at least one impact`, events.some((e) => e.do === 'impact'));

    // Continuity: sampling densely never teleports the grip (catches
    // mismatched keys across phase boundaries).
    let previous = sampleMovePose(move, 0, 1);
    let maxStep = 0;
    for (let i = 1; i <= 120; i += 1) {
      const pose = sampleMovePose(move, (total * i) / 120, 1);
      const dx = pose.p[0] - previous.p[0];
      const dy = pose.p[1] - previous.p[1];
      const dz = pose.p[2] - previous.p[2];
      maxStep = Math.max(maxStep, Math.hypot(dx, dy, dz));
      previous = pose;
    }
    check(`move "${id}" pose path is continuous`, maxStep < 0.9, `max step ${maxStep.toFixed(2)} m`);

    // Frame-rate independence: chunked collection fires the same beats once.
    const chunked = [];
    for (let t = 0, dt = total / 7; t < total + dt; t += dt) {
      chunked.push(...collectMoveEvents(move, t, Math.min(t + dt, total + 1e-6), 1));
    }
    check(`move "${id}" events are frame-rate independent`,
      chunked.length === events.length
      && chunked.every((e, i) => e.do === events[i].do && Math.abs(e.time - events[i].time) < 1e-9));
  }

  const plunge = getMove('plunge');
  check('plunge decomposes into the Dragoon phases',
    plunge.phases.map((p) => p.id).join(',') === 'crouch,leap,apex,dive,landfall,recover');
  const beats = collectMoveEvents(plunge, 0, moveDuration(plunge, 1) + 1e-6, 1).map((e) => e.do);
  check('plunge beats run dust → trail → impact+landing',
    beats.indexOf('dust') < beats.indexOf('trailStart')
    && beats.indexOf('trailStart') < beats.indexOf('impact')
    && beats.includes('landing'));
  const lightHit = collectMoveEvents(plunge, 0, 99, 0.65).find((e) => e.do === 'impact');
  const heavyHit = collectMoveEvents(plunge, 0, 99, 1.6).find((e) => e.do === 'impact');
  check('impact power scales with weapon weight', heavyHit.power > lightHit.power,
    `${lightHit.power.toFixed(2)} vs ${heavyHit.power.toFixed(2)}`);
}

console.log(failures === 0 ? '\nverify-vfxgen: all checks passed' : `\nverify-vfxgen: ${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
