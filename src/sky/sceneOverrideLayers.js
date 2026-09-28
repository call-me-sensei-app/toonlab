/**
 * Ordered transient layers for the active sky. Lower priorities establish a
 * base that higher priorities can derive from or replace. These values are
 * runtime policy, never part of a portable sky-look document.
 */
export const SKY_SCENE_OVERRIDE_PRIORITIES = Object.freeze({
  lighting: 100,
  weather: 200,
  scene: 300,
});
