// Lighting Lab — authors the game's lighting VOCABULARY (styles + fixtures)
// and previews it in real scenes, the way the rock lab generates rock
// variations. Everything on screen is driven through one createLightingSystem
// instance: the lab never creates lights directly (scene dressing in
// scenes.js is meshes only).

import './lightingLab.css';

import * as THREE from 'three';

import { installRendererSwitcher } from '../shared/rendererSwitcher.js';
import {
  buildLightingStyleFromSample,
  createLightFixtureDocument,
  createLightFixtureGeneratorRecipe,
  createLightingStyleGeneratorRecipe,
  createLightingStylePresetDocument,
  createLightingSystem,
  ensureAreaLightSupport,
  getLightFixtureGeneratorFamilyOptions,
  getLightFixtureOptions,
  getLightingStyleGeneratorFamilyOptions,
  getLightingStylePresetOptions,
  parseLightingStylePresetDocument,
  registerLightFixture,
  registerLightFixtureDocument,
  registerLightingStylePresetDocument,
  resolveFixturePlacement,
  resolveLightColor,
  resolveLightFixture,
  resolveLightFixtureGeneratorRecipe,
  resolveLightingStylePreset,
  sampleLightingStyle,
  serializeLightFixtureDocument,
  serializeLightingStylePresetDocument,
} from '../../src/lighting/index.js';
// resolveGeneratorRecipe + buildLightingStyleFromSample mirror
// resolveLightingStyleGeneratorRecipe, but keep the sampled palette around so
// the lock checkboxes can pin subtrees on the next generate.
import { resolveGeneratorRecipe } from '../../src/core/generation.js';

import { installWalkPreviewController, WALK_PREVIEW_TITLE } from '../shared/walkPreview.js';
import { exportToonLabManifest, slug } from './lightingApi.js';
import { createLightingLabStage, disposeSceneRoot } from './lightingStage.js';
import { SCENES } from './scenes.js';

const STORAGE_KEYS = Object.freeze({
  fixtures: 'toonlab.lighting-lab.fixtures',
  styles: 'toonlab.lighting-lab.styles',
});

const DEFAULT_STYLE_ID = 'call-me-sensei';
const CANDIDATE_COUNT = 6;
const VARIATION_COUNT = 6;
const GRADIENT_HOURS = Object.freeze([0, 3, 6, 9, 12, 15, 18, 21]);
const PLAY_HOURS_PER_SECOND = 0.5;

// Lab-side weather lenses. The full weather system integrates through this
// exact hook — setWeatherModulation is the single multiplicative layer, so
// weather never becomes a second writer on sun/fog/exposure.
const WEATHER_MODULATIONS = Object.freeze({
  clear: {},
  overcast: { sunIntensityScale: 0.55, ambientScale: 1.1, fogColorTint: [0.85, 0.85, 0.9] },
  rain: { sunIntensityScale: 0.35, ambientScale: 0.9, exposureScale: 0.95, fogColorTint: [0.7, 0.75, 0.85] },
  storm: { sunIntensityScale: 0.18, ambientScale: 0.75, exposureScale: 0.9, fogColorTint: [0.5, 0.55, 0.7], fixtureScale: 1.15 },
});

const elements = Object.fromEntries([
  'candidateGrid', 'copyRuntime', 'diagWarnings', 'exportFixture', 'exportStyle', 'exportToonLab',
  'fixtureFamily', 'fixtureList', 'fixtureSeed', 'fixtureVariations', 'generateFixture', 'generateStyle',
  'importError', 'importStyle', 'lockExposure', 'lockFog', 'lockSun', 'placeFixture', 'placementCount',
  'placementList', 'saveStyle', 'sceneHub', 'sceneTabs', 'stage', 'statusBackend', 'statusFps',
  'statusLights', 'statusMessage', 'statusShadowed', 'styleCandidates', 'styleDescription', 'styleFamily',
  'styleFile', 'styleName', 'stylePreset', 'styleSeed', 'timeOfDay', 'timePlay', 'timeValue', 'toast',
  'weatherSelect',
].map((id) => [id, document.getElementById(id)]));

const state = {
  lastStyleSample: null,
  playing: false,
  sceneId: 'outdoor',
  // Deterministic counter for user placements/rerolls — never Math.random.
  seedCounter: 100,
  selectedFixtureId: 'cms-lantern',
  styleSettings: null,
  styleSource: { id: DEFAULT_STYLE_ID, kind: 'preset' },
  variationBase: 1,
};

const placements = [];
let stage = null;
let system = null;
let labFog = null;
let toastTimer = 0;
let labDisposed = false;

// ---------------------------------------------------------------------------
// Small utilities.

function clone(value) {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
}

function showToast(message, { error = false } = {}) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle('error', error);
  elements.toast.classList.add('visible');
  toastTimer = window.setTimeout(() => elements.toast.classList.remove('visible'), 2400);
}

function setStatus(message) {
  elements.statusMessage.textContent = message;
}

function downloadText(text, filename, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  requestAnimationFrame(() => URL.revokeObjectURL(url));
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
  showToast(successMessage);
}

function formatTime(hour) {
  const totalMinutes = Math.round(Number(hour) * 60) % (24 * 60);
  return `${String(Math.floor(totalMinutes / 60)).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`;
}

function cssColor(rgb, gain = 1) {
  const channels = rgb.map((channel) => Math.round(Math.min(Math.max(channel * gain, 0), 1) * 255));
  return `rgb(${channels[0]}, ${channels[1]}, ${channels[2]})`;
}

function nextSeed() {
  state.seedCounter += 1;
  return state.seedCounter;
}

function loadDocs(key) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function persistDoc(key, doc) {
  const list = loadDocs(key).filter((entry) => entry.id !== doc.id);
  list.push(doc);
  localStorage.setItem(key, JSON.stringify(list));
}

// ---------------------------------------------------------------------------
// Style workflow.

function currentStyleDocument() {
  const id = slug(elements.styleName.value, 'custom-lighting-style');
  return createLightingStylePresetDocument(id, {
    label: elements.styleName.value.trim() || id,
    settings: state.styleSettings,
  });
}

function populateStylePresets(selectedId = null) {
  const savedIds = new Set(loadDocs(STORAGE_KEYS.styles).map((entry) => entry.id));
  elements.stylePreset.innerHTML = '';
  const groups = { builtIn: document.createElement('optgroup'), saved: document.createElement('optgroup') };
  groups.builtIn.label = 'Built-in';
  groups.saved.label = 'Saved locally';
  for (const option of getLightingStylePresetOptions()) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.label;
    item.title = option.description || '';
    (savedIds.has(option.id) ? groups.saved : groups.builtIn).appendChild(item);
  }
  elements.stylePreset.appendChild(groups.builtIn);
  if (groups.saved.children.length > 0) elements.stylePreset.appendChild(groups.saved);
  if (selectedId) elements.stylePreset.value = selectedId;
}

function applyStyleSettings(settings, { label, source, description = '' }) {
  state.styleSettings = settings;
  state.styleSource = source;
  system.setStyle(settings);
  configureSunShadows();
  if (label) elements.styleName.value = label;
  elements.styleDescription.textContent = description;
  syncTimeUi();
}

function selectStylePreset(id) {
  const option = getLightingStylePresetOptions().find((entry) => entry.id === id);
  if (!option) return showToast(`Unknown style "${id}"`, { error: true });
  applyStyleSettings(resolveLightingStylePreset(id), {
    description: option.description,
    label: option.label,
    source: { id, kind: 'preset' },
  });
  elements.stylePreset.value = id;
  setStatus(`Style: ${option.label}`);
}

function activeLocks() {
  const locks = [];
  // Checkbox → generator subtree locks: sun palette, fog/atmosphere palette,
  // exposure. Subtree locks pin every leaf under the path.
  if (elements.lockSun.checked) locks.push('sun');
  if (elements.lockFog.checked) locks.push('atmosphere');
  if (elements.lockExposure.checked) locks.push('exposure');
  return locks;
}

function resolveStyleFromGenerator(family, seed) {
  const locks = activeLocks();
  const configuration = {};
  if (state.lastStyleSample) {
    for (const lock of locks) {
      if (state.lastStyleSample[lock] !== undefined) configuration[lock] = clone(state.lastStyleSample[lock]);
    }
  }
  const recipe = createLightingStyleGeneratorRecipe(`lab-style-${family}-${seed}`, {
    configuration, family, locks, seed,
  });
  const sampled = resolveGeneratorRecipe(recipe, { sanitizeSettings: (value) => value });
  return {
    sampled,
    settings: buildLightingStyleFromSample(sampled, recipe.configuration?.style ?? {}),
  };
}

function generateStyle() {
  const family = elements.styleFamily.value;
  const seed = Math.max(Math.round(Number(elements.styleSeed.value) || 1), 1);
  const { sampled, settings } = resolveStyleFromGenerator(family, seed);
  state.lastStyleSample = sampled;
  const familyLabel = getLightingStyleGeneratorFamilyOptions().find((entry) => entry.id === family)?.label ?? family;
  applyStyleSettings(settings, {
    description: `Generated from the ${familyLabel} family, seed ${seed}.`,
    label: `${familyLabel} ${seed}`,
    source: { kind: 'settings' },
  });
  elements.stylePreset.selectedIndex = -1;
  setStatus(`Generated ${familyLabel} style · seed ${seed}`);
}

function renderCandidates() {
  const family = elements.styleFamily.value;
  const baseSeed = Math.max(Math.round(Number(elements.styleSeed.value) || 1), 1);
  elements.candidateGrid.innerHTML = '';
  for (let index = 0; index < CANDIDATE_COUNT; index += 1) {
    const seed = baseSeed + index;
    const { sampled, settings } = resolveStyleFromGenerator(family, seed);
    const frames = GRADIENT_HOURS.map((hour) => sampleLightingStyle(settings, hour));
    const stop = (colorAt) => GRADIENT_HOURS
      .map((hour, hourIndex) => `${colorAt(frames[hourIndex])} ${Math.round((hourIndex / (GRADIENT_HOURS.length - 1)) * 100)}%`)
      .join(', ');
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'll-candidate';
    tile.title = `Apply seed ${seed}`;
    const sunStrip = document.createElement('span');
    sunStrip.className = 'll-candidate-sun';
    sunStrip.style.background = `linear-gradient(90deg, ${stop((frame) => cssColor(frame.sunColor, Math.min(frame.sunIntensity + 0.25, 1)))})`;
    const fogStrip = document.createElement('span');
    fogStrip.className = 'll-candidate-fog';
    fogStrip.style.background = `linear-gradient(90deg, ${stop((frame) => cssColor(frame.fogColor))})`;
    const label = document.createElement('small');
    label.textContent = `seed ${seed}`;
    tile.append(sunStrip, fogStrip, label);
    tile.addEventListener('click', () => {
      state.lastStyleSample = sampled;
      const familyLabel = getLightingStyleGeneratorFamilyOptions().find((entry) => entry.id === family)?.label ?? family;
      applyStyleSettings(settings, {
        description: `Generated from the ${familyLabel} family, seed ${seed}.`,
        label: `${familyLabel} ${seed}`,
        source: { kind: 'settings' },
      });
      elements.styleSeed.value = String(seed);
      elements.stylePreset.selectedIndex = -1;
      for (const other of elements.candidateGrid.children) other.classList.toggle('active', other === tile);
      setStatus(`Applied candidate seed ${seed}`);
    });
    elements.candidateGrid.appendChild(tile);
  }
}

function saveStyleLocal() {
  const doc = currentStyleDocument();
  registerLightingStylePresetDocument(doc, { overwrite: true });
  persistDoc(STORAGE_KEYS.styles, doc);
  populateStylePresets(doc.id);
  state.styleSource = { id: doc.id, kind: 'preset' };
  showToast(`Saved ${doc.label} locally`);
  setStatus(`Style: ${doc.label} (saved)`);
}

function importStyleFile(text, filename = 'import') {
  const result = parseLightingStylePresetDocument(text);
  if (!result.ok) {
    elements.importError.textContent = result.errors.join(' ');
    showToast('Style import failed', { error: true });
    return;
  }
  elements.importError.textContent = '';
  registerLightingStylePresetDocument(result.value, { overwrite: true });
  persistDoc(STORAGE_KEYS.styles, result.value);
  populateStylePresets(result.value.id);
  selectStylePreset(result.value.id);
  showToast(`Imported ${result.value.label ?? filename}`);
}

function runtimeSnippet() {
  const styleExpression = state.styleSource.kind === 'preset'
    ? `'${state.styleSource.id}'`
    : JSON.stringify(currentStyleDocument(), null, 2);
  return [
    "import { createLightingSystem } from '@call-me-sensei/toonlab/lighting';",
    `const lighting = createLightingSystem({ scene, renderer, camera, style: ${styleExpression} });`,
    'lighting.attach({ fog: scene.fog, driveSunPosition: true });',
    '// per frame: lighting.update(dt, camera);',
    '',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Fixture workflow.

function selectFixture(id) {
  state.selectedFixtureId = id;
  renderFixtureList();
  renderVariations();
}

function renderFixtureList() {
  const options = getLightFixtureOptions();
  const categories = new Map();
  for (const option of options) {
    if (!categories.has(option.category)) categories.set(option.category, []);
    categories.get(option.category).push(option);
  }
  elements.fixtureList.innerHTML = '';
  for (const [category, entries] of [...categories.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const title = document.createElement('div');
    title.className = 'll-category';
    title.textContent = category;
    elements.fixtureList.appendChild(title);
    for (const option of entries) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `ll-fixture${state.selectedFixtureId === option.id ? ' active' : ''}`;
      const name = document.createElement('strong');
      name.textContent = option.label;
      const description = document.createElement('small');
      description.textContent = option.description || option.id;
      button.append(name, description);
      button.addEventListener('click', () => selectFixture(option.id));
      elements.fixtureList.appendChild(button);
    }
  }
}

function renderVariations() {
  elements.fixtureVariations.innerHTML = '';
  const fixtureId = state.selectedFixtureId;
  let fixture;
  try {
    fixture = resolveLightFixture(fixtureId);
  } catch {
    return;
  }
  for (let index = 0; index < VARIATION_COUNT; index += 1) {
    const seed = state.variationBase + index;
    const placement = resolveFixturePlacement(fixture, { seed });
    const descriptor = placement.descriptor;
    const rgb = resolveLightColor(descriptor.color);
    const intensity = descriptor.intensity ?? {};
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'll-swatch';
    swatch.style.setProperty('--swatch-color', cssColor(rgb));
    swatch.style.setProperty('--swatch-glow', String(Math.min(Math.max((intensity.artisticMultiplier ?? 1) * 0.6, 0.25), 1)));
    swatch.title = [
      `seed ${seed}`,
      `${Math.round(Number(intensity.value) || 0)} ${intensity.unit ?? ''}`.trim(),
      `×${(intensity.artisticMultiplier ?? 1).toFixed(2)}`,
      descriptor.distance ? `reach ${Number(descriptor.distance).toFixed(1)}m` : null,
    ].filter(Boolean).join(' · ');
    const label = document.createElement('small');
    label.textContent = String(seed);
    swatch.appendChild(label);
    swatch.addEventListener('click', () => placeFixtureInView(fixtureId, seed));
    elements.fixtureVariations.appendChild(swatch);
  }
}

function fixtureLabel(id) {
  return getLightFixtureOptions().find((entry) => entry.id === id)?.label ?? id;
}

// Preview override: fixture descriptors default their cull distance to the
// light's reach, which is right for shipped worlds but hides far placements
// from the authoring camera. The lab widens it so nothing pops while orbiting.
const LAB_PLACEMENT_OVERRIDES = Object.freeze({ maxDistance: 200 });

function addPlacement(fixtureId, position, { origin = 'user', overrides = null, seed, target = null } = {}) {
  const merged = { ...LAB_PLACEMENT_OVERRIDES, ...(overrides ?? {}) };
  const handle = system.place(fixtureId, position, { overrides: merged, seed, target });
  placements.push({ fixtureId, handle, origin, overrides: merged, position, seed, target });
  renderPlacements();
  return handle;
}

function removePlacementRecord(record) {
  record.handle.remove();
  const index = placements.indexOf(record);
  if (index >= 0) placements.splice(index, 1);
  renderPlacements();
}

function clearPlacements() {
  for (const record of placements) record.handle.remove();
  placements.length = 0;
  renderPlacements();
}

function placeFixtureInView(fixtureId, seed = nextSeed()) {
  let fixture;
  try {
    fixture = resolveLightFixture(fixtureId);
  } catch (error) {
    return showToast(error.message, { error: true });
  }
  // Ground-level anchor a few meters in front of the camera; the fixture's
  // authored height comes from its base descriptor.
  const baseHeight = Array.isArray(fixture.base.position) ? Number(fixture.base.position[1]) || 2 : 2;
  const forward = new THREE.Vector3();
  stage.camera.getWorldDirection(forward);
  forward.y = 0;
  if (forward.lengthSq() < 1e-4) forward.set(0, 0, -1);
  forward.normalize();
  const anchor = stage.camera.position.clone().addScaledVector(forward, 7);
  addPlacement(fixtureId, [anchor.x, baseHeight, anchor.z], { seed });
  setStatus(`Placed ${fixtureLabel(fixtureId)} · seed ${seed}`);
}

function renderPlacements() {
  elements.placementCount.textContent = String(placements.length);
  elements.placementList.innerHTML = '';
  for (const record of placements) {
    const row = document.createElement('div');
    row.className = 'll-placement';
    const copy = document.createElement('span');
    copy.className = 'll-placement-copy';
    const name = document.createElement('strong');
    name.textContent = fixtureLabel(record.fixtureId);
    const meta = document.createElement('small');
    meta.textContent = `seed ${record.seed}${record.origin === 'scene' ? ' · scene' : ''}`;
    copy.append(name, meta);
    const reroll = document.createElement('button');
    reroll.type = 'button';
    reroll.textContent = '↻';
    reroll.title = 'Reroll variation (same position, new seed)';
    reroll.addEventListener('click', () => {
      record.handle.remove();
      record.seed = nextSeed();
      record.handle = system.place(record.fixtureId, record.position, {
        overrides: { ...(record.overrides ?? LAB_PLACEMENT_OVERRIDES) }, seed: record.seed, target: record.target,
      });
      renderPlacements();
      setStatus(`Rerolled ${fixtureLabel(record.fixtureId)} · seed ${record.seed}`);
    });
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = '×';
    remove.title = 'Remove placement';
    remove.addEventListener('click', () => removePlacementRecord(record));
    row.append(copy, reroll, remove);
    elements.placementList.appendChild(row);
  }
}

function generateFixture() {
  const family = elements.fixtureFamily.value;
  const seed = Math.max(Math.round(Number(elements.fixtureSeed.value) || 1), 1);
  const settings = resolveLightFixtureGeneratorRecipe(
    createLightFixtureGeneratorRecipe(`lab-fixture-${family}-${seed}`, { family, seed }),
  );
  const familyLabel = getLightFixtureGeneratorFamilyOptions().find((entry) => entry.id === family)?.label ?? family;
  const id = `generated-${family}-${seed}`;
  const definition = {
    description: `Generated from the ${familyLabel} family, seed ${seed}.`,
    label: `${familyLabel} ${seed}`,
    settings,
  };
  registerLightFixture(id, definition, { overwrite: true });
  persistDoc(STORAGE_KEYS.fixtures, createLightFixtureDocument(id, definition));
  selectFixture(id);
  setStatus(`Generated fixture ${definition.label}`);
  showToast(`Registered ${definition.label}`);
}

function exportSelectedFixture() {
  const id = state.selectedFixtureId;
  let settings;
  try {
    settings = resolveLightFixture(id);
  } catch (error) {
    return showToast(error.message, { error: true });
  }
  const text = serializeLightFixtureDocument(id, { label: fixtureLabel(id), settings });
  downloadText(text, `${id}.light-fixture.json`);
  showToast(`Exported ${fixtureLabel(id)}`);
}

// ---------------------------------------------------------------------------
// Scenes.

// Scenes are built lazily on first activation and cached (the outdoor world
// is a full composed stylized world — rebuilding it per switch would make
// tab changes heavy). Switching hides the previous instance and removes its
// tracked fixture placements; instances are disposed at page teardown.
const sceneCache = new Map();
let activeInstance = null;
let sceneToken = 0;

function setSystemSunVisible(visible) {
  const sun = system.manager.group.children.find((child) => child.isDirectionalLight);
  if (sun) sun.visible = visible;
}

async function selectScene(id) {
  const entry = SCENES.find((scene) => scene.id === id) ?? SCENES[0];
  const token = ++sceneToken;
  state.sceneId = entry.id;
  renderSceneTabs();
  clearPlacements();
  if (activeInstance) {
    activeInstance.root.visible = false;
    activeInstance = null;
  }
  let instance = sceneCache.get(entry.id);
  if (!instance) {
    setStatus(`Building ${entry.label}…`);
    try {
      instance = await entry.build({ camera: stage.camera, renderer: stage.renderer, scene: stage.scene });
    } catch (error) {
      console.error(`Scene "${entry.id}" failed to build:`, error);
      showToast(`Scene failed: ${error.message}`, { error: true });
      return;
    }
    sceneCache.set(entry.id, instance);
    stage.scene.add(instance.root);
    if (token !== sceneToken) {
      instance.root.visible = false;
      return;
    }
  }
  if (token !== sceneToken) return;
  instance.root.visible = true;
  activeInstance = instance;

  // Attachment mode follows the scene: composed worlds keep their own sun
  // rig (shadow-follow stays with the world, the style drives color/
  // intensity/fog/exposure); standalone scenes let the style also drive the
  // system's own sun position.
  if (instance.world) {
    stage.scene.fog = instance.world.fog;
    system.attachWorld(instance.world, { environmentRoot: instance.environmentRoot ?? null });
    setSystemSunVisible(false);
  } else {
    // Scenes may bring their own fog (the ported water stage ships the
    // playground's fog distances) plus attach options (the interior hands
    // over its lamp rig so the style's fixtureScale drives the practicals);
    // the style still owns the fog COLOR through the system.
    const sceneFog = instance.attach?.fog ?? labFog;
    stage.scene.fog = sceneFog;
    system.attach({
      driveSunPosition: true,
      fog: sceneFog,
      environmentRoot: instance.environmentRoot ?? null,
      ...(instance.attach ?? {}),
    });
    setSystemSunVisible(true);
    configureSunShadows();
  }

  for (const fixtureDef of [...(entry.fixtures ?? []), ...(instance.fixtures ?? [])]) {
    addPlacement(fixtureDef.fixture, fixtureDef.position, {
      origin: 'scene',
      overrides: fixtureDef.overrides ?? null,
      seed: fixtureDef.seed,
      target: fixtureDef.target ?? null,
    });
  }
  const view = instance.view ?? entry;
  stage.setView(view.camera, view.target);
  if (entry.timeOfDay !== undefined) setTimeOfDay(entry.timeOfDay);
  document.body.dataset.lightingScene = entry.id;
  // Every scene ships a walkable mannequin; keep the controls hint in view.
  setStatus(instance.walker ? `Scene: ${entry.label} · ${WALK_PREVIEW_TITLE}` : `Scene: ${entry.label}`);
}

function renderSceneTabs() {
  elements.sceneTabs.innerHTML = '';
  for (const entry of SCENES) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = entry.label;
    button.classList.toggle('active', entry.id === state.sceneId);
    button.addEventListener('click', () => selectScene(entry.id));
    elements.sceneTabs.appendChild(button);
  }
}

// ---------------------------------------------------------------------------
// Time, weather, sun shadows, status.

function syncTimeUi() {
  elements.timeOfDay.value = String(system.timeOfDay);
  elements.timeValue.textContent = formatTime(system.timeOfDay);
}

function setTimeOfDay(hour) {
  system.setTimeOfDay(hour);
  syncTimeUi();
}

function configureSunShadows() {
  // The system owns its sun light; the lab only sizes the shadow frustum so
  // the whole preview scene stays inside the map. Scenes may override the
  // footprint (the ported water stage uses the playground's exact numbers).
  const sun = system.manager.group.children.find((child) => child.isDirectionalLight);
  if (!sun?.shadow) return;
  const config = {
    bias: -0.0004,
    bottom: -34,
    far: 220,
    left: -34,
    near: 1,
    normalBias: 0.03,
    right: 34,
    top: 34,
    ...(activeInstance?.sunShadow ?? {}),
  };
  // One shared 4096 map for every scene: resizing would force disposing the
  // live shadow texture, and on three r185 WebGPU a destroyed shadow map
  // stays referenced by in-flight bind groups ("used in a submit" errors) —
  // same hazard class the stage's uniform-group guard covers.
  if (!sun.shadow.map) sun.shadow.mapSize.set(4096, 4096);
  sun.shadow.camera.left = config.left;
  sun.shadow.camera.right = config.right;
  sun.shadow.camera.top = config.top;
  sun.shadow.camera.bottom = config.bottom;
  sun.shadow.camera.near = config.near;
  sun.shadow.camera.far = config.far;
  sun.shadow.bias = config.bias;
  sun.shadow.normalBias = config.normalBias;
  sun.shadow.camera.updateProjectionMatrix();
}

function updateStatusBar(fps) {
  const stats = system.stats();
  elements.statusLights.textContent = `${stats.activeLightCount}/${stats.totalLightCount} lights`;
  elements.statusShadowed.textContent = `${stats.shadowedLightCount} shadowed`;
  elements.statusBackend.textContent = document.body.dataset.rendererBackend || 'initializing';
  elements.statusFps.textContent = `${Math.round(fps)} fps`;
  const warnings = stats.warnings ?? [];
  elements.diagWarnings.innerHTML = '';
  if (warnings.length === 0) {
    const item = document.createElement('div');
    item.className = 'll-warning ok';
    item.textContent = 'All lights fit the active budgets.';
    elements.diagWarnings.appendChild(item);
  } else {
    for (const warning of warnings) {
      const item = document.createElement('div');
      item.className = 'll-warning';
      item.textContent = warning;
      elements.diagWarnings.appendChild(item);
    }
  }
  document.body.dataset.activeLightCount = String(stats.activeLightCount);
  document.body.dataset.totalLightCount = String(stats.totalLightCount);
  document.body.dataset.shadowedLightCount = String(stats.shadowedLightCount);
}

// ---------------------------------------------------------------------------
// Persistence + boot.

function restoreLocalDocuments() {
  for (const doc of loadDocs(STORAGE_KEYS.styles)) {
    try {
      registerLightingStylePresetDocument(doc, { overwrite: true });
    } catch (error) {
      console.warn('Skipped saved lighting style:', error.message);
    }
  }
  for (const doc of loadDocs(STORAGE_KEYS.fixtures)) {
    try {
      registerLightFixtureDocument(doc, { overwrite: true });
    } catch (error) {
      console.warn('Skipped saved light fixture:', error.message);
    }
  }
}

function disposeLab() {
  if (labDisposed) return;
  labDisposed = true;
  clearPlacements();
  system?.dispose();
  for (const instance of sceneCache.values()) {
    instance.dispose?.();
    disposeSceneRoot(instance.root);
  }
  sceneCache.clear();
  activeInstance = null;
  stage?.dispose();
  document.body.dataset.labDisposed = 'true';
}

function bindUi() {
  elements.sceneHub.addEventListener('change', () => {
    if (elements.sceneHub.value !== '/lighting-lab/') location.assign(elements.sceneHub.value);
  });
  elements.stylePreset.addEventListener('change', () => selectStylePreset(elements.stylePreset.value));
  elements.generateStyle.addEventListener('click', generateStyle);
  elements.styleCandidates.addEventListener('click', renderCandidates);
  elements.saveStyle.addEventListener('click', saveStyleLocal);
  elements.exportStyle.addEventListener('click', () => {
    const doc = currentStyleDocument();
    downloadText(serializeLightingStylePresetDocument(doc), `${doc.id}.lighting-style.json`);
    showToast(`Exported ${doc.label}`);
  });
  elements.importStyle.addEventListener('click', () => elements.styleFile.click());
  elements.styleFile.addEventListener('change', async () => {
    const file = elements.styleFile.files?.[0];
    elements.styleFile.value = '';
    if (!file) return;
    importStyleFile(await file.text(), file.name);
  });
  elements.copyRuntime.addEventListener('click', () => copyText(runtimeSnippet(), 'Runtime snippet copied'));
  elements.exportToonLab.addEventListener('click', () => {
    // The ToonLab manifest describes exactly what is on screen: a rig built
    // from the live placements' resolved descriptors (system.manager.recipe).
    const manifest = exportToonLabManifest({
      id: 'lab-rig',
      name: 'Lighting Lab Rig',
      lights: clone(system.manager.recipe.lights),
    });
    downloadText(manifest, 'lab-rig.toonlab-lighting.json');
    showToast('ToonLab manifest downloaded');
  });
  elements.placeFixture.addEventListener('click', () => placeFixtureInView(state.selectedFixtureId));
  elements.generateFixture.addEventListener('click', generateFixture);
  elements.exportFixture.addEventListener('click', exportSelectedFixture);
  elements.weatherSelect.addEventListener('change', () => {
    system.setWeatherModulation(WEATHER_MODULATIONS[elements.weatherSelect.value] ?? {});
    setStatus(`Weather: ${elements.weatherSelect.value}`);
  });
  elements.timeOfDay.addEventListener('input', () => {
    system.setTimeOfDay(Number(elements.timeOfDay.value));
    elements.timeValue.textContent = formatTime(system.timeOfDay);
  });
  elements.timePlay.addEventListener('click', () => {
    state.playing = !state.playing;
    elements.timePlay.classList.toggle('active', state.playing);
    elements.timePlay.textContent = state.playing ? '❚❚' : '▶';
  });
}

function populateGeneratorFamilies() {
  elements.styleFamily.innerHTML = '';
  for (const option of getLightingStyleGeneratorFamilyOptions()) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.label;
    item.title = option.description;
    elements.styleFamily.appendChild(item);
  }
  elements.styleFamily.value = 'call-me-sensei';
  elements.fixtureFamily.innerHTML = '';
  for (const option of getLightFixtureGeneratorFamilyOptions()) {
    const item = document.createElement('option');
    item.value = option.id;
    item.textContent = option.label;
    item.title = option.description;
    elements.fixtureFamily.appendChild(item);
  }
  elements.fixtureFamily.value = 'cms-practical';
}

async function boot() {
  document.body.dataset.scene = 'lighting-lab';
  restoreLocalDocuments();
  populateStylePresets(DEFAULT_STYLE_ID);
  populateGeneratorFamilies();
  renderFixtureList();
  renderVariations();
  renderPlacements();
  bindUi();

  stage = await createLightingLabStage({ mount: elements.stage });
  installRendererSwitcher();
  // Area-light (rect/tube) fixtures need the LTC tables before realization.
  await ensureAreaLightSupport();

  labFog = stage.scene.fog;
  system = createLightingSystem({
    camera: stage.camera,
    // Authoring budget: previewing a whole fixture vocabulary needs more
    // headroom than the style's shipped 'balanced' default.
    quality: 'high',
    renderer: stage.renderer,
    scene: stage.scene,
    style: DEFAULT_STYLE_ID,
    timeOfDay: 12,
  });
  selectStylePreset(DEFAULT_STYLE_ID);
  // selectScene attaches the system per scene (attachWorld for composed
  // worlds, attach + driveSunPosition for standalone scenes).
  await selectScene(state.sceneId);
  syncTimeUi();

  // One shared walk-preview controller (WASD/arrows walk, Shift runs, Space
  // jumps; typing in inputs is ignored) dispatching to the active scene's
  // walker. Ground height and horizontal collision come from the scene, so
  // the mannequin wades the shore, lands jumps on dunes, and bumps into the
  // interior's furniture. The orbit camera stays live; the follow target
  // only tracks the walker while it is moving.
  installWalkPreviewController({
    camera: stage.camera,
    controls: stage.controls,
    engine: { onFrame: stage.onFrame },
    getActions: () => activeInstance?.walker?.actions ?? null,
    getEnabled: () => Boolean(activeInstance?.walker?.object),
    getWalker: () => activeInstance?.walker?.object ?? null,
    groundY: (x, z) => activeInstance?.walker?.groundHeightAt?.(x, z) ?? 0,
    moveHorizontal: (step, context) => {
      const move = activeInstance?.walker?.moveHorizontal;
      if (move) move(step, context);
      else context.walker.position.add(step);
    },
  });

  let statusClock = 0;
  let frameCount = 0;
  stage.onFrame((delta) => {
    if (state.playing) {
      system.advanceTime(delta * PLAY_HOURS_PER_SECOND);
      syncTimeUi();
    }
    activeInstance?.update?.(delta, system.frame);
    system.update(delta, stage.camera);
    frameCount += 1;
    statusClock += delta;
    if (statusClock >= 0.5) {
      updateStatusBar(frameCount / statusClock);
      statusClock = 0;
      frameCount = 0;
    }
    if (!document.body.dataset.lightingReady) {
      document.body.dataset.lightingReady = 'true';
      document.body.dataset.modelReady = 'true';
    }
  });

  document.body.dataset.uiReady = 'true';
  document.body.dataset.labReady = 'true';
  document.body.dataset.runtimeReady = 'true';
  setStatus('Lighting Lab ready');

  window.__lightingLab = {
    version: 2,
    stage,
    system,
    getState: () => ({
      placements: placements.map((record) => ({ fixture: record.fixtureId, origin: record.origin, seed: record.seed })),
      playing: state.playing,
      sceneId: state.sceneId,
      selectedFixtureId: state.selectedFixtureId,
      styleSource: clone(state.styleSource),
      timeOfDay: system.timeOfDay,
      walkerPosition: activeInstance?.walker?.object?.position?.toArray?.() ?? null,
    }),
    actions: {
      dispose: disposeLab,
      generateStyle,
      placeFixture: (id, seed) => placeFixtureInView(id ?? state.selectedFixtureId, seed ?? nextSeed()),
      selectFixture,
      setScene: selectScene,
      setStylePreset: selectStylePreset,
      setTimeOfDay,
      setWeather: (id) => {
        elements.weatherSelect.value = id;
        elements.weatherSelect.dispatchEvent(new Event('change'));
      },
      stats: () => system.stats(),
    },
  };
  window.addEventListener('pagehide', disposeLab, { once: true });
  window.addEventListener('beforeunload', disposeLab, { once: true });
}

boot().catch((error) => {
  console.error('Lighting Lab failed to start:', error);
  document.body.dataset.lightingReady = 'error';
  document.body.dataset.modelReady = 'error';
  document.body.dataset.uiReady = 'error';
  setStatus(`Lighting Lab failed: ${error.message}`);
  showToast(`Lighting Lab failed: ${error.message}`, { error: true });
});
