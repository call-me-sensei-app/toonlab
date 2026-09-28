// Texture Lab preview styles. These are session-only renderer choices over
// the generated PBR maps; they never enter texture settings or recipe JSON.

import { getEnvironmentPresetOptions } from '../../src/environment/environmentPresets.js';

export const NEUTRAL_TEXTURE_PREVIEW_STYLE = 'neutral';

export function getTexturePreviewStyleOptions() {
  return [
    {
      description: 'Exact generated maps on a standard physically based material.',
      label: 'Neutral PBR',
      value: NEUTRAL_TEXTURE_PREVIEW_STYLE,
    },
    ...getEnvironmentPresetOptions().map((entry) => ({
      description: `Render the same maps through the ${entry.label} environment style.`,
      label: entry.label,
      value: entry.value,
    })),
  ];
}

export function normalizeTexturePreviewStyle(value) {
  const id = String(value ?? '').trim();
  return getTexturePreviewStyleOptions().some((entry) => entry.value === id)
    ? id
    : NEUTRAL_TEXTURE_PREVIEW_STYLE;
}

export function texturePreviewStyleLabel(value) {
  const id = normalizeTexturePreviewStyle(value);
  return getTexturePreviewStyleOptions().find((entry) => entry.value === id)?.label ?? id;
}
