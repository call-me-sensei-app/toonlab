import {
  STYLE_DOMAIN_MATERIAL_ROLES,
  STYLE_MATERIAL_STABLE_ID_PATTERN,
} from './styleMaterialContract.js';
import { STYLE_TARGET_LABEL_KEY } from './styleTargetLabels.js';

export const STYLE_TRANSPARENT_MATERIAL_ROLES = new Set([
  'blush',
  'catchlight',
  'eyeHighlight',
  'flowerPetal',
  'foliageCard',
  'grassBlade',
  'transparentOverlay',
  'water',
  'window',
]);

export function readStyleMaterialId(material) {
  const explicit = material?.userData?.toonlabMaterialId;
  const candidate = typeof explicit === 'string' && explicit.trim()
    ? explicit.trim()
    : typeof material?.name === 'string'
      ? material.name.trim()
      : '';
  return STYLE_MATERIAL_STABLE_ID_PATTERN.test(candidate) ? candidate : null;
}

/** Collect unique live material slots below one labeled root. */
export function collectStyleTargetMaterials(root, { pathByNode = null } = {}) {
  const records = [];
  const seen = new Set();
  const visit = (node) => {
    if (node !== root && node?.userData?.[STYLE_TARGET_LABEL_KEY] !== undefined) return;
    const materials = Array.isArray(node?.material)
      ? node.material
      : node?.material
        ? [node.material]
        : [];
    for (const [slot, material] of materials.entries()) {
      if (!material || seen.has(material)) continue;
      seen.add(material);
      records.push({
        custom: Boolean(
          (material.isShaderMaterial
            || material.isRawShaderMaterial
            || material.isNodeMaterial)
          && material.userData?.toonlabManagedMaterial !== true
        ),
        id: readStyleMaterialId(material),
        material,
        nodePath: pathByNode?.get(node) ?? null,
        slot,
        transparent: material.transparent === true
          || (Number.isFinite(material.opacity) && material.opacity < 0.999),
      });
    }
    for (const child of node?.children ?? []) visit(child);
  };
  visit(root);
  return records;
}

function customExemption(label, assignment) {
  const exemptionId = assignment?.exemptionId;
  if (!exemptionId) return null;
  const exemption = label.materials?.exemptions?.[exemptionId];
  return exemption?.strategy === 'custom-adapter' ? exemption : null;
}

/**
 * Reconcile a declared material contract with the live material objects it is
 * supposed to cover. This is intentionally shared by scene audit and strict
 * bundle preflight so the latter cannot trust stale declarations.
 */
export function auditStyleTargetMaterialCoverage(domain, label, subject) {
  if (!subject || !label?.materials) return { issues: [], materials: [] };
  if ((STYLE_DOMAIN_MATERIAL_ROLES[domain]?.length ?? 0) === 0) {
    return { issues: [], materials: collectStyleTargetMaterials(subject) };
  }

  const assignments = label.materials.assignments ?? {};
  const consumedAssignments = new Set();
  const issues = [];
  const materials = collectStyleTargetMaterials(subject);
  for (const record of materials) {
    const materialId = record.id;
    const assignment = materialId ? assignments[materialId] : null;
    if (!materialId) {
      issues.push({
        code: 'missing-material-id',
        materialId: null,
        message: `Live material slot ${record.slot} has no stable ToonLab material id or valid name.`,
        severity: 'error',
      });
      continue;
    }
    if (!assignment) {
      issues.push({
        code: 'missing-material-role',
        materialId,
        message: `The declared contract has no semantic role for live material "${materialId}".`,
        severity: 'error',
      });
      continue;
    }
    consumedAssignments.add(materialId);
    if (record.custom && !customExemption(label, assignment)) {
      issues.push({
        code: 'unsupported-custom-material',
        materialId,
        message: `Live material "${materialId}" uses a custom renderer without an approved custom-adapter exemption.`,
        severity: 'error',
      });
    }
    if (record.transparent
      && !assignment.roles.some((role) => STYLE_TRANSPARENT_MATERIAL_ROLES.has(role))) {
      issues.push({
        code: 'unsupported-transparent-material',
        materialId,
        message: `Transparent live material "${materialId}" is assigned only opaque roles: ${assignment.roles.join(', ')}.`,
        severity: 'error',
      });
    }
  }

  for (const materialId of Object.keys(assignments)) {
    if (consumedAssignments.has(materialId)) continue;
    issues.push({
      code: 'unconsumed-material-assignment',
      materialId,
      message: `Declared material assignment "${materialId}" has no matching live material.`,
      severity: 'warning',
    });
  }
  return { issues, materials };
}
