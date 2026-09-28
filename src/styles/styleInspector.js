import { TOONLAB_VERSION } from '../version.js';

export const TOONLAB_INSPECTOR_DOCUMENT_TYPE = 'toonlab/runtime-inspector';
export const TOONLAB_INSPECTOR_VERSION = 1;

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function documentRef(value) {
  if (!value) return null;
  if (typeof value === 'string') return { id: value };
  return {
    id: value.id ?? null,
    label: value.label ?? null,
    type: value.type ?? value.schema ?? null,
    version: value.version ?? null,
  };
}

export class ToonLabInspectorToggleError extends Error {
  constructor(cause, rollbackErrors = []) {
    super(`ToonLab inspector toggle failed: ${cause.message}`);
    this.cause = cause;
    this.name = 'ToonLabInspectorToggleError';
    this.rollbackErrors = rollbackErrors;
    this.rolledBack = rollbackErrors.length === 0;
  }
}

/**
 * Framework-neutral development inspector over real style transactions.
 * Disabling a target unwinds every transaction that owns it, down to the
 * pre-ToonLab snapshot; enabling replays those transactions in order.
 */
export function createToonLabInspector({
  bundle = null,
  content = null,
  diagnostics = null,
  quality = null,
  scenario = null,
} = {}) {
  const applications = [];
  const applicationMetadata = new WeakMap();
  const registeredApplications = new Set();
  const listeners = new Set();
  let disposed = false;
  let context = { bundle, content, quality, scenario };
  let telemetry = {};

  function assertActive() {
    if (disposed) throw new Error('ToonLab inspector is disposed.');
  }

  function notify() {
    const report = snapshot();
    listeners.forEach((listener) => listener(report));
    return report;
  }

  function targetOwners(targetId) {
    return applications.flatMap((application) => (
      application.targetControls
        ?.filter((control) => control.targetId === targetId)
        .map((control) => ({ application, control })) ?? []
    ));
  }

  function inspectParticipation(entry, application) {
    const subject = entry.subject;
    const label = entry.target?.labels ?? subject?.userData?.toonlab ?? {};
    const participation = {};
    if (label.collision !== undefined) {
      participation.collision = cloneJson(label.collision);
    }
    if (subject?.isObject3D && typeof subject.traverse === 'function') {
      let castShadows = 0;
      let groundFieldWriters = 0;
      let receiveShadows = 0;
      let renderables = 0;
      subject.traverse((node) => {
        if (!node?.isMesh) return;
        renderables += 1;
        if (node.castShadow) castShadows += 1;
        if (node.receiveShadow) receiveShadows += 1;
        if (node.userData?.groundFieldWrite === true) groundFieldWriters += 1;
      });
      participation.shadows = { castShadows, receiveShadows, renderables };
      if (groundFieldWriters > 0) participation.groundField = { writers: groundFieldWriters };
    }
    const registered = applicationMetadata.get(application)?.participation?.[entry.targetId];
    return { ...participation, ...(cloneJson(registered) ?? {}) };
  }

  async function setTargetEnabled(targetId, enabledInput) {
    assertActive();
    const enabled = Boolean(enabledInput);
    const owners = targetOwners(targetId);
    if (owners.length === 0) {
      return { changed: false, enabled, reason: 'target-not-controlled', targetId };
    }
    const ordered = enabled ? owners : [...owners].reverse();
    const changed = [];
    try {
      for (const owner of ordered) {
        const result = await owner.application.setTargetEnabled(targetId, enabled);
        if (result.reason === 'stale-transaction') {
          throw new Error(`Target "${targetId}" is owned by a newer transaction.`);
        }
        if (result.changed) changed.push(owner);
      }
    } catch (cause) {
      const rollbackErrors = [];
      for (const owner of [...changed].reverse()) {
        try {
          await owner.application.setTargetEnabled(targetId, !enabled);
        } catch (error) {
          rollbackErrors.push({ error, targetId });
        }
      }
      throw new ToonLabInspectorToggleError(cause, rollbackErrors);
    }
    notify();
    return { changed: changed.length > 0, enabled, targetId };
  }

  async function setDomainEnabled(domain, enabled) {
    assertActive();
    const targetIds = snapshot().targets
      .filter((target) => target.domain === domain && target.controllable)
      .map((target) => target.targetId);
    const changed = [];
    try {
      for (const targetId of targetIds) {
        const result = await setTargetEnabled(targetId, enabled);
        if (result.changed) changed.push(targetId);
      }
    } catch (cause) {
      const rollbackErrors = [];
      for (const targetId of [...changed].reverse()) {
        try {
          await setTargetEnabled(targetId, !enabled);
        } catch (error) {
          rollbackErrors.push({ error, targetId });
        }
      }
      throw new ToonLabInspectorToggleError(cause, rollbackErrors);
    }
    notify();
    return { changed: changed.length, domain, enabled: Boolean(enabled), targets: targetIds };
  }

  function snapshot() {
    const targets = new Map();
    const issues = [];
    const gaps = [];
    for (const application of applications) {
      issues.push(...(application.issues ?? []));
      gaps.push(...(application.gaps ?? []));
      for (const entry of application.plan ?? []) {
        const targetId = entry.targetId;
        const current = targets.get(targetId) ?? {
          adapterId: entry.target?.adapter?.id ?? null,
          domain: entry.domain,
          slot: entry.slot,
          targetId,
        };
        const owners = targetOwners(targetId);
        targets.set(targetId, {
          ...current,
          controllable: owners.length > 0,
          enabled: owners.length === 0 || owners.every(({ control }) => control.enabled),
          participation: inspectParticipation(entry, application),
          transactionCount: owners.length,
        });
      }
    }
    const targetList = [...targets.values()].sort((a, b) => a.targetId.localeCompare(b.targetId));
    const domainMap = new Map();
    for (const target of targetList) {
      const value = domainMap.get(target.domain) ?? { domain: target.domain, targets: [] };
      value.targets.push(target.targetId);
      domainMap.set(target.domain, value);
    }
    const domains = [...domainMap.values()].map((domain) => ({
      ...domain,
      controllable: domain.targets.some((id) => targets.get(id)?.controllable),
      enabled: domain.targets.every((id) => targets.get(id)?.enabled),
    })).sort((a, b) => a.domain.localeCompare(b.domain));
    return Object.freeze({
      active: {
        bundle: documentRef(context.bundle),
        content: documentRef(context.content),
        quality: documentRef(context.quality),
        scenario: documentRef(context.scenario),
      },
      diagnostics: cloneJson(typeof diagnostics === 'function' ? diagnostics() : diagnostics) ?? {},
      domains,
      gaps: cloneJson(gaps),
      issues: cloneJson(issues),
      package: { name: '@call-me-sensei/toonlab', version: TOONLAB_VERSION },
      targets: targetList,
      telemetry: cloneJson(telemetry),
      type: TOONLAB_INSPECTOR_DOCUMENT_TYPE,
      version: TOONLAB_INSPECTOR_VERSION,
    });
  }

  return Object.freeze({
    dispose() {
      if (disposed) return;
      disposed = true;
      listeners.clear();
      applications.length = 0;
      registeredApplications.clear();
    },
    registerApplication(application, { participation = {} } = {}) {
      assertActive();
      if (!application || typeof application.setTargetEnabled !== 'function') {
        throw new TypeError('Inspector applications must expose target controls.');
      }
      if (registeredApplications.has(application)) return () => {};
      registeredApplications.add(application);
      applicationMetadata.set(application, { participation: cloneJson(participation) ?? {} });
      applications.push(application);
      notify();
      let registered = true;
      return () => {
        if (!registered) return;
        registered = false;
        registeredApplications.delete(application);
        applicationMetadata.delete(application);
        const index = applications.indexOf(application);
        if (index >= 0) applications.splice(index, 1);
        if (!disposed) notify();
      };
    },
    serialize({ pretty = true } = {}) {
      return JSON.stringify(snapshot(), null, pretty ? 2 : 0);
    },
    setContext(next = {}) {
      assertActive();
      context = { ...context, ...next };
      return notify();
    },
    setDomainEnabled,
    setTargetEnabled,
    snapshot,
    subscribe(listener) {
      assertActive();
      if (typeof listener !== 'function') throw new TypeError('Inspector listener must be a function.');
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    updateTelemetry(next = {}) {
      assertActive();
      telemetry = { ...telemetry, ...next };
      return notify();
    },
  });
}
