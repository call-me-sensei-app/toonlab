import '../shared/siteHeader.js';
import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  createStyleBundleDocument,
  parseStyleBundleDocument,
  serializeStyleBundle,
  STYLE_BUNDLE_DOCUMENT_TYPE,
  STYLE_BUNDLE_SLOTS,
} from '../../src/styles/index.js';
import { getToonPresetOptions } from '../../src/toon/toonSettings.js';
import { getWaterStyleOptions } from '../../src/water/waterSettings.js';
import { getSkyPresetOptions } from '../../src/sky/stylizedSky.js';
import { getEnvironmentPresetOptions } from '../../src/environment/environmentPresets.js';
import { getPostProcessingPresetOptions } from '../../src/post/postProcessing.js';
import { getRockShaderPresetOptions } from '../../src/rock-shader/rockShaderSettings.js';
import { getGroundShaderPresetOptions } from '../../src/ground-shader/groundShaderSettings.js';
import { getGrassPresetOptions } from '../../src/vegetation/stylizedGrass.js';
import { getVegetationShaderPresetOptions } from '../../src/vegetation/vegetationShaders.js';
import { getLightingStylePresetOptions } from '../../src/lighting/lightingStyle.js';

const GROUPS = Object.freeze([
  { id: 'Character', jp: '人物', slots: ['toon'] },
  {
    id: 'World',
    jp: '世界',
    slots: [
      'treeShader', 'grass', 'grassShader', 'flowerShader', 'rock',
      'groundShader', 'manufacturedSurface',
    ],
  },
  { id: 'Atmosphere', jp: '大気', slots: ['water', 'sky', 'cloud', 'environment', 'lighting'] },
  { id: 'Screen', jp: '画面', slots: ['post'] },
]);

const DEFAULT_OPTIONS = Object.freeze([
  ['default', 'Default'],
  ['call_me_sensei', 'Call Me Sensei'],
]);

function options(getter) {
  return getter().map((entry) => [entry.value ?? entry.id, entry.label]);
}

const BUILTINS = Object.freeze({
  toon: options(getToonPresetOptions),
  treeShader: options(getVegetationShaderPresetOptions),
  grass: options(getGrassPresetOptions),
  grassShader: options(getVegetationShaderPresetOptions),
  flowerShader: options(getVegetationShaderPresetOptions),
  rock: options(getRockShaderPresetOptions),
  water: options(getWaterStyleOptions),
  sky: options(getSkyPresetOptions),
  // Call Me Sensei remains the canonical cloud treatment even though the
  // retired named cloud presets were not carried into the new SkyParams model.
  cloud: DEFAULT_OPTIONS,
  environment: options(getEnvironmentPresetOptions),
  manufacturedSurface: DEFAULT_OPTIONS,
  lighting: options(getLightingStylePresetOptions),
  post: options(getPostProcessingPresetOptions),
  groundShader: options(getGroundShaderPresetOptions),
});

const CREATION_TYPES = Object.freeze({
  toon: ['toon-preset'],
  treeShader: ['vegetation-shader-preset', 'tree-shader-preset'],
  grass: ['grass-preset'],
  grassShader: ['vegetation-shader-preset', 'grass-shader-preset'],
  flowerShader: ['vegetation-shader-preset', 'flower-shader-preset'],
  rock: ['rock-shader-preset'],
  water: ['water-preset'],
  sky: ['sky-preset'],
  // The saved-creation type behind the cloud slot's new SkyParams document.
  // `cloud-shader-preset` creations belong to the retired card renderer and no
  // longer parse, so they are deliberately not accepted here.
  cloud: ['sky-params'],
  environment: ['environment-preset'],
  manufacturedSurface: ['manufactured-surface-profile'],
  groundShader: ['ground-shader-preset'],
});

const canonicalIds = Object.keys(STYLE_BUNDLE_SLOTS);
const groupedIds = GROUPS.flatMap((group) => group.slots);
if (
  canonicalIds.length !== groupedIds.length
  || canonicalIds.some((id) => !groupedIds.includes(id) || !(id in BUILTINS))
) {
  throw new Error('The Styles editor metadata is out of sync with STYLE_BUNDLE_SLOTS.');
}

const indexSection = document.getElementById('stylesIndex');
const editorSection = document.getElementById('stylesEditor');
const bundleList = document.getElementById('bundleList');
const bundleToolbar = document.getElementById('bundleToolbar');
const bundleEmpty = document.getElementById('bundleEmpty');
const bundleSearch = document.getElementById('bundleSearch');
const bundleForm = document.getElementById('bundleForm');
const slotGroups = document.getElementById('slotGroups');
const saveStatus = document.getElementById('saveStatus');
const createOverlay = document.getElementById('createOverlay');
const createForm = document.getElementById('createBundleForm');
const deleteBundleButton = document.getElementById('deleteBundle');
const dangerBundleCard = document.getElementById('dangerBundleCard');
const portableBundleTitle = document.getElementById('portableBundleTitle');
const portableBundleNote = document.getElementById('portableBundleNote');
let entries = [];
let currentBundle = null;

function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'style-bundle';
}

function entryDocument(entry) {
  return entry?.document && entry?._local?.source === 'lab-state'
    ? entry.document
    : entry;
}

function isBundle(entry) {
  return entry?.type === 'style-bundle' || entry?.schema === STYLE_BUNDLE_DOCUMENT_TYPE;
}

function bundles() {
  return [
    CALL_ME_SENSEI_STYLE_BUNDLE,
    ...entries.filter((entry) => isBundle(entry) && entry.id !== CALL_ME_SENSEI_STYLE_BUNDLE.id),
  ];
}

function savedForSlot(slotId) {
  const slot = STYLE_BUNDLE_SLOTS[slotId];
  const acceptedTypes = CREATION_TYPES[slotId] ?? [];
  return entries.filter((entry) => {
    if (isBundle(entry)) return false;
    const document = entryDocument(entry);
    const documentType = document?.schema ?? document?.type ?? null;
    return acceptedTypes.includes(entry.type) || (slot.documentType && documentType === slot.documentType);
  });
}

function card(bundle) {
  const firstParty = bundle.id === CALL_ME_SENSEI_STYLE_BUNDLE.id;
  const button = document.createElement('button');
  button.className = firstParty ? 'stb-card stb-card--canonical' : 'stb-card';
  button.type = 'button';
  button.addEventListener('click', () => {
    window.location.assign(`/styles/?bundle=${encodeURIComponent(bundle.id)}`);
  });
  const head = document.createElement('span');
  head.className = 'stb-card-head';
  const name = document.createElement('span');
  name.className = 'stb-card-name';
  name.textContent = bundle.label ?? bundle.id;
  const badge = document.createElement('span');
  badge.className = 'gal-badge';
  badge.textContent = firstParty ? 'built-in · read-only' : 'local';
  head.append(name, badge);
  button.append(head);
  if (bundle.description) {
    const summary = document.createElement('span');
    summary.className = 'stb-card-summary';
    summary.textContent = bundle.description;
    button.append(summary);
  }
  const selected = Object.keys(bundle.slots ?? {}).filter((id) => STYLE_BUNDLE_SLOTS[id]);
  if (selected.length) {
    const chips = document.createElement('span');
    chips.className = 'stb-card-slots';
    for (const id of selected) {
      const chip = document.createElement('span');
      chip.className = 'stb-slot-chip';
      chip.textContent = STYLE_BUNDLE_SLOTS[id].label;
      chips.append(chip);
    }
    button.append(chips);
  } else {
    const noSystems = document.createElement('span');
    noSystems.className = 'stb-card-empty';
    noSystems.textContent = 'No element treatments assigned yet';
    button.append(noSystems);
  }
  const meta = document.createElement('span');
  meta.className = 'stb-card-meta';
  const updatedAt = firstParty
    ? 'canonical default'
    : bundle._local?.updatedAt
      ? new Date(bundle._local.updatedAt).toLocaleDateString()
      : 'local';
  meta.textContent = `${selected.length} element treatment${selected.length === 1 ? '' : 's'} · ${updatedAt}`;
  button.append(meta);
  return button;
}

function renderIndex() {
  const all = bundles();
  const query = bundleSearch.value.trim().toLowerCase();
  const shown = all.filter((bundle) =>
    `${bundle.label ?? ''} ${bundle.description ?? ''}`.toLowerCase().includes(query));
  bundleList.replaceChildren(...shown.map(card));
  bundleToolbar.hidden = all.length === 0;
  bundleEmpty.hidden = shown.length > 0;
  const strong = bundleEmpty.querySelector('strong');
  const message = bundleEmpty.querySelector('span:last-child');
  if (all.length && !shown.length) {
    strong.textContent = 'Nothing matches that search';
    message.textContent = 'Clear the search to see all local style bundles.';
  } else {
    strong.textContent = 'No style bundles yet';
    message.textContent = 'Create one and assign every element’s treatment from a single portable document.';
  }
}

function slotValue(payload, slot) {
  if (!payload) return '';
  if (payload.creation) return `creation:${payload.creation}`;
  if (payload.style) return `style:${payload.style}`;
  if (payload.preset) {
    return `${slot.selectionKind === 'style' ? 'style' : 'preset'}:${payload.preset}`;
  }
  return '';
}

function labHrefFor(slotId) {
  return {
    toon: '/shader-lab/',
    treeShader: '/tree-shader-lab/',
    grass: '/grass-lab/',
    grassShader: '/grass-shader-lab/',
    flowerShader: '/flower-shader-lab/',
    rock: '/rock-shader-lab/',
    water: '/water-lab/',
    sky: '/sky-lab/',
    cloud: '/cloud-shader-lab/',
    environment: '/environment-lab/',
    manufacturedSurface: '/manufactured-material-lab/',
    groundShader: '/ground-shader-lab/',
    lighting: '/lighting-lab/',
  }[slotId] ?? '/';
}

function slotField(slotId, selectedPayload, { disabled = false } = {}) {
  const slot = STYLE_BUNDLE_SLOTS[slotId];
  const field = document.createElement('label');
  field.className = 'stb-field';
  const title = document.createElement('span');
  title.textContent = slot.label;
  const select = document.createElement('select');
  select.className = 'tl-input';
  select.name = `slot:${slotId}`;
  select.disabled = disabled;
  const unset = document.createElement('option');
  unset.value = '';
  unset.textContent = '— not set —';
  select.append(unset);
  const builtins = BUILTINS[slotId];
  if (builtins.length) {
    const group = document.createElement('optgroup');
    group.label = slot.selectionKind === 'style' ? 'Built-in styles' : 'Built-in documents';
    for (const [id, label] of builtins) {
      const option = document.createElement('option');
      option.value = `${slot.selectionKind === 'style' ? 'style' : 'preset'}:${id}`;
      option.textContent = label;
      group.append(option);
    }
    select.append(group);
  }
  const saved = savedForSlot(slotId);
  if (saved.length) {
    const group = document.createElement('optgroup');
    group.label = 'Your saved documents';
    for (const entry of saved) {
      const option = document.createElement('option');
      option.value = `creation:${entry.id}`;
      option.textContent = entry.label ?? entry.name ?? entry.id;
      group.append(option);
    }
    select.append(group);
  }
  select.value = slotValue(selectedPayload, slot);
  field.append(title, select);
  if (!builtins.length && !saved.length && slot.documentType) {
    const hint = document.createElement('small');
    hint.className = 'stb-hint';
    hint.append('No saved document yet — ');
    const link = document.createElement('a');
    link.href = labHrefFor(slotId);
    link.textContent = 'make one in the lab';
    hint.append(link, ' and it appears here.');
    field.append(hint);
  }
  return field;
}

function renderEditor(bundle) {
  const firstParty = bundle.id === CALL_ME_SENSEI_STYLE_BUNDLE.id;
  currentBundle = firstParty ? { ...bundle, _system: true } : bundle;
  indexSection.hidden = true;
  editorSection.hidden = false;
  bundleForm.elements.label.value = bundle.label ?? '';
  bundleForm.elements.description.value = bundle.description ?? '';
  bundleForm.elements.label.disabled = firstParty;
  bundleForm.elements.description.disabled = firstParty;
  slotGroups.replaceChildren(...GROUPS.map((group) => {
    const section = document.createElement('section');
    section.className = 'stb-group';
    const heading = document.createElement('div');
    heading.className = 'tl-kicker stb-group-title';
    heading.append(`${group.id} `);
    const jp = document.createElement('span');
    jp.className = 'jp';
    jp.textContent = group.jp;
    heading.append(jp);
    const fields = document.createElement('div');
    fields.className = 'stb-group-fields';
    fields.append(...group.slots.map((id) => slotField(id, bundle.slots?.[id], { disabled: firstParty })));
    section.append(heading, fields);
    return section;
  }));
  const submit = bundleForm.querySelector('button[type="submit"]');
  submit.textContent = firstParty ? 'Fork bundle to customize' : 'Save changes';
  dangerBundleCard.hidden = firstParty;
  portableBundleTitle.textContent = firstParty ? 'Canonical default bundle' : 'Portable bundle';
  portableBundleNote.textContent = firstParty
    ? 'Call Me Sensei is read-only and assigns the Call Me Sensei treatment to every supported element/domain slot. Fork it to create an editable copy.'
    : 'Export this bundle as JSON or import another bundle. Saved changes also appear in Library.';
}

function bundleFromForm() {
  const slots = {};
  for (const [id, slot] of Object.entries(STYLE_BUNDLE_SLOTS)) {
    const value = bundleForm.elements[`slot:${id}`].value;
    if (!value) continue;
    const [kind, ...rest] = value.split(':');
    const idValue = rest.join(':');
    if (kind === 'creation') slots[id] = { creation: idValue };
    else if (kind === 'style') slots[id] = { style: idValue };
    else if (kind === 'preset' && slot.selectionKind !== 'style') slots[id] = { preset: idValue };
  }
  return {
    ...createStyleBundleDocument(currentBundle.id, {
      description: bundleForm.elements.description.value.trim(),
      label: bundleForm.elements.label.value.trim(),
      slots,
    }),
    type: 'style-bundle',
  };
}

async function persistBundle(bundle) {
  if (bundle.id === CALL_ME_SENSEI_STYLE_BUNDLE.id) {
    throw new Error('Call Me Sensei is the protected canonical Style Bundle. Fork it to customize.');
  }
  const response = await fetch(`/api/toonlab/library/${encodeURIComponent(bundle.id)}`, {
    body: JSON.stringify(bundle),
    headers: { 'content-type': 'application/json' },
    method: 'PUT',
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error ?? 'Save failed.');
  }
  const payload = await response.json();
  const saved = payload.entry ?? bundle;
  entries = entries.filter((entry) => entry.id !== saved.id);
  entries.unshift(saved);
  return saved;
}

async function createBundle(event) {
  event.preventDefault();
  const label = createForm.elements.label.value.trim();
  if (!label) return;
  const id = `${slugify(label)}-${crypto.randomUUID().slice(0, 8)}`;
  const bundle = {
    ...createStyleBundleDocument(id, {
      description: createForm.elements.description.value.trim(),
      label,
      slots: {},
    }),
    type: 'style-bundle',
  };
  try {
    const saved = await persistBundle(bundle);
    window.location.assign(`/styles/?bundle=${encodeURIComponent(saved.id)}`);
  } catch (error) {
    document.getElementById('createStatus').textContent = error.message;
  }
}

async function saveBundle(event) {
  event.preventDefault();
  saveStatus.textContent = currentBundle?._system ? 'Forking…' : 'Saving…';
  try {
    if (currentBundle?._system) {
      const fork = {
        ...createStyleBundleDocument(`call-me-sensei-custom-${crypto.randomUUID().slice(0, 8)}`, {
          artDirection: currentBundle.artDirection,
          description: 'Custom fork of the canonical Call Me Sensei style bundle.',
          label: 'Call Me Sensei — Custom',
          slots: currentBundle.slots,
        }),
        type: 'style-bundle',
      };
      const saved = await persistBundle(fork);
      window.location.assign(`/styles/?bundle=${encodeURIComponent(saved.id)}`);
      return;
    }
    currentBundle = await persistBundle(bundleFromForm());
    saveStatus.textContent = 'Saved';
  } catch (error) {
    saveStatus.textContent = error.message;
  }
}

function exportBundle() {
  if (!currentBundle) return;
  let bundle;
  try {
    bundle = bundleFromForm();
  } catch (error) {
    saveStatus.textContent = error.message;
    return;
  }
  const blob = new Blob([`${serializeStyleBundle(bundle)}\n`], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `${slugify(bundle.label)}.toonlab-style.json`;
  anchor.click();
  URL.revokeObjectURL(href);
}

async function importBundle(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  const parsed = parseStyleBundleDocument(await file.text());
  event.currentTarget.value = '';
  if (!parsed.ok) {
    const target = currentBundle ? saveStatus : document.getElementById('createStatus');
    target.textContent = parsed.errors.join(' ');
    if (!currentBundle) openCreate();
    return;
  }
  const imported = {
    ...parsed.value,
    id: parsed.value.id === CALL_ME_SENSEI_STYLE_BUNDLE.id
      || entries.some((entry) => entry.id === parsed.value.id)
      ? `${parsed.value.id}-${crypto.randomUUID().slice(0, 8)}`
      : parsed.value.id,
    type: 'style-bundle',
  };
  try {
    const saved = await persistBundle(imported);
    window.location.assign(`/styles/?bundle=${encodeURIComponent(saved.id)}`);
  } catch (error) {
    saveStatus.textContent = error.message;
  }
}

async function deleteBundle() {
  if (!currentBundle || currentBundle._system || !confirm(`Delete the bundle “${currentBundle.label}”?`)) return;
  const response = await fetch(`/api/toonlab/library/${encodeURIComponent(currentBundle.id)}`, { method: 'DELETE' });
  if (!response.ok) {
    saveStatus.textContent = 'Delete failed.';
    return;
  }
  window.location.assign('/styles/');
}

function openCreate() {
  createOverlay.hidden = false;
  createForm.elements.label.focus();
}

function closeCreate() {
  createOverlay.hidden = true;
  createForm.reset();
  document.getElementById('createStatus').textContent = '';
}

async function load() {
  const response = await fetch('/api/toonlab/library');
  if (!response.ok) throw new Error(`Styles unavailable: HTTP ${response.status}`);
  entries = (await response.json()).entries ?? [];
  const requestedId = new URLSearchParams(window.location.search).get('bundle');
  if (!requestedId) {
    renderIndex();
    return;
  }
  const candidate = requestedId === CALL_ME_SENSEI_STYLE_BUNDLE.id
    ? CALL_ME_SENSEI_STYLE_BUNDLE
    : entries.find((entry) => entry.id === requestedId);
  if (!candidate) throw new Error('That local style bundle no longer exists.');
  const parsed = parseStyleBundleDocument(candidate);
  if (!parsed.ok) throw new Error(parsed.errors.join(' '));
  renderEditor({
    ...parsed.value,
    _local: candidate._local,
    type: 'style-bundle',
  });
}

document.getElementById('newBundle').addEventListener('click', openCreate);
document.getElementById('cancelCreate').addEventListener('click', closeCreate);
createOverlay.addEventListener('click', (event) => {
  if (event.target === createOverlay) closeCreate();
});
createForm.addEventListener('submit', createBundle);
bundleForm.addEventListener('submit', saveBundle);
bundleSearch.addEventListener('input', renderIndex);
document.getElementById('exportBundle').addEventListener('click', exportBundle);
deleteBundleButton.addEventListener('click', deleteBundle);
document.getElementById('importBundle').addEventListener('change', importBundle);
document.getElementById('importBundleEditor').addEventListener('change', importBundle);
load().catch((error) => {
  bundleEmpty.hidden = false;
  bundleEmpty.querySelector('strong').textContent = 'Styles unavailable';
  bundleEmpty.querySelector('span:last-child').textContent = error.message;
});
