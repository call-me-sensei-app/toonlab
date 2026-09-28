import {
  CALL_ME_SENSEI_STYLE_BUNDLE,
  STYLE_TARGET_LABEL_KEY,
  auditSceneStyleContract,
  createStyleTargetLabel,
  getFirstPartyStyleBundle,
  validateStyleBundleDocument,
} from '../styles/index.js';

export const SCENE_STYLE_MANIFEST_TYPE = 'toonlab/scene-style-manifest';
export const SCENE_STYLE_MANIFEST_VERSION = 1;
export const SCENE_STYLE_OPERATION_NAMES = Object.freeze([
  'inspect',
  'audit',
  'plan',
  'apply',
  'verify',
]);

function clone(value) {
  return structuredClone(value);
}

function resolveBundle(input) {
  const bundle = typeof input === 'string'
    ? getFirstPartyStyleBundle(input)
    : input ?? CALL_ME_SENSEI_STYLE_BUNDLE;
  const validated = validateStyleBundleDocument(bundle);
  if (!validated.ok) throw new TypeError(validated.errors.join(' '));
  return validated.value;
}

export function validateSceneStyleManifest(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { errors: ['Manifest must be an object.'], ok: false, value: null };
  }
  if (input.schema !== SCENE_STYLE_MANIFEST_TYPE) errors.push(`schema must be "${SCENE_STYLE_MANIFEST_TYPE}".`);
  if (input.version !== SCENE_STYLE_MANIFEST_VERSION) errors.push(`version must be ${SCENE_STYLE_MANIFEST_VERSION}.`);
  if (!Array.isArray(input.targets)) errors.push('targets must be an array.');
  const ids = new Set();
  for (const [index, target] of (input.targets ?? []).entries()) {
    if (!target || typeof target !== 'object') {
      errors.push(`targets[${index}] must be an object.`);
      continue;
    }
    if (typeof target.id !== 'string' || !target.id.trim()) errors.push(`targets[${index}].id is required.`);
    else if (ids.has(target.id)) errors.push(`targets[${index}].id duplicates "${target.id}".`);
    else ids.add(target.id);
    if (typeof target.domain !== 'string' || !target.domain.trim()) errors.push(`targets[${index}].domain is required.`);
  }
  return { errors, ok: errors.length === 0, value: errors.length === 0 ? clone(input) : null };
}

function materialFromRecord(record, index) {
  return {
    name: record?.id ?? `material-${index}`,
    opacity: record?.opacity ?? 1,
    transparent: record?.transparent === true,
    userData: { toonlabMaterialId: record?.id ?? `material-${index}` },
  };
}

function sceneFromManifest(manifest) {
  return {
    children: manifest.targets.map((target) => {
      const materials = (target.materials ?? [{ id: `${target.id}-material` }])
        .map(materialFromRecord);
      return {
        children: [],
        isMesh: true,
        material: materials.length === 1 ? materials[0] : materials,
        name: target.id,
        type: 'Mesh',
        userData: {
          [STYLE_TARGET_LABEL_KEY]: target.label ?? createStyleTargetLabel(target.domain, {
            targetId: target.id,
            materials: target.materialContract,
          }),
        },
      };
    }),
    name: manifest.name ?? 'SceneStyleManifest',
    type: 'Scene',
    userData: {},
  };
}

function auditManifest(manifest, { bundle, mode }) {
  return auditSceneStyleContract(sceneFromManifest(manifest), { bundle, mode });
}

export function runSceneStyleOperation(operation, input, {
  bundle = 'call-me-sensei',
  mode = 'advisory',
} = {}) {
  if (!SCENE_STYLE_OPERATION_NAMES.includes(operation)) {
    throw new TypeError(`Unknown scene style operation "${operation}".`);
  }
  if (!['strict', 'advisory'].includes(mode)) {
    throw new TypeError('mode must be "strict" or "advisory".');
  }
  const validated = validateSceneStyleManifest(input);
  if (!validated.ok) {
    return { ok: false, operation, errors: validated.errors, mode };
  }
  const manifest = validated.value;
  const styleBundle = resolveBundle(bundle);
  let audit;
  try {
    audit = auditManifest(manifest, { bundle: styleBundle, mode });
  } catch (error) {
    return {
      ok: false,
      operation,
      mode,
      errors: [error?.message ?? String(error)],
    };
  }
  const plan = {
    bundleId: styleBundle.id,
    mode,
    operations: audit.targets.map((target) => ({
      action: 'apply-style-domain',
      domain: target.domain,
      targetId: target.targetId,
    })),
    rejected: audit.issues.filter((issue) => issue.severity === 'error'),
  };

  if (operation === 'inspect') {
    return {
      ok: true,
      operation,
      manifest: { name: manifest.name ?? null, targetCount: manifest.targets.length },
      targets: audit.targets,
    };
  }
  if (operation === 'audit') return { ok: audit.ok, operation, audit };
  if (operation === 'plan') return { ok: audit.ok, operation, audit, plan };
  if (operation === 'apply') {
    if (!audit.ok) return { ok: false, operation, audit, plan, applied: false };
    return {
      ok: true,
      operation,
      applied: true,
      audit,
      manifest: {
        ...manifest,
        appliedStyle: {
          bundle: styleBundle,
          mode,
          plan,
          schema: 'toonlab/applied-scene-style',
          version: 1,
        },
      },
      plan,
    };
  }
  const appliedBundleId = manifest.appliedStyle?.bundle?.id ?? null;
  return {
    ok: audit.ok && appliedBundleId === styleBundle.id,
    operation,
    audit,
    expectedBundleId: styleBundle.id,
    appliedBundleId,
  };
}
