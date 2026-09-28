import { createAssetGapRecord } from '../asset-policy/index.js';
import { resolveStyleBundleSettings, validateStyleBundleDocument } from './styleBundle.js';
import { resolveStyleTargetAdapter } from './styleAdapters.js';
import { STYLE_DOMAIN_SLOT_ROUTES } from './styleDomains.js';
import { validateStyleMaterialContract } from './styleMaterialContract.js';
import { auditStyleTargetMaterialCoverage } from './styleTargetMaterialCoverage.js';
import {
  captureStyleTargetSnapshot,
  restoreStyleTargetSnapshot,
} from './styleTransaction.js';

export { STYLE_DOMAIN_SLOT_ROUTES, STYLE_TARGET_DOMAINS } from './styleDomains.js';

function issue(code, message, targetId, severity = 'error') {
  return { code, message, severity, targetId };
}

function normalizeTargets(targets) {
  return Array.isArray(targets) ? targets : [];
}

const APPLIED_TARGET_STATES = new WeakMap();
let styleTransactionRevision = 0;

function stateKey(entry) {
  return entry.subject && (typeof entry.subject === 'object' || typeof entry.subject === 'function')
    ? entry.subject
    : entry.target;
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value?.isColor) return { b: value.b, g: value.g, r: value.r };
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, stableValue(value[key])]),
    );
  }
  return value;
}

function entrySignature(entry) {
  return JSON.stringify(stableValue({
    domain: entry.domain,
    settings: entry.settings,
    slot: entry.slot,
  }));
}

/**
 * Build a complete application plan without mutating any target. A domain is
 * always explicit; object names, texture colors, and scene parenting are not
 * classification inputs.
 */
export function auditStyleBundleApplication(bundleInput, targetsInput, {
  allowCustomAdapters = true,
} = {}) {
  const validation = validateStyleBundleDocument(bundleInput);
  if (!validation.ok) {
    return {
      gaps: [],
      issues: validation.errors.map((message) => issue('invalid-bundle', message, null)),
      ok: false,
      plan: [],
      settings: {},
    };
  }
  const settings = resolveStyleBundleSettings(validation.value);
  const issues = [];
  const plan = [];
  const gaps = [];
  const ids = new Set();
  for (const [index, target] of normalizeTargets(targetsInput).entries()) {
    const targetId = String(target?.id ?? `target-${index}`).trim();
    if (!targetId) {
      issues.push(issue('missing-target-id', 'Every style target needs a stable id.', null));
      continue;
    }
    if (ids.has(targetId)) {
      issues.push(issue('duplicate-target-id', `Style target id "${targetId}" is duplicated.`, targetId));
      continue;
    }
    ids.add(targetId);
    const domain = String(target?.domain ?? '').trim();
    const slot = STYLE_DOMAIN_SLOT_ROUTES[domain];
    if (!slot) {
      issues.push(issue('unknown-domain', `Style target "${targetId}" has unknown domain "${domain || '(missing)'}".`, targetId));
      continue;
    }
    if (!Object.hasOwn(settings, slot)) {
      issues.push(issue('missing-slot', `Bundle does not define required slot "${slot}" for target "${targetId}".`, targetId));
      continue;
    }
    if (target?.labels?.materials) {
      const materialResult = validateStyleMaterialContract(domain, target.labels.materials);
      for (const message of materialResult.errors) {
        issues.push(issue(
          'invalid-material-contract',
          `Target "${targetId}": ${message}`,
          targetId,
        ));
      }
      if (!materialResult.ok) continue;
      const liveCoverage = auditStyleTargetMaterialCoverage(domain, target.labels, target.subject);
      for (const liveIssue of liveCoverage.issues) {
        issues.push(issue(
          liveIssue.code,
          `Target "${targetId}": ${liveIssue.message}`,
          targetId,
          liveIssue.severity,
        ));
      }
      if (liveCoverage.issues.some(({ severity }) => severity === 'error')) continue;
    }
    const apply = typeof target?.apply === 'function'
      ? target.apply
      : typeof target?.adapter?.apply === 'function'
        ? target.adapter.apply.bind(target.adapter)
        : resolveStyleTargetAdapter(domain)?.apply ?? null;
    if (!apply) {
      issues.push(issue('unsupported-renderer', `Target "${targetId}" needs an explicit apply callback or adapter.`, targetId));
      continue;
    }
    const custom = target?.custom === true || target?.adapter?.custom === true;
    if (custom) {
      const severity = allowCustomAdapters ? 'warning' : 'error';
      issues.push(issue('custom-adapter', `Target "${targetId}" uses a custom style adapter and must be documented.`, targetId, severity));
      gaps.push(createAssetGapRecord({
        bundleSlot: slot,
        customImplementation: { adapter: target?.adapter?.id ?? 'inline' },
        domain,
        feedbackNeeded: 'Review whether this behavior should become a supported ToonLab adapter.',
        id: `custom-style-adapter-${targetId}`,
        kind: 'custom-shader-adapter',
        reason: 'The public runtime has no supported adapter for this renderer.',
        targetId,
      }));
    }
    plan.push({
      apply,
      domain,
      settings: settings[slot],
      slot,
      subject: target?.subject,
      target,
      targetId,
    });
  }
  return {
    bundle: validation.value,
    gaps,
    issues,
    ok: !issues.some(({ severity }) => severity === 'error'),
    plan,
    settings,
    warnings: validation.warnings ?? [],
  };
}

export class StyleBundleApplicationError extends Error {
  constructor(audit) {
    super(audit.issues.map(({ message }) => message).join(' '));
    this.audit = audit;
    this.name = 'StyleBundleApplicationError';
  }
}

export class StyleBundleTransactionError extends Error {
  constructor({ applied = [], audit, cause, rollbackErrors = [], stage = 'apply' }) {
    const rollbackMessage = rollbackErrors.length
      ? ` Rollback also failed: ${rollbackErrors.map(({ error, targetId }) => `${targetId}: ${error.message}`).join(' ')}`
      : '';
    super(`Style bundle transaction failed during ${stage}: ${cause.message}.${rollbackMessage}`);
    this.applied = [...applied];
    this.audit = audit;
    this.cause = cause;
    this.name = 'StyleBundleTransactionError';
    this.rollbackErrors = rollbackErrors;
    this.rolledBack = rollbackErrors.length === 0;
    this.stage = stage;
  }
}

/**
 * Apply only after every target has passed preflight. `strict` rejects the
 * full operation before the first mutation; `advisory` skips invalid targets
 * and returns their issues.
 */
export async function applyStyleBundle(bundle, {
  allowCustomAdapters = true,
  mode = 'strict',
  targets = [],
} = {}) {
  if (!['strict', 'advisory'].includes(mode)) {
    throw new Error('Style bundle application mode must be "strict" or "advisory".');
  }
  const audit = auditStyleBundleApplication(bundle, targets, { allowCustomAdapters });
  if (mode === 'strict' && !audit.ok) throw new StyleBundleApplicationError(audit);
  const prepared = audit.plan.map((entry) => ({
    entry,
    key: stateKey(entry),
    previousState: APPLIED_TARGET_STATES.get(stateKey(entry)) ?? null,
    signature: entrySignature(entry),
  }));
  const pending = prepared.filter(({ previousState, signature }) => (
    previousState?.signature !== signature
  ));
  const skipped = prepared
    .filter(({ previousState, signature }) => previousState?.signature === signature)
    .map(({ entry }) => ({
      domain: entry.domain,
      reason: 'already-applied',
      slot: entry.slot,
      targetId: entry.targetId,
    }));
  const snapshots = [];
  try {
    for (const { entry } of pending) {
      snapshots.push(await captureStyleTargetSnapshot(entry));
    }
  } catch (cause) {
    throw new StyleBundleTransactionError({ audit, cause, stage: 'snapshot' });
  }
  const applied = [];
  try {
    for (const { entry } of pending) {
      await entry.apply(entry.subject, entry.settings, {
        bundle: audit.bundle,
        domain: entry.domain,
        resolvedSettings: audit.settings,
        slot: entry.slot,
        target: entry.target,
      });
      applied.push({ domain: entry.domain, slot: entry.slot, targetId: entry.targetId });
    }
  } catch (cause) {
    const rollbackErrors = [];
    for (const snapshot of [...snapshots].reverse()) {
      try {
        await restoreStyleTargetSnapshot(snapshot);
      } catch (error) {
        rollbackErrors.push({ error, targetId: snapshot.targetId });
      }
    }
    throw new StyleBundleTransactionError({
      applied,
      audit,
      cause,
      rollbackErrors,
      stage: 'apply',
    });
  }
  const revision = ++styleTransactionRevision;
  for (const { key, signature } of pending) {
    APPLIED_TARGET_STATES.set(key, { revision, signature });
  }
  const targetStates = pending.map((prepared, index) => ({
    ...prepared,
    enabled: true,
    snapshot: snapshots[index],
  }));

  async function setTargetEnabled(targetId, enabledInput) {
    const enabled = Boolean(enabledInput);
    const state = targetStates.find(({ entry }) => entry.targetId === targetId);
    if (!state) {
      return { changed: false, enabled, reason: 'target-not-controlled', targetId };
    }
    if (state.enabled === enabled) {
      return { changed: false, enabled, reason: 'already-set', targetId };
    }
    const current = APPLIED_TARGET_STATES.get(state.key) ?? null;
    const expected = state.enabled ? revision : state.previousState?.revision ?? null;
    if ((current?.revision ?? null) !== expected) {
      return { changed: false, enabled: state.enabled, reason: 'stale-transaction', targetId };
    }
    if (!enabled) {
      await restoreStyleTargetSnapshot(state.snapshot);
      if (state.previousState) APPLIED_TARGET_STATES.set(state.key, state.previousState);
      else APPLIED_TARGET_STATES.delete(state.key);
      state.enabled = false;
      return { changed: true, enabled: false, targetId };
    }
    try {
      await state.entry.apply(state.entry.subject, state.entry.settings, {
        bundle: audit.bundle,
        domain: state.entry.domain,
        resolvedSettings: audit.settings,
        slot: state.entry.slot,
        target: state.entry.target,
      });
    } catch (cause) {
      try {
        await restoreStyleTargetSnapshot(state.snapshot);
      } catch (rollbackError) {
        throw new StyleBundleTransactionError({
          applied: [],
          audit,
          cause,
          rollbackErrors: [{ error: rollbackError, targetId }],
          stage: 'toggle',
        });
      }
      throw new StyleBundleTransactionError({ applied: [], audit, cause, stage: 'toggle' });
    }
    APPLIED_TARGET_STATES.set(state.key, { revision, signature: state.signature });
    state.enabled = true;
    return { changed: true, enabled: true, targetId };
  }

  let reverted = false;
  const revert = async () => {
    if (reverted) return { reason: 'already-reverted', reverted: false };
    if (targetStates.length === 0) return { reason: 'already-applied', reverted: false };
    const enabledStates = targetStates.filter(({ enabled }) => enabled);
    if (enabledStates.length === 0) {
      reverted = true;
      return { reason: 'already-disabled', reverted: false };
    }
    const stale = enabledStates.find(({ key }) => APPLIED_TARGET_STATES.get(key)?.revision !== revision);
    if (stale) {
      return {
        reason: 'stale-transaction',
        reverted: false,
        targetId: stale.entry.targetId,
      };
    }
    const rollbackErrors = [];
    for (const state of [...enabledStates].reverse()) {
      try {
        await restoreStyleTargetSnapshot(state.snapshot);
      } catch (error) {
        rollbackErrors.push({ error, targetId: state.entry.targetId });
      }
    }
    if (rollbackErrors.length) {
      throw new StyleBundleTransactionError({
        applied,
        audit,
        cause: new Error('Explicit revert failed'),
        rollbackErrors,
        stage: 'revert',
      });
    }
    for (const { key, previousState } of enabledStates) {
      if (previousState) APPLIED_TARGET_STATES.set(key, previousState);
      else APPLIED_TARGET_STATES.delete(key);
    }
    enabledStates.forEach((state) => { state.enabled = false; });
    reverted = true;
    return { reverted: true, targets: applied.map(({ targetId }) => targetId) };
  };
  return {
    ...audit,
    applied,
    idempotent: pending.length === 0,
    ok: mode === 'advisory' ? audit.ok : true,
    revert,
    setTargetEnabled,
    skipped,
    targetControls: targetStates.map((state) => Object.freeze({
      adapterId: state.entry.target?.adapter?.id ?? null,
      domain: state.entry.domain,
      get enabled() { return state.enabled; },
      slot: state.entry.slot,
      targetId: state.entry.targetId,
    })),
  };
}
