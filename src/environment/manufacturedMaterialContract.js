import { ENVIRONMENT_SETTING_FIELD_SCHEMA } from './environmentSettings.js';

export const MANUFACTURED_MATERIAL_MANIFEST_TYPE = 'toonlab/manufactured-material-manifest';
export const MANUFACTURED_MATERIAL_MANIFEST_VERSION = 1;
export const MANUFACTURED_MATERIAL_LOOK_VERSION = 1;

export const MANUFACTURED_MATERIAL_BASES = Object.freeze([
  'metal',
  'mineral',
  'wood',
  'polymer',
  'rubber',
  'glass',
  'ceramic',
  'textile',
  'leather',
  'paper',
  'composite',
  'fluid',
  'genericDielectric',
]);

export const MANUFACTURED_MATERIAL_FINISHES = Object.freeze([
  'raw',
  'painted',
  'varnished',
  'clearCoated',
  'polished',
  'brushed',
  'glazed',
  'anodized',
  'mirror',
  'matte',
]);

// Render modes select a small shader family. Base materials do not create
// shader forks; they only select sparse settings within that family.
export const MANUFACTURED_RENDER_MODES = Object.freeze([
  'opaque',
  'alphaCutout',
  'translucent',
  'transmissive',
  'unlit',
]);

export const MANUFACTURED_STRUCTURAL_ROLES = Object.freeze([
  'primaryMass',
  'secondaryStructure',
  'trim',
  'fastener',
  'cavity',
  'window',
  'graphic',
  'lightEmitter',
]);

export const MANUFACTURED_CONTENT_FLAGS = Object.freeze([
  'graphic',
  'display',
  'emissive',
]);

export const MANUFACTURED_OBJECT_CLASSES = Object.freeze([
  'generic',
  'prop',
  'vehicle',
  'buildingExterior',
  'buildingInterior',
  'furniture',
  'fixture',
  'appliance',
  'infrastructure',
  'signage',
  'industrialMachine',
  'clutter',
]);

const LEGACY_SURFACE_CLASSIFICATIONS = Object.freeze({
  paintedMetal: Object.freeze({
    baseMaterial: 'metal',
    finish: 'painted',
    renderMode: 'opaque',
    structuralRole: 'primaryMass',
  }),
  paintedTrim: Object.freeze({
    baseMaterial: 'metal',
    finish: 'painted',
    renderMode: 'opaque',
    structuralRole: 'trim',
  }),
  bareMetal: Object.freeze({
    baseMaterial: 'metal',
    finish: 'raw',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  }),
  rubber: Object.freeze({
    baseMaterial: 'rubber',
    finish: 'matte',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  }),
  lid: Object.freeze({
    baseMaterial: 'metal',
    finish: 'painted',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  }),
  graphicPanel: Object.freeze({
    baseMaterial: 'genericDielectric',
    contentFlags: Object.freeze(['graphic']),
    finish: 'matte',
    renderMode: 'opaque',
    structuralRole: 'graphic',
  }),
  technicalSurface: Object.freeze({
    baseMaterial: 'genericDielectric',
    contentFlags: Object.freeze(['display']),
    finish: 'matte',
    renderMode: 'opaque',
    structuralRole: 'secondaryStructure',
  }),
});

const LEGACY_SURFACE_ROLES = Object.freeze(Object.keys(LEGACY_SURFACE_CLASSIFICATIONS));

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function cleanObject(value) {
  return isPlainObject(value) ? value : {};
}

function includesEnum(values, value) {
  return values.includes(value);
}

function clamp01(value) {
  return Math.min(1, Math.max(0, Number(value) || 0));
}

function sourceRenderMode(sourceMaterial) {
  if (sourceMaterial?.isMeshBasicMaterial && !sourceMaterial?.emissiveMap) return 'unlit';
  if (
    Number(sourceMaterial?.transmission ?? 0) > 0.01
    || Number(sourceMaterial?.transmissionNode?.value ?? 0) > 0.01
  ) {
    return 'transmissive';
  }
  if (Number(sourceMaterial?.alphaTest ?? 0) > 0) return 'alphaCutout';
  if (sourceMaterial?.transparent || Number(sourceMaterial?.opacity ?? 1) < 0.999) {
    return 'translucent';
  }
  return 'opaque';
}

function sourceHasEmission(sourceMaterial) {
  if (sourceMaterial?.emissiveMap || sourceMaterial?.emissiveNode) return true;
  const emissive = sourceMaterial?.emissive;
  return Boolean(emissive && (emissive.r > 0 || emissive.g > 0 || emissive.b > 0));
}

function materialText(object, material) {
  const ancestry = [];
  let cursor = object;
  while (cursor && ancestry.length < 4) {
    ancestry.push(cursor.name ?? '');
    cursor = cursor.parent;
  }
  return `${ancestry.join(' ')} ${material?.name ?? ''}`.toLowerCase();
}

function freezeClassification(classification) {
  return Object.freeze({
    ...classification,
    contentFlags: Object.freeze([...classification.contentFlags]),
  });
}

/**
 * Creates a canonical, versioned manufactured-material classification.
 */
export function createManufacturedMaterialClassification(options = {}) {
  const source = cleanObject(options);
  return freezeClassification({
    version: 1,
    baseMaterial: includesEnum(MANUFACTURED_MATERIAL_BASES, source.baseMaterial)
      ? source.baseMaterial
      : 'genericDielectric',
    finish: includesEnum(MANUFACTURED_MATERIAL_FINISHES, source.finish)
      ? source.finish
      : 'matte',
    renderMode: includesEnum(MANUFACTURED_RENDER_MODES, source.renderMode)
      ? source.renderMode
      : 'opaque',
    structuralRole: includesEnum(MANUFACTURED_STRUCTURAL_ROLES, source.structuralRole)
      ? source.structuralRole
      : 'primaryMass',
    contentFlags: [
      ...new Set(
        (Array.isArray(source.contentFlags) ? source.contentFlags : [])
          .filter((flag) => includesEnum(MANUFACTURED_CONTENT_FLAGS, flag)),
      ),
    ],
    classificationSource: String(source.classificationSource ?? 'explicit'),
    confidence: clamp01(source.confidence ?? 1),
  });
}

function classificationFromMetadata(object, material) {
  const nodeData = cleanObject(object?.userData);
  const materialData = cleanObject(material?.userData);
  const keyedNodeClassification = cleanObject(nodeData.urbanMaterials)[material?.name];
  const nested = {
    ...cleanObject(nodeData.urbanMaterial),
    ...cleanObject(keyedNodeClassification),
    ...cleanObject(materialData.urbanMaterial),
  };
  const explicit = {
    baseMaterial: materialData.urbanBaseMaterial
      ?? nodeData.urbanBaseMaterial
      ?? nested.baseMaterial,
    finish: materialData.urbanFinish
      ?? nodeData.urbanFinish
      ?? nested.finish,
    renderMode: materialData.urbanRenderMode
      ?? nodeData.urbanRenderMode
      ?? nested.renderMode,
    structuralRole: materialData.urbanStructuralRole
      ?? nodeData.urbanStructuralRole
      ?? nested.structuralRole,
    contentFlags: materialData.urbanContentFlags
      ?? nodeData.urbanContentFlags
      ?? nested.contentFlags,
  };
  if (!includesEnum(MANUFACTURED_MATERIAL_BASES, explicit.baseMaterial)) return null;
  return createManufacturedMaterialClassification({
    ...explicit,
    classificationSource: nested.classificationSource ?? 'explicit',
    confidence: nested.confidence ?? 1,
  });
}

/**
 * Classifies one loaded Three.js material. Explicit metadata wins; names and
 * PBR properties provide a conservative automatic fallback.
 */
export function classifyManufacturedMaterial(object, materialOverride = null) {
  const sourceMaterial = materialOverride ?? (
    Array.isArray(object?.material) ? object.material[0] : object?.material
  );
  const explicitClassification = classificationFromMetadata(object, sourceMaterial);
  if (explicitClassification) return explicitClassification;

  const explicitRole = sourceMaterial?.userData?.urbanSurface
    ?? object?.userData?.urbanSurface;
  if (LEGACY_SURFACE_ROLES.includes(explicitRole)) {
    const legacy = LEGACY_SURFACE_CLASSIFICATIONS[explicitRole];
    return createManufacturedMaterialClassification({
      ...legacy,
      renderMode: sourceRenderMode(sourceMaterial),
      contentFlags: [
        ...(legacy.contentFlags ?? []),
        ...(sourceHasEmission(sourceMaterial) ? ['emissive'] : []),
      ],
      classificationSource: 'legacy',
      confidence: 1,
    });
  }

  const text = materialText(object, sourceMaterial);
  const sourceName = String(sourceMaterial?.name ?? '').toLowerCase();
  const canonicalRole = LEGACY_SURFACE_ROLES.find((role) => (
    new RegExp(`(?:^|[^a-z0-9])${role.toLowerCase()}(?:$|[^a-z0-9])`).test(text)
  ));
  if (canonicalRole) {
    const legacy = LEGACY_SURFACE_CLASSIFICATIONS[canonicalRole];
    return createManufacturedMaterialClassification({
      ...legacy,
      renderMode: sourceRenderMode(sourceMaterial),
      contentFlags: [
        ...(legacy.contentFlags ?? []),
        ...(sourceHasEmission(sourceMaterial) ? ['emissive'] : []),
      ],
      classificationSource: 'nameToken',
      confidence: 0.95,
    });
  }

  let baseMaterial = 'genericDielectric';
  let finish = 'matte';
  let structuralRole = 'primaryMass';
  const renderMode = sourceRenderMode(sourceMaterial);
  const contentFlags = [];
  let confidence = 0.42;

  if (/(sign|poster|billboard|advert|label|decal|graphic|print)/.test(text)) {
    contentFlags.push('graphic');
    structuralRole = 'graphic';
    confidence = Math.max(confidence, 0.9);
  }
  if (/(electrical|electronic|solar|photovoltaic|circuit|control.?panel|screen|display)/.test(text)) {
    contentFlags.push('display');
    if (structuralRole === 'primaryMass') structuralRole = 'secondaryStructure';
    confidence = Math.max(confidence, 0.86);
  }
  // Do not let an asset-level word such as "lamp" classify every material
  // below the asset as emissive. Emission needs an explicit material/part token
  // or actual emissive source data.
  if (sourceHasEmission(sourceMaterial) || /(emissive|bulb|glow|neon|led|light.?emitter)/.test(sourceName)) {
    contentFlags.push('emissive');
    if (structuralRole === 'primaryMass') structuralRole = 'lightEmitter';
    confidence = Math.max(confidence, 0.82);
  }

  if (/(glass|window|windshield|windscreen|mirror|glazing|bulb|lens)/.test(text)) {
    baseMaterial = 'glass';
    finish = /mirror/.test(text) ? 'mirror' : 'polished';
    if (structuralRole !== 'lightEmitter') structuralRole = 'window';
    confidence = 0.96;
  } else if (/(rubber|tire|tyre|seal)/.test(text)) {
    baseMaterial = 'rubber';
    structuralRole = 'secondaryStructure';
    confidence = 0.96;
  } else if (/(fabric|textile|cloth|upholstery|curtain|canvas|carpet|rug)/.test(text)) {
    baseMaterial = 'textile';
    confidence = 0.92;
  } else if (/(leather|suede)/.test(text)) {
    baseMaterial = 'leather';
    confidence = 0.96;
  } else if (/(paper|cardboard|carton|poster)/.test(text)) {
    baseMaterial = 'paper';
    confidence = 0.92;
  } else if (/(ceramic|porcelain|earthenware|tile)/.test(text)) {
    baseMaterial = 'ceramic';
    finish = /glaz/.test(text) ? 'glazed' : 'matte';
    confidence = 0.94;
  } else if (/(wood|timber|plank|plywood|veneer)/.test(text)) {
    baseMaterial = 'wood';
    finish = /(varnish|lacquer)/.test(text) ? 'varnished' : 'raw';
    confidence = 0.94;
  } else if (/(plastic|polymer|acrylic|vinyl|resin|foam)/.test(text)) {
    baseMaterial = 'polymer';
    confidence = 0.9;
  } else if (/(carbon.?fiber|fiberglass|fibre.?glass|laminate|composite)/.test(text)) {
    baseMaterial = 'composite';
    finish = /clear.?coat/.test(text) ? 'clearCoated' : 'matte';
    confidence = 0.92;
  } else if (/(liquid|fluid|water|oil)/.test(text)) {
    baseMaterial = 'fluid';
    finish = 'polished';
    confidence = 0.88;
  } else if (
    /(brick|concrete|cement|plaster|stucco|masonry|stone|marble|granite|asphalt|pavement|drywall|wall|floor|roof|gable|building)/.test(text)
    && !/(metal|steel|iron|alum|chrome|copper|brass)/.test(sourceName)
    && Number(sourceMaterial?.metalness ?? 0) <= 0.45
  ) {
    baseMaterial = 'mineral';
    finish = /(marble|granite|polish)/.test(text) ? 'polished' : 'raw';
    confidence = 0.9;
  } else if (
    /(metal|steel|iron|alum|chrome|copper|brass|handle|hinge|rod|bar|rail|pipe)/.test(text)
    || Number(sourceMaterial?.metalness ?? 0) > 0.45
  ) {
    baseMaterial = 'metal';
    finish = /(chrome|polish|mirror)/.test(text)
      ? 'polished'
      : /brush/.test(text)
        ? 'brushed'
        : /(handle|hinge|rod|bar|rail|pipe|bare|rust|oxid|corrod|patina)/.test(text)
          ? 'raw'
          : 'painted';
    confidence = /(metal|steel|iron|alum|chrome|copper|brass)/.test(text) ? 0.94 : 0.72;
  }

  if (/(paint|coating|coated)/.test(text) && baseMaterial !== 'genericDielectric') {
    finish = 'painted';
  } else if (/(matte|matt)/.test(text)) {
    finish = 'matte';
  } else if (Number(sourceMaterial?.roughness ?? 1) < 0.18 && finish === 'matte') {
    finish = 'polished';
  }

  if (/(top|lid|cover|roof|gable)/.test(text) && structuralRole === 'primaryMass') {
    structuralRole = 'secondaryStructure';
  }
  if (/(bottom|base|support|leg)/.test(sourceName) && structuralRole === 'primaryMass') {
    structuralRole = 'secondaryStructure';
  }
  if (/(trim|frame|grate|molding|moulding)/.test(text) && structuralRole === 'primaryMass') {
    structuralRole = 'trim';
  }
  if (/(handle|hinge|fastener|bolt|screw|rod|bar|rail|pipe)/.test(text)) {
    structuralRole = 'fastener';
  }
  if (/(cavity|interior|inside|recess|void)/.test(text)) structuralRole = 'cavity';

  return createManufacturedMaterialClassification({
    baseMaterial,
    finish,
    renderMode,
    structuralRole,
    contentFlags,
    classificationSource: baseMaterial === 'genericDielectric' ? 'fallback' : 'inferred',
    confidence,
  });
}

/**
 * Infers the stable object-level class used for broad profiles such as
 * building exteriors. Explicit root metadata always wins.
 */
export function inferManufacturedObjectClass(root) {
  const explicit = root?.userData?.urbanObjectClass
    ?? root?.userData?.manufacturedObjectClass;
  if (includesEnum(MANUFACTURED_OBJECT_CLASSES, explicit)) return explicit;
  const text = `${root?.name ?? ''} ${root?.userData?.sourceUrl ?? ''}`.toLowerCase();
  if (/(interior|room|apartment.?inside|indoor)/.test(text)) return 'buildingInterior';
  if (/(building|facade|façade|apartment|house|architecture|ground.?floor)/.test(text)) {
    return 'buildingExterior';
  }
  if (/(car|vehicle|bus|train|streetcar|tram|truck|bike|motorcycle)/.test(text)) return 'vehicle';
  if (/(chair|table|desk|sofa|couch|cabinet|shelf|bed|furniture)/.test(text)) return 'furniture';
  if (/(appliance|fridge|refrigerator|oven|washer|dryer|microwave)/.test(text)) return 'appliance';
  if (/(lamp|fixture|faucet|sink|toilet|shower)/.test(text)) return 'fixture';
  if (/(station|shelter|bridge|street|road|infrastructure)/.test(text)) return 'infrastructure';
  if (/(sign|billboard|poster)/.test(text)) return 'signage';
  if (/(machine|industrial|generator|compressor)/.test(text)) return 'industrialMachine';
  if (/(trash|clutter|debris|crate|bottle|can)/.test(text)) return 'clutter';
  if (root?.isObject3D) return 'prop';
  return 'generic';
}

function sanitizeSettingsPatch(input, path, errors) {
  const source = cleanObject(input);
  const features = {};
  const parameters = {};
  for (const [key, entry] of Object.entries(cleanObject(source.features))) {
    if (!ENVIRONMENT_SETTING_FIELD_SCHEMA.features[key]) {
      errors.push(`${path}.features contains unknown environment feature "${key}".`);
    } else if (typeof entry !== 'boolean') {
      errors.push(`${path}.features.${key} must be a boolean.`);
    } else {
      features[key] = entry;
    }
  }
  for (const [key, entry] of Object.entries(cleanObject(source.parameters))) {
    const field = ENVIRONMENT_SETTING_FIELD_SCHEMA.parameters[key];
    if (!field) {
      errors.push(`${path}.parameters contains unknown environment parameter "${key}".`);
      continue;
    }
    if (entry === null) {
      parameters[key] = null;
      continue;
    }
    if (field.type === 'color') {
      const color = Array.isArray(entry)
        ? entry.slice(0, 3).map(Number)
        : [Number(entry?.r), Number(entry?.g), Number(entry?.b)];
      if (color.length < 3 || !color.every(Number.isFinite)) {
        errors.push(`${path}.parameters.${key} must be an [r, g, b] color.`);
      } else {
        parameters[key] = color;
      }
      continue;
    }
    const number = typeof entry === 'boolean' ? Number.NaN : Number(entry);
    if (!Number.isFinite(number)) {
      errors.push(`${path}.parameters.${key} must be a finite number.`);
    } else {
      parameters[key] = number;
    }
  }
  return { features, parameters };
}

function sanitizeProfileMap(input, allowedKeys, path, errors) {
  const profiles = {};
  for (const [key, patch] of Object.entries(cleanObject(input))) {
    if (allowedKeys && !allowedKeys.includes(key)) {
      errors.push(`${path} contains unknown key "${key}".`);
      continue;
    }
    profiles[key] = sanitizeSettingsPatch(patch, `${path}.${key}`, errors);
  }
  return profiles;
}

/**
 * Validates the IP-owned material look table stored in an environment preset.
 */
export function validateManufacturedMaterialLook(input) {
  const errors = [];
  const warnings = [];
  const source = cleanObject(input);
  if (source.version !== undefined && Number(source.version) !== MANUFACTURED_MATERIAL_LOOK_VERSION) {
    errors.push(`Manufactured material look version must be ${MANUFACTURED_MATERIAL_LOOK_VERSION}.`);
  }
  const value = {
    version: MANUFACTURED_MATERIAL_LOOK_VERSION,
    default: sanitizeSettingsPatch(source.default, 'materialLook.default', errors),
    baseMaterials: sanitizeProfileMap(
      source.baseMaterials,
      MANUFACTURED_MATERIAL_BASES,
      'materialLook.baseMaterials',
      errors,
    ),
    finishes: sanitizeProfileMap(
      source.finishes,
      MANUFACTURED_MATERIAL_FINISHES,
      'materialLook.finishes',
      errors,
    ),
    renderModes: sanitizeProfileMap(
      source.renderModes,
      MANUFACTURED_RENDER_MODES,
      'materialLook.renderModes',
      errors,
    ),
    structuralRoles: sanitizeProfileMap(
      source.structuralRoles,
      MANUFACTURED_STRUCTURAL_ROLES,
      'materialLook.structuralRoles',
      errors,
    ),
    contentFlags: sanitizeProfileMap(
      source.contentFlags,
      MANUFACTURED_CONTENT_FLAGS,
      'materialLook.contentFlags',
      errors,
    ),
    objectClasses: sanitizeProfileMap(
      source.objectClasses,
      MANUFACTURED_OBJECT_CLASSES,
      'materialLook.objectClasses',
      errors,
    ),
    assets: sanitizeProfileMap(source.assets, null, 'materialLook.assets', errors),
  };
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0 ? value : null,
    warnings,
  };
}

export function createManufacturedMaterialLook(input = {}) {
  const result = validateManufacturedMaterialLook(input);
  if (!result.ok) throw new Error(result.errors.join(' '));
  return result.value;
}

function mergePatch(target, patch, label, appliedProfiles) {
  if (!patch) return;
  Object.assign(target.features, patch.features);
  Object.assign(target.parameters, patch.parameters);
  appliedProfiles.push(label);
}

/**
 * Resolves sparse IP profiles in a deterministic order. The global
 * environment settings remain the catch-all and are merged by the adapter.
 */
export function resolveManufacturedMaterialLook(materialLook, {
  assetId = '',
  classification = createManufacturedMaterialClassification(),
  objectClass = 'generic',
} = {}) {
  const look = createManufacturedMaterialLook(materialLook);
  const resolved = { features: {}, parameters: {} };
  const appliedProfiles = [];
  mergePatch(resolved, look.default, 'default', appliedProfiles);
  mergePatch(
    resolved,
    look.baseMaterials[classification.baseMaterial],
    `baseMaterials.${classification.baseMaterial}`,
    appliedProfiles,
  );
  mergePatch(
    resolved,
    look.finishes[classification.finish],
    `finishes.${classification.finish}`,
    appliedProfiles,
  );
  mergePatch(
    resolved,
    look.renderModes[classification.renderMode],
    `renderModes.${classification.renderMode}`,
    appliedProfiles,
  );
  mergePatch(
    resolved,
    look.structuralRoles[classification.structuralRole],
    `structuralRoles.${classification.structuralRole}`,
    appliedProfiles,
  );
  for (const flag of MANUFACTURED_CONTENT_FLAGS) {
    if (classification.contentFlags.includes(flag)) {
      mergePatch(resolved, look.contentFlags[flag], `contentFlags.${flag}`, appliedProfiles);
    }
  }
  mergePatch(resolved, look.objectClasses[objectClass], `objectClasses.${objectClass}`, appliedProfiles);
  if (assetId) mergePatch(resolved, look.assets[assetId], `assets.${assetId}`, appliedProfiles);
  return { ...resolved, appliedProfiles };
}

function classificationFromManifest(value) {
  const source = cleanObject(value);
  const required = [
    ['baseMaterial', MANUFACTURED_MATERIAL_BASES],
    ['finish', MANUFACTURED_MATERIAL_FINISHES],
    ['renderMode', MANUFACTURED_RENDER_MODES],
    ['structuralRole', MANUFACTURED_STRUCTURAL_ROLES],
  ];
  for (const [key, values] of required) {
    if (source[key] !== undefined && !values.includes(source[key])) {
      return { error: `classification.${key} has unknown value "${source[key]}".` };
    }
  }
  const invalidFlag = (source.contentFlags ?? [])
    .find((flag) => !MANUFACTURED_CONTENT_FLAGS.includes(flag));
  if (invalidFlag) return { error: `classification.contentFlags has unknown value "${invalidFlag}".` };
  if (!source.baseMaterial) return { error: 'classification.baseMaterial is required.' };
  return {
    value: createManufacturedMaterialClassification({
      ...source,
      classificationSource: 'manifest',
      confidence: 1,
    }),
  };
}

export function validateManufacturedMaterialManifest(input) {
  const errors = [];
  const warnings = [];
  let source = input;
  if (typeof source === 'string') {
    try {
      source = JSON.parse(source);
    } catch (error) {
      return { errors: [`Invalid material manifest JSON: ${error.message}`], ok: false, value: null, warnings };
    }
  }
  source = cleanObject(source);
  if (source.type !== MANUFACTURED_MATERIAL_MANIFEST_TYPE) {
    errors.push(`Material manifest type must be "${MANUFACTURED_MATERIAL_MANIFEST_TYPE}".`);
  }
  if (source.version !== MANUFACTURED_MATERIAL_MANIFEST_VERSION) {
    errors.push(`Material manifest version must be ${MANUFACTURED_MATERIAL_MANIFEST_VERSION}.`);
  }
  const assetId = String(source.assetId ?? '').trim();
  if (!assetId) errors.push('Material manifest assetId is required.');
  const objectClass = source.objectClass ?? 'generic';
  if (!MANUFACTURED_OBJECT_CLASSES.includes(objectClass)) {
    errors.push(`Material manifest objectClass "${objectClass}" is unknown.`);
  }
  const assignments = [];
  for (const [index, assignment] of (Array.isArray(source.assignments) ? source.assignments : []).entries()) {
    const selector = cleanObject(assignment?.selector);
    if (!selector.materialName && !selector.objectName && !selector.objectPath) {
      errors.push(`assignments[${index}].selector needs materialName, objectName, or objectPath.`);
    }
    const result = classificationFromManifest(assignment?.classification);
    if (result.error) {
      errors.push(`assignments[${index}].${result.error}`);
    } else {
      assignments.push({ selector: { ...selector }, classification: result.value });
    }
  }
  if (assignments.length === 0) warnings.push('Material manifest has no valid assignments.');
  return {
    errors,
    ok: errors.length === 0,
    value: errors.length === 0
      ? {
        type: MANUFACTURED_MATERIAL_MANIFEST_TYPE,
        version: MANUFACTURED_MATERIAL_MANIFEST_VERSION,
        assetId,
        objectClass,
        assignments,
      }
      : null,
    warnings,
  };
}

function materialArray(material) {
  return Array.isArray(material) ? material : material ? [material] : [];
}

function buildObjectPaths(root) {
  const paths = new Map();
  function visit(object, parentPath = '') {
    const segment = object.name || `${object.type ?? 'Object'}[${object.parent?.children?.indexOf(object) ?? 0}]`;
    const path = parentPath ? `${parentPath}/${segment}` : segment;
    paths.set(object, path);
    for (const child of object.children ?? []) visit(child, path);
  }
  visit(root);
  return paths;
}

function selectorMatches(selector, object, material, objectPath) {
  return (!selector.materialName || selector.materialName === material?.name)
    && (!selector.objectName || selector.objectName === object?.name)
    && (!selector.objectPath || selector.objectPath === objectPath);
}

/**
 * Applies a JSON sidecar manifest to any loaded Object3D. Object-specific
 * assignments are stored on the object so a shared source material may still
 * classify differently at distinct uses.
 */
export function applyManufacturedMaterialManifest(root, manifest) {
  const result = validateManufacturedMaterialManifest(manifest);
  if (!result.ok) throw new Error(result.errors.join(' '));
  const value = result.value;
  root.userData ??= {};
  root.userData.toonlabAssetId = value.assetId;
  root.userData.urbanObjectClass = value.objectClass;
  const paths = buildObjectPaths(root);
  let appliedAssignmentCount = 0;
  root.traverse((object) => {
    if (!object?.material) return;
    for (const material of materialArray(object.material)) {
      for (const assignment of value.assignments) {
        if (!selectorMatches(assignment.selector, object, material, paths.get(object))) continue;
        const objectSpecific = assignment.selector.objectName || assignment.selector.objectPath;
        if (objectSpecific) {
          object.userData ??= {};
          object.userData.urbanMaterials ??= {};
          object.userData.urbanMaterials[material?.name ?? ''] = assignment.classification;
        } else {
          material.userData ??= {};
          material.userData.urbanMaterial = assignment.classification;
        }
        appliedAssignmentCount += 1;
      }
    }
  });
  return {
    appliedAssignmentCount,
    assetId: value.assetId,
    objectClass: value.objectClass,
    warnings: result.warnings,
  };
}

/**
 * Audits a loaded Object3D before shader conversion. This works for GLB,
 * FBX, OBJ, USDZ, VRM, or procedural meshes because it inspects the loaded
 * Three.js graph, not the source container.
 */
export function analyzeManufacturedAsset(root, { confidenceThreshold = 0.75 } = {}) {
  const records = [];
  const materialUses = new Map();
  const materialIds = new WeakMap();
  let nextMaterialId = 1;
  const paths = buildObjectPaths(root);
  root.traverse((object) => {
    if (!object?.isMesh || !object.material) return;
    for (const material of materialArray(object.material)) {
      if (!materialIds.has(material)) materialIds.set(material, nextMaterialId++);
      const classification = classifyManufacturedMaterial(object, material);
      const record = {
        classification,
        material: material?.name ?? '',
        materialId: materialIds.get(material),
        object: object.name ?? '',
        objectPath: paths.get(object),
      };
      records.push(record);
      const uses = materialUses.get(record.materialId) ?? [];
      uses.push(record);
      materialUses.set(record.materialId, uses);
    }
  });

  const warnings = [];
  const fallbackCount = records.filter((record) => (
    record.classification.classificationSource === 'fallback'
  )).length;
  const lowConfidenceCount = records.filter((record) => (
    record.classification.confidence < confidenceThreshold
  )).length;
  for (const uses of materialUses.values()) {
    const signatures = new Set(uses.map(({ classification }) => (
      [
        classification.baseMaterial,
        classification.finish,
        classification.renderMode,
        classification.structuralRole,
        ...classification.contentFlags,
      ].join('|')
    )));
    if (signatures.size > 1) {
      warnings.push(
        `Shared material "${uses[0].material || '(unnamed)'}" resolves differently across objects; author an object-specific manifest assignment or split it.`,
      );
    }
  }
  if (fallbackCount > 0) {
    warnings.push(
      `${fallbackCount} material use(s) fell back to genericDielectric; inspect names/maps or provide a sidecar manifest.`,
    );
  }

  return {
    assetId: root?.userData?.toonlabAssetId ?? '',
    objectClass: inferManufacturedObjectClass(root),
    records,
    summary: {
      explicitCount: records.filter((record) => (
        ['explicit', 'legacy', 'manifest'].includes(record.classification.classificationSource)
      )).length,
      fallbackCount,
      inferredCount: records.filter((record) => (
        ['inferred', 'nameToken'].includes(record.classification.classificationSource)
      )).length,
      lowConfidenceCount,
      materialUseCount: records.length,
      uniqueMaterialCount: materialUses.size,
    },
    warnings,
  };
}

// Short aliases keep the benchmark vocabulary available without making
// "urban" the conceptual boundary of the public runtime contract.
export const URBAN_MATERIAL_BASES = MANUFACTURED_MATERIAL_BASES;
export const URBAN_MATERIAL_FINISHES = MANUFACTURED_MATERIAL_FINISHES;
export const URBAN_RENDER_MODES = MANUFACTURED_RENDER_MODES;
export const URBAN_STRUCTURAL_ROLES = MANUFACTURED_STRUCTURAL_ROLES;
export const URBAN_CONTENT_FLAGS = MANUFACTURED_CONTENT_FLAGS;
