---
name: water
description: Help developers use ToonLab water materials, waves, ripple simulation, breakers, splashes, rain, kelp, or water settings.
---

References beginning `agents/` resolve from the installed ToonLab package root
(normally `node_modules/@call-me-sensei/toonlab/`), even when this skill is copied.


# Water

Use this skill when a developer wants WaterSurface, water material settings,
Gerstner waves, CPU buoyancy mirrors, ripple simulation, refraction, foam,
breakers, wakes, splashes, rain, kelp, underwater view, or water preset
documents.

Public imports:
- `@call-me-sensei/toonlab/water`
- `@call-me-sensei/toonlab/water-settings`

Read first:
- `agents/references/anime-art-direction.md`
- `agents/references/style-bundles.md`
- `agents/references/runtime-entry-points.md`

Developer guidance:
- Add water surfaces and update hooks to the host app's scene and render loop.
- For a standalone controlled coast, construct `WaterSurface` with a world-space
  `bedHeight(x, z)` sampler so shoaling and shoreline depth use the same beach
  geometry, enable `shoreState` when wet-sand/foam memory is under test, keep
  the surface axis-aligned, and call `water.update(renderer, scene, camera,
  delta)` before the host render.
- Cover the full water tile and every allowed camera footprint with closed
  seabed geometry. Dress visible underwater areas with package `WaterKelpField`
  vegetation and licensed/package rock clusters, including partially buried
  and partially submerged transitions. An empty bed, visible terrain underside,
  open world edge, or sky showing below the bed is a release failure.
- Treat Water as one integrated World System. Surface shading, waves, foam,
  reflections, interaction, and quality belong to the complete Water preset;
  do not invent a separate Water Shader document or runtime dependency.
- Keep `WaterSurface`'s default `underwaterAtmosphere` scene adapter enabled.
  Its update restores the host's air-side background/fog for water capture
  passes, then applies body-color fog and background when the camera is below
  and inside the surface footprint. Its capture-excluded color veil also
  grades ToonLab TSL materials that opt out of scene fog. Do not duplicate
  Water Lab fog-swapping in a host app. Disable or override this adapter only
  when a complete replacement underwater post stack owns the same transition.
- Keep the three authored axes explicit: `preset` selects the body/motion
  recipe (`coast`, `ocean`, `lake`, and so on), `style: 'call_me_sensei'`
  selects the studio rendition, and `colorTone` selects `classic`, `anime`,
  `teal`, `caribbean`, `lagoon`, or `deepOcean`. Do not replace a coast preset
  with an "Anime" preset; Anime is a tone selected by the style.
- A non-`classic` tone owns its coherent optical block:
  `shallowColor`, `midColor`, `deepColor`, `depthFadeDistance`,
  `deepFadeDistance`, `fresnelBias`, `fresnelColor`, `reflectionStrength`,
  `reflectionSoftness`, `causticsStrength`, and `detailNormalStrength`.
  Supplying those keys alongside a named tone does not override the tone.
  Choose `classic` when the caller needs full per-key control instead.
- Choose the tone from captures made with the real bed depth and approved
  cameras, not from its label or palette table alone. Grazing views tend toward
  `deepColor`; overhead shallow views expose more `shallowColor`.
- `opacity` controls only the fallback path without a scene-color capture.
  With the normal WaterSurface scene-color pass bound, the body composites as
  the integrated refractive surface and that setting is intentionally inactive.
- Keep interaction targets, camera mode, resize handling, and physics/buoyancy
  integration owned by the app.
- Use `water.settings` for the portable authored baseline and
  `water.renderedSettings` when inspecting the current Lighting/Weather
  composition. Live scene owners use unique `setSceneOverrideLayer` ids and
  clear only their own id; they must not write composed values back to a preset.
- In a composed world, let the host game own lighting and pass current light
  state through Water's explicit scene adapters. The public lighting slot and `createSceneStyleRuntime()` coordinate the
  supported lighting and shared-shadow contract.
- Preserve the host renderer's depth convention. Water supports both standard
  and reversed depth; qualify contact foam and refraction using the host's
  actual `reversedDepthBuffer` setting rather than silently changing it.
- Choose Water's compile-time quality when constructing `WaterSurface`.
  Changing low/medium/high or custom quality requires replacing/rebuilding the
  surface; `applySettings()` edits authored art/simulation values, not quality.
- Use documented settings and presets for portable water looks.
- When using buoyancy, sample or mirror the same wave configuration the visible
  water uses.
- Treat ToonLab playground scenes as examples, not runtime dependencies.
- Size finite water surfaces from the union of every approved camera frustum's
  intersection with the water plane, then add margin for orbit, shake, and
  wave displacement. A visible rectangular boundary is a release failure;
  increasing width and depth is the correction.

Verify:
- Run the consumer app's normal build and inspect calm, moving, and interaction
  states relevant to the game.
- If buoyancy is used, check that objects match the visible water height closely
  enough for the app's camera distance.
- Inspect the water from the cliff camera, a low shore camera, and a downward
  reveal. Verify the shoreline has no hovering terrain, dry gaps, hard surface
  edge, or water slivers, and record `nearshorePhaseStatus` plus the ship's
  sampled `getHeightAt()` result when a vessel is present. Treat an inactive
  nearshore phase as diagnostic, not automatically as a shader failure: the
  mild-slope path cannot activate on a vertical wall or deep gorge that never
  presents a qualifying bank to the bed sampler.
- Add two underwater inspections: one looking up through the surface and one
  looking across the floor toward the shore. Verify real above-water
  transmission, readable depth tint/haze, a continuous closed bed, caustic or
  light response, submerged rocks, moving vegetation, and no hollow terrain.
  Assert `water.underwaterAtmosphereState.active` in both submerged views and
  verify that the original host background/fog return above the surface.
- When the host uses reversed depth, inspect the foam debug view as well:
  open water must remain dark and contact foam must stay localized to shore
  and piercing objects.
