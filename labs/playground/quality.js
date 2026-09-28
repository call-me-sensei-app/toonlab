import { resolveSceneQualityProfile } from '@call-me-sensei/toonlab/styles';

const requestedQuality = new URLSearchParams(window.location.search).get('quality');

export const WALKABLE_QUALITY_ID = ['balanced', 'performance'].includes(requestedQuality)
  ? requestedQuality
  : 'balanced';

// The reference sample deliberately names one package profile. Scene files
// consume this document instead of carrying private LOD/culling/pass tiers.
export const WALKABLE_QUALITY_PROFILE = Object.freeze(
  resolveSceneQualityProfile(WALKABLE_QUALITY_ID),
);
