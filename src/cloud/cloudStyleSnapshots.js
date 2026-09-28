// Immutable visual-development checkpoints for optional cloud styling.
// A snapshot is configuration, not another renderer implementation: V1 stays
// available through the master bypass while each V2 step composes modules.

import { deepFreeze } from './paramSchema.js';
import { toSerializableCloudStyleParams } from './cloudStyle.js';

function snapshot(id, label, description, cloudStyle) {
  return deepFreeze({
    cloudStyle: toSerializableCloudStyleParams(cloudStyle),
    description,
    id,
    label,
  });
}

const CLOUD_STYLE_SNAPSHOT_BASE = deepFreeze({
  '1.0': snapshot(
    '1.0',
    'V1.0 Realistic',
    'The preserved physical sky and volumetric cloud renderer with every style module bypassed.',
    { enabled: false, tone: { enabled: false } },
  ),
  '2.0': snapshot(
    '2.0',
    'V2.0 Tone Foundation',
    'Adds a soft three-tone painted-lighting ramp while retaining physical density and light transport.',
    {
      enabled: true,
      amount: 0.75,
      tone: {
        enabled: true,
        shadowColor: [0.2, 0.38, 0.68],
        midColor: [0.58, 0.75, 0.95],
        lightColor: [1, 0.97, 0.88],
        shadowPoint: 0.16,
        lightPoint: 0.46,
        softness: 0.12,
        shadowLift: 0.03,
        highlightCompression: 0.18,
        brightness: 1.03,
      },
    },
  ),
  '2.2': snapshot(
    '2.2',
    'V2.2 Blue Shadow',
    'Adds a separate blue-skylight tint to shadowed cloud bodies while retaining the V2.0 tone ramp.',
    {
      enabled: true,
      amount: 0.75,
      tone: {
        enabled: true,
        shadowColor: [0.2, 0.38, 0.68],
        midColor: [0.58, 0.75, 0.95],
        lightColor: [1, 0.97, 0.88],
        shadowPoint: 0.16,
        lightPoint: 0.46,
        softness: 0.12,
        shadowLift: 0.03,
        highlightCompression: 0.18,
        brightness: 1.03,
      },
      blueShadow: {
        enabled: true,
        color: [0.05, 0.24, 0.72],
        amount: 0.78,
        range: 0.38,
        softness: 0.14,
      },
    },
  ),
  '2.3': snapshot(
    '2.3',
    'V2.3 Shadow Wash',
    'Lifts and simplifies the blue underside into a broad pale wash while preserving the V2.2 colour treatment.',
    {
      enabled: true,
      amount: 0.75,
      tone: {
        enabled: true,
        shadowColor: [0.2, 0.38, 0.68],
        midColor: [0.58, 0.75, 0.95],
        lightColor: [1, 0.97, 0.88],
        shadowPoint: 0.16,
        lightPoint: 0.46,
        softness: 0.12,
        shadowLift: 0.03,
        highlightCompression: 0.18,
        brightness: 1.03,
      },
      blueShadow: {
        enabled: true,
        color: [0.05, 0.24, 0.72],
        amount: 0.78,
        range: 0.38,
        softness: 0.14,
      },
      shadowWash: {
        enabled: true,
        lift: 0.38,
        detail: 0.32,
        blend: 0.18,
      },
    },
  ),
  '2.4': snapshot(
    '2.4',
    'V2.4 Inner Paint',
    'Keeps the realistic volumetric silhouette and confines the painted shadow wash to the cloud interior.',
    {
      enabled: true,
      amount: 0.75,
      tone: {
        enabled: true,
        shadowColor: [0.2, 0.38, 0.68],
        midColor: [0.58, 0.75, 0.95],
        lightColor: [1, 0.97, 0.88],
        shadowPoint: 0.16,
        lightPoint: 0.46,
        softness: 0.12,
        shadowLift: 0.03,
        highlightCompression: 0.18,
        brightness: 1.03,
      },
      blueShadow: {
        enabled: true,
        color: [0.05, 0.24, 0.72],
        amount: 0.78,
        range: 0.38,
        softness: 0.14,
      },
      shadowWash: {
        enabled: true,
        lift: 0.38,
        detail: 0.32,
        blend: 0.18,
      },
      innerPaint: {
        enabled: true,
        amount: 1,
        edgeKeep: 0.22,
        edgeBlend: 0.28,
      },
    },
  ),
  '2.5': snapshot(
    '2.5',
    'V2.5 White Top',
    'Broadens a clean warm-white region across the sun-reachable upper cloud interior while preserving the V2.4 physical edge.',
    {
      enabled: true,
      amount: 0.85,
      tone: {
        enabled: true,
        shadowColor: [0.2, 0.38, 0.68],
        midColor: [0.58, 0.75, 0.95],
        lightColor: [1, 0.97, 0.88],
        shadowPoint: 0.16,
        lightPoint: 0.46,
        softness: 0.12,
        shadowLift: 0.03,
        highlightCompression: 0.18,
        brightness: 1.03,
      },
      blueShadow: {
        enabled: true,
        color: [0.05, 0.24, 0.72],
        amount: 0.78,
        range: 0.38,
        softness: 0.14,
      },
      shadowWash: {
        enabled: true,
        lift: 0.38,
        detail: 0.32,
        blend: 0.18,
      },
      innerPaint: {
        enabled: true,
        amount: 1,
        edgeKeep: 0.22,
        edgeBlend: 0.28,
      },
      whiteTop: {
        enabled: true,
        color: [1, 0.98, 0.92],
        amount: 1,
        area: 0.75,
        softness: 0.18,
        detail: 0.3,
      },
    },
  ),
  '2.6': snapshot(
    '2.6',
    'V2.6 Light Blend',
    'Shapes a broad pale-blue middle between the cool underside and warm white top while preserving the V2.5 physical silhouette.',
    {
      enabled: true,
      amount: 0.85,
      tone: {
        enabled: true,
        shadowColor: [0.2, 0.38, 0.68],
        midColor: [0.58, 0.75, 0.95],
        lightColor: [1, 0.97, 0.88],
        shadowPoint: 0.16,
        lightPoint: 0.46,
        softness: 0.12,
        shadowLift: 0.03,
        highlightCompression: 0.18,
        brightness: 1.03,
      },
      blueShadow: {
        enabled: true,
        color: [0.05, 0.24, 0.72],
        amount: 0.78,
        range: 0.38,
        softness: 0.14,
      },
      shadowWash: {
        enabled: true,
        lift: 0.38,
        detail: 0.32,
        blend: 0.18,
      },
      innerPaint: {
        enabled: true,
        amount: 1,
        edgeKeep: 0.22,
        edgeBlend: 0.28,
      },
      whiteTop: {
        enabled: true,
        color: [1, 0.98, 0.92],
        amount: 1,
        area: 0.75,
        softness: 0.18,
        detail: 0.3,
      },
      lightBlend: {
        enabled: true,
        bottomColor: [0.25, 0.48, 0.78],
        middleColor: [0.65, 0.8, 0.96],
        amount: 0.5,
        balance: 0.16,
        softness: 0.14,
        detail: 0.65,
      },
    },
  ),
  '2.7': snapshot(
    '2.7',
    'V2.7 Time Palette',
    'Adds independent clock-driven morning, evening, and night colour to the V2.6 cloud interior while leaving afternoon and the physical silhouette unchanged.',
    {
      enabled: true,
      amount: 0.85,
      tone: {
        enabled: true,
        shadowColor: [0.2, 0.38, 0.68],
        midColor: [0.58, 0.75, 0.95],
        lightColor: [1, 0.97, 0.88],
        shadowPoint: 0.16,
        lightPoint: 0.46,
        softness: 0.12,
        shadowLift: 0.03,
        highlightCompression: 0.18,
        brightness: 1.03,
      },
      blueShadow: {
        enabled: true,
        color: [0.05, 0.24, 0.72],
        amount: 0.78,
        range: 0.38,
        softness: 0.14,
      },
      shadowWash: {
        enabled: true,
        lift: 0.38,
        detail: 0.32,
        blend: 0.18,
      },
      innerPaint: {
        enabled: true,
        amount: 1,
        edgeKeep: 0.22,
        edgeBlend: 0.28,
      },
      whiteTop: {
        enabled: true,
        color: [1, 0.98, 0.92],
        amount: 1,
        area: 0.75,
        softness: 0.18,
        detail: 0.3,
      },
      lightBlend: {
        enabled: true,
        bottomColor: [0.25, 0.48, 0.78],
        middleColor: [0.65, 0.8, 0.96],
        amount: 0.5,
        balance: 0.16,
        softness: 0.14,
        detail: 0.65,
      },
      timePalette: {
        enabled: true,
        morningEnabled: true,
        morningTop: [1, 0.9, 0.76],
        morningBottom: [0.3, 0.48, 0.78],
        morningAmount: 0.96,
        morningDetail: 0.2,
        morningBrightness: 1.5,
        eveningEnabled: true,
        eveningTop: [1, 0.5, 0.28],
        eveningBottom: [0.58, 0.24, 0.3],
        eveningAmount: 0.97,
        eveningDetail: 0.12,
        eveningBrightness: 1.45,
        nightEnabled: true,
        nightTop: [0.2, 0.45, 1],
        nightBottom: [0.04, 0.15, 0.55],
        nightAmount: 0.98,
        // Keep the moon-facing lobe and self-shadow structure from the physical
        // march. Too little retained detail turns the cloud into a flat blue
        // cutout even though the underlying volume already has definition.
        nightDetail: 0.4,
        nightContrast: 0.18,
        nightBrightness: 2.4,
      },
    },
  ),
});

const V27_CLOUD_STYLE = CLOUD_STYLE_SNAPSHOT_BASE['2.7'].cloudStyle;
const V28_CLOUD_STYLE = {
  ...V27_CLOUD_STYLE,
  topLight: {
    enabled: true,
    amount: 1,
  },
};

export const CLOUD_STYLE_SNAPSHOTS = deepFreeze({
  ...CLOUD_STYLE_SNAPSHOT_BASE,
  '2.8': snapshot(
    '2.8',
    'V2.8 Cloud Top Light',
    'Keeps the V2.7 palette while retaining more physical sunlight variation across the white cloud top.',
    V28_CLOUD_STYLE,
  ),
  '2.9': snapshot(
    '2.9',
    'V2.9 Surface Light',
    'Uses the first visible cloud layer to light the white exterior while preserving the V2.8 density and silhouette.',
    {
      ...V28_CLOUD_STYLE,
      surfaceLight: {
        enabled: true,
        amount: 1,
      },
    },
  ),
});

export const CLOUD_STYLE_SNAPSHOT_IDS = Object.freeze(Object.keys(CLOUD_STYLE_SNAPSHOTS));
export const DEFAULT_CLOUD_STYLE_SNAPSHOT = '1.0';

export function resolveCloudStyleSnapshot(id = DEFAULT_CLOUD_STYLE_SNAPSHOT) {
  return CLOUD_STYLE_SNAPSHOTS[id] ?? CLOUD_STYLE_SNAPSHOTS[DEFAULT_CLOUD_STYLE_SNAPSHOT];
}

export function getCloudStyleSnapshotOptions() {
  return CLOUD_STYLE_SNAPSHOT_IDS.map((id) => ({
    description: CLOUD_STYLE_SNAPSHOTS[id].description,
    label: CLOUD_STYLE_SNAPSHOTS[id].label,
    value: id,
  }));
}

export function matchCloudStyleSnapshot(params) {
  const serialized = JSON.stringify(toSerializableCloudStyleParams(params));
  return CLOUD_STYLE_SNAPSHOT_IDS.find((id) => (
    JSON.stringify(CLOUD_STYLE_SNAPSHOTS[id].cloudStyle) === serialized
  )) ?? null;
}
