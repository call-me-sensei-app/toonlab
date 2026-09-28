export const STYLE_DOMAIN_SLOT_ROUTES = Object.freeze({
  character: 'toon',
  cloud: 'cloud',
  equipment: 'toon',
  lighting: 'lighting',
  'manufactured.environment': 'environment',
  'manufactured.surface': 'manufacturedSurface',
  'natural.rock': 'rock',
  post: 'post',
  prop: 'toon',
  sky: 'sky',
  'terrain.ground': 'groundShader',
  'vegetation.flower': 'flowerShader',
  'vegetation.grass': 'grassShader',
  'vegetation.tree': 'treeShader',
  water: 'water',
});

export const STYLE_TARGET_DOMAINS = Object.freeze(
  Object.keys(STYLE_DOMAIN_SLOT_ROUTES),
);
