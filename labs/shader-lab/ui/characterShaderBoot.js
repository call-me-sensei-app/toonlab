// Pure Character Shader Lab boot selection. Keeping URL precedence outside
// the React/store module makes the Pro Open-in-Lab contract directly
// testable without a browser runtime.

import { createToonSettings } from '../../../src/toon/toonMaterialAdapter.js';

export function resolveCharacterShaderBoot({
  defaultModelUrl = '',
  savedDocument = null,
  urlParams = new URLSearchParams(),
} = {}) {
  const modelParam = urlParams.getAll('model')
    .find((url) => url && url.toLowerCase() !== 'none');
  const requestedPreset = urlParams.get('toonPreset') || urlParams.get('preset') || undefined;

  // Explicit style links must win over an unrelated autosaved draft. Local
  // and Pro-hydrated styles are registered before this resolver is called.
  if (!requestedPreset && savedDocument?.settings) {
    return {
      bootSource: 'persisted',
      modelMtl: modelParam ? null : savedDocument.modelMtl ?? null,
      modelUrl: modelParam || savedDocument.modelUrl || defaultModelUrl,
      name: savedDocument.name || 'Untitled look',
      presetId: savedDocument.presetId ?? null,
      settings: createToonSettings(savedDocument.settings),
    };
  }

  const preset = requestedPreset ?? 'call_me_sensei';
  const settings = createToonSettings({ preset });
  return {
    bootSource: requestedPreset ? 'url' : 'fresh',
    modelMtl: null,
    modelUrl: modelParam || defaultModelUrl,
    name: settings.presetLabel || 'Untitled look',
    presetId: settings.preset ?? null,
    settings,
  };
}
