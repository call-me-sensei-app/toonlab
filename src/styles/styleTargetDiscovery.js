import { createStyleTarget } from './styleAdapters.js';
import {
  STYLE_TARGET_LABEL_KEY,
  validateStyleTargetLabel,
} from './styleTargetLabels.js';

function isObject(value) {
  return Boolean(value) && typeof value === 'object';
}

function assertLabelHost(root) {
  if (!isObject(root)) throw new TypeError('A style target label host must be an object.');
  if (root.userData !== undefined && !isObject(root.userData)) {
    throw new TypeError('A style target label host userData field must be an object.');
  }
}

function labelsEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

export class StyleTargetLabelError extends Error {
  constructor(errors, root = null) {
    super(errors.join(' '));
    this.errors = [...errors];
    this.name = 'StyleTargetLabelError';
    this.root = root;
  }
}

export class StyleTargetDiscoveryError extends Error {
  constructor(report) {
    super(report.issues.map(({ message }) => message).join(' '));
    this.name = 'StyleTargetDiscoveryError';
    this.report = report;
  }
}

/**
 * Writes a validated canonical label to `root.userData.toonlab`.
 * Existing different labels require explicit replacement; repeating the same
 * label is idempotent.
 */
export function labelStyleTarget(root, label, { replace = false } = {}) {
  assertLabelHost(root);
  const result = validateStyleTargetLabel(label);
  if (!result.ok) throw new StyleTargetLabelError(result.errors, root);

  const existing = root.userData?.[STYLE_TARGET_LABEL_KEY];
  if (existing !== undefined) {
    const existingResult = validateStyleTargetLabel(existing);
    if (!replace && (!existingResult.ok || !labelsEqual(existingResult.value, result.value))) {
      throw new StyleTargetLabelError([
        `Style target already has a different ${STYLE_TARGET_LABEL_KEY} label; pass { replace: true } to replace it.`,
      ], root);
    }
  }

  root.userData ??= {};
  root.userData[STYLE_TARGET_LABEL_KEY] = result.value;
  return result.value;
}

/** Returns a canonical migrated label, null when absent, and throws when invalid. */
export function readStyleTargetLabel(root) {
  assertLabelHost(root);
  const input = root.userData?.[STYLE_TARGET_LABEL_KEY];
  if (input === undefined) return null;
  const result = validateStyleTargetLabel(input);
  if (!result.ok) throw new StyleTargetLabelError(result.errors, root);
  return result.value;
}

/** Removes only ToonLab's label and preserves every other userData field. */
export function removeStyleTargetLabel(root) {
  assertLabelHost(root);
  if (!root.userData || !Object.hasOwn(root.userData, STYLE_TARGET_LABEL_KEY)) return false;
  delete root.userData[STYLE_TARGET_LABEL_KEY];
  return true;
}

function discoveryIssue(code, message, root, targetId = null) {
  return {
    code,
    message,
    nodeName: String(root?.name ?? ''),
    nodeUuid: String(root?.uuid ?? ''),
    severity: 'error',
    targetId,
  };
}

function visitScene(scene, callback) {
  if (typeof scene?.traverse === 'function') {
    scene.traverse(callback);
    return;
  }
  if (!isObject(scene)) throw new TypeError('collectStyleTargets requires a scene object.');
  const visit = (node) => {
    callback(node);
    for (const child of node?.children ?? []) visit(child);
  };
  visit(scene);
}

/**
 * Discovers explicitly labeled roots. Unlabeled renderables are intentionally
 * left for the later scene audit rather than guessed here.
 */
export function collectStyleTargets(scene, { renderer = null } = {}) {
  const issues = [];
  const targets = [];
  const ids = new Set();

  visitScene(scene, (root) => {
    const input = root?.userData?.[STYLE_TARGET_LABEL_KEY];
    if (input === undefined) return;
    const result = validateStyleTargetLabel(input);
    if (!result.ok) {
      for (const message of result.errors) {
        issues.push(discoveryIssue('invalid-label', message, root));
      }
      return;
    }

    const label = result.value;
    if (!label.targetId) {
      issues.push(discoveryIssue(
        'missing-target-id',
        `Labeled ${label.domain} root requires targetId for deterministic scene discovery.`,
        root,
      ));
      return;
    }
    if (ids.has(label.targetId)) {
      issues.push(discoveryIssue(
        'duplicate-target-id',
        `Style target id "${label.targetId}" is duplicated.`,
        root,
        label.targetId,
      ));
      return;
    }
    ids.add(label.targetId);
    targets.push(createStyleTarget(label.targetId, label.domain, root, {
      labels: label,
      renderer,
    }));
  });

  targets.sort((a, b) => a.id.localeCompare(b.id));
  issues.sort((a, b) => (
    String(a.targetId ?? a.nodeUuid).localeCompare(String(b.targetId ?? b.nodeUuid))
      || a.code.localeCompare(b.code)
      || a.message.localeCompare(b.message)
  ));
  return {
    issues,
    ok: issues.length === 0,
    targets,
  };
}
