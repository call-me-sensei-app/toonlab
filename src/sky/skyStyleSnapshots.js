// Immutable checkpoints for the combined optional sky and cloud style stack.
// Each new snapshot composes another switchable module over the same physical
// atmosphere and cloud renderer; earlier snapshots never change.

import {
  resolveCloudStyleSnapshot,
} from '../cloud/cloudStyleSnapshots.js';
import { toSerializableCloudStyleParams } from '../cloud/cloudStyle.js';
import { deepFreeze } from '../cloud/paramSchema.js';
import { toSerializableSkyColorParams } from './skyColor.js';

function snapshot(id, label, description, cloudStyle, skyColor) {
  return deepFreeze({
    cloudStyle: toSerializableCloudStyleParams(cloudStyle),
    description,
    id,
    label,
    skyColor: toSerializableSkyColorParams(skyColor),
  });
}

const V1_CLOUD = resolveCloudStyleSnapshot('1.0').cloudStyle;
const V20_CLOUD = resolveCloudStyleSnapshot('2.0').cloudStyle;
const V22_CLOUD = resolveCloudStyleSnapshot('2.2').cloudStyle;
const V23_CLOUD = resolveCloudStyleSnapshot('2.3').cloudStyle;
const V24_CLOUD = resolveCloudStyleSnapshot('2.4').cloudStyle;
const V25_CLOUD = resolveCloudStyleSnapshot('2.5').cloudStyle;
const V26_CLOUD = resolveCloudStyleSnapshot('2.6').cloudStyle;
const V27_CLOUD = resolveCloudStyleSnapshot('2.7').cloudStyle;
const V28_CLOUD = resolveCloudStyleSnapshot('2.8').cloudStyle;
const V29_CLOUD = resolveCloudStyleSnapshot('2.9').cloudStyle;
const PHYSICAL_SKY = { enabled: false, palette: { enabled: false } };
const V21_SKY = {
  enabled: true,
  amount: 1,
  palette: {
    enabled: true,
    // These are linear shader inputs, corrected so the post-tonemapped output
    // lands on the sampled display colours instead of washing grey.
    zenithColor: [0, 0.34, 0.71],
    horizonColor: [0.46, 0.78, 0.94],
    horizonBlend: 0.14,
    saturation: 1.24,
    contrast: 1.04,
    brightness: 0.9,
  },
};
const V27_SKY = {
  ...V21_SKY,
  timePalette: {
    enabled: true,
    morningEnabled: true,
    // Morning keeps a clean cyan-blue upper sky, then warms quickly into the
    // pale gold seen around a low rising sun. These are deliberately separate
    // from the afternoon palette so daylight remains the approved V2.6 look.
    morningZenith: [0.015, 0.68, 1],
    morningHorizon: [1, 0.74, 0.62],
    morningAmount: 0.92,
    morningFill: 0.57,
    eveningEnabled: true,
    // Evening shifts the full dome toward coral while the sun-facing horizon
    // stays hotter and more orange than the softer morning horizon.
    eveningZenith: [1, 0.28, 0.22],
    eveningHorizon: [1, 0.45, 0.1],
    eveningAmount: 0.98,
    eveningFill: 0.7,
    nightEnabled: true,
    nightZenith: [0.008, 0.02, 0.09],
    nightHorizon: [0.025, 0.07, 0.22],
    nightAmount: 0.98,
    nightFill: 0.18,
    nightStars: 1,
  },
};
const V210_SKY = {
  ...V27_SKY,
  starField: {
    enabled: true,
    amount: 1,
    pointThreshold: 0.02,
    pointSoftness: 0.06,
    diffuseStrength: 0.08,
    pointBrightness: 0.75,
  },
};

export const SKY_STYLE_SNAPSHOTS = deepFreeze({
  '1.0': snapshot(
    '1.0',
    'V1.0 Realistic',
    'The preserved physical atmosphere and volumetric cloud renderer with every style module bypassed.',
    V1_CLOUD,
    PHYSICAL_SKY,
  ),
  '2.0': snapshot(
    '2.0',
    'V2.0 Tone Foundation',
    'Adds the cloud tone module while keeping the physical atmosphere unchanged.',
    V20_CLOUD,
    PHYSICAL_SKY,
  ),
  '2.1': snapshot(
    '2.1',
    'V2.1 Sky Color',
    'Adds an authored cyan daytime sky palette sampled from the target reference.',
    V20_CLOUD,
    V21_SKY,
  ),
  '2.2': snapshot(
    '2.2',
    'V2.2 Blue Shadow',
    'Adds an exaggerated blue skylight tint to cloud undersides as its own switchable module.',
    V22_CLOUD,
    V21_SKY,
  ),
  '2.3': snapshot(
    '2.3',
    'V2.3 Shadow Wash',
    'Adds a pale, low-detail painted wash to the blue cloud underside as its own switchable module.',
    V23_CLOUD,
    V21_SKY,
  ),
  '2.4': snapshot(
    '2.4',
    'V2.4 Inner Paint',
    'Keeps the realistic volumetric silhouette while restricting the painted treatment to the cloud interior.',
    V24_CLOUD,
    V21_SKY,
  ),
  '2.5': snapshot(
    '2.5',
    'V2.5 White Top',
    'Broadens the clean white upper cloud interior from physical height and sun reach while preserving the V2.4 silhouette.',
    V25_CLOUD,
    V21_SKY,
  ),
  '2.6': snapshot(
    '2.6',
    'V2.6 Light Blend',
    'Shapes the white top, pale blue middle, and cool underside into broad readable regions while preserving the V2.5 silhouette.',
    V26_CLOUD,
    V21_SKY,
  ),
  '2.7': snapshot(
    '2.7',
    'V2.7 Time Palette',
    'Coordinates the V2.6 cloud treatment and atmosphere across morning, afternoon, evening, and night from the shared clock.',
    V27_CLOUD,
    V27_SKY,
  ),
  '2.8': snapshot(
    '2.8',
    'V2.8 Cloud Top Light',
    'Retains more physical sunlight variation across the V2.7 white cloud top for aerial and ground views.',
    V28_CLOUD,
    V27_SKY,
  ),
  '2.9': snapshot(
    '2.9',
    'V2.9 Surface Light',
    'Uses the first visible cloud layer to light the white exterior while preserving the V2.8 density and silhouette.',
    V29_CLOUD,
    V27_SKY,
  ),
  '2.10': snapshot(
    '2.10',
    'V2.10 Night Star Field',
    'Separates a supplied celestial panorama into sparse crisp stars and a restrained diffuse band without changing the approved night gradient or clouds.',
    V29_CLOUD,
    V210_SKY,
  ),
});

export const SKY_STYLE_SNAPSHOT_IDS = Object.freeze(Object.keys(SKY_STYLE_SNAPSHOTS));
export const DEFAULT_SKY_STYLE_SNAPSHOT = '1.0';

export function resolveSkyStyleSnapshot(id = DEFAULT_SKY_STYLE_SNAPSHOT) {
  return SKY_STYLE_SNAPSHOTS[id] ?? SKY_STYLE_SNAPSHOTS[DEFAULT_SKY_STYLE_SNAPSHOT];
}

// Named style-bundle selections resolve through system-owned data rather than
// through bundle IDs in a scene coordinator. A renamed or user-published
// bundle that selects the same sky style therefore lands the same look.
const SKY_SYSTEM_STYLE_SNAPSHOT_BY_STYLE = Object.freeze({
  call_me_sensei: '2.10',
});

export function resolveSkySystemStyleSnapshot(style) {
  const normalized = String(style ?? '').trim().toLowerCase().replace(/-/g, '_');
  const snapshotId = SKY_SYSTEM_STYLE_SNAPSHOT_BY_STYLE[normalized];
  return snapshotId ? resolveSkyStyleSnapshot(snapshotId) : null;
}

export function getSkyStyleSnapshotOptions() {
  return SKY_STYLE_SNAPSHOT_IDS.map((id) => ({
    description: SKY_STYLE_SNAPSHOTS[id].description,
    label: SKY_STYLE_SNAPSHOTS[id].label,
    value: id,
  }));
}

export function matchSkyStyleSnapshot(params) {
  const serialized = JSON.stringify({
    cloudStyle: toSerializableCloudStyleParams(params?.cloud?.style),
    skyColor: toSerializableSkyColorParams(params?.atmosphere?.style),
  });
  return SKY_STYLE_SNAPSHOT_IDS.find((id) => JSON.stringify({
    cloudStyle: SKY_STYLE_SNAPSHOTS[id].cloudStyle,
    skyColor: SKY_STYLE_SNAPSHOTS[id].skyColor,
  }) === serialized) ?? null;
}
