import * as THREE from 'three';
import { uniform } from 'three/tsl';

// Scene-wide environment state, TSL side. This is the runtime's equivalent
// of an engine-global material parameter collection: one uniform block that
// every outdoor material (grass, foliage, trees, terrain, water, sky, fog)
// reads for wind, time-of-day, weather mix, and atmosphere values, so the
// whole world moves and grades together.
//
// Writers are split by field ownership, never by turn-taking: the sky
// day-cycle driver SETS sun/moon/atmosphere/progress, the weather system
// writes only the weather* mix fields and the wind weather multiplier, and
// gameplay writes playerPosition. src/environment/environmentState.js holds
// the classic-uniform mirror and the setter API; materials must register
// these nodes by reference (like environmentSharedUniformNodes) so a single
// write reaches every material on both backends.

export const environmentStateUniformNodes = {
  // Day cycle. hour is the 24h pseudo-clock companion (lighting keyframes);
  // dayCycleProgress is the shared curve axis: 0 day, .25 sunset, .5 night,
  // .75 sunrise.
  hour: uniform(12.0),
  dayCycleProgress: uniform(0.0),

  // Celestial bodies. Directions point FROM the scene TOWARD the body
  // (normalized world space), matching the sun rig's light direction.
  sunDirection: uniform(new THREE.Vector3(0.35, 0.8, 0.5).normalize()),
  sunColor: uniform(new THREE.Color(1.0, 0.95, 0.85)),
  sunIntensity: uniform(1.0),
  sunVisibility: uniform(1.0),
  moonDirection: uniform(new THREE.Vector3(-0.35, 0.6, -0.5).normalize()),
  moonColor: uniform(new THREE.Color(0.72, 0.78, 0.95)),
  moonIntensity: uniform(0.0),
  moonPhase: uniform(0.0),
  moonVisibility: uniform(0.0),

  // Global wind. windDirection is derived from windAngle by the setter (kept
  // as a vec2 so shaders never pay for sin/cos); sway* feed whole-plant
  // motion, gust* the traveling gust wave, windColor* the moving sheen that
  // brightens gust-swept grass.
  windAngle: uniform(0.0),
  windDirection: uniform(new THREE.Vector2(1, 0)),
  windStrength: uniform(1.0),
  windSpeed: uniform(1.0),
  gustFrequency: uniform(0.35),
  gustSpeed: uniform(4.2),
  swayLean: uniform(0.06),
  swaySpeed: uniform(1.0),
  swayDamping: uniform(0.55),
  weatherWindMultiplier: uniform(1.0),
  windColorStrength: uniform(0.0),
  windColorScale: uniform(0.04),
  windColorTint: uniform(new THREE.Color(1.08, 1.06, 0.95)),

  // Weather mix, all 0..1 and 0 = clear so an absent weather system renders
  // exactly the pre-state look.
  weatherWetness: uniform(0.0),
  weatherSnowCover: uniform(0.0),
  weatherOvercast: uniform(0.0),
  weatherPrecipitation: uniform(0.0),
  weatherCloudFade: uniform(0.0),
  weatherThunder: uniform(0.0),

  // Stylized atmosphere: the mix fog color/extent plus the additive
  // sun/moon glow fog. glowIntensity 0 disables the glow layer entirely.
  atmosphereFogColor: uniform(new THREE.Color(0.78, 0.85, 0.95)),
  atmosphereFogHeightFalloff: uniform(0.02),
  atmosphereFogMaxDistance: uniform(320.0),
  atmosphereGlowColor: uniform(new THREE.Color(1.0, 0.72, 0.45)),
  atmosphereGlowIntensity: uniform(0.0),
  atmosphereGlowSpread: uniform(0.35),

  // Player, for foliage sway damping and interaction masks. playerActive
  // stays 0 until gameplay writes a position (the editor-idle default keeps
  // origin-centered effects from firing).
  playerPosition: uniform(new THREE.Vector3()),
  playerSwayRadius: uniform(2.2),
  playerActive: uniform(0.0),
};
