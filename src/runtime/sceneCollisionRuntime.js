import {
  LIGHTWEIGHT_WORLD_COLLISION_ADAPTER,
  createCollisionMetadata,
  registerCollisionTarget,
  validateCollisionMetadata,
} from '../collisionMetadata.js';
import { createWorldCollision } from '../worldCollision.js';
import { collectStyleTargets } from '../styles/styleTargetDiscovery.js';

export const SCENE_COLLISION_RUNTIME_VERSION = 1;

export const DEFAULT_SOLID_STYLE_DOMAINS = Object.freeze([
  'manufactured.environment',
  'manufactured.surface',
  'natural.rock',
  'prop',
  'vegetation.tree',
]);

const LEGACY_SOLID_VALUES = new Set(['auto', 'solid']);
const LEGACY_NONE_VALUES = new Set(['decorative', 'none']);
const sceneBindings = new WeakMap();

function stableMetadataSignature(metadata) {
  return JSON.stringify(metadata);
}

function collisionIssue(code, message, target = null, details = {}) {
  return Object.freeze({
    code,
    message,
    severity: 'error',
    targetId: target?.id ?? null,
    domain: target?.domain ?? null,
    ...details,
  });
}

function normalizeExplicitCollision(input, target, solidDomains) {
  if (input && typeof input === 'object') {
    const validation = validateCollisionMetadata(input);
    if (!validation.ok) {
      return {
        issue: collisionIssue(
          'invalid-collision-metadata',
          validation.errors.join(' '),
          target,
        ),
      };
    }
    return { metadata: validation.value, source: 'explicit' };
  }
  if (typeof input === 'string') {
    const value = input.trim().toLowerCase();
    if (LEGACY_NONE_VALUES.has(value)) {
      return { metadata: createCollisionMetadata('none'), source: 'explicit-none' };
    }
    if (LEGACY_SOLID_VALUES.has(value)) {
      return {
        metadata: createCollisionMetadata('bounds', { padding: 0 }),
        source: 'explicit-solid',
      };
    }
    return {
      issue: collisionIssue(
        'unknown-collision-profile',
        `Collision profile "${input}" is not supported; use metadata, "solid", or "none".`,
        target,
      ),
    };
  }
  if (solidDomains.has(target.domain)) {
    return {
      metadata: createCollisionMetadata('bounds', { padding: 0 }),
      source: 'domain-default',
    };
  }
  return { metadata: createCollisionMetadata('none'), source: 'domain-default' };
}

function resolveAdapter(adapters, metadata) {
  return adapters.find((adapter) => adapter?.kinds?.includes(metadata.kind)) ?? null;
}

function collisionSubjectForTarget(target, source) {
  if (target.domain !== 'vegetation.tree' || !['domain-default', 'explicit-solid'].includes(source)) {
    return target.subject;
  }
  if (target.subject?.trunkMesh?.isObject3D) return target.subject.trunkMesh;
  let trunk = null;
  target.subject?.traverse?.((object) => {
    if (!trunk && object.userData?.toonlabVegetationRole === 'woodySurface') trunk = object;
  });
  return trunk ?? target.subject;
}

export class SceneCollisionRuntimeError extends Error {
  constructor(report) {
    super(report.issues.map(({ message }) => message).join(' '));
    this.name = 'SceneCollisionRuntimeError';
    this.report = report;
  }
}

/** Return the package collision runtime currently bound to a Three.js scene. */
export function sceneCollisionRuntimeFor(scene) {
  return scene && typeof scene === 'object' ? sceneBindings.get(scene) ?? null : null;
}

/**
 * Discovers labeled scene targets and gives solid domains conservative bounds
 * collision by default. Explicit metadata always wins; explicit `none` keeps a
 * decorative target non-solid. Registrations are replaced and removed
 * transactionally as async scene objects change.
 */
export function createSceneCollisionRuntime({
  adapter = LIGHTWEIGHT_WORLD_COLLISION_ADAPTER,
  adapters = [],
  collision = null,
  heightAt = null,
  scene,
  solidDomains = DEFAULT_SOLID_STYLE_DOMAINS,
} = {}) {
  if (!scene?.traverse) {
    throw new TypeError('createSceneCollisionRuntime requires a Three.js scene.');
  }
  if (sceneBindings.has(scene)) {
    throw new Error('This scene already has a ToonLab collision runtime.');
  }
  const world = collision ?? createWorldCollision({ heightAt });
  const resolvedAdapters = [adapter, ...adapters]
    .filter(Boolean)
    .filter((entry, index, list) => list.findIndex(({ id }) => id === entry.id) === index);
  const solidDomainSet = new Set(solidDomains);
  const records = new Map();
  let disposed = false;
  let lastReport = Object.freeze({
    issues: Object.freeze([]),
    ok: true,
    stats: Object.freeze({ registered: 0, solid: 0, targets: 0, unresolved: 0 }),
    targets: Object.freeze([]),
  });

  async function refresh({ discoveryReport = null, mode = 'strict' } = {}) {
    if (disposed) throw new Error('Cannot refresh a disposed scene collision runtime.');
    if (!['advisory', 'strict'].includes(mode)) {
      throw new TypeError('Scene collision mode must be "strict" or "advisory".');
    }
    const discovery = discoveryReport ?? collectStyleTargets(scene);
    const issues = [...discovery.issues.map((entry) => collisionIssue(
      entry.code,
      entry.message,
      null,
      { targetId: entry.targetId ?? null },
    ))];
    const planned = [];
    for (const target of discovery.targets) {
      const resolved = normalizeExplicitCollision(
        target.labels?.collision,
        target,
        solidDomainSet,
      );
      if (resolved.issue) {
        issues.push(resolved.issue);
        continue;
      }
      const adapterForTarget = resolved.metadata.kind === 'none'
        ? null
        : resolveAdapter(resolvedAdapters, resolved.metadata);
      if (resolved.metadata.kind !== 'none' && !adapterForTarget) {
        issues.push(collisionIssue(
          'unsupported-collision-kind',
          `No collision adapter supports "${resolved.metadata.kind}" for target "${target.id}".`,
          target,
          { kind: resolved.metadata.kind },
        ));
        continue;
      }
      planned.push({
        adapter: adapterForTarget,
        collisionSubject: collisionSubjectForTarget(target, resolved.source),
        metadata: resolved.metadata,
        signature: stableMetadataSignature(resolved.metadata),
        source: resolved.source,
        target,
      });
    }

    const added = [];
    if (issues.length === 0 || mode === 'advisory') {
      for (const plan of planned) {
        const current = records.get(plan.target.id);
        if (current?.subject === plan.target.subject
          && current.collisionSubject === plan.collisionSubject
          && current.signature === plan.signature) continue;
        if (plan.metadata.kind === 'none') {
          added.push({ ...plan, registration: null });
          continue;
        }
        try {
          const registration = await registerCollisionTarget({
            adapter: plan.adapter,
            collision: world,
            metadata: plan.metadata,
            subject: plan.collisionSubject,
            targetId: plan.target.id,
          });
          if (registration.registered < 1) {
            registration.dispose?.();
            issues.push(collisionIssue(
              'empty-solid-target',
              `Solid target "${plan.target.id}" produced no collision geometry.`,
              plan.target,
            ));
            continue;
          }
          added.push({ ...plan, registration });
        } catch (error) {
          issues.push(collisionIssue(
            'collision-registration-failed',
            `Collision registration failed for "${plan.target.id}": ${error.message}`,
            plan.target,
          ));
        }
      }
    }

    if (mode === 'strict' && issues.length > 0) {
      for (const record of added) record.registration?.dispose?.();
      const report = Object.freeze({
        issues: Object.freeze(issues),
        ok: false,
        stats: Object.freeze({
          registered: [...records.values()].reduce(
            (sum, record) => sum + Number(record.registration?.registered ?? 0),
            0,
          ),
          solid: [...records.values()].filter(({ metadata }) => metadata.kind !== 'none').length,
          targets: discovery.targets.length,
          unresolved: issues.length,
        }),
        targets: Object.freeze([...records.values()].map((record) => record.publicRecord)),
      });
      lastReport = report;
      throw new SceneCollisionRuntimeError(report);
    }

    const plannedIds = new Set(planned.map(({ target }) => target.id));
    for (const [targetId, record] of records) {
      const replacement = added.find(({ target }) => target.id === targetId);
      const stillCurrent = planned.find(({ target, signature }) => (
        target.id === targetId && target.subject === record.subject && signature === record.signature
      ));
      if (!plannedIds.has(targetId) || replacement || !stillCurrent) {
        record.registration?.dispose?.();
        records.delete(targetId);
      }
    }
    for (const entry of added) {
      const publicRecord = Object.freeze({
        adapterId: entry.registration?.adapterId ?? null,
        domain: entry.target.domain,
        kind: entry.metadata.kind,
        registered: Number(entry.registration?.registered ?? 0),
        source: entry.source,
        targetId: entry.target.id,
      });
      records.set(entry.target.id, {
        ...entry,
        collisionSubject: entry.collisionSubject,
        publicRecord,
        subject: entry.target.subject,
      });
    }
    const publicTargets = [...records.values()]
      .map((record) => record.publicRecord)
      .sort((a, b) => a.targetId.localeCompare(b.targetId));
    lastReport = Object.freeze({
      issues: Object.freeze(issues),
      ok: issues.length === 0,
      stats: Object.freeze({
        registered: publicTargets.reduce((sum, target) => sum + target.registered, 0),
        solid: publicTargets.filter(({ kind }) => kind !== 'none').length,
        targets: discovery.targets.length,
        unresolved: issues.length,
      }),
      targets: Object.freeze(publicTargets),
    });
    return lastReport;
  }

  function assertReady() {
    if (!lastReport.ok) throw new SceneCollisionRuntimeError(lastReport);
    return lastReport;
  }

  function dispose() {
    if (disposed) return false;
    disposed = true;
    for (const record of records.values()) record.registration?.dispose?.();
    records.clear();
    if (sceneBindings.get(scene) === api) sceneBindings.delete(scene);
    return true;
  }

  const api = Object.freeze({
    assertReady,
    dispose,
    refresh,
    get report() { return lastReport; },
    scene,
    version: SCENE_COLLISION_RUNTIME_VERSION,
    world,
  });
  sceneBindings.set(scene, api);
  return api;
}
