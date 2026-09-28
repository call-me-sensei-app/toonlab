// Universal Lab preview-environment contract.
//
// This is preview infrastructure, not part of any asset, shader, effect,
// animation, audio, world, or pipeline document. Every canonical lab must
// expose the same clock and reference states so artifacts are reviewed under
// comparable conditions.

export const LAB_PREVIEW_ENVIRONMENT_TYPE = 'toonlab/lab-preview-environment';
export const LAB_PREVIEW_ENVIRONMENT_VERSION = 1;

export const LAB_PREVIEW_TIME_PRESETS = Object.freeze([
  Object.freeze({ hour: 6, id: 'dawn', label: 'Dawn' }),
  Object.freeze({ hour: 13, id: 'day', label: 'Day' }),
  Object.freeze({ hour: 18, id: 'sunset', label: 'Sunset' }),
  Object.freeze({ hour: 22, id: 'night', label: 'Night' }),
]);

// These are shared reference-rig targets. A style profile may author its own
// response curves, but the selected hour and reference rig remain preview
// inputs and must never leak into the exported production artifact.
export const LAB_PREVIEW_REFERENCE_STATES = Object.freeze({
  dawn: Object.freeze({
    ambientColor: '#b7b5d9',
    directLightColor: '#ffb875',
    shadowTint: '#7180b4',
  }),
  day: Object.freeze({
    ambientColor: '#c7dcff',
    directLightColor: '#fff0d2',
    // Daylight approval requires a visibly cool/blue shadow, not neutral gray
    // or a darkened copy of the albedo.
    shadowTint: '#647fbd',
  }),
  sunset: Object.freeze({
    ambientColor: '#a9a5d2',
    directLightColor: '#ff884b',
    shadowTint: '#6f659e',
  }),
  night: Object.freeze({
    ambientColor: '#50679b',
    directLightColor: '#9bbcff',
    shadowTint: '#293d70',
  }),
});

export const DEFAULT_LAB_PREVIEW_ENVIRONMENT = Object.freeze({
  autoCycle: false,
  hour: 13,
  preset: 'day',
  type: LAB_PREVIEW_ENVIRONMENT_TYPE,
  version: LAB_PREVIEW_ENVIRONMENT_VERSION,
});

export function normalizeLabPreviewHour(value, fallback = 13) {
  const number = Number(value);
  const base = Number.isFinite(number) ? number : fallback;
  return ((base % 24) + 24) % 24;
}

export function labPreviewPresetForHour(value) {
  const hour = normalizeLabPreviewHour(value);
  if (hour >= 5 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 16) return 'day';
  if (hour >= 16 && hour < 20) return 'sunset';
  return 'night';
}

export function createLabPreviewEnvironment(input = null) {
  const source = input && typeof input === 'object' ? input : {};
  const hour = normalizeLabPreviewHour(source.hour, DEFAULT_LAB_PREVIEW_ENVIRONMENT.hour);
  return {
    autoCycle: source.autoCycle === true,
    hour,
    preset: labPreviewPresetForHour(hour),
    type: LAB_PREVIEW_ENVIRONMENT_TYPE,
    version: LAB_PREVIEW_ENVIRONMENT_VERSION,
  };
}

export function referenceLabPreviewState(value) {
  const environment = createLabPreviewEnvironment(
    typeof value === 'object' ? value : { hour: value },
  );
  return {
    ...environment,
    ...LAB_PREVIEW_REFERENCE_STATES[environment.preset],
  };
}

function rgbFromHex(value) {
  const hex = String(value).replace('#', '');
  return [
    Number.parseInt(hex.slice(0, 2), 16),
    Number.parseInt(hex.slice(2, 4), 16),
    Number.parseInt(hex.slice(4, 6), 16),
  ];
}

function hexFromRgb(value) {
  return `#${value.map((channel) => (
    Math.round(channel).toString(16).padStart(2, '0')
  )).join('')}`;
}

function mixHexColors(from, to, amount) {
  const start = rgbFromHex(from);
  const end = rgbFromHex(to);
  return hexFromRgb(start.map((channel, index) => (
    channel + (end[index] - channel) * amount
  )));
}

const LAB_PREVIEW_REFERENCE_ANCHORS = Object.freeze([
  Object.freeze({ hour: 6, preset: 'dawn' }),
  Object.freeze({ hour: 13, preset: 'day' }),
  Object.freeze({ hour: 18, preset: 'sunset' }),
  Object.freeze({ hour: 22, preset: 'night' }),
  Object.freeze({ hour: 30, preset: 'dawn' }),
]);

/**
 * Continuously interpolates the four reference states around the 24-hour
 * clock. referenceLabPreviewState() identifies the active review period;
 * this sampler is what preview lighting rigs should render between presets.
 */
export function sampleLabPreviewReferenceState(value) {
  const environment = createLabPreviewEnvironment(
    typeof value === 'object' ? value : { hour: value },
  );
  const sampleHour = environment.hour < 6 ? environment.hour + 24 : environment.hour;
  let previous = LAB_PREVIEW_REFERENCE_ANCHORS[0];
  let next = LAB_PREVIEW_REFERENCE_ANCHORS[1];

  for (let index = 0; index < LAB_PREVIEW_REFERENCE_ANCHORS.length - 1; index += 1) {
    const candidate = LAB_PREVIEW_REFERENCE_ANCHORS[index];
    const following = LAB_PREVIEW_REFERENCE_ANCHORS[index + 1];
    if (sampleHour >= candidate.hour && sampleHour <= following.hour) {
      previous = candidate;
      next = following;
      break;
    }
  }

  const span = Math.max(next.hour - previous.hour, 0.0001);
  const amount = Math.min(Math.max((sampleHour - previous.hour) / span, 0), 1);
  const from = LAB_PREVIEW_REFERENCE_STATES[previous.preset];
  const to = LAB_PREVIEW_REFERENCE_STATES[next.preset];

  return {
    ...environment,
    ambientColor: mixHexColors(from.ambientColor, to.ambientColor, amount),
    directLightColor: mixHexColors(from.directLightColor, to.directLightColor, amount),
    shadowTint: mixHexColors(from.shadowTint, to.shadowTint, amount),
  };
}

export function formatLabPreviewHour(value) {
  const hour = normalizeLabPreviewHour(value);
  const totalMinutes = Math.round(hour * 60) % (24 * 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}
