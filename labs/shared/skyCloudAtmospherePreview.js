// Shared authoring preview for the tightly coupled sky/cloud/atmosphere
// family. Each lab owns a different portable document, but they inspect it
// through this exact scene, camera, time mapping, source pack, and renderer.

import {
  createClimateRenderer,
} from './climatePreviewRenderer.js';
import { resolveRendererKind } from './rendererKind.js';
import { normalizeLabPreviewHour } from './previewEnvironmentContract.js';

export const SKY_CLOUD_ATMOSPHERE_PREVIEW_TYPE =
  'toonlab/sky-cloud-atmosphere-preview';
export const SKY_CLOUD_ATMOSPHERE_PREVIEW_VERSION = 1;
export const SKY_CLOUD_ATMOSPHERE_PREVIEW_DOMAINS = Object.freeze([
  'sky',
  'cloud',
  'atmosphere',
  'atmospheric-condition',
]);
export const SKY_CLOUD_ATMOSPHERE_PREVIEW_MODES = Object.freeze([
  Object.freeze({
    id: 'diagnostic',
    label: 'Live',
    title: 'Live diagnostic stage with near, middle, and far visibility cues.',
  }),
  Object.freeze({
    id: 'native',
    label: 'Native',
    title: 'Immutable native-renderer capture at Dawn, Day, Sunset, and Night anchors.',
  }),
]);

const PHASE_ANCHORS = Object.freeze([
  Object.freeze({ hour: 6, phase: 0.75 }),
  Object.freeze({ hour: 13, phase: 1 }),
  Object.freeze({ hour: 18, phase: 1.25 }),
  Object.freeze({ hour: 22, phase: 1.5 }),
  Object.freeze({ hour: 30, phase: 1.75 }),
]);

export function atmosphericPreviewPhaseForHour(value) {
  const hour = normalizeLabPreviewHour(value);
  const sampleHour = hour < 6 ? hour + 24 : hour;
  let previous = PHASE_ANCHORS[0];
  let next = PHASE_ANCHORS[1];
  for (let index = 0; index < PHASE_ANCHORS.length - 1; index += 1) {
    const candidate = PHASE_ANCHORS[index];
    const following = PHASE_ANCHORS[index + 1];
    if (sampleHour >= candidate.hour && sampleHour <= following.hour) {
      previous = candidate;
      next = following;
      break;
    }
  }
  const amount = (sampleHour - previous.hour) / (next.hour - previous.hour);
  const phase = previous.phase + (next.phase - previous.phase) * amount;
  return ((phase % 1) + 1) % 1;
}

export async function createSkyCloudAtmospherePreview({
  container,
  effectsEnabled = true,
  mode = 'diagnostic',
} = {}) {
  const rendererKind = resolveRendererKind();
  const preview = await createClimateRenderer({
    authoredBaselines: mode === 'native',
    container,
    effectsEnabled: mode === 'diagnostic' && effectsEnabled,
    forceWebGL: rendererKind !== 'webgpu',
  });
  document.body.dataset.rendererKind = rendererKind;
  document.body.dataset.rendererBackend =
    preview.renderer.backend?.isWebGPUBackend === true
      ? 'webgpu'
      : 'webgl2-fallback';
  document.body.dataset.environmentPreviewContract =
    `${SKY_CLOUD_ATMOSPHERE_PREVIEW_TYPE}@${SKY_CLOUD_ATMOSPHERE_PREVIEW_VERSION}`;
  document.body.dataset.atmosphericPreviewMode = mode;
  return preview;
}
