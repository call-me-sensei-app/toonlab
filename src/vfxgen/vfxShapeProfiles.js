// Portable axial silhouette profiles shared by effect documents, the editor,
// and mesh runtimes. A profile stores the radius of one half of a longitudinal
// silhouette from front (sample 0) to rear (last sample). Rendering revolves
// that half-profile around the travel axis, which mirrors the artist's stroke
// across both the vertical and depth centerlines.

export const VFX_SILHOUETTE_PROFILE_SAMPLES = 32;
export const VFX_SILHOUETTE_PROFILE_MIN_SAMPLES = 8;
export const VFX_SILHOUETTE_PROFILE_MAX_SAMPLES = 64;

function clamp(value, min, max) {
  return Math.min(Math.max(Number(value) || 0, min), max);
}

function resample(values, count) {
  if (values.length === count) return values.slice();
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const position = (index / (count - 1)) * (values.length - 1);
    const lower = Math.floor(position);
    const upper = Math.min(lower + 1, values.length - 1);
    const mix = position - lower;
    result.push(values[lower] + (values[upper] - values[lower]) * mix);
  }
  return result;
}

export function createVfxAxialProfile({
  backTaper = 0.32,
  frontTaper = 0.72,
  samples = VFX_SILHOUETTE_PROFILE_SAMPLES,
  widestPoint = 0.56,
} = {}) {
  const count = Math.round(clamp(
    samples,
    VFX_SILHOUETTE_PROFILE_MIN_SAMPLES,
    VFX_SILHOUETTE_PROFILE_MAX_SAMPLES,
  ));
  const peak = clamp(widestPoint, 0.15, 0.85);
  const frontExponent = 0.35 + clamp(frontTaper, 0, 1) * 2.65;
  const backExponent = 0.35 + clamp(backTaper, 0, 1) * 2.65;
  return Array.from({ length: count }, (_, index) => {
    const u = index / (count - 1);
    if (index === 0 || index === count - 1) return 0;
    if (u <= peak) {
      const progress = u / peak;
      return Math.sin(progress * Math.PI * 0.5) ** frontExponent;
    }
    const progress = (1 - u) / (1 - peak);
    return Math.sin(progress * Math.PI * 0.5) ** backExponent;
  });
}

export const DEFAULT_VFX_SILHOUETTE_PROFILE = Object.freeze(
  createVfxAxialProfile(),
);

export function normalizeVfxSilhouetteProfile(
  input,
  fallback = DEFAULT_VFX_SILHOUETTE_PROFILE,
) {
  const source = Array.isArray(input) && input.length >= 2
    ? input
    : fallback;
  const count = Math.round(clamp(
    source.length,
    VFX_SILHOUETTE_PROFILE_MIN_SAMPLES,
    VFX_SILHOUETTE_PROFILE_MAX_SAMPLES,
  ));
  const values = resample(source.map((value) => clamp(value, 0, 1)), count);
  // A revolved volume must close at both axial ends. Flat/open end caps can be
  // introduced later as an explicit topology option instead of accidental
  // non-manifold geometry from a profile stroke.
  values[0] = 0;
  values[values.length - 1] = 0;
  return values;
}

export function sampleVfxSilhouetteProfile(profileInput, position) {
  const profile = normalizeVfxSilhouetteProfile(profileInput);
  const scaled = clamp(position, 0, 1) * (profile.length - 1);
  const lower = Math.floor(scaled);
  const upper = Math.min(lower + 1, profile.length - 1);
  const mix = scaled - lower;
  return profile[lower] + (profile[upper] - profile[lower]) * mix;
}
