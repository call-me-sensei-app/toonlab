// Repository-only Tree Lab examples. These authored recipe option objects are
// intentionally separate from the npm runtime; reviewed tree recipes are
// published to the ToonLab Gallery and discovered through MCP.

import { TREE_TRUNK_STYLES } from './stylizedTree.js';

export const STYLIZED_TREE_EXAMPLES = Object.freeze([
  { seed: 3, size: 1.7, canopyColor: 0x4da258, leafDensity: 1,
    trunk: TREE_TRUNK_STYLES.straight },
  { seed: 8, size: 1.8, canopyColor: 0x54a85e, leafDensity: 1,
    trunk: TREE_TRUNK_STYLES.leaning },
  { seed: 5, size: 1.9, canopyColor: 0x5eb063, leafDensity: 0.85,
    trunk: TREE_TRUNK_STYLES.leaning },
  { seed: 11, size: 2.0, canopyColor: 0x58ab5c, leafDensity: 0.95,
    trunk: TREE_TRUNK_STYLES.curved },
  { seed: 17, size: 2.0, canopyColor: [0x4da258, 0x7fb84e, 0x9cbf46], leafDensity: 0.95,
    trunk: TREE_TRUNK_STYLES.curved },
  { seed: 9, size: 2.0, canopyColor: 0x6db54f, leafDensity: 0.95,
    canopyWidth: 1.6, canopyDepth: 0.7, trunk: TREE_TRUNK_STYLES.leaning },
  { seed: 21, size: 2.1, canopyColor: { from: 0xe8a33c, to: 0xd96f29 }, leafDensity: 0.9,
    trunk: TREE_TRUNK_STYLES.curved },
  { seed: 14, size: 2.0, canopyColor: 0x8f9e44, leafDensity: 0.72,
    trunk: TREE_TRUNK_STYLES.gnarled },
  { seed: 26, size: 1.7, leafDensity: 0.8, canopyWidth: 1.4, canopyDepth: 1.2,
    canopyColor: { hue: [0.9, 1.0], saturation: [0.45, 0.6], lightness: [0.62, 0.72] },
    trunk: TREE_TRUNK_STYLES.bonsai },
  { seed: 12, size: 2.4, canopyColor: 0xf5c531, canopyPalette: { crown: 0xffe98a },
    leafDensity: 0.95, canopyWidth: 1.5,
    skeleton: { radialSegments: 10 },
    trunk: { ...TREE_TRUNK_STYLES.swooping, bend: 0.5, lean: 0.95,
      bendDirection: 0, height: 2.0, radiusBottom: 0.28 } },
  { seed: 31, size: 2.3, pale: true, canopyColor: 0x8578e6,
    canopyPalette: { crown: 0xbdb2ff },
    leafDensity: 0.9, canopyWidth: 1.45, leafPlacement: 'tips',
    trunkReceiveShadow: false,
    skeleton: { attractionCount: 70, influenceRadius: 1.35 },
    trunk: { ...TREE_TRUNK_STYLES.curved, bend: 0.3, lean: 0.35, gnarl: 0.45,
      height: 1.9, radiusBottom: 0.26 } },
  { seed: 46, size: 4.0, pale: true, climbable: true,
    canopyColor: 0x8578e6, canopyPalette: { crown: 0xbdb2ff },
    leafDensity: 0.92, canopyWidth: 1.75, canopyDepth: 1.2,
    leafPlacement: 'tips', trunkReceiveShadow: false,
    skeleton: { attractionCount: 55, influenceRadius: 1.7, killRadius: 0.55,
      segmentLength: 0.36, attractionReach: 0.95, radialSegments: 14,
      tipRadius: 0.05, minLimbRadius: 0.04, maxNodes: 130 },
    canopy: { cardsPerCluster: 12, clusterRadius: 0.62 },
    trunk: { ...TREE_TRUNK_STYLES.leaning, bend: 0.24, lean: 0.42,
      height: 1.4, radiusBottom: 0.48 } },
]);

export function layoutTreeRow(configs, { margin = 1.6 } = {}) {
  const footprints = configs.map((config) =>
    (config.size ?? 1) * (config.canopyWidth ?? 1) * 2.3 + 1.4);
  const offsets = [];
  let cursor = 0;
  footprints.forEach((footprint, index) => {
    if (index > 0) cursor += (footprints[index - 1] + footprint) / 2 + margin;
    offsets.push(cursor);
  });
  const center = cursor / 2;
  return offsets.map((offset) => offset - center);
}
