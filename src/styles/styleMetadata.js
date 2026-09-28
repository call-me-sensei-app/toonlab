export const STYLE_TARGET_LABEL_KEY = 'toonlab';
export const STYLE_TARGET_LABEL_SCHEMA_VERSION = 2;
export const STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION = 1;
export const STYLE_MATERIAL_STABLE_ID_PATTERN = /^[a-z0-9](?:[a-z0-9._:/-]*[a-z0-9])?$/i;
export const STYLE_SYSTEM_OWNER_KEY = 'toonlabSystemOwner';
export const STYLE_SYSTEM_OWNER_SCHEMA_VERSION = 1;

function readStableId(value, label, required = false) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new TypeError(`${label} is required.`);
    return undefined;
  }
  const id = String(value).trim();
  if (!STYLE_MATERIAL_STABLE_ID_PATTERN.test(id)) {
    throw new TypeError(`${label} must be a stable ToonLab identifier.`);
  }
  return id;
}

/** Internal-by-convention builder shared by package factories and validators. */
export function createFactoryStyleTargetMetadata(domain, {
  assetId,
  collision,
  extensions,
  materials,
  targetId,
} = {}) {
  const normalizedDomain = typeof domain === 'string' ? domain.trim() : '';
  if (!normalizedDomain) throw new TypeError('Factory style target domain is required.');
  const normalizedTargetId = readStableId(targetId, 'Factory style target id');
  const normalizedAssetId = readStableId(assetId, 'Factory style asset id');
  return {
    schemaVersion: STYLE_TARGET_LABEL_SCHEMA_VERSION,
    ...(normalizedTargetId ? { targetId: normalizedTargetId } : {}),
    ...(normalizedAssetId ? { assetId: normalizedAssetId } : {}),
    domain: normalizedDomain,
    ...(collision ? { collision: typeof collision === 'string' ? collision.trim() : collision } : {}),
    ...(materials ? {
      materials: {
        schemaVersion: STYLE_MATERIAL_CONTRACT_SCHEMA_VERSION,
        ...materials,
      },
    } : {}),
    ...(extensions ? { extensions } : {}),
  };
}

export function attachFactoryStyleTarget(root, domain, options = {}) {
  if (!root || typeof root !== 'object') throw new TypeError('Factory style target root is required.');
  root.userData ??= {};
  root.userData[STYLE_TARGET_LABEL_KEY] = createFactoryStyleTargetMetadata(domain, options);
  return root.userData[STYLE_TARGET_LABEL_KEY];
}

export function markFactoryStyleMaterial(material, materialId, { managed = true } = {}) {
  if (!material || typeof material !== 'object') throw new TypeError('Factory style material is required.');
  const id = readStableId(materialId, 'Factory style material id', true);
  material.userData ??= {};
  material.userData.toonlabMaterialId = id;
  material.userData.toonlabManagedMaterial = Boolean(managed);
  return material;
}

export function markFactorySystemOwned(root, domain, systemId) {
  if (!root || typeof root !== 'object') throw new TypeError('Factory system-owned root is required.');
  root.userData ??= {};
  root.userData[STYLE_SYSTEM_OWNER_KEY] = {
    domain: String(domain).trim(),
    systemId: readStableId(systemId, 'Factory system id', true),
    version: STYLE_SYSTEM_OWNER_SCHEMA_VERSION,
  };
  return root;
}
