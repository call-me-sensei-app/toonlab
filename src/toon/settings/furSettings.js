// Shell fur.
//
// Renders N progressively-offset copies ("shells") of a mesh; each shell
// discards fragments by a procedural noise threshold that tightens toward the
// tip, so the surviving pixels read as fur strands. Fully procedural (no
// noise texture, no extra samplers), cutout-based (depth-writes, so it sorts
// correctly against outlines and transparents).
//
// Fur is strictly opt-in per material — a fuzzy collar should not make the
// whole costume shaggy:
//   - fur.materials: array of material name/uuid/regex patterns
//   - fur.roles: array of material roles (e.g. ['costume'])
//   - material.userData.toonFur = true
//
// Shells here are mesh clones since WebGL has no geometry shaders.

export const DEFAULT_FUR_SETTINGS = Object.freeze({
  enabled: false,
  // Number of shell layers. Cost scales linearly (each shell re-renders the
  // matched mesh), so keep modest; 8-12 reads well at toon scale.
  shellCount: 8,
  // World-space fur length at the outermost shell.
  length: 0.02,
  // 0 = fur sticks straight out; 1 = tips sag fully toward world-down.
  gravity: 0.35,
  // Strand density (noise cells per UV unit, scaled x100 internally).
  density: 3,
  // Shifts the discard threshold toward the roots; more negative = fuller coat.
  rootOffset: -0.2,
  // Darkens fur roots for cheap self-occlusion depth.
  rootShade: 0.55,
  materials: null,
  roles: null,
});

function firstDefined(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined) return source[key];
  }
  return undefined;
}

function numberOption(value, fallback, { min = -Infinity, max = Infinity } = {}) {
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return fallback;
  return Math.min(max, Math.max(min, nextValue));
}

function patternListOption(value) {
  if (!value) return null;
  const list = Array.isArray(value) ? value : [value];
  const normalized = list.filter((entry) => entry instanceof RegExp || (typeof entry === 'string' && entry.trim() !== ''));
  return normalized.length > 0 ? normalized : null;
}

function roleListOption(value) {
  if (!value) return null;
  const list = (Array.isArray(value) ? value : [value])
    .map((entry) => String(entry ?? '').trim().toLowerCase())
    .filter(Boolean);
  return list.length > 0 ? list : null;
}

function normalizeFurOptions(options) {
  if (options === false) return { enabled: false };
  if (options === true) return { enabled: true };
  return options || {};
}

export function createFurSettings(options = null) {
  const source = normalizeFurOptions(options);
  const enabled = source.enabled === true ||
    (source.enabled !== false && (Boolean(source.materials) || Boolean(source.roles)));

  return {
    density: numberOption(firstDefined(source, ['density']), DEFAULT_FUR_SETTINGS.density, { min: 0.1, max: 40 }),
    enabled,
    gravity: numberOption(firstDefined(source, ['gravity']), DEFAULT_FUR_SETTINGS.gravity, { min: 0, max: 1 }),
    length: numberOption(firstDefined(source, ['length', 'shellLength']), DEFAULT_FUR_SETTINGS.length, { min: 0, max: 1 }),
    materials: patternListOption(firstDefined(source, ['materials', 'materialPatterns'])),
    roles: roleListOption(firstDefined(source, ['roles', 'materialRoles'])),
    rootOffset: numberOption(firstDefined(source, ['rootOffset']), DEFAULT_FUR_SETTINGS.rootOffset, { min: -1, max: 0 }),
    rootShade: numberOption(firstDefined(source, ['rootShade', 'rootDarkening']), DEFAULT_FUR_SETTINGS.rootShade, { min: 0, max: 1 }),
    shellCount: Math.round(numberOption(firstDefined(source, ['shellCount', 'shells', 'layers']), DEFAULT_FUR_SETTINGS.shellCount, { min: 1, max: 32 })),
  };
}

function matchesPattern(patterns, name, uuid) {
  if (!patterns) return false;
  for (const pattern of patterns) {
    if (pattern instanceof RegExp) {
      if (pattern.test(name)) return true;
    } else if (pattern === name || pattern === uuid) {
      return true;
    } else {
      try {
        if (new RegExp(pattern, 'i').test(name)) return true;
      } catch {
        // Invalid pattern strings fall through to exact-match behavior above.
      }
    }
  }
  return false;
}

export function materialUsesFur(settings, sourceMaterial, roleInfo = null) {
  if (!settings?.enabled) return false;
  if (sourceMaterial?.userData?.toonFur === true) return true;
  const role = String(roleInfo?.role ?? '').toLowerCase();
  if (settings.roles?.includes(role)) return true;
  return matchesPattern(settings.materials, sourceMaterial?.name ?? '', sourceMaterial?.uuid ?? '');
}
