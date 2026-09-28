import { createJointedGraniteBoulderSource } from '../../realisticBoulderFamily.js';
import {
  createRockgenPresetBakeSource,
  ROCKGEN_FAMILY_PROFILES,
} from '../../rockgenPresetBakeSource.js';

const JOINTED_GRANITE = Object.freeze({
  geology: 'granite',
  id: 'jointed-granite-boulder',
  label: 'Jointed Granite Boulder v1',
});

export const EXISTING_EXPERIMENTAL_ROCK_FAMILIES = Object.freeze([
  JOINTED_GRANITE,
  ...ROCKGEN_FAMILY_PROFILES,
]);

export function createExistingExperimentalFamilySource(familyId, seed) {
  if (familyId === JOINTED_GRANITE.id) return createJointedGraniteBoulderSource({ seed });
  if (!ROCKGEN_FAMILY_PROFILES.some((family) => family.id === familyId)) {
    throw new RangeError(`Unknown existing experimental rock family "${familyId}".`);
  }
  return createRockgenPresetBakeSource({ family: familyId, seed });
}
