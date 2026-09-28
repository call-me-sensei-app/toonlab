import {
  analyzeManufacturedAsset,
  classifyManufacturedMaterial,
  createManufacturedMaterialClassification,
  inferManufacturedObjectClass,
} from '../environment/manufacturedMaterialContract.js';
import { createStyleMaterialContract } from './styleMaterialContract.js';
import {
  labelStyleTarget,
  readStyleTargetLabel,
} from './styleTargetDiscovery.js';
import { createStyleTargetLabel } from './styleTargetLabels.js';

function stableSegment(value, fallback) {
  const normalized = String(value ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9._:/-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || fallback;
}

function classificationSignature(value) {
  return JSON.stringify({
    baseMaterial: value.baseMaterial,
    contentFlags: value.contentFlags,
    finish: value.finish,
    renderMode: value.renderMode,
    structuralRole: value.structuralRole,
  });
}

function materialUses(root) {
  const materials = new Map();
  const visit = (node) => {
    const slots = Array.isArray(node?.material)
      ? node.material
      : node?.material
        ? [node.material]
        : [];
    for (const [slot, material] of slots.entries()) {
      if (!material) continue;
      const entry = materials.get(material) ?? { material, uses: [] };
      entry.uses.push({
        classification: classifyManufacturedMaterial(node, material),
        node,
        slot,
      });
      materials.set(material, entry);
    }
    for (const child of node?.children ?? []) visit(child);
  };
  visit(root);
  return [...materials.values()];
}

function uniqueMaterialIds(entries) {
  const counts = new Map();
  return entries.map(({ material }, index) => {
    const base = stableSegment(
      material?.userData?.toonlabMaterialId || material?.name,
      `material-${index + 1}`,
    );
    const count = (counts.get(base) ?? 0) + 1;
    counts.set(base, count);
    return count === 1 ? base : `${base}-${count}`;
  });
}

export class ManufacturedStyleLabelingError extends Error {
  constructor(proposal) {
    super(proposal.issues.map(({ message }) => message).join(' '));
    this.name = 'ManufacturedStyleLabelingError';
    this.proposal = proposal;
  }
}

/**
 * Build a conservative, read-only label proposal for an imported manufactured
 * asset. Low-confidence and generic fallback classifications remain explicit
 * blockers until an agent/developer supplies an override.
 */
export function proposeManufacturedStyleTargetLabel(root, {
  assetId = root?.userData?.toonlabAssetId,
  confidenceThreshold = 0.75,
  materialOverrides = {},
  targetId = assetId,
} = {}) {
  if (!root || typeof root !== 'object') throw new TypeError('A manufactured asset root is required.');
  const resolvedTargetId = stableSegment(targetId, 'manufactured-asset');
  const resolvedAssetId = stableSegment(assetId, resolvedTargetId);
  const inventory = materialUses(root);
  const ids = uniqueMaterialIds(inventory);
  const issues = [];
  const assignments = {};
  const entries = [];

  for (const [index, entry] of inventory.entries()) {
    const materialId = ids[index];
    const override = materialOverrides[materialId];
    const useClassifications = entry.uses.map(({ classification }) => classification);
    const signatures = new Set(useClassifications.map(classificationSignature));
    const classification = override
      ? createManufacturedMaterialClassification({
        ...override,
        classificationSource: 'explicit',
        confidence: 1,
      })
      : useClassifications[0];

    if (!override && signatures.size > 1) {
      issues.push({
        code: 'shared-material-role-conflict',
        materialId,
        message: `Shared material "${materialId}" resolves to different semantic classifications; split it or provide an explicit override/manifest.`,
      });
    }
    if (!override && classification.classificationSource === 'fallback') {
      issues.push({
        code: 'generic-material-fallback',
        materialId,
        message: `Material "${materialId}" has no production-safe physical classification.`,
      });
    } else if (!override && classification.confidence < confidenceThreshold) {
      issues.push({
        code: 'low-confidence-material',
        materialId,
        message: `Material "${materialId}" classification confidence ${classification.confidence.toFixed(2)} is below ${confidenceThreshold.toFixed(2)}.`,
      });
    }

    assignments[materialId] = { roles: [classification.structuralRole] };
    entries.push({
      classification,
      material: entry.material,
      materialId,
      useCount: entry.uses.length,
    });
  }

  if (entries.length === 0) {
    issues.push({ code: 'no-render-materials', message: 'The asset contains no render materials.' });
  }
  const label = entries.length > 0
    ? createStyleTargetLabel('manufactured.surface', {
      assetId: resolvedAssetId,
      materials: createStyleMaterialContract('manufactured.surface', { assignments }),
      targetId: resolvedTargetId,
    })
    : null;
  const ready = issues.length === 0;
  const blockedIds = new Set(issues.map(({ materialId }) => materialId).filter(Boolean));
  return {
    analysis: analyzeManufacturedAsset(root, { confidenceThreshold }),
    assetId: resolvedAssetId,
    entries,
    issues,
    label,
    objectClass: inferManufacturedObjectClass(root),
    ready,
    summary: {
      autoResolvedMaterials: entries.filter(({ classification, materialId }) => (
        classification.classificationSource !== 'explicit' && !blockedIds.has(materialId)
      )).length,
      materialCount: entries.length,
      overrideCount: entries.filter(({ classification }) => (
        classification.classificationSource === 'explicit'
      )).length,
      unresolvedCount: blockedIds.size || issues.length,
    },
    targetId: resolvedTargetId,
  };
}

/** Apply a previously reviewed proposal. No mutation occurs for a blocked proposal. */
export function applyManufacturedStyleTargetLabelProposal(root, proposal, { replace = false } = {}) {
  if (!proposal?.ready || !proposal.label) throw new ManufacturedStyleLabelingError(proposal);
  const existing = readStyleTargetLabel(root);
  if (existing && !replace && JSON.stringify(existing) !== JSON.stringify(proposal.label)) {
    throw new ManufacturedStyleLabelingError({
      ...proposal,
      issues: [{ code: 'existing-label-conflict', message: 'The asset already has a different style label.' }],
      ready: false,
    });
  }

  labelStyleTarget(root, proposal.label, { replace });
  root.userData ??= {};
  root.userData.toonlabAssetId = proposal.assetId;
  root.userData.urbanObjectClass = proposal.objectClass;
  for (const entry of proposal.entries) {
    entry.material.userData ??= {};
    entry.material.userData.toonlabMaterialId = entry.materialId;
    entry.material.userData.urbanMaterial = entry.classification;
  }
  return proposal.label;
}

/** Propose and apply only when every live material is production-safe. */
export function labelManufacturedStyleTarget(root, options = {}) {
  const proposal = proposeManufacturedStyleTargetLabel(root, options);
  applyManufacturedStyleTargetLabelProposal(root, proposal, { replace: options.replace === true });
  return proposal;
}
