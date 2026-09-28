import { resolveClimateProfile } from './climateProfiles.js';

function freezeSequence(sequence) {
  for (const entry of sequence) Object.freeze(entry);
  return Object.freeze(sequence);
}

export function createClimateSequence(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    throw new TypeError('A climate sequence requires at least one entry.');
  }
  return freezeSequence(entries.map((entry, index) => {
    const profile = resolveClimateProfile(entry.profile);
    const holdMinimum = Number(entry.holdMinimum);
    const holdMaximum = Number(entry.holdMaximum);
    const blendDuration = Number(entry.blendDuration);
    if (!Number.isFinite(holdMinimum) || holdMinimum < 0) {
      throw new RangeError(`Sequence entry ${index} has an invalid minimum hold.`);
    }
    if (!Number.isFinite(holdMaximum) || holdMaximum < holdMinimum) {
      throw new RangeError(`Sequence entry ${index} has an invalid maximum hold.`);
    }
    if (!Number.isFinite(blendDuration) || blendDuration < 0) {
      throw new RangeError(`Sequence entry ${index} has an invalid blend duration.`);
    }
    return {
      profile: profile.id,
      holdMinimum,
      holdMaximum,
      blendDuration,
    };
  }));
}

export const DEFAULT_CLIMATE_SEQUENCE = createClimateSequence([
  { profile: 'openSky', holdMinimum: 60, holdMaximum: 120, blendDuration: 20 },
  { profile: 'closedSky', holdMinimum: 30, holdMaximum: 60, blendDuration: 20 },
  { profile: 'softDrizzle', holdMinimum: 30, holdMaximum: 60, blendDuration: 20 },
  { profile: 'steadyShower', holdMinimum: 30, holdMaximum: 60, blendDuration: 20 },
  { profile: 'lowMist', holdMinimum: 20, holdMaximum: 40, blendDuration: 15 },
  { profile: 'openSky', holdMinimum: 60, holdMaximum: 120, blendDuration: 15 },
  { profile: 'closedSky', holdMinimum: 30, holdMaximum: 60, blendDuration: 20 },
  { profile: 'softDrizzle', holdMinimum: 20, holdMaximum: 40, blendDuration: 15 },
  { profile: 'steadyShower', holdMinimum: 30, holdMaximum: 60, blendDuration: 10 },
  { profile: 'deepDownpour', holdMinimum: 20, holdMaximum: 40, blendDuration: 10 },
  { profile: 'farThunder', holdMinimum: 20, holdMaximum: 40, blendDuration: 15 },
  { profile: 'closeThunder', holdMinimum: 30, holdMaximum: 90, blendDuration: 15 },
  { profile: 'softDrizzle', holdMinimum: 30, holdMaximum: 60, blendDuration: 20 },
  { profile: 'lowMist', holdMinimum: 20, holdMaximum: 40, blendDuration: 15 },
]);

