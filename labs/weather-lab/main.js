import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import './weatherLab.css';

import { createLabRenderer, whenRendererReady } from '../shared/rendererFactory.js';
import { createStylizedTerrain } from '../../src/stylizedTerrain.js';
import { createStylizedWorld } from '../../src/stylizedWorld.js';
import { createRainStudyStage } from './rainStudyStage.js';
import {
  WEATHER_SETTING_FIELD_SCHEMA,
  WEATHER_SETTING_GROUPS,
  getWeatherPresetOptions,
  getWeatherStyleOptions,
  mergeWeatherSettings,
  parseWeatherPresetDocument,
  rebaseWeatherSettingsStyle,
  registerWeatherPresetDocument,
  resolveWeatherPreset,
  resolveWeatherStyleName,
  serializeWeatherPresetDocument,
} from '../../src/weather/index.js';

// Conditions only — the weather STYLE axis (default / call_me_sensei) is an
// identity applied under every condition via WeatherSystem#setStyle, not a
// condition entry.
const CATEGORY_ORDER = [
  ['Fair', ['clear', 'partlyCloudy', 'cloudy', 'overcast', 'windy']],
  ['Visibility', ['haze', 'mist', 'fog']],
  ['Rain & storms', ['drizzle', 'rain', 'heavyRain', 'thunderstorm', 'tropicalStorm']],
  ['Winter', ['snow', 'heavySnow', 'blizzard', 'sleet', 'freezingRain', 'hail']],
  ['Arid', ['dustStorm', 'sandstorm']],
];

const ICONS = Object.freeze({
  blizzard: '🌨️', call_me_sensei: '🌤️', clear: '☀️', cloudy: '☁️', drizzle: '🌦️',
  dustStorm: '🌫️', fog: '🌁', freezingRain: '🧊', hail: '🧊', haze: '🌤️', heavyRain: '🌧️',
  heavySnow: '❄️', mist: '〰️', overcast: '☁️', partlyCloudy: '⛅', rain: '🌧️',
  sandstorm: '🏜️', sleet: '🌨️', snow: '❄️', thunderstorm: '⛈️', tropicalStorm: '🌀', windy: '💨',
});

const elements = Object.fromEntries([
  'conditionCount', 'exportWeather', 'importWeather', 'lightningTrigger', 'particleStatus',
  'rendererStatus', 'saveWeather', 'surfaceStatus', 'transitionDuration', 'transitionValue',
  'weatherConditions', 'weatherFields', 'weatherFile', 'weatherGroups', 'weatherName', 'weatherStatus',
  'weatherStyle',
].map((id) => [id, document.getElementById(id)]));

const WEATHER_STORAGE_KEY = 'toonlab.weatherPresets.v1';

function loadLocalWeatherDocuments() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// Register local and Pro-hydrated documents before interpreting a deep link,
// otherwise a valid `?weatherPreset=<creation id>` falls back to Clear.
for (const document of loadLocalWeatherDocuments()) {
  registerWeatherPresetDocument(document, { overwrite: true });
}

function bootSelection(urlParams = new URLSearchParams(window.location.search)) {
  const requestedCondition = urlParams.get('weatherCondition') || urlParams.get('weatherPreset');
  const styleIds = new Set(getWeatherStyleOptions().map((entry) => entry.id));
  // Compatibility: the old picker put Call Me Sensei in the condition list.
  // Treat that value as a style and use Clear as the condition.
  const legacyStyle = styleIds.has(requestedCondition) ? requestedCondition : null;
  const conditionId = legacyStyle
    ? (urlParams.get('weatherScenario') || 'clear')
    : (requestedCondition || 'clear');
  const knownCondition = getWeatherPresetOptions().find((entry) => entry.id === conditionId);
  return {
    condition: knownCondition?.id ?? 'clear',
    style: resolveWeatherStyleName(
      urlParams.get('weatherStyle') ?? legacyStyle ?? 'call_me_sensei',
    ),
  };
}

const boot = bootSelection();
let activePreset = boot.condition;
let activeStyle = boot.style;
let sourceCondition = boot.condition;
let activeGroup = 'atmosphere';
let draft = resolveWeatherPreset(activePreset, { style: activeStyle }).settings;
let world = null;
let rainStudy = null;

function updateSelectionUrl() {
  const params = new URLSearchParams(window.location.search);
  if (activePreset) params.set('weatherCondition', activePreset);
  else params.delete('weatherCondition');
  // Remove the historical ambiguous key once the user interacts.
  params.delete('weatherPreset');
  params.delete('weatherScenario');
  params.set('weatherStyle', activeStyle);
  const query = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}

function colorToHex(rgb) {
  return `#${new THREE.Color().setRGB(...rgb).getHexString()}`;
}

function hexToColor(value) {
  const color = new THREE.Color(value);
  return [color.r, color.g, color.b];
}

function formatNumber(value, step = 0.01) {
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return Number(value).toFixed(decimals);
}

function downloadJson(text, filename) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function slug(value) {
  return String(value || 'custom-weather').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'custom-weather';
}

function updateStatus() {
  if (!world?.weather) return;
  const state = world.weather.state;
  const precipitation = state.settings.precipitation;
  const surface = state.settings.surface;
  const drawn = world.weather.precipitation.geometry.instanceCount;
  const impacts = rainStudy?.activeImpacts ?? 0;
  elements.weatherStatus.textContent = `${state.preset ?? 'Custom'} · ${precipitation.type === 'none' ? 'no precipitation' : `${Math.round(precipitation.intensity * 100)}% ${precipitation.type}`}${state.transitioning ? ` · transitioning ${Math.round(state.transitionProgress * 100)}%` : ''}`;
  elements.surfaceStatus.textContent = `Wet ${Math.round(surface.wetness * 100)}% · Snow ${Math.round(surface.snowCover * 100)}% · Ice ${Math.round(surface.ice * 100)}%`;
  elements.particleStatus.textContent = `${drawn.toLocaleString()} particles · ${impacts} impacts`;
}

function applyDraft({ transition = false } = {}) {
  if (!world?.weather) return;
  if (transition) {
    world.weather.transitionTo(draft, { duration: Number(elements.transitionDuration.value) || 0 });
  } else {
    world.weather.applySettings(draft);
  }
  activePreset = null;
  updateSelectionUrl();
  renderConditions();
  updateStatus();
}

function renderConditions() {
  const options = new Map(getWeatherPresetOptions().map((entry) => [entry.id, entry]));
  elements.conditionCount.textContent = `${options.size} conditions`;
  elements.weatherConditions.innerHTML = '';

  const renderCategory = (category, ids) => {
    const title = document.createElement('div');
    title.className = 'wl-category';
    title.textContent = category;
    elements.weatherConditions.appendChild(title);
    for (const id of ids) {
      const option = options.get(id);
      if (!option) continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `wl-condition${activePreset === id ? ' active' : ''}`;
      button.innerHTML = `<span class="wl-condition-icon">${ICONS[id] ?? '☁️'}</span><span class="wl-condition-copy"><strong>${option.label}</strong><small>${option.description}</small></span>`;
      button.addEventListener('click', () => {
        activePreset = id;
        sourceCondition = id;
        draft = resolveWeatherPreset(id, { style: activeStyle }).settings;
        elements.weatherName.value = option.label;
        world?.weather?.transitionTo(id, { duration: Number(elements.transitionDuration.value) || 0 });
        updateSelectionUrl();
        renderConditions();
        renderFields();
      });
      elements.weatherConditions.appendChild(button);
      options.delete(id);
    }
  };

  for (const [category, ids] of CATEGORY_ORDER) renderCategory(category, ids);
  if (options.size) renderCategory('Custom', Array.from(options.keys()));
}

function syncConditionName() {
  const selected = getWeatherPresetOptions().find((entry) => entry.id === activePreset);
  if (selected) elements.weatherName.value = selected.label;
}

function saveLocalWeatherDocuments(documents) {
  try {
    localStorage.setItem(WEATHER_STORAGE_KEY, JSON.stringify(documents));
  } catch {
    elements.weatherStatus.textContent = 'This browser could not save the weather condition locally.';
  }
}

function renderStyles() {
  elements.weatherStyle.innerHTML = '';
  for (const style of getWeatherStyleOptions()) {
    const option = document.createElement('option');
    option.value = style.id;
    option.textContent = style.label;
    elements.weatherStyle.appendChild(option);
  }
  elements.weatherStyle.value = activeStyle;
}

function commitField(groupId, key, value) {
  draft = mergeWeatherSettings(draft, { [groupId]: { [key]: value } });
  applyDraft();
}

function createFieldControl(field, value) {
  if (field.type === 'boolean') {
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = Boolean(value);
    input.addEventListener('change', () => commitField(field.group, field.key, input.checked));
    return input;
  }
  if (field.type === 'select') {
    const select = document.createElement('select');
    for (const option of field.options) {
      const element = document.createElement('option');
      element.value = option;
      element.textContent = option.replace(/([A-Z])/g, ' $1').replace(/^./, (char) => char.toUpperCase());
      select.appendChild(element);
    }
    select.value = value;
    select.addEventListener('change', () => commitField(field.group, field.key, select.value));
    return select;
  }
  if (field.type === 'color') {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colorToHex(value);
    input.addEventListener('input', () => commitField(field.group, field.key, hexToColor(input.value)));
    return input;
  }
  if (field.type === 'nullableColor') {
    const wrap = document.createElement('div');
    wrap.className = 'wl-null-color';
    const input = document.createElement('input');
    input.type = 'color';
    input.value = colorToHex(value ?? [0.72, 0.83, 0.94]);
    input.disabled = value === null;
    input.addEventListener('input', () => commitField(field.group, field.key, hexToColor(input.value)));
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.textContent = value === null ? 'Scene' : 'Custom';
    toggle.addEventListener('click', () => {
      commitField(field.group, field.key, value === null ? hexToColor(input.value) : null);
      renderFields();
    });
    wrap.append(input, toggle);
    return wrap;
  }
  if (field.type === 'vector2' || field.type === 'vector3') {
    const wrap = document.createElement('div');
    wrap.className = 'wl-vector';
    const size = field.type === 'vector2' ? 2 : 3;
    for (let index = 0; index < size; index += 1) {
      const input = document.createElement('input');
      input.type = 'number';
      input.step = '0.01';
      input.value = formatNumber(value[index], 0.01);
      input.addEventListener('change', () => {
        const next = [...value];
        next[index] = Number(input.value) || 0;
        commitField(field.group, field.key, next);
      });
      wrap.appendChild(input);
    }
    return wrap;
  }
  const wrap = document.createElement('div');
  wrap.className = 'wl-value-wrap';
  const input = document.createElement('input');
  input.type = 'range';
  input.min = field.range.min;
  input.max = field.range.max;
  input.step = field.range.step;
  input.value = value;
  const output = document.createElement('span');
  output.className = 'wl-value';
  output.textContent = formatNumber(value, field.range.step);
  input.addEventListener('input', () => {
    output.textContent = formatNumber(input.value, field.range.step);
    commitField(field.group, field.key, Number(input.value));
  });
  wrap.append(input, output);
  return wrap;
}

function renderGroups() {
  elements.weatherGroups.innerHTML = '';
  for (const group of WEATHER_SETTING_GROUPS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = activeGroup === group.id ? 'active' : '';
    button.textContent = group.label.split(' ')[0];
    button.title = group.label;
    button.addEventListener('click', () => {
      activeGroup = group.id;
      renderGroups();
      renderFields();
    });
    elements.weatherGroups.appendChild(button);
  }
}

function renderFields() {
  const group = WEATHER_SETTING_GROUPS.find((entry) => entry.id === activeGroup);
  elements.weatherFields.innerHTML = `<p class="wl-group-intro">${group.description}</p>`;
  for (const field of Object.values(WEATHER_SETTING_FIELD_SCHEMA[activeGroup])) {
    const row = document.createElement('label');
    row.className = 'wl-field';
    const title = document.createElement('span');
    title.className = 'wl-field-label';
    title.textContent = field.label;
    const description = document.createElement('span');
    description.className = 'wl-field-description';
    description.textContent = field.description;
    row.append(title, createFieldControl(field, draft[activeGroup][field.key]), description);
    elements.weatherFields.appendChild(row);
  }
}

async function buildStage() {
  const mount = document.getElementById('stage');
  const renderer = createLabRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  mount.appendChild(renderer.domElement);
  await whenRendererReady(renderer);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.3, 2000);
  camera.position.set(55, 34, 68);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.49;

  const terrain = createStylizedTerrain({
    archetype: 'rollingPlains',
    depth: 10,
    height: 28,
    seed: 73,
    segments: 112,
    size: 180,
    waterCoverage: 0.24,
  });
  const terrainRoot = new THREE.Group();
  terrainRoot.add(terrain.root);
  scene.add(terrainRoot);
  const stageCenter = new THREE.Vector3().copy(terrain.spawn);
  stageCenter.y += 0.72;
  rainStudy = createRainStudyStage({ mount, scene, center: stageCenter, seed: 73 });
  const focus = new THREE.Object3D();
  focus.position.copy(rainStudy.focus);
  scene.add(focus);
  camera.position.copy(rainStudy.focus).add(new THREE.Vector3(34, 27, 38));
  controls.target.copy(rainStudy.focus).add(new THREE.Vector3(0, 2.2, 0));
  controls.minDistance = 16;
  controls.maxDistance = 110;

  world = await createStylizedWorld({
    ambientfx: false,
    camera,
    contactShadows: false,
    flowers: false,
    followTarget: focus,
    grass: false,
    renderer,
    scene,
    // Weather Lab prioritizes rapid condition transitions. Cloud shadows are
    // still driven by weather, while the separate sun-depth pass stays off so
    // preset edits never revalidate a whole scene of shadow render objects.
    shadows: false,
    terrain: { heightAt: terrain.heightAt, root: terrainRoot, size: terrain.meshExtent },
    trees: false,
    understory: false,
    water: {
      level: terrain.waterLevel,
      passes: false,
      simulation: false,
      splashes: false,
    },
    weather: { preset: activePreset, seed: 73, style: activeStyle },
  });

  world.weather.addEventListener('lightning', () => {
    elements.weatherStatus.textContent = 'Lightning strike — thunder event scheduled by distance';
  });
  world.weather.addEventListener('thunder', (event) => {
    elements.weatherStatus.textContent = `Thunder event · ${Math.round(event.distance)}m strike distance`;
  });

  let previousFrameTime = performance.now();
  renderer.setAnimationLoop((frameTime = performance.now()) => {
    const delta = Math.min(Math.max((frameTime - previousFrameTime) / 1000, 0), 0.1);
    previousFrameTime = frameTime;
    controls.update();
    world.update(delta);
    const weatherState = world.weather.state;
    rainStudy.update(delta, weatherState.settings, world.weather.lightningLight?.intensity ?? 0);
    renderer.render(scene, camera);
    updateStatus();
    document.body.dataset.modelReady = 'true';
    document.body.dataset.weatherLabReady = 'true';
  });

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);
  elements.rendererStatus.textContent = document.body.dataset.rendererBackend ?? 'WebGPU';
}

elements.transitionDuration.addEventListener('input', () => {
  elements.transitionValue.textContent = `${Number(elements.transitionDuration.value).toFixed(1)}s`;
});
elements.weatherStyle.addEventListener('change', () => {
  const nextStyle = elements.weatherStyle.value;
  draft = rebaseWeatherSettingsStyle(draft, {
    condition: sourceCondition,
    fromStyle: activeStyle,
    toStyle: nextStyle,
  });
  activeStyle = nextStyle;
  world?.weather?.setStyle(activeStyle);
  world?.weather?.applySettings(draft);
  updateSelectionUrl();
  renderConditions();
  renderFields();
  elements.weatherStatus.textContent = `Applied ${getWeatherStyleOptions().find((entry) => entry.id === activeStyle)?.label ?? activeStyle} across every weather condition`;
});
elements.lightningTrigger.addEventListener('click', () => world?.weather?.triggerLightning());
elements.exportWeather.addEventListener('click', () => {
  const id = slug(elements.weatherName.value);
  downloadJson(serializeWeatherPresetDocument(id, { label: elements.weatherName.value, settings: draft }), `${id}.weather-preset.json`);
});
elements.importWeather.addEventListener('click', () => elements.weatherFile.click());
elements.weatherFile.addEventListener('change', async () => {
  const file = elements.weatherFile.files?.[0];
  if (!file) return;
  const result = parseWeatherPresetDocument(await file.text());
  if (!result.ok) {
    elements.weatherStatus.textContent = result.errors.join(' ');
    return;
  }
  registerWeatherPresetDocument(result.value, { overwrite: true });
  activePreset = result.value.id;
  sourceCondition = result.value.id;
  draft = result.value.settings;
  elements.weatherName.value = result.value.label;
  world?.weather?.transitionTo(draft, { duration: Number(elements.transitionDuration.value) || 0 });
  updateSelectionUrl();
  renderConditions();
  renderFields();
  elements.weatherStatus.textContent = `Imported ${result.value.label}`;
});
elements.saveWeather.addEventListener('click', () => {
  const id = slug(elements.weatherName.value);
  const document = JSON.parse(serializeWeatherPresetDocument(id, { label: elements.weatherName.value, settings: draft }));
  const saved = loadLocalWeatherDocuments().filter((entry) => entry.id !== id);
  saved.push(document);
  saveLocalWeatherDocuments(saved);
  registerWeatherPresetDocument(document, { overwrite: true });
  activePreset = id;
  sourceCondition = id;
  updateSelectionUrl();
  renderConditions();
  elements.weatherStatus.textContent = `Saved ${document.label} locally`;
});

syncConditionName();
updateSelectionUrl();
renderConditions();
renderStyles();
renderGroups();
renderFields();
buildStage().catch((error) => {
  console.error('Weather Lab failed to start:', error);
  elements.weatherStatus.textContent = `Weather Lab failed: ${error.message}`;
  document.body.dataset.modelReady = 'error';
});
