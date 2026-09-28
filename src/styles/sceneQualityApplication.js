import {
  resolveSceneQualityProfile,
  resolveSkyQualityOptions,
  resolveVegetationQualityOptions,
  resolveWaterQualityOptions,
} from './sceneQualityProfiles.js';

function cloneJson(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function asList(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

export class SceneQualityApplicationError extends Error {
  constructor(cause, rollbackErrors = []) {
    const rollbackMessage = rollbackErrors.length
      ? ` Rollback also failed: ${rollbackErrors.map(({ error, system }) => `${system}: ${error.message}`).join(' ')}`
      : '';
    super(`Scene quality application failed: ${cause.message}.${rollbackMessage}`);
    this.cause = cause;
    this.name = 'SceneQualityApplicationError';
    this.rollbackErrors = rollbackErrors;
    this.rolledBack = rollbackErrors.length === 0;
  }
}

/**
 * Applies one package scene-quality document to every supported live system.
 * The mapping lives here so scene files only choose a profile; they do not
 * carry subsystem tier tables or translate field names themselves.
 */
export async function applySceneQualityProfile(input = 'balanced', {
  lighting = null,
  post = null,
  sky = null,
  vegetation = [],
  water = null,
} = {}) {
  const profile = resolveSceneQualityProfile(input);
  const applied = [];
  const skipped = [];
  const restores = [];

  async function apply(system, subject, capture, update, restore) {
    if (!subject) return;
    const snapshot = await capture(subject);
    restores.push({ restore: () => restore(subject, snapshot), system });
    await update(subject);
    applied.push(system);
  }

  try {
    if (lighting?.setQuality && lighting?.quality) {
      await apply(
        'lighting',
        lighting,
        (subject) => cloneJson(subject.quality),
        (subject) => {
          const current = subject.quality;
          const shadows = profile.quality.shadows;
          const maxShadowedLights = Math.max(Number(current.maxShadowedLights) || 1, 1);
          subject.setQuality({
            ...current,
            description: `${profile.label} scene shadow budget.`,
            id: `scene-${profile.id}`,
            label: `${profile.label} Scene`,
            maxDistance: shadows.maxDistance,
            maxShadowMapPixels: shadows.mapSize * shadows.mapSize * maxShadowedLights,
            shadowMapSizeScale: shadows.mapSize / 2048,
          });
        },
        (subject, snapshot) => subject.setQuality(snapshot),
      );
    } else if (lighting) skipped.push({ reason: 'unsupported-quality-interface', system: 'lighting' });

    if (sky?.setQualityLevel && sky?.qualityLevel && sky?.quality) {
      await apply(
        'sky',
        sky,
        (subject) => ({ level: subject.qualityLevel, quality: cloneJson(subject.quality) }),
        (subject) => subject.setQualityLevel(
          subject.qualityLevel,
          resolveSkyQualityOptions(profile),
        ),
        (subject, snapshot) => subject.setQualityLevel(snapshot.level, snapshot.quality),
      );
    } else if (sky) skipped.push({ reason: 'unsupported-quality-interface', system: 'sky' });

    if (water?.setQualityBudget && water?.passes?.stats?.quality) {
      await apply(
        'water',
        water,
        (subject) => cloneJson(subject.passes.stats.quality),
        (subject) => subject.setQualityBudget(resolveWaterQualityOptions(profile)),
        (subject, snapshot) => subject.setQualityBudget(snapshot),
      );
    } else if (water) skipped.push({ reason: 'unsupported-quality-interface', system: 'water' });

    for (const [index, subject] of asList(vegetation).entries()) {
      const system = `vegetation:${index}`;
      if (subject?.setQualityBudget && subject?.qualityBudget) {
        await apply(
          system,
          subject,
          (target) => cloneJson(target.qualityBudget),
          (target) => target.setQualityBudget(resolveVegetationQualityOptions(profile)),
          (target, snapshot) => target.setQualityBudget(snapshot),
        );
      } else skipped.push({ reason: 'unsupported-quality-interface', system });
    }

    // Post-processing cost fields are intentionally absent from the shared
    // profile until the package exposes one cross-backend quality contract.
    if (post) skipped.push({ reason: 'no-shared-post-quality-contract', system: 'post' });
  } catch (cause) {
    const rollbackErrors = [];
    for (const entry of [...restores].reverse()) {
      try {
        await entry.restore();
      } catch (error) {
        rollbackErrors.push({ error, system: entry.system });
      }
    }
    throw new SceneQualityApplicationError(cause, rollbackErrors);
  }

  let reverted = false;
  return Object.freeze({
    applied: Object.freeze([...applied]),
    profile,
    async revert() {
      if (reverted) return { reason: 'already-reverted', reverted: false };
      const rollbackErrors = [];
      for (const entry of [...restores].reverse()) {
        try {
          await entry.restore();
        } catch (error) {
          rollbackErrors.push({ error, system: entry.system });
        }
      }
      if (rollbackErrors.length) {
        throw new SceneQualityApplicationError(new Error('Explicit revert failed'), rollbackErrors);
      }
      reverted = true;
      return { reverted: true, systems: [...applied] };
    },
    skipped: Object.freeze([...skipped]),
  });
}
