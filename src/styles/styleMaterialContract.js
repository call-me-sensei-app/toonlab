import { MATERIAL_ROLES } from '../core/materialRoles.js';
import { ENVIRONMENT_MATERIAL_ROLES } from '../environment/environmentMaterialClassifier.js';
import { MANUFACTURED_STRUCTURAL_ROLES } from '../environment/manufacturedMaterialContract.js';
import { VEGETATION_MATERIAL_ROLES } from '../vegetation/vegetationShaders.js';
import {
  STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION,
  STYLE_MATERIAL_STABLE_ID_PATTERN,
} from './styleMetadata.js';

export { STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION, STYLE_MATERIAL_STABLE_ID_PATTERN } from './styleMetadata.js';
export const STYLE_MATERIAL_MASK_ENCODINGS = Object.freeze([
  'geometry-group',
  'procedural-field',
  'texture-channel',
  'vertex-attribute',
]);
export const STYLE_MATERIAL_EXEMPTION_STRATEGIES = Object.freeze([
  'custom-adapter',
  'preserve-source',
  'single-role',
]);

const CHARACTER_ROLES = Object.freeze(Object.keys(MATERIAL_ROLES));
export const STYLE_DOMAIN_MATERIAL_ROLES = Object.freeze({
  character: CHARACTER_ROLES,
  cloud: Object.freeze([]),
  equipment: CHARACTER_ROLES,
  lighting: Object.freeze([]),
  'manufactured.environment': ENVIRONMENT_MATERIAL_ROLES,
  'manufactured.surface': MANUFACTURED_STRUCTURAL_ROLES,
  'natural.rock': Object.freeze(['rock']),
  post: Object.freeze([]),
  prop: CHARACTER_ROLES,
  sky: Object.freeze([]),
  'terrain.ground': Object.freeze(['ground']),
  'vegetation.flower': Object.freeze([
    VEGETATION_MATERIAL_ROLES.flowerCenter,
    VEGETATION_MATERIAL_ROLES.flowerPetal,
    VEGETATION_MATERIAL_ROLES.foliageCard,
    VEGETATION_MATERIAL_ROLES.herbaceousStem,
  ]),
  'vegetation.grass': Object.freeze([VEGETATION_MATERIAL_ROLES.grassBlade]),
  'vegetation.tree': Object.freeze([
    VEGETATION_MATERIAL_ROLES.foliageCard,
    VEGETATION_MATERIAL_ROLES.flowerCenter,
    VEGETATION_MATERIAL_ROLES.flowerPetal,
    VEGETATION_MATERIAL_ROLES.herbaceousStem,
    VEGETATION_MATERIAL_ROLES.woodySurface,
  ]),
  water: Object.freeze(['water']),
});

const COMPONENTS = Object.freeze(['r', 'g', 'b', 'a', 'x', 'y', 'z', 'w']);
const TEXTURE_COMPONENTS = Object.freeze(['r', 'g', 'b', 'a']);
const CONTRACT_KEYS = new Set(['assignments', 'exemptions', 'masks', 'schemaVersion']);
const ASSIGNMENT_KEYS = new Set(['exemptionId', 'maskId', 'roles']);
const MASK_KEYS = new Set(['encoding', 'selectors', 'source']);
const SELECTOR_KEYS = new Set(['component', 'equals', 'invert', 'range']);
const EXEMPTION_KEYS = new Set(['adapterId', 'approved', 'fallbackRole', 'reason', 'strategy']);

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function reportUnknownKeys(source, allowed, path, errors) {
  for (const key of Object.keys(source)) {
    if (!allowed.has(key)) errors.push(`Unknown ${path} field "${key}".`);
  }
}

function readStableId(value, path, errors) {
  if (typeof value !== 'string' || !STYLE_MATERIAL_STABLE_ID_PATTERN.test(value)) {
    errors.push(`${path} must be a stable identifier using letters, numbers, dot, underscore, colon, slash, or hyphen.`);
    return null;
  }
  return value;
}

function rolesForDomain(domain) {
  return STYLE_DOMAIN_MATERIAL_ROLES[domain] ?? [];
}

function readRoles(value, domain, path, errors) {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push(`${path} must contain at least one semantic material role.`);
    return [];
  }
  const allowed = rolesForDomain(domain);
  const roles = [];
  for (const entry of value) {
    const role = typeof entry === 'string' ? entry.trim() : '';
    if (!role) {
      errors.push(`${path} entries must be non-empty strings.`);
    } else if (!allowed.includes(role)) {
      errors.push(`Unknown material role "${role}" for domain "${domain}" at ${path}.`);
    } else if (roles.includes(role)) {
      errors.push(`Duplicate material role "${role}" at ${path}.`);
    } else {
      roles.push(role);
    }
  }
  return roles;
}

function readSelector(input, encoding, path, errors) {
  if (!isPlainObject(input)) {
    errors.push(`${path} must be an object.`);
    return null;
  }
  reportUnknownKeys(input, SELECTOR_KEYS, path, errors);
  const hasEquals = Object.hasOwn(input, 'equals');
  const hasRange = Object.hasOwn(input, 'range');
  if (hasEquals === hasRange) errors.push(`${path} must define exactly one of equals or range.`);

  let component;
  if (input.component !== undefined) {
    if (!COMPONENTS.includes(input.component)) {
      errors.push(`${path}.component must be one of ${COMPONENTS.join(', ')}.`);
    } else if (encoding === 'texture-channel' && !TEXTURE_COMPONENTS.includes(input.component)) {
      errors.push(`${path}.component must be r, g, b, or a for a texture-channel mask.`);
    } else {
      component = input.component;
    }
  } else if (encoding === 'texture-channel') {
    errors.push(`${path}.component is required for a texture-channel mask.`);
  }

  let equals;
  if (hasEquals) {
    const validString = typeof input.equals === 'string' && input.equals.trim() !== '';
    const validNumber = typeof input.equals === 'number' && Number.isFinite(input.equals);
    if (!validString && !validNumber) {
      errors.push(`${path}.equals must be a finite number or non-empty value.`);
    } else {
      equals = input.equals;
    }
  }

  let range;
  if (hasRange) {
    if (!Array.isArray(input.range)
      || input.range.length !== 2
      || !input.range.every(Number.isFinite)
      || input.range[0] > input.range[1]) {
      errors.push(`${path}.range must be two finite ascending numbers.`);
    } else {
      range = [...input.range];
    }
  }

  if (input.invert !== undefined && typeof input.invert !== 'boolean') {
    errors.push(`${path}.invert must be a boolean.`);
  }
  return {
    ...(component === undefined ? {} : { component }),
    ...(equals === undefined ? {} : { equals }),
    ...(range === undefined ? {} : { range }),
    ...(input.invert === undefined ? {} : { invert: input.invert }),
  };
}

function readMasks(input, domain, errors) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) {
    errors.push('materials.masks must be an object keyed by stable mask identifiers.');
    return {};
  }
  const masks = {};
  for (const [maskId, entry] of Object.entries(input)) {
    if (!readStableId(maskId, `materials.masks key "${maskId}"`, errors)) continue;
    if (!isPlainObject(entry)) {
      errors.push(`materials.masks.${maskId} must be an object.`);
      continue;
    }
    reportUnknownKeys(entry, MASK_KEYS, `materials.masks.${maskId}`, errors);
    const encoding = STYLE_MATERIAL_MASK_ENCODINGS.includes(entry.encoding) ? entry.encoding : null;
    if (!encoding) {
      errors.push(`materials.masks.${maskId}.encoding must be one of ${STYLE_MATERIAL_MASK_ENCODINGS.join(', ')}.`);
    }
    const source = readStableId(entry.source, `materials.masks.${maskId}.source`, errors);
    const selectors = {};
    if (!isPlainObject(entry.selectors) || Object.keys(entry.selectors).length === 0) {
      errors.push(`materials.masks.${maskId}.selectors must map at least one role to a selector.`);
    } else {
      for (const [role, selector] of Object.entries(entry.selectors)) {
        if (!rolesForDomain(domain).includes(role)) {
          errors.push(`Unknown material role "${role}" for domain "${domain}" at materials.masks.${maskId}.selectors.`);
          continue;
        }
        selectors[role] = readSelector(selector, encoding,
          `materials.masks.${maskId}.selectors.${role}`, errors);
      }
    }
    masks[maskId] = { encoding, source, selectors };
  }
  return masks;
}

function readExemptions(input, domain, errors) {
  if (input === undefined) return {};
  if (!isPlainObject(input)) {
    errors.push('materials.exemptions must be an object keyed by stable exemption identifiers.');
    return {};
  }
  const exemptions = {};
  for (const [exemptionId, entry] of Object.entries(input)) {
    if (!readStableId(exemptionId, `materials.exemptions key "${exemptionId}"`, errors)) continue;
    if (!isPlainObject(entry)) {
      errors.push(`materials.exemptions.${exemptionId} must be an object.`);
      continue;
    }
    reportUnknownKeys(entry, EXEMPTION_KEYS, `materials.exemptions.${exemptionId}`, errors);
    const strategy = STYLE_MATERIAL_EXEMPTION_STRATEGIES.includes(entry.strategy)
      ? entry.strategy
      : null;
    if (!strategy) {
      errors.push(`materials.exemptions.${exemptionId}.strategy must be one of ${STYLE_MATERIAL_EXEMPTION_STRATEGIES.join(', ')}.`);
    }
    if (entry.approved !== true) errors.push(`materials.exemptions.${exemptionId}.approved must be true.`);
    const reason = typeof entry.reason === 'string' ? entry.reason.trim() : '';
    if (!reason) errors.push(`materials.exemptions.${exemptionId}.reason is required.`);

    let fallbackRole;
    if (strategy === 'single-role') {
      fallbackRole = typeof entry.fallbackRole === 'string' ? entry.fallbackRole.trim() : '';
      if (!rolesForDomain(domain).includes(fallbackRole)) {
        errors.push(`materials.exemptions.${exemptionId}.fallbackRole must be valid for domain "${domain}".`);
      }
    } else if (entry.fallbackRole !== undefined) {
      errors.push(`materials.exemptions.${exemptionId}.fallbackRole is only valid for single-role.`);
    }

    let adapterId;
    if (strategy === 'custom-adapter') {
      adapterId = readStableId(entry.adapterId,
        `materials.exemptions.${exemptionId}.adapterId`, errors);
    } else if (entry.adapterId !== undefined) {
      errors.push(`materials.exemptions.${exemptionId}.adapterId is only valid for custom-adapter.`);
    }

    exemptions[exemptionId] = {
      approved: true,
      reason,
      strategy,
      ...(fallbackRole ? { fallbackRole } : {}),
      ...(adapterId ? { adapterId } : {}),
    };
  }
  return exemptions;
}

function readAssignments(input, domain, masks, exemptions, errors) {
  if (!isPlainObject(input) || Object.keys(input).length === 0) {
    errors.push('materials.assignments must map at least one stable material identifier.');
    return {};
  }
  if (rolesForDomain(domain).length === 0) {
    errors.push(`Domain "${domain}" does not accept material assignments.`);
  }
  const assignments = {};
  for (const [materialId, entry] of Object.entries(input)) {
    if (!readStableId(materialId, `materials.assignments key "${materialId}"`, errors)) continue;
    if (!isPlainObject(entry)) {
      errors.push(`materials.assignments.${materialId} must be an object.`);
      continue;
    }
    reportUnknownKeys(entry, ASSIGNMENT_KEYS, `materials.assignments.${materialId}`, errors);
    const roles = readRoles(entry.roles, domain, `materials.assignments.${materialId}.roles`, errors);
    const maskId = entry.maskId === undefined
      ? null
      : readStableId(entry.maskId, `materials.assignments.${materialId}.maskId`, errors);
    const exemptionId = entry.exemptionId === undefined
      ? null
      : readStableId(entry.exemptionId, `materials.assignments.${materialId}.exemptionId`, errors);

    if (maskId && exemptionId) {
      errors.push(`materials.assignments.${materialId} cannot use both maskId and exemptionId.`);
    }
    if (roles.length > 1 && !maskId && !exemptionId) {
      errors.push(`materials.assignments.${materialId} has multiple roles and requires a maskId or approved exemptionId.`);
    }
    if (roles.length === 1 && maskId) {
      errors.push(`materials.assignments.${materialId} has one role and must not declare a mask.`);
    }
    if (maskId) {
      if (!masks[maskId]) {
        errors.push(`materials.assignments.${materialId}.maskId references unknown mask "${maskId}".`);
      } else {
        for (const role of roles) {
          if (!masks[maskId].selectors[role]) {
            errors.push(`Mask "${maskId}" has no selector for role "${role}" used by material "${materialId}".`);
          }
        }
      }
    }
    if (exemptionId) {
      const exemption = exemptions[exemptionId];
      if (!exemption) {
        errors.push(`materials.assignments.${materialId}.exemptionId references unknown exemption "${exemptionId}".`);
      } else if (exemption.strategy === 'single-role' && !roles.includes(exemption.fallbackRole)) {
        errors.push(`Exemption "${exemptionId}" fallbackRole must be one of material "${materialId}" roles.`);
      } else if (roles.length === 1 && exemption.strategy === 'single-role') {
        errors.push(`Exemption "${exemptionId}" uses single-role but material "${materialId}" already has one role.`);
      }
    }
    assignments[materialId] = {
      roles,
      ...(maskId ? { maskId } : {}),
      ...(exemptionId ? { exemptionId } : {}),
    };
  }
  return assignments;
}

export function validateStyleMaterialContract(domain, input) {
  const errors = [];
  const warnings = [];
  if (!Object.hasOwn(STYLE_DOMAIN_MATERIAL_ROLES, domain)) {
    errors.push(`Unknown style target domain "${domain}".`);
  }
  if (!isPlainObject(input)) {
    return { errors: [...errors, 'materials must be a JSON object.'], ok: false, value: null, warnings };
  }
  reportUnknownKeys(input, CONTRACT_KEYS, 'materials', errors);
  if (input.schemaVersion !== STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION) {
    errors.push(`materials.schemaVersion must be ${STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION}.`);
  }
  const masks = readMasks(input.masks, domain, errors);
  const exemptions = readExemptions(input.exemptions, domain, errors);
  const assignments = readAssignments(input.assignments, domain, masks, exemptions, errors);
  const usedMasks = new Set(Object.values(assignments).map((entry) => entry.maskId).filter(Boolean));
  const usedExemptions = new Set(Object.values(assignments).map((entry) => entry.exemptionId).filter(Boolean));
  for (const maskId of Object.keys(masks)) {
    if (!usedMasks.has(maskId)) warnings.push(`Material mask "${maskId}" is not used by an assignment.`);
  }
  for (const exemptionId of Object.keys(exemptions)) {
    if (!usedExemptions.has(exemptionId)) warnings.push(`Material exemption "${exemptionId}" is not used by an assignment.`);
  }
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? {
      schemaVersion: STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION,
      assignments,
      ...(Object.keys(masks).length ? { masks } : {}),
      ...(Object.keys(exemptions).length ? { exemptions } : {}),
    } : null,
    warnings,
  };
}

export function createStyleMaterialContract(domain, definition) {
  const result = validateStyleMaterialContract(domain, {
    ...definition,
    schemaVersion: STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION,
  });
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return result.value;
}

export function parseStyleMaterialContract(domain, input) {
  try {
    return validateStyleMaterialContract(domain, typeof input === 'string' ? JSON.parse(input) : input);
  } catch (error) {
    return { errors: [`Invalid material contract JSON: ${error.message}`], ok: false, value: null, warnings: [] };
  }
}

export function serializeStyleMaterialContract(domain, input, { pretty = true } = {}) {
  const result = validateStyleMaterialContract(domain, input);
  if (!result.ok) throw new TypeError(result.errors.join(' '));
  return JSON.stringify(result.value, null, pretty ? 2 : 0);
}
