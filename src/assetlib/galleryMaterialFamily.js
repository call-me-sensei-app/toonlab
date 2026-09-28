// Gallery model previews use two different material families:
// - environment: vegetation, geology, terrain, water, and natural specimens;
// - urban: architecture, manufactured objects, vehicles, props, and artifacts.
//
// Asset-source metadata is intentionally the authority. Mesh/material names
// remain available to the urban shader for per-surface roles, but they must
// not decide whether an entire tree, rock, or museum specimen is an urban
// object.

export const GALLERY_MATERIAL_FAMILY = Object.freeze({
  environment: 'environment',
  urban: 'urban',
});

const MANUFACTURED_PATTERN = new RegExp(`\\b(?:${[
  'aircraft',
  'appliance',
  'architecture',
  'artifact',
  'barrel',
  'bench',
  'bicycle',
  'billboard',
  'boat',
  'box',
  'bridge',
  'building',
  'bus',
  'car',
  'chair',
  'city',
  'container',
  'crate',
  'door',
  'electronics?',
  'fence',
  'furniture',
  'industrial',
  'infrastructure',
  'lamp',
  'landmark',
  'machine',
  'manufactured',
  'monument',
  'motorcycle',
  'prop',
  'railway',
  'road',
  'robot',
  'roof',
  'ruins?',
  'sculpture',
  'ship',
  'sign',
  'statue',
  'street',
  'sword',
  'table',
  'tool',
  'tower',
  'train',
  'truck',
  'urban',
  'vehicle',
  'wall',
  'weapon',
  'window',
].join('|')})\\b`, 'i');

const NATURE_PATTERN = new RegExp(`\\b(?:${[
  'animals?',
  'bark',
  'beach',
  'biological',
  'birds?',
  'bones?',
  'boulders?',
  'branches?',
  'bush(?:es)?',
  'caves?',
  'cliffs?',
  'corals?',
  'crabs?',
  'earth',
  'ferns?',
  'fish(?:es)?',
  'flowers?',
  'foliage',
  'forests?',
  'fossils?',
  'fung(?:us|i)',
  'geology',
  'grass',
  'ground',
  'ice',
  'insects?',
  'lakes?',
  'landscape',
  'leaves?',
  'mammals?',
  'minerals?',
  'moss',
  'mountains?',
  'mushrooms?',
  'natural',
  'nature',
  'oceans?',
  'plants?',
  'reefs?',
  'rivers?',
  'rocks?',
  'sands?',
  'shells?',
  'shrubs?',
  'skulls?',
  'snow',
  'soil',
  'specimen',
  'stone',
  'terrains?',
  'trees?',
  'trunks?',
  'vegetation',
  'vines?',
  'water',
  'wildlife',
].join('|')})\\b`, 'i');

function metadataText(asset) {
  return [
    asset?.id,
    asset?.name,
    asset?.label,
    asset?.source,
    asset?.sourceId,
    ...(Array.isArray(asset?.tags) ? asset.tags : []),
    ...(Array.isArray(asset?.categories) ? asset.categories : []),
  ].filter(Boolean).join(' ');
}

/**
 * Resolves the whole-model material family used by Gallery and Asset Browser
 * previews. Explicit metadata wins. Manufactured signals intentionally run
 * before nature signals so assets such as "stone wall" and "wooden bridge"
 * remain objects rather than being mistaken for geology or vegetation.
 */
export function resolveGalleryMaterialFamily(asset, {
  fallback = GALLERY_MATERIAL_FAMILY.urban,
} = {}) {
  const explicit = asset?.materialFamily ?? asset?.galleryMaterialFamily;
  if (Object.values(GALLERY_MATERIAL_FAMILY).includes(explicit)) return explicit;
  if (asset?.kind && asset.kind !== 'model') {
    return GALLERY_MATERIAL_FAMILY.environment;
  }
  if (asset?.source === 'plateau' || asset?.source === 'plateau-landmark') {
    return GALLERY_MATERIAL_FAMILY.urban;
  }

  const text = metadataText(asset);
  if (MANUFACTURED_PATTERN.test(text)) return GALLERY_MATERIAL_FAMILY.urban;
  if (NATURE_PATTERN.test(text)) return GALLERY_MATERIAL_FAMILY.environment;
  return Object.values(GALLERY_MATERIAL_FAMILY).includes(fallback)
    ? fallback
    : GALLERY_MATERIAL_FAMILY.urban;
}
