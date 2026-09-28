import { createTransparentProfile, parseTransparentProfile } from './transparentProfile.js';

const STORAGE_KEY = 'toonlab.transparentMaterialProfiles.v1';

export function loadTransparentProfiles() {
  try {
    const parsed = JSON.parse(window.localStorage?.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed)
      ? parsed.map((entry) => parseTransparentProfile(entry)).filter((result) => result.ok).map((result) => result.value)
      : [];
  } catch {
    return [];
  }
}

export function saveTransparentProfile(input) {
  const profile = createTransparentProfile(input);
  const profiles = loadTransparentProfiles().filter((entry) => entry.id !== profile.id);
  profiles.unshift(profile);
  window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(profiles, null, 2));
  return profile;
}

export function deleteTransparentProfile(id) {
  const profiles = loadTransparentProfiles().filter((entry) => entry.id !== id);
  window.localStorage?.setItem(STORAGE_KEY, JSON.stringify(profiles, null, 2));
  return profiles;
}
