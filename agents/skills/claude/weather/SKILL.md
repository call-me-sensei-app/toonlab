---
name: weather
description: Use the repository weather tools in a user-authored scene, including conditions, transitions, precipitation, lightning, wind, and surface-state outputs. Use for a bounded weather test or explicit application integration, not automatic full-world composition.
---

# Weather

Use this skill for an explicit weather experiment or a bounded integration
into your scene: rain, snow, sleet, hail, or dust precipitation;
smooth condition transitions; lightning flashes with distance-delayed
thunder; wind; or normalized wetness/snow/ice outputs. Do not present this
public API as proof that ToonLab can automatically compose Sky, Cloud,
Lighting, terrain, Water, vegetation, gameplay, and weather into a polished
world.

Availability:
- Repository tool: `src/weather/index.js`
- Not a public npm entry point and not one of the 15 live Labs

Read first:
- `agents/references/anime-art-direction.md`
- `agents/references/style-bundles.md`
- `agents/references/runtime-entry-points.md`

Usage guidance:
- ToonLab has no stable full-world coordinator. Construct the weather
  controller with `createWeatherSystem({ renderer, scene, camera, followTarget,
  groundHeightAt, preset, style })`. It owns only precipitation and lightning;
  `preset` selects the condition and `style` selects its IP-wide rendition;
  every other target (`sky`, `sunRig`, `water`, `grass`, `forest`) is optional and
  only adapted if provided. Do not pass non-ToonLab objects as targets unless
  they implement the same public methods (e.g. `applySettings`, `setWind`).
- Keep the returned weather controller in the host render loop. Use its public
  transition method for condition changes and update it before rendering.
  Connect sky, sun, fog, vegetation, water, and surface responses explicitly;
  do not invent a composed-world import or assume implicit coordination.
- Precipitation is one GPU-instanced draw with trajectories computed in the
  shader; control density through the condition/intensity, never by spawning
  extra systems.
- Use `weather.addEventListener('lightning', …)` / `onThunder` for gameplay
  reactions; the thunder delay already models distance.
- Surface response: consume the normalized wetness/snow/ice outputs
  (`onSurfaceChange`) instead of inferring state from the preset name.
- Conditions are extensible via `registerWeatherPreset`; styles are extensible
  via `registerWeatherStylePreset`. Interpolate custom conditions with
  `interpolateWeatherSettings` rather than lerping raw fields in app code.

Verify:
- Run the consumer app, transition between clear and storm conditions, and
  confirm the selected style persists while precipitation follows the camera
  without visible respawn seams.
- Trigger or wait for lightning and confirm the thunder delay scales with
  distance.
