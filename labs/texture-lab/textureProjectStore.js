import { writeRequiredLocalJson } from '../shared/browserStorage.js';
// localStorage persistence for Texture Lab: the autosaved working document,
// the user's saved preset library, and the AI-assist configuration (provider
// choice and model ids. Provider keys live only in the local server
// environment and are never persisted in browser state.

import { createTextureSettings } from '../../src/texgen/index.js';

const DOCUMENT_KEY = 'toonlab.texture-lab.document.v1';
const PRESETS_KEY = 'toonlab.texture-lab.presets.v1';
const AI_KEY = 'toonlab.texture-lab.ai.v1';
const LOCAL_PRESET_LIMIT = 60;

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / blocked storage never breaks editing
  }
}

function read(key) {
  try {
    const raw = storage()?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    storage()?.setItem(key, JSON.stringify(value));
  } catch { /* quota/private mode: editing continues unsaved */ }
}

export function loadTextureDocument() {
  const saved = read(DOCUMENT_KEY);
  if (!saved || typeof saved !== 'object' || !saved.settings) return null;
  return {
    name: typeof saved.name === 'string' ? saved.name : 'Untitled texture',
    presetId: saved.presetId ?? null,
    settings: createTextureSettings(saved.settings),
  };
}

export function saveTextureDocument({ name, presetId, settings }) {
  write(DOCUMENT_KEY, { name, presetId, settings });
}

export function clearTextureDocument() {
  try {
    storage()?.removeItem(DOCUMENT_KEY);
  } catch { /* ignore */ }
}

export function loadLocalTexturePresets() {
  const list = read(PRESETS_KEY);
  if (!Array.isArray(list)) return [];
  return list
    .filter((entry) => entry && typeof entry.id === 'string' && entry.settings)
    .map((entry) => ({
      category: 'local',
      id: entry.id,
      label: String(entry.label ?? 'Saved texture'),
      settings: entry.settings,
      tags: Array.isArray(entry.tags) ? entry.tags : [],
    }));
}

export function upsertLocalTexturePreset(preset) {
  const list = loadLocalTexturePresets().filter((entry) => entry.id !== preset.id);
  list.unshift({ ...preset, settings: createTextureSettings(preset.settings) });
  writeRequiredLocalJson(PRESETS_KEY, list.slice(0, LOCAL_PRESET_LIMIT));
  return preset;
}

export function deleteLocalTexturePreset(id) {
  writeRequiredLocalJson(PRESETS_KEY, loadLocalTexturePresets().filter((entry) => entry.id !== id));
}

export const DEFAULT_AI_MODELS = Object.freeze({
  gemini: 'gemini-3.5-flash-lite',
  openai: 'gpt-5-mini',
});

export function loadAiConfig() {
  const saved = read(AI_KEY) ?? {};
  return {
    keys: { gemini: '', openai: '' },
    models: {
      gemini: typeof saved.models?.gemini === 'string' && saved.models.gemini && saved.models.gemini !== 'gemini-2.5-flash-lite' ? saved.models.gemini : DEFAULT_AI_MODELS.gemini,
      openai: typeof saved.models?.openai === 'string' && saved.models.openai ? saved.models.openai : DEFAULT_AI_MODELS.openai,
    },
    provider: ['offline', 'gemini', 'openai'].includes(saved.provider) ? saved.provider : 'offline',
  };
}

export function saveAiConfig(config) {
  write(AI_KEY, { models: config.models, provider: config.provider });
}
