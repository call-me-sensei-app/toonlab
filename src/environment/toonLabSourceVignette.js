import {
  dot,
  float,
  screenUV,
  vec2,
  vec3,
} from 'three/tsl';

const DEFAULT_INTENSITY = 0.4;
const DEFAULT_ASPECT_RATIO = 9 / 16;

function finite(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/**
 * Resolve ToonLab's default desktop cosine-fourth vignette contract.
 * `aspectRatio` means height / width, matching PostProcessTonemap.usf.
 */
export function resolveToonLabSourceVignetteSettings(settings = {}) {
  const color = Array.isArray(settings.vignette_color)
    ? settings.vignette_color.slice(0, 3).map((channel) => finite(channel, 0))
    : [0, 0, 0];
  const center = Array.isArray(settings.vignette_center)
    ? settings.vignette_center.slice(0, 2).map((channel) => finite(channel, 0.5))
    : [0.5, 0.5];
  return {
    aspectRatio: Math.max(finite(settings.aspectRatio, DEFAULT_ASPECT_RATIO), 1e-6),
    center,
    color,
    intensity: Math.max(finite(settings.vignette_intensity, DEFAULT_INTENSITY), 0),
    type: settings.vignette_type ?? 'CosineFourthLaw',
  };
}

/** CPU translation of VignetteSpace + ComputeVignetteMask for fixtures. */
export function evaluateToonLabSourceVignetteMask(uv, settings = {}) {
  const resolved = settings.type === undefined || settings.aspectRatio === undefined
    ? resolveToonLabSourceVignetteSettings(settings)
    : settings;
  if (resolved.intensity <= 0) return [1, 1, 1];
  const screen = [
    finite(uv?.[0], 0.5) * 2 - 1,
    finite(uv?.[1], 0.5) * 2 - 1,
  ];
  const scale = Math.sqrt(2) / Math.sqrt(
    1 + resolved.aspectRatio * resolved.aspectRatio,
  );
  const position = [
    screen[0] * scale - (resolved.center[0] - 0.5),
    screen[1] * resolved.aspectRatio * scale - (resolved.center[1] - 0.5),
  ].map((channel) => channel * resolved.intensity);
  const tan2Angle = position[0] * position[0] + position[1] * position[1];
  const weight = (1 / (tan2Angle + 1)) ** 2;
  return resolved.color.map((channel) => channel + (1 - channel) * weight);
}

/**
 * Exact active ToonLabShowcase vignette node. Apply it to scene color and bloom
 * together before the film curve, as PostProcessTonemap.usf does.
 */
export function createToonLabSourceVignetteMask(settings = {}) {
  const resolved = resolveToonLabSourceVignetteSettings(settings);
  if (resolved.intensity <= 0) return vec3(1);
  const aspectRatio = float(resolved.aspectRatio);
  const scale = float(Math.sqrt(2)).div(
    float(1).add(aspectRatio.mul(aspectRatio)).sqrt(),
  );
  const screenPosition = screenUV.mul(2).sub(1);
  const vignettePosition = vec2(
    screenPosition.x,
    screenPosition.y.mul(aspectRatio),
  ).mul(scale).sub(vec2(
    resolved.center[0] - 0.5,
    resolved.center[1] - 0.5,
  )).mul(resolved.intensity);
  const tan2Angle = dot(vignettePosition, vignettePosition);
  const weight = tan2Angle.add(1).reciprocal().pow(2);
  return vec3(...resolved.color).mix(vec3(1), weight);
}

export const TOONLAB_SOURCE_VIGNETTE_DEFAULTS = Object.freeze({
  aspectRatio: DEFAULT_ASPECT_RATIO,
  center: Object.freeze([0.5, 0.5]),
  color: Object.freeze([0, 0, 0]),
  intensity: DEFAULT_INTENSITY,
  type: 'CosineFourthLaw',
});
