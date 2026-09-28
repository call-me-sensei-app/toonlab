import { buildLocalCharacterModelOptions } from './localModelCatalog.js';

export const SCENE_HUB_OPTIONS = Object.freeze([
  // The root page is the Labs home (card grid over every lab); the hub select
  // never resolves to it, but listing it first gives every lab a way back.
  Object.freeze({
    id: 'home',
    label: 'ToonLab — All Labs',
    path: '/',
    search: '',
  }),
  // The Shader Lab moved off the root page when the Labs home landed there.
  Object.freeze({
    id: 'character',
    label: 'Character Shader Lab',
    path: '/shader-lab/',
    search: '',
  }),
  // Vegetation is one renderer family with separate Tree, Grass, and Flower
  // shader profiles. Asset/species generation labs remain separate below.
  Object.freeze({
    id: 'grassLab',
    label: 'Grass Generation Lab',
    path: '/grass-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'vegetationMaterialLab',
    label: 'Vegetation Shader · Legacy aggregate',
    path: '/vegetation-shader-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'treeShaderLab',
    label: 'Tree Shader Lab',
    path: '/tree-shader-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'grassShaderLab',
    label: 'Grass Shader Lab',
    path: '/grass-shader-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'flowerShaderLab',
    label: 'Flower Shader Lab',
    path: '/flower-shader-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'rockShaderLab',
    label: 'Rock & Geology Shader Lab',
    path: '/rock-shader-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'groundShaderLab',
    label: 'Terrain & Ground Shader Lab',
    path: '/ground-shader-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'manufacturedMaterialLab',
    label: 'Manufactured Surface Shader Lab',
    path: '/manufactured-material-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'environmentLab',
    label: 'Environment Shader Lab',
    path: '/environment-lab/',
    search: '',
  }),
  // Walkable indoor environment scene with the schema-driven environment
  // settings HUD. Renders the first environment discovered in the gitignored
  // assets-local/environments/ drop-in (bring your own scene — see
  // docs/environment.md); without one it surfaces a load banner. (The Shader
  // Lab's static environment view is still reachable directly via /?env=1.)
  Object.freeze({
    id: 'environmentWalkable',
    label: 'Indoor Playground (walkable)',
    path: '/playground/',
    search: '?scene=indoor',
  }),
  Object.freeze({
    id: 'controller',
    label: 'Controller Test',
    path: '/playground/',
    search: '',
  }),
  // The standalone schema-driven water editor; the walkable beach diorama
  // stays reachable as the Water Playground below (and doubles as the Water
  // Lab's "Preview in scene" target).
  Object.freeze({
    id: 'skyLab',
    label: 'Sky Shader Lab',
    path: '/sky-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'cloudShaderLab',
    label: 'Cloud Shader Lab',
    path: '/cloud-shader-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'skyCloudLab',
    label: 'Sky & Cloud Lab',
    path: '/sky-cloud-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'atmosphericConditionLab',
    label: 'Atmospheric Condition Lab',
    path: '/atmospheric-condition-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'waterLab',
    label: 'Water Lab',
    path: '/water-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'waterPlayground',
    label: 'Water Playground (walkable)',
    path: '/playground/',
    search: '?scene=water',
  }),
  Object.freeze({
    id: 'rockLab',
    label: 'Rock Lab',
    path: '/rock-lab/',
    search: '',
  }),
  // Standalone pages (own vite entries), not hub-routed scenes: `path` sends
  // the hub select there, and resolveSceneHubId recognizes them by pathname.
  Object.freeze({
    id: 'treeLab',
    label: 'Tree Generation Lab',
    path: '/tree-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'flowerLab',
    label: 'Flower Generation Lab',
    path: '/flower-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'debrisLab',
    label: 'Debris Lab',
    path: '/debris-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'textureLab',
    label: 'Texture Lab',
    path: '/texture-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'propLab',
    label: 'Prop Lab',
    path: '/prop-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'buildingLab',
    label: 'Building Lab',
    path: '/building-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'settings',
    label: 'Settings · MCP Connection',
    path: '/settings/',
    search: '',
  }),
  // Showcase pages (examples/, not labs): reachable from the hub so the
  // world-scale systems — roads/bridges, villages, fauna, ambient VFX —
  // are discoverable without typing URLs. They render their own HUDs.
  Object.freeze({
    id: 'outdoorWorld',
    label: 'Outdoor World (paths · villages)',
    path: '/examples/outdoor-world/',
    search: '?villages=2&shrines=1',
  }),
  Object.freeze({
    id: 'faunaDemo',
    label: 'Fauna Demo',
    path: '/examples/fauna-demo/',
    search: '',
  }),
  Object.freeze({
    id: 'ambientFxDemo',
    label: 'Ambient VFX Demo',
    path: '/examples/ambientfx-demo/',
    search: '',
  }),
  Object.freeze({
    id: 'vfxLab',
    label: 'VFX Lab',
    path: '/vfx-lab/',
    search: '',
  }),
  Object.freeze({
    id: 'vfxArena',
    label: 'VFX Arena Demo',
    path: '/examples/vfx-arena/',
    search: '',
  }),
]);

// Public editor switchers must mirror the release inventory exactly. The full
// scene hub above intentionally retains internal migration and validation
// routes for development HUDs, but those routes must never leak into a public
// Beta lab's navigation.
const PUBLIC_SCENE_HUB_IDS = Object.freeze([
  'home',
  'character',
  'treeShaderLab',
  'grassShaderLab',
  'flowerShaderLab',
  'rockShaderLab',
  'groundShaderLab',
  'manufacturedMaterialLab',
  'waterLab',
  'skyLab',
  'cloudShaderLab',
  'skyCloudLab',
  'rockLab',
  'treeLab',
  'grassLab',
  'textureLab',
]);

export const PUBLIC_SCENE_HUB_OPTIONS = Object.freeze(
  PUBLIC_SCENE_HUB_IDS.map((id) => SCENE_HUB_OPTIONS.find((option) => option.id === id)),
);

const SCENE_HUB_OPTION_BY_ID = new Map(SCENE_HUB_OPTIONS.map((option) => [option.id, option]));
const SCENE_HUB_ALIASES = new Map([
  ['treeDesigner', 'treeLab'],
  // Former per-preset water entries, collapsed into the walkable water scene.
  ['calmLake', 'waterPlayground'],
  ['riverCrossing', 'waterPlayground'],
  ['oceanBeach', 'waterPlayground'],
  // Former indoor entry ids.
  ['liyue', 'environmentWalkable'],
  ['liyueWalk', 'environmentWalkable'],
  ['environmentWalk', 'environmentWalkable'],
]);

function normalizeSceneHubId(id) {
  return SCENE_HUB_ALIASES.get(id) || id;
}

// Characters offered by the HUD "Model" select: the bundled CC0 mannequin
// plus every model discovered in the gitignored assets-local/models/ drop-in
// folder (npm run assets:local — see labs/shared/localModelCatalog.js). Any
// other ?model= URL still works and shows up as a "Custom" entry.
export const CHARACTER_MODEL_OPTIONS = Object.freeze([
  // swimVisualLift: extra visual height while swimming, applied to the model
  // group only — physics floats identically for every model (the swim
  // backend is tuned as a package around one capsule depth; giving a model a
  // different PHYSICS float re-exposed snap bugs that tuning had fixed). The
  // compact mannequin needs the lift to read as surface freestyle; taller
  // models generally do not.
  Object.freeze({ label: 'Mannequin', model: '/characters/mannequin.glb', swimVisualLift: 0.18 }),
  Object.freeze({ label: 'Mannequin (VRM)', model: '/characters/mannequin.vrm', swimVisualLift: 0.18 }),
  Object.freeze({ label: 'Mannequin (FBX)', model: '/characters/mannequin.fbx', swimVisualLift: 0.18 }),
  // Host-injected characters: a hosting app (ToonLab Pro's LabMount) may
  // stamp `window.__toonlabHostCharacterModels = [{ label, model }]` with the
  // signed URLs of the user's uploaded character models BEFORE the lab
  // module loads; they surface in every character picker.
  ...(Array.isArray(window.__toonlabHostCharacterModels) ? window.__toonlabHostCharacterModels : [])
    .filter((entry) => entry && entry.model)
    .map((entry) => Object.freeze({
      label: String(entry.label || 'Uploaded character'),
      model: String(entry.model),
      mtl: entry.mtl ? String(entry.mtl) : null,
    })),
  ...buildLocalCharacterModelOptions().map((option) => Object.freeze({
    label: option.label,
    model: `/${option.modelUrl}`,
    mtl: option.materialUrl ? `/${option.materialUrl}` : null,
  })),
]);

export function resolveSceneHubId(params = new URLSearchParams(window.location.search)) {
  const pathname = window.location.pathname.toLowerCase();
  if (pathname.startsWith('/shader-lab')) {
    return (params.has('env') || params.has('environment')) ? 'environmentLab' : 'character';
  }
  if (pathname.startsWith('/tree-lab') || pathname.startsWith('/tree-designer')) return 'treeLab';
  if (pathname.startsWith('/tree-shader-lab')) return 'treeShaderLab';
  if (pathname.startsWith('/flower-lab')) return 'flowerLab';
  if (pathname.startsWith('/flower-shader-lab')) return 'flowerShaderLab';
  if (pathname.startsWith('/rock-shader-lab')) return 'rockShaderLab';
  if (pathname.startsWith('/debris-lab')) return 'debrisLab';
  if (pathname.startsWith('/texture-lab')) return 'textureLab';
  if (pathname.startsWith('/sky-lab')) return 'skyLab';
  if (pathname.startsWith('/cloud-shader-lab')) return 'cloudShaderLab';
  if (pathname.startsWith('/sky-cloud-lab')) return 'skyCloudLab';
  if (pathname.startsWith('/atmospheric-condition-lab')) return 'atmosphericConditionLab';
  if (pathname.startsWith('/water-lab')) return 'waterLab';
  if (pathname.startsWith('/lighting-lab')) return 'lightingLab';
  if (pathname.startsWith('/weather-lab')) return 'weatherLab';
  if (pathname.startsWith('/environment-lab')) return 'environmentLab';
  if (pathname.startsWith('/grass-lab')) return 'grassLab';
  if (pathname.startsWith('/grass-shader-lab')) return 'grassShaderLab';
  if (pathname.startsWith('/ground-shader-lab')) return 'groundShaderLab';
  if (pathname.startsWith('/manufactured-material-lab')) return 'manufacturedMaterialLab';
  if (pathname.startsWith('/vegetation-shader-lab')) return 'vegetationMaterialLab';
  if (pathname.startsWith('/prop-lab')) return 'propLab';
  if (pathname.startsWith('/building-lab')) return 'buildingLab';
  if (pathname.startsWith('/settings')) return 'settings';
  if (pathname.startsWith('/vfx-lab')) return 'vfxLab';
  const onPlaygroundPath = pathname.startsWith('/playground');
  const onRockLabPath = pathname.startsWith('/rock-lab');
  const controller = (params.get('controller') || '').toLowerCase();
  const scene = (params.get('scene') || '').toLowerCase();

  if (onRockLabPath || scene === 'rock') return 'rockLab';
  if ((onPlaygroundPath || controller === 'ecctrl') && scene === 'water') return 'waterPlayground';
  if ((onPlaygroundPath || controller === 'ecctrl') && (scene === 'liyue' || scene === 'indoor')) return 'environmentWalkable';
  if (onPlaygroundPath || controller === 'ecctrl') return 'controller';
  if (params.has('env') || params.has('environment')) return 'environmentLab';
  return 'character';
}

export function sceneHubUrl(id, locationValue = window.location) {
  const option = SCENE_HUB_OPTION_BY_ID.get(normalizeSceneHubId(id)) || SCENE_HUB_OPTION_BY_ID.get('character');
  // Hub scenes live on the root page; `path` entries are standalone pages.
  // Never reuse locationValue.pathname — a select on a standalone page must
  // still send hub scenes back to the root page.
  return `${locationValue.origin}${option.path ?? '/'}${option.search}`;
}

export function navigateSceneHub(id) {
  window.location.href = sceneHubUrl(id);
}

export function normalizeModelPath(url) {
  return String(url || '').replace(/^\/+/, '').split(/[?#]/)[0].toLowerCase();
}

export function navigateToCharacterModel(model) {
  const params = new URLSearchParams(window.location.search);
  params.delete('model');
  params.delete('mtl');
  params.set('model', model);
  window.location.search = params.toString();
}

export function bindCharacterModelControl({
  onSelect = () => {},
  output = document.getElementById('characterModelValue'),
  select = document.getElementById('characterModel'),
} = {}) {
  if (!select) return;

  const params = new URLSearchParams(window.location.search);
  // Every scene defaults to the bundled CC0 mannequin; persisted lab state
  // restores whatever model was last picked.
  const defaultModel = '/characters/mannequin.glb';
  const currentModel = params.getAll('model').find((url) => url && url.toLowerCase() !== 'none')
    || defaultModel;

  select.innerHTML = '';
  let matched = false;
  for (const option of CHARACTER_MODEL_OPTIONS) {
    const el = document.createElement('option');
    el.value = option.model;
    el.textContent = option.label;
    if (normalizeModelPath(option.model) === normalizeModelPath(currentModel)) {
      el.selected = true;
      matched = true;
    }
    select.appendChild(el);
  }
  if (!matched) {
    const el = document.createElement('option');
    el.value = currentModel;
    el.textContent = `Custom: ${currentModel.slice(currentModel.lastIndexOf('/') + 1)}`;
    el.selected = true;
    select.appendChild(el);
  }
  if (output) output.textContent = select.selectedOptions[0]?.textContent || '';

  select.addEventListener('change', () => {
    onSelect(select.value);
    navigateToCharacterModel(select.value);
  });
}

export function bindSceneHubControl({
  onSelect = () => {},
  output = document.getElementById('sceneHubValue'),
  select = document.getElementById('sceneHub'),
} = {}) {
  if (!select) return;

  // Build the options from SCENE_HUB_OPTIONS — static markup drifts.
  select.innerHTML = '';
  for (const option of SCENE_HUB_OPTIONS) {
    const optionEl = document.createElement('option');
    optionEl.value = option.id;
    optionEl.textContent = option.label;
    select.appendChild(optionEl);
  }

  const currentId = resolveSceneHubId();
  select.value = currentId;
  if (output) {
    output.textContent = SCENE_HUB_OPTION_BY_ID.get(currentId)?.label || 'Character Lab';
  }

  select.addEventListener('change', () => {
    onSelect(select.value);
    navigateSceneHub(select.value);
  });
}
