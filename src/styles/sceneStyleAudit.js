import { TOONLAB_VERSION } from '../version.js';
import { auditStyleBundleApplication } from './styleApplication.js';
import { validateStyleBundleDocument } from './styleBundle.js';
import { STYLE_DOMAIN_SLOT_ROUTES } from './styleDomains.js';
import {
  STYLE_DOMAIN_MATERIAL_ROLES,
  STYLE_MATERIAL_STABLE_ID_PATTERN,
} from './styleMaterialContract.js';
import {
  STYLE_TARGET_LABEL_KEY,
  validateStyleTargetLabel,
} from './styleTargetLabels.js';
import {
  collectStyleTargetMaterials,
  STYLE_TRANSPARENT_MATERIAL_ROLES,
} from './styleTargetMaterialCoverage.js';
import {
  STYLE_SYSTEM_OWNER_KEY,
  STYLE_SYSTEM_OWNER_SCHEMA_VERSION,
} from './styleMetadata.js';

export const STYLE_SCENE_AUDIT_DOCUMENT_TYPE = 'toonlab/scene-style-audit';
export const STYLE_SCENE_AUDIT_SCHEMA_VERSION = 1;
export const STYLE_SCENE_AUDIT_MODES = Object.freeze(['strict', 'advisory']);

const DOMAIN_EXTRA_SLOTS = Object.freeze({
  'vegetation.grass': Object.freeze(['grass']),
});

const ASSET_PAYLOAD_KEYS = new Set([
  'assetId',
  'catalogId',
  'geometry',
  'meshPreset',
  'sourceAsset',
]);

const RUNTIME_CONDITION_KEYS = new Set([
  'conditions',
  'scenario',
  'timeOfDay',
  'waterState',
  'weather',
]);

function isObject(value) {
  return Boolean(value) && typeof value === 'object';
}

function isRenderable(node) {
  return Boolean(node?.isMesh || node?.isLine || node?.isPoints || node?.material !== undefined);
}

function issueSeverity(mode, fixed = null) {
  return fixed ?? (mode === 'strict' ? 'error' : 'warning');
}

function makeIssue({
  assetId = null,
  code,
  consequence,
  materialId = null,
  message,
  mode,
  nodePath = null,
  remediation,
  severity = null,
  targetId = null,
}) {
  return {
    code,
    severity: issueSeverity(mode, severity),
    message,
    consequence,
    remediation,
    ...(targetId ? { targetId } : {}),
    ...(assetId ? { assetId } : {}),
    ...(materialId ? { materialId } : {}),
    ...(nodePath ? { nodePath } : {}),
  };
}

function classifyLabelError(message) {
  if (message === 'domain is required.') return 'missing-root-domain';
  if (message.startsWith('Unknown style target domain')) return 'unknown-domain';
  if (message.startsWith('Unknown material role ') || (
    message.includes('.roles') && message.includes('must be one or more of')
  )) return 'unknown-material-role';
  if (message.includes('multiple roles and requires a maskId')) return 'mixed-material-mask-required';
  if (message.includes('Mask "') || message.includes('.maskId')) return 'invalid-material-mask';
  if (message.startsWith('materials.')) return 'invalid-material-contract';
  return 'invalid-label';
}

function remediationForLabelCode(code) {
  if (code === 'missing-root-domain') return 'Attach a versioned ToonLab label with createStyleTargetLabel() and labelStyleTarget().';
  if (code === 'unknown-domain') return 'Replace the domain with a value from STYLE_TARGET_DOMAINS.';
  if (code === 'unknown-material-role') return 'Use a role listed in STYLE_DOMAIN_MATERIAL_ROLES for this domain.';
  if (code === 'mixed-material-mask-required') return 'Add a stable mask with selectors for every role, or an approved named exemption.';
  if (code === 'invalid-material-mask') return 'Fix the referenced mask and provide one selector for every assigned role.';
  if (code === 'invalid-material-contract') return 'Replace the material metadata with createStyleMaterialContract() output.';
  return 'Replace the label with canonical createStyleTargetLabel() output.';
}

function pathSegment(node, index) {
  const name = String(node?.name ?? '').trim();
  const kind = String(node?.type ?? node?.constructor?.name ?? 'Object').trim() || 'Object';
  return `${name || kind}[${index}]`;
}

function walkScene(scene, callback) {
  if (!isObject(scene)) throw new TypeError('auditSceneStyleContract requires a scene object.');
  const visit = (node, path, labelBoundary = null, systemBoundary = null) => {
    const directLabel = node?.userData?.[STYLE_TARGET_LABEL_KEY];
    const directSystemOwner = node?.userData?.[STYLE_SYSTEM_OWNER_KEY];
    const nextBoundary = directLabel === undefined ? labelBoundary : node;
    const nextSystemBoundary = directSystemOwner === undefined ? systemBoundary : node;
    callback(node, path, labelBoundary, directLabel, systemBoundary, directSystemOwner);
    for (const [index, child] of (node?.children ?? []).entries()) {
      visit(child, `${path}/${pathSegment(child, index)}`, nextBoundary, nextSystemBoundary);
    }
  };
  visit(scene, pathSegment(scene, 0));
}

function customExemptionFor(label, assignment) {
  const exemptionId = assignment?.exemptionId;
  if (!exemptionId) return null;
  const exemption = label.materials?.exemptions?.[exemptionId];
  return exemption?.strategy === 'custom-adapter' ? { exemptionId, ...exemption } : null;
}

function sortIssues(issues) {
  issues.sort((a, b) => (
    String(a.targetId ?? a.nodePath ?? '').localeCompare(String(b.targetId ?? b.nodePath ?? ''))
    || String(a.materialId ?? '').localeCompare(String(b.materialId ?? ''))
    || a.code.localeCompare(b.code)
    || a.message.localeCompare(b.message)
  ));
}

function auditBundlePayload(bundle, mode, issues) {
  for (const [slot, payload] of Object.entries(bundle?.slots ?? {})) {
    if (!isObject(payload)) continue;
    for (const key of Object.keys(payload)) {
      if (ASSET_PAYLOAD_KEYS.has(key)) {
        issues.push(makeIssue({
          code: 'asset-preset-in-style-bundle',
          consequence: 'Applying art direction could replace content identity or geometry.',
          message: `Bundle slot "${slot}" contains content field "${key}".`,
          mode,
          remediation: 'Move asset identity and geometry into a content document; keep only style selection in the bundle slot.',
        }));
      }
      if (RUNTIME_CONDITION_KEYS.has(key)) {
        issues.push(makeIssue({
          code: 'runtime-condition-in-style-bundle',
          consequence: 'Switching styles could unexpectedly change the active scene conditions.',
          message: `Bundle slot "${slot}" contains runtime condition "${key}".`,
          mode,
          remediation: 'Move time, weather, and water state into a scenario document.',
        }));
      }
    }
  }
}

function resolveRendererBackend(rendererBackend, renderer) {
  if (typeof rendererBackend === 'string' && rendererBackend.trim()) return rendererBackend.trim();
  if (renderer?.isWebGPURenderer) return 'webgpu';
  if (renderer) return 'webgl';
  return 'unknown';
}

/**
 * Produces a deterministic, read-only routing report. It never guesses a
 * domain or material role and never mutates the scene, renderer, or bundle.
 */
export function auditSceneStyleContract(scene, {
  bundle = null,
  mode = 'strict',
  renderer = null,
  rendererBackend = null,
  systemDomains = [],
} = {}) {
  if (!STYLE_SCENE_AUDIT_MODES.includes(mode)) {
    throw new TypeError('Scene style audit mode must be "strict" or "advisory".');
  }

  const issues = [];
  const paths = new Map();
  const discovered = [];
  const systems = [];
  const systemIds = new Set();
  const targetIds = new Set();

  walkScene(scene, (node, nodePath, labelBoundary, directLabel, systemBoundary, directSystemOwner) => {
    paths.set(node, nodePath);
    if (directSystemOwner !== undefined) {
      const valid = isObject(directSystemOwner)
        && directSystemOwner.version === STYLE_SYSTEM_OWNER_SCHEMA_VERSION
        && typeof directSystemOwner.domain === 'string'
        && Object.hasOwn(STYLE_DOMAIN_SLOT_ROUTES, directSystemOwner.domain)
        && typeof directSystemOwner.systemId === 'string'
        && STYLE_MATERIAL_STABLE_ID_PATTERN.test(directSystemOwner.systemId);
      if (!valid) {
        issues.push(makeIssue({
          code: 'invalid-system-owner',
          consequence: 'A private render root cannot be associated with a supported package system safely.',
          message: `Invalid ToonLab system ownership metadata at "${nodePath}".`,
          mode,
          nodePath,
          remediation: 'Recreate this root through its public ToonLab system factory.',
        }));
      } else if (!systemIds.has(directSystemOwner.systemId)) {
        systemIds.add(directSystemOwner.systemId);
        systems.push({
          domain: directSystemOwner.domain,
          nodePath,
          systemId: directSystemOwner.systemId,
        });
      }
    }
    if (directLabel !== undefined) {
      const validation = validateStyleTargetLabel(directLabel);
      if (!validation.ok) {
        for (const message of validation.errors) {
          const code = classifyLabelError(message);
          issues.push(makeIssue({
            code,
            consequence: 'The target cannot be routed safely and will not be styled.',
            message,
            mode,
            nodePath,
            remediation: remediationForLabelCode(code),
          }));
        }
        return;
      }
      const label = validation.value;
      if (!label.targetId) {
        issues.push(makeIssue({
          code: 'missing-target-id',
          consequence: 'Reports and repeated application cannot identify this target deterministically.',
          message: `Labeled ${label.domain} root requires targetId.`,
          mode,
          nodePath,
          remediation: 'Add a stable targetId to createStyleTargetLabel().',
        }));
      } else if (targetIds.has(label.targetId)) {
        issues.push(makeIssue({
          code: 'duplicate-target-id',
          consequence: 'Two scene objects would share application and audit identity.',
          message: `Style target id "${label.targetId}" is duplicated.`,
          mode,
          nodePath,
          remediation: 'Give every labeled root a unique stable targetId.',
          targetId: label.targetId,
        }));
      } else {
        targetIds.add(label.targetId);
        discovered.push({ label, node, nodePath });
      }
      return;
    }

    if (isRenderable(node) && !labelBoundary && !systemBoundary && directSystemOwner === undefined) {
      issues.push(makeIssue({
        code: 'missing-root-domain',
        consequence: 'The renderer cannot select a supported ToonLab shader without guessing.',
        message: `Renderable at "${nodePath}" is not inside a labeled style root.`,
        mode,
        nodePath,
        remediation: 'Label the owning asset root with createStyleTargetLabel() and labelStyleTarget().',
      }));
    }
  });

  const targets = [];
  const exemptions = [];
  for (const entry of discovered) {
    const { label, node, nodePath } = entry;
    const materials = collectStyleTargetMaterials(node, { pathByNode: paths });
    const acceptsMaterialAssignments = (STYLE_DOMAIN_MATERIAL_ROLES[label.domain]?.length ?? 0) > 0;
    const assignments = label.materials?.assignments ?? {};
    const consumedAssignments = new Set();
    const materialReports = [];

    for (const materialRecord of materials) {
      const materialId = materialRecord.id;
      const assignment = materialId ? assignments[materialId] : null;
      if (!acceptsMaterialAssignments) {
        materialReports.push({
          custom: materialRecord.custom,
          materialId,
          nodePath: materialRecord.nodePath,
          roles: [],
          transparent: materialRecord.transparent,
        });
        continue;
      }
      if (!materialId) {
        issues.push(makeIssue({
          assetId: label.assetId,
          code: 'missing-material-id',
          consequence: 'A semantic role cannot be matched to this material deterministically.',
          message: `Material slot ${materialRecord.slot} at "${materialRecord.nodePath}" has no stable ToonLab material id or name.`,
          mode,
          nodePath: materialRecord.nodePath,
          remediation: 'Set material.userData.toonlabMaterialId or a stable material.name, then add a matching assignment.',
          targetId: label.targetId,
        }));
      } else if (!assignment) {
        issues.push(makeIssue({
          assetId: label.assetId,
          code: 'missing-material-role',
          consequence: 'The material would receive an ambiguous or incorrect treatment.',
          materialId,
          message: `Target "${label.targetId}" has no semantic role assignment for material "${materialId}".`,
          mode,
          nodePath: materialRecord.nodePath,
          remediation: 'Add this stable material id to materials.assignments with a valid domain role.',
          targetId: label.targetId,
        }));
      } else {
        consumedAssignments.add(materialId);
        const customExemption = customExemptionFor(label, assignment);
        if (materialRecord.custom && !customExemption) {
          issues.push(makeIssue({
            assetId: label.assetId,
            code: 'unsupported-custom-material',
            consequence: 'ToonLab cannot promise safe replacement or restoration for this renderer.',
            materialId,
            message: `Material "${materialId}" uses a custom renderer without a named custom-adapter exemption.`,
            mode,
            nodePath: materialRecord.nodePath,
            remediation: 'Use a supported source material or declare an approved custom-adapter exemption in the material contract.',
            targetId: label.targetId,
          }));
        } else if (customExemption) {
          exemptions.push({
            adapterId: customExemption.adapterId,
            exemptionId: customExemption.exemptionId,
            materialId,
            reason: customExemption.reason,
            targetId: label.targetId,
          });
        }
        if (materialRecord.transparent && !assignment.roles.some((role) => STYLE_TRANSPARENT_MATERIAL_ROLES.has(role))) {
          issues.push(makeIssue({
            assetId: label.assetId,
            code: 'unsupported-transparent-material',
            consequence: 'Opaque-domain shader replacement could break blending, depth sorting, or cutout edges.',
            materialId,
            message: `Transparent material "${materialId}" is assigned only opaque roles: ${assignment.roles.join(', ')}.`,
            mode,
            nodePath: materialRecord.nodePath,
            remediation: 'Assign a supported transparent role, make the material opaque, or route it through a documented custom adapter.',
            targetId: label.targetId,
          }));
        }
      }
      materialReports.push({
        custom: materialRecord.custom,
        materialId,
        nodePath: materialRecord.nodePath,
        roles: assignment?.roles ?? [],
        transparent: materialRecord.transparent,
      });
    }

    for (const materialId of Object.keys(assignments)) {
      if (consumedAssignments.has(materialId)) continue;
      issues.push(makeIssue({
        assetId: label.assetId,
        code: 'unconsumed-material-assignment',
        consequence: 'The label may be stale and a material may have been renamed or removed.',
        materialId,
        message: `Material assignment "${materialId}" has no matching material below target "${label.targetId}".`,
        mode,
        nodePath,
        remediation: 'Update the stable material id on the asset or remove the obsolete assignment.',
        severity: 'warning',
        targetId: label.targetId,
      }));
    }

    targets.push({
      assetId: label.assetId ?? null,
      domain: label.domain,
      materialCount: materialReports.length,
      materials: materialReports,
      nodePath,
      targetId: label.targetId,
      subject: node,
    });
  }

  targets.sort((a, b) => a.targetId.localeCompare(b.targetId));
  exemptions.sort((a, b) => (
    a.targetId.localeCompare(b.targetId)
    || a.materialId.localeCompare(b.materialId)
    || a.exemptionId.localeCompare(b.exemptionId)
  ));

  const routes = [];
  let normalizedBundle = null;
  if (bundle) {
    auditBundlePayload(bundle, mode, issues);
    const routableTargets = targets.map(({ domain, subject, targetId }) => ({
      domain,
      id: targetId,
      subject,
    }));
    const routeAudit = auditStyleBundleApplication(bundle, routableTargets);
    normalizedBundle = routeAudit.bundle ?? null;
    for (const routeIssue of routeAudit.issues) {
      issues.push(makeIssue({
        code: routeIssue.code,
        consequence: 'The target has no complete, supported style route.',
        message: routeIssue.message,
        mode,
        remediation: routeIssue.code === 'missing-slot'
          ? 'Populate the required style bundle slot.'
          : 'Correct the bundle or register a supported explicit adapter.',
        severity: routeIssue.code === 'invalid-bundle' ? 'error' : routeIssue.severity === 'warning' ? 'warning' : null,
        targetId: routeIssue.targetId,
      }));
    }
    for (const plan of routeAudit.plan) {
      routes.push({
        domain: plan.domain,
        slot: plan.slot,
        status: 'explicit',
        targetId: plan.targetId,
      });
    }

    const validation = validateStyleBundleDocument(bundle);
    if (validation.ok) {
      const consumedSlots = new Set();
      for (const target of targets) {
        const slot = STYLE_DOMAIN_SLOT_ROUTES[target.domain];
        if (slot) consumedSlots.add(slot);
        for (const extra of DOMAIN_EXTRA_SLOTS[target.domain] ?? []) consumedSlots.add(extra);
      }
      for (const domain of systemDomains) {
        const slot = STYLE_DOMAIN_SLOT_ROUTES[domain];
        if (slot) consumedSlots.add(slot);
        for (const extra of DOMAIN_EXTRA_SLOTS[domain] ?? []) consumedSlots.add(extra);
      }
      for (const system of systems) {
        const slot = STYLE_DOMAIN_SLOT_ROUTES[system.domain];
        if (slot) consumedSlots.add(slot);
        for (const extra of DOMAIN_EXTRA_SLOTS[system.domain] ?? []) consumedSlots.add(extra);
      }
      for (const slot of Object.keys(validation.value.slots).sort()) {
        if (consumedSlots.has(slot)) continue;
        issues.push(makeIssue({
          code: 'unused-bundle-slot',
          consequence: 'This part of the selected art direction has no declared consumer in the scene.',
          message: `Populated bundle slot "${slot}" has no discovered target or registered system consumer.`,
          mode,
          remediation: 'Label the consumer, register its system domain, or remove the unused slot from a partial bundle.',
          severity: 'warning',
        }));
      }
    }
  }

  sortIssues(issues);
  routes.sort((a, b) => a.targetId.localeCompare(b.targetId) || a.slot.localeCompare(b.slot));
  const blockingIssueCount = issues.filter(({ severity }) => severity === 'error').length;
  const contractIssueCount = issues.filter(({ code }) => code !== 'unused-bundle-slot').length;
  const reportTargets = targets.map(({ subject, ...target }) => target);
  systems.sort((a, b) => a.systemId.localeCompare(b.systemId));

  return {
    type: STYLE_SCENE_AUDIT_DOCUMENT_TYPE,
    version: STYLE_SCENE_AUDIT_SCHEMA_VERSION,
    package: {
      name: '@call-me-sensei/toonlab',
      version: TOONLAB_VERSION,
    },
    mode,
    rendererBackend: resolveRendererBackend(rendererBackend, renderer),
    bundle: normalizedBundle ? {
      id: normalizedBundle.id,
      version: normalizedBundle.version,
    } : null,
    ok: blockingIssueCount === 0,
    readyToApply: contractIssueCount === 0,
    summary: {
      blockingIssueCount,
      exemptionCount: exemptions.length,
      issueCount: issues.length,
      routeCount: routes.length,
      targetCount: reportTargets.length,
      warningCount: issues.filter(({ severity }) => severity === 'warning').length,
    },
    targets: reportTargets,
    systems,
    routes,
    exemptions,
    inferences: [],
    issues,
  };
}

export function serializeSceneStyleAudit(report, { pretty = false } = {}) {
  return JSON.stringify(report, null, pretty ? 2 : 0);
}
