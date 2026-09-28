// Character-tab HUD wiring for the playground: toon preset / debug selects
// plus the schema-generated Toon Settings panel, applied live to the
// controller character — the same controls (same ids, same markup, same
// library APIs) as the Shader Lab's Character tab.
import {
  applyToonSettingsToMaterial,
  createToonSettings,
  getToonPresetOptions,
  normalizeToonPresetName,
  setToonDebugOutput,
  TOON_SETTING_GROUPS,
} from '../../src/toon/toonMaterialAdapter.js';
import { createSettingsPanel } from '../../src/debug/index.js';
import { setLabParams } from '../shared/labParams.js';
import {
  fillToonDebugSelect,
  readToonSettingValue,
  TOON_SETTING_FIELDS_BY_GROUP,
  withToonGroupValue,
} from '../shared/toonSettingFields.js';
import { URL_PARAMS } from './params.js';

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value ?? {}));
}

function setHudSelect(id, value, label) {
  const select = document.getElementById(id);
  if (select) select.value = value;
  const output = document.getElementById(`${id}Value`);
  if (output) {
    output.value = label ?? value;
    output.textContent = label ?? value;
  }
}

// Mounts the Character tab against a freshly toon-converted model root.
// `initialSettings` is the settings object applyToonShader returned, so the
// panel starts from exactly what is on screen. Returns an unmount function.
export function mountCharacterToonHud({ modelRoot, initialSettings = null }) {
  const container = document.getElementById('toonSettingGroups');
  if (!modelRoot || !container || container.childElementCount > 0) return () => {};

  let draftSource = cloneJson(initialSettings ?? { preset: URL_PARAMS.get('toonPreset') || undefined });
  let toonSettings = createToonSettings(draftSource);
  let panelSettings = toonSettings;
  let settingsPanel = null;

  const applyDraft = () => {
    toonSettings = createToonSettings(draftSource);
    panelSettings = toonSettings;
    applyToonSettingsToMaterial(modelRoot, toonSettings);
    document.body.dataset.toonPreset = toonSettings.preset;
    document.body.dataset.toonPresetLabel = toonSettings.presetLabel;
  };

  // `key` is the field's dotted key within its group (`'cameraLight.strength'`).
  const setDraftField = (groupId, key, value) => {
    draftSource = cloneJson(draftSource);
    draftSource[groupId] = withToonGroupValue(draftSource[groupId], key, value);
    applyDraft();
  };

  // Preset select — same behavior as the Shader Lab: presets apply at
  // conversion, so selecting one reloads the scene with ?toonPreset=.
  const presetSelect = document.getElementById('toonPreset');
  if (presetSelect) {
    presetSelect.replaceChildren();
    for (const option of getToonPresetOptions()) {
      const element = document.createElement('option');
      element.value = option.id;
      element.textContent = option.label;
      element.title = option.description;
      presetSelect.append(element);
    }
    setHudSelect('toonPreset', toonSettings.preset, toonSettings.presetLabel);
    presetSelect.addEventListener('change', () => {
      const next = normalizeToonPresetName(presetSelect.value);
      if (next !== toonSettings.preset) setLabParams({ toonPreset: next === 'default' ? null : next });
    });
  }

  // Debug view — live, no reload.
  const debugSelect = document.getElementById('toonDebug');
  fillToonDebugSelect(debugSelect);
  const applyDebugMode = (mode) => {
    const debugMode = setToonDebugOutput(modelRoot, mode);
    document.body.dataset.toonDebugMode = debugMode.name;
    document.body.dataset.toonDebugValue = String(debugMode.value);
    setHudSelect('toonDebug', debugMode.name, debugMode.label);
    return debugMode;
  };
  const initialDebug = URL_PARAMS.get('toonDebug') || 'off';
  // Always write the resolved mode, including `off`. Character materials can
  // survive a lab-parameter update/HMR cycle, so only writing non-off modes
  // lets a previous shadow diagnostic leak into the walkable showcase after
  // the `toonDebug` query parameter has been removed.
  applyDebugMode(initialDebug);
  debugSelect?.addEventListener('change', () => {
    const debugMode = applyDebugMode(debugSelect.value);
    setLabParams({ toonDebug: debugMode.name === 'off' ? null : debugMode.name }, { navigate: false });
  });

  settingsPanel = createSettingsPanel({
    container,
    dataAttribute: 'toonField',
    fieldFilter: (field) => field.serializable,
    fieldSchema: TOON_SETTING_FIELDS_BY_GROUP,
    getValue: (field) => readToonSettingValue(panelSettings, field),
    groups: TOON_SETTING_GROUPS,
    idPrefix: 'toonSetting',
    onChange: (field, value) => setDraftField(field.group, field.key, value),
    rowClassName: 'hud-control toon-field-control',
  });

  return () => {
    // The character root may be reused by the next scene mount. Leave it in
    // production rendering mode rather than carrying a diagnostic uniform
    // across scenes or screenshot runs.
    setToonDebugOutput(modelRoot, 'off');
    container.replaceChildren();
    settingsPanel = null;
  };
}
