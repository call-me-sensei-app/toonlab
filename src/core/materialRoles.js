const EMPTY_ROLE_OVERRIDES = Object.freeze({
  byName: new Map(),
  byUuid: new Map(),
  patterns: [],
  sourcesByUuid: new Map(),
});

export const MATERIAL_ROLES = Object.freeze({
  default: 0,
  costume: 1,
  skin: 2,
  face: 3,
  hair: 4,
  eye: 5,
  eyeHighlight: 6,
  blush: 7,
  transparentOverlay: 8,
  metal: 9,
  outline: 10,
  iris: 11,
  pupil: 12,
  sclera: 13,
  catchlight: 14,
});

export const MATERIAL_ROLE_LABELS = Object.freeze({
  default: 'Default',
  costume: 'Costume',
  skin: 'Skin',
  face: 'Face',
  hair: 'Hair',
  eye: 'Eye',
  eyeHighlight: 'Eye Highlight',
  blush: 'Blush',
  transparentOverlay: 'Transparent Overlay',
  metal: 'Metal',
  outline: 'Outline',
  iris: 'Iris',
  pupil: 'Pupil',
  sclera: 'Sclera',
  catchlight: 'Catchlight',
});

export const MATERIAL_ROLE_NAMES_BY_VALUE = Object.freeze(
  Object.fromEntries(Object.entries(MATERIAL_ROLES).map(([name, value]) => [value, name])),
);

const ROLE_ALIASES = Object.freeze({
  '': 'default',
  base: 'default',
  body: 'skin',
  catchlight: 'catchlight',
  cloth: 'costume',
  clothes: 'costume',
  default: 'default',
  decal: 'transparentOverlay',
  dress: 'costume',
  eyehi: 'eyeHighlight',
  eyehighlight: 'eyeHighlight',
  eyecatch: 'catchlight',
  eyecatchlight: 'catchlight',
  eyeglint: 'catchlight',
  eyeshine: 'eyeHighlight',
  highlight: 'eyeHighlight',
  iris: 'iris',
  metallic: 'metal',
  none: 'default',
  outfit: 'costume',
  overlay: 'transparentOverlay',
  pupil: 'pupil',
  sclera: 'sclera',
  skin: 'skin',
  transparent: 'transparentOverlay',
});

const CATCHLIGHT_TOKENS = ['catchlight', 'eye catch', 'eye_catch', 'eye glint', 'eyeglint'];
const EYE_HIGHLIGHT_TOKENS = ['目星', 'highlight', 'hi_eye', 'eye_hi', 'sparkle'];
const BLUSH_TOKENS = ['blush', 'cheek', '脸红', 'face red'];
const TRANSPARENT_OVERLAY_TOKENS = ['tear', 'decal'];
const IRIS_TOKENS = ['iris', '虹彩', '虹膜'];
const PUPIL_TOKENS = ['pupil', '瞳孔'];
const SCLERA_TOKENS = ['sclera', 'eye white', 'eyewhite', '白目'];
const EYE_TOKENS = ['eye', 'iris', 'pupil', 'eyeball', '白目', '目'];
const FACE_TOKENS = [
  'face',
  'head',
  'mouth',
  'tooth',
  'teeth',
  'tongue',
  'brow',
  'lash',
  'eyelid',
  '颜',
  '顏',
  '面',
  '面部',
  '顔',
  '脸',
  '脸部',
  '臉',
  '臉部',
  '表情',
  '睫',
  '二重',
  '眉',
  '嘴',
  '口',
  '口舌',
  '齿',
  '齒',
  '白目',
];
const SKIN_TOKENS = ['skin', 'body', 'hand', 'arm', 'leg', '肌', '皮肤', '皮膚', '体', '體', '身体', '身體'];
const HAIR_TOKENS = ['hair', '髪', '髮', '发', '發', '头发', '頭髮'];
const METAL_TOKENS = ['metal', 'metallic', 'gold', 'silver', 'bronze', 'steel', '金属', '金屬'];
const COSTUME_TOKENS = [
  'cloth',
  'clothes',
  'costume',
  'dress',
  'skirt',
  'sleeve',
  'outfit',
  'jacket',
  'coat',
  '服',
  '衣',
  '袖',
  '裙',
];

function normalizeRoleKey(value) {
  return String(value ?? '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
}

function textureLabel(texture) {
  const image = texture?.image;
  return [
    texture?.name,
    texture?.userData?.sourceName,
    texture?.userData?.sourceUri,
    texture?.userData?.gltfImageName,
    texture?.userData?.gltfImageUri,
    image?.currentSrc,
    image?.src,
    image?.name,
  ].filter(Boolean).join(' ');
}

export function materialText(mat) {
  const mmd = mat?.userData?.MMD || {};
  const source = mat?.userData?.toonSource || {};
  return [
    mat?.name,
    mmd.name,
    mmd.englishName,
    mmd.comment,
    source.format,
    source.materialName,
    source.textureName,
    source.imageName,
    source.imageUri,
    textureLabel(mat?.map),
    textureLabel(mat?.alphaMap),
  ].filter(Boolean).join(' ').toLowerCase();
}

export function hasAnyToken(text, tokens) {
  return tokens.some((token) => text.includes(token));
}

// Words that contain a role token without meaning that role. They are blanked
// out before that role's tokens are tested, so "armor" never reads as an arm,
// "headphones" never as a head, and a hair clip is an accessory, not hair.
const SEPARATOR = '[\\s_-]*';
const EYE_EXCLUSIONS = [
  new RegExp(`eye${SEPARATOR}(brow|lash|line|liner|lid|shadow)`, 'g'),
];
const FACE_EXCLUSIONS = [
  /surface|interface|facet/g,
  new RegExp(`head${SEPARATOR}(phone|set|band|gear|wear|piece|dress|acc|scarf|lamp|light)`, 'g'),
  /splash|flash/g,
];
const SKIN_EXCLUSIONS = [
  new RegExp(`(arm|leg)${SEPARATOR}warmer`, 'g'),
  /armou?r|charm|alarm|warm|farm|harm/g,
  new RegExp(`arm${SEPARATOR}(band|let|guard|ring)`, 'g'),
  /legging|legend|elegan/g,
  /handle|handkerchief|handbag/g,
  new RegExp(`body${SEPARATOR}suit|bodice`, 'g'),
];
const HAIR_EXCLUSIONS = [
  /chair/g,
  new RegExp(`hair${SEPARATOR}(pin|clip|band|tie|ornament|acc|ribbon|bow|flower|stick|comb|ring|clasp|jewel|net)`, 'g'),
];

function hasRoleToken(text, tokens, exclusions = []) {
  const cleaned = exclusions.reduce((value, pattern) => value.replace(pattern, ' '), text);
  return hasAnyToken(cleaned, tokens);
}

export function normalizeMaterialRole(value, fallback = 'default') {
  if (Number.isFinite(value)) {
    return MATERIAL_ROLE_NAMES_BY_VALUE[Math.round(value)] ?? fallback;
  }

  const direct = String(value ?? '').trim();
  if (direct in MATERIAL_ROLES) return direct;

  const key = normalizeRoleKey(value);
  const alias = ROLE_ALIASES[key];
  if (alias && alias in MATERIAL_ROLES) return alias;

  return fallback;
}

export function materialRoleValue(value) {
  return MATERIAL_ROLES[normalizeMaterialRole(value)] ?? MATERIAL_ROLES.default;
}

export function materialRoleName(value) {
  return normalizeMaterialRole(value);
}

function mapEntriesToRoleMap(value) {
  if (!value) return new Map();

  const entries = value instanceof Map
    ? [...value.entries()]
    : Object.entries(value);

  return new Map(entries
    .filter(([key]) => key !== undefined && key !== null && String(key).trim() !== '')
    .map(([key, role]) => [String(key), normalizeMaterialRole(role)]));
}

function normalizePattern(pattern) {
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern !== 'string' || pattern.trim() === '') return null;

  const trimmed = pattern.trim();
  if (trimmed.startsWith('/') && trimmed.lastIndexOf('/') > 0) {
    const lastSlash = trimmed.lastIndexOf('/');
    const source = trimmed.slice(1, lastSlash);
    const flags = trimmed.slice(lastSlash + 1);
    try {
      return new RegExp(source, flags.includes('i') ? flags : `${flags}i`);
    } catch {
      return null;
    }
  }

  const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(escaped, 'i');
}

export function normalizeMaterialRoleOverrides(overrides = null) {
  if (!overrides) return EMPTY_ROLE_OVERRIDES;

  const byName = mapEntriesToRoleMap(overrides.byName ?? overrides.names);
  const byUuid = mapEntriesToRoleMap(overrides.byUuid ?? overrides.uuids);
  const reservedKeys = new Set(['byName', 'names', 'byUuid', 'uuids', 'patterns']);

  for (const [key, role] of Object.entries(overrides)) {
    if (reservedKeys.has(key)) continue;
    byName.set(key, normalizeMaterialRole(role));
  }

  const patterns = (overrides.patterns ?? [])
    .map((entry) => {
      if (!entry) return null;
      const pattern = normalizePattern(entry.pattern ?? entry.match ?? entry.name);
      const role = normalizeMaterialRole(entry.role);
      return pattern ? { pattern, role } : null;
    })
    .filter(Boolean);

  return { byName, byUuid, patterns, sourcesByUuid: new Map() };
}

function userDataRole(mat) {
  const mmd = mat?.userData?.MMD || {};
  const role = mat?.userData?.toonRole ??
    mat?.userData?.materialRole ??
    mat?.userData?.role ??
    mmd.toonRole ??
    mmd.materialRole ??
    mmd.role;
  return role === undefined || role === null || String(role).trim() === ''
    ? null
    : normalizeMaterialRole(role);
}

function overrideRole(mat, overrides) {
  if (!overrides || overrides === EMPTY_ROLE_OVERRIDES) return null;

  if (mat?.uuid && overrides.byUuid.has(mat.uuid)) {
    return {
      role: overrides.byUuid.get(mat.uuid),
      source: overrides.sourcesByUuid?.get(mat.uuid) ?? 'override:uuid',
    };
  }

  const mmd = mat?.userData?.MMD || {};
  const names = [mat?.name, mmd.name, mmd.englishName].filter(Boolean);
  for (const name of names) {
    if (overrides.byName.has(name)) return { role: overrides.byName.get(name), source: 'override:name' };
  }

  const text = materialText(mat);
  for (const { pattern, role } of overrides.patterns) {
    if (pattern.test(text)) return { role, source: 'override:pattern' };
  }

  return null;
}

function flagsForPrimaryRole(primaryRole) {
  return {
    isBlush: primaryRole === 'blush',
    isCatchlight: primaryRole === 'catchlight',
    isEye: primaryRole === 'eye' ||
      primaryRole === 'eyeHighlight' ||
      primaryRole === 'iris' ||
      primaryRole === 'pupil' ||
      primaryRole === 'sclera' ||
      primaryRole === 'catchlight',
    isEyeHighlight: primaryRole === 'eyeHighlight' || primaryRole === 'catchlight',
    isFace: primaryRole === 'face' || primaryRole === 'blush',
    isHair: primaryRole === 'hair',
    isIris: primaryRole === 'iris',
    isMetal: primaryRole === 'metal',
    isPupil: primaryRole === 'pupil',
    isSclera: primaryRole === 'sclera',
    isSkin: primaryRole === 'skin',
    isTransparentOverlay: primaryRole === 'transparentOverlay' ||
      primaryRole === 'eyeHighlight' ||
      primaryRole === 'catchlight' ||
      primaryRole === 'blush',
  };
}

function classifyMaterialHeuristics(mat) {
  const text = materialText(mat);
  const isCatchlight = hasAnyToken(text, CATCHLIGHT_TOKENS);
  // "highlight" alone is ambiguous: a hair highlight overlay is not an eye.
  const namesHairOnly = hasRoleToken(text, HAIR_TOKENS, HAIR_EXCLUSIONS) &&
    !hasRoleToken(text, EYE_TOKENS, EYE_EXCLUSIONS);
  const isEyeHighlight = hasAnyToken(text, EYE_HIGHLIGHT_TOKENS) && !namesHairOnly;
  const isBlush = hasAnyToken(text, BLUSH_TOKENS);
  const isTransparentOverlay = isEyeHighlight ||
    isCatchlight ||
    isBlush ||
    hasAnyToken(text, TRANSPARENT_OVERLAY_TOKENS);
  const isIris = hasAnyToken(text, IRIS_TOKENS);
  const isPupil = hasAnyToken(text, PUPIL_TOKENS);
  const isSclera = hasAnyToken(text, SCLERA_TOKENS);
  const isEye = hasRoleToken(text, EYE_TOKENS, EYE_EXCLUSIONS);
  const isFace = hasRoleToken(text, FACE_TOKENS, FACE_EXCLUSIONS);
  const isSkin = hasRoleToken(text, SKIN_TOKENS, SKIN_EXCLUSIONS);
  const isHair = hasRoleToken(text, HAIR_TOKENS, HAIR_EXCLUSIONS);
  const isMetal = hasAnyToken(text, METAL_TOKENS);
  const isCostume = hasAnyToken(text, COSTUME_TOKENS);

  let primaryRole = 'default';
  if (isCatchlight) primaryRole = 'catchlight';
  else if (isEyeHighlight) primaryRole = 'eyeHighlight';
  else if (isBlush) primaryRole = 'blush';
  else if (isTransparentOverlay) primaryRole = 'transparentOverlay';
  else if (isPupil) primaryRole = 'pupil';
  else if (isIris) primaryRole = 'iris';
  else if (isSclera) primaryRole = 'sclera';
  else if (isEye) primaryRole = 'eye';
  else if (isFace) primaryRole = 'face';
  else if (isSkin) primaryRole = 'skin';
  else if (isHair) primaryRole = 'hair';
  else if (isMetal) primaryRole = 'metal';
  else if (isCostume) primaryRole = 'costume';

  return {
    isBlush,
    isCatchlight,
    isCostume,
    isEye: isEye || isEyeHighlight || isCatchlight || isIris || isPupil || isSclera,
    isEyeHighlight: isEyeHighlight || isCatchlight,
    isFace,
    isHair,
    isIris,
    isMetal,
    isPupil,
    isSclera,
    isSkin,
    isTransparentOverlay,
    primaryRole,
  };
}

export function classifyMaterialRole(mat, overrides = null) {
  const normalizedOverrides = overrides?.byName instanceof Map
    ? overrides
    : normalizeMaterialRoleOverrides(overrides);
  const userRole = userDataRole(mat);
  const explicitOverride = userRole
    ? { role: userRole, source: 'userData' }
    : overrideRole(mat, normalizedOverrides);

  if (explicitOverride) {
    const role = normalizeMaterialRole(explicitOverride.role);
    return {
      ...flagsForPrimaryRole(role),
      isCostume: role === 'costume',
      primaryRole: role,
      role,
      roleLabel: MATERIAL_ROLE_LABELS[role],
      roleValue: MATERIAL_ROLES[role],
      source: explicitOverride.source,
    };
  }

  const heuristic = classifyMaterialHeuristics(mat);
  const role = heuristic.primaryRole;
  return {
    ...heuristic,
    role,
    roleLabel: MATERIAL_ROLE_LABELS[role],
    roleValue: MATERIAL_ROLES[role],
    source: 'heuristic',
  };
}

export function roleIsTransparentOverlay(roleInfo) {
  return Boolean(roleInfo?.isTransparentOverlay);
}

export function roleIsEyeHighlight(roleInfo) {
  return Boolean(roleInfo?.isEyeHighlight);
}

export function roleIsCatchlight(roleInfo) {
  return Boolean(roleInfo?.isCatchlight);
}

export function roleIsEye(roleInfo) {
  return Boolean(roleInfo?.isEye);
}

export function roleIsIris(roleInfo) {
  return Boolean(roleInfo?.isIris);
}

export function roleIsPupil(roleInfo) {
  return Boolean(roleInfo?.isPupil);
}

export function roleIsSclera(roleInfo) {
  return Boolean(roleInfo?.isSclera);
}

export function roleIsFace(roleInfo) {
  return Boolean(roleInfo?.isFace);
}

export function roleIsSkin(roleInfo) {
  return Boolean(roleInfo?.isSkin);
}

export function roleIsHair(roleInfo) {
  return Boolean(roleInfo?.isHair);
}
